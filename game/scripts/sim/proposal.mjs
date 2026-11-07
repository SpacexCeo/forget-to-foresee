/** v3 proposal, payoff-only counterfactual. Re-prices the fragment decision on simulated v2 seasons
 * without re-simulating behaviour (AI clans never read V or the finale bonus, so their play and the
 * vote are unchanged; only Iris's silk is re-priced). Rules are NOT changed in the engine.
 *
 *   node scripts/sim/proposal.mjs [--quick] [--seasons N] [--seed0 N]
 *
 * A: finale bonus 40/15 → 60/30 (gift / survived), own prize V 30..60 → 20..40 (V · 2/3).
 * D: the own prize is paid at the finale, and only if the message succeeded without the holder
 *    (outcome gift or survived); lost, weapon and gone pay the holder nothing.
 * A+D: both.
 */
import { runSeason } from './lib/season.mjs';
import { STRATEGIES } from './lib/strategies.mjs';
import { mean, ci95, share, f1, pct, table } from './lib/metrics.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--seasons', args.includes('--quick') ? 300 : 3000), seed0 = +opt('--seed0', 1);
const seeds = Array.from({ length: N }, (_, i) => seed0 + i);

export function proposalTable(seeds, print = console.log) {
  const coop = seeds.map((s) => runSeason(s, STRATEGIES['coop-honest-none']));
  const hold = seeds.map((s) => runSeason(s, STRATEGIES['hold-honest-none']));
  const finaleA = (r) => (r.final.outcome === 'gift' ? 60 : r.final.outcome === 'survived' ? 30 : r.final.outcome === 'weapon' ? -r.final.silk[0] : 0);
  const finaleV2 = (r) => r.in.finale;
  const prizeV2 = (r) => r.in.prize;
  const prizeA = (r) => Math.round(r.in.prize * 2 / 3);
  const success = (r) => r.final.outcome === 'gift' || r.final.outcome === 'survived';
  const variants = {
    'v2 (current)': { coop: finaleV2, hold: prizeV2 },
    'A: bonus 60/30, V·2/3': { coop: finaleA, hold: prizeA },
    'D: V only if the message succeeds': { coop: finaleV2, hold: (r) => (success(r) ? r.in.prize : 0) },
    'A+D': { coop: finaleA, hold: (r) => (success(r) ? prizeA(r) : 0) },
  };
  const rows = Object.entries(variants).map(([name, v]) => {
    const c = coop.map((r) => r.final.silk[0] - finaleV2(r) + v.coop(r));
    const h = hold.map((r) => r.final.silk[0] - prizeV2(r) + v.hold(r));
    const d = h.map((x, i) => x - c[i]);
    return [name, f1(mean(c)), f1(mean(h)), `${mean(d) >= 0 ? '+' : ''}${f1(mean(d))} ± ${f1(ci95(d))}`, pct(share(d, (x) => x > 0)), f1(mean(coop.map(v.coop))), f1(mean(hold.map(v.hold)))];
  });
  const md = table(['payoff rule', 'coop final silk', 'hold final silk', 'hold − coop (paired)', 'P(hold wins)', 'E[finale given contribute]', 'E[prize given hold]'], rows);
  print(md);
  return { md, rows };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/sim/proposal.mjs')) {
  console.log(`v3 payoff counterfactual on ${N} seeds (${seed0}..${seed0 + N - 1}), honest Iris without market play:`);
  proposalTable(seeds);
}