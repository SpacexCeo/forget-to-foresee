/** Monte Carlo harness: drives the headless engine with scripted Iris strategies over many seeds.
 *
 *   node scripts/sim/run.mjs [--quick] [--seasons N] [--seed0 N] [--strategies a,b] [--rules v2] [--out docs/math] [--no-findings]
 *
 * --quick runs 300 seasons per strategy (about 10 s). The default is 10000 seasons per strategy.
 * Every number is reproducible from (rules, seed0, seasons): the engine RNG is seeded, the strategy
 * RNG is seeded, and the v2 salt bytes are seeded (they never influence gameplay anyway).
 * Prints Markdown tables; with --out writes sim-tables.md and sim-results.json into that folder.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSeason } from './lib/season.mjs';
import { STRATEGIES, FACTORIAL } from './lib/strategies.mjs';
import { mean, sd, ci95, quantile, gini, share, count, f1, f2, f3, pct, table } from './lib/metrics.mjs';
import { runFindings } from './findings.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const quick = flag('--quick');
const N = +opt('--seasons', quick ? 300 : 10000);
const seed0 = +opt('--seed0', 1);
const rules = opt('--rules', 'v2');
const names = opt('--strategies', '') ? opt('--strategies', '').split(',') : Object.keys(STRATEGIES);
const outDir = opt('--out', null);
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const t0 = Date.now();
const runs = {};
for (const name of names) {
  const s = STRATEGIES[name]; if (!s) throw new Error('unknown strategy ' + name);
  const t1 = Date.now(), recs = [];
  for (let k = 0; k < N; k++) recs.push(runSeason(seed0 + k, s, { rules }));
  runs[name] = { recs, ms: Date.now() - t1 };
}
const totalMs = Date.now() - t0;

/* ---------- aggregation ---------- */
const passiveFinal = runs.passive ? Object.fromEntries(runs.passive.recs.map((r) => [r.seed, r.final.silk[0]])) : null;
const sumBy = (recs, f) => recs.reduce((a, r) => a + f(r), 0);
const ratio = (recs, num, den) => { const d = sumBy(recs, den); return d ? sumBy(recs, num) / d : NaN; };

function summarize(name) {
  const { recs, ms } = runs[name];
  const silk = recs.map((r) => r.final.silk[0]);
  const net = passiveFinal ? recs.map((r) => r.final.silk[0] - passiveFinal[r.seed]) : null;
  const outcomes = count(recs, (r) => r.final.outcome);
  const voted = recs.filter((r) => r.final.votes != null);
  const maxTick = Math.max(...recs.map((r) => r.H.length));
  const Hmean = Array.from({ length: maxTick }, (_, i) => mean(recs.filter((r) => r.H.length > i).map((r) => r.H[i])));
  const rej = sumBy(recs, (r) => r.rejected.length), other = sumBy(recs, (r) => Math.abs(r.in.other));
  return {
    name, n: recs.length, ms, dims: STRATEGIES[name].dims, cheats: !!STRATEGIES[name].cheats,
    silk: { mean: mean(silk), sd: sd(silk), ci95: ci95(silk), p10: quantile(silk, .1), p50: quantile(silk, .5), p90: quantile(silk, .9) },
    net: net ? { mean: mean(net), ci95: ci95(net), pWin: share(net, (x) => x > 0) } : null,
    valueIn: mean(recs.map((r) => r.totals.out)), valueBack: mean(recs.map((r) => r.totals.in)),
    outMean: Object.fromEntries(Object.keys(recs[0].out).map((k) => [k, mean(recs.map((r) => r.out[k]))])),
    inMean: Object.fromEntries(Object.keys(recs[0].in).map((k) => [k, mean(recs.map((r) => r.in[k]))])),
    rtp: ratio(recs, (r) => r.totals.in, (r) => r.totals.out),
    rtpAnchors: ratio(recs, (r) => r.in.stakeBack + r.in.giftShare, (r) => r.out.anchor),
    rtpLoans: ratio(recs, (r) => r.in.repay + (r.shardSaleByKind.debt || 0), (r) => r.out.loans),
    anchorHit: ratio(recs, (r) => r.anchors.gift, (r) => r.anchors.resolved),
    prize: mean(recs.map((r) => r.in.prize)), finale: mean(recs.map((r) => r.in.finale)), giftShare: mean(recs.map((r) => r.in.giftShare)),
    shardSale: mean(recs.map((r) => r.in.shardSale)), visions: mean(recs.map((r) => r.visions)),
    outcomes: Object.fromEntries(Object.entries(outcomes).map(([k, v]) => [k, v / recs.length])),
    gone: share(recs, (r) => r.final.outcome === 'gone'),
    goneTick: mean(recs.filter((r) => r.final.outcome === 'gone').map((r) => r.final.tick)),
    Hmean, Hmax: mean(recs.map((r) => Math.max(...r.H))), Hend: mean(recs.map((r) => r.final.H)),
    tie: voted.length ? share(voted, (r) => r.final.tie) : NaN, accepted: voted.length ? share(voted, (r) => r.final.votes >= 4) : NaN,
    keySpoken: share(recs, (r) => r.final.keySpoken), keyIn: share(recs, (r) => r.final.keyIn), ashIn: share(recs, (r) => r.final.ashFrag === 'scroll'),
    ashIsolatedEnd: share(recs, (r) => r.final.ashIsolated), scroll: mean(recs.map((r) => r.final.scroll)), irisBrokenEnd: mean(recs.map((r) => r.final.irisBroken)),
    gini: mean(recs.map((r) => gini(r.final.silk))), giniNoWeapon: mean(recs.filter((r) => r.final.outcome !== 'weapon').map((r) => gini(r.final.silk))),
    clanSilk: [0, 1, 2, 3, 4, 5].map((i) => mean(recs.map((r) => r.final.silk[i]))),
    pool: ['giftEvents', 'claimedEvents', 'pot', 'paid', 'unclaimed', 'driftEvents', 'drift', 'minted', 'burned', 'stormBurned'].reduce((o, k) => ({ ...o, [k]: sumBy(recs, (r) => r.pool[k]) }), {}),
    shards: Object.keys(recs[0].shards).reduce((o, k) => ({ ...o, [k]: sumBy(recs, (r) => r.shards[k]) }), {}),
    claims: Object.keys(recs[0].claims).reduce((o, k) => ({ ...o, [k]: sumBy(recs, (r) => r.claims[k]) }), {}),
    crisis: { Hjump: mean(recs.filter((r) => r.crisis).map((r) => r.crisis.Hafter - r.crisis.Hbefore)), edges: mean(recs.filter((r) => r.crisis).map((r) => r.crisis.edgesBroken)), reached: share(recs, (r) => !!r.crisis) },
    rejected: rej, residual: other,
  };
}
const summaries = names.map(summarize);
const byName = Object.fromEntries(summaries.map((s) => [s.name, s]));

/* ---------- tables ---------- */
const out = [];
const P = (s = '') => out.push(s);
P(`# Simulation output (generated)`);
P();
P(`Rules \`${rules}\`, seeds ${seed0}..${seed0 + N - 1} (${N} seasons per strategy, ${names.length} strategies, ${(totalMs / 1000).toFixed(1)} s total, ${(totalMs / (N * names.length)).toFixed(2)} ms per season). Rejected intents: ${summaries.reduce((a, s) => a + s.rejected, 0)}; unexplained silk residual: ${summaries.reduce((a, s) => a + s.residual, 0)}.`);
P();
P(`## Iris: return per strategy`);
P();
P(`Final silk = Iris's silk after the finale. Net = final silk minus the \`passive\` strategy on the same seed (paired). Value in = silk Iris spent on actions; value back = silk that came back from them (stakes, gift shares, repayments, shard sales, own prize, finale bonus). RTP = value back / value in (ratio of totals). Anchors RTP = (stakes returned + gift shares) / stakes placed. Loans RTP = (repayments + debt-shard sales) / silk lent.`);
P();
P(table(['strategy', 'final silk (mean ± 95% CI)', 'sd', 'p10 / p50 / p90', 'net vs passive', 'P(net>0)', 'value in', 'value back', 'RTP', 'anchors RTP', 'hit %', 'loans RTP', 'prize', 'finale'],
  summaries.map((s) => [s.name + (s.cheats ? ' (cheats)' : ''), `${f1(s.silk.mean)} ± ${f1(s.silk.ci95)}`, f1(s.silk.sd), `${f1(s.silk.p10)} / ${f1(s.silk.p50)} / ${f1(s.silk.p90)}`, s.net ? `${s.net.mean >= 0 ? '+' : ''}${f1(s.net.mean)} ± ${f1(s.net.ci95)}` : 'n/a', s.net ? pct(s.net.pWin) : 'n/a', f1(s.valueIn), f1(s.valueBack), f2(s.rtp), f2(s.rtpAnchors), pct(s.anchorHit), f2(s.rtpLoans), f1(s.prize), f1(s.finale)])));
P();
P(`## Where Iris's silk goes (mean per season)`);
P();
P(table(['strategy', 'anchors', 'asks', 'words', 'loans', 'escrow', 'bids', 'mend', 'mediate', '→ stakes back', 'gift shares', 'repayments', 'shard sales', 'own prize', 'finale', 'visions'],
  summaries.map((s) => [s.name, ...['anchor', 'ask', 'words', 'loans', 'escrow', 'bids', 'mend', 'mediate'].map((k) => f1(s.outMean[k])), ...['stakeBack', 'giftShare', 'repay', 'shardSale', 'prize', 'finale'].map((k) => f1(s.inMean[k])), f2(s.visions)])));
P();
P(`## Finale distribution, ties, crisis`);
P();
P(table(['strategy', 'gift', 'lost', 'survived', 'weapon', 'gone', 'gone tick', 'accepted', 'tie 3:3', 'key in Scroll', 'Key spoken', 'Ash contributes', 'Ash isolated at end', 'scroll size', 'Iris links broken at end'],
  summaries.map((s) => [s.name, pct(s.outcomes.gift || 0), pct(s.outcomes.lost || 0), pct(s.outcomes.survived || 0), pct(s.outcomes.weapon || 0), pct(s.gone), f1(s.goneTick), pct(s.accepted), pct(s.tie), pct(s.keyIn), pct(s.keySpoken), pct(s.ashIn), pct(s.ashIsolatedEnd), f2(s.scroll), f2(s.irisBrokenEnd)])));
P();
P(`## Tension (mean H after each tick; H starts at 10, 100 = the Shells leave)`);
P();
const ticks = Array.from({ length: Math.max(...summaries.map((s) => s.Hmean.length)) }, (_, i) => i);
P(table(['strategy', ...ticks.map((t) => (t === 0 ? 'start' : `t${t}`)), 'max', 'P(gone)', 'crisis jump', 'edges cut at 13'],
  summaries.map((s) => [s.name, ...ticks.map((t) => f1(s.Hmean[t])), f1(s.Hmax), pct(s.gone), f1(s.crisis.Hjump), f2(s.crisis.edges)])));
P();
P(`## Inequality: final silk per clan and Gini`);
P();
P(table(['strategy', 'Iris', 'Salt', 'Ash', 'Moss', 'Amber', 'Frost', 'Gini (all)', 'Gini (excl. weapon)'],
  summaries.map((s) => [s.name, ...s.clanSilk.map(f1), f3(s.gini), f3(s.giniNoWeapon)])));
P();
P(`## Gift pool conservation (all clans, all resolved Gift events)`);
P();
P(table(['strategy', 'Gift events', 'claimed', 'pot of claimed events', 'paid out', 'paid − pot', 'events with drift', 'minted by rounding', 'lost to rounding', 'unclaimed pot (no anchor on the right Shell)', 'stakes burned by Storm'],
  summaries.map((s) => [s.name, s.pool.giftEvents, s.pool.claimedEvents, s.pool.pot - s.pool.unclaimed, s.pool.paid, s.pool.drift, `${s.pool.driftEvents} (${pct(s.pool.claimedEvents ? s.pool.driftEvents / s.pool.claimedEvents : NaN)})`, s.pool.minted, s.pool.burned, s.pool.unclaimed, s.pool.stormBurned])));
P();
P(`## Shard auctions and debt claims`);
P();
P(table(['strategy', 'shards closed', 'burned: no bids', 'burned: top bid unfunded', 'of which a funded bidder existed', 'lost sale silk', 'Iris unfunded', 'tie at top', 'sold by Iris', 'bought by Iris', 'debt claims transferred', 'dead (overdue) claims', 'silk paid for dead claims', 'debt cancelled by debtor'],
  summaries.map((s) => [s.name, s.shards.closed, s.shards.burnedNoBids, s.shards.burnedUnfunded, s.shards.burnedWithFundedBidder, s.shards.lostSale, s.shards.irisUnfunded, s.shards.tieTop, s.shards.soldByIris, s.shards.boughtByIris, s.claims.transferred, s.claims.dead, s.claims.deadSilk, s.claims.cancelledByDebtor])));
P();

/* ---------- best-response table over the factorial design ---------- */
const fact = FACTORIAL.filter((s) => byName[s.name]);
if (fact.length === 12) {
  P(`## Best-response table (factorial design, mean final silk)`);
  P();
  P(`Rows: fragment decision. Columns: trust × market. Each cell is Iris's mean final silk (± 95% CI). The best fragment choice in each column is marked with *.`);
  P();
  const cols = [['honest', 'anchor'], ['honest', 'none'], ['defect', 'anchor'], ['defect', 'none']];
  const cell = (frag, trust, market) => byName[`${frag}-${trust}-${market}`];
  const rows = ['coop', 'late', 'hold'].map((frag) => [frag, ...cols.map(([tr, mk]) => { const s = cell(frag, tr, mk); const best = Math.max(...['coop', 'late', 'hold'].map((f) => cell(f, tr, mk).silk.mean)); return `${f1(s.silk.mean)} ± ${f1(s.silk.ci95)}${s.silk.mean === best ? ' *' : ''}`; })]);
  P(table(['frag \\ trust-market', ...cols.map((c) => c.join('-'))], rows));
  P();
  const dom = {};
  for (const [dim, values] of [['frag', ['coop', 'late', 'hold']], ['trust', ['honest', 'defect']], ['market', ['anchor', 'none']]]) {
    const others = { frag: ['trust', 'market'], trust: ['frag', 'market'], market: ['frag', 'trust'] }[dim];
    const contexts = [];
    for (const s of fact) { const key = others.map((o) => s.dims[o]).join('-'); if (!contexts.includes(key)) contexts.push(key); }
    const winners = contexts.map((ctx) => { const [a, b] = ctx.split('-'); const d = { [others[0]]: a, [others[1]]: b }; let best = null; for (const v of values) { const s = byName[`${{ ...d, [dim]: v }.frag}-${{ ...d, [dim]: v }.trust}-${{ ...d, [dim]: v }.market}`]; if (!best || s.silk.mean > best.silk.mean) best = s; } return best.dims[dim]; });
    dom[dim] = { winners: Object.fromEntries(contexts.map((c, i) => [c, winners[i]])), dominant: new Set(winners).size === 1 ? winners[0] : null };
  }
  P(table(['dimension', 'best response per context (other two dimensions fixed)', 'dominant?'], Object.entries(dom).map(([d, v]) => [d, Object.entries(v.winners).map(([c, w]) => `${c}: **${w}**`).join('; '), v.dominant ? `yes: ${v.dominant}` : 'no'])));
  P();
}

const md = out.join('\n');
console.log(md);

let findings = null;
if (!flag('--no-findings')) findings = runFindings({ quick, seed0, rules, print: (s) => console.log(s) });

if (outDir) {
  const dir = join(ROOT, outDir); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sim-tables.md'), md + (findings ? '\n\n' + findings.md : '') + '\n');
  writeFileSync(join(dir, 'sim-results.json'), JSON.stringify({ generatedBy: 'game/scripts/sim/run.mjs', rules, seed0, seasons: N, totalMs, summaries, findings: findings ? findings.data : null }, null, 1));
  console.log(`\nWritten: ${join(outDir, 'sim-tables.md')}, ${join(outDir, 'sim-results.json')}`);
}