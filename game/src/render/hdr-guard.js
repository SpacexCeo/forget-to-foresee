// HDR guard: one full-screen pass right after the scene render that clamps linear colour to a ceiling and replaces
// NaN/Inf with black. Without it a single non-finite sample (a low sun's disc at dusk, a degenerate normal) is spread
// by the bloom mip chain into solid black squares on the bloom grid: seen in the jury-video GPU capture (09.11) and the
// "black rectangles" of the earlier flickering videos. Cheap: one texture read and a clamp per pixel.
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const HDR_GUARD_MAX = 64;

export const HDR_GUARD = Object.freeze({
  name: 'HdrGuardShader',
  uniforms: { tDiffuse: { value: null }, maxValue: { value: HDR_GUARD_MAX } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float maxValue; varying vec2 vUv;',
    'void main() {',
    '  vec4 c = texture2D(tDiffuse, vUv); vec3 r = c.rgb;',
    '  if (any(isnan(r)) || any(isinf(r))) r = vec3(0.0);',
    '  gl_FragColor = vec4(clamp(r, 0.0, maxValue), c.a);',
    '}',
  ].join('\n'),
});

/** The same rule on the CPU (tests, tools): a non-finite channel blacks the pixel; the rest is clamped to [0, max]. */
export function guardColor(rgb, max = HDR_GUARD_MAX) {
  if (rgb.some((v) => !Number.isFinite(v))) return [0, 0, 0];
  return rgb.map((v) => Math.min(max, Math.max(0, v)));
}

export function createHdrGuardPass(max = HDR_GUARD_MAX) {
  const pass = new ShaderPass(HDR_GUARD);
  pass.uniforms.maxValue.value = max;
  return pass;
}
