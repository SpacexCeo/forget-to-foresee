// "Press F11 for fullscreen" (owner 14.11): on a desktop that is not in fullscreen, a small quiet line at the top of the
// screen; a click on it asks the browser for fullscreen, × hides it for this session. It goes away in fullscreen (F11,
// the API, or a window that fills the screen) and comes back when the player leaves it. Never on phones and tablets,
// never over the loading screen or a first-time film / dialogue, never on capture, film, cinematic or replay links.
// Plain DOM, no three.js: main.js loads it with import() once the town is on screen.

export const FS_HINT_OFF = 'ftf.fs.hint.off';

/** Whether this device and link may ever show the hint. Pure. */
export function fsHintAllowed({ coarse = false, mobileUa = false, params = null } = {}) {
  if (coarse || mobileUa) return false; // a touch laptop with a mouse (a fine pointer) still gets it
  const g = (k) => (params && typeof params.get === 'function' ? params.get(k) : null);
  if (g('capture') != null || g('cinematic') != null || g('film') != null || g('replay') != null || g('fs') === '0') return false;
  return true;
}

/** Whether the page fills the screen now: the Fullscreen API, the display mode, or F11 (the window is the screen). Pure. */
export function isFullscreen({ fsElement = null, displayFull = false, inner = [0, 0], screen = [0, 0] } = {}) {
  if (fsElement || displayFull) return true;
  return screen[0] > 0 && Math.abs(inner[0] - screen[0]) <= 2 && Math.abs(inner[1] - screen[1]) <= 2;
}

/** How long the line stays up (ms of being shown) before it hides itself until the player leaves fullscreen again. */
export const FS_HINT_SHOW_MS = 8000;

/**
 * Whether the line shows this moment. Pure. expired: it has been up FS_HINT_SHOW_MS already; combat: a target frame is
 * on screen (the enemy's HP bar sits at the top centre, right under the hint: playtest 14.11).
 */
export function fsHintVisible({ allowed, dismissed, full, booting, busy, expired = false, combat = false }) {
  return !!allowed && !dismissed && !full && !booting && !busy && !expired && !combat;
}

const CSS = `
.ftf-fs-hint { position: fixed; top: 6px; left: 50%; transform: translateX(-50%); z-index: 12; display: flex; align-items: center; gap: 2px;
  font: 500 12px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; color: rgba(238, 240, 234, .78); background: rgba(6, 12, 12, .42);
  border: 1px solid rgba(238, 240, 234, .14); border-radius: 13px; padding: 0 2px 0 0; pointer-events: auto; user-select: none; }
.ftf-fs-hint[hidden] { display: none; }
.ftf-fs-hint button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 12px; }
.ftf-fs-hint button:hover, .ftf-fs-hint button:focus-visible { color: #fff; background: rgba(238, 240, 234, .1); }
.ftf-fs-hint .ftf-fs-x { padding: 6px 8px; opacity: .7; }
.ftf-fs-hint kbd { font: inherit; border: 1px solid rgba(238, 240, 234, .35); border-radius: 4px; padding: 1px 4px; margin: 0 1px; }
`;

/**
 * @param {object} o
 * @param {(k: string) => string} o.t
 * @param {URLSearchParams} [o.params]
 * @param {() => boolean} [o.busy] a first-time overlay (film, dialogue, name card) owns the screen
 * @returns {{update(): void, dispose(): void, el: HTMLElement} | null}
 */
export function mountFullscreenHint({ t, params = null, busy = () => false, doc = globalThis.document, win = globalThis.window, storage = null }) {
  const mm = (q) => { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch { return false; } };
  const nav = win.navigator || {};
  const allowed = fsHintAllowed({ coarse: mm('(pointer: coarse)') && !mm('(any-pointer: fine)'), mobileUa: /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || ''), params });
  if (!allowed) return null;
  const ss = storage || (() => { try { return win.sessionStorage; } catch { return null; } })();
  let dismissed = false;
  try { dismissed = !!(ss && ss.getItem(FS_HINT_OFF)); } catch { /* */ }
  if (!doc.getElementById('ftf-fs-hint-css')) { const st = doc.createElement('style'); st.id = 'ftf-fs-hint-css'; st.textContent = CSS; doc.head.append(st); }
  const el = doc.createElement('div'); el.className = 'ftf-fs-hint'; el.hidden = true; el.setAttribute('role', 'note');
  const go = doc.createElement('button'); go.type = 'button';
  // "Press F11 for fullscreen" with the key drawn as a key cap
  const text = t('fs.hint'); const at = text.indexOf('F11');
  if (at >= 0) { go.append(text.slice(0, at)); const k = doc.createElement('kbd'); k.textContent = 'F11'; go.append(k, text.slice(at + 3)); } else go.textContent = text;
  go.title = t('fs.hint.click');
  const x = doc.createElement('button'); x.type = 'button'; x.className = 'ftf-fs-x'; x.textContent = '×'; x.setAttribute('aria-label', t('fs.hint.close')); x.title = t('fs.hint.close');
  el.append(go, x); doc.body.append(el);

  const full = () => isFullscreen({ fsElement: doc.fullscreenElement || doc.webkitFullscreenElement || null, displayFull: mm('(display-mode: fullscreen)'),
    inner: [win.innerWidth, win.innerHeight], screen: [(win.screen && win.screen.width) || 0, (win.screen && win.screen.height) || 0] });
  let shownMs = 0, lastAt = 0, wasFull = false;
  const combat = () => { try { return !!doc.querySelector('.rpg-target:not([hidden])'); } catch { return false; } };
  const update = () => {
    const now = Date.now(), isFull = full();
    if (wasFull && !isFull) shownMs = 0; // left fullscreen: the reminder gets its few seconds again
    wasFull = isFull;
    if (!el.hidden && lastAt) shownMs += now - lastAt;
    lastAt = now;
    el.hidden = !fsHintVisible({ allowed, dismissed, full: isFull, booting: !!doc.getElementById('boot'), busy: !!busy(), expired: shownMs >= FS_HINT_SHOW_MS, combat: combat() });
  };
  go.addEventListener('click', () => {
    const r = doc.documentElement;
    try { const p = (r.requestFullscreen || r.webkitRequestFullscreen).call(r, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch { /* the browser said no: F11 still works */ }
    setTimeout(update, 300);
  });
  x.addEventListener('click', () => { dismissed = true; try { if (ss) ss.setItem(FS_HINT_OFF, '1'); } catch { /* */ } update(); });
  const onChange = () => update();
  doc.addEventListener('fullscreenchange', onChange); win.addEventListener('resize', onChange);
  const timer = setInterval(update, 500); // the overlays (and the target frame) come and go without events of their own
  update();
  return {
    el, update,
    dispose() { clearInterval(timer); doc.removeEventListener('fullscreenchange', onChange); win.removeEventListener('resize', onChange); el.remove(); },
  };
}
