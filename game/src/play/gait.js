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
    this.weights = { walk: 0, run: 0 };
    this.move = 0;
    this.phase = START_PHASE;
  }

  /** @param {number} speed actual ground speed in m/s @returns {number} move weight 0..1 */
  update(dt, speed) {
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
    if (sum > 1e-4) this.phase = (this.phase + (dt * rate) / strideT) % 1;
    if (this.walk) { this.walk.weight = this.weights.walk; this.walk.timeScale = 0; this.walk.time = this.phase * walkT; }
    if (this.run) { this.run.weight = this.weights.run; this.run.timeScale = 0; this.run.time = this.phase * runT; }
    return this.move;
  }
}
