// Mesh-based VFX pieces driven by the effect player (index.js): ground shockwave rings, light
// beams, crackling arcs, the burnt-ground decal, the logogram ink sign and a fixed pool of point
// lights (fixed so adding a flash never recompiles the scene's materials).
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders.js';
import { logogramStrokes, rasterizeLogogram, penAt, strokeTimes } from './logogram-shape.js';
import { lightningPath, rng, smoothstep, clamp01 } from './core.js';

const PREMULT = {
  transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
};
const TAIL = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const BASIC_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ---------------------------------------------------------------- ring
export function createRing() {
  const mat = new THREE.ShaderMaterial({
    ...PREMULT,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color() }, uIntensity: { value: 1 }, uWidth: { value: 0.1 }, uSeed: { value: 0 } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */`
      uniform float uT, uIntensity, uWidth, uSeed; uniform vec3 uColor; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float r = length(c);
        float e = 1.0 - pow(1.0 - uT, 3.0);                  // ease-out expansion
        float w = uWidth * (0.6 + 0.8 * uT);
        float n = vfxFbm(vec2(atan(c.y, c.x) * 3.0 + uSeed, r * 4.0 - uT * 2.0));
        float band = exp(-pow((r - e) / w, 2.0)) * (0.55 + 0.9 * n);
        float inner = smoothstep(e, 0.0, r) * 0.12 * (1.0 - uT);  // faint heat inside the ring
        float fade = pow(1.0 - uT, 1.4);
        float a = (band + inner) * fade * smoothstep(1.0, 0.92, r);
        gl_FragColor = vec4(uColor * uIntensity * a, 0.0);
        ${TAIL}
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
  m.frustumCulled = false; m.renderOrder = 12; m.visible = false; m.name = 'vfx:ring';
  return m;
}

// ---------------------------------------------------------------- beam
export function createBeam() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    ...PREMULT, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color() }, uIntensity: { value: 3 }, uLen: { value: 10 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vFacing;
      void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uGrow, uFade, uIntensity, uLen; uniform vec3 uColor;
      varying vec2 vUv; varying float vFacing;
      ${NOISE_GLSL}
      void main() {
        float v = vUv.y;
        if (v > uGrow) discard;
        float core = pow(vFacing, 2.5);
        float flow = 0.65 + 0.35 * vfxFbm(vec2(vUv.x * 6.0, v * uLen * 0.6 - uTime * 2.5));
        float head = exp(-pow((uGrow - v) * uLen / 0.8, 2.0)) * step(uGrow, 0.999) * 2.5;
        float ends = smoothstep(0.0, 0.03, v);
        float a = (core * flow + head * core) * ends * uFade;
        gl_FragColor = vec4(uColor * uIntensity * a, 0.0);
        ${TAIL}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = 12; m.visible = false; m.name = 'vfx:beam';
  return m;
}

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
/** Places a beam (unit cylinder along +Y) from a to b with radius w. */
export function placeBeam(m, a, b, w) {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, _d.normalize());
  m.scale.set(w, len, w);
  m.material.uniforms.uLen.value = len;
}

// ---------------------------------------------------------------- arcs
const ARC_POINTS = 33 + 2 * 17;
export function createArc() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(ARC_POINTS * 2 * 3), uv = new Float32Array(ARC_POINTS * 2 * 2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    ...PREMULT, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 6 } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
      void main() {
        float y = vUv.y * 2.0 - 1.0;
        float core = exp(-pow(y * 7.0, 2.0)) * 1.6;
        float halo = exp(-pow(y * 2.2, 2.0)) * 0.35;
        float a = (core + halo) * (1.0 - vUv.x * 0.35);
        vec3 c = mix(uColor, vec3(1.0), core * 0.5);
        gl_FragColor = vec4(c * uIntensity * a, 0.0);
        ${TAIL}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = 13; m.visible = false; m.name = 'vfx:arc';
  m.userData.polylines = [];
  return m;
}

/** New random bolt (main path + two branches) from top to target. */
export function regenArc(m, top, target, seed, depth = 5) {
  const main = lightningPath(top, target, { seed, depth, jitter: 0.16 });
  const r = rng(seed * 7 + 3);
  const lines = [main];
  for (let k = 0; k < 2; k++) {
    const i = 4 + Math.floor(r() * (main.length - 12));
    const p = main[i];
    const end = [p[0] + (r() - 0.5) * 3, p[1] - 1 - r() * 2.5, p[2] + (r() - 0.5) * 3];
    lines.push(lightningPath(p, end, { seed: seed * 13 + k, depth: Math.max(1, depth - 1), jitter: 0.25 }));
  }
  m.userData.polylines = lines;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
/** Rebuilds camera-facing ribbons for the current polylines. */
export function layoutArc(m, camera, width = 0.35) {
  const pos = m.geometry.attributes.position.array, uv = m.geometry.attributes.uv.array;
  const idx = [];
  let vi = 0;
  m.userData.polylines.forEach((line, li) => {
    const w = li === 0 ? width : width * 0.55;
    const base = vi;
    for (let i = 0; i < line.length; i++) {
      _a.fromArray(line[Math.max(0, i - 1)]); _b.fromArray(line[Math.min(line.length - 1, i + 1)]);
      _t.subVectors(_b, _a).normalize();
      _v.fromArray(line[i]);
      _s.subVectors(camera.position, _v).cross(_t).normalize().multiplyScalar(w * 0.5);
      if (vi >= ARC_POINTS) break;
      pos.set([_v.x + _s.x, _v.y + _s.y, _v.z + _s.z, _v.x - _s.x, _v.y - _s.y, _v.z - _s.z], vi * 6);
      const u = i / (line.length - 1);
      uv.set([u, 0, u, 1], vi * 4);
      if (i > 0) { const a = (vi - 1) * 2, b = vi * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      vi++;
    }
    void base;
  });
  m.geometry.setIndex(idx);
  m.geometry.attributes.position.needsUpdate = true;
  m.geometry.attributes.uv.needsUpdate = true;
}

// ---------------------------------------------------------------- scorch decal
export function createDecal() {
  const mat = new THREE.ShaderMaterial({
    ...PREMULT,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color() }, uSeed: { value: 0 } },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */`
      uniform float uT, uFade, uSeed; uniform vec3 uColor; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float r = length(c);
        float n = vfxFbm(c * 3.0 + uSeed);
        float burn = smoothstep(0.95, 0.25, r + (n - 0.5) * 0.5);
        float a = burn * 0.85 * uFade;
        // Ember veins: ridged noise inside the burn, cooling over a few seconds.
        float ridge = 1.0 - abs(vfxSnoise(vec3(c * 4.0, uSeed)) );
        float veins = pow(ridge, 10.0) * smoothstep(0.8, 0.1, r) * exp(-uT * 0.55);
        vec3 ember = vec3(1.0, 0.45, 0.12) * 6.0 * veins;
        gl_FragColor = vec4(uColor * a + ember * uFade, a);
        ${TAIL}
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
  m.frustumCulled = false; m.renderOrder = 9; m.visible = false; m.name = 'vfx:decal';
  return m;
}

// ---------------------------------------------------------------- logogram
export function createLogogram() {
  const mat = new THREE.ShaderMaterial({
    ...PREMULT, side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: {
      uField: { value: null }, uMaxDist: { value: 0.16 }, uProgress: { value: 0 }, uSettle: { value: 0 }, uOpacity: { value: 1 },
      uTime: { value: 0 }, uInk: { value: new THREE.Color(0x1c1b22) }, uGlow: { value: new THREE.Color(0xf4dfa6) }, uRim: { value: new THREE.Color(0xe8bd6a) },
    },
    vertexShader: BASIC_VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uField; uniform float uMaxDist, uProgress, uSettle, uOpacity, uTime;
      uniform vec3 uInk, uGlow, uRim; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec4 f = texture2D(uField, vec2(vUv.x, 1.0 - vUv.y));
        float d = f.r * uMaxDist;
        float t = f.g;
        float w = f.b * 2.0;
        float n = vfxFbm(vUv * 28.0 + 3.1);
        // Ink width: brush pressure, a ragged edge, and a slow bleed into the surface as it settles.
        float width = 0.016 * w + 0.004 + (n - 0.5) * 0.006 + uSettle * 0.004 * n;
        float aa = fwidth(d) * 1.2 + 0.0015;
        float ink = 1.0 - smoothstep(width - aa, width + aa, d);
        float drawn = 1.0 - smoothstep(uProgress - 0.004, uProgress + 0.002, t);
        float since = max(0.0, uProgress - t);
        float fresh = exp(-since * 10.0) * drawn * (1.0 - uSettle);
        float hot = 1.0 - uSettle;
        // Settled ink: near-black with a faint gold rim where the bleed thins out.
        float rim = smoothstep(width - 0.008, width, d) * ink;
        vec3 settled = mix(uInk, uRim * 0.9, rim * 0.6);
        vec3 glow = uGlow * (2.2 + 6.0 * fresh) * (0.85 + 0.15 * sin(uTime * 6.0 + t * 40.0));
        vec3 col = mix(settled, glow, clamp(hot * 0.9 + fresh, 0.0, 1.0));
        float alpha = ink * drawn * uOpacity;
        float halo = exp(-d * d / 0.0012) * drawn * (0.25 * hot + fresh * 0.9) + exp(-d * d / 0.0003) * drawn * uSettle * 0.06;
        gl_FragColor = vec4(col * alpha + uGlow * halo * 1.6 * uOpacity, alpha);
        ${TAIL}
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false; m.renderOrder = 12; m.visible = false; m.name = 'vfx:logogram';
  return m;
}

/** Builds the stroke field texture for a sign; returns {strokes, times}. */
export function setLogogramSign(m, { forms, dots, seed } = {}) {
  const strokes = logogramStrokes({ forms, dots, seed });
  const field = rasterizeLogogram(strokes, 256);
  const old = m.material.uniforms.uField.value;
  if (old) old.dispose();
  const tex = new THREE.DataTexture(field.data, field.size, field.size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  m.material.uniforms.uField.value = tex;
  m.material.uniforms.uMaxDist.value = field.maxDist;
  m.userData.strokes = strokes;
  m.userData.times = strokeTimes(strokes);
  return m.userData;
}

/** Pen tip in the sign's local unit-disc coordinates at progress p (or null). */
export const logogramPen = (m, p) => penAt(m.userData.strokes, p, m.userData.times);

// ---------------------------------------------------------------- lights
export function createLight() {
  const l = new THREE.PointLight(0xffffff, 0, 8, 2);
  l.castShadow = false; l.name = 'vfx:light';
  return l;
}

export { smoothstep, clamp01 };
