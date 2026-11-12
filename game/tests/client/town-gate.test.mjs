// The Gate-Loom on chain (story rev 4): readGate reads ftf-town's gate_price, balance_of and gate_paid_of; payGate
// signs pay_gate with the guest key and maps the contract's refusals. A mock NEAR RPC, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGate, payGate, toHundredths, GATE_ID } from '../../src/net/town-gate.js';
import { generateKeyPair } from '../../src/net/near-tx.js';

const DEP = { town: 'ftf-town.testnet' };
const bytes = (o) => [...Buffer.from(JSON.stringify(o))];
function rpc({ price = '200000000', silk = 250_000_000, paid = null, failure = null } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const { method, params } = JSON.parse(init.body); calls.push({ method, params });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 'ftf', result }), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 'ftf', result }) });
    if (method === 'query' && params.request_type === 'call_function') {
      const fn = params.method_name;
      const v = fn === 'gate_price' ? price : fn === 'balance_of' ? { silk, credit: 0, staked: 0, staked_works: [0, 0, 0, 0], earned: 0, spent: 0 } : fn === 'gate_paid_of' ? paid : null;
      return ok({ result: bytes(v) });
    }
    if (method === 'query' && params.request_type === 'view_access_key') return ok({ nonce: 7, permission: 'FullAccess', block_hash: '11111111111111111111111111111111' });
    if (method === 'block') return ok({ header: { hash: '11111111111111111111111111111111' } });
    if (method === 'send_tx' || method === 'broadcast_tx_commit') { paid = paid || { gate_id: GATE_ID, price: price, at_ms: 1, season_id: 's1' }; return ok(failure ? { status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: failure } } } } }, receipts_outcome: [] } : { status: { SuccessValue: '' }, receipts_outcome: [] }); }
    throw new Error('unexpected ' + method);
  };
  return { fetch, calls };
}
const mem = (rec) => { const m = new Map(rec ? [['ftf.day1.v1', JSON.stringify(rec)]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('readGate: the price and the balance in story hundredths, and the paid record', async () => {
  assert.equal(toHundredths('200000000'), 20_000); assert.equal(toHundredths(1_234_567), 123);
  const r = await readGate({ account: 'ann.testnet', deployment: DEP, rpcUrls: ['https://rpc.example'], fetch: rpc().fetch });
  assert.deepEqual(r, { ok: true, priceC: 20_000, balanceC: 25_000, paid: null });
  assert.equal((await readGate({ account: null, deployment: DEP })).reason, 'need_guest');
  assert.equal((await readGate({ account: 'a.testnet', deployment: {} })).reason, 'not_configured');
  assert.equal((await readGate({ account: 'a.testnet', deployment: DEP, rpcUrls: ['x'], fetch: async () => { throw new Error('down'); } })).reason, 'network');
});

test('payGate: the guest key signs pay_gate on ftf-town; the record is read back; refusals are mapped', async () => {
  assert.equal((await payGate({ storage: mem(null), deployment: DEP })).reason, 'need_guest');
  const kp = await generateKeyPair();
  const guest = mem({ minted: true, guest: { account_id: 'ann-1.guests.ftf-coordinator.testnet' }, playerKey: { secretKey: kp.secretKey } });
  const ok = rpc();
  const r = await payGate({ storage: guest, deployment: DEP, rpcUrls: ['https://rpc.example'], fetch: ok.fetch });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.record.gate_id, 'loom'); assert.match(r.hash, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.ok(ok.calls.some((c) => c.method === 'send_tx' || c.method === 'broadcast_tx_commit'));
  const poor = await payGate({ storage: guest, deployment: DEP, rpcUrls: ['https://rpc.example'], fetch: rpc({ failure: 'Smart contract panicked: ERR_FUNDS: not enough silk' }).fetch });
  assert.equal(poor.reason, 'no_silk');
  const again = await payGate({ storage: guest, deployment: DEP, rpcUrls: ['https://rpc.example'], fetch: rpc({ failure: 'Smart contract panicked: ERR_GATE_PAID', paid: { gate_id: 'loom' } }).fetch });
  assert.equal(again.ok, true, 'already paid: the record is read back');
});
