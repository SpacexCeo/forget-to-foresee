// Monster rules for the field outside the walls (scenes/town-monsters.js): numbers, the cast hit test and spawn
// points. Pure, node-tested.
import { CASTS } from './town-casting-fx.js';

export const MONSTERS = Object.freeze({
  count: 4, // alive at once
  hp: 3,
  damage: Object.freeze({ lance: 2, snare: 1 }),
  height: 0.95, // metres, the critter is scaled to this (readable from the town camera)
  speed: 1.25, // m/s while hopping
  respawn: 18, // seconds after a critter is beaten
  // the field below the lower gate, town-local metres
  area: Object.freeze({ x: [-14, 14], z: [44, 58] }),
  pickup: 1.7, // metres: walking this close to a chest picks it up
  hitPad: 0.45, // metres added to a cast's reach for the critter's body
});

/** Whether a cast reaches a point on the ground (pure). `shot` = {id, from, point}. */
export function castHits(shot, p, pad = MONSTERS.hitPad) {
  const cast = CASTS[shot.id]; if (!cast) return false;
  if (cast.shape === 'circle') return Math.hypot(p[0] - shot.point[0], p[2] - shot.point[2]) <= cast.radius + pad;
  // the lance: the segment from Iris to the aim point, half its width either side
  const ax = shot.from[0], az = shot.from[2], bx = shot.point[0], bz = shot.point[2];
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[2] - az) * dz) / L2));
  return Math.hypot(p[0] - (ax + t * dx), p[2] - (az + t * dz)) <= cast.width / 2 + pad;
}

/** A spawn point on the field, at least `clear` metres from Iris (pure; `rand` gives [0, 1)). Town-local x, z. */
export function spawnPoint(rand, irisLocal = null, clear = 9) {
  const A = MONSTERS.area;
  for (let i = 0; i < 12; i++) {
    const x = A.x[0] + rand() * (A.x[1] - A.x[0]), z = A.z[0] + rand() * (A.z[1] - A.z[0]);
    if (!irisLocal || Math.hypot(x - irisLocal[0], z - irisLocal[1]) >= clear) return [x, z];
  }
  return [A.x[0] + rand() * (A.x[1] - A.x[0]), A.z[1]];
}
