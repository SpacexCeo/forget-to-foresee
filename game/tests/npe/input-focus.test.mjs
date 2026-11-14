// Playtest 14.11 (Russian UI, guest, desktop): keyboard focus and dialogue advance.
// B1: the key that opened the name prompt never types into the name field.
// B3: every E press counts in the arrival dialogue (one completes a typing line, the next advances), the physical E
//     key included under a Cyrillic layout.
// B7: Esc "skip all" ends in the same state as finishing: npe.skipped (the crowd and the camera stop on it) goes out
//     only when the card closes, next to npe.completed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';

const tick = (n = 1) => new Promise((r) => { let k = n; const go = () => (--k <= 0 ? r() : setTimeout(go, 0)); setTimeout(go, 0); });
const dom = () => {
  const { doc } = installDom(); const keyListeners = [];
  doc.getElementById = () => null;
  doc.addEventListener = (t, fn) => { if (t === 'keydown') keyListeners.push(fn); };
  doc.removeEventListener = (t, fn) => { const i = keyListeners.indexOf(fn); if (i >= 0) keyListeners.splice(i, 1); };
  doc.key = (props) => { const e = { type: 'keydown', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props }; for (const fn of [...keyListeners]) fn(e); return e; };
  return doc;
};

test('B3: each E press counts: a press while a line types completes it, the next one advances', async () => {
  const doc = dom();
  const { playDialogue } = await import('../../src/npe/dialogue-ui.js');
  const lines = Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'elder' : 'townsfolk', text: 'x'.repeat(120) }));
  const d = playDialogue({ doc, lines, reduced: () => false, name: (s) => s, hint: 'h', count: (n, of) => `${n} / ${of}`, skipLabel: 'Skip', now: () => 0, raf: () => {} });
  for (let k = 0; k < 8; k++) {
    assert.equal(d.index, k); assert.equal(d.typing, true, `line ${k + 1} is typing`);
    doc.key({ key: 'e', code: 'KeyE' }); assert.equal(d.typing, false, 'the press completes the line'); assert.equal(d.index, k);
    doc.key({ key: 'e', code: 'KeyE' });
  }
  assert.equal(await d.done, 'finished', '16 presses play all 8 typed lines');
});

test('B3: the physical E key advances under a Cyrillic layout (key "у", code KeyE)', async () => {
  const doc = dom();
  const { playDialogue } = await import('../../src/npe/dialogue-ui.js');
  const lines = [{ speaker: 'elder', text: 'one' }, { speaker: 'elder', text: 'two' }];
  const d = playDialogue({ doc, lines, reduced: () => true, name: (s) => s, hint: 'h', count: () => '', skipLabel: 'Skip', now: () => 0, raf: () => {} });
  const e = doc.key({ key: 'у', code: 'KeyE' });
  assert.equal(e.defaultPrevented, true); assert.equal(d.index, 1);
  doc.key({ key: 'у', code: 'KeyE' });
  assert.equal(await d.done, 'finished');
});

test('B1: the key that was down as the name field appeared never types into it; later typing does', async () => {
  const doc = dom();
  const { runArrival, NAME_KEY_GRACE_MS } = await import('../../src/play/day1.js');
  const mint = { record: {}, setRecord() {}, phase: 'idle' };
  runArrival({ doc, t: (k) => k, mint, reduced: () => true }).catch(() => {});
  let input = null;
  for (let i = 0; i < 100 && !input; i++) { await new Promise((r) => setTimeout(r, 20)); input = doc.querySelector('input'); }
  assert.ok(input, 'the name prompt opened'); assert.equal(doc.activeElement, input);
  const key = (props) => { const e = { type: 'keydown', key: 'e', code: 'KeyE', stopPropagation() {}, ...props }; input.dispatchEvent(e); return !!e.defaultPrevented; };
  assert.equal(key({}), true, 'the E that opened the prompt is not typed');
  await new Promise((r) => setTimeout(r, NAME_KEY_GRACE_MS + 30));
  assert.equal(key({ repeat: true }), true, 'an auto-repeat of a held key is not typed');
  assert.equal(key({}), false, 'a fresh press types as usual');
});

test('B7: Skip all sends npe.skipped only when the card closes, like npe.completed after a finished talk', async () => {
  const doc = dom();
  const { runIntro } = await import('../../src/npe/index.js');
  const events = [];
  const bus = { emit: (n) => events.push(n), on: () => () => {} };
  const run = runIntro({ doc, t: (k) => k, storage: memoryStorage(), toast: () => {}, bus, reduced: () => true, search: '', prologue: { playLabPrologue: async () => 'done', playWakeUp: async () => {} } });
  for (let i = 0; i < 20 && !doc.querySelector('.npe-box'); i++) await tick(2);
  assert.ok(doc.querySelector('.npe-box'), 'the dialogue is open');
  run.skip(); await tick(3);
  assert.ok(doc.querySelector('.npe-card'), 'the card follows the skip');
  assert.equal(events.includes('npe.skipped'), false, 'the crowd and the camera stay while the card is up');
  run.skip(); await run.state;
  const i = events.indexOf('npe.skipped');
  assert.ok(i >= 0 && events.indexOf('npe.completed') > i, events.join(','));
});
