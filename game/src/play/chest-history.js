// The chest list in the Inventory tab and the loot NFT cards in the NFTs tab (owner 13.11: opened chests looked like
// actions, loot NFTs had no picture). Pure helpers: which chests are sealed, opened or archived, what came out of an
// opened one, whether it was "dust" (a small leftover), and which item icon a loot NFT shows. No DOM here.

/** The archived chest ids (opened chests moved out of the history by the player), separate from the chest bag. */
export const ARCHIVE_KEY = 'ftf.chests.archive.v1';

/** The archived ids saved in this browser, as a Set (empty when nothing is saved or storage fails). */
export function loadArchive(storage) {
  try {
    const raw = storage && storage.getItem(ARCHIVE_KEY);
    const ids = raw ? JSON.parse(raw).ids : [];
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}

/** Saves the archived ids. */
export function saveArchive(storage, ids) {
  try { if (storage) storage.setItem(ARCHIVE_KEY, JSON.stringify({ v: 1, ids: [...ids] })); } catch { /* memory only */ }
}

/** Moves every opened chest of the list into the archive (sealed ones never). Returns the new Set. */
export function archiveOpened(storage, chests) {
  const ids = loadArchive(storage);
  for (const c of chests || []) if (c && c.state === 'opened' && c.id) ids.add(c.id);
  saveArchive(storage, ids);
  return ids;
}

const openedTime = (c) => c.openedAt || c.foundAt || 0;

/**
 * Splits the chest bag into sealed (oldest first, so the first found opens first), opened history and archive (both
 * newest opened first). A chest id in the archive that is still sealed stays sealed.
 */
export function groupChests(chests, archived = new Set()) {
  const sealed = [], opened = [], archive = [];
  for (const c of chests || []) {
    if (!c) continue;
    if (c.state === 'sealed') sealed.push(c);
    else if (archived.has(c.id)) archive.push(c);
    else opened.push(c);
  }
  sealed.sort((a, b) => (a.foundAt || 0) - (b.foundAt || 0));
  const newest = (a, b) => openedTime(b) - openedTime(a);
  opened.sort(newest); archive.sort(newest);
  return { sealed, opened, archive };
}

/** A small leftover: the common silk and XP outcomes of the deck (5 silk, 10 XP). The saved outcome says `rarity`. */
export const isDust = (o) => !!o && (o.kind === 'silk' || o.kind === 'xp') && (o.rarity || o.tier || 'common') === 'common';

/**
 * What came out of an opened chest, for one history row: {kind, id, amount, rarity, dust} or null when the opening
 * kept no outcome. The saved outcome is net/chest-client.js toOpening's {kind, id, amount, rarity}; `id` is a manifest
 * item id for item and NFT outcomes, a title id for titles.
 */
export function outcomeOf(chest) {
  const o = chest && chest.opening && chest.opening.outcome;
  if (!o || !o.kind) return null;
  return { kind: o.kind, id: o.id || o.item || null, amount: o.amount || 0, rarity: o.rarity || o.tier || 'common', dust: isDust(o) };
}

/** The explorer link that proves an opening (its transaction), or null when unverified or the hash is malformed. */
export function verifyHref(chest) {
  const op = chest && chest.opening;
  const tx = op && op.tx;
  return op && op.verified && tx && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(String(tx)) ? `https://testnet.nearblocks.io/txns/${tx}` : null;
}

// The NFT part of the season deck (relayer/lib/chest-deck.js NFT_TIERS and ITEMS; tests check they stay equal):
// positions 0..59 legendary, 60..299 rare, 300..999 uncommon, each tier cycling through its items.
export const NFT_DECK = Object.freeze([
  Object.freeze({ tier: 'legendary', n: 60, items: Object.freeze(['shard_amber_crown', 'shard_amber_blade', 'part_glyph_cogring']) }),
  Object.freeze({ tier: 'rare', n: 240, items: Object.freeze(['shard_violet_cluster', 'shard_violet_spire', 'part_gauge', 'part_brass_lens']) }),
  Object.freeze({ tier: 'uncommon', n: 700, items: Object.freeze(['shard_teal_twin', 'shard_teal_octa', 'part_spindle', 'part_crank', 'part_valve']) }),
]);

/** The item a loot NFT's deck position holds, or null outside the NFT slots. */
export function nftItemAt(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 0) return null;
  let start = 0;
  for (const t of NFT_DECK) {
    if (p < start + t.n) return { item: t.items[(p - start) % t.items.length], tier: t.tier };
    start += t.n;
  }
  return null;
}

/** The tier from a token title "Chest loot #63 (uncommon)". */
const tierFromTitle = (title) => { const m = /\((legendary|rare|uncommon|common|epic)\)\s*$/.exec(String(title || '')); return m ? m[1] : null; };

/**
 * The picture of a loot NFT {item?, tier?, position?, title?} from the item manifest list [{id, icon, icon128, rarity,
 * nameKey}]: {src (relative to assets/items/) or null, item id or null, nameKey or null, rarity, exact}. `exact` is
 * false when no item is known and the card shows the rarity frame alone.
 */
export function nftImage(nft, manifest = []) {
  const at = nft && nft.position != null ? nftItemAt(nft.position) : null;
  const id = (nft && nft.item) || (at && at.item) || null;
  const rarity = (nft && nft.tier) || (at && at.tier) || tierFromTitle(nft && nft.title) || 'common';
  const m = id ? (manifest || []).find((x) => x && x.id === id) : null;
  if (m) return { src: m.icon128 || m.icon || null, item: id, nameKey: m.nameKey || 'item.' + id, rarity, exact: !!(m.icon128 || m.icon) };
  return { src: null, item: id, nameKey: id ? 'item.' + id : null, rarity, exact: false };
}
