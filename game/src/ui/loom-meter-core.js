// The Loom meter, the pure part (owner 14.11, "the town's shared hungry object"): how much silk the town fed the Gate-Loom
// today, how many are in the valley right now, who fed it last with the receipt on the explorer, and how hungry the Loom
// looks. The numbers come from the relayer's gate log (GET /api/town/gate?stats=1: every paid gate with its transaction)
// and, when the relayer cannot answer, from the town contract's own counters (pulse: gate_burned, gates_paid — the
// all-time total, never called "today"). Nothing here is invented: no answer, no number. No DOM, no network.

export const MICRO = 1_000_000;
export const EXPLORER = 'https://testnet.nearblocks.io';
/** Silk at which the Loom is half fed for the day (its glow and motes follow 1 - 2^(-silk / HALF)). */
export const HALF_FED_SILK = 400;

const silkOf = (micro) => { const n = Number(micro); return Number.isFinite(n) && n > 0 ? n / MICRO : 0; };
const TX = /^[A-Za-z0-9]{1,64}$/;

/** The explorer page of a receipt, or null for anything that is not a transaction hash. */
export const receiptHref = (tx, explorer = EXPLORER) => (typeof tx === 'string' && TX.test(tx) ? `${explorer}/txns/${tx}` : null);

/**
 * The relayer's answer (or a contract pulse) as the meter shows it, or null when there is nothing honest to show.
 * {today: {gates, silk}|null, total: {gates, silk}|null, recent: [{at, account, tx, href}], source: 'log'|'chain'}
 */
export function loomView(stats) {
  if (!stats || typeof stats !== 'object') return null;
  if (stats.gates_paid != null || stats.gate_burned != null) { // a raw pulse (the chain fallback)
    return { today: null, total: { gates: Number(stats.gates_paid) || 0, silk: silkOf(stats.gate_burned) }, recent: [], source: 'chain' };
  }
  const today = stats.today && Number.isFinite(Number(stats.today.gates)) ? { gates: Number(stats.today.gates), silk: silkOf(stats.today.burned) } : null;
  const total = stats.total && Number.isFinite(Number(stats.total.gates)) ? { gates: Number(stats.total.gates), silk: silkOf(stats.total.burned) } : null;
  if (!today && !total) return null;
  const recent = (Array.isArray(stats.recent) ? stats.recent : []).filter((r) => r && Number.isFinite(r.at) && receiptHref(r.tx))
    .map((r) => ({ at: r.at, account: typeof r.account === 'string' ? r.account : '', tx: r.tx, href: receiptHref(r.tx) })).slice(0, 5);
  return { today, total, recent, source: 'log' };
}

/** How fed the Loom is today, 0..1 (0 with no day known): half fed at HALF_FED_SILK. */
export function hunger(view) {
  const s = view && view.today ? view.today.silk : 0;
  return s > 0 ? 1 - 2 ** (-s / HALF_FED_SILK) : 0;
}

/**
 * Gates paid since the last look: by the receipts (new transactions) or, without them, by the counters. 0 on the first
 * look (nothing flares when the page opens). Pure.
 */
export function freshGates(prev, next) {
  if (!prev || !next) return 0;
  if (next.recent.length && prev.recent.length) { const seen = new Set(prev.recent.map((r) => r.tx)); return next.recent.filter((r) => !seen.has(r.tx)).length; }
  const a = (prev.today || prev.total || { gates: 0 }).gates, b = (next.today || next.total || { gates: 0 }).gates;
  return b > a ? b - a : 0;
}

/** A short silk amount: 1 234, 12.5k (whole silk under ten thousand). */
export function shortSilk(silk) {
  const n = Math.max(0, Number(silk) || 0);
  if (n >= 10_000) return (Math.round(n / 100) / 10).toLocaleString('en-US') + 'k';
  return Math.round(n).toLocaleString('en-US');
}

/** "just now" / "5 min ago" / "3 h ago" as a key and its args. */
export function agoOf(at, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  if (m < 1) return { key: 'loom.ago.now', args: {} };
  if (m < 60) return { key: 'loom.ago.min', args: { n: m } };
  return { key: 'loom.ago.h', args: { n: Math.floor(m / 60) } };
}

/** The account as a short name for a feed line: the part before the first dot, at most 16 characters. */
export const shortName = (account) => String(account || '').split('.')[0].slice(0, 16) || '?';

/**
 * The chip's parts, each on its own flag: {loom: {key, args}|null, valley: {key, args}|null}. `count` is how many share
 * the town (presence; 0 or less: offline, nothing shown).
 */
export function chipParts(view, count, { loomMeter = true, presenceChip = true } = {}) {
  let loom = null;
  if (loomMeter && view) {
    if (view.today) loom = view.today.gates > 0 ? { key: 'loom.today', args: { silk: shortSilk(view.today.silk) } } : { key: 'loom.hungry', args: {} };
    else if (view.total) loom = { key: 'loom.total', args: { silk: shortSilk(view.total.silk), n: view.total.gates } };
  }
  const valley = presenceChip && count > 0 ? { key: 'loom.valley', args: { n: count } } : null;
  return { loom, valley };
}
