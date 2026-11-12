#!/usr/bin/env node
// A daily model of the one-currency (silk) town economy, for the numbers in docs/town-economy.md: the 20 scripted
// traders' real policy (relayer/lib/town-traders.js) on the real schedule, the contract's integer rules
// (game/src/game/town-rules.js) for fees, sweep, entries, distribution and the mint ceiling. Deterministic (seeded).
//   node tools/town/sim.mjs [days=30] [players=200]
import { TOWN_POLICY, TOWN_TARGET, townFee } from '../../relayer/lib/town-traders.js';
import { TRADERS } from '../../relayer/market/catalog.js';
import { DEFAULT_PARAMS as P, splitSweep, splitEntry, planDistribution, seasonMintCap, UNIT } from '../../game/src/game/town-rules.js';

const DAYS = Number(process.argv[2] || 30), PLAYERS = Number(process.argv[3] || 200);
let seed = 7; const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const N = (v) => Number(v) / 1e6;
const st = TOWN_POLICY.init(TRADERS);
// Pledges (silk): the 7 clan agents pledge 600 silk each on day 1; players pledge part of their purse winnings.
const CLAN_PLEDGE = 600, SEASON_DAYS = 5, ENTRY_SHARE = 0.075; // 7.5 % of joined players enter per day (≈15/day at 200)
let tvl = 7 * CLAN_PLEDGE, purse = 0n, reserve = 0n, burned = 0n, minted = 0n, rewardsPaid = 0n, entrantsSeason = 0, burnSeasonStart = 0n, burnPrev = 0n;
const rows = [];
for (let day = 1; day <= DAYS; day++) {
  const joined = Math.round(PLAYERS * Math.min(1, day / 10));
  // trades (the traders' policy, ~TOWN_TARGET a day, interleaved)
  let volume = 0, fees = 0, trades = 0;
  for (let i = 0; i < TOWN_TARGET; i++) { const t = TOWN_POLICY.pick(st, TRADERS[Math.floor(rand() * 20)], rand, TRADERS); if (!t) continue; TOWN_POLICY.apply(st, t); trades++; volume += t.silk; fees += townFee(t.silk); }
  const swept = BigInt(fees) - (BigInt(fees) * BigInt(P.station_tax_bps)) / 10_000n;
  const sw = splitSweep(P, swept);
  purse += sw.purse; reserve += sw.reserve; burned += sw.burn;
  // entries
  const entries = Math.round(joined * ENTRY_SHARE);
  const e = splitEntry(P, P.entry_fee);
  purse += e.purse * BigInt(entries); burned += e.burn * BigInt(entries); entrantsSeason += entries;
  // distribution over four works weighted 35/25/25/15 of TVL
  const w = [0.35, 0.25, 0.25, 0.15].map((x) => BigInt(Math.round(tvl * x * 1e6)));
  const plan = planDistribution(P, sw.stakers, w, [0n, 0n, 0n, e.works * BigInt(entries)]);
  const paid = plan.pots.reduce((a, b) => a + b, 0n);
  purse += plan.overflow; rewardsPaid += paid;
  const rate = Number(paid) / (tvl * 1e6);
  // season end: settle the purse (+ mint under the ceiling); players pledge 30 % of what they win
  let settled = 0n;
  if (day % SEASON_DAYS === 0) {
    const cap = seasonMintCap(P, burnPrev, entrantsSeason);
    settled = purse + cap; minted += cap; purse = 0n;
    tvl += N(settled) * 0.3;
    burnPrev = burned - burnSeasonStart; burnSeasonStart = burned; entrantsSeason = 0;
  }
  const stakingTx = Math.round(joined * 0.1) + 2; // pledges/claims/unbonds + sweep + distribute
  rows.push({ day, trades, mean: volume / trades / 1e6, fees: fees / 1e6, stakers: N(paid), rate, tvl, purse: N(purse), settled: N(settled), tx: trades + entries + stakingTx, entries });
}
const avg = (k, from = 1) => { const r = rows.filter((x) => x.day >= from); return r.reduce((a, x) => a + x[k], 0) / r.length; };
console.log(JSON.stringify({
  days: DAYS, players: PLAYERS,
  tx_per_day: { mean: Math.round(avg('tx')), min: Math.min(...rows.map((r) => r.tx)), trades_mean: Math.round(avg('trades')), entries_mean: +avg('entries').toFixed(1) },
  mean_trade_silk: +avg('mean').toFixed(2), fees_per_day: +avg('fees').toFixed(1),
  stakers_silk_per_day: +avg('stakers').toFixed(1),
  staker_rate_per_day: { mean: +(avg('rate') * 100).toFixed(3) + '%', after_day_10: +(avg('rate', 10) * 100).toFixed(3) + '%', annualised_equivalent_after_day_10: Math.round(avg('rate', 10) * 365 * 100) + '%' },
  tvl_silk: { start: rows[0].tvl, end: Math.round(rows[rows.length - 1].tvl) },
  purse_inflow_per_day: +(rows.reduce((a, r) => a + r.settled, 0) / DAYS).toFixed(1),
  minted_for_purses: N(minted), burned: N(burned), reserve: N(reserve), rewards_paid: N(rewardsPaid),
  trader_silk: { min: Math.round(Math.min(...Object.values(st.balances)) / 1e6), max: Math.round(Math.max(...Object.values(st.balances)) / 1e6), total: Math.round(Object.values(st.balances).reduce((a, b) => a + b, 0) / 1e6) },
}, null, 1));
