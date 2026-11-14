// The archipelago's props dressing the hill town (owner 14.11: "after baking, use them in town"): the six clan banners
// in a ring round the Tournament altar on the square (two east, two west, two flanking the way up from the mid terrace;
// the temple side left open), each facing the altar, and four bridge torches by the gate (two pairs
// lining the way in). Spots were picked by scanning the town's ground from the sky (GPU box): open sky above (a cast
// from just above the ground ends inside a wall that is taller than it), flat ground, a wall within 1.5 m behind, at least 1.3-1.6 m from every walking
// line and 2.2 m from every post, door and placed prop. Town-local metres; `face` is the point each one turns toward.
// Pure: scenes/town-footprints.js keeps the walkers clear of them, scenes/town-decor-view.js loads the models.

/** Banner models in their order round the square. */
export const BANNERS = Object.freeze(['prop_clan_banner_iris', 'prop_clan_banner_sol', 'prop_clan_banner_moh', 'prop_clan_banner_iney', 'prop_clan_banner_pepel', 'prop_clan_banner_yantar']);

const ALTAR = Object.freeze([0, 4.5, -11]), STREET = Object.freeze([0, 0, 22]);

export const TOWN_DECOR = Object.freeze([
  ...[[4.5, 4.5, -3], [9, 4.5, -8], [9, 4.5, -12.5], [-8.5, 4.5, -14], [-9, 4.5, -9.5], [-4.5, 4.5, -3]]
    .map((at, i) => Object.freeze({ id: 'banner_' + i, asset: BANNERS[i], at: Object.freeze(at), face: ALTAR, half: 0.4, height: 3.4, pole: 0.12 })),
  ...[[-8.5, 0, 32.5], [8.5, 0, 32.5], [-9, 0, 28.5], [8.5, 0, 28.5]]
    .map((at, i) => Object.freeze({ id: 'torch_' + i, asset: 'prop_bridge_torch', at: Object.freeze(at), face: STREET, half: 0.2, height: 1.65, pole: 0.14 })),
]);

/** Heading (rad, three's rotation.y) that turns a model's +Z toward `face` from `at` (pure). */
export function facing(at, face) { return Math.atan2(face[0] - at[0], face[2] - at[2]); }
