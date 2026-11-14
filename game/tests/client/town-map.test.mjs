// The town map on M (owner 14.11: the painted GPT map, calibrated to the real town), the radar's badges, the season
// card's background.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { fitLine, toMap, headingDeg, onTownMap, MAP_PLACES, MAP_DECOR, MAP_LEGEND, MAP_KEYS, zoomStep, MAP_CALIBRATION } from '../../src/play/town-map.js';

test('the calibration puts the landmarks where the painting has them', () => {
  const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
  const at = (id) => toMap(MAP_PLACES.find((p) => p.id === id).at);
  const [gu, gv] = at('gate'), [au, av] = at('altar'), [pu, pv] = at('portal');
  assert.ok(near(gu, 0.39) && near(gv, 0.80), 'the lower gate at the foot of the painting');
  assert.ok(near(au, 0.40) && near(av, 0.19), 'the altar on the plaza at the top');
  assert.ok(pv < gv && pv > 0.6, 'the Gate-Loom just inside the lower gate');
  assert.ok(at('exchange')[0] > au && at('scribe')[0] < au, 'the Exchange east, the Scribe west of the plaza');
  for (const [m, v] of [...MAP_CALIBRATION.x, ...MAP_CALIBRATION.z]) assert.ok(v >= 0 && v <= 1, String(m));
  const f = fitLine([[0, 1], [2, 5]]); assert.ok(Math.abs(f.a - 2) < 1e-12 && Math.abs(f.b - 1) < 1e-12);
});

test('marks stay on the picture; her arrow points the way she faces; the hillside is off the town', () => {
  const [u, v] = toMap([0, 0, 90], { clamp: true });
  assert.ok(u > 0 && u < 1 && v <= 0.96 + 1e-9);
  assert.equal(Math.round(headingDeg(Math.PI)), 0, 'facing -z (north, up the street) points up');
  assert.equal(Math.round(headingDeg(0)), 180);
  assert.equal(Math.round(headingDeg(Math.PI / 2)), 90, '+x is right');
  assert.equal(onTownMap([0, 0, 52]), false); assert.equal(onTownMap([0, 4.5, -11]), true);
  assert.equal(zoomStep(1, -1), 1); assert.equal(zoomStep(3, 1), 3); assert.ok(zoomStep(1, 1) > 1);
});

test('every map string in five locales; every badge and picture ships and is light', async () => {
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = await import(`../../src/play/locales/${l}.js`), d = m.default || Object.values(m)[0];
    for (const k of MAP_KEYS) assert.ok(typeof d[k] === 'string' && d[k].length, `${l}: ${k}`);
  }
  const file = (p) => new URL('../../public/assets/ui/' + p, import.meta.url);
  const badges = new Set([...MAP_PLACES.map((p) => p.badge), ...MAP_LEGEND.map(([, b]) => b), 'quest_offer', 'quest_turnin'].filter(Boolean));
  for (const b of badges) assert.ok(statSync(file('map/mark_' + b + '.webp')).size < 20000, b);
  assert.ok(statSync(file('map/town_map_1024.webp')).size < 600000, 'the phone map');
  assert.ok(statSync(file('map/town_map_2048.webp')).size < 1200000, 'the desktop map');
  for (const w of [800, 1600]) assert.ok(statSync(file(`season/season_return_bg_${w}.webp`)).size < 400000, 'season bg ' + w);
  assert.ok(MAP_DECOR.length >= 2);
});

test('wired: M and the tray Map open it in town, the radar draws the badges, the card has its background', async () => {
  const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  const { ROUTES } = await import('../../src/sprint/window-router.js');
  assert.deepEqual(ROUTES.map, { event: 'ftf:town-map' });
  const boot = read('boot-world.js');
  assert.match(boot, /window\.addEventListener\('ftf:town-map', toggleTownMap\)/);
  assert.match(boot, /registerWindow\('map'/);
  const { RADAR_BADGES } = await import('../../src/rpg/minimap.js');
  assert.equal(RADAR_BADGES['quest-available'], 'quest_offer'); assert.equal(RADAR_BADGES['quest-ready'], 'quest_turnin');
  assert.match(read('rpg/index.js'), /createMinimap\(\{ canvas: hud\.canvas, base: ctx\.base \|\| '\/'/);
  assert.match(read('play/town-map-ui.js'), /el\('dialog', 'tm-wrap'\)/, 'an open dialog: the world keys and the mouse aim wait');
  assert.match(read('play/season-loot-ui.js'), /season_return_bg_\$\{/);
});
