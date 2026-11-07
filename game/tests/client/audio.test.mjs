// Audio: pure mix logic, the generated manifest against the shipped files, and the WebAudio runtime
// against a minimal fake AudioContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUDIO_MANIFEST } from '../../src/audio/manifest.js';
import { tensionMix, tensionBand, zoneMix, zoneAt, resolveSound, guestPlan, listenerPose, loadVolumes, saveVolumes, sanitizeVolumes, validateManifest, DEFAULT_VOLUMES, VOLUME_KEY } from '../../src/audio/mix.js';
import { createAudio } from '../../src/audio/audio.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { CAMPS, SPAWN } from '../../src/scenes/layout.js';

const AUDIO_DIR = fileURLToPath(new URL('../../public/assets/audio/', import.meta.url));

test('manifest is valid, every file ships and the total stays within 12 MB', () => {
  assert.deepEqual(validateManifest(AUDIO_MANIFEST), []);
  let total = 0;
  for (const s of Object.values(AUDIO_MANIFEST.sounds)) {
    const p = AUDIO_DIR + s.file;
    assert.ok(existsSync(p), 'missing ' + s.file);
    total += statSync(p).size;
  }
  assert.ok(total <= 12e6, 'total ' + total);
  const need = ['amb_wind', 'amb_shell_hum', 'amb_shell_inside', 'mus_calm', 'mus_uneasy', 'mus_crisis', 'ui_hover', 'ui_click', 'ui_confirm', 'ui_error', 'ui_notify',
    'anchor_plant', 'storm_crack', 'gift_chime', 'vision_whoosh', 'memory_dissolve', 'sting_survived', 'sting_weapon', 'sting_gone',
    ...CAMPS.map((c) => 'amb_camp_' + c.id), ...['arc', 'spike', 'loop', 'drop'].map((s) => 'guest_' + s)];
  for (const n of need) assert.ok(AUDIO_MANIFEST.sounds[n], n);
  for (const g of ['step_stone', 'step_wood', 'step_grass', 'step_glass', 'step_metal', 'bid_tick', 'vote_stone']) assert.ok(AUDIO_MANIFEST.groups[g]?.length >= 3, g);
  const durs = ['mus_calm', 'mus_uneasy', 'mus_crisis'].map((n) => AUDIO_MANIFEST.sounds[n].samples);
  assert.ok(durs.every((d) => d === durs[0]), 'music stems share one loop length');
});

test('tension mix: equal power, calm -> uneasy -> crisis', () => {
  for (let t = 0; t <= 100; t += 2.5) {
    const m = tensionMix(t);
    assert.ok(Math.abs(m.calm ** 2 + m.uneasy ** 2 + m.crisis ** 2 - 1) < 1e-9, 'power at ' + t);
  }
  assert.equal(tensionBand(0), 'calm');
  assert.equal(tensionBand(60), 'uneasy');
  assert.equal(tensionBand(100), 'crisis');
  assert.deepEqual(tensionMix(-5), tensionMix(0));
  assert.deepEqual(tensionMix(NaN), tensionMix(0));
});

test('zones: camp beds, Shell interior, zoneAt from layout positions', () => {
  assert.equal(zoneMix('sol').bed, 'amb_camp_sol');
  assert.equal(zoneMix('camp:iney').bed, 'amb_camp_iney');
  assert.equal(zoneMix('shell').bed, 'amb_shell_inside');
  assert.equal(zoneMix('nonsense').zone, 'plaza');
  for (const c of CAMPS) assert.equal(zoneAt(c.position), c.id);
  assert.equal(zoneAt([0, 0, 0]), 'plaza');
  assert.equal(zoneAt(SPAWN), 'balcony');
  for (const z of ['plaza', 'balcony', 'bridge', 'shell', ...CAMPS.map((c) => c.id)]) {
    const b = zoneMix(z).bed; if (b) assert.ok(AUDIO_MANIFEST.sounds[b], b);
  }
});

test('variants never repeat back to back; guest plan tracks stroke durations', () => {
  let last = null; let seq = 0.1;
  const rng = () => { seq = (seq * 9301 + 0.49297) % 1; return seq; };
  for (let i = 0; i < 50; i++) { const v = resolveSound(AUDIO_MANIFEST, 'step_stone', rng, last); assert.notEqual(v, last); last = v; }
  assert.equal(resolveSound(AUDIO_MANIFEST, 'gift_chime'), 'gift_chime');
  assert.equal(resolveSound(AUDIO_MANIFEST, 'nope'), null);
  const plan = guestPlan(AUDIO_MANIFEST, [{ stroke: 'arc', dur: 3.2 }, 'drop', 'bogus', { stroke: 'spike', dur: 0.1 }]);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].rate, 0.6);
  assert.equal(plan[1].at, 3.2);
  assert.equal(plan[1].rate, 1);
  assert.equal(plan[2].rate, 1.6);
});

test('volumes persist and sanitize; listener pose from a camera matrix', () => {
  const st = memoryStorage();
  assert.deepEqual(loadVolumes(st), DEFAULT_VOLUMES);
  saveVolumes(st, { master: 2, music: -1, sfx: 'x' });
  assert.deepEqual(JSON.parse(st.getItem(VOLUME_KEY)), { master: 1, music: 0, sfx: DEFAULT_VOLUMES.sfx });
  st.setItem(VOLUME_KEY, '{broken');
  assert.deepEqual(loadVolumes(st), DEFAULT_VOLUMES);
  assert.deepEqual(sanitizeVolumes(null), DEFAULT_VOLUMES);
  const cam = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1] } };
  assert.deepEqual(listenerPose(cam), { pos: [3, 4, 5], forward: [-0, -0, -1], up: [0, 1, 0] });
  assert.deepEqual(listenerPose(cam, { x: 1, y: 0, z: 2 }).pos, [1, 0, 2]);
});

// ---- fake WebAudio ----------------------------------------------------------------------------
class Param { constructor(v = 0) { this.value = v; } setTargetAtTime(v) { this.value = v; } cancelScheduledValues() {} setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } }
class Node { connect(n) { this.out = n; return n; } disconnect() { this.out = null; } }
class FakeCtx {
  constructor() { this.currentTime = 0; this.destination = new Node(); this.sources = []; this.panners = []; this.listener = {}; for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) this.listener[k] = new Param(); FakeCtx.last = this; }
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createDynamicsCompressor() { const n = new Node(); for (const k of ['threshold', 'ratio', 'attack', 'release']) n[k] = new Param(); return n; }
  createPanner() { const n = new Node(); n.positionX = new Param(); n.positionY = new Param(); n.positionZ = new Param(); this.panners.push(n); return n; }
  createBufferSource() { const n = new Node(); n.playbackRate = new Param(1); n.start = () => { n.started = true; }; n.stop = () => { n.onended?.(); }; this.sources.push(n); return n; }
  decodeAudioData() { return Promise.resolve({ duration: 99, length: 99 * 48000 }); }
  resume() { return Promise.resolve(); } suspend() {} close() {}
}
const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const flush = () => new Promise((r) => setTimeout(r, 5));

test('runtime: unlock, spatial play, ducking, zones, tension and persisted volumes', async () => {
  const storage = memoryStorage();
  const a = createAudio({ AudioContextClass: FakeCtx, fetch: fakeFetch, storage, base: '/x/' });
  assert.equal(a.play('ui_click').playing, false, 'no sound before unlock');
  const hum = a.play('amb_shell_hum', { pos: [0, 20, 50], loop: true });
  a.setZone('sol');
  await a.unlock();
  await flush();
  const ctx = FakeCtx.last;
  assert.equal(ctx.panners[0].panningModel, 'HRTF');
  assert.equal(ctx.panners[0].positionZ.value, 50);
  assert.ok(hum.inner, 'queued loop started on unlock');
  assert.equal(a.state.bed, 'amb_camp_sol');
  const loops = ctx.sources.filter((s) => s.loop);
  assert.ok(loops.length >= 6, 'wind, bed, hum and three music stems loop');
  a.setTension(100);
  assert.equal(a._music().crisis.gain.gain.value, 1);
  assert.equal(a._music().calm.gain.gain.value, 0);
  const v = a.play('guest_arc', { pos: [1, 2, 3] });
  await flush();
  assert.ok(a.state.ducked);
  assert.ok(a._nodes().musicDuck.gain.value < 0.5);
  v.stop(0);
  assert.equal(a.state.ducked, false);
  assert.equal(a._nodes().musicDuck.gain.value, 1);
  a.setZone('shell');
  assert.equal(a.state.bed, 'amb_shell_inside');
  a.setListener({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1] } });
  assert.equal(ctx.listener.positionX.value, 7);
  a.setVolume('music', 0.5);
  assert.equal(a._nodes().music.gain.value, 0.25);
  const b = createAudio({ AudioContextClass: FakeCtx, fetch: fakeFetch, storage });
  assert.equal(b.getVolumes().music, 0.5);
  assert.equal(a.speakStrokes(['arc', 'loop']).length, 2);
  a.dispose();
  assert.equal(a.state.unlocked, false);
});
