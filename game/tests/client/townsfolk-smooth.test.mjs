// Townsfolk never pop (owner P0): the shown position follows a continuous walk exactly, glides over the plan's steps
// (sitting down, a side step pulled back, a stair) and moves at once only for a real relocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smoothState, smoothStep, SNAP } from '../../src/play/townsfolk-smooth.js';

const dt = 1 / 60;

test('a continuous walk is shown exactly where it is (no lag, no foot slide)', () => {
  const st = smoothState();
  for (let i = 0; i < 300; i++) { const x = i * 1.3 * dt, z = Math.sin(i / 40); smoothStep(st, x, 0, z, Math.hypot(1.3, Math.cos(i / 40) / 40 / dt), dt); assert.ok(Math.abs(st.x - x) < 1e-9 && Math.abs(st.z - z) < 1e-9, `frame ${i}`); }
});

test('a seat offset or a pulled-back side step glides instead of popping, and is gone within half a second', () => {
  const st = smoothState();
  smoothStep(st, 0, 0, 0, 0, dt);
  smoothStep(st, 0.3, -0.4, -0.2, 0, dt); // sits down: the root moves 0.36 m sideways and 0.4 m down in one plan step
  assert.ok(Math.hypot(st.x, st.z) < 0.36 * 0.25 && st.y > -0.4 * 0.25, 'the frame after the step shows under a quarter of it');
  let worst = 0, px = st.x, py = st.y, pz = st.z;
  for (let i = 0; i < 30; i++) { smoothStep(st, 0.3, -0.4, -0.2, 0, dt); worst = Math.max(worst, Math.hypot(st.x - px, st.y - py, st.z - pz)); px = st.x; py = st.y; pz = st.z; }
  assert.ok(worst < 0.1, `largest shown move per frame ${worst.toFixed(3)} m`);
  assert.ok(Math.hypot(st.x - 0.3, st.y + 0.4, st.z + 0.2) < 0.01, 'settled on the target');
});

test('a back-and-forth target (the old side-step jitter) is shown nearly still', () => {
  const st = smoothState();
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 120; i++) { smoothStep(st, i % 2 ? 0.25 : 0, 0, 0, 0.8, dt); if (i > 10) { min = Math.min(min, st.x); max = Math.max(max, st.x); } }
  assert.ok(max - min < 0.1, `shown swing ${(max - min).toFixed(3)} m instead of 0.25 m`);
});

test('a stair step in the ground height glides; a real relocation moves at once', () => {
  const st = smoothState();
  smoothStep(st, 0, 0, 0, 1.2, dt);
  smoothStep(st, 0.02, 0.17, 0, 1.2, dt);
  assert.ok(st.y < 0.05, 'the 17 cm step is not shown in one frame');
  for (let i = 0; i < 20; i++) smoothStep(st, 0.02 + i * 0.02, 0.17, 0, 1.2, dt);
  assert.ok(Math.abs(st.y - 0.17) < 0.01);
  smoothStep(st, 40, 3, 12, 0, dt);
  assert.deepEqual([st.x, st.y, st.z], [40, 3, 12], `beyond ${SNAP} m it is a relocation`);
});

test('townsfolk.js shows the smoothed position and drops the lean with a refused side step', () => {
  const src = readFileSync(new URL('../../src/play/townsfolk.js', import.meta.url), 'utf8');
  assert.match(src, /const sm = smoothStep\(p\.smooth, x, y, z, plan\.speed, dt\);\n\s*p\.root\.position\.set\(sm\.x \+ TOWN_ORIGIN\[0\]/);
  assert.match(src, /plan\.side = 0; plan\.ox = 0; plan\.oz = 0; plan\.x = plan\.px; plan\.z = plan\.pz;/);
});

test('a walker behind a slower one waits and walks in calm stretches, not three frames on and five off (GPU box, 14.11)', async () => {
  const M = await import('../../src/play/townsfolk-plan.js');
  const def = M.TOWNSFOLK.find((d) => d.key === 'shardkeeper');
  const a = new M.PersonPlan(def, { home: [0, 0, 0], heading: 0, steps: [{ walk: [[0, 0, 0], [0, 0, 30]] }, { clip: 'idle', seconds: 600 }] });
  const lead = { key: 'aa', x: 0, y: 0, z: 1.2, speed: 0.6, current: { walk: [] }, yielding: false, _p: { dx: 0, dz: 1 } };
  const ctx = { iris: null, reduced: false, others: new Map([['shardkeeper', a], ['aa', lead]]), bodies: () => [] };
  let toggles = 0, prev = null, minGap = Infinity;
  for (let i = 0; i < 1200; i++) { // 20 s; the one ahead dawdles and walks in turns
    lead.z += (0.6 / 60) * (Math.floor(i / 40) % 2 ? 1 : 0.2);
    a.step(1 / 60, ctx);
    const moving = a.speed > 0.05; if (prev !== null && moving !== prev) toggles++; prev = moving;
    minGap = Math.min(minGap, Math.hypot(a.x - lead.x, a.z - lead.z));
  }
  assert.ok(toggles < 80, `${toggles} stop/go switches in 20 s (it was 712)`);
  assert.ok(minGap >= M.MIN_GAP, 'and never closer than the body rule allows');
  assert.ok(a.z > 5, 'it still follows along');
  assert.ok(M.WAIT_HOLD >= 0.3, 'a stop holds');
});
