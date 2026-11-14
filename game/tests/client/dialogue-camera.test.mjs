// The wake-up dialogue's camera beats (QA pass 2 #2): every cue in the script has a shot, the camera glides between
// beats without a jump, comes back to Iris at the player's own zoom, and cuts under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CUE_SHOTS, cueShot, cueState, stepCue } from '../../src/render/dialogue-camera.js';
import { WAKEUP } from '../../src/npe/dialogue-script.js';

const AT = { iris: [0, 10, 0], portal: [4.4, 10, 24.8], board: [-4, 10, 22.5], elder: [6, 10, -3] };
const FOCUS = [0, 11.1, 0];

test('every camera cue in the wake-up script has a shot, and each shot finds its subject', () => {
  const cues = WAKEUP.filter((l) => l.camera).map((l) => l.camera);
  assert.ok(cues.length >= 5, 'the script carries its beats');
  for (const c of cues) { assert.ok(CUE_SHOTS[c], `shot for ${c}`); assert.ok(cueShot(c, AT), `subject for ${c}`); }
  assert.equal(cueShot(null, AT), null);
  assert.equal(cueShot('nope', AT), null);
  assert.equal(cueShot('elder', { ...AT, elder: null }), null, 'no Elder in the scene: the camera stays on Iris');
  for (const s of Object.values(CUE_SHOTS)) assert.ok(s.dist >= 4.5, 'never closer than the rig allows (no first person)');
});

test('a beat leans the camera toward its subject, then eases back to the player\'s own zoom', () => {
  const st = cueState(); const dt = 1 / 60;
  assert.equal(stepCue(st, null, FOCUS, 30, dt), false, 'nothing happens without a cue');
  const shot = cueShot('gate_loom', AT);
  for (let i = 0; i < 120; i++) assert.equal(stepCue(st, shot, FOCUS, 30, dt), true);
  const want = FOCUS.map((v, k) => v + (shot.point[k] - v) * shot.pull);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(st.focus[k] - want[k]) < 0.05, 'settled on the Gate-Loom');
  assert.ok(Math.abs(st.dist - 11) < 0.05);
  let frames = 0;
  while (stepCue(st, null, FOCUS, 999, dt)) { frames++; assert.ok(frames < 300, 'it comes back'); }
  assert.equal(st.dist, 30, 'the player\'s zoom from before the first beat, not the value passed meanwhile');
  assert.equal(st.active, false);
});

test('one beat glides into the next: the focus moves without a jump and without a jolt', () => {
  const st = cueState(); const dt = 1 / 60;
  let prev = null, prevStep = 0, worst = 0, jolt = 0;
  const run = (name, n) => { for (let i = 0; i < n; i++) { stepCue(st, cueShot(name, AT), FOCUS, 30, dt); if (prev) { const d = Math.hypot(st.focus[0] - prev[0], st.focus[1] - prev[1], st.focus[2] - prev[2]); worst = Math.max(worst, d); jolt = Math.max(jolt, Math.abs(d - prevStep)); prevStep = d; } prev = [...st.focus]; } };
  run('gate_loom', 60); run('iris_badge', 60); run('elder', 60); run('shell', 60); run(null, 200);
  assert.ok(worst < 1, `largest per-frame focus step ${worst.toFixed(3)} m (the rig snaps beyond 6 m)`);
  assert.ok(jolt < 0.2, `largest change of the per-frame step ${jolt.toFixed(3)} m: the glide starts and stops softly`);
});

test('reduced motion cuts straight to the beat and straight back', () => {
  const st = cueState(); const shot = cueShot('elder', AT);
  stepCue(st, shot, FOCUS, 20, 1 / 60, true);
  assert.ok(Math.abs(st.dist - 8) < 1e-9);
  assert.equal(stepCue(st, null, FOCUS, 20, 1 / 60, true), false);
  assert.equal(st.dist, 20);
});

test('boot-world follows the intro\'s camera cues from the bus', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /onBus\('npe\.camera'/);
  assert.match(src, /stepCue\(st, cueShot\(dialogueCue\.name \|\| \(speakerAt \? 'speaker' : null\), at\)/);
  assert.match(src, /wakeRing\.at\(dialogueCue\.speaker\)/, 'a line with no beat finds its speaker in the wake-up ring');
});

test('every speaker of the wake-up talk stands in the ring, on the far side from the camera; their line leans the camera to them (QA 14.11 P1-3)', async () => {
  const { RING, ringPlaces, speakerSpot } = await import('../../src/cinematic/prologue/townsfolk-ring.js');
  const places = ringPlaces(RING.people.length);
  for (const sp of new Set(WAKEUP.map((l) => l.speaker).filter((s) => s !== 'iris'))) {
    const i = RING.people.findIndex((p) => p.speaker === sp); assert.ok(i >= 0, `${sp} is in the ring`);
    assert.ok(Math.abs(Math.atan2(places[i].x, places[i].z)) < 2.0, `${sp} faces the camera across her`);
  }
  assert.equal(speakerSpot('iris', [0, 0, 0]), null); assert.equal(speakerSpot('nobody', [0, 0, 0]), null);
  // the world spot follows the ring's centre and heading (three.js Y rotation)
  const i = RING.people.findIndex((p) => p.speaker === 'elder'), p = places[i];
  assert.deepEqual(speakerSpot('elder', [10, 2, 5], 0).map((v) => +v.toFixed(6)), [10 + p.x, 2, 5 + p.z].map((v) => +v.toFixed(6)));
  const h = Math.PI / 2, r = speakerSpot('elder', [0, 0, 0], h);
  assert.ok(Math.abs(r[0] - p.z) < 1e-9 && Math.abs(r[2] + p.x) < 1e-9);
  const shot = cueShot('speaker', { ...AT, speaker: [1, 10, 2] });
  assert.ok(shot && shot.dist >= 4.5 && shot.pull < 0.75, 'a gentle lean: Iris stays in frame');
  assert.equal(cueShot('speaker', AT), null, 'nobody in the ring: the camera stays on Iris');
});
