// Monster resources the citizens' quests ask for (owner, live-market roadmap): what each creature may drop and a
// deterministic roll from the kill's id (play/mobs.js killId), so a reload never re-rolls. Pure. The combat stream's
// drop table replaces DROPS when it lands (same ids); until then the story (?story=1) rolls these itself.
import { sha256 } from './crypto.js';

export const RESOURCE_IDS = Object.freeze(['spider_silk_thread', 'chitin_plate', 'veil_dust', 'ash_ore', 'crown_shard']);
/** Chance per kill (0..1) of one unit, per creature. */
export const DROPS = Object.freeze({
  skitter: Object.freeze({ spider_silk_thread: 0.6, chitin_plate: 0.25 }),
  veilbell: Object.freeze({ veil_dust: 0.7 }),
  hulker: Object.freeze({ ash_ore: 0.8, chitin_plate: 0.5 }),
  crownrift: Object.freeze({ crown_shard: 1 }),
});

/** The drops of one kill: [{id, n}] (deterministic in killId). */
export function rollDrops(killId, mob) {
  const table = DROPS[mob]; if (!table || !killId) return [];
  const h = sha256('ftf-drop-1|' + killId + '|' + mob);
  return Object.entries(table).map(([id, p], i) => ({ id, n: parseInt(h.slice(i * 8, i * 8 + 8), 16) / 0x100000000 < p ? 1 : 0 })).filter((d) => d.n > 0);
}

/** An abstract hunt's yield (game/hunt.js): the expected drops of `kills` creatures, rounded up. */
export function huntYield(mob, kills) {
  const table = DROPS[mob]; if (!table || !(kills > 0)) return [];
  return Object.entries(table).map(([id, p]) => ({ id, n: Math.ceil(kills * p) })).filter((d) => d.n > 0);
}

/** Missing resources for a quest's needs given counts {id: n}: [{id, need, have}] (empty when met). */
export function missingFor(needs = {}, have = {}) {
  return Object.entries(needs || {}).map(([id, need]) => ({ id, need, have: Math.max(0, Number(have && have[id]) || 0) })).filter((m) => m.have < m.need);
}
