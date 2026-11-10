// The fun layer on screen (play/fun-ui.js) in the mini DOM, over a real local season.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';

const { doc } = installDom();
const { attachFun, CHAPTER_KEY } = await import('../../src/play/fun-ui.js');
const { createPlayI18n } = await import('../../src/play/i18n.js');
const { createLocalTransport } = await import('../../src/play/transport-local.js');
const { PlaySession } = await import('../../src/play/session.js');
const { CHAPTER_ONE_TRIALS } = await import('../../src/play/fun.js');

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
async function setup({ firstRun = false, locale = 'en' } = {}) {
  const session = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE_SEED }) });
  await session.start();
  const root = doc.body.appendChild(doc.createElement('div'));
  const stored = {};
  const ctx = { i18n: createPlayI18n(locale), storage: { getJSON: (k, d) => (k in stored ? stored[k] : d), setJSON: (k, v) => { stored[k] = v; } } };
  const sounds = [];
  const timers = { set: () => 0, clear: () => {} }; // banners and overlays stay for inspection
  const fun = attachFun({ root, ctx, session, firstRun, hooks: { audio: { play: (n) => sounds.push(n) } }, timers, onRestart: () => { stored.restarted = true; } });
  return { session, root, fun, sounds, stored };
}
const text = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
const q = (root, sel) => root.querySelectorAll(sel);

test('chip: 16 cells and "known / 16 · understanding %"; the book lists every word and the empty case file', async () => {
  const h = await setup();
  assert.equal(q(h.root, '.fun-chips .fun-mini i').length, 16);
  assert.equal(text(q(h.root, '.fun-count')[0]), '0 / 16 · 0%');
  assert.equal(h.fun.bookOpen, false);
  h.fun.toggleBook(true);
  assert.equal(q(h.root, '.fun-book .fun-cell').length, 16);
  assert.match(text(q(h.root, '.fun-book')[0]), /Dictionary.*0 of 16 words known.*Who lied to me\?.*Iris has bought no words yet/);
  assert.equal(h.fun.handleKey('Escape'), true);
  assert.equal(h.fun.bookOpen, false);
  assert.equal(h.fun.handleKey('Escape'), false);
});

test('ask the Guests from the book: off on the island, a real answer inside a Shell, a pinned word is announced', async () => {
  const h = await setup();
  h.fun.toggleBook(true);
  q(h.root, '.fun-cell').find((c) => c.getAttribute('data-cell') === '1_2').click();
  assert.equal(q(h.root, '.fun-ask').length, 1);
  assert.ok(q(h.root, '[data-fun="ask"]')[0].hasAttribute('disabled'), 'the Guests answer inside a Shell');
  await h.session.bus.send('move', { to: 'anchor_zone:1' });
  await h.session.send('enter_shell', { shell: 1 });
  let pinned = false;
  for (let i = 0; i < 3 && !pinned; i++) {
    const ask = q(h.root, '[data-fun="ask"]')[0];
    if (!ask) break;
    assert.ok(!ask.hasAttribute('disabled'));
    ask.click();
    for (let k = 0; k < 40 && h.session.bus.pending; k++) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 20));
    pinned = q(h.root, '.fun-banner').some((b) => b.getAttribute('data-kind') === 'aha');
  }
  const cell = h.session.obs.dictionary.cells.find((c) => c.slot === 1 && c.form === 2);
  assert.ok(cell.known != null || cell.excluded.length > 0, 'the answer is in the dictionary');
  if (cell.known != null) {
    assert.ok(pinned, 'a pinned word shows the new-word banner');
    assert.ok(h.sounds.includes('gift_chime'));
    assert.match(text(q(h.root, '.fun-count')[0]), /^1 \/ 16/);
  }
});

test('a forgotten memory shows its picture and title; a lie opens the case; both read the observation only', async () => {
  const h = await setup();
  const m = h.session.obs.memories[2];
  await h.session.send('sacrifice_memory', { memoryId: m.id, purpose: 'vision' });
  const burn = q(h.root, '.fun-burn')[0];
  assert.ok(burn, 'the burn overlay is up');
  assert.match(text(burn), /Iris forgets/);
  assert.ok(text(burn).includes(m.text));
  // a lie: hand the layer an observation where a bought word was exposed
  const obs = JSON.parse(JSON.stringify(h.session.obs));
  obs.dictionary.boughtWords = [{ slot: 1, form: 0, meaning: 1, from: 'salt', exposedAsLie: false }];
  h.session.obs = obs; h.fun.refresh();
  const lied = JSON.parse(JSON.stringify(obs));
  lied.dictionary.boughtWords[0].exposedAsLie = true;
  h.session.obs = lied; h.fun.refresh();
  const lie = q(h.root, '.fun-banner').find((b) => b.getAttribute('data-kind') === 'lie');
  assert.ok(lie);
  assert.match(text(lie), /Salt lied/);
  h.fun.toggleBook(true);
  assert.match(text(q(h.root, '.fun-case')[0]), /Salt: Action, arc means Storm.*a lie/);
});

test('chapter one: a first-time player gets the card when trial 8 begins, once; a returning player never', async () => {
  const h = await setup({ firstRun: true });
  for (let i = 0; i < CHAPTER_ONE_TRIALS - 1; i++) await h.session.send('end_tick', {});
  assert.equal(q(h.root, '.fun-chapter').length, 0);
  await h.session.send('end_tick', {});
  const card = q(h.root, '.fun-chapter')[0];
  assert.ok(card);
  assert.match(text(card), /Chapter one complete.*Continue the season \(10 trials left\).*Start a new season/);
  assert.deepEqual(h.stored[CHAPTER_KEY], { shown: true });
  q(h.root, '[data-fun="continue"]')[0].click();
  assert.equal(q(h.root, '.fun-chapter').length, 0);
  await h.session.send('end_tick', {});
  assert.equal(q(h.root, '.fun-chapter').length, 0, 'shown once');
  const back = await setup({ firstRun: false });
  for (let i = 0; i < CHAPTER_ONE_TRIALS + 1; i++) await back.session.send('end_tick', {});
  assert.equal(q(back.root, '.fun-chapter').length, 0);
});

test('Russian: the layer renders without raw keys', async () => {
  const h = await setup({ locale: 'ru' });
  h.fun.toggleBook(true);
  const all = text(q(h.root, '.fun-book')[0]);
  assert.match(all, /Словарь/);
  assert.doesNotMatch(all, /fun\.|ask\./);
});
