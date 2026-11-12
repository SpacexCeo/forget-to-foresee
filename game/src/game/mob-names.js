// What the player reads for each monster (owner 12.11, story TZ §6.8): the skitter is shown as a "stone spider".
// Display only: ids, files (mob_skitter*.glb), audio ids, MOB_TYPES keys, the ftf:mob-killed event, saved profiles and
// logs keep "skitter". One source of truth for names and the aliases an agent or a quest text may use. Pure.

/** Display names per canonical id; `key` is the locale key for UIs that translate. */
export const MOB_DISPLAY = Object.freeze({
  skitter: Object.freeze({ key: 'mob.skitter', one: 'stone spider', many: 'stone spiders', short: 'spider' }),
  hulker: Object.freeze({ key: 'mob.hulker', one: 'hulker', many: 'hulkers', short: 'hulker' }),
  veilbell: Object.freeze({ key: 'mob.veilbell', one: 'veilbell', many: 'veilbells', short: 'veilbell' }),
  crownrift: Object.freeze({ key: 'mob.crownrift', one: 'crownrift', many: 'crownrifts', short: 'crownrift' }),
});

/** Every name that means a monster, lower case, to its canonical id. */
export const MOB_ALIAS = Object.freeze({
  spider: 'skitter', spiders: 'skitter', stone_spider: 'skitter', 'stone-spider': 'skitter', 'stone spider': 'skitter', stone_spiders: 'skitter', 'stone spiders': 'skitter', skitter: 'skitter', skitters: 'skitter',
  hulker: 'hulker', hulkers: 'hulker', veilbell: 'veilbell', veilbells: 'veilbell', crownrift: 'crownrift', crownrifts: 'crownrift',
});

/** A monster name in any accepted spelling (case-insensitive, trimmed) to its canonical id, or null. */
export function resolveMobId(name) {
  if (typeof name !== 'string') return null;
  return MOB_ALIAS[name.trim().toLowerCase()] || null;
}

/** 'stone spider' / 'stone spiders' (n !== 1) for an id or an alias; the id itself for an unknown one. */
export function mobDisplayName(id, n = 1) {
  const c = resolveMobId(id), d = c && MOB_DISPLAY[c];
  if (!d) return String(id);
  return n === 1 ? d.one : d.many;
}
