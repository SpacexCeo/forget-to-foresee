// The Expedition's pure rules exist twice: in the game (game/src/game/) and here for the server-side replay
// (relayer/lib/expedition-rules/). They must be byte-identical (docs/plans/story, TZ §4.4), like near-tx.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = ['crypto', 'expedition-config', 'expedition-log', 'expedition', 'quests-data', 'quest-rules', 'portal-eligibility'];
test('relayer/lib/expedition-rules is a byte-identical copy of the game rules', () => {
  for (const f of FILES) {
    const game = readFileSync(new URL(`../../game/src/game/${f}.js`, import.meta.url), 'utf8');
    const here = readFileSync(new URL(`../lib/expedition-rules/${f}.js`, import.meta.url), 'utf8');
    assert.equal(here, game, f + '.js differs: copy game/src/game/' + f + '.js again');
  }
});

test('the copy runs on the server: a log verifies with the same rules', async () => {
  const { makeEntry, verifyLog } = await import('../lib/expedition-rules/expedition-log.js');
  const { applyQuest, initialQuests } = await import('../lib/expedition-rules/quest-rules.js');
  let s = initialQuests(); let log = [];
  for (const a of [{ type: 'ACCEPT', questId: 'q_welcome' }, { type: 'GUIDE', step: 'talked' }, { type: 'GUIDE', step: 'moved' }, { type: 'TURN_IN', questId: 'q_welcome' }]) {
    const r = applyQuest(s, a, { now: 1 }); s = r.state; for (const e of r.events) log = [...log, makeEntry(log, { t: log.length, ...e })];
  }
  assert.deepEqual([verifyLog(log).ok, verifyLog(log).earned], [true, 40_000]);
});
