// Touch run controls (docs/mobile.md): the double-tap detector, the run flag and the Input integration
// with a fake DOM. Keyboard Shift behaviour must stay exactly as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Input, TapRun, runFlag, wantsTouchControls, mountRunToggle } from '../../src/ui/input.js';

test('TapRun: a second tap close in time and space is a double tap, a third starts a new pair', () => {
  const t = new TapRun({ maxDelay: 350, maxDist: 40 });
  assert.equal(t.tap(100, 100, 1000), false);
  assert.equal(t.tap(110, 95, 1200), true, 'within 350 ms and 40 px');
  assert.equal(t.tap(110, 95, 1300), false, 'the pair is consumed: no triple-tap chain');
  assert.equal(t.tap(110, 95, 1800), false, 'too slow after the previous single tap');
  assert.equal(t.tap(200, 95, 1900), false, 'too far from the previous tap');
  assert.equal(t.tap(205, 90, 2000), true);
  t.reset();
  assert.equal(t.tap(205, 90, 2050), false, 'reset forgets the previous tap');
});

test('runFlag and wantsTouchControls are plain ORs over their sources', () => {
  assert.equal(runFlag(), false);
  assert.equal(runFlag({ shift: true }), true);
  assert.equal(runFlag({ toggle: true }), true);
  assert.equal(runFlag({ burst: true }), true);
  assert.equal(wantsTouchControls({}), false);
  assert.equal(wantsTouchControls({ coarse: true }), true);
  assert.equal(wantsTouchControls({ touchSeen: true }), true);
});

/** Minimal window/document/target so Input can be constructed in node (same pattern as input.test.mjs). */
function withFakeDom(fn) {
  const globals = ['window', 'document', 'navigator'];
  const descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const win = new EventTarget();
  const doc = new EventTarget();
  const target = new EventTarget();
  target.setPointerCapture = () => {}; target.hasPointerCapture = () => false; target.releasePointerCapture = () => {};
  target.style = {};
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: doc },
    navigator: { configurable: true, value: { getGamepads: () => [] } },
  });
  const fire = (receiver, type, { timeStamp, ...data } = {}) => {
    const e = Object.assign(new Event(type, { cancelable: true }), data);
    if (timeStamp !== undefined) Object.defineProperty(e, 'timeStamp', { value: timeStamp }); // a getter on Event
    return receiver.dispatchEvent(e);
  };
  const tap = (x, y, t, pointerType = 'touch', pointerId = 7) => {
    fire(target, 'pointerdown', { pointerType, pointerId, button: 0, isPrimary: true, clientX: x, clientY: y });
    fire(target, 'pointerup', { pointerType, pointerId, button: 0, isPrimary: true, clientX: x, clientY: y, timeStamp: t });
  };
  try { return fn({ win, doc, target, fire, tap }); } finally {
    globals.forEach((name, i) => {
      if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]);
      else delete globalThis[name];
    });
  }
}

test('double-tap runs to the spot and the next single tap walks again; mouse clicks never run', () => withFakeDom(({ target, tap, fire }) => {
  const input = new Input(target);
  assert.equal(input.runButton, null, 'no document.body: no button, no crash');
  assert.equal(input.touchControls, false);
  tap(100, 200, 1000);
  assert.equal(input.clicks.length, 1, 'the first tap is a walk order');
  assert.equal(input.touchControls, true, 'a touch reveals the touch controls');
  assert.equal(input.running, false);
  tap(104, 196, 1250);
  assert.equal(input.clicks.length, 2, 'the second tap is a walk order too (same spot)');
  assert.equal(input.running, true);
  assert.equal(input.down('ShiftLeft', 'ShiftRight'), true, 'the gameplay loop reads the burst as a held Shift');
  assert.equal(input.keys.has('ShiftLeft'), false, 'no fake key is injected');
  input.endFrame();
  assert.equal(input.running, true, 'the burst survives the frame');
  tap(300, 400, 5000);
  assert.equal(input.running, false, 'a single tap elsewhere walks again');
  tap(300, 400, 5100);
  assert.equal(input.running, true);
  fire(target, 'pointerdown', { pointerType: 'touch', pointerId: 7, button: 0, isPrimary: true, clientX: 300, clientY: 400 });
  fire(target, 'pointermove', { pointerType: 'touch', pointerId: 7, clientX: 340, clientY: 420 });
  fire(target, 'pointerup', { pointerType: 'touch', pointerId: 7, button: 0, isPrimary: true, clientX: 340, clientY: 420, timeStamp: 5300 });
  assert.equal(input.running, true, 'an orbit drag is not a tap and keeps the burst');
  input.clear();
  assert.equal(input.running, false, 'blur / scene transitions drop the burst');
  tap(10, 10, 9000, 'mouse', 1);
  tap(10, 10, 9100, 'mouse', 1);
  assert.equal(input.running, false, 'a mouse double click is two walk orders, never a run');
}));

test('the run toggle is sticky, feeds the Shift query and leaves the keyboard path unchanged', () => withFakeDom(({ target, fire, win }) => {
  const input = new Input(target);
  const seen = [];
  input.onRunChange((on) => seen.push(on));
  assert.equal(input.down('ShiftLeft', 'ShiftRight'), false);
  fire(win, 'keydown', { code: 'ShiftLeft' });
  assert.equal(input.down('ShiftLeft', 'ShiftRight'), true, 'keyboard Shift as before');
  assert.equal(input.running, true);
  fire(win, 'keyup', { code: 'ShiftLeft' });
  assert.equal(input.running, false);
  input.setRunToggle(true);
  assert.deepEqual(seen, [true]);
  assert.equal(input.down('ShiftLeft', 'ShiftRight'), true);
  assert.equal(input.down('KeyW'), false, 'only Shift queries see the toggle');
  input.endFrame();
  input.clear();
  assert.equal(input.runToggle, true, 'the toggle is a setting: it survives blur');
  assert.equal(input.running, true);
  input.setRunToggle(true);
  assert.deepEqual(seen, [true], 'no event when nothing changed');
  input.setRunToggle(false);
  assert.equal(input.running, false);
  assert.deepEqual(seen, [true, false]);
}));

test('mountRunToggle builds a 48+ px button that mirrors the toggle and hides without touch', () => withFakeDom(({ target }) => {
  const input = new Input(target);
  const made = [];
  const el = (tag) => {
    const attrs = {}, classes = new Set(), listeners = {};
    const node = {
      tag, attrs, listeners, children: [], style: {}, type: '', className: '', innerHTML: '', title: '',
      setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k],
      addEventListener: (t, fn) => { listeners[t] = fn; }, blur() {},
      classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) },
      appendChild(child) { node.children.push(child); return child; },
    };
    made.push(node);
    return node;
  };
  const doc = { body: el('body'), head: el('head'), createElement: el, getElementById: () => null };
  const btn = mountRunToggle(input, doc);
  assert.ok(btn && btn.tag === 'button');
  assert.equal(btn.type, 'button');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  assert.ok(doc.body.children.includes(btn));
  const style = doc.head.children.find((n) => n.tag === 'style');
  assert.ok(style && /width:\s*52px;\s*height:\s*52px/.test(style.textContent), 'at least 48 px tall and wide');
  assert.ok(/bottom:\s*calc\(96px/.test(style.textContent), 'sits above the mobile dialogue bar, beside the prompt pill');
  assert.equal(btn.classList.contains('ftf-run-toggle--on'), false, 'hidden until the device is known to be touch');
  input.setTouchControls(true);
  assert.equal(btn.classList.contains('ftf-run-toggle--on'), true);
  btn.listeners.click();
  assert.equal(input.runToggle, true);
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  btn.listeners.click();
  assert.equal(input.runToggle, false);
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  assert.equal(mountRunToggle(input, { body: null }), null);
}));
