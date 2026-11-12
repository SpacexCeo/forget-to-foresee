import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWN_POLICY, TOWN_TARGET, townFee, townEnv, MIN_TRADE, MICRO } from '../lib/town-traders.js';
import { TRADERS, traderAccount, START_BALANCE } from '../market/catalog.js';
import { createMarketDaemon } from '../market/daemon.js';
import { nextGapMs, DAY_MS } from '../market/schedule.js';
import { generateKeyPair } from '../lib/near-tx.js';

const seeded = (s = 1) => () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };

test('town policy: a simulated day of ~22,000 trades: min 0.5 silk, mean ~2 silk, fees leave, balances stay positive', () => {
  const rand = seeded(11), st = TOWN_POLICY.init(TRADERS);
  let n = 0, volume = 0, fees = 0, skipped = 0;
  const events = [];
  for (let k = 0; k < TRADERS.length; k++) {
    let t = Date.UTC(2026, 10, 13); const end = t + DAY_MS;
    for (;;) { t += nextGapMs(t, rand, { target: TOWN_TARGET, traders: 20 }); if (t >= end) break; events.push([t, TRADERS[k]]); }
  }
  events.sort((a, b) => a[0] - b[0]); // the traders interleave through the day
  for (const [, key] of events) {
    const tr = TOWN_POLICY.pick(st, key, rand, TRADERS);
    if (!tr) { skipped++; continue; }
    assert.ok(tr.silk >= MIN_TRADE && tr.seller !== tr.buyer && Number.isInteger(tr.silk));
    TOWN_POLICY.apply(st, tr); n++; volume += tr.silk; fees += townFee(tr.silk);
  }
  assert.ok(Math.abs(n - TOWN_TARGET) < 700, String(n));
  const mean = volume / n / MICRO;
  assert.ok(mean > 1.2 && mean < 3, String(mean));
  const total = Object.values(st.balances).reduce((a, b) => a + b, 0);
  assert.equal(total + fees, 20 * START_BALANCE * MICRO);
  assert.ok(Math.min(...Object.values(st.balances)) > 100 * MICRO, JSON.stringify(st.balances));
  assert.ok(skipped < n * 0.01);
});

test('town policy: the call is trade({counterparty, silk, reference})', () => {
  const t = { buyer: 'guard', seller: 'baker', item: 'bread', qty: 2, price: 3, silk: 600_000 };
  assert.deepEqual(TOWN_POLICY.args(t, (k) => traderAccount(k)), { counterparty: 'trader-05.ftf-town.testnet', silk: '600000', reference: 'bread' });
});

test('town env: off by default; on, it is a dry run unless FTF_TOWN_SEND=1', () => {
  assert.equal(townEnv({}).enabled, false);
  assert.deepEqual([townEnv({ FTF_TOWN: '1' }).send, townEnv({ FTF_TOWN: '1', FTF_TOWN_SEND: '1' }).send], [false, true]);
  assert.equal(townEnv({}).contract, 'ftf-town.testnet');
});

function fakeClient() {
  const calls = [];
  return { calls, client: {
    async rpc(method, p) {
      calls.push([method, p]);
      if (method === 'block') return { header: { hash: '11111111111111111111111111111111' } };
      if (method === 'query' && p.request_type === 'view_access_key') return { nonce: 1 };
      if (method === 'query' && p.request_type === 'view_account') return { amount: '1000000000000000000000000' };
      if (method === 'send_tx') return { status: { SuccessValue: '' }, receipts_outcome: [] };
      throw new Error(method);
    },
    async view(c, m, a) {
      if (m === 'balances_of') return a.account_ids.map(() => ({ wool: '0', silk: String(1000 * MICRO) }));
      if (m === 'pulse') return { day: 20405, counters: { trade: 77 } };
      throw new Error(m);
    },
  } };
}

test('town traders: the dry run never signs or sends; the send mode signs with the buyer\'s own key', async () => {
  const dry = fakeClient();
  const d = createMarketDaemon({ contractId: 'ftf-town.testnet', policy: TOWN_POLICY, dryRun: true, traders: TRADERS.map((key) => ({ key, account: traderAccount(key), secretKey: null })), client: dry.client, rand: seeded(3), target: TOWN_TARGET, now: () => Date.UTC(2026, 10, 13, 12) });
  await d.sync();
  for (const k of TRADERS.slice(0, 5)) await d.tickOnce(k);
  assert.equal(dry.calls.filter((c) => c[0] === 'send_tx' || c[0] === 'block').length, 0);
  assert.equal(d.stats().dry_run, true); assert.equal(d.stats().today, 5); assert.equal(d.stats().chain.total, 77);
  const live = fakeClient();
  const traders = [];
  for (const key of TRADERS) traders.push({ key, account: traderAccount(key), secretKey: (await generateKeyPair()).secretKey });
  const l = createMarketDaemon({ contractId: 'ftf-town.testnet', policy: TOWN_POLICY, traders, client: live.client, rand: seeded(4), now: () => Date.UTC(2026, 10, 13, 12) });
  await l.sync();
  const e = await l.tickOnce('baker');
  assert.ok(e.ok);
  const raw = Buffer.from(live.calls.find((c) => c[0] === 'send_tx')[1].signed_tx_base64, 'base64').toString('latin1');
  assert.ok(raw.includes('trader-05.ftf-town.testnet') && raw.includes('ftf-town.testnet') && raw.includes('"counterparty":"' + traderAccount(e.seller) + '"') && raw.includes('"reference":"' + e.item + '"'));
});
