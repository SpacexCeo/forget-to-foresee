// The market's art (docs/art/gpt/batch-2026-11-13.md): resource icons (assets/items/icons/res_<id>_{128,256}.webp,
// transparent) and the four works deed cards (assets/nft/deed_<works>.webp, 600 x 900). Every image keeps a text
// fallback: if it fails to load, its letter badge stays, so a row never loses its meaning.
export const RES_ICONS = Object.freeze(['spider_silk_thread', 'chitin_plate', 'veil_dust', 'ash_ore', 'crown_shard', 'bell_glass', 'ember_core', 'rift_heart']);
export const DEED_ART = Object.freeze(['loom', 'caravan', 'archive', 'observatory']);
const defaultBase = () => { try { return (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch { return '/'; } };

/** The icon path of a resource (128 or 256 px), or null for an id without art. Pure. */
export const resIconPath = (id, size = 128, base = defaultBase()) => (RES_ICONS.includes(id) ? `${base}assets/items/icons/res_${id}_${size >= 200 ? 256 : 128}.webp` : null);
/** The deed card of a works (by name or index 0-3), or null. Pure. */
export const deedCardPath = (works, base = defaultBase()) => { const w = typeof works === 'number' ? DEED_ART[works] : works; return DEED_ART.includes(w) ? `${base}assets/nft/deed_${w}.webp` : null; };

/**
 * An icon element: a box with the image, and the first letter of `label` shown if the image is missing or fails.
 * @returns {HTMLElement}
 */
export function artBox(doc, src, label, { size = 32, cls = 'ftf-art', radius = 6 } = {}) {
  const box = doc.createElement('span'); box.className = cls;
  box.style.cssText = `display:inline-grid;place-items:center;width:${size}px;height:${size}px;flex:none;border-radius:${radius}px;background:rgba(233,180,76,.12);color:#e9cf95;font:700 ${Math.round(size * 0.45)}px/1 Georgia,serif;overflow:hidden;vertical-align:middle;`;
  const letter = doc.createElement('b'); letter.textContent = String(label || '?').trim().charAt(0).toUpperCase() || '?';
  box.append(letter);
  if (src) {
    const img = doc.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:none;';
    if (img.addEventListener) {
      img.addEventListener('load', () => { img.style.display = 'block'; letter.remove(); });
      img.addEventListener('error', () => img.remove()); // the letter stays: a text fallback
    }
    img.src = src; box.append(img);
  }
  box.title = label || ''; box.setAttribute && box.setAttribute('aria-hidden', 'true');
  return box;
}
