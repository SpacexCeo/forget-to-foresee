import test from 'node:test';
import assert from 'node:assert/strict';
import { creditableMicro, syncCredit, payGateFor, validateRequest, gateMessage, requestHash, createCreditLedger } from '../lib/town-gate.js';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { createReplayGuard } from '../lib/chest.js';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';

const M = 1_000_000n, PRICE = 200n * M;
const NOW = Date.UTC(2026, 10, 13, 12);
function logOf(entries) { const log = []; for (const e of entries) log.push(makeEntry(log, e)); return log; }
// rev 4 scale (story rewards × 0.02, game fee 200): 120 silk of T2 quest income and 160 of T1 kills (cap 100): verified 220 -> 220 silk on chain
const LOG = logOf([{ t: 1, kind: 'quest_turned_in', silkC: 12_000, trust: 'T2' }, { t: 2, kind: 'kill_ticketed', silkC: 16_000, trust: 'T1' }]);

function chain({ silk = 0n, registered = false } = {}) {
  const calls = [], st = { silk, registered, paid: new Set(), used: new Set() };
  return { calls, st, client: {
    async view(c, m, a) {
      if (m === 'gate_price') return String(PRICE);
      if (m === 'balance_of') return st.registered ? { silk: String(st.silk) } : null;
      if (m === 'gate_request_used') return st.used.has(a.request_hash);
      if (m === 'gate_paid_for') return st.paid.has(a.account_id + ':' + a.gate_id);
      if (m === 'gate_paid_of') return st.paid.size ? { gate_id: 'portal-1', price: String(PRICE) } : null;
      throw new Error(m);
    },
    async rpc(m, p) { if (p.account_id === 'eve.testnet') throw new Error('UNKNOWN'); return {}; },
    async call({ methodName, args }) {
      calls.push([methodName, args]);
      if (methodName === 'register') st.registered = true;
      if (methodName === 'credit_silk') st.silk += BigInt(args.amount);
      if (methodName === 'pay_gate_for') { st.silk -= PRICE; st.paid.add(args.account_id + ':' + args.gate_id); st.used.add(args.request_hash); }
      return { ok: true, hash: 'TX' + calls.length };
    },
  } };
}
const mem = () => { const m = new Map(); return { get: (g) => m.get(g) || { credited: '0', day: 0, today: '0' }, put: (g, r) => m.set(g, r) }; };
const deps = (c, extra = {}) => ({ client: c.client, cfg: { town: 'ftf-town.testnet', coord: 'relayer.testnet', coordKey: 'x', logDir: '/x', guestDaySilk: 300 }, ledger: mem(), replay: createReplayGuard(), key: {}, loadLog: () => LOG, now: () => NOW, ...extra });

test('gate: what a guest may hold is its verified income scaled to the gate (10,000 game silk -> 200 on chain)', () => {
  assert.equal(creditableMicro(LOG, PRICE), 220n * M);
  const broken = LOG.map((e) => ({ ...e })); broken[1].silkC = 18_000;
  assert.equal(creditableMicro(broken, PRICE), null); // a tampered log credits nothing
  assert.equal(creditableMicro([], PRICE), null);
});

test('gate: credit registers once, credits only the difference, honours the daily cap, and is idempotent', async () => {
  const c = chain(); const d = deps(c);
  const r1 = await syncCredit('ann.testnet', d);
  assert.equal(r1.status, 200); assert.equal(r1.body.credited_now, String(220n * M));
  assert.deepEqual(c.calls.map((x) => x[0]), ['register', 'credit_silk']);
  const r2 = await syncCredit('ann.testnet', d);
  assert.equal(r2.body.credited_now, '0'); assert.equal(c.calls.length, 2); // nothing twice
  const capped = chain(); const r3 = await syncCredit('ann.testnet', deps(capped, { cfg: { town: 'ftf-town.testnet', coord: 'relayer.testnet', coordKey: 'x', logDir: '/x', guestDaySilk: 100 } }));
  assert.equal(r3.body.credited_now, String(100n * M)); assert.equal(r3.body.capped_today, true);
});

test('gate: a failed credit rolls the ledger back so the next try credits again', async () => {
  const c = chain(); const ledger = mem();
  const bad = { ...c.client, async call(o) { if (o.methodName === 'credit_silk') return { ok: false, failure: 'ERR_CREDIT_CAP' }; return c.client.call(o); } };
  const r = await syncCredit('ann.testnet', deps({ client: bad }, { ledger }));
  assert.equal(r.status, 502); assert.equal(ledger.get('ann.testnet').credited, '0');
});

async function signed(gate = 'portal-1', at = NOW) {
  const kp = await generateKeyPair(); const key = await importSecretKey(kp.secretKey);
  const msg = gateMessage('ann.testnet', gate, at);
  const signature = b58encode(await key.sign(new TextEncoder().encode(msg)));
  return validateRequest({ account_id: 'ann.testnet', public_key: kp.publicKey, at, gate_id: gate, signature }, NOW, { gate: true });
}

test('gate: a signed request credits, then pays the gate for the guest once; replays and second payments are refused', async () => {
  const c = chain(); const d = deps(c);
  const v = await signed();
  assert.ok(v.ok);
  const r = await payGateFor(v, d);
  assert.equal(r.status, 200); assert.equal(r.body.request_hash, requestHash(v.message, v.signature));
  assert.deepEqual(c.calls.map((x) => x[0]), ['register', 'credit_silk', 'pay_gate_for']);
  assert.equal(c.st.silk, 20n * M);
  assert.equal((await payGateFor(v, d)).body.error, 'replayed');
  assert.equal((await payGateFor(await signed(), d)).body.error, 'already_paid');
});

test('gate: bad signature, someone else\'s key, stale request or too little silk are refused', async () => {
  const v = await signed();
  assert.equal((await payGateFor({ ...v, signature: v.signature.slice(0, -2) + '11' }, deps(chain()))).status, 401);
  assert.equal((await payGateFor({ ...v, accountId: 'eve.testnet', message: gateMessage('eve.testnet', 'portal-1', NOW) }, deps(chain()))).status, 401);
  assert.equal(validateRequest({ account_id: 'ann.testnet', public_key: v.publicKey, at: NOW - 10 * 60_000, gate_id: 'g', signature: 'x' }, NOW, { gate: true }).error, 'stale');
  const poor = await payGateFor(await signed(), deps(chain(), { loadLog: () => logOf([{ t: 1, kind: 'quest_turned_in', silkC: 2_000, trust: 'T2' }]) }));
  assert.equal(poor.status, 402); assert.equal(poor.body.error, 'not_enough_silk');
});

test('the coordinator key comes from data/coord-key.json when the env has none, and the env wins', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { townGateEnv } = await import('../lib/town-gate.js');
  const dir = mkdtempSync(join(tmpdir(), 'coord-'));
  writeFileSync(join(dir, 'coord-key.json'), JSON.stringify({ account: 'gate.ftf-town.testnet', secretKey: 'ed25519:abc' }));
  const a = townGateEnv({ FTF_DATA_DIR: dir });
  assert.equal(a.coord, 'gate.ftf-town.testnet'); assert.equal(a.coordKey, 'ed25519:abc');
  const b = townGateEnv({ FTF_DATA_DIR: dir, FTF_TOWN_COORD: 'x.testnet', FTF_TOWN_COORD_KEY: 'ed25519:zzz' });
  assert.equal(b.coord, 'x.testnet'); assert.equal(b.coordKey, 'ed25519:zzz');
  const c = townGateEnv({ FTF_DATA_DIR: join(dir, 'none') });
  assert.equal(c.coord, ''); assert.equal(c.coordKey, '');
});
