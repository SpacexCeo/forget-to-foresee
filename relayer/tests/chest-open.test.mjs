// POST /api/chest/open with a mock NEAR RPC: signature, key ownership, the opening and its proof, error mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';
import { openMessage, validateOpen, signatureValid, outcomeAt, createReplayGuard } from '../lib/chest.js';
import { chestHandler } from '../api/chest/open.js';
import { commitment, leafHash, rootFromProof, buildDeck } from '../lib/chest-deck.js';
import { createBucket } from '../lib/core.js';

const ROOT = commitment('s1').root;
async function signed(accountId, kp, at = Date.now()) {
  const key = await importSecretKey(kp.secretKey);
  return { account_id: accountId, public_key: kp.publicKey, at, signature: b58encode(await key.sign(new TextEncoder().encode(openMessage(accountId, at)))) };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
function mockRpc({ guestKey, opening, failure = null, info = {} }) {
  return async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    const ok = (result) => Response.json({ jsonrpc: '2.0', id: 'ftf', result });
    if (method === 'query' && params.request_type === 'view_access_key') {
      if (params.account_id === 'chests.ftf-coordinator.testnet' || params.public_key === guestKey) return ok({ nonce: 5, permission: 'FullAccess' });
      return Response.json({ jsonrpc: '2.0', id: 'ftf', error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
    }
    if (method === 'query' && params.request_type === 'call_function') return ok({ result: [...Buffer.from(JSON.stringify({ season: 's1', root: ROOT, seed: { seed: 'ab'.repeat(32) }, opened: 3, size: 10000, ...info }))] });
    if (method === 'block') return ok({ header: { hash: '11111111111111111111111111111111' } });
    if (method === 'send_tx') return ok(failure ? { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: failure } } } } }, receipts_outcome: [] } : { status: { SuccessValue: b64(opening) }, receipts_outcome: [] });
    throw new Error('unexpected ' + method);
  };
}
function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; } }; }
const call = async (h, body) => { const res = fakeRes(); await h({ method: 'POST', headers: {}, body, socket: { remoteAddress: '1.2.3.4' } }, res); return { status: res.statusCode, body: JSON.parse(res.body || '{}') }; };

test('validation and the ed25519 request signature', async () => {
  const kp = await generateKeyPair();
  const b = await signed('ann-1.guests.ftf-coordinator.testnet', kp);
  const v = validateOpen(b); assert.equal(v.ok, true);
  assert.equal(await signatureValid(v), true);
  assert.equal(await signatureValid({ ...v, accountId: 'bob.testnet' }), false);
  assert.equal(validateOpen({ ...b, at: Date.now() - 10 * 60 * 1000 }).error, 'stale');
  assert.equal(validateOpen({ ...b, account_id: 'Bad!' }).error, 'bad_account');
  const g = createReplayGuard(); assert.equal(g.use('x'), true); assert.equal(g.use('x'), false);
});

test('outcomeAt: the proof leads to the committed root', () => {
  for (const p of [0, 999, 1000, 9999]) {
    const o = outcomeAt('s1', p);
    assert.equal(o.root, ROOT);
    assert.equal(rootFromProof(Buffer.from(o.leaf, 'hex'), o.proof), ROOT);
    assert.equal(o.leaf, leafHash('s1', buildDeck()[p]).toString('hex'));
  }
  assert.equal(outcomeAt('s1', 5).outcome.kind, 'nft');
});

test('handler: opens for the key owner, maps contract errors, refuses others', async () => {
  const kp = await generateKeyPair(), acc = 'ann-1.guests.ftf-coordinator.testnet';
  const env = { FTF_CHEST_KEY: (await generateKeyPair()).secretKey, FTF_RPC_URLS: 'http://rpc.test', TRUST_PROXY: '0' };
  const opening = { index: 3, account_id: acc, position: 42, nft: true, tier: 'legendary', token_id: 's1-3', random: 'cd'.repeat(32), block_random: 'ef'.repeat(32), block: '1', at_ns: '1' };
  const h = (o) => chestHandler({ env, bucket: createBucket({ capacity: 9 }), replay: createReplayGuard(), ...o });
  const ok = await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening }) }), await signed(acc, kp));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.opening.position, 42); assert.equal(ok.body.outcome.kind, 'nft'); assert.equal(ok.body.root, ROOT);
  assert.equal(rootFromProof(Buffer.from(ok.body.leaf, 'hex'), ok.body.proof), ROOT);
  const other = await generateKeyPair();
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening }) }), await signed(acc, other))).body.error, 'not_your_key');
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, failure: 'Smart contract panicked: ERR_DAILY: x' }) }), await signed(acc, kp))).status, 429);
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening, info: { seed: null } }) }), await signed(acc, kp))).body.error, 'season_not_ready');
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening, info: { root: '00'.repeat(32) } }) }), await signed(acc, kp))).body.error, 'deck_mismatch');
  const bad = await signed(acc, kp); bad.signature = b58encode(new Uint8Array(64).fill(1));
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening }) }), bad)).status, 401);
  assert.equal((await call(chestHandler({ env: {} }), await signed(acc, kp))).body.error, 'chest_not_configured');
  const g = createReplayGuard(), once = await signed(acc, kp);
  await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening }), replay: g }), once);
  assert.equal((await call(h({ fetch: mockRpc({ guestKey: kp.publicKey, opening }), replay: g }), once)).body.error, 'replayed');
});
