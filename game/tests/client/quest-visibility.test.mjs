// Quests visible without hunting (owner 12.11): the elder's guide never blocks the guard's quest (a kill or three
// minutes open it), gold markers over givers with a quest (! on offer, ? to turn in), a quest log (J or the HUD
// button) with progress, needs and silk rewards, and an objective line that names the next step and the distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyQuest, initialQuests, questStatus, WELCOME_GRACE_MS } from '../../src/game/quest-rules.js';
import { initialState } from '../../src/game/expedition.js';
import { markerFor, questLog, objective, createTownQuests } from '../../src/scenes/town-quests.js';
import { createQuestMarkers } from '../../src/scenes/quest-markers.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { createInventory } from '../../src/game/inventory.js';
import { memStorage, fakeDoc, fakeI18n } from './story-fakes.mjs';

const act = (s, a, now) => { const r = applyQuest(s, a, { now }); return r.rejected ? s : r.state; };

test('rules: the guard\'s quest opens without the elder after a kill or the grace period; BEGIN is recorded once', () => {
  let s = act(initialQuests(), { type: 'BEGIN' }, 1000);
  assert.equal(s.since, 1000); assert.equal(applyQuest(s, { type: 'BEGIN' }, 5000).rejected, 'begun');
  assert.equal(questStatus(s, 'q_spiders', 1000 + 60_000), 'locked');
  assert.equal(questStatus(s, 'q_spiders', 1000 + WELCOME_GRACE_MS), 'available', 'three minutes in');
  const k = act(s, { type: 'KILL', mob: 'skitter', killId: 'k1' }, 2000);
  assert.equal(questStatus(k, 'q_spiders', 2000), 'available', 'or the first kill');
  assert.equal(questStatus(k, 'q_part', 2000), 'available');
  assert.equal(questStatus(k, 'q_boss', 2000), 'locked', 'the crown still needs the spiders');
  assert.equal(questStatus(k, 'q_welcome', 2000), 'available', 'the elder stays optional');
});

test('markers: ! over a giver with an offer, ? when a quest can be turned in (needs met), nothing otherwise', () => {
  const story = { ...initialState(), phase: 'arrival', guide: { talked: false, moved: false } };
  let s = act(initialQuests(), { type: 'BEGIN' }, 0);
  assert.equal(markerFor('elder', story, s, 0), '!'); assert.equal(markerFor('guard', story, s, 0), null);
  s = act(s, { type: 'KILL', mob: 'skitter', killId: 'a' }, 1);
  assert.equal(markerFor('guard', story, s, 1), '!');
  s = act(s, { type: 'ACCEPT', questId: 'q_spiders' }, 2);
  for (let i = 0; i < 10; i++) s = act(s, { type: 'KILL', mob: 'skitter', killId: 'b' + i }, 3 + i);
  assert.equal(markerFor('guard', story, s, 20, {}), null, 'ready, but the threads are missing');
  assert.equal(markerFor('guard', story, s, 20, { spider_silk_thread: 5 }), '?');
});

test('quest log: ready first, then active, then offers; progress, needs with what she holds, silk rewards', () => {
  const story = { ...initialState(), phase: 'gathering', guide: { talked: true, moved: true } };
  let s = act(initialQuests(), { type: 'KILL', mob: 'skitter', killId: 'a' }, 1);
  s = act(s, { type: 'ACCEPT', questId: 'q_spiders' }, 2);
  for (let i = 0; i < 3; i++) s = act(s, { type: 'KILL', mob: 'skitter', killId: 'b' + i }, 3 + i);
  const rows = questLog(story, s, 10, { spider_silk_thread: 3, chitin_plate: 0 });
  const sp = rows.find((r) => r.id === 'q_spiders');
  assert.deepEqual([sp.status, sp.progress, sp.count, sp.rewardSilk], ['active', 3, 10, 20]);
  assert.deepEqual(sp.needs, [{ id: 'spider_silk_thread', need: 5, have: 3 }]);
  const part = rows.find((r) => r.id === 'q_part');
  assert.deepEqual([part.status, part.needs], ['available', [{ id: 'chitin_plate', need: 2, have: 0 }]]);
  assert.ok(rows.findIndex((r) => r.status === 'active') < rows.findIndex((r) => r.status === 'available'));
});

test('objective: the next concrete step names the giver (elder first, then an offer)', () => {
  const story = { ...initialState(), phase: 'arrival', guide: { talked: false, moved: false } };
  let s = act(initialQuests(), { type: 'BEGIN' }, 0);
  assert.deepEqual(objective(story, s, 0), { key: 'story.step.talk', args: {}, giver: 'elder' });
  s = act(s, { type: 'KILL', mob: 'skitter', killId: 'a' }, 1);
  const talked = { ...story, guide: { talked: true, moved: true } };
  assert.deepEqual(objective(talked, s, 1), { key: 'quest.track.offer', args: { giver: 'guard' }, giver: 'guard' });
});

const FOLK = { elder: [0, 0, 0], guard: [10, 0, 0], lamplighter: [20, 0, 0], shardkeeper: [30, 0, 0] };
test('view: J and the HUD button open the quest log; the objective line shows the distance; markers follow the givers', () => {
  const storage = memStorage(), doc = fakeDoc(), win = new EventTarget(); let t = 1_000_000;
  const tray = doc.createElement('div'); tray.className = 'ph-wallet'; tray.prepend = function (c) { c.parent = this; this.children.unshift(c); }; doc.body.append(tray);
  doc.querySelector = (sel) => (sel === '.ph-wallet' ? tray : null);
  const townLedger = createTownLedger({ storage, now: () => t });
  const tq = createTownQuests({ storage, townLedger, i18n: fakeI18n(), folkAt: (k) => FOLK[k] || null, inventory: createInventory({ storage }), doc, win, now: () => (t += 1000) });
  tq.update([3, 0, 4]);
  const line = doc.find('ftf-story-goal')[0];
  assert.match(line.textContent, /^story\.step\.talk .* · quest\.track\.near \{"m":5\} · /);
  const btn = tray.children[0]; assert.equal(btn.className, 'ftf-quest-log-btn');
  btn.click(); assert.equal(tq.logOpen, true); assert.equal(doc.find('ftf-quest-log').length, 1);
  win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyJ', key: 'j' })); assert.equal(tq.logOpen, false);
  win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyJ', key: 'j' })); assert.equal(tq.logOpen, true);
  assert.match(doc.find('ftf-quest-log')[0].children.map((c) => c.textContent).join(' ') + JSON.stringify(doc.find('ftf-quest-row').map((r) => r.dataset.quest)), /q_welcome/);
  assert.match(doc.find('ftf-quest-log')[0].style.cssText, /width:min\(340px,calc\(100vw - 32px\)\)/);
  assert.deepEqual(tq.markers(), [{ giver: 'elder', sym: '!' }]);
  const scene = new THREE.Scene();
  const qm = createQuestMarkers({ scene, markers: () => tq.markers(), folkAt: (k) => FOLK[k] || null, texture: () => new THREE.Texture(), reducedMotion: true });
  qm.update(0);
  const elder = scene.getObjectByName('quest_mark_elder');
  assert.ok(elder && elder.visible); assert.ok(elder.position.y > 2);
  win.dispatchEvent(Object.assign(new Event('ftf:mob-killed'), { detail: { type: 'skitter', killId: 'z#1' } }));
  qm.update(1);
  assert.equal(scene.getObjectByName('quest_mark_guard').visible, true, 'a kill opens the guard\'s quest: a ! appears over him');
  tq.setActive(false); assert.equal(btn.hidden, true); assert.equal(tq.logOpen, false);
  qm.dispose(); tq.dispose();
});
