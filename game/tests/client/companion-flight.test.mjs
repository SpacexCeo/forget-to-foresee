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

test('the ground light shrinks and dims as the dragon rises and goes out when it sits', async () => {
  const { glowAt } = await import('../../src/scenes/companion-rules.js');
  const low = glowAt(0.3), high = glowAt(2.0), top = glowAt(9);
  assert.ok(low.radius > high.radius && high.radius >= top.radius && top.radius > 0);
  assert.ok(low.opacity > high.opacity && top.opacity > 0);
  assert.equal(glowAt(0.1, true).opacity, 0);
  assert.ok(COMPANION.bobCalm < COMPANION.bob && COMPANION.motes.phone < COMPANION.motes.desktop);
});
