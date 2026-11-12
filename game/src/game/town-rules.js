// The town economy's integer rules (docs/town-economy.md), the JS twin of contracts/town/src/rules.rs. BigInt
// micro-units (1 wool = 1n_000_000n), no Date, no Math.random: the same inputs give the same outputs as the contract,
// checked both ways through contracts/town/tests/vectors.json (tools/town/vectors.mjs writes it from this file).
// Wool is a testnet game resource with no value outside the game.

export const BPS = 10_000n;
export const UNIT = 1_000_000n;
export const INDEX_SCALE = 10n ** 18n;
export const WORKS = Object.freeze(['loom', 'caravan', 'archive', 'observatory']);

/** The contract's default parameters (rules.rs Params::default). */
export const DEFAULT_PARAMS = Object.freeze({
  epoch_secs: 86_400, trade_fee_bps: 12, min_trade: UNIT / 2n, amm_fee_bps: 30, amm_fee_stakers_bps: 2_000, swap_cap_bps: 500,
  sweep_max_bps: 100, station_tax_bps: 1_200, tithe_stakers_bps: 6_500, tithe_purse_bps: 1_000, tithe_reserve_bps: 1_000, tithe_burn_bps: 1_500,
  rate_ceiling_bps: 40, lock_days: [0, 5, 10, 20], lock_mult_bps: [10_000, 11_500, 13_000, 15_000], works_bps: [3_500, 2_500, 2_500, 1_500],
  cooldown_days: 2, early_exit_bps: 1_000, deed_fee: UNIT / 4n, cap_total: 4_000n * UNIT, cap_floor: 400n * UNIT, cap_share_bps: 500,
  cap_asset: 1_500n * UNIT, wool_credit_day_cap: 2_000n * UNIT,
});
const b = (v) => BigInt(v);
const min = (x, y) => (x < y ? x : y), max = (x, y) => (x > y ? x : y);

/** Constant product, fee from the input rounded up: {out, fee, to_stakers}. */
export function swapQuote(p, x, y, amount) {
  [x, y, amount] = [b(x), b(y), b(amount)];
  const fee = (amount * b(p.amm_fee_bps) + BPS - 1n) / BPS;
  const inEff = amount > fee ? amount - fee : 0n;
  const out = x + inEff === 0n ? 0n : (y * inEff) / (x + inEff);
  return { out, fee, to_stakers: (fee * b(p.amm_fee_stakers_bps)) / BPS };
}
export const tradeFee = (p, silk) => (b(silk) * b(p.trade_fee_bps)) / BPS;
export const stakeCap = (p, tvl) => min(b(p.cap_total), max(b(p.cap_floor), (b(tvl) * b(p.cap_share_bps)) / BPS));

/** Proportional liquidity: [shares, wool, silk], amounts rounded up and never above the maxima. */
export function lpAdd(x, y, total, woolMax, silkMax) {
  [x, y, total, woolMax, silkMax] = [x, y, total, woolMax, silkMax].map(b);
  let shares = min((woolMax * total) / x, (silkMax * total) / y);
  for (;;) {
    if (shares === 0n) return [0n, 0n, 0n];
    const w = (shares * x + total - 1n) / total, s = (shares * y + total - 1n) / total;
    if (w <= woolMax && s <= silkMax) return [shares, w, s];
    shares -= 1n;
  }
}
/** The sweep's bought wool: stakers / purse / reserve / burn (the rounding remainder is burned). */
export function splitBought(p, bought) {
  bought = b(bought);
  const stakers = (bought * b(p.tithe_stakers_bps)) / BPS, purse = (bought * b(p.tithe_purse_bps)) / BPS, reserve = (bought * b(p.tithe_reserve_bps)) / BPS;
  return { stakers, purse, reserve, burn: bought - stakers - purse - reserve };
}
/** The stake pot over works with weight: renormalised base shares, capped at rate_ceiling·weight; the excess overflows. */
export function planDistribution(p, pot, weights) {
  pot = b(pot); const w = weights.map(b);
  const total = [0, 1, 2, 3].filter((a) => w[a] > 0n).reduce((s, a) => s + b(p.works_bps[a]), 0n);
  const pots = [0n, 0n, 0n, 0n]; let overflow = 0n;
  if (total === 0n) return { pots, overflow };
  for (let a = 0; a < 4; a++) {
    if (w[a] === 0n) continue;
    const share = (pot * b(p.works_bps[a])) / total, ceiling = (w[a] * b(p.rate_ceiling_bps)) / BPS;
    pots[a] = min(share, ceiling); overflow += share - pots[a];
  }
  return { pots, overflow };
}
export const pendingReward = (weight, snapshot, index) => (b(weight) * (b(index) - b(snapshot))) / INDEX_SCALE;
export const deedWeight = (p, amount, tier) => (b(amount) * b(p.lock_mult_bps[tier])) / BPS;

/** Display helpers: micro-units to a short decimal string ("2.4", "0.0024"). */
export function fmt(micro, digits = 2) {
  const v = b(micro), neg = v < 0n, a = neg ? -v : v;
  const whole = a / UNIT, frac = (a % UNIT).toString().padStart(6, '0').slice(0, digits).replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}
