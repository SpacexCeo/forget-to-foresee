/** Reproductions of the six findings from the owner's commercial review, each with a minimal
 * seed + action trace and a quantification over many seeds. Nothing here changes engine rules:
 * tampering demos mutate a season state in memory exactly as a hostile client could. */
import * as E from '../../src/game/engine.js';
import { sha256 } from '../../src/game/crypto.js';
import { applyToEngine } from '../../tests/lib/engine-apply.mjs';
import { runSeason } from './lib/season.mjs';
import { STRATEGIES } from './lib/strategies.mjs';
import { makeRandomBytes } from './lib/rng.mjs';
import { mean, ci95, share, f1, f2, pct, table } from './lib/metrics.mjs';

const fresh = (seed, rules = 'v2') => E.newSeason(seed, { rules, randomBytes: makeRandomBytes(seed) });
const play = (it) => { const r = applyToEngine(it); if (!r.ok) throw new Error(`rejected ${JSON.stringify(it)}: ${r.reason}`); return r; };
const endTo = (tick) => { while (E.S.phase === 'play' && E.S.tick < tick) play({ type: 'end' }); };
const POT = [10, 20, 40, 80];

/** Same leaf formula as engine.js leafHash (not exported): what an honest verifier must recompute from the revealed fields. */
function leafFromFields(S, e, idx) {
  const body = JSON.stringify({ t: e.t, place: e.place, action: e.action, power: e.power, delay: e.delay, dots: e.dots });
  return S.rulesVersion === 'baseline-2d-1' ? sha256(body + e.salt) : sha256(`ftf:leaf:v2|${S.seasonId}|${idx}|${body}|${e.salt}`);
}

/* ---------- finding 4 helper: replay the engine's RNG for a candidate seed, no hashing ---------- */
function makeRng(seed) {
  let rs = seed;
  const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = rs; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rint = (n) => Math.floor(rnd() * n);
  const pickW = (ws) => { const s = ws.reduce((a, b) => a + b, 0); let r = rnd() * s; for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; } return ws.length - 1; };
  return { rint, pickW };
}
/** Returns the event tuples [place, action, power, delay, dots] for ticks 3..upto, or false as soon as one differs from `observed`. */
function eventStream(seed, upto, observed = null) {
  const { rint, pickW } = makeRng(seed);
  for (let k = 0; k < 4; k++) for (let i = 3; i > 0; i--) rint(i + 1); /* the four slot permutations */
  const ev = [];
  for (let T = 3; T <= upto; T++) {
    const action = T === 3 ? 0 : pickW([40, 24, 16, 20]);
    const power = T === 3 ? 1 : pickW([34, 36, 22, 8]);
    const delay = 1 + rint(Math.min(4, T - 1));
    const place = rint(4), dots = rint(4);
    if (observed) { const o = observed[T - 3]; if (o[0] !== place || o[1] !== action || o[2] !== power || o[3] !== delay || o[4] !== dots) return false; }
    for (let i = 0; i < 12; i++) rint(16); /* legacy salt draw */
    ev.push([place, action, power, delay, dots]);
  }
  return observed ? true : ev;
}

export function runFindings({ quick, seed0 = 1, rules = 'v2', print = console.log }) {
  const N = quick ? 300 : 3000;
  const seeds = Array.from({ length: N }, (_, i) => seed0 + i);
  const out = [], data = {};
  const P = (s = '') => { out.push(s); print(s); };
  const sim = (name) => seeds.map((s) => runSeason(s, STRATEGIES[name], { rules }));
  const traceOf = (seed, strat, filter) => runSeason(seed, strat, { rules, trace: true }).trace.filter(filter).map((x) => `t${x.tick} ${x.type}${x.p != null ? ` p${x.p}@${x.t}` : ''}${x.id != null ? ` #${x.id}` : ''}${x.purpose ? ` (${x.purpose})` : ''}${x.v != null ? ` ${x.v}` : ''} → silk ${x.silk}, H ${x.H}`);

  P(`# Findings reproduced (rules \`${rules}\`, seeds ${seed0}..${seed0 + N - 1})`);

  /* ---------- 1. fragment withholding pays more ---------- */
  P(); P(`## F1. Withholding the fragment pays more than contributing`);
  {
    const coop = sim('coop-honest-none'), hold = sim('hold-honest-none'), late = sim('late-honest-none');
    const d = hold.map((h, i) => h.final.silk[0] - coop[i].final.silk[0]);
    const dl = late.map((h, i) => h.final.silk[0] - coop[i].final.silk[0]);
    const V = mean(hold.map((r) => r.in.prize)), fin = mean(coop.map((r) => r.in.finale));
    const pGift = share(coop, (r) => r.final.outcome === 'gift'), pSurv = share(coop, (r) => r.final.outcome === 'survived');
    const amber = mean(coop.map((r) => r.final.silk[4])), moss = mean(coop.map((r) => r.final.silk[3])), frost = mean(coop.map((r) => r.final.silk[5]));
    data.f1 = { holdMinusCoop: mean(d), ci: ci95(d), pHoldWins: share(d, (x) => x > 0), pHoldTies: share(d, (x) => x === 0), lateMinusCoop: mean(dl), prizeMean: V, finaleMean: fin, pGift, pSurv, amber, moss, frost };
    P(`Paired on ${N} seeds, identical behaviour except the fragment decision.`);
    P(table(['measure', 'value'], [
      ['hold − coop, Iris final silk (mean ± 95% CI)', `${f1(mean(d))} ± ${f1(ci95(d))}`],
      ['P(hold > coop) / P(tie)', `${pct(share(d, (x) => x > 0))} / ${pct(share(d, (x) => x === 0))}`],
      ['late (contribute at tV−1) − coop', `${f1(mean(dl))} ± ${f1(ci95(dl))}`],
      ['mean own prize V collected by hold', f1(V)],
      ['mean finale bonus collected by coop (+40 gift, +15 survived, 0 otherwise)', f1(fin)],
      ['P(outcome gift) / P(survived) under coop', `${pct(pGift)} / ${pct(pSurv)}`],
      ['analytic: E[V] = 45 (uniform 30/40/50/60) vs E[finale given contribute] = 40·P(gift) + 15·P(survived)', `45 vs ${f1(40 * pGift + 15 * pSurv)}`],
      ['AI side (coop run): Amber (always holds, V=80) / Moss (honest) / Frost final silk', `${f1(amber)} / ${f1(moss)} / ${f1(frost)}`],
    ]));
    fresh(seed0);
    P(`Minimal trace, seed ${seed0}: coop → ${traceOf(seed0, STRATEGIES['coop-honest-none'], (x) => x.type === 'contribute' || x.type === 'vote').join('; ')}. hold → own prize ${hold[0].in.prize} at tick tV=${E.S.tV[0]}, final silk ${hold[0].final.silk[0]} vs ${coop[0].final.silk[0]}.`);
    P(`Note: tick 16 (DEADLINE) is unreachable for Iris's fragment: tV is 11..15 and always fires first, so "late contribution" means tV−1 at the latest.`);
  }

  /* ---------- 2. the gift pool is not conserved ---------- */
  P(); P(`## F2. The Gift pool is not conserved`);
  {
    const cases = new Map();
    for (const pot of POT) for (let k = 2; k <= 4; k++) {
      const rec = (ws) => { if (ws.length === k) { const W = ws.reduce((a, b) => a + b, 0); const paid = ws.reduce((a, w) => a + Math.round(pot * w / W), 0); if (paid !== pot) { const key = `${pot}:${paid - pot}`; cases.set(key, (cases.get(key) || 0) + 1); } return; } for (let w = ws.length ? ws[ws.length - 1] : 1; w <= 8; w++) rec([...ws, w]); };
      rec([]);
    }
    const recs = sim('coop-honest-anchor');
    const pool = recs.reduce((o, r) => { for (const k in r.pool) o[k] = (o[k] || 0) + r.pool[k]; return o; }, {});
    let ex = null;
    for (const seed of seeds) {
      fresh(seed); play({ type: 'start', phrase: 'f2' });
      for (let guard = 0; guard < 20 && E.S.phase === 'play' && !ex; guard++) {
        const t = E.S.tick, e = E.S.events.find((x) => x.t === t), hit = e ? E.S.anchors.filter((a) => a.t === t && a.place === e.place) : [];
        if (e && e.action === 0 && hit.length) { const W = hit.reduce((s, a) => s + (t - a.at + 1), 0), shares = hit.map((a) => Math.round(POT[e.power] * (t - a.at + 1) / W)), paid = shares.reduce((a, b) => a + b, 0); if (paid !== POT[e.power]) ex = { seed, tick: t, pot: POT[e.power], weights: hit.map((a) => t - a.at + 1), clans: hit.map((a) => a.c), shares, paid }; }
        play({ type: 'end' });
      }
      if (ex) break;
    }
    data.f2 = { pool, example: ex, roundingCases: [...cases.entries()] };
    P(`Payout per hit anchor is round(pot · w / Σw) (engine resolveEvent). Rounding each share separately means Σ shares ≠ pot. Enumerating 2–4 anchors with weights 1..8: ${[...cases.entries()].map(([k, v]) => { const [pot, d] = k.split(':'); return `pot ${pot}: ${d > 0 ? '+' : ''}${d} silk in ${v} weight patterns`; }).join('; ')}.`);
    P(`Measured over ${N} coop-honest-anchor seasons: ${pool.giftEvents} Gift events, ${pool.claimedEvents} claimed; pot total ${pool.pot}, paid ${pool.paid} (drift ${pool.drift >= 0 ? '+' : ''}${pool.drift}: ${pool.minted} minted, ${pool.burned} lost); ${pool.driftEvents} events (${pct(pool.driftEvents / pool.claimedEvents)}) paid a total different from the pot; ${pool.unclaimed} silk of pot went unclaimed (no anchor on the right Shell); ${pool.stormBurned} silk of stakes burned in Storms.`);
    if (ex) P(`Minimal example: seed ${ex.seed}, tick ${ex.tick}, pot ${ex.pot}, anchors by clans [${ex.clans}] with weights [${ex.weights}] → shares [${ex.shares}] = ${ex.paid} (${ex.paid - ex.pot >= 0 ? '+' : ''}${ex.paid - ex.pot}).`);
    P(`Beyond rounding, the pool is created from nothing at reveal time (there is no funded pot), so the Gift mechanic is a silk faucet; Storms are the only sink on anchors.`);
  }

  /* ---------- 3. proof check disconnected from resolved fields ---------- */
  P(); P(`## F3. The proof check is disconnected from the resolved event fields`);
  {
    let passed = 0, total = 0, paidWrong = 0, rootTamperContinues = 0;
    const sample = seeds.slice(0, quick ? 100 : 500);
    for (const seed of sample) {
      fresh(seed, rules); play({ type: 'start', phrase: 'f3' });
      const S = E.S, idx = 0, e = S.events[idx]; /* the tick-3 event is always a Gift of 20 */
      e.place = (e.place + 1) % 4; /* a hostile client edits the field after the commitment */
      play({ type: 'anchor', p: e.place, t: 3 });
      const silkBefore = S.silk[0];
      endTo(4);
      total++;
      if (S.proofs.find((p) => p.idx === idx).ok) passed++;
      if (S.silk[0] > silkBefore) paidWrong++;
      if (leafFromFields(S, e, idx) === e.leaf) throw new Error('recomputed leaf unexpectedly matches');
      fresh(seed, rules); play({ type: 'start', phrase: 'f3b' }); E.S.root = sha256('tampered'); endTo(5);
      if (E.S.phase === 'play' && E.S.proofs.every((p) => !p.ok)) rootTamperContinues++;
    }
    data.f3 = { sample: sample.length, tamperedPassed: passed, paidOnTamperedPlace: paidWrong, rootTamperContinues };
    P(`\`resolveEvent\` verifies \`e.leaf\` against \`S.root\` with the stored Merkle path, but then pays anchors and writes the chronicle from \`e.place / e.action / e.power\` without recomputing the leaf from those fields, and the result \`verified\` is only logged.`);
    P(table(['test over ' + sample.length + ' seeds', 'result'], [
      ['tick-3 event with place edited in memory after commitment: engine reports proof ✓', `${passed}/${total} (${pct(passed / total)})`],
      ['Iris anchored on the edited place and got paid the Gift', `${paidWrong}/${total}`],
      ['recomputing the leaf from the resolved fields would have caught it', `${total}/${total}`],
      ['root replaced by garbage: every proof ✗, yet the season continues and pays out normally', `${rootTamperContinues}/${total}`],
    ]));
    P(`Fix: at reveal, recompute \`leafHash(e, idx)\` from the fields being paid out, verify it against a root held outside the mutable state (server or chain), and halt the season (outcome \`proof_failed\`) on mismatch instead of logging ✗.`);
  }

  /* ---------- 4. the public seed reveals the future ---------- */
  P(); P(`## F4. The seed reveals the whole future`);
  {
    const seed = 123456; fresh(seed, rules);
    const truth = E.S.events.map((e) => [e.place, e.action, e.power, e.delay, e.dots]);
    if (JSON.stringify(eventStream(seed, 17)) !== JSON.stringify(truth)) throw new Error('event stream replica diverges from the engine');
    const space = quick ? 2 ** 20 : 2 ** 24;
    const counts = [];
    let rate = 0;
    for (const R of [1, 2, 3, 4, 5]) {
      const obs = truth.slice(0, R); const t0 = Date.now(); let hits = 0;
      for (let s = 0; s < space; s++) if (eventStream(s, 2 + R, obs)) hits++;
      const ms = Date.now() - t0; rate = space / ms * 1000; counts.push({ R, hits, ms });
    }
    const full = 2 ** 32 / rate;
    data.f4 = { seed, space, counts, candidatesPerSec: rate, fullSpaceSeconds: full };
    P(`The season is \`mulberry32(seed)\`; \`S.seed\` sits in the client state and in baseline the commitment is \`sha256('seed:'+seed)\` (v2 salts the commitment, but the seed is still a 32-bit integer and still in the state). Anyone holding the seed regenerates all 15 events, every clan's hidden V/tV and Ash's Key phrase: \`newSeason(seed)\` is the oracle.`);
    P(`Brute force without the seed, from revealed events only (replica of the engine RNG, no hashing), searching ${space.toLocaleString('en-US')} seeds with the true seed ${seed} inside:`);
    P(table(['revealed events R (ticks 3..)', 'seeds matching in the search space', 'time'], counts.map((c) => [c.R, c.hits, `${c.ms} ms`])));
    P(`Rate ${Math.round(rate).toLocaleString('en-US')} candidates/s single-threaded → the full 2^32 space takes about ${(full / 60).toFixed(0)} min on this machine (${(full / 3600).toFixed(1)} h); by tick 7 (5 revealed events) the seed is unique and the remaining 10 events, all prizes and the Key are known.`);
    const or = sim('oracle'), hon = sim('coop-honest-anchor');
    const dd = or.map((r, i) => r.final.silk[0] - hon[i].final.silk[0]);
    const rtp = (recs) => recs.reduce((a, r) => a + r.in.stakeBack + r.in.giftShare, 0) / recs.reduce((a, r) => a + r.out.anchor, 0);
    data.f4.oracleMinusHonest = mean(dd); data.f4.oracleCI = ci95(dd); data.f4.oracleAnchorsRTP = rtp(or); data.f4.honestAnchorsRTP = rtp(hon);
    P(`Value of the leak: the \`oracle\` strategy (anchors the true Gifts from tick 1, votes the truth) ends with ${f1(mean(dd))} ± ${f1(ci95(dd))} more silk than the honest anchoring cooperator on the same ${N} seeds; anchors RTP ${f2(rtp(or))} vs ${f2(rtp(hon))}.`);
    P(`Fix: 128-bit server-side seed, CSPRNG stream (not mulberry32), never ship \`seed\` in any client projection; the Merkle root is the only public commitment.`);
  }

  /* ---------- 5. unfunded top bid burns a sale ---------- */
  P(); P(`## F5. An unfunded top bid burns the sale`);
  {
    const all = {};
    for (const name of ['coop-honest-anchor', 'hold-defect-anchor', 'bidder', 'latebid']) all[name] = sim(name).reduce((o, r) => { for (const k in r.shards) o[k] = (o[k] || 0) + r.shards[k]; return o; }, {});
    let tries = 0, burned = 0, frostLost = 0, trace = null;
    for (const seed of seeds.slice(0, quick ? 300 : 1000)) {
      fresh(seed, rules); play({ type: 'start', phrase: 'f5' }); endTo(7);
      const sh = E.S.shards.find((x) => x.from === 5 && !x.done); if (!sh) continue;
      tries++;
      const log = [];
      const loan = E.S.offers.find((o) => o.kind === 'loan'); if (loan && E.S.silk[0] >= loan.n) { play({ type: 'accept', id: loan.id }); log.push(`t7 accept Salt's loan (−${loan.n})`); }
      play({ type: 'bid', id: sh.id }); let my = sh.bids.find((b) => b.c === 0).amt; log.push(`t7 bid ${my}`);
      while (E.topBid(sh).c !== 0 && E.S.silk[0] >= E.topBid(sh).amt + 3) { play({ type: 'bid', id: sh.id }); my = sh.bids.find((b) => b.c === 0).amt; log.push(`outbid by ${E.NAMES[E.topBid(sh).c]}, rebid ${my}`); }
      if (E.topBid(sh).c !== 0) continue;
      for (let t = 7; t <= 8 && E.S.phase === 'play'; t++) {
        while (E.S.ap > 0 && E.S.silk[0] >= 10 && E.S.silk[0] + 3 >= my) { const k = E.S.anchors.filter((a) => a.c === 0 && a.t >= 15).length; play({ type: 'anchor', p: k % 4, t: 17 - Math.floor(k / 4) }); log.push(`t${E.S.tick} anchor (−10)`); }
        if (t === 7) play({ type: 'end' });
      }
      const silkAtClose = E.S.silk[0] + 3;
      play({ type: 'end' });
      if (sh.done && sh.winner == null) { burned++; frostLost += Math.max(...sh.bids.filter((b) => b.c !== 0).map((b) => b.amt)); if (!trace) trace = { seed, log, my, silkAtClose, result: sh.result }; }
    }
    data.f5 = { bySim: all, griefTries: tries, griefBurned: burned, frostLost, trace };
    P(`\`resolveShards\` takes the single top bid; if that bidder lacks the silk at closing time the shard burns even when other funded bids exist (no fallback to the next bidder, no escrow at bid time).`);
    P(table(['strategy (' + N + ' seasons)', 'shards closed', 'burned: no bids', 'burned: top unfunded', 'with a funded second bidder', 'lost sale silk', 'Iris was the unfunded top', 'ties at top'], Object.entries(all).map(([n, s]) => [n, s.closed, s.burnedNoBids, s.burnedUnfunded, s.burnedWithFundedBidder, s.lostSale, s.irisUnfunded, s.tieTop])));
    P(`Griefing reproduction (Frost's tick-7 shard): Iris bids, then spends her silk below the bid before the auction closes at tick 9. Succeeded in ${burned}/${tries} seasons where the shard existed and Iris could become top bidder; Frost lost ${frostLost} silk of otherwise funded AI bids, and the AI buyers lost the insight.`);
    if (trace) P(`Minimal trace, seed ${trace.seed}: ${trace.log.join('; ')}; silk at close ${trace.silkAtClose} < bid ${trace.my} → "${trace.result}".`);
    P(`Fix: lock the bid amount in escrow when bidding (refund when outbid), or at closing fall back to the highest funded bid.`);
  }

  /* ---------- 6. overdue debts are transferable ---------- */
  P(); P(`## F6. Overdue debts are transferable (and the claim can never be collected)`);
  {
    const recs = sim('debtdump');
    const c = recs.reduce((o, r) => { for (const k in r.claims) o[k] = (o[k] || 0) + r.claims[k]; o.loans = (o.loans || 0) + r.out.loans; o.repay = (o.repay || 0) + r.in.repay; o.debtSales = (o.debtSales || 0) + (r.shardSaleByKind.debt || 0); return o; }, {});
    const h = sim('coop-honest-none').reduce((o, r) => { o.loans = (o.loans || 0) + r.out.loans; o.repay = (o.repay || 0) + r.in.repay; return o; }, {});
    let trace = null;
    for (const seed of seeds) {
      const r = runSeason(seed, STRATEGIES.debtdump, { rules, trace: true });
      if (!r.claims.dead) continue;
      fresh(seed, rules);
      for (const it of r.trace) { const { tick, ok, reason, silk, H, ...intent } = it; applyToEngine(intent); if (E.S.claims.some((cl) => cl.due < E.S.tick)) break; }
      trace = { seed, tick: E.S.tick, claim: E.S.claims.find((x) => x.due < E.S.tick), steps: r.trace.filter((x) => x.type === 'accept' || x.type === 'forget').map((x) => `t${x.tick} ${x.type} #${x.id}`) };
      break;
    }
    data.f6 = { ...c, honestLoans: h.loans, honestRepay: h.repay, trace };
    P(`A debt memory is settled in \`startTick\` of its due tick. Forgetting it one tick earlier puts it on a 2-tick auction that closes after the due date; the buyer (if not the debtor) receives a claim with \`due\` in the past, and \`startTick\` only settles claims with \`due === tick\`, so it is never paid. If the debtor buys it, the debt is cancelled for about 0.55 of its face value.`);
    P(table(['measure (' + N + ' debtdump seasons: lend, then forget the debt at due−1)', 'value'], [
      ['silk lent / repaid directly', `${c.loans} / ${c.repay}`],
      ['debt shards sold (silk to Iris)', `${c.debtSales}`],
      ['claims transferred to a non-debtor buyer', `${c.transferred}`],
      ['of which already overdue at purchase (never collectable)', `${c.dead} (${pct(c.transferred ? c.dead / c.transferred : NaN)}), buyers paid ${c.deadSilk} silk for nothing`],
      ['debt cancelled by the debtor buying its own shard', `${c.cancelledByDebtor}`],
      ['comparison, honest lender over the same seeds: lent / repaid', `${h.loans} / ${h.repay} (RTP ${f2(h.repay / h.loans)})`],
      ['debtdump lender RTP incl. shard sales', f2((c.repay + c.debtSales) / c.loans)],
    ]));
    if (trace) P(`Minimal trace, seed ${trace.seed}: ${trace.steps.join('; ')} → at tick ${trace.tick} the state holds claim ${JSON.stringify(trace.claim)} (due < tick), which no later tick will ever settle.`);
    P(`Fix: settle claims with \`due <= tick\` (immediately on purchase if overdue), or forbid forgetting a debt within one tick of its due date, or value the shard at 0 for non-debtors when it would close after the due date.`);
  }

  return { md: out.join('\n'), data };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/sim/findings.mjs')) {
  runFindings({ quick: process.argv.includes('--quick') });
}