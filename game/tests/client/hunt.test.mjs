// The abstract hunt (TZ §7.3) and quest receipts (§7.4): the hunt's creature table equals play/mobs.js, the result is
// a pure function of the seed, the crown cannot be hunted with these constants (stated, not hidden), and the receipt
// arguments pass a re-implementation of the agent-ledger contract's checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveHunt, HUNT_MOBS, resolveHuntMob } from '../../src/game/hunt.js';
import { makeEntry } from '../../src/game/expedition-log.js';
import { receiptArgs, contractCheck } from '../../../tools/quest-receipt/lib.mjs';

test('hunt table: hp, damage and cooldown equal play/mobs.js MOB_TYPES', () => {
  const src = readFileSync(new URL('../../src/play/mobs.js', import.meta.url), 'utf8');
  for (const [id, T] of Object.entries(HUNT_MOBS)) {
    const line = src.split('\n').find((l) => l.trim().startsWith(id + ': Object.freeze({'));
    assert.ok(line, id);
    for (const k of ['hp', 'damage', 'cooldown']) assert.equal(Number(line.match(new RegExp('\\b' + k + ': ([0-9.]+)'))[1]), T[k], id + '.' + k);
  }
});

test('hunt: pure in the seed; ten spiders win; the crown is out of reach at hitRate 0.35 and 100 health; bad input refused', () => {
  const a = resolveHunt({ seed: 's', mob: 'spider', count: 10 });
  assert.deepEqual(resolveHunt({ seed: 's', mob: 'skitter', count: 10 }), a);
  assert.equal(a.won, true); assert.equal(a.kills, 10);
  assert.notDeepEqual(resolveHunt({ seed: 't', mob: 'skitter', count: 10 }).factors, a.factors);
  let crownWins = 0, spiderLosses = 0;
  for (let i = 0; i < 1000; i++) { if (resolveHunt({ seed: 'c' + i, mob: 'crownrift', count: 1 }).won) crownWins++; if (!resolveHunt({ seed: 'k' + i, mob: 'skitter', count: 10 }).won) spiderLosses++; }
  console.log(`hunt over 1000 seeds: crown wins ${crownWins}, ten-spider losses ${spiderLosses}`);
  assert.equal(crownWins, 0); assert.equal(spiderLosses, 0);
  assert.equal(resolveHunt({ seed: 's', mob: 'dragon', count: 1 }).reason, 'bad_mob');
  assert.equal(resolveHunt({ seed: 's', mob: 'skitter', count: 0 }).reason, 'bad_count');
  assert.equal(resolveHuntMob('Spiders'), 'skitter');
});

test('receipt: record_track arguments for a turn-in pass the contract checks; a non-receipt entry is refused', () => {
  const log = [];
  const add = (kind, data, silkC = 0, trust = 'T2') => log.push(makeEntry(log, { t: 1000 + log.length, kind, data, silkC, trust }));
  add('story_started', {}); add('quest_accepted', { questId: 'q_spiders', attempt: 1 });
  for (let i = 0; i < 60; i++) add('kill_ticketed', { mob: 'skitter', killId: 'k' + i }, 600, 'T2');
  add('quest_turned_in', { questId: 'q_spiders', attempt: 1 }, 100_000);
  const a = receiptArgs(log, log.length - 1, { rules: 'ab'.repeat(32) });
  assert.equal(contractCheck(a), null);
  assert.equal(a.npc, 'q_spiders'); assert.equal(a.epoch, 1); assert.equal(a.policy_version, 'quest-1'); assert.equal(a.pnl_bp, 0);
  assert.ok(a.trades_compact.split(';').length <= 50 && a.trades_compact.length <= 1200);
  assert.deepEqual(JSON.parse(a.params), { attempt: 1, logHead: log[log.length - 1].hash, questId: 'q_spiders', silkC: 100_000 });
  assert.equal(contractCheck({ ...a, npc: 'Q-Spiders' }), 'ERR_NPC');
  assert.equal(contractCheck({ ...a, params_hash: 'xyz' }), 'ERR_HASH');
  assert.equal(contractCheck({ ...a, bar_to: a.bar_from }), 'ERR_BARS');
  assert.throws(() => receiptArgs(log, 0), /not a quest turn-in/);
});
