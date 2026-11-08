// The Chronicle: a small menu listing the season's chapters with their state (seen / now / skipped / not
// yet) and a Replay button for each film that can be watched. Opens on C (listened for on the window
// until `KeyC` is forwarded by the input layer, docs/collab-requests.md 11) and from a round button at
// the bottom left (large enough for touch). Styled with the world HUD tokens so it reads as part of the HUD;
// opens and closes with the motion design system (src/ui/motion: the panel scales in, the rows rise in a
// stagger, buttons lift and press; reduced motion cross-fades).
import { installMotionStyles, enter, exit, stagger, MOTION } from '../../ui/motion/index.js';
// The fab and the menu borrow `.wh-root` for its tokens, but tokens.css also gives `.wh-root` `position: absolute;
// inset: 0; pointer-events: none`. Vite injects that sheet after this one on the lobby path, so each base rule below
// doubles the class (`.ch-fab.wh-root`) to win whatever the order (QA-031: the fab sat at the top-left corner).
const CSS = `
.ch-fab.wh-root { position: fixed; top: auto; right: auto; left: calc(16px + env(safe-area-inset-left, 0px)); bottom: calc(56px + env(safe-area-inset-bottom, 0px)); width: 48px; height: 48px; border-radius: 50%; z-index: 4;
  display: grid; place-items: center; cursor: pointer; color: var(--wh-gold, #e4c272); background: var(--wh-btn-bg, rgba(10,22,23,.78)); border: 1px solid var(--wh-frame-soft, rgba(196,186,156,.45));
  box-shadow: 0 6px 18px rgba(0,0,0,.35); backdrop-filter: blur(var(--wh-blur-sm, 8px)); pointer-events: auto; }
.ch-fab:hover { border-color: var(--wh-gold, #e4c272); }
.ch-fab:focus-visible { outline: 3px solid var(--wh-gold, #e4c272); outline-offset: 2px; }
.ch-fab svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
body.ftf-map-open .ch-fab { display: none; }
@media (max-width: 700px) { .ch-fab.wh-root { bottom: calc(132px + env(safe-area-inset-bottom, 0px)); left: calc(8px + env(safe-area-inset-left, 0px)); } }
.ch-menu.wh-root { position: fixed; inset: 0; z-index: 5; display: grid; place-items: center; background: var(--wh-scrim, rgba(0,0,0,.35)); pointer-events: auto; }
.ch-menu.wh-root[hidden] { display: none; }
.ch-panel { width: min(520px, calc(100vw - 24px)); max-height: calc(100vh - 32px); overflow: auto; padding: 16px 18px 18px; border-radius: 12px; color: var(--wh-text, #faf7ee);
  background: var(--wh-panel-bg, rgba(16,26,27,.94)); border: 1px solid var(--wh-frame, rgba(232,214,172,.8)); box-shadow: 0 16px 40px rgba(0,0,0,.45); backdrop-filter: blur(var(--wh-panel-blur, 10px)); }
.ch-panel .ch-eyebrow { font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.ch-panel h2 { margin: 4px 0 6px; font: 400 22px/1.2 var(--wh-font, Georgia, serif); -webkit-text-stroke: .3px currentColor; }
.ch-panel p { margin: 0 0 12px; font: var(--wh-font-body-weight, 500) 13.5px/1.4 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-2, #e6e3d7); }
.ch-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.ch-rows li { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--wh-card-bg, rgba(8,18,21,.55)); border: 1px solid var(--wh-divider, rgba(255,255,255,.12)); }
.ch-rows li.now { border-color: var(--wh-gold, #e4c272); }
.ch-rows .ch-num { font: 400 20px/1 var(--wh-font, Georgia, serif); color: var(--wh-gold, #e4c272); text-align: center; }
.ch-rows .ch-name { font: 400 16px/1.2 var(--wh-font, Georgia, serif); }
.ch-rows .ch-state { display: block; margin-top: 2px; font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--wh-text-muted, #c9c6b8); }
.ch-rows li.later { opacity: .55; }
.ch-panel button { font: 600 13px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text, #faf7ee); background: var(--wh-btn-bg, rgba(10,22,23,.78)); border: 1px solid rgba(232,214,172,.45); border-radius: 7px; padding: 9px 12px; min-height: 40px; cursor: pointer; }
.ch-panel button:hover { border-color: var(--wh-gold, #e4c272); }
.ch-panel button:focus-visible { outline: 3px solid var(--wh-gold, #e4c272); outline-offset: 2px; }
.ch-panel button.ch-primary { background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); color: var(--wh-text-on-gold, #fffcec); }
.ch-panel .ch-foot { display: flex; justify-content: flex-end; margin-top: 12px; }
.ch-panel kbd { font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); border: 1px solid rgba(232,214,172,.6); border-radius: 4px; padding: 2px 5px; margin-right: 6px; background: var(--wh-kbd-bg, rgba(42,38,30,.92)); }
`;

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v14M16 5v14"/></svg>';

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return e;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root  the play UI root (#ui)  @param {object} o.ctx play context (i18n)
 * @param {() => object[]} o.rows director.rows()  @param {(id:string) => void} o.onReplay
 * @param {(id:string) => {key:string}} o.titleOf  the film title TextRef for a chapter id (from the stored film when seen)
 * @param {() => boolean} [o.canOpen] false while a film plays or a flight covers the screen
 * @param {number} [o.filmSeconds] the length of a film, for the eyebrow
 */
export function createChronicleMenu({ root, ctx, rows, onReplay, titleOf, canOpen = () => true, filmSeconds = 30 }) {
  const doc = root.ownerDocument || document;
  const { i18n } = ctx;
  const t = (k, a) => i18n.t(k, a);
  if (!doc.getElementById('ch-chronicle-style')) doc.head.append(el(doc, 'style', { id: 'ch-chronicle-style', text: CSS }));
  installMotionStyles(doc);
  const fab = el(doc, 'button', { type: 'button', class: 'ch-fab wh-root mo-lift', 'aria-label': t('chapter.chronicle.open'), title: t('chapter.chronicle.open'), html: ICON, onclick: () => api.toggle() });
  const menu = el(doc, 'div', { class: 'ch-menu wh-root', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('chapter.chronicle.title'), onclick: (e) => { if (e.target === menu) api.close(); } });
  root.append(fab, menu);
  let open = false;

  function render() {
    fab.setAttribute('aria-label', t('chapter.chronicle.open')); fab.title = t('chapter.chronicle.open');
    if (!open) return;
    const list = rows().map((r) => {
      const title = titleOf(r.id);
      return el(doc, 'li', { class: r.state, 'data-chapter': r.id },
        el(doc, 'span', { class: 'ch-num', text: r.numeral }),
        el(doc, 'div', {}, el(doc, 'div', { class: 'ch-name', text: title ? t(title.key, title.args || {}) : '' }), el(doc, 'span', { class: 'ch-state', text: t('chapter.chronicle.' + r.state) })),
        r.watchable ? el(doc, 'button', { type: 'button', class: 'mo-lift' + (r.state === 'now' || r.state === 'missed' ? ' ch-primary' : ''), 'data-replay': r.id, onclick: () => { api.close(); onReplay(r.id); } }, t(r.state === 'seen' ? 'chapter.chronicle.replay' : 'chapter.chronicle.watch')) : el(doc, 'span'));
    });
    menu.replaceChildren(el(doc, 'section', { class: 'ch-panel' },
      el(doc, 'div', { class: 'ch-eyebrow', text: t('chapter.ui.film', { seconds: filmSeconds }) }),
      el(doc, 'h2', { text: t('chapter.chronicle.title') }),
      el(doc, 'p', { text: t('chapter.chronicle.hint') }),
      el(doc, 'ul', { class: 'ch-rows' }, list),
      el(doc, 'div', { class: 'ch-foot' }, el(doc, 'button', { type: 'button', class: 'mo-lift', onclick: () => api.close() }, el(doc, 'kbd', { text: 'Esc' }), t('chapter.chronicle.close')))));
  }

  function onWindowKey(e) {
    if (e.code !== 'KeyC' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
    if (api.handleKey('KeyC')) e.preventDefault();
  }
  const win = doc.defaultView || globalThis;
  if (win.addEventListener) win.addEventListener('keydown', onWindowKey);
  const unsub = i18n.subscribe(render);

  const api = {
    get isOpen() { return open; },
    open() {
      if (open || !canOpen()) return;
      open = true; menu.hidden = false; render();
      const panel = menu.querySelector('.ch-panel');
      if (panel) { enter(panel, { from: 'scale', duration: MOTION.duration.slow }); stagger(menu.querySelectorAll('.ch-rows li'), { from: 'rise', delay: 60 }); }
      const b = menu.querySelector('button'); if (b) b.focus();
    },
    close() {
      if (!open) return;
      open = false;
      const panel = menu.querySelector('.ch-panel');
      const done = () => { if (!open) { menu.hidden = true; menu.replaceChildren(); } };
      if (panel) exit(panel, { to: 'scale' }).then(done); else done();
    },
    toggle() { if (open) api.close(); else api.open(); },
    /** C toggles, Escape closes. Returns true when the key was used. */
    handleKey(code) {
      if (code === 'KeyC') { api.toggle(); return true; }
      if (code === 'Escape' && open) { api.close(); return true; }
      return false;
    },
    render,
    destroy() { if (win.removeEventListener) win.removeEventListener('keydown', onWindowKey); unsub(); fab.remove(); menu.remove(); },
  };
  return api;
}
