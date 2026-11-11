// Town-first start (owner, 11.11): the town is the menu. Shop doors (Exchange, Scribe, Inn), the notice board and the
// mirror are spots with prompts; the shrinekeeper guides as a talk; every string in five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOWN_SHOPS, TOWN_SPOTS, shopDoorAt, townToWorld, TOWN_SPAWN } from '../../src/scenes/town-layout.js';
import { GUIDE_PAGES } from '../../src/scenes/town-flow.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('the three shops have doors Iris can stand at; the mirror is a few steps from the spawn', () => {
  for (const id of ['exchange', 'scribe', 'inn']) {
    const s = TOWN_SHOPS.find((x) => x.id === id);
    assert.ok(s, id);
    assert.equal(shopDoorAt(s.door.position).id, id);
  }
  const m = townToWorld(TOWN_SPOTS.mirror), sp = TOWN_SPAWN.position;
  assert.ok(Math.hypot(m[0] - sp[0], m[2] - sp[2]) < 6, 'the mirror is by the gate');
});

test('spot, glossary, notice-board and guide strings exist in all five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => /^(spot|gloss|board|guide|mirror)\./.test(k));
  for (let i = 1; i <= GUIDE_PAGES; i++) assert.ok(keys.includes('guide.' + i));
  for (const id of ['exchange', 'scribe', 'inn', 'board', 'mirror']) assert.ok(keys.includes('spot.' + id), id);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
});

test('wiring: quest talk first, then a spot, then a townsperson, then the altar; the shrinekeeper guides; the lobby is in the pause menu', () => {
  const flow = readFileSync(new URL('../../src/scenes/town-flow.js', import.meta.url), 'utf8');
  assert.match(flow, /const sp = !qNpc && ready \? spots\.find/);
  assert.match(flow, /const fNpc = !qNpc && !sp && ledger && ready/);
  assert.match(flow, /talkNpc === 'shrinekeeper' \? 'guide'/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /onMainMenu: openMainMenu/);
  assert.match(readFileSync(new URL('../../src/ui/scene-controls.js', import.meta.url), 'utf8'), /Main menu/);
});

test('hired agents walk to the Shard Exchange, trade at its door, then walk home and resume their own loop', async () => {
  const { PersonPlan, TOWNSFOLK, PROGRAMS, tradePath, tradeProgram, homeProgram } = await import('../../src/play/townsfolk-plan.js');
  const { shopById } = await import('../../src/scenes/town-layout.js');
  const def = TOWNSFOLK.find((p) => p.key === 'baker');
  const plan = new PersonPlan(def);
  const door = shopById('exchange').door.position, local = [door[0], door[1] - 1200, door[2]];
  const { path } = tradePath([plan.x, plan.y, plan.z]);
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end[0] - local[0], end[2] - local[2]) < 3, 'ends at the Exchange door');
  const original = plan.program;
  plan.program = tradeProgram(plan); plan.index = -1; plan.next();
  for (let i = 0; i < 30 * 60; i++) plan.step(1 / 30, { iris: null, reduced: false });
  assert.ok(Math.hypot(plan.x - end[0], plan.z - end[2]) < 0.5, 'arrived and trading at the door');
  plan.program = homeProgram(plan, original); plan.index = -1; plan.next();
  for (let i = 0; i < 30 * 90 && plan.program !== original; i++) plan.step(1 / 30, { iris: null, reduced: false });
  assert.equal(plan.program, original, 'back home: its own loop again');
  assert.ok(Math.hypot(plan.x - PROGRAMS.baker.home[0], plan.z - PROGRAMS.baker.home[2]) < 1.5);
});
