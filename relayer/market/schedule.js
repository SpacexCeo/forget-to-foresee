// When the townsfolk trade (docs/market.md). Pure math: a day curve over the town's local hour (more by day, few at
// night), normalised so the day's total stays at the target, split evenly over the traders, with exponential gaps
// (a Poisson process per trader), so trades never come in lockstep.

export const DAY_MS = 86_400_000;
export const DEFAULT_TARGET = 20_000;
/** The town's clock: Kyiv, UTC+2 in November (the curve only shapes the day; a 1 h DST shift changes nothing). */
export const TZ_OFFSET_H = 2;

/** Relative trade activity at local hour h (0-24): 0.3 deep at night, ~1.6 at midday. */
export function hourWeight(h) {
  const d = (((h - 3) % 24) + 24) % 24;
  const x = 0.5 - 0.5 * Math.cos((2 * Math.PI * d) / 24); // 0 at 03:00, 1 at 15:00
  return 0.3 + 1.4 * Math.pow(x, 1.4);
}

/** The mean of hourWeight over a day (computed once on a fine grid), so the curve integrates to exactly 1 day. */
export const MEAN_WEIGHT = (() => { let s = 0; const n = 24 * 60; for (let i = 0; i < n; i++) s += hourWeight((i + 0.5) / 60); return s / n; })();

export const localHour = (ms, tz = TZ_OFFSET_H) => ((((ms / 3_600_000) + tz) % 24) + 24) % 24;

/** Trades per second for the whole town at time `ms`, for `target` trades a day. */
export const townRate = (ms, target = DEFAULT_TARGET) => (target / 86_400) * (hourWeight(localHour(ms)) / MEAN_WEIGHT);

/** The gap (ms) until a trader's next trade, for `traders` traders, drawn from `rand()` in [0,1). */
export function nextGapMs(ms, rand, { target = DEFAULT_TARGET, traders = 20, minMs = 2_000, maxMs = 30 * 60_000 } = {}) {
  const rate = townRate(ms, target) / traders; // trades per second for this trader
  const gap = (-Math.log(1 - rand()) / rate) * 1000;
  return Math.max(minMs, Math.min(maxMs, gap));
}

/** UTC day number of `ms` (the contract's `day`). */
export const utcDay = (ms) => Math.floor(ms / DAY_MS);

/** A token bucket for a global send cap: take() -> true when a send may go now. */
export function createRateCap({ perMinute = 60, now = () => Date.now() } = {}) {
  let tokens = perMinute, at = now();
  return {
    take() {
      const t = now(); tokens = Math.min(perMinute, tokens + ((t - at) / 60_000) * perMinute); at = t;
      if (tokens >= 1) { tokens -= 1; return true; }
      return false;
    },
  };
}
