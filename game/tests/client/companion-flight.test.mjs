// The dragon companion never flies through the heroine: a keep-out cylinder around her (scenes/companion-rules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepClear, COMPANION } from '../../src/scenes/companion-rules.js';

test('a point inside the cylinder is pushed to its wall, keeping its side and height', () => {
  const hero = { x: 10, y: 2, z: -4 };
  const p = keepClear({ x: 10.2, y: 3, z: -4.1 }, hero);
  assert.ok(Math.abs(Math.hypot(p.x - hero.x, p.z - hero.z) - COMPANION.keepOut) < 1e-9);
  assert.ok(p.x > hero.x && p.z < hero.z);
  assert.equal(p.y, 3);
});

test('outside the cylinder, above her head or exactly on her axis', () => {
  const hero = { x: 0, y: 0, z: 0 };
  assert.deepEqual(keepClear({ x: 2, y: 1, z: 0 }, hero), { x: 2, y: 1, z: 0 });
  assert.deepEqual(keepClear({ x: 0.1, y: 2.5, z: 0 }, hero), { x: 0.1, y: 2.5, z: 0 });
  const p = keepClear({ x: 0, y: 1, z: 0 }, hero);
  assert.ok(Math.hypot(p.x, p.z) >= COMPANION.keepOut - 1e-9);
});
