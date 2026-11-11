// Shell interior layout: where Iris arrives, where the glass is, where she stands to read and where the
// Guests are, in shell space (metres from SHELL_ORIGIN, -Z toward the glass). Pure numbers, no three.js,
// so tests/client/shell-layout.test.mjs can check them against the nodes of shell_interior.glb.
//
// The real hall (shell_interior.glb) runs along Z: the entrance vestibule (door at z = 14.2, floor at
// y = 1.2), a landing and five steps down into the hall (floor y = 0, z from 10.25 to -10.75), and the glass
// end wall at z = -10.75 with the Guests' chamber behind it. Iris arrives on the hall floor at the foot of the
// stairs, the whole hall and the glass in front of her and room for the camera behind her (checked on real
// WebGL: from the landing the camera is pinned against the entrance wall and she is out of frame). The greybox is a smaller room used only until the model is in.

/** Extents of the real model that the layout must respect (read from the .glb nodes; verified by the test). */
export const HALL = Object.freeze({
  glassZ: -10.75,           // logogram_glass / endwall_glass_col
  entranceZ: 10.25,         // endwall_entrance_*: the hall ends, the vestibule begins
  doorZ: 14.2,              // vestibule_door_col: the closed outer door
  floorY: 0, landingY: 1.2, // hall floor; vestibule and landing
  stairsZ: Object.freeze([5.85, 8.8]),
  halfWidth: 6.3,
});

/**
 * `chamber`: the volume behind the glass where the Guests stand, from the glass (zNear: a Guest at depth 1
 * stands here) to the far wall (zFar: depth 0); slot x positions left / centre / right.
 */
export const REAL = Object.freeze({
  spawn: [0, 0, 4.8], heading: Math.PI, glass: [0, 3.95, -10.748], glassSize: [12.1, 7.1], stand: [0, -8.6],
  guests: [[-4.4, -0.3, -15.75, 0.247, 0.969], [0.4, -0.3, -17.95, 0, 1], [4.6, -0.3, -15.35, -0.296, 0.955]],
  chamber: { zNear: -13.4, zFar: -24.8, xHalf: 9, top: 13.5 },
});
export const GREY = Object.freeze({
  spawn: [0, 0, 4.5], heading: Math.PI, glass: [0, 5, -5.84], glassSize: [12, 7], stand: [0, -4.5],
  guests: REAL.guests.map(([x, , , dx, dz]) => [x * 0.8, 0, -7.4, dx, dz]),
  chamber: { zNear: -6.9, zFar: -9.6, xHalf: 7, top: 11 },
});

/** The layout in use: the real hall once its model is shown, the greybox room before. */
export const layoutFor = (real) => (real ? REAL : GREY);

/**
 * Problems of a layout, as text (empty when it is sound): Iris arrives on the hall side of the glass facing
 * it, the reading spot is between her and the glass, and every Guest is behind the glass inside the chamber.
 */
export function layoutProblems(L) {
  const out = [];
  const [, , sz] = L.spawn, gz = L.glass[2], standZ = L.stand[1];
  if (!(sz > gz)) out.push('spawn is not on the hall side of the glass');
  if (Math.abs(Math.cos(L.heading) + 1) > 1e-6) out.push('spawn does not face the glass (-Z)');
  if (!(standZ < sz && standZ > gz)) out.push('the reading spot is not between the spawn and the glass');
  if (!(standZ - gz >= 1 && standZ - gz <= 4)) out.push('the reading spot is not within reach of the glass');
  if (Math.abs(L.spawn[0]) > 0.5 || Math.abs(L.stand[0]) > 0.5) out.push('spawn or reading spot is off the centre line');
  if (!(L.chamber.zNear < gz && L.chamber.zFar < L.chamber.zNear)) out.push('the chamber is not behind the glass');
  L.guests.forEach(([x, , z], i) => {
    if (!(z < gz)) out.push(`Guest ${i} is not behind the glass`);
    if (Math.abs(x) > L.chamber.xHalf) out.push(`Guest ${i} is outside the chamber`);
  });
  if (Math.abs(L.glass[0]) > L.glassSize[0] / 2) out.push('the glass is off centre');
  return out;
}

/**
 * After a late swap from the greybox to the real hall: whether Iris should be put at the real spawn. Only when
 * she has not walked away from where the greybox put her (otherwise the player keeps their position; the real
 * hall contains the greybox room, floor at the same height).
 */
export function shouldRespawn(playerLocal, from = GREY, tolerance = 0.75) {
  const dx = playerLocal[0] - from.spawn[0], dz = playerLocal[2] - from.spawn[2];
  return Math.hypot(dx, dz) <= tolerance;
}
