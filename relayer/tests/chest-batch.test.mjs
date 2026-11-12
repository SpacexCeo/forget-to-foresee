import test from 'node:test';
import assert from 'node:assert/strict';
import { openChests, openedEvents, leftToday, validateOpen, openMessage, deckOf, BATCH_ACTION_GAS, chestCounters } from '../lib/chest.js';
import { generateKeyPair, serializeMultiCallTx, b58decode } from '../lib/near-tx.js';

const NOW = Date.UTC(2026, 10, 13, 12);
const ev = (index, position, account = 'ann.testnet') => `EVENT_JSON:{"standard":"ftf_chest","version":"1.0.0","event":"chest_opened","data":[{"season":"s1","index":${index},"account_id":"${account}","position":${position},"nft":false}]}`;

test('batch: the multi-action transaction carries N open_chest calls to the chest contract', async () => {
  const kp = await generateKeyPair();
  const tx = serializeMultiCallTx({ signerId: 'chests.x.testnet', publicKey: kp.publicKey, nonce: 5n, receiverId: 'chests.x.testnet', blockHash: '11111111111111111111111111111111', calls: [1, 2].map(() => ({ methodName: 'open_chest', args: { account_id: 'ann.testnet' }, gas: BATCH_ACTION_GAS })) });
  const raw = Buffer.from(tx).toString('latin1');
  assert.equal(raw.split('open_chest').length - 1, 2);
  assert.ok(10n * BATCH_ACTION_GAS <= 300_000_000_000_000n);
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

test('batch: cut to the daily allowance, ONE transaction, openings with proofs, a repeated request never re-sends', async () => {
  const season = 's1', root = deckOf(season).root;
  const kp = await generateKeyPair();
  const sent = [];
  const used = Array.from({ length: 27 }, () => ({ at_ns: String(BigInt(NOW) * 1_000_000n) })); // 3 left today
  const client = {
    async rpc() { return {}; },
    async view(c, m) { return m === 'season_info' ? { root, seed: { seed: 'ab' }, season, size: 10_000, opened: 40, daily_cap: 30 } : used; },
    async callMany(o) { sent.push(o); return { ok: true, hash: 'TX1', outcome: { receipts_outcome: [{ outcome: { logs: o.calls.map((_, i) => ev(40 + i, 100 + i)) } }] } }; },
  };
  const t0 = chestCounters.transactions;
  const r = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 10, requestId: 'req-aaaaaaaa' }, { secretKey: kp.secretKey, client, now: () => NOW });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.requested, r.body.opened, r.body.cut, r.body.transactions], [10, 3, 'daily_cap', 1]);
  assert.equal(sent.length, 1); assert.equal(sent[0].calls.length, 3);
  assert.ok(r.body.openings.every((o) => o.leaf && o.proof && o.root === root && o.outcome));
  const again = await openChests({ accountId: 'ann.testnet', publicKey: kp.publicKey, count: 10, requestId: 'req-aaaaaaaa' }, { secretKey: kp.secretKey, client, now: () => NOW });
  assert.equal(again, r); assert.equal(sent.length, 1);
  assert.equal(chestCounters.transactions - t0, 1);
});
