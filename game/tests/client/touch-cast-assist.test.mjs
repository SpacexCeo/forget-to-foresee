// Phones (owner 14.11): a skill tapped on the hotbar fires at once at the creature the player targeted, else the soft lock,
// else the nearest living creature in range, with no extra aim step; desktop mouse aim / quick cast stays as it was.
// The regression: the rpg hotbar forwards Q / V to scenes/town-casting.js, which on touch only armed the cast and waited
// for a second tap (quick cast is desktop-only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assistPoint, quickCastPoint } from '../../src/scenes/town-casting.js';
import { CASTS } from '../../src/scenes/town-casting-fx.js';

const at = (x, z, state = 'idle') => ({ pos: [x, 0, z], state });

test('assist order: the targeted creature, then the soft lock, then the nearest in range; dead ones and the out-of-range never', () => {
  const from = [0, 0, 0];
  const near = at(3, 0), far = at(0, 12), target = at(-5, 5), locked = at(0, 6);
  assert.deepEqual(assistPoint(from, 13, { target, locked, mobs: [near, far] }), target.pos, 'the player\'s own target first');
  assert.deepEqual(assistPoint(from, 13, { target: null, locked, mobs: [near, far] }), locked.pos, 'then the soft lock');
  assert.deepEqual(assistPoint(from, 13, { mobs: [far, near] }), near.pos, 'then the nearest');
  assert.deepEqual(assistPoint(from, 13, { target: at(-5, 5, 'dead'), mobs: [near] }), near.pos, 'a dead target is skipped');
  assert.deepEqual(assistPoint(from, 13, { target: at(30, 0), mobs: [near] }), near.pos, 'a target beyond the range is skipped');
  assert.equal(assistPoint(from, 13, { mobs: [at(20, 0), at(1, 1, 'gone')] }), null, 'none in range: null');
});

test('the shot goes to the creature (line and area skills); none in range flies along her facing', () => {
  const from = [0, 0, 0], m = [4, 0, 3];
  for (const id of ['lance', 'snare']) {
    const p = quickCastPoint(CASTS[id], from, assistPoint(from, CASTS[id].range, { mobs: [{ pos: m, state: 'idle' }] }), 0);
    assert.ok(Math.abs(Math.atan2(p[0], p[2]) - Math.atan2(4, 3)) < 1e-9, id + ' toward the creature');
  }
  const ahead = quickCastPoint(CASTS.lance, from, null, Math.PI / 2);
  assert.ok(ahead[0] > 0 && Math.abs(ahead[2]) < 1e-9, 'facing +x');
});

test('wiring: on touch a hotbar key fires at once through the assist; the rpg layer offers its target; desktop quick cast unchanged', () => {
  const tc = readFileSync(new URL('../../src/scenes/town-casting.js', import.meta.url), 'utf8');
  const key = tc.slice(tc.indexOf('handleKey(code) {'), tc.indexOf('handleKey(code) {') + 1200);
  assert.ok(key.indexOf('if (coarse && assist)') > 0 && key.indexOf('if (coarse && assist)') < key.indexOf('if (quickOn())'), 'touch assist before the desktop quick cast');
  assert.match(key, /release\(quickCastPoint\(CASTS\[id\], player\.pos, p, player\.heading\)\)/);
  assert.match(tc, /const quickOn = \(\) => !coarse && !!loadSettings\(storage\)\.quickCast;/, 'desktop quick cast as it was');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /assist: \(id, range\) => assistPoint\(player\.pos, range, \{ target: typeof window\.__ftfTarget === 'function' \? window\.__ftfTarget\(\) : null, locked: townMobs \? townMobs\.locked : null/);
  const rpg = readFileSync(new URL('../../src/rpg/index.js', import.meta.url), 'utf8');
  assert.match(rpg, /globalThis\.__ftfTarget = \(\) => \{ const t = currentTarget\(\); return t \? t\.mob : null; \};/);
});
