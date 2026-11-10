// The town on the ground (docs/town.md, docs/art/town-brief.md "Acceptance" 1): Iris starts in the town, walks the
// jury route to the Tournament altar with the player's own physics (collisions hold, no fall, no respawn),
// registers with E, and the season starts on the archipelago exactly as on the direct path. Also: the old QA link
// (?play=direct) still goes straight to the archipelago, the jury seed survives the town, and on a phone the prompt
// is a reachable button clear of the run toggle.
//
// FTF_TOWN_SHOTS=<prefix> (e.g. blockout, v1) also saves the screenshots to docs/art/town/qa/ingame/<prefix>-*.png.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { openGame, intersects, consoleProblems, shutdown, GAME_ROOT } from './lib/env.mjs';
import { SPAWN, KILL_Y } from '../../src/scenes/layout.js';
import { TOWN_SPAWN, TOWN_ALTAR, TOWN_KILL_Y, TOWN_FOG_BASE_Y, altarDistance } from '../../src/scenes/town-layout.js';

after(shutdown);

const SHOTS = process.env.FTF_TOWN_SHOTS ? path.resolve(GAME_ROOT, '../docs/art/town/qa/ingame') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
/** A screenshot into tests/e2e/.shots and, with FTF_TOWN_SHOTS, into the art QA folder. */
async function shot(g, name) {
  await g.shot('town-' + name);
  if (SHOTS) await g.page.screenshot({ path: path.join(SHOTS, process.env.FTF_TOWN_SHOTS + '-' + name + '.png'), timeout: 120000 }).catch(() => {});
}

const townReady = (g, timeout = 240000) => g.page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.phase === 'town', null, { timeout, polling: 250 });
const seasonReady = (g, timeout = 300000) => g.page.waitForFunction(() => window.__ftf.town.registered && window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs, null, { timeout, polling: 250 });
const townState = (g) => g.page.evaluate(() => {
  const f = window.__ftf, t = f.town;
  return { pos: f.player.pos.slice(), killY: f.player.killY, respawns: f.player.respawns, grounded: f.player.grounded, play: !!f.play, active: t.active, phase: t.phase, prompt: t.promptVisible, flat: t.scene.flat,
    inTownWorld: f.player.world === t.scene.world, onIsland: f.player.world === f.world, fogBaseY: f.lookdev.fogBaseY, cloudLevel: f.lookdev.cloudLevel, glow: t.scene.altar.glow, status: t.status(),
    objective: (document.querySelector('.ftf-town-objective') || {}).textContent || '', hud: document.querySelectorAll('.wh-root').length, walkMs: t.walkMs };
});
const near = (a, b, d) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= d;

async function assertOnArchipelago(g) {
  const s = await townState(g);
  assert.ok(near(s.pos, SPAWN, 3), 'Iris stands at the island spawn, got ' + s.pos.map((v) => v.toFixed(1)));
  assert.equal(s.killY, KILL_Y, 'the island kill height is back');
  assert.ok(s.onIsland && !s.active, 'the island collision world is back');
  assert.equal(s.fogBaseY, s.cloudLevel, 'the atmosphere is the archipelago\'s again');
  assert.ok(s.play, 'the season runs');
  return s;
}

test('town: spawn at the gate, walk the jury route, register with E, the season starts on the archipelago', { timeout: 900000 }, async () => {
  const g = await openGame('?play=direct&town=1', { ready: false });
  try {
    const perf = {};
    await townReady(g);
    await g.wait(1500);
    let s = await townState(g);
    assert.ok(near(s.pos, TOWN_SPAWN.position, 2.5), 'Iris starts at the town spawn, got ' + s.pos.map((v) => v.toFixed(1)));
    assert.ok(s.inTownWorld && s.active && !s.play, 'the town world, no season yet');
    assert.equal(s.killY, TOWN_KILL_Y);
    assert.equal(s.fogBaseY, TOWN_FOG_BASE_Y, 'the mist pools below the town');
    assert.equal(s.objective, 'Walk to the Tournament altar');
    assert.equal(s.hud, 0, 'no world HUD in the town');
    assert.equal(s.prompt, false, 'no prompt at the gate');
    assert.equal(await g.page.evaluate(() => window.__ftf.town.register()), false, 'registering is only offered at the altar');
    await shot(g, '01-spawn');

    assert.ok(await g.page.evaluate(() => window.__ftf.town.walkRoute()));
    await g.page.waitForFunction((half) => { const p = window.__ftf.player.pos, a = window.__ftf.town.scene.altar.stand; return Math.hypot(p[0] - a[0], p[2] - a[2]) < half; }, altarDistance(TOWN_SPAWN.position) / 2, { timeout: 480000, polling: 250 });
    await shot(g, '02-street');
    perf.town = await g.page.evaluate(() => window.__ftf.perf());
    await g.page.waitForFunction(() => window.__ftf.town.promptVisible && !window.__ftf.town.flow.routeActive, null, { timeout: 480000, polling: 250 });
    await g.wait(1500);
    s = await townState(g);
    assert.ok(altarDistance(s.pos) <= TOWN_ALTAR.radius, 'Iris reached the altar');
    assert.equal(s.respawns, 0, 'she never fell out of the town');
    assert.ok(s.pos[1] > TOWN_KILL_Y + 3 && s.grounded, 'she stands on the ground');
    assert.ok(s.glow > 1.0, 'the amber core is awake, glow ' + s.glow.toFixed(2));
    assert.deepEqual(await g.text('.ftf-town-prompt'), ['E Register for the Tournament']);
    await shot(g, '03-altar');

    await g.page.keyboard.press('KeyE'); // the real key: boot-world.js reads it and calls the flow
    await g.page.waitForFunction(() => window.__ftf.town.phase === 'transition', null, { timeout: 60000, polling: 100 });
    await g.page.waitForFunction(() => { const c = document.querySelector('.ftf-town-cover'); return c && getComputedStyle(c).opacity > 0.95; }, null, { timeout: 60000, polling: 100 });
    assert.deepEqual(await g.text('.ftf-town-cover'), ['The Tournament begins']);
    await shot(g, '04-transition');
    await seasonReady(g);
    await g.page.waitForFunction(() => !document.querySelector('.ftf-town-cover') && !document.querySelector('.ftf-town-prompt'), null, { timeout: 60000, polling: 250 });
    await g.wait(1500);
    await assertOnArchipelago(g);
    await shot(g, '05-archipelago');
    perf.island = await g.page.evaluate(() => window.__ftf.perf());
    console.log('# frame time (ms avg / p95, tier): town ' + [perf.town.avgMs.toFixed(0), perf.town.p95Ms.toFixed(0), perf.town.tier] + ' draw calls ' + perf.town.drawCalls + ' triangles ' + perf.town.triangles + '; archipelago ' + [perf.island.avgMs.toFixed(0), perf.island.p95Ms.toFixed(0), perf.island.tier] + ' draw calls ' + perf.island.drawCalls + ' triangles ' + perf.island.triangles);
    assert.equal(consoleProblems(g), '');
    assert.deepEqual(g.log.failed, [], 'no failed request');
  } finally { await g.close(); }
});

test('town: ?play=direct alone still goes straight to the archipelago', { timeout: 600000 }, async () => {
  const g = await openGame('?play=direct');
  try {
    const s = await g.page.evaluate(() => ({ town: window.__ftf.town, pos: window.__ftf.player.pos.slice(), killY: window.__ftf.player.killY, onIsland: window.__ftf.player.world === window.__ftf.world, ui: document.querySelectorAll('.ftf-town, .ftf-town-prompt, .ftf-town-cover').length }));
    assert.equal(s.town, null, 'no town on the old QA link');
    assert.ok(near(s.pos, SPAWN, 3) && s.onIsland);
    assert.equal(s.killY, KILL_Y);
    assert.equal(s.ui, 0);
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});

test('town: the jury seed survives the town (?demo=judge&play=direct&town=altar), registering through the QA hook', { timeout: 900000 }, async () => {
  const g = await openGame('?demo=judge&play=direct&town=altar', { ready: false });
  try {
    await townReady(g);
    await g.page.waitForFunction(() => window.__ftf.town.promptVisible, null, { timeout: 60000, polling: 250 });
    const s = await townState(g);
    assert.ok(altarDistance(s.pos) <= TOWN_ALTAR.radius && !s.play);
    assert.equal(await g.page.evaluate(() => window.__ftf.town.register()), true, 'register() runs the same sequence as E');
    await seasonReady(g);
    await assertOnArchipelago(g);
    const judge = await g.page.evaluate(() => { const o = window.__ftf.play.session.obs; return { tick: o.season.tick, mode: document.documentElement.dataset.hudMode || '' }; });
    assert.equal(judge.tick, 1, 'a fresh season');
    const direct = await openGame('?demo=judge&play=direct');
    try {
      const a = await g.page.evaluate(() => window.__ftf.play.session.obs.season.seedCommitment || window.__ftf.play.session.obs.season.seasonId);
      const b = await direct.page.evaluate(() => window.__ftf.play.session.obs.season.seedCommitment || window.__ftf.play.session.obs.season.seasonId);
      assert.equal(a, b, 'the same fixed season as the direct jury link');
    } finally { await direct.close(); }
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});

test('town on a phone: the prompt is a tappable button clear of the run toggle; reduced motion gets a plain cross-fade', { timeout: 900000 }, async () => {
  const g = await openGame('?town=altar&lang=ru', { ready: false, device: 'iPhone 13', reducedMotion: true });
  try {
    await townReady(g);
    await g.page.waitForFunction(() => window.__ftf.town.promptVisible, null, { timeout: 60000, polling: 250 });
    const [prompt] = await g.boxes('.ftf-town-prompt');
    const [run] = await g.boxes('.ftf-run-toggle');
    const [objective] = await g.boxes('.ftf-town-objective');
    const view = g.page.viewportSize();
    assert.ok(prompt && prompt.rect.left >= 0 && prompt.rect.right <= view.width && prompt.rect.bottom <= view.height, 'the prompt is on screen');
    assert.ok(prompt.rect.height >= 44, 'a thumb-sized target');
    assert.equal(prompt.text, 'Зарегистрироваться на Турнир', 'no key cap on touch, Russian text');
    assert.equal(objective.text, 'Дойдите до алтаря Турнира');
    if (run) assert.ok(!intersects(prompt.rect, run.rect, 0), 'the prompt does not overlap the run toggle');
    await shot(g, '06-phone-altar');
    assert.equal(await g.click('.ftf-town-prompt'), 'ok');
    await g.page.waitForFunction(() => document.querySelector('.ftf-town-cover.is-plain'), null, { timeout: 60000, polling: 100 });
    await seasonReady(g);
    await assertOnArchipelago(g);
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});
