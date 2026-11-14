// Click-to-move over the colliders (owner 14.11): the route goes round a wall instead of into it, climbs a step,
// stops at the nearest reachable point when the click is out of reach, and a plan over a warmed grid is fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNav } from '../../src/physics/nav-grid.js';

// A little world: ground y = 0 over |x|, |z| <= 30 (y = 0.3 for x >= 12: a step), a wall x in [-0.2, 0.2],
// z in [-30, 6], 3 m high; a crate at (6, 0..1, -4) 1.2 m wide.
const boxes = [{ min: [-0.2, 0, -30], max: [0.2, 3, 6] }, { min: [5.4, 0, -4.6], max: [6.6, 1, -3.4] }];
const groundY = (x, z) => (Math.abs(x) <= 30 && Math.abs(z) <= 30 ? (x >= 12 ? 0.3 : 0) : null);
function slab(o, d, max, b) {
  let t0 = 0, t1 = max;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < b.min[i] || o[i] > b.max[i]) return null; continue; }
    let a = (b.min[i] - o[i]) / d[i], c = (b.max[i] - o[i]) / d[i]; if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return null;
  }
  return t0;
}
let calls = 0;
function ray(o, dir, max) {
  calls++;
  const l = Math.hypot(...dir), d = dir.map((v) => v / l);
  let best = null;
  for (const b of boxes) { const t = slab(o, d, max, b); if (t != null && (!best || t < best.t)) best = { t, point: o.map((v, i) => v + d[i] * t), normal: [0, 1, 0] }; }
  if (d[1] < -0.99) { const g = groundY(o[0], o[2]); if (g != null) { const t = o[1] - g; if (t >= 0 && t <= max && (!best || t < best.t)) best = { t, point: [o[0], g, o[2]], normal: [0, 1, 0] }; } }
  return best;
}
const crossesWall = (path, from) => {
  const pts = [from, ...path];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if ((a[0] < 0) !== (b[0] < 0)) { const t = (0 - a[0]) / (b[0] - a[0]); const z = a[2] + (b[2] - a[2]) * t; if (z < 6.3) return true; }
  }
  return false;
};

test('nav: a click behind a wall walks round its end, never through it', () => {
  const nav = createNav({ ray });
  const from = [-5, 0, 0], to = [5, 0, 0];
  const r = nav.plan(from, to);
  assert.ok(r && r.reached, 'reached');
  assert.equal(crossesWall(r.path, from), false, JSON.stringify(r.path));
  assert.deepEqual(r.path[r.path.length - 1], [5, 0, 0]);
  assert.ok(r.path.length <= 4, 'string-pulled to a few corners: ' + r.path.length);
});

test('nav: a clear line is one straight leg; the crate is walked round', () => {
  const nav = createNav({ ray });
  const r = nav.plan([3, 0, -10], [3, 0, -2]);
  assert.ok(r.reached); assert.equal(r.path.length, 1, 'straight');
  const r2 = nav.plan([6, 0, -8], [6, 0, 0]);
  assert.ok(r2.reached); assert.ok(r2.path.length >= 2, 'a corner round the crate');
  for (const p of r2.path) assert.ok(!(p[0] > 5.2 && p[0] < 6.8 && p[2] > -4.8 && p[2] < -3.2), 'no waypoint inside the crate');
});

test('nav: a step up is walkable; an unreachable click walks to the nearest reachable point', () => {
  const nav = createNav({ ray });
  const up = nav.plan([8, 0, 10], [16, 0.3, 10]);
  assert.ok(up.reached); assert.equal(up.path[up.path.length - 1][1], 0.3);
  const off = nav.plan([8, 0, 10], [45, 0, 10], { budget: 4000 });
  assert.equal(off.reached, false);
  const last = off.path[off.path.length - 1];
  assert.ok(last[0] >= 28 && last[0] <= 30, 'stops at the edge nearest the click: ' + last);
});

test('nav: after warming, a plan across the yard is fast and needs no new ray casts', () => {
  const nav = createNav({ ray });
  while (!nav.warm([-5, 0, 0], { radius: 40, sliceMs: 50 })) { /* slices */ }
  assert.ok(nav.stats.warmDone && nav.stats.warmed > 2000, JSON.stringify(nav.stats));
  const before = calls;
  for (const z of [-18, -17, -16]) nav.plan([-20, 0, z], [20, 0, z]); // the engine's first runs (JIT)
  const r = nav.plan([-20, 0, -20], [20, 0, -20]);
  assert.ok(r.reached && !crossesWall(r.path, [-20, 0, -20]));
  assert.ok(calls - before < 50, 'cached probes: ' + (calls - before));
  assert.ok(r.ms < 10, 'plan ms ' + r.ms.toFixed(2) + ' over ' + r.nodes + ' nodes (a 26 m detour round the wall)');
});

test('nav: a collider streamed in later (the version changes) clears the cache, so the new wall counts', () => {
  let v = 1; const extra = { min: [9.8, 0, -30], max: [10.2, 3, 30] };
  const ray2 = (o, d, m) => { const r = ray(o, d, m); if (v < 2) return r; const l = Math.hypot(...d), u = d.map((x) => x / l); const t = slab(o, u, m, extra); return t != null && (!r || t < r.t) ? { t, point: o.map((x, i) => x + u[i] * t), normal: [0, 1, 0] } : r; };
  const nav = createNav({ ray: ray2, version: () => v });
  assert.ok(nav.plan([8, 0, 0], [11, 0, 0]).reached, 'open before');
  v = 2;
  const r = nav.plan([8, 0, 0], [11, 0, 0]);
  assert.equal(r.reached, false, 'the new wall (x = 10, the whole yard) now blocks it');
});

test('nav: the journal\'s "walk to" follows the same route (auto-walk with the town\'s planner)', async () => {
  const { createAutoWalk } = await import('../../src/sprint/auto-walk.js');
  const nav = createNav({ ray });
  let route = null; const pos = [-5, 0, 0];
  const walker = createAutoWalk({ doc: null, driver: { setRoute: (r) => { route = r; }, cancel() {}, active: () => !!route, ended: () => null, pos: () => pos },
    planner: (from, to) => { const r = nav.plan(from, to); return r && r.path.length ? r.path : null; } });
  walker.autoWalkTo({ pos: [5, 0], stopRadius: 1 });
  assert.ok(route && route.length >= 2, 'a route with corners');
  assert.equal(crossesWall(route, pos), false);
  walker.dispose();
});

test('nav: over the warmed grid a click into a solid thing snaps to the nearest walkable cell and is reached at once', () => {
  const nav = createNav({ ray });
  while (!nav.warm([-5, 0, 0], { radius: 40, sliceMs: 50 })) { /* slices */ }
  const r = nav.plan([10, 0, -8], [6, 0, -4]); // the crate's middle
  assert.ok(r.reached, 'snapped and reached');
  const end = r.path[r.path.length - 1];
  assert.ok(Math.hypot(end[0] - 6, end[2] + 4) <= 1.6, 'next to the crate: ' + end);
  assert.ok(r.nodes < 200, 'a short search: ' + r.nodes);
  const off = nav.plan([10, 0, -8], [45, 0, -8]);
  assert.ok(off.reached && off.nodes < 1000, 'the void 15 m beyond the edge snaps to the edge too');
});
