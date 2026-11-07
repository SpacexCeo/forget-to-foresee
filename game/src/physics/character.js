// Kinematic character controller on top of collision.js. Pure logic (no three.js), stepped at a
// fixed rate by the caller (30 Hz). Gameplay never reads render time, so frame rate cannot change
// where the character ends up.
import { moveCapsule, rayCast, MASK_PLAYER } from './collision.js';

export const PHYSICS_HZ = 30;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export class CharacterController {
  constructor(world, { radius = 0.35, height = 1.75, walkSpeed = 2.2, gravity = 20, maxFall = 30, spawn = [0, 0, 0], killY = -20 } = {}) {
    this.world = world;
    this.radius = radius; this.height = height;
    this.walkSpeed = walkSpeed; this.gravity = gravity; this.maxFall = maxFall;
    // Optional smoothing (off by default so the collision tests stay exact): `accel` is the response rate
    // (1/s) of the horizontal velocity toward the wish; `run` scales the speed (Shift = run in the client).
    this.accel = Infinity; this.run = false; this.runMultiplier = 2.1; this.vel = [0, 0];
    this.spawn = spawn.slice();
    this.killY = killY;
    this.lastSafe = spawn.slice();   // last position standing on solid ground with the center supported
    this.respawns = 0;
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
    const speed = this.walkSpeed * (this.run ? this.runMultiplier : 1);
    const tx = wish[0] * k * speed, tz = wish[1] * k * speed;
    if (Number.isFinite(this.accel)) {
      const a = 1 - Math.exp(-this.accel * dt);
      this.vel[0] += (tx - this.vel[0]) * a; this.vel[1] += (tz - this.vel[1]) * a;
      if (!tx && !tz && Math.hypot(this.vel[0], this.vel[1]) < 0.02) this.vel = [0, 0];
    } else this.vel = [tx, tz];
    const hx = this.vel[0] * dt, hz = this.vel[1] * dt;
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
    if (this.grounded && r.groundNormal && r.groundNormal[1] > 0.9) {
      // Only remember spots where the capsule center itself is over walkable ground (not an edge).
      const hit = rayCast(this.world, [this.pos[0], this.pos[1] + 0.5, this.pos[2]], [0, -1, 0], 0.8, MASK_PLAYER);
      if (hit && hit.normal[1] > 0.9) this.lastSafe = [this.pos[0], hit.point[1], this.pos[2]];
    }
    if (this.pos[1] < this.killY) this.respawn();
    return r;
  }

  /** Falling off the archipelago puts the player back at the last safe point. */
  respawn() { this.pos = this.lastSafe.slice(); this.prevPos = this.pos.slice(); this.vy = 0; this.grounded = false; this.respawns++; }

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
