// Which heroine the player may wear (K in the town): Iris always, Elise after Day 1, and the wheel's skin NFT
// ("Sheriffchenko", contracts/skin-nft) for the accounts that own it. Pure: boot-world.js holds the state.

/** The order K cycles through. */
export const SKIN_ORDER = Object.freeze(['iris', 'elise', 'sheriffchenko']);

/**
 * The next skin after `current` among those the player has.
 * @param {string} current
 * @param {{elise?: boolean, sheriffchenko?: boolean}} owned  Iris is always there
 */
export function nextSkin(current, owned = {}) {
  const have = SKIN_ORDER.filter((id) => id === 'iris' || owned[id]);
  const i = have.indexOf(current);
  return have[(i + 1) % have.length] || 'iris';
}

/**
 * Whether this browser's guest account owns the skin NFT: a view call on the skin contract (never signs).
 * Resolves false when there is no guest, no network or no token.
 * @param {{storage: object, skinOf: (accountId: string) => Promise<string|null>, guestFrom: (storage: object) => ({accountId: string}|null)}} o
 */
export async function ownsWheelSkin({ storage, skinOf, guestFrom }) {
  try { const g = guestFrom(storage); return g ? !!(await skinOf(g.accountId)) : false; } catch { return false; }
}

/** How long a try-on lasts (s) when the player does not own the skin. */
export const TRY_ON_SECONDS = 30;

/**
 * Wearing or trying on a skin from the menu (the wheel's preview, the inventory's wardrobe). Owned (Iris always):
 * worn and remembered. Not owned: worn for TRY_ON_SECONDS, then back to `current`, never remembered. Unknown: nothing.
 * Pure. Returns {wear, remember, revertTo, seconds} or null.
 * @param {string} current @param {string} id @param {{elise?: boolean, sheriffchenko?: boolean}} owned
 */
export function wearPlan(current, id, owned = {}) {
  if (!SKIN_ORDER.includes(id)) return null;
  const mine = id === 'iris' || !!owned[id];
  if (mine) return { wear: id, remember: true, revertTo: null, seconds: 0 };
  return { wear: id, remember: false, revertTo: SKIN_ORDER.includes(current) && current !== id ? current : 'iris', seconds: TRY_ON_SECONDS };
}

/** The wardrobe rows for the inventory: every skin with whether the player has it and wears it now. Pure. */
export function wardrobe(current, owned = {}) {
  return SKIN_ORDER.map((id) => ({ id, owned: id === 'iris' || !!owned[id], worn: id === current }));
}
