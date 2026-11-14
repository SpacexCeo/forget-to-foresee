// Owner 14.11: the starter guide's "open your bag" step never completed (the rpg HUD stops the I key, and the tray
// button never counted), and the errand to the baker never matched while the baker worked away from his home spot.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { guideEvent as feedGuide, initialGuide, GUIDE_STEPS } from '../../src/quests/guide.js';

const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

test('every window the rpg HUD opens is announced, and the guide hears bag, market and journal from it', () => {
  assert.match(src('rpg/index.js'), /function openWindow\(id\) \{[\s\S]{0,200}ftf:window-open/);
  const q = src('scenes/town-quests.js');
  assert.match(q, /addEventListener\('ftf:window-open', onWindow\)/);
  assert.match(q, /removeEventListener\('ftf:window-open', onWindow\)/);
  assert.match(q, /id === 'bag' \|\| id === 'market' \|\| id === 'journal'/);
});

test('the loot step completes on the bag event once it is the active step', () => {
  let g = initialGuide();
  const loot = GUIDE_STEPS.findIndex((s) => s.id === 'loot');
  assert.equal(GUIDE_STEPS[loot].on, 'bag');
  for (const s of GUIDE_STEPS.slice(0, loot)) g = feedGuide(g, s.on).state;
  const r = feedGuide(g, 'bag');
  assert.equal(r.completed, 'loot');
});

test('the town errand finds a townsperson where they stand now, not only at their home', () => {
  assert.match(src('boot-world.js'), /npcAt: \(key\) => folkAt\(key\) \|\| \(PROGRAMS\[key\]/);
});

test('no "I inspect … up close" hint, and I never starts an inspection in town (owner 14.11)', () => {
  const s = src('boot-world.js');
  assert.doesNotMatch(s, /inspect <b>\$\{near\.label\}<\/b> up close/);
  assert.match(s, /playOn && !inTown && \(input\.hit\('KeyI'\)/);
});
