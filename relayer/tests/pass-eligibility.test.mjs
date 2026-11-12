// Pass eligibility from the stored expedition log (lib/pass-eligibility.js): the log file per guest, the chain check
// first, then the portal rule; honest defaults when the rules, the directory or the log are missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogEligibility, loadLog } from '../lib/pass-eligibility.js';

const dir = mkdtempSync(join(tmpdir(), 'ftf-exp-'));
const G = 'ann.guests.ftf-coordinator.testnet';
writeFileSync(join(dir, G + '.jsonl'), [{ seq: 0, kind: 'quest_turned_in', silkC: 1_200_000, trust: 'T2' }, { seq: 1, kind: 'portal_paid', silkC: -1_000_000, trust: 'T2', data: { feeC: 1_000_000 } }].map((e) => JSON.stringify(e)).join('\n') + '\n');
// the same shapes as expedition-rules (verifyLog -> {ok}; portalEligibility -> {eligible, paid, earnedC, neededC, reason})
const rules = (ok = true) => ({ feeC: 1_000_000, verifyLog: () => ({ ok }), portalEligibility: (log) => { const paid = log.some((e) => e.kind === 'portal_paid'); const earnedC = log.filter((e) => e.silkC > 0).reduce((s, e) => s + e.silkC, 0); return { eligible: paid && earnedC >= 1_000_000, paid, earnedC, neededC: 1_000_000, reason: paid ? null : 'not_paid' }; } });

test('pass eligibility: the stored log, verified, then the portal rule', async () => {
  assert.deepEqual(await createLogEligibility({ dir, rules: rules() })(G), { eligible: true, paid: true, earned: 12000, needed: 10000, reason: null });
});

test('pass eligibility: a broken chain, no log, no rules -> not eligible, with the reason', async () => {
  assert.equal((await createLogEligibility({ dir, rules: rules(false) })(G)).reason, 'log_invalid');
  assert.equal((await createLogEligibility({ dir, rules: rules() })('bob.guests.ftf-coordinator.testnet')).reason, 'no_log');
  assert.equal((await createLogEligibility({ dir, rules: null })(G)).reason, 'rules_unavailable');
  for (const r of [await createLogEligibility({ dir, rules: rules(false) })(G), await createLogEligibility({ dir, rules: null })(G)]) assert.equal(r.eligible, false);
});

test('pass eligibility: only plain account ids name a log file', () => {
  for (const bad of ['../etc/passwd', 'a/b', '', 'A.guests', 'x'.repeat(65)]) assert.equal(loadLog(dir, bad), null, bad);
  assert.equal(loadLog(dir, G).length, 2);
});
