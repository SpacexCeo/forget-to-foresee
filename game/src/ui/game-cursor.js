// The game's own mouse cursor (owner 14.11, cursor pack v2: docs/art/requests/in/ui/cursors_v2). Nine 32x32 states,
// each with a 12-frame press strip (12 fps, one second: the icon dips to 84 % about its hotspot and comes back). The
// system pointer is hidden and a 32x32 element follows the mouse, because animated images as a CSS `cursor` differ
// between browsers (the pack's README). The state comes from what is under the mouse: an explicit `data-cursor`, a
// disabled control (forbidden), a button or link (link), a text field (interact); over the 3D scene the game says it
// (sceneState: grab while the camera turns, attack on a locked target); the town prompt carries talk / interact. The loading
// screen shows the loading ring. Mouse aim's pointer lock hides it (its crosshair stays). Touch devices keep no cursor;
// reduced motion keeps the icons still. Behind the `gameCursor` flag (game/public/features.json).

export const CURSOR_BASE = 'assets/ui/game-cursor/';
/** Hotspots in pixels from the top-left of the 32x32 icon (manifest-v2.json). */
export const CURSORS = Object.freeze({
  default: [2, 2], link: [2, 2], interact: [15, 2], talk: [15, 2], pickup: [16, 13],
  grab: [16, 15], attack: [23, 4], forbidden: [16, 16], loading: [16, 16],
});
export const PRESS = Object.freeze({ frames: 12, ms: 1000 });

/**
 * The cursor state for the element under the mouse. Pure over a DOM-like node (closest()). `scene` answers for the
 * game canvas (null = default); `booting` while the loading screen is up.
 */
export function cursorFor(node, { scene = null, booting = false, canvas = null } = {}) {
  const near = (sel) => (node && typeof node.closest === 'function' ? node.closest(sel) : null);
  const explicit = near('[data-cursor]');
  if (explicit && CURSORS[explicit.dataset.cursor]) return explicit.dataset.cursor;
  if (near('[disabled], [aria-disabled="true"]')) return 'forbidden';
  if (near('input, textarea, select, [contenteditable="true"]')) return 'interact';
  if (near('a[href], button, [role="button"], [role="tab"], summary, label')) return 'link';
  if (booting) return 'loading';
  if (canvas && node === canvas) return CURSORS[scene] ? scene : 'default';
  return 'default';
}

const CSS = `
html.ftf-gc-on.ftf-gc-live, html.ftf-gc-on.ftf-gc-live * { cursor: none !important; }
/* the custom cursor is not drawn (no mouse move yet, after leaving the window, a fullscreen switch): the system pointer
   shows, even under a film overlay that hides the cursor, so a button can always be found (owner 14.11) */
html.ftf-gc-on:not(.ftf-gc-live) button, html.ftf-gc-on:not(.ftf-gc-live) #boot, html.ftf-gc-on:not(.ftf-gc-live) #boot * { cursor: default !important; }
.ftf-gc { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 32px; height: 32px; overflow: hidden; pointer-events: none; contain: strict;
  transform: translate3d(calc(var(--gc-x, -64px) - var(--gc-hx, 2px)), calc(var(--gc-y, -64px) - var(--gc-hy, 2px)), 0); will-change: transform; }
.ftf-gc[hidden] { display: none; }
.ftf-gc i { display: block; width: 32px; height: 32px; background: var(--gc-img) 0 0 / 32px 32px no-repeat; }
.ftf-gc.press i { background: var(--gc-strip) 0 0 / 384px 32px no-repeat; animation: ftf-gc-press 1s steps(12) 1 both; }
.ftf-gc[data-state="loading"] i { animation: ftf-gc-spin .9s linear infinite; transform-origin: 16px 16px; }
@keyframes ftf-gc-press { from { background-position: 0 0; } to { background-position: -384px 0; } }
@keyframes ftf-gc-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ftf-gc i, .ftf-gc.press i, .ftf-gc[data-state="loading"] i { animation: none !important; background: var(--gc-img) 0 0 / 32px 32px no-repeat; } }
@media (pointer: coarse) and (not (any-pointer: fine)) { html.ftf-gc-on, html.ftf-gc-on * { cursor: auto !important; } .ftf-gc { display: none !important; } }
`;

/**
 * @param {object} o
 * @param {string} o.base the page's base URL (import.meta.env.BASE_URL)
 * @param {() => (string|null)} [o.sceneState] the state over the game canvas
 * @param {() => (Element|null)} [o.canvas] the game canvas (it may arrive after the cursor)
 * @returns {{set(state: string): void, press(): void, destroy(): void, readonly state: string} | null}
 */
export function installGameCursor({ base = '/', sceneState = () => null, canvas = () => null, doc = globalThis.document, win = globalThis.window }) {
  const mm = (q) => { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch { return false; } };
  if (!mm('(any-pointer: fine)')) return null; // phones and tablets: no mouse, no cursor
  if (!doc.getElementById('ftf-gc-css')) { const st = doc.createElement('style'); st.id = 'ftf-gc-css'; st.textContent = CSS; doc.head.append(st); }
  // the eighteen small files load once, so the first hover or press never shows an empty square
  for (const n of Object.keys(CURSORS)) for (const f of [`cursor_${n}.png`, `cursor_${n}_frames.png`]) { const im = new win.Image(); im.src = base + CURSOR_BASE + f; }
  const host = doc.createElement('div'); host.className = 'ftf-gc'; host.hidden = true; host.setAttribute('aria-hidden', 'true');
  host.append(doc.createElement('i')); doc.body.append(host);
  // the system pointer is hidden only while our element is actually drawn (ftf-gc-live)
  const show = (on) => { host.hidden = !on; doc.documentElement.classList.toggle('ftf-gc-live', !!on); };
  doc.documentElement.classList.add('ftf-gc-on');
  let state = '', over = null, pressT = 0, x = -64, y = -64;
  const set = (next) => {
    if (!CURSORS[next]) next = 'default';
    if (next === state) return;
    state = next; const [hx, hy] = CURSORS[next];
    host.dataset.state = next;
    host.style.setProperty('--gc-img', `url("${base}${CURSOR_BASE}cursor_${next}.png")`);
    host.style.setProperty('--gc-strip', `url("${base}${CURSOR_BASE}cursor_${next}_frames.png")`);
    host.style.setProperty('--gc-hx', hx + 'px'); host.style.setProperty('--gc-hy', hy + 'px');
  };
  const topModal = () => { try { return doc.querySelector('dialog:modal'); } catch { return doc.querySelector('dialog[open]'); } };
  const locked = () => !!doc.pointerLockElement;   // mouse aim: the crosshair is the cursor
  const refresh = () => set(cursorFor(over, { scene: sceneState(), booting: !!doc.getElementById('boot'), canvas: canvas() }));
  const move = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') { show(false); return; }
    x = e.clientX; y = e.clientY; over = e.target;
    // a modal <dialog> (the menu, Settings) sits in the browser's top layer, above any z-index: our element would hide
    // under it, so over an open modal the system pointer comes back (owner 14.11: "the cursor does not work in the menu")
    const modal = topModal();
    doc.documentElement.classList.toggle('ftf-gc-on', !modal);
    show(!locked() && !modal);
    host.style.setProperty('--gc-x', x + 'px'); host.style.setProperty('--gc-y', y + 'px');
    refresh();
  };
  const press = () => {
    clearTimeout(pressT);
    host.classList.remove('press'); void host.offsetWidth; host.classList.add('press');
    pressT = setTimeout(() => host.classList.remove('press'), PRESS.ms);
  };
  const down = (e) => { if (!e.pointerType || e.pointerType === 'mouse') press(); };
  const leave = () => { show(false); };
  const lockChange = () => { show(!locked() && x >= 0); };
  // the scene changes under a still mouse (a prompt appears, the camera starts turning): read it again ten times a second
  const timer = setInterval(() => { if (!host.hidden && over && over === canvas()) refresh(); }, 100);
  doc.addEventListener('pointermove', move, { passive: true, capture: true });
  doc.addEventListener('pointerdown', down, { passive: true, capture: true });
  doc.addEventListener('pointerlockchange', lockChange);
  doc.documentElement.addEventListener('mouseleave', leave);
  set(doc.getElementById('boot') ? 'loading' : 'default');
  return {
    get state() { return state; },
    set, press,
    destroy() {
      clearTimeout(pressT); clearInterval(timer);
      doc.removeEventListener('pointermove', move, { capture: true }); doc.removeEventListener('pointerdown', down, { capture: true });
      doc.removeEventListener('pointerlockchange', lockChange); doc.documentElement.removeEventListener('mouseleave', leave);
      doc.documentElement.classList.remove('ftf-gc-on', 'ftf-gc-live'); host.remove();
    },
  };
}
