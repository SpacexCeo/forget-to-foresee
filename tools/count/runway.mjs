#!/usr/bin/env node
// Gas runway for the game's testnet accounts, read only: liquid balance (balance minus storage lock) and days left
// at the current burn. Burn per account = transaction fees it signed in the sample window (from count.mjs), plus, for
// the guests and heroine contracts, the cost of each new guest (0.05 NEAR fund, ~0.032 NEAR Elise storage).
//   node tools/count/runway.mjs            # burn measured over the last hour
//   node tools/count/runway.mjs --hours 6
import { count, parseArgs } from './count.mjs';

export const RPC = 'https://test.rpc.fastnear.com';
const TOWN = 'ftf-town.testnet';
export const RUNWAY_ACCOUNTS = [TOWN, ...Array.from({ length: 20 }, (_, i) => `trader-${String(i + 1).padStart(2, '0')}.${TOWN}`),
  ...['salt', 'ash', 'moss', 'amber', 'frost', 'iris'].map((c) => `clan-${c}.${TOWN}`), 'guests.ftf-coordinator.testnet', 'heroine.ftf-coordinator.testnet'];
const YOCTO = 10n ** 24n;
const PER_GUEST = { 'guests.ftf-coordinator.testnet': 50n * 10n ** 21n, 'heroine.ftf-coordinator.testnet': 32n * 10n ** 21n };

export async function viewAccount(id, fetchFn = fetch) {
  const r = await fetchFn(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: id } }) });
  const j = await r.json();
  if (!j.result) return null;
  return { amount: BigInt(j.result.amount), storage: BigInt(j.result.storage_usage) * 10n ** 19n };
}
const near = (y) => (Number(y / 10n ** 20n) / 1e4).toFixed(4);

/** Rows {account, liquid, burnPerDay, daysLeft}; summary is a count.mjs result over windowMs. */
export function runwayRows(balances, summary, windowMs) {
  const guests = Object.entries(summary.byMethod).filter(([k]) => k.endsWith(':create_guest')).reduce((n, [, v]) => n + v.ok, 0);
  return RUNWAY_ACCOUNTS.map((account) => {
    const b = balances[account];
    if (!b) return { account, liquid: null, burnPerDay: null, daysLeft: null };
    const liquid = b.amount > b.storage ? b.amount - b.storage : 0n;
    let burn = BigInt(summary.feeBySigner[account] || 0) + (PER_GUEST[account] || 0n) * BigInt(guests);
    const perDay = (burn * 86_400_000n) / BigInt(Math.max(1, Math.round(windowMs)));
    return { account, liquid, burnPerDay: perDay, daysLeft: perDay > 0n ? Number((liquid * 100n) / perDay) / 100 : Infinity };
  });
}

export function runwayMarkdown(rows, windowMs, at = new Date()) {
  const lines = [`Read ${at.toISOString().slice(0, 16)} UTC; burn measured over the ${Math.round(windowMs / 3600e3)} h before it.`, '',
    '| Account | Liquid NEAR | Burn NEAR/day | Days left |', '| --- | ---: | ---: | ---: |'];
  for (const r of rows) {
    const link = `[${r.account}](https://testnet.nearblocks.io/address/${r.account})`;
    if (r.liquid == null) { lines.push(`| ${link} | unavailable | — | — |`); continue; }
    const warn = r.daysLeft < 2 ? ' ⚠' : '';
    lines.push(`| ${link} | ${near(r.liquid)} | ${near(r.burnPerDay)} | ${r.daysLeft === Infinity ? 'no burn' : r.daysLeft.toFixed(1) + warn} |`);
  }
  return lines.join('\n');
}

export async function runway({ hours = 1, fetchFn = fetch } = {}) {
  const opts = parseArgs(['--hours', String(hours)]);
  const summary = await count({ ...opts }, fetchFn);
  const balances = {};
  for (const a of RUNWAY_ACCOUNTS) balances[a] = await viewAccount(a, fetchFn).catch(() => null);
  return runwayMarkdown(runwayRows(balances, summary, opts.to - opts.from), opts.to - opts.from);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--hours');
  runway({ hours: i > 0 ? Number(process.argv[i + 1]) : 1 }).then(console.log).catch((e) => { console.error(`runway failed: ${e.message}`); process.exit(1); });
}
