// The townsfolk of the hill town (N-001): who they are and what each one does all day. Pure data and logic, no
// three.js: `townsfolk.js` draws what this module decides. Presentation only, no game rule reads it.
//
// Every person runs a small cyclic program of steps on the town's exported NPC points and routes
// (TOWN_DATA.npc, town-local metres):
//   { walk: [[x, y, z], ...], speed? }      follow the polyline at the person's walking speed
//   { stay: seconds, clip, heading?, face? } stand (or sit) and play an activity clip
//   { meet: key, seconds, clip }             wait for the partner to reach the same step, then talk together
// Durations get a seeded jitter (the agents' IdleLife pattern), so a town looks the same on every machine.
import { TOWN_DATA } from '../scenes/town-data.js';
import { seededRng } from './behaviour.js';

const P = TOWN_DATA.npc.points, R = TOWN_DATA.npc.routes, A = TOWN_DATA.npc.areas;
const shop = (id) => TOWN_DATA.shops.find((s) => s.id === id);

/** Iris this close is looked at (head and eyes). */
export const LOOK_RADIUS = 6;
/** Iris this close and in the way stops a walker (it waits and steps a little aside instead of walking through her). */
export const YIELD_RADIUS = 1.3;
export const SIDE_STEP = 0.45;

/**
 * The cast: asset name, authored clip speeds (metres per second of the model's own walk and run clips) and
 * the standing height (docs/townsfolk.md). `walk` is also the speed the person moves at, so feet never slide.
 */
export const TOWNSFOLK = Object.freeze([
  { key: 'guard', height: 1.92, walk: 1.30 },
  { key: 'shardkeeper', height: 1.70, walk: 1.20 },
  { key: 'scribe', height: 1.76, walk: 1.20 },
  { key: 'innkeeper', height: 1.78, walk: 1.15 },
  { key: 'baker', height: 1.72, walk: 1.15 },
  { key: 'shrinekeeper', height: 1.60, walk: 0.95 },
  { key: 'elder', height: 1.65, walk: 0.65 },
  { key: 'musician', height: 1.74, walk: 1.25 },
  { key: 'sweeper', height: 1.62, walk: 1.20 },
  { key: 'lamplighter', height: 1.86, walk: 1.30 },
  { key: 'courier', height: 1.68, walk: 1.55 },
  { key: 'child_a', height: 1.32, walk: 1.10, run: 2.6 },
  { key: 'child_b', height: 1.22, walk: 1.20, run: 2.6 },
].map((p) => Object.freeze({ ...p, asset: 'townsfolk_' + p.key })));

/** Clip fallbacks: the shared side-car set (docs/art/animation-pipeline.md) first, then the model's own clips. */
export const CLIP_FALLBACK = Object.freeze({
  idle: ['idle'], idle_shift: ['idle_shift', 'weight_shift', 'idle'], walk: ['walk'], run: ['child_run', 'run', 'walk'],
  elder_walk: ['elder_walk', 'walk'], talk: ['talk', 'idle'], talk_b: ['talk_b', 'talk', 'idle'], listen: ['idle_look', 'idle_shift', 'think', 'idle'],
  wave: ['wave', 'gesture_offer', 'talk', 'idle'], salute: ['salute', 'gesture_offer', 'idle'],
  nod: ['nod', 'understand', 'idle'], sweep: ['sweep', 'think', 'idle'], carry: ['carry', 'idle'],
  // the musician's lute hangs on her back: no playing pose (the shared `play` clip bows a violin)
  play: ['play_instrument', 'idle_look', 'idle_shift', 'idle'], counter: ['counter', 'counter_loop', 'think', 'idle'],
  sit: ['sit', 'sit_loop', 'idle'], think: ['idle_look', 'think', 'idle'],
});

/** The first clip of the chain that the list of available names has (or null). */
export function pickClip(names, want) {
  const chain = CLIP_FALLBACK[want] || [want, 'idle'];
  for (const n of chain) if (names.includes(n)) return n;
  return null;
}

const fwd = (h) => [Math.sin(h), 0, Math.cos(h)];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Where a shopkeeper stands in the street: beside the door of the shop, facing out. */
export function doorStand(id, side = 1.4, out = 1.3) {
  const d = shop(id).door, f = fwd(d.heading), r = [f[2], 0, -f[0]];
  return { position: add(add(d.position, f, -out), r, side), heading: d.heading + Math.PI };
}

/** Splits a polyline into pieces of about `every` metres (work stops along a route). */
export function chop(points, every) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / every));
    for (let k = 0; k < n; k++) out.push([add(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], k / n), add(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], (k + 1) / n)]);
  }
  return out;
}

const stay = (seconds, clip, extra = {}) => ({ stay: seconds, clip, ...extra });

/** A closed running loop inside a play area (seeded wobble, never outside 80 % of its radius). */
export function playLoop(area, seed, n = 10) {
  const rng = seededRng('play:' + seed), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = area.radius * (0.5 + 0.3 * rng());
    pts.push([area.center[0] + Math.cos(a) * r, area.center[1], area.center[2] + Math.sin(a) * r]);
  }
  return pts;
}

function programs() {
  const post = (pt, steps) => ({ home: pt.position, heading: pt.heading, steps });
  // The keepers of the square stand in front of their doors, clear of the crates and stalls along the house walls.
  const ex = doorStand('exchange', 0, 2.3), sc = doorStand('scribe', 0, 2.3), inn = doorStand('inn');
  // The musician steps away from the post beside the exported point, toward the square.
  const mu = { position: add(P.npc_musician.position, fwd(P.npc_musician.heading), 1.0), heading: P.npc_musician.heading };
  const sq = R.npc_route_square_round.points; // [NW, NE, SE, SW] corners of the walk round the square
  const zS = sq[2][2], y = sq[0][1];
  // The two shopkeepers of the square meet at the chat points, talk, and walk back to their doors.
  const exOut = [ex.position, [sq[1][0], y, ex.position[2]], [sq[2][0], y, zS], [P.npc_chat_b.position[0], y, zS], P.npc_chat_b.position];
  const scOut = [sc.position, [sq[0][0], y, sc.position[2]], [sq[3][0], y, zS], [P.npc_chat_a.position[0], y, zS], P.npc_chat_a.position];
  const sweep = [];
  for (const [a, b] of chop([...R.npc_route_sweeper.points, R.npc_route_sweeper.points[0]], 7)) sweep.push({ walk: [a, b] }, stay(7, 'sweep'));
  const lamp = [];
  { const pts = R.npc_route_lamplighter.points;
    for (let i = 0; i < pts.length; i++) { lamp.push({ walk: [pts[i], pts[(i + 1) % pts.length]] }); if (i % 2 === 0) lamp.push(stay(6, 'think')); } }
  const cr = R.npc_route_courier.points, rest = P.npc_courier_rest;
  const courier = [{ walk: cr }, stay(9, 'idle_shift'), { walk: cr.slice().reverse() }, { walk: [cr[0], cr[1], [-1.5, cr[1][1], cr[1][2]], rest.position] },
    stay(14, 'idle_shift', { heading: rest.heading }), { walk: [rest.position, [-1.5, cr[1][1], cr[1][2]], cr[1], cr[0]] }];
  const loop = playLoop(A.npc_children_play, 'tag');
  const half = Math.floor(loop.length / 2);
  const run = (from, to) => ({ walk: [...loop, ...loop].slice(from, to + 1), gait: 'run' });
  return {
    guard: post(P.npc_gate_guard, [stay(16, 'idle'), stay(9, 'idle_shift'), stay(5, 'think')]),
    shardkeeper: { home: ex.position, heading: ex.heading, steps: [stay(40, 'idle', { heading: ex.heading, greet: 'wave' }), stay(12, 'idle_shift', { heading: ex.heading, greet: 'wave' }),
      { walk: exOut }, { meet: 'scribe', seconds: 34, clip: 'talk', face: P.npc_chat_a.position }, { walk: exOut.slice().reverse() }] },
    scribe: { home: sc.position, heading: sc.heading, steps: [stay(30, 'idle', { heading: sc.heading, greet: 'wave' }), stay(14, 'think', { heading: sc.heading, greet: 'wave' }),
      { walk: scOut }, { meet: 'shardkeeper', seconds: 34, clip: 'talk_b', face: P.npc_chat_b.position }, { walk: scOut.slice().reverse() }] },
    innkeeper: post(inn, [stay(18, 'idle', { greet: 'wave' }), stay(10, 'counter', { greet: 'wave' }), stay(8, 'idle_shift', { greet: 'wave' })]),
    baker: post(P.npc_market_seller_square, [stay(14, 'counter', { greet: 'wave' }), stay(10, 'idle', { greet: 'wave' }), stay(6, 'idle_shift', { greet: 'wave' })]),
    shrinekeeper: post(P.npc_shrine_keeper, [stay(20, 'idle', { greet: 'nod' }), stay(10, 'idle_shift', { greet: 'nod' })]),
    elder: post(P.npc_bench_0, [stay(60, 'sit', { sit: P.npc_bench_0.seatHeight, greet: 'nod' })]),
    musician: post(mu, [stay(26, 'play'), stay(6, 'idle_shift'), stay(18, 'play'), stay(5, 'idle', { greet: 'wave' })]),
    sweeper: { home: R.npc_route_sweeper.points[0], heading: null, steps: sweep },
    lamplighter: { home: R.npc_route_lamplighter.points[0], heading: null, steps: lamp },
    courier: { home: cr[0], heading: null, steps: courier },
    child_b: { home: loop[0], heading: null, steps: [run(0, half), stay(3, 'idle'), run(half, loop.length), stay(6, 'idle_shift')] },
    child_a: { home: loop[half], heading: null, steps: [run(half, loop.length), stay(3.4, 'idle'), run(loop.length, loop.length + half), stay(5.6, 'idle_shift')] },
  };
}

export const PROGRAMS = Object.freeze(programs());

/**
 * Hired agents trade at the Shard Exchange (owner update, 11.11): the walk from where a townsperson stands to the
 * Exchange door, by the main street and across the square (town-local metres). Until the shop interior opens, they
 * stand at the door under the trading board.
 */
export function tradePath(from, slot = 0) {
  const route = TOWN_DATA.route, ex = doorStand('exchange', -1.2 + slot * 0.9, 1.6), sq = R.npc_route_square_round.points;
  let near = 0, best = Infinity;
  for (let i = 0; i < route.length; i++) { const d = Math.hypot(route[i][0] - from[0], route[i][2] - from[2]); if (d < best) { best = d; near = i; } }
  const squareIn = route.findIndex((p) => p[2] < 0); // the first route point on the square
  const path = [from.slice()];
  if (near <= squareIn) for (let i = near; i <= squareIn; i++) path.push(route[i].slice());
  else path.push(route[squareIn].slice());
  path.push([sq[1][0], ex.position[1], ex.position[2]], ex.position.slice());
  return { path, heading: ex.heading };
}

/** The temporary program of a hired agent: walk to the Exchange, trade at the door; `back` walks home and resumes. */
export function tradeProgram(plan, slot = 0) {
  const { path, heading } = tradePath([plan.x, plan.y, plan.z], slot);
  return { home: path[0], heading, steps: [{ walk: path }, { stay: 1e9, clip: 'idle', heading }] };
}
export function homeProgram(plan, original) {
  const { path } = tradePath(original.home, 0);
  const back = path.slice().reverse(); back[0] = [plan.x, plan.y, plan.z];
  return { home: back[0], heading: original.heading, steps: [{ walk: back }, { restore: original }] };
}

const polyLength = (pts) => { let s = 0; for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]); return s; };

/** Point and direction at distance s along a polyline. Writes into out {x, y, z, dx, dz, corner}. */
export function polyAt(pts, s, out) {
  let i = 0, acc = 0, len = 0;
  for (; i + 1 < pts.length; i++) {
    len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    if (s <= acc + len || i + 2 === pts.length) break;
    acc += len;
  }
  const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], k = len > 1e-6 ? Math.min(1, Math.max(0, (s - acc) / len)) : 0;
  out.x = a[0] + (b[0] - a[0]) * k; out.y = a[1] + (b[1] - a[1]) * k; out.z = a[2] + (b[2] - a[2]) * k;
  const flat = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (flat > 1e-6) { out.dx = (b[0] - a[0]) / flat; out.dz = (b[2] - a[2]) / flat; }
  out.corner = Math.min(s - acc, acc + len - s); // metres to the nearest vertex of the polyline
  return out;
}

const turnTo = (yaw, want, max) => { const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)); return yaw + Math.max(-max, Math.min(max, d)); };

/**
 * One townsperson's state machine. `step(dt, ctx)` advances it and leaves the pose request in the public fields:
 * x, y, z (town-local), yaw, speed (metres per second actually moved this step), gait ('walk' | 'run'),
 * clip (the activity wanted while standing, a CLIP_FALLBACK key), sit (seat height or 0), talking.
 * ctx: {iris: [x, y, z] | null (town-local), reduced: boolean, others: Map<key, Person>}
 */
export class PersonPlan {
  constructor(def, program = PROGRAMS[def.key], seed = 'town') {
    this.def = def; this.key = def.key; this.program = program;
    this.rng = seededRng(seed + ':' + def.key);
    this.x = program.home[0]; this.y = program.home[1]; this.z = program.home[2];
    this.yaw = program.heading || 0; this.speed = 0; this.gait = 'walk'; this.clip = 'idle'; this.sit = 0;
    this.walkSpeed = def.walk; this.runSpeed = def.run || 0; // the renderer sets them to the loaded clips' own speeds
    this.index = -1; this.t = 0; this.until = 0; this.s = 0; this.len = 0; this.side = 0;
    this.meeting = false; this.waited = 0; this.greeted = false; this.greetUntil = 0; this.yielding = false;
    this._p = { x: 0, y: 0, z: 0, dx: 0, dz: 1, corner: 0 };
    this.next();
  }

  get current() { return this.program.steps[this.index]; }

  next() {
    this.index = (this.index + 1) % this.program.steps.length;
    if (this.current.restore) { this.program = this.current.restore; this.index = -1; return this.next(); } // back home: the own loop again
    const st = this.current;
    this.t = 0; this.s = 0; this.meeting = false; this.waited = 0;
    if (st.walk) this.len = polyLength(st.walk);
    else if (st.stay) this.until = st.stay * (0.85 + 0.3 * this.rng());
  }

  step(dt, ctx) {
    const st = this.current, iris = ctx.iris;
    this.speed = 0;
    const dIris = iris ? Math.hypot(iris[0] - this.x, iris[2] - this.z) + Math.abs(iris[1] - this.y) * 2 : Infinity;
    this.near = dIris;
    if (ctx.reduced) { this.clip = st.stay && st.sit ? st.clip : this.sit ? this.clip : 'idle'; this.side += (0 - this.side) * Math.min(1, dt * 4); return; } // steady: everyone holds still
    this.t += dt;
    if (st.walk) {
      const run = st.gait === 'run' && this.def.run;
      const top = run ? this.runSpeed : (st.speed || this.walkSpeed);
      const p = polyAt(st.walk, this.s, this._p);
      // slow into sharp corners and the end of the path, ease out of the start
      let v = top * Math.min(1, 0.35 + p.corner * 1.3, 0.3 + (this.len - this.s) * 1.5, 0.3 + this.t * 1.6);
      // Iris in the way: wait and lean aside rather than walk through her
      let ahead = 0;
      if (iris && dIris < YIELD_RADIUS * 1.8) ahead = (iris[0] - this.x) * p.dx + (iris[2] - this.z) * p.dz;
      this.yielding = dIris < YIELD_RADIUS && ahead > 0;
      if (this.yielding) v = 0;
      let sideWant = 0;
      if (iris && dIris < YIELD_RADIUS * 1.8 && !run) sideWant = ((iris[0] - this.x) * p.dz - (iris[2] - this.z) * p.dx) > 0 ? -SIDE_STEP : SIDE_STEP;
      this.side += (sideWant - this.side) * Math.min(1, dt * 2.5);
      const ds = Math.min(v * dt, this.len - this.s);
      this.s += ds; this.speed = dt > 0 ? ds / dt : 0; this.gait = run ? 'run' : 'walk';
      polyAt(st.walk, this.s, p);
      this.x = p.x + p.dz * this.side; this.y = p.y; this.z = p.z - p.dx * this.side;
      this.yaw = turnTo(this.yaw, Math.atan2(p.dx, p.dz), dt * (run ? 7 : 4.5));
      this.clip = 'idle'; this.sit = 0;
      if (this.s >= this.len - 1e-4) this.next();
      return;
    }
    this.side += (0 - this.side) * Math.min(1, dt * 3);
    let face = st.face || null;
    const heading = st.heading ?? this.program.heading;
    if (st.meet) {
      const other = ctx.others && ctx.others.get(st.meet);
      const there = other && other.current.meet === this.key;
      if (there && !this.meeting) { this.meeting = true; this.t = 0; }
      if (!this.meeting) { this.waited += dt; this.clip = 'idle_shift'; if (this.waited > 75) this.next(); }
      else {
        // take turns: one talks while the other listens, swapping every few seconds (the lower key starts)
        const mine = (Math.floor(this.t / 5.5) % 2 === 0) === (this.key < st.meet);
        this.clip = mine ? st.clip : 'listen';
        if (this.t >= st.seconds) this.next();
      }
    } else {
      this.clip = st.clip; this.sit = st.sit || 0;
      // greet Iris once each time she comes close
      if (st.greet && dIris < 4.2 && !this.greeted) { this.greeted = true; this.greetUntil = this.t + 2.6; }
      if (dIris > 8) this.greeted = false;
      if (this.t < this.greetUntil) { if (!st.sit) { this.clip = st.greet; if (iris) face = iris; } } // seated people greet with their look only: the greeting clips stand
      else this.greetUntil = 0;
      if (this.key === 'guard' && dIris < 5 && !this.saluted) { this.saluted = true; this.greetUntil = this.t + 2.4; this._salute = true; }
      if (this.key === 'guard') { if (dIris > 9) this.saluted = false; if (this.t < this.greetUntil && this._salute) this.clip = 'salute'; else this._salute = false; }
      if (this.t >= this.until && this.t >= this.greetUntil) this.next();
    }
    if (face) this.yaw = turnTo(this.yaw, Math.atan2(face[0] - this.x, face[2] - this.z), dt * 3);
    else if (heading != null && !st.walk) this.yaw = turnTo(this.yaw, heading, dt * 3);
  }
}

/** Animation level of detail by distance from Iris: mixer updates every n-th frame, 0 = frozen pose. */
export function animStride(distance, { phone = false, visible = true } = {}) {
  const k = phone ? 0.6 : 1;
  if (!visible) return 0;
  if (distance < 22 * k) return 1;
  if (distance < 45 * k) return 2;
  if (distance < 80 * k) return 4;
  return 0;
}
