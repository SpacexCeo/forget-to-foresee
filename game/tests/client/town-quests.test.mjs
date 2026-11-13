// The Expedition in the town (story P2/P3/P5): talks per giver, the objective line, kills from the window event, the
// elder's guide, and the twist (the fee is spent exactly once and the story ends onward, never home).
import test from 'node:test';
import assert from 'node:assert/strict';
import { talkFor, objective, giverQuest, createTownQuests } from '../../src/scenes/town-quests.js';
import { initialState } from '../../src/game/expedition.js';
import { initialQuests, applyQuest } from '../../src/game/quest-rules.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { EXPEDITION } from '../../src/game/expedition-config.js';
import { memStorage, fakeDoc, fakeI18n } from './story-fakes.mjs';
import { readFileSync } from 'node:fs';
import { createInventory } from '../../src/game/inventory.js';

const FOLK = { elder: [0, 0, 0], guard: [10, 0, 0], lamplighter: [20, 0, 0], shardkeeper: [30, 0, 0] };
function rig({ search = '', silkC = 0, gate = null } = {}) {
  const storage = memStorage(), doc = fakeDoc(), win = new EventTarget();
  let t = 1_000_000; const now = () => (t += 1000);
  const townLedger = createTownLedger({ storage, now });
  if (silkC) townLedger.grant({ silk: silkC });
  const departs = [], chests = [];
  const inventory = createInventory({ storage });
  const tq = createTownQuests({ storage, townLedger, i18n: fakeI18n(), folkAt: (k) => FOLK[k] || null, chests: { add: (c) => chests.push(c) }, inventory,
    depart: async (o) => { departs.push(o); return true; }, gate, search, doc, win, now });
  let kn = 0; const kill = (type) => win.dispatchEvent(Object.assign(new Event('ftf:mob-killed'), { detail: { type, pos: [0, 0, 0], elite: false, killId: 't:' + type + '#' + (++kn) } }));
  const killId = (id) => win.dispatchEvent(Object.assign(new Event('ftf:mob-killed'), { detail: { type: 'skitter', pos: [0, 0, 0], elite: false, killId: id } }));
  return { tq, townLedger, doc, departs, chests, kill, killId, storage, win, inventory };
}
function finishGuide(r) {
  r.tq.act('elder', 'guide:talked');
  r.tq.update([0, 0, 0]); r.tq.update([8, 0, 0]); // walked off: the 'moved' step
  r.tq.act('elder', 'turnin:q_welcome');
}

test('talks: the elder guides, the guard is locked until the welcome, the lamplighter lists the steps', () => {
  const s = initialState(), q = initialQuests();
  assert.deepEqual(talkFor('elder', s, q).lines, ['story.guide.hello']);
  assert.deepEqual(talkFor('elder', s, q).choices.map((c) => c.act), ['line:story.guide.fee', 'line:story.guide.how', 'guide:talked']);
  assert.deepEqual(talkFor('guard', s, q).lines, ['quest.locked.spiders']);
  assert.equal(giverQuest(q, 'guard').id, 'q_spiders');
  assert.equal(giverQuest(q, 'nobody'), null);
  const q2 = applyQuest(applyQuest(applyQuest(q, { type: 'GUIDE', step: 'talked' }).state, { type: 'ACCEPT', questId: 'q_welcome' }).state, { type: 'GUIDE', step: 'moved' }).state;
  const done = applyQuest(q2, { type: 'TURN_IN', questId: 'q_welcome' }).state;
  const lamp = talkFor('lamplighter', s, done);
  assert.deepEqual(lamp.lines, ['quest.part.offer', 'quest.part.step1', 'quest.part.step2', 'quest.part.step3', 'quest.needs.ask']);
  assert.deepEqual(lamp.needs, { chitin_plate: 2 });
  assert.equal(talkFor('guard', s, done).choices[0].act, 'accept:q_spiders');
});

test('objective line: one goal, the story step before any quest, the tracker of an active quest', () => {
  assert.equal(objective({ ...initialState(), phase: 'arrival' }, initialQuests()).key, 'story.step.talk');
  const r = rig();
  finishGuide(r);
  r.tq.act('guard', 'accept:q_spiders');
  assert.deepEqual(objective(r.tq.story, r.tq.quests, Date.now()), { key: 'quest.track.spiders', args: { n: 0, count: 10 } });
  const line = r.doc.find('ftf-story-goal')[0];
  assert.match(line.textContent, /quest\.track\.spiders/); assert.match(line.textContent, /story\.goal\.silk/);
  r.tq.setActive(false); assert.equal(line.hidden, true);
  r.tq.setActive(true); assert.equal(line.hidden, false);
  r.tq.dispose(); assert.equal(r.doc.find('ftf-story-goal').length, 0);
});

test('the guide: talk, walk, report — the welcome pays once and the gathering opens', () => {
  const r = rig();
  assert.equal(r.tq.story.phase, 'arrival');
  finishGuide(r);
  assert.equal(r.tq.quests.quests.q_welcome.state, 'done');
  assert.equal(r.tq.story.phase, 'gathering');
  const paid = r.townLedger.silk;
  assert.ok(paid > 0);
  r.tq.act('elder', 'turnin:q_welcome'); assert.equal(r.townLedger.silk, paid, 'a second turn-in pays nothing');
  assert.equal(r.tq.ledger.verify().ok, true);
});

test('kills: ten skitters from the window event finish the spiders, the turn-in pays once; kills before acceptance do not count', () => {
  const r = rig();
  finishGuide(r);
  r.kill('skitter'); assert.equal(r.tq.quests.quests.q_spiders, undefined, 'not accepted yet');
  r.tq.act('guard', 'accept:q_spiders');
  for (let i = 0; i < 10; i++) r.kill('skitter');
  r.kill('veilbell');
  assert.equal(r.tq.quests.quests.q_spiders.state, 'ready');
  assert.equal(objective(r.tq.story, r.tq.quests, Date.now(), {}).key, 'quest.track.needs', 'ready, but the threads are missing');
  const dropped = r.inventory.count('spider_silk_thread'); // the kills rolled their drops (game/resources.js)
  assert.ok(dropped > 0);
  r.inventory.add('spider_silk_thread', 5, 'drop');
  assert.equal(objective(r.tq.story, r.tq.quests, Date.now(), { spider_silk_thread: 5 }).key, 'quest.track.ready');
  const before = r.townLedger.silk;
  r.tq.act('guard', 'turnin:q_spiders');
  assert.equal(r.inventory.count('spider_silk_thread'), dropped, 'the turn-in consumed five threads');
  assert.equal(r.townLedger.silk - before, 2_000);
  r.tq.act('guard', 'turnin:q_spiders'); assert.equal(r.townLedger.silk - before, 2_000);
  assert.equal(r.tq.quests.quests.q_spiders.state, 'done');
  assert.equal(r.tq.ledger.verify().ok, true);
});

test('kills: the event\'s killId (play/mobs.js) is used, so the same kill never counts twice', () => {
  const r = rig();
  finishGuide(r); r.tq.act('guard', 'accept:q_spiders');
  r.killId('sess:skitter_0#1'); r.killId('sess:skitter_0#1'); r.killId('sess:skitter_0#2');
  assert.equal(r.tq.quests.quests.q_spiders.progress, 2);
  assert.ok(r.tq.quests.kills.includes('sess:skitter_0#1'));
});

test('talk panel: E opens it on a giver in reach, buttons act, walking off closes it', () => {
  const r = rig();
  const elder = r.tq.spots.find((s) => s.id === 'story_elder');
  assert.equal(elder.near([1, 0, 1]), true); assert.equal(elder.near([5, 0, 5]), false);
  assert.match(elder.prompt(), /story\.talk\.prompt/);
  elder.onInteract();
  assert.equal(r.tq.talking, true); assert.equal(elder.busy(), true);
  const okBtn = r.doc.find('ftf-story-talk')[0].querySelectorAll('button')[2];
  okBtn.click();
  assert.equal(r.tq.story.guide.talked, true);
  r.tq.update([0, 0, 0]); r.tq.update([6, 0, 0]);
  assert.equal(r.tq.talking, false, 'walked off');
});

/** A fake ftf-town gate (rev 4: pay_gate on chain): balance and price in hundredths; pay burns once. */
function fakeGate({ balanceC = 0, priceC = 20_000, reason = null } = {}) {
  const g = { balanceC, priceC, paid: null, pays: 0,
    async read() { return reason ? { ok: false, reason } : { ok: true, priceC: g.priceC, balanceC: g.balanceC, paid: g.paid }; },
    async pay() { g.pays++; if (reason) return { ok: false, reason }; if (g.paid) return { ok: true, hash: 'tx-again', record: g.paid }; if (g.balanceC < g.priceC) return { ok: false, reason: 'no_silk' }; g.balanceC -= g.priceC; g.paid = { gate_id: 'loom' }; return { ok: true, hash: 'tx-1', record: g.paid }; } };
  return g;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the twist: the gate is paid on chain once (pay_gate), the log records the receipt, the story ends onward with the stipend', async () => {
  const gate = fakeGate({ balanceC: 25_000 });
  const r = rig({ silkC: 50_000, gate }); await settle();
  finishGuide(r); await r.tq.refreshChain();
  assert.equal(r.tq.story.phase, 'gate_open', 'the on-chain balance opened the gate');
  assert.deepEqual(r.tq.portalFacts().blocker, null); assert.equal(r.tq.portalFacts().feeC, 20_000);
  assert.equal(await r.tq.payGate(), true);
  assert.equal(gate.pays, 1); assert.equal(gate.balanceC, 5_000, 'the contract burned the price');
  assert.equal(r.departs.length, 1); assert.equal(r.departs[0].sub, 'story.twist.line');
  assert.equal(r.tq.story.phase, 'onward'); assert.ok(r.tq.story.titles.includes('gate_walker'));
  const paid = r.tq.ledger.log.filter((e) => e.kind === 'portal_paid');
  assert.equal(paid.length, 1); assert.equal(paid[0].data.tx, 'tx-1'); assert.equal(paid[0].silkC, -20_000);
  assert.equal(await r.tq.payGate(), false, 'never twice'); assert.equal(gate.pays, 1);
  assert.equal(r.tq.ledger.verify().ok, true);
});

test('portal eligibility: the full fee once, covered by verified income; unearned silk does not count; the onward event fires', async () => {
  const { portalEligibility, PORTAL_FEE_C } = await import('../../src/game/portal-eligibility.js');
  const gate = fakeGate({ balanceC: PORTAL_FEE_C });
  const r = rig({ silkC: PORTAL_FEE_C, gate }); await settle();
  let onward = null; r.win.addEventListener('ftf:story-onward', (e) => { onward = e.detail; });
  finishGuide(r); await r.tq.refreshChain();
  assert.equal(portalEligibility(r.tq.ledger.log).reason, 'not_paid');
  assert.equal(await r.tq.payGate(), true);
  const e = portalEligibility(r.tq.ledger.log);
  assert.equal(e.paid, true); assert.equal(e.eligible, false, 'silk not earned in the log is unverified'); assert.equal(e.reason, 'income_unverified');
  assert.match(onward.logHead, /^[0-9a-f]{64}$/);
  const { makeEntry } = await import('../../src/game/expedition-log.js');
  const log = []; const add = (kind, data, silkC, trust = 'T2') => log.push(makeEntry(log, { t: 1 + log.length, kind, data, silkC, trust }));
  for (let i = 0; i < 20; i++) add('quest_turned_in', { questId: 'q_x' + i }, 1_000);
  add('portal_paid', { feeC: PORTAL_FEE_C, demo: false }, -PORTAL_FEE_C);
  assert.equal(portalEligibility(log).eligible, true);
});

test('the gate stays shut without a guest account, off chain, below the price; a failed payment says why', async () => {
  const none = rig({ gate: fakeGate({ reason: 'need_guest' }) }); await settle(); finishGuide(none); await none.tq.refreshChain();
  assert.equal(none.tq.portalFacts().blocker, 'need_guest'); assert.equal(await none.tq.payGate(), false); assert.equal(none.departs.length, 0);
  const off = rig({ gate: fakeGate({ reason: 'network' }) }); await settle(); await off.tq.refreshChain();
  assert.equal(off.tq.portalFacts().blocker, 'network');
  const poor = rig({ gate: fakeGate({ balanceC: 19_999 }) }); await settle(); finishGuide(poor); await poor.tq.refreshChain();
  assert.equal(poor.tq.story.phase, 'gathering');
  const g = fakeGate({ balanceC: 20_000 }); const race = rig({ gate: g }); await settle(); finishGuide(race); await race.tq.refreshChain();
  g.balanceC = 0; // spent elsewhere between the read and the click
  assert.equal(await race.tq.payGate(), false); assert.equal(race.tq.portalFacts().payError, 'no_silk'); assert.equal(race.tq.story.phase, 'gathering');
  const nogate = rig(); await settle(); assert.equal(await nogate.tq.payGate(), false, 'no chain, no payment (no demo mode)');
});

test('story strings: every key the views use exists in all five play locales', async () => {
  const src = ['town-quests.js', 'town-portal.js'].map((f) => readFileSync(new URL('../../src/scenes/' + f, import.meta.url), 'utf8')).join('\n')
    + readFileSync(new URL('../../src/game/quests-data.js', import.meta.url), 'utf8') + readFileSync(new URL('../../src/game/expedition.js', import.meta.url), 'utf8');
  const keys = new Set(src.match(/'(story|quest)\.[a-z0-9.]+[a-z0-9]'/gi).map((k) => k.slice(1, -1)).filter((k) => !/\.$/.test(k)));
  for (const short of ['spiders', 'part', 'boss', 'bounty']) for (const s of ['offer', 'yes', 'report', 'ready', 'thanks']) keys.add(`quest.${short}.${s}`);
  const enQuests = (await import('../../src/play/locales/en-quests.js')).default; // the sprint's English copy: the fallback in every locale (sprint rule 1)
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const dict = (await import(`../../src/play/locales/${loc}.js`)).default;
    const missing = [...keys].filter((k) => !(k in dict) && !(k in enQuests) && !['quest.track.', 'story.portal.'].includes(k));
    assert.deepEqual(missing, [], loc);
  }
});
