// Monster resources (owner 12.11 evening, docs/plans/live-market-roadmap.md "Owner addition"): besides chests and the
// spare parts of salvage.js, every creature beyond the walls drops the stuff it is made of, e.g. silk thread and
// chitin from a stone spider, veil dust from a veilbell, ash ore from a hulker, a crown shard from a crownrift.
// Quests ask for them (story worker), the town stalls buy and sell them (economy worker), crafting uses them later.
//
// One roll per kill, seeded by the kill id (`seededRandom('res:' + killId)`), so a replay or an agent gets the same
// drop for the same kill. Every entry of the creature's table rolls on its own (a spider can give thread AND chitin).
// Pity: the resource a quest is waiting for (`want`) never misses more than RESOURCE_RULES.pity times running from a
// creature that can drop it. At most RESOURCE_RULES.dailyCap resource units per UTC day, then none. Pure: state in,
// state out, nothing mutated. The view (scenes/resource-view.js) adds the drop to the inventory with source 'drop'.
import { seededRandom } from './town-economy.js';
import { resolveMobId } from './mob-names.js';

/**
 * Every resource: id (also the inventory and manifest id), locale key, rarity, base value in WHOLE town silk (the
 * economy worker's market starts from it; a kill pays 6 / 15 / 40 / 200 silk, expedition-config.js) and the creature
 * it comes from. English names for agents, logs and tests; players read the locale key `item.<id>`.
 */
export const RESOURCES = Object.freeze({
  res_silk_thread: Object.freeze({ id: 'res_silk_thread', nameKey: 'item.res_silk_thread', name: 'Spider silk thread', rarity: 'common', silk: 4, from: 'skitter' }),
  res_chitin_plate: Object.freeze({ id: 'res_chitin_plate', nameKey: 'item.res_chitin_plate', name: 'Chitin plate', rarity: 'uncommon', silk: 18, from: 'skitter' }),
  res_veil_dust: Object.freeze({ id: 'res_veil_dust', nameKey: 'item.res_veil_dust', name: 'Veil dust', rarity: 'common', silk: 10, from: 'veilbell' }),
  res_bell_glass: Object.freeze({ id: 'res_bell_glass', nameKey: 'item.res_bell_glass', name: 'Bell glass', rarity: 'uncommon', silk: 40, from: 'veilbell' }),
  res_ash_ore: Object.freeze({ id: 'res_ash_ore', nameKey: 'item.res_ash_ore', name: 'Ash ore', rarity: 'common', silk: 25, from: 'hulker' }),
  res_ember_core: Object.freeze({ id: 'res_ember_core', nameKey: 'item.res_ember_core', name: 'Ember core', rarity: 'rare', silk: 90, from: 'hulker' }),
  res_crown_shard: Object.freeze({ id: 'res_crown_shard', nameKey: 'item.res_crown_shard', name: 'Crown shard', rarity: 'rare', silk: 150, from: 'crownrift' }),
  res_rift_heart: Object.freeze({ id: 'res_rift_heart', nameKey: 'item.res_rift_heart', name: 'Rift heart', rarity: 'legendary', silk: 600, from: 'crownrift' }),
});

/** The resource ids, cheapest first within each creature (the table order). */
export const RESOURCE_IDS = Object.freeze(Object.keys(RESOURCES));

/**
 * Drop table per creature (canonical id): each entry rolls on its own with `chance` and gives `min..max` units.
 * A creature not listed drops nothing.
 */
export const DROP_TABLE = Object.freeze({
  skitter: Object.freeze([
    Object.freeze({ id: 'res_silk_thread', chance: 0.55, min: 1, max: 2 }),
    Object.freeze({ id: 'res_chitin_plate', chance: 0.12, min: 1, max: 1 }),
  ]),
  veilbell: Object.freeze([
    Object.freeze({ id: 'res_veil_dust', chance: 0.7, min: 1, max: 2 }),
    Object.freeze({ id: 'res_bell_glass', chance: 0.15, min: 1, max: 1 }),
  ]),
  hulker: Object.freeze([
    Object.freeze({ id: 'res_ash_ore', chance: 0.75, min: 1, max: 3 }),
    Object.freeze({ id: 'res_ember_core', chance: 0.2, min: 1, max: 1 }),
  ]),
  crownrift: Object.freeze([
    Object.freeze({ id: 'res_crown_shard', chance: 0.6, min: 1, max: 2 }),
    Object.freeze({ id: 'res_ash_ore', chance: 0.5, min: 2, max: 4 }),
    Object.freeze({ id: 'res_rift_heart', chance: 0.04, min: 1, max: 1 }),
  ]),
});

export const RESOURCE_RULES = Object.freeze({
  pity: 4,          // the wanted resource drops at the latest on the 5th kill of a creature that can drop it
  dailyCap: 60,     // resource units per UTC day, then none (a drop that would cross the cap is cut to fit)
});

/** A fresh drop state: misses in a row of the wanted resource, the UTC day and the units it has given. */
export const initialDrops = () => Object.freeze({ miss: 0, want: null, day: '', today: 0 });

/** 'YYYY-MM-DD' in UTC for a time in ms. */
export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/** The creatures (canonical ids) that can drop a resource. */
export const sourcesOf = (resId) => Object.keys(DROP_TABLE).filter((m) => DROP_TABLE[m].some((e) => e.id === resId));

/** Base value in whole town silk of `n` units of a resource (0 for an unknown id). */
export const resourceValue = (resId, n = 1) => (RESOURCES[resId] ? RESOURCES[resId].silk * n : 0);

/**
 * One kill's drop. `mob` is an id or an alias ('spider'); `want` the resource an active quest asks for (pity applies
 * to it alone; changing it resets the misses); `day` the kill's UTC day.
 * @returns {{state: {miss:number, want:string|null, day:string, today:number}, drops: {id:string, n:number}[]}}
 */
export function rollDrops(state, { killId, mob, want = null, day = utcDay() }) {
  const R = RESOURCE_RULES, s0 = state || initialDrops();
  const w = RESOURCES[want] ? want : null;
  const today = s0.day === day ? s0.today : 0;
  const miss0 = s0.want === w ? s0.miss : 0;
  const id = resolveMobId(mob), table = id && DROP_TABLE[id];
  const done = (drops, miss) => ({ state: Object.freeze({ miss, want: w, day, today: today + drops.reduce((a, d) => a + d.n, 0) }), drops: Object.freeze(drops) });
  if (!table || today >= R.dailyCap) return done([], miss0);
  const r = seededRandom('res:' + String(killId));
  let left = R.dailyCap - today;
  const drops = [];
  for (const e of table) {
    const roll = r(), size = r();                         // two draws per entry, always, so the table stays stable
    const hit = roll < e.chance || (e.id === w && miss0 >= R.pity);
    if (!hit || left <= 0) continue;
    const n = Math.min(left, e.min + Math.floor(size * (e.max - e.min + 1)));
    drops.push(Object.freeze({ id: e.id, n })); left -= n;
  }
  const canWant = w && table.some((e) => e.id === w);
  const miss = !canWant ? miss0 : drops.some((d) => d.id === w) ? 0 : miss0 + 1;
  return done(drops, miss);
}
