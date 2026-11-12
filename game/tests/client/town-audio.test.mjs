// Town sound (src/audio/town-audio.js): footstep pacing, cues through one window event, wood indoors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepper, createTownAudio, cue, STEP_EVERY, TOWN_CUES } from '../../src/audio/town-audio.js';
import { AUDIO_MANIFEST } from '../../src/audio/manifest.js';

test('a step every 0.62 m walking, 0.9 m running', () => {
  const s = stepper(); let n = 0;
  for (let i = 0; i < 100; i++) if (s(0.0621, false)) n++;
  assert.equal(n, 10);
  const r = stepper(); let m = 0;
  for (let i = 0; i < 90; i++) if (r(0.1001, true)) m++;
  assert.equal(m, 10);
  assert.ok(STEP_EVERY.run > STEP_EVERY.walk);
});

test('cues play through the engine, unknown names are ignored; steps on stone outside, wood inside', () => {
  const played = [];
  const fake = () => ({ setZone() {}, play: (n, o) => played.push(n), unlock: async () => true, dispose() {}, setListener() {} });
  const listeners = {};
  const win = { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }, removeEventListener() {}, dispatchEvent: (e) => { for (const fn of listeners[e.type] || []) fn(e); return true; } };
  globalThis.CustomEvent ||= class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  const ta = createTownAudio({ createAudio: fake, win });
  cue('gift_chime', win); cue('not_a_sound', win);
  ta.step(0.7, false, false); ta.step(0.7, false, true);
  assert.deepEqual(played, ['gift_chime', 'step_stone', 'step_wood']);
  for (const c of TOWN_CUES) assert.ok(AUDIO_MANIFEST.sounds[c] || (AUDIO_MANIFEST.groups && AUDIO_MANIFEST.groups[c]), c);
});

test('intro fly-through: once per browser, skippable, never on the jury path, ?skip=intro or reduced motion', async () => {
  const { readFileSync } = await import('node:fs');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  const body = boot.slice(boot.indexOf('function introFly('), boot.indexOf('/** The camera settles on the heroine'));
  for (const want of ['INTRO_KEY', 'judge', 'lookdev.reducedMotion', "params.get('skip') === 'intro'", "addEventListener('keydown', end)", "ctx.i18n.t('intro.skip')"]) assert.ok(body.includes(want), want);
  assert.match(boot, /introFly\(\)\.then\(startDay1\)/);
  const { PLAY_MESSAGES } = await import('../../src/play/i18n.js');
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) assert.ok(PLAY_MESSAGES[loc]['intro.skip'], loc);
});

test('combat and footstep sounds (owner, 12.11): every cue has its synthesized variations in the manifest', async () => {
  const { TOWN_CUES, MOB_SOUNDS, STEP_SURFACES, cueName } = await import('../../src/audio/town-audio.js');
  const { AUDIO_MANIFEST } = await import('../../src/audio/manifest.js');
  const has = (n) => !!(AUDIO_MANIFEST.sounds[n] || AUDIO_MANIFEST.groups[n]);
  for (const c of TOWN_CUES) assert.ok(has(c), c);
  for (const t of Object.values(MOB_SOUNDS)) { assert.ok(has(t.attack), t.attack); assert.ok(has(t.hurt), t.hurt); }
  for (const s of STEP_SURFACES) assert.ok((AUDIO_MANIFEST.groups['step_' + s] || []).length >= 6, 'six ' + s + ' steps');
  for (const g of ['strike_swing', 'strike_impact', 'mob_skitter_attack', 'iris_hurt']) assert.ok(AUDIO_MANIFEST.groups[g].length >= 3, g + ' varies');
  assert.equal(cueName('ui_click'), 'ui_click'); assert.equal(cueName({ name: 'mob_death', pos: [1, 2, 3] }), 'mob_death');
});

test('positional cues, a volume jitter, and footsteps by surface', async () => {
  const { createTownAudio, cueAt } = await import('../../src/audio/town-audio.js');
  const played = [];
  const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener() {}, dispatchEvent: (e) => { if (listeners[e.type]) listeners[e.type](e); return true; } };
  globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  const ta = createTownAudio({ createAudio: () => ({ setZone() {}, play: (n, o) => played.push([n, o]), unlock: () => Promise.resolve(), dispose() {} }), win, rand: () => 0.5 });
  cueAt('mob_hulker_slam', [1, 2, 3], 1, win);
  assert.equal(played[0][0], 'mob_hulker_slam'); assert.deepEqual(played[0][1].pos, [1, 2, 3]); assert.ok(played[0][1].gain > 0.85 && played[0][1].gain <= 1);
  cueAt('not_a_cue', null, 1, win); assert.equal(played.length, 1, 'unknown cues are ignored');
  ta.footContact('grass', false); ta.footContact('wood', true); ta.footContact(true); ta.footContact('lava');
  assert.deepEqual(played.slice(1).map((p) => p[0]), ['step_grass', 'step_wood', 'step_wood', 'step_stone']);
  assert.ok(played[2][1].gain > played[1][1].gain, 'running steps are louder');
  ta.dispose();
});

test('foot contacts from the locomotion (ftf:foot) take over from the distance pacing', async () => {
  const { createTownAudio } = await import('../../src/audio/town-audio.js');
  const played = []; const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener() {} };
  const ta = createTownAudio({ createAudio: () => ({ setZone() {}, play: (n) => played.push(n), unlock: () => Promise.resolve(), dispose() {} }), win, rand: () => 0.5 });
  ta.step(5, false, 'grass'); assert.deepEqual(played, ['step_grass'], 'no contacts yet: the pacing steps');
  listeners['ftf:foot']({ detail: { running: false } }); assert.equal(played.at(-1), 'step_grass', 'the contact uses the current floor');
  ta.step(5, false, 'stone'); assert.equal(played.length, 2, 'contacts arriving: the pacing stays quiet');
  listeners['ftf:foot']({ detail: { surface: 'wood' } }); assert.equal(played.at(-1), 'step_wood');
  ta.dispose();
});

test('weather (ftf:weather): the rain bed by state, thunder after a storm flash, wet steps outdoors only', async () => {
  const { createTownAudio, weatherSound } = await import('../../src/audio/town-audio.js');
  assert.deepEqual(weatherSound('clear'), { bed: null, wet: false, level: 0 });
  assert.equal(weatherSound('drizzle').bed, 'amb_rain_light');
  assert.equal(weatherSound('rain').bed, 'amb_rain_heavy');
  assert.equal(weatherSound('storm').bed, 'amb_rain_heavy');
  for (const s of ['haze', 'fog', 'overcast', 'nonsense', undefined]) assert.equal(weatherSound(s).bed, null, String(s));
  const played = []; const stopped = []; const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener() {} };
  const play = (n, o = {}) => { const h = { n, o, gains: [], stop: () => stopped.push(n), setGain: (g) => h.gains.push(g) }; played.push(h); return h; };
  const ta = createTownAudio({ createAudio: () => ({ setZone() {}, play, unlock: () => Promise.resolve(), dispose() {} }), win, rand: () => 0.5 });
  const weather = (detail) => listeners['ftf:weather']({ detail });
  weather({ state: 'drizzle' });
  assert.equal(played.at(-1).n, 'amb_rain_light'); assert.equal(played.at(-1).o.loop, true); assert.equal(played.at(-1).o.gain, 0, 'fades in');
  assert.deepEqual(ta.weather, { bed: 'amb_rain_light', wet: true });
  ta.footContact('stone'); assert.equal(played.at(-1).n, 'step_wet', 'rain outdoors: wet steps');
  ta.footContact('wood'); assert.equal(played.at(-1).n, 'step_wood', 'indoors stays dry');
  weather({ state: 'storm' });
  assert.deepEqual(stopped, ['amb_rain_light'], 'the light bed fades out'); assert.equal(played.at(-1).n, 'amb_rain_heavy');
  const n = played.length;
  weather({ state: 'storm', thunder: 2.4 });
  assert.equal(played.length, n + 1, 'same bed kept, one thunder'); assert.equal(played.at(-1).n, 'thunder_distant'); assert.equal(played.at(-1).o.delay, 2.4);
  weather({ state: 'clear' });
  assert.deepEqual(stopped, ['amb_rain_light', 'amb_rain_heavy']); assert.deepEqual(ta.weather, { bed: null, wet: false });
  ta.footContact('stone'); assert.equal(played.at(-1).n, 'step_stone', 'dry again');
  ta.dispose();
});
