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
