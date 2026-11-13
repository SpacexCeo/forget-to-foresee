// The camera boom against the collision world, as plain numbers (no three.js, runs under `node --test`).
// The rig (camera-rig.js) asks two things every frame: how far along the boom the camera may sit, and how much of
// the look-ahead offset the look-at point may take before it would enter a wall. Town houses also give the camera
// their visual shell (isShellMesh): the files' own colliders are plain boxes around the ground floor, so the
// overhanging upper floors and the roofs stopped nothing and the camera ended up inside them (owner, 13.11).
import { sweepSphere, MASK_CAMERA } from '../physics/collision.js';

/** Gap kept between the camera sphere and what stopped it (metres). */
export const BOOM_SKIN = 0.05;

/**
 * The largest safe boom length from `center` along the unit vector `dir`, at most `dist`. The sweep starts `start`
 * metres out (inspect mode starts outside the inspected object's own colliders).
 * @returns {{safe: number, fraction: number}} `fraction` is the raw sweep result (1 = nothing in the way)
 */
export function boomDistance(world, center, dir, dist, radius, start = 0) {
  const from = [center[0] + dir[0] * start, center[1] + dir[1] * start, center[2] + dir[2] * start];
  const to = [center[0] + dir[0] * dist, center[1] + dir[1] * dist, center[2] + dir[2] * dist];
  const fraction = sweepSphere(world, from, to, radius, MASK_CAMERA);
  return { safe: start + Math.max(0, fraction * (dist - start) - BOOM_SKIN), fraction };
}

/**
 * How much of `offset` (the look-ahead) a camera-sized sphere at `from` can take, 0..1. Walking into a wall used to
 * push the look-at point up to a metre into it; the boom then started inside the house and stayed there.
 */
export function clearFraction(world, from, offset, radius) {
  const len = Math.hypot(offset[0], offset[1], offset[2]);
  if (len < 1e-4) return 1;
  const f = sweepSphere(world, from, [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]], radius, MASK_CAMERA);
  return f >= 1 ? 1 : Math.max(0, f - BOOM_SKIN / len);
}

/** Town shell meshes the camera collides with (one mesh per material in a town piece: `<piece>_plaster`, `<piece>_roof`). */
const SHELL_MESH = /_(plaster|roof)$/;
export function isShellMesh(name) { return SHELL_MESH.test(String(name || '')); }

/** Town shell materials drawn on both sides: an eave or an overhanging floor seen from below stays a surface, not a hole. */
const SHELL_MATERIAL = /^M_Town_(Plaster|Roof|Stone|Timber)(\b|_|$)/;
export function isShellMaterial(name) { return SHELL_MATERIAL.test(String(name || '')); }
