import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleAt, mixLooks, DAY_CYCLE, DAY_CYCLE_LENGTH, RAIN_WINDOW } from '../../src/render/daycycle.js';
import { lookFor } from '../../src/render/sky.js';

test('the day cycle runs afternoon → dusk → afternoon in six minutes', () => {
  assert.equal(DAY_CYCLE_LENGTH, 360);
  assert.equal(cycleAt(0).k, 0);
  assert.equal(cycleAt(DAY_CYCLE.day - 1).k, 0);
  const mid = cycleAt(DAY_CYCLE.day + DAY_CYCLE.toDusk / 2).k;
  assert.ok(mid > 0.4 && mid < 0.6, 'half way to dusk');
  assert.equal(cycleAt(DAY_CYCLE.day + DAY_CYCLE.toDusk + 10).k, 1);
  assert.ok(cycleAt(DAY_CYCLE_LENGTH - 1).k < 0.01, 'back to day at the end of the loop');
  assert.equal(cycleAt(DAY_CYCLE_LENGTH).loop, 1);
});

test('rain falls only in the day phase of every second loop', () => {
  for (let s = 0; s < DAY_CYCLE_LENGTH; s += 5) assert.equal(cycleAt(s).weather, 'clear');
  const L = DAY_CYCLE_LENGTH;
  assert.equal(cycleAt(L + RAIN_WINDOW.overcast + 1).weather, 'overcast');
  assert.equal(cycleAt(L + RAIN_WINDOW.rain + 1).weather, 'rain');
  assert.equal(cycleAt(L + RAIN_WINDOW.clear + 1).weather, 'clear');
  assert.ok(RAIN_WINDOW.clear < DAY_CYCLE.day, 'the shower ends before dusk');
});

test('mixLooks blends numbers and the fog, keeps the ends exact', () => {
  const a = lookFor('town', null), b = lookFor('town', 'dusk');
  assert.equal(mixLooks(a, b, 0), a);
  assert.equal(mixLooks(a, b, 1), b);
  const m = mixLooks(a, b, 0.5);
  assert.ok(Math.abs(m.elevation - (a.elevation + b.elevation) / 2) < 1e-9);
  assert.ok(Math.abs(m.fog.density - (a.fog.density + b.fog.density) / 2) < 1e-9);
  assert.equal(m.location, 'town');
  assert.equal(mixLooks(a, b, 0.4).name, a.name);
  assert.equal(mixLooks(a, b, 0.6).name, 'dusk');
});

test('eased day-cycle light: the sun glides between two baked steps and stays a unit vector', async () => {
  const THREE = await import('three');
  const { mixAtm, copyAtm } = await import('../../src/render/lookdev.js');
  const atm = (el, warm) => ({ sun: new THREE.Vector3(0, Math.sin(el), Math.cos(el)), sunColor: new THREE.Color(1, 1 - warm, 1 - 2 * warm), sunIntensity: 3 - warm, sunRadiance: new THREE.Color(1, 1, 1), scale: 1, rawMean: 0.3, fogColor: new THREE.Color(0.5, 0.5, 0.6), fogSunTint: new THREE.Color(0.1, 0.05, 0), zenith: new THREE.Color(0.2, 0.3, 0.6), horizonSun: new THREE.Color(0.8, 0.6, 0.4) });
  const a = atm(0.6, 0), b = atm(0.2, 0.3);
  const from = copyAtm(null, a);
  a.sun.set(9, 9, 9); // the copy does not follow the source (the sky reuses nothing, the ease must not either)
  const half = mixAtm(null, from, b, 0.5);
  assert.ok(Math.abs(half.sun.length() - 1) < 1e-9);
  assert.ok(half.sun.y < from.sun.y && half.sun.y > b.sun.y, 'the sun sits between the two steps');
  assert.ok(Math.abs(half.sunIntensity - 2.85) < 1e-9);
  assert.ok(Math.abs(half.sunColor.g - 0.85) < 1e-9);
  const end = mixAtm(half, from, b, 1);
  assert.equal(end, half, 'blends into the holder it is given: no per-frame objects');
  assert.ok(end.sun.distanceTo(b.sun) < 1e-9);
});
