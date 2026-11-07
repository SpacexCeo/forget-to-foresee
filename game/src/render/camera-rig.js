// Isometric 3/4 camera (spec 5: limited rotation and zoom, no first person). Zoom runs from the
// high diorama view down to a low third-person view behind and above Iris (owner concept 07.11);
// pitch, focus height and field of view follow the zoom. Follows a focus point;
// a sphere sweep from the focus to the desired position keeps the camera out of geometry.
// Inspect mode orbits a hero object up close (that is when <name>_inspect meshes swap in).
import * as THREE from 'three';
import { sweepSphere, MASK_CAMERA } from '../physics/collision.js';

const DEG = Math.PI / 180;

export class CameraRig {
  constructor(camera, world, opts = {}) {
    this.camera = camera;
    this.world = world;
    // Camera sits on the +Z side looking toward -Z: the Iris camp is in front and the four Shells
    // (on the diagonals) frame the view instead of blocking it.
    this.baseYaw = opts.baseYaw ?? 0;
    this.yawLimit = opts.yawLimit ?? 50 * DEG;   // limited rotation around the base yaw
    this.minDist = opts.minDist ?? 4.5;   // low third-person view, never first person
    this.maxDist = opts.maxDist ?? 90;     // far enough for the whole-archipelago view
    this.radius = opts.radius ?? 0.35;           // camera collision sphere
    this.yaw = this.baseYaw;
    this.dist = opts.dist ?? 30;
    this.focus = new THREE.Vector3();
    this.smoothFocus = new THREE.Vector3();
    this.actualDist = this.dist;
    this.inspect = null;                         // {center: Vector3, radius, yaw, pitch, dist}
    this.lastSweep = 1;
    this.pitchOverride = null;                   // radians; dev/cinematic shots only (null = zoom-tied pitch)
  }

  /** 0 at the closest zoom, 1 at the farthest. */
  zoomT(dist) { return Math.min(1, Math.max(0, (dist - this.minDist) / (this.maxDist - this.minDist))); }

  /** Pitch tied to zoom: close = low over the shoulder (14 deg), far = high diorama view (62 deg). */
  pitchFor(dist) { return (14 + 48 * Math.pow(this.zoomT(dist), 0.6)) * DEG; }

  /** Look-at height above the feet: head height up close, lower for the overview. */
  focusHeightFor(dist) { return 1.55 - 0.45 * this.zoomT(dist); }

  /** Field of view: wider up close (third person), narrower for the diorama look. */
  fovFor(dist) { return 50 - 18 * Math.pow(this.zoomT(dist), 0.5); }

  rotate(delta) {
    if (this.inspect) { this.inspect.yaw += delta; return; }
    this.yaw = Math.min(this.baseYaw + this.yawLimit, Math.max(this.baseYaw - this.yawLimit, this.yaw + delta));
  }

  tilt(delta) { if (this.inspect) this.inspect.pitch = Math.min(70 * DEG, Math.max(5 * DEG, this.inspect.pitch + delta)); }

  zoom(factor) {
    if (this.inspect) { const i = this.inspect; i.dist = Math.min(i.maxDist, Math.max(i.minDist, i.dist * factor)); return; }
    this.dist = Math.min(this.maxDist, Math.max(this.minDist, this.dist * factor));
  }

  /** Enters inspection of an object (bounding sphere center/radius). */
  enterInspect(center, radius) {
    const dist = Math.max(1.2, radius * 2.6);
    this.inspect = { center: center.clone(), radius: radius * 1.05, yaw: this.yaw, pitch: 20 * DEG, dist, minDist: Math.max(0.6, radius * 1.3), maxDist: Math.max(4, radius * 6) };
  }

  exitInspect() { this.inspect = null; }

  /** Camera-relative ground directions for WASD. */
  groundAxes() {
    const yaw = this.inspect ? this.inspect.yaw : this.yaw;
    const fwd = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    return { fwd, right };
  }

  update(dt, focus) {
    let center, yaw, pitch, dist;
    if (this.inspect) {
      ({ center, yaw, pitch, dist } = this.inspect);
      if (this.camera.fov !== 40) { this.camera.fov = 40; this.camera.updateProjectionMatrix(); }
    } else {
      this.focus.copy(focus);
      const k = 1 - Math.exp(-dt * 10);
      this.smoothFocus.lerp(this.focus, this.smoothFocus.lengthSq() === 0 ? 1 : k);
      center = this.smoothFocus.clone().add(new THREE.Vector3(0, this.focusHeightFor(this.dist), 0));
      yaw = this.yaw; dist = this.dist; pitch = this.pitchOverride ?? this.pitchFor(dist);
      const fov = this.fovFor(dist);
      if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    }
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // In inspect mode the sweep starts just outside the inspected object's bounding sphere,
    // otherwise its own colliders would pin the camera to the center.
    const start = this.inspect ? Math.min(this.inspect.radius ?? 0, dist * 0.9) : 0;
    const from = center.clone().addScaledVector(dir, start);
    const desired = center.clone().addScaledVector(dir, dist);
    const f = sweepSphere(this.world, from.toArray(), desired.toArray(), this.radius, MASK_CAMERA);
    this.lastSweep = f;
    const safe = Math.max(start + 0.3, start + f * (dist - start) - 0.05);
    // Pull in at once (never clip), ease back out.
    this.actualDist = safe < this.actualDist ? safe : this.actualDist + (safe - this.actualDist) * (1 - Math.exp(-dt * 4));
    this.camera.position.copy(center).addScaledVector(dir, this.actualDist);
    this.camera.lookAt(center);
  }
}
