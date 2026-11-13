// The talk picker (src/scenes/talk-picker.js, owner 13.11): several people in reach -> a list, nearest first; the pick
// holds while that person stays in reach; Tab cycles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talkCandidates, pickCandidate, nextPick, giverOf } from '../../src/scenes/talk-picker.js';

const at = { elder: [1.5, 0, 0], shardkeeper: [0.8, 0, 0], baker: [2.5, 0, 0] };
const giverSpot = (g) => ({ id: 'story_' + g, near: (p) => Math.hypot(at[g][0] - p[0], at[g][2] - p[2]) <= 2.4 });
const door = { id: 'exchange', near: () => true };

test('everyone in reach, nearest first; a giver is listed once (its spot), not again as a townsperson', () => {
  const c = talkCandidates({ pos: [0, 0, 0], spots: [giverSpot('elder'), giverSpot('shardkeeper'), door], folkAt: (k) => at[k],
    folkAround: () => [{ key: 'shardkeeper', d: 0.8 }, { key: 'elder', d: 1.5 }, { key: 'baker', d: 2.5 }] });
  assert.deepEqual(c.map((x) => x.id), ['spot:story_shardkeeper', 'spot:story_elder', 'spot:exchange', 'folk:baker']);
  assert.equal(giverOf({ id: 'story_guard' }), 'guard'); assert.equal(giverOf(door), null);
});

test('the pick holds while in reach, falls back to the nearest when gone; Tab goes to the next and wraps', () => {
  const c = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickCandidate(c, null).id, 'a');
  assert.equal(pickCandidate(c, 'b').id, 'b');
  assert.equal(pickCandidate(c, 'gone').id, 'a');
  assert.equal(nextPick(c, null), 'b', 'the first Tab leaves the nearest (the one shown)');
  assert.equal(nextPick(c, 'b'), 'c');
  assert.equal(nextPick(c, 'c'), 'a');
  assert.equal(pickCandidate([], 'a'), null);
});

test('no townsfolk candidates without the hire talk (folk: false)', () => {
  const c = talkCandidates({ pos: [0, 0, 0], spots: [giverSpot('elder')], folkAt: (k) => at[k], folkAround: () => [{ key: 'baker', d: 1 }], folk: false });
  assert.deepEqual(c.map((x) => x.id), ['spot:story_elder']);
});
