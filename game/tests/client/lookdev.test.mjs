// Look-dev rules that need no GPU (docs/lookdev.md): the fog integral, the sun transmittance,
// time-of-day presets, the material slot rules for loaded assets, the fog tint hook and the quality
// knobs the look reads. three.js imports fine under node; nothing here touches WebGL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TIME_PRESETS, DEFAULT_PRESET, sunDirection, sunTransmittance, SUN_DIRECTION } from '../../src/render/sky.js';
import { FOG_UNIFORMS, heightFogDepth, setFog, setFogTint, fogState, tickFog } from '../../src/render/fog.js';
import { slotForMaterial, SLOT_MATERIALS, nacreMaterial, glassMaterial, applyMaterialQuality, setNacreTime } from '../../src/render/materials.js';
import { QUALITY, PHONE_QUALITY, TIERS, qualityFor } from '../../src/render/quality.js';
import { BLOOM, GradeShader } from '../../src/render/post.js';
import { WIND_DIR } from '../../src/render/foliage.js';

test('time-of-day presets: golden is the default and every preset carries the full fog contract', () => {
  assert.equal(DEFAULT_PRESET, 'golden');
  assert.ok(TIME_PRESETS.golden.envUrl, 'golden hour has the baked HDR');
  for (const [name, P] of Object.entries(TIME_PRESETS)) {
    for (const k of ['density', 'falloff', 'near', 'far', 'sunPower', 'aerial']) assert.equal(typeof P.fog[k], 'number', `${name}.fog.${k}`);
    assert.ok(P.fog.near < P.fog.far, `${name}: distance fog near < far`);
    assert.ok(P.fog.aerial >= 0 && P.fog.aerial <= 1, `${name}: aerial shift is a 0..1 mix`);
    assert.ok(P.elevation > 0 && P.elevation < 90 && P.cloudCover > 0 && P.cloudCover < 1);
    assert.ok(P.exposure > -2 && P.exposure < 2);
  }
  // The baked HDR (art/env/bake_env.py) was rendered for elevation 13 / azimuth 34: the preset must not drift from it.
  assert.equal(TIME_PRESETS.golden.elevation, 13); assert.equal(TIME_PRESETS.golden.azimuth, 34);
  const d = sunDirection(13, 34);
  assert.ok(Math.abs(d.length() - 1) < 1e-6 && d.y > 0.2 && d.y < 0.24, 'low sun, unit vector');
  assert.ok(SUN_DIRECTION.distanceTo(d) < 1e-9, 'the back-compat constant is the golden sun');
});

test('sun transmittance: a low sun is redder and dimmer than a high one, never negative or above one', () => {
  const low = sunTransmittance(4.5), golden = sunTransmittance(13), noon = sunTransmittance(58);
  for (const T of [low, golden, noon]) for (const v of T) assert.ok(v >= 0 && v <= 1);
  assert.ok(low[0] / low[2] > golden[0] / golden[2] && golden[0] / golden[2] > noon[0] / noon[2], 'red/blue ratio grows as the sun sinks');
  assert.ok(low[1] < golden[1] && golden[1] < noon[1], 'green channel dims as the path lengthens');
  assert.ok(golden[0] > 0.5 && golden[2] > 0.15, 'golden hour is warm but not a red dot');
});

test('height fog integral: denser looking down into the sea than across, zero length is zero, matches the shader formula', () => {
  const o = { baseY: -28, falloff: 0.12, density: 0.085 };
  assert.equal(heightFogDepth([0, 40, 0], [0, 40, 0], o), 0);
  const across = heightFogDepth([0, 3, 0], [60, 3, 0], o);
  const down = heightFogDepth([0, 40, 0], [40, -25, 0], o);
  const deck = heightFogDepth([0, 40, 0], [40, -28, 0], o);
  assert.ok(across > 0.05 && across < 0.3, `a 60 m look across the plaza is a mild haze: ${across}`);
  assert.ok(down > across, 'the pillar bottoms sink into the mist');
  assert.ok(deck > down, 'the cloud deck itself is the mistiest');
  assert.ok(1 - Math.exp(-deck) > 0.5 && 1 - Math.exp(-deck) < 0.95, 'the deck is heavily but not fully fogged (it keeps its lit shape)');
  // Looking across at camp height from a high camera: the air up there is thin.
  assert.ok(heightFogDepth([0, 60, 0], [80, 60, 0], o) < 0.002);
  // The analytic integral equals a numeric one.
  const cam = [3, 20, -5], p = [-30, -20, 25];
  let num = 0; const N = 4000;
  for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; const y = cam[1] + (p[1] - cam[1]) * t; num += o.density * Math.exp(-(y - o.baseY) * o.falloff); }
  num *= Math.hypot(p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]) / N;
  assert.ok(Math.abs(num - heightFogDepth(cam, p, o)) / num < 1e-3);
});

test('fog uniforms are typed arrays shared by reference and the setters write them in place', () => {
  const P = FOG_UNIFORMS.ftfFogParams.value;
  assert.ok(P instanceof Float32Array && FOG_UNIFORMS.ftfFogSun.value instanceof Float32Array);
  setFog({ baseY: -28, falloff: 0.12, density: 0.085, aerial: 0.35, sunDir: { x: 0, y: 0.6, z: -0.8 }, sunTint: [0.4, 0.2, 0.05], sunPower: 7, sunStrength: 1 });
  assert.equal(FOG_UNIFORMS.ftfFogParams.value, P, 'the same array object');
  const s = fogState();
  assert.equal(s.baseY, -28); assert.ok(Math.abs(s.density - 0.085) < 1e-6); assert.equal(s.sunPower, 7);
  assert.ok(Math.abs(s.sunDir[2] + 0.8) < 1e-6 && Math.abs(s.sunTint[0] - 0.4) < 1e-6);
  setFogTint(0xff6a2a, 0.5);
  const t = fogState();
  assert.ok(Math.abs(t.tintAmount - 0.5) < 1e-6 && t.tint[0] > t.tint[2], 'warm tint stored');
  setFogTint(0xff6a2a, 3); assert.equal(fogState().tintAmount, 1, 'clamped');
  setFogTint(0xffffff, 0); assert.equal(fogState().tintAmount, 0, 'off');
  const t0 = fogState().driftTime; tickFog(0.5); tickFog(0); assert.ok(Math.abs(fogState().driftTime - t0 - 0.5) < 1e-6, 'the mist clock advances by dt and holds at dt 0');
  assert.ok(fogState().driftAmplitude > 0 && fogState().driftAmplitude < 0.5, 'banks of mist modulate, they never empty the fog');
});

test('material slots: Shells are nacre, the interior floor stays stone, named glass/amber/gold upgrade, art materials are kept', () => {
  assert.equal(slotForMaterial('shell_1', 'M_Shell_Exterior'), 'nacre');
  assert.equal(slotForMaterial('shell_3', 'M_Shell_Nacre'), 'nacre');
  assert.equal(slotForMaterial('shell_2_r2', 'M_Shell_Glow'), 'nacre');
  assert.equal(slotForMaterial('shell_interior', 'M_Shell_Nacre'), 'nacre');
  assert.equal(slotForMaterial('shell_interior', 'M_Shell_Stone'), null, 'the dark cracked floor is not mother of pearl');
  assert.equal(slotForMaterial('shell_interior', 'logogram_glass'), 'glass');
  assert.equal(slotForMaterial('guest', 'M_Guest_Nacre'), 'nacre');
  assert.equal(slotForMaterial('camp_iney', 'M_Frost_Glass'), 'glass');
  assert.equal(slotForMaterial('camp_iney', 'M_Frost_Atlas'), null);
  assert.equal(slotForMaterial('camp_sol', 'M_Salt_Quartz'), 'glass');
  assert.equal(slotForMaterial('camp_yantar', 'M_Amber_Atlas'), null, 'the whole Amber camp was an emissive blob before');
  assert.equal(slotForMaterial('camp_yantar', 'M_Amber_Glow'), 'amber');
  assert.equal(slotForMaterial('island', 'M_Island_Gold'), 'gold');
  assert.equal(slotForMaterial('island', 'M_Island_Lantern'), 'amber');
  assert.equal(slotForMaterial('island', 'M_Island_Rock'), null);
  assert.equal(slotForMaterial('island', 'M_Island_Foliage'), null);
  assert.equal(slotForMaterial('prop_lantern', 'M_Lantern_Glow'), 'amber');
  assert.equal(slotForMaterial('anchor', 'M_Anchor_Body'), null);
  assert.equal(slotForMaterial('anchor', 'M_Anchor_Lens'), null);
  assert.equal(slotForMaterial('agent_iris', 'M_Iris_Body'), null);
  for (const slot of ['nacre', 'glass', 'amber', 'gold']) assert.ok(SLOT_MATERIALS[slot], slot);
});

test('material quality toggles in place: the low tier drops the thin film and transmission, the rim carries the pearl', () => {
  applyMaterialQuality(QUALITY.ultra);
  assert.ok(nacreMaterial.iridescence > 0 && glassMaterial.transmission === 1 && !glassMaterial.transparent);
  const rimOn = nacreMaterial.userData.nacreUniforms.uNacreRim.value;
  applyMaterialQuality(QUALITY.low);
  assert.equal(nacreMaterial.iridescence, 0); assert.equal(glassMaterial.transmission, 0); assert.ok(glassMaterial.transparent && glassMaterial.opacity < 1);
  assert.ok(nacreMaterial.userData.nacreUniforms.uNacreRim.value > rimOn, 'stronger rim without the thin film');
  applyMaterialQuality(QUALITY.ultra);
  assert.ok(nacreMaterial.iridescence > 0 && glassMaterial.transmission === 1);
  assert.equal(nacreMaterial.userData.nacreUniforms.uNacreRim.value, rimOn);
});

test('quality knobs the look reads exist on every tier and profile and keep their meaning', () => {
  for (const t of TIERS) for (const profile of ['desktop', 'phone']) {
    const cfg = qualityFor(t, profile);
    for (const k of ['cloudSteps', 'cloudLayers', 'smaa', 'aoScale', 'raysScale', 'shadowRadius', 'grassBlades', 'flowers', 'grassFadeDistance']) assert.ok(k in cfg, `${profile}/${t}.${k}`);
    if (cfg.cloudLayers >= 2) assert.ok(cfg.cloudSteps >= 8 && cfg.cloudSteps <= 32, `${profile}/${t}: the raymarched slab needs 8..32 steps`);
    else assert.equal(cfg.cloudSteps, 0, `${profile}/${t}: deck only, no march`);
    if (!cfg.post) assert.equal(cfg.smaa, false);
  }
  assert.equal(QUALITY.ultra.smaa, true); assert.equal(QUALITY.high.smaa, false);
  assert.equal(QUALITY.ultra.aoScale, 1); assert.equal(QUALITY.high.aoScale, 0.5);
  assert.equal(QUALITY.ultra.cloudSteps, 28); assert.equal(QUALITY.high.cloudSteps, 16); assert.equal(QUALITY.low.cloudSteps, 0);
  assert.equal(PHONE_QUALITY.high.cloudSteps, 0); assert.equal(PHONE_QUALITY.low.cloudSteps, 0);
  assert.ok(QUALITY.ultra.motes > QUALITY.high.motes && QUALITY.high.motes > QUALITY.low.motes && QUALITY.low.motes > 0, 'air motes thin out with the tier');
  assert.ok(PHONE_QUALITY.high.motes > 0 && PHONE_QUALITY.high.motes < QUALITY.low.motes); assert.equal(PHONE_QUALITY.low.motes, 0, 'phone/low: no extra draw call');
});

test('post defaults: bloom threshold sits above diffuse white, the grade is mild, grain is fine', () => {
  assert.ok(BLOOM.threshold > 1.0 && BLOOM.threshold < 1.5, 'sunlit stone (< 1.0 linear) never blooms, emissives (> 1.5) do');
  assert.ok(BLOOM.strength > 0.2 && BLOOM.strength < 0.6);
  const u = GradeShader.uniforms;
  assert.ok(u.uContrast.value >= 1 && u.uContrast.value <= 1.15 && u.uSaturation.value >= 1 && u.uSaturation.value <= 1.12);
  assert.ok(u.uVignette.value > 0.1 && u.uVignette.value < 0.4);
  assert.ok(u.uGrain.value > 0 && u.uGrain.value < 0.05, 'grain is felt, not seen');
  assert.ok(u.uShadowTint.value.b > u.uShadowTint.value.r && u.uHighlightTint.value.r > u.uHighlightTint.value.b, 'cool shadows, warm highlights');
});

test('nacre shimmer stays within the pearl range and is a pure function of time', () => {
  setNacreTime(0); const r0 = nacreMaterial.iridescenceThicknessRange.slice(); const a0 = nacreMaterial.userData.nacreUniforms.uNacreRimColorA.value.getHex();
  setNacreTime(12.5); const r1 = nacreMaterial.iridescenceThicknessRange.slice();
  assert.notDeepEqual(r0, r1, 'it moves');
  for (const t of [0, 3, 12.5, 60, 600]) { setNacreTime(t); const [lo, hi] = nacreMaterial.iridescenceThicknessRange; assert.ok(lo > 100 && lo < 180 && hi > 400 && hi < 520 && lo < hi, `t=${t}: ${lo}..${hi}`); }
  setNacreTime(0); assert.deepEqual(nacreMaterial.iridescenceThicknessRange, r0); assert.equal(nacreMaterial.userData.nacreUniforms.uNacreRimColorA.value.getHex(), a0, 'deterministic');
});

test('wind direction is a unit vector on the ground plane', () => {
  assert.ok(Math.abs(Math.hypot(WIND_DIR[0], WIND_DIR[1]) - 1) < 0.01);
});
