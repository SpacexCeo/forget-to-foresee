// Monster combat feel (render/mob-fx.js): the shader patch finds its anchors in three's standard shader, a hit
// flashes and recoils then settles, the dissolve runs to the end and hides the monster.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobFx, mobMaterial, HIT_SECONDS, DISSOLVE_SECONDS, MOB_GLOW } from '../../src/render/mob-fx.js';

test('the flash and dissolve patch hooks into the standard material shader', () => {
  const u = { dissolve: { value: 0 }, edge: { value: new THREE.Color(1, 0.6, 0.3) }, flash: { value: 0 }, rim: { value: 0.3 } };
  const m = mobMaterial(new THREE.MeshStandardMaterial(), u);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.uDissolve, u.dissolve);
  assert.match(shader.vertexShader, /vMobWorld = \(modelMatrix/);
  assert.match(shader.fragmentShader, /discard;/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= uEdge/);
  assert.match(m.customProgramCacheKey(), /ftf-mob$/);
});

test('hit flashes and recoils, then the dissolve hides the monster', () => {
  const root = new THREE.Group(); const inner = new THREE.Group(); root.add(inner);
  const mat = new THREE.MeshStandardMaterial(); inner.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
  const fx = new MobFx(root, { edge: MOB_GLOW.skitter });
  assert.notEqual(inner.children[0].material, mat, 'the shared material is cloned');
  fx.hit(); fx.update(HIT_SECONDS / 2);
  assert.ok(fx.u.flash.value > 0); assert.ok(inner.position.z < 0, 'pushed back');
  fx.update(HIT_SECONDS);
  assert.equal(fx.u.flash.value, 0); assert.equal(inner.position.z, 0, 'settled');
  fx.die(); fx.update(DISSOLVE_SECONDS / 2);
  assert.ok(fx.u.dissolve.value > 0.4 && fx.u.dissolve.value < 0.6); assert.equal(fx.done, false);
  fx.update(DISSOLVE_SECONDS); assert.equal(fx.done, true); assert.equal(root.visible, false);
  fx.hit(); assert.equal(fx.hitT, 0, 'no flash after death');
});
