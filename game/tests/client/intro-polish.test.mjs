// The intro's hold on the town (QA pass 2 #1, #5, #6): while the intro runs, E and the movement keys never reach the
// town under its windows, the HUD steps aside and the townsfolk's barks wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTRO_HIDDEN, INTRO_CLASS, introHudCss, setIntroHud } from '../../src/ui/intro-hud.js';

const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');

test('the sprint ctx gives the intro lockControls, and the lock holds every town key (E opened the Courier panel under the card)', () => {
  assert.match(src, /mountSprint\(\{ lockControls: \(on\) => \{ npeLocked = !!on;/);
  const handle = src.slice(src.indexOf('function handleInput(dt)'), src.indexOf('function handleInput(dt)') + 2500);
  const lock = handle.indexOf('if (npeLocked) return false;'), e = handle.indexOf("input.hit('KeyE')");
  assert.ok(lock > 0 && e > lock, 'the lock returns before E, the menu and the movement keys are read');
  assert.ok(handle.indexOf('if (pad.hit(PAD.menu)) { openMenu();') > lock, 'the gamepad menu waits too');
});

test('the intro hides the HUD (tracker, hotbar, minimap, prompt) and gives it back', () => {
  for (const s of ['#rpg-hud', '.ph', '.ftf-story-goal', '.ftf-town-prompt', '#prompt']) assert.ok(INTRO_HIDDEN.includes(s), s);
  assert.ok(!INTRO_HIDDEN.some((s) => s.includes('npe')), 'the intro\'s own elements stay');
  const css = introHudCss();
  assert.match(css, /body\.npe-intro-on #rpg-hud/);
  assert.match(css, /visibility: hidden !important/);
  const classes = new Set(); const styles = [];
  const doc = { body: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } }, head: { append: (s) => styles.push(s) }, getElementById: (id) => styles.find((s) => s.id === id) || null, createElement: () => ({}) };
  setIntroHud(doc, true); setIntroHud(doc, true);
  assert.ok(classes.has(INTRO_CLASS)); assert.equal(styles.length, 1, 'the stylesheet goes in once');
  setIntroHud(doc, false);
  assert.ok(!classes.has(INTRO_CLASS));
  assert.match(src, /setIntroHud\(document, npeLocked\)/);
});

test('the townsfolk barks wait while the intro runs', () => {
  assert.match(src, /townBarks\.update\(player\.pos, !npeLocked && /);
});

test('a failed intro never leaves the town locked: the lock ends with the intro\'s turn in the onboarding queue', () => {
  assert.match(src, /onOnboarding\(\(id\) => \{ if \(id !== 'intro' && npeLocked\) \{ npeLocked = false; setIntroHud\(document, false\); \} \}\);/);
});

test('Iris\'s voice lines play: every voiced prologue cue names a shipped line, and the intro plays it on the cue (QA pass 2 #7)', async () => {
  const { VOICE_LINES, voiceId } = await import('../../src/npe/voice.js');
  const shots = readFileSync(new URL('../../src/cinematic/prologue/shots.js', import.meta.url), 'utf8');
  const keys = [...shots.matchAll(/voice: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 1, 'the prologue has voiced cues');
  for (const k of keys) assert.ok(VOICE_LINES[voiceId(k)], `${k} is a shipped voice line`);
  assert.equal(voiceId('voice_iris_oh_no'), 'iris_oh_no', 'the audio manifest prefix is tolerated');
  const { installDom } = await import('../lib/mini-dom.mjs');
  const { memoryStorage } = await import('../../src/ui/storage.js');
  const dom = () => { const { doc } = installDom(); doc.getElementById = doc.getElementById || (() => null); doc.addEventListener = doc.addEventListener || (() => {}); doc.removeEventListener = doc.removeEventListener || (() => {}); return doc; };
  const tick = (n = 1) => new Promise((r) => { let k = n; const go = () => (--k <= 0 ? r() : setTimeout(go, 0)); setTimeout(go, 0); });
  const handlers = new Map(); const played = [];
  const bus = { emit: () => {}, on: (n, fn) => { handlers.set(n, fn); return () => handlers.delete(n); } };
  const { runIntro } = await import('../../src/npe/index.js');
  const run = runIntro({ doc: dom(), t: (k) => k, storage: memoryStorage(), toast: () => {}, bus, reduced: () => true, search: '', voice: { play: (id) => { played.push(id); return Promise.resolve('file'); } },
    prologue: { playLabPrologue: async () => { handlers.get('prologue.cue')({ id: 'oh_no', speaker: 'Iris', text: 'Oh no...', durMs: 1400, voice: 'iris_oh_no' }); handlers.get('prologue.cue')({ id: 'x', text: 'no voice' }); return 'done'; }, playWakeUp: async () => {} } });
  await tick(3);
  assert.deepEqual(played, ['iris_oh_no']);
  run.skip(); await tick(3); run.skip(); await tick(3); run.skip();
});

test('the wake-up crowd stays through the whole first talk and leaves with the intro (QA pass 2 #3)', () => {
  const pro = readFileSync(new URL('../../src/cinematic/prologue/index.js', import.meta.url), 'utf8');
  const keep = pro.slice(pro.indexOf('function keepRing(ring)'), pro.indexOf('async function playWakeUp'));
  assert.doesNotMatch(keep, /setTimeout\(stop, 120000\)/, 'no two-minute timer: 19 lines take a reader longer than that');
  assert.match(pro, /export const RING_SAFETY_MS = 15 \* 60 \* 1000;/);
  assert.match(keep, /\['npe\.completed', 'npe\.skipped'\]\.map\(\(n\) => ctx\.bus\.on\(n, stop\)\)/);
  assert.match(keep, /onOnboarding\(\(id\) => \{ if \(id !== 'intro'\) stop\(\); \}\)/, 'and when the intro\'s turn ends whatever happened');
  assert.match(keep, /if \(stopped\) return; stopped = true;/, 'stopping twice is harmless');
});

test('the prologue\'s walk to the device (P7) frames Iris whole from eye level, never from under her arms (QA pass 2 #4)', async () => {
  const { cameraAt, irisAt, SHOTS } = await import('../../src/cinematic/prologue/shots.js');
  const p7 = SHOTS.find((s) => s.id === 'P7');
  assert.ok(p7.p0[1] >= 1.4 && p7.p1[1] >= 1.4, 'eye level, not a low angle');
  for (let t = p7.t0; t < p7.t1; t += 0.05) {
    const c = cameraAt(t), i = irisAt(t);
    const I = [i.x - c.pos[0], 1.1 - c.pos[1], i.z - c.pos[2]], L = c.look.map((v, k) => v - c.pos[k]);
    assert.ok(Math.hypot(I[0], I[2]) >= 2.5, `at ${t.toFixed(2)} s she is ${Math.hypot(I[0], I[2]).toFixed(2)} m from the lens`);
    const ang = Math.acos((L[0] * I[0] + L[1] * I[1] + L[2] * I[2]) / Math.hypot(...L) / Math.hypot(...I)) * 180 / Math.PI;
    assert.ok(ang < 25, `at ${t.toFixed(2)} s she is ${ang.toFixed(1)}° off the centre of the frame`);
  }
});
