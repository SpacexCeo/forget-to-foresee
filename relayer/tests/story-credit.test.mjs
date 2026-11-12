// Story credits on chain (rev 4 §3.5): stored log entries become credit_silk(account, micro-silk, "story:<kind>:<seq>")
// by the coordinator, in order, capped per account (100 silk a day, 230 in total) and for all accounts (6,000 a day);
// what a cap holds back waits and is credited later; state moves only after the transaction succeeded (rule S4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { planCredits, creditStory, CREDIT, creditEnv } from '../lib/story-credit.js';

const G = 'ann-1.guests.ftf-coordinator.testnet', DAY = 86_400_000, T0 = 20_000 * DAY;
function logOf(events) { const log = []; for (const [t, kind, data = {}, silkC = 0, trust = 'T2'] of events) log.push(makeEntry(log, { t, kind, data, silkC, trust })); return log; }

test('plan: only story rewards, in order; the per-day, total and all-account caps hold the rest back', () => {
  const log = logOf([[T0, 'story_started'], [T0 + 1, 'quest_turned_in', { questId: 'q_welcome' }, 800], [T0 + 2, 'kill_ticketed', { mob: 'skitter' }, 12, 'T1'], [T0 + 3, 'guide_step', {}, 0], [T0 + 4, 'portal_paid', {}, -20_000]]);
  const p = planCredits(log, { lastSeq: -1, totalC: 0 }, { day: -1, c: 0 }, T0);
  assert.deepEqual(p.credits.map((c) => [c.seq, c.kind, c.silkC]), [[1, 'quest_turned_in', 800], [2, 'kill_ticketed', 12]]);
  assert.equal(p.st.lastSeq, 4);
  const big = logOf([[T0, 'quest_turned_in', { questId: 'q_boss' }, 6_000], [T0 + 1, 'quest_turned_in', { questId: 'q_spiders' }, 2_000], [T0 + 2, 'quest_turned_in', { questId: 'q_part' }, 1_600], [T0 + 3, 'quest_turned_in', { questId: 'q_welcome' }, 800]]);
  assert.deepEqual(planCredits(big, { lastSeq: -1, totalC: 0 }, { day: -1, c: 0 }, T0).credits.map((c) => c.seq), [0, 1, 2], 'the fourth would pass 100 silk today: it waits');
  assert.deepEqual(planCredits(big, { lastSeq: 1, totalC: 22_500, day: 0, dayC: 0 }, { day: -1, c: 0 }, T0 + 2 * DAY).credits, [], '230 silk in total');
  assert.deepEqual(planCredits(big, { lastSeq: -1, totalC: 0 }, { day: Math.floor(T0 / DAY), c: CREDIT.allDayC - 100 }, T0).credits, [], 'the all-account ceiling');
});

test('credit: credit_silk calls with micro-silk and story references; state moves only after success; the rest is credited the next day', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ftf-credit-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = logOf([[T0, 'quest_turned_in', { questId: 'q_boss' }, 6_000], [T0 + 1, 'quest_turned_in', { questId: 'q_spiders' }, 2_000], [T0 + 2, 'quest_turned_in', { questId: 'q_part' }, 1_600], [T0 + 3, 'quest_turned_in', { questId: 'q_welcome' }, 800]]);
  const sent = [];
  const fail = await creditStory({ dir, guest: G, log, now: T0, send: async () => ({ ok: false, hash: 'h0' }) });
  assert.equal(fail.credited, 0); assert.equal(fail.error, 'tx_failed');
  const a = await creditStory({ dir, guest: G, log, now: T0, send: async (calls) => { sent.push(...calls); return { ok: true, hash: 'h1' }; } });
  assert.equal(a.credited, 9_600); assert.equal(a.pending, 800);
  assert.deepEqual(sent.map((c) => [c.methodName, c.args.account_id, c.args.amount, c.args.reference]), [['credit_silk', G, '60000000', 'story:quest_turned_in:0'], ['credit_silk', G, '20000000', 'story:quest_turned_in:1'], ['credit_silk', G, '16000000', 'story:quest_turned_in:2']]);
  const again = await creditStory({ dir, guest: G, log, now: T0 + 1000, send: async () => { throw new Error('must not send'); } });
  assert.equal(again.credited, 0, 'nothing twice, the fourth still waits for tomorrow');
  const b = await creditStory({ dir, guest: G, log, now: T0 + DAY, send: async (calls) => { sent.push(...calls); return { ok: true, hash: 'h2' }; } });
  assert.equal(b.credited, 800); assert.equal(sent.at(-1).args.reference, 'story:quest_turned_in:3');
  assert.equal(creditEnv({}).on, false); assert.equal(creditEnv({ FTF_STORY_CREDIT: '1', FTF_TOWN_COORDINATOR: 'c.testnet', FTF_TOWN_COORDINATOR_KEY: 'ed25519:x' }).on, true);
});
