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
