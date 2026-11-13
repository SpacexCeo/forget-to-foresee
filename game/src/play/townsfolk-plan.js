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
import { townPaths, addTownLines, createPathGraph, nearestNode, pathBetween } from './town-paths.js';
import { detour } from '../scenes/town-footprints.js';

const P = TOWN_DATA.npc.points, R = TOWN_DATA.npc.routes, A = TOWN_DATA.npc.areas;
const shop = (id) => TOWN_DATA.shops.find((s) => s.id === id);

/** Iris this close is looked at (head and eyes). */
export const LOOK_RADIUS = 6;
/** Iris this close and in the way stops a walker (it waits and steps a little aside instead of walking through her). */
export const YIELD_RADIUS = 1.3;
export const SIDE_STEP = 0.45;
/** Every body is 0.35 m round: two centres never come closer than this (owner 13.11). */
export const BODY_RADIUS = 0.35, MIN_GAP = 0.6;
/** How far ahead a walker looks for bodies, and how wide it leans round a standing one. */
export const LOOK_AHEAD = 2.2, PASS_STEP = 0.75;
/**
 * The bodies a walker must keep clear of (pure): other townsfolk (ctx.others, a Map of plans), Iris (ctx.iris) and
 * other heroines (ctx.bodies(): [[x, y, z], ...]). Same level only. `oncoming`: walking towards me; `iYield`: of two
 * walkers meeting head-on the later key waits.
 */
/** The lean offset moves towards its target at most LEAN_SPEED m/s (pure). */
export const LEAN_SPEED = 0.6;
export function easeOffset(ox, oz, tx, tz, dt) {
  const dx = tx - ox, dz = tz - oz, d = Math.hypot(dx, dz), m = LEAN_SPEED * dt;
  return d <= m ? [tx, tz] : [ox + dx / d * m, oz + dz / d * m];
}
export function bodiesAround(me, ctx) {
  const out = [], level = (y) => Math.abs(y - me.y) < 1.2;
  if (ctx.others) for (const o of ctx.others.values()) {
    if (o === me || !level(o.y)) continue;
    const walking = o.speed > 0.05 || (o.current && o.current.walk && !o.yielding), od = o._p || { dx: 0, dz: 0 }, md = me._p;
    const oncoming = walking && od.dx * md.dx + od.dz * md.dz < -0.3;
    out.push({ x: o.x, z: o.z, walking, oncoming, iYield: oncoming && me.key > o.key, key: o.key });
  }
  if (ctx.iris && level(ctx.iris[1])) out.push({ x: ctx.iris[0], z: ctx.iris[2], walking: false, iris: true });
  if (ctx.bodies) for (const b of ctx.bodies() || []) if (level(b[1])) out.push({ x: b[0], z: b[2], walking: false, iris: true });
  return out;
}

/**
 * The cast: asset name, authored clip speeds (metres per second of the model's own walk and run clips) and
 * the standing height (docs/townsfolk.md). `walk` is also the speed the person moves at, so feet never slide.
 */
/** The five quest givers wear their own models (art/townsfolk/npc_build.py: npc_<key>.glb on the shared rig); the rest keep townsfolk_<key>. */
export const QUEST_GIVERS = new Set(['guard', 'innkeeper', 'elder', 'lamplighter', 'shardkeeper']);

export const TOWNSFOLK = Object.freeze([
  { key: 'guard', height: 1.80, walk: 1.30 },
  { key: 'shardkeeper', height: 1.70, walk: 1.20 },
  { key: 'scribe', height: 1.76, walk: 1.20 },
  { key: 'innkeeper', height: 1.65, walk: 1.15 },
  { key: 'baker', height: 1.72, walk: 1.15 },
  { key: 'shrinekeeper', height: 1.60, walk: 0.95 },
  { key: 'elder', height: 1.70, walk: 1.15 }, // a grown man's pace and the normal walk (owner 13.11: "he is not a grandpa")
  { key: 'musician', height: 1.74, walk: 1.25 },
  { key: 'sweeper', height: 1.62, walk: 1.20 },
  { key: 'lamplighter', height: 1.70, walk: 1.30 },
  { key: 'courier', height: 1.68, walk: 1.55 },
  { key: 'child_a', height: 1.32, walk: 1.10, run: 2.6 },
  { key: 'child_b', height: 1.22, walk: 1.20, run: 2.6 },
].map((p) => Object.freeze({ ...p, asset: (QUEST_GIVERS.has(p.key) ? 'npc_' : 'townsfolk_') + p.key })));

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

/**
 * Route data fixed against the town's colliders (owner 13.11: no walking through stalls, posts or rails; found by
 * scripts/record-town-ground.mjs): the square round keeps 2.6 m inside the stalls along its east and west sides, and
 * the lamplighter's diagonals across the mid terrace turn on the terrace street (0, 2.5, 9) instead of brushing the
 * upper stairs' rails.
 */
export const SQUARE_ROUND = Object.freeze(R.npc_route_square_round.points.map((p) => Object.freeze([Math.sign(p[0]) * 8.4, p[1], p[2]])));
const TERRACE_TURN = Object.freeze([0, 2.5, 9.0]);
/** The lower lane west of the big stairs (the sound half of the exported lower stroll): joins the children's play spot. */
const LOWER_LANE = Object.freeze([[-30, 0, 20], [-8, 0, 20], [-4.6, 0, 20.2]]);
export function lampRoute() {
  const pts = R.npc_route_lamplighter.points, out = [];
  const foot = (p) => p[0] === 0 && p[1] === 2.5 && p[2] === 3.4, wide = (p) => p && p[1] === 2.5 && Math.abs(p[0]) > 5;
  for (let i = 0; i < pts.length; i++) {
    if (foot(pts[i]) && wide(pts[i - 1])) out.push(TERRACE_TURN.slice());
    out.push(pts[i]);
    if (foot(pts[i]) && wide(pts[i + 1])) out.push(TERRACE_TURN.slice());
  }
  return out;
}

function programs() {
  const post = (pt, steps) => ({ home: pt.position, heading: pt.heading, steps });
  // The keepers of the square stand in front of their doors, clear of the crates and stalls along the house walls.
  const ex = doorStand('exchange', 0, 2.3), sc = doorStand('scribe', 0, 2.3), inn = doorStand('inn');
  // The musician steps away from the post beside the exported point, toward the square.
  const mu = { position: add(P.npc_musician.position, fwd(P.npc_musician.heading), 1.0), heading: P.npc_musician.heading };
  const sq = SQUARE_ROUND; // [NW, NE, SE, SW] corners of the walk round the square
  const zS = sq[2][2], y = sq[0][1];
  // The two shopkeepers of the square meet at the chat points, talk, and walk back to their doors.
  const exOut = [ex.position, [sq[1][0], y, ex.position[2]], [sq[2][0], y, zS], [P.npc_chat_b.position[0], y, zS], P.npc_chat_b.position];
  const scOut = [sc.position, [sq[0][0], y, sc.position[2]], [sq[3][0], y, zS], [P.npc_chat_a.position[0], y, zS], P.npc_chat_a.position];
  const sweep = [];
  for (const [a, b] of chop([...R.npc_route_sweeper.points, R.npc_route_sweeper.points[0]], 7)) sweep.push({ walk: [a, b] }, stay(7, 'sweep'));
  const lamp = [];
  { const pts = lampRoute();
    for (let i = 0; i < pts.length; i++) { lamp.push({ walk: [pts[i], pts[(i + 1) % pts.length]] }); if (i % 2 === 0) lamp.push(stay(6, 'think')); } }
  const cr = R.npc_route_courier.points, rest = P.npc_courier_rest;
  const courier = [{ walk: cr }, stay(9, 'idle_shift'), { walk: cr.slice().reverse() }, { walk: [cr[0], cr[1], [-1.5, cr[1][1], cr[1][2]], [-1.5, cr[1][1], 20.2], [-4.6, cr[1][1], 20.2], [-4.6, cr[1][1], rest.position[2]], rest.position] }, // round the end of the stairs' side wall
    stay(14, 'idle_shift', { heading: rest.heading }), { walk: [rest.position, [-4.6, cr[1][1], rest.position[2]], [-4.6, cr[1][1], 20.2], [-1.5, cr[1][1], 20.2], [-1.5, cr[1][1], cr[1][2]], cr[1], cr[0]] }];
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

/** Every walk keeps clear of the placed props (scenes/town-footprints.js: the wheel, the boards, the Gate-Loom, the Hatchkeeper). */
const clearOfProps = (progs) => { for (const prog of Object.values(progs)) for (const st of prog.steps || []) if (st.walk) st.walk = detour(st.walk); return progs; };
export const PROGRAMS = Object.freeze(clearOfProps(programs()));

/** Trade slots at the Exchange door: along the front away from the trading board (scenes/town-footprints.js). */
const EX_SLOT = (slot) => -0.3 - (slot % 5) * 0.8;
/** The fixed town lines: the jury route Iris walks and the exported NPC routes (loops closed). The lower stroll and the
 * west loop are left out (nobody walks them: one crosses the foot of the big stairs, the other brushes a crate). */
export function townLines() {
  const lines = [detour(TOWN_DATA.route), LOWER_LANE];
  for (const [name, r] of Object.entries(R)) {
    if (name === 'npc_route_stroll_lower' || name === 'npc_route_west_loop') continue; // unused: across the stair foot / a crate
    const pts = name === 'npc_route_square_round' ? SQUARE_ROUND : name === 'npc_route_lamplighter' ? lampRoute() : r.points;
    lines.push(detour(/round|loop|sweeper/.test(name) ? [...pts, pts[0]] : pts));
  }
  return lines;
}
/** Posts behind a counter leave round it first (town-local waypoints): the baker's stall stands between her and the square. */
const POST_EXITS = Object.freeze({ baker: Object.freeze([Object.freeze([13.1, 4.5, -6.4])]) });
/** Where a post's walker joins the paths: a seated post (the elder's bench) stands up in front of the seat first. */
const standOf = (prog) => { const st = (prog.steps || []).find((x) => x.stay && x.sit); return st && prog.heading != null ? add(prog.home, fwd(prog.heading), 0.9) : prog.home; };
// The path graph (play/town-paths.js): every program walk is an edge chain; each post, stand and the Exchange door
// (all trade slots) joins the nearest node with a short connector, so trade and home walks stay on the graph.
{
  const walks = []; for (const prog of Object.values(PROGRAMS)) for (const st of prog.steps || []) if (st.walk) walks.push(st.walk);
  const base = createPathGraph([...townLines(), ...walks]), links = [];
  const join = (pt) => { const n = base.nodes[nearestNode(base, pt)]; if (Math.hypot(n[0] - pt[0], n[2] - pt[2]) > 0.05) links.push([pt.slice(), n.slice()]); };
  for (const [k, prog] of Object.entries(PROGRAMS)) { // a seated post stands up first (the seat is not a path); a counter post walks round it
    const exits = POST_EXITS[k];
    if (exits) { const chain = [prog.home, ...exits]; for (let i = 0; i + 1 < chain.length; i++) links.push([chain[i].slice(), chain[i + 1].slice()]); join(exits[exits.length - 1]); }
    else join(standOf(prog));
  }
  for (let slot = 0; slot < 4; slot++) join(doorStand('exchange', EX_SLOT(slot), 1.6).position);
  addTownLines([...townLines(), ...walks, ...links]);
}

/**
 * Hired agents trade at the Shard Exchange (owner update, 11.11): the walk from where a townsperson stands to the
 * Exchange door, by the main street and across the square (town-local metres). Until the shop interior opens, they
 * stand at the door under the trading board.
 */
export function tradePath(from, slot = 0) {
  const ex = doorStand('exchange', EX_SLOT(slot), 1.6);
  return { path: pathBetween(townPaths(), from, ex.position), heading: ex.heading }; // along the path graph only
}

/** At most this many townsfolk stand trading at the Exchange door at once (owner 13.11: "they all stand there and never leave"). */
export const TRADE_MAX = 3;
/**
 * May `key` walk to the Exchange to trade now (pure)? Never a quest giver: it holds its post, so its marker and its talk stay
 * where the player looks for them (a hired giver keeps its badge). Others only while fewer than TRADE_MAX are there.
 */
export const mayTrade = (key, tradingNow) => !QUEST_GIVERS.has(key) && tradingNow < TRADE_MAX;

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
    this.x = program.home[0]; this.y = program.home[1]; this.z = program.home[2]; this.px = this.x; this.pz = this.z; this.ox = 0; this.oz = 0;
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
      // Bodies (owner 13.11: nobody walks through anybody): every other townsperson, Iris and other heroines are 0.35 m
      // round. Someone ahead on the line: lean aside; a walker coming the other way: both keep to their own side and
      // the one that yields (the later key) waits until the other has passed; a standing body: lean wider round it.
      // Hard rule: a step that would bring two centres closer than MIN_GAP (and closer than they were) is not taken.
      const bodies = bodiesAround(this, ctx);
      let sideWant = 0, wait = false;
      for (const b of bodies) {
        const rx = b.x - this.x, rz = b.z - this.z, d = Math.hypot(rx, rz);
        const ahead = rx * p.dx + rz * p.dz, across = rx * p.dz - rz * p.dx; // along my way / to my side (centre to centre)
        if (ahead <= 0.05 || d > LOOK_AHEAD) continue;
        const lean = b.iris ? SIDE_STEP : b.walking ? SIDE_STEP : PASS_STEP, away = b.oncoming ? -lean : (across > 0 ? -lean : lean); // head-on: both keep to the same hand
        if (Math.abs(sideWant) < lean) sideWant = away;
        const clear = Math.abs(across) >= MIN_GAP + 0.05; // already wide enough to pass
        if (b.iris) { if (d < YIELD_RADIUS) wait = true; } // Iris: always wait for her (and lean a little)
        else if (b.oncoming) { if (b.iYield && !clear && d < LOOK_AHEAD * 0.8) wait = true; } // the later key waits; the other passes once wide enough
        else if (b.walking) { if (d < MIN_GAP + 0.35 && !clear) wait = true; } // the same way: keep a step behind
        else if (!clear && d < MIN_GAP + 0.5) wait = true; // a standing body: lean round it first
      }
      this.yielding = wait;
      if (wait) v = 0;
      if (run || this.len - this.s < 1.5) sideWant = 0; // no lean while running, nor on the last 1.5 m: a walk ends on its own line
      const side0 = this.side;
      this.side += (sideWant - this.side) * Math.min(1, dt * 2.5);
      const ds = Math.min(v * dt, this.len - this.s);
      const s1 = this.s + ds, q = polyAt(st.walk, s1, { x: 0, y: 0, z: 0, dx: 0, dz: 1, corner: 0 });
      const closer = (x1, z1) => bodies.some((b) => { const d1 = Math.hypot(b.x - x1, b.z - z1); return d1 < MIN_GAP && d1 < Math.hypot(b.x - this.x, b.z - this.z) - 1e-6; });
      let off = easeOffset(this.ox, this.oz, q.dz * this.side, -q.dx * this.side, dt);
      if (closer(q.x + off[0], q.z + off[1])) off = [this.ox, this.oz]; // the lean may not swing into someone: keep it, try the step alone
      if (closer(q.x + off[0], q.z + off[1])) { this.side = side0; this.yielding = true; this.speed = 0; this.clip = 'idle'; return; }
      this.s = s1; this.speed = dt > 0 ? ds / dt : 0; this.gait = run ? 'run' : 'walk';
      polyAt(st.walk, this.s, p);
      this.ox = off[0]; this.oz = off[1]; // the lean, eased (a corner turns the side direction: no jump)
      this.x = p.x + this.ox; this.y = p.y; this.z = p.z + this.oz;
      this.px = p.x; this.pz = p.z; // the path itself (the side step leans off it; townsfolk.js pulls back when that leaves the ground)
      this.yaw = turnTo(this.yaw, Math.atan2(p.dx, p.dz), dt * (run ? 7 : 4.5));
      this.clip = 'idle'; this.sit = 0;
      if (this.s >= this.len - 1e-4) this.next();
      return;
    }
    this.side += (0 - this.side) * Math.min(1, dt * 3);
    if (this.ox || this.oz) { const off = easeOffset(this.ox, this.oz, 0, 0, dt); this.ox = off[0]; this.oz = off[1]; this.x = this.px + this.ox; this.z = this.pz + this.oz; } // standing: back onto the line
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
