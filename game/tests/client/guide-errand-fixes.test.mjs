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

// ---- owner P0 14.11: "Starter guide 6/8: Walk over a chest… Press I to open your bag" never completed
test('the hints tour is a tip, not an overlay: the bag opens (and the guide hears it) while it runs', async () => {
  const q = await import('../../src/ui/onboarding-queue.js');
  q._resetOnboarding();
  const win = new EventTarget(); win.navigator = { userAgent: 'Node.js' };
  let release; const tour = q.runOnboarding('guide', () => new Promise((r) => { release = r; }), { win, wait: false });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(q.onboardingActive(), 'guide');
  assert.equal(q.blocksWindows(), false, 'I and the tray Bag work while a tip shows');
  release(); await tour;
  let end; const intro = q.runOnboarding('intro', () => new Promise((r) => { end = r; }), { win, wait: false });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(q.blocksWindows(), true, 'a real overlay (the intro dialogue) still holds the windows');
  end(); await intro; q._resetOnboarding();
});

test('a tip with buttons moves on by itself, so the tour never stalls; a picked-up chest completes the loot step', async () => {
  const { readFileSync } = await import('node:fs');
  const day1 = readFileSync(new URL('../../src/play/day1.js', import.meta.url), 'utf8');
  assert.match(day1, /timer = setTimeout\(next, s\.buttons && s\.buttons\.length \? HINT_BUTTONS_MS : HINT_MS\);/);
  const { HINT_BUTTONS_MS } = await import('../../src/play/day1.js');
  assert.ok(HINT_BUTTONS_MS > 0 && HINT_BUTTONS_MS <= 60000);
  const tq = readFileSync(new URL('../../src/scenes/town-quests.js', import.meta.url), 'utf8');
  assert.match(tq, /if \(n > sealedSeen\) feedGuide\('bag'\)/);
  const { GUIDE_STEPS, guideEvent } = await import('../../src/quests/guide.js');
  const loot = GUIDE_STEPS.findIndex((s) => s.id === 'loot');
  const g = { done: GUIDE_STEPS.slice(0, loot).map((s) => s.id), rewarded: false };
  assert.equal(guideEvent(g, 'bag').completed, 'loot');
});
