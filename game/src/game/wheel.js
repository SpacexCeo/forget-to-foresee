// The wheel (docs/entry-wheel-items-plan.md): one free spin per calendar day plus spins earned by play (one per level
// gained and one per verified trial). Never bought: no real money, not with town silk. The odds table is shown on the
// wheel; each spin is deterministic from a shown seed (the browser's wheel id and the spin number). Prizes go to the
// off-chain inventory (game/inventory.js), the town ledger (town silk, XP), the chest bag, a cosmetic title, or, the
// rarest, the NFT skin "Sheriffchenko" (minted on testnet to the player's guest account through the relayer). A spin's
// prize waits as a pending result (persisted, survives a reload) until the player claims it. Pure apart from storage.
import { seededRandom } from './town-economy.js';
import { sha256 } from './crypto.js';

export const WHEEL_KEY = 'ftf.wheel.v1';
/** Segments in wheel order: kind, what, weight (the weights are the odds; they sum to 100). */
// v2 (owner, 12.11): a chest sector and the grand prize replace the uncommon and legendary shards. `rarity` colours the
// sector; `amount` is shown on it (silk in hundredths, as the ledger counts it).
export const SEGMENTS = Object.freeze([
  Object.freeze({ id: 'silk5', kind: 'silk', amount: 500, rarity: 'common', weight: 20 }),
  Object.freeze({ id: 'part_common', kind: 'part', rarity: 'common', weight: 18 }),
  Object.freeze({ id: 'shard_common', kind: 'shard', rarity: 'common', weight: 14 }),
  Object.freeze({ id: 'xp25', kind: 'xp', amount: 25, rarity: 'common', weight: 14 }),
  Object.freeze({ id: 'part_uncommon', kind: 'part', rarity: 'uncommon', weight: 10 }),
  Object.freeze({ id: 'chest', kind: 'chest', tier: 'common', rarity: 'uncommon', weight: 9 }),
  Object.freeze({ id: 'silk15', kind: 'silk', amount: 1500, rarity: 'rare', weight: 6 }),
  Object.freeze({ id: 'part_rare', kind: 'part', rarity: 'rare', weight: 3.5 }),
  Object.freeze({ id: 'shard_rare', kind: 'shard', rarity: 'rare', weight: 3 }),
  Object.freeze({ id: 'title', kind: 'title', rarity: 'epic', weight: 1.5 }),
  Object.freeze({ id: 'part_legendary', kind: 'part', rarity: 'legendary', weight: 0.5 }),
  Object.freeze({ id: 'skin_sheriffchenko', kind: 'skin', skin: 'sheriffchenko', rarity: 'mythic', grand: true, weight: 0.5 }),
]);
/** The grand prize's token supply (hard cap on the contract; shown in the odds table). */
export const SKIN_CAP = 100;
export const TITLES = Object.freeze(['wanderer', 'lamplit', 'starreader']);

/**
 * The wheel id bound to a guest account: the relayer re-derives it (and the roll from the shown seed) before minting
 * the grand prize, so a browser cannot pick an id that wins.
 */
export const wheelIdFor = (accountId) => sha256('ftf-wheel:' + accountId).slice(0, 8);

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
export function createWheel({ storage = null, now = () => Date.now(), earnedFrom = () => 0, random = Math.random, account = null } = {}) {
  let st = null;
  try { st = JSON.parse((storage && storage.getItem(WHEEL_KEY)) || 'null'); } catch { st = null; }
  if (!st || st.v !== 1) st = { v: 1, id: Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0'), spins: 0, freeDay: null, earnedUsed: 0, titles: [], history: [] };
  if (!Array.isArray(st.pending)) st.pending = []; // results waiting for Claim (added 12.11; older saves have none)
  if (account && st.account !== account) { st.account = account; st.id = wheelIdFor(account); } // seeds bound to the guest account
  const save = () => { try { if (storage) storage.setItem(WHEEL_KEY, JSON.stringify(st)); } catch { /* memory only */ } };
  const freeAvailable = () => st.freeDay !== dayOf(now());
  const earnedLeft = () => Math.max(0, earnedFrom() - st.earnedUsed);
  return {
    get id() { return st.id; },
    get titles() { return st.titles.slice(); },
    get history() { return st.history.slice(); },
    /** Results not yet claimed, oldest first: {seed, segment, item, title, at, status: 'pending'|'minting'}. */
    get pending() { return st.pending.map((p) => ({ ...p })); },
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
      st.history = [{ seed, at: now(), segment: r.segment.id, item: r.item ? r.item.id : null, title: r.title, free }, ...st.history].slice(0, 30);
      st.pending.push({ seed, index: r.index, segment: r.segment.id, item: r.item ? r.item.id : null, title: r.title, at: now(), status: 'pending' });
      save();
      return { ...r, seed, free };
    },
    /** Marks a pending result (by seed) as being minted on chain (the grand prize); it stays pending until settled. */
    minting(seed, info = {}) { const p = st.pending.find((x) => x.seed === seed); if (!p) return null; Object.assign(p, info, { status: 'minting' }); save(); return { ...p }; },
    /** The prize is in the player's hands: it leaves the pending list (a title joins the wheel's titles). */
    settle(seed, info = {}) {
      const i = st.pending.findIndex((x) => x.seed === seed); if (i < 0) return null;
      const [p] = st.pending.splice(i, 1);
      if (p.title && !st.titles.includes(p.title)) st.titles.push(p.title);
      const h = st.history.find((x) => x.seed === seed); if (h) Object.assign(h, { claimed: now() }, info);
      save(); return { ...p, ...info };
    },
  };
}

/**
 * Claims a pending result into the player's real stores. `sinks`: {inventory, ledger, chests, mintSkin}. Off-chain
 * prizes land at once (the wheel settles them); the grand prize asks `mintSkin(entry)` (the relayer) and settles on a
 * confirmed mint, else stays pending with its status ('minting') and reason, to retry later.
 * @returns {Promise<{ok: boolean, kind: string, reason?: string, tokenId?: string}>}
 */
export async function claimPrize(wheel, seed, { inventory = null, ledger = null, chests = null, mintSkin = null } = {}) {
  const p = wheel.pending.find((x) => x.seed === seed);
  if (!p) return { ok: false, kind: null, reason: 'gone' };
  const seg = SEGMENTS.find((s) => s.id === p.segment);
  if (!seg) { wheel.settle(seed); return { ok: false, kind: null, reason: 'gone' }; }
  if (seg.kind === 'skin') {
    wheel.minting(seed);
    let r = null;
    try { r = mintSkin ? await mintSkin(p) : { ok: false, reason: 'not_configured' }; } catch { r = { ok: false, reason: 'network' }; }
    if (r && r.ok) { wheel.settle(seed, { tokenId: r.tokenId || null, txHash: r.txHash || null }); return { ok: true, kind: 'skin', tokenId: r.tokenId || null }; }
    if (r && r.reason === 'already_owned') { wheel.settle(seed, { reason: 'already_owned', tokenId: r.tokenId || null }); return { ok: false, kind: 'skin', reason: 'already_owned', tokenId: r.tokenId || null }; }
    wheel.minting(seed, { reason: (r && r.reason) || 'network' });
    return { ok: false, kind: 'skin', reason: (r && r.reason) || 'network' };
  }
  if (seg.kind === 'silk' && ledger) ledger.grant({ silk: seg.amount });
  else if (seg.kind === 'xp' && ledger) ledger.grant({ xp: seg.amount });
  else if ((seg.kind === 'part' || seg.kind === 'shard') && inventory && p.item) inventory.add(p.item, 1, 'wheel');
  else if (seg.kind === 'chest' && chests) chests.add({ tier: seg.tier || 'common', source: 'wheel' });
  wheel.settle(seed);
  return { ok: true, kind: seg.kind };
}
