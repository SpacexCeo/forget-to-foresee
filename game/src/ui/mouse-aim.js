// Mouse aim (owner 13.11, desktop): the mouse turns the camera with no button held, like a third-person action game.
// A click into the scene takes the pointer (pointer lock); a small crosshair marks the screen centre; the left button
// is the primary action (the strike, or the prompt's action when one is up), the right button the secondary (Lance).
// Holding Ctrl, or any open window, menu, chat or journal, gives the cursor back; letting Ctrl go (or closing the
// window) returns to aiming. Esc leaves pointer lock in the browser itself and the page may never see that key, so an
// unlock the game did not ask for is passed on as Esc (the menu still opens). "Classic mouse" (hold the right button
// to turn) stays as a setting (ui/settings-store.js mouseMode). Touch is unchanged.
// The pure parts (what a button does, when to hold the pointer, the aim point) are exported for node tests.

/** Camera turn per pixel in aim mode, relative to the classic drag (a free mouse travels much further than a drag). */
export const AIM_LOOK_SCALE = 0.5;
/** Metres ahead of the heroine, along the camera's ground direction, that the crosshair aims at. */
export const AIM_REACH = 8;

/** Windows and panels that need the cursor: while one is in the page the pointer is free. */
export const AIM_UI_SELECTOR = [
  'dialog[open]', '.gm', '.rpg-modal:not([hidden])', '.fj-back', '.mk2-wrap', '.ftf-quest-talk:not([hidden])', '.ftf-story-talk',
  '.ftf-quest-log', '.ftf-talk-pick:not([hidden])', '.npe-dim', '.npe-gl-wrap', '.npe-card-wrap', '.acct', '.cb', '.co', '.d1', '.d1-panel',
  '.d1-card', '.pc-wrap', '.ftf-prof', '.cup-wrap', '.sp-wrap', '.tw-wrap', '.ftf-xch', '.ep-wrap', '.pl-panel', '.ftf-replay',
].join(', ');

/**
 * The action of a mouse button while aiming, by the game's own input map: left = the strike (hotbar slot 1), or the
 * prompt's action (E) when a prompt is up; right = Lance (slot 2). The ids are ui/keybinds.js actions. Pure.
 * @param {number} button MouseEvent.button @param {{prompt?: boolean}} [s]
 * @returns {'strike'|'interact'|'lance'|null}
 */
export function mouseAction(button, { prompt = false } = {}) {
  if (button === 0) return prompt ? 'interact' : 'strike';
  if (button === 2) return 'lance';
  return null;
}

/** Whether the game should hold the pointer now. Pure. */
export function wantsLock({ mode = 'aim', touch = false, active = false, engaged = false, ctrl = false, uiOpen = false, focused = true } = {}) {
  return mode === 'aim' && !touch && !!active && !!engaged && !ctrl && !uiOpen && !!focused;
}

/**
 * Whether a lost pointer lock was the player's Esc: not the game's own release (Ctrl, a window), the page still has
 * the focus (not Alt+Tab), and no real Esc key event came with it (a browser that delivers the key needs no help). Pure.
 */
export function unlockMeansEscape({ byScript = false, focused = true, escAgoMs = Infinity } = {}) {
  return !byScript && !!focused && !(escAgoMs < 250);
}

/** The ground point the crosshair aims at: AIM_REACH metres from `pos` along the camera's ground direction (rig yaw). Pure. */
export function aimPoint(pos, yaw, reach = AIM_REACH) {
  return [pos[0] - Math.sin(yaw) * reach, pos[1], pos[2] - Math.cos(yaw) * reach];
}

/** True when the element under the screen centre belongs to a layer that covers the screen (a window nobody listed). */
function coveredAt(doc, win, target) {
  if (typeof doc.elementFromPoint !== 'function') return false;
  const w = win.innerWidth, h = win.innerHeight;
  let el = doc.elementFromPoint(w / 2, h / 2);
  if (!el || el === target) return false;
  for (; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && r.width >= w * 0.9 && r.height >= h * 0.9) return true;
  }
  return false;
}

/** Whether some window, panel or text field needs the cursor now. */
export function uiNeedsCursor(doc = globalThis.document, win = globalThis, target = null) {
  const a = doc.activeElement;
  if (a && a !== doc.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ''))) return true;
  if (doc.querySelector(AIM_UI_SELECTOR)) return true;
  return coveredAt(doc, win, target);
}

const CSS = `
.ftf-crosshair { position: fixed; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; pointer-events: none; z-index: 11; opacity: .9; }
.ftf-crosshair[hidden] { display: none; }
.ftf-crosshair::before, .ftf-crosshair::after { content: ""; position: absolute; left: 50%; top: 50%; background: #fff; box-shadow: 0 0 2px rgba(0, 0, 0, .9); }
.ftf-crosshair::before { width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; }
.ftf-crosshair::after { width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: none; border: 1px solid rgba(255, 255, 255, .55); box-sizing: border-box; }
`;

/**
 * @param {object} o
 * @param {HTMLElement} o.target the game canvas (it takes the pointer lock)
 * @param {object} o.input ui/input.js Input: `aimMode` and `lookLocked` are set on it
 * @param {() => string} o.mode 'aim' | 'classic' (the setting)
 * @param {() => boolean} o.touch touch controls are shown
 * @param {() => boolean} o.active the heroine is in the world
 * @param {() => boolean} [o.prompt] an interaction prompt is up
 * @param {(action: string, down: boolean, button: number) => void} o.onAction a mouse button's action went down / up
 * @param {() => void} o.onEscape the browser took Esc to leave the lock: do what Esc does
 */
export function createMouseAim({ target, input, doc = globalThis.document, win = globalThis, mode, touch, active, prompt = () => false, onAction, onEscape, now = () => performance.now() }) {
  if (!doc.getElementById('ftf-crosshair-css')) { const st = doc.createElement('style'); st.id = 'ftf-crosshair-css'; st.textContent = CSS; doc.head.append(st); }
  const cross = doc.createElement('div'); cross.className = 'ftf-crosshair'; cross.hidden = true; cross.setAttribute('aria-hidden', 'true'); doc.body.append(cross);
  let engaged = false, ctrl = false, locked = false, byScript = false, lastEsc = -1e9, tries = 0, nextTry = 0, escTimer = 0, wanted = false, uiOpen = false, uiAt = -1e9;
  const held = new Map(); // button -> action
  const on = () => mode() === 'aim' && !touch() && active();
  const focused = () => (typeof doc.hasFocus === 'function' ? doc.hasFocus() : true);
  const ui = (fresh = false) => { const t = now(); if (fresh || t - uiAt > 90) { uiAt = t; uiOpen = uiNeedsCursor(doc, win, target); } return uiOpen; };

  function lock() {
    if (typeof target.requestPointerLock !== 'function') return;
    tries++; nextTry = now() + 400;
    try { const p = target.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* refused (no gesture yet): the next click asks again */ }
  }
  function unlock() { if (doc.pointerLockElement === target) { byScript = true; try { doc.exitPointerLock(); } catch { /* */ } } }
  function releaseHeld() { for (const [b, a] of held) onAction(a, false, b); held.clear(); }

  const onLockChange = () => {
    const is = doc.pointerLockElement === target;
    if (is === locked) return;
    locked = is; input.lookLocked = locked; cross.hidden = !locked; doc.body.classList.toggle('ftf-aiming', locked);
    if (locked) { tries = 0; byScript = false; return; }
    releaseHeld();
    const esc = unlockMeansEscape({ byScript, focused: focused(), escAgoMs: now() - lastEsc });
    byScript = false;
    if (esc) escTimer = setTimeout(() => { escTimer = 0; onEscape(); }, 60); // a real Esc key event right behind the unlock cancels it
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && e.isTrusted) { lastEsc = now(); if (escTimer) { clearTimeout(escTimer); escTimer = 0; } }
    if (e.key === 'Control' || e.ctrlKey) { ctrl = true; if (locked) unlock(); }
  };
  const onKeyUp = (e) => { if (e.key === 'Control' || !e.ctrlKey) { const was = ctrl; ctrl = false; if (was) { tries = 0; sync(true); } } };
  const onBlur = () => { ctrl = false; releaseHeld(); };
  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || !on()) return;
    e.preventDefault();
    ctrl = !!e.ctrlKey;
    if (!locked) { if (!ctrl && !ui(true)) { engaged = true; tries = 0; lock(); } return; } // the click that takes the mouse is not an attack
    const a = mouseAction(e.button, { prompt: prompt() });
    if (!a || held.has(e.button)) return;
    held.set(e.button, a); onAction(a, true, e.button);
  };
  const onUp = (e) => { const a = held.get(e.button); if (a) { held.delete(e.button); onAction(a, false, e.button); } };

  /** Holds or frees the pointer by the state now (every frame; `fresh` re-reads the open windows at once). */
  function sync(fresh = false) {
    const aim = on();
    input.aimMode = aim;
    const want = wantsLock({ mode: aim ? 'aim' : 'classic', active: true, engaged, ctrl, uiOpen: aim && engaged ? ui(fresh) : false, focused: focused() });
    if (want && !wanted) tries = 0; // the window closed or Ctrl went up: ask again
    wanted = want;
    if (locked && !want) unlock();
    else if (!locked && want && tries < 3 && now() >= nextTry) lock();
  }

  doc.addEventListener('pointerlockchange', onLockChange);
  win.addEventListener('keydown', onKeyDown, true); win.addEventListener('keyup', onKeyUp, true); win.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onDown); win.addEventListener('pointerup', onUp, true);

  return {
    get locked() { return locked; },
    get engaged() { return engaged; },
    update: () => sync(false),
    /** Gives the cursor back until the next click into the scene (a cutscene, leaving the world). */
    release() { engaged = false; unlock(); },
    dispose() {
      unlock(); if (escTimer) clearTimeout(escTimer);
      doc.removeEventListener('pointerlockchange', onLockChange);
      win.removeEventListener('keydown', onKeyDown, true); win.removeEventListener('keyup', onKeyUp, true); win.removeEventListener('blur', onBlur);
      target.removeEventListener('pointerdown', onDown); win.removeEventListener('pointerup', onUp, true);
      cross.remove(); doc.body.classList.remove('ftf-aiming'); input.lookLocked = false; input.aimMode = false;
    },
  };
}
