// Turns a chapter shot's camera (pure data from play/chapters.js) into a pose function of the trailer's
// camera module (src/cinematic/camera.js, Task J): `path` shots become a dolly with a look track, still
// shots a static pose with the trailer's slow breath, and the two runtime kinds ('iris', 'interior') are
// resolved against the live scene first. Pure except for the two resolvers, which read positions only.
import { compileCamera } from '../camera.js';

const DRIFT_STILL = 0.12;

/** J's camera spec for a chapter shot camera that is already absolute. */
export function specFor(cam) {
  if (cam.kind !== 'path') throw new Error('specFor: absolute cameras only');
  if (cam.still || samePose(cam.from, cam.to)) return { type: 'static', pos: cam.from.pos, look: cam.from.look, fov: cam.from.fov, drift: DRIFT_STILL, driftCycles: 0.5, ease: 'inOutSine' };
  return { type: 'dolly', path: [cam.from.pos, cam.to.pos], look: [cam.from.look, cam.to.look], fov: [cam.from.fov, cam.to.fov], ease: 'inOutSine' };
}

const samePose = (a, b) => a.pos.every((v, i) => v === b.pos[i]) && a.look.every((v, i) => v === b.look[i]);

/**
 * Iris from the front and a little to the side, at head height.
 * @param {{position:number[], heading:number}} iris world position [x,y,z] and yaw (radians, +Z forward)
 */
export function irisCamera(cam, iris) {
  const [x, y, z] = iris.position;
  const a = iris.heading + cam.yaw;
  const dir = [Math.sin(a), 0, Math.cos(a)];
  const look = [x, y + 1.35, z];
  const at = (d) => [x + dir[0] * d, y + cam.height, z + dir[2] * d];
  return { kind: 'path', from: { pos: at(cam.dist), look, fov: 42 }, to: { pos: at(cam.toDist), look: [x, y + 1.3, z], fov: 42 }, still: !!cam.still };
}

/**
 * Inside a Shell: from the entrance toward the glass where the Guests draw.
 * @param {{spawn:number[], glass:number[]}} interior world positions: the visitor's spawn and the glass centre
 */
export function interiorCamera(cam, interior) {
  const [sx, sy, sz] = interior.spawn, [gx, gy, gz] = interior.glass;
  const from = [sx, sy + 1.7, sz];
  const to = [sx + (gx - sx) * 0.42, sy + 1.9 + (gy - sy) * 0.15, sz + (gz - sz) * 0.42];
  const look = [gx, gy, gz];
  return { kind: 'path', from: { pos: from, look, fov: 48 }, to: { pos: to, look: [gx, gy + 0.4, gz], fov: 46 }, still: !!cam.still };
}

/**
 * Compiles a shot camera into pose(u) → {pos, look, fov, roll}. `resolve` supplies the live positions:
 * {iris(): {position, heading}, interior(shell): {spawn, glass}}.
 */
export function compileShotCamera(cam, resolve) {
  let abs = cam;
  if (cam.kind === 'iris') abs = irisCamera(cam, resolve.iris());
  else if (cam.kind === 'interior') abs = interiorCamera(cam, resolve.interior(cam.shell));
  return compileCamera(specFor(abs));
}
