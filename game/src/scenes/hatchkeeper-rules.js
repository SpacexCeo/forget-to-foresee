// The Hatchkeeper's numbers (pure: no renderer; scenes/hatchkeeper.js draws by them).
/** Town-local metres: on the lower lane, in front of the first stall on the open cobbles, clear of the walls, the portal, the board and the wheel. */
export const HATCHKEEPER = Object.freeze({
  pos: Object.freeze([19.6, 0, 18.0]), heading: 0.15, model: 'townsfolk_shrinekeeper', reach: 2.6, cull: 45,
  // clear of these (town-local [x, z], metres): the portal, the board, the lane's two market sellers
  keepClearOf: Object.freeze([[4.4, 24.8, 4], [1.6, 4.0, 4], [19.5, 14.6, 2], [23.9, 15.8, 2]]),
});
export const DRAGON_KINDS = Object.freeze(['nacre', 'rill', 'cinder']);
/** Each dragon's loop: radius and height (m), seconds per lap, phase, bob. */
export const DRAGON_LOOPS = Object.freeze([
  Object.freeze({ kind: 'nacre', radius: 1.6, height: 1.6, lap: 14, phase: 0, bob: 0.12 }),
  Object.freeze({ kind: 'rill', radius: 2.0, height: 2.0, lap: 18, phase: 2.1, bob: 0.15 }),
  Object.freeze({ kind: 'cinder', radius: 2.4, height: 2.35, lap: 22, phase: 4.2, bob: 0.1 }),
]);
/** The riddle's locale keys in order; the panel has no other action. */
export const HATCH_LINES = Object.freeze(['hatch.line1', 'hatch.line2', 'hatch.line3']);

/**
 * Where a dragon is at time t (pure): offset [x, y, z] from the Hatchkeeper's feet and the yaw it faces (along its
 * path). Reduced motion halves the speed and drops the bob. Alternate dragons fly the other way round.
 */
export function dragonOrbit(i, t, { reduced = false } = {}) {
  const L = DRAGON_LOOPS[i % DRAGON_LOOPS.length], dir = i % 2 ? -1 : 1;
  const a = L.phase + dir * (2 * Math.PI * t) / (L.lap * (reduced ? 2 : 1));
  const y = L.height + (reduced ? 0 : Math.sin(t * 1.3 + L.phase) * L.bob);
  const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir); // the tangent of the loop
  return { pos: [Math.cos(a) * L.radius, y, Math.sin(a) * L.radius], yaw };
}

