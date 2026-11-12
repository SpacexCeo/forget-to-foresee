// The licensed music beds (src/audio/music.js, music-manifest.js): which bed plays where, the engine's crossfade
// and SFX dip, and that every shipped track is credited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { musicFor, MUSIC_BEDS, TOWN_THEME } from '../../src/audio/music.js';
import { MUSIC_MANIFEST } from '../../src/audio/music-manifest.js';
import { createAudio } from '../../src/audio/audio.js';
import { createTownAudio } from '../../src/audio/town-audio.js';
import { memoryStorage } from '../../src/ui/storage.js';

const root = (p) => fileURLToPath(new URL('../../../' + p, import.meta.url));

test('beds by zone and weather: the town theme outdoors, "Tears in Rain" in the shops', () => {
  assert.ok(['mus_town_moonlight', 'mus_town_dreams'].includes(TOWN_THEME));
  assert.equal(musicFor({ zone: 'town' }), TOWN_THEME);
  assert.equal(musicFor({ zone: 'interior' }), 'mus_interior');
  assert.equal(musicFor({ zone: 'interior', weather: 'storm' }), 'mus_interior', 'interiors keep their bed in the rain');
  assert.equal(musicFor({ zone: 'outside' }), TOWN_THEME, 'no combat pick yet: the town theme beyond the walls');
  assert.equal(musicFor({ zone: 'archipelago' }), null, 'no archipelago pick yet: the old stems');
  assert.equal(musicFor({ zone: 'town', weather: 'rain' }), TOWN_THEME, 'no rain pick yet');
  const beds = { ...MUSIC_BEDS, rain: 'r', outside: 'c', archipelago: 'a' };
  assert.equal(musicFor({ zone: 'town', weather: 'drizzle' }, beds), 'r');
  assert.equal(musicFor({ zone: 'outside', weather: 'fog' }, beds), 'c');
  assert.equal(musicFor({ zone: 'archipelago', weather: 'storm' }, beds), 'r');
  for (const n of Object.values(MUSIC_BEDS).filter(Boolean)) assert.ok(MUSIC_MANIFEST.sounds[n], n + ' ships');
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
  a.setMusic(TOWN_THEME); await flush();
  assert.equal(a.state.musicBed, TOWN_THEME);
  assert.ok(FakeCtx.last.sources.some((s) => s.stopped && s.loop), 'the old bed stopped (after its fade)');
  a.setMusic('no_such_track'); assert.equal(a.state.musicBed, null, 'unknown names: no bed');
  a.play('strike_impact'); await flush();
  const h = a._nodes().musicDip.gain.hist;
  assert.ok(h.some((v) => v < 0.7) && h.at(-1) === 1, 'music dips under a strike, then comes back');
  a.dispose();
});

test('town audio: no synth stems, the bed follows the zone and the weather', () => {
  const calls = []; let opts = null; const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener() {} };
  const ta = createTownAudio({ createAudio: (o) => { opts = o; return { setZone() {}, play: () => ({ stop() {}, setGain() {} }), setMusic: (n, f) => calls.push([n, f]), unlock: () => Promise.resolve(), dispose() {} }; }, win, rand: () => 0.5 });
  assert.equal(opts.music, false);
  assert.equal(calls.at(-1)[0], TOWN_THEME);
  ta.setMusicZone('interior'); assert.equal(calls.at(-1)[0], 'mus_interior'); assert.ok(calls.at(-1)[1] > 1, 'a crossfade, not a cut');
  const n = calls.length; ta.setMusicZone('interior'); assert.equal(calls.length, n, 'per-frame calls are free when unchanged');
  ta.setMusicZone('outside'); assert.equal(calls.at(-1)[0], TOWN_THEME);
  listeners['ftf:weather']({ detail: { state: 'rain' } }); assert.equal(calls.at(-1)[0], TOWN_THEME, 'no rain bed picked yet');
  ta.dispose();
});
