// Graphics and control settings of the in-game settings popup, stored on this device ('ftf.settings.v1').
// Pure: validation, defaults and the mapping to the renderer's overrides (render/quality.js applyOverrides).
export const SETTINGS_KEY = 'ftf.settings.v1';
export const SETTINGS_DEFAULTS = Object.freeze({
  resScale: 1, shadows: true, bloom: true, weather: true, fpsCap: 0, // fpsCap 0 = the display's rate
  sensitivity: 1, invertY: false,
});
export const SETTINGS_OPTIONS = Object.freeze({
  resScale: [0.5, 0.6, 0.75, 0.85, 1], fpsCap: [0, 30, 60], sensitivity: [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2],
});

export function cleanSettings(s) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!s || typeof s !== 'object') return out;
  for (const k of ['resScale', 'fpsCap', 'sensitivity']) if (SETTINGS_OPTIONS[k].includes(Number(s[k]))) out[k] = Number(s[k]);
  for (const k of ['shadows', 'bloom', 'weather', 'invertY']) if (typeof s[k] === 'boolean') out[k] = s[k];
  return out;
}
export function loadSettings(storage) { try { return cleanSettings(JSON.parse((storage && storage.getItem(SETTINGS_KEY)) || 'null')); } catch { return { ...SETTINGS_DEFAULTS }; } }
export function saveSettings(storage, s) { try { storage && storage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(s))); } catch { /* private mode */ } }

/** The renderer overrides for these settings (only what differs from the tier's own choice). */
export const renderOverrides = (s) => ({ shadows: s.shadows, bloom: s.bloom, weather: s.weather });

/** Camera drag factor: radians per pixel times the sensitivity; invertY flips the tilt. */
export const lookFactors = (s, base = 0.005) => ({ x: base * s.sensitivity, y: base * s.sensitivity * (s.invertY ? -1 : 1) });

/** Whether a frame should render under an FPS cap (time in ms since the last rendered frame). */
export const frameDue = (cap, sinceMs) => !cap || sinceMs >= 1000 / cap - 1;
