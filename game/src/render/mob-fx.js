// Combat feel for the monsters outside the walls (mob_*.glb, art/mobs): a hit flash, a hit-stop nudge and the death
// dissolve. Visual only; the combat code decides when. One `MobFx` per spawned monster (its materials are cloned on
// prepare, so the uniforms are per monster and the shared glTF stays untouched).
//
//   const fx = new MobFx(model, { edge: 0xffb060 });   // after cloning the model (SkeletonUtils.clone)
//   fx.hit();                                         // on a hit: white flash + a small recoil, ~0.18 s
//   fx.die();                                         // when the death clip has played out: dissolve, ~1.1 s,
//                                                     // the body sinks a little and embers drift up from it
//   fx.update(dt);                                    // every frame; fx.done is true when fully dissolved
//
// The dissolve is a world-space value noise, biased by height so it burns from the feet up, against a threshold:
// fragments under it are discarded, a thin band above it glows, white-hot at the cut and the creature's own colour
// behind it (teal skitter/veilbell, amber hulker/crownrift).
import * as THREE from 'three';

export const MOB_GLOW = Object.freeze({ skitter: 0x7fe6d6, veilbell: 0x7fe6d6, hulker: 0xffb060, crownrift: 0xffb060 });
export const HIT_SECONDS = 0.18;
export const DISSOLVE_SECONDS = 1.1;
export const SINK = 0.12;           // metres the body settles while it dissolves
const EMBERS = 28;

const NOISE = /* glsl */`
  uniform float uDissolve;
  uniform vec3 uEdge;
  uniform float uFlash;
  uniform float uRim;
  uniform vec2 uSpan;                  // world y of the feet, height of the body
  varying vec3 vMobWorld;
  float mobHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float mobNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mobHash(i), mobHash(i + vec3(1,0,0)), f.x), mix(mobHash(i + vec3(0,1,0)), mobHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(mobHash(i + vec3(0,0,1)), mobHash(i + vec3(1,0,1)), f.x), mix(mobHash(i + vec3(0,1,1)), mobHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/** Clones a material and injects the flash and dissolve; returns {material, u} with the shared uniforms. */
export function mobMaterial(mat, u) {
  const m = mat.clone();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uDissolve = u.dissolve; shader.uniforms.uEdge = u.edge; shader.uniforms.uFlash = u.flash; shader.uniforms.uRim = u.rim; shader.uniforms.uSpan = u.span;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMobWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vMobWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float mobH = clamp((vMobWorld.y - uSpan.x) / max(uSpan.y, 0.01), 0.0, 1.0);
  float mobN = mix(0.65 * mobNoise(vMobWorld * 7.0) + 0.35 * mobNoise(vMobWorld * 23.0), mobH, 0.4);
  if (uDissolve > 0.0 && mobN < uDissolve * 1.08 - 0.04) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float mobBand = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.07, mobN - (uDissolve * 1.08 - 0.04)) : 0.0;
  float mobRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);       // a thin glow on the silhouette
  float mobCore = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.025, mobN - (uDissolve * 1.08 - 0.04)) : 0.0;
  totalEmissiveRadiance += uEdge * (3.0 * mobBand + uRim * mobRim) + vec3(1.0, 0.92, 0.8) * (2.5 * mobCore) + vec3(uFlash * 1.6);`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '-ftf-mob';
  return m;
}

export class MobFx {
  /**
   * @param {THREE.Object3D} model the spawned monster (its own clone)
   * @param {{edge?: number, recoil?: number, rim?: number}} o edge glow colour of the dissolve (and of the silhouette rim);
   *   recoil distance of a hit (m); rim strength (a thin glow on the silhouette so small monsters read from the camera)
   */
  constructor(model, { edge = 0xffb060, recoil = 0.06, rim = 0.3 } = {}) {
    this.model = model; this.recoil = recoil;
    this.u = { dissolve: { value: 0 }, edge: { value: new THREE.Color(edge) }, flash: { value: 0 }, rim: { value: rim }, span: { value: new THREE.Vector2(0, 1) } };
    const box = new THREE.Box3().setFromObject(model);
    this.span0 = box.isEmpty() ? [0, 1] : [box.min.y - model.position.y, Math.max(0.2, box.max.y - box.min.y)];
    this.embers = null;
    this.hitT = 0; this.dieT = -1; this.done = false;
    this.inner = model.children[0] || model;          // the recoil moves the inner node: the combat code owns the root
    this.innerBase = this.inner.position.clone();
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => mobMaterial(m, this.u)) : mobMaterial(o.material, this.u);
    });
  }

  /** A hit landed: flash and a small push back (along its local -Z, its back), for HIT_SECONDS. */
  hit() { if (this.dieT < 0) this.hitT = HIT_SECONDS; }

  /** Starts the dissolve (call when the death clip has reached its last frame). */
  die() {
    if (this.dieT >= 0) return;
    this.dieT = 0; this.hitT = 0;
    // embers: a few additive points that rise and fade from the body while it burns away
    const [y0, h] = this.span0, pos = new Float32Array(EMBERS * 3), vel = new Float32Array(EMBERS * 3), r = Math.max(0.25, h * 0.35);
    for (let i = 0; i < EMBERS; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      pos.set([Math.cos(a) * d, y0 + Math.random() * h * 0.8, Math.sin(a) * d], i * 3);
      vel.set([Math.cos(a) * 0.15, 0.5 + Math.random() * 0.9, Math.sin(a) * 0.15], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: this.u.edge.value, size: 0.07 + h * 0.02, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.embers = new THREE.Points(geo, mat); this.embers.frustumCulled = false; this.embers.userData.vel = vel;
    this.model.add(this.embers);
  }

  update(dt) {
    const m = this.model;
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt);
      const k = this.hitT / HIT_SECONDS;                 // 1 -> 0
      this.u.flash.value = k * k;
      this.inner.position.copy(this.innerBase).z -= this.recoil * Math.sin(Math.PI * k);
    } else if (this.dieT < 0) { this.u.flash.value = 0; this.inner.position.copy(this.innerBase); }
    else this.u.flash.value = 0;
    m.updateWorldMatrix(true, false);
    this.u.span.value.set(m.matrixWorld.elements[13] + this.span0[0] * m.matrixWorld.elements[5] - (this.dieT >= 0 ? SINK * this.u.dissolve.value ** 2 : 0), this.span0[1] * m.matrixWorld.elements[5]);
    if (this.dieT >= 0 && !this.done) {
      this.dieT += dt;
      const k = Math.min(1, this.dieT / DISSOLVE_SECONDS);
      this.u.dissolve.value = k;
      this.inner.position.y = this.innerBase.y - SINK * k * k;
      if (this.embers) {
        const p = this.embers.geometry.attributes.position, v = this.embers.userData.vel;
        for (let i = 0; i < p.array.length; i++) p.array[i] += v[i] * dt;
        p.needsUpdate = true; this.embers.material.opacity = 0.9 * (1 - k);
      }
      if (k >= 1) { this.done = true; m.visible = false; this.dispose(); }
    }
  }

  /** Frees the embers (the cloned materials go with the model when the combat code drops it). */
  dispose() {
    if (!this.embers) return;
    this.embers.parent?.remove(this.embers); this.embers.geometry.dispose(); this.embers.material.dispose(); this.embers = null;
  }
}
