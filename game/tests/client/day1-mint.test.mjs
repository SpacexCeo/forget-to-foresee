// Day 1 free mint (src/play/day1-mint.js): honest states. Minted only after a FINAL successful transaction and the
// contract's own `minted: true`; failures retry; a build without the key says "unavailable"; the key persists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createDay1Mint, DAY1_KEY } from '../../src/play/day1-mint.js';
import { generateKeyPair, b58encode } from '../../src/net/near-tx.js';
import { memoryStorage } from '../../src/ui/storage.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const DEP = { guests: 'guests.c.testnet', heroine: 'heroine.c.testnet', guestKeyAccount: 'guests.c.testnet' };
const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));

/** A fake RPC: `guest` is what guest_of returns over time; `txOk` decides the final outcome. */
function fakeRpc({ guestSeq, txOk = true, calls }) {
  let n = 0;
  return async (url, init) => {
    const b = JSON.parse(init.body); calls.push(b.method + (b.params.method_name ? ':' + b.params.method_name : ''));
    let result;
    if (b.method === 'query' && b.params.request_type === 'call_function') result = { result: enc(guestSeq[Math.min(n++, guestSeq.length - 1)]) };
    else if (b.method === 'query') result = { nonce: 1 };
    else if (b.method === 'block') result = { header: { hash: b58encode(new Uint8Array(32).fill(3)) } };
    else result = txOk ? { status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] } : { status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { Failure: {} } } }] };
    return { json: async () => ({ result }) };
  };
}

test('minted only after a final successful transaction and the contract saying minted', async () => {
  const guest = (await generateKeyPair()).secretKey, calls = [], storage = memoryStorage();
  const phases = [];
  const m = createDay1Mint({ storage, deployment: DEP, guestSecret: guest, rpcUrls: ['https://r'], fetch: fakeRpc({ guestSeq: [null, { account_id: 'ann-1.guests.c.testnet', token_id: 'elise-ann-1', minted: true }], calls }) });
  m.subscribe((x) => phases.push(x.phase));
  assert.equal(m.links, null);
  await m.mint('Ann');
  assert.deepEqual(phases, ['keygen', 'sending', 'checking', 'minted']);
  assert.ok(calls.indexOf('send_tx') < calls.lastIndexOf('query:guest_of'), 'checked after the final transaction');
  assert.match(m.links.token, /nft-token\/heroine\.c\.testnet\/elise-ann-1$/);
  const rec = JSON.parse(storage.getItem(DAY1_KEY));
  assert.equal(rec.minted, true); assert.match(rec.playerKey.publicKey, /^ed25519:/); assert.equal(rec.nickname, 'Ann');
});

test('a failed receipt or an unconfirmed mint is "failed", never minted; retry reuses the same key', async () => {
  const guest = (await generateKeyPair()).secretKey, storage = memoryStorage();
  const m = createDay1Mint({ storage, deployment: DEP, guestSecret: guest, rpcUrls: ['https://r'], fetch: fakeRpc({ guestSeq: [null], txOk: false, calls: [] }) });
  await m.mint('Bo');
  assert.equal(m.phase, 'failed'); assert.equal(m.links, null);
  const key1 = m.record.playerKey.publicKey;
  const m2 = createDay1Mint({ storage, deployment: DEP, guestSecret: guest, rpcUrls: ['https://r'], fetch: fakeRpc({ guestSeq: [null, { account_id: 'a', token_id: 't', minted: false }], calls: [] }) });
  await m2.retry();
  assert.equal(m2.phase, 'failed', 'the contract did not confirm the mint');
  assert.equal(m2.record.playerKey.publicKey, key1, 'the same browser key');
});

test('already minted (a reload mid-mint): no second transaction', async () => {
  const guest = (await generateKeyPair()).secretKey, calls = [];
  const m = createDay1Mint({ storage: memoryStorage(), deployment: DEP, guestSecret: guest, rpcUrls: ['https://r'], fetch: fakeRpc({ guestSeq: [{ account_id: 'a', token_id: 't', minted: true }], calls }) });
  await m.mint('Cy');
  assert.equal(m.phase, 'minted');
  assert.ok(!calls.includes('send_tx'));
});

test('a build without the guest key or the deployment is "unavailable" and sends nothing', async () => {
  const calls = [];
  const m = createDay1Mint({ storage: memoryStorage(), deployment: { network: 'testnet' }, guestSecret: undefined, fetch: fakeRpc({ guestSeq: [null], calls }) });
  await m.mint('Dee');
  assert.equal(m.phase, 'unavailable');
  assert.equal(calls.length, 0);
});

test('with a relayer: the page holds no guest key, POSTs the player key, and still confirms the mint on-chain', async () => {
  const calls = []; const posts = [];
  const rpc = fakeRpc({ guestSeq: [null, { account_id: 'ann-1.guests.c.testnet', token_id: 'elise-ann-1', minted: true }], calls });
  const fetch = async (url, init) => {
    if (url === 'https://relay.example/api/create-guest') { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ account_id: 'ann-1.guests.c.testnet', token_id: 'elise-ann-1', tx_hash: 'TxR' }) }; }
    return rpc(url, init);
  };
  const m = createDay1Mint({ storage: memoryStorage(), deployment: { guests: DEP.guests, heroine: DEP.heroine }, relayerUrl: 'https://relay.example/', guestSecret: undefined, rpcUrls: ['https://r'], fetch });
  assert.equal(m.available, true);
  await m.mint('Ann');
  assert.equal(m.phase, 'minted');
  assert.equal(posts.length, 1); assert.match(posts[0].public_key, /^ed25519:/); assert.equal(posts[0].nickname, 'Ann');
  assert.equal(m.record.playerKey.publicKey, posts[0].public_key, 'the browser key becomes the account key');
  assert.ok(!calls.includes('send_tx'), 'the browser signs nothing');
  assert.equal(m.links.tx, 'https://testnet.nearblocks.io/txns/TxR');
  // the relayer refuses (rate limit) or answers 200 but the chain disagrees: failed, never minted
  const bad = createDay1Mint({ storage: memoryStorage(), deployment: { guests: DEP.guests, heroine: DEP.heroine }, relayerUrl: 'https://relay.example', fetch: async (url, init) => (url.includes('/api/') ? { ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) } : fakeRpc({ guestSeq: [null], calls: [] })(url, init)), rpcUrls: ['https://r'] });
  await bad.mint('Bo'); assert.equal(bad.phase, 'failed'); assert.equal(bad.reason, 'rate_limited');
  const liar = createDay1Mint({ storage: memoryStorage(), deployment: { guests: DEP.guests, heroine: DEP.heroine }, relayerUrl: 'https://relay.example', rpcUrls: ['https://r'], fetch: async (url, init) => (url.includes('/api/') ? { ok: true, status: 200, json: async () => ({}) } : fakeRpc({ guestSeq: [null], calls: [] })(url, init)) });
  await liar.mint('Cy'); assert.equal(liar.phase, 'failed');
});

test('day1 mint: the deployment record carries the public relayer URL, so the hosted page mints without a build variable', async () => {
  const { DAY1_DEPLOYMENT } = await import('../../src/net/day1-deployment.js');
  assert.match(DAY1_DEPLOYMENT.relayer, /^https:\/\//);
  const m = createDay1Mint({ storage: memoryStorage(), deployment: { guests: DEP.guests, heroine: DEP.heroine, relayer: 'https://relay.example' }, guestSecret: undefined, fetch: async () => { throw new Error('offline'); } });
  assert.equal(m.available, true);
});
