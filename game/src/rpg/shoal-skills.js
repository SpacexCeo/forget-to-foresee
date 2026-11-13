// The Glass Shoal skills (docs/plans/boss/glass-shoal-boss.md): Iris's Loomblade moves and Elise's remembered gift.
// Pure data, the same shape as rpg/skills-data.js BASE_SKILLS (slot, mana, cooldown, range, icon), plus the fight
// numbers scenes/glass-shoal.js reads (damage, radius, projectile speed). Unlocked by the Loomblade find.

const f = Object.freeze;
/** Iris with the Loomblade: a three-hit combo, a heavy slash and a roll. */
export const IRIS_SHOAL = f([
  f({ id: 'loom_combo', hero: 'iris', name: 'Loomblade Combo', slot: 1, key: 'F', kind: 'melee', mana: 0, cooldownMs: 380, range: 3.2, damage: f([60, 70, 110]), arc: 2.2, icon: 'strike', text: 'Three woven cuts. The third one bites deep.' }),
  f({ id: 'loom_heavy', hero: 'iris', name: 'Heavy Slash', slot: 2, key: 'Q', kind: 'melee', mana: 20, cooldownMs: 4500, range: 4.2, damage: 260, arc: 3.1, windup: 0.35, icon: 'lance', text: 'A slow, wide slash with the whole weight of the blade.' }),
  f({ id: 'loom_dodge', hero: 'iris', name: 'Dodge Roll', slot: 4, key: 'Space', kind: 'movement', mana: 0, cooldownMs: 600, icon: 'dash', text: 'Roll through a blow. A clean dodge opens the boss to your cuts.' }),
]);
/** Elise remembers her gift: hover and short flight, Ember Palms, Gale Discs. */
export const ELISE_SHOAL = f([
  f({ id: 'ember_palms', hero: 'elise', name: 'Ember Palms', slot: 1, key: 'F', kind: 'ranged', mana: 6, cooldownMs: 420, range: 24, damage: 70, speed: 26, radius: 1.2, icon: 'lance', text: 'Fire orbs from both palms.' }),
  f({ id: 'gale_discs', hero: 'elise', name: 'Gale Discs', slot: 2, key: 'Q', kind: 'ranged', mana: 18, cooldownMs: 3200, range: 30, damage: 95, speed: 18, radius: 1.6, count: 3, spread: 0.28, pierce: true, icon: 'snare', text: 'Three flat spinning wind blades that cut through everything in a line.' }),
  f({ id: 'hover', hero: 'elise', name: 'Hover', slot: 4, key: 'Space', kind: 'movement', mana: 0, cooldownMs: 600, lift: 2.4, icon: 'dash', text: 'A short flight. Blows pass under you; a clean dodge opens the boss.' }),
]);
export const SHOAL_SKILLS = f([...IRIS_SHOAL, ...ELISE_SHOAL]);
export const SHOAL_SKILL = f(Object.fromEntries(SHOAL_SKILLS.map((s) => [s.id, s])));
/** The three skills of a heroine ('iris' or 'elise'; anything else plays as Iris). */
export const shoalSkillsFor = (hero) => (hero === 'elise' ? ELISE_SHOAL : IRIS_SHOAL);
/** The combo hit index after `n` presses within the chain window. */
export const comboStep = (n) => ((Math.max(1, n | 0) - 1) % 3);
