/* Runs one season of the headless engine with a scripted Iris strategy and records a
 * silk ledger (what Iris put in, what came back, by channel), the tension trajectory,
 * gift-pool conservation, shard-auction and debt-claim anomalies, and the finale.
 * Everything is driven by the engine's explicit RNG (seed) and injected salt bytes,
 * so a (seed, strategy, rules) triple reproduces the exact same record. */
import * as E from '../../../src/game/engine.js';
import { applyToEngine } from '../../../tests/lib/engine-apply.mjs';
import { makeChooser, makeRandomBytes } from './rng.mjs';

const POT = [10, 20, 40, 80];
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/** Gift-pool bookkeeping for the event revealed at tick t (all clans), plus Iris's own anchor returns. */
function preReveal(S, t, rec) {
  const e = S.events.find((x) => x.t === t); if (!e) return;
  const here = S.anchors.filter((a) => a.t === t), hit = here.filter((a) => a.place === e.place);
  const pot = POT[e.power];
  if (e.action === 0) {
    rec.pool.giftEvents++; rec.pool.pot += pot;
    if (hit.length) {
      const W = hit.reduce((s, a) => s + (t - a.at + 1), 0);
      const paid = hit.reduce((s, a) => s + Math.round(pot * (t - a.at + 1) / W), 0);
      rec.pool.paid += paid; rec.pool.claimedEvents++;
      if (paid !== pot) { rec.pool.driftEvents++; rec.pool.drift += paid - pot; if (paid > pot) rec.pool.minted += paid - pot; else rec.pool.burned += pot - paid; }
    } else rec.pool.unclaimed += pot;
  }
  if (e.action === 1) rec.pool.stormBurned += hit.reduce((s, a) => s + a.stake, 0);
  for (const a of here.filter((a) => a.c === 0)) {
    rec.anchors.resolved++;
    if (a.place !== e.place) { rec.in.stakeBack += a.stake; rec.anchors.miss++; continue; }
    if (e.action === 0) { const W = hit.reduce((s, x) => s + (t - x.at + 1), 0); rec.in.stakeBack += a.stake; rec.in.giftShare += Math.round(pot * (t - a.at + 1) / W); rec.anchors.gift++; }
    else if (e.action === 1) { rec.anchors.storm++; rec.anchors.stormLost += a.stake; }
    else { rec.in.stakeBack += a.stake; rec.anchors.quiet++; }
  }
}

/** Shards that closed during this startTick: sales, burns, unfunded top bids, ties, debt claims. */
function postShards(S, tickNow, rec) {
  for (const sh of S.shards) {
    if (!sh.done || sh.doneAt !== tickNow) continue;
    rec.shards.closed++;
    const max = sh.bids.reduce((m, b) => Math.max(m, b.amt), 0);
    if (sh.bids.length >= 2 && sh.bids.filter((b) => b.amt === max).length >= 2) rec.shards.tieTop++;
    if (sh.winner == null) {
      if (!sh.bids.length) { rec.shards.burnedNoBids++; continue; }
      rec.shards.burnedUnfunded++;
      const top = sh.bids.find((b) => b.amt === max);
      const other = sh.bids.filter((b) => b !== top && S.silk[b.c] >= b.amt).sort((a, b) => b.amt - a.amt)[0];
      if (other) { rec.shards.burnedWithFundedBidder++; rec.shards.lostSale += other.amt; }
      if (top.c === 0) rec.shards.irisUnfunded++;
      continue;
    }
    const amt = sh.bids.find((b) => b.c === sh.winner).amt;
    if (sh.from === 0) { rec.in.shardSale += amt; rec.shards.soldByIris++; rec.shardSaleByKind[sh.mem.kind] = (rec.shardSaleByKind[sh.mem.kind] || 0) + amt; }
    if (sh.winner === 0) { rec.out.bids += amt; rec.shards.boughtByIris++; }
    if (sh.from === 0 && sh.mem.kind === 'debt') {
      if (sh.winner === sh.mem.about) rec.claims.cancelledByDebtor++;
      else { rec.claims.transferred++; if (sh.mem.data.due < tickNow) { rec.claims.dead++; rec.claims.deadSilk += amt; } }
    }
  }
}

export function runSeason(seed, strategy, opts = {}) {
  const rules = opts.rules || 'v2';
  const pr = makeChooser(seed);
  E.newSeason(seed, { rules, randomBytes: makeRandomBytes(seed) });
  const S = E.S;
  const rec = {
    seed, strategy: strategy.name, rules,
    out: { anchor: 0, ask: 0, words: 0, loans: 0, escrow: 0, bids: 0, mend: 0, mediate: 0 },
    in: { giftShare: 0, stakeBack: 0, repay: 0, shardSale: 0, prize: 0, finale: 0, other: 0 },
    shardSaleByKind: {},
    anchors: { placed: 0, resolved: 0, gift: 0, storm: 0, stormLost: 0, quiet: 0, miss: 0 },
    pool: { giftEvents: 0, claimedEvents: 0, pot: 0, paid: 0, unclaimed: 0, driftEvents: 0, drift: 0, minted: 0, burned: 0, stormBurned: 0 },
    shards: { closed: 0, burnedNoBids: 0, burnedUnfunded: 0, burnedWithFundedBidder: 0, lostSale: 0, irisUnfunded: 0, tieTop: 0, soldByIris: 0, boughtByIris: 0 },
    claims: { transferred: 0, dead: 0, deadSilk: 0, cancelledByDebtor: 0 },
    actions: {}, rejected: [], H: [S.H], visions: 0, forgot: 0,
    crisis: null, trace: opts.trace ? [] : null,
  };
  const note = (it, r) => { if (rec.trace) rec.trace.push({ tick: S.tick, ...it, ok: r.ok, reason: r.reason, silk: S.silk[0], H: S.H }); };
  const ctx = { n: 0 };
  let guard = 0;
  while (S.phase !== 'end' && guard++ < 400) {
    if (S.phase === 'intro') { const it = strategy.start(S); note(it, applyToEngine(it)); continue; }
    if (S.phase === 'vote') {
      preReveal(S, S.tick, rec);
      const before = S.silk[0], it = { type: 'vote', v: strategy.vote(S, E, pr) };
      note(it, applyToEngine(it));
      rec.in.finale = S.silk[0] - before;
      break;
    }
    ctx.n = 0; let step = 0, it;
    while (step++ < 20 && (it = strategy.act(S, E, pr, ctx))) {
      const before = S.silk[0];
      const offer = it.type === 'accept' ? S.offers.find((o) => o.id === it.id) : null;
      const r = applyToEngine(it); note(it, r);
      if (!r.ok) { rec.rejected.push({ tick: S.tick, ...it, reason: r.reason }); break; }
      rec.actions[it.type] = (rec.actions[it.type] || 0) + 1;
      if (it.type === 'anchor') { ctx.n++; rec.anchors.placed++; }
      if (it.type === 'forget') { rec.forgot++; if (it.purpose !== 'key') rec.visions++; }
      const d = before - S.silk[0];
      if (d > 0) {
        if (it.type === 'anchor') rec.out.anchor += d;
        else if (it.type === 'ask') rec.out.ask += d;
        else if (it.type === 'mend') rec.out.mend += d;
        else if (it.type === 'mediate') rec.out.mediate += d;
        else if (it.type === 'accept') rec.out[offer.kind === 'sell' ? 'words' : offer.kind === 'loan' ? 'loans' : 'escrow'] += d;
        else rec.in.other -= d;
      }
      if (S.phase === 'end') break;
    }
    if (S.phase !== 'play') continue;
    /* end of tick: reveal at t, then startTick(t+1) */
    const t = S.tick, before = S.silk[0];
    const stakeBefore = rec.in.stakeBack, giftBefore = rec.in.giftShare, saleBefore = rec.in.shardSale, bidsBefore = rec.out.bids;
    const heldPrize = S.frag[0].st === 'held' && S.tV[0] === t + 1;
    const Hbefore = S.H, brokenBefore = S.broken.length;
    preReveal(S, t, rec);
    const r = applyToEngine({ type: 'end' }); note({ type: 'end' }, r);
    E.takeFx();
    const advanced = S.tick === t + 1;
    if (advanced) postShards(S, S.tick, rec);
    if (heldPrize && S.frag[0].st === 'dark') rec.in.prize += S.V[0];
    const known = (rec.in.stakeBack - stakeBefore) + (rec.in.giftShare - giftBefore) + (rec.in.shardSale - saleBefore) - (rec.out.bids - bidsBefore) + (heldPrize && S.frag[0].st === 'dark' ? S.V[0] : 0);
    const residual = S.silk[0] - before - (advanced ? 3 : 0) - known;
    if (residual > 0) rec.in.repay += residual; else if (residual < 0) rec.in.other += residual;
    rec.H.push(S.H);
    if (advanced && S.tick === E.CRISIS) rec.crisis = { Hbefore, Hafter: S.H, edgesBroken: S.broken.length - brokenBefore, ashIsolated: S.isolated[2] };
  }
  const silk = S.silk.slice();
  const accepts = S.votes ? S.votes.filter(Boolean).length : null;
  rec.final = {
    outcome: S.outcome, tick: S.tick, H: S.H, silk, truthGift: S.truthGift, keyHolder: S.keyHolder,
    keyIn: S.frag[S.keyHolder].st === 'scroll', scroll: S.frag.filter((f) => f.st === 'scroll').length,
    dark: S.frag.filter((f) => f.st === 'dark').length, irisFrag: S.frag[0].st, votes: accepts, tie: accepts === 3,
    keySpoken: S.pepelKeyKnown && !S.isolated[2], ashIsolated: S.isolated[2], ashFrag: S.frag[2].st, amberFrag: S.frag[4].st,
    broken: S.broken.length, irisBroken: S.broken.filter((k) => k.startsWith('0-')).length, wild: S.wild,
    firstBuyer: S.firstBuyer, trustInIris: [1, 2, 3, 4, 5].map((i) => S.T[i][0]),
  };
  rec.totals = { out: sum(rec.out), in: sum(rec.in) };
  return rec;
}