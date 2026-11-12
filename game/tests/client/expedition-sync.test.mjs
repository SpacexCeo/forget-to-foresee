// The expedition log goes up to the relayer (story TZ Q4): the browser client against the real relayer handler
// (relayer/api/expedition/log.js) through a fake fetch: batches of 50, resume after a lost answer, quiet without a guest
// or with storage off, a refused log is not retried, back-off on a network error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExpeditionSync, SYNC_KEY } from '../../src/net/expedition-sync.js';
import { makeEntry } from '../../src/game/expedition-log.js';
import { generateKeyPair } from '../../src/net/near-tx.js';
import { expeditionLogHandler } from '../../../relayer/api/expedition/log.js';
import { createBucket } from '../../../relayer/lib/core.js';

const GUEST = 'ann-1.guests.ftf-coordinator.testnet';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
function ledgerOf(n, t0 = Date.now() - 3600_000) { const log = []; const subs = new Set(); const add = (k = 'guide_step') => { log.push(makeEntry(log, { t: t0 + log.length * 1000, kind: log.length ? k : 'story_started', data: { id: 'talked' }, silkC: 0, trust: 'T2' })); for (const f of subs) f(); }; for (let i = 0; i < n; i++) add(); return { get log() { return log.slice(); }, subscribe(f) { subs.add(f); return () => subs.delete(f); }, add }; }
function relay(env, kp, { drop = 0 } = {}) {
  const h = expeditionLogHandler({ env, ownsKey: async (a, pk) => pk === kp.publicKey, ipBucket: createBucket({ capacity: 1e6, refillMs: 1 }), guestBucket: createBucket({ capacity: 1e6, refillMs: 1 }) });
  const calls = []; let dropped = 0;
  const fetch = async (url, init) => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader() {}, end(b) { this.body = b || ''; } };
    await h({ method: init.method, url: new URL(url).pathname, headers: {}, body: init.body, socket: { remoteAddress: '9.9.9.9' } }, res);
    calls.push(JSON.parse(init.body).entries.length);
    if (dropped < drop) { dropped++; throw new Error('lost answer'); } // stored, but the browser never hears it
    return { status: res.statusCode, json: async () => JSON.parse(res.body || '{}') };
  };
  return { fetch, calls };
}
const manualTimers = () => { const q = []; return { setTimer: (f, ms) => { q.push({ f, ms }); return q.length; }, clearTimer: () => {}, q }; };

test('the log goes up in batches of 50 and resumes after a lost answer; the relayer stores it in order', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ftf-sync-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kp = await generateKeyPair(), ledger = ledgerOf(120), storage = mem(), T = manualTimers();
  const { fetch, calls } = relay({ FTF_EXPEDITION_DIR: dir }, kp, { drop: 1 });
  const s = createExpeditionSync({ ledger, storage, base: 'https://relayer.example', fetch, guest: () => ({ accountId: GUEST, secretKey: kp.secretKey }), ...T });
  assert.equal(await s.flush(), 'retrying'); assert.equal(s.lastError, 'network'); assert.equal(T.q.at(-1).ms, 2000);
  assert.equal(await s.flush(), 'synced');
  assert.deepEqual(calls, [50, 50, 50, 20], 'the first batch again (a stored retry), then the rest');
  assert.equal(s.synced, 120); assert.equal(JSON.parse(storage.getItem(SYNC_KEY)).length, 120);
  const lines = readFileSync(join(dir, GUEST + '.jsonl'), 'utf8').trim().split('\n');
  assert.deepEqual(lines.map((l) => JSON.parse(l).hash), ledger.log.map((e) => e.hash));
  ledger.add(); assert.equal(await s.flush(), 'synced'); assert.equal(s.synced, 121);
  s.dispose();
});

test('quiet without a guest, a relayer or storage; a refused log is not retried', async () => {
  const kp = await generateKeyPair(), ledger = ledgerOf(3), T = manualTimers();
  assert.equal(await createExpeditionSync({ ledger, base: 'https://r.example', fetch: async () => { throw new Error('no'); }, guest: () => null, ...T }).flush(), 'off');
  assert.equal(await createExpeditionSync({ ledger, base: '', fetch: async () => { throw new Error('no'); }, guest: () => ({ accountId: GUEST, secretKey: kp.secretKey }), ...T }).flush(), 'off');
  const off = relay({}, kp);
  const s = createExpeditionSync({ ledger, base: 'https://r.example', fetch: off.fetch, guest: () => ({ accountId: GUEST, secretKey: kp.secretKey }), ...T });
  assert.equal(await s.flush(), 'off'); assert.equal(s.lastError, 'storage_off');
  const stranger = await generateKeyPair(), dir = mkdtempSync(join(tmpdir(), 'ftf-sync-'));
  const r = relay({ FTF_EXPEDITION_DIR: dir }, kp);
  const s2 = createExpeditionSync({ ledger, base: 'https://r.example', fetch: r.fetch, guest: () => ({ accountId: GUEST, secretKey: stranger.secretKey }), ...T });
  assert.equal(await s2.flush(), 'refused'); assert.equal(s2.lastError, 'not_your_key');
  const before = T.q.length; s2.schedule(); assert.equal(T.q.length, before, 'no retry after a refusal');
  rmSync(dir, { recursive: true, force: true });
});

test('boot-world starts the sync with the Expedition (lazily)', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /import\('\.\/net\/expedition-sync\.js'\)\.then\(\(m\) => \{ if \(townQuests && !expeditionSync\) expeditionSync = m\.createExpeditionSync\(\{ ledger: townQuests\.ledger/);
});
