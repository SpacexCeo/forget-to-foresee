// World HUD icon library (docs/ui-world-hud.md §5, §6). Every icon is an inline SVG string in the
// thin gold line style of the mockups: `currentColor` strokes, 1.5 units wide on a 24-unit grid,
// round caps and joins. Special art: the Signs & Visions eye sigil, the corner flourish, the
// prompt knot, the dialogue connector, the braid strip, the logogram ring (`ringSigil`) and the quest
// key (`keyArt`). Packages never define their own SVG: every glyph lives here.
//
//   import { icon, iconEl, ringSigil, keyArt } from './icons.js';
//   el.innerHTML = icon('shield', { size: 14 });
//   el.append(iconEl('eye-sigil', { size: 50 }));
//
// Colour comes from CSS (`color:`), so one definition serves gold, white and muted uses.

/** @typedef {{ vb: [number, number], body: string, sw?: number, fill?: boolean }} IconDef */

const STAR = (cx, cy, r) => `M${cx} ${cy - r} C${cx + r * .1} ${cy - r * .4} ${cx + r * .4} ${cy - r * .1} ${cx + r} ${cy} C${cx + r * .4} ${cy + r * .1} ${cx + r * .1} ${cy + r * .4} ${cx} ${cy + r} C${cx - r * .1} ${cy + r * .4} ${cx - r * .4} ${cy + r * .1} ${cx - r} ${cy} C${cx - r * .4} ${cy - r * .1} ${cx - r * .1} ${cy - r * .4} ${cx} ${cy - r} Z`;

/** 8-tooth cog outline on the 24 grid (centre 12,12). */
function cogPath(teeth = 8, rOut = 10, rIn = 7.6) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const w = step * 0.22; // half tooth width (angle)
    const s = step * 0.14; // flank
    pts.push([rIn, a - w - s], [rOut, a - w], [rOut, a + w], [rIn, a + w + s]);
  }
  return pts.map(([r, a], i) => `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`).join(' ') + ' Z';
}

/** @type {Record<string, IconDef>} */
const DEFS = {
  // ---- navigation / chrome ----
  'menu': { vb: [24, 24], body: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>' },
  // mobile top-bar menu: three 21×12 rules
  'menu-wide': { vb: [21, 12], sw: 1.8, body: '<path d="M.75 .9h19.5M.75 6h19.5M.75 11.1h19.5"/>' },
  'book': { vb: [24, 24], body: '<path d="M12 6.4C9.6 4.9 6.6 4.5 3.2 5v13.6c3.4-.5 6.4-.1 8.8 1.4 2.4-1.5 5.4-1.9 8.8-1.4V5c-3.4-.5-6.4-.1-8.8 1.4Z"/><path d="M12 6.4V20"/><path d="M5.6 8.3c1.5-.1 2.9.1 4.2.6M5.6 11.1c1.5-.1 2.9.1 4.2.6M14.2 8.9c1.3-.5 2.7-.7 4.2-.6M14.2 11.7c1.3-.5 2.7-.7 4.2-.6" stroke-width="1" opacity=".8"/>' },
  'gear': { vb: [24, 24], body: `<path d="${cogPath()}"/><circle cx="12" cy="12" r="3.1"/>` },
  'close': { vb: [24, 24], body: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', sw: 1.8 },
  'chevron-right': { vb: [24, 24], body: '<path d="M9 5l7 7-7 7"/>' },
  // sign-card chevron with the mockup's 10×16 proportions
  'chevron-slim': { vb: [10, 16], body: '<path d="M1.8 1.4L8.4 8 1.8 14.6"/>' },
  'chevron-up': { vb: [24, 24], body: '<path d="M5 15.5l7-7 7 7"/>' },
  'info': { vb: [24, 24], body: '<circle cx="12" cy="12" r="9.5"/><path d="M12 10.6V17"/><circle cx="12" cy="7.4" r="1" fill="currentColor" stroke="none"/>' },
  // the toast's "i" alone (its circle is the CSS border of .wh-toast__icon)
  'info-i': { vb: [10, 14], body: '<circle cx="5" cy="2.2" r="1.15" fill="currentColor" stroke="none"/><path d="M3.4 6.1H5.3V12.4M3.2 12.4H7"/>' },

  // ---- sign stats ----
  'shield': { vb: [24, 24], body: '<path d="M12 3.4l7 2.7v5.4c0 4.3-3 7.6-7 9.4-4-1.8-7-5.1-7-9.4V6.1l7-2.7Z"/>' },
  'link': { vb: [24, 24], body: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3.2-3.2a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3.2 3.2a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4"/>' },
  'bolt': { vb: [24, 24], body: '<path d="M13.2 2.6L5.4 13.6h6l-1.6 7.8 8.8-11.6h-6l.6-7.2Z"/>' },
  'clock': { vb: [24, 24], body: '<circle cx="12" cy="13" r="8.4"/><path d="M12 8.2V13l3.4 2.1M9.6 2.6h4.8M12 2.6v2"/>' },

  // ---- status card ----
  'target': { vb: [24, 24], body: '<circle cx="12" cy="12" r="7.8"/><path d="M12 1.6v3.6M12 18.8v3.6M1.6 12h3.6M18.8 12h3.6"/><path d="M12 8.6l3.4 3.4-3.4 3.4-3.4-3.4Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>' },
  // desktop Phase row: the target without the inner diamond (as in the mockup)
  'crosshair': { vb: [24, 24], body: '<circle cx="12" cy="12" r="7.8"/><path d="M12 1.6v3.6M12 18.8v3.6M1.6 12h3.6M18.8 12h3.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>' },
  'compass-star': { vb: [24, 24], body: `<path d="M12 2.2L21.8 12 12 21.8 2.2 12Z"/><path d="${STAR(12, 12, 5.4)}" fill="currentColor" stroke="none"/>` },
  'bar-chart': { vb: [24, 24], body: '<path d="M3.5 20.5v-6h2.6v6M8 20.5v-10h2.6v10M12.5 20.5V6.5h2.6v14M17 20.5v-8h2.6v8"/><path d="M2 20.5h20"/>' },
  'bookmark': { vb: [24, 24], body: '<path d="M6.5 3.5h11v17L12 16.4l-5.5 4.1Z"/><path d="M9.4 10.4a2.6 2.6 0 0 1 5.2 0"/>' },
  'map-pin': { vb: [24, 24], body: '<path d="M12 21.6C7.6 16.2 5.1 12.6 5.1 9.5a6.9 6.9 0 0 1 13.8 0c0 3.1-2.5 6.7-6.9 12.1Z"/><circle cx="12" cy="9.5" r="2.4"/>' },
  'key': { vb: [24, 24], body: '<circle cx="16.4" cy="7.6" r="4.1"/><path d="M13.5 10.5l-9.1 9.1M7.1 16.9l2.2 2.2M9.9 14.1l2.2 2.2"/>', sw: 1.8 },

  // ---- log / tabs ----
  'chat-bubble': { vb: [24, 24], body: '<path d="M4.6 5.2h14.8c.9 0 1.6.7 1.6 1.6v7.8c0 .9-.7 1.6-1.6 1.6h-8.3L7.2 20.2v-4H4.6c-.9 0-1.6-.7-1.6-1.6V6.8c0-.9.7-1.6 1.6-1.6Z"/><circle cx="8.6" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="10.8" r="1" fill="currentColor" stroke="none"/>' },
  // mobile dialogue bar: an empty speech bubble, tail at the bottom centre
  'bubble': { vb: [22, 18], body: '<path d="M4 1h14a3 3 0 0 1 3 3v6.4a3 3 0 0 1-3 3h-5.2L10.6 16.6 8.4 13.4H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3Z"/>' },
  'bulb': { vb: [24, 24], body: '<path d="M12 2.8a6 6 0 0 0-3.6 10.8c.8.6 1.3 1.5 1.4 2.4h4.4c.1-.9.6-1.8 1.4-2.4A6 6 0 0 0 12 2.8Z"/><path d="M9.6 18.6h4.8M10.4 21.2h3.2M3.2 9h1.8M19 9h1.8M5.4 3.6l1.3 1.3M18.6 3.6l-1.3 1.3"/>' },
  'sparkle': { vb: [24, 24], body: `<path d="${STAR(12, 12, 10)}" fill="currentColor" stroke="none"/>`, fill: true },
  'diamond': { vb: [24, 24], body: '<path d="M12 3l9 9-9 9-9-9Z"/>', sw: 2.4 },

  // ---- mobile tiles ----
  'eye': { vb: [26, 20], body: '<path d="M1.5 10C7 2.5 19 2.5 24.5 10 19 17.5 7 17.5 1.5 10Z"/><circle cx="13" cy="10" r="4.2"/><circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M13 .8v2.4M13 16.8v2.4" stroke-width="1.2"/>', sw: 1.3 },

  // ---- sigils and ornaments ----
  'eye-sigil': {
    vb: [50, 51], sw: 1.7,
    body: '<path d="M4 25.5C14.5 12.5 35.5 12.5 46 25.5 35.5 38.5 14.5 38.5 4 25.5Z"/>'
      + '<circle cx="25" cy="25.5" r="7.2"/><circle cx="25" cy="25.5" r="3.1" fill="currentColor" stroke="none"/>'
      + '<path d="M25 1.5L20.4 15.6M25 1.5l4.6 14.1" stroke-width="1.5"/><path d="M25 7.2l-2.3 6.4M25 7.2l2.3 6.4" stroke-width="1.1"/>'
      + '<path d="M25 49.5L20.4 35.4M25 49.5l4.6-14.1" stroke-width="1.5"/><path d="M25 43.8l-2.3-6.4M25 43.8l2.3-6.4" stroke-width="1.1"/>'
      + '<path d="M4 25.5H1.2M46 25.5h2.8" stroke-width="1.2"/>',
  },
  'logo-a': {
    vb: [31, 33], sw: 2.2,
    body: `<path d="M15.5 1.6L2.2 31.4M15.5 1.6l13.3 29.8"/><path d="M2.2 31.4h3.6M25.2 31.4h3.6" stroke-width="1.6"/><path d="${STAR(15.5, 21.5, 4)}" fill="currentColor" stroke="none"/>`,
  },
  'flourish': {
    vb: [54, 54], sw: .7,
    body: '<path d="M1.5 53C1.5 31 6.5 14.5 21.5 6.5 33 .5 45 1 52.5 1.5"/>'
      + '<path d="M4.5 46C6.5 29.5 14.5 17 30 9.5 37.5 6 44.5 5.5 50.5 6.5" opacity=".75"/>'
      + '<path d="M8 36c2.5-1.5 4-.5 4.5 1.5s-1.5 3.5-3.5 2.5-1.5-3.5 1.5-5.5M20 18c2.5-1 4.5.5 4 2.5s-2.5 2.5-4 1-1-3.5 2-5M35 8.5c2-1 4 .5 3.5 2.5s-2.5 2-3.5.5-.5-3 2.5-4" opacity=".85"/>'
      + '<path d="M13 27c1.5-2.5 4-3 6-2M27 13c2-2 4.5-2.5 6.5-1.5M44 5c1.5-.5 3-.5 4.5 0" opacity=".6"/>'
      + '<circle cx="9" cy="42" r="1" fill="currentColor" stroke="none" opacity=".8"/><circle cx="24" cy="15.5" r="1" fill="currentColor" stroke="none" opacity=".8"/><circle cx="41.5" cy="6.8" r=".9" fill="currentColor" stroke="none" opacity=".8"/>',
  },
  'knot': { vb: [14, 8], sw: 1, body: '<path d="M0 4h4.4M9.6 4H14"/><path d="M7 1.2L9.8 4 7 6.8 4.2 4Z"/><circle cx="7" cy="4" r=".8" fill="currentColor" stroke="none"/>' },
  // end of the dialogue strip: a full-height ")" hairline, a double diamond, a stub into the reply
  'connector': { vb: [34, 46], sw: 1, body: '<path class="wh-connector__arc" d="M0 .6C7.4 4.6 11 13.4 11.6 21.4c.1 1 .5 1.6 1.4 1.6-.9 0-1.3.6-1.4 1.6C11 32.6 7.4 41.4 0 45.4"/>'
    + '<path d="M18.6 18.8l4.2 4.2-4.2 4.2-4.2-4.2Z" stroke-width=".9"/><path d="M18.6 21l2 2-2 2-2-2Z" stroke-width=".7" opacity=".75"/><path d="M22.8 23H33"/>' },
  // the woven strip down the Signs panel's left edge (tiles vertically, 10×24 per unit)
  'braid': { vb: [10, 24], sw: .9, body: '<ellipse cx="5" cy="6" rx="3.4" ry="6.6"/><ellipse cx="5" cy="18" rx="3.4" ry="6.6"/><circle cx="5" cy="12" r=".9" fill="currentColor" stroke="none"/>' },
};

export const ICON_NAMES = Object.freeze(Object.keys(DEFS));

/**
 * @param {string} name   one of ICON_NAMES
 * @param {{size?: number, width?: number, height?: number, strokeWidth?: number, class?: string, title?: string}} [o]
 *   `size` sets the width; the height follows the icon's aspect ratio. Omit all three for 1em×1em.
 * @returns {string} SVG markup (aria-hidden unless `title` is given)
 */
export function icon(name, o = {}) {
  const d = DEFS[name];
  if (!d) throw new Error('wh icon: unknown icon "' + name + '"');
  const [vw, vh] = d.vb;
  const w = o.width ?? o.size;
  const h = o.height ?? (w != null ? +(w * vh / vw).toFixed(2) : undefined);
  const size = w != null ? ` width="${w}" height="${h}"` : ' width="1em" height="1em"';
  const sw = o.strokeWidth ?? d.sw ?? 1.5;
  const a11y = o.title ? `role="img" aria-label="${escapeAttr(o.title)}"` : 'aria-hidden="true"';
  const cls = o.class ? ` class="${escapeAttr(o.class)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}"${size}${cls} fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false" data-icon="${name}">${d.body}</svg>`;
}

/** Same as icon() but returns a live SVGElement (for h()/append). */
export function iconEl(name, o) { return toEl(icon(name, o)); }

let uid = 0;
const nextId = (p) => `${p}-${(++uid).toString(36)}`;

/**
 * The sign-card logogram ring, redrawn from the mockup: a 26.5-radius ring with a cream-to-gold
 * gradient, an open core ring (r 8), four small stars at r 19 and four bead nodes (r 4, dark hole)
 * on the ring at N E S W; N and S carry a short point outward. 70×70 at size 70.
 * @param {{size?: number, class?: string, hole?: string}} [o]  `hole` is the fill of the node holes (card colour)
 */
export function ringSigil(o = {}) {
  const size = o.size ?? 70;
  const hole = o.hole ?? 'var(--wh-ring-hole, #101d20)';
  const id = nextId('wh-ring');
  const cls = o.class ? ` class="${escapeAttr(o.class)}"` : '';
  const star = (cx, cy, r) => `M${cx} ${cy - r}C${cx + r * .12} ${cy - r * .35} ${cx + r * .35} ${cy - r * .12} ${cx + r} ${cy}C${cx + r * .35} ${cy + r * .12} ${cx + r * .12} ${cy + r * .35} ${cx} ${cy + r}C${cx - r * .12} ${cy + r * .35} ${cx - r * .35} ${cy + r * .12} ${cx - r} ${cy}C${cx - r * .35} ${cy - r * .12} ${cx - r * .12} ${cy - r * .35} ${cx} ${cy - r}Z`;
  const bead = (x, y) => `<circle cx="${x}" cy="${y}" r="4.1" fill="url(#${id}-g)"/><circle cx="${x}" cy="${y}" r="1.35" style="fill:${hole}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" width="${size}" height="${size}"${cls} overflow="visible" fill="none" aria-hidden="true" focusable="false" data-icon="ring-sigil">`
    + `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".45" stop-color="#f0cf86"/><stop offset="1" stop-color="#c7983f"/></linearGradient>`
    + `<radialGradient id="${id}-d" cx="35" cy="35" r="26" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#05100f" stop-opacity=".55"/><stop offset="1" stop-color="#05100f" stop-opacity=".15"/></radialGradient></defs>`
    + `<circle cx="35" cy="35" r="25.4" fill="url(#${id}-d)"/>`
    + `<circle cx="35" cy="35" r="26.6" stroke="url(#${id}-g)" stroke-width="2.2"/>`
    + `<circle cx="35" cy="35" r="8.1" stroke="url(#${id}-g)" stroke-width="2"/>`
    + `<path d="${star(35, 16, 2.9)}${star(54, 35, 2.6)}${star(35, 54, 2.9)}${star(16, 35, 2.6)}" fill="#f6dc9a"/>`
    + `<path d="M46.2 35h2.6" stroke="#f6dc9a" stroke-width="1" stroke-linecap="round" opacity=".45"/>`
    + `<path d="M35 0.6l2.6 3.6h-5.2ZM35 70.4l-2.6-4.4h5.2Z" fill="url(#${id}-g)"/>`
    + bead(35, 4.6) + bead(65.6, 35) + bead(35, 65.4) + bead(4.4, 35)
    + '</svg>';
}

/** A CSS `url("data:…")` of an icon, for repeating backgrounds (the Signs panel braid). */
export function iconUrl(name, color = '#e4c272') {
  const svg = icon(name).replace(' width="1em" height="1em"', '').replace(/currentColor/g, color);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The ornate glowing key of the quest banner. 100×101 at size 100 (`tall: true` → 100×115, the
 * mobile card variant with a longer glow). Gold gradients and a wide warm halo (softened by
 * the packages' CSS blur to match the mockup's glowing silhouette); colours are baked in (this is an illustration, not a line icon).
 * @param {{size?: number, tall?: boolean, class?: string}} [o]
 */
export function keyArt(o = {}) {
  const size = o.size ?? 100;
  const vh = o.tall ? 115 : 101;
  const id = nextId('wh-key');
  const cls = o.class ? ` class="${escapeAttr(o.class)}"` : '';
  const h = +(size * vh / 100).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${vh}" width="${size}" height="${h}"${cls} aria-hidden="true" focusable="false" data-icon="key-art">`
    + '<defs>'
    + `<radialGradient id="${id}-halo" cx="56" cy="34" r="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset=".45" stop-color="#e3a84a" stop-opacity=".35"/><stop offset="1" stop-color="#b47a28" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c2"/><stop offset=".35" stop-color="#f0c96a"/><stop offset=".7" stop-color="#c3923a"/><stop offset="1" stop-color="#8a601f"/></linearGradient>`
    + `<linearGradient id="${id}-shaft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a601f"/><stop offset=".4" stop-color="#f3d27c"/><stop offset=".6" stop-color="#fff0bf"/><stop offset="1" stop-color="#a8762a"/></linearGradient>`
    + `<filter id="${id}-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter>`
    + `<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".6"/></filter>`
    + '</defs>'
    // halo (the mockup key is a soft glow: no sigil arcs, orbits or sparks)
    + `<rect x="0" y="0" width="100" height="${vh}" fill="url(#${id}-halo)"/>`
    // key body, drawn upright then tilted
    + '<g transform="rotate(14 52 52)">'
    + `<g filter="url(#${id}-blur)" opacity=".75" fill="#f3c86a" stroke="#f3c86a" stroke-width="6"><ellipse cx="52" cy="22" rx="13.5" ry="15.5" fill="none"/><rect x="48.5" y="36" width="7" height="58" rx="2"/></g>`
    // bow (ring) with inner ring and crown loop
    + `<ellipse cx="52" cy="22" rx="13.5" ry="15.5" fill="none" stroke="url(#${id}-gold)" stroke-width="4.2"/>`
    + `<ellipse cx="52" cy="22" rx="8.5" ry="10.2" fill="none" stroke="url(#${id}-gold)" stroke-width="1.6" opacity=".9"/>`
    + `<path d="M52 6.5l-2.4 2.6h4.8Z M46 12.5c2-2.6 4.2-3.6 6-3.6s4 1 6 3.6" fill="none" stroke="#fff0c0" stroke-width="1.1" opacity=".9"/>`
    + `<circle cx="52" cy="4.6" r="2.6" fill="none" stroke="url(#${id}-gold)" stroke-width="2"/>`
    // collar
    + `<path d="M46.5 36.5h11l-1.2 6h-8.6Z" fill="url(#${id}-gold)" stroke="#6e4a16" stroke-width=".5"/>`
    + `<path d="M47.8 39.5h8.4" stroke="#fff4cf" stroke-width=".8" opacity=".9"/>`
    // shaft
    + `<rect x="49" y="42" width="6" height="52" rx="1.5" fill="url(#${id}-shaft)" stroke="#6e4a16" stroke-width=".5"/>`
    + `<path d="M50.2 46v44" stroke="#fff5d6" stroke-width=".8" opacity=".55"/>`
    + `<path d="M46.8 60h10.4M46.8 63h10.4" stroke="url(#${id}-gold)" stroke-width="1.6"/>`
    // bit (teeth)
    + `<path d="M55 76h9.5v5H55ZM55 83.5h7v4.5h-7ZM55 90.5h11v4H55Z" fill="url(#${id}-gold)" stroke="#6e4a16" stroke-width=".5"/>`
    + `<path d="M56.5 78.5h6M56.5 85.8h4M56.5 92.5h8" stroke="#fff4cf" stroke-width=".7" opacity=".8"/>`
    + `<path d="M49 94.5h6" stroke="#fff0bf" stroke-width="1.2" filter="url(#${id}-soft)"/>`
    + '</g>'
    + '</svg>';
}

function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function toEl(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}
