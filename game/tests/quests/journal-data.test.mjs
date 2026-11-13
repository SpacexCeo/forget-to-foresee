// The quest journal's data and rules (sprint §4.4-4.6, §4.14 tests 1-5): the schema validator, statusOf for every
// state (level gate, cooldown), progressOf for each objective type, reward idempotency, the daily reset at 00:00 UTC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL, JOURNAL_BY_ID, validateJournal, CATEGORIES } from '../../src/game/journal-data.js';
import { QUESTS } from '../../src/game/quests-data.js';
import { applyQuest, initialQuests, statusOf, progressOf, nextDailyReset } from '../../src/game/quest-rules.js';

const DAY = 86_400_000, T0 = 20_000 * DAY + 3600_000; // 01:00 UTC
const act = (s, a, now = T0) => { const r = applyQuest(s, a, { now }); return r.rejected ? s : r.state; };

test('schema: the 14 quests pass; a missing marker, a count of 0 or an over-long string are refused', () => {
  assert.equal(JOURNAL.length, 14); assert.deepEqual(validateJournal(), []);
  assert.deepEqual(new Set(JOURNAL.map((q) => q.category)), new Set(CATEGORIES));
  for (const q of JOURNAL) assert.ok(QUESTS[q.id], q.id + ' has rules');
  const spiders = JOURNAL_BY_ID.q_spiders;
  assert.match(validateJournal([{ ...spiders, hints: [{ text: 'x', marker: 'nowhere' }] }]).join(), /hint marker nowhere/);
  assert.match(validateJournal([{ ...spiders, objectives: [{ id: 'k', type: 'kill', count: 0 }] }]).join(), /objective count/);
  assert.match(validateJournal([{ ...spiders, description: 'x'.repeat(221) }]).join(), /description over 220/);
  assert.match(validateJournal([{ ...spiders, hints: [{ text: 'y'.repeat(141), marker: null }] }]).join(), /hint over 140/);
  assert.equal(JOURNAL_BY_ID.s_sign.summary, 'Optional: the innkeeper on the lower street has a sign to read.');
});

test('statusOf: locked, level gate, available, active, ready, completed, cooldown', () => {
  let s = initialQuests();
  assert.deepEqual(statusOf('q_spiders', s, T0), { status: 'locked' });
  assert.deepEqual(statusOf('q_boss', s, T0, { level: 1 }), { status: 'locked', reason: 'level', level: 3 });
  assert.deepEqual(statusOf('q_welcome', s, T0), { status: 'available' });
  s = act(s, { type: 'ACCEPT', questId: 'q_welcome' }); assert.equal(statusOf('q_welcome', s, T0).status, 'active');
  s = act(s, { type: 'GUIDE', step: 'talked' }); s = act(s, { type: 'GUIDE', step: 'moved' });
  assert.equal(statusOf('q_welcome', s, T0).status, 'ready');
  s = act(s, { type: 'TURN_IN', questId: 'q_welcome' }); assert.equal(statusOf('q_welcome', s, T0).status, 'completed');
  s = act(s, { type: 'EVENT', event: 'gather', n: 5 });
  assert.equal(statusOf('d_gather', s, T0).status, 'cooldown');
  assert.equal(statusOf('d_gather', s, nextDailyReset(T0)).status, 'available', 'back at 00:00 UTC');
});

test('progressOf: talk, reach, kill, deliver, part and event objectives', () => {
  let s = act(initialQuests(), { type: 'ACCEPT', questId: 'q_welcome' }); s = act(s, { type: 'GUIDE', step: 'talked' });
  assert.deepEqual(progressOf('q_welcome', s).map((o) => [o.id, o.count, o.of, o.done]), [['talk', 1, 1, true], ['walk', 0, 1, false]]);
  s = act(s, { type: 'KILL', mob: 'skitter', killId: 'k0' }); s = act(s, { type: 'ACCEPT', questId: 'q_spiders' });
  for (let i = 1; i <= 3; i++) s = act(s, { type: 'KILL', mob: 'skitter', killId: 'k' + i });
  assert.deepEqual(progressOf('q_spiders', s, { have: { spider_silk_thread: 2 } }).map((o) => [o.id, o.count, o.of]), [['kill', 3, 10], ['deliver', 2, 5]]);
  assert.deepEqual(progressOf('q_part', s, { have: { part: 1, chitin_plate: 5 } }).map((o) => [o.count, o.of, o.done]), [[1, 1, true], [2, 2, true]]);
  s = act(s, { type: 'EVENT', event: 'gather', n: 2 });
  assert.deepEqual(progressOf('d_gather', s).map((o) => [o.count, o.of]), [[2, 5]]);
  assert.equal(progressOf('nope', s).length, 0);
});

test('rewards are idempotent: an auto quest pays once per completion; a second event pays nothing', () => {
  const r1 = applyQuest(initialQuests(), { type: 'EVENT', event: 'open_chest' }, { now: T0 });
  assert.equal(r1.events.filter((e) => e.kind === 'quest_turned_in' && e.data.questId === 's_chest').length, 1);
  assert.equal(r1.events.find((e) => e.kind === 'quest_turned_in').silkC, 300);
  const r2 = applyQuest(r1.state, { type: 'EVENT', event: 'open_chest' }, { now: T0 + 1 });
  assert.equal(r2.rejected, 'no_quest', 'nothing left to count');
  const t = applyQuest(initialQuests(), { type: 'EVENT', event: 'enter_tournament' }, { now: T0 });
  assert.equal(t.events.find((e) => e.kind === 'quest_turned_in').data.title, 'Contender');
});

test('nextDailyReset: 00:00 UTC of the next day, across the day boundary', () => {
  assert.equal(nextDailyReset(T0), 20_001 * DAY);
  assert.equal(nextDailyReset(20_001 * DAY - 1), 20_001 * DAY);
  assert.equal(nextDailyReset(20_001 * DAY), 20_002 * DAY);
});
