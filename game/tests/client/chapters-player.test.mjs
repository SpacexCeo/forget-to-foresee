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
