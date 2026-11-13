// The voice fallback chain (sprint 7.6, 7.11 test 4) with fakes: the file plays; a missing file or a decode error
// falls back to speech with a female English voice; no voices means silent; nothing ever rejects or blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { createVoice, pickVoice, VOICE_LINES } from '../../src/npe/voice.js';

const fakeAudio = (outcome) => class { constructor(src) { this.src = src; this.l = {}; fakeAudio.last = this; } addEventListener(k, f) { this.l[k] = f; } play() { if (outcome === 'reject') return Promise.reject(new Error('blocked')); setTimeout(() => this.l[outcome] && this.l[outcome](), 0); return Promise.resolve(); } };
const speech = (voices, ok = true) => ({ spoken: [], getVoices: () => voices, speak(u) { this.spoken.push(u); setTimeout(() => (ok ? u.onend() : u.onerror()), 0); } });
class Utt { constructor(t) { this.text = t; } }
const storage = { getItem: () => null, setItem() {} };

test('voice: the file plays when present (the path under the game base)', async () => {
  const v = createVoice({ base: '/ftf/', storage, Audio: fakeAudio('ended'), speech: speech([]), Utterance: Utt });
  assert.equal(await v.play('iris_oh_no'), 'file');
  assert.equal(fakeAudio.last.src, '/ftf/assets/audio/voice/iris_oh_no.ogg');
  assert.ok(fakeAudio.last.volume > 0 && fakeAudio.last.volume <= 1);
});

test('voice: a 404 or a decode error falls back to a female English speech voice; no voices = silent; never rejects', async () => {
  const voices = [{ name: 'Microsoft David', lang: 'en-US' }, { name: 'Microsoft Zira', lang: 'en-US' }, { name: 'Anna', lang: 'de-DE' }];
  const sp = speech(voices);
  assert.equal(await createVoice({ storage, Audio: fakeAudio('error'), speech: sp, Utterance: Utt }).play('iris_oh_no'), 'speech');
  assert.equal(sp.spoken[0].voice.name, 'Microsoft Zira'); assert.equal(sp.spoken[0].pitch, 1.15); assert.equal(sp.spoken[0].rate, 0.9); assert.equal(sp.spoken[0].text, 'Oh no...');
  assert.equal(await createVoice({ storage, Audio: fakeAudio('reject'), speech: speech([]), Utterance: Utt }).play('iris_oh_no'), 'silent', 'autoplay blocked and no voices');
  assert.equal(await createVoice({ storage, Audio: null, speech: null, Utterance: null }).play('iris_oh_no'), 'silent');
  assert.equal(await createVoice({ storage, Audio: fakeAudio('error'), speech: speech(voices, false), Utterance: Utt }).play('iris_gasp'), 'silent', 'a speech error is silent, not a throw');
  assert.equal(await createVoice({ storage }).play('nope'), 'silent');
  assert.equal(pickVoice([{ name: 'X', lang: 'en-GB' }]).name, 'X', 'any English voice when no female one');
  assert.equal(pickVoice([{ name: 'Y', lang: 'fr-FR' }]), null);
});

test('voice: the placeholder files exist, are small and are documented', () => {
  for (const l of Object.values(VOICE_LINES)) { const p = new URL('../../public/' + l.file, import.meta.url); assert.ok(existsSync(p), l.file); assert.ok(statSync(p).size < 30_000, l.file); }
  assert.ok(existsSync(new URL('../../../docs/audio/voice.md', import.meta.url)));
});
