// Photo mode (feature 9): toggling hides the overlays and widens the camera, the filters cycle and colour the canvas,
// a capture happens once, right after a frame, with the look applied; every label exists in five locales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { PHOTO_FILTERS, PHOTO_CAMERA, photoFileName } from '../../src/render/photo-mode.js';
import en from '../../src/play/locales/en.js';
import ru from '../../src/play/locales/ru.js';
import uk from '../../src/play/locales/uk.js';
import it from '../../src/play/locales/it.js';
import zh from '../../src/play/locales/zh.js';

test('file names sort by time', () => {
  assert.equal(photoFileName(new Date(2026, 10, 12, 3, 4, 5)), 'forget-to-foresee-20261112-030405.png');
});

test('three looks besides the natural one', () => {
  assert.equal(PHOTO_FILTERS.length, 4);
  assert.equal(PHOTO_FILTERS[0].css, 'none');
});

test('labels in all five locales', () => {
  const keys = ['photo.open', 'photo.title', 'photo.save', 'photo.saved', 'photo.exit', 'photo.hint', ...PHOTO_FILTERS.map((f) => 'photo.filter.' + f.id)];
  for (const [n, m] of Object.entries({ en, ru, uk, it, zh })) for (const k of keys) assert.ok(typeof m[k] === 'string' && m[k], `${n} ${k}`);
});

test('toggle, filters, camera limits and one capture', async () => {
  installDom();
  const { createPhotoMode } = await import('../../src/render/photo-mode.js');
  const doc = globalThis.document;
  const canvas = doc.createElement('canvas'); canvas.width = 64; canvas.height = 32; doc.body.append(canvas);
  const hud = doc.createElement('div'); doc.body.append(hud);
  const rig = { minDist: 6, maxDist: 24, minPitch: 0.3, dist: 12 };
  const changes = [];
  const saved = [];
  const pm = createPhotoMode({ canvas, i18n: { t: (k) => en[k] || k }, rig, onChange: (on) => changes.push(on), save: (b, n) => saved.push(n) });
  assert.equal(pm.on, false);
  pm.toggle();
  assert.equal(pm.on, true); assert.deepEqual(changes, [true]);
  assert.equal(hud.style.visibility, 'hidden', 'overlays hidden');
  assert.equal(pm.elements.bar.hidden, false);
  assert.equal(rig.minDist, PHOTO_CAMERA.minDist); assert.equal(rig.maxDist, PHOTO_CAMERA.maxDist);
  pm.setFilter(2); assert.equal(pm.filter, 'mono'); assert.equal(canvas.style.filter, PHOTO_FILTERS[2].css);
  pm.setFilter(5); assert.equal(pm.filter, 'film');
  assert.equal(pm.capture(), false, 'nothing asked');
  pm.requestCapture(); assert.equal(pm.pending, true);
  pm.capture(); assert.equal(pm.pending, false);
  pm.toggle(false);
  assert.ok(!hud.style.visibility, 'overlays back');
  assert.equal(canvas.style.filter, '');
  assert.deepEqual([rig.minDist, rig.maxDist, rig.minPitch], [6, 24, 0.3]);
  pm.requestCapture(); assert.equal(pm.pending, false, 'no capture outside photo mode');
  pm.dispose();
});
