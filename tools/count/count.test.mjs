// Counter test against recorded NearBlocks v3 pages (ftf-town.testnet, 2026-11-13). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchAccount, summarize, count, parseArgs, render } from './count.mjs';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const page1 = fx('page1'); const page2 = fx('page2');
const FROM = 1794566943000; const TO = 1794566960000; // ms; cuts inside page2

function fakeFetch(log) {
  return async (url) => {
    log.push(url);
    const u = new URL(url);
    const acct = u.pathname.split('/')[3];
    let body = { data: [], meta: {} };
    if (acct === 'ftf-town.testnet') body = u.searchParams.get('next') ? page2 : page1;
    if (acct === 'items.ftf-town.testnet') { // one duplicate of a town tx and one failed call
      const fail = { ...page1.data[0], transaction_hash: 'FAILED111', receiver_account_id: 'items.ftf-town.testnet',
        actions: [{ action: 'FUNCTION_CALL', method: 'mt_transfer' }], outcomes: { status: false } };
      body = { data: [page1.data[1], fail], meta: {} };
    }
    return { ok: true, status: 200, json: async () => body };
  };
}

test('walks pages until the window start and stops', async () => {
  const log = [];
  const rows = await fetchAccount('ftf-town.testnet', FROM, TO, fakeFetch(log));
  assert.equal(rows.length, 5);
  assert.equal(log.length, 2);
  assert.match(log[0], /limit=100&before_ts=1794566960000000000/);
});

test('totals by receiver, signer, method; dedup and failures', async () => {
  const r = await count({ from: FROM, to: TO, accounts: ['ftf-town.testnet', 'items.ftf-town.testnet'] }, fakeFetch([]));
  assert.equal(r.total, 6);
  assert.equal(r.ok, 5);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.byReceiver['ftf-town.testnet'], { ok: 5, failed: 0 });
  assert.deepEqual(r.byMethod['ftf-town.testnet:trade'], { ok: 5, failed: 0 });
  assert.equal(r.failures[0].url, 'https://testnet.nearblocks.io/txns/FAILED111');
  assert.equal(r.distinctSigners, 5);
  assert.match(render(r), /Transactions: 6 \(successful 5, failed 1\)/);
});

test('retries a 429 then succeeds', async () => {
  let n = 0;
  const f = async () => (n++ === 0 ? { ok: false, status: 429 } : { ok: true, json: async () => ({ data: [], meta: {} }) });
  assert.deepEqual(await fetchAccount('x.testnet', FROM, TO, f), []);
  assert.equal(n, 2);
});

test('windows: UTC day, hours', () => {
  const d = parseArgs(['--day', '2026-11-13']);
  assert.equal(d.to - d.from, 86400e3);
  assert.equal(new Date(d.from).toISOString(), '2026-11-13T00:00:00.000Z');
  assert.equal(parseArgs(['--hours', '24'], 1e12).from, 1e12 - 86400e3);
  assert.equal(summarize([], 0, 1).total, 0);
});

test('proof doc and runway rows from a summary', async () => {
  const { proofMarkdown } = await import('./proof.mjs');
  const { runwayRows, runwayMarkdown } = await import('./runway.mjs');
  const r = await count({ from: FROM, to: TO, accounts: ['ftf-town.testnet', 'items.ftf-town.testnet'] }, fakeFetch([]));
  const md = proofMarkdown(r, { now: TO + 1, runwayMd: 'RUNWAY' });
  assert.match(md, /Final count/); assert.match(md, /\| Successful transactions \| \*\*5\*\* \|/); assert.match(md, /FAILED111/); assert.match(md, /How to verify/); assert.match(md, /RUNWAY/);
  assert.match(proofMarkdown(r, { now: FROM + 5000 }), /Partial/);
  assert.ok(Number(BigInt(r.feeBySigner['trader-20.ftf-town.testnet'])) > 0);
  const rows = runwayRows({ 'trader-20.ftf-town.testnet': { amount: 10n ** 24n, storage: 0n } }, r, 3600e3);
  const t20 = rows.find((x) => x.account === 'trader-20.ftf-town.testnet');
  assert.ok(t20.daysLeft > 0 && t20.daysLeft < Infinity);
  assert.equal(rows.find((x) => x.account === 'ftf-town.testnet').liquid, null);
  assert.match(runwayMarkdown(rows, 3600e3), /unavailable/);
});
