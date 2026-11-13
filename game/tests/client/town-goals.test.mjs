// The town economy's small goals and "your share" (src/ui/town-goals.js) and how the Town works window shows them:
// first trade, first pledge, pledges on 3 days of the week, the player's part of each works, the day's estimate at the
// last week's rate, a "how it works" list, a link to the player's own transactions; five locales, agreed words only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { GOALS_KEY, loadGoals, recordGoal, goalsView, shareView, watchTradeGoals } from '../../src/ui/town-goals.js';
import { readMe } from '../../src/net/town-act.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const DAY = 86_400_000, T0 = 20770 * DAY + 3_600_000;
const store = (init) => { const m = new Map(init ? [[GOALS_KEY, init]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('goals: first trade, first pledge, and pledges on 3 different days within the last 7', () => {
  const s = store();
  assert.deepEqual(goalsView(loadGoals(s), T0).map((g) => [g.id, g.done, g.n]), [['first_trade', false, 0], ['first_pledge', false, 0], ['streak', false, 0]]);
  recordGoal(s, 'trade', T0); recordGoal(s, 'pledge', T0); recordGoal(s, 'pledge', T0 + 3600_000);
  let v = goalsView(loadGoals(s), T0);
  assert.deepEqual(v.map((g) => g.done), [true, true, false]); assert.equal(v[2].n, 1, 'two pledges on one day count once');
  recordGoal(s, 'pledge', T0 + 2 * DAY); recordGoal(s, 'claim', T0 + 2 * DAY);
  assert.equal(goalsView(loadGoals(s), T0 + 2 * DAY)[2].n, 2, 'a claim is not a pledge');
  recordGoal(s, 'pledge', T0 + 5 * DAY);
  v = goalsView(loadGoals(s), T0 + 5 * DAY); assert.equal(v[2].done, true); assert.equal(v[2].n, 3); assert.equal(v[2].of, 3);
  assert.equal(goalsView(loadGoals(s), T0 + 8 * DAY)[2].n, 2, 'the first day falls out of the week');
  assert.equal(recordGoal(s, 'gift', T0), null, 'unknown kinds are not counted');
});

test('goals: a broken or hand-edited store reads as a clean one; no storage keeps working', () => {
  assert.deepEqual(loadGoals(store('{ nope')), { trade: 0, pledge: 0, claim: 0, pledgeDays: [] });
  assert.deepEqual(loadGoals(store(JSON.stringify({ trade: -4, pledge: 'x', claim: 2, pledgeDays: [5, 5, 'a', -1, 3] }))), { trade: 0, pledge: 0, claim: 2, pledgeDays: [3, 5] });
  assert.equal(recordGoal(null, 'trade', T0).trade, 1);
  const s = store(); for (let i = 0; i < 20; i++) recordGoal(s, 'pledge', T0 + i * DAY);
  assert.equal(loadGoals(s).pledgeDays.length, 14, 'the day list stays short');
});

test('your share: the part of each works from active deeds, waiting rewards, the day estimate at the last week rate', () => {
  const me = readMe({
    registered: true, pools: [{ principal: '200000000' }, { principal: '0' }, { principal: '50000000' }, { principal: '10000000' }],
    rate_7d_per_100: ['7000000', '0', '1400000', '0'],
    deeds: [
      { token_id: 'a', asset: 0, principal: '50000000', state: 0, claimable: '300000' },
      { token_id: 'b', asset: 2, principal: '10000000', state: 0, claimable: '0' },
      { token_id: 'c', asset: 3, principal: '10000000', state: 1, claimable: '0' }, // unbonding: no longer in the share
    ],
  });
  const s = shareView(me);
  assert.deepEqual(s.works.map((w) => [w.id, w.mine, w.pct]), [['loom', '50000000', 25], ['caravan', '0', 0], ['archive', '10000000', 20], ['observatory', '0', 0]]);
  assert.equal(s.claimable, '300000'); assert.equal(s.any, true);
  // loom: 50 silk × 7 per 100 / 7 days = 0.5 a day; archive: 10 × 1.4 / 100 / 7 = 0.02 a day
  assert.equal(s.perDay, '520000');
  const none = shareView(readMe({ registered: true })); assert.equal(none.claimable, '0'); assert.equal(none.perDay, '0'); assert.equal(none.any, false);
  assert.equal(shareView(null).any, false);
});

test('trades announced by the market and the stalls count toward the first-trade goal', () => {
  const handlers = {}; const win = { addEventListener: (n, f) => { handlers[n] = f; }, removeEventListener: (n) => { delete handlers[n]; } };
  const s = store(); const stop = watchTradeGoals({ storage: s, win, now: () => T0 });
  handlers['ftf:feat']({ detail: { k: 'level', v: 3 } }); assert.equal(loadGoals(s).trade, 0);
  handlers['ftf:feat']({ detail: { k: 'trade' } }); assert.equal(loadGoals(s).trade, 1);
  stop(); assert.equal(handlers['ftf:feat'], undefined);
});

test('works window: how it works, the goals strip, your share and your part per works, a link to your transactions', async () => {
  const { doc } = installDom();
  const { createTownWorksPanel } = await import('../../src/ui/town-works-panel.js');
  const t = (k, a) => createPlayI18n('en').t(k, a);
  const me = readMe({
    registered: true, configured: true, silk: '90000000', day: 20770,
    pools: [{ principal: '200000000' }, { principal: '0' }, { principal: '0' }, { principal: '0' }], rate_7d_per_100: ['7000000', '0', '0', '0'],
    params: { lock_days: [0, 5], deed_fee: '500000', cooldown_days: 2 },
    deeds: [{ token_id: 'deed-1', asset: 0, principal: '50000000', state: 0, locked_until_day: 1, claimable: '300000' }],
  });
  const s = store(); recordGoal(s, 'trade', Date.now());
  let acted = 0;
  const client = { me: async () => ({ ok: true, me }), act: async () => { acted++; return { ok: true, hash: null }; }, guest: () => ({ accountId: 'ann.guests.ftf-coordinator.testnet' }) };
  const p = createTownWorksPanel({ t, client, storage: s, doc });
  await p.open();
  const box = doc.querySelector('.tw'); const text = box.textContent;
  assert.ok(doc.querySelector('details.tw-how')); assert.equal(doc.querySelectorAll('details.tw-how li').length, 4);
  assert.deepEqual(doc.querySelectorAll('.tw-goal').map((g) => [g.textContent, g.className.includes('done')]), [['First trade', true], ['First pledge', false], ['Pledge on 3 days this week: 0/3', false]]);
  assert.ok(text.includes('Your share today, about 0.50 · waiting to claim 0.30'), text);
  assert.ok(text.includes('Yours: 50 silk (25% of this works)'));
  assert.ok(text.includes(PLAY_MESSAGES.en['works.rateZero']), 'a zero rate says why');
  const link = box.querySelectorAll('a').find((a) => a.textContent === 'Your transactions');
  assert.equal(link.href, 'https://testnet.nearblocks.io/address/ann.guests.ftf-coordinator.testnet');
  box.querySelectorAll('button').find((b) => b.textContent === 'Pledge').click();
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(acted, 1); assert.equal(loadGoals(s).pledge, 1, 'a pledge that went through counts');
  assert.ok(doc.querySelectorAll('.tw-goal')[1].className.includes('done'), 'the strip updates after the pledge');
  p.close();
});

test('goals and share copy: five locales, translated, never invest/APY/profit/returns', () => {
  const keys = ['works.how.title', 'works.how.1', 'works.how.2', 'works.how.3', 'works.how.4', 'works.goals', 'works.goal.first_trade', 'works.goal.first_pledge', 'works.goal.streak', 'works.shareToday', 'works.waiting', 'works.shareNote', 'works.yours', 'works.rateZero', 'works.myTx'];
  for (const k of keys) assert.ok(PLAY_MESSAGES.en[k], k);
  for (const lang of ['ru', 'uk', 'it', 'zh']) for (const k of keys) { assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`); assert.notEqual(PLAY_MESSAGES[lang][k], PLAY_MESSAGES.en[k], `${lang}:${k} translated`); }
  assert.doesNotMatch(keys.map((k) => PLAY_MESSAGES.en[k]).join(' '), /\b(invest\w*|APY|APR|profit|dividend|returns?|yield|interest)\b/i);
  assert.match(PLAY_MESSAGES.en['works.shareNote'], /can be zero/); assert.match(PLAY_MESSAGES.en['works.shareNote'], /no real value/);
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of ['works.goal.streak', 'works.yours']) assert.match(PLAY_MESSAGES[lang][k], /\{(n|silk)\}/, `${lang}:${k} keeps its slots`);
});

test('town ledger: "Take part" shows the same goals in every locale and opens the Town works window', async () => {
  const { normalizeLedger } = await import('../../src/net/town-ledger.js');
  const { mountTownLedger } = await import('../../src/ui/town-ledger.js');
  const stats = { enabled: true, contract: 'ftf-town.testnet', target: 24000, traders: 20, today: 5, recent: [] };
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) {
    const { doc } = installDom();
    const i18n = createPlayI18n(lang, { onMissing: (k) => { throw new Error(`missing ${lang}:${k}`); } });
    const s = store(); recordGoal(s, 'pledge', Date.now());
    const sent = []; const win = { dispatchEvent: (e) => sent.push(e.type) };
    const v = mountTownLedger({ doc, t: (k, a) => i18n.t(k, a), poll: async () => normalizeLedger(stats), timers: { setTimeout: () => 1, clearTimeout: () => {} }, storage: s, win });
    doc.body.append(v.root);
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    const goals = doc.querySelectorAll('.tl-goal');
    assert.equal(goals.length, 3, lang); assert.deepEqual(goals.map((g) => g.className.includes('done')), [false, true, false], lang);
    assert.ok(goals[2].textContent.includes('1/3'), lang);
    doc.querySelector('.tl-go').click(); assert.deepEqual(sent, ['ftf:town-works-open'], lang);
    if (lang === 'en') assert.doesNotMatch(doc.querySelector('.tl-part').textContent, /\b(invest\w*|APY|APR|profit|dividend|returns?|yield|interest)\b/i);
    v.destroy();
  }
});
