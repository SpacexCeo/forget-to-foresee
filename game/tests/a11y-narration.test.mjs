// Narration (src/play/narration.js): the speech wrapper Tasks I (tutorial) and P (chapter films)
// call. Driven by a fake synthesizer: queueing, channels and interrupts, prefs switch and rate, the
// locale → language map, markup stripping, chunking, and the graceful no-op without speech support.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNarration, fakeSynth, stripMarkup, chunkText, pickVoice, localeToLang, NARRATION_LANG, NARRATION_RATES } from '../src/play/narration.js';
import { createPrefs, PREF_OPTIONS } from '../src/ui/prefs.js';
import { createSafeStorage, memoryStorage } from '../src/ui/storage.js';
import { createPlayI18n } from '../src/play/i18n.js';

const silent = () => {};
function setup(prefPatch = { narration: true }, opts = {}) {
  const prefs = createPrefs(createSafeStorage(memoryStorage()));
  prefs.set(prefPatch);
  const { synth, Utterance } = fakeSynth(opts);
  const i18n = createPlayI18n(opts.locale || 'en', { onMissing: silent });
  const n = createNarration({ prefs, i18n, synth, Utterance });
  return { prefs, synth, n, i18n };
}

test('narration: off by default, on through prefs; unavailable synth is a silent no-op', () => {
  const { n, synth } = setup({});
  assert.equal(n.available, true);
  assert.equal(n.enabled(), false);
  assert.equal(n.speak('Hello'), null);
  assert.equal(synth.spoken.length, 0);
  const none = createNarration({ synth: null, Utterance: undefined });
  assert.equal(none.available, false);
  assert.equal(none.enabled(), false);
  assert.equal(none.speak('Hello'), null);
  assert.doesNotThrow(() => { none.cancel(); none.pause(); none.resume(); none.destroy(); });
  assert.equal(none.supports('en'), false);
});

test('narration: speaks in the UI locale with the prefs rate; long text goes out in sentence chunks', async () => {
  const { n, synth, prefs, i18n } = setup({ narration: true, narrationRate: 1.15 });
  const t = n.speak('A sign woke on Shell II. I read it as a Gift of 20, due trial 3.');
  assert.ok(t && t.id > 0);
  assert.equal(n.speaking, true);
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].lang, 'en-US');
  assert.equal(synth.spoken[0].rate, 1.15);
  assert.equal(synth.spoken[0].text, 'A sign woke on Shell II. I read it as a Gift of 20, due trial 3.', 'short sentences share one utterance');
  synth.finish();
  const longText = Array.from({ length: 5 }, (_, i) => `This is sentence ${i + 1} of a long chapter narration that keeps going on.`).join(' ');
  const t2 = n.speak(longText);
  const first = synth.spoken.at(-1).text;
  assert.ok(first.length <= 180 && longText.startsWith(first), 'the first chunk ends at a sentence boundary');
  synth.finish();
  assert.ok(synth.spoken.at(-1).text !== first, 'the next chunk follows when the first ends');
  while (n.speaking) synth.finish();
  assert.equal(await t2.done, 'end');
  assert.equal(await t.done, 'end');
  assert.equal(n.speaking, false);
  // every UI locale maps to a speech language
  for (const loc of PREF_OPTIONS.locale) {
    i18n.setLocale(loc);
    prefs.set({ locale: loc });
    const tk = n.speak('x');
    assert.equal(synth.spoken.at(-1).lang, NARRATION_LANG[loc], loc);
    assert.equal(localeToLang(loc), NARRATION_LANG[loc]);
    tk.cancel();
  }
  assert.equal(localeToLang('xx'), 'en-US');
});

test('narration: lines queue in order; a film shot interrupts lines and hints; hints never stack', async () => {
  const { n, synth } = setup();
  const events = [];
  n.subscribe((e) => events.push(e.type + ':' + e.channel));
  const a = n.speak('Line one.', { channel: 'line' });
  const b = n.speak('Line two.', { channel: 'line' });
  const h1 = n.speak('Hint.', { channel: 'hint' });
  const h2 = n.speak('Another hint.', { channel: 'hint' });
  assert.ok(a && b && h1);
  assert.equal(h2, null, 'a second pending hint is dropped');
  assert.equal(n.pending, 2);
  const film = n.speak('The island woke.', { channel: 'film' });
  assert.equal(await a.done, 'cancel');
  assert.equal(await b.done, 'cancel');
  assert.equal(await h1.done, 'cancel');
  assert.equal(synth.spoken.at(-1).text, 'The island woke.');
  synth.finish();
  assert.equal(await film.done, 'end');
  assert.ok(events.includes('start:line') && events.includes('cancel:line') && events.includes('start:film') && events.includes('end:film'));
  // the queue stays bounded: the least important pending item goes first
  for (let i = 0; i < 6; i++) n.speak('L' + i, { channel: 'line' });
  assert.ok(n.pending <= 4);
  n.cancel();
  assert.equal(n.pending, 0);
  assert.equal(n.speaking, false);
});

test('narration: say() renders an i18n key; turning the pref off cancels speech; pause/resume hold the queue', async () => {
  const { n, synth, prefs } = setup();
  const tk = n.say('hub.notice.newSign', { shell: 'II' });
  assert.equal(synth.spoken.at(-1).text, 'A new sign glows in Shell II');
  n.pause();
  assert.equal(synth.pausedFlag, true);
  const second = n.speak('Later.');
  synth.finish();
  assert.equal(await tk.done, 'end');
  assert.equal(n.speaking, false, 'nothing starts while paused');
  n.resume();
  assert.equal(n.speaking, true);
  prefs.set({ narration: false });
  assert.equal(await second.done, 'cancel');
  assert.equal(n.enabled(), false);
  assert.equal(n.speak('x'), null);
  n.force(true);
  assert.ok(n.speak('forced'), 'force(true) speaks regardless of prefs (settings sample)');
  n.force(null);
  assert.equal(n.speak('x'), null);
  n.destroy();
});

test('narration: markup is stripped for speech and long text is chunked at sentence ends', () => {
  assert.equal(stripMarkup('<kbd>V</kbd> signs · <kbd>T</kbd> end the trial'), 'V signs, T end the trial');
  assert.equal(stripMarkup('Trial 3 of 17 — Silk 50…'), 'Trial 3 of 17, Silk 50.');
  assert.equal(stripMarkup('  a &amp; b  '), 'a & b');
  const long = Array.from({ length: 6 }, (_, i) => `Sentence number ${i + 1} is here and it is fairly long.`).join(' ');
  const chunks = chunkText(long);
  assert.ok(chunks.length >= 2);
  for (const c of chunks) assert.ok(c.length <= 180, c);
  assert.equal(chunks.join(' '), long);
  assert.deepEqual(chunkText('第一句。第二句！'), ['第一句。第二句！']);
  const run = 'word '.repeat(60).trim();
  for (const c of chunkText(run)) assert.ok(c.length <= 180);
});

test('narration: voice choice prefers an exact tag, then the language, local and natural voices first', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', localService: false, default: false },
    { name: 'Microsoft Zira', lang: 'en-US', localService: true, default: true },
    { name: 'Lesya', lang: 'uk-UA', localService: true },
    { name: 'Milena', lang: 'ru_RU', localService: true },
    { name: 'Tingting Natural', lang: 'zh-CN', localService: false },
    { name: 'Alice', lang: 'it-IT' },
  ];
  assert.equal(pickVoice(voices, 'en-US').name, 'Microsoft Zira');
  assert.equal(pickVoice(voices, 'en-GB').name, 'Microsoft Zira', 'same language beats nothing');
  assert.equal(pickVoice(voices, 'uk-UA').name, 'Lesya');
  assert.equal(pickVoice(voices, 'ru-RU').name, 'Milena', 'underscore tags are normalized');
  assert.equal(pickVoice(voices, 'zh-CN').name, 'Tingting Natural');
  assert.equal(pickVoice(voices, 'de-DE'), null);
  const { n } = setup({ narration: true }, { voices });
  for (const loc of PREF_OPTIONS.locale) assert.equal(n.supports(loc), true, loc);
  assert.equal(n.voicesFor('en').length, 2);
  assert.deepEqual(NARRATION_RATES, [0.75, 0.9, 1, 1.15, 1.3]);
});
