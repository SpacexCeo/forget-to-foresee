// The lab prologue's music bed (owner pick 13.11, "Computations in a Snowstorm"): it starts on the title card, fades
// in to its level, fades out and stops with the whiteout; no URL or no Audio means no bed and no error.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabAudio, LAB_MUSIC_VOLUME } from '../../src/cinematic/prologue/lab-audio.js';
import { MUSIC_MANIFEST } from '../../src/audio/music-manifest.js';

const fakeAudio = () => { const made = []; return { made, make: (url) => { const a = { url, loop: false, volume: 1, paused: true, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } }; made.push(a); return a; } }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the bed starts on the title card, fades in, and fades out to a stop with the whiteout', async () => {
  let now = 0; const f = fakeAudio();
  const audio = createLabAudio({ musicUrl: '/x/assets/audio/mus_lab.ogg', makeAudio: f.make, clock: () => now });
  audio.cue('title');
  assert.equal(f.made.length, 1); const bed = f.made[0];
  assert.equal(bed.url, '/x/assets/audio/mus_lab.ogg'); assert.equal(bed.loop, true); assert.equal(bed.paused, false); assert.equal(bed.volume, 0);
  now = 10_000; await wait(80);
  assert.ok(Math.abs(bed.volume - LAB_MUSIC_VOLUME) < 1e-9);
  audio.cue('title'); assert.equal(f.made.length, 1);   // a second title cue does not stack a second bed
  audio.cue('whiteout'); now = 20_000; await wait(80);
  assert.equal(bed.volume, 0); assert.equal(bed.paused, true); assert.equal(audio.bed, null);
  audio.dispose();
});

test('no music URL means no bed; dispose stops a playing bed', () => {
  const f = fakeAudio();
  const silent = createLabAudio({ makeAudio: f.make }); silent.cue('title'); assert.equal(f.made.length, 0); silent.dispose();
  const a = createLabAudio({ musicUrl: 'm.ogg', makeAudio: f.make }); a.cue('title'); const bed = f.made[0]; a.dispose();
  assert.equal(bed.paused, true);
});

test('the manifest lists the lab bed with its CC-BY credit', () => {
  const m = MUSIC_MANIFEST.sounds.mus_lab;
  assert.equal(m.file, 'mus_lab.ogg'); assert.equal(m.licence, 'CC-BY 4.0'); assert.match(m.credit, /Computations in a Snowstorm.*Scott Buckley/);
});
