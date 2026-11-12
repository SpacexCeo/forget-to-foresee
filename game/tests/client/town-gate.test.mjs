// The Gate-Loom on chain through the relayer (story rev 4; relayer/api/town/gate.js): readGate maps the relayer's
// on-chain view to story hundredths; payGate sends the log first, signs "ftf-gate|<account>|<gate>|<at>" with the guest
// key and maps the relayer's answers. A fake relayer, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGate, payGate, toHundredths, gateMessage, GATE_ID } from '../../src/net/town-gate.js';
import { generateKeyPair, b58decode } from '../../src/net/near-tx.js';

const BASE = 'https://relayer.example';
const mem = (rec) => { const m = new Map(rec ? [['ftf.day1.v1', JSON.stringify(rec)]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('readGate: the on-chain silk and price in story hundredths, and the paid record', async () => {
  assert.equal(toHundredths('200000000'), 20_000); assert.equal(toHundredths(1_234_567), 123);
  const fetch = async (url) => { assert.equal(url, BASE + '/api/town/gate?account_id=ann.testnet'); return reply(200, { registered: true, silk: '250000000', gate_price: '200000000', gate: null, configured: true }); };
  assert.deepEqual(await readGate({ account: 'ann.testnet', base: BASE, fetch }), { ok: true, priceC: 20_000, balanceC: 25_000, paid: null, configured: true });
  assert.equal((await readGate({ account: null, base: BASE })).reason, 'need_guest');
  assert.equal((await readGate({ account: 'a.testnet', base: '' })).reason, 'not_configured');
  assert.equal((await readGate({ account: 'a.testnet', base: BASE, fetch: async () => { throw new Error('down'); } })).reason, 'network');
});

test('payGate: the log goes first, the guest key signs the gate request, the relayer\'s answers are mapped', async () => {
  assert.equal((await payGate({ storage: mem(null), base: BASE })).reason, 'need_guest');
  const kp = await generateKeyPair(), acc = 'ann-1.guests.ftf-coordinator.testnet';
  const guest = mem({ minted: true, guest: { account_id: acc }, playerKey: { secretKey: kp.secretKey } });
  const order = []; let sent = null;
  const fetch = async (url, init) => { order.push('post'); sent = JSON.parse(init.body); return reply(200, { paid: true, tx_hash: 'TX1', gate: { gate_id: GATE_ID } }); };
  const r = await payGate({ storage: guest, base: BASE, fetch, now: () => 1234, flush: async () => { order.push('flush'); } });
  assert.deepEqual(r, { ok: true, hash: 'TX1', record: { gate_id: 'loom' }, accountId: acc });
  assert.deepEqual(order, ['flush', 'post']);
  assert.deepEqual([sent.account_id, sent.public_key, sent.at, sent.gate_id], [acc, kp.publicKey, 1234, 'loom']);
  const key = await crypto.subtle.importKey('raw', b58decode(kp.publicKey.slice(8)), { name: 'Ed25519' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify('Ed25519', key, b58decode(sent.signature), new TextEncoder().encode(gateMessage(acc, 'loom', 1234))), true);
  assert.equal((await payGate({ storage: guest, base: BASE, fetch: async () => reply(402, { error: 'not_enough_silk' }) })).reason, 'no_silk');
  assert.equal((await payGate({ storage: guest, base: BASE, fetch: async () => reply(503, { error: 'gate_not_configured' }) })).reason, 'not_configured');
  assert.equal((await payGate({ storage: guest, base: BASE, fetch: async () => reply(409, { error: 'already_paid', gate: { gate_id: 'loom' } }) })).ok, true, 'already paid: ok with the record');
});
