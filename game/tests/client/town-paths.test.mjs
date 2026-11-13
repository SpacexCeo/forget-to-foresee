// The town's path graph (owner 13.11: "make them all walk ONLY on the paths"): one connected graph; every townsperson's
// program walk and every trade/home walk runs along its edges; every edge has real ground under it in fine steps
// (the recorded table tests/fixtures/town-ground.json, from the town's colliders: scripts/record-town-ground.mjs), no
// point off the ground and no vertical step over MAX_STEP. A changed edge without a fresh recording fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROGRAMS, tradePath, homeProgram } from '../../src/play/townsfolk-plan.js';
import { townPaths, edgeSamples, edgeKey, MAX_STEP, pathBetween, nearestNode } from '../../src/play/town-paths.js';
import { propFootprints, edgeCrossings, PORTAL_AT, NOTICE_AT } from '../../src/scenes/town-footprints.js';
import { PORTAL_TOWN } from '../../src/scenes/town-portal.js';
import { BOARD_TOWN } from '../../src/scenes/town-board.js';

const g = townPaths();
const table = JSON.parse(readFileSync(new URL('../fixtures/town-ground.json', import.meta.url), 'utf8'));
const onGraph = (a, b) => { // the segment a-b lies along graph edges (a chain of collinear edges between its ends)
  const flat = (p, q) => Math.hypot(q[0] - p[0], q[2] - p[2]);
  const ia = nearestNode(g, a), ib = nearestNode(g, b);
  if (flat(g.nodes[ia], a) > 0.06 || flat(g.nodes[ib], b) > 0.06) return false;
  const path = pathBetween(g, g.nodes[ia], g.nodes[ib]);
  let len = 0; for (let i = 0; i + 1 < path.length; i++) len += flat(path[i], path[i + 1]);
  return len <= flat(a, b) + 0.1;
};

test('the path graph is one connected piece', () => {
  const seen = new Set([0]), st = [0];
  while (st.length) { const u = st.pop(); for (const [v] of g.adj.get(u)) if (!seen.has(v)) { seen.add(v); st.push(v); } }
  assert.equal(seen.size, g.nodes.length, 'every node reaches every other');
});

test('every program walk and every trade and home walk runs along the graph', () => {
  for (const [k, prog] of Object.entries(PROGRAMS)) {
    for (const st of prog.steps || []) if (st.walk) for (let i = 0; i + 1 < st.walk.length; i++) assert.ok(onGraph(st.walk[i], st.walk[i + 1]), `${k} walk leg ${i}`);
    const tp = tradePath(prog.home, 0).path;
    for (let i = 1; i + 1 < tp.length; i++) assert.ok(onGraph(tp[i], tp[i + 1]), `${k} trade leg ${i}`);
    const home = homeProgram({ x: tp[tp.length - 1][0], y: tp[tp.length - 1][1], z: tp[tp.length - 1][2] }, prog).steps[0].walk;
    for (let i = 1; i + 2 < home.length; i++) assert.ok(onGraph(home[i], home[i + 1]), `${k} home leg ${i}`); // the last leg steps onto the post (a seat for the elder)
  }
});

test('every edge has real ground under it: no point off the ground, no step over 0.45 m', () => {
  const bad = [];
  for (const [a, b] of g.edges) {
    const k = edgeKey(g.nodes[a], g.nodes[b]), rec = table.edges[k], row = rec && rec.ground, pts = edgeSamples(g.nodes[a], g.nodes[b]);
    if (rec && rec.blocked.length) bad.push(`${k} #${rec.blocked[0]}: something solid within the 0.35 m body (wall, stall, crate)`);
    if (!row || row.length !== pts.length) { bad.push(k + ' not recorded (run scripts/record-town-ground.mjs)'); continue; }
    for (let i = 0; i < row.length; i++) {
      if (row[i] === null) { bad.push(`${k} #${i}: no ground`); break; }
      if (Math.abs(row[i] - pts[i][1]) > 1.2) { bad.push(`${k} #${i}: ground ${row[i]} far from the path ${pts[i][1].toFixed(2)}`); break; }
      if (i && Math.abs(row[i] - row[i - 1]) > MAX_STEP) { bad.push(`${k} #${i}: step ${(row[i] - row[i - 1]).toFixed(2)} m`); break; }
    }
  }
  assert.deepEqual(bad, []);
});

test('no edge crosses a placed prop (footprint + 0.5 m): the boards, the wheel, the Gate-Loom, the Hatchkeeper and his dragons', () => {
  assert.deepEqual([...PORTAL_AT], [...PORTAL_TOWN]); assert.deepEqual([...NOTICE_AT], [...BOARD_TOWN]);
  const prints = propFootprints(); assert.ok(prints.length >= 8);
  const bad = [];
  for (const [a, b] of g.edges) for (const f of edgeCrossings(g.nodes[a], g.nodes[b], prints)) bad.push(f.id + ' ' + edgeKey(g.nodes[a], g.nodes[b]));
  assert.deepEqual(bad, []);
  for (let slot = 0; slot < 5; slot++) { const end = tradePath(PROGRAMS.guard.home, slot).path.at(-1); for (const f of prints) assert.ok(Math.hypot(end[0] - f.at[0], end[2] - f.at[2]) >= f.r || Math.abs(end[1] - f.at[1]) > 2, `trade slot ${slot} clear of ${f.id}`); }
});
