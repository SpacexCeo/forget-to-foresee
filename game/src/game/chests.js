// Loot chests (night plan 12.11, "Loot chests from monsters"): the local chest bag and the drop rules. A monster
// beaten outside the walls may drop a chest; Iris picks it up into the bag. A chest is SEALED until the chest service
// opens it (net/chest-client.js): what is inside comes from the season deck and its Merkle proof, never from this
// file. The tier (common / rare / legendary) is only the box Iris found: it never changes the odds.
export const CHEST_KEY = 'ftf.chests.v1';
export const CHEST_TIERS = Object.freeze(['common', 'rare', 'legendary']);
/** Drop rules: the first monster always drops, then about one in three. */
export const DROP = Object.freeze({ first: true, chance: 0.36 });
/** Box tiers by weight (the box only). */
export const TIER_WEIGHTS = Object.freeze({ common: 80, rare: 17, legendary: 3 });

/** Whether the n-th kill (0-based) drops a chest, from one uniform roll in [0, 1). */
export function rollDrop(roll, kills) {
  if (DROP.first && kills === 0) return true;
  return roll < DROP.chance;
}

/** The box tier from one uniform roll in [0, 1). */
export function chestTier(roll) {
  const total = CHEST_TIERS.reduce((s, t) => s + TIER_WEIGHTS[t], 0);
  let acc = 0;
  for (const t of CHEST_TIERS) { acc += TIER_WEIGHTS[t] / total; if (roll < acc) return t; }
  return 'common';
}

const uid = () => {
  try { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

/**
 * The chest bag in this browser. Each chest: {id, tier, source, foundAt, state: 'sealed'|'opened', opening?}.
 * @param {{storage?: object, now?: () => number}} [o]
 */
export function createChestBag({ storage = null, now = () => Date.now() } = {}) {
  let list = [];
  try { const raw = storage && storage.getItem(CHEST_KEY); if (raw) list = (JSON.parse(raw).chests || []).filter((c) => c && c.id && CHEST_TIERS.includes(c.tier)); } catch { list = []; }
  const subs = new Set();
  const save = () => { try { if (storage) storage.setItem(CHEST_KEY, JSON.stringify({ v: 1, chests: list })); } catch { /* memory only */ } subs.forEach((f) => f()); };
  return {
    list: () => list.slice(),
    sealed: () => list.filter((c) => c.state === 'sealed'),
    opened: () => list.filter((c) => c.state === 'opened'),
    get: (id) => list.find((c) => c.id === id) || null,
    /** A new sealed chest found in the world. */
    add({ tier = 'common', source = 'monster' } = {}) {
      const c = { id: uid(), tier: CHEST_TIERS.includes(tier) ? tier : 'common', source, foundAt: now(), state: 'sealed' };
      list = [c, ...list]; save(); return c;
    },
    /** The chest service opened it: keep the opening (outcome, proof, verification) with the chest. */
    settle(id, opening) {
      const c = list.find((x) => x.id === id); if (!c || c.state !== 'sealed') return null;
      c.state = 'opened'; c.opening = opening; c.openedAt = now(); save(); return c;
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
