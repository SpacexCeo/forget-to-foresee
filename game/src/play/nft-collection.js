// The NFT cards a player can earn (owner 14.11, the painted card set): the Sheriffchenko skin from the Wheel of Fortune,
// the three companion dragons the Hatchkeeper gives, and the whitelist pass at a season's end. The NFTs tab shows each
// card with what it takes to earn it, and marks the ones this player already holds. Pure: the view passes what boot-world
// and the chain reads know (window.__ftfSkins, window.__ftfPet, the pass claim in storage).

/** Card art relative to assets/: `art` the 600×900 card, `thumb` the 300×450 grid copy. */
export const COLLECTION = Object.freeze([
  Object.freeze({ id: 'sheriffchenko', kind: 'skin', art: 'nft/sherif_card.webp', thumb: 'nft/sherif_card_m.webp', nameKey: 'day1.skin.sheriffchenko', howKey: 'nft.how.wheel' }),
  Object.freeze({ id: 'cinder', kind: 'dragon', art: 'nft/card_cinder.webp', thumb: 'nft/card_cinder_m.webp', nameKey: 'hatch.kind.cinder', howKey: 'nft.how.hatch' }),
  Object.freeze({ id: 'nacre', kind: 'dragon', art: 'nft/card_nacre.webp', thumb: 'nft/card_nacre_m.webp', nameKey: 'hatch.kind.nacre', howKey: 'nft.how.hatch' }),
  Object.freeze({ id: 'rill', kind: 'dragon', art: 'nft/card_rill.webp', thumb: 'nft/card_rill_m.webp', nameKey: 'hatch.kind.rill', howKey: 'nft.how.hatch' }),
  Object.freeze({ id: 'pass', kind: 'pass', art: 'nft/card_pass.webp', thumb: 'nft/card_pass_m.webp', nameKey: 'nft.card.pass', howKey: 'nft.how.pass' }),
]);

/**
 * The collection as the player holds it: [{...card, owned}], owned cards first, then in collection order.
 * @param {{skins?: {owned?: object}|null, pet?: {kind?: string}|null, dragons?: string[], pass?: boolean}} [o]
 */
export function collectionView({ skins = null, pet = null, dragons = [], pass = false } = {}) {
  const ownedDragons = new Set([...(dragons || []), ...(pet && pet.kind ? [pet.kind] : [])]);
  const owned = (c) => (c.kind === 'skin' ? !!(skins && skins.owned && skins.owned[c.id]) : c.kind === 'dragon' ? ownedDragons.has(c.id) : !!pass);
  const list = COLLECTION.map((c, i) => ({ ...c, owned: owned(c), i }));
  return list.sort((a, b) => (b.owned - a.owned) || (a.i - b.i)).map(({ i, ...c }) => c);
}
