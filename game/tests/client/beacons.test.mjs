// Shell beacons: which Shells are lit in the world (play/beacon-plan.js) and how the lights ease (render/beacons.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shellBeaconLevels, beaconStrength, pointerTarget, pointerPose, BEACON_OFF, BEACON_SIGN, BEACON_GOAL } from '../../src/play/beacon-plan.js';
import { ShellBeacons, GoalPointer } from '../../src/render/beacons.js';
import { LAYER_OVERLAY } from '../../src/render/layers.js';
import { waitingShells } from '../../src/play/hub.js';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';

test('levels: a Shell with an open sign is lit, the goal Shell strongest, the rest dark', () => {
  assert.deepEqual(shellBeaconLevels({ waiting: [1, 3], goalTarget: 'shell:1' }), [BEACON_GOAL, BEACON_OFF, BEACON_SIGN, BEACON_OFF]);
  assert.deepEqual(shellBeaconLevels({ waiting: [2], goalTarget: null }), [BEACON_OFF, BEACON_SIGN, BEACON_OFF, BEACON_OFF]);
  assert.deepEqual(shellBeaconLevels({ waiting: [], goalTarget: 'anchor_zone:4' }), [0, 0, 0, BEACON_GOAL], 'an anchor goal lights its Shell too');
  assert.deepEqual(shellBeaconLevels({ waiting: [9, 0], goalTarget: 'camp:moh' }), [0, 0, 0, 0], 'unknown targets and Shell numbers are ignored');
  assert.deepEqual(shellBeaconLevels(), [0, 0, 0, 0]);
});

test('levels: no beacons inside a Shell or during a chapter film', () => {
  assert.deepEqual(shellBeaconLevels({ waiting: [1, 2], goalTarget: 'shell:2', zone: 'shell' }), [0, 0, 0, 0]);
  assert.deepEqual(shellBeaconLevels({ waiting: [1, 2], goalTarget: 'shell:2', filmPlaying: true }), [0, 0, 0, 0]);
});

test('strength: goal above sign above off', () => {
  assert.ok(beaconStrength(BEACON_GOAL) > beaconStrength(BEACON_SIGN));
  assert.ok(beaconStrength(BEACON_SIGN) > 0);
  assert.equal(beaconStrength(BEACON_OFF), 0);
});

test('judge season, trial 1: the goal names the Shell with the waiting sign and that Shell gets the goal beacon', async () => {
  const session = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE_SEED }) });
  await session.start();
  session.flags.hub = true; session.recompute();
  const waiting = waitingShells(session.obs);
  assert.ok(waiting.length >= 1, 'a sign waits on trial 1');
  const m = /^shell:(\d)$/.exec(session.goal.target || '');
  assert.ok(m, 'the first goal targets a Shell: ' + session.goal.target);
  const levels = shellBeaconLevels({ waiting, goalTarget: session.goal.target, zone: 'island' });
  assert.equal(levels[Number(m[1]) - 1], BEACON_GOAL);
  assert.equal(levels.filter((l) => l === BEACON_GOAL).length, 1);
});

function shells() {
  return [0, 1, 2, 3].map((index) => ({ index, instance: { root: new THREE.Group(), def: { height: 18, radius: 10 } } }));
}

test('ShellBeacons: hidden until lit, eases in, the marker only on the goal Shell, everything on the overlay layer', () => {
  const list = shells();
  const b = new ShellBeacons({ shells: list });
  assert.equal(b.items.length, 4);
  b.update(0.016);
  assert.ok(b.items.every((it) => !it.group.visible), 'nothing is drawn while every level is off');
  b.setLevels([BEACON_GOAL, BEACON_SIGN, 0, 0]);
  b.update(0.016);
  const early = b.items[0].strength;
  assert.ok(early > 0 && early < 0.2, 'the light fades in, it does not pop');
  for (let i = 0; i < 300; i++) b.update(0.016);
  assert.ok(Math.abs(b.items[0].strength - 1) < 0.01);
  assert.ok(Math.abs(b.items[1].strength - beaconStrength(BEACON_SIGN)) < 0.01);
  assert.ok(b.items[0].mark.visible && !b.items[1].mark.visible);
  assert.ok(b.items[0].group.visible && b.items[1].group.visible && !b.items[2].group.visible);
  assert.equal(b.items[0].group.parent, list[0].instance.root, 'the beacon rides the hovering Shell');
  const overlay = new THREE.Layers(); overlay.set(LAYER_OVERLAY);
  for (const it of b.items) for (const m of [it.column, it.ring, it.mark]) {
    assert.ok(m.layers.test(overlay), 'kept out of the ambient-occlusion pass');
    assert.equal(m.material.depthWrite, false);
    assert.equal(m.material.transparent, true);
  }
  b.setLevels([0, 0, 0, 0]);
  for (let i = 0; i < 400; i++) b.update(0.016);
  assert.ok(b.items.every((it) => !it.group.visible), 'fades out and stops drawing');
});

test('ShellBeacons: reduced motion sets the light at once and holds it still', () => {
  const b = new ShellBeacons({ shells: shells() });
  b.setLevels([0, BEACON_GOAL, 0, 0]);
  b.update(0.016, true);
  assert.equal(b.items[1].strength, 1);
  const y = b.items[1].mark.position.y, t = b.items[1].column.material.uniforms.uTime.value;
  b.update(0.5, true);
  assert.equal(b.items[1].mark.position.y, y);
  assert.equal(b.items[1].column.material.uniforms.uTime.value, t);
});

test('pointerTarget: the Shell or the anchor zone the goal names; nothing for other goals', () => {
  const places = { shells: [[37, 14, 37], [-35, 22, 35]], anchors: [[4.7, 0, 4.7], [-4.7, 0, 4.7]] };
  assert.deepEqual(pointerTarget('shell:2', places), { kind: 'shell', position: [-35, 22, 35] });
  assert.deepEqual(pointerTarget('anchor_zone:1', places), { kind: 'anchor_zone', position: [4.7, 0, 4.7] });
  assert.equal(pointerTarget('shell:4', places), null, 'no position known');
  assert.equal(pointerTarget('camp:moh', places), null);
  assert.equal(pointerTarget(null, places), null);
});

test('pointerPose: aims along the ground at the target, fades out on arrival, off inside a Shell and in films', () => {
  const east = pointerPose([0, 0, 0], [10, 14, 0]);
  assert.ok(Math.abs(east.yaw - Math.PI / 2) < 1e-9, 'local +Z turns to +X; height is ignored');
  assert.equal(east.strength, 1);
  assert.equal(pointerPose([0, 0, 0], [0, 0, 20]).yaw, 0);
  assert.equal(pointerPose([0, 0, 0], [0, 0, 4]).strength, 0, 'already there');
  const edge = pointerPose([0, 0, 0], [0, 0, 6.5]).strength;
  assert.ok(edge > 0 && edge < 1, 'a soft edge, no pop');
  assert.equal(pointerPose([0, 0, 0], null).strength, 0);
  assert.equal(pointerPose([0, 0, 0], [10, 0, 0], { zone: 'shell' }).strength, 0);
  assert.equal(pointerPose([0, 0, 0], [10, 0, 0], { filmPlaying: true }).strength, 0);
});

test('GoalPointer: sits at the feet, points the chevrons at the target, hides when there is nothing to point at', () => {
  const scene = new THREE.Scene();
  const p = new GoalPointer({ scene });
  p.update(0.016, [1, 2, 3], { yaw: 0, strength: 0 });
  assert.equal(p.group.visible, false);
  for (let i = 0; i < 200; i++) p.update(0.016, [1, 2, 3], { yaw: Math.PI / 2, strength: 1 });
  assert.equal(p.group.visible, true);
  assert.ok(Math.abs(p.group.rotation.y - Math.PI / 2) < 0.01);
  assert.ok(Math.abs(p.group.position.x - 1) < 1e-9 && p.group.position.y > 2 && p.group.position.y < 2.2, 'just above the ground');
  scene.updateMatrixWorld(true);
  const tip = p.chevrons[2].getWorldPosition(new THREE.Vector3());
  assert.ok(tip.x > 3 && Math.abs(tip.z - 3) < 0.01, 'the chevrons run out toward +X from Iris');
  // the short way round across the ±π seam
  for (let i = 0; i < 200; i++) p.update(0.016, [1, 2, 3], { yaw: Math.PI - 0.1, strength: 1 });
  p.update(0.016, [1, 2, 3], { yaw: -Math.PI + 0.1, strength: 1 });
  assert.ok(p.yaw > Math.PI - 0.11, 'no spin through zero: ' + p.yaw);
  for (let i = 0; i < 300; i++) p.update(0.016, [1, 2, 3], { yaw: 0, strength: 0 });
  assert.equal(p.group.visible, false);
  p.update(0.016, [0, 0, 0], { yaw: 1.2, strength: 1 }, true);
  assert.equal(p.group.rotation.y, 1.2, 'reduced motion: set at once');
  assert.ok(p.chevrons.every((m) => m.material.opacity > 0.8), 'reduced motion: steady chevrons');
});
