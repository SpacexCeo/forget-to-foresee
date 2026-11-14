// Spell VFX (src/render/spell-fx.js): casts are pooled streaks and ribbons, projectiles leave fading trails, nothing grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpellFx } from '../../src/render/spell-fx.js';

test('ember orbs and gale shurikens trail, impacts spark, and everything settles with a fixed object count', () => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(); cam.position.set(0, 5, 10);
  const fx = createSpellFx({ THREE, parent: scene });
  const count = () => { let n = 0; scene.traverse(() => n++); return n; };
  const base = count();
  const orb = fx.ember(), disc = fx.gale(); scene.add(orb, disc);
  for (let i = 0; i < 30; i++) { orb.position.x += 0.4; disc.position.z += 0.3; fx.update(1 / 60, cam); }
  assert.ok(fx.stats().streaks > 0 && fx.stats().ribbons >= 5);
  for (let i = 0; i < 50; i++) fx.impact(['ember', 'gale', 'blade'][i % 3], [0, 1, 0], [0, 1]);
  orb.removeFromParent(); disc.removeFromParent();
  for (let i = 0; i < 180; i++) fx.update(1 / 60, cam);
  assert.deepEqual(fx.stats(), { projectiles: 0, streaks: 0, ribbons: 0 });
  assert.equal(count(), base, 'no leftover objects');
  fx.dispose(); assert.equal(fx.group.parent, null);
});
