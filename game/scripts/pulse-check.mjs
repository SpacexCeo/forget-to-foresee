#!/usr/bin/env node
// Checks Town Pulse (game/public/pulse.html) against recorded fixtures in a real browser, with the testnet RPC and the
// relayer answered by fixtures (docs/stats-page.md): every number equals its fixture, a relayer/chain mismatch shows
// the warning, events come from the chain's tx answer, and a failing RPC shows "Unavailable" with no numbers.
//   node game/scripts/pulse-check.mjs [base=http://127.0.0.1:4173]   (serve the built game first: npx vite preview)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const M = 1_000_000;
const TRADERS = ['guard', 'shardkeeper', 'scribe', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician', 'sweeper', 'lamplighter', 'courier', 'child_a', 'child_b', 'iris', 'salt', 'ash', 'moss', 'amber', 'frost', 'tinker'];
const HASH = '7Xy3tZ9rQd1mVbN4kLpW2sF8hJcGaE5uYoTiRe6wQzx';
const pulse = { day: 20405, counters: { trade: 12345, entry: 3, settle: 0, invest: 1, stall_claim: 0, stake: 2, claim: 1, unbond: 0, withdraw: 0, early_exit: 0, sweep: 1, distribute: 1, deed_transfer: 0 }, accounts: 27,
  volume_silk: String(24_000 * M), minted_silk: String(26_000 * M), burned_silk: String(12 * M), tvl_staked: String(900 * M), treasury_silk: String(3 * M), stake_pot: '0', purse: String(80 * M), reserve: String(2 * M),
  rate_7d_per_100: ['150000', '0', '0', '0'], season_id: 's1', schedule_root: 'abc', season_entrants: 3, entry_fee: String(40 * M), paused: false, gate_burned: '0', gates_paid: 0 };
const params = { trade_fee_bps: 12, tithe_stakers_bps: 6500, tithe_purse_bps: 1000, tithe_reserve_bps: 1000, tithe_burn_bps: 1500, rate_ceiling_bps: 15, entry_fee: 40 * M, cap_floor: 800 * M, cap_total: 8000 * M, season_mint_cap: 12000 * M, stall_fee_bps: 5000 };
const chainSilk = (i) => (1000 + i) * M;
const results = {
  pulse, params, gate_price: String(200 * M), stake_pools: [0, 1, 2, 3].map(() => ({ principal: String(225 * M) })),
  balances_of: Array.from({ length: 26 }, (_, i) => ({ silk: chainSilk(i), earned: 10 * M, spent: 9 * M, staked: 0, credit: 0 })),
  stall_of: (args) => (args.trader === 'trader-05.ftf-town.testnet' ? { invested: 150 * M, index: 0, rewards: 2 * M } : { invested: 0, index: 0, rewards: 0 }),
};
const stats = { enabled: true, dry_run: false, recent: [{ at: Date.UTC(2026, 10, 13, 9), buyer: 'guard', seller: 'baker', item: 'bread', qty: 2, price: 3, silk: 1_200_000, hash: HASH, reason: 'fair price' }],
  balances: Object.fromEntries(TRADERS.map((k, i) => [k, String(i === 3 ? chainSilk(i) + 100 * M : chainSilk(i))])), stalls: [], strategy: null };
const txAnswer = { status: { SuccessValue: '' }, transaction: {}, receipts_outcome: [{ outcome: { logs: ['EVENT_JSON:{"standard":"ftf_town","version":"1.0.0","event":"trade","data":[{"from":"trader-01.ftf-town.testnet","to":"trader-05.ftf-town.testnet","silk":"1200000","fee":"1440","ref":"bread","n":12345}]}'] } }] };

// The public indexer: three trades and one failed trade on the town today, one chest opened, one row from yesterday.
const txRow = (hash, signer, receiver, method, ok, agoMs) => ({ transaction_hash: hash, signer_account_id: signer, receiver_account_id: receiver, actions: [{ action: 'FUNCTION_CALL', method }],
  outcomes: { status: ok }, block_timestamp: String(BigInt(Date.now() - agoMs) * 1000000n) });
function indexerPage(url) {
  const acc = new URL(url).pathname.split('/')[3];
  const sinceMidnight = Date.now() % 86400e3;
  if (acc === 'ftf-town.testnet') return { data: [txRow('T1', 'trader-01.ftf-town.testnet', acc, 'trade', true, 1000), txRow('T2', 'trader-02.ftf-town.testnet', acc, 'trade', true, 2000),
    txRow('T3', 'trader-01.ftf-town.testnet', acc, 'trade', true, 3000), txRow('TFAIL', 'trader-03.ftf-town.testnet', acc, 'trade', false, 4000), txRow('OLD', 'trader-04.ftf-town.testnet', acc, 'trade', true, sinceMidnight + 60e3)], meta: {} };
  if (acc === 'chests.ftf-coordinator.testnet') return { data: [txRow('C1', 'chests.ftf-coordinator.testnet', acc, 'open_chest', true, 5000)], meta: {} };
  return { data: [], meta: {} };
}

async function page(browser, failRpc) {
  const p = await browser.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.route('https://test.rpc.fastnear.com/**', (r) => route(r, failRpc));
  await p.route('https://rpc.testnet.near.org/**', (r) => route(r, failRpc));
  await p.route('https://api-testnet.nearblocks.io/v3/**', (r) => (failRpc ? r.fulfill({ status: 500, body: 'down' }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(indexerPage(r.request().url())) })));
  await p.route('**/api/market/stats', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stats) }));
  await p.goto(BASE + '/pulse.html?relayer=' + encodeURIComponent(BASE), { waitUntil: 'networkidle' });
  return { p, errors };
}
async function route(r, fail) {
  if (fail) return r.fulfill({ status: 500, body: 'down' });
  const body = JSON.parse(r.request().postData());
  if (body.method === 'tx') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: txAnswer }) });
  const m = body.params.method_name, args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString());
  const v = typeof results[m] === 'function' ? results[m](args) : results[m];
  if (v === undefined) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { cause: { name: 'MethodNotFound' } } }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { result: [...Buffer.from(JSON.stringify(v))] } }) });
}

const browser = await chromium.launch();
const ok = await page(browser, false);
await ok.p.waitForSelector('#body:not([hidden])', { timeout: 20000 });
await ok.p.waitForFunction(() => document.querySelector('#events td') && !document.querySelector('#events td.note'), null, { timeout: 20000 });
const text = await ok.p.textContent('#body');
assert.ok(text.includes('12,345'), 'trades equal the fixture');
assert.ok(text.includes('0.12 %') && text.includes('200 silk'), 'rules in force from params and gate_price');
assert.ok(await ok.p.isVisible('#mismatch') && (await ok.p.textContent('#mismatch')).includes('1 trader wallet'), 'the mismatch warning names one wallet');
assert.ok((await ok.p.textContent('#events')).includes('trade ✓'), 'events from the chain');
assert.ok((await ok.p.textContent('#pledges')).includes('150'), 'Hall of Pledges from stall_of');
await ok.p.waitForFunction(() => /Today \(UTC\)/.test(document.querySelector('#countstate').textContent), null, { timeout: 20000 });
const counted = await ok.p.textContent('#count');
assert.ok(/4successful transactions today/.test(counted) && /3market trades today/.test(counted) && /1failed today/.test(counted), 'independent count from the indexer: ' + counted);
assert.ok(/4distinct signing accounts today/.test(counted), 'distinct signers');
assert.ok((await ok.p.textContent('#countmethods')).includes('chests.ftf-coordinator.testnet : open_chest'), 'method mix');
assert.ok(await ok.p.$('#countnote a[href="https://testnet.nearblocks.io/txns/TFAIL"]'), 'failure linked to the explorer');
assert.deepEqual(ok.errors, []);
const down = await page(browser, true);
await down.p.waitForFunction(() => /Unavailable/.test(document.querySelector('#state').textContent), null, { timeout: 30000 });
assert.ok(await down.p.isHidden('#body'), 'no numbers when the RPC fails');
await down.p.waitForFunction(() => /unavailable/.test(document.querySelector('#countstate').textContent), null, { timeout: 30000 });
assert.equal(await down.p.textContent('#counttiles'), '', 'no count when the indexer fails');
await browser.close();
console.log('pulse-check: OK (fixtures, mismatch warning, chain events, independent count, unavailable states)');
