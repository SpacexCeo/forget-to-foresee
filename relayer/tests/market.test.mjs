import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, TRADERS, TOWNSFOLK, CLAN_AGENTS, traderAccount, traderKey, START_BALANCE } from '../market/catalog.js';
import { hourWeight, MEAN_WEIGHT, townRate, nextGapMs, createRateCap, DAY_MS, localHour } from '../market/schedule.js';
import { initialState, pickTrade, applyTrade, priceBand } from '../market/behaviour.js';
import { createMarketDaemon } from '../market/daemon.js';
import { marketStatsHandler } from '../api/market/stats.js';
import { generateKeyPair } from '../lib/near-tx.js';

const seeded = (s = 1) => () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };

test('catalog: 13 townsfolk + 7 clan agents, every item has a trader maker, accounts round-trip', () => {
  assert.equal(TOWNSFOLK.length, 13); assert.equal(CLAN_AGENTS.length, 7); assert.equal(new Set(TRADERS).size, 20);
  for (const i of ITEMS) { assert.ok(TRADERS.includes(i.maker), i.id); assert.ok(i.id.length <= 24 && i.base >= 1); }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const k of TRADERS) {
    const a = traderAccount(k);
    assert.match(a, /^trader-\d{2}\.ftf-town\.testnet$/); assert.ok(a.length <= 64);
    assert.equal(traderKey(a), k);
  }
  assert.equal(traderKey('eve.testnet'), null);
});

test('schedule: the day curve integrates to the target, quiet at night, busy by day', () => {
  let s = 0; const n = 24 * 60;
  for (let i = 0; i < n; i++) s += townRate(Date.UTC(2026, 10, 13) + i * 60_000 + 30_000) * 60;
  assert.ok(Math.abs(s - 20_000) < 20, String(s));
  assert.ok(hourWeight(3) / MEAN_WEIGHT < 0.4 && hourWeight(15) / MEAN_WEIGHT > 1.7);
  assert.equal(localHour(Date.UTC(2026, 10, 13, 22)), 0); // Kyiv midnight
});

test('schedule: 20 Poisson traders make ~20,000 trades in a day, gaps stay in bounds', () => {
  const rand = seeded(7); let total = 0, minGap = Infinity, maxGap = 0;
  for (let k = 0; k < 20; k++) {
    let t = Date.UTC(2026, 10, 13); const end = t + DAY_MS;
    for (;;) { const g = nextGapMs(t, rand); minGap = Math.min(minGap, g); maxGap = Math.max(maxGap, g); t += g; if (t >= end) break; total++; }
  }
  assert.ok(Math.abs(total - 20_000) < 600, String(total));
  assert.ok(minGap >= 2_000 && maxGap <= 30 * 60_000);
});

test('schedule: the rate cap allows a burst of perMinute, then refills', () => {
  let t = 0; const cap = createRateCap({ perMinute: 5, now: () => t });
  assert.equal([1, 2, 3, 4, 5, 6].filter(() => cap.take()).length, 5);
  t = 12_000; assert.equal(cap.take(), true); assert.equal(cap.take(), false);
});

test('behaviour: 100k trades conserve silk, never go negative, keep prices in band and balances spread', () => {
  const rand = seeded(3), st = initialState(TRADERS);
  let n = 0;
  for (let i = 0; i < 100_000; i++) {
    const t = pickTrade(st, TRADERS[Math.floor(rand() * 20)], rand, TRADERS);
    if (!t) continue;
    const it = ITEMS.find((x) => x.id === t.item), [lo, hi] = priceBand(it.base);
    assert.ok(t.price >= lo && t.price <= hi && t.qty >= 1 && t.qty <= 20 && t.buyer !== t.seller && it.maker === t.seller);
    assert.ok(t.qty * t.price <= st.balances[t.buyer]);
    applyTrade(st, t); n++;
  }
  const v = Object.values(st.balances);
  assert.equal(v.reduce((a, b) => a + b, 0), 20 * START_BALANCE);
  assert.ok(n > 99_000 && Math.min(...v) > 50 && Math.max(...v) < 6 * START_BALANCE, JSON.stringify(st.balances));
});

async function fakeChain({ fail = null } = {}) {
  const calls = [], nonces = {};
  const client = {
    async rpc(method, p) {
      calls.push([method, p]);
      if (method === 'block') return { header: { hash: '11111111111111111111111111111111' } };
      if (method === 'query' && p.request_type === 'view_access_key') return { nonce: (nonces[p.account_id] ??= 41) };
      if (method === 'query' && p.request_type === 'view_account') return { amount: '1000000000000000000000000' };
      if (method === 'send_tx') {
        const f = fail && fail(calls.filter((c) => c[0] === 'send_tx').length);
        if (f instanceof Error) throw f;
        return { status: f ? { Failure: f } : { SuccessValue: '' }, receipts_outcome: [] };
      }
      throw new Error('unexpected ' + method);
    },
    async view(c, m, a) { return m === 'balances_of' ? a.account_ids.map(() => ({ wool: '0', silk: String(START_BALANCE * 1_000_000) })) : { day: 1, counters: { trade: 9 } }; },
  };
  const traders = [];
  for (const key of TRADERS) traders.push({ key, account: traderAccount(key), secretKey: (await generateKeyPair()).secretKey });
  return { client, calls, traders };
}
const sentArgs = (calls) => calls.filter((c) => c[0] === 'send_tx').map((c) => Buffer.from(c[1].signed_tx_base64, 'base64').toString('latin1'));

test('daemon: signs a trade with the buyer\'s own key, increments its nonce locally, records it', async () => {
  const { client, calls, traders } = await fakeChain();
  let mem = null; const store = { load: () => mem, save: (o) => { mem = JSON.parse(JSON.stringify(o)); } };
  const logs = [];
  const d = createMarketDaemon({ contractId: 'ftf-town.testnet', traders, client, store, log: (e) => logs.push(e), rand: seeded(5), now: () => Date.UTC(2026, 10, 13, 12) });
  await d.sync();
  const a = await d.tickOnce('guard'), b = await d.tickOnce('guard');
  assert.ok(a.ok && b.ok && a.buyer === 'guard');
  const tx = sentArgs(calls);
  assert.equal(tx.length, 2);
  assert.ok(tx[0].includes('trader-01.ftf-town.testnet') && tx[0].includes('ftf-town.testnet') && tx[0].includes('"counterparty":"' + traderAccount(a.seller) + '"'));
  assert.equal(calls.filter((c) => c[0] === 'query' && c[1].request_type === 'view_access_key').length, 1); // nonce fetched once
  const s = d.stats();
  assert.equal(s.today, 2); assert.equal(s.recent.length, 2); assert.equal(s.recent[0].hash, b.hash); assert.equal(s.chain.total, 9);
  assert.equal(logs.length, 2);
  d.stop();
  assert.equal(mem.today, 2);
  const again = createMarketDaemon({ contractId: 'ftf-town.testnet', traders, client, store, rand: seeded(6), now: () => Date.UTC(2026, 10, 13, 13) });
  assert.equal(again.stats().today, 2); assert.equal(again.stats().recent.length, 2); // survives a restart
  const tomorrow = createMarketDaemon({ contractId: 'ftf-town.testnet', traders, client, store, rand: seeded(6), now: () => Date.UTC(2026, 10, 14, 1) });
  assert.equal(tomorrow.stats().today, 0);
});

test('daemon: a nonce error refetches the nonce; low balance pauses that trader; pause stops all sends', async () => {
  const err = Object.assign(new Error('INVALID_TRANSACTION'), { rpc: { data: { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: 1, ak_nonce: 5 } } } } } });
  const low = Object.assign(new Error('INVALID_TRANSACTION'), { rpc: { data: { TxExecutionError: { InvalidTxError: { NotEnoughBalance: {} } } } } });
  const { client, calls, traders } = await fakeChain({ fail: (n) => (n === 1 ? err : n === 3 ? low : null) });
  let t = Date.UTC(2026, 10, 13, 12);
  const d = createMarketDaemon({ contractId: 'm.testnet', traders, client, rand: seeded(9), now: () => t });
  await d.sync();
  assert.equal((await d.tickOnce('baker')).ok, false);
  assert.equal((await d.tickOnce('baker')).ok, true);
  assert.equal(calls.filter((c) => c[1] && c[1].request_type === 'view_access_key').length, 2);
  assert.equal((await d.tickOnce('scribe')).ok, false);
  assert.deepEqual(d.stats().low_funds, ['scribe']);
  assert.equal(await d.tickOnce('scribe'), null); // backs off
  t += 11 * 60_000;
  assert.ok(await d.tickOnce('scribe'));
  d.pause(true);
  const before = sentArgs(calls).length;
  assert.equal(await d.tickOnce('elder'), null);
  assert.equal(sentArgs(calls).length, before);
  assert.equal(d.stats().paused, true);
});

test('daemon: the global cap limits sends per minute', async () => {
  const { client, calls, traders } = await fakeChain();
  const d = createMarketDaemon({ contractId: 'm.testnet', traders, client, rand: seeded(2), maxPerMinute: 3, now: () => 1e12 });
  await d.sync();
  for (const k of TRADERS.slice(0, 6)) await d.tickOnce(k);
  assert.equal(sentArgs(calls).length, 3);
});

function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } }; }
test('stats route: the daemon\'s stats, or the contract counters without it', async () => {
  const req = { method: 'GET', headers: { origin: 'https://spacexceo.github.io' } };
  let res = fakeRes();
  await marketStatsHandler({ daemon: { stats: () => ({ enabled: true, today: 7, recent: [] }) }, env: {} })(req, res);
  assert.equal(res.statusCode, 200); assert.equal(JSON.parse(res.body).today, 7);
  res = fakeRes();
  const fetch = async () => ({ json: async () => ({ result: { result: [...Buffer.from(JSON.stringify({ day: 3, counters: { trade: 99 } }))] } }) });
  await marketStatsHandler({ daemon: null, env: {}, fetch, now: () => 1 })(req, res);
  const j = JSON.parse(res.body);
  assert.equal(j.enabled, false); assert.equal(j.chain.total, 99); assert.deepEqual(j.recent, []);
  assert.ok(!/secret|ed25519:/i.test(res.body));
});

test('daemon: a wallet stops at its daily NEAR budget; the kill switch stops every wallet', async () => {
  const { client, calls, traders } = await fakeChain();
  let kill = false;
  const d = createMarketDaemon({ contractId: 'ftf-town.testnet', traders, client, rand: seeded(8), now: () => Date.UTC(2026, 10, 13, 12), walletDayNear: 0.001, txNear: 0.0003, killed: () => kill });
  await d.sync();
  const sent = [];
  for (let i = 0; i < 6; i++) sent.push(await d.tickOnce('guard'));
  assert.equal(sent.filter(Boolean).length, 3); // 3 x 0.0003 fits in 0.001, the 4th would not
  assert.deepEqual(d.stats().budget_capped, ['guard']);
  kill = true;
  const before = sentArgs(calls).length;
  assert.equal(await d.tickOnce('baker'), null);
  assert.equal(sentArgs(calls).length, before);
  assert.equal(d.stats().killed, true);
});
