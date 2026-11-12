import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAct, actMessage, actFor, returnValueOf, ACTIONS } from '../lib/town-act.js';
import { requestHash } from '../lib/town-gate.js';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { createReplayGuard } from '../lib/chest.js';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';
import { townActHandler, actState } from '../api/town/act.js';

const M = 1_000_000n, NOW = Date.UTC(2026, 10, 13, 12), ACC = 'ann-1.guests.ftf-coordinator.testnet';
function logOf(entries) { const log = []; for (const e of entries) log.push(makeEntry(log, e)); return log; }
const LOG = logOf([{ t: 1, kind: 'quest_turned_in', silkC: 10_000, trust: 'T2' }]);
async function signed(action, args, { at = NOW, account = ACC } = {}) {
  const key = await importSecretKey((await generateKeyPair()).secretKey);
  const signature = b58encode(await key.sign(new TextEncoder().encode(actMessage(account, action, args, at))));
  return { account_id: account, public_key: key.publicKey, at, action, args, signature };
}
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
function chain({ registered = true, silk = 50n * M, fail = null } = {}) {
  const calls = [], st = { registered, silk, used: new Set() };
  return { calls, st, client: {
    async view(c, m, a) {
      if (m === 'gate_price') return String(200n * M);
      if (m === 'balance_of') return st.registered ? { silk: String(st.silk), credit: '0', staked: '0' } : null;
      if (m === 'act_request_used') return st.used.has(a.request_hash);
      throw new Error(m);
    },
    async rpc(m, p) { if (p.account_id !== ACC) throw new Error('UNKNOWN'); return {}; },
    async call({ methodName, args }) {
      calls.push([methodName, args]);
      if (methodName === 'register') { st.registered = true; return { ok: true, hash: 'R' }; }
      if (methodName === 'credit_silk') { st.silk += BigInt(args.amount); return { ok: true, hash: 'C' }; }
      if (fail) return { ok: false, failure: fail, hash: 'F' };
      st.used.add(args.request_hash);
      return { ok: true, hash: 'TX' + calls.length, outcome: { status: { SuccessValue: b64(methodName === 'pledge_for' ? 'deed-0-7' : '0') } } };
    },
  } };
}
const mem = () => { const m = new Map(); return { get: (g) => m.get(g) || { credited: '0', day: 0, today: '0' }, put: (g, r) => m.set(g, r) }; };
const deps = (c, extra = {}) => ({ client: c.client, cfg: { town: 'ftf-town.testnet', coord: 'gate.ftf-town.testnet', coordKey: 'x', logDir: '/x', guestDaySilk: 300 }, ledger: mem(), replay: createReplayGuard(), key: {}, loadLog: () => LOG, now: () => NOW, ...extra });

test('act: every action signs its own fields in order, and bad shapes are refused', async () => {
  assert.equal(actMessage(ACC, 'pledge', { asset: 1, amount: '5000000', tier: 2 }, 9), `ftf-town-act|${ACC}|pledge|1,5000000,2|9`);
  assert.equal(actMessage(ACC, 'invest_stall', { trader: 'trader-03.ftf-town.testnet', amount: '1000000' }, 9), `ftf-town-act|${ACC}|invest_stall|trader-03.ftf-town.testnet,1000000|9`);
  const ok = await signed('claim', { token_id: 'deed-s1-4' });
  assert.equal(validateAct(ok, NOW).ok, true);
  assert.equal(validateAct({ ...ok, action: 'trade' }, NOW).error, 'bad_action');
  assert.equal(validateAct({ ...ok, action: '__proto__' }, NOW).error, 'bad_action');
  assert.equal(validateAct({ ...(await signed('pledge', { asset: 4, amount: '1', tier: 0 })) }, NOW).error, 'bad_args');
  assert.equal(validateAct({ ...(await signed('pledge', { asset: 0, amount: '01', tier: 0 })) }, NOW).error, 'bad_args');
  assert.equal(validateAct({ ...ok, at: NOW - 10 * 60 * 1000 }, NOW).error, 'stale');
  assert.deepEqual(Object.keys(ACTIONS).sort(), ['claim', 'claim_stall', 'enter_tournament', 'exit_early', 'invest_stall', 'pledge', 'unbond']);
});

test('act: a pledge credits the verified income first, then calls pledge_for for the guest with the request hash, once', async () => {
  const c = chain(); const body = await signed('pledge', { asset: 0, amount: String(20n * M), tier: 1 });
  const v = validateAct(body, NOW); const d = deps(c);
  const r = await actFor(v, d);
  assert.equal(r.status, 200); assert.equal(r.body.result, 'deed-0-7'); assert.equal(r.body.request_hash, requestHash(v.message, v.signature));
  assert.deepEqual(c.calls.map((x) => x[0]), ['credit_silk', 'pledge_for']);
  assert.deepEqual(c.calls[1][1], { account_id: ACC, asset: 0, amount: String(20n * M), tier: 1, request_hash: r.body.request_hash });
  const again = await actFor(v, d);
  assert.equal(again.status, 409); assert.equal(again.body.error, 'replayed'); assert.equal(c.calls.length, 2);
  const fresh = await actFor(v, { ...d, replay: createReplayGuard() }); // another relayer instance: the chain remembers
  assert.equal(fresh.status, 409);
});

test('act: a claim needs no credit; an unregistered guest is told so; contract refusals map to reasons', async () => {
  const c = chain(); const r = await actFor(validateAct(await signed('claim', { token_id: 'deed-0-7' }), NOW), deps(c));
  assert.equal(r.status, 200); assert.deepEqual(c.calls.map((x) => x[0]), ['claim_for']);
  const none = await actFor(validateAct(await signed('unbond', { token_id: 'deed-0-7' }), NOW), deps(chain({ registered: false })));
  assert.equal(none.body.error, 'not_registered');
  const locked = await actFor(validateAct(await signed('unbond', { token_id: 'deed-0-7' }), NOW), deps(chain({ fail: 'Smart contract panicked: ERR_LOCKED: the deed is still locked' })));
  assert.equal(locked.status, 409); assert.equal(locked.body.error, 'locked');
  const cap = await actFor(validateAct(await signed('claim', { token_id: 'deed-0-7' }), NOW), deps(chain({ fail: 'ERR_ACT_CAP: the daily limit' })));
  assert.equal(cap.status, 429);
  const old = await actFor(validateAct(await signed('claim', { token_id: 'deed-0-7' }), NOW), deps(chain({ fail: '{"ActionError":{"kind":{"FunctionCallError":{"MethodResolveError":"MethodNotFound"}}}}' })));
  assert.equal(old.body.error, 'contract_not_upgraded');
});

test('act: bad signature, someone else\'s key, and a guest without a log still moves the silk it holds', async () => {
  const body = await signed('claim_stall', { trader: 'trader-01.ftf-town.testnet' });
  assert.equal((await actFor(validateAct({ ...body, args: { trader: 'trader-02.ftf-town.testnet' } }, NOW), deps(chain()))).status, 401);
  assert.equal((await actFor(validateAct(await signed('claim', { token_id: 'd-1' }, { account: 'eve.testnet' }), NOW), deps(chain()))).status, 403);
  const c = chain(); const r = await actFor(validateAct(await signed('invest_stall', { trader: 'trader-01.ftf-town.testnet', amount: String(5n * M) }), NOW), deps(c, { loadLog: () => null }));
  assert.equal(r.status, 200); assert.deepEqual(c.calls.map((x) => x[0]), ['invest_stall_for']);
  assert.equal(returnValueOf({ status: { SuccessValue: b64({ a: 1 }) } }).a, 1); assert.equal(returnValueOf(null), null);
});

test('act: GET reads the guest\'s row, deeds and limits; POST without a coordinator key is 503', async () => {
  const client = { async view(c, m, a) {
    if (m === 'balance_of') return { silk: '7', credit: '1', staked: '5' };
    if (m === 'pulse') return { day: 3, season_id: 's1', entry_fee: '40000000', paused: false };
    if (m === 'nft_tokens_for_owner') return [{ token_id: 'deed-s1-1' }];
    if (m === 'get_deed') return [ACC, { asset: 2, principal: 5, tier: 0, state: 0, locked_until_day: 3, unbond_ready_day: 0 }, '9'];
    if (m === 'act_limits') return [2, 40, '10', '20000'];
    if (m === 'has_entered') return true;
    throw new Error(m);
  } };
  const s = await actState(client, 'ftf-town.testnet', ACC);
  assert.equal(s.silk, '7'); assert.equal(s.deeds[0].claimable, '9'); assert.equal(s.limits.today, 2); assert.equal(s.entered, true); assert.equal(s.season_id, 's1');
  const h = townActHandler({ env: { FTF_DATA_DIR: '/tmp/none-ftf' }, client });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await h({ method: 'POST', headers: {}, url: '/api/town/act', body: {} }, res);
  assert.equal(res.statusCode, 503);
});
