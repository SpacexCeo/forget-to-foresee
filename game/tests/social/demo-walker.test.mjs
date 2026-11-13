// The demo player's walk (src/play/demo-walker.js): only along the authored routes, never near the portal or doors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkGraph, createDemoWalker, forbidden, DEMO_WALK } from '../../src/play/demo-walker.js';

function onSomeEdge(p, { nodes, edges }) {
  let best = Infinity;
  for (let a = 0; a < nodes.length; a++) for (const b of edges[a]) {
    const A = nodes[a], B = nodes[b], dx = B[0] - A[0], dz = B[2] - A[2], L = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[2] - A[2]) * dz) / L));
    best = Math.min(best, Math.hypot(p[0] - (A[0] + dx * k), p[2] - (A[2] + dz * k)));
  }
  return best;
}

test('the walk graph joins the routes, leaves out the portal and the doors', () => {
  const g = buildWalkGraph();
  assert.ok(g.nodes.length > 30);
  assert.ok(g.nodes.every((p) => !forbidden(p)));
  const reach = new Set([0]); const q = [0]; while (q.length) for (const n of g.edges[q.shift()]) if (!reach.has(n)) { reach.add(n); q.push(n); }
  assert.ok(reach.size >= 10, 'a connected walk of at least 10 points');
});

test('over 20 simulated minutes the walker stays on the routes, walks, idles and looks around', () => {
  const g = buildWalkGraph(); let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const w = createDemoWalker({ graph: g, rand });
  const states = new Set(); let walked = 0, maxOff = 0;
  for (let i = 0; i < 20 * 60 * 20; i++) {
    const x0 = w.x, z0 = w.z; w.step(0.05); states.add(w.state); walked += Math.hypot(w.x - x0, w.z - z0);
    maxOff = Math.max(maxOff, onSomeEdge([w.x, w.y, w.z], g));
    assert.ok(!forbidden([w.x, w.y, w.z]) || onSomeEdge([w.x, w.y, w.z], g) < 0.01);
  }
  assert.ok(maxOff < 0.01, 'never off a route segment: ' + maxOff);
  assert.ok(walked > 200, 'it wanders: ' + walked);
  assert.ok(states.has('walk') && states.has('idle') && states.has('look'));
  assert.ok(w.speed <= DEMO_WALK.speed + 1e-9);
});
