// The archipelago's props dressing the hill town (owner 14.11: "after baking, use them in town"): the six clan banners
// along the square (four under the temple steps, two flanking the way up from the mid terrace) and four bridge torches
// on the lower street (a pair at the gate, a pair at the stairs to the terrace). Spots were picked by scanning the
// town's ground (tools on the GPU box): flat ground, a wall within 1.5 m behind, at least 1.3-1.6 m from every walking
// line and 2.2 m from every post, door and placed prop. Town-local metres; `face` is the point each one turns toward.
// Pure: scenes/town-footprints.js keeps the walkers clear of them, scenes/town-decor-view.js loads the models.

/** Banner models in their order round the square. */
export const BANNERS = Object.freeze(['prop_clan_banner_iris', 'prop_clan_banner_sol', 'prop_clan_banner_moh', 'prop_clan_banner_iney', 'prop_clan_banner_pepel', 'prop_clan_banner_yantar']);

const SQUARE = Object.freeze([0, 4.5, -14]), STREET = Object.freeze([0, 0, 22]);

export const TOWN_DECOR = Object.freeze([
  ...[[-10.5, 4.5, -28], [-5.5, 4.5, -27.5], [5.5, 4.5, -27.5], [10.5, 4.5, -29], [-7.5, 4.5, -3], [10, 4.5, -3]]
    .map((at, i) => Object.freeze({ id: 'banner_' + i, asset: BANNERS[i], at: Object.freeze(at), face: SQUARE, half: 0.4, height: 3.4, pole: 0.12 })),
  ...[[-10.5, 0, 31.5], [10.5, 0, 31.5], [-7.5, 0, 13], [8, 0, 13]]
    .map((at, i) => Object.freeze({ id: 'torch_' + i, asset: 'prop_bridge_torch', at: Object.freeze(at), face: STREET, half: 0.2, height: 1.65, pole: 0.14 })),
]);

/** Heading (rad, three's rotation.y) that turns a model's +Z toward `face` from `at` (pure). */
export function facing(at, face) { return Math.atan2(face[0] - at[0], face[2] - at[2]); }
