// Settings -> Controls: the control mode as two cards side by side (owner 14.11), "Aim mode" and "Classic", each with
// its picture and its lines, the chosen one outlined in gold. The pictures are cut from the owner's infographic, one
// per language (docs/art/requests/in/ui/control_modes/<lang>.png -> art/ui/control_modes.sh ->
// assets/ui/control-modes/<lang>-<mode>.webp); Italian shows the English one. Until a language's pictures exist the
// card draws a mouse with the buttons that mode uses (CONTROL_ART lists the languages that have them).
// Plain DOM, no play imports.

export const CONTROL_MODES = Object.freeze(['aim', 'classic']);
/** Languages whose card pictures ship (assets/ui/control-modes/<lang>-<mode>.webp). Add one when its PNG is cut. */
export const CONTROL_ART = Object.freeze([]);
/** The picture's language for a locale: its own, else English when English ships, else none (the drawn mouse). Pure. */
export function artLocale(locale, have = CONTROL_ART) {
  if (have.includes(locale)) return locale;
  return have.includes('en') ? 'en' : null;
}
export const LINES = Object.freeze({ aim: ['set.ctl.mode.aim.1', 'set.ctl.mode.aim.2', 'set.ctl.mode.aim.3'], classic: ['set.ctl.mode.classic.1', 'set.ctl.mode.classic.2'] });

export const CARDS_CSS = `
.ftf-set-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 4px 0 6px; }
.ftf-set-mode { display: grid; grid-template-rows: auto auto 1fr; gap: 8px; padding: 10px; border-radius: 12px; border: 1px solid rgba(233,230,220,.16); background: rgba(255,255,255,.03);
  color: #f3ead6; font: 14px/1.4 system-ui, sans-serif; text-align: left; cursor: pointer; }
.ftf-set-mode:hover { border-color: rgba(233,180,76,.55); }
.ftf-set-mode:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ftf-set-mode[aria-checked="true"] { border: 2px solid #e9b44c; padding: 9px; background: rgba(233,180,76,.1); }
.ftf-set-mode .pic { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; background: #0c1314; object-fit: cover; }
.ftf-set-mode img.pic { aspect-ratio: auto; height: auto; object-fit: contain; }   /* the owner's panel keeps its own shape and text */
.ftf-set-mode b { font: 600 15px/1.2 system-ui, sans-serif; color: #f3ead6; }
.ftf-set-mode[aria-checked="true"] b { color: #e9b44c; }
.ftf-set-mode ul { margin: 0; padding: 0 0 0 16px; color: #d8cfbd; font-size: 13px; }
.ftf-set-modes-foot { margin: 0 0 8px; color: #9f998b; font-size: 12px; letter-spacing: .04em; }
@media (max-width: 480px) { .ftf-set-modes { grid-template-columns: 1fr; } }
`;

/** The drawn stand-in: a mouse with both buttons lit (both modes use both) and what each mode does with them. */
function mouseSvg(mode) {
  const gold = '#e9b44c', teal = '#9fd4cf';
  const extra = mode === 'aim'
    // the camera follows the mouse (arcs to both sides) and a crosshair holds the middle of the screen
    ? `<path d="M40 70a40 40 0 0 1 12-30M160 70a40 40 0 0 0-12-30" fill="none" stroke="${teal}" stroke-width="3" stroke-linecap="round"/>
<path d="M46 36l6 4-7 3M154 36l-6 4 7 3" fill="none" stroke="${teal}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="100" cy="128" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="100" cy="128" r="2" fill="#fff"/>`
    // the left button walks to a marked point on the ground; the right button held and dragged turns the camera
    : `<ellipse cx="52" cy="132" rx="14" ry="6" fill="none" stroke="${gold}" stroke-width="2"/><path d="M52 132l12-30" stroke="${gold}" stroke-width="2" stroke-dasharray="4 4"/>
<path d="M140 24c12 6 18 16 18 28" fill="none" stroke="${teal}" stroke-width="3" stroke-linecap="round"/><path d="M152 48l6 5 4-7" fill="none" stroke="${teal}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg class="pic" viewBox="0 0 200 150" role="img" aria-hidden="true"><rect width="200" height="150" fill="#0c1314"/>
<rect x="72" y="20" width="56" height="88" rx="28" fill="#1b2425" stroke="rgba(233,230,220,.18)" stroke-width="2"/>
<path d="M72 50a28 28 0 0 1 27-30v30z" fill="${gold}" opacity=".9"/><path d="M128 50a28 28 0 0 0-27-30v30z" fill="${gold}" opacity=".9"/>
<path d="M72 50h56M100 20v30" stroke="#0c1314" stroke-width="2"/>${extra}</svg>`;
}

/**
 * The two cards. `onPick(mode)` saves it; the caller renders the pane again.
 * @param {{doc?: Document, t: (k: string) => string, mode: string, locale?: string, base?: string, onPick: (m: string) => void}} o
 */
export function controlModeCards({ doc = globalThis.document, t, mode, locale = 'en', base = '/', onPick }) {
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = el('div', 'ftf-set-modes'); wrap.setAttribute('role', 'radiogroup'); wrap.setAttribute('aria-label', t('set.ctl.modes'));
  const art = artLocale(locale);
  for (const m of CONTROL_MODES) {
    const b = el('button', 'ftf-set-mode'); b.type = 'button'; b.dataset.mode = m;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(m === mode));
    if (art) { const img = el('img', 'pic'); img.src = `${base}assets/ui/control-modes/${art}-${m}.webp`; img.alt = ''; img.loading = 'lazy'; b.append(img); }
    else { const pic = el('span'); pic.innerHTML = mouseSvg(m); b.append(pic.firstElementChild || pic); }
    b.append(el('b', null, t('set.ctl.mode.' + m)));
    const ul = el('ul'); for (const k of LINES[m]) ul.append(el('li', null, t(k))); b.append(ul);
    b.addEventListener('click', () => { if (m !== mode) onPick(m); });
    wrap.append(b);
  }
  return [wrap, el('p', 'ftf-set-modes-foot', t('set.ctl.mode.foot'))];
}
