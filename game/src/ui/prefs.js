// Player preferences (language, motion, subtitles, quality), stored on this device.
import { STORAGE_KEYS } from './storage.js';

// hudMode: Novice is the default for every new player (owner decision 08.11, docs/design/clarity-layers.md);
// Simple is the third level (docs/accessibility.md): Iris proposes one action per trial, the player confirms.
// hudScale multiplies the world HUD unit (accessibility: text larger than the mockup proportions).
// Accessibility prefs (docs/accessibility.md): uiScale 100–200 % for every panel, contrast normal/high,
// font default/readable (Atkinson Hyperlegible), palette default/safe (colour-blind-safe state colours),
// narration (spoken lines through the Web Speech API) with its rate.
export const PREF_DEFAULTS = Object.freeze({
  locale: null, motion: 'system', subtitles: true, subtitleSize: 'm', quality: 'auto', hudMode: 'novice', hudScale: 'm',
  uiScale: 100, contrast: 'normal', font: 'default', palette: 'default', narration: false, narrationRate: 1,
});
export const PREF_OPTIONS = Object.freeze({
  motion: ['system', 'reduce', 'full'],
  subtitleSize: ['s', 'm', 'l'],
  quality: ['auto', 'high', 'low'],
  locale: ['en', 'uk', 'ru', 'it', 'zh'],
  hudMode: ['simple', 'novice', 'pro'],
  hudScale: ['s', 'm', 'l', 'xl'],
  uiScale: [100, 125, 150, 175, 200],
  contrast: ['normal', 'high'],
  font: ['default', 'readable'],
  palette: ['default', 'safe'],
  narrationRate: [0.75, 0.9, 1, 1.15, 1.3],
});
/** World HUD unit multiplier per hudScale. */
export const HUD_SCALE = Object.freeze({ s: 0.9, m: 1, l: 1.15, xl: 1.3 });

/** Validates a prefs object; an invalid value falls back to its default. */
function clean(p) {
  const out = { ...PREF_DEFAULTS };
  if (!p || typeof p !== 'object') return out;
  for (const k of ['motion', 'subtitleSize', 'quality', 'locale', 'hudMode', 'hudScale', 'contrast', 'font', 'palette']) if (PREF_OPTIONS[k].includes(p[k])) out[k] = p[k];
  for (const k of ['uiScale', 'narrationRate']) if (PREF_OPTIONS[k].includes(Number(p[k]))) out[k] = Number(p[k]);
  if (typeof p.subtitles === 'boolean') out.subtitles = p.subtitles;
  if (typeof p.narration === 'boolean') out.narration = p.narration;
  return out;
}

const systemReduced = () => {
  try { return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};
const systemLowTier = () => {
  try {
    const n = globalThis.navigator || {};
    return (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 4) || /Mobi|Android/i.test(n.userAgent || '');
  } catch { return false; }
};

/**
 * @param {ReturnType<import('./storage.js').createSafeStorage>} storage
 * @param {{systemReducedMotion?: () => boolean, systemLowTier?: () => boolean}} env
 */
export function createPrefs(storage, env = {}) {
  let state = clean(storage.getJSON(STORAGE_KEYS.prefs));
  const subs = new Set();
  const reducedSys = env.systemReducedMotion || systemReduced;
  const lowSys = env.systemLowTier || systemLowTier;
  return {
    get: () => ({ ...state }),
    set(patch) {
      const next = clean({ ...state, ...patch });
      if (JSON.stringify(next) === JSON.stringify(state)) return state;
      state = next;
      storage.setJSON(STORAGE_KEYS.prefs, state);
      for (const fn of [...subs]) fn({ ...state });
      return state;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Reduced motion after resolving "follow system". */
    reducedMotion: () => (state.motion === 'system' ? reducedSys() : state.motion === 'reduce'),
    /** Render tier after resolving "auto". Tiers change presentation only, never state. */
    tier: () => (state.quality === 'auto' ? (lowSys() ? 'low' : 'high') : state.quality),
  };
}

/** Mirrors prefs onto <html> data attributes so CSS can react. */
export function applyPrefsToDocument(prefs, doc = globalThis.document) {
  if (!doc) return;
  const el = doc.documentElement;
  const p = prefs.get();
  el.dataset.motion = prefs.reducedMotion() ? 'reduce' : 'full';
  el.dataset.tier = prefs.tier();
  el.dataset.subtitles = p.subtitles ? 'on' : 'off';
  el.dataset.subtitleSize = p.subtitleSize;
  el.dataset.hudMode = p.hudMode;
  // Accessibility tokens (docs/accessibility.md): the world HUD multiplies its unit by --wh-user-scale,
  // every other panel reads --ftf-ui-scale; contrast / font / palette are data attributes for CSS.
  el.dataset.contrast = p.contrast;
  el.dataset.font = p.font;
  el.dataset.palette = p.palette;
  el.dataset.uiScale = String(p.uiScale);
  el.dataset.narration = p.narration ? 'on' : 'off';
  el.style.setProperty('--ftf-ui-scale', String(p.uiScale / 100));
  el.style.setProperty('--wh-user-scale', String((HUD_SCALE[p.hudScale] || 1) * (p.uiScale / 100)));
}
