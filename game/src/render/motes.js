// Air motes: a handful of dust and pollen specks drifting through the air around the camera, the
// cheapest way to make still air read as air (owner 08.11: everything is animated, the world is
// alive). One THREE.Points draw call. The specks live in a cube that wraps around the camera, so
// the field is endless and costs the same everywhere; each speck drifts downwind, bobs on its own
// phase and sparkles when it sits between the camera and the sun. Deterministic (seeded), frozen
// under reduced motion (uTime stops; nothing pops), on the overlay layer so the ambient-occlusion
// g-buffer never sees it.
import * as THREE from 'three';
import { LAYER_OVERLAY } from './layers.js';
import { WIND_DIR } from './foliage.js';

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class AirMotes {
  /** @param {{count?:number, size?:number, seed?:number}} o size = edge of the wrapping cube (m) */
  constructor({ count = 400, size = 36, seed = 11 } = {}) {
    this.size = size;
    this.capacity = Math.max(1, count);
    const rnd = mulberry(seed);
    const pos = new Float32Array(this.capacity * 3), ph = new Float32Array(this.capacity * 2);
    for (let i = 0; i < this.capacity; i++) {
      pos[i * 3] = rnd() * size; pos[i * 3 + 1] = rnd() * size; pos[i * 3 + 2] = rnd() * size;
      ph[i * 2] = rnd() * Math.PI * 2; ph[i * 2 + 1] = 0.6 + rnd() * 0.8; // phase, size/speed scale
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSize: { value: size }, uWind: { value: new THREE.Vector3(WIND_DIR[0], 0, WIND_DIR[1]) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
        uPixelRatio: { value: 1 }, uCount: { value: this.capacity },
      },
      vertexShader: /* glsl */`
        uniform float uTime, uSize, uPixelRatio, uCount;
        uniform vec3 uWind, uSunDir;
        attribute vec2 aPhase;
        varying float vGlow, vFade;
        void main() {
          // Visible share of the pool (quality tiers lower uCount): the rest collapse to nothing.
          if (float(gl_VertexID) >= uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vGlow = 0.0; vFade = 0.0; return; }
          float t = uTime * aPhase.y;
          vec3 p = position + uWind * (t * 0.35) + vec3(sin(t * 0.7 + aPhase.x), sin(t * 0.45 + aPhase.x * 1.3) * 0.6, cos(t * 0.6 + aPhase.x)) * 0.8;
          // Wrap the cube around the camera.
          vec3 half = vec3(uSize * 0.5);
          p = mod(p - cameraPosition + half, uSize) - half + cameraPosition;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          float d = -mvPosition.z;
          vFade = smoothstep(uSize * 0.5, uSize * 0.2, d) * smoothstep(0.8, 3.0, d);
          vec3 vd = normalize(p - cameraPosition);
          vGlow = pow(max(dot(vd, uSunDir), 0.0), 8.0);
          gl_PointSize = (1.6 + 2.2 * aPhase.y) * uPixelRatio * (12.0 / max(d, 1.0));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uSunColor;
        varying float vGlow, vFade;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float r = dot(q, q) * 4.0;
          if (r > 1.0) discard;
          float a = (1.0 - r) * (1.0 - r) * vFade;
          vec3 col = mix(vec3(0.85, 0.88, 0.92), uSunColor * 1.8, vGlow) * (0.35 + 1.2 * vGlow);
          // Additive: no fog mix here (it would add haze colour around every far speck); vFade already
          // keeps the field within 18 m of the camera.
          gl_FragColor = vec4(col * a * 0.55, 0.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'air_motes';
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.layers.set(LAYER_OVERLAY);
    this.time = 0;
  }

  /** How many specks render (0 hides the draw call entirely). */
  setCount(n) { const c = Math.max(0, Math.min(this.capacity, Math.round(n || 0))); this.material.uniforms.uCount.value = c; this.points.visible = c > 0; }

  setSun(dir, color) { this.material.uniforms.uSunDir.value.copy(dir); this.material.uniforms.uSunColor.value.copy(color); }

  setPixelRatio(pr) { this.material.uniforms.uPixelRatio.value = pr; }

  /** @param {number} dt seconds (0 under reduced motion) */
  update(dt) { this.time += dt; this.material.uniforms.uTime.value = this.time; }

  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}
