// The pure parts of the chapter film player (src/cinematic/chapters/): the film timeline, the shot
// cameras compiled through the trailer's camera module (never under the ground, continuous, the still
// variants really still), the runtime camera resolvers for Iris and the Shell interior, and the letterbox.
// The DOM overlay and the Chronicle menu are checked in headless Chromium (docs/chapters.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { buildFilm, TITLE_SECONDS, CARD_SECONDS, SHOT_SECONDS, CHAPTER_IDS } from '../../src/play/chapters.js';
import { timeline, shotAt } from '../../src/cinematic/chapters/player.js';
import { specFor, irisCamera, interiorCamera, compileShotCamera } from '../../src/cinematic/chapters/shot-camera.js';
import { letterboxFraction } from '../../src/cinematic/chapters/overlay.js';
import { minHeight, maxStep } from '../../src/cinematic/camera.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const resolve = { iris: () => ({ position: [-22.3, 0, 38.6], heading: Math.PI }), interior: () => ({ spawn: [0, 300, 4.5], glass: [0, 305, -5.8] }) };

test('film timeline: the title overlaps the first shot, the card follows the last, the clock covers the film', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const film = buildFilm('arrival', { obs: s.obs });
  const tl = timeline(film);
  assert.equal(tl.shots.length, 5);
  assert.equal(tl.shots[0].start, 0);
  assert.equal(tl.shots[0].end, TITLE_SECONDS + SHOT_SECONDS);
  assert.equal(tl.shots[4].end, tl.cardStart);
  assert.equal(tl.end, tl.cardStart + CARD_SECONDS);
  assert.equal(Math.round(tl.end), film.seconds);
  assert.equal(shotAt(tl, -1), 0);
  assert.equal(shotAt(tl, 1), 0);
  assert.equal(shotAt(tl, tl.shots[1].start + 0.01), 1);
  assert.equal(shotAt(tl, tl.cardStart + 2), 4, 'the last shot keeps running under the card');
  assert.equal(shotAt(tl, 1e9), 4);
  s.dispose();
});

test('shot cameras: every shot of every film compiles, stays above the ground and moves smoothly', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  for (let i = 0; i < 13; i++) await s.send('end_tick', {});
  for (const id of CHAPTER_IDS) {
    const obs = id === 'ending' ? { ...s.obs, season: { ...s.obs.season, phase: 'end', outcome: 'gift', votes: [] } } : s.obs;
    for (const profile of ['full', 'cheap']) {
      const film = buildFilm(id, { obs, profile });
      for (const sh of film.shots) {
        const pose = compileShotCamera(sh.cam, resolve);
        assert.ok(typeof pose === 'function', `${id}/${sh.id} compiles`);
        const a = pose(0), b = pose(1);
        assert.ok(minHeight(pose) > 0.8, `${id}/${sh.id} (${profile}) stays above the walkable tops: ${minHeight(pose).toFixed(2)} m`);
        assert.ok(maxStep(pose) < 0.6, `${id}/${sh.id} (${profile}) moves smoothly (max step ${maxStep(pose).toFixed(2)} m per 1/240)`);
        assert.ok(a.fov > 20 && a.fov < 70 && b.fov > 20 && b.fov < 70);
        const far = Math.hypot(a.pos[0] - a.look[0], a.pos[1] - a.look[1], a.pos[2] - a.look[2]);
        assert.ok(far > 1.5 && far < 200, `${id}/${sh.id} looks at something ${far.toFixed(1)} m away`);
        if (profile === 'cheap') {
          const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
          assert.ok(d < 0.4, `${id}/${sh.id} cheap shot only breathes (${d.toFixed(2)} m)`);
        }
      }
    }
  }
  s.dispose();
});

test('shot cameras: reduced motion freezes still shots completely; full shots start and end at the script poses', () => {
  const still = { kind: 'path', from: { pos: [3, 4, 5], look: [0, 1, 0], fov: 40 }, to: { pos: [3, 4, 5], look: [0, 1, 0], fov: 40 }, still: true };
  const frozen = compileShotCamera(still, resolve, { frozen: true });
  assert.deepEqual(frozen(0).pos, [3, 4, 5]); assert.deepEqual(frozen(0.5).pos, [3, 4, 5]); assert.deepEqual(frozen(1).pos, [3, 4, 5]);
  const breathing = compileShotCamera(still, resolve);
  assert.ok(Math.hypot(...breathing(0.25).pos.map((v, i) => v - [3, 4, 5][i])) > 0.01 && Math.hypot(...breathing(0.25).pos.map((v, i) => v - [3, 4, 5][i])) < 0.2, 'a still shot breathes a little');
  const move = { kind: 'path', from: { pos: [10, 5, 10], look: [0, 1, 0], fov: 38 }, to: { pos: [6, 4, 7], look: [0, 1.5, 0], fov: 36 } };
  const spec = specFor(move);
  assert.equal(spec.type, 'dolly');
  const pose = compileShotCamera(move, resolve);
  assert.deepEqual(pose(0).pos.map((v) => +v.toFixed(3)), [10, 5, 10]);
  assert.deepEqual(pose(1).pos.map((v) => +v.toFixed(3)), [6, 4, 7]);
  assert.deepEqual(pose(1).look.map((v) => +v.toFixed(3)), [0, 1.5, 0]);
  assert.equal(pose(1).fov, 36);
});

test('runtime cameras: Iris is framed from the front at head height; the interior looks from the entrance to the glass', () => {
  const cam = irisCamera({ kind: 'iris', dist: 6.5, toDist: 4.3, height: 2.3, yaw: 0 }, { position: [0, 0, 0], heading: 0 });
  assert.deepEqual(cam.from.pos.map((v) => +v.toFixed(3)), [0, 2.3, 6.5], 'heading 0 faces +Z: the camera stands in front');
  assert.deepEqual(cam.from.look, [0, 1.35, 0]);
  assert.ok(Math.hypot(cam.to.pos[0], cam.to.pos[2]) < Math.hypot(cam.from.pos[0], cam.from.pos[2]), 'dolly in');
  const turned = irisCamera({ kind: 'iris', dist: 6.5, toDist: 4.3, height: 2.3, yaw: 0 }, { position: [0, 0, 0], heading: Math.PI / 2 });
  assert.ok(turned.from.pos[0] > 6 && Math.abs(turned.from.pos[2]) < 1e-9, 'the camera follows the facing');
  const inside = interiorCamera({ kind: 'interior', shell: 2 }, resolve.interior(2));
  assert.ok(inside.from.pos[1] > 300 && inside.from.pos[2] > 0 && inside.from.look[2] < 0, 'inside the Shell volume, looking toward the glass');
  assert.ok(inside.to.pos[2] < inside.from.pos[2], 'moves toward the glass');
});

test('letterbox: cinema bars on landscape screens, fixed bands in portrait', () => {
  assert.ok(Math.abs(letterboxFraction(1280, 800, 2.2) - 0.136) < 0.01);
  assert.ok(Math.abs(letterboxFraction(1920, 1080, 2.2) - 0.096) < 0.01);
  assert.equal(letterboxFraction(2400, 1000, 2.2), 0, 'wider than the ratio: no bars');
  assert.equal(letterboxFraction(390, 844), 0.085);
  assert.equal(letterboxFraction(0, 0), 0);
});

test('overlay motion follows the motion design system tokens; reduced motion is a short cross-fade without rise', async () => {
  const { filmMotion } = await import('../../src/cinematic/chapters/overlay.js');
  const { MOTION } = await import('../../src/ui/motion/index.js');
  const o = { enter: MOTION.duration.base, exit: MOTION.duration.fast };
  assert.deepEqual(filmMotion(0.9, 1, 5, o), { opacity: 0, y: MOTION.distance.rise }, 'hidden before its time, waiting 12 px below');
  const early = filmMotion(1 + 0.05, 1, 5, o);
  assert.ok(early.opacity > 0.4 && early.opacity < 1 && early.y > 0 && early.y < MOTION.distance.rise, 'rising in with the expo-out ease');
  assert.deepEqual(filmMotion(1 + MOTION.duration.base / 1000, 1, 5, o), { opacity: 1, y: 0 }, 'at rest after the base duration');
  assert.deepEqual(filmMotion(3, 1, 5, o), { opacity: 1, y: 0 });
  const leaving = filmMotion(5 - 0.06, 1, 5, o);
  assert.ok(leaving.opacity > 0 && leaving.opacity < 1 && leaving.y === 0, 'exits fade in place over the fast duration');
  assert.equal(filmMotion(5, 1, 5, o).opacity, 0);
  assert.deepEqual(filmMotion(1.02, 1, 5, { ...o, delay: 40 }), { opacity: 0, y: MOTION.distance.rise }, 'a staggered sibling waits its 40 ms');
  const r = filmMotion(1 + MOTION.duration.reduced / 2000, 1, 5, { ...o, reduced: true });
  assert.ok(r.opacity > 0.5 && r.opacity < 1 && r.y === 0, 'reduced motion: a 160 ms fade, no movement');
  assert.deepEqual(filmMotion(1 + MOTION.duration.reduced / 1000, 1, 5, { ...o, reduced: true }), { opacity: 1, y: 0 });
});

test('tap to cut: nextStop walks shot by shot to the final card, then ends the film', async () => {
  const { nextStop } = await import('../../src/cinematic/chapters/player.js');
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const tl = timeline(buildFilm('arrival', { obs: s.obs }));
  assert.equal(nextStop(tl, 0), tl.shots[1].start, 'during the title a tap goes to the second shot');
  assert.equal(nextStop(tl, tl.shots[1].start), tl.shots[2].start, 'at a shot start it goes to the following shot');
  assert.equal(nextStop(tl, tl.shots[4].start + 0.5), tl.cardStart, 'after the last shot comes the card');
  assert.equal(nextStop(tl, tl.cardStart), null, 'on the card a tap ends the film');
  s.dispose();
});

test('film player: quick taps click through every shot and the card; a long hold still skips', async () => {
  const THREE = await import('three');
  const { createFilmPlayer, TAP_MAX_MS } = await import('../../src/cinematic/chapters/player.js');
  const { SKIP_HOLD_MS } = await import('../../src/play/chapters.js');
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const film = buildFilm('arrival', { obs: s.obs });
  const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: (k) => { delete listeners[k]; } };
  const ev = (extra = {}) => ({ preventDefault() {}, stopImmediatePropagation() {}, ...extra });
  let clock = 0;
  const hints = [];
  const overlay = { show() {}, hide() {}, setSubtitle() {}, setSkipText() {}, setHintText() {}, showSkip() {}, showHint: (t) => hints.push(t), update() {} };
  const shell = { active: false, origin: [0, 300, 0], root: new THREE.Object3D(), activate() { this.active = true; }, deactivate() { this.active = false; }, spawn: () => ({ pos: [0, 300, 4.5] }), setSign() {} };
  const mk = () => createFilmPlayer({ camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000), player: { pos: [0, 0, 0], heading: 0 }, avatar: new THREE.Object3D(), shell, agents: null, overlay, now: () => 0, renderLine: () => 'line', win, wall: () => clock });
  const fp = mk();
  const done = fp.play(film);
  assert.ok(hints.length >= 1, 'the tap/hold hint is scheduled when a film starts');
  const tap = (kind) => {
    if (kind === 'key') { listeners.keydown(ev({ code: 'Space' })); clock += TAP_MAX_MS - 100; listeners.keyup?.(ev({ code: 'Space' })); }
    else { listeners.pointerdown(ev()); clock += TAP_MAX_MS - 100; listeners.pointerup?.(ev()); }
  };
  for (let i = 1; i < film.shots.length; i++) { tap(i % 2 ? 'pointer' : 'key'); assert.equal(fp.shotIndex, i, `tap ${i} cuts to shot ${i}`); }
  tap('pointer');
  assert.equal(fp.time, fp.timeline().cardStart, 'the tap after the last shot goes to the card');
  assert.ok(fp.playing);
  tap('key');
  assert.deepEqual(await done, { skipped: false }, 'a tap on the card ends the film');
  assert.equal(listeners.keydown, undefined, 'input listeners are released');

  const fp2 = mk();
  const done2 = fp2.play(film);
  listeners.pointerdown(ev()); clock += SKIP_HOLD_MS + 5; fp2.update(1 / 60);
  assert.deepEqual(await done2, { skipped: true }, 'holding still skips the whole film');
  const fp3 = mk();
  const done3 = fp3.play(film);
  listeners.keydown(ev({ code: 'KeyA' })); clock += (TAP_MAX_MS + SKIP_HOLD_MS) / 2; listeners.keyup(ev({ code: 'KeyA' }));
  assert.equal(fp3.shotIndex, 0, 'an abandoned hold (between a tap and a skip) does not cut');
  fp3.skip(); await done3;
  s.dispose();
});

test('instant skips (owner, 12.11): the interior and every program are made ready at the start, a cut loads nothing', async () => {
  const THREE = await import('three');
  const { createFilmPlayer } = await import('../../src/cinematic/chapters/player.js');
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  // a film with an interior shot, whichever chapter has one
  const film = CHAPTER_IDS.map((id) => buildFilm(id, { obs: s.obs })).find((f) => f && f.shots.some((x) => x.cam.kind === 'interior'));
  assert.ok(film, 'some chapter has an interior shot');
  const win = { addEventListener() {}, removeEventListener() {} };
  const overlay = { show() {}, hide() {}, setSubtitle() {}, setSkipText() {}, setHintText() {}, showSkip() {}, showHint() {}, update() {} };
  const log = [];
  const shell = { active: false, origin: [0, 300, 0], root: new THREE.Object3D(), activate(n) { this.active = true; log.push('activate:' + n); }, deactivate() { this.active = false; log.push('deactivate'); }, spawn: () => ({ pos: [0, 300, 4.5] }), setSign() {} };
  const fp = createFilmPlayer({ camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000), player: { pos: [0, 0, 0], heading: 0 }, avatar: new THREE.Object3D(), shell, agents: null, overlay, now: () => 0, renderLine: () => 'line', win, prewarm: () => log.push('prewarm') });
  const done = fp.play(film);
  assert.deepEqual(log.slice(0, 3), ['prewarm', log[1], 'prewarm'], 'warmed without the interior lights, then with them'); assert.match(log[1], /^activate:/);
  assert.equal(log.filter((x) => x === 'prewarm').length, 2);
  for (let i = 0; i < film.shots.length + 1 && fp.playing; i++) fp.next();
  assert.equal(log.filter((x) => x.startsWith('activate')).length, 1, 'no cut activates anything again');
  fp.skip(); await done;
  assert.deepEqual(log.slice(-2), ['deactivate', 'prewarm'], 'the Shell interior is put away after the film, and the world warmed again in its own lights');
  s.dispose();
});

test('warmScene: forced compile without the parallel-compile extension, textures uploaded', async () => {
  const THREE = await import('three');
  const { GpuWarmup } = await import('../../src/render/warmup.js');
  const scene = new THREE.Scene(); const tex = new THREE.Texture({ width: 4, height: 4 });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex })));
  const calls = [];
  const renderer = { extensions: { has: () => false }, compileAsync: () => Promise.resolve(), compile: (root) => calls.push(['compile', root === scene]), initTexture: (t) => calls.push(['tex', t === tex]), getRenderTarget: () => null, setRenderTarget() {} };
  const w = new GpuWarmup({ renderer, camera: new THREE.PerspectiveCamera(), scene });
  await w.warmAll();
  assert.deepEqual(calls, [['tex', true], ['compile', true]]);
  calls.length = 0; await w.compile(scene); assert.deepEqual(calls, [], 'an ordinary model warm-up still leaves it to the first draw');
});

test('streaming is held during a film: the shots’ views are prefetched and nothing leaves until it ends', async () => {
  // render/assets.js pulls a Vite virtual module, so it is checked by source here and in the built page (skip probe)
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/render/assets.js', import.meta.url), 'utf8');
  assert.match(src, /export function holdStreaming\(on\) \{\n  holds = Math\.max\(0, holds \+ \(on \? 1 : -1\)\);/);
  assert.match(src, /if \(!holds\) for \(const s of streamers\) s\.viewPins\.clear\(\);/, 'the film over, its views are no longer pinned');
  assert.match(src, /if \(holds > 0\) return; \/\/ a cutscene plays/, 'releases, evictions and swaps wait while held');
  assert.match(src, /this\.viewPins\.has\(name\) \? VIEW_PIN : null/, 'a coming shot’s assets are wanted');
  const idx = fs.readFileSync(new URL('../../src/cinematic/chapters/index.js', import.meta.url), 'utf8');
  assert.match(idx, /holdStreaming\(true\); forceWarmCompile\(true\);[^\n]*\n    let result;\n    try \{ result = await filmPlayer\.play\(film, \{ paused: stills \}\); \} finally \{ holdStreaming\(false\); forceWarmCompile\(false\); \}/);
});
