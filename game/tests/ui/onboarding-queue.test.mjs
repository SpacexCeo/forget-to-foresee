// One onboarding queue (design review 13.11, P0): first-time overlays run one at a time in the order name -> intro ->
// guide, whatever order they were asked in; windows are told to close; window hotkeys are blocked meanwhile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOnboarding, onboardingActive, blocksWindows, _resetOnboarding, ORDER } from '../../src/ui/onboarding-queue.js';

const fakeWin = () => { const ev = []; return { ev, navigator: { userAgent: 'Mozilla/5.0 Chrome' }, __ftfBootMarks: { done: 1 }, dispatchEvent: (e) => { ev.push([e.type, e.detail]); return true; } }; };

test('queue: the intro asked first still waits for the name; one at a time; windows close; hotkeys blocked', async () => {
  _resetOnboarding(); const win = fakeWin(), log = [];
  let endName;
  const intro = runOnboarding('intro', async () => { log.push('intro:' + onboardingActive()); return 'card'; }, { win, settleMs: 5 });
  const name = runOnboarding('name', () => new Promise((r) => { log.push('name:' + onboardingActive()); endName = r; }), { win, settleMs: 5 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(log, ['name:name'], 'the name runs first, alone'); assert.equal(blocksWindows(), true);
  assert.ok(win.ev.some(([t, d]) => t === 'ftf:close-windows' && d.by === 'name'));
  endName('Cy'); assert.equal(await name, 'Cy'); assert.equal(await intro, 'card');
  assert.deepEqual(log, ['name:name', 'intro:intro']); assert.equal(onboardingActive(), null); assert.equal(blocksWindows(), false);
  assert.deepEqual(ORDER, ['name', 'intro', 'guide']);
});

test('queue: without a page (unit tests) it runs at once', async () => {
  _resetOnboarding();
  assert.equal(await runOnboarding('guide', () => 7, { win: null }), 7);
});

test('queue: an announced earlier step holds back a later one that is queued first', async () => {
  const { expectOnboarding } = await import('../../src/ui/onboarding-queue.js');
  _resetOnboarding(); const win = fakeWin(), log = [];
  expectOnboarding('name', 2000);
  const intro = runOnboarding('intro', async () => { log.push('intro'); }, { win, wait: false });
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(log, [], 'the intro waits for the announced name');
  const name = runOnboarding('name', async () => { log.push('name'); }, { win, wait: false });
  await name; await intro;
  assert.deepEqual(log, ['name', 'intro']);
});
