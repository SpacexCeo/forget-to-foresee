// The first-time experience (docs/tutorial.md): the onboarding step flow (skip, resume, returning
// player), the tutorial beat machine, the in-world first loop in both play modes over the judge
// season, the copy budget of every beat and goal, and the five-language coverage of their strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage, memoryStorage, STORAGE_KEYS } from '../src/ui/storage.js';
import { createOnboardingFlow, createTutorial, FLOW_STEPS, TUTORIAL_BEATS, TUTORIAL_SIGN } from '../src/ui/flow.js';
import { MESSAGES, argNames, format } from '../src/ui/i18n/index.js';
import { LOOK_PRESETS, DEFAULT_RECIPE, normalizeRecipe, recipeHash } from '../src/ui/hologram/recipe.js';
import { createLocalTransport } from '../src/play/transport-local.js';
import { PlaySession } from '../src/play/session.js';
import { ShellHub, signsByShell, prefillFirstDelay, impliedTick, FIRST_EVENT_TICK } from '../src/play/hub.js';
import { contextOptions, defaultOption } from '../src/play/interactions.js';
import { currentGoal, hubGoal, inputKind, ONBOARDING, ONBOARDING_HUB, FIRST_GIFT_TICK, FIRST_LOOP_KEY } from '../src/play/objectives.js';
import { PLAY_MESSAGES, createPlayI18n, renderMsg } from '../src/play/i18n.js';
import { planRoute, placePosition, SPAWN } from '../src/net/world-map.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f'; // ?demo=judge
const LOCALES = ['en', 'uk', 'ru', 'it', 'zh'];
const INPUTS = ['touch', 'gamepad', 'keyboard'];
/** Word count of the longest device branch of a message (device-aware strings carry an {input, select}). */
const words = (s, loc = 'en') => Math.max(...INPUTS.map((input) => format(String(s), { input, tick: 3, n: 1, prize: 40, shell: 'II', ticks: 17, need: 8, have: 1 }, loc).trim().split(/\s+/).filter(Boolean).length));

// ---------------------------------------------------------------- step flow

test('flow: skip is allowed only for the tutorial, is remembered, and keeps the order', () => {
  const flow = createOnboardingFlow(createSafeStorage(memoryStorage()));
  assert.equal(flow.skip('tutorial'), false, 'not the current step yet');
  flow.enter(); flow.complete('entitlement');
  assert.equal(flow.step, 'tutorial');
  assert.equal(flow.skip('customization'), false, 'only the tutorial can be skipped');
  assert.equal(flow.skip('tutorial'), true);
  assert.equal(flow.step, 'customization');
  assert.deepEqual(flow.done, { entitlement: true, tutorial: true, customization: false });
  assert.equal(flow.skipped.tutorial, true);
});

test('flow: the tutorial beat is saved and restored; completing the tutorial clears it; reset clears everything', () => {
  const backend = memoryStorage();
  const a = createOnboardingFlow(createSafeStorage(backend));
  a.enter(); a.complete('entitlement');
  a.setBeat(3);
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.flow)).beat, 3);
  const b = createOnboardingFlow(createSafeStorage(backend));
  assert.equal(b.beat, 3, 'a reload resumes at the saved beat');
  b.setBeat(99); assert.equal(b.beat, TUTORIAL_BEATS.length - 1, 'clamped');
  b.setBeat(-5); assert.equal(b.beat, 0);
  b.enter(); b.complete('tutorial');
  assert.equal(b.beat, 0);
  b.reset();
  assert.deepEqual(b.done, { entitlement: false, tutorial: false, customization: false });
  assert.equal(b.skipped.tutorial, false);
  assert.equal(JSON.parse(backend.getItem(STORAGE_KEYS.flow)).beat, 0);
});

test('flow: a returning player (everything done before this session) enters straight at first contact', () => {
  const backend = memoryStorage();
  const a = createOnboardingFlow(createSafeStorage(backend));
  assert.equal(a.returning, false);
  a.enter(); a.complete('entitlement'); a.complete('tutorial'); a.complete('customization');
  assert.equal(a.returning, false, 'decided once, at creation: finishing now does not make this session "returning"');
  const b = createOnboardingFlow(createSafeStorage(backend));
  assert.equal(b.returning, true);
  assert.equal(b.enter(), true);
  assert.equal(b.step, 'firstContact');
  // tampered storage: a "done" tutorial without the entitlement is not a returning player
  backend.setItem(STORAGE_KEYS.flow, JSON.stringify({ done: { entitlement: false, tutorial: true, customization: true } }));
  const c = createOnboardingFlow(createSafeStorage(backend));
  assert.equal(c.returning, false);
  c.enter(); assert.equal(c.step, 'entitlement');
  assert.deepEqual(FLOW_STEPS, ['lobby', 'entitlement', 'tutorial', 'customization', 'firstContact'], 'spec §1 order is unchanged');
});

// ---------------------------------------------------------------- tutorial beats

test('tutorial: five beats in order, each one action, Next only when the beat is done', () => {
  assert.deepEqual(TUTORIAL_BEATS, ['slots', 'dots', 'read', 'stake', 'price']);
  const t = createTutorial();
  assert.equal(t.id, 'slots');
  assert.equal(t.next(), false, 'nothing tapped yet');
  for (const slot of [2, 0, 1]) t.tap(slot);
  assert.equal(t.done(), false);
  t.tap(1); // tapping the same stroke twice does not count twice
  assert.equal(t.done(), false);
  t.tap(3);
  assert.equal(t.done(), true);
  assert.deepEqual([...t.tapped()].sort(), [0, 1, 2, 3]);
  assert.equal(t.next(), true);

  assert.equal(t.id, 'dots');
  assert.equal(t.view().dots, 0, 'the beat starts with no dot so the first tap shows the numbers turn');
  assert.equal(t.tapCore(), 1); assert.equal(t.done(), true);
  assert.equal(t.tapCore(), 2); assert.equal(t.done(), false, 'two dots is not this sign');
  t.tapCore(); assert.equal(t.tapCore(), 0); assert.equal(t.tapCore(), 1);
  assert.equal(t.next(), true);

  assert.equal(t.id, 'read');
  const order = TUTORIAL_SIGN.read.map(([slot]) => slot);
  assert.equal(t.expected(), order[0]);
  const wrong = t.tap(order[1]);
  assert.deepEqual([wrong.ok, wrong.expected, wrong.step], [false, order[0], 1], 'a wrong tap is reported, not punished');
  assert.equal(t.view().readIndex, 0);
  for (const [k, slot] of order.entries()) { const r = t.tap(slot); assert.equal(r.ok, true); assert.equal(r.step, k + 1); assert.equal(r.meaning, TUTORIAL_SIGN.read[k][2]); }
  assert.equal(t.expected(), null);
  assert.equal(t.tap(order[0]).finished, true);
  assert.equal(t.next(), true);

  assert.equal(t.id, 'stake');
  assert.equal(t.view().silk, TUTORIAL_SIGN.silk.start);
  assert.equal(t.tickTrial(), 0, 'trials do not pass before the stake');
  assert.equal(t.stake(), true); assert.equal(t.stake(), false, 'one stake only');
  assert.equal(t.view().silk, TUTORIAL_SIGN.silk.staked);
  assert.equal(t.tickTrial(), 1); assert.equal(t.done(), false);
  assert.equal(t.tickTrial(), 2); assert.equal(t.tickTrial(), 3);
  assert.equal(t.view().sealed, true);
  assert.equal(t.view().silk, TUTORIAL_SIGN.silk.paid, 'the stake comes back with the Gift share');
  assert.equal(t.tickTrial(), 3, 'sealed stays sealed');
  assert.equal(t.next(), true);

  assert.equal(t.id, 'price');
  assert.equal(t.forget(), true); assert.equal(t.forget(), false);
  assert.equal(t.done(), true);
  assert.equal(t.next(), false, 'the last beat ends with the mode question, not Next');
  assert.equal(t.back(), true); assert.equal(t.id, 'stake');
  assert.equal(t.view().sealed, true, 'going back keeps what was done');
});

test('tutorial: a slot name is the same hit target as its stroke, in beat 1 and beat 3 (P0-D)', () => {
  // beat 1: names and strokes fill the same set
  const byStroke = createTutorial(), byLabel = createTutorial();
  for (const slot of [0, 1, 2, 3]) assert.deepEqual(byLabel.tapLabel(slot), byStroke.tap(slot));
  assert.deepEqual(byLabel.view(), byStroke.view());
  assert.equal(byLabel.done(), true);
  const mixed = createTutorial();
  mixed.tap(0); mixed.tapLabel(1); mixed.tapLabel(1); mixed.tap(2);
  assert.equal(mixed.done(), false);
  mixed.tapLabel(3);
  assert.equal(mixed.done(), true);
  // beat 3: a wrong-order name gets the same "Stroke N comes first" report as a wrong stroke
  const a = createTutorial({ beat: 2 }), b = createTutorial({ beat: 2 });
  const order = TUTORIAL_SIGN.read.map(([slot]) => slot);
  assert.deepEqual(b.tapLabel(order[2]), a.tap(order[2]));
  assert.deepEqual([b.view().lastRead.ok, b.view().lastRead.step], [false, 1]);
  assert.equal(format(MESSAGES.en['tut.read.wrong'], { n: b.view().lastRead.step }, 'en'), 'Not yet. Stroke 1 comes first.');
  for (const slot of order) assert.deepEqual(b.tapLabel(slot), a.tap(slot));
  assert.equal(b.done(), true);
  assert.equal(b.tapLabel(9).ok, false, 'not a slot');
});

test('tutorial: one slot hint is always on screen in the slot beats, and exists in five languages (P0-D)', () => {
  const t = createTutorial();
  assert.equal(t.view().hintSlot, 0, 'before any pick the first slot is explained');
  t.tapLabel(2); assert.equal(t.view().hintSlot, 2, 'the slot just picked');
  t.tap(3); assert.equal(t.hintSlot(), 3);
  for (const slot of [0, 1]) t.tap(slot);
  t.next(); assert.equal(t.view().hintSlot, null, 'the dots beat has no slot hint');
  t.tapCore(); t.next();
  const order = TUTORIAL_SIGN.read.map(([slot]) => slot);
  for (const slot of order) { assert.equal(t.view().hintSlot, slot, 'the stroke to read next'); t.tapLabel(slot); }
  assert.equal(t.view().hintSlot, order[3], 'the last one stays once the sign is read');
  for (const loc of LOCALES) for (const slot of [0, 1, 2, 3]) {
    const hint = MESSAGES[loc][`slot.${slot}.hint`];
    assert.ok(hint && hint.length > 4, `${loc}: slot.${slot}.hint`);
    assert.ok(hint.startsWith(MESSAGES[loc]['slot.' + slot]), `${loc}: the hint names its slot`);
    if (loc === 'en') assert.ok(words(hint) <= 12, `slot.${slot}.hint is one short line`);
  }
});

test('first contact copy matches the town start: no balcony, the altar named, one story (P0-B)', async () => {
  const BALCONY = /balcon|балкон|露台|观景台|阳台/i;
  for (const loc of LOCALES) for (const k of ['onb.fc.body', 'fc.enter', 'fc.body']) {
    assert.ok(!BALCONY.test(MESSAGES[loc][k]), `${loc}:${k} does not mention the balcony`);
    assert.ok(!/island|остров|острів|isola|岛/i.test(MESSAGES[loc][k]), `${loc}:${k} does not send the player to the island`);
  }
  assert.match(MESSAGES.en['onb.fc.body'], /town/i);
  assert.match(MESSAGES.en['onb.fc.body'], /Tournament altar/);
  assert.match(MESSAGES.en['fc.enter'], /town/i);
  assert.match(PLAY_MESSAGES.en['town.objective'], /Tournament altar/, 'the first in-world objective still names the altar');
  assert.equal(PLAY_MESSAGES.en['map.balcony'], 'Balcony', 'the island map keeps its balcony');
});

test('terms are taught where they appear: the tutorial names silk, Shell and trial in plain words once (P0-C)', () => {
  const en = MESSAGES.en;
  assert.match(en['tut.stake.body'], /coins/i, 'silk is introduced as coins');
  assert.match(en['tut.stake.staked'], /turn/i, 'a trial is introduced as a turn');
  assert.ok(!/Shell II\b/.test(en['tut.read.sentence'] + en['tut.stake.button'] + en['tut.stake.sealed']), 'no Roman-numeral Shell before the world is seen');
  assert.ok(!/weight \d/.test(en['tut.price.memoryNote']), 'no bare "weight 4"');
  assert.match(en['tut.stake.sealed'], /Verified ✓/, 'the stake beat still demonstrates Verified');
});

test('hologram picker: exactly one Begin on the compact look page; Customize keeps the full constructor (P0-E)', async () => {
  const { readFile } = await import('node:fs/promises');
  const onboarding = await readFile(new URL('../src/ui/onboarding.js', import.meta.url), 'utf8');
  const ctor = await readFile(new URL('../src/ui/hologram/constructor.js', import.meta.url), 'utf8');
  assert.equal(onboarding.split("'onb.look.begin'").length - 1, 1, 'one button is bound to onb.look.begin');
  assert.ok(!ctor.includes('onb.look.begin'), 'the constructor adds no second Begin');
  assert.ok(ctor.includes("'onb.look.customize'") && ctor.includes('ftf-ctor-controls'), 'Customize still unfolds the full constructor');
});

test('hologram preview: paints at once after setRecipe, with reduced motion and before layout (P0-E)', async () => {
  const calls = { stroke: 0, fill: 0, fillRect: 0 };
  const ctx2d = new Proxy({}, { get: (_, k) => (k in calls ? () => { calls[k]++; } : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  const canvasOf = (width) => ({ width: 0, height: 0, clientWidth: width, getContext: () => ctx2d, getBoundingClientRect: () => ({ width }) });
  const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  let queued = 0;
  globalThis.requestAnimationFrame = () => ++queued; globalThis.cancelAnimationFrame = () => {};
  try {
    const { createHologramPreview } = await import('../src/ui/hologram/preview.js');
    for (const reducedMotion of [false, true]) for (const width of [300, 0]) {
      const canvas = canvasOf(width);
      const p = createHologramPreview(canvas, { recipe: LOOK_PRESETS.mist, reducedMotion });
      assert.ok(p.frames >= 1, 'the first frame is painted synchronously, no animation frame needed');
      assert.ok(canvas.width >= 64 && canvas.width === canvas.height, 'the backing store is sized, never zero');
      if (width === 0) assert.ok(canvas.width >= 300, 'a zero box falls back to the nominal picker size');
      const before = { frames: p.frames, stroke: calls.stroke };
      p.setRecipe(LOOK_PRESETS.ember);
      assert.ok(p.frames > before.frames, 'choosing a look repaints at once');
      assert.ok(calls.stroke > before.stroke, 'the figure is actually stroked (not a blank box)');
      p.destroy();
    }
    assert.ok(queued > 0, 'the animated preview still schedules its loop');
  } finally { globalThis.requestAnimationFrame = saved.raf; globalThis.cancelAnimationFrame = saved.caf; }
});

test('tutorial: resuming at a later beat shows the example sign with its dot', () => {
  const t = createTutorial({ beat: 2 });
  assert.equal(t.id, 'read');
  assert.equal(t.view().dots, TUTORIAL_SIGN.dots);
  assert.equal(createTutorial({ beat: 1 }).view().dots, 0);
  assert.equal(createTutorial({ beat: 42 }).id, 'price', 'clamped to the last beat');
});

test('tutorial: the example is the spec sign Shell II · Gift · 20 · +2 and lands on trial 3', () => {
  const [place, action, power, delay] = TUTORIAL_SIGN.read.map(([, , m]) => m);
  assert.deepEqual([place, action, power, delay], [1, 0, 1, 1]);
  assert.equal(TUTORIAL_SIGN.trial, 1 + delay + 1, 'published on trial 1, Delay +2 → trial 3');
  assert.equal(TUTORIAL_SIGN.trial, FIRST_GIFT_TICK);
  assert.equal(TUTORIAL_SIGN.silk.paid - TUTORIAL_SIGN.silk.staked, 10 + 20, 'stake back plus the Gift of 20');
});

test('hologram looks: four complete recipes, Mist is the default, hashes are canonical', () => {
  assert.deepEqual(Object.keys(LOOK_PRESETS), ['mist', 'ember', 'deep', 'iris']);
  assert.equal(recipeHash(LOOK_PRESETS.mist), recipeHash(DEFAULT_RECIPE));
  const hashes = new Set(Object.values(LOOK_PRESETS).map(recipeHash));
  assert.equal(hashes.size, 4, 'every look is visibly different');
  for (const look of Object.values(LOOK_PRESETS)) assert.deepEqual(normalizeRecipe(look), normalizeRecipe(normalizeRecipe(look)), 'already canonical');
});

// ---------------------------------------------------------------- copy budget and languages

const TUT_KEYS = Object.keys(MESSAGES.en).filter((k) => k.startsWith('tut.') || k.startsWith('onb.'));
const GOAL_KEYS = Object.keys(PLAY_MESSAGES.en).filter((k) => /^(goal|hub\.goal)\./.test(k));

test('copy budget: tutorial titles ≤ 6 words, bodies and feedback ≤ 12 words, goal titles ≤ 7 and hints ≤ 13 (English)', () => {
  const en = MESSAGES.en;
  const over = [];
  for (const id of TUTORIAL_BEATS) {
    if (words(en[`tut.${id}.title`]) > 6) over.push(`tut.${id}.title`);
    if (words(en[`tut.${id}.body`]) > 12) over.push(`tut.${id}.body`);
  }
  for (const k of ['tut.slots.done', 'tut.dots.want', 'tut.dots.one', 'tut.read.done', 'tut.read.sentence', 'tut.stake.staked', 'tut.stake.sealed', 'tut.stake.sealedNote', 'tut.price.vision', 'tut.price.shard', 'onb.access.body', 'onb.look.body', 'onb.fc.body']) {
    if (words(en[k]) > 12) over.push(k);
  }
  const play = PLAY_MESSAGES.en;
  for (const id of [...ONBOARDING, 'anchor.any']) {
    if (words(play['goal.' + id]) > 7) over.push('goal.' + id);
    if (words(play['goal.' + id + '.hint']) > 13) over.push('goal.' + id + '.hint');
  }
  for (const id of ONBOARDING_HUB) {
    if (words(play['hub.goal.' + id]) > 7) over.push('hub.goal.' + id);
    if (words(play['hub.goal.' + id + '.hint']) > 13) over.push('hub.goal.' + id + '.hint');
  }
  assert.deepEqual(over, []);
});

test('languages: every tutorial, onboarding and goal string exists in all five locales with the English placeholders', () => {
  const missing = [], placeholders = [];
  for (const loc of LOCALES) {
    for (const k of TUT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(MESSAGES[loc], k)) { missing.push(`${loc}:${k}`); continue; }
      if ([...argNames(MESSAGES[loc][k])].sort().join() !== [...argNames(MESSAGES.en[k])].sort().join()) placeholders.push(`${loc}:${k}`);
    }
    for (const k of GOAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(PLAY_MESSAGES[loc], k)) { missing.push(`${loc}:${k}`); continue; }
      if ([...argNames(PLAY_MESSAGES[loc][k])].sort().join() !== [...argNames(PLAY_MESSAGES.en[k])].sort().join()) placeholders.push(`${loc}:${k}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(placeholders, []);
  // the old read-only cards are gone everywhere
  for (const loc of LOCALES) for (const k of ['tut.1.title', 'tut.3.body', 'tut.example', 'tut.finish', 'goal.reach_scroll', 'goal.anchor.hintGuess']) {
    assert.ok(!(k in MESSAGES[loc]) && !(k in PLAY_MESSAGES[loc]), `${loc}:${k} removed`);
  }
});

test('languages: the in-game word is "trial" (never "tick") in every first-loop goal, in all five languages', () => {
  const TICK = { en: /\btick/i, ru: /\bтик/i, uk: /\bтик/i, it: /\btick/i, zh: /回合/ };
  const bad = [];
  // goal.anchor.hint quotes the pad menu's own label (opt.anchorTick)
  const QUOTED = /[“«][^”»]*[”»]/g;
  for (const loc of LOCALES) for (const k of GOAL_KEYS) for (const input of INPUTS) {
    const txt = format(PLAY_MESSAGES[loc][k], { input, tick: 'N', n: 1, prize: 40, shell: 'II', ticks: 17, need: 8, have: 1, who: 'X', title: 't', outcome: 'gift', tension: 50, deadline: 16 }, loc);
    if (TICK[loc].test(txt.replace(QUOTED, ''))) bad.push(`${loc}:${k}:${input}`);
  }
  assert.deepEqual(bad, []);
});

test('device-aware copy: touch and gamepad never name a keyboard key; keyboard copy does; tutorial bodies switch verbs', () => {
  const KEY = /(^|[\s(«“"])[EFGMT]([\s).,:»”"]|$)/; // a bare key letter such as "Press T", "(M)", "E → Enter"
  const bad = [];
  for (const loc of LOCALES) for (const k of GOAL_KEYS) {
    for (const input of ['touch', 'gamepad']) {
      const txt = format(PLAY_MESSAGES[loc][k], { input, tick: 3, n: 1, prize: 40, shell: 'II', ticks: 17, need: 8, have: 1, who: 'X', title: 't', outcome: 'gift', tension: 50, deadline: 16 }, loc);
      if (KEY.test(txt.replace(/[“«][^”»]*[”»]/g, ''))) bad.push(`${loc}:${k}:${input} → ${txt}`);
    }
  }
  assert.deepEqual(bad, []);
  const kb = format(PLAY_MESSAGES.en['hub.goal.leave.hint'], { input: 'keyboard' }, 'en');
  assert.match(kb, /Press T/);
  assert.match(format(PLAY_MESSAGES.en['hub.goal.leave.hint'], { input: 'touch' }, 'en'), /Tap “Leave/);
  assert.match(format(PLAY_MESSAGES.en['goal.anchor.hint'], { input: 'touch', tick: 3 }, 'en'), /^Tap the quest/);
  assert.match(format(MESSAGES.en['tut.slots.body'], { input: 'touch' }, 'en'), /Tap/);
  assert.match(format(MESSAGES.en['tut.slots.body'], { input: 'keyboard' }, 'en'), /Click/);
  assert.match(format(MESSAGES.en['tut.slots.body'], { input: 'gamepad' }, 'en'), /Select/);
  assert.ok(!/panel below/.test(PLAY_MESSAGES.en['goal.season_over.hint']), 'QA-017');
});

test('device-aware copy: every goal carries the input kind; flags.input wins over the pointer probe', async () => {
  assert.equal(inputKind({}), 'keyboard', 'Node has no coarse pointer');
  assert.equal(inputKind({ input: 'gamepad' }), 'gamepad');
  assert.equal(inputKind({ input: 'touch' }), 'touch');
  assert.equal(inputKind({ input: 'mouse' }), 'keyboard', 'unknown values fall back');
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  assert.equal(currentGoal(s.obs, {}).args.input, 'keyboard');
  assert.equal(currentGoal(s.obs, { input: 'touch' }).args.input, 'touch');
  assert.equal(currentGoal(s.obs, { hub: true, input: 'gamepad' }).args.input, 'gamepad');
  const i18n = createPlayI18n('en');
  const g = currentGoal(s.obs, { hub: true, input: 'touch' });
  assert.equal(renderMsg(i18n, g.hintKey, { ...g.args, ...g.hintArgs }), 'A sign waits there. Tap the gold Shell.');
  s.dispose();
});

test('Simple mode: when Iris\'s own reading already lands on trial 3 the stake hint says so instead of asking for a Delay change', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const n = [...signsByShell(s.obs)].find(([, v]) => v.length)[0];
  await hub.flyTo(n);
  const o = s.obs;
  assert.equal(hubGoal(o, {}).hintKey, 'hub.goal.stake.hintReady', 'before the first reveal the card pre-fills trial 3, so the goal says "Iris read it"');
  // once something has been revealed there is no pre-fill: a reading that lands elsewhere asks for the Delay change
  const later = { ...o, chronicle: [{ index: 0, tick: 3, meaning: { place: 2, action: 'gift', power: 20 } }] };
  assert.equal(hubGoal(later, {}).hintKey, 'hub.goal.stake.hint');
  const g = hubGoal(o, {});
  for (const loc of LOCALES) {
    const i18n = createPlayI18n(loc, { onMissing: (k) => { throw new Error(`${loc} missing ${k}`); } });
    assert.ok(renderMsg(i18n, g.hintKey, g.args).includes('3'), loc);
  }
  s.dispose();
});

test('first stake: the Delay pre-fill is pure, only before the first reveal, only when the reading lands before trial 3', () => {
  const p1 = { publishedAt: 1 }, p2 = { publishedAt: 2 }, p4 = { publishedAt: 4 };
  const empty = { chronicle: [] }, revealed = { chronicle: [{ index: 0 }] };
  let slots = [0, 0, 0, 0];
  assert.equal(prefillFirstDelay(empty, p1, slots), true); assert.equal(impliedTick(p1, slots), 3);
  slots = [0, 0, 0, 1];
  assert.equal(prefillFirstDelay(empty, p1, slots), false, 'already trial 3');
  slots = [0, 0, 0, 0];
  assert.equal(prefillFirstDelay(empty, p2, slots), false, 'published on trial 2 with Delay +1 is trial 3 already'); assert.equal(impliedTick(p2, slots), 3);
  slots = [0, 0, 0, 0];
  assert.equal(prefillFirstDelay(revealed, p1, slots), false, 'after a reveal the prior stands'); assert.deepEqual(slots, [0, 0, 0, 0]);
  slots = [0, 0, 0, 0];
  assert.equal(prefillFirstDelay(empty, p4, slots), false, 'a sign published on trial 4 is never early');
  assert.equal(FIRST_GIFT_TICK, FIRST_EVENT_TICK);
  assert.equal(FIRST_LOOP_KEY, 'ftf.firstloop.v1');
});

test('first stake: at the pad the trial-3 option is E before the first reveal; afterwards the reading is', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.setClient({ zone: 'island', pos: SPAWN.slice() });
  walk(s, s.goal.target);
  const opts = s.options, obs0 = s.obs, actions0 = s.actions;
  const def = opts[s.defaultIndex];
  assert.equal(def.cmd.type, 'place_anchor'); assert.equal(def.cmd.args.tick, FIRST_EVENT_TICK);
  assert.equal(s.defaultIndex, 0, 'first in the list, so the prompt and the menu agree');
  const reading = opts.find((o) => o.label.key === 'opt.anchorVision');
  assert.ok(reading && reading.tone === 'normal', 'the dead trial-2 reading is listed but not primary');
  assert.equal((await s.run(def)).ok, true);
  for (let i = 0; i < 3; i++) await s.send('end_tick', {});
  assert.ok(s.obs.chronicle.length > 0);
  walk(s, 'anchor_zone:2');
  const later = s.options;
  const dl = later[defaultOption(later)];
  assert.equal(dl.label.key, 'opt.anchorVision', 'after the first reveal Iris\'s reading is the E option again');
  // the pure function agrees with the session (trial 1, nothing revealed yet)
  const pure = contextOptions({ kind: 'anchor', shell: 1 }, obs0, actions0);
  assert.equal(pure[0].cmd.args.tick, FIRST_EVENT_TICK);
  assert.equal(defaultOption(pure), 0);
  s.dispose();
});

// ---------------------------------------------------------------- the first loop in the world

/** Walks the client avatar along the room's walk graph (as the G key does). */
function walk(s, place) {
  const pts = planRoute(s.client.pos || SPAWN, place);
  let pos = (s.client.pos || SPAWN).slice();
  for (const [x, z] of pts) {
    const d = Math.hypot(x - pos[0], z - pos[2]), n = Math.max(1, Math.ceil(d / 0.5));
    const from = pos.slice();
    for (let i = 1; i <= n; i++) { pos = [from[0] + ((x - from[0]) * i) / n, 0, from[2] + ((z - from[2]) * i) / n]; s.setClient({ zone: 'island', pos }); }
  }
  s.setClient({ zone: 'island', pos: placePosition(place).position.slice() });
}

test('hub first loop on the judge season: fly → stake on trial 3 → leave → verified, with the stake resolved', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const seen = [];
  const note = () => { const g = currentGoal(s.obs, s.flags); if (!seen.length || seen.at(-1) !== g.id) seen.push(g.id); return g; };
  let g = note();
  assert.equal(g.id, 'fly'); assert.match(g.target, /^shell:[1-4]$/); assert.equal(g.step, 1); assert.equal(g.steps, 4);
  const n = Number(g.target.slice(6));
  assert.equal((await hub.flyTo(n)).ok, true);
  g = note();
  assert.equal(g.id, 'stake'); assert.equal(g.args.tick, FIRST_GIFT_TICK, 'the hint names trial 3');
  // the player does what the hint says: change Delay until the target reads trial 3
  let guard = 0;
  while (hub.target().tick !== FIRST_GIFT_TICK && guard++ < 4) hub.cycleSlot(3, 1);
  assert.equal(hub.target().tick, FIRST_GIFT_TICK);
  const silk = s.obs.iris.silk;
  assert.equal((await hub.stake()).ok, true);
  assert.equal(s.obs.iris.silk, silk - 10);
  assert.equal(note().id, 'leave');
  await hub.leave();
  g = note();
  assert.equal(g.id, 'verified', 'after leaving, the goal is to watch trial 3 come true');
  assert.ok(s.obs.season.tick >= 2);
  let rounds = 0;
  while (!s.obs.proofs.some((p) => p.verified) && rounds++ < 6) {
    if (hub.card) await hub.resolve(hub.card.kind === 'offer' ? 'later' : 'give');
    else await hub.advance();
    if (!s.obs.proofs.some((p) => p.verified)) assert.equal(note().id, hub.inShell ? 'inside' : 'verified');
  }
  assert.ok(s.obs.proofs.some((p) => p.verified), 'trial 3 verified');
  assert.ok(s.obs.chronicle.some((c) => c.tick === 3 && c.meaning.action === 'gift' && c.meaning.power === 20));
  assert.equal(s.obs.iris.anchors.length, 0, 'the trial-3 stake was paid or returned: nothing dangles');
  g = note();
  assert.ok(!g.onboarding, 'the first loop is over; regular goals take over: ' + g.id);
  assert.deepEqual(seen.filter((x) => ['fly', 'stake', 'leave', 'verified'].includes(x)), ONBOARDING_HUB, 'in order, each once');
  s.dispose();
});

test('hub first loop: a stake on a trial before 3 would never resolve (why the goal steers to trial 3)', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const n = [...signsByShell(s.obs)].find(([, v]) => v.length)[0];
  await hub.flyTo(n);
  assert.equal(hub.draft.prefilled, true, 'the card pre-filled the Delay');
  assert.equal(hub.target().tick, FIRST_EVENT_TICK, 'the pre-filled target is trial 3');
  hub.cycleSlot(3, -1);
  assert.equal(hub.target().tick, 2, 'the judge season: Iris\'s own prior reads the first sign as trial 2');
  await hub.stake();
  await hub.leave();
  while (s.obs.season.tick < 5) { if (hub.card) await hub.resolve(hub.card.kind === 'offer' ? 'later' : 'give'); else await hub.advance(); }
  assert.equal(s.obs.iris.anchors.length, 1, 'the trial-2 stake is still listed at trial 5: the rules never resolve it');
  s.dispose();
});

test('walk first loop on the judge season: stake on trial 3 → end trial → verified → forget → fragment → talk → ask', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.setClient({ zone: 'island', pos: SPAWN.slice() });
  assert.equal(s.goal.id, 'anchor'); assert.equal(s.goal.args.tick, FIRST_GIFT_TICK); assert.equal(s.goal.steps, ONBOARDING.length);
  walk(s, s.goal.target);
  const opt = s.options.find((o) => o.cmd && o.cmd.type === 'place_anchor' && o.cmd.args.tick === FIRST_GIFT_TICK && o.available !== false);
  assert.ok(opt, 'the pad lists a stake on trial 3');
  assert.equal((await s.run(opt)).ok, true);
  assert.equal(s.goal.id, 'end_tick');
  await s.send('end_tick', {});
  assert.equal(s.goal.id, 'verified');
  await s.send('end_tick', {}); await s.send('end_tick', {});
  assert.ok(s.obs.proofs.some((p) => p.verified));
  assert.equal(s.obs.iris.anchors.length, 0);
  assert.equal(s.goal.id, 'forget');
  assert.equal((await s.send('sacrifice_memory', { memoryId: s.obs.memories[0].id, purpose: 'vision' })).ok, true);
  assert.equal(s.goal.id, 'fragment');
  s.holdFragment();
  assert.equal(s.goal.id, 'talk', 'holding the fragment is a valid answer');
  assert.ok(s.goal.target.startsWith('camp:'));
  s.flags.talked = true; s.recompute();
  assert.equal(s.goal.id, 'ask');
  s.flags.asked = true; s.recompute();
  assert.ok(!s.goal.onboarding);
  s.dispose();
});

test('first loop: skipOnboarding (a returning player) and a season past trial 3 show no first-loop goals', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }), skipOnboarding: true });
  await s.start();
  assert.ok(!s.goal.onboarding, s.goal.id);
  s.flags.hub = true; s.recompute();
  assert.ok(!s.goal.onboarding, s.goal.id);
  const t = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await t.start();
  for (let i = 0; i < 4; i++) await t.send('end_tick', {});
  for (const id of ['anchor', 'end_tick', 'verified']) assert.notEqual(t.goal.id, id, 'the loop steps expire by trial 4');
  t.flags.hub = true; t.recompute();
  assert.ok(!['fly', 'stake', 'leave', 'verified'].includes(t.goal.id), 'hub: no first-loop goal after trial 3');
  s.dispose(); t.dispose();
});

test('first loop: every goal renders in all five languages with its arguments', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const obs = s.obs;
  const goals = [];
  for (const flags of [{}, { hub: true }]) {
    let o = obs;
    goals.push(currentGoal(o, flags));
    goals.push(currentGoal({ ...o, iris: { ...o.iris, anchors: [{ shell: 1, tick: 3 }] } }, flags));
    goals.push(currentGoal({ ...o, season: { ...o.season, tick: 2 }, iris: { ...o.iris, anchors: [{ shell: 1, tick: 3 }] } }, flags));
  }
  goals.push(hubGoal({ ...obs, you: { ...obs.you, zone: 'shell', shell: 1 } }, {}));
  for (const loc of LOCALES) {
    const i18n = createPlayI18n(loc, { onMissing: (k) => { throw new Error(`${loc} missing ${k}`); } });
    for (const g of goals) {
      const title = renderMsg(i18n, g.key, g.args), hint = renderMsg(i18n, g.hintKey, { ...g.args, ...g.hintArgs });
      assert.ok(title.length > 2 && !/[{}]/.test(title), `${loc}:${g.key} → ${title}`);
      assert.ok(hint.length > 2 && !/[{}]/.test(hint), `${loc}:${g.hintKey} → ${hint}`);
    }
  }
  s.dispose();
});
