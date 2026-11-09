// Deterministic scripted players. They only issue intents the 2D UI would allow,
// using their own LCG so the game RNG stays untouched.

export function makeChooser(seed) {
  let q = (seed * 7919) >>> 0;
  return () => { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; return q / 4294967296; };
}

function visible(S) {
  return S.events.map((e, i) => ({ e, i })).filter((x) => x.e.t >= S.tick && (x.e.pub <= S.tick || S.visions.includes(x.i)));
}
function target(api, e) {
  const rd = api.readGlyph(e.forms, e.dots);
  return { place: rd.sl[0].m, act: rd.sl[1].m, t: e.pub + rd.sl[3].m + 1 };
}
const canAnchor = (S, api, p, t) => S.phase === 'play' && S.ap >= 1 && S.silk[0] >= 10 && t >= S.tick && t <= api.TICKS && !S.anchors.some((a) => a.c === 0 && a.place === p && a.t === t);
function anchorGift(S, api) {
  for (const { e } of visible(S)) { const g = target(api, e); if (g.act === 0 && canAnchor(S, api, g.place, g.t)) return { type: 'anchor', p: g.place, t: g.t }; }
  return null;
}
function keyOpen(S, api) { return S.isolated[2] && !S.pepelKeyKnown && S.phase === 'play' && api.confidentCells() >= 8 && S.ap >= 1 && S.mem.some((m) => m.w >= 3); }
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

export const POLICIES = {
  coop(S, api, pr, n) {
    if (S.phase === 'intro') return { type: 'start', phrase: 'we read together' };
    if (S.phase === 'vote') return { type: 'vote', v: voteByKey(S, api) };
    if (S.phase !== 'play') return null;
    if (S.rule !== 'dots') return { type: 'rule', r: 'dots' };
    for (const o of S.offers) {
      if (o.kind === 'gift' || o.kind === 'pact') return { type: 'accept', id: o.id };
      if (o.kind === 'escrow' && S.silk[0] >= o.price + 10) return { type: 'accept', id: o.id };
      if (o.kind === 'sell' && o.from === 5 && S.silk[0] >= o.price + 15) return { type: 'accept', id: o.id };
    }
    if (keyOpen(S, api)) { const m = S.mem.filter((x) => x.w >= 3).sort((a, b) => a.id - b.id)[0]; return { type: 'forget', id: m.id, purpose: 'key' }; }
    if (S.pepelKeyKnown && S.isolated[2] && S.ap >= 1) return { type: 'speak' };
    if (S.tick >= 6 && S.tick <= api.DEADLINE && S.frag[0].st === 'held') return { type: 'contribute' };
    if (n < 2) { const a = anchorGift(S, api); if (a) return a; }
    for (const k of S.broken) {
      const [i, j] = k.split('-').map(Number);
      if (i !== 0 && !S.isolated[i] && !S.isolated[j] && S.T[i][0] >= 40 && S.T[j][0] >= 40 && S.ap >= 1 && S.silk[0] >= 30) return { type: 'mediate', i, j };
    }
    if (S.ap >= 1 && S.silk[0] >= 20) { const c = weakestCell(S, api); if (c) return { type: 'ask', s: c.s, f: c.f, m: c.m }; }
    return null;
  },
  hold(S, api, pr, n) {
    if (S.phase === 'intro') return { type: 'start', phrase: '' };
    if (S.phase === 'vote') return { type: 'vote', v: pr() < .5 };
    if (S.phase !== 'play') return null;
    if (S.tick >= 5 && S.rule === 'unknown') return { type: 'rule', r: 'top' };
    if (S.tick >= 9 && S.rule === 'top') return { type: 'rule', r: 'dots' };
    for (const o of S.offers) {
      if (o.kind === 'loan' && S.silk[0] >= o.n + 5) return { type: 'accept', id: o.id };
      if (o.kind === 'sell' && o.from !== 5 && S.silk[0] >= o.price + 10) return { type: 'accept', id: o.id };
    }
    if (S.ap >= 1 && S.tick >= 3) {
      const m = S.mem.find((x) => x.kind === 'call' || x.kind === 'first' || (x.kind === 'debt' && S.tick >= 8));
      if (m && pr() < .6) return { type: 'forget', id: m.id, purpose: 'vision' };
    }
    for (const sh of S.shards) {
      if (sh.done || sh.from === 0) continue;
      const top = api.topBid(sh);
      if ((!top || top.c !== 0) && S.silk[0] >= (top ? top.amt : 0) + 13 && pr() < .5) return { type: 'bid', id: sh.id };
    }
    if (n < 1) { const a = anchorGift(S, api); if (a) return a; }
    if (S.offers.length && pr() < .5) return { type: 'decline', id: S.offers[0].id };
    return null;
  },
  breaks(S, api, pr, n) {
    if (S.phase === 'intro') return { type: 'start', phrase: 'I will forget' };
    if (S.phase === 'vote') return { type: 'vote', v: false };
    if (S.phase !== 'play') return null;
    if (S.tick >= 3 && S.rule !== 'dots') return { type: 'rule', r: 'dots' };
    for (const o of S.offers) {
      if (o.kind === 'pact') return { type: 'accept', id: o.id };
      if (o.kind === 'sell' && o.from === 1 && S.silk[0] >= o.price + 5) return { type: 'accept', id: o.id };
      if (o.kind === 'loan' && o.from === 1 && S.silk[0] >= o.n + 5) return { type: 'accept', id: o.id };
      if (o.kind === 'gift') return { type: 'decline', id: o.id };
    }
    if (S.ap >= 1) {
      const pm = S.mem.find((x) => x.kind === 'promise');
      if (pm && S.tick >= 8) return { type: 'forget', id: pm.id, purpose: 'vision' };
      const bm = S.mem.find((x) => x.kind === 'betrayal');
      if (bm) return { type: 'forget', id: bm.id, purpose: 'vision' };
      if (S.tick >= 10) { const gm = S.mem.find((x) => x.kind === 'gift'); if (gm) return { type: 'forget', id: gm.id, purpose: 'vision' }; }
    }
    for (const k of S.broken) {
      const [i, j] = k.split('-').map(Number);
      if (i === 0 && !api.hasBetrayal(j) && S.T[j][0] >= 25 && S.ap >= 1 && S.silk[0] >= 10) return { type: 'mend', j };
    }
    if (S.tick === 15 && S.frag[0].st === 'held') return { type: 'contribute' };
    if (n < 1) { const a = anchorGift(S, api); if (a) return a; }
    return null;
  },
};
