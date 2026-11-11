// Kinematic character controller on top of collision.js. Pure logic (no three.js), stepped at a
// fixed rate by the caller (30 Hz). Gameplay never reads render time, so frame rate cannot change
// where the character ends up.
//
// Two modes. `smooth = false` (default, exact): the velocity is the wish times the speed, the heading
// snaps; the collision tests pin this path. `smooth = true` (the client): the locomotion model in
// motion.js (speed-dependent acceleration and braking, a turn rate limited by speed, no instant
// 180° flips), plus step climbing, ground snapping on steps and slopes, ledge support at edges and
// velocity bleed against walls. The swept capsule and its no-tunneling guarantee are the same in both.
import { moveCapsule, rayCast, MASK_PLAYER } from './collision.js';
import { DEFAULT_MOTION, stepMotion, wrapAngle } from './motion.js';

export const PHYSICS_HZ = 30;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export class CharacterController {
  constructor(world, { radius = 0.35, height = 1.75, walkSpeed = 2.2, gravity = 20, maxFall = 30, spawn = [0, 0, 0], killY = -20, stepHeight = 0.35, motion = DEFAULT_MOTION } = {}) {
    this.world = world;
    this.radius = radius; this.height = height;
    this.walkSpeed = walkSpeed; this.gravity = gravity; this.maxFall = maxFall;
    this.stepHeight = stepHeight;
    this.motion = motion;
    this.smooth = false;
    // Legacy smoothing knob: a finite `accel` (1/s response rate) used to select exponential velocity
    // smoothing. Setting it now turns the full locomotion model on; Infinity keeps the exact mode.
    this._accel = Infinity;
    this.run = false; this.runMultiplier = 1.94; this.vel = [0, 0];   // run 3.3 m/s (owner 09.11): Iris's run clip speed
    this.spawn = spawn.slice();
    this.killY = killY;
    this.lastSafe = spawn.slice();   // last position standing on solid ground with the center supported
    this.respawns = 0;
    this.pos = spawn.slice();
    this.prevPos = spawn.slice();
    this.vy = 0;
    this.grounded = false;
    this.lastSubsteps = 0;
    this.lastHitWall = false;
    this.heading = 0; // radians around Y, 0 = facing +Z
    this.prevHeading = 0;
    this.speed = 0;       // actual horizontal ground speed of the last step (m/s), after collisions
    this.turnRate = 0;    // rad/s of the last step
    this.stepped = false; // the last step climbed a step
    this.settled = null;  // position written by the last smooth step (an outside write is a teleport)
  }

  get accel() { return this._accel; }
  set accel(v) { this._accel = v; this.smooth = Number.isFinite(v); }

  /** Top speed for the current run flag. */
  get maxSpeed() { return this.walkSpeed * (this.run ? this.runMultiplier : 1); }

  /**
   * One fixed step. `wish` is a horizontal direction [x, z] with length 0..1 (already camera-relative).
   * @returns the moveCapsule result
   */
  step(wish, dt = PHYSICS_DT) {
    this.prevPos = this.pos.slice();
    this.prevHeading = this.heading;
    if (this.smooth) return this.stepSmooth(wish, dt);
    const l = Math.hypot(wish[0], wish[1]);
    const k = l > 1 ? 1 / l : 1;
    const speed = this.maxSpeed;
    this.vel = [wish[0] * k * speed, wish[1] * k * speed];
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
    this.lastHitWall = r.hitWall;
    if (l > 0.05) this.heading = Math.atan2(wish[0], wish[1]);
    this.speed = Math.hypot(this.pos[0] - this.prevPos[0], this.pos[2] - this.prevPos[2]) / dt;
    this.turnRate = wrapAngle(this.heading - this.prevHeading) / dt;
    this.rememberSafe(r);
    if (this.pos[1] < this.killY) this.respawn();
    return r;
  }

  /** The locomotion model: see motion.js and docs/movement.md. */
  stepSmooth(wish, dt) {
    // An external position write (fly into a Shell, relocate) is a teleport: arrive at rest, no leftover momentum.
    const s = this.settled;
    if (s && (s[0] !== this.pos[0] || s[1] !== this.pos[1] || s[2] !== this.pos[2])) { this.vel = [0, 0]; this.speed = 0; this.prevHeading = this.heading; }
    const opts = { radius: this.radius, height: this.height, mask: MASK_PLAYER, ledgeGrip: this.radius * 0.7 };
    const m = { vel: this.vel, heading: this.heading };
    const res = stepMotion(m, wish, this.maxSpeed, dt, this.motion, this.grounded);
    this.vel = m.vel; this.heading = m.heading; this.turnRate = res.turnRate;
    const hx = this.vel[0] * dt, hz = this.vel[1] * dt;
    let dy;
    if (this.grounded) {
      // Ground snap: probe down a full step height so steps and slopes never leave the feet floating
      // (rims beyond the ledge grip do not count as ground, so walking off an edge still falls).
      this.vy = 0;
      dy = -Math.max(this.stepHeight, Math.hypot(hx, hz));
    } else {
      this.vy = Math.max(this.vy - this.gravity * dt, -this.maxFall);
      dy = this.vy * dt;
    }
    let r = moveCapsule(this.world, this.pos, [hx, dy, hz], opts);
    this.stepped = false;
    if (this.grounded && r.hitWall && (hx || hz)) {
      // Step climbing: up, across, down. Accepted only when it lands on ground higher than the blocked
      // result, not more than a step height up (the rounded bottom alone rides over rims up to about
      // 0.85 r, so this caps the total), and further along the intended direction (a step, not a wall).
      // The ground height just ahead of the capsule decides whether this is a step or a wall.
      const travel0 = Math.hypot(hx, hz), ux = hx / travel0, uz = hz / travel0;
      const ahead = rayCast(this.world, [this.pos[0] + ux * (this.radius + 0.05), this.pos[1] + this.stepHeight + 0.5, this.pos[2] + uz * (this.radius + 0.05)], [0, -1, 0], this.stepHeight + 1.5, MASK_PLAYER);
      const stepLike = !ahead || ahead.point[1] - this.pos[1] <= this.stepHeight + 0.02;
      const up = stepLike ? moveCapsule(this.world, this.pos, [0, this.stepHeight, 0], opts) : null;
      if (up && up.pos[1] >= this.pos[1] + this.stepHeight - 1e-3) {
        // Carry the capsule far enough onto the step to stand within the ledge grip (at least 0.4 r).
        const min = this.radius * 0.4;
        const k = travel0 < min ? min / travel0 : 1;
        const across = moveCapsule(this.world, up.pos, [hx * k, 0, hz * k], opts);
        const down = moveCapsule(this.world, across.pos, [0, -this.stepHeight - 0.02, 0], opts);
        const along = (q) => (q[0] - this.pos[0]) * hx + (q[2] - this.pos[2]) * hz;
        // A lift during the raised sweep means the rim is higher than a step: a wall, not a step.
        const rise = down.pos[1] - this.pos[1], lifted = across.pos[1] - up.pos[1];
        if (down.grounded && lifted <= 0.02 && rise > 0.01 && rise <= this.stepHeight + 0.02 && down.pos[1] > r.pos[1] + 0.01 && along(down.pos) > along(r.pos) + 1e-4) {
          r = { ...down, hitWall: across.hitWall, substeps: r.substeps + up.substeps + across.substeps + down.substeps };
          this.stepped = true;
        }
      }
    }
    if (!this.grounded && r.grounded) this.vy = 0;
    this.pos = r.pos;
    this.grounded = r.grounded;
    this.lastSubsteps = r.substeps;
    this.lastHitWall = r.hitWall;
    // Actual ground speed after collisions; against a wall the intended velocity bleeds off so the
    // character does not keep "running" into it (no foot sliding, and no lunge when the wall ends).
    const ax = (this.pos[0] - this.prevPos[0]) / dt, az = (this.pos[2] - this.prevPos[2]) / dt;
    this.speed = Math.hypot(ax, az);
    if (r.hitWall) { this.vel[0] = ax; this.vel[1] = az; }
    this.rememberSafe(r);
    if (this.pos[1] < this.killY) this.respawn();
    this.settled = this.pos.slice();
    return r;
  }

  rememberSafe(r) {
    if (this.grounded && r.groundNormal && r.groundNormal[1] > 0.9) {
      // Only remember spots where the capsule center itself is over walkable ground (not an edge).
      const hit = rayCast(this.world, [this.pos[0], this.pos[1] + 0.5, this.pos[2]], [0, -1, 0], 0.8, MASK_PLAYER);
      if (hit && hit.normal[1] > 0.9) this.lastSafe = [this.pos[0], hit.point[1], this.pos[2]];
    }
  }

  /** Places the character somewhere else at rest (fly-in, relocate): no leftover velocity or facing turn. */
  teleport(pos, heading = null) {
    this.pos = pos.slice(); this.prevPos = pos.slice(); this.lastSafe = pos.slice();
    this.vel = [0, 0]; this.vy = 0; this.grounded = false; this.speed = 0; this.turnRate = 0;
    if (heading != null) { this.heading = heading; this.prevHeading = heading; }
  }

  /** Falling off the archipelago puts the player back at the last safe point. */
  respawn() { this.pos = this.lastSafe.slice(); this.prevPos = this.pos.slice(); this.vy = 0; this.grounded = false; this.vel = [0, 0]; this.respawns++; }

  /** Interpolated render position between the last two fixed steps. */
  renderPos(alpha) {
    const a = this.prevPos, b = this.pos;
    return [a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha, a[2] + (b[2] - a[2]) * alpha];
  }

  /** Interpolated facing between the last two fixed steps (shortest way round). */
  renderHeading(alpha) { return this.prevHeading + wrapAngle(this.heading - this.prevHeading) * alpha; }
}

/**
 * Steering toward a click-to-move or route target. Returns a wish vector [x, z] or null when arrived.
 * The magnitude follows a braking profile, v(d) = sqrt(2 · decel · d), expressed against `speedRef`
 * (the run speed by default, so a running arrival slows in time and a walking one barely notices),
 * so the controller brakes into the target instead of easing in on a long exponential tail.
 */
/**
 * Click-to-move give-up rule (no pathfinding): `s` = {stuckTime, lastDist}; call once per physics step with the
 * wall contact and the distance left. Pressed against a wall with no progress for 0.6 s: returns true (cancel).
 * A step-up contact on a stair riser makes progress, so it never cancels a climb.
 */
export function clickStuck(s, hitWall, dist, dt = PHYSICS_DT) {
  s.stuckTime = hitWall && dist > s.lastDist - 0.01 ? s.stuckTime + dt : 0;
  s.lastDist = Math.min(s.lastDist, dist);
  return s.stuckTime > 0.6;
}

export function steerTo(pos, target, arriveRadius = 0.15, { speedRef = 3.6, decel = 6 } = {}) {
  const dx = target[0] - pos[0], dz = target[2] - pos[2];
  const d = Math.hypot(dx, dz);
  if (d <= arriveRadius) return null;
  const slow = Math.min(1, Math.sqrt(2 * decel * d) / speedRef);
  return [(dx / d) * slow, (dz / d) * slow];
}
