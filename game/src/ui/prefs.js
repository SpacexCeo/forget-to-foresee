// Player preferences (language, motion, subtitles, quality), stored on this device.
import { STORAGE_KEYS } from './storage.js';

export const PREF_DEFAULTS = Object.freeze({ locale: null, motion: 'system', subtitles: true, subtitleSize: 'm', quality: 'auto' });
export const PREF_OPTIONS = Object.freeze({
  motion: ['system', 'reduce', 'full'],
  subtitleSize: ['s', 'm', 'l'],
  quality: ['auto', 'high', 'low'],
  locale: ['en', 'ru'],
});

function clean(p) {
  const out = { ...PREF_DEFAULTS };
  if (!p || typeof p !== 'object') return out;
  for (const k of ['motion', 'subtitleSize', 'quality', 'locale']) if (PREF_OPTIONS[k].includes(p[k])) out[k] = p[k];
  if (typeof p.subtitles === 'boolean') out.subtitles = p.subtitles;
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
}
