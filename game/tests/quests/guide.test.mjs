// The starter guide (sprint §4.11, test 7): eight steps, completed only in order, persisted, the fee from the argument,
// the reward once at the end; the tracker shows the active step and can hide the guide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_STEPS, initialGuide, guideEvent, guideView, loadGuide, activeStep, GUIDE_XP, GUIDE_KEY } from '../../src/quests/guide.js';
import { createTrackerUI } from '../../src/quests/tracker-ui.js';
import { createSay } from '../../src/quests/say.js';
import { makeDoc } from './dom.mjs';

test('steps advance only in order; the reward comes once at the end; the state persists', () => {
  assert.deepEqual(GUIDE_STEPS.map((s) => s.id), ['move', 'camera', 'talk', 'journal', 'fight', 'loot', 'market', 'home']);
  let g = initialGuide();
  assert.equal(guideEvent(g, 'journal').completed, null, 'not the active step: nothing');
  let total = 0;
  for (const ev of ['moved', 'camera', 'talked:elder', 'journal', 'hit', 'bag', 'market']) { const r = guideEvent(g, ev); assert.ok(r.completed); assert.equal(r.reward, 0); g = r.state; }
  assert.equal(activeStep(g).id, 'home');
  const last = guideEvent(g, 'portal'); assert.equal(last.finished, true); assert.equal(last.reward, GUIDE_XP); g = last.state; total += last.reward;
  assert.equal(guideEvent(g, 'portal').reward, 0); assert.equal(total, 10);
  const store = new Map([[GUIDE_KEY, JSON.stringify(g)]]);
  assert.deepEqual(loadGuide({ getItem: (k) => store.get(k) ?? null }).done.length, 8);
  assert.deepEqual(loadGuide({ getItem: () => '{bad' }), initialGuide());
});

test('the view names the fee from its argument; hidden or finished shows nothing; the tracker block and its hide button', () => {
  let g = initialGuide();
  for (const ev of ['moved', 'camera', 'talked:elder', 'journal', 'hit', 'bag', 'market']) g = guideEvent(g, ev).state;
  assert.deepEqual(guideView(g, 250), { n: 8, total: 8, id: 'home', text: 'Collect 250 silk on chain, then step into the Gate-Loom to go home.' });
  assert.equal(guideView({ ...g, hidden: true }, 200), null);
  const doc = makeDoc(); let hidden = 0;
  const tr = createTrackerUI({ doc, say: createSay(null), giverName: (k) => k, data: () => ({ tracked: [], road: { gateC: 0, feeC: 20_000 }, errand: null, guide: guideView(initialGuide(), 200) }), onOpen() {}, onWalk() {}, onHideGuide: () => hidden++ });
  tr.refresh(true);
  assert.match(tr.root.textContent, /Starter guide 1\/8/); assert.match(tr.root.textContent, /Move with W A S D\. Hold Shift to run\./);
  tr.root.querySelector('.ft-guide-hide').click(); assert.equal(hidden, 1);
});
