// What Iris brought back from the tournament (owner 14.11): a snapshot of the town ledger and the chest bag when she
// leaves for the archipelago, compared with the same snapshot on her return. Only what the season actually changed
// shows: XP, a new level or title, town silk, verified trials, signs read, memories given up, new chests, her shard
// NFTs. Nothing is invented; a season that changed nothing gives an empty list (the card then just welcomes her back).
// Pure: the ledger and the bag are read through their public getters. The card itself: play/season-loot-ui.js.

/** The town ledger and the chest bag now (game/town-economy.js createTownLedger, game/chests.js createChestBag). */
export function lootSnapshot({ ledger = null, chests = null } = {}) {
  const lv = ledger && ledger.level ? ledger.level : { level: 1, title: null };
  const stats = (ledger && ledger.stats) || {};
  return {
    xp: ledger ? Number(ledger.xp) || 0 : 0,
    level: lv.level || 1,
    title: lv.title || null,
    silkC: ledger ? Number(ledger.silk) || 0 : 0,
    trials: stats.trialsVerified || 0,
    signs: stats.signsRead || 0,
    forgotten: stats.memoriesForgotten || 0,
    chests: chests && chests.list ? chests.list().map((c) => ({ id: c.id, tier: c.tier })) : [],
  };
}

/** Icons (game/public/assets/ui/icons/…): every row has one. */
export const LOOT_ICONS = Object.freeze({
  xp: 'hud/achievements', level: 'hud/achievements', title: 'hud/profile', silk: 'silk', trials: 'hud/log', signs: 'hud/quest',
  forgotten: 'hud/back', chest: 'hud/bag', shard: 'hud/nfts',
});
/** The order on the card: the big news first. */
const ORDER = ['level', 'title', 'shard', 'chest', 'silk', 'xp', 'trials', 'signs', 'forgotten'];

/**
 * The rows of the card: [{kind, n?, tier?, title?, level?, href?}] with only what the season changed.
 * @param {object} before lootSnapshot() as she left the town
 * @param {object} after lootSnapshot() on her return
 * @param {{shards?: Array<{tokenId: string, url?: string}>}} [season] her minted shard NFTs (play/biography.js shards)
 */
export function seasonLoot(before, after, { shards = [] } = {}) {
  if (!before || !after) return [];
  const rows = [];
  const gain = (k) => Math.max(0, (after[k] || 0) - (before[k] || 0));
  if (after.level > before.level) rows.push({ kind: 'level', level: after.level });
  if (after.title && after.title !== before.title) rows.push({ kind: 'title', title: after.title });
  for (const s of shards || []) if (s && s.tokenId) rows.push({ kind: 'shard', tokenId: String(s.tokenId), href: s.url || null });
  const had = new Set((before.chests || []).map((c) => c.id)), byTier = {};
  for (const c of after.chests || []) if (!had.has(c.id)) byTier[c.tier] = (byTier[c.tier] || 0) + 1;
  for (const tier of ['legendary', 'rare', 'common']) if (byTier[tier]) rows.push({ kind: 'chest', tier, n: byTier[tier] });
  if (gain('silkC')) rows.push({ kind: 'silk', n: gain('silkC') });
  if (gain('xp')) rows.push({ kind: 'xp', n: gain('xp') });
  if (gain('trials')) rows.push({ kind: 'trials', n: gain('trials') });
  if (gain('signs')) rows.push({ kind: 'signs', n: gain('signs') });
  if (gain('forgotten')) rows.push({ kind: 'forgotten', n: gain('forgotten') });
  return rows.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** Town silk is kept in hundredths: the card shows whole silk with up to two decimals ("12", "0.5"). */
export const silkText = (c) => String(Math.round(c) / 100);
