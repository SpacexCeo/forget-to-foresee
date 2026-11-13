// The Glass Shoal look data (docs/plans/boss/glass-shoal-boss.md): presets inside their ranges, clamping and JSON,
// the sun direction, quality tiers (phone never renders the scene twice), the grade LUT and its curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/render/shoal-look-data.js';

test('presets: every value inside its range; the default is the low sun', () => {
  for (const [name, p] of Object.entries(D.SHOAL_PRESETS)) for (const r of D.SHOAL_PARAMS) assert.ok(p[r.key] >= r.min && p[r.key] <= r.max, `${name}.${r.key}`);
  assert.equal(D.SHOAL_DEFAULT, D.SHOAL_PRESETS.lowSun); assert.ok(D.SHOAL_DEFAULT.sunHeight < 12, 'a low sun');
});

test('clamp and JSON: out-of-range values are held, unknown keys dropped, the JSON round-trips', () => {
  const c = D.clampParams({ fov: 500, exposure: -3, nope: 1 });
  assert.equal(c.fov, 80); assert.equal(c.exposure, 0.3); assert.equal(c.nope, undefined); assert.equal(c.sunHeight, D.SHOAL_DEFAULT.sunHeight);
  const j = JSON.parse(D.lookJson(D.SHOAL_PRESETS.pearlDawn));
  assert.deepEqual(Object.keys(j), D.SHOAL_PARAMS.map((p) => p.key));
  for (const k of Object.keys(j)) assert.ok(Math.abs(j[k] - D.SHOAL_PRESETS.pearlDawn[k]) <= (D.SHOAL_PARAMS.find((p) => p.key === k).step + 1e-9), k);
  assert.deepEqual(D.lookFromQuery('?render=1&shoalLook=stormSilver'), { panel: true, preset: 'stormSilver', params: D.SHOAL_PRESETS.stormSilver });
  assert.equal(D.lookFromQuery('?shoalLook=nope').preset, 'lowSun');
});

test('sun: direction is a unit vector, low sun near the horizon, amber when low and whiter when high', () => {
  const d = D.sunDirection(7, 238); assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9); assert.ok(d[1] > 0 && d[1] < 0.13);
  assert.deepEqual(D.sunDirection(0, 90).map((v) => +v.toFixed(6)), [1, 0, 0]);
  const lo = D.sunColor(3), hi = D.sunColor(40); assert.ok(lo[2] < hi[2] && lo[1] < hi[1] && lo[0] === 1);
});

test('quality: desktop high has the planar reflector, cascades, bloom and rays; phone never renders the scene twice', () => {
  const h = D.shoalQuality('high', 'desktop'), u = D.shoalQuality('ultra', 'desktop'), l = D.shoalQuality('low', 'desktop');
  assert.ok(h.reflector && h.cascades >= 3 && h.bloom && h.rays); assert.ok(u.cascades === 4 && u.reflectorScale === 1);
  assert.equal(l.bloom, false); assert.equal(l.cascades, 1);
  for (const t of ['ultra', 'high', 'low']) { const p = D.shoalQuality(t, 'phone'); assert.equal(p.reflector, false); assert.equal(p.cascades, 1); assert.ok(p.bloomScale <= 0.5 && p.pixelRatioMax <= 1.5); }
});

test('grade: lift raises blacks, gain lifts highlights, saturation 0 is grey; the LUT strip holds the same curve', () => {
  const base = { ...D.SHOAL_DEFAULT, warmth: 0, saturation: 1, lift: 0, gamma: 1, gain: 1 };
  assert.deepEqual(D.gradeRgb([0.5, 0.5, 0.5], base).map((v) => +v.toFixed(5)), [0.5, 0.5, 0.5], 'neutral is identity');
  assert.ok(D.gradeRgb([0, 0, 0], { ...base, lift: 0.05 })[0] > 0.04);
  assert.ok(D.gradeRgb([0.6, 0.6, 0.6], { ...base, gain: 1.2 })[0] > 0.7);
  const g = D.gradeRgb([0.9, 0.2, 0.1], { ...base, saturation: 0 }); assert.ok(Math.abs(g[0] - g[1]) < 1e-9 && Math.abs(g[1] - g[2]) < 1e-9);
  const w = D.gradeRgb([0.8, 0.8, 0.8], { ...base, warmth: 1 }); assert.ok(w[0] > w[2], 'warm highlights');
  const L = D.buildLut(base, 16); assert.equal(L.width, 256); assert.equal(L.height, 16); assert.equal(L.data.length, 256 * 16 * 4);
  const at = (r, g2, b) => { const i = (g2 * 256 + b * 16 + r) * 4; return [L.data[i], L.data[i + 1], L.data[i + 2]]; };
  assert.deepEqual(at(15, 0, 0), [255, 0, 0]); assert.deepEqual(at(0, 15, 15), [0, 255, 255]); assert.deepEqual(at(5, 5, 5), [85, 85, 85]);
});
