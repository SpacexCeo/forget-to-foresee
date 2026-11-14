// Small goals and "your share" for the town economy windows (owner 14.11: "make DeFi so it's interesting to take part
// everywhere"). Pure, no imports: the Town works window, the stall window and the market read it; boot starts the one
// listener that counts trades. Goals live in this browser only (they reward taking part, they pay nothing).
// Words: pledge, reward share, rate (variable, can be zero); never invest/APY/profit/returns.
//
// Goals: the first trade (a market or stall buy or sell that went through), the first pledge, and the week's pledge
// streak: pledges on 3 different days within the last 7 (UTC days). A claim of a reward share counts as taking part
// but not toward the streak.

export const GOALS_KEY = 'ftf.town.goals.v1';
export const STREAK_DAYS = 3;
export const WEEK = 7;
const DAY_MS = 86_400_000;
const KINDS = Object.freeze(['trade', 'pledge', 'claim']);

const dayOf = (ms) => Math.floor(ms / DAY_MS);

/** The stored goal state, always well-formed: {trade: n, pledge: n, claim: n, pledgeDays: [utcDay, ...] (newest last, at most 14)}. */
export function loadGoals(storage) {
  const empty = { trade: 0, pledge: 0, claim: 0, pledgeDays: [] };
  try {
    const j = JSON.parse((storage && storage.getItem(GOALS_KEY)) || 'null');
    if (!j || typeof j !== 'object') return empty;
    const n = (v) => (Number.isInteger(v) && v >= 0 && v < 1e6 ? v : 0);
    const days = Array.isArray(j.pledgeDays) ? [...new Set(j.pledgeDays.filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => a - b).slice(-14) : [];
    return { trade: n(j.trade), pledge: n(j.pledge), claim: n(j.claim), pledgeDays: days };
  } catch { return empty; }
}

/** Counts one finished move ('trade' | 'pledge' | 'claim'); returns the new state, or null for an unknown kind. */
export function recordGoal(storage, kind, now = Date.now()) {
  if (!KINDS.includes(kind)) return null;
  const g = loadGoals(storage);
  g[kind] += 1;
  if (kind === 'pledge') { const d = dayOf(now); if (!g.pledgeDays.includes(d)) g.pledgeDays = [...g.pledgeDays, d].slice(-14); }
  try { if (storage) storage.setItem(GOALS_KEY, JSON.stringify(g)); } catch { /* memory only */ }
  return g;
}

/** The goals strip: [{id, done, n, of}] in the order shown. */
export function goalsView(g, now = Date.now()) {
  const today = dayOf(now);
  const week = g.pledgeDays.filter((d) => today - d < WEEK).length;
  return [
    { id: 'first_trade', done: g.trade > 0, n: Math.min(g.trade, 1), of: 1 },
    { id: 'first_pledge', done: g.pledge > 0, n: Math.min(g.pledge, 1), of: 1 },
    { id: 'streak', done: week >= STREAK_DAYS, n: Math.min(week, STREAK_DAYS), of: STREAK_DAYS },
  ];
}

const big = (v) => { try { return BigInt(String(v || '0')); } catch { return 0n; } };

/**
 * The player's part of each works pool and the day's estimate, from the relayer read (net/town-act.js readMe):
 * {works: [{id, mine, pool, pct}], claimable, perDay, any}. Amounts are micro-silk strings; pct has one decimal.
 * perDay is mine × (silk per 100 over the last 7 days) / 100 / 7, summed over the works: an estimate at the last week's
 * rate, which is variable and can be zero.
 */
export function shareView(me) {
  if (!me || !Array.isArray(me.works)) return { works: [], claimable: '0', perDay: '0', any: false };
  let claimable = 0n, perDay7 = 0n;
  const works = me.works.map((w, i) => {
    let mine = 0n;
    for (const d of me.deeds || []) if (d.asset === i && d.state === 'active') mine += big(d.principal);
    const pool = big(w.principal);
    const pct = pool > 0n ? Number((mine * 1000n) / pool) / 10 : 0;
    perDay7 += (mine * big(w.rate)) / 100_000_000n; // rate: micro-silk per 100 whole silk over 7 days
    return { id: w.id, mine: mine.toString(), pool: pool.toString(), pct: Math.min(100, pct) };
  });
  for (const d of me.deeds || []) claimable += big(d.claimable);
  return { works, claimable: claimable.toString(), perDay: (perDay7 / 7n).toString(), any: works.some((w) => w.mine !== '0') };
}

/** Counts trades announced by the market and the stalls (the `ftf:feat` event, k = 'trade'); returns the stop function. */
export function watchTradeGoals({ storage, win = globalThis, now = () => Date.now() } = {}) {
  if (!win || !win.addEventListener) return () => {};
  const on = (e) => { const d = e && e.detail; if (d && d.k === 'trade') recordGoal(storage, 'trade', now()); };
  win.addEventListener('ftf:feat', on);
  return () => win.removeEventListener('ftf:feat', on);
}
