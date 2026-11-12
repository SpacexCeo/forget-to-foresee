// The licensed music beds (src/audio/music.js, music-manifest.js): which bed plays where, the engine's crossfade
// and SFX dip, and that every shipped track is credited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { musicFor, archipelagoMusic, MUSIC_BEDS, markChapterDone, takeChapterDone, CHAPTER_DONE_SECONDS } from '../../src/audio/music.js';
import { MUSIC_MANIFEST } from '../../src/audio/music-manifest.js';
import { createAudio } from '../../src/audio/audio.js';
import { createTownAudio } from '../../src/audio/town-audio.js';
import { memoryStorage } from '../../src/ui/storage.js';

const root = (p) => fileURLToPath(new URL('../../../' + p, import.meta.url));

test('beds: Hiraeth, Tears in Rain in the shops, Floating Cities outside, Legionnaire for the elite and the finale', () => {
  assert.equal(musicFor({ zone: 'town' }), 'mus_town');
  assert.equal(musicFor({ zone: 'interior' }), 'mus_interior');
  assert.equal(musicFor({ zone: 'interior', weather: 'storm', boss: true }), 'mus_interior', 'the shops keep their bed');
  assert.equal(musicFor({ zone: 'outside' }), 'mus_outside');
  assert.equal(musicFor({ zone: 'outside', boss: true }), 'mus_boss');
  assert.equal(musicFor({ zone: 'town', weather: 'rain' }), 'mus_town', 'no rain bed: the zone bed under the rain ambience');
  assert.equal(musicFor({ zone: 'town', chapterDone: true }), 'mus_chapter_done');
  assert.equal(musicFor({ zone: 'outside', chapterDone: true, boss: true }), 'mus_boss', 'the fight wins');
  assert.equal(musicFor({ zone: 'town', weather: 'drizzle' }, { ...MUSIC_BEDS, rain: 'r' }), 'r');
  assert.equal(archipelagoMusic('trust'), null, 'ordinary trials keep the stems');
  assert.equal(archipelagoMusic('vote'), 'mus_boss');
  assert.equal(archipelagoMusic('ending'), 'mus_chapter_done');
  for (const n of Object.values(MUSIC_BEDS).filter(Boolean)) assert.ok(MUSIC_MANIFEST.sounds[n], n + ' ships');
  const store = new Map(); const ss = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(takeChapterDone(ss, 1000), 0);
  markChapterDone(ss, 1000); assert.equal(takeChapterDone(ss, 5000), CHAPTER_DONE_SECONDS); assert.equal(takeChapterDone(ss, 6000), 0, 'consumed');
  markChapterDone(ss, 0); assert.equal(takeChapterDone(ss, 3600e3), 0, 'too old');
});

test('every music bed ships as a looping stereo file and is credited (CC-BY 4.0)', () => {
  const credits = readFileSync(root('docs/art/manifest.md'), 'utf8') + readFileSync(root('README.md'), 'utf8');
  for (const [name, s] of Object.entries(MUSIC_MANIFEST.sounds)) {
    const p = root('game/public/assets/audio/' + s.file);
    assert.ok(existsSync(p), 'missing ' + s.file);
    assert.ok(statSync(p).size < 4.5e6, s.file + ' stays small');
    assert.equal(s.kind, 'music'); assert.equal(s.loop, true); assert.equal(s.licence, 'CC-BY 4.0');
    assert.ok(credits.includes(s.title) && credits.includes(s.artist), name + ' credited');
  }
});

class Param { constructor(v = 0) { this.value = v; this.hist = []; } setTargetAtTime(v) { this.value = v; this.hist.push(v); } cancelScheduledValues() {} setValueAtTime(v) { this.value = v; } }
class Node { connect(n) { this.out = n; return n; } disconnect() { this.out = null; } }
class FakeCtx {
  constructor() { this.currentTime = 0; this.destination = new Node(); this.sources = []; this.listener = {}; FakeCtx.last = this; }
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createDynamicsCompressor() { const n = new Node(); for (const k of ['threshold', 'ratio', 'attack', 'release']) n[k] = new Param(); return n; }
  createPanner() { const n = new Node(); n.positionX = new Param(); n.positionY = new Param(); n.positionZ = new Param(); return n; }
  createBufferSource() { const n = new Node(); n.playbackRate = new Param(1); n.start = () => { n.started = true; }; n.stop = () => { n.stopped = true; n.onended?.(); }; this.sources.push(n); return n; }
  decodeAudioData() { return Promise.resolve({ duration: 300, length: 300 * 48000 }); }
  resume() { return Promise.resolve(); } suspend() {} close() {}
}
const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const flush = () => new Promise((r) => setTimeout(r, 5));

test('engine: a bed asked before unlock starts on unlock, crossfades, silences the stems, dips under effects', async () => {
  const a = createAudio({ AudioContextClass: FakeCtx, fetch: fakeFetch, storage: memoryStorage(), base: '/x/' });
  a.setMusic('mus_interior');
  assert.equal(a.state.musicBed, null, 'nothing before unlock');
  await a.unlock(); await flush();
  assert.equal(a.state.musicBed, 'mus_interior');
  a.setTension(50); await flush();
  assert.ok(Object.values(a._music()).every((m) => m.gain.gain.value === 0), 'stems silent under a licensed bed');
  a.setMusic('mus_town'); await flush();
  assert.equal(a.state.musicBed, 'mus_town');
  assert.ok(FakeCtx.last.sources.some((s) => s.stopped && s.loop), 'the old bed stopped (after its fade)');
  a.setMusic('no_such_track'); assert.equal(a.state.musicBed, null, 'unknown names: no bed');
  a.play('strike_impact'); await flush();
  const h = a._nodes().musicDip.gain.hist;
  assert.ok(h.some((v) => v < 0.7) && h.at(-1) === 1, 'music dips under a strike, then comes back');
  a.dispose();
});

test('town audio: no synth stems; the bed follows zone, the elite, aggro and a passed chapter', () => {
  const calls = []; const levels = []; let opts = null; const listeners = {}; let t = 0;
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener() {} };
  const fake = (o) => { opts = o; return { setZone() {}, play: () => ({ stop() {}, setGain() {} }), setMusic: (n, f) => calls.push([n, f]), setMusicLevel: (l) => levels.push(l), unlock: () => Promise.resolve(), dispose() {} }; };
  const ta = createTownAudio({ createAudio: fake, win, rand: () => 0.5, store: null, clock: () => t });
  assert.equal(opts.music, false);
  assert.equal(calls.at(-1)[0], 'mus_town');
  ta.setMusicZone('interior'); assert.equal(calls.at(-1)[0], 'mus_interior'); assert.ok(calls.at(-1)[1] > 1, 'a crossfade, not a cut');
  const n = calls.length; ta.setMusicZone('interior'); ta.setCombat({}); assert.equal(calls.length, n, 'per-frame calls are free when unchanged');
  ta.setMusicZone('outside'); assert.equal(calls.at(-1)[0], 'mus_outside');
  ta.setCombat({ aggro: true }); assert.ok(levels.at(-1) > 1, 'a lift while monsters chase her');
  ta.setCombat({ aggro: true, elite: true }); assert.equal(calls.at(-1)[0], 'mus_boss');
  t = 2; ta.setCombat({ aggro: false }); assert.equal(calls.at(-1)[0], 'mus_boss', 'holds a moment after the elite lets go');
  t = 10; ta.setCombat({}); assert.equal(calls.at(-1)[0], 'mus_outside'); assert.equal(levels.at(-1), 1);
  listeners['ftf:weather']({ detail: { state: 'rain' } }); assert.equal(calls.at(-1)[0], 'mus_outside', 'no rain bed picked yet');
  ta.dispose();
  const store = new Map([['ftf.music.chapterDone', String(Date.now())]]);
  const ss = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  calls.length = 0; t = 0;
  const tb = createTownAudio({ createAudio: fake, win, rand: () => 0.5, store: ss, clock: () => t });
  assert.equal(calls.at(-1)[0], 'mus_chapter_done', 'back from a passed chapter: Frozen Star first');
  t = CHAPTER_DONE_SECONDS + 1; tb.setCombat({}); assert.equal(calls.at(-1)[0], 'mus_town', 'then Hiraeth');
  tb.dispose();
});

test('engine: beds stream through two primed media elements that alternate on a crossfade', async () => {
  class El { constructor() { El.all.push(this); this.plays = 0; } play() { this.plays++; this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } removeAttribute() {} }
  El.all = [];
  class Ctx extends FakeCtx { createMediaElementSource(el) { const n = new Node(); n.el = el; return n; } }
  const a = createAudio({ AudioContextClass: Ctx, fetch: fakeFetch, storage: memoryStorage(), base: '/x/', MediaElement: El, music: false });
  a.setMusic('mus_town');
  await a.unlock(); await flush();
  assert.equal(El.all.length, 2, 'two elements, primed in the gesture');
  assert.equal(El.all[0].src, '/x/mus_town.ogg'); assert.equal(El.all[0].loop, true);
  a.setMusic('mus_interior');
  assert.equal(El.all[1].src, '/x/mus_interior.ogg', 'the next bed takes the other element (both play during the fade)');
  assert.equal(a.state.musicBed, 'mus_interior');
  a.setMusicLevel(1.25);
  a.dispose();
});
