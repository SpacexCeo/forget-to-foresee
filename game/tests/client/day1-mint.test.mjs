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

test('an empty free fund or a used-up daily cap is "unavailable" with its reason (play as a local guest), not a retry', async () => {
  for (const error of ['fund_empty', 'daily_cap']) {
    const m = createDay1Mint({ storage: memoryStorage(), deployment: { guests: DEP.guests, heroine: DEP.heroine }, relayerUrl: 'https://relay.example', rpcUrls: ['https://r'],
      fetch: async (url, init) => (url.includes('/api/') ? { ok: false, status: error === 'fund_empty' ? 503 : 429, json: async () => ({ error }) } : fakeRpc({ guestSeq: [null], calls: [] })(url, init)) });
    await m.mint('Di');
    assert.equal(m.phase, 'unavailable'); assert.equal(m.reason, error);
  }
  // the in-browser signer: the contract cannot pay for the account
  const calls = [];
  const rpc = fakeRpc({ guestSeq: [null], calls });
  const { secretKey } = await generateKeyPair();
  const m = createDay1Mint({ storage: memoryStorage(), deployment: DEP, relayerUrl: null, guestSecret: secretKey, rpcUrls: ['https://r'], fetch: async (url, init) => {
    const b = JSON.parse(init.body);
    if (b.method === 'send_tx' || b.method === 'broadcast_tx_commit') return { json: async () => ({ result: { status: { Failure: { ActionError: { kind: { LackBalanceForState: { account_id: DEP.guests } } } } }, receipts_outcome: [] } }) };
    return rpc(url, init);
  } });
  await m.mint('Ed');
  assert.equal(m.phase, 'unavailable'); assert.equal(m.reason, 'fund_empty');
});

test('the fund-empty and daily-cap copy exists in English and Russian', async () => {
  const en = (await import('../../src/play/locales/en.js')).default; const ru = (await import('../../src/play/locales/ru.js')).default;
  for (const k of ['day1.mint.fund_empty', 'day1.mint.daily_cap']) { assert.match(en[k], /local guest/); assert.ok(ru[k]); }
});

// On-chain receipts (net/receipts.js, play/chain-panel.js): only real hashes are kept, once, newest first, with the
// explorer link; the menu block shows the guest account, its mint and the live contracts from local records only.
test('receipts: valid hashes kept once with explorer links; the chain block reads the Day-1 record', async () => {
  const { recordTx, loadReceipts } = await import('../../src/net/receipts.js');
  const { chainModel } = await import('../../src/play/chain-panel.js');
  const storage = memoryStorage();
  const h1 = '6TtWeZ3WuHfhAEkPa9k7mfHAs6ayxqG4iY2iJyGLahbA', h2 = 'E3ppFxXgvtEZbJeFUsa5dstyueCF85HqiBuG9wmVWXey';
  assert.equal(recordTx('chest', 'not-a-hash', { storage }), null);
  assert.equal(recordTx('nope', h1, { storage }), null);
  recordTx('chest', h1, { storage, now: 1 }); recordTx('gate', 'https://testnet.nearblocks.io/txns/' + h2, { storage, now: 2 }); recordTx('chest', h1, { storage, now: 3 });
  const list = loadReceipts(storage);
  assert.deepEqual(list.map((r) => [r.kind, r.hash]), [['gate', h2], ['chest', h1]]);
  assert.match(list[0].url, /nearblocks\.io\/txns\/E3pp/);
  storage.setItem(DAY1_KEY, JSON.stringify({ guest: { account_id: 'iris-1.guests.ftf-coordinator.testnet' }, txHash: '44gpMGrxQ8bZp3n1v9u2yWcKXk7aT5fJdHsE1LqRm6Nc' }));
  const m = chainModel(storage);
  assert.equal(m.account, 'iris-1.guests.ftf-coordinator.testnet');
  assert.equal(m.receipts.length, 3); assert.equal(m.linked, null);
  assert.ok(m.contracts.some((c) => c.id.startsWith('guests.')) && m.contracts.every((c) => /\/address\//.test(c.url)));
});

// Mainnet-ready (docs/deploy/mainnet.md): one switch, net/network.js. The mainnet rows and records carry no testnet
// value, the copy swaps the network's name, and no client module hard-codes a testnet account, host or label.
test('network switch: the mainnet table is clean and no client module hard-codes testnet', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { NETWORKS, NEAR_NETWORK, forNetwork } = await import('../../src/net/network.js');
  const { NEAR_DEPLOYMENT_MAINNET } = await import('../../src/net/near-deployment.mainnet.js');
  const { DAY1_DEPLOYMENT_MAINNET } = await import('../../src/net/day1-deployment.mainnet.js');
  assert.equal(NEAR_NETWORK, 'testnet', 'tests and the default build run on testnet');
  for (const v of [NETWORKS.mainnet, NEAR_DEPLOYMENT_MAINNET, DAY1_DEPLOYMENT_MAINNET]) assert.ok(!/testnet/.test(JSON.stringify(v)), JSON.stringify(v));
  assert.equal(forNetwork('Pay on NEAR testnet to x.testnet, see https://testnet.nearblocks.io/txns/a', 'mainnet'), 'Pay on NEAR mainnet to x.near, see https://nearblocks.io/txns/a');
  assert.equal(forNetwork('NEAR testnet'), 'NEAR testnet');
  const src = fileURLToPath(new URL('../../src/', import.meta.url));
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'locales') walk(p); } else if (/\.js$/.test(n) && !/(^network|\.testnet|\.mainnet)\.js$/.test(n)) files.push(p); } };
  walk(src);
  const BAD = /[a-z0-9_-]\.testnet['"`]|testnet\.nearblocks|rpc\.testnet\.near|test\.rpc\.fastnear|testnet\.mynearwallet|NEAR testnet/;
  const hits = [];
  for (const f of files) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).split('\n') // comments out, lines kept
      .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '').replace(/\bt\(['"][\w.]+['"]/g, ''))); // and i18n keys such as 'acct.testnet'
    code.forEach((l, i) => { if (BAD.test(l)) hits.push(`${f.slice(src.length)}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], 'take these from net/network.js');
});
