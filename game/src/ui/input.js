// World input. Mouse look uses right drag, so menus and keyboard focus need no pointer lock.
import { GamepadInput, readGamepads } from './gamepad.js';

const WORLD_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'F3',
  'KeyI', 'KeyM', 'KeyV', 'KeyT', 'KeyH', 'KeyL', 'KeyG', 'ShiftLeft', 'ShiftRight',
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
    target.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) pinch = spread(); } });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      const t = touches.get(e.pointerId);
      if (touches.size === 1) { this.dragX += e.clientX - t.x; this.dragY += e.clientY - t.y; }
      t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 2) { const d = spread(); if (pinch && Math.abs(d - pinch) > 24) { this.wheel += d > pinch ? -1 : 1; pinch = d; } }
    });
    const lift = (e) => { if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; } };
    target.addEventListener('pointerup', lift);
    target.addEventListener('pointercancel', lift);
    function spread() { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
    this.target = target;
  }

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
    this.endFrame();
  }

  down(...codes) { return codes.some((code) => this.keys.has(code)); }
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
