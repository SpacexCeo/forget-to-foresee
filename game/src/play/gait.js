// Shared rig motion for the clan agents and Iris (docs/movement.md, docs/motion.md): the gait layer blended by the
// actual ground speed, the head look-at applied after the mixer, and the lean into an acceleration. Split from
// agents.js so Iris's avatar (iris-avatar.js) can run in the town before the season's agents exist.
import * as THREE from 'three';
import { resolveClip, lookAtAngles } from './behaviour.js';
import { gaitBlend, damp } from '../physics/motion.js';

export const FADE = 0.35;    // clip cross-fade seconds
const UP = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v1 = new THREE.Vector3();
const boneIs = (name, re) => re.test(String(name || '').toLowerCase().replace(/[.\d]+$/, '').split(/[|:/]/).pop());

/** Finds the head, neck and eye bones of a rigged model by name (prefixes and numeric suffixes ignored). */
export function findLookBones(model) {
  const bones = { head: null, neck: null, eyes: [] };
  model.traverse((o) => {
    if (!o.isBone) return;
    if (!bones.head && boneIs(o.name, /(^|[^a-z])head$/)) bones.head = o;
    else if (!bones.neck && boneIs(o.name, /(^|[^a-z])neck$/)) bones.neck = o;
    else if (boneIs(o.name, /(^|[^a-z])eye([^a-z]|$)/)) bones.eyes.push(o);
  });
  return bones;
}

/**
 * Head look-at, applied after the mixer so it adds to the clip: a world-space turn (yaw about +Y, pitch about
 * the character's right axis) shared between the neck (35 %), the head (65 %) and the eyes (a little more).
 * `target` is a world point or null (the look fades out). `look` holds the smoothed angles and weight. Shared by
 * the clan agents and Iris (docs/motion.md: "Iris talks to a clan").
 */
export function applyLookTo(bones, look, rootPos, rootYaw, target, dt, reduced = false) {
  const want = target ? lookAtAngles([rootPos.x, rootPos.y, rootPos.z], rootYaw, target) : { yaw: 0, pitch: 0, weight: 0 };
  const rate = reduced ? 3 : 6;
  look.w = damp(look.w, want.weight, rate, dt);
  if (want.weight > 0) { look.yaw = damp(look.yaw, want.yaw, rate, dt); look.pitch = damp(look.pitch, want.pitch, rate, dt); }
  if (look.w < 0.005 || !bones.head) return;
  const yaw = look.yaw * look.w, pitch = look.pitch * look.w;
  const turn = (bone, share) => {
    if (!bone || !bone.parent) return;
    const ry = rootYaw + yaw * share;
    _q1.setFromAxisAngle(UP, yaw * share);
    _v1.set(-Math.cos(ry), 0, Math.sin(ry)); // the character's right axis after the yaw
    _q2.setFromAxisAngle(_v1, pitch * share);
    _q1.multiply(_q2);                                    // world-space delta
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_q3);                  // parent world rotation
    // delta in the parent's space: qp^-1 * delta * qp, premultiplied onto the bone's local rotation
    const inv = _q2.copy(_q3).invert();
    bone.quaternion.premultiply(inv.multiply(_q1).multiply(_q3));
  };
  turn(bones.neck, 0.35);
  turn(bones.head, bones.neck ? 0.65 : 1);
  for (const e of bones.eyes) turn(e, 0.3);
}

/**
 * Anticipation and follow-through (docs/motion.md): the body pitches into an acceleration and settles back after a
 * stop. Returns the eased pitch in radians; `state` keeps {speed, pitch}. Off under reduced motion.
 */
export function accelLean(state, speed, dt, reduced, gain = 0.03, max = 0.1) {
  const accel = dt > 1e-4 ? (speed - state.speed) / dt : 0;
  state.speed = speed;
  const target = reduced ? 0 : Math.max(-max, Math.min(max, accel * gain));
  state.pitch = damp(state.pitch, target, 7, dt);
  return state.pitch;
}
const GAIT_RATE = 10;        // 1/s, easing of the gait weights (about 0.1 s start/stop transitions)
const WALK_REF = 1.7, RUN_REF = 3.3; // m/s the walk / run clips were authored at

/** True when a looping phase went from `a` to `b` (forward, less than a whole turn) past `mark`. */
export const crossed = (a, b, mark) => (a <= b ? a < mark && mark <= b : mark > a || mark <= b);
const START_PHASE = 0.22;    // a stride starts from rest at the passing pose, where the feet are closest to the idle stance

/**
 * Locomotion layer on a mixer: the walk and run actions always play, their weights follow the
 * actual ground speed (idle → walk by 0.6 m/s, walk → run from 1.7 to 3.3 m/s). Both clips are driven
 * by one shared stride phase (0..1, each clip is exactly one stride starting on the same foot), so the
 * feet stay in step through the whole walk ↔ run blend whatever the two clips' lengths are; the phase
 * advances with the ground speed against the blended stride, so the stride matches the ground.
 * `move` (0..1) is how much of the pose the gait owns; the caller scales its idle / cue actions by
 * 1 - move. Without a run clip the walk clip carries the run at a higher rate; without a walk clip
 * the layer is inert (procedural fallback).
 */
export class GaitLayer {
  constructor(mixer, clips) {
    this.mixer = mixer;
    const w = resolveClip(clips, 'walk'), r = resolveClip(clips, 'run');
    this.walk = w.clip && w.name === 'walk' ? mixer.clipAction(w.clip) : null;
    this.run = r.clip && r.name === 'run' ? mixer.clipAction(r.clip) : null;
    for (const a of [this.walk, this.run]) if (a) { a.play(); a.weight = 0; a.enabled = true; a.timeScale = 0; }
    // the ground speed each clip's stride was built for (side-car clips carry it; the model's own clips use the defaults)
    this.walkRef = (w.clip && w.clip.userData && w.clip.userData.speed) || WALK_REF;
    this.runRef = (r.clip && r.name === 'run' && r.clip.userData && r.clip.userData.speed) || RUN_REF;
    // foot contacts (side-car clips carry the planted intervals as fractions of the stride): `onFoot(foot, running)` is
    // called on the frame a foot lands, so steps can sound on the contact instead of on a distance timer
    this.contact = { walk: (w.clip && w.clip.userData && w.clip.userData.contact) || null, run: (r.clip && r.clip.userData && r.clip.userData.contact) || null };
    this.onFoot = null;
    this.weights = { walk: 0, run: 0 };
    this.move = 0;
    this.phase = START_PHASE;
  }

  /** @param {number} speed actual ground speed in m/s @returns {number} move weight 0..1 */
  update(dt, speed) {
    const WALK_REF = this.walkRef, RUN_REF = this.runRef;
    const g = gaitBlend(speed, { walkRef: WALK_REF, runRef: RUN_REF });
    let walkW = g.walk, runW = g.run;
    if (!this.run) { walkW += runW; runW = 0; }
    if (!this.walk) walkW = 0;
    if (this.move < 0.01 && walkW + runW > 0) this.phase = START_PHASE; // a fresh start from rest
    this.weights.walk = damp(this.weights.walk, walkW, GAIT_RATE, dt);
    this.weights.run = damp(this.weights.run, runW, GAIT_RATE, dt);
    this.move = Math.min(1, this.weights.walk + this.weights.run);
    const sum = this.weights.walk + this.weights.run;
    const k = this.run && sum > 1e-4 ? this.weights.run / sum : 0;       // 0 = walk stride, 1 = run stride
    const walkT = this.walk ? this.walk.getClip().duration : 1, runT = this.run ? this.run.getClip().duration : walkT;
    const strideT = walkT + (runT - walkT) * k, ref = WALK_REF + (RUN_REF - WALK_REF) * k;
    const rate = this.run ? Math.min(1.6, Math.max(0.55, Math.max(speed, 0.6) / ref)) : Math.min(2.2, Math.max(0.55, Math.max(speed, 0.6) / WALK_REF));
    const before = this.phase;
    if (sum > 1e-4) this.phase = (this.phase + (dt * rate) / strideT) % 1;
    if (this.onFoot && this.move > 0.5) {
      const ct = k > 0.5 ? this.contact.run || this.contact.walk : this.contact.walk || this.contact.run;
      if (ct) for (const foot of ['L', 'R']) if (crossed(before, this.phase, ct[foot][0])) this.onFoot(foot, k > 0.5);
    }
    if (this.walk) { this.walk.weight = this.weights.walk; this.walk.timeScale = 0; this.walk.time = this.phase * walkT; }
    if (this.run) { this.run.weight = this.weights.run; this.run.timeScale = 0; this.run.time = this.phase * runT; }
    return this.move;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Planted feet while standing (docs/art/animation-pipeline.md, "Runtime"): the game turns a character on the spot
// and stops it faster than any clip could follow, so the feet are held in the world and re-placed by short steps.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _at = new THREE.Vector3(), _cb = new THREE.Vector3(), _ax0 = new THREE.Vector3(), _ax1 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qk = new THREE.Quaternion();
const _home = new THREE.Vector3(), _tgt = new THREE.Vector3(), _hq = new THREE.Quaternion();
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/**
 * Two-bone IK in world space: turns `upper` and `lower` so the head of `end` reaches `target`, keeping the bend
 * plane the animation has (the knee keeps pointing where the clip points it). The bones' world matrices must be
 * current; the chain's matrices are current again on return.
 */
export function solveTwoBone(upper, lower, end, target) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c);
  const lat = clamp(_a.distanceTo(target), Math.abs(lab - lcb) + 1e-3, (lab + lcb) * 0.999);
  _ab.subVectors(_b, _a).normalize(); _ac.subVectors(_c, _a).normalize(); _at.subVectors(target, _a).normalize(); _cb.subVectors(_c, _b).normalize();
  const acAb0 = Math.acos(clamp(_ac.dot(_ab), -1, 1)), baBc0 = Math.acos(clamp(-_ab.dot(_cb), -1, 1)), acAt0 = Math.acos(clamp(_ac.dot(_at), -1, 1));
  const acAb1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const baBc1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  upper.getWorldQuaternion(_qa); lower.getWorldQuaternion(_qb);
  _ax0.crossVectors(_ac, _ab);
  if (_ax0.lengthSq() < 1e-8) _ax0.set(1, 0, 0).applyQuaternion(_qa);   // a straight limb bends about its own side axis
  _ax0.normalize();
  _ax1.crossVectors(_ac, _at);
  // world space: open or close the angle at the root, the same at the middle joint, then swing the limb onto the target
  _qh.setFromAxisAngle(_ax0, acAb1 - acAb0);
  _qk.setFromAxisAngle(_ax0, (acAb1 - acAb0) + (baBc1 - baBc0));
  if (_ax1.lengthSq() > 1e-10) _qs.setFromAxisAngle(_ax1.normalize(), acAt0); else _qs.identity();
  _qa.premultiply(_qh).premultiply(_qs);                                  // new world rotation of the upper bone
  _qb.premultiply(_qk).premultiply(_qs);                                  // new world rotation of the lower bone
  lower.quaternion.copy(_qh.copy(_qa).invert().multiply(_qb));
  upper.parent.getWorldQuaternion(_qk);
  upper.quaternion.copy(_qk.invert().multiply(_qa));
  upper.updateWorldMatrix(false, true);
}

const BANK_GAIN = 0.011, BANK_MAX = 0.13;   // lean into a turn: radians per m/s² of sideways acceleration, and its cap (7.5°)
const LEAD_GAIN = 0.035, LEAD_MAX = 0.2;    // the chest turns ahead of the hips: radians per rad/s of turn rate, cap
const BRAKE_DIP = 0.06, BRAKE_PITCH = 0.16; // a stop from a run: the hips sink (m) and the chest tips forward (rad), then recover
const _ax = new THREE.Vector3(), _qw = new THREE.Quaternion(), _qd = new THREE.Quaternion();

/** Turns a bone about a world axis by `angle`, on top of what the clip gave it (children follow). */
function turnBone(bone, axis, angle) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qw);
  _qd.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_qk.copy(_qw).invert().multiply(_qd).multiply(_qw));
}

const BANK_SIGN = -1;                       // model.rotation.z < 0 leans to the character's left
const TURN_RATE = 5.6;        // rad/s (320°/s): how fast the body follows the game's heading while it stands
const STEP_DIST = 0.085, STEP_YAW = 0.4, STEP_TIME = 0.2, STEP_LIFT = 0.045;

/**
 * Feet planted in the world while a character stands (turning on the spot, the last moments of a stop):
 * - the model follows the game's heading at a human rate (`TURN_RATE`) instead of spinning with it;
 * - each foot stays where it stands; when the body has turned or drifted too far from it, the foot steps to its
 *   place under the body (one foot at a time, a short arc), so a pivot reads as two or three quick steps;
 * - the legs are solved with two-bone IK onto the held feet.
 * The layer fades out with the gait's weight (`move`): a walking or running character is driven by its clips, with
 * two small additions that follow the game's motion: the body leans into a turn and the chest leads it (in
 * proportion to the turn rate and the speed, capped and smoothed), and a stop from a run is absorbed: the hips sink
 * over the held feet and the chest tips forward, then both recover. None of this under reduced motion.
 * Call `update` after the mixer and after the avatar group has its position and heading for the frame.
 */
export class FootPlant {
  constructor(model) {
    const bone = (n) => model.getObjectByName(n);
    this.model = model;
    this.legs = ['L', 'R'].map((s) => ({ thigh: bone(`thigh_${s}`), shin: bone(`shin_${s}`), foot: bone(`foot_${s}`), pos: new THREE.Vector3(), from: new THREE.Vector3(), yaw: 0, fromYaw: 0, active: false, stepping: false, u: 0 }));
    this.ok = this.legs.every((l) => l.thigh && l.shin && l.foot);
    this.yaw = null;            // the model's own world heading (lags the group's while standing)
    this.baseYaw = model.rotation.y;
    model.updateWorldMatrix(true, true);
    this.restFootY = this.ok ? this.legs[0].foot.getWorldPosition(_a).y - model.getWorldPosition(_b).y : 0;
    this.weight = 0;
    this.last = null;           // the group's position last frame (its real speed over the ground)
    this.speed = 0;
    this.spine = bone('spine'); this.chest = bone('chest');
    this.baseY = model.position.y; this.baseRoll = model.rotation.z;
    this.prevHeading = null; this.bank = 0; this.lead = 0;
    this.recent = 0; this.brake = 0; this.braked = false; this.dip = 0; this.tip = 0;
  }

  /** @param {THREE.Object3D} group the avatar group (position = the ground point, rotation.y = the game's heading) */
  update(dt, group, move, reduced = false, free = 0) {
    if (!this.ok) return;
    const heading = group.rotation.y;
    // `free` (0..1): a full-body action clip (a cast, a strike) owns the legs: the feet are not held and she turns to it at once
    const stand = reduced ? 0 : smooth(1 - move * 1.6) * (1 - free);
    this.weight = stand;
    // the body's real speed over the ground: the game stops and taps faster than the gait's weight can follow
    if (this.last && Math.hypot(group.position.x - this.last.x, group.position.z - this.last.z) > 1.5) { // a teleport (respawn, a door): the feet come along
      for (const l of this.legs) l.active = l.stepping = false;
      this.last.copy(group.position); this.yaw = heading; this.recent = 0;
    }
    if (this.last && dt > 1e-4) this.speed = Math.hypot(group.position.x - this.last.x, group.position.z - this.last.z) / dt;
    (this.last ||= new THREE.Vector3()).copy(group.position);
    const going = Math.min(1 - stand, clamp(this.speed / 1.2, 0, 1));   // 0 = standing (a tap is not a walk), 1 = really moving
    // once the body has stopped, a foot holds its place fully even while the stride's weight is still fading out
    const hold = reduced ? 0 : this.speed < 0.12 && stand > 1e-3 ? 1 : stand;
    // turning while moving: lean into the turn, chest ahead of the hips
    const omega = this.prevHeading === null || dt < 1e-4 ? 0 : clamp(wrapPi(heading - this.prevHeading) / dt, -12, 12);
    this.prevHeading = heading;
    const k8 = 1 - Math.exp(-8 * dt);
    this.bank += ((reduced ? 0 : clamp(omega * this.speed * BANK_GAIN, -BANK_MAX, BANK_MAX)) - this.bank) * k8;
    this.lead += ((reduced ? 0 : clamp(omega * LEAD_GAIN, -LEAD_MAX, LEAD_MAX) * clamp(this.speed / 1.7, 0, 1)) - this.lead) * k8;
    // a stop from a run: the fastest recent speed against the speed now
    this.recent = Math.max(this.recent - dt * 8, this.speed);
    if (this.speed > 1) this.braked = false;
    if (!reduced && !this.braked && this.speed < 0.3 && this.recent > 2.2) { this.brake = clamp((this.recent - 1.5) / 1.8, 0, 1); this.braked = true; }
    this.brake *= Math.exp(-dt * 4.5);
    this.dip += (BRAKE_DIP * this.brake - this.dip) * (1 - Math.exp(-13 * dt));
    this.tip += (BRAKE_PITCH * this.brake - this.tip) * (1 - Math.exp(-11 * dt));
    this.model.position.y = this.baseY - this.dip;
    this.model.rotation.z = this.baseRoll + this.bank * BANK_SIGN;
    if (Math.abs(this.lead) > 1e-4 || this.tip > 1e-4) {
      _ax.set(Math.cos(heading), 0, -Math.sin(heading));                 // the character's left axis: a positive turn about it tips forward
      turnBone(this.spine, UP, this.lead * 0.4); turnBone(this.chest, UP, this.lead * 0.6);
      turnBone(this.spine, _ax, this.tip * 0.45); turnBone(this.chest, _ax, this.tip * 0.55);
    }
    if (this.yaw === null) this.yaw = heading;
    const diff = wrapPi(heading - this.yaw);
    const rate = TURN_RATE + Math.max(going, free) * 12, ease = 10 + Math.max(going, free) * 20;
    this.yaw += clamp(diff * (1 - Math.exp(-ease * dt)), -rate * dt, rate * dt);
    if (stand < 1e-3 && Math.abs(wrapPi(heading - this.yaw)) < 0.02) this.yaw = heading;
    this.model.rotation.y = this.baseYaw + wrapPi(this.yaw - heading);
    group.updateMatrixWorld(true);
    if (stand < 1e-3) { for (const l of this.legs) l.active = l.stepping = false; return; }
    const groundY = group.position.y;
    for (let i = 0; i < 2; i++) {
      const l = this.legs[i], other = this.legs[1 - i];
      l.foot.getWorldPosition(_home); l.foot.getWorldQuaternion(_hq);
      _home.y += this.dip;                                              // the hips sink, the feet stay on the ground
      if (!l.active) {
        l.active = true; l.pos.copy(_home); l.yaw = this.yaw; l.stepping = false;
        if (_home.y - groundY > this.restFootY + 0.03) { l.stepping = true; l.u = 0.5; l.from.copy(_home); l.fromYaw = this.yaw; } // caught in the air: it lands
      }
      const d = Math.hypot(l.pos.x - _home.x, l.pos.z - _home.z), dy = Math.abs(wrapPi(this.yaw - l.yaw));
      if (!l.stepping && (d > STEP_DIST || dy > STEP_YAW) && (!other.stepping || other.u > 0.75)) { l.stepping = true; l.u = 0; l.from.copy(l.pos); l.fromYaw = l.yaw; }
      if (l.stepping) {
        l.u += dt / STEP_TIME;
        const k = smooth(l.u);
        l.pos.lerpVectors(l.from, _home, k);
        l.pos.y = _home.y + STEP_LIFT * Math.sin(Math.PI * clamp(l.u, 0, 1));
        l.yaw = l.fromYaw + wrapPi(this.yaw - l.fromYaw) * k;
        if (l.u >= 1) { l.stepping = false; l.pos.copy(_home); l.yaw = this.yaw; }
      } else l.pos.y = _home.y;
      _tgt.lerpVectors(_home, l.pos, hold);
      solveTwoBone(l.thigh, l.shin, l.foot, _tgt);
      // the foot keeps the clip's own tilt, turned to where it was planted
      _qs.setFromAxisAngle(UP, wrapPi(l.yaw - this.yaw) * hold);
      _hq.premultiply(_qs);
      l.shin.getWorldQuaternion(_qk);
      l.foot.quaternion.copy(_qk.invert().multiply(_hq));
    }
  }
}
