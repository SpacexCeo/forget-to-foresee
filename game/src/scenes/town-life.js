// Ambient life of the town (docs/town.md): chimney smoke bending with the shared wind, a few birds circling over
// the roofs, the sky islands drifting. Everything is animated in the vertex shader from one time uniform, so the
// per-frame cost on the CPU is three uniform writes; under reduced motion the time stands still (smoke hangs as
// still plumes, birds hold their place, the islands rest). Cloth and trees sway through render/weather.js withWind.
import * as THREE from 'three';
import { WIND_UNIFORMS } from '../render/weather.js';

/** Puffs per chimney and how many chimneys smoke at most, per detail level (0 = phones and the low tier, 1 = desktop). */
export const TOWN_LIFE = Object.freeze({
  puffs: Object.freeze([7, 14]), chimneys: Object.freeze([8, 24]), birds: Object.freeze([7, 13]),
  smokeHeight: 7, smokeSeconds: 9, skyDrift: Object.freeze({ bob: 2.2, sway: 5, period: 80 }),
});

/** Where a puff is at `age` 0..1 of its life, relative to its chimney (the same maths as the shader; tested). */
export function puffOffset(age, wind, seed = 0, H = TOWN_LIFE.smokeHeight) {
  const a = Math.min(1, Math.max(0, age)), lean = a * a * H * 1.6 * wind.strength;
  const curl = Math.sin(a * 5 + seed * 6.283) * 0.35 * a;
  return [wind.x * lean - wind.z * curl, a * H * (1 - 0.25 * a), wind.z * lean + wind.x * curl];
}

const SMOKE_VERT = /* glsl */`
  uniform vec4 ftfWind; uniform float uTime, uHeight, uSeconds, uScale;
  attribute float aSeed;
  varying float vFade;
  void main() {
    float age = fract( uTime / uSeconds + aSeed );
    float gust = 0.6 + 0.4 * sin( uTime * 0.31 + position.x * 0.13 + position.z * 0.11 );
    float lean = age * age * uHeight * 1.6 * ftfWind.z * gust;
    float curl = sin( age * 5.0 + aSeed * 6.283 ) * 0.35 * age;
    vec3 p = position + vec3( ftfWind.x * lean - ftfWind.y * curl, age * uHeight * ( 1.0 - 0.25 * age ), ftfWind.y * lean + ftfWind.x * curl );
    vec4 mv = viewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uScale * ( 0.5 + 1.9 * age ) / max( 0.1, - mv.z );
    vFade = smoothstep( 0.0, 0.12, age ) * ( 1.0 - age ) * ( 1.0 - age );
  }`;
const SMOKE_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep( 0.5, 0.08, length( c ) ) * vFade * uOpacity;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( uColor * ( 0.82 + 0.3 * ( 0.5 - c.y ) ), a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const BIRD_VERT = /* glsl */`
  uniform float uTime;
  attribute vec4 aOrbit; // centre x, centre z, radius, height
  attribute vec3 aPhase; // angle offset, angular speed (rad/s, signed), wing phase
  attribute float aTip;  // 1 on the wing tips
  void main() {
    float ang = aPhase.x + uTime * aPhase.y;
    float dirSign = sign( aPhase.y );
    vec2 fwd = vec2( - sin( ang ), cos( ang ) ) * dirSign;
    vec2 side = vec2( fwd.y, - fwd.x );
    // Flap in bursts, glide in between.
    float beat = sin( uTime * 9.0 + aPhase.z ) * ( 0.35 + 0.65 * smoothstep( -0.2, 0.6, sin( uTime * 0.7 + aPhase.z * 3.1 ) ) );
    vec3 local = vec3( position.x, position.y + aTip * beat * 0.34, position.z );
    vec3 centre = vec3( aOrbit.x + cos( ang ) * aOrbit.z, aOrbit.w + sin( uTime * 0.23 + aPhase.z ) * 1.6, aOrbit.y + sin( ang ) * aOrbit.z );
    vec3 p = centre + vec3( side.x * local.x + fwd.x * local.z, local.y, side.y * local.x + fwd.y * local.z );
    gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
  }`;
const BIRD_FRAG = /* glsl */`
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4( uColor, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** A tiny deterministic generator (the scene must look the same on every load and in every capture). */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * @param {object} o
 * @param {THREE.Object3D} o.parent the town group
 * @param {number[]} o.origin TOWN_ORIGIN (world) @param {number[]} o.center a point over the main street (world)
 * @param {number} [o.detail] 0 | 1 (see TOWN_LIFE)
 */
export function createTownLife({ parent, origin, center, detail = 1 }) {
  const d = detail ? 1 : 0;
  const group = new THREE.Group(); group.name = 'town_life';
  parent.add(group);
  const time = { value: 0 };

  // --- chimney smoke: one draw call for the whole town -----------------------------------------------------------
  const maxPuffs = TOWN_LIFE.chimneys[1] * TOWN_LIFE.puffs[1];
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPuffs * 3), 3));
  smokeGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(maxPuffs), 1));
  smokeGeo.setDrawRange(0, 0);
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { ftfWind: WIND_UNIFORMS.ftfWind, uTime: time, uHeight: { value: TOWN_LIFE.smokeHeight }, uSeconds: { value: TOWN_LIFE.smokeSeconds }, uScale: { value: 900 }, uColor: { value: new THREE.Color(0.8, 0.76, 0.7) }, uOpacity: { value: 0.4 } },
    vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.name = 'town_smoke'; smoke.frustumCulled = false; smoke.renderOrder = 3;
  group.add(smoke);
  const chimneys = new Map(); // piece id -> world positions
  function rebuildSmoke() {
    const pos = smokeGeo.getAttribute('position'), seed = smokeGeo.getAttribute('aSeed');
    const all = []; for (const list of chimneys.values()) for (const p of list) all.push(p);
    // The same chimneys every time: nearest the street first.
    all.sort((a, b) => Math.hypot(a[0] - center[0], a[2] - center[2]) - Math.hypot(b[0] - center[0], b[2] - center[2]));
    const per = TOWN_LIFE.puffs[d], n = Math.min(all.length, TOWN_LIFE.chimneys[d]);
    let k = 0;
    for (let c = 0; c < n; c++) {
      const r = rng(Math.round(all[c][0] * 31 + all[c][2] * 17) + 7);
      for (let i = 0; i < per; i++, k++) { pos.setXYZ(k, all[c][0], all[c][1], all[c][2]); seed.setX(k, (i + r()) / per); }
    }
    pos.needsUpdate = true; seed.needsUpdate = true;
    smokeGeo.setDrawRange(0, k);
    smoke.visible = k > 0;
  }
  /** The smoke sockets of one piece (world positions); an empty list removes them. */
  function setChimneys(id, points) { if (points && points.length) chimneys.set(id, points); else chimneys.delete(id); rebuildSmoke(); }

  // --- birds: two loose flocks circling over the roofs ------------------------------------------------------------
  const count = TOWN_LIFE.birds[d], r = rng(20261110);
  const base = new Float32Array([0, 0, 0.16, 0, 0, -0.2, -0.62, 0, -0.06, 0, 0, 0.16, 0.62, 0, -0.06, 0, 0, -0.2]);
  const tip = new Float32Array([0, 0, 1, 0, 1, 0]);
  const birdGeo = new THREE.InstancedBufferGeometry();
  birdGeo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  birdGeo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  const orbit = new Float32Array(count * 4), phase = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const flock = i % 2, ang = r() * 6.283;
    orbit.set([center[0] + (flock ? 14 : -9) + (r() - 0.5) * 5, center[2] + (flock ? -16 : 6) + (r() - 0.5) * 5, (flock ? 26 : 17) + r() * 7, origin[1] + (flock ? 34 : 25) + r() * 6], i * 4);
    phase.set([ang + (flock ? 0 : 2) + r() * 0.5, (flock ? 0.16 : -0.21) * (0.9 + r() * 0.2), r() * 6.283], i * 3);
  }
  birdGeo.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
  birdGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 3));
  birdGeo.instanceCount = count;
  const birds = new THREE.Mesh(birdGeo, new THREE.ShaderMaterial({ uniforms: { uTime: time, uColor: { value: new THREE.Color(0.1, 0.09, 0.09) } }, vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG, side: THREE.DoubleSide }));
  birds.name = 'town_birds'; birds.frustumCulled = false; birds.castShadow = false;
  group.add(birds);

  // --- the sky islands drift --------------------------------------------------------------------------------------
  let sky = null, skyBase = null;
  /** The real model of the sky piece (or null when it leaves). */
  function setSky(object) { if (sky && skyBase) sky.position.copy(skyBase); sky = object || null; skyBase = sky ? sky.position.clone() : null; }

  /**
   * @param {number} dt seconds; 0 under reduced motion (everything holds still)
   * @param {{sun?: THREE.Color, daylight?: number, pixelsPerMetre?: number}} [light] smoke takes the sun's colour, dimmed with
   *   the weather; `pixelsPerMetre` is the size of one metre at one metre from the camera, in drawing-buffer pixels
   */
  function update(dt, light) {
    time.value += dt;
    if (light && light.pixelsPerMetre) smokeMat.uniforms.uScale.value = light.pixelsPerMetre * 1.2;
    if (light && light.sun) smokeMat.uniforms.uColor.value.setRGB(0.5, 0.5, 0.52).lerp(light.sun, 0.35).multiplyScalar(0.55 + 0.75 * (light.daylight ?? 1));
    if (sky && skyBase) {
      const D = TOWN_LIFE.skyDrift, w = time.value * 6.283 / D.period;
      sky.position.set(skyBase.x + Math.sin(w * 0.6) * D.sway, skyBase.y + Math.sin(w) * D.bob, skyBase.z + Math.cos(w * 0.45) * D.sway * 0.5);
    }
  }

  function setActive(on) { group.visible = !!on; }
  function dispose() { parent.remove(group); smokeGeo.dispose(); smokeMat.dispose(); birdGeo.dispose(); birds.material.dispose(); }

  return { group, smoke, birds, time, setChimneys, setSky, update, setActive, dispose, get puffs() { return smokeGeo.drawRange.count; } };
}
