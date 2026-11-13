// scripts/stats.mjs reads both test reporters: TAP (`# pass N`, Node 20/22) and spec (`ℹ pass N`, Node 24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCounts } from '../../../scripts/stats.mjs';
test('stats: TAP, spec (Node 24) and cargo output', () => {
  assert.deepEqual(parseCounts('# tests 5\n# pass 5\n# fail 0\n'), { pass: 5, fail: 0 });
  assert.deepEqual(parseCounts('ℹ tests 7\nℹ pass 6\nℹ fail 1\n'), { pass: 6, fail: 1 });
  assert.deepEqual(parseCounts('test result: ok. 9 passed; 0 failed; 0 ignored'), { pass: 9, fail: 0 });
  assert.equal(parseCounts('nothing'), null);
});
