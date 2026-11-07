// Kinematic character controller on top of collision.js. Pure logic (no three.js), stepped at a
// fixed rate by the caller (30 Hz). Gameplay never reads render time, so frame rate cannot change
// where the character ends up.
import { moveCapsule, MASK_PLAYER } from './collision.js';

export const PHYSICS_HZ = 30;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export class CharacterController {
  constructor(world, { radius = 0.35, height = 1.75, walkSpeed = 2.2, gravity = 20, maxFall = 30, spawn = [0, 0, 0] } = {}) {
    this.world = world;
    this.radius = radius; this.height = height;
    this.walkSpeed = walkSpeed; this.gravity = gravity; this.maxFall = maxFall;
    this.spawn = spawn.slice();
    this.pos = spawn.slice();
    this.prevPos = spawn.slice();
    this.vy = 0;
    this.grounded = false;
    this.lastSubsteps = 0;
    this.heading = 0; // radians around Y, 0 = facing +Z
  }

  /**
   * One fixed step. `wish` is a horizontal direction [x, z] with length 0..1 (already camera-relative).
   * @returns the moveCapsule result
   */
  step(wish, dt = PHYSICS_DT) {
    this.prevPos = this.pos.slice();
    const l = Math.hypot(wish[0], wish[1]);
    const k = l > 1 ? 1 / l : 1;
    const hx = wish[0] * k * this.walkSpeed * dt, hz = wish[1] * k * this.walkSpeed * dt;
    let dy;
    if (this.grounded) {
      // Stick to the ground while walking down slopes; the solver lifts us back on flat ground.
      this.vy = 0;
      dy = -Math.max(0.02, Math.hypot(hx, hz));
    } else {
      this.vy = Math.max(this.vy - this.gravity * dt, -this.maxFall);
      dy = this.vy * dt;
    }
    const r = moveCapsule(this.world, this.pos, [hx, dy, hz], { radius: this.radius, height: this.height, mask: MASK_PLAYER });
    if (!this.grounded && r.grounded) this.vy = 0;
    this.pos = r.pos;
    this.grounded = r.grounded;
    this.lastSubsteps = r.substeps;
    if (l > 0.05) this.heading = Math.atan2(wish[0], wish[1]);
    if (this.pos[1] < -20) this.respawn();
    return r;
  }

  respawn() { this.pos = this.spawn.slice(); this.prevPos = this.spawn.slice(); this.vy = 0; this.grounded = false; }

  /** Interpolated render position between the last two fixed steps. */
  renderPos(alpha) {
    const a = this.prevPos, b = this.pos;
    return [a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha, a[2] + (b[2] - a[2]) * alpha];
  }
}

/** Steering toward a click-to-move target. Returns a wish vector [x, z] or null when arrived. */
export function steerTo(pos, target, arriveRadius = 0.15) {
  const dx = target[0] - pos[0], dz = target[2] - pos[2];
  const d = Math.hypot(dx, dz);
  if (d <= arriveRadius) return null;
  const slow = Math.min(1, d / 0.6);
  return [(dx / d) * slow, (dz / d) * slow];
}
