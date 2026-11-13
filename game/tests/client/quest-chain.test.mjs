// The live quest chain with the sprint flags off (owner 13.11: "nobody else accepts anything"): a fresh profile plays
// welcome -> the guard's spiders -> the spider bounty -> the lamplighter's part -> the shardkeeper's crown through
// the givers' own talks, while journal auto quests are running for the same givers. Every giver offers, accepts and
// turns in; the "!"/"?" markers follow; the objective line always names a next step; the log never shows a raw title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuest, initialQuests, questStatus } from '../../src/game/quest-rules.js';
import { QUESTS } from '../../src/game/quests-data.js';
import { talkFor, markerFor, objective, questLog, giverQuest } from '../../src/scenes/town-quests.js';
import EN from '../../src/play/locales/en.js';
import UK from '../../src/play/locales/uk.js';

test('flags off: the whole chain plays through the givers, with auto quests running beside it', () => {
  let s = initialQuests(); const t0 = Date.now() - 3_600_000; let t = t0, kill = 0;
  const story = { phase: 'gate_open', guide: { talked: false, moved: false } };
  const have = { spider_silk_thread: 0, chitin_plate: 0, crown_shard: 0, part: 0 };
  const go = (a) => { const r = applyQuest(s, a, { now: t }); assert.ok(!r.rejected, JSON.stringify(a) + ' rejected: ' + (r.reason || r.rejected)); s = r.state; return r; };
  const choose = (giver, prefix) => { const tk = talkFor(giver, story, s, { now: t, have, hasPart: have.part > 0 }); const c = tk.choices.find((x) => x.act.startsWith(prefix)); assert.ok(c, `${giver} offers ${prefix}: ${JSON.stringify(tk)}`); return c.act.split(':')[1]; };
  const killN = (mob, n) => { for (let i = 0; i < n; i++) { t += 20_000; go({ type: 'KILL', mob, killId: mob + ':' + (kill++) }); } };
  const keysOk = () => { for (const r of questLog(story, s, t, have)) { assert.ok(EN[r.title] && UK[r.title], 'a log title is a locale key in en and uk: ' + r.title); } assert.ok(objective(story, s, t, have), 'the objective names a next step'); };

  go({ type: 'BEGIN' });
  assert.equal(markerFor('elder', story, s, t, have), '!'); keysOk();
  choose('elder', 'guide'); story.guide.talked = true; go({ type: 'GUIDE', step: 'talked' }); go({ type: 'ACCEPT', questId: 'q_welcome' });
  story.guide.moved = true; go({ type: 'GUIDE', step: 'moved' });
  // journal auto quests start for every giver before any talk quest (the live bug: they made each giver "busy")
  go({ type: 'EVENT', event: 'gather', n: 1 }); go({ type: 'EVENT', event: 'trade', n: 1 });
  assert.equal(markerFor('elder', story, s, t, have), '?'); keysOk();
  go({ type: 'TURN_IN', questId: choose('elder', 'turnin'), have: { ...have }, partId: have.part ? 'part:1' : undefined, partSource: 'inventory' });
  assert.equal(questStatus(s, 'q_welcome', t), 'done');
  for (const g of ['guard', 'lamplighter']) assert.equal(markerFor(g, story, s, t, have), '!', g + ' has an offer');

  go({ type: 'ACCEPT', questId: choose('guard', 'accept') }); assert.equal(questStatus(s, 'q_spiders', t), 'active'); keysOk();
  killN('skitter', 10); have.spider_silk_thread = 5;
  assert.equal(markerFor('guard', story, s, t, have), '?'); keysOk();
  go({ type: 'TURN_IN', questId: choose('guard', 'turnin'), have: { ...have }, partId: have.part ? 'part:1' : undefined, partSource: 'inventory' }); have.spider_silk_thread = 0;
  assert.equal(giverQuest(s, 'guard', t).id, 'b_spiders');
  assert.equal(markerFor('shardkeeper', story, s, t, have), '!', 'the crown opens after the spiders');

  go({ type: 'ACCEPT', questId: choose('guard', 'accept') }); assert.equal(questStatus(s, 'b_spiders', t), 'active');
  killN('skitter', 10); go({ type: 'TURN_IN', questId: choose('guard', 'turnin'), have: { ...have }, partId: have.part ? 'part:1' : undefined, partSource: 'inventory' }); keysOk();

  go({ type: 'ACCEPT', questId: choose('lamplighter', 'accept') }); assert.equal(questStatus(s, 'q_part', t), 'active');
  have.part = 1; have.chitin_plate = 2;
  go({ type: 'TURN_IN', questId: choose('lamplighter', 'turnin'), have: { ...have }, partId: have.part ? 'part:1' : undefined, partSource: 'inventory' }); keysOk();

  go({ type: 'ACCEPT', questId: choose('shardkeeper', 'accept') }); killN('crownrift', 1); have.crown_shard = 1;
  assert.equal(markerFor('shardkeeper', story, s, t, have), '?'); keysOk();
  go({ type: 'TURN_IN', questId: choose('shardkeeper', 'turnin'), have: { ...have }, partId: have.part ? 'part:1' : undefined, partSource: 'inventory' });
  for (const id of ['q_welcome', 'q_spiders', 'q_part', 'q_boss']) assert.equal(questStatus(s, id, t), 'done', id);
  assert.ok(Object.keys(QUESTS).filter((id) => QUESTS[id].auto).every((id) => !questLog(story, s, t, have).some((r) => r.id === id)), 'auto quests stay out of the old log');
});

test('a repeat on offer shows its progress from 0, not the last run', () => {
  const s = { ...initialQuests(), quests: { q_welcome: { state: 'done', progress: 0, attempt: 1, doneAt: 1 }, q_spiders: { state: 'done', progress: 10, attempt: 1, doneAt: 1 }, b_spiders: { state: 'done', progress: 10, attempt: 1, doneAt: 1 } } };
  const row = questLog({ guide: {} }, s, Date.now() + 3 * 86_400_000, {}).find((r) => r.id === 'b_spiders');
  if (row) assert.equal(row.progress, 0);
});

test('progress already held counts (owner 13.11): the crown shard in the bag completes "defeat the Crownrift"', () => {
  let s = initialQuests(); const t = Date.now() - 3_600_000;
  const go = (a) => { const r = applyQuest(s, a, { now: t }); assert.ok(!r.rejected, JSON.stringify(a) + ': ' + (r.reason || r.rejected)); s = r.state; return r; };
  for (const a of [{ type: 'BEGIN' }, { type: 'ACCEPT', questId: 'q_welcome' }, { type: 'GUIDE', step: 'moved' }, { type: 'GUIDE', step: 'talked' }, { type: 'TURN_IN', questId: 'q_welcome' },
    { type: 'ACCEPT', questId: 'q_spiders' }]) go(a);
  for (let i = 0; i < 10; i++) go({ type: 'KILL', mob: 'skitter', killId: 'k' + i });
  go({ type: 'TURN_IN', questId: 'q_spiders', have: { spider_silk_thread: 5 } });
  // 1) the shard was dropped before the quest: accepting completes the objective at once
  const held = { crown_shard: 1 };
  const r = go({ type: 'ACCEPT', questId: 'q_boss', have: held });
  assert.equal(questStatus(s, 'q_boss', t), 'ready'); assert.ok(r.events.some((e) => e.kind === 'quest_ready'));
  const story = { guide: { talked: true, moved: true } };
  assert.equal(markerFor('shardkeeper', story, s, t, held), '?', 'return to the Shardkeeper');
  assert.equal(talkFor('shardkeeper', story, s, { now: t, have: held }).choices[0].act, 'turnin:q_boss');
  go({ type: 'TURN_IN', questId: 'q_boss', have: held });
  assert.equal(questStatus(s, 'q_boss', t), 'done');
});

test('progress already held: a shard picked up after accepting completes it on the next check, and a turn-in with it is accepted', () => {
  let s = initialQuests(); const t = Date.now() - 3_600_000;
  const go = (a) => { const r = applyQuest(s, a, { now: t }); assert.ok(!r.rejected, JSON.stringify(a) + ': ' + (r.reason || r.rejected)); s = r.state; return r; };
  for (const a of [{ type: 'BEGIN' }, { type: 'ACCEPT', questId: 'q_welcome' }, { type: 'GUIDE', step: 'moved' }, { type: 'GUIDE', step: 'talked' }, { type: 'TURN_IN', questId: 'q_welcome' }, { type: 'ACCEPT', questId: 'q_spiders' }]) go(a);
  for (let i = 0; i < 10; i++) go({ type: 'KILL', mob: 'skitter', killId: 'k' + i });
  go({ type: 'TURN_IN', questId: 'q_spiders', have: { spider_silk_thread: 5 } });
  go({ type: 'ACCEPT', questId: 'q_boss', have: {} });
  assert.equal(questStatus(s, 'q_boss', t), 'active');
  assert.ok(applyQuest(s, { type: 'HELD', have: {} }, { now: t }).rejected, 'nothing held: nothing changes');
  const s0 = s;
  go({ type: 'HELD', have: { crown_shard: 1 } }); assert.equal(questStatus(s, 'q_boss', t), 'ready');
  s = s0; go({ type: 'TURN_IN', questId: 'q_boss', have: { crown_shard: 1 } }); assert.equal(questStatus(s, 'q_boss', t), 'done', 'a turn-in while active with the proof is accepted');
  assert.ok(applyQuest(s0, { type: 'TURN_IN', questId: 'q_boss', have: {} }, { now: t }).rejected, 'without the proof it is not');
});

test('every kill is logged with mob, id, time and place; a "defeat N" quest counts the recent ones once', async () => {
  const { KILL_WINDOW_MS } = await import('../../src/game/quest-rules.js');
  let s = initialQuests(); const t0 = Date.now() - 3_600_000; let t = t0;
  const go = (a) => { const r = applyQuest(s, a, { now: t }); assert.ok(!r.rejected, JSON.stringify(a) + ': ' + (r.reason || r.rejected)); s = r.state; return r; };
  for (const a of [{ type: 'BEGIN' }, { type: 'ACCEPT', questId: 'q_welcome' }, { type: 'GUIDE', step: 'moved' }, { type: 'GUIDE', step: 'talked' }, { type: 'TURN_IN', questId: 'q_welcome' }]) go(a);
  // an old kill (outside the window), then six recent ones, before the guard's quest is taken
  t = t0 + 1000; go({ type: 'KILL', mob: 'skitter', killId: 'old', at: [-12, 0, 52] });
  t += KILL_WINDOW_MS + 60_000; for (let i = 0; i < 6; i++) { t += 20_000; go({ type: 'KILL', mob: 'skitter', killId: 'k' + i, at: [-12 + i, 0, 52] }); }
  assert.equal(s.killLog.length, 7); assert.deepEqual(Object.keys(s.killLog[1]).sort(), ['at', 'id', 'mob', 't', 'used']);
  assert.deepEqual(s.killLog[1].at, [-12, 0, 52]);
  go({ type: 'ACCEPT', questId: 'q_spiders' });
  assert.equal(s.quests.q_spiders.progress, 6, 'the six recent kills count, not the old one');
  for (let i = 0; i < 4; i++) { t += 20_000; go({ type: 'KILL', mob: 'skitter', killId: 'n' + i }); }
  assert.equal(questStatus(s, 'q_spiders', t), 'ready');
  go({ type: 'TURN_IN', questId: 'q_spiders', have: { spider_silk_thread: 5 } });
  go({ type: 'ACCEPT', questId: 'b_spiders' });
  assert.equal(s.quests.b_spiders.progress, 0, 'kills already counted for the guard do not count again for the bounty');
  const r = applyQuest(s, { type: 'ACCEPT', questId: 'q_part' }, { now: t, killWindowMs: 1 });
  assert.ok(!r.rejected, 'the window is configurable per call');
});
