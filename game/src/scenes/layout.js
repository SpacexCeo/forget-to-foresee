// Island layout in meters (docs/art/brief.md, "Island"): one terrain about 70 x 70 m, the Scroll
// table on a central plaza, six camp plots on a ring of radius ~13 m, four anchor zones on the
// diagonals at radius ~25 m with a floating Shell above each, and paths between them.
// Pure data so the layout rules are checked by node tests. +Y is up; the default camera looks
// from +X/+Z toward the center, so the player's camp (Iris) faces the camera.
// Convention for every placed asset: local +Z is the front and faces the plaza.

export const ISLAND_RADIUS = 35;      // walkable terrain edge (70 m across)
export const SHORE_WIDTH = 4;         // slopes into the water past the edge
export const PLAZA_RADIUS = 6;
export const CAMP_RING_RADIUS = 13;
export const CAMP_PLOT_SIZE = 8;
export const ANCHOR_RING_RADIUS = 25;
export const ANCHOR_ZONE_RADIUS = 3.5;
export const SHELL_FLOAT_HEIGHT = 7;  // bottom of each Shell above the ground
export const PATH_WIDTH = 1.6;
export const WATER_LEVEL = -0.6;

/** Clans in engine order (engine.js NAMES): Iris, Salt, Ash, Moss, Amber, Frost. */
export const CLANS = Object.freeze([
  { id: 'iris', asset: 'camp_iris', label: 'Iris', color: 0x8a6fc4 },
  { id: 'sol', asset: 'camp_sol', label: 'Salt', color: 0xe4e6e2 },
  { id: 'pepel', asset: 'camp_pepel', label: 'Ash', color: 0x3b3a39 },
  { id: 'moh', asset: 'camp_moh', label: 'Moss', color: 0x6f8f55 },
  { id: 'yantar', asset: 'camp_yantar', label: 'Amber', color: 0xd59a3a },
  { id: 'iney', asset: 'camp_iney', label: 'Frost', color: 0x9fc4d6 },
]);

const deg = (d) => (d * Math.PI) / 180;
/** Ground position on a ring; angle 0 = +X, 90 = +Z. */
export const onRing = (radius, angleDeg) => [Math.cos(deg(angleDeg)) * radius, 0, Math.sin(deg(angleDeg)) * radius];

/** Camps every 60 degrees starting with Iris at 90 degrees (+Z, toward the default camera). */
export const CAMPS = Object.freeze(CLANS.map((c, i) => {
  const angle = 90 + i * 60;
  // Each plot faces the plaza: its local +Z (front) points to the center.
  return { ...c, angle, position: onRing(CAMP_RING_RADIUS, angle), rotationY: -deg(angle) - Math.PI / 2 };
}));

/** Anchor zones on the diagonals; zone i belongs to Shell i+1 (I..IV). */
export const ANCHOR_ZONES = Object.freeze([45, 135, 225, 315].map((angle, i) => ({
  index: i,
  shell: i + 1,
  angle,
  position: onRing(ANCHOR_RING_RADIUS, angle),
  shellAsset: 'shell_' + (i + 1),
  // A demo anchor stands in the zone, a little toward the plaza, facing it.
  anchorPosition: onRing(ANCHOR_RING_RADIUS - 1.8, angle),
  anchorRotationY: -deg(angle) - Math.PI / 2,
})));

export const SCROLL_TABLE = Object.freeze({ position: [0, 0, 0] });

/** The shard rests on a pedestal at the Iris camp, beside the hologram circle. */
export const SHARD = Object.freeze({
  pedestal: { size: [0.5, 1.0, 0.5] },
  position: (() => { const p = onRing(CAMP_RING_RADIUS - 2.2, 90 + 14); return [p[0], 1.0, p[2]]; })(),
});

/** Player spawn: on the plaza side of the Iris camp. */
export const SPAWN = Object.freeze(onRing(CAMP_RING_RADIUS - 4.5, 90));

/** Straight path segments [from, to] on the ground (centerlines). */
export function pathSegments() {
  const segs = [];
  for (const c of CAMPS) segs.push([onRing(PLAZA_RADIUS, c.angle), onRing(CAMP_RING_RADIUS - CAMP_PLOT_SIZE / 2 + 1, c.angle)]);
  for (const z of ANCHOR_ZONES) segs.push([onRing(PLAZA_RADIUS, z.angle), onRing(ANCHOR_RING_RADIUS - ANCHOR_ZONE_RADIUS, z.angle)]);
  return segs;
}

/** Distance between two ground points. */
export const groundDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
