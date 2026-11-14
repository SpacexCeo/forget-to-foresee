// The F11 hint (playtest 14.11): it hid the selected enemy's HP bar at the top of the screen. It now hides itself after
// a few seconds on screen and whenever a target frame is up; the Weaving Gate label and halo are checked elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fsHintVisible, mountFullscreenHint, FS_HINT_SHOW_MS } from '../../src/ui/fullscreen-hint.js';

test('fullscreen hint: hidden once it has been up long enough, and while a target frame is on screen', () => {
  const base = { allowed: true, dismissed: false, full: false, booting: false, busy: false };
  assert.equal(fsHintVisible(base), true, 'the defaults keep the old behaviour');
  assert.equal(fsHintVisible({ ...base, expired: true }), false);
  assert.equal(fsHintVisible({ ...base, combat: true }), false);
});

function fakeEnv() {
  const node = (tag) => ({ tag, children: [], hidden: false, attrs: {}, listeners: {}, className: '', style: {},
    append(...c) { this.children.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; }, remove() {} });
  let target = false;
  const doc = { head: node('head'), body: node('body'), createElement: node, getElementById: () => null,
    querySelector: (q) => (q.startsWith('.rpg-target') && target ? {} : null), addEventListener() {}, removeEventListener() {}, documentElement: {} };
  const win = { matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Desktop' }, innerWidth: 1024, innerHeight: 700, screen: { width: 1024, height: 768 },
    addEventListener() {}, removeEventListener() {} };
  const storage = { getItem: () => null, setItem() {} };
  return { doc, win, storage, setTarget: (v) => { target = v; } };
}

test('fullscreen hint: the mounted line auto-hides after FS_HINT_SHOW_MS and gives way to the target HP bar', () => {
  const realNow = Date.now; let now = 1_000_000; Date.now = () => now;
  const env = fakeEnv();
  const h = mountFullscreenHint({ t: (k) => (k === 'fs.hint' ? 'Press F11 for fullscreen' : k), doc: env.doc, win: env.win, storage: env.storage });
  try {
    assert.equal(h.el.hidden, false, 'shown at first');
    env.setTarget(true); h.update();
    assert.equal(h.el.hidden, true, 'an enemy is targeted: the hint steps aside');
    env.setTarget(false); now += 1000; h.update();
    assert.equal(h.el.hidden, false, 'back once the target frame is gone');
    now += FS_HINT_SHOW_MS; h.update(); now += 10; h.update();
    assert.equal(h.el.hidden, true, 'gone after its few seconds');
  } finally { h.dispose(); Date.now = realNow; }
});
