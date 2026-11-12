import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleAt, cycleLook, mixLooks, lerpAngle, KEYS, DAY_CYCLE_LENGTH, weatherTimeline, weatherAt, startPhase, WEATHER_FADE } from '../../src/render/daycycle.js';
import { WEATHER, HEAVY_WEATHER } from '../../src/render/weather.js';
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

test('each session has its own weather timeline: calm spells, fog fronts, rain fronts, a rare storm', () => {
  const N = 400; let rainSoon = 0, storms = 0, fronts = 0;
  for (let seed = 1; seed <= N; seed++) {
    const tl = weatherTimeline(seed);
    assert.equal(tl[0][0], 0); assert.ok(['clear', 'haze'].includes(tl[0][1]), 'a session opens calm');
    for (let i = 1; i < tl.length; i++) {
      assert.ok(tl[i][0] - tl[i - 1][0] >= WEATHER_FADE * 2, `every state outlasts its ease (seed ${seed})`);
      assert.ok(WEATHER[tl[i][1]], tl[i][1]);
    }
    if (tl.some(([t, w]) => (w === 'rain' || w === 'storm' || w === 'drizzle') && t <= 600)) rainSoon++;
    for (const [, w] of tl) { if (w === 'storm') storms++; if (w === 'rain' || w === 'storm') fronts++; }
    assert.equal(weatherAt(tl, 0), tl[0][1]); assert.equal(weatherAt(tl, tl[2][0] + 1), tl[2][1]);
    assert.equal(JSON.stringify(weatherTimeline(seed)), JSON.stringify(tl), 'seeded');
  }
  assert.ok(rainSoon / N > 0.4 && rainSoon / N < 0.7, `rain within ten minutes in about half the sessions (${rainSoon}/${N})`);
  assert.ok(storms > 0 && storms / fronts < 0.3, `storms are rare (${storms}/${fronts})`);
  assert.equal(weatherAt(null, 99), 'clear');
  // rain stops cleanly: every rain or storm is followed by drizzle, then a calm spell
  const tl = weatherTimeline(7);
  for (let i = 0; i < tl.length - 2; i++) if (tl[i][1] === 'rain' || tl[i][1] === 'storm') { assert.equal(tl[i + 1][1], 'drizzle'); assert.ok(['clear', 'haze'].includes(tl[i + 2][1])); }
});

test('the session starts where the local clock falls on the loop, with a little chance', () => {
  const at = (h, r = 0.5) => cycleAt(startPhase(new Date(2026, 10, 12, h, 0), () => r));
  assert.equal(at(7).a, 'dawn'); assert.equal(at(16).a, 'evening');
  assert.ok(['night', 'twilight'].includes(at(23).a) && ['night', 'twilight'].includes(at(2).a), 'late hours are night');
  assert.ok(['dusk', 'evening', 'twilight'].includes(at(19).a));
  assert.notEqual(startPhase(new Date(2026, 10, 12, 12), () => 0), startPhase(new Date(2026, 10, 12, 12), () => 1), 'two sessions at noon differ');
  for (let h = 0; h < 24; h += 0.25) { const s = startPhase(new Date(2026, 10, 12, Math.floor(h), (h % 1) * 60), Math.random); assert.ok(s >= 0 && s < DAY_CYCLE_LENGTH); }
  // the weather clock counts from the session start, the hour clock from the loop start
  const tl = weatherTimeline(3), t0 = 300;
  assert.equal(cycleAt(t0, tl, t0).weather, tl[0][1]);
  assert.equal(cycleAt(t0 + tl[1][0] + 1, tl, t0).weather, tl[1][1]);
});

test('the jury path keeps a fixed readable look; QA can pin the hour, the weather, the clock and the seed', async () => {
  const { readFileSync } = await import('node:fs');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /const dayCycle = !judge && !params\.has\('tod'\) && !params\.has\('weather'\)/);
  assert.match(boot, /params\.has\('wseed'\)/); assert.match(boot, /startPhase\(\)/);
  assert.deepEqual([...HEAVY_WEATHER], ['rain', 'storm']);
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
