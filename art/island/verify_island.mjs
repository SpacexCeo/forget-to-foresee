// Checks island.glb against game/src/scenes/layout.js (the gameplay and collision truth):
// socket positions and yaw, walkable collision at height 0 over every platform and bridge,
// rail and parapet inner faces, open bridge mouths, triangle counts.
// Usage: NODE_PATH=<gltf-transform cli node_modules> node art/island/verify_island.mjs <island.glb>
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(process.env.NODE_PATH.replace(/\/?$/, '/') + 'x.js');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');

const here = dirname(fileURLToPath(import.meta.url));
const L = await import(pathToFileURL(join(here, '..', '..', 'game', 'src', 'scenes', 'layout.js')).href);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

const fails = [];
const report = {};
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// ---- sockets
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const yawOf = (q) => 2 * Math.atan2(q[1], q[3]);
const angDiff = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
const near = (a, b, t = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < t);
let maxPosErr = 0;
function sock(name, pos, yaw) {
  const n = nodes.get(name);
  if (!n) { fails.push('missing ' + name); return; }
  const p = n.getWorldTranslation();
  const err = Math.max(...p.map((v, i) => Math.abs(v - pos[i])));
  maxPosErr = Math.max(maxPosErr, err);
  check(err < 1e-3, `${name} at ${p.map((v) => v.toFixed(3))} expected ${pos.map((v) => v.toFixed(3))}`);
  if (yaw !== undefined) check(angDiff(yawOf(n.getRotation()), yaw) < 1e-3, `${name} yaw ${yawOf(n.getRotation())} expected ${yaw}`);
}
for (const c of L.CAMPS) sock('socket_camp_' + c.id, c.position, c.rotationY);
for (const z of L.ANCHOR_ZONES) sock('socket_anchor_zone_' + z.shell, z.position, z.anchorRotationY);
sock('socket_spawn', L.SPAWN, L.facePlaza(L.BALCONY.angle));
sock('socket_scroll', L.SCROLL_TABLE.position);
report.socket_max_position_error_m = maxPosErr;

// ---- triangles in world space
function tris(filter) {
  const out = [];
  let count = 0;
  for (const n of root.listNodes()) {
    const mesh = n.getMesh();
    if (!mesh || !filter(n.getName())) continue;
    const m = n.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const nIdx = idx ? idx.getCount() : pos.getCount();
      const P = (i) => { const v = pos.getElement(i, []); return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; };
      for (let i = 0; i < nIdx; i += 3) {
        const a = idx ? idx.getScalar(i) : i, b = idx ? idx.getScalar(i + 1) : i + 1, c = idx ? idx.getScalar(i + 2) : i + 2;
        out.push([P(a), P(b), P(c)]);
        count++;
      }
    }
  }
  return { tris: out, count };
}
const walk = tris((n) => n === 'island_walk_col');
const wall = tris((n) => n === 'island_wall_col');
const render = tris((n) => !n.endsWith('_col'));
report.triangles = { runtime: render.count, walk_col: walk.count, wall_col: wall.count };
let minY = Infinity, maxY = -Infinity;
for (const t of render.tris) for (const p of t) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
report.render_y_range_m = [+minY.toFixed(2), +maxY.toFixed(2)];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function ray(T, o, d, maxT = 1e9) {
  let best = Infinity;
  for (const [a, b, c] of T) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) * inv;
    if (t > 1e-6 && t < best && t < maxT) best = t;
  }
  return best;
}
const groundAt = (x, z) => { const t = ray(walk.tris, [x, 10, z], [0, -1, 0]); return t === Infinity ? null : 10 - t; };

// ---- walkable surfaces
let walkSamples = 0, walkMaxErr = 0;
function mustWalk(x, z, what) {
  const y = groundAt(x, z);
  walkSamples++;
  if (y === null) { fails.push(`no ground at ${what} (${x.toFixed(2)}, ${z.toFixed(2)})`); return; }
  walkMaxErr = Math.max(walkMaxErr, Math.abs(y));
  check(Math.abs(y) < 1e-3, `ground at ${what} is ${y}`);
}
for (const p of L.platforms()) {
  mustWalk(p.center[0], p.center[2], p.id);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * 2 * Math.PI;
    for (const f of [0.5, 0.95]) mustWalk(p.center[0] + Math.cos(a) * p.radius * f, p.center[2] + Math.sin(a) * p.radius * f, p.id + ' rim');
  }
}
const bridgeRep = {};
for (const br of L.bridges()) {
  const [ax, , az] = br.from, [bx, , bz] = br.to;
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, lx = -dz, lz = dx;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    for (const s of [-0.95, 0, 0.95]) mustWalk(ax + (bx - ax) * t + lx * s, az + (bz - az) * t + lz * s, br.id);
  }
  // mid span: off the deck is a drop (no walk collision within 1.5 m below)
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const s of [-1.7, 1.7]) { const y = groundAt(mx + lx * s, mz + lz * s); check(y === null || y < -1.5, `${br.id}: walk collision outside the deck (${y})`); }
  // rails: horizontal rays from the axis at 0.5 m hit the inner rail face at 1.0 m
  const hits = [-1, 1].map((s) => ray(wall.tris, [mx, 0.5, mz], [lx * s, 0, lz * s], 5));
  for (const h of hits) check(Math.abs(h - 1.0) < 0.02, `${br.id}: rail inner face at ${h}`);
  // the whole bridge axis is open at waist height from deck start to end (no parapet across the mouth)
  const open = ray(wall.tris, [ax - dx * 1.0, 0.5, az - dz * 1.0], [dx, 0, dz], len + 2.0);
  check(open === Infinity, `${br.id}: wall across the walkway at ${open}`);
  // rail tops at RAIL_HEIGHT
  const top = ray(wall.tris, [mx + lx * 1.1, 5, mz + lz * 1.1], [0, -1, 0]);
  check(Math.abs(5 - top - L.RAIL_HEIGHT) < 0.01, `${br.id}: rail top at ${5 - top}`);
  bridgeRep[br.id] = { from_xz: [+ax.toFixed(3), +az.toFixed(3)], to_xz: [+bx.toFixed(3), +bz.toFixed(3)], length_m: +len.toFixed(2), rail_inner_m: hits.map((h) => +h.toFixed(3)) };
}
report.bridges = bridgeRep;
report.walk_samples = walkSamples;
report.walk_max_height_error_m = walkMaxErr;

// ---- parapets: closed except at the bridge mouths
const parRep = {};
for (const p of L.platforms()) {
  const opens = L.parapetOpenings(p.id);
  let closed = 0, open = 0, leaks = [];
  for (let k = 0; k < 72; k++) {
    const deg = k * 5 + 2.5, a = (deg * Math.PI) / 180;
    const d = [Math.cos(a), 0, Math.sin(a)];
    const h = ray(wall.tris, [p.center[0], 0.5, p.center[2]], d, p.radius + 1.5);
    const nearOpen = opens.some((o) => angDiff((o * Math.PI) / 180, a) < Math.asin(1.0 / (p.radius - 0.4)) - 0.01);
    if (nearOpen) { open++; check(h === Infinity || h > p.radius - 0.2, `${p.id}: bridge mouth at ${deg} blocked at ${h}`); }
    else if (h !== Infinity && Math.abs(h - (p.radius - 0.35)) < 0.2) closed++;
    else leaks.push(deg);
  }
  parRep[p.id] = { rays_closed: closed, rays_through_openings: open, leaks };
  // a leak is only allowed right beside an opening (where a ray grazes the rail ends)
  for (const deg of leaks) {
    const a = (deg * Math.PI) / 180;
    check(opens.some((o) => angDiff((o * Math.PI) / 180, a) < 0.35), `${p.id}: parapet gap at ${deg} deg`);
  }
}
report.parapets = parRep;

console.log(JSON.stringify(report, null, 1));
if (fails.length) { console.log('FAIL', fails.length); for (const f of fails.slice(0, 40)) console.log(' -', f); process.exit(1); }
console.log('OK: island.glb matches layout.js');
