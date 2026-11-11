// Day 1 transaction client (src/net/near-tx.js): base58, the borsh layout of a FunctionCall transaction, ed25519
// signing via WebCrypto that verifies against the public key, and the failure finder on final outcomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { b58encode, b58decode, publicKeyBytes, serializeFunctionCallTx, signedTxBytes, generateKeyPair, importSecretKey, sha256, findFailure, createTxClient } from '../../src/net/near-tx.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('base58 round trip, leading zeros kept', () => {
  for (const b of [Uint8Array.of(0, 0, 1, 2, 255), new Uint8Array(32).fill(7), Uint8Array.of(0)]) assert.deepEqual(b58decode(b58encode(b)), b);
  assert.equal(b58encode(Uint8Array.of(0, 0, 1)), '112');
});

test('FunctionCall transaction: the borsh layout field by field', () => {
  const pub = 'ed25519:' + b58encode(new Uint8Array(32).fill(1));
  const hash = b58encode(new Uint8Array(32).fill(2));
  const tx = serializeFunctionCallTx({ signerId: 'guests.x.testnet', publicKey: pub, nonce: 5n, receiverId: 'guests.x.testnet', blockHash: hash, methodName: 'create_guest', args: { a: 1 }, gas: 300n, deposit: 1n });
  const dv = new DataView(tx.buffer); let o = 0;
  const str = () => { const n = dv.getUint32(o, true); o += 4; const s = new TextDecoder().decode(tx.slice(o, o + n)); o += n; return s; };
  assert.equal(str(), 'guests.x.testnet');
  assert.equal(tx[o], 0); assert.deepEqual(tx.slice(o + 1, o + 33), new Uint8Array(32).fill(1)); o += 33;
  assert.equal(dv.getBigUint64(o, true), 5n); o += 8;
  assert.equal(str(), 'guests.x.testnet');
  assert.deepEqual(tx.slice(o, o + 32), new Uint8Array(32).fill(2)); o += 32;
  assert.equal(dv.getUint32(o, true), 1); o += 4;
  assert.equal(tx[o], 2, 'FunctionCall'); o += 1;
  assert.equal(str(), 'create_guest');
  assert.equal(str(), '{"a":1}');
  assert.equal(dv.getBigUint64(o, true), 300n); o += 8;
  assert.equal(dv.getBigUint64(o, true), 1n); assert.equal(dv.getBigUint64(o + 8, true), 0n); o += 16;
  assert.equal(o, tx.length);
  assert.equal(signedTxBytes(tx, new Uint8Array(64)).length, tx.length + 65);
  assert.throws(() => publicKeyBytes('ed25519:abc'));
});

test('keys: a generated secret signs, and the signature verifies with its public key', async () => {
  const { secretKey, publicKey } = await generateKeyPair();
  assert.match(secretKey, /^ed25519:/); assert.equal(b58decode(publicKey.slice(8)).length, 32);
  const k = await importSecretKey(secretKey);
  assert.equal(k.publicKey, publicKey);
  const msg = await sha256(new TextEncoder().encode('hello'));
  const sig = await k.sign(msg);
  const pk = await crypto.subtle.importKey('raw', b58decode(publicKey.slice(8)), { name: 'Ed25519' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'Ed25519' }, pk, sig, msg), true);
});

test('final outcomes: success only when the transaction and every receipt succeeded', () => {
  assert.equal(findFailure({ status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] }), null);
  assert.ok(findFailure({ status: { SuccessValue: '' }, receipts_outcome: [{ outcome: { status: { Failure: { ActionError: {} } } } }] }));
  assert.ok(findFailure({ status: { Failure: { InvalidTxError: {} } } }));
  assert.ok(findFailure(null));
});

test('the client signs with the access key nonce + 1 and waits for FINAL', async () => {
  const { secretKey } = await generateKeyPair();
  const key = await importSecretKey(secretKey);
  const sent = [];
  const fetch = async (url, init) => {
    const b = JSON.parse(init.body); sent.push(b);
    const result = b.method === 'query' ? { nonce: 41 } : b.method === 'block' ? { header: { hash: b58encode(new Uint8Array(32).fill(9)) } } : { status: { SuccessValue: '' }, receipts_outcome: [] };
    return { json: async () => ({ result }) };
  };
  const r = await createTxClient({ rpcUrls: ['https://rpc.test'], fetch }).call({ key, signerId: 'g.testnet', receiverId: 'g.testnet', methodName: 'create_guest', args: {} });
  assert.equal(r.ok, true);
  const send = sent.find((b) => b.method === 'send_tx');
  assert.equal(send.params.wait_until, 'FINAL');
  const bytes = Uint8Array.from(atob(send.params.signed_tx_base64), (c) => c.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  const signerLen = dv.getUint32(0, true);
  assert.equal(dv.getBigUint64(4 + signerLen + 33, true), 42n, 'nonce + 1');
});
