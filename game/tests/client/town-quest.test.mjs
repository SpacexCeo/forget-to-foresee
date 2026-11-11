// The town quest (src/scenes/town-quest.js, hackathon spec P1-B): the state machine, the device flag, the skip,
// the judge-link rule, the talk trees' size, the five locales, and that nothing reaches the engine or a chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUEST_STEPS, QUEST_NPC, QUEST_KEY, TALKS, PURSE, TALK_RADIUS, createTownQuest, questPlan, questKeys, talkTarget } from '../../src/scenes/town-quest.js';
import { PROGRAMS } from '../../src/play/townsfolk-plan.js';
import { townToWorld, TOWN_SPAWN, TOWN_ALTAR, TOWN_ROUTE } from '../../src/scenes/town-layout.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';
import { memoryStorage } from '../../src/ui/storage.js';

/** Plays a talk to its end, always taking choice `pick(nodeId)` (default: the first). */
function playTalk(q, npc, pick = () => 0) {
  assert.equal(q.talkTo(npc), true, 'talk opens with ' + npc);
  for (let guard = 0; q.talk && guard < 10; guard++) q.choose(pick(q.talk.id));
  assert.equal(q.talk, null);
}

test('state machine: start -> read -> trade -> deliver -> done, the purse and the items follow, the flag persists', () => {
  const storage = memoryStorage();
  const q = createTownQuest({ storage });
  assert.deepEqual(QUEST_STEPS, ['start', 'read', 'trade', 'deliver', 'done']);
  assert.equal(q.step, 'start');
  q.begin();
  assert.equal(q.step, 'read'); assert.equal(q.npc, 'innkeeper'); assert.equal(q.objective, 'quest.obj.read');
  assert.equal(q.talkTo('baker'), false, 'only the townsperson the step waits for talks');
  // a wrong reading loops back to the sign, then the right one advances
  q.talkTo('innkeeper'); assert.ok(q.talk.node.sign);
  q.choose(1); assert.equal(q.talk.id, 'wrong');
  q.choose(0); assert.equal(q.talk.id, 'ask');
  q.choose(0); assert.equal(q.talk.id, 'right');
  q.choose(0);
  assert.equal(q.step, 'trade'); assert.deepEqual(q.items, ['note']); assert.equal(q.purse, 0);
  playTalk(q, 'baker');
  assert.equal(q.step, 'deliver'); assert.equal(q.purse, PURSE.gift - PURSE.price); assert.deepEqual(q.items, ['word']);
  assert.equal(storage.getItem(QUEST_KEY), null, 'not saved before the end');
  playTalk(q, 'shrinekeeper');
  assert.equal(q.step, 'done'); assert.equal(q.active, false); assert.equal(q.objective, 'town.objective', 'then the altar');
  assert.equal(storage.getItem(QUEST_KEY), 'done');
  assert.equal(questPlan({ stored: storage.getItem(QUEST_KEY) }), false, 'played once per device');
});

test('closing a talk keeps the step; skip ends the quest for this device; a disabled quest is done at once', () => {
  const storage = memoryStorage();
  const q = createTownQuest({ storage });
  q.begin(); q.talkTo('innkeeper'); q.close();
  assert.equal(q.step, 'read'); assert.equal(q.talk, null);
  q.skip();
  assert.equal(q.step, 'done'); assert.equal(storage.getItem(QUEST_KEY), 'skipped');
  assert.equal(questPlan({ stored: 'skipped' }), false);
  assert.equal(createTownQuest({ enabled: false }).active, false);
});

test('plan: never on the judge link (its 5-minute table), ?quest=1 forces, ?quest=0 skips, otherwise first time only', () => {
  assert.equal(questPlan({}), true);
  assert.equal(questPlan({ demo: 'judge' }), false);
  assert.equal(questPlan({ demo: 'judge', quest: '1' }), true);
  assert.equal(questPlan({ quest: '0' }), false);
  assert.equal(questPlan({ stored: 'done' }), false);
  assert.equal(questPlan({ stored: 'done', quest: '1' }), true);
});

test('talk trees stay small: three talks, at most eight lines each, every choice leads somewhere', () => {
  assert.deepEqual(Object.keys(TALKS).sort(), Object.values(QUEST_NPC).sort());
  for (const [npc, talk] of Object.entries(TALKS)) {
    assert.ok(Object.keys(talk).length <= 8, npc);
    assert.ok(talk.ask, npc + ' starts at ask');
    for (const n of Object.values(talk)) for (const c of n.choices) assert.ok(c.act || c.to, npc + ' ' + c.key);
    for (const n of Object.values(talk)) for (const c of n.choices) if (c.to) assert.ok(talk[c.to], npc + ' -> ' + c.to);
  }
});

test('the three townspeople stand at fixed posts on the way up, the first a short detour from the spawn', () => {
  const at = (k) => townToWorld(PROGRAMS[k].home);
  for (const k of Object.values(QUEST_NPC)) {
    const steps = PROGRAMS[k].steps;
    assert.ok(steps.every((s) => !s.walk && !s.meet), k + ' never walks away');
  }
  // spawn -> innkeeper -> baker -> shrinekeeper -> altar: under 120 m of walking (well under 5 minutes at 1.7 m/s)
  const pts = [TOWN_SPAWN.position, at('innkeeper'), at('baker'), at('shrinekeeper'), TOWN_ALTAR.stand];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
  assert.ok(len < 120, 'quest walk ' + len.toFixed(1) + ' m');
  assert.ok(TOWN_ROUTE.length > 2);
});

test('talkTarget: only the waited townsperson, within the talk radius, on the same level', () => {
  const q = createTownQuest(); q.begin();
  const at = (k) => townToWorld(PROGRAMS[k].home);
  const inn = at('innkeeper');
  assert.equal(talkTarget(q, [inn[0] + TALK_RADIUS - 0.2, inn[1], inn[2]], at), 'innkeeper');
  assert.equal(talkTarget(q, [inn[0] + TALK_RADIUS + 0.5, inn[1], inn[2]], at), null);
  assert.equal(talkTarget(q, [inn[0], inn[1] + 4, inn[2]], at), null, 'a different level of the town');
  const baker = at('baker');
  assert.equal(talkTarget(q, baker, at), null, 'the baker waits for the note');
  q.skip();
  assert.equal(talkTarget(q, inn, at), null);
});

test('every quest string exists in all five locales and the purse says it is not on-chain', () => {
  const keys = questKeys();
  assert.ok(keys.length >= 25);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  assert.match(PLAY_MESSAGES.en['quest.purse'], /not on-chain/);
  assert.match(PLAY_MESSAGES.en['quest.baker.purse'], /nothing on a chain/);
  for (const k of keys) assert.ok(PLAY_MESSAGES.en[k].length <= 140, 'short line: ' + k);
});

test('no engine command and no chain: the quest module imports nothing from the room, the engine or net', () => {
  const src = readFileSync(new URL('../../src/scenes/town-quest.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import /m, 'a pure module');
  const code = src.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\b(room|engine|near|transport|session)\.|command\(|fetch\(/);
});
