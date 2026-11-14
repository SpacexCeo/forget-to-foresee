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

/**
 * Loot on the ground (sprint 6.5): the beam height and radius (m), colour, ground ring (m, 0 = none) and its pulse (s,
 * 0 = static) per rarity. The colours are the rarity palette; the rarity name is always written next to them (R12).
 * A common drop has no beam, only a 0.5 m sparkle.
 */
export const LOOT_FX = Object.freeze({
  common: Object.freeze({ beam: 0, radius: 0, color: 0xb8b8b8, ring: 0, pulse: 0, sparkle: 0.5 }),
  uncommon: Object.freeze({ beam: 3, radius: 0.18, color: 0x5ccf5c, ring: 0.9, pulse: 0, sparkle: 0 }),
  rare: Object.freeze({ beam: 5, radius: 0.2, color: 0x4aa3ff, ring: 1.0, pulse: 1.6, sparkle: 0 }),
  epic: Object.freeze({ beam: 7, radius: 0.22, color: 0xb06cff, ring: 1.1, pulse: 1.4, sparkle: 0 }),
  legendary: Object.freeze({ beam: 10, radius: 0.26, color: 0xff9a2e, ring: 1.3, pulse: 1.2, sparkle: 0 }),
  mythic: Object.freeze({ beam: 12, radius: 0.3, color: 0xff5c8a, ring: 1.5, pulse: 1.0, sparkle: 0 }),
});
/** At most this many beams at once (the oldest fade), none beyond this distance, and an uncollected chest goes to the bag after this. */
export const LOOT = Object.freeze({ maxBeams: 12, cullM: 40, autoBagS: 30 });
/** The ground look of a dropped box tier. Pure. */
export const lootFxOf = (tier) => LOOT_FX[tier] || LOOT_FX.common;

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
/**
 * Chest moments as window events (owner P0 14.11: "pick up a chest" must count, kept apart from the rest): 'pickup'
 * (Iris walked onto a dropped chest: scenes/town-monsters.js), 'bagged' (a chest went into the bag, from any source),
 * 'open' (a sealed chest was opened) and 'contents' (what it held). detail: {phase, id, tier, source?, outcome?}.
 */
export const CHEST_EVENT = 'ftf:chest';
export const CHEST_PHASES = Object.freeze(['pickup', 'bagged', 'open', 'contents']);
export function chestEvent(phase, detail = {}, win = globalThis) {
  try { if (win && typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') win.dispatchEvent(new CustomEvent(CHEST_EVENT, { detail: { phase, ...detail } })); } catch { /* no page */ }
}

export function createChestBag({ storage = null, now = () => Date.now(), win = globalThis } = {}) {
  const read = () => { try { const raw = storage && storage.getItem(CHEST_KEY); return raw ? (JSON.parse(raw).chests || []).filter((c) => c && c.id && CHEST_TIERS.includes(c.tier)) : []; } catch { return []; } };
  let list = read();
  const subs = new Set();
  const save = () => { try { if (storage) storage.setItem(CHEST_KEY, JSON.stringify({ v: 1, chests: list })); } catch { /* memory only */ } subs.forEach((f) => f()); };
  return {
    list: () => list.slice(),
    /** Re-reads the saved chests (a fight elsewhere in the game may have dropped one since this bag was made). */
    reload() { list = read(); for (const fn of [...subs]) { try { fn(); } catch { /* a listener's own problem */ } } },
    sealed: () => list.filter((c) => c.state === 'sealed'),
    opened: () => list.filter((c) => c.state === 'opened'),
    get: (id) => list.find((c) => c.id === id) || null,
    /** A new sealed chest found in the world. */
    add({ tier = 'common', source = 'monster' } = {}) {
      const c = { id: uid(), tier: CHEST_TIERS.includes(tier) ? tier : 'common', source, foundAt: now(), state: 'sealed' };
      list = [c, ...list]; save();
      chestEvent('bagged', { id: c.id, tier: c.tier, source }, win);
      return c;
    },
    /** The chest service opened it: keep the opening (outcome, proof, verification) with the chest. */
    settle(id, opening) {
      const c = list.find((x) => x.id === id); if (!c || c.state !== 'sealed') return null;
      c.state = 'opened'; c.opening = opening; c.openedAt = now(); save();
      chestEvent('open', { id: c.id, tier: c.tier }, win);
      chestEvent('contents', { id: c.id, tier: c.tier, outcome: (opening && opening.outcome) || null }, win);
      return c;
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
