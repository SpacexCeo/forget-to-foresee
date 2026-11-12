// The wheel's grand prize: the relayer's roll equals the game's; claims are checked server-side; the mint is mapped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';
import { segmentFor, wheelIdFor, checkClaim, claimText, maxSpin, GRAND, WHEEL_WEIGHTS, WHEEL_LAUNCH_MS } from '../lib/wheel.js';
import { wheelHandler } from '../api/wheel/claim.js';
import { createBucket } from '../lib/core.js';
import { createReplayGuard } from '../lib/chest.js';

test('the relayer roll equals game/src/game/wheel.js spinResult for 5,000 seeds; same weights and wheel id', async () => {
  const g = await import('../../game/src/game/wheel.js');
  assert.deepEqual(WHEEL_WEIGHTS, g.SEGMENTS.map((s) => [s.id, s.weight]));
  for (const acc of ['ann-1.guests.ftf-coordinator.testnet', 'bob.testnet']) assert.equal(wheelIdFor(acc), g.wheelIdFor(acc));
  for (let i = 0; i < 5000; i++) { const seed = `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0').slice(0, 8)}-${1 + (i % 40)}`; assert.equal(segmentFor(seed), g.spinResult(seed).segment.id, seed); }
});

/** A guest account that wins the grand prize within the allowed spins, and its winning spin number. */
function winner(now) {
  for (let k = 0; k < 200000; k++) { const acc = `w${k}.guests.ftf-coordinator.testnet`, id = wheelIdFor(acc); for (let n = 1; n <= maxSpin(now); n++) if (segmentFor(`${id}-${n}`) === GRAND) return { acc, id, n }; }
  throw new Error('no winner');
}
const NOW = WHEEL_LAUNCH_MS + 3 * 864e5;
async function body(acc, kp, seed, wheelId = wheelIdFor(acc), at = NOW) {
  const key = await importSecretKey(kp.secretKey);
  return { account_id: acc, public_key: kp.publicKey, wheel_id: wheelId, seed, at, signature: b58encode(await key.sign(new TextEncoder().encode(claimText(acc, wheelId, seed, at)))) };
}

test('checkClaim: a real win passes; a losing seed, another wheel id, a spin beyond reach, a bad signature fail', async () => {
  const w = winner(NOW), kp = await generateKeyPair();
  const ok = await checkClaim(await body(w.acc, kp, `${w.id}-${w.n}`), NOW);
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.n, w.n);
  let lose = 1; while (segmentFor(`${w.id}-${lose}`) === GRAND) lose++;
  assert.equal((await checkClaim(await body(w.acc, kp, `${w.id}-${lose}`), NOW)).error, 'invalid_spin');
  assert.equal((await checkClaim(await body(w.acc, kp, `deadbeef-${w.n}`, 'deadbeef'), NOW)).error, 'invalid_spin');
  assert.equal((await checkClaim(await body(w.acc, kp, `${w.id}-${maxSpin(NOW) + 1}`), NOW)).error, 'invalid_spin');
  const bad = await body(w.acc, kp, `${w.id}-${w.n}`); bad.signature = b58encode(new Uint8Array(64).fill(3));
  assert.equal((await checkClaim(bad, NOW)).error, 'bad_signature');
  assert.equal((await checkClaim(await body(w.acc, kp, `${w.id}-${w.n}`, undefined, NOW - 10 * 60 * 1000), NOW)).error, 'stale');
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
function rpc({ guestKey, owned = null, left = 50, failure = null }) {
  return async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    const ok = (result) => Response.json({ jsonrpc: '2.0', id: 'ftf', result });
    if (method === 'query' && params.request_type === 'view_access_key') return params.account_id === 'skins.ftf-coordinator.testnet' || params.public_key === guestKey ? ok({ nonce: 1, permission: 'FullAccess' }) : Response.json({ jsonrpc: '2.0', id: 'ftf', error: { cause: { name: 'UNKNOWN_ACCESS_KEY' } } });
    if (method === 'query' && params.request_type === 'call_function') { const view = params.method_name === 'skin_of' ? owned : { cap: 100, minted: 100 - left, left }; return ok({ result: [...Buffer.from(JSON.stringify(view))] }); }
    if (method === 'block') return ok({ header: { hash: '11111111111111111111111111111111' } });
    if (method === 'send_tx') return ok(failure ? { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: failure } } } } }, receipts_outcome: [] } : { status: { SuccessValue: b64({ token_id: 'sheriffchenko-7', owner_id: 'x' }) }, receipts_outcome: [] });
    throw new Error(method);
  };
}
function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; } }; }
const call = async (h, b) => { const res = fakeRes(); await h({ method: 'POST', headers: {}, body: b, socket: { remoteAddress: '1.2.3.4' } }, res); return { status: res.statusCode, body: JSON.parse(res.body || '{}') }; };

test('handler: mints for a real win; already owned, sold out, not your key, not configured', async () => {
  const w = winner(NOW), kp = await generateKeyPair();
  const env = { FTF_SKIN_KEY: (await generateKeyPair()).secretKey, FTF_RPC_URLS: 'http://rpc.test', TRUST_PROXY: '0' };
  const h = (o) => wheelHandler({ env, now: () => NOW, bucket: createBucket({ capacity: 9 }), replay: createReplayGuard(), ...o });
  const good = await call(h({ fetch: rpc({ guestKey: kp.publicKey }) }), await body(w.acc, kp, `${w.id}-${w.n}`));
  assert.equal(good.status, 200, JSON.stringify(good.body)); assert.equal(good.body.token_id, 'sheriffchenko-7');
  assert.equal((await call(h({ fetch: rpc({ guestKey: kp.publicKey, owned: 'sheriffchenko-3' }) }), await body(w.acc, kp, `${w.id}-${w.n}`))).body.error, 'already_owned');
  assert.equal((await call(h({ fetch: rpc({ guestKey: kp.publicKey, left: 0 }) }), await body(w.acc, kp, `${w.id}-${w.n}`))).body.error, 'sold_out');
  assert.equal((await call(h({ fetch: rpc({ guestKey: kp.publicKey, failure: 'ERR_SOLD_OUT: x' }) }), await body(w.acc, kp, `${w.id}-${w.n}`))).body.error, 'sold_out');
  const other = await generateKeyPair();
  assert.equal((await call(h({ fetch: rpc({ guestKey: kp.publicKey }) }), await body(w.acc, other, `${w.id}-${w.n}`))).body.error, 'not_your_key');
  assert.equal((await call(wheelHandler({ env: {}, now: () => NOW }), await body(w.acc, kp, `${w.id}-${w.n}`))).body.error, 'wheel_not_configured');
  const g = createReplayGuard(), once = await body(w.acc, kp, `${w.id}-${w.n}`);
  await call(h({ fetch: rpc({ guestKey: kp.publicKey }), replay: g }), once);
  assert.equal((await call(h({ fetch: rpc({ guestKey: kp.publicKey }), replay: g }), once)).body.error, 'replayed');
});
