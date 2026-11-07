// Keyboard and mouse input. Every action has a keyboard path (spec 5): WASD move, arrows rotate
// and zoom, E context, Esc leaves inspection, F3 dev HUD. Mouse: left click to move, right drag to
// rotate, wheel to zoom.
export class Input {
  constructor(target) {
    this.keys = new Set();
    this.pressed = new Set();      // keys pressed since the last frame (edge-triggered)
    this.clicks = [];              // left clicks {x, y} in client pixels
    this.wheel = 0;
    this.dragX = 0; this.dragY = 0;
    this.dragging = false;
    let downAt = null;
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.code === 'F3' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.dragging = true; target.setPointerCapture(e.pointerId); }
      if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
    });
    target.addEventListener('pointermove', (e) => { if (this.dragging) { this.dragX += e.movementX; this.dragY += e.movementY; } });
    target.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.dragging = false;
      if (e.button === 0 && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) this.clicks.push({ x: e.clientX, y: e.clientY });
      downAt = null;
    });
    target.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  /** WASD as [right, forward] in -1..1. */
  moveAxes() {
    const x = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    const y = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    return [x, y];
  }

  /** Call once at the end of every frame. */
  endFrame() { this.pressed.clear(); this.clicks.length = 0; this.wheel = 0; this.dragX = 0; this.dragY = 0; }
}
