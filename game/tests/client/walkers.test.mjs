// Walkers never pass through each other (owner 13.11): every body is 0.35 m round; two walkers meeting head-on on one
// path edge keep their centres at least MIN_GAP (0.6 m) apart and both get through; a walker passes a giver standing
// on its line; and over four minutes of the whole town no two people ever overlap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonPlan, TOWNSFOLK, MIN_GAP } from '../../src/play/townsfolk-plan.js';

const def = (key, walk = 1.3) => ({ key, walk, height: 1.7 });
const walker = (key, from, to) => new PersonPlan(def(key), { home: from, heading: null, steps: [{ walk: [from, to] }, { stay: 1e9, clip: 'idle' }] });
const stander = (key, at) => new PersonPlan(def(key), { home: at, heading: 0, steps: [{ stay: 1e9, clip: 'idle' }] });
function sim(plans, seconds, iris = null) {
  const map = new Map(plans.map((p) => [p.key, p])); let min = Infinity;
  for (let i = 0; i < seconds * 30; i++) {
    for (const p of plans) p.step(1 / 30, { iris, reduced: false, others: map });
    for (let a = 0; a < plans.length; a++) for (let b = a + 1; b < plans.length; b++) min = Math.min(min, Math.hypot(plans[a].x - plans[b].x, plans[a].z - plans[b].z));
  }
  return min;
}

test('two walkers meet head-on on one edge: centres stay >= 0.6 m apart and both get through', () => {
  const a = walker('a_walker', [0, 0, 0], [0, 0, 20]), b = walker('b_walker', [0, 0, 20], [0, 0, 0]);
  const min = sim([a, b], 40);
  assert.ok(min >= MIN_GAP - 1e-9, 'never closer than 0.6 m: ' + min.toFixed(3));
  assert.ok(Math.hypot(a.x - 0, a.z - 20) < 0.1 && Math.hypot(b.x, b.z) < 0.1, `both arrive (a ${a.x.toFixed(2)},${a.z.toFixed(2)} b ${b.x.toFixed(2)},${b.z.toFixed(2)})`);
});

test('a walker passes a giver standing on its line without touching', () => {
  const w = walker('a_walker', [0, 0, 0], [0, 0, 12]), g = stander('guard', [0, 0, 6]);
  const min = sim([w, g], 30);
  assert.ok(min >= MIN_GAP - 1e-9, 'never closer than 0.6 m: ' + min.toFixed(3));
  assert.ok(Math.hypot(w.x, w.z - 12) < 0.1, 'gets past and arrives');
  assert.deepEqual([g.x, g.z], [0, 6], 'the giver keeps the post');
});

test('the whole town for four minutes: nobody overlaps anybody', () => {
  const plans = TOWNSFOLK.map((d) => new PersonPlan(d));
  const map = new Map(plans.map((p) => [p.key, p])); const bad = [];
  for (let i = 0; i < 240 * 30; i++) {
    for (const p of plans) p.step(1 / 30, { iris: null, reduced: false, others: map });
    for (let a = 0; a < plans.length; a++) for (let b = a + 1; b < plans.length; b++) {
      const A = plans[a], B = plans[b];
      if (Math.abs(A.y - B.y) < 1.2 && Math.hypot(A.x - B.x, A.z - B.z) < MIN_GAP - 1e-6 && bad.length < 5) bad.push(`${A.key}/${B.key} at ${i}`);
    }
  }
  assert.deepEqual(bad, []);
});
