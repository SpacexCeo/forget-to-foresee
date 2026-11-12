// Combat feel for the monsters outside the walls (mob_*.glb, art/mobs): a hit flash, a hit-stop nudge and the death
// dissolve. Visual only; the combat code decides when. One `MobFx` per spawned monster (its materials are cloned on
// prepare, so the uniforms are per monster and the shared glTF stays untouched).
//
//   const fx = new MobFx(model, { edge: 0xffb060 });   // after cloning the model (SkeletonUtils.clone)
//   fx.hit();                                         // on a hit: white flash + a small recoil, ~0.18 s
//   fx.die();                                         // when the death clip has played out: dissolve, ~1.1 s
//   fx.update(dt);                                    // every frame; fx.done is true when fully dissolved
//
// The dissolve is a world-space value noise against a threshold: fragments under it are discarded, a thin band
// above it glows in the edge colour (the creature's own glow: teal skitter/veilbell, amber hulker/crownrift).
import * as THREE from 'three';

export const MOB_GLOW = Object.freeze({ skitter: 0x7fe6d6, veilbell: 0x7fe6d6, hulker: 0xffb060, crownrift: 0xffb060 });
export const HIT_SECONDS = 0.18;
export const DISSOLVE_SECONDS = 1.1;

const NOISE = /* glsl */`
  uniform float uDissolve;
  uniform vec3 uEdge;
  uniform float uFlash;
  uniform float uRim;
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
    shader.uniforms.uDissolve = u.dissolve; shader.uniforms.uEdge = u.edge; shader.uniforms.uFlash = u.flash; shader.uniforms.uRim = u.rim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMobWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vMobWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float mobN = 0.65 * mobNoise(vMobWorld * 7.0) + 0.35 * mobNoise(vMobWorld * 23.0);
  if (uDissolve > 0.0 && mobN < uDissolve * 1.08 - 0.04) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float mobBand = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.07, mobN - (uDissolve * 1.08 - 0.04)) : 0.0;
  float mobRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);       // a thin glow on the silhouette
  totalEmissiveRadiance += uEdge * (3.0 * mobBand + uRim * mobRim) + vec3(uFlash * 1.6);`);
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
    this.u = { dissolve: { value: 0 }, edge: { value: new THREE.Color(edge) }, flash: { value: 0 }, rim: { value: rim } };
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
  die() { if (this.dieT < 0) { this.dieT = 0; this.hitT = 0; } }

  update(dt) {
    const m = this.model;
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt);
      const k = this.hitT / HIT_SECONDS;                 // 1 -> 0
      this.u.flash.value = k * k;
      this.inner.position.copy(this.innerBase).z -= this.recoil * Math.sin(Math.PI * k);
    } else { this.u.flash.value = 0; this.inner.position.copy(this.innerBase); }
    if (this.dieT >= 0 && !this.done) {
      this.dieT += dt;
      this.u.dissolve.value = Math.min(1, this.dieT / DISSOLVE_SECONDS);
      if (this.u.dissolve.value >= 1) { this.done = true; m.visible = false; }
    }
  }
}
