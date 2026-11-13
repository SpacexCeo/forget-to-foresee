// Monsters on the hillside outside the lower gate (MOB-001, art/mobs): packs that idle and wander near their home,
// notice Iris, chase, telegraph and attack, flinch when her casts land, die (hit-stop, the dissolve of
// render/mob-fx.js) and come back after a while. Never inside the walls: every position is clamped to the field
// beyond them (scenes/town-outside.js `onField`) and to the pack's leash.
//
// Two layers. `MobBrain` is pure (positions as arrays, no three.js): the state machine, damage and the leash, so the
// rules are node-tested. `createMobs` is the view: loads mob_*.glb (phone `_m` variants), drives the clips, the
// ground following, the telegraph rings, the Veilbell's seed, Iris's health and the hit feedback.
//
// Events: `ftf:mob-killed` on window, detail {type, pos: [x, y, z] world, elite, killId} when a monster has fallen (its death
// clip has played and the dissolve starts) - the loot code turns it into a chest. `ftf:iris-down` when her health
// runs out (she is carried back to the gate with full health).
import { emit as busEmit } from '../sprint/bus.js';
import { onField } from '../scenes/town-outside.js';
import { CASTS } from '../scenes/town-casting-fx.js';

/** Per type: health, speeds (m/s), the ground speed each clip's stride was built for (`clip` [walk, run], from
 * art/mobs/mobs.json: the clip is time-scaled to the actual speed so the feet do not slide), ranges (m), attack timing. */
export const MOB_TYPES = Object.freeze({
  skitter: Object.freeze({ clip: [0.83, 1.63], scale: 1.25, rim: 0.9, hp: 55, walk: 0.9, run: 1.8, radius: 0.42, aggro: 9, attack: 1.0, damage: 3, windup: 0.8, impact: 0.55, cooldown: 1.6, stagger: true }),
  hulker: Object.freeze({ clip: [1.01, 2.14], hp: 380, walk: 1.25, run: 2.6, radius: 0.9, aggro: 11, attack: 2.4, damage: 18, windup: 1.4, impact: 0.58, cooldown: 2.4, stagger: false, heavy: true }),   // a brute powers through light hits
  veilbell: Object.freeze({ clip: [0.84, 1.64], hp: 120, walk: 1.0, run: 1.9, radius: 0.5, aggro: 14, attack: 9.0, damage: 10, windup: 1.5, impact: 0.75, cooldown: 2.8, stagger: true, ranged: true }),
  crownrift: Object.freeze({ clip: [1.2, 2.76], hp: 900, walk: 1.6, run: 3.4, radius: 1.3, aggro: 13, attack: 3.0, damage: 26, windup: 1.6, impact: 0.55, cooldown: 2.2, stagger: false, elite: true, heavy: true,
    // no safe spot (owner 12.11): out of melee it closes in faster and answers from range with a crown bolt
    surge: 1.5, answer: Object.freeze({ range: 18, minRange: 5, damage: 14, windup: 1.1, cooldown: 3.2, after: 1.2 }) }),
});

/** Packs: type, count (phone count), home in town-local metres (x, z), respawn seconds after the last one fell. */
export const PACKS = Object.freeze([
  { type: 'skitter', count: 4, phone: 3, home: [-12, 52], respawn: 30 },      // the first fight, just off the road
  { type: 'skitter', count: 4, phone: 3, home: [-30, 66], respawn: 35 },      // on the casting field
  { type: 'veilbell', count: 2, phone: 1, home: [36, 66], respawn: 45 },      // the bend terrace
  { type: 'hulker', count: 1, phone: 1, home: [16, 79], respawn: 60 },        // below the second bend
  { type: 'skitter', count: 3, phone: 2, home: [-16, 87], respawn: 35 },
  { type: 'crownrift', count: 1, phone: 1, home: [12, 102], respawn: 120 },   // the elite on the lookout
]);

export const LEASH = 16;            // a monster never strays further than this from its pack's home (unless provoked)
/**
 * Provoked pursuit (owner 12.11: "I hit the boss from far away and it never came"): ANY damage, from any distance,
 * provokes the creature: it chases the attacker at once, out to `radius` m from its home (walls still hold), and
 * gives up only after she has been out of reach (beyond `radius` from home, back in the town, or `vertical` m above
 * or below) for `lose` seconds; then it walks home and heals back `heal` of its health per second.
 */
export const PURSUIT = Object.freeze({ radius: 42, vertical: 10, lose: 6, heal: 0.5 });
export const WANDER = 4.5;          // idle wander radius
export const IRIS_HP = 100;
export const STAGGER_SECONDS = 0.45;
export const SNARE_ROOT_SECONDS = 1.6;
export const HIT_STOP_SECONDS = 0.07;
/** The shortest warning a melee blow gives (windup × impact, s): its ground ring shows at least this long. */
/** This page's session (the kill ids of one visit never repeat the last visit's). */
const SESSION = Date.now().toString(36);
export const TELEGRAPH_MIN = 0.4;
/** Every strike hit shoves a light creature this far (m); the third hit of the combo throws it 0.7 m. */
export const HIT_SHOVE = 0.18;
export const CAST_DAMAGE = Object.freeze({ lance: 40, snare: 25 });
/** Iris's own moves beyond the walls (the skill bar's strike and dash slots; ids for the UI). */
export const ACTIONS = Object.freeze({
  strike: Object.freeze({ keys: ['KeyF', 'Digit3'], cooldown: 0.32, combo: [14, 14, 26], reach: 2.1, arc: 1.05, window: 0.8 }),
  dash: Object.freeze({ keys: ['Space', 'Digit4'], cooldown: 1.0, distance: 4.5, seconds: 0.2, iframes: 0.35 }),
  // hold the strike for the super strike (owner 12.11): held ≥ hold s it fires on release; damage ramps to full at
  // `full` s of charge; a frontal cone `reach` m, half-angle `arc`; knockback for light creatures; its own cooldown
  super: Object.freeze({ hold: 0.4, full: 1.0, min: 34, max: 80, reach: 3.0, arc: Math.PI / 4, knock: 1.6, impact: 0.1, cooldown: 1.2, freeze: 0.16 }),
  lock: 8.0,                       // soft lock: the nearest living creature this close (m), in any direction ...
  lockFront: 0.35,                 // ... creatures behind her count this much farther (ahead preferred, never ignored)
  lunge: 0.14,                     // s: a locked creature out of reach is closed in on before the hit lands
});
/**
 * Where a strike goes (owner 12.11: "either the monster or the camera direction"): 1) the creature in the soft lock
 * (the nearest living one within ACTIONS.lock m in any direction, the ones ahead preferred), 2) on a desktop the
 * mouse cursor's point on the ground, even standing still, 3) while she moves, the stick / keys movement, 4) the
 * camera's forward direction on the ground (on a phone with no creature near: where the camera looks), 5) her facing
 * (no camera given). Returns the heading (radians, atan2(x, z)) and which source won. Pure.
 * @param {{from: number[], heading: number, lock?: {pos: number[]}|null, cursor?: number[]|null, move?: number[]|null, camera?: number[]|null}} o
 *   cursor: a world point [x, y, z] (or [x, z]) on the ground; move, camera: directions [x, z]
 */
export function strikeAim({ from, heading, lock = null, cursor = null, move = null, camera = null }) {
  if (lock && lock.pos) return { heading: Math.atan2(lock.pos[0] - from[0], lock.pos[2] - from[2]), by: 'lock' };
  if (cursor) {
    const cx = cursor[0], cz = cursor.length > 2 ? cursor[2] : cursor[1], dx = cx - from[0], dz = cz - from[2];
    if (Math.hypot(dx, dz) > 0.25) return { heading: Math.atan2(dx, dz), by: 'cursor' };
  }
  if (move && Math.hypot(move[0], move[1]) > 0.1) return { heading: Math.atan2(move[0], move[1]), by: 'move' };
  if (camera && Math.hypot(camera[0], camera[1]) > 1e-3) return { heading: Math.atan2(camera[0], camera[1]), by: 'camera' };
  return { heading, by: 'facing' };
}

/**
 * The soft lock: the nearest living creature within `range` m of `from` whose bearing lies inside `cone` (radians,
 * full angle) around the camera's ground direction `fwd` [x, z] (any bearing without one). Pure over `mobs`.
 */
export function pickLock(mobs, from, fwd, range = ACTIONS.lock, front = ACTIONS.lockFront) {
  const fl = fwd ? Math.hypot(fwd[0], fwd[1]) : 0;
  let best = null, bs = Infinity;
  for (const m of mobs) {
    if (m.state === 'dead' || m.state === 'gone') continue;
    const dx = m.pos[0] - from[0], dz = m.pos[2] - from[2], dist = Math.hypot(dx, dz), d = Math.max(0, dist - m.T.radius);
    if (d > range) continue;
    // in any direction: one ahead (of the camera, else of her) wins over one behind at the same distance, but a
    // creature beside or behind her is never left out (owner 12.11: on a PC every strike assists onto a monster)
    const c = fl > 1e-3 && dist > 1e-3 ? (dx * fwd[0] + dz * fwd[1]) / (dist * fl) : 1;
    const score = d * (1 + front * (1 - c));
    if (score < bs) { bs = score; best = m; }
  }
  return best;
}

export const REGEN = Object.freeze({ delay: 4, perSecond: 8 });   // her health comes back out of combat
const LANCE_SPEED = 20;             // the fracture front of the Frost Lance (m/s): a monster far along the line is hit later
const SNARE_DELAY = 0.35;           // the leash reaches the point, the ring snaps open

/** Deterministic PRNG (mulberry32): the same seed wanders the same way (QA, replays). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Lance: distance of p from the segment start along dir (unit [x, z]) and across it. */
export function alongLine(from, dir, p) {
  const dx = p[0] - from[0], dz = p[2] - from[2];
  return { along: dx * dir[0] + dz * dir[1], across: Math.abs(dx * dir[1] - dz * dir[0]) };
}

/**
 * The pure state machine. Positions are world [x, y, z]; `origin` is the town origin (town-local = world - origin).
 * States: idle (wander), chase, windup (the telegraph, then the impact), recover, stagger, dead, gone (waiting to
 * respawn). `step` returns the events of the step: {kind: 'attack'|'impact'|'shot'|'hit'|'death'|'killed'|'respawn', mob}.
 */
export class MobBrain {
  constructor({ origin = [0, 0, 0], phone = false, seed = 7, packs = PACKS } = {}) {
    this.origin = origin; this.rand = rng(seed); this.mobs = []; this.pending = []; this.packs = [];
    for (const [pi, p] of packs.entries()) {
      const pack = { ...p, index: pi, home: [origin[0] + p.home[0], origin[1], origin[2] + p.home[1]], timer: -1 };
      this.packs.push(pack);
      const n = phone ? p.phone : p.count;
      for (let k = 0; k < n; k++) this.mobs.push(this.spawn(pack, k, n));
    }
  }

  spawn(pack, k, n) {
    const T = MOB_TYPES[pack.type], a = (k / Math.max(1, n)) * Math.PI * 2 + this.rand() * 0.8, r = n > 1 ? 1.2 + this.rand() * 1.5 : 0;
    const pos = [pack.home[0] + Math.cos(a) * r, pack.home[1], pack.home[2] + Math.sin(a) * r];
    return { id: `${pack.type}${pack.index}_${k}`, type: pack.type, pack, T, hp: T.hp, pos, heading: this.rand() * Math.PI * 2, state: 'idle',
      t: 0, goal: null, cooldown: 0, root: 0, speed: 0, struckAt: 0, freeze: 0, target: null, provoked: false, lost: 0, reset: false, answer: false, far: 0 };
  }

  /** Town-local check: a world point lies on the field beyond the walls. */
  outside(p) { return onField(p[0] - this.origin[0], p[2] - this.origin[2]); }

  /** Damage to one monster (from a cast). */
  damage(m, amount, events, { root = 0 } = {}) {
    if (m.state === 'dead' || m.state === 'gone') return;
    m.hp -= amount; m.freeze = HIT_STOP_SECONDS; m.root = Math.max(m.root, root);
    events.push({ kind: 'hit', mob: m, amount, crit: amount >= 26 });
    if (m.hp <= 0) { m.hp = 0; m.state = 'dead'; m.t = 0; events.push({ kind: 'death', mob: m }); return; }
    m.provoked = true; m.lost = 0; m.reset = false;                               // any hit, any distance: it comes for her
    if (m.state === 'idle' || m.state === 'recover') { m.state = 'chase'; m.t = 0; m.goal = null; }
    if (m.T.stagger && m.state !== 'windup') { m.state = 'stagger'; m.t = 0; }
    else if (m.T.stagger && m.state === 'windup' && m.t < m.T.windup * m.T.impact * 0.6) { m.state = 'stagger'; m.t = 0; }   // interrupted early in the telegraph
  }

  /** Iris's strike: every living monster in the arc in front of her takes `amount` (the third hit knocks back). */
  strike(from, heading, amount, knock, events) {
    const A = ACTIONS.strike; let n = 0;
    for (const m of this.mobs) {
      if (m.state === 'dead' || m.state === 'gone') continue;
      const dx = m.pos[0] - from[0], dz = m.pos[2] - from[2], d = Math.hypot(dx, dz);
      if (d > A.reach + m.T.radius) continue;
      let a = Math.atan2(dx, dz) - heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > A.arc && d > m.T.radius + 0.3) continue;
      this.damage(m, amount, events);
      if (!m.T.heavy && m.state !== 'dead' && d > 1e-3) {
        const k = (knock ? 0.7 : HIT_SHOVE) / d, nx = m.pos[0] + dx * k, nz = m.pos[2] + dz * k;
        if (this.outside([nx, 0, nz]) && Math.hypot(nx - m.pack.home[0], nz - m.pack.home[2]) < LEASH) { m.pos[0] = nx; m.pos[2] = nz; }
      }
      n++;
    }
    return n;
  }

  /** The super strike: a cone in front of her, `amount` to everything in it, a long hit-stop, light creatures thrown back. */
  superStrike(from, heading, amount, events) {
    const A = ACTIONS.super; let n = 0;
    for (const m of this.mobs) {
      if (m.state === 'dead' || m.state === 'gone') continue;
      const dx = m.pos[0] - from[0], dz = m.pos[2] - from[2], d = Math.hypot(dx, dz);
      if (d > A.reach + m.T.radius) continue;
      let a = Math.atan2(dx, dz) - heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > A.arc && d > m.T.radius + 0.3) continue;
      this.damage(m, amount, events);
      events.push({ kind: 'super', mob: m });
      if (m.state !== 'dead') m.freeze = A.freeze;
      if (!m.T.heavy && m.state !== 'dead' && d > 1e-3) {
        const k = A.knock / d, nx = m.pos[0] + dx * k, nz = m.pos[2] + dz * k;
        if (this.outside([nx, 0, nz]) && Math.hypot(nx - m.pack.home[0], nz - m.pack.home[2]) < LEASH) { m.pos[0] = nx; m.pos[2] = nz; }
      }
      n++;
    }
    return n;
  }

  /** The nearest living creature within `range` m of `from` (the strike's soft lock), or null. */
  nearest(from, range) {
    let best = null, bd = range;
    for (const m of this.mobs) {
      if (m.state === 'dead' || m.state === 'gone') continue;
      const d = Math.hypot(m.pos[0] - from[0], m.pos[2] - from[2]) - m.T.radius;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Iris's cast left her hands: queue its hits ({id, from, dir [x, z], point}). */
  cast({ id, from, dir, point }) {
    if (id === 'lance') {
      const c = CASTS.lance;
      for (const m of this.mobs) {
        if (m.state === 'dead' || m.state === 'gone') continue;
        const { along, across } = alongLine(from, dir, m.pos);
        if (along > -m.T.radius && along < c.range + m.T.radius && across < c.width / 2 + m.T.radius) this.pending.push({ at: Math.max(0, along) / LANCE_SPEED, mob: m, amount: CAST_DAMAGE.lance, root: 0 });
      }
    } else if (id === 'snare') {
      const c = CASTS.snare;
      for (const m of this.mobs) {
        if (m.state === 'dead' || m.state === 'gone') continue;
        if (dist2(m.pos, point) < c.radius + m.T.radius) this.pending.push({ at: SNARE_DELAY, mob: m, amount: CAST_DAMAGE.snare, root: SNARE_ROOT_SECONDS });
      }
    }
  }

  /**
   * One step. `iris` {pos, alive, outside}. `ground(x, z, nearY)` gives the ground height. Returns events.
   */
  step(dt, iris, ground = (x, z, y) => y) {
    const ev = [];
    for (const p of this.pending) p.at -= dt;
    for (const p of this.pending.filter((q) => q.at <= 0)) this.damage(p.mob, p.amount, ev, { root: p.root });
    this.pending = this.pending.filter((q) => q.at > 0);
    for (const m of this.mobs) this.think(m, dt, iris, ground, ev);
    for (const pack of this.packs) {                                             // a pack comes back after its last one fell
      const mine = this.mobs.filter((m) => m.pack === pack);
      if (mine.every((m) => m.state === 'gone')) {
        if (pack.timer < 0) pack.timer = pack.respawn;
        pack.timer -= dt;
        const near = iris && iris.alive && dist2(iris.pos, pack.home) < 12;   // never under her nose
        if (pack.timer <= 0 && !near) {
          pack.timer = -1;
          mine.forEach((m, k) => { const fresh = this.spawn(pack, k, mine.length); Object.assign(m, fresh, { id: m.id }); m.pos[1] = ground(m.pos[0], m.pos[2], pack.home[1]); ev.push({ kind: 'respawn', mob: m }); });
        }
      }
    }
    return ev;
  }

  think(m, dt, iris, ground, ev) {
    if (m.state === 'gone') return;
    if (m.freeze > 0) { m.freeze -= dt; return; }                                // hit-stop
    m.t += dt; m.cooldown = Math.max(0, m.cooldown - dt); m.root = Math.max(0, m.root - dt);
    const T = m.T, home = m.pack.home;
    let sees = iris && iris.alive && iris.outside && dist2(iris.pos, m.pos) < T.aggro && dist2(iris.pos, home) < LEASH + T.attack && Math.abs(iris.pos[1] - m.pos[1]) < 6;   // not through a cliff
    if (m.provoked) {                                                              // provoked: it keeps coming until she is truly gone
      const reach = iris && iris.alive && iris.outside && dist2(iris.pos, home) < PURSUIT.radius && Math.abs(iris.pos[1] - m.pos[1]) < PURSUIT.vertical;
      m.lost = reach ? 0 : (m.lost || 0) + dt;
      if ((iris && !iris.alive) || m.lost >= PURSUIT.lose) { m.provoked = false; m.lost = 0; m.reset = true; sees = false; }
      else sees = !!iris;                                                         // (no player given: it stands provoked, nothing to chase)
    }
    if (m.reset && m.state === 'idle') { m.hp = Math.min(T.hp, m.hp + T.hp * PURSUIT.heal * dt); if (m.hp >= T.hp) m.reset = false; }   // the leash reset heals it back
    m.speed = 0;
    switch (m.state) {
      case 'dead':                                                                   // the view reports the end of the death clip
        if (m.t >= 3) this.fallen(m, ev);                                            // (or, without a view, after 3 s)
        return;
      case 'stagger':
        if (m.t >= STAGGER_SECONDS) { m.state = 'chase'; m.t = 0; }
        return;
      case 'windup': {
        if (iris) m.heading = turn(m.heading, Math.atan2(iris.pos[0] - m.pos[0], iris.pos[2] - m.pos[2]), dt * 3);
        const A = m.answer ? T.answer : null, windup = A ? A.windup : T.windup;
        const hitAt = windup * T.impact;
        if (m.t >= hitAt && !m.struck) {
          m.struck = true;
          if (A) ev.push({ kind: 'shot', mob: m, to: iris ? iris.pos.slice() : null, damage: A.damage });
          else if (T.ranged) ev.push({ kind: 'shot', mob: m, to: iris ? iris.pos.slice() : null });
          else ev.push({ kind: 'impact', mob: m, hit: !!(iris && iris.alive && dist2(iris.pos, m.pos) < T.attack + 0.6 && Math.abs(iris.pos[1] - m.pos[1]) < 2.5 && facing(m, iris.pos)) });
        }
        if (m.t >= windup) { m.state = 'recover'; m.t = 0; m.cooldown = A ? A.cooldown : T.cooldown; m.answer = false; m.far = 0; }
        return;
      }
      case 'recover':
        if (m.t >= 0.3) { m.state = sees ? 'chase' : 'idle'; m.t = 0; m.goal = null; }
        return;
      case 'chase': {
        if (!sees) { m.state = 'idle'; m.t = 0; m.goal = home.slice(); break; }   // she left: walk home
        const d = dist2(iris.pos, m.pos);
        m.heading = turn(m.heading, Math.atan2(iris.pos[0] - m.pos[0], iris.pos[2] - m.pos[2]), dt * 6);
        if (d <= T.attack && m.cooldown <= 0) { m.state = 'windup'; m.t = 0; m.struck = false; ev.push({ kind: 'attack', mob: m }); return; }
        m.far = d > T.attack * 1.6 ? (m.far || 0) + dt : 0;                          // how long she has kept out of its melee
        const A = T.answer;
        if (A && m.provoked && m.far >= A.after && d >= A.minRange && d <= A.range && m.cooldown <= 0) {   // no free kiting: a ranged answer
          m.state = 'windup'; m.t = 0; m.struck = false; m.answer = true; ev.push({ kind: 'attack', mob: m, ranged: true }); return;
        }
        if (d > T.attack * 0.85 && m.root <= 0) this.move(m, T.run * (m.provoked && T.surge && d > T.attack * 2 ? T.surge : 1), dt, ground);
        return;
      }
      default: break;
    }
    // idle: wander near home, aggro when she comes close
    if (sees) { m.state = 'chase'; m.t = 0; return; }
    if (!m.goal || (m.t > 3 && this.rand() < dt * 0.5)) {
      const a = this.rand() * Math.PI * 2, r = this.rand() * WANDER;
      m.goal = [home[0] + Math.cos(a) * r, home[1], home[2] + Math.sin(a) * r]; m.t = 0;
    }
    if (dist2(m.goal, m.pos) > 0.4 && m.root <= 0) {
      m.heading = turn(m.heading, Math.atan2(m.goal[0] - m.pos[0], m.goal[2] - m.pos[2]), dt * 3);
      this.move(m, T.walk * (dist2(m.pos, home) > LEASH * 0.8 ? 1.4 : 1), dt, ground);
    }
  }

  move(m, speed, dt, ground) {
    const nx = m.pos[0] + Math.sin(m.heading) * speed * dt, nz = m.pos[2] + Math.cos(m.heading) * speed * dt;
    const home = m.pack.home, dh = Math.hypot(nx - home[0], nz - home[2]), limit = m.provoked ? PURSUIT.radius : LEASH;
    if ((dh > limit && dh >= dist2(m.pos, home)) || !this.outside([nx, 0, nz])) return;   // the leash (wider when provoked) and the walls hold it; back home is always allowed
    for (const o of this.mobs) {                                                  // do not walk into a pack mate
      if (o === m || o.state === 'gone' || o.state === 'dead') continue;
      if (Math.hypot(nx - o.pos[0], nz - o.pos[2]) < (m.T.radius + o.T.radius) * 0.9 && Math.hypot(nx - o.pos[0], nz - o.pos[2]) < dist2(m.pos, o.pos)) return;
    }
    m.pos[0] = nx; m.pos[2] = nz; m.pos[1] = ground(nx, nz, m.pos[1]); m.speed = speed;
  }

  /** The view has played the death clip out: the monster becomes `gone` (dissolving) and the kill is reported. */
  fallen(m, ev) { if (m.state === 'dead') { m.state = 'gone'; ev.push({ kind: 'killed', mob: m }); } }
}

function turn(h, want, k) {
  let d = want - h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return h + d * Math.min(1, k);
}
function facing(m, p) {
  const a = Math.atan2(p[0] - m.pos[0], p[2] - m.pos[2]); let d = a - m.heading;
  while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 1.1;
}

/* ------------------------------------------------------------------ the view */

const CSS = `
.ftf-hp { position: absolute; left: 50%; bottom: calc(112px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(240px, 50vw); height: 10px; border-radius: 6px; background: rgba(10,12,16,.6); box-shadow: 0 0 0 1px rgba(255,255,255,.18); overflow: hidden; z-index: 6; pointer-events: none; }
.ftf-hp[hidden] { display: none; }
.ftf-hp > i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #e2584f, #f0a15a); transition: width .2s ease; }
.ftf-hp.ftf-hurt { animation: ftf-hp-shake .25s; }
@keyframes ftf-hp-shake { 25% { transform: translateX(calc(-50% - 4px)); } 75% { transform: translateX(calc(-50% + 4px)); } }
.ftf-hurt-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 4; box-shadow: inset 0 0 90px 6px rgba(190, 40, 30, .26); opacity: 0; transition: opacity .3s ease; }
.ftf-hurt-vignette.on { opacity: 1; transition: none; }
.ftf-dmg { position: fixed; left: 0; top: 0; z-index: 5; pointer-events: none; color: #fff7e6; font: 900 22px/1 system-ui, sans-serif; -webkit-text-stroke: 1px rgba(20,10,0,.85); text-shadow: 0 2px 3px #000, 0 0 8px rgba(0,0,0,.7); will-change: transform, opacity; }
.ftf-dmg.crit { color: #ffd166; font-size: 30px; }
@media (max-width: 700px) { .ftf-dmg { font-size: 19px; } .ftf-dmg.crit { font-size: 25px; } }
@media (max-width: 700px) { .ftf-hp { bottom: calc(190px + env(safe-area-inset-bottom, 0px)); } }
@media (prefers-reduced-motion: reduce) { .ftf-hp.ftf-hurt { animation: none; } .ftf-hp > i { transition: none; } }
`;

/**
 * @param {object} o
 * @param {object} o.THREE three.js namespace (passed in so the brain stays node-testable without it)
 * @param {THREE.Scene} o.scene @param {object} o.town scenes/town.js handle (world, origin) @param {object} o.player
 * @param {(name: string) => Promise<{gltf}>} o.load glTF by model name (render/assets.js prefetchGltf)
 * @param {(o: THREE.Object3D) => THREE.Object3D} o.clone SkeletonUtils.clone
 * @param {class} o.MobFx render/mob-fx.js @param {object} o.glow MOB_GLOW
 * @param {(x: number, z: number, nearY: number) => number} o.ground ground height under a world point (near a height)
 * @param {(x: number, z: number) => number|null} [o.floor] the hillside's own surface (homes and spawns)
 * @param {string} [o.variant] '_m' on phones @param {boolean} [o.phone] fewer monsters, cheaper updates
 * @param {() => boolean} [o.reduced] reduced motion
 * @param {(kind: string, mob?: object, ev?: object) => void} [o.onFeedback] 'hurt' | 'down' | 'kill' | 'attack' | 'hit' | 'strike' | 'strike3' | 'dash' (sound cues; the mob for attack / hit / kill)
 * @param {number[]} [o.respawn] where Iris is carried when her health runs out (world)
 */
export function createMobs({ THREE, scene, origin, player, load, clone, MobFx, glow, ground, floor = null, variant = '', phone = false, reduced = () => false, onFeedback = null,
  respawn = null, doc = globalThis.document, win = globalThis.window, seed = 7, camera = null, irisModel = () => null, moveIris = null, irisMove = null, irisEnd = null, floatNumber = null, immune = () => false }) {
  const brain = new MobBrain({ origin, phone, seed });
  // the hillside falls ~110 m below the town: every home and spawn is put on the real ground with a long probe
  // (the hillside's colliders are built when Iris first walks out of the gate, so a pack is settled as soon as its
  // ground answers, not only at mount)
  const unsettled = new Set(brain.packs);
  function settlePacks() {
    if (!floor) { unsettled.clear(); return; }
    for (const pack of [...unsettled]) {
      const y = floor(pack.home[0], pack.home[2]); if (y == null) continue;
      pack.home[1] = y; unsettled.delete(pack);
      for (const m of brain.mobs) if (m.pack === pack) { const my = floor(m.pos[0], m.pos[2]); m.pos[1] = my == null ? y : my; }
    }
  }
  settlePacks();
  const group = new THREE.Group(); group.name = 'mobs'; scene.add(group);
  const views = new Map(), templates = {};
  const iris = { pos: player.pos, alive: true, outside: false, hp: IRIS_HP, hurtT: 0, calm: 0, iframes: 0 };
  const act = { lunge: null, strikeCd: 0, combo: 0, comboT: 0, dashCd: 0, dash: null, twist: 0, twistDir: 1, charge: null, superCd: 0, superAt: null, flinch: 0, flinchMax: 1, flinchAmp: 0, blows: [] };
  let shake = 0;
  const numbers = [];
  const shots = [], shotLog = [];   // shotLog: the last seeds (QA: where from, where to, closest pass)
  let disposed = false;

  if (doc && !doc.getElementById('ftf-mobs-style')) { const st = doc.createElement('style'); st.id = 'ftf-mobs-style'; st.textContent = CSS; doc.head.append(st); }
  const hpEl = doc ? doc.createElement('div') : null, hpFill = doc ? doc.createElement('i') : null, vignette = doc ? doc.createElement('div') : null;
  if (doc) {
    hpEl.className = 'ftf-hp'; hpEl.hidden = true; hpEl.setAttribute('role', 'meter'); hpEl.setAttribute('aria-label', 'Health'); hpEl.setAttribute('aria-valuemin', '0'); hpEl.setAttribute('aria-valuemax', String(IRIS_HP));
    hpEl.append(hpFill); vignette.className = 'ftf-hurt-vignette'; doc.body.append(hpEl, vignette);
  }
  const ringGeo = new THREE.RingGeometry(0.75, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.0, depthWrite: false });
  const fillGeo = new THREE.CircleGeometry(0.75, 40); fillGeo.rotateX(-Math.PI / 2);
  // Hit sparks (owner 12.11: no ground arc; a light, simple effect where the blow lands): a small additive flash and a
  // faint dust puff on the struck creature at fist height, gone in 0.2 s. Camera-facing sprites, nothing on the ground.
  const sparkTex = (() => {
    const doc2 = doc || (typeof document !== 'undefined' ? document : null); if (!doc2) return null;
    const c = doc2.createElement('canvas'); c.width = c.height = 64; const g = c.getContext && c.getContext('2d'); if (!g) return null;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,240,210,0.55)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sparks = [];
  function hitSpark(m, big = false) {
    const y = m.pos[1] + Math.min(1.1, 0.35 + m.T.radius * 0.9), dx = m.pos[0] - player.pos[0], dz = m.pos[2] - player.pos[2], l = Math.hypot(dx, dz) || 1;
    const at = [m.pos[0] - dx / l * m.T.radius * 0.7, y, m.pos[2] - dz / l * m.T.radius * 0.7];   // the side facing her
    for (const kind of ['flash', 'dust']) {
      const mat = new THREE.SpriteMaterial({ map: sparkTex, color: kind === 'flash' ? 0xfff2d8 : 0xb9a58a, transparent: true, opacity: kind === 'flash' ? 0.9 : 0.35, depthWrite: false, blending: kind === 'flash' ? THREE.AdditiveBlending : THREE.NormalBlending });
      const sp = new THREE.Sprite(mat); sp.position.set(at[0], at[1] - (kind === 'dust' ? 0.15 : 0), at[2]); sp.renderOrder = 4; group.add(sp);
      sparks.push({ sp, kind, t: 0, dur: kind === 'flash' ? 0.14 : 0.2, s0: (kind === 'flash' ? 0.35 : 0.3) * (big ? 1.6 : 1), s1: (kind === 'flash' ? 0.7 : 0.75) * (big ? 1.6 : 1) });
    }
  }
  // the super strike: a ring that gathers under her while she charges, then a ground ring and a shock arc in her colour
  const SUPER_TINT = 0xffc36b;
  const chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SUPER_TINT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  chargeRing.visible = false; chargeRing.renderOrder = 3; group.add(chargeRing);

  /**
   * Turns her (the root only: player.heading; the avatar follows) for a strike, by strikeAim's order: the locked
   * creature, the cursor's ground point, the movement, her facing. `aim` is {cursor, move} or a bare move [x, z].
   */
  function face(aim) {
    const a = Array.isArray(aim) ? { move: aim } : (aim || {});
    const cam = a.camera || camForward();
    const lockOf = pickLock(brain.mobs, player.pos, cam || [Math.sin(player.heading), Math.cos(player.heading)]);
    const r = strikeAim({ from: player.pos, heading: player.heading, lock: lockOf, cursor: a.cursor || null, move: a.move || null, camera: cam });
    // the whole root turns this frame: no interpolation from the old facing, no momentum turning her back
    player.heading = r.heading; player.prevHeading = r.heading; lastAim = r.by;
    if (player.vel) player.vel = [0, 0];
    r.lock = r.by === 'lock' ? lockOf : null;
    return r;
  }
  let lastAim = 'facing';
  /**
   * Closes in on `mob` until it is `keep` m (plus its radius) away, over ACTIONS.lunge s, then calls `then`. Returns
   * false (and does nothing) when it is already that close. Collision-aware through moveIris.
   */
  function lungeTo(mob, keep, then) {
    if (!mob || !moveIris) return false;
    const dx = mob.pos[0] - player.pos[0], dz = mob.pos[2] - player.pos[2], d = Math.hypot(dx, dz), go = d - (keep + mob.T.radius);
    if (go <= 0.05) return false;
    act.lunge = { t: 0, dir: [dx / d, dz / d], left: Math.min(go, 7.5), rate: Math.min(go, 7.5) / ACTIONS.lunge, then, mob };
    iris.iframes = Math.max(iris.iframes, ACTIONS.lunge);
    return true;
  }
  const _cf = new THREE.Vector3();
  /** The camera's forward direction on the ground [x, z] (null without a camera). */
  function camForward() { if (!camera) return null; camera.getWorldDirection(_cf); const l = Math.hypot(_cf.x, _cf.z); return l > 1e-3 ? [_cf.x / l, _cf.z / l] : null; }
  // the soft lock made visible: a small ring under the creature a strike would turn to
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  lockRing.visible = false; lockRing.renderOrder = 3; group.add(lockRing);
  const seedGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const seedMat = new THREE.MeshBasicMaterial({ color: 0x9ff5ea });

  const names = [...new Set(brain.mobs.map((m) => m.type))];
  const ready = Promise.all(names.map((n) => load('mob_' + n + variant).catch(() => load('mob_' + n)).then(({ gltf }) => { templates[n] = gltf; }))).then(() => {
    if (disposed) return;
    for (const m of brain.mobs) attach(m);
  }).catch((e) => console.warn('[mobs] models unavailable', e));

  function attach(m) {
    const g = templates[m.type]; if (!g) return;
    const model = clone(g.scene);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = !phone; o.frustumCulled = true; } });
    const holder = new THREE.Group(); holder.add(model); group.add(holder);
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n) => g.animations.find((c) => c.name === n || c.name.endsWith('|' + n) || c.name.endsWith(n));
    const actions = {};
    for (const n of ['idle', 'walk', 'run', 'attack', 'hit', 'death']) {
      const c = clip(n); if (!c) continue;
      const a = mixer.clipAction(c);
      if (n === 'attack' || n === 'hit' || n === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[n] = a;
    }
    model.scale.setScalar(m.T.scale || 1);                                          // the skitter is drawn a quarter larger: it reads at fight distance
    const fx = new MobFx(holder, { edge: glow[m.type], rim: m.T.rim ?? 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.visible = false; ring.renderOrder = 2; group.add(ring);
    // the warning fills in from the middle as the blow comes: full disc = the hit
    const fill = new THREE.Mesh(fillGeo, ringMat.clone()); fill.renderOrder = 2; ring.add(fill);
    // idle variety: each creature breathes at its own rate and phase, and now and then turns its head away a little
    const v = { model, holder, mixer, actions, fx, ring, current: null, oneShot: null, idleRate: 0.82 + Math.random() * 0.36, idlePhase: Math.random(), look: Math.random() * 6, lookT: 0 };
    mixer.addEventListener('finished', (e) => { if (e.action === actions.death) { const ev = []; brain.fallen(m, ev); handle(ev); } if (e.action === v.oneShot) v.oneShot = null; });
    views.set(m, v); play(v, 'idle', 0);
    place(m, v);
  }

  function play(v, name, fade = 0.2) {
    const a = v.actions[name]; if (!a || v.current === a) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (name === 'idle') a.time = v.idlePhase * a.getClip().duration;           // packs do not breathe in step
    if (v.current) v.current.crossFadeTo(a, fade, false);
    v.current = a;
  }

  function place(m, v) {
    v.holder.position.set(m.pos[0], m.pos[1], m.pos[2]); v.holder.rotation.y = m.heading;
  }

  function number(m, amount, crit) {
    // the floating-numbers layer (flag damageNumbers, ui/float-numbers.js) takes the number when it is on
    if (floatNumber && floatNumber({ kind: crit ? 'crit' : 'damage', amount, target: m, pos: [m.pos[0], m.pos[1] + 0.6 + m.T.radius * 1.2, m.pos[2]] })) return;
    if (!doc || reduced() || !camera) return;
    const el = doc.createElement('div'); el.className = 'ftf-dmg' + (crit ? ' crit' : ''); el.textContent = String(Math.round(amount)); doc.body.append(el);
    numbers.push({ el, p: [m.pos[0] + (Math.random() - 0.5) * 0.4, m.pos[1] + 0.6 + m.T.radius * 1.2, m.pos[2]], t: 0 });
  }

  function hurt(amount, heavy = false) {
    if (!iris.alive || iris.iframes > 0 || immune()) return; // immune: the dragon ride and the Glass Shoal own her (owner 13.11)
    iris.calm = 0; if (heavy) shake = Math.max(shake, 0.6);
    iris.hp = Math.max(0, iris.hp - amount); iris.hurtT = 0.3;
    if (hpEl) { hpFill.style.width = (100 * iris.hp / IRIS_HP).toFixed(1) + '%'; hpEl.setAttribute('aria-valuenow', String(Math.round(iris.hp))); hpEl.classList.remove('ftf-hurt'); void hpEl.offsetWidth; hpEl.classList.add('ftf-hurt'); }
    if (vignette && !reduced()) { vignette.classList.add('on'); setTimeout(() => vignette.classList.remove('on'), heavy ? 220 : 140); }
    act.flinch = heavy ? 0.3 : 0.22; act.flinchMax = act.flinch; act.flinchAmp = heavy ? 0.16 : 0.09;   // she rocks back a step
    if (onFeedback) onFeedback('hurt');
    if (iris.hp <= 0) {
      iris.alive = false; if (onFeedback) onFeedback('down');
      if (win) win.dispatchEvent(new CustomEvent('ftf:iris-down', { detail: { pos: player.pos.slice() } }));
      setTimeout(() => { if (disposed) return; if (respawn) player.teleport(respawn.slice(), player.heading); iris.hp = IRIS_HP; iris.alive = true; if (hpFill) hpFill.style.width = '100%'; }, 1200);
    }
  }

  function handle(ev) {
    for (const e of ev) {
      if (e.kind === 'hit' || e.kind === 'killed') busEmit(e.kind === 'hit' ? 'mob.hit' : 'mob.killed', { type: e.mob.type, id: e.mob.id, dmg: e.amount, crit: !!e.crit }); // sprint bus (A5 seam)
      const v = views.get(e.mob);
      if (e.kind === 'attack' && v) { if (v.actions.attack) { play(v, 'attack', 0.1); v.oneShot = v.actions.attack; } v.ring.visible = !(e.ranged || e.mob.T.ranged); if (onFeedback) onFeedback('attack', e.mob); }
      else if (e.kind === 'impact') { if (v) v.ring.visible = false; if (e.hit) hurt(e.mob.T.damage, !!e.mob.T.heavy); }
      else if (e.kind === 'shot' && e.to && v) {
        const s = new THREE.Mesh(seedGeo, seedMat); const from = new THREE.Vector3(); v.model.getObjectByName('seed')?.getWorldPosition(from);
        if (!from.lengthSq()) from.set(e.mob.pos[0], e.mob.pos[1] + (e.mob.T.elite ? 2.2 : 1), e.mob.pos[2]);
        s.position.copy(from); group.add(s);
        const to = new THREE.Vector3(e.to[0], e.to[1] + 1.0, e.to[2]);
        shots.push({ s, vel: to.clone().sub(from).normalize().multiplyScalar(9), life: 2.2, damage: e.damage || e.mob.T.damage, min: 99, log: { from: from.toArray().map((x) => +x.toFixed(2)), to: to.toArray().map((x) => +x.toFixed(2)) } });
      }
      else if (e.kind === 'hit' && v) {
        v.fx.hit(); number(e.mob, e.amount, e.crit); if (!reduced()) hitSpark(e.mob, false); if (onFeedback) onFeedback('hit', e.mob, e);
        if (e.crit || e.mob.T.heavy) shake = Math.max(shake, e.crit ? 0.35 : 0.2);
        if (e.mob.state === 'stagger' && v.actions.hit) { play(v, 'hit', 0.06); v.oneShot = v.actions.hit; }
        v.ring.visible = v.ring.visible && e.mob.state === 'windup';
      }
      else if (e.kind === 'super' && v && !reduced()) hitSpark(e.mob, true);   // the super's spark, a little bigger
      else if (e.kind === 'death' && v) { v.ring.visible = false; play(v, 'death', 0.1); if (onFeedback) onFeedback('kill', e.mob); }
      else if (e.kind === 'killed') {
        if (v) v.fx.die();
        if (win) { e.mob.lives = (e.mob.lives || 0) + 1; win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: e.mob.type, pos: e.mob.pos.slice(), elite: !!e.mob.T.elite, killId: `${SESSION}:${e.mob.id}#${e.mob.lives}` } })); }   // killId: stable per creature and life (salvage, quests)
      }
      else if (e.kind === 'respawn' && v) {                                          // a fresh view: the dissolved one is thrown away
        group.remove(v.holder); group.remove(v.ring); views.delete(e.mob); attach(e.mob);
      }
    }
  }

  let acc = 0;
  return {
    brain, ready, group, iris, shotLog,
    get hp() { return iris.hp; },
    /** Iris's cast (scenes/town-casting.js onFire). */
    cast(c) { brain.cast(c); },
    get shake() { return reduced() ? 0 : shake; },
    get actions() { return { strikeCd: act.strikeCd, dashCd: act.dashCd, combo: act.combo, iframes: iris.iframes }; },
    get charging() { return act.charge ? act.charge.t : null; },
    /** Which source turned the last strike: 'lock' | 'cursor' | 'move' | 'facing' (QA). */
    get aimedBy() { return lastAim; },
    /** The lunge in progress ({t, left}) or null (QA). */
    get lunging() { return act.lunge ? { t: act.lunge.t, left: act.lunge.left } : null; },
    /** The creature a strike would turn to now (the soft lock), or null. */
    get locked() { return iris.outside ? pickLock(brain.mobs, player.pos, camForward()) : null; },
    /** The strike (F / 3): a two-or-three-hit combo in front of her. Returns false while on cooldown or off the field.
     *  @param {number[]|null} [aim] [x, z] the stick / mouse aim, else where she looks; a creature within 3 m wins (soft lock) */
    strike(aim = null) {
      if (!iris.alive || !iris.outside || act.strikeCd > 0 || act.dash) return false;
      const f = face(aim);
      const A = ACTIONS.strike;
      act.combo = act.comboT > 0 ? (act.combo % A.combo.length) + 1 : 1; act.comboT = A.window; act.strikeCd = A.cooldown;
      const amount = A.combo[act.combo - 1], knock = act.combo === A.combo.length;
      const blow = () => { const ev = []; brain.strike(player.pos, player.heading, amount, knock, ev); handle(ev); };
      act.twistDir = act.combo % 2 ? 1 : -1;
      const clip = irisMove ? irisMove('strike' + act.combo) : false;               // her own clip (it answers with its impact time), else the procedural twist
      act.twist = clip !== false && clip != null ? 0 : 0.22;
      // a locked creature out of reach: she closes in (a short lunge) and the blow lands as she arrives. In reach the
      // blow (damage, number, spark) lands on the frame her fist does, not on the press
      if (!lungeTo(f.lock, A.reach * 0.8, blow)) { if (typeof clip === 'number' && clip > 0) act.blows.push({ t: clip, fn: blow }); else blow(); }
      if (moveIris) moveIris([Math.sin(player.heading) * 0.25, Math.cos(player.heading) * 0.25]);           // a short step into the swing
      if (onFeedback) onFeedback(act.combo === 3 ? 'strike3' : 'strike');
      return true;
    },
    /**
     * The attack button went down (F / 3 held, or the touch attack button): she starts gathering the super strike
     * (`strike_charge`, held on its last frame). Let go with attackUp(): held ≥ 0.4 s it is the super strike, shorter
     * a normal combo strike. Returns false when no attack can start (off the field, dashing, dead).
     */
    attackDown(aim = null) {
      if (!iris.alive || !iris.outside || act.dash || act.charge) return false;
      if (act.superCd > 0 || act.superAt) return this.strike(aim);              // the super is recharging: a plain strike
      act.charge = { t: 0 }; face(aim);
      if (irisMove) irisMove('strike_charge');
      if (onFeedback) onFeedback('charge');
      return true;
    },
    /** The attack button came up: the super strike (charged ≥ 0.4 s) or a normal strike. */
    attackUp(aim = null) {
      const c = act.charge; if (!c) return false;
      act.charge = null; chargeRing.visible = false;
      if (!iris.alive || !iris.outside) { if (irisEnd) irisEnd(); return false; }
      const A = ACTIONS.super;
      if (c.t < A.hold) { const ok = this.strike(aim); if (!ok && irisEnd) irisEnd(); return ok; }   // a tap: the combo (its clip replaces the held pose); on cooldown the coiled pose is put away
      const f = face(aim);
      const k = Math.min(1, (c.t - A.hold) / (A.full - A.hold));
      act.superAt = { t: 0, amount: A.min + (A.max - A.min) * k, k };
      if (f.lock) lungeTo(f.lock, A.reach * 0.7, null);                          // closes in on the locked creature within its 0.10 s
      act.superCd = A.cooldown; act.strikeCd = 0.45;
      if (irisMove) irisMove('strike_super');
      if (onFeedback) onFeedback('super_release', null, { charge: k });
      return true;
    },
    /** Put the gathered strike away without striking (she was hit hard, left the field, a menu opened). */
    cancelAttack() { if (!act.charge) return; act.charge = null; chargeRing.visible = false; if (irisEnd) irisEnd(); },
    /** The dash (Space / 4): a short burst along `dir` [x, z] (or her heading) with i-frames. */
    dash(dir = null) {
      if (!iris.alive || !iris.outside || act.dashCd > 0 || act.dash) return false;
      if (act.charge) { act.charge = null; chargeRing.visible = false; if (irisEnd) irisEnd(); }
      const A = ACTIONS.dash; let d = dir && Math.hypot(dir[0], dir[1]) > 0.1 ? dir : [Math.sin(player.heading), Math.cos(player.heading)];
      const l = Math.hypot(d[0], d[1]); d = [d[0] / l, d[1] / l];
      act.dash = { dir: d, t: 0 }; act.dashCd = A.cooldown; iris.iframes = A.iframes;
      if (irisMove) irisMove('dash');
      player.heading = Math.atan2(d[0], d[1]);
      if (onFeedback) onFeedback('dash');
      return true;
    },
    /**
     * @param {number} dt @param {boolean} active the town is shown and the player is in it (false: hidden, asleep)
     */
    update(dt, active) {
      group.visible = active;
      const outside = active && brain.outside(player.pos);
      if (hpEl) hpEl.hidden = !outside;
      if (!active) return;
      iris.pos = player.pos; iris.outside = outside;
      if (unsettled.size) settlePacks();
      act.strikeCd = Math.max(0, act.strikeCd - dt); act.dashCd = Math.max(0, act.dashCd - dt); act.comboT = Math.max(0, act.comboT - dt);
      for (const b of act.blows) b.t -= dt;
      while (act.blows.length && act.blows[0].t <= 0) act.blows.shift().fn();          // strikes land with the fist
      act.superCd = Math.max(0, act.superCd - dt);
      if (act.lunge) {
        const L = act.lunge, stepLen = Math.min(L.left, L.rate * dt);
        if (stepLen > 0 && moveIris) moveIris([L.dir[0] * stepLen, L.dir[1] * stepLen]);
        L.left -= stepLen; L.t += dt;
        player.heading = player.prevHeading = Math.atan2(L.mob.pos[0] - player.pos[0], L.mob.pos[2] - player.pos[2]);
        if (L.left <= 1e-3 || L.t >= ACTIONS.lunge + 0.1) { act.lunge = null; if (L.then) L.then(); }
      }
      {
        const L = outside && iris.alive ? pickLock(brain.mobs, player.pos, camForward()) : null;
        lockRing.visible = !!L;
        if (L) { lockRing.position.set(L.pos[0], L.pos[1] + 0.05, L.pos[2]); lockRing.scale.setScalar(0.8 + L.T.radius * 1.4); lockRing.material.opacity = 0.45 + (reduced() ? 0 : 0.15 * Math.sin(performance.now() / 160)); }
      }
      if (act.charge) {
        if (!iris.alive || !outside) this.cancelAttack();
        else {
          act.charge.t += dt;
          const k = Math.min(1, act.charge.t / ACTIONS.super.full), ready = act.charge.t >= ACTIONS.super.hold;
          chargeRing.visible = true; chargeRing.position.set(player.pos[0], player.pos[1] + 0.05, player.pos[2]);
          chargeRing.scale.setScalar(0.6 + 0.5 * k + (reduced() ? 0 : 0.04 * Math.sin(act.charge.t * 18)));
          chargeRing.material.opacity = (ready ? 0.55 : 0.25) * (0.5 + 0.5 * k);
        }
      }
      if (act.superAt) {
        act.superAt.t += dt;
        if (act.superAt.t >= ACTIONS.super.impact && !act.lunge) {                // the clip's impact frame (0.10 s), once she has closed in
          const S = act.superAt; act.superAt = null;
          const ev = []; brain.superStrike(player.pos, player.heading, S.amount, ev); handle(ev);
          shake = Math.max(shake, 0.55 + 0.35 * S.k);
          if (moveIris) moveIris([Math.sin(player.heading) * 0.45, Math.cos(player.heading) * 0.45]);
          if (onFeedback) onFeedback('super', null, { hits: ev.filter((e) => e.kind === 'super').length, charge: S.k });
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const k = sparks[i]; k.t += dt; const u = Math.min(1, k.t / k.dur);
        k.sp.scale.setScalar(k.s0 + (k.s1 - k.s0) * (1 - (1 - u) * (1 - u))); k.sp.material.opacity = (k.kind === 'flash' ? 0.9 : 0.35) * (1 - u);
        if (k.kind === 'dust') k.sp.position.y += dt * 0.4;
        if (u >= 1) { group.remove(k.sp); k.sp.material.dispose(); sparks.splice(i, 1); }
      }
      iris.iframes = Math.max(0, iris.iframes - dt); shake = Math.max(0, shake - dt * 2.5);
      iris.calm += dt;
      if (iris.alive && iris.calm > REGEN.delay && iris.hp < IRIS_HP) { iris.hp = Math.min(IRIS_HP, iris.hp + REGEN.perSecond * dt); if (hpFill) hpFill.style.width = (100 * iris.hp / IRIS_HP).toFixed(1) + '%'; }
      if (act.dash && moveIris) {
        const A = ACTIONS.dash, k = Math.min(dt, A.seconds - act.dash.t); act.dash.t += dt;
        if (k > 0) moveIris([act.dash.dir[0] * A.distance / A.seconds * k, act.dash.dir[1] * A.distance / A.seconds * k]);
        if (act.dash.t >= A.seconds) act.dash = null;
      } else if (act.dash) act.dash = null;
      const im = irisModel();
      if (im && (act.flinch > 0 || im.userData.flinched)) {                     // the hurt flinch: back and a little aside, then home
        act.flinch = Math.max(0, act.flinch - dt);
        const u = act.flinch > 0 ? Math.sin(Math.PI * (1 - act.flinch / act.flinchMax)) * (reduced() ? 0.3 : 1) : 0;
        im.position.z = -act.flinchAmp * u; im.rotation.z = 0.12 * u * (act.twistDir || 1); im.userData.flinched = act.flinch > 0;
        if (!im.userData.flinched) { im.position.z = 0; im.rotation.z = 0; }
      }
      if (im && (act.twist > 0 || im.rotation.y)) { act.twist = Math.max(0, act.twist - dt); im.rotation.y = act.twist > 0 ? act.twistDir * Math.sin(Math.PI * act.twist / 0.22) * 0.7 : 0; }
      if (camera && numbers.length) {
        const w = globalThis.innerWidth, h = globalThis.innerHeight, v3 = new THREE.Vector3();
        for (const n of numbers) {
          n.t += dt; v3.set(n.p[0], n.p[1] + n.t * 0.9, n.p[2]).project(camera);
          const pop = n.t < 0.12 ? 1.45 - 0.45 * (n.t / 0.12) : 1;             // a pop, then it rises and fades
          n.el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
          n.el.style.opacity = String(Math.max(0, Math.min(1, (0.9 - n.t) / 0.35))); if (n.t > 0.9 || v3.z > 1) n.el.remove();
        }
        for (let i = numbers.length - 1; i >= 0; i--) if (numbers[i].t > 0.9 || !numbers[i].el.isConnected) numbers.splice(i, 1);
      }
      acc += dt;
      const stepDt = phone ? 1 / 20 : 0;                                              // phones think at 20 Hz
      if (acc < stepDt) return animate(dt);
      const sdt = Math.min(acc, 0.1); acc = 0;
      handle(brain.step(sdt, iris, ground));
      animate(dt);
    },
    dispose() {
      disposed = true; scene.remove(group);
      for (const v of views.values()) v.mixer.stopAllAction();
      if (hpEl) { hpEl.remove(); vignette.remove(); }
      for (const n of numbers) n.el.remove();
    },
  };

  function animate(dt) {
    for (const [m, v] of views) {
      const near = Math.hypot(m.pos[0] - player.pos[0], m.pos[2] - player.pos[2]) < (phone ? 45 : 70);
      v.holder.visible = near && !(m.state === 'gone' && v.fx.done);
      if (!v.holder.visible) continue;
      if (m.freeze <= 0) {
        if (!v.oneShot && m.state !== 'dead' && m.state !== 'gone') play(v, m.speed > m.T.walk * 1.2 ? 'run' : m.speed > 0 ? 'walk' : 'idle');
        if (v.current && m.speed > 0) v.current.timeScale = m.speed / (m.speed > m.T.walk * 1.2 ? m.T.clip[1] : m.T.clip[0]);
        else if (v.current) v.current.timeScale = v.current === v.actions.idle ? v.idleRate : 1;
        v.mixer.update(dt);
      }
      v.fx.update(dt);
      place(m, v);
      // an idle creature glances aside every few seconds (a visual turn on top of the brain's heading)
      if (m.state === 'idle' && !m.speed) {
        v.look -= dt; if (v.look <= 0) { v.look = 3 + Math.random() * 5; v.lookDir = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35); v.lookT = 0; }
        if (v.lookDir) { v.lookT += dt; const k = Math.sin(Math.min(1, v.lookT / 1.8) * Math.PI); v.holder.rotation.y += v.lookDir * k * (reduced() ? 0 : 1); if (v.lookT >= 1.8) v.lookDir = 0; }
      }
      if (v.ring.visible) {
        const k = Math.min(1, m.t / (m.T.windup * m.T.impact));
        v.ring.position.set(m.pos[0] + Math.sin(m.heading) * m.T.attack * 0.55, m.pos[1] + 0.06, m.pos[2] + Math.cos(m.heading) * m.T.attack * 0.55);
        v.ring.scale.setScalar(m.T.attack * 0.6);
        const last = k > 0.82 && !reduced() ? 0.25 * Math.sin((k - 0.82) / 0.18 * Math.PI * 3) : 0;   // the last beat flickers
        v.ring.material.opacity = Math.min(1, 0.5 + 0.4 * k + last);
        const fl = v.ring.children[0]; fl.scale.setScalar(Math.max(0.02, k)); fl.material.opacity = 0.16 + 0.3 * k;
      }
    }
    const chest = new THREE.Vector3(player.pos[0], player.pos[1] + 1.0, player.pos[2]), want = new THREE.Vector3();
    for (const s of shots) {
      s.life -= dt;
      want.copy(chest).sub(s.s.position).normalize().multiplyScalar(9);        // the seed bends towards her chest (up to ~70 deg/s): a dodge sideways still beats it
      const k = Math.min(1, dt * 1.2); s.vel.lerp(want, k).setLength(9);
      s.s.position.addScaledVector(s.vel, dt);
      const p = s.s.position;
      const dIris = Math.hypot(p.x - player.pos[0], p.y - (player.pos[1] + 1.0), p.z - player.pos[2]); s.min = Math.min(s.min, dIris);
      if (iris.alive && dIris < 0.75) { hurt(s.damage); s.life = 0; s.hit = true; }
      if (s.life <= 0) { group.remove(s.s); shotLog.push({ ...s.log, min: +s.min.toFixed(2), hit: !!s.hit }); if (shotLog.length > 20) shotLog.shift(); }
    }
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
  }
}
