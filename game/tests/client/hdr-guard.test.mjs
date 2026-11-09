// The HDR guard (render/hdr-guard.js): non-finite colour must never reach the bloom (black squares on the bloom grid).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HDR_GUARD, HDR_GUARD_MAX, guardColor } from '../../src/render/hdr-guard.js';

test('non-finite channels black the pixel, the rest is clamped to [0, max]', () => {
  assert.deepEqual(guardColor([NaN, 1, 1]), [0, 0, 0]);
  assert.deepEqual(guardColor([Infinity, 0.5, 0.2]), [0, 0, 0]);
  assert.deepEqual(guardColor([-1, 0.5, 1e9]), [0, 0.5, HDR_GUARD_MAX]);
  assert.deepEqual(guardColor([2, 3, 4]), [2, 3, 4]);
});

test('the shader does the same on the GPU', () => {
  const f = HDR_GUARD.fragmentShader;
  assert.match(f, /isnan\(r\)/); assert.match(f, /isinf\(r\)/); assert.match(f, /clamp\(r, 0\.0, maxValue\)/);
  assert.equal(HDR_GUARD.uniforms.maxValue.value, HDR_GUARD_MAX);
});

test('the post chain guards before the bloom, after the rays that read the render depth', () => {
  const src = readFileSync(new URL('../../src/render/post.js', import.meta.url), 'utf8');
  const at = (re) => src.search(re);
  assert.ok(at(/composer\.addPass\(guard\)/) > at(/composer\.addPass\(rays\)/), 'guard after the rays');
  assert.ok(at(/composer\.addPass\(guard\)/) < at(/composer\.addPass\(bloom\)/), 'guard before the bloom');
});
