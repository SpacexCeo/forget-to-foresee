// The town economy's integer rules (docs/town-economy.md), the JS twin of contracts/town/src/rules.rs. One currency,
// silk (the town's in-game currency: a testnet game resource with no value outside the game), in BigInt micro-units
// (1 silk = 1_000_000n). No Date, no Math.random: the same inputs give the same outputs as the contract, checked both
// ways through contracts/town/tests/vectors.json (tools/town/vectors.mjs writes it from this file).

export const BPS = 10_000n;
export const UNIT = 1_000_000n;
export const INDEX_SCALE = 10n ** 18n;
export const WORKS = Object.freeze(['loom', 'caravan', 'archive', 'observatory']);

/** The contract's default parameters (rules.rs Params::default). */
export const DEFAULT_PARAMS = Object.freeze({
  epoch_secs: 86_400, trade_fee_bps: 12, min_trade: UNIT / 2n, station_tax_bps: 1_200,
  tithe_stakers_bps: 6_500, tithe_purse_bps: 1_000, tithe_reserve_bps: 1_000, tithe_burn_bps: 1_500,
  rate_ceiling_bps: 40, lock_days: [0, 5, 10, 20], lock_mult_bps: [10_000, 11_500, 13_000, 15_000], works_bps: [3_500, 2_500, 2_500, 1_500],
  cooldown_days: 2, early_exit_bps: 1_000, deed_fee: UNIT / 2n, cap_total: 8_000n * UNIT, cap_floor: 800n * UNIT, cap_share_bps: 500,
  cap_asset: 3_000n * UNIT, credit_day_cap: 4_000n * UNIT,
  entry_fee: 40n * UNIT, entry_burn_bps: 2_000, entry_works_bps: 1_500,
  season_mint_cap: 12_000n * UNIT, mint_floor: 1_000n * UNIT, mint_burn_match_bps: 8_000, mint_per_entrant: 24n * UNIT, payout_cap_bps: 400,
});
const b = (v) => BigInt(v);
const min = (x, y) => (x < y ? x : y), max = (x, y) => (x > y ? x : y);

export const tradeFee = (p, silk) => (b(silk) * b(p.trade_fee_bps)) / BPS;
export const stakeCap = (p, tvl) => min(b(p.cap_total), max(b(p.cap_floor), (b(tvl) * b(p.cap_share_bps)) / BPS));
/** The swept treasury silk: stakers / purse / reserve / burn (the rounding remainder is burned). */
export function splitSweep(p, silk) {
  silk = b(silk);
  const stakers = (silk * b(p.tithe_stakers_bps)) / BPS, purse = (silk * b(p.tithe_purse_bps)) / BPS, reserve = (silk * b(p.tithe_reserve_bps)) / BPS;
  return { stakers, purse, reserve, burn: silk - stakers - purse - reserve };
}
/** A tournament entry fee: burned / to the Shell Observatory's stakers / to the purse (the remainder). */
export function splitEntry(p, fee) {
  fee = b(fee);
  const burn = (fee * b(p.entry_burn_bps)) / BPS, works = (fee * b(p.entry_works_bps)) / BPS;
  return { burn, works, purse: fee - burn - works };
}
/** The silk a season may mint for its purse: min(cap, floor + match·burned last season, per-entrant·entrants). */
export const seasonMintCap = (p, burnPrev, entrants) => min(min(b(p.season_mint_cap), b(p.mint_floor) + (b(burnPrev) * b(p.mint_burn_match_bps)) / BPS), b(p.mint_per_entrant) * b(entrants));
/** The stake pot over works with weight plus each works' extra stream, capped at rate_ceiling·weight; the excess overflows. */
export function planDistribution(p, pot, weights, extras = [0n, 0n, 0n, 0n]) {
  pot = b(pot); const w = weights.map(b), x = extras.map(b);
  const total = [0, 1, 2, 3].filter((a) => w[a] > 0n).reduce((s, a) => s + b(p.works_bps[a]), 0n);
  const pots = [0n, 0n, 0n, 0n]; let overflow = 0n;
  for (let a = 0; a < 4; a++) {
    if (w[a] === 0n) { overflow += x[a]; continue; }
    const share = (pot * b(p.works_bps[a])) / total + x[a], ceiling = (w[a] * b(p.rate_ceiling_bps)) / BPS;
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
