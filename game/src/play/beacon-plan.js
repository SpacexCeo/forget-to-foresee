// Which Shells carry a light beacon in the world (render/beacons.js draws them). Pure, tested in Node.
// The HUD already speaks of "the gold Shell" (the dock button glows); the beacon is the same fact in the world:
// a Shell with an open sign is marked, and the Shell the current goal points at is marked strongest.

export const BEACON_OFF = 0, BEACON_SIGN = 1, BEACON_GOAL = 2;

/**
 * @param {{waiting?: number[], goalTarget?: string|null, zone?: string, filmPlaying?: boolean}} s
 *   waiting: Shells (1..4) with an open sign; goalTarget: the goal's target ('shell:2', 'anchor_zone:2', ...);
 *   zone: 'island' | 'shell' (inside a Shell the island is out of sight: every beacon is off)
 * @returns {number[]} level per Shell I..IV
 */
export function shellBeaconLevels({ waiting = [], goalTarget = null, zone = 'island', filmPlaying = false } = {}) {
  const levels = [BEACON_OFF, BEACON_OFF, BEACON_OFF, BEACON_OFF];
  if (zone !== 'island' || filmPlaying) return levels;
  for (const n of waiting) if (n >= 1 && n <= 4) levels[n - 1] = BEACON_SIGN;
  const m = /^(?:shell|anchor_zone):([1-4])$/.exec(goalTarget || '');
  if (m) levels[Number(m[1]) - 1] = BEACON_GOAL;
  return levels;
}

/** Target brightness (0..1) of a beacon level. */
export function beaconStrength(level) { return level === BEACON_GOAL ? 1 : level === BEACON_SIGN ? 0.45 : 0; }

/**
 * Where the ground pointer at Iris's feet aims: the Shell or the anchor zone the goal names, or null.
 * @param {string|null} goalTarget @param {{shells: number[][], anchors: number[][]}} places world positions, index = Shell - 1
 */
export function pointerTarget(goalTarget, { shells = [], anchors = [] } = {}) {
  const m = /^(shell|anchor_zone):([1-4])$/.exec(goalTarget || '');
  if (!m) return null;
  const p = (m[1] === 'shell' ? shells : anchors)[Number(m[2]) - 1];
  return p ? { kind: m[1], position: p } : null;
}

/**
 * Pose of the ground pointer: yaw toward the target on the ground plane and how strongly to draw it.
 * It fades out on arrival (inside `near` metres: the place itself is the cue now) and is off inside a Shell.
 * @returns {{yaw:number, strength:number}} yaw: rotation about Y so that local +Z points at the target
 */
export function pointerPose(from, to, { near = 5, zone = 'island', filmPlaying = false } = {}) {
  if (!to || zone !== 'island' || filmPlaying) return { yaw: 0, strength: 0 };
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  const strength = Math.min(1, Math.max(0, (d - near) / 3));
  return { yaw: Math.atan2(dx, dz), strength };
}
