// Scripted Iris strategies for the Monte Carlo harness.
// Only clan 0 (Iris) is controllable; the five AI clans are the engine's fixed heuristics.
// A strategy returns one intent at a time (same intent format as tests/lib/engine-apply.mjs)
// and only issues intents the engine accepts, so every rejection is a harness bug (counted).
//
// Factorial design (12 strategies):
//   frag   : coop (contribute at tick 6), late (contribute at tV-1, the last tick before the own prize fires; tick 16 is unreachable since tV <= 15), hold (never)
//   trust  : honest (keeps promises and debts, speaks the Key, mediates), defect (breaks promises, dumps debts, buys Salt's words)
//   market : anchor (anchors on read Gifts, visions from Call memories, asks, buys Frost's words), none
// Specials: passive, oracle (reads the future from S.events = what a leaked seed gives), debtdump, bidder, latebid.

function visible(S) {
  return S.events.map((e, i) => ({ e, i })).filter((x) => x.e.t >= S.tick && (x.e.pub <= S.tick || S.visions.includes(x.i)));
}
function readTarget(api, e) {
  const rd = api.readGlyph(e.forms, e.dots);
  return { place: rd.sl[0].m, act: rd.sl[1].m, t: e.pub + rd.sl[3].m + 1 };
}
const canAnchor = (S, api, p, t) => S.phase === 'play' && S.ap >= 1 && S.silk[0] >= 10 && t >= S.tick && t <= api.TICKS && !S.anchors.some((a) => a.c === 0 && a.place === p && a.t === t);
function anchorGift(S, api) {
  for (const { e } of visible(S)) { const g = readTarget(api, e); if (g.act === 0 && canAnchor(S, api, g.place, g.t)) return { type: 'anchor', p: g.place, t: g.t }; }
  return null;
}
function keyOpen(S, api) { const k = api.keyVisionStatus(); return k.open && k.enoughCells && k.heavyMemory && S.ap >= 1; }
function voteByKey(S, api) {
  const k = S.frag[S.keyHolder];
  if (k.st !== 'scroll') return true;
  return api.readGlyph(k.forms, k.dots).sl[1].m === 0;
}
function weakestCell(S, api) {
  const V = api.dictVotes(); let best = null;
  for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) {
    if (S.pins[s + '_' + f]) continue;
    const g = api.guess(s, f, V);
    if (!best || g.conf < best.conf) best = { s, f, m: g.m, conf: g.conf };
  }
  return best;
}
const mem = (S, kind) => S.mem.find((m) => m.kind === kind);

/** Builds one factorial strategy. `ctx` is per-tick scratch space owned by the harness (ctx.n = anchors placed this tick). */
export function makeStrategy({ frag, trust, market }, extra = {}) {
  const name = extra.name || `${frag}-${trust}-${market}`;
  const honest = trust === 'honest', anchors = market === 'anchor';
  // late = the last tick before Iris's own prize fires (tV is shown to the player); tick 16 is never reachable since tV <= 15
  const contributeAt = (S) => (frag === 'coop' ? 6 : frag === 'late' ? S.tV[0] - 1 : Infinity);
  return {
    name, dims: { frag, trust, market }, ...extra,
    start: () => ({ type: 'start', phrase: name }),
    vote: (S, api) => voteByKey(S, api),
    act(S, api, pr, ctx) {
      if (S.phase !== 'play') return null;
      if (S.rule !== 'dots') return { type: 'rule', r: 'dots' };
      /* offers */
      for (const o of S.offers) {
        if (o.kind === 'gift') return { type: 'accept', id: o.id };
        if (o.kind === 'pact') {
          if (!honest) return { type: 'accept', id: o.id };               /* defect: promise, then forget it (the shard sells the secret) */
          if (frag === 'coop') return { type: 'accept', id: o.id };       /* honest: only promise what tick 6 already delivers */
        }
        if (o.kind === 'loan' && S.silk[0] >= o.n + 5) return { type: 'accept', id: o.id };
        if (o.kind === 'escrow' && honest && S.silk[0] >= o.price + 10) return { type: 'accept', id: o.id }; // cooperative social action, independent of the own fragment decision
        if (o.kind === 'sell' && anchors && o.from === 5 && S.silk[0] >= o.price + 15) return { type: 'accept', id: o.id };
        if (o.kind === 'sell' && !honest && o.from === 1 && S.silk[0] >= o.price + 5) return { type: 'accept', id: o.id };
      }
      if (S.ap < 1) return null;
      /* trust dimension */
      if (honest) {
        if (keyOpen(S, api)) {
          const heavy = S.mem.filter((x) => x.w >= 3);
          const m = heavy.find((x) => x.kind === 'betrayal') || heavy.sort((a, b) => a.id - b.id)[0];
          return { type: 'forget', id: m.id, purpose: 'key' };
        }
        if (S.pepelKeyKnown && S.isolated[2]) return { type: 'speak' };
      } else {
        const pm = mem(S, 'promise'); if (pm && S.tick >= pm.data.by - 6) return { type: 'forget', id: pm.id, purpose: 'vision' };
        const dm = S.mem.find((x) => x.kind === 'debt' && x.data.due === S.tick + 1); if (dm) return { type: 'forget', id: dm.id, purpose: 'vision' }; /* debt dumping */
        const bm = mem(S, 'betrayal'); if (bm) return { type: 'forget', id: bm.id, purpose: 'vision' };
      }
      /* fragment dimension */
      if (S.tick >= contributeAt(S) && S.tick <= api.DEADLINE && S.frag[0].st === 'held') return { type: 'contribute' };
      /* market dimension */
      if (anchors) {
        if (ctx.n < 2) { const a = anchorGift(S, api); if (a) return a; }
        if (S.tick >= 3 && S.ap >= 2) { const cm = mem(S, 'call'); if (cm) return { type: 'forget', id: cm.id, purpose: 'vision' }; }
      }
      if (honest) {
        for (const k of S.broken) {
          const [i, j] = k.split('-').map(Number);
          if (i === 0 && !api.hasBetrayal(j) && S.T[j][0] >= 25 && S.silk[0] >= 20) return { type: 'mend', j };
          if (i !== 0 && !S.isolated[i] && !S.isolated[j] && S.T[i][0] >= 40 && S.T[j][0] >= 40 && S.silk[0] >= 30) return { type: 'mediate', i, j };
        }
      }
      if (anchors && S.silk[0] >= 25) { const c = weakestCell(S, api); if (c) return { type: 'ask', s: c.s, f: c.f, m: c.m }; }
      return null;
    },
  };
}
export const passive = {
  name: 'passive', dims: { frag: 'hold', trust: 'none', market: 'none' },
  start: () => ({ type: 'start', phrase: 'passive' }),
  vote: () => true,
  act: () => null,
};

/** What a player who knows the seed can do: anchor the true Gifts as early as possible (early anchors weigh more). */
export const oracle = {
  name: 'oracle', dims: { frag: 'coop', trust: 'honest', market: 'oracle' }, cheats: true,
  start: () => ({ type: 'start', phrase: 'oracle' }),
  vote: (S) => S.truthGift,
  act(S, api) {
    if (S.phase !== 'play') return null;
    if (S.rule !== 'dots') return { type: 'rule', r: 'dots' };
    for (const o of S.offers) if (o.kind === 'gift' || o.kind === 'pact') return { type: 'accept', id: o.id };
    if (S.ap < 1) return null;
    if (S.tick >= 6 && S.tick <= api.DEADLINE && S.frag[0].st === 'held') return { type: 'contribute' };
    for (const e of S.events) if (e.action === 0 && canAnchor(S, api, e.place, e.t)) return { type: 'anchor', p: e.place, t: e.t };
    return null;
  },
};

/** Honest cooperator who lends and then forgets every debt one tick before it is due (finding 6). */
export const debtdump = makeStrategy({ frag: 'coop', trust: 'honest', market: 'none' }, { name: 'debtdump' });
const dumpInner = debtdump.act;
debtdump.act = function (S, api, pr, ctx) {
  if (S.phase === 'play' && S.ap >= 1) { const dm = S.mem.find((x) => x.kind === 'debt' && x.data.due === S.tick + 1); if (dm) return { type: 'forget', id: dm.id, purpose: 'vision' }; }
  return dumpInner.call(this, S, api, pr, ctx);
};

/** Bids on Frost's shards: `bidder` as soon as they appear, `latebid` on the last tick before they close. */
function withBidding(name, late) {
  const s = makeStrategy({ frag: 'coop', trust: 'honest', market: 'anchor' }, { name });
  const inner = s.act;
  s.act = function (S, api, pr, ctx) {
    if (S.phase === 'play') for (const sh of S.shards) {
      if (sh.done || sh.from === 0) continue;
      if (late && sh.exp - 1 !== S.tick) continue;
      const top = api.topBid(sh), amt = (top ? top.amt : 0) + 3;
      if ((!top || top.c !== 0) && S.silk[0] >= amt + 10) return { type: 'bid', id: sh.id };
    }
    return inner.call(this, S, api, pr, ctx);
  };
  return s;
}
export const bidder = withBidding('bidder', false);
export const latebid = withBidding('latebid', true);

export const FACTORIAL = [];
for (const frag of ['coop', 'late', 'hold']) for (const trust of ['honest', 'defect']) for (const market of ['anchor', 'none']) FACTORIAL.push(makeStrategy({ frag, trust, market }));

export const STRATEGIES = Object.fromEntries([...FACTORIAL, passive, oracle, debtdump, bidder, latebid].map((s) => [s.name, s]));