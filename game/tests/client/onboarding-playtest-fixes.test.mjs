// Playtest 14.11 fixes for the first session: the Elder's lines in the arrival dialogue count as q_welcome's
// "Talk to the Elder" (B4), and the Day-1 name is saved as soon as it is entered so the HUD shows it at once (B8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTownQuests } from '../../src/scenes/town-quests.js';
import { progressOf } from '../../src/game/quest-rules.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { createInventory } from '../../src/game/inventory.js';
import { memStorage, fakeDoc, fakeI18n } from './story-fakes.mjs';

const FOLK = { elder: [0, 0, 0], guard: [10, 0, 0], lamplighter: [20, 0, 0], shardkeeper: [30, 0, 0] };
function rig() {
  const storage = memStorage(), doc = fakeDoc(), win = new EventTarget();
  let t = 1_000_000; const now = () => (t += 1000);
  const townLedger = createTownLedger({ storage, now });
  const tq = createTownQuests({ storage, townLedger, i18n: fakeI18n(), folkAt: (k) => FOLK[k] || null, inventory: createInventory({ storage }), doc, win, now });
  return { tq, doc };
}

test('B4: creditElderTalk counts the arrival dialogue as the Elder talk, once, without opening the talk panel', () => {
  const { tq } = rig();
  assert.equal(tq.story.guide.talked, false);
  assert.equal(tq.creditElderTalk(), true);
  assert.equal(tq.story.guide.talked, true);
  assert.equal(tq.quests.quests.q_welcome.state, 'active');
  const talk = progressOf('q_welcome', tq.quests).find((o) => o.id === 'talk');
  assert.equal(talk.count, 1);
  assert.equal(tq.talking, false);
  const seq = tq.quests.seq;
  assert.equal(tq.creditElderTalk(), false);   // a second call changes nothing
  assert.equal(tq.quests.seq, seq);
  tq.update([0, 0, 0]); tq.update([8, 0, 0]);   // she walks off: the welcome is ready to turn in at the Elder
  assert.equal(tq.quests.quests.q_welcome.state, 'ready');
  tq.dispose();
});

test('B4: boot-world credits the Elder talk when the intro ends after the Elder spoke', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /p\.speaker === 'elder'/);
  assert.match(src, /onBus\('npe\.completed'[^\n]*creditElderTalk\(\)/);
});

test('B8: runArrival saves the entered name before the gift and the mint', () => {
  const src = readFileSync(new URL('../../src/play/day1.js', import.meta.url), 'utf8');
  const save = src.indexOf('mint.setRecord({ nickname: name })'), burst = src.indexOf('// 3. the burst');
  assert.ok(save > 0 && save < burst, 'the name is saved right after the prompt');
});
