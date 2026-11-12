// Actions interrupt locomotion (owner, 12.11): a cast or a strike cancels the walk orders, plants Iris and roots her;
// nothing resumes by itself afterwards. physics/interrupt.js plus the input's run latches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interruptLocomotion, canMove, STRIKE_ROOT } from '../../src/physics/interrupt.js';

test('a cast/strike cancels the click target, the route and the run, plants her and roots her', () => {
  let cancelled = 0;
  const ch = { vel: [2.4, -1.1], speed: 2.6 };
  const s = interruptLocomotion({ moveTarget: [3, 0, 4], moveRun: true, rootUntil: 0 }, { now: 1000, seconds: STRIKE_ROOT, cancel: () => cancelled++, character: ch });
  assert.equal(s.moveTarget, null); assert.equal(s.moveRun, false); assert.equal(cancelled, 1);
  assert.deepEqual(ch.vel, [0, 0]); assert.equal(ch.speed, 0);
  assert.equal(canMove(s, 1000 + STRIKE_ROOT * 1000 - 1), false, 'rooted: stick and keys ignored');
  assert.equal(canMove(s, 1000 + STRIKE_ROOT * 1000), true, 'then free, but only new (or still held) input moves her');
  assert.equal(canMove(s, 99999, true), false, 'a cast in progress roots her whatever the timer');
  interruptLocomotion(s, { now: 1100, seconds: 0 });
  assert.equal(s.rootUntil, 1000 + STRIKE_ROOT * 1000, 'a shorter root never cuts a longer one');
});

test('the world loop wires it: casts and strikes interrupt, the dash does not; the touch run latch switches off', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /onCastStart: \(id\) => \{ interruptMove\(0\);/);
  assert.match(src, /function strikeNow\(\) \{ if \(townMobs && townMobs\.strike\(\)\) interruptMove\(STRIKE_ROOT\); \}/);
  assert.match(src, /input\.hit\('KeyF'\) \|\| input\.hit\('Digit3'\)\) strikeNow\(\)/);
  assert.match(src, /press: \(\) => strikeNow\(\)/);
  assert.doesNotMatch(src, /dash\([^)]*\)[^;\n]*interruptMove/, 'the dash stays a movement action');
  assert.match(src, /if \(!canMove\(\{ rootUntil \}, performance\.now\(\), !!\(townCasting && townCasting\.casting\)\)\) return \[0, 0\];/);
});

test('input.stopRun clears the sticky run toggle and the double-tap burst', async () => {
  const src = readFileSync(new URL('../../src/ui/input.js', import.meta.url), 'utf8');
  assert.match(src, /stopRun\(\) \{ const was = this\.runToggle \|\| this\.runBurst; this\.runToggle = false; this\.runBurst = false;/);
  const proto = { runToggle: true, runBurst: true, emitted: 0, emitRun() { this.emitted++; }, tapRun: { reset() {} } };
  const stopRun = new Function('return ' + src.match(/stopRun\(\) (\{[^\n]*\})/)[1].replace(/^\{/, 'function () {'))();
  stopRun.call(proto);
  assert.equal(proto.runToggle, false); assert.equal(proto.runBurst, false); assert.equal(proto.emitted, 1);
});
