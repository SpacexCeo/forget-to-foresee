// The Glass Shoal's look as data (docs/plans/boss/glass-shoal-boss.md, "The look target"): the tunable parameters,
// three original presets, the quality knobs per tier and profile, the sun direction, and the colour-grade LUT (a lift /
// gamma / gain curve with a warm-highlight / cool-shadow split baked into a 16³ table). Pure: no three.js, no DOM.

/** Every tunable value with its range (the render panel draws one slider per row, in this order). */
export const SHOAL_PARAMS = Object.freeze([
  { key: 'fov', label: 'Field of view', min: 30, max: 80, step: 1, unit: '°' },
  { key: 'exposure', label: 'Exposure', min: 0.3, max: 2.5, step: 0.01 },
  { key: 'sunHeight', label: 'Light height', min: 1, max: 45, step: 0.5, unit: '°' },
  { key: 'sunBearing', label: 'Light bearing', min: 0, max: 360, step: 1, unit: '°' },
  { key: 'fog', label: 'Fog density', min: 0, max: 0.03, step: 0.0005 },
  { key: 'mist', label: 'Low mist', min: 0, max: 1, step: 0.01 },
  { key: 'rays', label: 'God rays', min: 0, max: 1.2, step: 0.01 },
  { key: 'bloom', label: 'Bloom', min: 0, max: 2, step: 0.01 },
  { key: 'mirror', label: 'Mirror strength', min: 0, max: 1, step: 0.01 },
  { key: 'roughness', label: 'Mirror roughness', min: 0, max: 1, step: 0.01 },
  { key: 'ripple', label: 'Ripples', min: 0, max: 1, step: 0.01 },
  { key: 'lift', label: 'Lift (shadows)', min: -0.1, max: 0.1, step: 0.002 },
  { key: 'gamma', label: 'Gamma (mids)', min: 0.6, max: 1.6, step: 0.01 },
  { key: 'gain', label: 'Gain (highlights)', min: 0.6, max: 1.5, step: 0.01 },
  { key: 'warmth', label: 'Warm / cool split', min: 0, max: 1, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 1.6, step: 0.01 },
]);
const RANGE = Object.fromEntries(SHOAL_PARAMS.map((p) => [p.key, p]));

/** Three original looks for the same place. "Low sun" is the default. */
export const SHOAL_PRESETS = Object.freeze({
  // owner's pick (13.11, from the render panel): lower mirror and ripples, deeper shadows, a warmer split
  lowSun: Object.freeze({ fov: 48, exposure: 1.05, sunHeight: 7, sunBearing: 238, fog: 0.0065, mist: 0.55, rays: 0, bloom: 0.75, mirror: 0.65, roughness: 0.25, ripple: 0.11, lift: -0.064, gamma: 0.66, gain: 1.02, warmth: 0.71, saturation: 0.93 }),
  pearlDawn: Object.freeze({ fov: 52, exposure: 1.15, sunHeight: 3.5, sunBearing: 95, fog: 0.011, mist: 0.85, rays: 0, bloom: 0.6, mirror: 0.9, roughness: 0.28, ripple: 0.2, lift: 0.03, gamma: 1.1, gain: 0.98, warmth: 0.32, saturation: 0.86 }),
  stormSilver: Object.freeze({ fov: 44, exposure: 0.85, sunHeight: 16, sunBearing: 300, fog: 0.016, mist: 0.4, rays: 0, bloom: 1.05, mirror: 0.7, roughness: 0.4, ripple: 0.7, lift: -0.01, gamma: 0.94, gain: 1.12, warmth: 0.18, saturation: 0.72 }),
});
export const SHOAL_DEFAULT = SHOAL_PRESETS.lowSun;

/** Clamp a partial parameter object into range, filling the rest from `base`. Unknown keys are dropped. */
export function clampParams(p = {}, base = SHOAL_DEFAULT) {
  const out = {};
  for (const r of SHOAL_PARAMS) {
    const v = Number(p[r.key]);
    out[r.key] = Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : base[r.key];
  }
  return out;
}

/** JSON of a look, rounded for reading (the panel's "Copy JSON"). */
export function lookJson(p) {
  const c = clampParams(p), r = {};
  for (const k of Object.keys(c)) r[k] = Math.round(c[k] / (RANGE[k].step || 0.001)) * (RANGE[k].step || 0.001);
  for (const k of Object.keys(r)) r[k] = Number(r[k].toFixed(4));
  return JSON.stringify(r, null, 1);
}

/** Unit vector toward the sun from height and bearing in degrees (bearing 0 = +z, 90 = +x; y up). */
export function sunDirection(heightDeg, bearingDeg) {
  const h = (heightDeg * Math.PI) / 180, b = (bearingDeg * Math.PI) / 180;
  return [Math.cos(h) * Math.sin(b), Math.sin(h), Math.cos(h) * Math.cos(b)];
}

/** The sun's colour for its height: deep amber near the horizon, warm white higher up (linear RGB). */
export function sunColor(heightDeg) {
  const t = Math.min(1, Math.max(0, (heightDeg - 1) / 30));
  return [1.0, 0.55 + 0.38 * t, 0.28 + 0.6 * t];
}

/**
 * Quality knobs per tier (lookdev's 'ultra' | 'high' | 'low') and profile ('desktop' | 'phone'). Desktop high: the
 * planar reflector, cascaded shadows, bloom and god rays; phone: a static sky-and-scene reflection (no second render),
 * one shadow cascade, half-resolution effects (doc: "never below ~30 fps on a mid phone").
 */
export function shoalQuality(tier = 'high', profile = 'desktop') {
  if (profile === 'phone') {
    return Object.freeze({ reflector: false, reflectorScale: 0, cascades: 1, shadowSize: 1024, bloom: tier !== 'low', bloomScale: 0.5, rays: tier === 'ultra', raysScale: 0.25, msaa: 0, pixelRatioMax: 1.5, lut: true });
  }
  if (tier === 'low') return Object.freeze({ reflector: true, reflectorScale: 0.35, cascades: 1, shadowSize: 1024, bloom: false, bloomScale: 0.5, rays: false, raysScale: 0.25, msaa: 0, pixelRatioMax: 1.25, lut: true });
  if (tier === 'ultra') return Object.freeze({ reflector: true, reflectorScale: 1, cascades: 4, shadowSize: 2048, bloom: true, bloomScale: 1, rays: true, raysScale: 0.5, msaa: 4, pixelRatioMax: 2, lut: true });
  return Object.freeze({ reflector: true, reflectorScale: 0.6, cascades: 3, shadowSize: 2048, bloom: true, bloomScale: 0.75, rays: true, raysScale: 0.35, msaa: 4, pixelRatioMax: 1.75, lut: true });
}

/** The grade applied to one linear-ish display colour (0..1): lift / gamma / gain, a warm-cool split, saturation. */
export function gradeRgb(rgb, p = SHOAL_DEFAULT) {
  const l0 = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const warmHi = [1 + 0.08 * p.warmth, 1 + 0.02 * p.warmth, 1 - 0.07 * p.warmth], coolLo = [1 - 0.05 * p.warmth, 1 + 0.01 * p.warmth, 1 + 0.07 * p.warmth];
  const k = Math.min(1, Math.max(0, (l0 - 0.08) / 0.55));
  const out = rgb.map((c, i) => {
    let v = c * (coolLo[i] * (1 - k) + warmHi[i] * k);
    v = v * p.gain + p.lift * (1 - v);                     // gain and lift (lift raises the blacks, leaves white alone)
    v = Math.pow(Math.min(1, Math.max(0, v)), 1 / p.gamma); // gamma on the mids
    return v;
  });
  const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  return out.map((c) => Math.min(1, Math.max(0, l + (c - l) * p.saturation)));
}

/**
 * The 3D LUT as a 2D strip (size² × size, RGBA8): slice b is the block at x = b·size; inside a block x is red,
 * y is green. Sampled with two bilinear taps blended along blue in the grade pass.
 */
export function buildLut(p = SHOAL_DEFAULT, size = 16) {
  const w = size * size, data = new Uint8Array(w * size * 4);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const o = gradeRgb([r / (size - 1), g / (size - 1), b / (size - 1)], p);
    const i = (g * w + b * size + r) * 4;
    data[i] = Math.round(o[0] * 255); data[i + 1] = Math.round(o[1] * 255); data[i + 2] = Math.round(o[2] * 255); data[i + 3] = 255;
  }
  return { data, width: w, height: size, size };
}

/** Where the look should live in the URL: ?render=1 opens the panel, ?shoalLook=<preset> picks a preset. */
export function lookFromQuery(search = '') {
  let q; try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const preset = SHOAL_PRESETS[q.get('shoalLook')] ? q.get('shoalLook') : 'lowSun';
  return { panel: q.get('render') === '1', preset, params: SHOAL_PRESETS[preset] };
}
