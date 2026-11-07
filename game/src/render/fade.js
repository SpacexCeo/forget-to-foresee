// Occlusion fade: anything tracked that sits between the camera and the player dithers down to a
// screen-door ghost so Iris never disappears behind a levitating Shell or a camp roof. Visual only.
// Dithering (ordered 4x4 Bayer) instead of alpha blending: no sorting artefacts, shadows and depth
// stay intact, MSAA softens the pattern. Materials of a tracked root are cloned once so the fade
// uniform is per object.
import * as THREE from 'three';

const DITHER = /* glsl */`
  uniform float uFade;
  float ftfBayer(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.x + i.y * 4;
    float m[16]; m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
    m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
    for (int k = 0; k < 16; k++) if (k == idx) return (m[k] + 0.5) / 16.0;
    return 0.5;
  }
`;

/** Clones a material and injects the dither test; returns {material, uniform}. */
function fadeable(mat) {
  const m = mat.clone();
  const uniform = { value: 1 };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uFade = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DITHER)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (uFade < 0.999 && uFade < ftfBayer(gl_FragCoord.xy)) discard;');
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '-ftf-fade';
  return { material: m, uniform };
}

export class OcclusionFader {
  /** @param {{camera:THREE.Camera, minFade?:number, speed?:number}} o */
  constructor({ camera, minFade = 0.22, speed = 6 }) {
    this.camera = camera; this.minFade = minFade; this.speed = speed;
    this.targets = [];
    this.tmpA = new THREE.Vector3(); this.tmpB = new THREE.Vector3(); this.tmpC = new THREE.Vector3();
  }

  /**
   * Tracks an object. `sphere()` returns its current world bounding sphere; `roots()` the Object3D
   * roots whose meshes get faded (re-read every frame, so streamed-in art is picked up).
   */
  track({ sphere, roots, pad = 0 }) { this.targets.push({ sphere, roots, pad, fade: 1, goal: 1, bound: new Map() }); }

  bind(target) {
    const seen = new Set();
    for (const root of target.roots()) {
      if (!root) continue;
      root.traverse((o) => {
        if (!o.isMesh) return;
        seen.add(o);
        if (target.bound.has(o)) return;
        const apply = (mat) => { const f = fadeable(mat); target.bound.set(o, (target.bound.get(o) || []).concat(f.uniform)); return f.material; };
        o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
      });
    }
    for (const o of [...target.bound.keys()]) if (!seen.has(o)) target.bound.delete(o);
  }

  /** @param {THREE.Vector3} focus the point that must stay visible (the player's chest) */
  update(dt, focus) {
    const cam = this.camera.position;
    const seg = this.tmpA.subVectors(focus, cam); const len = seg.length(); seg.divideScalar(len || 1);
    for (const t of this.targets) {
      const s = t.sphere();
      const toC = this.tmpB.subVectors(s.center, cam);
      const along = toC.dot(seg);
      let hit = false;
      if (along > 0 && along < len) {
        const perp = this.tmpC.copy(seg).multiplyScalar(along).sub(toC).length();
        hit = perp < s.radius + t.pad;
      }
      t.goal = hit ? this.minFade : 1;
      const k = 1 - Math.exp(-dt * this.speed);
      const next = t.fade + (t.goal - t.fade) * k;
      if (Math.abs(next - t.fade) < 1e-4 && t.fade === 1) continue;
      t.fade = Math.abs(next - t.goal) < 0.002 ? t.goal : next;
      this.bind(t);
      for (const list of t.bound.values()) for (const u of list) u.value = t.fade;
    }
  }
}
