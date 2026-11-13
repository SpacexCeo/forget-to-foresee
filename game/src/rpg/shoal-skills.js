// The Glass Shoal skills (docs/plans/boss/glass-shoal-boss.md): Iris's Loomblade moves and Elise's remembered gift.
// Pure data, the same shape as rpg/skills-data.js BASE_SKILLS (slot, mana, cooldown, range, icon), plus the fight
// numbers scenes/shoal-arena.js reads (damage, radius, projectile speed). Unlocked by the Loomblade find.

const f = Object.freeze;
/** Iris with the Loomblade: a three-hit combo, a heavy slash and a roll. */
export const IRIS_SHOAL = f([
  f({ id: 'loom_combo', hero: 'iris', name: 'Loomblade Combo', slot: 1, key: 'F', kind: 'melee', mana: 0, cooldownMs: 380, range: 3.2, damage: f([60, 70, 110]), arc: 2.2, icon: 'strike', text: 'Three woven cuts. The third one bites deep.' }),
  f({ id: 'loom_heavy', hero: 'iris', name: 'Heavy Slash', slot: 2, key: 'Q', kind: 'melee', mana: 20, cooldownMs: 4500, range: 4.2, damage: 260, arc: 3.1, windup: 0.35, icon: 'lance', text: 'A slow, wide slash with the whole weight of the blade.' }),
  f({ id: 'loom_dodge', hero: 'iris', name: 'Dodge Roll', slot: 4, key: 'Space', kind: 'movement', mana: 0, cooldownMs: 600, icon: 'dash', text: 'Roll through a blow. A clean dodge opens the boss to your cuts.' }),
]);
/** Elise remembers her gift: Ember Palms, Gale Discs and a hop that dodges (the three hotbar skills). */
export const ELISE_SHOAL = f([
  f({ id: 'ember_palms', hero: 'elise', name: 'Ember Palms', slot: 1, key: 'F', kind: 'ranged', mana: 6, cooldownMs: 420, range: 24, damage: 70, speed: 26, radius: 1.2, icon: 'lance', text: 'Fire orbs from both palms, thrown where you aim.' }),
  f({ id: 'gale_discs', hero: 'elise', name: 'Gale Discs', slot: 2, key: 'Q', kind: 'ranged', mana: 18, cooldownMs: 3200, range: 30, damage: 95, speed: 18, radius: 1.6, count: 3, spread: 0.28, pierce: true, icon: 'snare', text: 'Three flat spinning wind blades in a fan that cut through everything in a line.' }),
  f({ id: 'hover', hero: 'elise', name: 'Hover', slot: 4, key: 'Space', kind: 'movement', mana: 0, cooldownMs: 600, lift: 2.4, icon: 'dash', text: 'A quick hop through a blow; a clean dodge opens the boss. Press twice to take off.' }),
]);
/**
 * Elise's flight and her ultimate (not on the three-button row: the fight HUD gives them their own buttons).
 * Lift: L or a double jump takes off; in the air Space rises, Shift sinks, L lands; on touch, hold Lift to rise.
 * Tempest of Embers: R when the meter is full (shoal-rules.js ULT has its numbers).
 */
export const ELISE_LIFT = f({ id: 'lift', hero: 'elise', name: 'Lift', slot: 5, key: 'L', kind: 'flight', mana: 0, cooldownMs: 300, icon: 'dash', text: 'Take off and fly. Flight drains stamina; at zero you glide down.' });
export const ELISE_TEMPEST = f({ id: 'tempest', hero: 'elise', name: 'Tempest of Embers', slot: 3, key: 'R', kind: 'ultimate', mana: 0, cooldownMs: 1000, icon: 'storm', text: 'When the meter is full: a spiral of fire orbs and wind blades tears through everything around you.' });
export const SHOAL_SKILLS = f([...IRIS_SHOAL, ...ELISE_SHOAL, ELISE_LIFT, ELISE_TEMPEST]);
export const SHOAL_SKILL = f(Object.fromEntries(SHOAL_SKILLS.map((s) => [s.id, s])));
/** The three skills of a heroine ('iris' or 'elise'; anything else plays as Iris). */
export const shoalSkillsFor = (hero) => (hero === 'elise' ? ELISE_SHOAL : IRIS_SHOAL);
/** Elise's extra fight buttons (flight and the ultimate); Iris has none yet. */
export const shoalExtrasFor = (hero) => (hero === 'elise' ? f([ELISE_LIFT, ELISE_TEMPEST]) : f([]));
/** The combo hit index after `n` presses within the chain window. */
export const comboStep = (n) => ((Math.max(1, n | 0) - 1) % 3);
