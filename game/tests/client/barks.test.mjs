// Townsfolk barks (feature 7): the pure line chooser and the bubble lifecycle in the mini DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { barkCandidates, chooseBark, hourClass, BARK, ROLE_LINES } from '../../src/scenes/barks.js';
import en from '../../src/play/locales/en.js';
import ru from '../../src/play/locales/ru.js';
import uk from '../../src/play/locales/uk.js';
import it from '../../src/play/locales/it.js';
import zh from '../../src/play/locales/zh.js';

test('hour classes: dawn, night (twilight too) and day', () => {
  assert.equal(hourClass('dawn'), 'dawn');
  assert.equal(hourClass('twilight'), 'night');
  assert.equal(hourClass('night'), 'night');
  assert.equal(hourClass('evening'), 'day');
  assert.equal(hourClass(undefined), 'day');
});

test('a hired person talks about the trade, whatever the hour or weather', () => {
  assert.deepEqual(barkCandidates({ key: 'baker', hour: 'night', rain: 1, hired: true }), ['bark.hired.1', 'bark.hired.2']);
});

test('rain, then the hour, then the role; the general lines only when nothing else fits', () => {
  const c = barkCandidates({ key: 'baker', hour: 'night', rain: 0.8 });
  assert.deepEqual(c, ['bark.rain.1', 'bark.rain.2', 'bark.night.1', 'bark.night.2', 'bark.role.baker']);
  assert.deepEqual(barkCandidates({ key: 'child_b', hour: 'evening' }), ['bark.role.child']);
  assert.deepEqual(barkCandidates({ key: 'courier', hour: 'evening' }), ['bark.day.1', 'bark.day.2', 'bark.day.3', 'bark.day.4']);
});

test('the n-th bark walks through the candidates', () => {
  const o = { key: 'courier' };
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => chooseBark(o, n)), ['bark.day.1', 'bark.day.2', 'bark.day.3', 'bark.day.4', 'bark.day.1']);
});

test('every bark key exists in all five locales', () => {
  const keys = new Set(['bark.hired.1', 'bark.hired.2', 'bark.rain.1', 'bark.rain.2', 'bark.night.1', 'bark.night.2', 'bark.dawn.1', 'bark.dawn.2',
    'bark.day.1', 'bark.day.2', 'bark.day.3', 'bark.day.4', ...ROLE_LINES.map((r) => 'bark.role.' + r)]);
  for (const [name, m] of Object.entries({ en, ru, uk, it, zh })) for (const k of keys) assert.ok(typeof m[k] === 'string' && m[k].length > 0, `${name} ${k}`);
});

test('the bubble: one bark when Iris passes, gone after its time, a cooldown per person, hidden when disabled', async () => {
  installDom();
  const { createBarks } = await import('../../src/scenes/barks.js');
  const THREE = await import('three');
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 500); camera.position.set(0, 5, 12); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  let t = 100;
  const folk = [{ key: 'baker', pos: [2, 0, 0] }, { key: 'guard', pos: [40, 0, 0] }];
  const b = createBarks({ camera, i18n: { t: (k) => en[k] || k }, people: () => folk, hour: () => 'evening', now: () => t });
  b.update([20, 0, 0]); assert.equal(b.current, null, 'nobody within reach');
  b.update([0, 0, 0]);
  assert.equal(b.current.key, 'baker'); assert.equal(b.current.line, 'bark.role.baker');
  assert.equal(b.el.hidden, false); assert.equal(b.el.style.opacity, '1');
  t += BARK.show + 0.1; b.update([0, 0, 0]); assert.equal(b.current, null, 'gone after its time');
  t += BARK.gap; b.update([0, 0, 0]); assert.equal(b.current, null, 'the baker is cooling down');
  t += BARK.cooldown; b.update([0, 0, 0]); assert.equal(b.current.key, 'baker');
  b.update([0, 0, 0], false); assert.equal(b.current, null); assert.equal(b.el.hidden, true);
  b.dispose();
});
