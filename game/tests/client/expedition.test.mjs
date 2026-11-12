// The Expedition core (Q0, docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md): the story state machine, the
// hash-chained log, the ledger façade over town silk, and the rules that keep it apart from the engine and from wool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduce, initialState, PHASES, storyStep } from '../../src/game/expedition.js';
import { makeEntry, verifyLog, canonical, ZERO } from '../../src/game/expedition-log.js';
import { createExpeditionLedger, EXPEDITION_KEY } from '../../src/game/expedition-ledger.js';
import { EXPEDITION, portalFee, storyOn } from '../../src/game/expedition-config.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';

const go = (s, a, ctx) => reduce(s, a, ctx);

test('the fee is 10,000 town silk (1,000,000 hundredths); the flag defaults off; a demo fee is labelled', () => {
  assert.equal(EXPEDITION.PORTAL_FEE_C, 1_000_000); assert.equal(EXPEDITION.currency, 'silk');
  assert.equal(storyOn(''), false); assert.equal(storyOn('?story=1'), true); assert.equal(storyOn('?demo=judge'), false);
  assert.deepEqual(portalFee(''), { feeC: 1_000_000, demo: false });
  assert.deepEqual(portalFee('?portalFee=500'), { feeC: 50_000, demo: true });
});

test('state machine: every legal transition, every illegal one rejected without change', () => {
  assert.deepEqual(PHASES, ['off', 'prologue', 'arrival', 'guide', 'gathering', 'gate_open', 'twist', 'onward']);
  let s = initialState();
  for (const bad of [{ type: 'ARRIVED' }, { type: 'PAY_GATE', balanceC: 2e6 }, { type: 'TWIST_DONE' }, { type: 'GUIDE_STEP', id: 'talked' }, { type: 'NOPE' }]) {
    const r = go(s, bad); assert.ok(r.rejected, bad.type); assert.equal(r.state, s, 'unchanged');
  }
  let r = go(s, { type: 'START' }); assert.equal(r.state.phase, 'prologue'); assert.equal(r.events[0].kind, 'story_started');
  assert.ok(go(r.state, { type: 'START' }).rejected);
  r = go(r.state, { type: 'ARRIVED' }); assert.equal(r.state.phase, 'arrival'); assert.equal(storyStep(r.state), 'story.step.talk');
  assert.equal(go(initialState(), { type: 'START', skipPrologue: true }).state.phase, 'arrival');
  r = go(r.state, { type: 'GUIDE_STEP', id: 'talked' }); assert.equal(r.state.phase, 'guide'); assert.equal(r.events[0].kind, 'guide_step');
  assert.ok(go(r.state, { type: 'GUIDE_STEP', id: 'flew' }).rejected);
  assert.deepEqual(go(r.state, { type: 'GUIDE_STEP', id: 'talked' }).state.phase, 'gathering', "the elder's second talk opens the gathering (never blocks)");
  for (const id of ['moved', 'struck']) r = go(r.state, { type: 'GUIDE_STEP', id });
  assert.equal(r.state.phase, 'guide');
  r = go(r.state, { type: 'GUIDE_STEP', id: 'dashed' }); assert.equal(r.state.phase, 'gathering', 'all four steps open it too');
  assert.equal(go(r.state, { type: 'SILK', balanceC: 999_999 }).state.phase, 'gathering');
  assert.ok(go(r.state, { type: 'PAY_GATE', balanceC: 2e6 }).rejected, 'the gate is not open yet');
  r = go(r.state, { type: 'SILK', balanceC: 1_000_000 }); assert.equal(r.state.phase, 'gate_open'); assert.equal(storyStep(r.state), 'story.step.portal');
  assert.equal(go(r.state, { type: 'SILK', balanceC: 10 }).state.phase, 'gathering', 'silk spent elsewhere closes it again');
  assert.ok(go(r.state, { type: 'PAY_GATE', balanceC: 10 }).rejected);
  const paid = go(r.state, { type: 'PAY_GATE', balanceC: 1_000_000 }, { now: 5 });
  assert.equal(paid.state.phase, 'twist'); assert.equal(paid.state.paidAt, 5);
  assert.deepEqual(paid.events, [{ kind: 'portal_paid', data: { feeC: 1_000_000, demo: false }, silkC: -1_000_000 }]);
  assert.ok(go(paid.state, { type: 'PAY_GATE', balanceC: 2e6 }).rejected, 'never paid twice');
  const on = go(paid.state, { type: 'TWIST_DONE' }); assert.equal(on.state.phase, 'onward'); assert.equal(on.events[0].silkC, EXPEDITION.stipendC);
  assert.equal(go(on.state, { type: 'PASS_SHOWN' }).state.passShown, true);
});

test('log: canonical, hash-chained; tampering a byte, a delta or a seq fails with the right reason', () => {
  assert.equal(canonical({ b: 1, a: { d: [2, { z: 1, y: 0 }], c: 'x' } }), '{"a":{"c":"x","d":[2,{"y":0,"z":1}]},"b":1}');
  let log = [];
  for (const [i, k] of ['story_started', 'quest_accepted', 'quest_turned_in'].entries()) log = [...log, makeEntry(log, { t: 100 + i, kind: k, data: { i }, silkC: k === 'quest_turned_in' ? 100_000 : 0 })];
  assert.equal(log[0].prev, ZERO); assert.equal(log[1].prev, log[0].hash);
  const ok = verifyLog(log); assert.equal(ok.ok, true); assert.equal(ok.earned, 100_000);
  const bad = (mut, reason) => { const l = JSON.parse(JSON.stringify(log)); mut(l); const r = verifyLog(l); assert.equal(r.ok, false); assert.equal(r.reason, reason); };
  bad((l) => { l[1].data.i = 9; }, 'hash');
  bad((l) => { l[2].silkC = 200_000; }, 'hash');
  bad((l) => { l.splice(1, 1); }, 'seq');
  bad((l) => { l[2].kind = 'wool_minted'; }, 'kind');
  bad((l) => { l[1].prev = ZERO; }, 'chain');
  bad((l) => { l[2].t = 1; }, 'time');
  assert.equal(verifyLog(log, { expectDelta: (e) => (e.kind === 'quest_turned_in' ? 50_000 : 0) }).reason, 'rules', 'a delta the rules do not compute fails');
});

test('ledger: balance = start + sum of story deltas; spend never below zero; the fee is spent once; persisted', () => {
  const storage = memoryStorage(); let t = 1000;
  const town = createTownLedger({ storage });
  const start = town.silk;
  const L = createExpeditionLedger({ storage, now: () => ++t, town });
  assert.ok(L.append({ kind: 'quest_turned_in', data: { questId: 'q_spiders' }, silkC: 100_000 }).ok);
  assert.ok(L.append({ kind: 'kill_ticketed', data: { mob: 'skitter' }, silkC: 1000, trust: 'T1' }).ok);
  assert.equal(L.balanceC, start + 101_000);
  assert.equal(L.earnedC, 101_000); assert.equal(L.earnedVerifiedC, 101_000);
  assert.deepEqual(L.append({ kind: 'portal_paid', silkC: -1_000_000 }), { ok: false, reason: 'no_silk' }, 'not enough: nothing logged, nothing spent');
  assert.equal(L.log.length, 2);
  town.grant({ silk: 1_000_000 });
  assert.ok(L.append({ kind: 'portal_paid', data: { feeC: 1_000_000 }, silkC: -1_000_000 }).ok);
  assert.equal(L.balanceC, start + 101_000);
  assert.deepEqual(town.spend({ silkC: 10 ** 9 }), { ok: false, reason: 'no_silk' }); assert.deepEqual(town.spend({ silkC: -5 }), { ok: false, reason: 'bad_amount' });
  const again = createExpeditionLedger({ storage, now: () => ++t, town: createTownLedger({ storage }) });
  assert.equal(again.log.length, 3); assert.equal(again.verify().ok, true); assert.ok(storage.getItem(EXPEDITION_KEY));
});

test('the story core never touches the engine, the room, the network, three or wool', () => {
  for (const f of ['expedition.js', 'expedition-log.js', 'expedition-ledger.js', 'expedition-config.js']) {
    const src = readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /engine\.js|room\.js|\.\.\/net\/|from 'three'|S\.silk/, f);
    assert.doesNotMatch(src, /\bwool\b/i, f + ': no wool');
  }
});
