// The heroine's strike trails (owner 14.11): the limb that swings leaves a ribbon from the start to just past the impact,
// a flash blooms at the contact, everything fades; the blade's edge when she holds the Loomblade. Pooled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createStrikeTrail, lookFor, isLimbBone, STRIKE_LOOK, AFTER_IMPACT, TRAIL_FADE } from '../../src/render/strike-trail.js';
import { createHitFx } from '../../src/render/hit-fx.js';

test('looks per move and the limbs worth following', () => {
  assert.equal(lookFor('strike1'), 'strike'); assert.equal(lookFor('strike3'), 'strike3'); assert.equal(lookFor('super'), 'super');
  assert.equal(lookFor('slash1'), 'slash'); assert.equal(lookFor('cast_lance'), 'cast'); assert.equal(lookFor('snare'), 'cast'); assert.equal(lookFor('box_02'), 'strike');
  for (const k of Object.keys(STRIKE_LOOK)) assert.ok(Number.isInteger(STRIKE_LOOK[k].color));
  for (const n of ['hand_R', 'hand_L', 'R_Hand', 'L_Foot', 'foot_R', 'RightHand', 'L_Wrist']) assert.ok(isLimbBone(n), n);
  for (const n of ['index_R', 'thumb_mid_R', 'R_Finger1', 'toe_L', 'Spine01', 'hand_R_end', 'L_Upperarm']) assert.ok(!isLimbBone(n), n);
});

function rig() {
  const root = new THREE.Group(), hips = new THREE.Bone(); hips.name = 'hips'; root.add(hips);
  const armR = new THREE.Bone(); armR.name = 'forearm_R'; armR.position.set(0.3, 1.3, 0); hips.add(armR);
  const handR = new THREE.Bone(); handR.name = 'hand_R'; handR.position.set(0.28, 0, 0); armR.add(handR);
  const legL = new THREE.Bone(); legL.name = 'shin_L'; legL.position.set(-0.1, 0.5, 0); hips.add(legL);
  const footL = new THREE.Bone(); footL.name = 'foot_L'; footL.position.set(0, -0.45, 0); legL.add(footL);
  return { root, armR, handR, footL };
}

test('the fastest limb leads the ribbon, which shows through the swing and fades after the impact', () => {
  const scene = new THREE.Scene(), trail = createStrikeTrail({ THREE, parent: scene }), R = rig(); scene.add(R.root);
  const posArr = trail.ribbon.geometry.attributes.position.array;
  trail.start(R.root, 'strike1', 0.2);
  const dt = 1 / 60; let shown = 0;
  for (let i = 0; i < 26; i++) { R.armR.rotation.z = -i * 0.09; R.root.updateMatrixWorld(true); trail.update(dt); if (trail.ribbon.visible) shown++; if (i === 12) trail.impact(); }
  assert.equal(trail.lead, 'hand_R', 'the swinging fist leads, not the still foot');
  assert.ok(shown >= 12, 'the ribbon shows through the swing');
  assert.equal(trail.flash.visible, true, 'the contact flash blooms at the impact');
  assert.ok((0.2 + AFTER_IMPACT) < 26 * dt + 0.05);
  for (let i = 0; i < Math.ceil((TRAIL_FADE + 0.3) * 60); i++) trail.update(dt);
  assert.equal(trail.active, false); assert.equal(trail.ribbon.visible, false, 'gone after the fade'); assert.equal(trail.flash.visible, false);
  assert.equal(trail.ribbon.geometry.attributes.position.array, posArr, 'the same buffer: nothing reallocated');
  for (const v of posArr) assert.ok(Number.isFinite(v));
  trail.dispose();
  assert.equal(scene.children.includes(trail.ribbon), false);
});

test('with the Loomblade in her hand the ribbon follows the blade from hilt to tip', () => {
  const scene = new THREE.Scene(), trail = createStrikeTrail({ THREE, parent: scene }), R = rig(); scene.add(R.root);
  const sword = new THREE.Group(); R.handR.add(sword); R.root.updateMatrixWorld(true);
  trail.start(R.root, 'slash1', 0.15, sword);
  for (let i = 0; i < 6; i++) { R.armR.rotation.y = i * 0.2; R.root.updateMatrixWorld(true); trail.update(1 / 60); }
  assert.equal(trail.lead, 'blade');
  const p = trail.ribbon.geometry.attributes.position.array, tip = new THREE.Vector3(0, 0.94, 0); sword.localToWorld(tip);
  const last = [p[p.length - 3], p[p.length - 2], p[p.length - 1]];
  assert.ok(Math.hypot(last[0] - tip.x, last[1] - tip.y, last[2] - tip.z) < 1e-4, 'the newest sample ends at the tip');
});

test('the game drives the trail from her clips\' own moments', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /window\.addEventListener\('ftf:iris-action',/);
  assert.match(src, /strikeTrail\.start\(m\.model, d\.clip, d\.impact, heldBlade \? heldBlade\.sword : null\)/);
  assert.match(src, /strikeTrail\.impact\(\)/);
  assert.match(src, /strikeTrail\.update\(dt, lookdev\.reducedMotion\)/);
});

test('fists burn as warm and wide as the kick (owner liked the kick)', () => {
  assert.ok(STRIKE_LOOK.strike.width >= 0.42 && STRIKE_LOOK.strike3.width >= STRIKE_LOOK.strike.width);
  assert.equal(STRIKE_LOOK.strike.color, 0xffb35c);
});

test('the blade swoosh: its head runs along the arc, the tail dissolves, sparks fly off the head, then all is gone', () => {
  const scene = new THREE.Scene(); let seed = 5; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fx = createHitFx({ THREE, parent: scene, doc: null, rand });
  fx.slash([0, 1, 0], 0, 2, 0xfff4dc, 1, 0.1, 0.2);
  let mesh = null; fx.group.traverse((o) => { if (o.isMesh && o.material.uniforms && o.material.uniforms.uHead && o.visible) mesh = o; });
  assert.ok(mesh, 'a swoosh shows');
  const heads = []; for (let i = 0; i < 10; i++) { fx.update(1 / 60); heads.push(mesh.material.uniforms.uHead.value); }
  for (let i = 1; i < heads.length; i++) assert.ok(heads[i] >= heads[i - 1], 'the head only moves forward');
  assert.ok(heads[0] < 0.5 && heads[9] > heads[0], 'it is revealed over time, not all at once');
  let sparks = 0; fx.group.traverse((o) => { if (o.isPoints) { const a = o.geometry.attributes; for (const k of Object.keys(a)) void k; sparks++; } });
  assert.ok(sparks > 0);
  for (let i = 0; i < 120; i++) fx.update(1 / 60);
  assert.equal(mesh.visible, false, 'faded out');
  assert.ok(!('vertexColors' in mesh.material) || !mesh.material.vertexColors, 'no flat vertex-coloured crescent');
});

test('the arena draws no fixed arc in front of her: the strike light rides the limb or blade that swings (owner)', () => {
  const src = readFileSync(new URL('../../src/scenes/shoal-arena.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("fx.slash("), "no fixed arc");
});
