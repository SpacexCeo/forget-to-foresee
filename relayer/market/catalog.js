// The town market's cast and goods (docs/market.md). Pure data, shared by the relayer's daemon, the deploy script and
// the game's ticker. Base prices are in town silk (the town economy's in-game unit, game/src/game/town-economy.js);
// the contract accepts half to twice the base. Trader keys are the townsfolk of game/src/play/townsfolk-plan.js and
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
].map(([id, base, maker]) => Object.freeze({ id, base, maker })));

/** Traders: 13 townsfolk + 7 clan agents (the six clans and the tinkers, who sell the parts of the crafting bench). */
export const TOWNSFOLK = Object.freeze(['guard', 'shardkeeper', 'scribe', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician', 'sweeper', 'lamplighter', 'courier', 'child_a', 'child_b']);
export const CLAN_AGENTS = Object.freeze(['iris', 'salt', 'ash', 'moss', 'amber', 'frost', 'tinker']);
export const TRADERS = Object.freeze([...TOWNSFOLK, ...CLAN_AGENTS]);

/** Testnet account of a trader: tf-<key with - for _>.<parent>. */
export const traderAccount = (key, parent = 'ftf-coordinator.testnet') => `tf-${key.replace(/_/g, '-')}.${parent}`;
/** The trader key of an account (null when it is not a trader's). */
export function traderKey(account) {
  const m = /^tf-([a-z0-9-]+)\./.exec(String(account || ''));
  const k = m && m[1].replace(/-/g, '_');
  return k && TRADERS.includes(k) ? k : null;
}
/** Starting town silk per trader. */
export const START_BALANCE = 1000;
