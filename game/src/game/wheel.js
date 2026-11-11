// The wheel (docs/entry-wheel-items-plan.md): one free spin per calendar day plus spins earned by play (one per level
// gained and one per verified trial). Never bought: no real money, not with town silk. The odds table is shown on the
// wheel; each spin is deterministic from a shown seed (the browser's wheel id and the spin number). Prizes go to the
// off-chain inventory (game/inventory.js) or to the town ledger (town silk, XP), or are a cosmetic title. Pure.
import { seededRandom } from './town-economy.js';

export const WHEEL_KEY = 'ftf.wheel.v1';
/** Segments in wheel order: kind, what, weight (the weights are the odds; they sum to 100). */
export const SEGMENTS = Object.freeze([
  Object.freeze({ id: 'silk5', kind: 'silk', amount: 500, weight: 20 }),
  Object.freeze({ id: 'part_common', kind: 'part', rarity: 'common', weight: 18 }),
  Object.freeze({ id: 'shard_common', kind: 'shard', rarity: 'common', weight: 14 }),
  Object.freeze({ id: 'xp25', kind: 'xp', amount: 25, weight: 14 }),
  Object.freeze({ id: 'part_uncommon', kind: 'part', rarity: 'uncommon', weight: 10 }),
  Object.freeze({ id: 'shard_uncommon', kind: 'shard', rarity: 'uncommon', weight: 9 }),
  Object.freeze({ id: 'silk15', kind: 'silk', amount: 1500, weight: 6 }),
  Object.freeze({ id: 'part_rare', kind: 'part', rarity: 'rare', weight: 3.5 }),
  Object.freeze({ id: 'shard_rare', kind: 'shard', rarity: 'rare', weight: 3 }),
  Object.freeze({ id: 'title', kind: 'title', weight: 1.5 }),
  Object.freeze({ id: 'part_legendary', kind: 'part', rarity: 'legendary', weight: 0.5 }),
  Object.freeze({ id: 'shard_legendary', kind: 'shard', rarity: 'legendary', weight: 0.5 }),
]);
export const TITLES = Object.freeze(['wanderer', 'lamplit', 'starreader']);

/** Probability of each segment (sums to 1). */
export const odds = () => { const tot = SEGMENTS.reduce((s, x) => s + x.weight, 0); return SEGMENTS.map((x) => ({ id: x.id, p: x.weight / tot })); };
/** Calendar day in the player's time zone (YYYY-MM-DD). */
export const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Which segment and which item a seed gives. `items` is the items manifest list (id, kind, rarity).
 * @returns {{index: number, segment: object, item: object|null, title: string|null}}
 */
export function spinResult(seed, items = []) {
  const rand = seededRandom('wheel:' + seed);
  const tot = SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = rand() * tot, index = 0;
  for (; index < SEGMENTS.length - 1; index++) { r -= SEGMENTS[index].weight; if (r < 0) break; }
  const segment = SEGMENTS[index];
  let item = null, title = null;
  if (segment.kind === 'part' || segment.kind === 'shard') {
    const pool = items.filter((i) => i.kind === segment.kind && i.rarity === segment.rarity);
    item = pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  } else if (segment.kind === 'title') title = TITLES[Math.floor(rand() * TITLES.length)];
  return { index, segment, item, title };
}

/**
 * The wheel's state in this browser.
 * @param {{storage?: object, now?: () => number, earnedFrom?: () => number, random?: () => number}} o
 *   earnedFrom: spins earned so far by play (levels gained + verified trials), from the town ledger
 */
export function createWheel({ storage = null, now = () => Date.now(), earnedFrom = () => 0, random = Math.random } = {}) {
  let st = null;
  try { st = JSON.parse((storage && storage.getItem(WHEEL_KEY)) || 'null'); } catch { st = null; }
  if (!st || st.v !== 1) st = { v: 1, id: Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0'), spins: 0, freeDay: null, earnedUsed: 0, titles: [], history: [] };
  const save = () => { try { if (storage) storage.setItem(WHEEL_KEY, JSON.stringify(st)); } catch { /* memory only */ } };
  const freeAvailable = () => st.freeDay !== dayOf(now());
  const earnedLeft = () => Math.max(0, earnedFrom() - st.earnedUsed);
  return {
    get id() { return st.id; },
    get titles() { return st.titles.slice(); },
    get history() { return st.history.slice(); },
    /** Spins available now: {free: boolean, earned: number, total: number}. */
    get available() { const f = freeAvailable(), e = earnedLeft(); return { free: f, earned: e, total: (f ? 1 : 0) + e }; },
    /** The seed of the next spin (shown before spinning). */
    get nextSeed() { return `${st.id}-${st.spins + 1}`; },
    /** Spends a spin (the free one first) and returns the result, or null when none is left. */
    spin(items = []) {
      const free = freeAvailable();
      if (!free && earnedLeft() <= 0) return null;
      if (free) st.freeDay = dayOf(now()); else st.earnedUsed++;
      st.spins++;
      const seed = `${st.id}-${st.spins}`;
      const r = spinResult(seed, items);
      if (r.title && !st.titles.includes(r.title)) st.titles.push(r.title);
      st.history = [{ seed, at: now(), segment: r.segment.id, item: r.item ? r.item.id : null, title: r.title, free }, ...st.history].slice(0, 30);
      save();
      return { ...r, seed, free };
    },
  };
}
