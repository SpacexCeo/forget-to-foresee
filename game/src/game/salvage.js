// Salvage drops (owner's story TZ, item Q2): the fast, certain source of the spare part a citizen asks for. Every
// monster kill rolls once, seeded by its kill id (so a replay or an agent gets the same part for the same kill): a
// stone spider (id `skitter`) drops a part 60 % of the time and never misses three times running (the 3rd kill after
// two misses always drops), veilbells and the hulker drop uncommon or rare parts, the crownrift always drops a rare
// (5 % legendary). At most SALVAGE.dailyCap parts per UTC day. Pure: state in, state out, nothing mutated. The quest
// rules (quest-rules.js) re-export salvageRoll; the view adds the part to the inventory with source 'salvage'.
import { seededRandom } from './town-economy.js';
import { resolveMobId } from './mob-names.js';

export const SALVAGE = Object.freeze({
  spiderChance: 0.6,          // a stone spider (skitter) drops a part this often (owner 13.11: was 0.3, too rare) ...
  pity: 2,                    // ... and after this many misses in a row the next one always drops (the 3rd kill at worst)
  uncommonShare: 0.15,        // of a spider's drops, the rest common
  dailyCap: 12,               // salvage parts per UTC day, then none
  legendaryShare: 0.05,       // of the crownrift's drops
  common: Object.freeze(['part_gear', 'part_spring_coil', 'part_chain_link', 'part_rivet_plate']),
  uncommon: Object.freeze(['part_spindle', 'part_crank', 'part_valve']),
  rare: Object.freeze(['part_gauge', 'part_brass_lens']),
  legendary: Object.freeze(['part_glyph_cogring']),
  /** veilbell and hulker: chance of a drop and the share of rare among their (uncommon or rare) drops */
  bigChance: 0.5, bigRareShare: 0.25,
});

/** A fresh salvage state: misses in a row (spiders), the UTC day and how many parts it has given. */
export const initialSalvage = () => Object.freeze({ miss: 0, day: '', today: 0 });

/** 'YYYY-MM-DD' in UTC for a time in ms. */
export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * One kill's roll. `mob` is an id or an alias ('spider'); `day` the kill's UTC day ('YYYY-MM-DD', defaults to now).
 * @returns {{state: {miss:number, day:string, today:number}, partId: string|null}}
 */
export function salvageRoll(state, { killId, mob, day = utcDay() }) {
  const S = SALVAGE, s0 = state || initialSalvage();
  const today = s0.day === day ? s0.today : 0;
  const id = resolveMobId(mob);
  const keep = (partId, miss) => ({ state: Object.freeze({ miss, day, today: today + (partId ? 1 : 0) }), partId });
  if (!id || today >= S.dailyCap) return keep(null, s0.miss);
  const r = seededRandom('salvage:' + String(killId));
  if (id === 'skitter') {
    const drop = s0.miss >= S.pity || r() < S.spiderChance;
    if (!drop) return keep(null, s0.miss + 1);
    return keep(r() < S.uncommonShare ? pick(S.uncommon, r()) : pick(S.common, r()), 0);
  }
  if (id === 'crownrift') return keep(r() < S.legendaryShare ? pick(S.legendary, r()) : pick(S.rare, r()), s0.miss);
  if (r() >= S.bigChance) return keep(null, s0.miss);                                   // veilbell, hulker
  return keep(r() < S.bigRareShare ? pick(S.rare, r()) : pick(S.uncommon, r()), s0.miss);
}
