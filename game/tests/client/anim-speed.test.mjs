// The owner's Tripo pack clips play 1.3x faster (owner 14.11): one constant per clip file (play/anim-library.js
// CLIP_TIME_SCALE), applied at load; the timing extras and the ground speed follow, so strikes stay on their impact and
// feet do not slide.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CLIP_TIME_SCALE, timeScaleFor, speedUpClips } from '../../src/play/anim-library.js';

test('anim speed: the new pack files play 1.3x, the old ones as they were, ?animspeed overrides for QA', () => {
  for (const n of ['iris', 'elise', 'townsfolk_pack', 'townsfolk_wayfarer']) assert.equal(timeScaleFor(n, ''), 1.3, n);
  for (const n of ['iris_agent', 'townsfolk', 'npc_guard', 'iris_v1']) assert.equal(timeScaleFor(n, ''), 1, n);
  assert.equal(timeScaleFor('iris', '?animspeed=1'), 1); assert.equal(timeScaleFor('townsfolk', '?animspeed=2'), 1, 'an old file never changes');
  assert.ok(Object.isFrozen(CLIP_TIME_SCALE));
});

test('anim speed: keys, duration and the timing extras shrink together, the ground speed grows', () => {
  const track = new THREE.QuaternionKeyframeTrack('hand_R.quaternion', [0, 0.65, 1.3], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const strike = new THREE.AnimationClip('strike1', 1.3, [track]); strike.userData = { impact_s: 0.13, step_s: 0.13, release_s: 0.1, full_s: 1, loop: false };
  const walk = new THREE.AnimationClip('walk', 1.3, [new THREE.VectorKeyframeTrack('pelvis.position', [0, 1.3], [0, 0, 0, 0, 0, 0])]); walk.userData = { speed: 1.2, loop: true };
  speedUpClips([strike, walk], 1.3);
  assert.ok(Math.abs(strike.duration - 1) < 1e-6 && Math.abs(strike.tracks[0].times[2] - 1) < 1e-6);
  assert.ok(Math.abs(strike.userData.impact_s - 0.1) < 1e-6 && Math.abs(strike.userData.release_s - 0.1 / 1.3) < 1e-6 && Math.abs(strike.userData.full_s - 1 / 1.3) < 1e-6);
  assert.equal(strike.userData.impact_s / strike.duration, 0.1, 'the impact stays at the same point of the swing');
  assert.ok(Math.abs(walk.userData.speed - 1.56) < 1e-6, 'feet match: the cycle covers the same ground in less time');
  assert.equal(walk.userData.loop, true);
});
