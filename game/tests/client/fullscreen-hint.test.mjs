// "Press F11 for fullscreen" (owner 14.11): desktop only, gone in fullscreen (F11 or the API), back when the player
// leaves it, never over the loading screen or a first-time film, never on capture links, hidden for the session by ×.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fsHintAllowed, isFullscreen, fsHintVisible } from '../../src/ui/fullscreen-hint.js';

test('fullscreen hint: desktops only, not phones or tablets, not capture / film / cinematic / replay links', () => {
  assert.equal(fsHintAllowed({}), true);
  assert.equal(fsHintAllowed({ coarse: true }), false);
  assert.equal(fsHintAllowed({ mobileUa: true }), false);
  for (const q of ['capture=1', 'cinematic=a', 'film=x', 'replay=r1', 'fs=0']) assert.equal(fsHintAllowed({ params: new URLSearchParams(q) }), false, q);
  assert.equal(fsHintAllowed({ params: new URLSearchParams('demo=judge') }), true, 'the jury plays on a desktop too');
});

test('fullscreen hint: fullscreen is the API, the display mode, or a window as big as the screen (F11)', () => {
  assert.equal(isFullscreen({ fsElement: {} }), true);
  assert.equal(isFullscreen({ displayFull: true }), true);
  assert.equal(isFullscreen({ inner: [1920, 1080], screen: [1920, 1080] }), true, 'F11');
  assert.equal(isFullscreen({ inner: [1920, 969], screen: [1920, 1080] }), false, 'a maximised window with its tab bar');
  assert.equal(isFullscreen({ inner: [0, 0], screen: [0, 0] }), false);
});

test('fullscreen hint: shows only when allowed, not dismissed, not full, not booting and nothing else owns the screen', () => {
  const base = { allowed: true, dismissed: false, full: false, booting: false, busy: false };
  assert.equal(fsHintVisible(base), true);
  for (const k of ['dismissed', 'full', 'booting', 'busy']) assert.equal(fsHintVisible({ ...base, [k]: true }), false, k);
  assert.equal(fsHintVisible({ ...base, allowed: false }), false);
});

test('fullscreen hint: every locale has its three lines, and the hint names F11', async () => {
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = (await import(`../../src/play/locales/${l}.js`)).default;
    for (const k of ['fs.hint', 'fs.hint.click', 'fs.hint.close']) assert.ok(typeof m[k] === 'string' && m[k].length, `${l}: ${k}`);
    assert.ok(m['fs.hint'].includes('F11'), l);
  }
});
