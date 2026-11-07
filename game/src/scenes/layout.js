// World layout in meters. Owner concept 07.11 (third image) replaces the brief's flat 70 m island:
// a floating archipelago above a sea of clouds. A round central plaza plateau carries the Scroll
// (a floor medallion) and four anchor zones on the diagonals; six camp plateaus on rock pillars
// stand on a ring around it, each joined to the plaza by a railed stone bridge, some neighbors are
// linked too; the player starts on a viewing balcony with its own bridge. Four Shells levitate
// around the archipelago at different heights. All walkable tops are at y = 0.
// Walk times (spec 5: 30-45 s between points) at WALK_SPEED: plaza center -> camp ~19 s,
// camp -> neighboring camp via the plaza ~37 s, balcony -> plaza center ~29 s.
// Pure data so the layout rules are checked by node tests. +Y is up; the default camera looks
// from +Z toward the center. Convention for every placed asset: local +Z is its front and faces
// the plaza.

export const WALK_SPEED = 1.7;          // m/s, tuned for the 30-45 s walks
export const PLAZA_RADIUS = 9;
export const CAMP_RING_RADIUS = 30;
export const PLATEAU_RADIUS = 6.5;
export const CAMP_PLOT_SIZE = 8;
export const BRIDGE_WIDTH = 2.4;
export const RAIL_HEIGHT = 1.0;
export const ANCHOR_RING_RADIUS = 6.6;  // anchor zones are inlaid circles on the plaza rim
export const ANCHOR_ZONE_RADIUS = 1.5;
export const BALCONY = Object.freeze({ angle: 120, radius: 46, size: 5 });
export const PILLAR_DEPTH = 42;         // rock pillars reach down into the clouds
export const CLOUD_LEVEL = -28;
export const KILL_Y = -6;               // below this the player respawns at the last safe point

const deg = (d) => (d * Math.PI) / 180;
/** Ground position on a ring; angle 0 = +X, 90 = +Z. */
export const onRing = (radius, angleDeg, y = 0) => [Math.cos(deg(angleDeg)) * radius, y, Math.sin(deg(angleDeg)) * radius];
/** Rotation around Y that turns an asset's local +Z toward the plaza center. */
export const facePlaza = (angleDeg) => -deg(angleDeg) - Math.PI / 2;

/** Clans in engine order (engine.js NAMES) with their plateau angle (placement after the concept). */
export const CLANS = Object.freeze([
  { id: 'iris', asset: 'camp_iris', label: 'Iris', color: 0x8a6fc4, angle: 270 },     // back center: violet tent
  { id: 'sol', asset: 'camp_sol', label: 'Salt', color: 0xe4e6e2, angle: 210 },       // back left: crystals
  { id: 'pepel', asset: 'camp_pepel', label: 'Ash', color: 0x3b3a39, angle: 150 },    // front left: dark roof
  { id: 'moh', asset: 'camp_moh', label: 'Moss', color: 0x6f8f55, angle: 90 },        // front center: green mound
  { id: 'yantar', asset: 'camp_yantar', label: 'Amber', color: 0xd59a3a, angle: 30 }, // front right: golden gazebo
  { id: 'iney', asset: 'camp_iney', label: 'Frost', color: 0x9fc4d6, angle: 330 },    // back right: glass pavilion
]);

export const CAMPS = Object.freeze(CLANS.map((c) => ({ ...c, position: onRing(CAMP_RING_RADIUS, c.angle), rotationY: facePlaza(c.angle) })));

/** Pairs of neighboring camps joined by a direct bridge ("partly linked"). */
export const NEIGHBOR_LINKS = Object.freeze([['moh', 'yantar'], ['iris', 'iney'], ['sol', 'pepel']]);

/** Shell levitation: position of the Shell's bottom (pivot) and its rest yaw. Zone i <-> Shell i+1. */
const SHELL_PLACES = [{ r: 52, y: 14 }, { r: 50, y: 22 }, { r: 54, y: 17 }, { r: 50, y: 25 }];

/** Anchor zones on the plaza diagonals, each facing its Shell; zone i belongs to Shell i+1 (I..IV). */
export const ANCHOR_ZONES = Object.freeze([45, 135, 225, 315].map((angle, i) => ({
  index: i,
  shell: i + 1,
  angle,
  position: onRing(ANCHOR_RING_RADIUS, angle),
  shellAsset: 'shell_' + (i + 1),
  shellPosition: onRing(SHELL_PLACES[i].r, angle, SHELL_PLACES[i].y),
  shellRotationY: facePlaza(angle),
  // A demo anchor stands in the zone and faces the plaza center.
  anchorPosition: onRing(ANCHOR_RING_RADIUS, angle),
  anchorRotationY: facePlaza(angle),
})));

export const SCROLL_TABLE = Object.freeze({ position: [0, 0, 0] });

/** Balcony center (the player's start). */
export const BALCONY_CENTER = Object.freeze(onRing(BALCONY.radius, BALCONY.angle));
export const SPAWN = Object.freeze([BALCONY_CENTER[0] * 0.97, 0, BALCONY_CENTER[2] * 0.97]);

/** The shard rests on a pedestal on the Iris plateau, beside the hologram circle. */
export const SHARD = Object.freeze({
  pedestal: { size: [0.5, 1.0, 0.5] },
  position: (() => { const p = onRing(CAMP_RING_RADIUS - 3.2, 270 + 7); return [p[0], 1.0, p[2]]; })(),
});

/**
 * Bridges as {from, to, width}: straight decks between walkable edges (centerline endpoints on the
 * ground). Camp spokes, neighbor links and the balcony bridge.
 */
export function bridges() {
  const out = [];
  const inset = 0.4; // decks overlap the plateau edges a little so there is no gap
  for (const c of CAMPS) out.push({ id: 'bridge_' + c.id, from: onRing(PLAZA_RADIUS - inset, c.angle), to: onRing(CAMP_RING_RADIUS - PLATEAU_RADIUS + inset, c.angle), width: BRIDGE_WIDTH });
  for (const [a, b] of NEIGHBOR_LINKS) {
    const A = CAMPS.find((c) => c.id === a).position, B = CAMPS.find((c) => c.id === b).position;
    const dx = B[0] - A[0], dz = B[2] - A[2], l = Math.hypot(dx, dz), e = PLATEAU_RADIUS - inset;
    out.push({ id: 'link_' + a + '_' + b, from: [A[0] + (dx / l) * e, 0, A[2] + (dz / l) * e], to: [B[0] - (dx / l) * e, 0, B[2] - (dz / l) * e], width: BRIDGE_WIDTH });
  }
  out.push({ id: 'bridge_balcony', from: onRing(PLAZA_RADIUS - inset, BALCONY.angle), to: onRing(BALCONY.radius - BALCONY.size + inset, BALCONY.angle), width: BRIDGE_WIDTH });
  return out;
}

/** Walkable discs (plaza, plateaus, balcony) as {id, center, radius}. */
export function platforms() {
  return [
    { id: 'plaza', center: [0, 0, 0], radius: PLAZA_RADIUS },
    ...CAMPS.map((c) => ({ id: 'plateau_' + c.id, center: c.position, radius: PLATEAU_RADIUS })),
    { id: 'balcony', center: BALCONY_CENTER, radius: BALCONY.size },
  ];
}

/** Directions (degrees, world) in which a platform's parapet is open for a bridge. */
export function parapetOpenings(platformId) {
  const open = [];
  const dirTo = (from, to) => (Math.atan2(to[2] - from[2], to[0] - from[0]) * 180) / Math.PI;
  for (const br of bridges()) {
    for (const p of platforms()) {
      if (p.id !== platformId) continue;
      for (const end of [br.from, br.to]) {
        const d = Math.hypot(end[0] - p.center[0], end[2] - p.center[2]);
        if (Math.abs(d - (p.radius - 0.4)) < 0.05) open.push(dirTo(p.center, end));
      }
    }
  }
  return open;
}

/**
 * Idle hover of a levitating Shell (owner 07.11: no ground contact, slow bob and rotation).
 * Visual only, never game state. Colliders stay at the rest pose, so the motion is bounded:
 * bob <= 0.12 m and a yaw sway <= 1.5 degrees (<= 0.16 m at a 6 m radius) keep any surface point
 * within 0.28 m of its rest position, inside the 0.35 m camera collision sphere; each part alone
 * stays inside the 0.25 m margin of the greybox colliders.
 */
export const SHELL_HOVER = Object.freeze({ bob: 0.12, bobPeriod: 9, sway: (1.5 * Math.PI) / 180, swayPeriod: 23 });
export function shellHover(t, index) {
  const ph = index * 1.7;
  return {
    dy: SHELL_HOVER.bob * Math.sin((2 * Math.PI * t) / SHELL_HOVER.bobPeriod + ph),
    yaw: SHELL_HOVER.sway * Math.sin((2 * Math.PI * t) / SHELL_HOVER.swayPeriod + ph * 0.6),
  };
}

/** Distance between two ground points. */
export const groundDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
