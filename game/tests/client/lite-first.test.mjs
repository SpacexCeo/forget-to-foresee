// Light-first loading on desktop (docs/smoothness.md): the 2048-texture files first, the full set when idle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planUpgrade, liteFirstPolicy } from '../../src/render/streaming.js';

const row = (name, state, priority, extra = {}) => ({ name, state, priority, unwantedFor: 0, ...extra });

test('liteFirstPolicy: desktop goes light first and upgrades; phones and the low tier already load only the light set', () => {
  assert.deepEqual(liteFirstPolicy({}), { liteFirst: true, upgrade: true });
  assert.deepEqual(liteFirstPolicy({ variant: '_m' }), { liteFirst: false, upgrade: false });
  assert.deepEqual(liteFirstPolicy({ param: 'off' }), { liteFirst: false, upgrade: false }, '?lite=off: the old order');
  assert.deepEqual(liteFirstPolicy({ param: 'only' }), { liteFirst: true, upgrade: false });
});

test('liteFirstPolicy: Save-Data and 2G/3G-class links never pay for the second download', () => {
  assert.deepEqual(liteFirstPolicy({ saveData: true }), { liteFirst: true, upgrade: false });
  assert.deepEqual(liteFirstPolicy({ effectiveType: '3g' }), { liteFirst: true, upgrade: false });
  assert.deepEqual(liteFirstPolicy({ effectiveType: 'slow-2g' }), { liteFirst: true, upgrade: false });
  assert.deepEqual(liteFirstPolicy({ effectiveType: '4g' }), { liteFirst: true, upgrade: true });
});

test('planUpgrade: nothing is upgraded while the first pass is still on its way', () => {
  const shown = row('camp_iris', 'loaded', 130, { lite: true });
  assert.equal(planUpgrade([shown, row('island', 'loading', 150)]), null);
  assert.equal(planUpgrade([shown, row('anchor', 'warming', 110)]), null);
  assert.equal(planUpgrade([shown, row('shell_1', 'idle', 101)]), null, 'a wanted asset has not even started');
  assert.equal(planUpgrade([shown, row('shell_3', 'idle', -1)]), 'camp_iris', 'an unwanted idle asset does not hold upgrades back');
});

test('planUpgrade: one at a time, on screen only, largest on screen first, never twice', () => {
  const rows = [
    row('camp_sol', 'loaded', 112, { lite: true }),
    row('island', 'loaded', 140, { lite: true }),
    row('camp_moh', 'loaded', 1.02, { lite: true }),   // prefetched, off screen
    row('anchor', 'loaded', 150, { lite: false }),      // already full (or has no light file)
    row('shell_2', 'cold', 120, { lite: true }),
  ];
  assert.equal(planUpgrade(rows), 'island');
  rows[1].upgrading = true;
  assert.equal(planUpgrade(rows), null, 'one upgrade in flight');
  assert.equal(planUpgrade(rows, { maxConcurrent: 2 }), 'camp_sol');
  rows[1].upgrading = false; rows[1].lite = false;
  assert.equal(planUpgrade(rows), 'camp_sol');
  rows[0].lite = false;
  assert.equal(planUpgrade(rows), null, 'off-screen and cold assets wait until they are looked at');
});
