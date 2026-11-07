// A tiny scripted player for the preview page, so the chronicle fills with real
// engine events. Not used by the game; never part of the rules.
export function POLICY(S, E, n) {
  if (S.phase !== 'play' || S.ap < 1) return null;
  if (S.rule !== 'dots') return { type: 'rule', run: () => E.setRule('dots') };
  const gift = S.offers.find((o) => o.kind === 'gift' || o.kind === 'pact');
  if (gift) return { type: 'accept', run: () => E.acceptOffer(gift.id) };
  if (S.tick >= 6 && S.frag[0].st === 'held' && S.tick <= E.DEADLINE) return { type: 'contribute', run: () => E.contributeMine() };
  if (n < 1) {
    for (const { e } of E.visibleProphecies()) {
      const reading = E.readGlyph(e.forms, e.dots);
      const t = e.pub + reading.sl[3].m + 1, place = reading.sl[0].m;
      if (reading.sl[1].m === 0 && S.silk[0] >= 10 && t >= S.tick && t <= E.TICKS && !S.anchors.some((a) => a.c === 0 && a.place === place && a.t === t)) {
        return { type: 'anchor', run: () => E.placeAnchor(place, t) };
      }
    }
  }
  const call = S.tick === 4 && S.mem.find((m) => m.kind === 'call');
  if (call) return { type: 'forget', run: () => E.forget(call.id, 'vision') };
  return null;
}
