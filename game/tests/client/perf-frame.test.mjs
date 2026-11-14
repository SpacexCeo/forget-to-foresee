// Per-frame work the town no longer does (night 14.11 perf): the day cycle re-renders the sky LUT only once the sun has
// moved, the hidden dev HUD gathers no stats, and the frame loop leaves the prompt's DOM alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lutStale, LIVE_LUT_ANGLE, sunDirection, OBSERVER_ALTITUDE } from '../../src/render/sky.js';
import { DevHud } from '../../src/ui/dev-hud.js';

const uniformsFor = (sun, preset) => ({ uSunDir: { value: { ...sun } }, uMie: { value: preset.mie }, uOzone: { value: preset.ozone }, uAlt: { value: preset.altitude ?? OBSERVER_ALTITUDE } });
const preset = { elevation: 20, azimuth: 120, mie: 1, ozone: 1 };

test('the live sky LUT re-renders only once the sun has moved LIVE_LUT_ANGLE or the air changed', () => {
  const u = uniformsFor(sunDirection(20, 120), preset);
  assert.equal(lutStale(u, sunDirection(20, 120), preset), false, 'same sun: no re-render');
  // one frame of the eight-minute cycle at 60 fps moves the sun 0.0125°
  assert.equal(lutStale(u, sunDirection(20.0125, 120), preset), false);
  assert.equal(lutStale(u, sunDirection(20, 120.05), preset), false);
  assert.equal(lutStale(u, sunDirection(20 + 1.5 * LIVE_LUT_ANGLE * 180 / Math.PI, 120), preset), true, 'past the threshold: re-render');
  assert.equal(lutStale(u, sunDirection(20, 120), { ...preset, mie: 1.2 }), true, 'haze changed');
  assert.equal(lutStale(u, sunDirection(20, 120), { ...preset, ozone: 0.8 }), true, 'ozone changed');
  assert.equal(lutStale(u, sunDirection(20, 120), { ...preset, altitude: 2400 }), true, 'altitude changed');
});

test('a whole eight-minute day re-renders the LUT a few thousand times, not every frame', () => {
  const u = uniformsFor(sunDirection(-10, 0), preset);
  let renders = 0; const frames = 8 * 60 * 60;
  for (let i = 0; i <= frames; i++) {
    const p = { ...preset, elevation: -10 + 60 * Math.sin(i / frames * Math.PI), azimuth: 360 * i / frames };
    const sun = sunDirection(p.elevation, p.azimuth);
    if (lutStale(u, sun, p)) { u.uSunDir.value = { ...sun }; renders++; }
    // the LUT in use never lags the sun by more than the threshold
    const s = u.uSunDir.value; assert.ok(Math.acos(Math.min(1, s.x * sun.x + s.y * sun.y + s.z * sun.z)) <= LIVE_LUT_ANGLE + 1e-9);
  }
  assert.ok(renders < frames / 4, `${renders} renders for ${frames} frames`);
  assert.ok(renders > 100, 'it still follows the sun');
});

test('the hidden dev HUD never gathers its stats; shown, it gathers them at 4 Hz', () => {
  const hud = new DevHud({ hidden: false, innerHTML: '' });
  let calls = 0;
  const stats = () => { calls++; return { info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 1, textures: 1 } }, physics: { steps: 1, substeps: 1, colliders: 1, grounded: true }, streaming: { list: [], loaded: 0, loading: 0, cold: 0, absent: 0, failed: 0, cachedBytes: 0 }, events: [], camera: { lastSweep: 1 }, lookdev: null }; };
  for (let i = 0; i < 120; i++) hud.update(1 / 60, stats);
  assert.equal(calls, 0);
  hud.toggle();
  for (let i = 0; i < 60; i++) hud.update(1 / 60, stats);
  assert.ok(calls >= 4 && calls <= 5, `${calls} gathers in one second`);
  assert.match(hud.el.innerHTML, /draw calls 1/);
});

test('the frame loop writes the prompt only when its text changes and passes the HUD a lazy getter', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /if \(promptHtml !== lastPromptHtml\)/);
  assert.match(src, /hud\.update\(dt, hudStats\)/);
  assert.doesNotMatch(src, /hud\.update\(dt, \{/);
});
