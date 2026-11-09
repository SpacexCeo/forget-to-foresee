// Horizontal locomotion model shared by the player controller and the NPC agents: speed-dependent
// acceleration and braking, a turn rate limited by speed (pivot in place when standing, a wide arc
// at a run), and a facing that the velocity follows, so a reversed input brakes, hooks round and
// accelerates again instead of flipping 180° in one step. Pure math on plain numbers, stepped at
// the fixed physics rate by the caller; no three.js, so it runs under `node --test`.

const DEG = Math.PI / 180;

/** Default tuning (docs/movement.md). Speeds in m/s, accelerations in m/s², turn rates in rad/s. */
export const DEFAULT_MOTION = Object.freeze({
  accel: 11,          // from rest; tapers toward the top speed (quick start, eased finish)
  accelTaper: 0.55,   // fraction of `accel` lost at the top speed
  brake: 13,          // when the input is released, or points far from the facing
  turnStand: 12,      // pivot rate when standing (about 690°/s: a 180° pivot in 0.26 s)
  turnRun: 4.5,       // turn rate at `turnRef` speed (about 260°/s: a 0.8 m arc at a run)
  turnRef: 3.6,       // speed at which `turnRun` applies
  slowAngle: 45 * DEG, // the target speed is full when the input is within this angle of the facing...
  stopAngle: 120 * DEG, // ...and zero beyond this angle (brake first, then pivot, then go)
  airControl: 0.25,   // how much of the intended speed change applies while airborne
  stopSpeed: 0.05,    // below this the character is at rest (no creeping tail)
});

/** Calmer tuning for the NPC agents ambling about their camps. */
export const NPC_MOTION = Object.freeze({ ...DEFAULT_MOTION, accel: 4, accelTaper: 0.4, brake: 6, turnStand: 5, turnRun: 3, turnRef: 1.2 });

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** Turn rate (rad/s) at a given speed: fast pivot when slow, limited at speed. */
export function turnRateAt(speed, p = DEFAULT_MOTION) {
  return p.turnStand + (p.turnRun - p.turnStand) * clamp(speed / p.turnRef, 0, 1);
}

/** Fresh motion state: velocity [x, z] in m/s and the facing in radians around Y (0 = +Z). */
export function createMotion(heading = 0) { return { vel: [0, 0], heading, targetSpeed: 0, turnRate: 0 }; }

/**
 * Advances a motion state by one fixed step.
 * @param {{vel:number[], heading:number}} m state, mutated
 * @param {number[]} wish desired direction [x, z], length 0..1 (1 = full speed)
 * @param {number} maxSpeed top speed for this step (walk or run)
 * @param {number} dt step length in seconds
 * @param {object} p tuning (DEFAULT_MOTION)
 * @param {boolean} grounded airborne steps keep their momentum (small air control)
 * @returns {{speed:number, turnRate:number, targetSpeed:number}}
 */
export function stepMotion(m, wish, maxSpeed, dt, p = DEFAULT_MOTION, grounded = true) {
  const mag = Math.min(1, Math.hypot(wish[0], wish[1]));
  const speed = Math.hypot(m.vel[0], m.vel[1]);
  let heading = m.heading, target = 0, turned = 0;
  if (mag > 0.02) {
    const want = Math.atan2(wish[0], wish[1]);
    const diff = wrapAngle(want - heading);
    const maxTurn = turnRateAt(speed, p) * dt;
    turned = clamp(diff, -maxTurn, maxTurn);
    heading = wrapAngle(heading + turned);
    const remaining = Math.abs(wrapAngle(want - heading));
    // Input far off the facing: brake first (the hook of a reversal), full speed once aligned.
    target = mag * maxSpeed * (1 - smoothstep(p.slowAngle, p.stopAngle, remaining));
  }
  let next;
  if (target > speed) {
    const a = p.accel * (1 - p.accelTaper * clamp(speed / Math.max(maxSpeed, 1e-6), 0, 1));
    next = Math.min(target, speed + a * dt);
  } else next = Math.max(target, speed - p.brake * dt);
  if (target === 0 && next < p.stopSpeed) next = 0;
  if (!grounded) next = speed + (next - speed) * p.airControl;
  m.vel[0] = Math.sin(heading) * next; m.vel[1] = Math.cos(heading) * next;
  m.heading = heading;
  m.targetSpeed = target; m.turnRate = turned / dt;
  return { speed: next, turnRate: m.turnRate, targetSpeed: target };
}

/**
 * Locomotion blend weights from the actual ground speed (no foot sliding: the clip rate follows the
 * speed too). idle → walk completes by `walkOn` m/s, walk → run runs from `walkRef` to `runRef`.
 * `walkScale` / `runScale` are the clip playback rates (clips authored at walkRef / runRef).
 */
export function gaitBlend(speed, { walkRef = 1.7, runRef = 3.3, walkOn = 0.6, idleBelow = 0.05 } = {}) {
  const s = Math.max(0, speed);
  const run = clamp((s - walkRef) / (runRef - walkRef), 0, 1);
  const move = clamp((s - idleBelow) / (walkOn - idleBelow), 0, 1);
  const walk = move * (1 - run);
  return {
    idle: 1 - move, walk, run, move,
    walkScale: clamp(Math.max(s, walkOn) / walkRef, 0.55, 1.6),
    runScale: clamp(s / runRef, 0.6, 1.4),
  };
}

/** Exponential damping toward a target (frame-rate independent); `rate` in 1/s. */
export const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

/**
 * Local avoidance for agents walking without colliders: neighbours within `look` ahead and `radius`
 * to the side push the wish sideways (away from them), a neighbour almost on top of us slows the step.
 * Deterministic tie-break (a neighbour dead ahead is passed on the agent's right). Returns a new wish.
 * @param {number[]} pos [x, z] @param {number} heading @param {number[]} wish [x, z]
 * @param {number[][]} others [[x, z], ...] positions of the other agents and the player
 */
export function avoidWish(pos, heading, wish, others, { radius = 1.1, look = 2.2, strength = 0.9, slowRadius = 0.7 } = {}) {
  const mag = Math.hypot(wish[0], wish[1]);
  if (mag < 1e-6 || !others || !others.length) return wish;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const sx = fz, sz = -fx; // the agent's left-hand side
  let push = 0, slow = 1;
  for (const o of others) {
    const dx = o[0] - pos[0], dz = o[1] - pos[1];
    const ahead = dx * fx + dz * fz, lat = dx * sx + dz * sz;
    const d = Math.hypot(dx, dz);
    if (d < slowRadius) slow = Math.min(slow, 0.45);
    if (ahead <= 0 || ahead > look || Math.abs(lat) >= radius) continue;
    const near = (1 - ahead / look) * (1 - Math.abs(lat) / radius);
    push -= (lat >= 0 ? 1 : -1) * near * strength; // step to the side the neighbour is not on
  }
  if (!push && slow === 1) return wish;
  const out = [wish[0] + sx * push * mag, wish[1] + sz * push * mag];
  const l = Math.hypot(out[0], out[1]) || 1;
  const k = (Math.min(1, mag) * slow) / l;
  return [out[0] * k, out[1] * k];
}
