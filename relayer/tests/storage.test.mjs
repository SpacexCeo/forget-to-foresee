// The relayer on the database (lib/storage.js; ../../db/index.js): with a database active every JSON store hands out
// its database twin with the same behaviour, and nothing is written to the data folder; without one the files are
// used as before; a database that cannot be opened stops the server at start with a clear message.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../db/index.js';
import { setActiveDb, resetDb, activeDb, requireStorage } from '../lib/storage.js';
import { createIdentityStore } from '../lib/auth.js';
import { createCodes, emailId, EMAIL } from '../lib/email-auth.js';
import { createCreditLedger, readGateLog } from '../lib/town-gate.js';
import { loadLog } from '../lib/pass-eligibility.js';
import { appendBatch, logStatus } from '../lib/expedition-store.js';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { jsonlLog, fileStore } from '../market/index.js';
import { createPassStore } from '../lib/pass.js';
import { createClaimLog } from '../lib/wheel.js';
import { createP2P, loadBook } from '../lib/p2p.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'ftf-store-'));
const ACC = 'ann-1a.guests.ftf-coordinator.testnet';
const withDb = (fn) => async () => { const db = openDatabase(':memory:'); setActiveDb(db); try { await fn(db); } finally { resetDb(); } };
after(() => resetDb());

test('no FTF_DB: the JSON files, as before', () => {
  resetDb();
  assert.equal(activeDb({}), null); assert.match(requireStorage({}), /JSON files/);
  const dir = tmp(); const s = createIdentityStore(join(dir, 'auth', 'identities.json'));
  s.set('evm:0x1', { account: ACC, kind: 'evm' });
  assert.deepEqual(readdirSync(join(dir, 'auth')), ['identities.json']);
});

test('identities and email codes live in the database; nothing is written to the data folder', withDb((db) => {
  const dir = tmp(); const s = createIdentityStore(join(dir, 'auth', 'identities.json'));
  const rec = { account: ACC, guest_key: 'ed25519:g', kind: 'evm', address: '0x1', linked_at: 'x', history: [] };
  s.set('evm:0x1', rec);
  assert.deepEqual(s.get('evm:0x1'), rec); assert.deepEqual(s.all(), [['evm:0x1', rec]]); assert.equal(s.size, 1);
  assert.deepEqual(readdirSync(dir), [], 'no identities.json');
  assert.equal(createIdentityStore(join(dir, 'x.json')).get('evm:0x1').account, ACC, 'a second store (a restart) reads the same rows');
  assert.equal(s.remove('evm:0x1'), true); assert.equal(s.size, 0);

  let t = 1_000_000; const mk = () => createCodes({ now: () => t, rand: () => 42 });
  const a = mk(); assert.equal(a.issue('ann@b.co', 'login').code, '000042');
  assert.equal(db.codes.get(emailId('ann@b.co')).purpose, 'login'); assert.ok(!JSON.stringify(db.raw.prepare('SELECT email_id FROM email_codes').all()).includes('ann@'), 'the address is not stored');
  const b = mk(); // the relayer restarted: the code is still good, once
  assert.equal(b.take('ann@b.co', '111111', 'login').error, 'wrong_code'); assert.equal(b.take('ann@b.co', '000042', 'login').ok, true); assert.equal(b.take('ann@b.co', '000042', 'login').error, 'code_expired');
  b.issue('ann@b.co', 'login'); for (let i = 0; i < EMAIL.maxTries; i++) b.take('ann@b.co', '999999', 'login');
  assert.equal(mk().take('ann@b.co', '000042', 'login').error, 'too_many_tries', 'tries survive a restart too');
  for (let i = 0; i < 3; i++) b.issue('ann@b.co', 'login');
  assert.equal(mk().issue('ann@b.co', 'login').error, 'too_many_codes'); t += 3600_001; assert.ok(mk().issue('ann@b.co', 'login').code);
  b.issue('c@d.co', 'link', ACC); t += EMAIL.codeTtlMs + 1; assert.equal(b.take('c@d.co', '000042', 'link').error, 'code_expired');
}));

test('town credits, journals and the gate log, the daemon state', withDb((db) => {
  const dir = tmp();
  const ledger = createCreditLedger(join(dir, 'town-credits'));
  assert.deepEqual(ledger.get(ACC), { credited: '0', day: 0, today: '0' });
  ledger.put(ACC, { credited: '7', day: 3, today: '7' }); assert.deepEqual(createCreditLedger(join(dir, 'town-credits')).get(ACC), { credited: '7', day: 3, today: '7' });
  const now = Date.UTC(2026, 10, 14, 12);
  const gate = jsonlLog(join(dir, 'town-gate')), trades = jsonlLog(join(dir, 'town-log'));
  gate({ at: now - 1000, kind: 'gate', account: ACC }); gate({ at: now - 2000, kind: 'credit', account: ACC }); gate({ at: now - 3 * 86_400_000, kind: 'gate', account: 'old.testnet' });
  trades({ at: now, buyer: 'guard' });
  assert.deepEqual(readGateLog(join(dir, 'town-gate'), now).map((e) => e.account), [ACC], 'gate rows of today and yesterday only');
  assert.equal(db.journal.count('town-log'), 1); assert.equal(db.journal.count('town-gate'), 3);
  const st = fileStore(join(dir, 'town-state.json')); assert.equal(st.load(), null); st.save({ day: 1, today: 2 }); assert.deepEqual(fileStore(join(dir, 'town-state.json')).load(), { day: 1, today: 2 });
  assert.deepEqual(readdirSync(dir), [], 'nothing in the data folder');
}));

test('expedition logs: append, replay, fork and gap answers as with files; the log reads back for the credits', withDb(async (db) => {
  const dir = tmp(), T0 = Date.UTC(2026, 10, 13, 12), now = T0 + 86_400_000;
  const log = []; for (const [t, kind, data, silkC, trust] of [[T0, 'quest_turned_in', { questId: 'q_spiders' }, 2000, 'T2'], [T0 + 5000, 'kill_ticketed', { mob: 'skitter', killId: 'k1' }, 12, 'T1'], [T0 + 9000, 'kill_ticketed', { mob: 'skitter', killId: 'k2' }, 12, 'T1']]) log.push(makeEntry(log, { t, kind, data, silkC, trust }));
  const first = await appendBatch({ accountId: ACC, fromSeq: 0, entries: log.slice(0, 2) }, { dir, now });
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.length, 2);
  assert.equal((await appendBatch({ accountId: ACC, fromSeq: 0, entries: log.slice(0, 2) }, { dir, now })).body.replayed, true);
  assert.equal((await appendBatch({ accountId: ACC, fromSeq: 5, entries: log.slice(2) }, { dir, now })).body.error, 'gap');
  assert.equal((await appendBatch({ accountId: ACC, fromSeq: 2, entries: log.slice(2) }, { dir, now })).body.length, 3);
  assert.deepEqual(loadLog(dir, ACC).map((e) => e.hash), log.map((e) => e.hash)); assert.equal(loadLog(dir, 'nobody.testnet'), null);
  const s = logStatus(dir, ACC); assert.equal(s.length, 3); assert.equal(s.head, log[2].hash); assert.ok(s.bytes > 100);
  assert.equal(db.expedition.status(ACC).length, 3); assert.deepEqual(readdirSync(dir), []);
}));

test('receipts (pass and wheel claims) and the player market book', withDb(async (db) => {
  const dir = tmp();
  const pass = createPassStore(dir);
  pass.put({ claim_id: 'c1', wallet: 'ann.near', status: 'queued' }); pass.put({ claim_id: 'c1', wallet: 'ann.near', status: 'minted' }); pass.put({ claim_id: 'c2', wallet: 'bob.near', status: 'queued' });
  const again = createPassStore(dir); // a restart
  assert.equal(again.get('c1').status, 'minted', 'the last record per claim wins'); assert.deepEqual(again.pending().map((r) => r.claim_id), ['c2']); assert.equal(again.byWallet('ann.near').claim_id, 'c1');
  const wheel = createClaimLog(dir); assert.equal(wheel.record({ account_id: ACC, prize: 'skin' }), true); assert.deepEqual(createClaimLog(dir).list(), [{ account_id: ACC, prize: 'skin' }]);
  assert.equal(db.receipts.count('pass'), 3); assert.equal(db.receipts.count('wheel'), 1);
  const m = createP2P({ file: join(dir, 'p2p-book.json'), refUnitC: () => 160, holdings: async () => ({ silkC: 100_000, items: { spider_silk_thread: 5 } }), chain: null, live: async () => false, now: () => 1 });
  void m; db.kv.set('p2p-book', { v: 1, listings: [{ id: 'l1' }], seq: 1 });
  assert.equal(loadBook(join(dir, 'p2p-book.json')).listings.length, 1, 'the book is read from the database');
  assert.deepEqual(readdirSync(dir), []);
}));

test('a database that cannot be opened: the server refuses to start, loudly, and never falls back by itself', () => {
  const dir = tmp(); writeFileSync(join(dir, 'not-a-folder'), 'x');
  const server = fileURLToPath(new URL('../server.js', import.meta.url));
  const r = spawnSync(process.execPath, [server], { env: { ...process.env, FTF_DB: join(dir, 'not-a-folder', 'ftf.sqlite'), PORT: '0', HOST: '127.0.0.1', FTF_MARKET: '0', FTF_DATA_DIR: dir }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1, r.stderr + r.stdout); assert.match(r.stderr, /FATAL: the database .* cannot be opened/); assert.match(r.stderr, /refuses to start/);
  assert.doesNotMatch(r.stdout, /relayer on http/, 'it never listened');
  assert.throws(() => { resetDb(); try { requireStorage({ FTF_DB: join(dir, 'not-a-folder', 'ftf.sqlite') }); } finally { resetDb(); } });
});
