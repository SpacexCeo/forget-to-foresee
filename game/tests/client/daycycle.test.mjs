import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleAt, cycleLook, mixLooks, lerpAngle, KEYS, DAY_CYCLE_LENGTH, RAIN_WINDOW } from '../../src/render/daycycle.js';
import { lookFor, mixStats, skyStats, TIME_PRESETS } from '../../src/render/sky.js';

const town = (h) => lookFor('town', h);

test('the loop: early morning → evening → dusk → twilight → night → early morning, no midday, eight minutes', () => {
  assert.deepEqual(KEYS.map((k) => k[0]), ['dawn', 'evening', 'dusk', 'twilight', 'night']);
  assert.equal(DAY_CYCLE_LENGTH, 560);
  assert.equal(cycleAt(0).a, 'dawn'); assert.equal(cycleAt(0).k, 0, 'a fresh session starts at early morning');
  assert.equal(cycleAt(DAY_CYCLE_LENGTH).loop, 1);
  for (let t = 0; t < DAY_CYCLE_LENGTH; t += 2) {
    const L = cycleLook(t, town).look;
    assert.ok(L.elevation <= 16.0001, `no high sun at ${t}s (${L.elevation})`);
    if (L.sunIntensity > 1) assert.ok(L.elevation <= 15, `a bright sun is a low sun at ${t}s`);
  }
  assert.ok(cycleLook(DAY_CYCLE_LENGTH - 1, town).look.name === 'dawn' || cycleAt(DAY_CYCLE_LENGTH - 1).b === 'dawn', 'the night hands back to early morning');
});

test('continuous: no jump between consecutive 1/60 s frames anywhere in the loop', () => {
  let prev = cycleLook(0, town).look;
  for (let t = 1 / 60; t < DAY_CYCLE_LENGTH + 1; t += 1 / 60) {
    const L = cycleLook(t, town).look;
    assert.ok(Math.abs(L.elevation - prev.elevation) < 0.05, `elevation step at ${t.toFixed(2)}s`);
    assert.ok(Math.abs(lerpAngle(prev.azimuth, L.azimuth, 1) - prev.azimuth) < 0.1, `azimuth step at ${t.toFixed(2)}s`);
    assert.ok(Math.abs(L.sunIntensity - prev.sunIntensity) < 0.02, `intensity step at ${t.toFixed(2)}s`);
    assert.ok(Math.abs(L.exposure - prev.exposure) < 0.01, `exposure step at ${t.toFixed(2)}s`);
    assert.ok(Math.abs(L.fog.density - prev.fog.density) < 0.001, `fog step at ${t.toFixed(2)}s`);
    assert.ok(Math.abs(L.lamps - prev.lamps) < 0.01, `lamp step at ${t.toFixed(2)}s`);
    prev = L;
  }
});

test('night: a cool moonlit key, stars, mist, lamps in warm pools', () => {
  const n = town('night');
  assert.ok(n.sunCool > 0.5 && n.stars === 1 && n.disc < 0.05);
  assert.ok(n.fog.density > town('dawn').fog.density * 1.5, 'ground mist');
  // cool and moonlit (owner 12.11): a blue-silver moon key and a moonlit fill; the lamps light warm pools, not the town
  assert.ok(n.sunCool >= 1 && n.moonFill >= 1 && n.sunIntensity >= 0.8, 'the moon is the key light');
  assert.ok(n.lamps >= 1.1 && n.lamps < 1.6 && n.windows >= 2, 'lamps and windows in warm pools');
  assert.ok(TIME_PRESETS.night && TIME_PRESETS.dawn && TIME_PRESETS.twilight && TIME_PRESETS.evening);
});

test('rain visits the evening and night of every second loop only', () => {
  for (let s = 0; s < DAY_CYCLE_LENGTH; s += 5) assert.equal(cycleAt(s).weather, 'clear');
  const L = DAY_CYCLE_LENGTH;
  assert.equal(cycleAt(L + RAIN_WINDOW.overcast + 1).weather, 'overcast');
  assert.equal(cycleAt(L + RAIN_WINDOW.rain + 1).weather, 'rain');
  assert.equal(cycleAt(L + RAIN_WINDOW.clear + 1).weather, 'clear');
  const at = cycleAt(L + RAIN_WINDOW.overcast + 1);
  assert.notEqual(at.a, 'dawn', 'never in the early morning');
});

test('mixLooks blends numbers, the fog and the azimuth the short way; absent disc means 1', () => {
  const a = town('afternoon'), b = town('dusk');
  assert.equal(mixLooks(a, b, 0), a); assert.equal(mixLooks(a, b, 1), b);
  const m = mixLooks(a, b, 0.5);
  assert.ok(Math.abs(m.elevation - (a.elevation + b.elevation) / 2) < 1e-9);
  assert.ok(Math.abs(m.fog.density - (a.fog.density + b.fog.density) / 2) < 1e-9);
  assert.equal(lerpAngle(170, -170, 0.5), 180);
  assert.equal(mixLooks(town('dawn'), town('twilight'), 0.5).disc, 0.6);
  assert.equal(mixLooks(a, b, 0.4).name, a.name); assert.equal(mixLooks(a, b, 0.6).name, 'dusk');
});

test('sky statistics blend between keyframes; no pixels gives neutral defaults', () => {
  const s0 = skyStats(null, town('dawn')), s1 = skyStats(null, town('night'));
  const m = mixStats(s0, s1, 0.5);
  assert.ok(Math.abs(m.scale - (s0.scale + s1.scale) / 2) < 1e-9);
  assert.equal(m.zenith.length, 3);
});

test('ground-fog cards follow the hour: thickest at night, light at dawn, almost none in the evening; off on low', async () => {
  const mist = (h) => town(h).mistCards || 0;
  assert.ok(mist('night') === 1 && mist('dawn') > mist('evening') && mist('twilight') > mist('dawn'));
  const { readFileSync } = await import('node:fs');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.ok(boot.includes('fogCards.update(') && boot.includes("enabled: lookdev.tier !== 'low'"));
  const fc = readFileSync(new URL('../../src/render/fog-cards.js', import.meta.url), 'utf8');
  assert.match(fc, /reducedMotion \? 0/); assert.match(fc, /depthWrite: false/);
});
