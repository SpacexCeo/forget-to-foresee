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
