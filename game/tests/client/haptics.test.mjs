// Haptics (src/audio/haptics.js): cues become short vibration and gamepad rumble, off by setting or reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics, hapticsOn, PATTERNS, HAPTICS_KEY } from '../../src/audio/haptics.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('cues vibrate the phone and rumble a gamepad; nothing for unknown cues', () => {
  const vib = [], rumble = [];
  const nav = { vibrate: (p) => { vib.push(p); return true; }, getGamepads: () => [{ vibrationActuator: { playEffect: (k, o) => { rumble.push([k, o.duration]); return Promise.resolve(); } } }, null] };
  const h = createHaptics({ win: null, nav, storage: memoryStorage() });
  assert.equal(h.pulse('gift_chime'), true); assert.equal(h.pulse('nope'), false);
  assert.deepEqual(vib, [[30, 40, 60]]); assert.deepEqual(rumble, [['dual-rumble', 160]]);
  for (const p of Object.values(PATTERNS)) assert.ok(p[0].reduce((s, x) => s + x, 0) <= 200 && p[2] <= 200, 'short pulses only');
});

test('off by setting and under reduced motion', () => {
  const s = memoryStorage(); assert.equal(hapticsOn(s), true);
  s.setItem(HAPTICS_KEY, 'off'); assert.equal(hapticsOn(s), false);
  assert.equal(hapticsOn(memoryStorage(), true), false);
  const nav = { vibrate: () => { throw new Error('must not vibrate'); } };
  assert.equal(createHaptics({ win: null, nav, storage: s }).pulse('gift_chime'), false);
});
