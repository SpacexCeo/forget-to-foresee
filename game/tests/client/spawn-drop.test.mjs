// Every way back into the town lands her on walkable ground, a short drop above it, never inside terrain (owner 14.11:
// "Return home" from the Glass Shoal put her inside the hillside by the cliff stone and she fell through for ever).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropSpawn, SPAWN_DROP, TOWN_SPAWN } from '../../src/scenes/town-layout.js';

test('dropSpawn: the ground under the point, cast from just above it, plus a short drop', () => {
  const casts = [];
  const groundAt = (x, z, fromY) => { casts.push(fromY); return 1210.25; };
  assert.deepEqual(dropSpawn(groundAt, [5, 1209, -3]), [5, 1210.25 + SPAWN_DROP, -3]);
  assert.equal(casts[0], 1212, 'cast from 3 m above the point, never from the sky (roofs, wall tops)');
  assert.ok(SPAWN_DROP > 0.2 && SPAWN_DROP < 1.2, 'a short drop: she lands, she does not fall');
  assert.equal(dropSpawn(() => null, [0, 0, 0]), null, 'no ground yet: the caller keeps its fallback');
  assert.equal(dropSpawn(() => NaN, [0, 0, 0]), null);
  assert.equal(dropSpawn(null, [0, 0, 0]), null);
  assert.deepEqual(dropSpawn(() => 2, [0, 0, 0], { lift: 1 }), [0, 3, 0]);
});

test('Return home from the Glass Shoal goes to the town\'s home spot, not 3 m behind the cliff stone at its height', () => {
  const gs = readFileSync(new URL('../../src/scenes/glass-shoal.js', import.meta.url), 'utf8');
  const body = gs.slice(gs.indexOf('function backToStone()'), gs.indexOf('function flyHome()'));
  assert.match(body, /const h = o\.home && o\.home\(\);/);
  assert.doesNotMatch(body, /w\.y \+ 0\.2/, 'the old in-the-hill spot is gone');
  assert.match(body, /groundAt\(w\.x, w\.z\)/, 'its fallback is grounded too');
});

test('boot-world: the Shoal, the return from the archipelago and the field respawn all land on the ground', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /function townHome\(spot = TOWN_SPAWN\)/);
  assert.match(src, /createGlassShoal\(\{[^\n]*home: townHome,/);
  assert.match(src, /const h = townHome\(TOWN_ALTAR_SPAWN\); player\.teleport\(h\.position, h\.heading\);/);
  assert.doesNotMatch(src, /player\.teleport\(TOWN_ALTAR_SPAWN\.position\.slice\(\)/);
  assert.match(src, /respawn: \{ slice: \(\) => \(dropSpawn\(/);
  assert.match(src, /Math\.max\(d \? d\[1\] : -Infinity, p\[1\] \+ SPAWN_DROP\)/, 'never below the spot\'s own data height');
  assert.ok(Array.isArray(TOWN_SPAWN.position) && TOWN_SPAWN.position.length === 3);
});
