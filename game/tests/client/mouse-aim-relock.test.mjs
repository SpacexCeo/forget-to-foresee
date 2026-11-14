// Mouse aim after leaving the tab (owner 14.11): the browser drops the pointer lock when the tab or the window goes away;
// that is no Esc (no menu opens), the game stops asking for the lock on its own, and the next click into the scene takes
// the pointer again. A fake document stands in for the browser's pointer lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseAim } from '../../src/ui/mouse-aim.js';

function fakeTarget() {
  const ls = {};
  return {
    tagName: 'CANVAS', requests: 0, grant: true,
    addEventListener(t, f) { (ls[t] ||= []).push(f); }, removeEventListener() {},
    fire(t, e) { for (const f of ls[t] || []) f(e); },
    requestPointerLock() { this.requests++; if (this.grant) this.doc.lockTo(this); return Promise.resolve(); },
  };
}

function fakeWorld() {
  const dls = {}, wls = {};
  const doc = {
    pointerLockElement: null, visibilityState: 'visible', focus: true, activeElement: null,
    head: { append() {} }, body: { append() {}, classList: { toggle() {}, remove() {} } },
    getElementById: () => null, createElement: () => ({ setAttribute() {}, remove() {} }), querySelector: () => null,
    hasFocus() { return this.focus; },
    addEventListener(t, f) { (dls[t] ||= []).push(f); }, removeEventListener() {},
    fire(t, e = {}) { for (const f of dls[t] || []) f(e); },
    lockTo(el) { this.pointerLockElement = el; this.fire('pointerlockchange'); },
    exitPointerLock() { this.pointerLockElement = null; this.fire('pointerlockchange'); },
  };
  const win = { innerWidth: 1280, innerHeight: 720, addEventListener(t, f) { (wls[t] ||= []).push(f); }, removeEventListener() {}, fire(t, e = {}) { for (const f of wls[t] || []) f(e); } };
  const target = fakeTarget(); target.doc = doc;
  let t = 0; const now = () => t; const tick = (ms) => { t += ms; };
  const escapes = [];
  const input = {};
  const aim = createMouseAim({ target, input, doc, win, now, mode: () => 'aim', touch: () => false, active: () => true, onAction() {}, onEscape: () => escapes.push(t) });
  const click = () => target.fire('pointerdown', { pointerType: 'mouse', button: 0, ctrlKey: false, preventDefault() {} });
  return { doc, win, target, aim, input, click, tick, escapes };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('mouse aim: a click takes the pointer', () => {
  const w = fakeWorld();
  w.click();
  assert.equal(w.aim.locked, true);
  assert.equal(w.input.lookLocked, true);
});

test('mouse aim: switching tabs drops the lock, opens no menu, and the next click takes the pointer back', async () => {
  const w = fakeWorld();
  w.click(); assert.equal(w.aim.locked, true);
  // the browser drops the lock first (the page still looks focused for a moment), then the tab hides and blurs
  w.doc.pointerLockElement = null; w.doc.fire('pointerlockchange');
  w.doc.visibilityState = 'hidden'; w.doc.fire('visibilitychange');
  w.doc.focus = false; w.win.fire('blur');
  await wait(90);
  assert.deepEqual(w.escapes, [], 'leaving the tab is not an Esc');
  // back in the tab: no request without a click (it would only fail)
  w.doc.visibilityState = 'visible'; w.doc.fire('visibilitychange'); w.doc.focus = true; w.win.fire('focus');
  const before = w.target.requests;
  for (let i = 0; i < 10; i++) { w.tick(500); w.aim.update(); }
  assert.equal(w.target.requests, before, 'no lock request with no click behind it');
  assert.equal(w.aim.locked, false);
  w.click();
  assert.equal(w.aim.locked, true, 'the click re-acquires the pointer');
  assert.equal(w.input.lookLocked, true);
});

test('mouse aim: a refused request does not stop the next click from trying again', () => {
  const w = fakeWorld();
  w.target.grant = false; w.click(); assert.equal(w.aim.locked, false);
  w.target.grant = true; w.click(); assert.equal(w.aim.locked, true);
});

test('mouse aim: Esc in the browser (the page keeps the focus) still opens the menu once', async () => {
  const w = fakeWorld();
  w.click();
  w.doc.pointerLockElement = null; w.doc.fire('pointerlockchange');
  await wait(90);
  assert.equal(w.escapes.length, 1);
});

test('mouse aim: the window losing focus right after the unlock cancels the Esc', async () => {
  const w = fakeWorld();
  w.click();
  w.doc.pointerLockElement = null; w.doc.fire('pointerlockchange');
  w.doc.focus = false; w.win.fire('blur');
  await wait(90);
  assert.deepEqual(w.escapes, []);
  w.doc.focus = true; w.win.fire('focus');
  w.click(); assert.equal(w.aim.locked, true);
});
