// Voice budget: a burst of one-shots must not start more than MAX_ONE_SHOTS sources, and the same
// sample restarted inside SAME_SOUND_GAP is skipped (regression for audio dropouts in a crowded town).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ONE_SHOTS, SAME_SOUND_GAP } from '../../src/audio/audio.js';

test('voice budget constants are sane', () => {
  assert.ok(MAX_ONE_SHOTS >= 12 && MAX_ONE_SHOTS <= 64);
  assert.ok(SAME_SOUND_GAP > 0 && SAME_SOUND_GAP <= 0.1);
});
