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
