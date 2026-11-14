#!/usr/bin/env node
// Independent transaction counter for the Forget to Foresee testnet contracts. No keys, read only.
// It walks the public NearBlocks v3 indexer (cursor pages of 100, newest first) for each watched account, keeps the
// transactions inside the window, de-duplicates them by hash and prints totals by receiver, signer and method, plus
// the failed ones. Usage:
//   node tools/count/count.mjs                       # the current UTC day
//   node tools/count/count.mjs --day 2026-11-13      # one UTC day
//   node tools/count/count.mjs --from 2026-11-13T00:00Z --to 2026-11-14T00:00Z
//   node tools/count/count.mjs --hours 24 --json     # the last 24 hours, machine-readable
// Spot-check any hash on https://testnet.nearblocks.io/txns/<hash> or with the RPC `tx` method.
import { pathToFileURL } from 'node:url';

export const INDEXER = 'https://api-testnet.nearblocks.io/v3';
export const EXPLORER = 'https://testnet.nearblocks.io';

// Contracts whose incoming and outgoing transactions are counted. Traders and clans (sub-accounts of ftf-town) are
// signers of transactions to ftf-town, so they are covered by its list and appear in the by-signer totals.
export const ACCOUNTS = [
  'ftf-town.testnet',
  'items.ftf-town.testnet',
  'gate.ftf-town.testnet',
  'heroine.ftf-coordinator.testnet',
  'companions.ftf-coordinator.testnet',
  'guests.ftf-coordinator.testnet',
  'agents.ftf-coordinator.testnet',
  'ledger.ftf-coordinator.testnet',
  'chests.ftf-coordinator.testnet',
  'skins.ftf-coordinator.testnet',
];

const ns = (ms) => BigInt(ms) * 1000000n;

export function parseArgs(argv, now = Date.now()) {
  const o = { json: false, accounts: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--day' || a === '--window') o.day = argv[++i];
    else if (a === '--write') o.write = true;
    else if (a === '--from') o.from = argv[++i];
    else if (a === '--to') o.to = argv[++i];
    else if (a === '--hours') o.hours = Number(argv[++i]);
    else if (a === '--accounts') o.accounts = argv[++i].split(',').filter(Boolean);
    else throw new Error(`unknown argument ${a}`);
  }
  let from, to;
  if (o.hours) { to = now; from = now - o.hours * 3600e3; }
  else if (o.from) { from = Date.parse(o.from); to = o.to ? Date.parse(o.to) : now; }
  else {
    const d = o.day || new Date(now).toISOString().slice(0, 10);
    from = Date.parse(`${d}T00:00:00Z`); to = from + 86400e3;
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('bad window');
  return { ...o, from, to, accounts: o.accounts || ACCOUNTS };
}

async function getJson(fetchFn, url, tries = 12) {
  for (let i = 0; ; i++) {
    let res;
    try { res = await fetchFn(url); } catch (e) { if (i >= tries) throw e; }
    if (res && res.ok) return res.json();
    if (i >= tries) throw new Error(`HTTP ${res ? res.status : 'error'} for ${url}`);
    await new Promise((r) => setTimeout(r, Math.min(60000, 1000 * 2 ** i))); // 429 or a hiccup: back off (NearBlocks rate-limits a full day for minutes)
  }
}

// All transactions of one account inside [from, to), newest first.
export async function fetchAccount(account, from, to, fetchFn = fetch) {
  const out = [];
  let next = null;
  const lo = ns(from);
  for (let page = 0; page < 100000; page++) {
    const q = new URLSearchParams({ limit: '100', before_ts: String(ns(to)) });
    if (next) q.set('next', next);
    const body = await getJson(fetchFn, `${INDEXER}/accounts/${account}/txns?${q}`);
    const rows = body.data || [];
    let older = false;
    for (const t of rows) {
      const ts = BigInt(t.block_timestamp);
      if (ts < lo) { older = true; continue; }
      if (ts < ns(to)) out.push(t);
    }
    next = body.meta && body.meta.next_page;
    if (older || !next || rows.length === 0) break;
  }
  return out;
}

const bump = (m, k, ok) => { const e = m[k] || (m[k] = { ok: 0, failed: 0 }); ok ? e.ok++ : e.failed++; };

export function summarize(txs, from, to) {
  const seen = new Map();
  for (const t of txs) seen.set(t.transaction_hash, t);
  const r = { window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, total: 0, ok: 0, failed: 0,
    byReceiver: {}, bySigner: {}, byMethod: {}, failures: [], feeBySigner: {}, explorer: EXPLORER };
  for (const t of seen.values()) {
    const ok = !!(t.outcomes && t.outcomes.status);
    r.total++; ok ? r.ok++ : r.failed++;
    bump(r.byReceiver, t.receiver_account_id, ok);
    bump(r.bySigner, t.signer_account_id, ok);
    const methods = (t.actions || []).map((a) => a.method || a.action);
    bump(r.byMethod, `${t.receiver_account_id}:${methods.join('+') || '?'}`, ok);
    const fee = BigInt((t.outcomes_agg && t.outcomes_agg.transaction_fee) || 0);
    r.feeBySigner[t.signer_account_id] = String(BigInt(r.feeBySigner[t.signer_account_id] || 0) + fee);
    if (!ok) r.failures.push({ hash: t.transaction_hash, signer: t.signer_account_id, receiver: t.receiver_account_id,
      method: methods.join('+'), url: `${EXPLORER}/txns/${t.transaction_hash}` });
  }
  r.distinctSigners = Object.keys(r.bySigner).length;
  return r;
}

export async function count(opts, fetchFn = fetch) {
  const all = [];
  for (const a of opts.accounts) all.push(...await fetchAccount(a, opts.from, opts.to, fetchFn));
  return summarize(all, opts.from, opts.to);
}

function table(title, m) {
  const rows = Object.entries(m).sort((a, b) => (b[1].ok + b[1].failed) - (a[1].ok + a[1].failed));
  const lines = [`\n${title}`];
  for (const [k, v] of rows) lines.push(`  ${String(v.ok).padStart(7)} ok ${String(v.failed).padStart(5)} failed  ${k}`);
  return lines.join('\n');
}

export function render(r) {
  return [
    `Window (UTC): ${r.window.from} .. ${r.window.to}`,
    `Transactions: ${r.total} (successful ${r.ok}, failed ${r.failed}), distinct signers ${r.distinctSigners}`,
    table('By receiver', r.byReceiver), table('By method', r.byMethod), table('By signer', r.bySigner),
    `\nFailures (${r.failures.length}):`, ...r.failures.slice(0, 50).map((f) => `  ${f.url}  ${f.signer} -> ${f.receiver} ${f.method}`),
    `\nSource: ${INDEXER} (public NearBlocks indexer). Check any hash at ${EXPLORER}/txns/<hash>.`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  count(opts).then(async (r) => {
    if (opts.write) {
      const { writeProof } = await import('./proof.mjs');
      console.log(`wrote ${await writeProof(r, opts)}`);
    } else console.log(opts.json ? JSON.stringify(r, null, 2) : render(r));
  })
    .catch((e) => { console.error(`count failed: ${e.message}`); process.exit(1); });
}
