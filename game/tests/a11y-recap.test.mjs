// "What is happening?" (src/play/recap.js): two sentences from Iris for every state a season passes
// through, rendered in all five locales without a missing key, each short enough to read aloud; the
// sheet opens on `?`, closes on Escape, speaks when narration is on and stays silent when it is off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './lib/mini-dom.mjs';
import { createLocalTransport } from '../src/play/transport-local.js';
import { PlaySession } from '../src/play/session.js';
import { ShellHub, signsByShell } from '../src/play/hub.js';
import { recapFor } from '../src/play/recap.js';
import { createPlayI18n, renderMsg, PLAY_MESSAGES } from '../src/play/i18n.js';
import { currentGoal, dynamicGoal } from '../src/play/objectives.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const LOCALES = ['en', 'uk', 'ru', 'it', 'zh'];
const noPause = async () => {};

async function hubSeason() {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  return { s, hub: new ShellHub({ session: s, sleep: noPause, pauseMs: 0 }) };
}

/** Renders a recap in every locale and checks it is two spoken sentences with no missing key. */
function checkAll(recap, label) {
  const out = {};
  for (const loc of LOCALES) {
    const missing = [];
    const i18n = createPlayI18n(loc, { onMissing: (k) => missing.push(k) });
    const where = renderMsg(i18n, recap.where.key, recap.where.args);
    const next = renderMsg(i18n, recap.next.key, recap.next.args);
    assert.deepEqual(missing, [], `${label} ${loc}`);
    for (const sentence of [where, next]) {
      assert.ok(sentence && sentence !== '…' && !/\{|\}/.test(sentence), `${label} ${loc}: ${sentence}`);
      assert.ok(sentence.length <= 190, `${label} ${loc} too long (${sentence.length}): ${sentence}`);
      assert.match(sentence, /[.!?。！？]$/, `${label} ${loc} ends a sentence: ${sentence}`);
      assert.ok(!/<kbd>|\(F\)|\(T\)|\(M\)|Press [A-Z]\b/.test(sentence), `${label} ${loc}: no key letters in Iris's voice: ${sentence}`);
    }
    out[loc] = { where, next };
  }
  return out;
}

test('recap: a whole hub season, state by state, renders two clean sentences in five languages', async () => {
  const { s, hub } = await hubSeason();
  const seen = new Set();
  const r0 = recapFor(s.obs, { goal: s.goal, hub });
  assert.equal(r0.where.key, 'recap.where.island');
  assert.equal(r0.next.key, 'recap.next.fly');
  const en0 = checkAll(r0, 'start').en;
  assert.equal(en0.where, 'Trial 1 of 17. We stand on the island with 63 silk.');
  assert.match(en0.next, /^A sign glows in Shell (I|II|III|IV): let us fly in/);
  let guard = 0;
  while (s.obs.season.phase !== 'end' && guard++ < 80) {
    const r = recapFor(s.obs, { goal: s.goal, hub });
    seen.add(r.where.key); seen.add(r.next.key);
    checkAll(r, `trial ${s.obs.season.tick}/${s.obs.season.phase}`);
    if (hub.card) {
      assert.equal(r.next.key, 'recap.next.card.' + hub.card.kind, 'a decision card is the next step');
      const choice = { offer: 'later', fragment: 'give', speak: 'speak', key: 'later', vote: 'accept', heir: 'keep' }[hub.card.kind];
      await hub.resolve(choice);
      continue;
    }
    const n = [...signsByShell(s.obs)].find(([, v]) => v.length);
    if (n && s.obs.iris.attention > 0 && s.obs.iris.silk >= 10) {
      await hub.flyTo(n[0]);
      const inside = recapFor(s.obs, { goal: s.goal, hub });
      assert.equal(inside.where.key, 'recap.where.shell');
      checkAll(inside, 'inside');
      await hub.stake();
      await hub.leave();
    } else await hub.advance();
  }
  assert.equal(s.obs.season.phase, 'end');
  const end = recapFor(s.obs, { goal: s.goal, hub });
  assert.equal(end.where.key, 'recap.where.end');
  const enEnd = checkAll(end, 'end').en;
  assert.match(enEnd.where, /^The season is over: the /);
  assert.ok(seen.has('recap.where.islandVerified') || seen.has('recap.where.island'));
  assert.ok(seen.has('recap.next.card.vote') || seen.has('recap.next.vote'), 'the vote was recapped');
  s.dispose();
});

test('recap: every goal of the walking mode and every decision card has a next sentence', () => {
  const base = { season: { phase: 'play', tick: 5, ticks: 17, tension: 20, contributionDeadline: 16, crisisTick: 13 }, iris: { silk: 40, anchors: [], fragment: { status: 'held', prize: { amount: 30, tick: 9 } }, keyVision: { open: false, confidentCells: 2, needCells: 8 }, ashKey: { known: false }, attention: 1 }, you: { zone: 'island' }, prophecies: [], chronicle: [], proofs: [], offers: [], relationships: { clans: [] }, auctions: [] };
  const goals = ['intro', 'reach_scroll', 'fragment', 'forget', 'anchor', 'end_tick', 'talk', 'ask', 'season_over', 'vote', 'speak_key', 'ash_key', 'mend', 'offer', 'fragment_decide', 'anchor_next', 'auction', 'next_tick', 'fly', 'stake', 'leave', 'inside', 'fly_next', 'wait'];
  for (const id of goals) {
    const goal = { id, key: 'goal.' + id, args: { shell: 'II', tick: 3, who: { $agentId: 'moss' } }, hintKey: 'goal.' + id + '.hint', hintArgs: { tension: 70, have: 1, need: 8, prize: 30, deadline: 16, confidence: 60 } };
    const r = recapFor(base, { goal });
    assert.notEqual(r.next.key, 'recap.next.fallback', id);
    checkAll(r, id);
  }
  checkAll(recapFor(base, { goal: { id: 'anchor', key: 'goal.anchor.any', args: {}, hintKey: 'goal.anchor.any.hint' } }), 'anchor.any');
  checkAll(recapFor(base, { goal: { id: 'season_over', key: 'goal.season_over', args: { outcome: 'gift' }, hintKey: 'goal.season_over.done' } }), 'done');
  for (const kind of ['offer', 'fragment', 'speak', 'key', 'vote', 'heir']) {
    const r = recapFor(base, { hub: { card: { kind, offer: { from: 'salt' } }, advancing: false } });
    assert.equal(r.next.key, 'recap.next.card.' + kind);
    checkAll(r, 'card ' + kind);
  }
  const passing = recapFor(base, { hub: { card: null, advancing: true } });
  assert.equal(passing.where.key, 'recap.where.passing'); assert.equal(passing.next.key, 'recap.next.passing');
  checkAll(passing, 'passing');
  checkAll(recapFor({ ...base, season: { ...base.season, phase: 'vote' } }, { goal: { id: 'vote', key: 'goal.vote', args: {}, hintKey: 'goal.vote.hint' } }), 'vote');
  checkAll(recapFor({ ...base, season: { ...base.season, phase: 'intro' } }, {}), 'intro');
  checkAll(recapFor(null, {}), 'null');
  const verified = recapFor({ ...base, iris: { ...base.iris, anchors: [{ shell: 2, tick: 3 }] }, chronicle: [{ tick: 3, meaning: { place: 2, action: 'gift', power: 20 } }] }, { goal: dynamicGoal(base) });
  assert.equal(verified.where.key, 'recap.where.islandVerified');
  const en = checkAll(verified, 'verified').en;
  assert.match(en.where, /one of our stakes has already come true\.$/);
  const uk = createPlayI18n('uk', { onMissing: () => {} });
  assert.match(renderMsg(uk, verified.where.key, { ...verified.where.args, n: 3 }), /3 наші ставки вже справдилися/);
  // the recap keys all live in the play strings of every locale
  for (const loc of LOCALES) for (const k of Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('recap.'))) assert.ok(k in PLAY_MESSAGES[loc], `${loc}:${k}`);
  assert.equal(currentGoal(base, {}).id, 'reach_scroll');
});

test('recap sheet: opens on ?, closes on Escape, speaks only when narration is on, read-aloud always speaks', async () => {
  const { doc } = installDom();
  doc.documentElement.style = { setProperty() {}, getPropertyValue: () => '' };
  const { createPlayContext } = await import('../src/play/i18n.js');
  const { createRecap } = await import('../src/play/recap.js');
  const { createNarration, fakeSynth } = await import('../src/play/narration.js');
  const { createSafeStorage, memoryStorage } = await import('../src/ui/storage.js');
  const { s, hub } = await hubSeason();
  const ctx = createPlayContext({ storage: createSafeStorage(memoryStorage()), locale: 'en' });
  const { synth, Utterance } = fakeSynth();
  const narration = createNarration({ prefs: ctx.prefs, i18n: ctx.i18n, synth, Utterance });
  const root = doc.createElement('div'); doc.body.appendChild(root);
  let opened = 0;
  const recap = createRecap({ root, ctx, session: s, hub, narration, onOpen: () => opened++ });
  const btn = root.querySelector('.a11y-recap-btn');
  assert.ok(btn, 'the ? button exists');
  assert.equal(btn.getAttribute('aria-label'), 'What is happening? (press ?)');
  assert.equal(recap.isOpen(), false);
  assert.equal(recap.handleKey('Slash', '?'), true);
  assert.equal(recap.isOpen(), true);
  assert.equal(opened, 1);
  const sheet = root.querySelector('.a11y-recap');
  assert.ok(sheet && sheet.getAttribute('role') === 'dialog');
  assert.equal(sheet.querySelector('.a11y-where').textContent, 'Trial 1 of 17. We stand on the island with 63 silk.');
  assert.match(sheet.querySelector('.a11y-next').textContent, /^A sign glows in Shell/);
  assert.equal(synth.spoken.length, 0, 'narration is off: silent');
  assert.equal(doc.activeElement, sheet.querySelector('[data-recap="close"]'), 'focus moves into the sheet');
  // read aloud works even with narration off
  sheet.querySelector('[data-recap="read"]').click();
  assert.equal(synth.spoken.length, 1);
  assert.match(synth.spoken[0].text, /^Trial 1 of 17\. We stand on the island with 63 silk\. A sign glows/);
  synth.finish(); await Promise.resolve();
  assert.equal(recap.handleKey('Escape'), true);
  assert.equal(recap.isOpen(), false);
  assert.equal(root.querySelector('.a11y-recap'), null);
  assert.equal(doc.activeElement, btn, 'focus returns to the opener');
  // narration on: the sheet speaks itself and a language switch re-renders it
  ctx.prefs.set({ narration: true });
  btn.click();
  assert.equal(synth.spoken.length, 2);
  ctx.i18n.setLocale('uk');
  assert.match(root.querySelector('.a11y-where').textContent, /^Випробування 1 з 17/);
  assert.equal(root.querySelector('.a11y-recap-btn').getAttribute('aria-label'), 'Що відбувається? (натисніть ?)');
  // the hub's state changes the next sentence live
  ctx.i18n.setLocale('en');
  await hub.flyTo([...signsByShell(s.obs)].find(([, v]) => v.length)[0]);
  assert.match(root.querySelector('.a11y-where').textContent, /^Trial 1 of 17\. We are inside Shell/);
  assert.equal(recap.handleKey('Escape'), true);
  assert.equal(ctx.i18n.missing.size, 0, [...ctx.i18n.missing].join(', '));
  recap.destroy();
  assert.equal(root.querySelector('.a11y-recap-btn'), null);
  s.dispose();
});
