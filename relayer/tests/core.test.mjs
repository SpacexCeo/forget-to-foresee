// The relayer's validation, CORS, rate limit and create-guest flow against a fake RPC (no network, no real key).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeNickname, normalizePublicKey, validateBody, allowOrigin, createBucket, createGuest, createQueue, cors, envConfig } from '../lib/core.js';
import { generateKeyPair, b58encode } from '../lib/near-tx.js';

const PK = 'ed25519:' + b58encode(new Uint8Array(32).fill(5));

test('nicknames follow the contract: lowercase a-z0-9, at most 12, else "guest"', () => {
  assert.equal(sanitizeNickname('Ann Lee!'), 'annlee');
  assert.equal(sanitizeNickname('ABCDEFGHIJKLMNOP'), 'abcdefghijkl');
  assert.equal(sanitizeNickname('Аня'), 'guest');
  assert.equal(sanitizeNickname(''), 'guest');
  assert.equal(sanitizeNickname(null), 'guest');
  assert.equal(sanitizeNickname('x.y-z_9'), 'xyz9');
});

test('public keys: ed25519 with 32 base58 bytes only', () => {
  assert.equal(normalizePublicKey(PK), PK);
  assert.equal(normalizePublicKey('ed25519:abc'), null);
  assert.equal(normalizePublicKey('secp256k1:' + PK.slice(8)), null);
  assert.equal(normalizePublicKey('ed25519:' + b58encode(new Uint8Array(31).fill(5))), null);
  assert.equal(normalizePublicKey('ed25519:0OIl' + PK.slice(12)), null, 'not base58');
  assert.equal(normalizePublicKey(42), null);
  assert.deepEqual(validateBody({ public_key: PK, nickname: 'Ann' }), { ok: true, publicKey: PK, nickname: 'ann' });
  assert.equal(validateBody({ public_key: PK, nickname: 'x'.repeat(65) }).error, 'bad_nickname');
  assert.equal(validateBody({ nickname: 'a' }).error, 'bad_public_key');
  assert.equal(validateBody(null).error, 'bad_body');
});

test('CORS: the Pages site and localhost only', () => {
  assert.equal(allowOrigin('https://spacexceo.github.io'), 'https://spacexceo.github.io');
  assert.equal(allowOrigin('http://localhost:5181'), 'http://localhost:5181');
  assert.equal(allowOrigin('http://127.0.0.1:4311'), 'http://127.0.0.1:4311');
  assert.equal(allowOrigin('https://evil.example'), null);
  assert.equal(allowOrigin('https://spacexceo.github.io.evil.example'), null);
  assert.equal(allowOrigin('http://localhost.evil.example'), null);
  const headers = {}; const res = { setHeader: (k, v) => { headers[k] = v; }, end() { this.ended = true; } };
  assert.equal(cors({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res), true);
  assert.equal(res.statusCode, 403); assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.deepEqual(envConfig({ FTF_ALLOWED_ORIGINS: 'https://a.example, https://b.example' }).origins, ['https://a.example', 'https://b.example']);
  assert.equal(envConfig({}).secretKey, '');
});

test('token bucket: 3 at once per IP, then one per refill period', () => {
  let t = 0; const b = createBucket({ capacity: 3, refillMs: 1000, now: () => t });
  assert.ok(b.take('a').ok && b.take('a').ok && b.take('a').ok);
  const no = b.take('a'); assert.equal(no.ok, false); assert.equal(no.retryAfterS, 1);
  assert.ok(b.take('b').ok, 'another IP has its own bucket');
  t = 1000; assert.ok(b.take('a').ok); assert.equal(b.take('a').ok, false);
});

/* fake RPC: guest_of / stats views, access key, block, send_tx */
function fakeRpc(state) {
  const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
  return async (url, init) => {
    const b = JSON.parse(init.body); state.calls.push(b.method === 'query' ? b.params.method_name || b.params.request_type : b.method);
    let result;
    if (b.method === 'query' && b.params.request_type === 'call_function') {
      const m = b.params.method_name;
      result = { result: enc(m === 'stats' ? state.stats : state.guest) };
    } else if (b.method === 'query') result = { nonce: 7 };
    else if (b.method === 'block') result = { header: { hash: b58encode(new Uint8Array(32).fill(1)) } };
    else if (b.method === 'send_tx') {
      if (state.sendError) { const e = state.sendError; state.sendError = null; return { json: async () => ({ error: e }) }; }
      state.sent += 1; if (state.mintOnSend) state.guest = { account_id: 'ann-1.guests.x.testnet', token_id: 'elise-ann-1', nickname: 'ann', minted: true };
      result = { status: state.fail ? { Failure: { ActionError: {} } } : { SuccessValue: '' }, receipts_outcome: [] };
    }
    return { json: async () => ({ result }) };
  };
}

test('create-guest: final + minted gives 200; idempotent; honest failures; cap; no key', async () => {
  const { secretKey } = await generateKeyPair();
  const base = { secretKey, guests: 'guests.x.testnet', rpcUrls: ['https://rpc.test'] };
  const s1 = { calls: [], sent: 0, guest: null, stats: { today: 0, daily_cap: 200 }, mintOnSend: true };
  const r1 = await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s1) });
  assert.equal(r1.status, 200); assert.equal(r1.body.account_id, 'ann-1.guests.x.testnet'); assert.equal(r1.body.token_id, 'elise-ann-1'); assert.match(r1.body.tx_hash, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.equal(s1.sent, 1);
  // again: already minted, no transaction
  const r2 = await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s1) });
  assert.equal(r2.status, 200); assert.equal(r2.body.tx_hash, null); assert.equal(s1.sent, 1);
  // the transaction fails, or lands without a mint: never 200
  const s3 = { calls: [], sent: 0, guest: null, stats: { today: 0, daily_cap: 200 }, fail: true };
  assert.equal((await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s3) })).body.error, 'tx_failed');
  const s4 = { calls: [], sent: 0, guest: null, stats: { today: 0, daily_cap: 200 } };
  const r4 = await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s4) });
  assert.equal(r4.status, 502); assert.equal(r4.body.error, 'no_guest');
  // the contract's daily cap is reached: no transaction
  const s5 = { calls: [], sent: 0, guest: null, stats: { today: 200, daily_cap: 200 } };
  assert.equal((await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s5) })).status, 429); assert.equal(s5.sent, 0);
  // a nonce race: retried once
  const s6 = { calls: [], sent: 0, guest: null, stats: { today: 0, daily_cap: 200 }, mintOnSend: true, sendError: { name: 'HANDLER_ERROR', cause: { name: 'INVALID_TRANSACTION' }, data: { TxExecutionError: { InvalidTxError: { InvalidNonce: {} } } } } };
  assert.equal((await createGuest({ publicKey: PK, nickname: 'ann' }, { ...base, fetch: fakeRpc(s6), queue: createQueue() })).status, 200);
  // not configured
  assert.equal((await createGuest({ publicKey: PK, nickname: 'ann' }, { rpcUrls: ['x'] })).status, 503);
});

test('the signer is the same code as the game client (game/src/net/near-tx.js)', () => {
  assert.equal(readFileSync(new URL('../lib/near-tx.js', import.meta.url), 'utf8'), readFileSync(new URL('../../game/src/net/near-tx.js', import.meta.url), 'utf8'));
});
