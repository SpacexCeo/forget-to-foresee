// World input. Mouse look uses right drag, so menus and keyboard focus need no pointer lock.
// Touch: tap = walk, drag = orbit, pinch = zoom, double-tap = run to the spot, plus a thumb-reachable
// run toggle button (docs/mobile.md). All three run sources feed one flag, `input.running`, which is
// also what `down('ShiftLeft', 'ShiftRight')` reports, so the gameplay loop needs no touch branch.
import { GamepadInput, readGamepads } from './gamepad.js';

const SHIFT = new Set(['ShiftLeft', 'ShiftRight']);

/**
 * Double-tap detector for "run to the spot": pure, so the thresholds are covered by node tests.
 * A tap counts as the second of a pair when it lands within `maxDelay` ms and `maxDist` px of the
 * previous tap; a third quick tap starts a new pair (no triple-tap bursts).
 */
export class TapRun {
  constructor({ maxDelay = 350, maxDist = 40 } = {}) { this.maxDelay = maxDelay; this.maxDist = maxDist; this.last = null; }
  /** @returns {boolean} true when this tap completes a double tap */
  tap(x, y, now) {
    const l = this.last;
    const double = !!l && now - l.t <= this.maxDelay && Math.hypot(x - l.x, y - l.y) <= this.maxDist;
    this.last = double ? null : { x, y, t: now };
    return double;
  }
  reset() { this.last = null; }
}

/** The run flag from its three sources (keyboard Shift, the touch toggle, a double-tap burst). */
export const runFlag = ({ shift = false, toggle = false, burst = false } = {}) => !!(shift || toggle || burst);

/** True when the page should show touch controls: a coarse primary pointer, or a touch already seen. */
export function wantsTouchControls({ coarse = false, touchSeen = false } = {}) { return !!(coarse || touchSeen); }

const RUN_TOGGLE_CSS = `
.ftf-run-toggle { position: fixed; right: calc(8px + env(safe-area-inset-right, 0px)); bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  width: 52px; height: 52px; padding: 0; border-radius: 50%; border: 1.5px solid rgba(214, 190, 134, 0.75);
  background: rgba(14, 22, 24, 0.62); color: #e6d6ad; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); cursor: pointer;
  display: none; align-items: center; justify-content: center; z-index: 12; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
body.in-world .ftf-run-toggle.ftf-run-toggle--on { display: flex; }
.ftf-run-toggle svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ftf-run-toggle[aria-pressed="true"] { background: rgba(217, 164, 65, 0.85); border-color: #fbe6a6; color: #1d1708; box-shadow: 0 0 0 3px rgba(251, 230, 166, 0.25), 0 4px 14px rgba(0, 0, 0, 0.35); }
.ftf-run-toggle:focus-visible { outline: 2px solid #fbe6a6; outline-offset: 2px; }
@media (max-width: 700px) and (max-height: 440px) { .ftf-run-toggle { bottom: calc(84px + env(safe-area-inset-bottom, 0px)); } }
`;
// A running figure (stroke icon; no text, so it needs no locale).
const RUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14.5" cy="4.5" r="1.6"/><path d="M9 20l2.5-5.5L9 12l1.5-4.5 3.5 1 2.5 3 2.5 1M10.5 7.5L7 9l-1 3.5M11.5 14.5L15 16l1.5 4.5"/></svg>';

/**
 * Mounts the run toggle button (bottom right, 52 px, above the mobile dialogue bar and beside the gold
 * prompt pill; docs/mobile.md). It appears only on touch devices (coarse pointer, or once a touch is
 * seen) and only in the world (`body.in-world`). Returns null when there is no DOM to mount into.
 */
export function mountRunToggle(input, doc = globalThis.document) {
  if (!doc || !doc.body || typeof doc.createElement !== 'function') return null;
  if (!doc.getElementById('ftf-run-toggle-style')) {
    const style = doc.createElement('style'); style.id = 'ftf-run-toggle-style'; style.textContent = RUN_TOGGLE_CSS;
    doc.head?.appendChild(style);
  }
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'ftf-run-toggle'; btn.innerHTML = RUN_ICON;
  btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Run'); btn.title = 'Run (Shift)';
  const sync = () => { btn.setAttribute('aria-pressed', String(input.runToggle)); btn.classList.toggle('ftf-run-toggle--on', input.touchControls); };
  btn.addEventListener('click', () => { input.setRunToggle(!input.runToggle); btn.blur(); });
  // Keep the canvas from receiving the tap as a walk order.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.onRunChange(sync);
  sync();
  doc.body.appendChild(btn);
  return btn;
}

const WORLD_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyQ', 'KeyK', 'F3',
  'KeyI', 'KeyM', 'KeyV', 'KeyT', 'KeyH', 'KeyL', 'KeyG', 'KeyN', 'ShiftLeft', 'ShiftRight',
  ...Array.from({ length: 9 }, (_, i) => 'Digit' + (i + 1)),
  'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
]);

export class Input {
  constructor(target) {
    this.keys = new Set();
    this.pressed = new Set();
    this.clicks = [];
    this.pad = new GamepadInput();
    this.device = 'keyboard';
    this.suspended = false;
    this.runToggle = false; // the touch run button (sticky)
    this.runBurst = false; // double-tap: run to that spot until the next single tap
    this.touchControls = false; // show touch-only controls (coarse pointer or a touch seen)
    this.runListeners = new Set();
    this.tapRun = new TapRun();
    this.endFrame();

    window.addEventListener('keydown', (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open]')) {
        if (e.code === 'Escape' && e.repeat) e.preventDefault();
        this.device = 'keyboard';
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (['Tab', 'Enter', 'Space'].includes(e.code)) this.device = 'keyboard';
      if (!WORLD_KEYS.has(e.code)) return;
      e.preventDefault();
      if (e.repeat && !this.keys.has(e.code)) return;
      this.device = 'keyboard';
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.suspended = true; this.clear(); });
    window.addEventListener('focus', () => { this.suspended = false; });
    document.addEventListener('visibilitychange', () => this.clear());
    window.addEventListener('gamepaddisconnected', (e) => {
      this.pad.disconnect(e.gamepad.index);
      if (this.pad.index === null) this.device = 'keyboard';
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => { this.device = 'keyboard'; });
    target.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.dragPointer = e.pointerId;
        target.setPointerCapture(e.pointerId);
      }
      if (e.button === 0 && e.isPrimary) this.downAt = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    // Mouse hover over the canvas (aiming a cast beyond the town walls); null while away or on touch.
    this.hover = null;
    target.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { if (!this.hover) this.hover = { x: 0, y: 0 }; this.hover.x = e.clientX; this.hover.y = e.clientY; } });
    target.addEventListener('pointerleave', () => { this.hover = null; });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragPointer) return;
      this.device = 'keyboard';
      this.dragX += e.movementX;
      this.dragY += e.movementY;
    });
    target.addEventListener('pointerup', (e) => {
      if (e.button === 2 && e.pointerId === this.dragPointer) this.dragPointer = null;
      if (e.button !== 0 || e.pointerId !== this.downAt?.id) return;
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 6) this.clicks.push({ x: e.clientX, y: e.clientY });
      this.downAt = null;
    });
    const cancelPointer = (e) => {
      if (e.pointerId === this.dragPointer) this.dragPointer = null;
      if (e.pointerId === this.downAt?.id) this.downAt = null;
    };
    target.addEventListener('pointercancel', cancelPointer);
    target.addEventListener('lostpointercapture', cancelPointer);
    target.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      this.device = 'keyboard';
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    // Touch (phones/tablets): tap = walk there (the click path above), one-finger drag = orbit the camera,
    // two-finger pinch = zoom. Pointer events give every finger its own pointerId.
    if (target.style) target.style.touchAction = 'none';
    const touches = this.touches = new Map();
    let pinch = 0;
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) pinch = spread();
      if (!this.touchControls) this.setTouchControls(true);
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      const t = touches.get(e.pointerId);
      if (touches.size === 1) { this.dragX += e.clientX - t.x; this.dragY += e.clientY - t.y; }
      t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 2) { const d = spread(); if (pinch && Math.abs(d - pinch) > 24) { this.wheel += d > pinch ? -1 : 1; pinch = d; } }
    });
    const lift = (e) => { if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; } };
    // A tap (a click without a drag, see pointerup above) that repeats quickly on the same spot runs there;
    // the next single tap walks again. Keyboard and mouse never set the burst.
    target.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || e.button !== 0) return;
      const tapped = this.clicks.length && this.clicks[this.clicks.length - 1].x === e.clientX && this.clicks[this.clicks.length - 1].y === e.clientY;
      if (!tapped) { this.tapRun.reset(); return; }
      const burst = this.tapRun.tap(e.clientX, e.clientY, e.timeStamp || Date.now());
      if (burst !== this.runBurst) { this.runBurst = burst; this.emitRun(); }
    });
    target.addEventListener('pointerup', lift);
    target.addEventListener('pointercancel', lift);
    function spread() { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
    this.target = target;
    let coarse = false;
    try { coarse = globalThis.matchMedia?.('(pointer: coarse)').matches || false; } catch { /* no media queries (tests) */ }
    this.touchControls = wantsTouchControls({ coarse });
    this.runButton = mountRunToggle(this);
  }

  /** Run flag from every source; `down('ShiftLeft', 'ShiftRight')` reports the same value. */
  get running() { return runFlag({ shift: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), toggle: this.runToggle, burst: this.runBurst }); }

  /** The touch run button: sticky until tapped again. */
  setRunToggle(on) { on = !!on; if (on === this.runToggle) return; this.runToggle = on; this.emitRun(); }
  setTouchControls(on) { on = !!on; if (on === this.touchControls) return; this.touchControls = on; this.emitRun(); }
  onRunChange(fn) { this.runListeners.add(fn); return () => this.runListeners.delete(fn); }
  emitRun() { for (const fn of this.runListeners) fn(this.running, this); }

  poll() {
    if (this.suspended || document.hidden) return;
    const wasConnected = this.pad.index !== null;
    const { move, look } = this.pad;
    const active = this.pad.poll(readGamepads());
    const changed = (before, after) => Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.15
      || (!before.some(Boolean) && after.some(Boolean));
    if (active && (this.pad.pressed.size || changed(move, this.pad.move) || changed(look, this.pad.look))) {
      this.device = 'gamepad';
    } else if (wasConnected && this.pad.index === null) this.device = 'keyboard';
  }

  clear() {
    if (this.dragPointer != null && this.target.hasPointerCapture(this.dragPointer)) {
      this.target.releasePointerCapture(this.dragPointer);
    }
    this.dragPointer = null;
    this.downAt = null;
    this.keys.clear();
    this.touches?.clear();
    this.pad.clear();
    this.tapRun?.reset();
    if (this.runBurst) { this.runBurst = false; this.emitRun(); }
    this.endFrame();
  }

  /** Held keys; a Shift query also reports the touch run toggle / burst (same flag, see `running`). */
  down(...codes) { return codes.some((code) => this.keys.has(code)) || ((this.runToggle || this.runBurst) && codes.some((code) => SHIFT.has(code))); }
  hit(code) { return this.pressed.has(code); }

  /** Movement as [right, forward], with unit diagonals and analog magnitude preserved. */
  moveAxes() {
    const x = Number(this.down('KeyD')) - Number(this.down('KeyA'));
    const y = Number(this.down('KeyW')) - Number(this.down('KeyS'));
    const magnitude = Math.hypot(x, y);
    return magnitude ? [x / magnitude, y / magnitude] : this.pad.move;
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
    this.wheel = 0;
    this.dragX = 0;
    this.dragY = 0;
  }
}
