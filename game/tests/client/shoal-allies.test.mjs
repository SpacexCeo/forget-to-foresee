// Dragon allies in the Glass Shoal (src/game/shoal-allies.js): staggered timers, held while she is down, the nearest
// add first, the boss only within reach, and a help that never decides the fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLY, ALLY_COLOR, freshAllies, alliesStep, allyTarget } from '../../src/game/shoal-allies.js';
import * as R from '../../src/game/shoal-rules.js';
import { COMPANION } from '../../src/scenes/companion-rules.js';

test('timers: at most two dragons, staggered; each fires once per period; held while not live', () => {
  assert.equal(freshAllies(5).length, ALLY.max); assert.equal(freshAllies(0).length, 0);
  const t = freshAllies(2);
  assert.ok(t[1].t > t[0].t, 'staggered');
  assert.deepEqual(alliesStep(t, ALLY.first - 0.01), []);
  assert.deepEqual(alliesStep(t, 0.02), [0]);
  assert.deepEqual(alliesStep(t, 100, false), [], 'held');
  let shots = 0; const u = freshAllies(1);
  for (let i = 0; i < 600; i++) shots += alliesStep(u, 1 / 60).length;   // ten seconds
  assert.ok(shots >= 2 && shots <= 4, String(shots));
});

test('targets: the nearest add in reach, else the boss in reach, else nothing', () => {
  const adds = [{ id: 1, x: 10, z: 0 }, { id: 2, x: 3, z: 0 }, { id: 3, x: 100, z: 0 }];
  assert.deepEqual(allyTarget([0, 0], adds, [50, 0], 4), { kind: 'add', at: [3, 0], id: 2 });
  assert.deepEqual(allyTarget([0, 0], [], [20, 0], 4), { kind: 'boss', at: [20, 0] });
  assert.equal(allyTarget([0, 0], [], [80, 0], 4), null, 'out of reach');
  assert.equal(allyTarget([0, 0], [], [20, 0], 4, false), null, 'the boss is down');
});

test('a help, never the win: two dragons over a three-minute fight deal under a fifth of the boss', () => {
  const perMinute = (60 / ALLY.every) * ALLY.damage * ALLY.max;
  assert.ok(perMinute * 3 < R.BOSS.hp * 0.2, `${perMinute * 3} of ${R.BOSS.hp}`);
  for (const k of Object.keys(COMPANION.tint)) assert.ok(ALLY_COLOR[k], k);
});
