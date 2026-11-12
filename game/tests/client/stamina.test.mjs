// Stamina (src/game/stamina.js): running drains, a dash costs a chunk, rest refills, winded at zero until 20 %.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStamina, STAMINA } from '../../src/game/stamina.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('drain, dash, rest, winded until 20 %', () => {
  const s = createStamina();
  assert.equal(s.value, 100); assert.equal(s.canRun(), true);
  for (let i = 0; i < 10; i++) s.update(0.1, { running: true });
  assert.ok(Math.abs(s.value - (100 - STAMINA.runDrain)) < 1e-6);
  assert.equal(s.spend(STAMINA.dash), true); assert.ok(Math.abs(s.value - 68) < 1e-6);
  s.update(0.5); assert.ok(Math.abs(s.value - 68) < 1e-6, 'no refill before the rest delay');
  s.update(0.6); s.update(0.5); assert.ok(s.value > 68);
  // spend down to zero: winded, no dash, no run
  s.reset(); for (let i = 0; i < 4; i++) s.spend(25);
  assert.equal(s.value, 0); assert.equal(s.winded, true); assert.equal(s.canRun(), false);
  assert.equal(s.spend(25), false); assert.equal(s.flash, 1);
  for (let i = 0; i < 20; i++) s.update(0.1);
  assert.equal(s.winded, false, 'back above 20 % after a rest'); assert.ok(s.value >= STAMINA.recoverAt);
  for (const loc of Object.keys(PLAY_MESSAGES)) assert.ok(PLAY_MESSAGES[loc]['hud.stamina'], loc);
});

test('a full, idle bar counts idle time', () => {
  const s = createStamina(); s.update(2); s.update(2); assert.ok(s.idle >= 3.9);
  s.spend(4); assert.equal(s.idle, 0);
});
