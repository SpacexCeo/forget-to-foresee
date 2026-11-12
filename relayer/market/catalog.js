// The town traders' cast and goods (docs/town-economy.md). Pure data, shared by the relayer's daemon, the deploy script and
// the game's ticker. Base prices are in fifths of a silk (lib/town-traders.js
// PRICE_UNIT), drifting mean-reverting between half and twice the base. Trader keys are the townsfolk of game/src/play/townsfolk-plan.js and
// the clans of game/src/net/shard-nft.js.

/** Goods: id, base price, who makes and sells it. */
export const ITEMS = Object.freeze([
  ['bread', 3, 'baker'], ['honey_cake', 7, 'baker'],
  ['stew', 5, 'innkeeper'], ['cider', 4, 'innkeeper'],
  ['ink', 4, 'scribe'], ['scroll_copy', 12, 'scribe'],
  ['shard_dust', 15, 'shardkeeper'], ['polished_shard', 40, 'shardkeeper'],
  ['incense', 4, 'shrinekeeper'], ['candles', 2, 'lamplighter'], ['lamp_oil', 3, 'lamplighter'],
  ['ballad', 6, 'musician'], ['delivery', 3, 'courier'], ['broom', 5, 'sweeper'],
  ['escort', 10, 'guard'], ['herbal_remedy', 8, 'elder'], ['wildflowers', 1, 'child_a'], ['river_stones', 1, 'child_b'],
  ['woven_silk', 20, 'iris'], ['salt', 2, 'salt'], ['charcoal', 3, 'ash'], ['moss_poultice', 6, 'moss'],
  ['amber_resin', 14, 'amber'], ['ice_block', 2, 'frost'], ['bronze_gear', 16, 'tinker'],
].map(([id, base, maker]) => Object.freeze({ id, base, maker, kind: 'good' })));

/**
 * Monster resources (owner, 12.11 evening): what the hillside creatures drop, also sold at the town's stalls for
 * players who cannot farm them, and bought back from players (market/prices.js buybackOf). Scarcer than goods: each
 * stall restocks `rate` an hour up to `cap` (its hunters' haul). Base prices (fifths of a silk) follow the silk a kill
 * of that creature pays (game/src/game/expedition-config.js kill: 6 / 15 / 40 / 200 silk). The combat worker's drop
 * table should use these ids; the first NEP-245 token ids (roadmap item 4) are these resources.
 */
export const RESOURCES = Object.freeze([
  ['spider_silk_thread', 15, 'guard', 'skitter'], ['chitin_plate', 25, 'guard', 'skitter'],
  ['veil_dust', 75, 'shrinekeeper', 'veilbell'], ['ash_ore', 200, 'ash', 'hulker'], ['crown_shard', 1000, 'shardkeeper', 'crownrift'],
].map(([id, base, maker, from]) => Object.freeze({ id, base, maker, from, kind: 'resource', cap: 40, ref: 20, rate: 6, start: 20 })));
/** Everything the stalls sell. */
export const CATALOG = Object.freeze([...ITEMS, ...RESOURCES]);

/** Traders: 13 townsfolk + 7 clan agents (the six clans and the tinkers, who sell the parts of the crafting bench). */
export const TOWNSFOLK = Object.freeze(['guard', 'shardkeeper', 'scribe', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician', 'sweeper', 'lamplighter', 'courier', 'child_a', 'child_b']);
export const CLAN_AGENTS = Object.freeze(['iris', 'salt', 'ash', 'moss', 'amber', 'frost', 'tinker']);
export const TRADERS = Object.freeze([...TOWNSFOLK, ...CLAN_AGENTS]);

/** The town contract; every NPC has its own wallet under it (owner, 12.11). */
export const TOWN_ACCOUNT = 'ftf-town.testnet';
/** Testnet account of a trader: trader-01 … trader-20.<town>, in the order of TRADERS. */
export const traderAccount = (key, parent = TOWN_ACCOUNT) => `trader-${String(TRADERS.indexOf(key) + 1).padStart(2, '0')}.${parent}`;
/** The trader key of an account (null when it is not a trader's). */
export function traderKey(account) {
  const m = /^trader-(\d{2})\./.exec(String(account || ''));
  const k = m && TRADERS[Number(m[1]) - 1];
  return k || null;
}
/** The clans' own wallets: they pledge to the works and enter tournaments (lib/clan-actions.js). */
export const CLAN_WALLETS = Object.freeze(['salt', 'ash', 'moss', 'amber', 'frost', 'iris']);
export const clanAccount = (clan, parent = TOWN_ACCOUNT) => `clan-${clan}.${parent}`;
/** Contract methods each kind of wallet's function-call key may call. */
export const TRADER_METHODS = Object.freeze(['trade']);
export const CLAN_METHODS = Object.freeze(['trade', 'stake', 'claim', 'begin_unbond', 'finish_unbond', 'enter_tournament']);
/** Starting town silk per trader. */
export const START_BALANCE = 1000;
