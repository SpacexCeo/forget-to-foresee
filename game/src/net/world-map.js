// World map for the authoritative room: collision worlds, named places, a walk graph and walk
// validation. It reuses the client's pure modules (layout.js, collision.js, character.js) and the
// greybox colliders, so the server checks movement against the same geometry the 3D client walks on.
// No game rules here: positions and proximity only.
import { CollisionWorld, transformTriangles, MASK_PLAYER, rayCast } from '../physics/collision.js';
import { CharacterController, PHYSICS_DT, steerTo } from '../physics/character.js';
import { greyboxColliders } from '../render/greybox.js';
import {
  CAMPS, ANCHOR_ZONES, ANCHOR_ZONE_RADIUS, SCROLL_TABLE, SHARD, SPAWN, KILL_Y, WALK_SPEED, PLAZA_RADIUS,
  CAMP_RING_RADIUS, PLATEAU_RADIUS, BALCONY, onRing, groundDistance,
} from '../scenes/layout.js';

/** Clan ids used by the API, in engine order (engine NAMES index). */
export const CLAN_IDS = ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'];
export const CLAN_NAMES = ['Iris', 'Salt', 'Ash', 'Moss', 'Amber', 'Frost'];
export { WALK_SPEED };

/** Column-major 4x4 matrix (three.js layout) for a translation and a rotation around +Y. */
function trsY(position, rotationY = 0) {
  const c = Math.cos(rotationY), s = Math.sin(rotationY);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, position[0], position[1], position[2], 1];
}

function addProp(world, owner, name, position, rotationY = 0) {
  const m = trsY(position, rotationY);
  for (const c of greyboxColliders(name)) world.addTriangles(owner, transformTriangles(c.tris, m), c.mask);
}

/** The island collision world, placed exactly like scenes/island.js places its props. */
export function buildIslandWorld() {
  const world = new CollisionWorld({ cellSize: 2 });
  addProp(world, 'island', 'island', [0, 0, 0]);
  addProp(world, 'scroll_table', 'scroll_table', SCROLL_TABLE.position);
  for (const c of CAMPS) addProp(world, c.asset, c.asset, c.position, c.rotationY);
  for (const z of ANCHOR_ZONES) addProp(world, 'anchor_' + z.index, 'anchor', z.anchorPosition, z.anchorRotationY);
  const [sx, , sz] = SHARD.position, [pw, ph, pd] = SHARD.pedestal.size;
  world.addBox('shard_pedestal', [sx - pw / 2, 0, sz - pd / 2], [sx + pw / 2, ph, sz + pd / 2]);
  addProp(world, 'shard', 'shard', SHARD.position);
  return world;
}

/** Inside a Shell: the closed interior volume (20 x 12 m, glass wall at z = -6). */
export function buildShellWorld() {
  const world = new CollisionWorld({ cellSize: 2 });
  addProp(world, 'shell_interior', 'shell_interior', [0, 0, 0]);
  return world;
}

export const SHELL_ENTRANCE = Object.freeze([0, 0, 4.5]);
export const SHELL_GLASS = Object.freeze([0, 0, -4.5]);
const RING = 4.2; // plaza walking ring: clear of the Scroll's centre piece and the anchors

/** Proximity radii (meters, ground distance) for world preconditions. */
// camp and anchorZone read layout.js lazily: in the production build the review page's chunks import each other in a
// circle, and a top-level read of PLATEAU_RADIUS there threw "Cannot access before initialization" (review.html).
export const NEAR = Object.freeze({
  get camp() { return PLATEAU_RADIUS - 0.5; }, get anchorZone() { return ANCHOR_ZONE_RADIUS + 0.6; },
  scroll: 4.8, shardPedestal: 3.0, glass: 3.5,
});

/* ---------- named places ---------- */

function campOf(id) { const i = CLAN_IDS.indexOf(id); return i < 0 ? null : CAMPS[i]; }
/** A standing spot inside an anchor zone, 1 m from the anchor toward the plaza centre. */
function zoneSpot(z) { return onRing(6.6 - 1.0, z.angle); }

/**
 * Named places an agent can navigate to: {zone, position}. Zone 'island' or 'shell'.
 * `camp:<clan>`, `anchor_zone:<1..4>`, `scroll`, `shard_pedestal`, `balcony`, `plaza`,
 * inside a Shell: `shell_entrance`, `guest_glass`.
 */
export function placeNames() {
  return ['balcony', 'plaza', 'scroll', 'shard_pedestal', ...CLAN_IDS.map((c) => 'camp:' + c), ...ANCHOR_ZONES.map((z) => 'anchor_zone:' + z.shell), 'shell_entrance', 'guest_glass'];
}
export function placePosition(name) {
  if (name === 'balcony') return { zone: 'island', position: SPAWN.slice() };
  if (name === 'plaza' || name === 'scroll') return { zone: 'island', position: onRing(RING, 90) };
  if (name === 'shard_pedestal') { const p = SHARD.position; const d = onRing(CAMP_RING_RADIUS - 3.2 + 1.4, 270 + 7); return { zone: 'island', position: [d[0], 0, d[2]], target: [p[0], 0, p[2]] }; }
  if (name.startsWith('camp:')) { const c = campOf(name.slice(5)); return c ? { zone: 'island', position: c.position.slice() } : null; }
  if (name.startsWith('anchor_zone:')) { const z = ANCHOR_ZONES[Number(name.slice(12)) - 1]; return z ? { zone: 'island', position: zoneSpot(z) } : null; }
  if (name === 'shell_entrance') return { zone: 'shell', position: SHELL_ENTRANCE.slice() };
  if (name === 'guest_glass') return { zone: 'shell', position: SHELL_GLASS.slice() };
  return null;
}

/* ---------- proximity ---------- */

export const nearCamp = (pos, clan) => { const c = campOf(clan); return !!c && groundDistance(pos, c.position) <= NEAR.camp; };
export const nearAnchorZone = (pos, shell) => { const z = ANCHOR_ZONES[shell - 1]; return !!z && groundDistance(pos, z.position) <= NEAR.anchorZone; };
export const nearScroll = (pos) => groundDistance(pos, SCROLL_TABLE.position) <= NEAR.scroll;
export const nearShardPedestal = (pos) => groundDistance(pos, SHARD.position) <= NEAR.shardPedestal;
export const nearGlass = (pos) => groundDistance(pos, SHELL_GLASS) <= NEAR.glass;
/** Anchor zone shell number (1..4) the position stands in, or 0. */
export function anchorZoneAt(pos) { for (const z of ANCHOR_ZONES) if (groundDistance(pos, z.position) <= NEAR.anchorZone) return z.shell; return 0; }
/** Clan whose camp the position is in, or null. */
export function campAt(pos) { for (let i = 0; i < CAMPS.length; i++) if (groundDistance(pos, CAMPS[i].position) <= NEAR.camp) return CLAN_IDS[i]; return null; }

/* ---------- walk graph (island) ---------- */

function buildGraph() {
  const nodes = new Map(); // id -> [x, 0, z]
  const edges = new Map(); // id -> Set(id)
  const node = (id, p) => { nodes.set(id, p); if (!edges.has(id)) edges.set(id, new Set()); return id; };
  const link = (a, b) => { edges.get(a).add(b); edges.get(b).add(a); };
  const ringAngles = new Set();
  // Camps: centre <- plateau edge <- bridge -> plaza edge -> plaza ring.
  for (let i = 0; i < CAMPS.length; i++) {
    const c = CAMPS[i];
    node('camp:' + CLAN_IDS[i], c.position.slice());
    node('campedge:' + CLAN_IDS[i], onRing(CAMP_RING_RADIUS - PLATEAU_RADIUS + 1.2, c.angle));
    node('plazaedge:' + c.angle, onRing(PLAZA_RADIUS - 1.2, c.angle));
    node('ring:' + c.angle, onRing(RING, c.angle));
    link('camp:' + CLAN_IDS[i], 'campedge:' + CLAN_IDS[i]); link('campedge:' + CLAN_IDS[i], 'plazaedge:' + c.angle); link('plazaedge:' + c.angle, 'ring:' + c.angle);
    ringAngles.add(c.angle);
  }
  // Balcony bridge.
  node('balcony', SPAWN.slice());
  node('balconyedge', onRing(BALCONY.radius - BALCONY.size + 1.2, BALCONY.angle));
  node('plazaedge:' + BALCONY.angle, onRing(PLAZA_RADIUS - 1.2, BALCONY.angle));
  node('ring:' + BALCONY.angle, onRing(RING, BALCONY.angle));
  link('balcony', 'balconyedge'); link('balconyedge', 'plazaedge:' + BALCONY.angle); link('plazaedge:' + BALCONY.angle, 'ring:' + BALCONY.angle);
  ringAngles.add(BALCONY.angle);
  // Anchor zones hang off the ring.
  for (const z of ANCHOR_ZONES) { node('anchor_zone:' + z.shell, zoneSpot(z)); node('ring:' + z.angle, onRing(RING, z.angle)); link('anchor_zone:' + z.shell, 'ring:' + z.angle); ringAngles.add(z.angle); }
  // Shard pedestal next to the Iris camp centre.
  node('shard_pedestal', placePosition('shard_pedestal').position); link('shard_pedestal', 'camp:iris');
  // The ring itself: consecutive angles joined by chords.
  const angles = [...ringAngles].sort((a, b) => a - b);
  for (let k = 0; k < angles.length; k++) link('ring:' + angles[k], 'ring:' + angles[(k + 1) % angles.length]);
  node('scroll', onRing(RING, 90)); // same point as ring:90, kept as an alias
  link('scroll', 'ring:90');
  return { nodes, edges };
}
let GRAPH = null;
export function walkGraph() { return GRAPH || (GRAPH = buildGraph()); }

/** Which walkable region a ground point is on: a platform id, 'bridge:<id>' or null. */
function nearestNodeOnSameRegion(pos) {
  const { nodes } = walkGraph();
  let best = null, bestD = Infinity;
  for (const [id, p] of nodes) { const d = groundDistance(pos, p); if (d < bestD) { best = id; bestD = d; } }
  return best;
}

function dijkstra(from, to) {
  const { nodes, edges } = walkGraph();
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = null, du = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < du) { u = k; du = d; }
    if (u == null) return null;
    if (u === to) break;
    done.add(u);
    for (const v of edges.get(u)) {
      const nd = du + groundDistance(nodes.get(u), nodes.get(v));
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

/** Waypoints [[x, z], ...] from a ground position to a named island place, along the walk graph. */
export function planRoute(fromPos, placeName) {
  const dest = placePosition(placeName);
  if (!dest || dest.zone !== 'island') return null;
  const { nodes } = walkGraph();
  const start = nearestNodeOnSameRegion(fromPos);
  const alias = placeName === 'plaza' ? 'scroll' : placeName; // the plaza's standing spot is the Scroll's
  const goal = nodes.has(alias) ? alias : null;
  if (!goal) return null;
  const ids = dijkstra(start, goal);
  if (!ids) return null;
  const pts = ids.map((id) => nodes.get(id));
  // Skip the first node when we are already past it toward the second one.
  if (pts.length > 1 && groundDistance(fromPos, pts[1]) < groundDistance(pts[0], pts[1])) pts.shift();
  const out = [];
  for (const p of pts) { const q = [round3(p[0]), round3(p[2])]; const l = out[out.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q); }
  return out;
}
const round3 = (v) => Math.round(v * 1000) / 1000;

/* ---------- walk validation ---------- */

/** Is there walkable ground (normal up) under this ground point? */
export function walkableAt(world, x, z) {
  const hit = rayCast(world, [x, 3, z], [0, -1, 0], 6, MASK_PLAYER);
  return !!hit && hit.normal[1] > 0.7 && hit.point[1] > -0.5 && hit.point[1] < 0.8;
}

/**
 * Simulates the kinematic capsule (30 Hz, WALK_SPEED) walking from `from` through the waypoints.
 * The walk is rejected if it falls, gets stuck against geometry or ends away from a waypoint, so a
 * path can never pass through walls or leave the walkable surface. Returns the time it takes and a
 * sampled trail for interpolating the position while in transit.
 */
export function simulateWalk(world, from, waypoints, { speed = WALK_SPEED, maxSeconds = 240, sampleEvery = 0.25 } = {}) {
  for (const [x, z] of waypoints) if (!walkableAt(world, x, z)) return { ok: false, code: 'not_walkable', at: [x, z] };
  const ch = new CharacterController(world, { spawn: [from[0], from[1] ?? 0, from[2]], walkSpeed: speed, killY: KILL_Y });
  ch.grounded = true;
  const trail = [[0, round3(from[0]), round3(from[2])]];
  let steps = 0, sinceSample = 0, length = 0;
  const maxSteps = Math.ceil(maxSeconds / PHYSICS_DT);
  for (let w = 0; w < waypoints.length; w++) {
    const last = w === waypoints.length - 1;
    const target = [waypoints[w][0], 0, waypoints[w][1]];
    let best = groundDistance(ch.pos, target), stuck = 0;
    while (true) {
      const wish = steerTo(ch.pos, target, last ? 0.2 : 0.45);
      if (!wish) break;
      // Keep full speed through intermediate waypoints (steerTo slows down near every target).
      const l = Math.hypot(wish[0], wish[1]);
      const dir = last || l === 0 ? wish : [wish[0] / l, wish[1] / l];
      const before = ch.pos.slice();
      ch.step(dir, PHYSICS_DT);
      steps++; sinceSample += PHYSICS_DT;
      length += groundDistance(before, ch.pos);
      if (ch.respawns > 0 || ch.pos[1] < -0.5) return { ok: false, code: 'path_unsafe', at: [round3(before[0]), round3(before[2])] };
      const d = groundDistance(ch.pos, target);
      if (d < best - 0.01) { best = d; stuck = 0; } else if (++stuck > 45) return { ok: false, code: 'path_blocked', at: [round3(ch.pos[0]), round3(ch.pos[2])] };
      if (steps > maxSteps) return { ok: false, code: 'path_too_long' };
      if (sinceSample >= sampleEvery) { trail.push([round3(steps * PHYSICS_DT), round3(ch.pos[0]), round3(ch.pos[2])]); sinceSample = 0; }
    }
  }
  const seconds = round3(steps * PHYSICS_DT);
  trail.push([seconds, round3(ch.pos[0]), round3(ch.pos[2])]);
  return { ok: true, seconds, length: round3(length), end: [round3(ch.pos[0]), 0, round3(ch.pos[2])], trail };
}

/** Position along a trail at `t` seconds after the walk started. */
export function trailPosition(trail, t) {
  if (t <= trail[0][0]) return [trail[0][1], 0, trail[0][2]];
  for (let i = 1; i < trail.length; i++) {
    const [t1, x1, z1] = trail[i];
    if (t <= t1) { const [t0, x0, z0] = trail[i - 1]; const k = t1 > t0 ? (t - t0) / (t1 - t0) : 1; return [round3(x0 + (x1 - x0) * k), 0, round3(z0 + (z1 - z0) * k)]; }
  }
  const e = trail[trail.length - 1];
  return [e[1], 0, e[2]];
}

export { SPAWN, ANCHOR_ZONES, CAMPS };
