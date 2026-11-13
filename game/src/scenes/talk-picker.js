// Who to talk to when several stand close (owner 13.11: "when they stand together I want to choose, a list of names").
// Pure: the candidates around Iris, nearest first (the quest givers' spots, the other spots in reach such as doors,
// and the townsfolk the hire talk can open), and the one picked. town-flow.js draws the list and acts on the pick.

/** The giver key of a story spot ('story_elder' -> 'elder'), or null for other spots (doors, the wheel, the board). */
export const giverOf = (spot) => (spot && typeof spot.id === 'string' && spot.id.startsWith('story_') ? spot.id.slice(6) : null);

/**
 * @param {{pos: number[], spots: object[], folkAround?: (pos) => Array<{key: string, d: number}>, folkAt?: (key) => number[]|null, folk?: boolean}} o
 * @returns {Array<{id: string, kind: 'spot'|'folk', key: string|null, spot?: object, d: number}>} nearest first
 */
export function talkCandidates({ pos, spots = [], folkAround = () => [], folkAt = () => null, folk = true }) {
  const out = [], taken = new Set();
  const dist = (p) => (p ? Math.hypot(p[0] - pos[0], p[2] - pos[2]) : Infinity);
  for (const s of spots) {
    if (!s || !s.near || !s.near(pos)) continue;
    const g = giverOf(s);
    if (g) taken.add(g);
    out.push({ id: 'spot:' + s.id, kind: 'spot', key: g, spot: s, d: g ? dist(folkAt(g)) : 1.5 });
  }
  if (folk) for (const f of folkAround(pos) || []) if (!taken.has(f.key)) out.push({ id: 'folk:' + f.key, kind: 'folk', key: f.key, d: f.d });
  return out.sort((a, b) => a.d - b.d);
}

/** The picked candidate: the one with `pickedId` while it is still in reach, else the nearest; null when none. */
export const pickCandidate = (cands, pickedId) => cands.find((c) => c.id === pickedId) || cands[0] || null;

/** The next pick after `pickedId` (Tab), wrapping round; the nearest when nothing was picked. */
export function nextPick(cands, pickedId) {
  if (!cands.length) return null;
  const i = Math.max(0, cands.findIndex((c) => c.id === pickedId)); // nothing picked yet: the nearest is the one shown
  return cands[(i + 1) % cands.length].id;
}
