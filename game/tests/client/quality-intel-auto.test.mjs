// Playtest 14.11: ~31 FPS on Intel Iris Xe at dpr 1.25 with quality "Auto". Auto must pick the low tier on
// integrated Intel GPUs (ANGLE renderer strings included), and the low tier must render at 1x pixel ratio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTier, qualityFor } from '../../src/render/quality.js';

test('Auto picks the low tier at 1x pixel ratio on integrated Intel GPUs', () => {
  for (const gpu of [
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Intel(R) Iris(R) Xe Graphics',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Intel Iris OpenGL Engine',
  ]) {
    const tier = detectTier({ gpu });
    assert.equal(tier, 'low', gpu);
    assert.equal(qualityFor(tier).pixelRatioCap, 1, gpu);
  }
});
