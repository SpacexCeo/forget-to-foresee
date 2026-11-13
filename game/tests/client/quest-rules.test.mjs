// The citizens' quests as pure rules (Q1, TZ §6.2-6.3): every transition of the per-quest machine, exactly-once
// rewards, kills only after acceptance and once per killId, the bounty's cooldown and daily rate, and a full run
// welcome → spiders → part → boss whose log replays and verifies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTS, GIVERS } from '../../src/game/quests-data.js';
import { applyQuest, initialQuests, questStatus, replayQuests, rewardSilk } from '../../src/game/quest-rules.js';
import { makeEntry, verifyLog } from '../../src/game/expedition-log.js';
import { EXPEDITION } from '../../src/game/expedition-config.js';

const run = (s, a, now = 1000) => applyQuest(s, a, { now });

const RICH = { spider_silk_thread: 99, chitin_plate: 99, crown_shard: 9 }; // monster resources (game/resources.js)

test('data: the owner quests, the guide and the bounty; givers are existing townsfolk', () => {
  assert.deepEqual(Object.keys(QUESTS), ['q_welcome', 'q_spiders', 'q_part', 'q_boss', 'b_spiders', 's_sign', 's_chest', 's_trade', 's_wheel', 's_voice', 'd_gather', 'd_deal', 't_enter', 't_agent']); // + the journal's side, daily and tournament quests
  assert.deepEqual(QUESTS.q_spiders.objective, { type: 'kill', mob: 'skitter', count: 10 });
  assert.equal(QUESTS.q_boss.objective.mob, 'crownrift'); assert.deepEqual(QUESTS.q_boss.requires, ['q_spiders'], 'gated on practice, not level');
  assert.deepEqual(GIVERS, ['elder', 'guard', 'lamplighter', 'shardkeeper']);
  const town = readFileSync(new URL('../../src/play/townsfolk-plan.js', import.meta.url), 'utf8');
  for (const g of GIVERS) assert.match(town, new RegExp(`key: '${g}'`), g + ' exists');
});

test('transitions: locked → available → active → ready → done; illegal actions rejected unchanged', () => {
  let s = initialQuests();
  assert.equal(questStatus(s, 'q_welcome'), 'available'); assert.equal(questStatus(s, 'q_spiders'), 'locked');
  assert.ok(run(s, { type: 'ACCEPT', questId: 'q_spiders' }).rejected === 'not_available');
  assert.ok(run(s, { type: 'TURN_IN', questId: 'q_welcome' }).rejected);
  assert.ok(run(s, { type: 'NOPE' }).rejected); assert.ok(run(s, { type: 'ACCEPT', questId: 'q_x' }).rejected);
  let r = run(s, { type: 'ACCEPT', questId: 'q_welcome' }); s = r.state;
  assert.equal(questStatus(s, 'q_welcome'), 'active'); assert.equal(r.events[0].kind, 'quest_accepted');
  s = run(s, { type: 'GUIDE', step: 'talked' }).state;
  r = run(s, { type: 'GUIDE', step: 'moved' }); s = r.state;
  assert.equal(questStatus(s, 'q_welcome'), 'ready'); assert.equal(r.events.at(-1).kind, 'quest_ready');
  r = run(s, { type: 'TURN_IN', questId: 'q_welcome' }); s = r.state;
  assert.deepEqual(r.events.map((e) => [e.kind, e.silkC, e.trust]), [['quest_turned_in', 800, 'T2']]);
  assert.ok(run(s, { type: 'TURN_IN', questId: 'q_welcome' }).rejected, 'paid once');
  assert.equal(questStatus(s, 'q_spiders'), 'available'); assert.equal(questStatus(s, 'q_boss'), 'locked', 'boss locked before spiders');
  // a kill made shortly before accepting counts (owner 13.11, the kill log); one giver at a time
  s = run(s, { type: 'KILL', mob: 'skitter', killId: 'k0' }).state;
  r = run(s, { type: 'ACCEPT', questId: 'q_spiders' }); s = r.state;
  assert.equal(s.quests.q_spiders.progress, 1);
  r = run(s, { type: 'ABANDON', questId: 'q_spiders' }); assert.equal(questStatus(r.state, 'q_spiders'), 'available'); assert.equal(r.events[0].kind, 'quest_abandoned');
  assert.ok(run(s, { type: 'ABANDON', questId: 'q_part' }).rejected);
  for (let i = 1; i <= 10; i++) { r = run(s, { type: 'KILL', mob: 'skitter', killId: 'k' + i }); s = r.state; }
  assert.equal(questStatus(s, 'q_spiders'), 'ready');
  assert.ok(run(s, { type: 'KILL', mob: 'skitter', killId: 'k3' }).rejected === 'duplicate', 'a kill counts once per killId');
  assert.ok(run(s, { type: 'ACCEPT', questId: 'b_spiders' }).rejected, 'the bounty waits for the spiders quest (same giver busy / locked)');
});

test('the part quest takes a salvage part at T2, an inventory part at T1; turning in needs a part', () => {
  let s = replayQuests([{ action: { type: 'ACCEPT', questId: 'q_welcome' }, now: 1 }, { action: { type: 'GUIDE', step: 'talked' }, now: 2 }, { action: { type: 'GUIDE', step: 'moved' }, now: 3 }, { action: { type: 'TURN_IN', questId: 'q_welcome' }, now: 4 }, { action: { type: 'ACCEPT', questId: 'q_part' }, now: 5 }]).state;
  assert.ok(run(s, { type: 'TURN_IN', questId: 'q_part', have: RICH }).rejected === 'no_part');
  assert.equal(run(s, { type: 'TURN_IN', questId: 'q_part', have: RICH, partId: 'part_gear', partSource: 'salvage' }).events[0].trust, 'T2');
  const inv = run(s, { type: 'TURN_IN', questId: 'q_part', have: RICH, partId: 'part_gear', partSource: 'inventory' }).events[0];
  assert.equal(inv.trust, 'T1'); assert.equal(inv.silkC, 1_600);
});

test('bounty: repeatable after its cooldown, full rate three times a day, then 10 %', () => {
  const H = 3600e3; let t = 10 * 24 * H; let s = initialQuests();
  const act = (a) => { const r = applyQuest(s, a, { now: t }); if (!r.rejected) s = r.state; return r; };
  act({ type: 'ACCEPT', questId: 'q_welcome' }); act({ type: 'GUIDE', step: 'talked' }); act({ type: 'GUIDE', step: 'moved' }); act({ type: 'TURN_IN', questId: 'q_welcome' });
  act({ type: 'ACCEPT', questId: 'q_spiders' }); let k = 0; const ten = () => { for (let i = 0; i < 10; i++) act({ type: 'KILL', mob: 'skitter', killId: 'b' + (k++) }); };
  ten(); act({ type: 'TURN_IN', questId: 'q_spiders', have: RICH });
  const pays = [];
  for (let i = 0; i < 5; i++) {
    assert.equal(act({ type: 'ACCEPT', questId: 'b_spiders' }).rejected, undefined, 'bounty ' + i);
    ten(); pays.push(act({ type: 'TURN_IN', questId: 'b_spiders', have: RICH }).events[0].silkC);
    assert.equal(questStatus(s, 'b_spiders', t), 'done'); assert.ok(act({ type: 'ACCEPT', questId: 'b_spiders' }).rejected, 'cooldown');
    t += 31 * 60e3;
  }
  assert.deepEqual(pays, [600, 600, 600, 100, 100]); // 6 silk, then round(0.6) = 1
  t += 24 * H; assert.equal(rewardSilk(s, 'b_spiders', t), 6, 'a new day, full rate again');
});

test('full run: welcome → spiders → part → boss; the log verifies and earned-verified equals the rules', () => {
  const acts = []; let t = 1000; const add = (a) => acts.push({ action: a, now: (t += 1000) });
  add({ type: 'ACCEPT', questId: 'q_welcome' }); add({ type: 'GUIDE', step: 'talked' }); add({ type: 'GUIDE', step: 'moved' }); add({ type: 'TURN_IN', questId: 'q_welcome' });
  add({ type: 'ACCEPT', questId: 'q_spiders' }); add({ type: 'ACCEPT', questId: 'q_part' });
  for (let i = 0; i < 10; i++) add({ type: 'KILL', mob: 'skitter', killId: 's' + i });
  add({ type: 'TURN_IN', questId: 'q_spiders', have: RICH }); add({ type: 'TURN_IN', questId: 'q_part', have: RICH, partId: 'part_gear', partSource: 'salvage' });
  add({ type: 'ACCEPT', questId: 'q_boss' }); add({ type: 'KILL', mob: 'crownrift', killId: 'boss1' }); add({ type: 'TURN_IN', questId: 'q_boss', have: RICH });
  const { state, events } = replayQuests(acts);
  assert.ok(['q_welcome', 'q_spiders', 'q_part', 'q_boss'].every((id) => questStatus(state, id) === 'done'));
  let log = []; for (const [i, e] of events.entries()) log = [...log, makeEntry(log, { t: 1000 + i, ...e })];
  const v = verifyLog(log, { killVerifyCapC: EXPEDITION.killVerifyCapC });
  const quests = (8 + 20 + 16 + 60) * 100, kills = 10 * EXPEDITION.kill.skitter + EXPEDITION.kill.crownrift;
  assert.equal(v.ok, true); assert.equal(v.earned, quests + kills); assert.equal(v.earnedVerified, quests + kills);
  assert.deepEqual(replayQuests(acts).state, state, 'replay gives the same state');
  assert.equal(events.find((e) => e.data.questId === 'q_boss' && e.kind === 'quest_turned_in').data.chest, 'rare');
});

test('the rules are pure: no DOM, no three, no engine, no wool', () => {
  for (const f of ['quests-data.js', 'quest-rules.js']) {
    const src = readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /document|window|from 'three'|engine\.js|room\.js|S\.silk|\bwool\b/, f);
  }
});

test('resources: a turn-in needs the quest\'s monster resources and logs what it consumed', () => {
  let s = replayQuests([{ action: { type: 'ACCEPT', questId: 'q_welcome' }, now: 1 }, { action: { type: 'GUIDE', step: 'talked' }, now: 2 }, { action: { type: 'GUIDE', step: 'moved' }, now: 3 }, { action: { type: 'TURN_IN', questId: 'q_welcome' }, now: 4 }, { action: { type: 'ACCEPT', questId: 'q_spiders' }, now: 5 }]).state;
  for (let i = 0; i < 10; i++) s = run(s, { type: 'KILL', mob: 'skitter', killId: 'r' + i }).state;
  assert.equal(run(s, { type: 'TURN_IN', questId: 'q_spiders' }).rejected, 'needs');
  assert.equal(run(s, { type: 'TURN_IN', questId: 'q_spiders', have: { spider_silk_thread: 4 } }).rejected, 'needs');
  const ok = run(s, { type: 'TURN_IN', questId: 'q_spiders', have: { spider_silk_thread: 5 } });
  assert.deepEqual(ok.events[0].data.consumed, { spider_silk_thread: 5 }); assert.equal(ok.events[0].silkC, 2_000);
});
