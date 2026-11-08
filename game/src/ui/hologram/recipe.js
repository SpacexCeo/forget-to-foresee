// Hologram recipe (spec §8): what Iris's hologram is assembled from and which
// filters process it. Pure data → canonical JSON → SHA-256 recipeHash.
// Cosmetic only: nothing here is read by the engine; the low tier is a render
// profile derived from the recipe and never changes the recipe or its hash.
import { sha256 } from '../../game/crypto.js';
import { STORAGE_KEYS } from '../storage.js';

export const RECIPE_VERSION = 1;
export const SHAPES = Object.freeze(['shell', 'sphere', 'ring', 'spiral', 'lattice', 'column']);
export const COMPONENTS = Object.freeze(['core', 'halo', 'orbiters', 'glyphRing', 'veil', 'shards']);
/** Whitelisted filter layers, in pipeline order. */
export const LAYERS = Object.freeze(['outline', 'bloom', 'scanlines', 'chromatic', 'grain', 'dither']);
export const GESTURES = Object.freeze(['breathe', 'still', 'orbit', 'beckon', 'bow', 'spiral']);
export const MAX_COMPONENTS = 4;
export const MAX_LAYERS = 3;
/** Numeric parameters: [group, field, min, max, step]. Values are quantized to the step. */
export const NUMERIC = Object.freeze([
  ['particles', 'count', 0, 400, 10],
  ['particles', 'size', 0.5, 3, 0.1],
  ['particles', 'drift', 0, 1, 0.05],
  ['noise', 'amount', 0, 1, 0.05],
  ['noise', 'scale', 0.2, 4, 0.1],
  ['light', 'intensity', 0, 2, 0.05],
  ['light', 'warmth', -1, 1, 0.05],
  ['trails', 'length', 0, 1, 0.05],
  ['trails', 'fade', 0, 1, 0.05],
]);
export const PALETTE_KEYS = Object.freeze(['primary', 'secondary', 'accent']);
/** Palette presets drawn from the game's art direction (spec §11). */
export const PALETTE_PRESETS = Object.freeze({
  mist: { primary: '#b7c6bd', secondary: '#8f86a8', accent: '#d4a15f' },
  ember: { primary: '#d4a15f', secondary: '#e9e9db', accent: '#8f86a8' },
  deep: { primary: '#6fa39a', secondary: '#53645d', accent: '#e9e9db' },
  iris: { primary: '#8f86a8', secondary: '#b7c6bd', accent: '#d4a15f' },
});


const decimals = (step) => (String(step).split('.')[1] || '').length;
function quantize(v, min, max, step, dflt) {
  let x = Number(v);
  if (!Number.isFinite(x)) x = dflt;
  x = Math.min(max, Math.max(min, x));
  const k = Math.round((x - min) / step);
  return Number((min + k * step).toFixed(decimals(step)));
}
function hex(v, dflt) {
  if (typeof v !== 'string') return dflt;
  let s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  return /^#[0-9a-f]{6}$/.test(s) ? s : dflt;
}
/** Keeps whitelisted, unique entries in canonical (whitelist) order, capped at `max`. */
function pick(list, whitelist, max) {
  const set = new Set(Array.isArray(list) ? list : []);
  return whitelist.filter((x) => set.has(x)).slice(0, max);
}

/**
 * Returns a complete, canonical recipe: unknown fields dropped, enums whitelisted,
 * numbers clamped and quantized, colours lower-case #rrggbb.
 */
export function normalizeRecipe(input, base = DEFAULT_RECIPE) {
  const r = input && typeof input === 'object' ? input : {};
  const b = base || {
    shape: SHAPES[0], components: [], layers: [], gesture: GESTURES[0],
    palette: PALETTE_PRESETS.mist, particles: {}, noise: {}, light: {}, trails: {},
  };
  const out = {
    v: RECIPE_VERSION,
    shape: SHAPES.includes(r.shape) ? r.shape : b.shape,
    components: pick(r.components ?? b.components, COMPONENTS, MAX_COMPONENTS),
    layers: pick(r.layers ?? b.layers, LAYERS, MAX_LAYERS),
    gesture: GESTURES.includes(r.gesture) ? r.gesture : b.gesture,
    palette: {},
  };
  for (const k of PALETTE_KEYS) out.palette[k] = hex(r.palette && r.palette[k], b.palette[k] || PALETTE_PRESETS.mist[k]);
  for (const [g, f, min, max, step] of NUMERIC) {
    out[g] = out[g] || {};
    const dflt = b[g] && b[g][f] != null ? b[g][f] : min;
    out[g][f] = quantize(r[g] && r[g][f] != null ? r[g][f] : dflt, min, max, step, dflt);
  }
  return out;
}

/**
 * Four complete looks for the onboarding picker (docs/tutorial.md §2.1): a whole recipe each, so one
 * tap gives a visibly different hologram. `mist` is the default recipe. Cosmetic only (spec §8).
 */
export const LOOK_PRESETS = Object.freeze({
  mist: Object.freeze({ shape: 'shell', components: ['core', 'halo', 'glyphRing'], layers: ['outline', 'scanlines'], palette: PALETTE_PRESETS.mist, gesture: 'breathe', particles: { count: 120, size: 1.2, drift: 0.35 }, noise: { amount: 0.25, scale: 1.2 }, light: { intensity: 1, warmth: 0.15 }, trails: { length: 0.3, fade: 0.6 } }),
  ember: Object.freeze({ shape: 'spiral', components: ['core', 'orbiters', 'shards'], layers: ['bloom', 'grain'], palette: PALETTE_PRESETS.ember, gesture: 'orbit', particles: { count: 180, size: 1.6, drift: 0.5 }, noise: { amount: 0.35, scale: 1.4 }, light: { intensity: 1.3, warmth: 0.6 }, trails: { length: 0.5, fade: 0.5 } }),
  deep: Object.freeze({ shape: 'sphere', components: ['core', 'veil', 'halo'], layers: ['outline', 'dither'], palette: PALETTE_PRESETS.deep, gesture: 'still', particles: { count: 90, size: 1, drift: 0.2 }, noise: { amount: 0.15, scale: 0.9 }, light: { intensity: 0.8, warmth: 0 }, trails: { length: 0.1, fade: 0.8 } }),
  iris: Object.freeze({ shape: 'ring', components: ['core', 'glyphRing', 'orbiters', 'veil'], layers: ['outline', 'bloom', 'chromatic'], palette: PALETTE_PRESETS.iris, gesture: 'beckon', particles: { count: 150, size: 1.3, drift: 0.4 }, noise: { amount: 0.3, scale: 1.1 }, light: { intensity: 1.1, warmth: 0.25 }, trails: { length: 0.4, fade: 0.6 } }),
});

export const DEFAULT_RECIPE = Object.freeze(normalizeRecipe({
  shape: 'shell',
  components: ['core', 'halo', 'glyphRing'],
  particles: { count: 120, size: 1.2, drift: 0.35 },
  layers: ['outline', 'scanlines'],
  palette: PALETTE_PRESETS.mist,
  noise: { amount: 0.25, scale: 1.2 },
  light: { intensity: 1, warmth: 0.15 },
  trails: { length: 0.3, fade: 0.6 },
  gesture: 'breathe',
}, null));

/** JSON with object keys sorted at every level; arrays keep their order. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/** Canonical recipe hash: SHA-256 over a domain tag and the canonical JSON. */
export function recipeHash(recipe) {
  return sha256(`ftf:recipe:v${RECIPE_VERSION}|` + canonicalJson(normalizeRecipe(recipe)));
}

export function recipesEqual(a, b) { return recipeHash(a) === recipeHash(b); }

/** A random valid recipe. `rand` defaults to Math.random; pass a seeded one for tests. */
export function randomizeRecipe(rand = Math.random) {
  const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
  const subset = (arr, max) => arr.filter(() => rand() < 0.45).slice(0, max);
  const presets = Object.values(PALETTE_PRESETS);
  const r = { shape: pickOne(SHAPES), gesture: pickOne(GESTURES), components: subset(COMPONENTS, MAX_COMPONENTS), layers: subset(LAYERS, MAX_LAYERS), palette: { ...pickOne(presets) } };
  if (!r.components.length) r.components = ['core'];
  for (const [g, f, min, max] of NUMERIC) { r[g] = r[g] || {}; r[g][f] = min + rand() * (max - min); }
  return normalizeRecipe(r);
}

/**
 * Render profile for a quality tier. It never mutates or replaces the recipe:
 * low tier caps particles, drops heavy filters and trails at draw time only.
 */
export function renderProfile(recipe, tier = 'high') {
  const r = normalizeRecipe(recipe);
  if (tier !== 'low') return { tier: 'high', particles: r.particles.count, layers: r.layers, trails: r.trails.length > 0, noiseOctaves: 2, maxDpr: 2 };
  return {
    tier: 'low',
    particles: Math.min(r.particles.count, 48),
    layers: r.layers.filter((l) => l === 'outline' || l === 'scanlines'),
    trails: false,
    noiseOctaves: 1,
    maxDpr: 1,
  };
}

/** Saves the recipe with its hash. Returns {ok, persistent, hash}. */
export function saveRecipe(storage, recipe) {
  const r = normalizeRecipe(recipe);
  const hash = recipeHash(r);
  let persistent = false;
  try { persistent = storage.setJSON(STORAGE_KEYS.hologram, { v: RECIPE_VERSION, recipe: r, hash }); } catch { persistent = false; }
  return { ok: true, persistent, hash };
}

/** Loads a saved recipe; rejects anything whose stored hash does not match. */
export function loadRecipe(storage) {
  let saved = null;
  try { saved = storage.getJSON(STORAGE_KEYS.hologram); } catch { saved = null; }
  if (!saved || !saved.recipe || typeof saved.hash !== 'string') return null;
  const r = normalizeRecipe(saved.recipe);
  return recipeHash(r) === saved.hash ? r : null;
}
