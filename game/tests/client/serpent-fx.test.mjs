// The ice serpent's attack effects (owner 14.11): tells that fill as the blow comes, the breath stream, the slam's
// geyser and waves, the roar, frost on Iris. Pooled: a fixed particle budget, nothing grows, everything fades out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SERPENT_FX, teleFill, telegraphMaterial, setTele, createSerpentFx } from '../../src/render/serpent-fx.js';

test('a tell fills from 0 to 1 as the blow comes, faster at the end', () => {
  assert.equal(teleFill(0), 0); assert.equal(teleFill(1), 1); assert.equal(teleFill(-1), 0); assert.equal(teleFill(2), 1);
  let prev = -1; for (let k = 0; k <= 1.0001; k += 0.05) { const f = teleFill(k); assert.ok(f >= prev, 'monotone'); prev = f; }
  assert.ok(teleFill(0.5) < 0.5, 'the last half fills more than the first: the swing gathers');
  const m = telegraphMaterial(THREE, { axis: 2, inner: 0, outer: 34, color: 0x9fe8ff });
  setTele(m, 0.5, 0.7, 3);
  assert.equal(m.uniforms.uOp.value, 0.7); assert.equal(m.uniforms.uTime.value, 3); assert.equal(m.uniforms.uK.value, teleFill(0.5));
  assert.equal(m.uniforms.uOuter.value, 34); assert.equal(m.uniforms.uAxis.value, 2);
  assert.equal(m.depthWrite, false);
});

test('the effects stay inside their pool and fade out completely', () => {
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const root = new THREE.Group();
  const sfx = createSerpentFx({ THREE, parent: root, rand });
  const posArr = sfx.group.children[0].geometry.attributes.position.array;
  sfx.inhale([0, 6, 0], 1.2);
  for (let i = 0; i < 70; i++) sfx.update(1 / 60);
  assert.ok(sfx.live > 20, `the inhale draws motes (${sfx.live})`);
  for (let i = 0; i < 48; i++) { sfx.breathFrame([0, 6, 0], [0, 1], 0.42, 26, 1 / 60); sfx.update(1 / 60); }
  for (const k of ['slam', 'sweep', 'lunge', 'breath', 'claw', 'dive']) sfx.strike(k, { at: [3, 4], dir: [0, 1], A: { radius: 6.5, inner: 7, length: 30, width: 5, half: 0.4 }, boss: [0, 0] });
  sfx.roar([0, 0, 0]); sfx.frostOn([1, 0, 1]); sfx.wave([0, 0, 0], 0xffffff, 3);
  sfx.update(1 / 60);
  assert.ok(sfx.live <= SERPENT_FX.frost, 'never more than the pool');
  assert.ok(sfx.live > 100, 'a busy moment is busy');
  for (let i = 0; i < 60 * 4; i++) sfx.update(1 / 60);
  assert.equal(sfx.live, 0, 'all gone after four seconds');
  assert.equal(sfx.group.children[0].geometry.attributes.position.array, posArr, 'the same buffer: nothing reallocated per frame');
  for (const c of sfx.group.children) if (!c.isPoints) assert.equal(c.visible, false, `${c.type} hidden once done`);
  const before = sfx.group.children.length;
  for (let i = 0; i < 20; i++) sfx.breathFrame([0, 6, 0], [1, 0], 0.42, 26, 1 / 60);
  assert.equal(sfx.group.children.length, before, 'the breath crust is made once, then reused');
  sfx.dispose();
  assert.equal(root.children.length, 0);
});

test('reduced motion and phones draw fewer particles', () => {
  let seed = 3; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const full = createSerpentFx({ THREE, parent: new THREE.Group(), rand }), calm = createSerpentFx({ THREE, parent: new THREE.Group(), rand });
  calm.update(0, true);
  full.roar([0, 0, 0]); calm.roar([0, 0, 0]); full.update(1 / 60); calm.update(1 / 60, true);
  assert.ok(calm.live < full.live * 0.6, `${calm.live} vs ${full.live}`);
  const phone = createSerpentFx({ THREE, parent: new THREE.Group(), mobile: true, rand });
  for (let i = 0; i < 10; i++) phone.roar([0, 0, 0]);
  phone.update(1 / 60);
  assert.ok(phone.live <= SERPENT_FX.frostPhone);
});

test('the arena drives the tells and the serpent\'s effects', () => {
  const src = readFileSync(new URL('../../src/scenes/shoal-arena.js', import.meta.url), 'utf8');
  assert.match(src, /const sfx = createSerpentFx\(/);
  for (const k of ['ring', 'band', 'line']) assert.match(src, new RegExp(`setTele\\(${k}\\.material, k, op, tt\\)`), k);
  assert.match(src, /sfx\.strike\(atk\.kind,/);
  assert.match(src, /sfx\.inhale\(mouth\(e\.attack\.dir\)/);
  assert.match(src, /sfx\.breathFrame\(mouth\(a\.dir\)/);
  assert.match(src, /sfx\.roar\(/);
  assert.match(src, /if \(r\.taken > 0\) sfx\.frostOn\(/);
  assert.match(src, /sfx\.update\(sdt, red\)/);
  assert.match(src, /sfx\.dispose\(\)/);
});

test('the boss tells are frost cracks, not flat shapes: no fill, shards and mist rise on the front, the serpent glows on its wind-up (owner 14.11)', async () => {
  const { crackMaterial } = await import('../../src/render/serpent-fx.js');
  const m = crackMaterial(THREE, { axis: 1, inner: 0, outer: 26, seed: 3 });
  assert.equal(m.uniforms.uOuter.value, 26); assert.equal(m.uniforms.uAxis.value, 1); assert.equal(m.depthWrite, false);
  assert.match(m.fragmentShader, /edge\(vW\.xz/, 'cracks are cell edges in world space');
  assert.doesNotMatch(m.fragmentShader, /0\.3 \* fill|stripe/, 'no filled area, no stripes');
  setTele(m, 0.4, 0.8, 1); assert.ok(m.uniforms.uK.value > 0 && m.uniforms.uK.value < 1);
  let seed = 9; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [kind, g] of [['ring', { at: [0, 0, 0], r: 6 }], ['band', { at: [0, 0, 0], r0: 7, r1: 17 }], ['strip', { at: [0, 0, 0], dir: [0, 1], len: 30, width: 5 }], ['cone', { at: [0, 0, 0], dir: [0, 1], half: 0.4, len: 26 }]]) {
    const sfx = createSerpentFx({ THREE, parent: new THREE.Group(), rand });
    for (let i = 0; i < 20; i++) { sfx.tellFrame(kind, g, 0.5, 1 / 60); sfx.update(1 / 60); }
    assert.ok(sfx.live > 5, `${kind}: shards rise on the front`);
  }
  const src = readFileSync(new URL('../../src/scenes/shoal-arena.js', import.meta.url), 'utf8');
  assert.equal((src.match(/crackMaterial\(THREE/g) || []).length, 4, 'all four tells');
  assert.doesNotMatch(src, /telegraphMaterial\(/, 'no flat tell left');
  assert.doesNotMatch(src, /RingGeometry\(0\.5, 0\.65/, 'the aim is a soft glow, not a ring');
  assert.match(src, /\/\/ the wind-up glow/);
  assert.equal((src.match(/sfx\.tellFrame\(/g) || []).length, 5);
});
