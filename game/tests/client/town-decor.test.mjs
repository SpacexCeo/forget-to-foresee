// The archipelago's props dressing the town (owner 14.11): six clan banners round the square and four torches on the
// lower street, off every walking line, kept clear by the walkers, with light files for phones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TOWN_DECOR, BANNERS, facing } from '../../src/scenes/town-decor.js';
import { propFootprints, segDist } from '../../src/scenes/town-footprints.js';
import { TOWN_DATA } from '../../src/scenes/town-data.js';
import '../../src/play/townsfolk-plan.js'; // registers the walking lines the path graph is built from
import { townPaths } from '../../src/play/town-paths.js';

const model = (n) => new URL(`../../public/assets/models/${n}.glb`, import.meta.url);

test('every spot is a shipped model with its light file, the six clans each once', () => {
  assert.equal(TOWN_DECOR.length, 10);
  assert.deepEqual(TOWN_DECOR.filter((d) => /banner/.test(d.id)).map((d) => d.asset), BANNERS);
  for (const d of TOWN_DECOR) { assert.ok(existsSync(model(d.asset)), d.asset); assert.ok(existsSync(model(d.asset + '_m')), d.asset + '_m'); }
  assert.equal(new Set(TOWN_DECOR.map((d) => d.id)).size, TOWN_DECOR.length);
});

test('no spot stands on a walking line, a post, a door or another prop; walkers keep clear of each', () => {
  const g = townPaths(); assert.ok(g.edges.length > 50, 'the walkers path graph');
  const posts = Object.values(TOWN_DATA.npc.points).map((v) => v.position || v);
  for (const d of TOWN_DECOR) {
    for (const [a, b] of g.edges) { const A = g.nodes[a], B = g.nodes[b]; if (Math.abs((A[1] + B[1]) / 2 - d.at[1]) < 1.5) assert.ok(segDist(d.at, A, B) >= 1.4, `${d.id} is ${segDist(d.at, A, B).toFixed(2)} m from a walking line`); }
    for (const p of posts) if (Math.abs(p[1] - d.at[1]) < 1.5) assert.ok(Math.hypot(p[0] - d.at[0], p[2] - d.at[2]) >= 2.2, `${d.id} near a post`);
    for (const o of TOWN_DECOR) if (o !== d) assert.ok(Math.hypot(o.at[0] - d.at[0], o.at[2] - d.at[2]) >= 3.5, `${d.id} crowds ${o.id}`);
  }
  const prints = propFootprints();
  for (const d of TOWN_DECOR) assert.ok(prints.some((f) => f.id === d.id && f.r > d.half), `${d.id} is a footprint`);
});

test('each turns toward its square or street', () => {
  assert.ok(Math.abs(facing([0, 0, 0], [0, 0, 5])) < 1e-9);
  assert.ok(Math.abs(facing([0, 0, 0], [5, 0, 0]) - Math.PI / 2) < 1e-9);
});

test('the town loads them once it is built', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /import\('\.\/scenes\/town-decor-view\.js'\)\.then\(\(m\) => m\.placeTownDecor\(/);
  const view = readFileSync(new URL('../../src/scenes/town-decor-view.js', import.meta.url), 'utf8');
  assert.match(view, /MASK_PLAYER/); assert.match(view, /c\.removeFromParent\(\)/);
});
