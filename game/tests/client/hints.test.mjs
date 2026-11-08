// Novice hints (src/play/hints.js) over a real local season with a fake clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { createPlayI18n } from '../../src/play/i18n.js';
import { createHints, HINTS, HINTS_KEY } from '../../src/play/hints.js';

const SEED = 'cc161d308faa67539af44205b56b6d4f'; // ?demo=judge
const i18n = createPlayI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
const memStorage = () => { const m = new Map(); return { getJSON: (k) => m.get(k) ?? null, setJSON: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };

async function setup(mode = 'novice', storage = memStorage()) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: SEED }), sleep: async () => {}, skipOnboarding: true });
  await s.start();
  let t = 0;
  const h = createHints({ storage, mode: () => mode, i18n, now: () => t });
  const advance = (ms) => { t += ms; h.tick(ms / 1000); };
  return { s, h, advance, storage };
}

test('hints: every hint has EN and RU text', () => {
  const ru = createPlayI18n('ru', { onMissing: (k) => { throw new Error('missing ru ' + k); } });
  for (const d of HINTS) { assert.ok(i18n.has('wh.hint.' + d.id), d.id); assert.ok(ru.has('wh.hint.' + d.id), 'ru ' + d.id); }
});

test('hints: the welcome line goes to Iris and the first sign to the toast, one toast at a time', async () => {
  const { s, h, advance } = await setup();
  h.observe(s.obs);
  assert.equal(h.takeCoach().key, 'wh.hint.welcome', 'Iris lines never wait for the toast slot');
  const a = h.view().active;
  assert.equal(a.id, 'firstSign');
  assert.match(i18n.t(a.text.key, a.text.args), /^A sign woke\. I read it as a \w+ of \d+ at Shell [IV]+, trial \d+\. Press V/);
  assert.equal(h.view().journal[0].text.key, 'wh.hint.firstSign', 'the Hints tab keeps it');
  advance(13000);
  assert.equal(h.view().active.id, 'firstSign', 'a long toast lives 14 s');
  h.action('moved');
  advance(1000);
  assert.equal(h.view().active, null);
});

test('hints: untilDone repeats until the action, then stops for good', async () => {
  const { s, h, advance } = await setup();
  h.observe(s.obs);
  h.action('moved');
  advance(6000); assert.equal(h.view().active.id, 'firstSign');
  advance(15000); assert.equal(h.view().active, null);
  advance(31000); h.observe(s.obs); advance(100);
  assert.equal(h.view().active && h.view().active.id, 'firstSign', 'repeats after the cooldown');
  h.action('signsOpen');
  assert.equal(h.flags().firstSign.done, true);
  advance(15000); h.observe(s.obs); advance(7000);
  assert.equal(h.view().active && h.view().active.id, 'anchor', 'the next step of the loop follows');
});

test('hints: the move hint fires only when the player has not moved', async () => {
  const { s, h, advance } = await setup();
  h.observe(s.obs);
  h.action('signsOpen');
  for (let i = 0; i < 6; i++) advance(5000);
  assert.ok(h.view().journal.some((e) => e.text.key === 'wh.hint.move'));
  const b = await setup();
  b.h.observe(b.s.obs); b.h.action('moved'); b.h.action('signsOpen');
  for (let i = 0; i < 6; i++) b.advance(5000);
  assert.ok(!b.h.view().journal.some((e) => e.text.key === 'wh.hint.move'));
});

test('hints: Pro gets no coaching, only the story beats in Lore', async () => {
  const { s, h, advance } = await setup('pro');
  h.observe(s.obs);
  for (let i = 0; i < 3; i++) { assert.ok((await s.send('end_tick', {})).ok); h.observe(s.obs); advance(7000); }
  assert.equal(h.takeCoach(), null);
  assert.equal(h.view().active, null);
  assert.deepEqual(h.view().journal, []);
  assert.ok(h.view().lore.some((e) => e.text.key === 'wh.hint.verified'), 'the verification beat reaches Lore');
});

test('hints: "once" flags persist per device; reset() clears them', async () => {
  const storage = memStorage();
  const a = await setup('novice', storage);
  a.h.observe(a.s.obs);
  assert.ok(a.h.takeCoach());
  assert.equal(storage.getJSON(HINTS_KEY).welcome.seen, 1);
  const b = await setup('novice', storage);
  b.h.observe(b.s.obs);
  assert.equal(b.h.takeCoach(), null, 'the welcome line never repeats');
  b.h.reset();
  b.h.observe(b.s.obs);
  assert.equal(b.h.takeCoach().key, 'wh.hint.welcome');
});

test('hints: verification beat after the judge seed\'s trial-3 Gift', async () => {
  const { s, h, advance } = await setup();
  h.observe(s.obs); h.action('moved'); h.action('signsOpen');
  for (let i = 0; i < 3; i++) { assert.ok((await s.send('end_tick', {})).ok); h.observe(s.obs); }
  for (let i = 0; i < 8; i++) advance(7000);
  assert.ok(h.view().journal.some((e) => e.text.key === 'wh.hint.verified'));
  assert.ok(s.obs.chronicle.some((c) => c.tick === 3 && c.meaning.action === 'gift' && c.meaning.place === 2), 'judge seed: Gift on Shell II at trial 3');
});
