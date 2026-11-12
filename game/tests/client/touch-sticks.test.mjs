// Twin-stick touch controls (src/scenes/touch-sticks.js) and the joystick feed in ui/input.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, aimPoint, quickTarget, loadMode, saveMode, MODE_KEY } from '../../src/scenes/touch-sticks.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { readFileSync } from 'node:fs';

test('stick: dead zone, analog walk, run when pushed far, screen up is forward', () => {
  assert.deepEqual(stickVector(2, 2).move, [0, 0]);
  const half = stickVector(0, -28); assert.ok(Math.abs(half.move[1] - 0.5) < 1e-9); assert.equal(half.run, false);
  const full = stickVector(80, 0); assert.deepEqual(full.move, [1, -0]); assert.equal(full.run, true);
});

test('aim: camera-relative ground point, clamped to the cast range', () => {
  const p = aimPoint([0, 1, 0], [0, -1], 0, -90, 13); // drag up = camera forward (-z)
  assert.deepEqual(p.map((v) => Math.round(v * 100) / 100), [0, 1, -13]);
  const r = aimPoint([0, 0, 0], [0, -1], 45, 0, 13); // drag right = +x
  assert.ok(r[0] > 6 && Math.abs(r[2]) < 1e-9);
  assert.equal(aimPoint([0, 0, 0], [0, -1], 0, 0, 13), null);
});

test('quick cast: the nearest live monster in range, else straight ahead', () => {
  const mobs = [{ state: 'dead', pos: [1, 0, 0] }, { state: 'idle', pos: [5, 0, 0] }, { state: 'chase', pos: [3, 0, 4] }];
  assert.deepEqual(quickTarget([0, 0, 0], 0, mobs, 13), [5, 0, 0]);
  assert.deepEqual(quickTarget([0, 0, 0], 0, [{ state: 'idle', pos: [40, 0, 0] }], 13).map(Math.round), [0, 0, 8]);
});

test('mode persists, joysticks by default; input reads the stick', () => {
  const s = memoryStorage(); assert.equal(loadMode(s), 'sticks');
  saveMode(s, 'tap'); assert.equal(loadMode(s), 'tap'); assert.equal(s.getItem(MODE_KEY), 'tap');
  saveMode(s, 'nope'); assert.equal(loadMode(s), 'tap');
  const src = readFileSync(new URL('../../src/ui/input.js', import.meta.url), 'utf8');
  assert.match(src, /this\.stickMove/); assert.match(src, /this\.stickRun/);
});

// Touch-aware copy (src/ui/touch-copy.js): no keyboard keys on touch.
import { touchCopy, installTouchCopy } from '../../src/ui/touch-copy.js';
import en from '../../src/play/locales/en.js';
test('touch copy: bracketed keys vanish, key phrases become touch actions', () => {
  assert.equal(touchCopy('Walk there (G)'), 'Walk there');
  assert.equal(touchCopy('End tick 3 (T)'), 'End tick 3');
  assert.equal(touchCopy(en['day1.hint.skin']), 'Switch your heroine between Iris and Elise any time: tap ⇄ on your portrait.');
  assert.equal(touchCopy(en['board.2']), 'Walk up to anyone and tap Use to talk; any townsperson can be hired as your agent.');
  assert.equal(touchCopy(en['board.6']), 'Tap Use at the Tournament altar to begin the season. The Controls button opens the menu.');
  assert.equal(touchCopy(en['map.hint']), 'Tap a place to walk there. Tap ✕ to close the map.');
  assert.equal(touchCopy(en['town.cast.hint']), 'Release to cast · drag to the left to cancel');
  assert.equal(touchCopy('Карта (N)'), 'Карта');
  let touch = false; const i18n = { t: (k) => ({ a: 'Map (N)' })[k] };
  installTouchCopy(i18n, () => touch); installTouchCopy(i18n, () => touch);
  assert.equal(i18n.t('a'), 'Map (N)'); touch = true; assert.equal(i18n.t('a'), 'Map');
});
