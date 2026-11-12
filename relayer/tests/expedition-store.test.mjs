// POST /api/expedition/log (story TZ Q4): signed batches append to FTF_EXPEDITION_DIR/<guest>.jsonl after the hash
// chain, the rule bounds and the kill plausibility checks; retries are no-ops, forks and gaps are refused; without a
// directory nothing is stored; the pass eligibility (lib/pass-eligibility.js) reads what was stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { logMessage, appendBatch, checkEntries, validateLogBatch } from '../lib/expedition-store.js';
import { expeditionLogHandler } from '../api/expedition/log.js';
import { createLogEligibility } from '../lib/pass-eligibility.js';
import { createBucket } from '../lib/core.js';

const GUEST = 'ann-1.guests.ftf-coordinator.testnet';
const T0 = Date.UTC(2026, 10, 12, 8, 0);
function logOf(events) { const log = []; for (const [t, kind, data = {}, silkC = 0, trust = 'T2'] of events) log.push(makeEntry(log, { t, kind, data, silkC, trust })); return log; }
async function signed(kp, entries, fromSeq, at = Date.now(), account = GUEST) {
  const key = await importSecretKey(kp.secretKey);
  const sig = b58encode(await key.sign(new TextEncoder().encode(logMessage(account, at, fromSeq, entries.length, entries[entries.length - 1].hash))));
  return { account_id: account, public_key: kp.publicKey, at, signature: sig, from_seq: fromSeq, entries };
}
function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; } }; }
const big = () => createBucket({ capacity: 10_000, refillMs: 1 });
const call = async (h, method, body, url = '/api/expedition/log') => { const res = fakeRes(); await h({ method, url, headers: {}, body, socket: { remoteAddress: '1.2.3.4' } }, res); return { status: res.statusCode, body: JSON.parse(res.body || '{}') }; };
const tmp = () => mkdtempSync(join(tmpdir(), 'ftf-exp-'));

test('storage off: nothing is stored and the answer says so', async () => {
  const kp = await generateKeyPair();
  const h = expeditionLogHandler({ env: {}, ownsKey: async () => true, ipBucket: big(), guestBucket: big(), now: () => T0 + 60_000 });
  const log = logOf([[T0, 'story_started']]);
  const r = await call(h, 'POST', await signed(kp, log, 0, T0 + 60_000));
  assert.deepEqual(r, { status: 200, body: { stored: false, reason: 'storage_off' } });
  assert.deepEqual((await call(h, 'GET', undefined, '/api/expedition/log?guest=' + GUEST)).body, { stored: false, reason: 'storage_off' });
});

test('signed batches append in order; a retry is a no-op; a fork or a gap is refused; others\' keys and bad signatures are refused', async (t) => {
  const dir = tmp(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kp = await generateKeyPair(), now = T0 + 3600_000;
  const h = expeditionLogHandler({ env: { FTF_EXPEDITION_DIR: dir }, ownsKey: async (acc, pk) => pk === kp.publicKey, ipBucket: big(), guestBucket: big(), now: () => now });
  const log = logOf([[T0, 'story_started'], [T0 + 1000, 'guide_step', { id: 'talked' }], [T0 + 2000, 'quest_accepted', { questId: 'q_welcome', attempt: 1 }], [T0 + 3000, 'quest_turned_in', { questId: 'q_welcome', attempt: 1 }, 40_000]]);
  const a = await call(h, 'POST', await signed(kp, log.slice(0, 2), 0, now));
  assert.equal(a.status, 200); assert.equal(a.body.length, 2);
  assert.equal((await call(h, 'POST', await signed(kp, log.slice(0, 2), 0, now + 1))).body.replayed, true);
  assert.equal((await call(h, 'POST', await signed(kp, log.slice(3), 3, now + 2))).body.error, 'gap');
  const other = logOf([[T0, 'story_started'], [T0 + 5, 'guide_step', { id: 'moved' }]]);
  assert.equal((await call(h, 'POST', await signed(kp, other.slice(1), 1, now + 3))).body.error, 'fork');
  const stranger = await generateKeyPair();
  assert.equal((await call(h, 'POST', await signed(stranger, log.slice(2), 2, now + 4))).status, 403);
  const forged = await signed(kp, log.slice(2), 2, now + 5); forged.at += 1;
  assert.equal((await call(h, 'POST', forged)).status, 401);
  const b = await call(h, 'POST', await signed(kp, log.slice(2), 2, now + 6));
  assert.equal(b.status, 200); assert.equal(b.body.length, 4); assert.equal(b.body.head, log[3].hash);
  const lines = readFileSync(join(dir, GUEST + '.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((e) => e.hash), log.map((e) => e.hash));
  const st = (await call(h, 'GET', undefined, '/api/expedition/log?guest=' + GUEST)).body;
  assert.equal(st.length, 4); assert.equal(st.head, log[3].hash);
  assert.equal(validateLogBatch({ ...(await signed(kp, log.slice(0, 1), 0, now)), at: now - 3600_000 }, now).error, 'stale');
});

test('rule bounds and kill plausibility: T2 kills, forged silk, a quest twice, kills too fast or too many, the future are refused', () => {
  const now = T0 + 86_400_000;
  const k = (t, silk = 600, trust = 'T1', mob = 'skitter') => [t, 'kill_ticketed', { mob, killId: 'k' + t }, silk, trust];
  const reason = (events) => (checkEntries(logOf(events), 0, now) || {}).reason || null;
  assert.equal(reason([k(T0), k(T0 + 1000)]), null);
  assert.equal(reason([k(T0, 600, 'T2')]), 'kill_trust');
  assert.equal(reason([k(T0, 601)]), 'kill_silk');
  assert.equal(reason([k(T0), k(T0 + 500)]), 'kill_too_fast');
  assert.equal(reason([k(T0, 20000, 'T1', 'crownrift'), k(T0 + 5000, 20000, 'T1', 'crownrift')]), 'kill_too_fast', 'the crown takes 13 s at least');
  assert.equal(reason(Array.from({ length: 41 }, (_, i) => k(T0 + i * 1000))), 'kill_window');
  assert.equal(reason([[T0, 'quest_turned_in', { questId: 'q_spiders' }, 100_001]]), 'quest_silk');
  assert.equal(reason([[T0, 'quest_turned_in', { questId: 'q_spiders' }, 100_000], [T0 + 1, 'quest_turned_in', { questId: 'q_spiders' }, 100_000]]), 'quest_twice');
  assert.equal(reason([[T0, 'bounty_resolved', { questId: 'b_spiders' }, 30_000], [T0 + 60_000, 'bounty_resolved', { questId: 'b_spiders' }, 30_000]]), 'bounty_cooldown');
  assert.equal(reason([[T0, 'guide_step', { id: 'talked' }, 5]]), 'silk');
  assert.equal(reason([[T0, 'stipend_granted', {}, 99_999]]), 'stipend');
  assert.equal(reason([[now + 10 * 60_000, 'story_started']]), 'future');
});

test('end to end: a played log stored batch by batch makes the guest eligible for the pass; an altered stored line does not', async (t) => {
  const dir = tmp(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ev = [[T0, 'story_started']]; let t1 = T0 + 1000;
  for (const [q, silk] of [['q_welcome', 40_000], ['q_spiders', 100_000], ['q_part', 80_000], ['q_boss', 300_000]]) { ev.push([t1, 'quest_accepted', { questId: q, attempt: 1 }]); ev.push([t1 + 1000, 'quest_turned_in', { questId: q, attempt: 1 }, silk]); t1 += 2000; }
  for (let i = 0; i < 834; i++) { t1 += 8000; ev.push([t1, 'kill_ticketed', { mob: 'skitter', killId: 's#' + i }, 600, 'T1']); } // 5,004 silk, 37 kills per 5 min
  ev.push([t1 + 1000, 'portal_paid', { feeC: 1_000_000, demo: false }, -1_000_000]);
  const log = logOf(ev), now = t1 + 60_000;
  for (let from = 0; from < log.length; from += 50) {
    const r = await appendBatch({ accountId: GUEST, fromSeq: from, entries: log.slice(from, from + 50) }, { dir, now });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const eligible = createLogEligibility({ dir });
  const e = await eligible(GUEST);
  assert.equal(e.eligible, true, JSON.stringify(e)); assert.equal(e.paid, true); assert.ok(e.earned >= 10_000);
  const file = join(dir, GUEST + '.jsonl'), lines = readFileSync(file, 'utf8').trim().split('\n');
  const tampered = JSON.parse(lines[5]); tampered.silkC = 999_999; lines[5] = JSON.stringify(tampered);
  (await import('node:fs')).writeFileSync(file, lines.join('\n') + '\n');
  assert.equal((await eligible(GUEST)).reason, 'log_invalid');
});
