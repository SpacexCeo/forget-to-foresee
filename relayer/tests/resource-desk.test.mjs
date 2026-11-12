import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, settle, checkCall, createHashJournal, QUOTE_SLACK } from '../lib/resource-desk.js';
import { TOWN_POLICY } from '../lib/town-traders.js';
import { TRADERS } from '../market/catalog.js';
import { resourceHandler } from '../api/market/resource.js';

const TOWN = 'ftf-town.testnet', ITEMS = 'items.ftf-town.testnet';
const H = '7Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx', H2 = '8Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const txOf = ({ signer = 'ann.testnet', receiver = TOWN, method = 'trade', args, fail = false }) => ({
  status: fail ? { Failure: {} } : { SuccessValue: '' }, receipts_outcome: [],
  transaction: { signer_id: signer, receiver_id: receiver, actions: [{ FunctionCall: { method_name: method, args: b64(args), deposit: '0' } }] },
});
const clientWith = (tx) => ({ async rpc(m, p) { assert.equal(m, 'tx'); if (!tx) throw new Error('UNKNOWN_TRANSACTION'); return tx; } });

test('desk: quotes follow the price rules; no deal on an empty shelf (buy) or a full one (sell)', () => {
  const st = TOWN_POLICY.init(TRADERS);
  const b = quote(st, 'veil_dust', 2, 'buy'), s = quote(st, 'veil_dust', 2, 'sell');
  assert.ok(b.ok && s.ok && b.silk > s.silk && b.silk === 2 * b.unit * 200_000);
  st.stock.veil_dust = 1; assert.equal(quote(st, 'veil_dust', 2, 'buy').ok, false);
  st.stock.veil_dust = 40; assert.equal(quote(st, 'veil_dust', 1, 'sell').ok, false);
  assert.equal(quote(st, 'gold', 1, 'buy'), null); assert.equal(quote(st, 'veil_dust', 0, 'buy'), null);
});

test('desk: a buy is settled once against the player\'s own on-chain payment (dry run: verify and plan only)', async () => {
  const st = TOWN_POLICY.init(TRADERS);
  const q = quote(st, 'veil_dust', 2, 'buy');
  const tx = txOf({ args: { counterparty: 'trader-06.ftf-town.testnet', silk: String(q.silk), reference: 'buy:veil_dust:2' } });
  const journal = createHashJournal();
  const deps = { client: clientWith(tx), st, town: TOWN, items: ITEMS, send: false, journal, mint: () => assert.fail('dry run must not mint') };
  const r = await settle({ side: 'buy', item: 'veil_dust', qty: 2, account: 'ann.testnet', hash: H }, deps);
  assert.equal(r.status, 200); assert.equal(r.dry_run, true);
  assert.deepEqual(r.plan, { mint: { contract: ITEMS, to: 'ann.testnet', token_id: 'veil_dust', amount: 2 } });
  assert.equal(st.stock.veil_dust, 18); // the shelf follows the deal
  assert.equal((await settle({ side: 'buy', item: 'veil_dust', qty: 2, account: 'ann.testnet', hash: H }, deps)).error, 'already_settled');
});

test('desk: wrong signer, stall, reference, amount or a failed transaction are refused', () => {
  const base = { side: 'buy', item: 'veil_dust', qty: 2, account: 'ann.testnet', town: TOWN, items: ITEMS, quoteSilk: 1_000_000 };
  const call = (args, o = {}) => ({ signer: 'ann.testnet', receiver: TOWN, method: 'trade', args, ...o });
  const ok = { counterparty: 'trader-06.ftf-town.testnet', silk: '1000000', reference: 'buy:veil_dust:2' };
  assert.equal(checkCall(call(ok), base), null);
  assert.equal(checkCall(call(ok, { signer: 'eve.testnet' }), base), 'wrong_signer');
  assert.equal(checkCall(call({ ...ok, counterparty: 'trader-01.ftf-town.testnet' }), base), 'wrong_stall');
  assert.equal(checkCall(call({ ...ok, reference: 'buy:veil_dust:3' }), base), 'wrong_reference');
  assert.equal(checkCall(call({ ...ok, silk: String(Math.floor(1_000_000 * (1 - QUOTE_SLACK)) - 1) }), base), 'paid_too_little');
  assert.equal(checkCall(call(ok, { receiver: 'other.testnet' }), base), 'not_a_town_trade');
  assert.equal(checkCall({ error: 'tx_failed' }, base), 'tx_failed');
  const sell = { ...base, side: 'sell', qty: 3 };
  assert.equal(checkCall({ signer: 'ann.testnet', receiver: ITEMS, method: 'mt_transfer', args: { receiver_id: 'trader-06.ftf-town.testnet', token_id: 'veil_dust', amount: '3' } }, sell), null);
  assert.equal(checkCall({ signer: 'ann.testnet', receiver: ITEMS, method: 'mt_transfer', args: { receiver_id: 'trader-06.ftf-town.testnet', token_id: 'veil_dust', amount: '2' } }, sell), 'wrong_transfer');
});

test('desk: with sending on, a sell is paid by the stall\'s own key; a failed payment frees the hash for a retry', async () => {
  const st = TOWN_POLICY.init(TRADERS);
  const tx = txOf({ receiver: ITEMS, method: 'mt_transfer', args: { receiver_id: 'trader-01.ftf-town.testnet', token_id: 'chitin_plate', amount: '3' } });
  const journal = createHashJournal(); const paid = [];
  let fail = true;
  const deps = { client: clientWith(tx), st, town: TOWN, items: ITEMS, send: true, journal, pay: async (p) => { paid.push(p); return fail ? { ok: false, failure: 'x' } : { ok: true, hash: H2 }; } };
  const r1 = await settle({ side: 'sell', item: 'chitin_plate', qty: 3, account: 'ann.testnet', hash: H }, deps);
  assert.equal(r1.status, 502); assert.equal(journal.has(H), false);
  fail = false;
  const r2 = await settle({ side: 'sell', item: 'chitin_plate', qty: 3, account: 'ann.testnet', hash: H }, deps);
  assert.equal(r2.status, 200); assert.equal(r2.tx_hash, H2); assert.equal(paid[1].stall, 'trader-01.ftf-town.testnet'); assert.equal(paid[1].account, 'ann.testnet');
  assert.ok(Number(r2.silk) > 0);
});

function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } }; }
test('desk route: GET quotes with the stall and the reference the player must use', async () => {
  const res = fakeRes();
  await resourceHandler({ env: {}, daemon: null })({ method: 'GET', url: '/api/market/resource?side=buy&item=crown_shard&qty=1', headers: {} }, res);
  const j = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([j.stall, j.reference, j.dry_run, j.town], ['trader-02.ftf-town.testnet', 'buy:crown_shard:1', true, 'ftf-town.testnet']);
  assert.ok(j.silk > 0 && typeof j.reason === 'string');
});
