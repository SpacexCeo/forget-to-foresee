import test from 'node:test';
import assert from 'node:assert/strict';
import { openChests, openedEvents, leftToday, validateOpen, openMessage, deckOf, BATCH_ACTION_GAS, chestCounters } from '../lib/chest.js';
import { generateKeyPair } from '../lib/near-tx.js';

const NOW = Date.UTC(2026, 10, 13, 12);
const ev = (index, position, account = 'ann.testnet') => `EVENT_JSON:{"standard":"ftf_chest","version":"1.0.0","event":"chest_opened","data":[{"season":"s1","index":${index},"account_id":"${account}","position":${position},"nft":false}]}`;

test('batch: each opening is its own single-action transaction, sent in nonce order, all outcomes read back', async () => {
  // a function-call access key may sign only ONE action per transaction (the cause of the failed batches, 13.11)
  const kp = await generateKeyPair();
  const { createTxClient, b58encode } = await import('../lib/near-tx.js');
  const seen = [];
  const fetch = async (url, init) => {
    const b = JSON.parse(init.body); let result;
    if (b.method === 'query') result = { nonce: 41 };
    else if (b.method === 'block') result = { header: { hash: '11111111111111111111111111111111' } };
    else if (b.method === 'send_tx') { const raw = Buffer.from(b.params.signed_tx_base64, 'base64'); seen.push({ wait: b.params.wait_until, raw }); result = { final_execution_status: 'INCLUDED' }; }
    else if (b.method === 'tx') result = { status: { SuccessValue: '' }, transaction_outcome: { outcome: { gas_burnt: 1 } }, receipts_outcome: [{ outcome: { logs: [ev(seen.length, 7)] } }] };
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: b.id, result }) };
  };
  const key = await (await import('../lib/near-tx.js')).importSecretKey(kp.secretKey);
  const rs = await createTxClient({ rpcUrls: ['https://rpc.example'], fetch }).callEach({ key, signerId: 'chests.x.testnet', receiverId: 'chests.x.testnet', calls: [1, 2, 3].map(() => ({ methodName: 'open_chest', args: { account_id: 'ann.testnet' }, gas: BATCH_ACTION_GAS })) });
  assert.equal(rs.length, 3); assert.ok(rs.every((r) => r.ok && r.hash));
  assert.equal(new Set(rs.map((r) => r.hash)).size, 3);
  assert.equal(seen.length, 3); assert.ok(seen.every((x) => x.wait === 'INCLUDED'));
  for (const x of seen) assert.equal(Buffer.from(x.raw).toString('latin1').split('open_chest').length - 1, 1); // one action each
  // nonces 42, 43, 44: the u64 right after the signer's public key in each transaction
  const nonces = seen.map((x) => { const r = x.raw; const sl = r.readUInt32LE(0); const off = 4 + sl + 1 + 32; return Number(r.readBigUInt64LE(off)); });
  assert.deepEqual(nonces, [42, 43, 44]);
  assert.ok(BATCH_ACTION_GAS <= 300_000_000_000_000n); void b58encode;
});

test('batch: requests sign their count and request id; openings come back from the chain events', () => {
  assert.equal(openMessage('ann.testnet', 5, 3, 'req-12345678'), 'ftf-chest-open|ann.testnet|5|3|req-12345678');
  assert.equal(openMessage('ann.testnet', 5), 'ftf-chest-open|ann.testnet|5');
  const base = { account_id: 'ann.testnet', public_key: 'ed25519:' + '1'.repeat(43), at: NOW, signature: 'x' };
  assert.equal(validateOpen({ ...base, count: 11, request_id: 'req-12345678' }, NOW).error, 'bad_count');
  assert.equal(validateOpen({ ...base, count: 2 }, NOW).error, 'bad_request_id');
  assert.equal(validateOpen({ ...base, count: 2, request_id: 'req-12345678' }, NOW).count, 2);
  const out = { receipts_outcome: [{ outcome: { logs: [ev(7, 120), 'noise', ev(8, 4501)] } }] };
  assert.deepEqual(openedEvents(out).map((o) => o.index), [7, 8]);
  const day = BigInt(NOW) * 1_000_000n;
  assert.equal(leftToday([{ at_ns: String(day) }, { at_ns: String(day - 86_400_000_000_000n) }], 30, day), 29);
});

test('batch: cut to the daily allowance, one transaction per opening, openings with proofs, a repeated request never re-sends', async () => {
  const season = 's1', root = deckOf(season).root;
  const kp = await generateKeyPair();
  const sent = [];
  const used = Array.from({ length: 27 }, () => ({ at_ns: String(BigInt(NOW) * 1_000_000n) })); // 3 left today
  const client = {
    async rpc() { return {}; },
    async view(c, m) { return m === 'season_info' ? { root, seed: { seed: 'ab' }, season, size: 10_000, opened: 40, daily_cap: 30 } : used; },
    async callEach(o) { sent.push(o); return o.calls.map((_, i) => ({ ok: true, hash: 'TX' + i, outcome: { receipts_outcome: [{ outcome: { logs: [ev(40 + i, 100 + i)] } }] } })); },
  };
  const t0 = chestCounters.transactions;
  const r = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 10, requestId: 'req-aaaaaaaa' }, { secretKey: kp.secretKey, client, now: () => NOW });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.requested, r.body.opened, r.body.cut, r.body.transactions], [10, 3, 'daily_cap', 3]);
  assert.equal(sent.length, 1); assert.equal(sent[0].calls.length, 3);
  assert.deepEqual(r.body.openings.map((o) => o.tx_hash), ['TX0', 'TX1', 'TX2']);
  assert.ok(r.body.openings.every((o) => o.leaf && o.proof && o.root === root && o.outcome));
  const again = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 10, requestId: 'req-aaaaaaaa' }, { secretKey: kp.secretKey, client, now: () => NOW });
  assert.equal(again, r); assert.equal(sent.length, 1);
  assert.equal(chestCounters.transactions - t0, 3);
});

test('batch: a partial failure settles exactly the chests that opened; a total failure is a plain code', async () => {
  const season = 's1', root = deckOf(season).root;
  const kp = await generateKeyPair();
  const info = { root, seed: { seed: 'ab' }, season, size: 10_000, opened: 40, daily_cap: 30 };
  const mk = (fails) => ({ async rpc() { return {}; }, async view(c, m) { return m === 'season_info' ? info : []; },
    async callEach(o) { return o.calls.map((_, i) => (fails(i) ? { ok: false, hash: 'F' + i, failure: 'Smart contract panicked: ERR_DAILY' } : { ok: true, hash: 'T' + i, outcome: { receipts_outcome: [{ outcome: { logs: [ev(50 + i, 200 + i)] } }] } })); } });
  const part = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 5, requestId: 'req-part0001' }, { secretKey: kp.secretKey, client: mk((i) => i >= 3), now: () => NOW });
  assert.equal(part.status, 200); assert.equal(part.body.opened, 3); assert.equal(part.body.cut, 'failed_some');
  const none = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 5, requestId: 'req-none0001' }, { secretKey: kp.secretKey, client: mk(() => true), now: () => NOW });
  assert.equal(none.status, 429); assert.equal(none.body.error, 'daily_cap');
  assert.ok(chestCounters.errors.daily_cap >= 7);
});
