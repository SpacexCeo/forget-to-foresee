// Browser standard mapping. Face button names describe position across controller families.
export const PAD = Object.freeze({
  interact: 0, cancel: 1, zoomIn: 4, zoomOut: 5, menu: 9, reset: 11,
  up: 12, down: 13, left: 14, right: 15,
});

const DEADZONE = 0.2;
const NAV_THRESHOLD = 0.55;
const MENU_DIRECTIONS = [PAD.up, PAD.down, PAD.left, PAD.right];

export function readGamepads() {
  try { return globalThis.navigator?.getGamepads?.() ?? []; }
  catch { return []; } // Embedded previews can deny the Gamepad API through permissions policy.
}

export function stickAxes(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const magnitude = Math.hypot(x, y);
  if (magnitude <= DEADZONE) return [0, 0];
  const scale = (Math.min(magnitude, 1) - DEADZONE) / ((1 - DEADZONE) * magnitude);
  return [x * scale, y * scale];
}

function menuDirection([x, y]) {
  if (Math.max(Math.abs(x), Math.abs(y)) < NAV_THRESHOLD) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? PAD.right : PAD.left;
  return y > 0 ? PAD.down : PAD.up;
}

export class GamepadInput {
  constructor() {
    this.index = null;
    this.clear();
  }

  // Re-arm after a neutral sample, so an input held across a transition cannot leak.
  clear() {
    this.armed = false;
    this.buttons = new Set();
    this.pressed = new Set();
    this.move = [0, 0];
    this.look = [0, 0];
    this.direction = null;
    this.navigation = null;
  }

  disconnect(index) {
    if (this.index !== index) return;
    this.index = null;
    this.clear();
  }

  poll(pads) {
    const standard = (pad) => pad?.connected && pad.mapping === 'standard';
    const pad = this.index === null ? null : pads[this.index];
    const current = standard(pad) ? pad : Array.from(pads).find(standard);
    const index = current?.index ?? null;
    if (index !== this.index) { this.clear(); this.index = index; }
    if (!current) return false;

    const move = stickAxes(current.axes[0], current.axes[1]);
    const look = stickAxes(current.axes[2], current.axes[3]);
    const buttons = new Set();
    current.buttons.forEach((button, i) => { if (button.pressed) buttons.add(i); });
    const active = Boolean(buttons.size || move.some(Boolean) || look.some(Boolean));
    if (!this.armed) {
      this.armed = !active;
      return false;
    }

    this.pressed = new Set([...buttons].filter((i) => !this.buttons.has(i)));
    this.buttons = buttons;
    this.move = [move[0], -move[1]];
    this.look = look;
    const direction = menuDirection(move);
    this.navigation = MENU_DIRECTIONS.find((i) => this.pressed.has(i))
      ?? (direction !== null && this.direction === null ? direction : null);
    this.direction = direction;
    return active;
  }

  down(button) { return this.buttons.has(button); }
  hit(button) { return this.pressed.has(button); }
}
