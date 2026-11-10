// Evermind, the open city (owner 10.11: one walled hub town where Iris eats, talks, makes friends, takes
// quests, trades and reads live prices; the horizon and the forest around it are scenery, the wall is the edge
// of the world). Pure data in metres, local to CITY_ORIGIN; +Y up, the default camera looks from +Z, so the
// Shell Gate (north, -Z) is ahead of the spawn. Checked by tests/client/city.test.mjs.
// The city shares the island's THREE.Scene far away on +X (the camera's far plane is 500 m), with its own
// collision world, exactly like the Shell interior does.

export const CITY_ORIGIN = Object.freeze([4000, 0, 0]);
export const WALL_RADIUS = 48;       // inner face of the town wall: nobody walks past it
export const WALL_THICKNESS = 2.4;
export const WALL_HEIGHT = 6.5;
export const PLAZA_RADIUS = 11;
export const CITY_WALK_SPEED = 1.7;
/** A low third-person view by default, so the wall, the forest and the horizon are in frame (owner 10.11). */
export const CITY_CAMERA = Object.freeze({ dist: 9, maxDist: 44, pitchOffset: -0.17 });
export const FOREST = Object.freeze({ inner: 58, outer: 300, hills: 330 });

const deg = (d) => (d * Math.PI) / 180;
/** Ground point on a ring; angle 0 = +X (east), 90 = +Z (south, toward the default camera). */
export const ring = (radius, angleDeg) => [Math.cos(deg(angleDeg)) * radius, 0, Math.sin(deg(angleDeg)) * radius];
/** Yaw that turns a model's local +Z toward the city centre from `angleDeg` on a ring. */
export const faceCentre = (angleDeg) => -deg(angleDeg) - Math.PI / 2;

/** Iris arrives on the south side of the plaza, looking north at the Shell Gate. */
export const CITY_SPAWN = Object.freeze({ position: [0, 0, 7.5], heading: Math.PI });

/**
 * Places Iris can use. `radius` is the interaction reach from `position`; `kind` selects the panel.
 * `footprint` (centre-local [w, d], yaw) is the solid part for collision and for keeping residents off it.
 */
export const PLACES = Object.freeze([
  { id: 'gate', kind: 'gate', position: [0, 0, -39.5], radius: 5.5, yaw: 0 },
  { id: 'market', kind: 'market', position: [25, 0, -2], radius: 6.5, yaw: -Math.PI / 2 },
  { id: 'tavern', kind: 'tavern', position: [-24.5, 0, -2], radius: 6, yaw: Math.PI / 2 },
  { id: 'exchange', kind: 'exchange', position: [19, 0, 24], radius: 6, yaw: faceCentre(52) },
  { id: 'board', kind: 'quests', position: [-17, 0, 22], radius: 4, yaw: faceCentre(128) },
  { id: 'fountain', kind: 'fountain', position: [0, 0, 0], radius: 4.2, yaw: 0 },
]);

/** Market stalls on an arc east of the plaza, each selling two goods (economy.js GOODS ids). */
export const STALLS = Object.freeze([-34, -12, 12, 34].map((a, i) => ({
  id: 'stall' + (i + 1), position: ring(31, a), yaw: faceCentre(a), awning: [0xb8643a, 0x4f7f72, 0xc79a3c, 0x7a5a94][i],
})));

/** The five clan envoys who live in the city (the sixth clan is Iris herself). `asset` is the agent model. */
export const RESIDENTS = Object.freeze([
  { id: 'moss', clan: 'moss', asset: 'agent_moh', place: 'tavern', position: [-19.5, 0, -1.5], yaw: Math.PI / 2 },
  { id: 'amber', clan: 'amber', asset: 'agent_yantar', place: 'market', position: [22, 0, -1.5], yaw: -Math.PI / 2 },
  { id: 'frost', clan: 'frost', asset: 'agent_iney', place: 'exchange', position: [15.5, 0, 20.5], yaw: faceCentre(52) },
  { id: 'salt', clan: 'salt', asset: 'agent_sol', place: 'board', position: [-13.8, 0, 19.6], yaw: faceCentre(128) },
  { id: 'ash', clan: 'ash', asset: 'agent_pepel', place: 'gate', position: [4.2, 0, -33.5], yaw: 0 },
]);
export const RESIDENT_REACH = 3.2;

/** Solid boxes [cx, cz, w, d, h, yaw] in city-local metres: buildings and furniture Iris cannot walk through. */
export const SOLIDS = Object.freeze([
  { id: 'tavern_house', box: [-32, -2, 10, 13, 7, 0] },
  { id: 'exchange_hall', box: [24.6, 31.4, 9, 4, 6, faceCentre(52)] },
  { id: 'quest_board', box: [-18.6, 24, 3.6, 0.5, 3, faceCentre(128)] },
  { id: 'gate_pier_l', box: [-5.2, -45, 3.4, 6.5, 11, 0] },
  { id: 'gate_pier_r', box: [5.2, -45, 3.4, 6.5, 11, 0] },
  { id: 'gate_veil', box: [0, -45.2, 7, 1, 9, 0] },
]);

/** Townhouses on a ring inside the wall; the angles skip the gates, the tavern, the market and the Exchange. */
export const HOUSES = Object.freeze([
  -150, -136, -122, -108, -72, -58, -44, 66, 80, 100, 114, 152, 166, 194, 208,
].map((a, i) => ({
  id: 'house' + (i + 1), angle: a, position: ring(41, a), yaw: faceCentre(a),
  size: [5.2 + (i % 3) * 0.9, 5 + ((i * 7) % 4) * 0.5, 3.6 + ((i * 5) % 3) * 0.8], // width, depth, wall height
  tone: i % 4,
})));

export const TOWER_ANGLES = Object.freeze([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]);
/** Lamp posts with a warm light (a few real point lights, the rest emissive only). */
export const LAMPS = Object.freeze([[-9, 0, 9], [9, 0, 9], [-9, 0, -9], [9, 0, -9], [0, 0, -24], [16, 0, 0], [-16, 0, 0], [0, 0, 22], [10, 0, 16], [-9, 0, 15]]);
/** Trees inside the walls (with trunk colliders). */
export const TOWN_TREES = Object.freeze([[-12, 0, -22], [13, 0, -24], [-26, 0, 22], [8, 0, 34], [-6, 0, 36], [33, 0, 14], [-36, 0, -22], [30, 0, -24]]);

/** Small deterministic PRNG (mulberry32) for the scenery: the same forest on every device. */
export function sceneryRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The forest ring outside the wall: [{x, z, scale, kind, hue}], denser near the town, thinning toward the hills.
 * A corridor is left open for the south road. Scenery only: nobody can reach it.
 */
export function forestTrees(count = 1400, seed = 20261110) {
  const rnd = sceneryRng(seed), out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const u = rnd();
    const r = FOREST.inner + (FOREST.outer - FOREST.inner) * u * u; // biased toward the wall
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 0 && Math.abs(x) < 5 + r * 0.02) continue; // the south road
    out.push({ x, z, scale: 0.8 + rnd() * 0.9 + (r > 150 ? 0.4 : 0), kind: rnd() < 0.62 ? 'conifer' : 'broadleaf', hue: rnd() });
  }
  return out;
}

/** Distant hills on the horizon: [{x, z, radius, height}]. */
export function horizonHills(count = 22, seed = 77) {
  const rnd = sceneryRng(seed), out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
    const r = FOREST.hills + rnd() * 50;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, radius: 60 + rnd() * 70, height: 28 + rnd() * 62 });
  }
  return out;
}

/** True when a city-local ground point is inside the walkable town (wall minus a body radius). */
export const insideWalls = (x, z, margin = 0.4) => Math.hypot(x, z) < WALL_RADIUS - margin;

/** The place within reach of a city-local point, nearest first; null when none. */
export function placeAt(x, z) {
  let best = null, bestD = Infinity;
  for (const p of PLACES) {
    const d = Math.hypot(p.position[0] - x, p.position[2] - z);
    if (d < p.radius && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** The resident within reach of a city-local point (positions: {id: [x, y, z]}), nearest first. */
export function residentAt(x, z, positions = null, reach = RESIDENT_REACH) {
  let best = null, bestD = Infinity;
  for (const r of RESIDENTS) {
    const p = (positions && positions[r.id]) || r.position;
    const d = Math.hypot(p[0] - x, p[2] - z);
    if (d < reach && d < bestD) { best = r; bestD = d; }
  }
  return best;
}
