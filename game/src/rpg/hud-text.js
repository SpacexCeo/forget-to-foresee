// The HUD layer's translator: the game's `t` first, then the English HUD table (play/locales/en-hud.js) while that
// table is not yet merged into the locale (sprint seam), with {name} placeholders filled in. Pure.
import EN_HUD from '../play/locales/en-hud.js';

/** Fill {name} placeholders. */
export const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m)) : String(s));

/** Wrap a translator: a key the game does not know (it returns the key or nothing) falls back to the HUD table. */
export function hudT(t) {
  return (key, p) => {
    let s = null;
    try { s = t ? t(key, p) : null; } catch { s = null; }
    if (typeof s === 'string' && s && s !== key) return s;
    return key in EN_HUD ? fill(EN_HUD[key], p) : (s || key);
  };
}
export { EN_HUD };
