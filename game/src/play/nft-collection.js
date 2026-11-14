// The NFT cards a player can earn (owner 14.11, the painted card set): the Sheriffchenko skin from the Wheel of Fortune,
// the three companion dragons the Hatchkeeper gives, and the whitelist pass at a season's end. The NFTs tab shows each
// card with what it takes to earn it, and marks the ones this player already holds. Pure: the view passes what boot-world
// and the chain reads know (window.__ftfSkins, window.__ftfPet, the pass claim in storage).

/**
 * Memory shard NFTs (ftf-shards.testnet, net/shard-nft.js): one painted shard per kind of memory (owner 14.11: the cards
 * were text boxes). Eight kinds, eight painted shards (assets/items/icons, owner-supplied, ChatGPT image); the card frame
 * takes the colour of the clan that forgot the memory.
 */
export const SHARD_ART = Object.freeze({ first: 'shard_pearl_drop', call: 'shard_teal_twin', gift: 'shard_amber_crown', betrayal: 'shard_violet_spire',
  debt: 'shard_pearl_tablet', promise: 'shard_teal_octa', insight: 'shard_violet_cluster', lie: 'shard_amber_blade' });
export const CLAN_COLOR = Object.freeze({ iris: '#b9a6ff', salt: '#e8e2d3', ash: '#9aa3ab', moss: '#86c46e', amber: '#ffc46b', frost: '#a8e4ff' });
/**
 * A memory shard token's card: {art (relative to assets/items/), kind, clan, color} from its data, or from its label
 * "clan · kind" when only that is known; null for anything that is not a known shard. Pure.
 */
export function shardCard(item) {
  if (!item || item.kind !== 'shard') return null;
  let clan = item.clan || null, kind = item.shardKind || null;
  if ((!clan || !kind) && typeof item.label === 'string') { const m = /^\s*([a-z]+)\s*·\s*([a-z]+)\s*$/.exec(item.label); if (m) { clan = clan || m[1]; kind = kind || m[2]; } }
  if (!SHARD_ART[kind]) return null;
  return { art: `icons/${SHARD_ART[kind]}_256.webp`, kind, clan: CLAN_COLOR[clan] ? clan : null, color: CLAN_COLOR[clan] || '#c5a469' };
}
/** A companion dragon token's card art (relative to assets/), or null. */
export const dragonCardArt = (kind) => (['cinder', 'nacre', 'rill'].includes(kind) ? `nft/card_${kind}_m.webp` : null);

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
