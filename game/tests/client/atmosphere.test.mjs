// Atmosphere (docs/atmosphere.md): the pure parts of the sun shadow cascades, the per-location looks, the grade,
// the weather presets and the shared wind. No WebGL: the shader chunks are checked as text.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { QUALITY, PHONE_QUALITY } from '../../src/render/quality.js';
import { NEAR_STEPS, nearRadius, cascadePlan, snapTexel, installCascadeShadows } from '../../src/render/shadows.js';
import { TIME_PRESETS, LOCATION_LOOKS, LOCATIONS, lookFor, sunDirection } from '../../src/render/sky.js';
import { GRADE, gradeColor, installGrade } from '../../src/render/grade.js';
import { WEATHER, WEATHER_NAMES, DEFAULT_WEATHER, mixWeather, weatherCover, WeatherSystem, WIND_UNIFORMS, WEATHER_UNIFORMS, WIND_DIR, windAt, withWind, windWeights, WIND_SHAPE, installWetness, Rain } from '../../src/render/weather.js';
import { installHeightFog } from '../../src/render/fog.js';
import { lookRole, registerLookMaterials, setEmissiveLevels, slotForMaterial } from '../../src/render/materials.js';
import { BlobShadows } from '../../src/render/blobs.js';

test('near cascade: fixed size steps that grow with the camera distance', () => {
  assert.equal(nearRadius(0), NEAR_STEPS[0]);
  assert.equal(nearRadius(13), 26, 'the town camera (13 m) gets a 26 m cascade');
  assert.equal(nearRadius(1000), NEAR_STEPS[NEAR_STEPS.length - 1]);
  let prev = 0;
  for (let d = 0; d <= 100; d += 0.5) { const r = nearRadius(d); assert.ok(r >= prev, 'never shrinks as the camera pulls back'); assert.ok(NEAR_STEPS.includes(r)); prev = r; }
});

test('cascade plan: two cascades on ultra and high, one on low and on phones, biases follow the texel size', () => {
  for (const [name, cfg] of [['ultra', QUALITY.ultra], ['high', QUALITY.high]]) {
    const plan = cascadePlan(cfg, 13);
    assert.equal(plan.length, 2, name);
    const [near, far] = plan;
    assert.ok(near.radius < far.radius && far.radius === cfg.shadowDistance);
    assert.ok(near.texel <= 0.03, name + ': characters get texels of 3 cm or finer at the town camera, got ' + near.texel);
    assert.ok(far.texel <= 0.12, name + ': the far cascade stays under 12 cm per texel, got ' + far.texel);
    assert.ok(far.normalBias > near.normalBias && far.bias < near.bias, 'coarser texels, larger biases');
    assert.equal(near.every, 1); assert.ok(far.every >= 2, 'the far cascade is not redrawn every frame');
  }
  for (const [name, cfg] of [['low', QUALITY.low], ['phone/high', PHONE_QUALITY.high], ['phone/low', PHONE_QUALITY.low]]) {
    const plan = cascadePlan(cfg, 13);
    assert.equal(plan.length, 1, name);
    assert.ok(plan[0].radius <= cfg.shadowDistance && plan[0].radius >= cfg.shadowDistance * 0.5, name);
    assert.ok(plan[0].texel < 0.12, name + ': texel ' + plan[0].texel);
  }
  assert.deepEqual(cascadePlan({ ...QUALITY.low, shadowMap: 0 }, 13), [], 'a 0 map means no sun shadow');
  for (const c of cascadePlan(QUALITY.ultra, 90)) { assert.ok(c.bias < 0 && c.bias >= -0.0012); assert.ok(c.normalBias >= 0.02 && c.normalBias <= 0.6); }
});

test('texel snapping: a cascade centre only ever moves by whole texels', () => {
  const texel = 0.0254;
  for (const v of [0, 0.01, 0.02, 1.2345, -7.77, 1200.4321]) {
    const s = snapTexel(v, texel);
    assert.ok(Math.abs(s - v) <= texel / 2 + 1e-9);
    assert.ok(Math.abs(s / texel - Math.round(s / texel)) < 1e-6);
  }
  assert.equal(snapTexel(0.012, texel), snapTexel(0.0125, texel), 'sub-texel camera motion does not move the shadow map');
});

test('the light loop patch applies to this three.js and keeps the one-cascade path', () => {
  assert.equal(installCascadeShadows(), true, 'the directional shadow line was found and replaced');
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  assert.ok(chunk.includes('NUM_DIR_LIGHT_SHADOWS == 2') && chunk.includes('directionalShadowMap[ 1 ]'));
  assert.ok(chunk.includes('ftfShadowInside( vDirectionalShadowCoord[ i ], 0.86 )'), 'a single cascade fades out at its edge too');
  assert.ok(THREE.ShaderChunk.shadowmap_pars_fragment.includes('float ftfShadowInside'));
  assert.equal(installCascadeShadows(), true, 'idempotent');
  assert.equal(chunk, THREE.ShaderChunk.lights_fragment_begin);
});

test('looks per location: the town turns the sun to its open side and has its own air; the archipelago keeps golden hour', () => {
  assert.deepEqual(LOCATIONS, ['archipelago', 'town']);
  assert.equal(lookFor('archipelago').name, 'golden'); assert.equal(lookFor('town').name, 'afternoon');
  assert.equal(lookFor('nowhere').location, 'archipelago'); assert.equal(lookFor('town', 'bogus').name, 'afternoon');
  // The baked HDR was rendered for the archipelago's golden hour: its sun must not drift.
  const g = lookFor('archipelago', 'golden');
  assert.equal(g.elevation, 13); assert.equal(g.azimuth, 34); assert.ok(g.envUrl);
  for (const loc of LOCATIONS) for (const time of Object.keys(TIME_PRESETS)) {
    const L = lookFor(loc, time);
    assert.equal(L.name, time); assert.equal(L.location, loc);
    for (const k of ['elevation', 'azimuth', 'sunIntensity', 'skyMean', 'mie', 'exposure', 'envIntensity', 'cloudCover', 'lamps', 'windows', 'bounce', 'altitude']) assert.equal(typeof L[k], 'number', `${loc}/${time}.${k}`);
    for (const k of ['density', 'falloff', 'near', 'far', 'sunPower', 'aerial']) assert.equal(typeof L.fog[k], 'number', `${loc}/${time}.fog.${k}`);
    assert.ok(L.fog.far > L.fog.near);
  }
  // The town climbs toward -Z with a cliff behind it: at every hour its sun stands over the open south side (+Z).
  for (const time of Object.keys(TIME_PRESETS)) {
    const L = lookFor('town', time);
    assert.ok(sunDirection(L.elevation, L.azimuth).z > 0.3, 'town/' + time + ': the sun is not behind the hill');
    assert.equal(L.envUrl, null, 'the baked HDR belongs to the archipelago');
  }
  // Lamps and lit windows take over as the day goes: dusk > golden > morning > noon, in both places.
  for (const loc of LOCATIONS) {
    const at = (t) => lookFor(loc, t);
    assert.ok(at('dusk').lamps > at('golden').lamps && at('golden').lamps > at('morning').lamps && at('morning').lamps > at('noon').lamps, loc + ' lamps');
    assert.ok(at('dusk').windows > at('golden').windows && at('golden').windows > at('morning').windows, loc + ' windows');
  }
  // The town sees further than the archipelago (no cloud sea to pool mist on): thinner height fog, longer view.
  assert.ok(lookFor('town').fog.density < lookFor('archipelago').fog.density);
  assert.ok(Object.isFrozen(LOCATION_LOOKS.town) && Object.isFrozen(lookFor('town')));
});

test('grade: richer colour, cool shadows and warm highlights, neutral greys stay grey, nothing leaves 0..1', () => {
  assert.ok(GRADE.saturation > 1.1 && GRADE.saturation < 1.4 && GRADE.contrast > 0.2 && GRADE.contrast < 0.6);
  const sat = (c) => Math.max(...c) - Math.min(...c);
  const amber = [0.8, 0.45, 0.12];
  assert.ok(sat(gradeColor(amber)) > sat(amber) * 0.98, 'amber keeps its colour');
  const dark = gradeColor([0.03, 0.03, 0.03]), bright = gradeColor([0.8, 0.8, 0.8]);
  assert.ok(dark[2] > dark[0], 'shadows lean cool'); assert.ok(bright[0] > bright[2], 'highlights lean warm');
  assert.ok(Math.abs(dark[0] - dark[2]) < 0.01 && Math.abs(bright[0] - bright[2]) < 0.1, 'the split is a tint, not a cast');
  assert.ok(gradeColor([0.1, 0.1, 0.1])[1] < 0.1 && gradeColor([0.7, 0.7, 0.7])[1] > 0.7, 'the S-curve deepens darks and lifts lights');
  for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 0, 1], [0.5, 0.2, 0.9]]) for (const v of gradeColor(c)) assert.ok(v >= 0 && v <= 1);
  assert.deepEqual(gradeColor([0, 0, 0]), [0, 0, 0]);
  // The grade is three.js's custom tone mapping, so the direct path (phones, low tier) and the post stack share it.
  const r = { toneMapping: 0 };
  assert.equal(installGrade(r), true);
  assert.equal(r.toneMapping, THREE.CustomToneMapping);
  assert.ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes('AgXToneMapping( color )') && !THREE.ShaderChunk.tonemapping_pars_fragment.includes('CustomToneMapping( vec3 color ) { return color; }'));
});

test('weather presets: clear is the calm default; overcast and rain dim the sun, soften shadows, thicken the haze', () => {
  assert.deepEqual(WEATHER_NAMES, ['clear', 'haze', 'fog', 'overcast', 'drizzle', 'rain', 'storm']);
  assert.equal(DEFAULT_WEATHER, 'clear');
  const { clear, overcast, rain } = WEATHER;
  assert.equal(clear.sun, 1); assert.equal(clear.wet, 0); assert.equal(clear.rain, 0); assert.equal(clear.overcast, 0); assert.equal(clear.fog, 1);
  assert.ok(clear.wind > 0 && clear.wind < 0.5, 'calm, not dead air');
  assert.ok(overcast.sun < 0.4 && rain.sun <= overcast.sun);
  assert.ok(overcast.shadow < 1 && rain.shadow <= overcast.shadow && rain.shadow > 0.2, 'shadows soften, they do not vanish');
  assert.ok(overcast.ambient > 1 && overcast.fog > 1 && rain.fog > overcast.fog);
  assert.equal(overcast.wet, 0); assert.equal(overcast.rain, 0); assert.equal(rain.wet, 1); assert.equal(rain.rain, 1);
  assert.ok(rain.wind > overcast.wind && overcast.wind > clear.wind && rain.wind <= 1);
  const half = mixWeather(clear, rain, 0.5);
  assert.ok(Math.abs(half.sun - (clear.sun + rain.sun) / 2) < 1e-9);
  assert.equal(weatherCover(mixWeather(clear, clear, 0.3), 0.4), 0.4, 'clear keeps the hour\'s own clouds');
  assert.ok(Math.abs(weatherCover(half, 0.4) - 0.7) < 1e-9, 'cover eases from the hour\'s value to the lid');
  assert.equal(weatherCover(mixWeather(clear, rain, 1), 0.4), 1);
});

test('weather system: eases to a new weather, wets fast and dries slowly, reaches the preset exactly', () => {
  const w = new WeatherSystem({ name: 'clear', seconds: 4 });
  assert.equal(w.name, 'clear'); assert.equal(w.changing, false);
  assert.equal(w.set('bogus'), 'clear');
  w.set('rain');
  assert.equal(w.changing, true);
  w.update(1); assert.ok(w.state.sun < 1 && w.state.sun > WEATHER.rain.sun, 'mid transition');
  for (let i = 0; i < 80; i++) w.update(0.1);
  assert.ok(Math.abs(w.state.sun - WEATHER.rain.sun) < 1e-9); assert.ok(w.wet > 0.99, 'the ground is wet');
  assert.ok(Math.abs(WEATHER_UNIFORMS.ftfWeather.value[0] - w.wet) < 1e-6, 'the shared wetness uniform follows');
  assert.ok(Math.abs(WIND_UNIFORMS.ftfWind.value[2] - WEATHER.rain.wind) < 1e-6, 'the shared wind strength follows');
  w.set('clear');
  for (let i = 0; i < 60; i++) w.update(0.1);
  assert.ok(Math.abs(w.state.sun - 1) < 1e-9, 'the sky is clear after the transition');
  assert.ok(w.wet > 0.5, 'but the ground is still drying');
  for (let i = 0; i < 400; i++) w.update(0.1);
  assert.equal(w.wet, 0);
  // Reduced motion: an immediate change, and the wind clock does not advance when the motion time is 0.
  const t = WIND_UNIFORMS.ftfWind.value[3];
  w.set('overcast', { immediate: true });
  assert.equal(w.changing, false); assert.equal(w.state.overcast, WEATHER.overcast.overcast);
  w.update(0.5, 0);
  assert.equal(WIND_UNIFORMS.ftfWind.value[3], t);
  w.set('clear', { immediate: true });
});

test('wind: one shared field, blowing downwind, bounded by the strength, identical for every reader', () => {
  const U = new Float32Array([WIND_DIR[0], WIND_DIR[1], 0.5, 12]);
  assert.ok(Math.abs(Math.hypot(...WIND_DIR) - 1) < 0.01, 'unit direction');
  let moved = false, along = 0;
  for (let i = 0; i < 200; i++) {
    const x = (i * 7.3) % 120 - 60, z = (i * 3.1) % 120 - 60;
    const w = windAt(x, z, 1.5, U);
    assert.ok(w.gust >= 0 && w.gust <= 1);
    assert.ok(Math.hypot(w.x, w.z) <= 0.5 * 1.2 + 1e-9, 'never stronger than the strength allows');
    along += w.x * WIND_DIR[0] + w.z * WIND_DIR[1];
    if (Math.abs(w.gust - windAt(0, 0, 1.5, U).gust) > 0.05) moved = true;
  }
  assert.ok(along > 0, 'the mean push is downwind'); assert.ok(moved, 'gusts vary across the ground');
  const still = new Float32Array([WIND_DIR[0], WIND_DIR[1], 0, 12]);
  assert.equal(Math.hypot(windAt(3, 4, 0, still).x, windAt(3, 4, 0, still).z), 0, 'no strength, no push');
  assert.deepEqual(windAt(5, 6, 1, U), windAt(5, 6, 1, U));
});

test('withWind patches a material once; the wetness chunk rides on the fog chunks', () => {
  const m = new THREE.MeshStandardMaterial();
  withWind(m, { kind: 'cloth', weight: 'constant' });
  const first = m.onBeforeCompile;
  withWind(m, { kind: 'foliage' });
  assert.equal(m.onBeforeCompile, first, 'idempotent');
  const shader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}', fragmentShader: '' };
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.ftfWind, WIND_UNIFORMS.ftfWind, 'the shared uniform object, not a copy');
  assert.ok(shader.vertexShader.includes('ftfWind3') && !shader.vertexShader.includes('attribute float _wind'));
  assert.ok(m.customProgramCacheKey().includes('ftf-wind-cloth'));
  installHeightFog(); installWetness(); installWetness();
  assert.equal((THREE.ShaderChunk.roughnessmap_fragment.match(/ftfWeather\.x > 0\.001/g) || []).length, 1, 'installed once');
  assert.ok(THREE.ShaderChunk.fog_pars_fragment.includes('uniform vec4 ftfWeather'));
  assert.equal(THREE.ShaderLib.standard.uniforms.ftfWeather, WEATHER_UNIFORMS.ftfWeather);
});

test('rain: streak count follows the tier budget and the amount; reduced motion thins it', () => {
  const rain = new Rain({ capacity: 1000 });
  assert.equal(rain.mesh.visible, false);
  rain.setMax(400); rain.setAmount(1);
  assert.equal(rain.mesh.geometry.instanceCount, 400); assert.equal(rain.mesh.visible, true);
  rain.setAmount(0.5); assert.equal(rain.mesh.geometry.instanceCount, 200);
  rain.setAmount(1, true); assert.ok(rain.mesh.geometry.instanceCount < 200, 'still rain is sparse');
  rain.setAmount(0); assert.equal(rain.mesh.visible, false);
  rain.setMax(0); rain.setAmount(1); assert.equal(rain.mesh.visible, false, 'a tier without streaks draws nothing');
  assert.ok(QUALITY.ultra.rain > QUALITY.high.rain && QUALITY.high.rain > QUALITY.low.rain && QUALITY.low.rain > PHONE_QUALITY.high.rain && PHONE_QUALITY.high.rain > PHONE_QUALITY.low.rain);
});

test('town materials: authored glass stays (no transmission pass), lamps and windows follow the hour', () => {
  assert.equal(slotForMaterial('town_block_gate', 'M_Town_Glass'), null);
  assert.equal(slotForMaterial('town_block_gate', 'M_Town_GlassLit'), null);
  assert.equal(slotForMaterial('town_block_gate', 'M_Town_Lamp'), null);
  assert.equal(lookRole('M_Town_GlassLit'), 'window'); assert.equal(lookRole('M_Town_Lamp'), 'lamp');
  assert.equal(lookRole('M_Town_Cloth'), 'cloth'); assert.equal(lookRole('M_Town_Foliage'), 'foliage'); assert.equal(lookRole('M_Town_Stone'), null);
  const win = new THREE.MeshStandardMaterial({ name: 'M_Town_GlassLit', emissiveIntensity: 1.3 });
  const lamp = new THREE.MeshStandardMaterial({ name: 'M_Town_Lamp', emissiveIntensity: 3.5 });
  const cloth = new THREE.MeshStandardMaterial({ name: 'M_Town_Cloth' });
  const root = new THREE.Group();
  for (const m of [win, lamp, cloth]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), m));
  registerLookMaterials(root);
  assert.ok(cloth.userData.ftfWind, 'cloth moves with the wind');
  setEmissiveLevels({ windows: 0.45, lamps: 0.2 });
  const dayWin = win.emissiveIntensity, dayLamp = lamp.emissiveIntensity;
  setEmissiveLevels({ windows: 2.2, lamps: 1.5 });
  assert.ok(win.emissiveIntensity > dayWin * 3 && lamp.emissiveIntensity > dayLamp * 2, 'dusk: windows and lamps take over');
  assert.ok(dayWin < 1.0, 'by day a lit window stays under the bloom threshold');
  registerLookMaterials(root);
  setEmissiveLevels({ windows: 1, lamps: 1 });
  assert.ok(Math.abs(win.emissiveIntensity - 1.3) < 1e-9, 'registering twice does not compound');
});

test('blob shadows: one instance per tracked, visible character; strength 0 draws nothing', () => {
  const blobs = new BlobShadows({ capacity: 4 });
  const scene = new THREE.Group();
  const a = new THREE.Group(), b = new THREE.Group();
  scene.add(a, b); a.position.set(1, 2, 3);
  blobs.setStrength(0.4);
  blobs.track(a); blobs.track(a); blobs.track(b, { visible: () => false });
  blobs.update();
  assert.equal(blobs.mesh.count, 1); assert.equal(blobs.mesh.visible, true);
  const m = new THREE.Matrix4(); blobs.mesh.getMatrixAt(0, m);
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(p.x - 1) < 1e-6 && p.y > 2 && p.y < 2.1 && Math.abs(p.z - 3) < 1e-6, 'just above the feet');
  b.visible = true; blobs.untrack(b); blobs.track(b); blobs.update();
  assert.equal(blobs.mesh.count, 2);
  scene.remove(a); blobs.update(); assert.equal(blobs.mesh.count, 1, 'a character that left the scene has no blob');
  blobs.setStrength(0); blobs.update(); assert.equal(blobs.mesh.visible, false);
  for (const cfg of [QUALITY.ultra, QUALITY.high, QUALITY.low, PHONE_QUALITY.high, PHONE_QUALITY.low]) assert.ok(cfg.blobs > 0);
  assert.ok(PHONE_QUALITY.low.blobs > QUALITY.ultra.blobs, 'stronger where there is no ambient occlusion');
});

test('wind weights without an authored attribute: only what is recognisably a banner, an awning or a plant moves', () => {
  const geo = (boxes) => { // axis-aligned boxes as 8 corners + 12 triangles each: [x0, y0, z0, x1, y1, z1]
    const P = [], I = [];
    for (const [x0, y0, z0, x1, y1, z1] of boxes) {
      const o = P.length;
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) P.push([x, y, z]);
      for (const t of [[0, 1, 2], [1, 3, 2], [4, 6, 5], [5, 6, 7], [0, 4, 1], [1, 4, 5], [2, 3, 6], [3, 7, 6], [0, 2, 4], [2, 6, 4], [1, 5, 3], [3, 5, 7]]) I.push(...t.map((k) => k + o));
    }
    return [{ count: P.length, getX: (i) => P[i][0], getY: (i) => P[i][1], getZ: (i) => P[i][2] }, { count: I.length, getX: (i) => I[i] }, P];
  };
  // A banner (0.9 x 2.5) with a separate tail piece touching its hem; a candle; a rug; an awning with a stripe on top of it.
  const [pos, idx, P] = geo([[0, 2, 0, 0.9, 4.5, 0.03], [0.1, 1.6, 0, 0.8, 2, 0.03], [10, 0, 0, 10.1, 0.34, 0.1], [20, 0, 0, 22, 0.01, 1.5], [30, 2, 0, 32.9, 2.6, 1.3], [30.5, 2, 0, 30.8, 2.61, 1.3]]);
  const w = windWeights(pos, idx, 'cloth');
  const at = (x, y) => w[P.findIndex((p) => p[0] === x && p[1] === y)];
  assert.equal(at(0, 4.5), 0, 'banner top pinned (the emblem of another material sits on the upper part)'); assert.ok(at(0, 2) > 0.5 && at(0, 2) < 1, 'the lower part swings');
  assert.equal(at(0.1, 1.6), 1, 'the hem of the tail is the free end of the same banner');
  assert.equal(at(10, 0), 0); assert.equal(at(10, 0.34), 0, 'a candle does not move');
  assert.equal(at(20, 0), 0, 'a rug does not move');
  assert.ok(at(30, 2) > 0 && at(30, 2) <= WIND_SHAPE.awning + 1e-6 && at(30, 2.6) < 0.01, 'an awning only breathes at its lower edge');
  assert.equal(at(30.5, 2), at(30, 2), 'a stripe moves with its awning');
  const f = windWeights(pos, idx, 'foliage');
  assert.equal(f[P.findIndex((p) => p[1] === 4.5)], 1, 'a tall crown leans, rooted at the bottom'); assert.equal(f[P.findIndex((p) => p[1] === 1.6)], 0);
  assert.ok(f[P.findIndex((p) => p[0] === 10 && p[1] === 0.34)] <= WIND_SHAPE.smallFoliage + 1e-6, 'a small plant only shivers');
});

test('storm: distant flashes with thunder after them; cheap tiers keep the wet sheen but no mirror puddles; splashes follow the rain', async () => {
  const { Splashes } = await import('../../src/render/weather.js');
  const w = new WeatherSystem({ name: 'storm' });
  const thunder = []; w.onThunder = (d) => thunder.push(d);
  let peak = 0;
  for (let i = 0; i < 60 * 30; i++) { w.update(1 / 60); peak = Math.max(peak, w.flash); }
  assert.ok(peak > 0.5, 'a flash lights the frame'); assert.ok(thunder.length >= 1 && thunder.every((d) => d >= 1.5 && d <= 5.5), 'thunder follows');
  assert.equal(w.flash, w.flashT < 0 ? 0 : w.flash);
  w.set('clear', { immediate: true }); w.update(0.5); assert.equal(w.flash, 0, 'no flashes once it clears');
  const r = new WeatherSystem({ name: 'rain' }); r.puddles = 0; r.update(0.1);
  assert.ok(WEATHER_UNIFORMS.ftfWeather.value[0] > 0.9 && WEATHER_UNIFORMS.ftfWeather.value[1] === 0);
  const s = new Splashes({ capacity: 100 }); s.setMax(80);
  s.setAmount(0); assert.equal(s.mesh.visible, false);
  s.setAmount(1); assert.equal(s.mesh.geometry.instanceCount, 80);
  s.setAmount(1, true); assert.equal(s.mesh.visible, false, 'none under reduced motion');
  s.dispose();
});

test('rain has no falling streaks on any tier (owner 12.11): only splashes, wet sheen, puddles, sky and haze', async () => {
  const { readFileSync } = await import('node:fs');
  const ld = readFileSync(new URL('../../src/render/lookdev.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ld, /new Rain\(/, 'no streak mesh is made');
  assert.match(ld, /this\.rain = null;/);
  assert.match(ld, /new Splashes\(\)/, 'the ground splashes stay');
  for (const w of ['rain', 'storm']) assert.ok(WEATHER[w].wet === 1 && WEATHER[w].overcast === 1, `${w} still wets the ground under a dark lid`);
});
