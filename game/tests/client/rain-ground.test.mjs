// Rain splashes land on the surface under each drop (owner 13.11: they sat at the player's height, floating on walls).
import assert from 'node:assert/strict';
import test from 'node:test';
import { Splashes } from '../../src/render/weather.js';

test('each splash cell takes the ground height under it from the sampler, not the walking height', () => {
  const s = new Splashes({ capacity: 16, radius: 8 });
  s.setGround(0, 5, 0); // she stands on a 5 m wall
  s.setGroundSampler((x, z) => (x > 2 ? 0 : x < -6 ? null : 5)); // street below her to the east, the wall where she is, void far west
  let used = 0; for (let i = 0; i < 40; i++) used += s.refreshHeights(64);
  assert.equal(used, 32 * 32, 'every cell sampled once');
  const N = s.hN, c = 16 / N, H = s.hData;
  const cellOf = (x, z) => { const m = (a) => ((a % 16) + 16) % 16; return Math.floor(m(z) / c) * N + Math.floor(m(x) / c); };
  assert.equal(H[cellOf(5, 0) * 4], 0); assert.equal(H[cellOf(5, 0) * 4 + 1], 1);   // the street: ground 0, valid
  assert.equal(H[cellOf(0, 0) * 4], 5);                                              // the wall top she stands on
  assert.equal(H[cellOf(-7, 0) * 4 + 1], 0);                                         // no ground: no splash there
  assert.equal(s.material.uniforms.uUseH.value, 1);
});

test('moving the centre resamples only the cells that now cover new ground; no sampler keeps the old behaviour', () => {
  const s = new Splashes({ capacity: 16, radius: 8 });
  let calls = 0; s.setGround(0, 0, 0); s.setGroundSampler(() => { calls++; return 0; });
  while (s.refreshHeights(64)) { /* fill */ }
  calls = 0; s.setGround(1, 0, 0); while (s.refreshHeights(64)) { /* refill */ }
  assert.ok(calls > 0 && calls <= 32 * 2, `one or two columns resampled, got ${calls}`);
  const t = new Splashes({ capacity: 16, radius: 8 });
  assert.equal(t.material.uniforms.uUseH.value, 0);
  assert.equal(t.refreshHeights(), 0);
});
