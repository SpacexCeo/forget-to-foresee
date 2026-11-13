// Skills as data (sprint plan 5.7): the four base skills (always known) and the 15 tree nodes in three branches that
// fit Iris's lore (Linguist, Scholar, Warden). Base skills keep the game's existing cooldowns, ranges and damage
// (play/mobs.js ACTIONS, scenes/town-casting-fx.js CASTS); this file only adds the HUD data (mana, slot, text).
// Pure data.
import { ACTIONS } from '../play/mobs.js';
import { CASTS } from '../scenes/town-casting-fx.js';

export const GLOBAL_COOLDOWN_MS = 500;
export const BRANCHES = Object.freeze([
  Object.freeze({ id: 'linguist', name: 'Linguist', color: 'var(--ftf-info, #4aa3ff)', glyph: 'speech' }),
  Object.freeze({ id: 'scholar', name: 'Scholar', color: 'var(--ftf-gold, #f6c860)', glyph: 'book' }),
  Object.freeze({ id: 'warden', name: 'Warden', color: 'var(--ftf-ok, #5ccf8a)', glyph: 'shield' }),
]);

const f = Object.freeze;
/** The four base skills: slot 1 to 4, their direct key (keybinds action id) and the existing timings. */
export const BASE_SKILLS = f([
  f({ id: 'strike', name: 'Strike', slot: 1, action: 'strike', kind: 'melee', mana: 0, cooldownMs: Math.round(ACTIONS.strike.cooldown * 1000), range: ACTIONS.strike.reach, needsTarget: false, icon: 'strike', text: 'A quick blow. Costs nothing.' }),
  f({ id: 'lance', name: 'Lance', slot: 2, action: 'lance', kind: 'ranged', mana: 8, cooldownMs: Math.round(CASTS.lance.cooldown * 1000), range: CASTS.lance.range, needsTarget: false, icon: 'lance', text: 'A lance of focused sound. Hits one target from a distance.' }),
  f({ id: 'snare', name: 'Snare', slot: 3, action: 'snare', kind: 'control', mana: 12, cooldownMs: Math.round(CASTS.snare.cooldown * 1000), range: CASTS.snare.range, needsTarget: false, icon: 'snare', text: 'Words that tangle the legs of an enemy. It cannot move for a moment.' }),
  f({ id: 'dash', name: 'Dash', slot: 4, action: 'dash', kind: 'movement', mana: 0, cooldownMs: Math.round(ACTIONS.dash.cooldown * 1000), range: ACTIONS.dash.distance, needsTarget: false, icon: 'dash', text: 'A short sprint. You cannot be hit while it lasts.' }),
]);

/** The 15 tree nodes, exact numbers of the plan. `requires` is the node before it in the same branch. */
export const NODES = f([
  f({ id: 'ling_diction', branch: 'linguist', tier: 1, name: 'Clear Diction', kind: 'passive', cost: 1, level: 2, requires: null, mana: 0, cooldownMs: 0, effect: f({ type: 'skillDamage', skill: 'lance', pct: 0.1 }), icon: 'diction', text: 'Your words land cleaner. Lance does 10% more damage.' }),
  f({ id: 'ling_echo', branch: 'linguist', tier: 2, name: 'Echo Word', kind: 'active', cost: 1, level: 3, requires: 'ling_diction', mana: 12, cooldownMs: 12000, needsTarget: true, range: 13, effect: f({ type: 'echo', power: 0.6 }), icon: 'echo', text: 'Say it again. Repeats your last attack at 60% power.' }),
  f({ id: 'ling_hush', branch: 'linguist', tier: 3, name: 'Hushing Phrase', kind: 'active', cost: 2, level: 5, requires: 'ling_echo', mana: 20, cooldownMs: 20000, effect: f({ type: 'hush', radius: 6, seconds: 3, bossSeconds: 1.5 }), icon: 'hush', text: 'A word that stills a crowd. Nearby enemies cannot attack for 3 seconds.' }),
  f({ id: 'ling_fluent', branch: 'linguist', tier: 4, name: 'Fluent', kind: 'passive', cost: 2, level: 7, requires: 'ling_hush', mana: 0, cooldownMs: 0, effect: f({ type: 'manaRegen', pct: 0.25 }), icon: 'fluent', text: 'You speak without effort. Mana returns 25% faster.' }),
  f({ id: 'ling_babel', branch: 'linguist', tier: 5, name: 'Babel Burst', kind: 'active', cost: 3, level: 10, requires: 'ling_fluent', mana: 40, cooldownMs: 45000, needsTarget: true, range: 13, ultimate: true, effect: f({ type: 'burst', radius: 4, power: 2.5, of: 'lance' }), icon: 'babel', text: 'Every language at once. A burst of sound hurts all enemies close to the target.' }),
  f({ id: 'sch_notes', branch: 'scholar', tier: 1, name: 'Field Notes', kind: 'passive', cost: 1, level: 2, requires: null, mana: 0, cooldownMs: 0, effect: f({ type: 'killXp', pct: 0.1 }), icon: 'notes', text: 'You write everything down. Kills give 10% more XP.' }),
  f({ id: 'sch_catalog', branch: 'scholar', tier: 2, name: 'Cataloguer', kind: 'passive', cost: 1, level: 3, requires: 'sch_notes', mana: 0, cooldownMs: 0, effect: f({ type: 'dropChance', pct: 0.1 }), icon: 'catalog', text: 'You know where to look. Monsters drop things 10% more often.' }),
  f({ id: 'sch_insight', branch: 'scholar', tier: 3, name: 'Insight', kind: 'active', cost: 2, level: 5, requires: 'sch_catalog', mana: 15, cooldownMs: 25000, needsTarget: true, range: 13, effect: f({ type: 'mark', pct: 0.25, seconds: 15 }), icon: 'insight', text: 'You see its weak point. The marked enemy takes 25% more damage for 15 seconds.' }),
  f({ id: 'sch_reader', branch: 'scholar', tier: 4, name: 'Speed Reader', kind: 'passive', cost: 2, level: 7, requires: 'sch_insight', mana: 0, cooldownMs: 0, effect: f({ type: 'questXp', pct: 0.15 }), icon: 'reader', text: 'You read a notice once. Quests give 15% more XP.' }),
  f({ id: 'sch_eye', branch: 'scholar', tier: 5, name: 'Omniscient Eye', kind: 'active', cost: 3, level: 10, requires: 'sch_reader', mana: 25, cooldownMs: 90000, ultimate: true, effect: f({ type: 'reveal', seconds: 20, lootRange: 2 }), icon: 'eye', text: 'For a short time you see everything. Enemies and loot show far away.' }),
  f({ id: 'war_stance', branch: 'warden', tier: 1, name: 'Steady Stance', kind: 'passive', cost: 1, level: 2, requires: null, mana: 0, cooldownMs: 0, effect: f({ type: 'maxHp', pct: 0.1 }), icon: 'stance', text: 'You plant your feet. Max health +10%.' }),
  f({ id: 'war_brace', branch: 'warden', tier: 2, name: 'Brace', kind: 'active', cost: 1, level: 3, requires: 'war_stance', mana: 10, cooldownMs: 18000, effect: f({ type: 'brace', pct: 0.35, seconds: 4 }), icon: 'brace', text: 'Hold fast. You take 35% less damage for 4 seconds.' }),
  f({ id: 'war_wind', branch: 'warden', tier: 3, name: 'Second Wind', kind: 'passive', cost: 2, level: 5, requires: 'war_brace', mana: 0, cooldownMs: 0, effect: f({ type: 'hpRegen', mult: 2 }), icon: 'wind', text: 'You recover quickly. Health returns twice as fast when you are not fighting.' }),
  f({ id: 'war_shield', branch: 'warden', tier: 4, name: 'Shield Phrase', kind: 'active', cost: 2, level: 7, requires: 'war_wind', mana: 20, cooldownMs: 30000, effect: f({ type: 'shield', pct: 0.3, seconds: 8 }), icon: 'shield', text: 'A phrase that guards you. Absorbs damage up to 30% of your health for 8 seconds.' }),
  f({ id: 'war_unbroken', branch: 'warden', tier: 5, name: 'Unbroken', kind: 'passive', cost: 3, level: 10, requires: 'war_shield', mana: 0, cooldownMs: 120000, ultimate: true, effect: f({ type: 'unbroken', cooldownS: 120, damageTakenPct: 0.05 }), icon: 'unbroken', text: 'You refuse to fall. Once every two minutes a deadly hit leaves you with 1 health.' }),
]);

export const NODE = f(Object.fromEntries(NODES.map((n) => [n.id, n])));
export const BASE = f(Object.fromEntries(BASE_SKILLS.map((s) => [s.id, s])));
/** Any skill by id: a base skill or a tree node. */
export const skillById = (id) => BASE[id] || NODE[id] || null;
