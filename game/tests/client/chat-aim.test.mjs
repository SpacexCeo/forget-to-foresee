// Mouse-aim mode and the chat (owner 14.11: once the chat was open there was no way back to the game): Escape, Enter on an
// empty line and the × close it and hand the mouse back; a click on the scene leaves the chat line and takes the pointer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createMouseAim } from '../../src/ui/mouse-aim.js';

const presence = () => ({ status: 'online', count: 2, room: 1, chat: [], sys: null, said: [], say(t) { this.said.push(t); }, isMuted: () => false, mute() {}, unmute() {}, report() {} });

test('the chat closes on Escape, on Enter with an empty line and on its × — each time it calls onClose', async () => {
  const { doc } = installDom();
  doc.getElementById = doc.getElementById || (() => null); doc.addEventListener = doc.addEventListener || (() => {}); doc.removeEventListener = doc.removeEventListener || (() => {});
  const { createChatPanel } = await import('../../src/ui/chat-panel.js');
  const closes = [], p = presence();
  const panel = createChatPanel({ doc, t: (k) => k, presence: p, onClose: () => closes.push(1) });
  const box = doc.querySelector('.ftf-chat-box'), input = doc.querySelector('.ftf-chat-row input'), form = doc.querySelector('.ftf-chat-row'), x = doc.querySelector('.ftf-chat-x');
  assert.ok(x, 'a close button in the chat box');
  input.blur = () => { if (doc.activeElement === input) doc.activeElement = doc.body; };
  const fire = (el, type, extra = {}) => el.dispatchEvent({ type, preventDefault() {}, stopPropagation() {}, ...extra });
  const openIt = () => { doc.querySelector('.ftf-chat-chip').click(); assert.equal(panel.open, true); assert.equal(box.hidden, false); };
  openIt();
  fire(input, 'keydown', { key: 'Escape' });
  assert.equal(panel.open, false, 'Escape closes it'); assert.equal(box.hidden, true); assert.equal(closes.length, 1);
  openIt();
  input.value = '   '; fire(form, 'submit');
  assert.equal(panel.open, false, 'Enter on an empty line closes it'); assert.equal(closes.length, 2); assert.deepEqual(p.said, []);
  openIt();
  input.value = 'hello'; fire(form, 'submit');
  assert.equal(panel.open, true, 'a line is sent and the chat stays'); assert.deepEqual(p.said, ['hello']);
  x.click();
  assert.equal(panel.open, false, 'the × closes it'); assert.equal(closes.length, 3);
  panel.destroy();
});

function aimWorld() {
  const dls = {}, wls = {}, tls = {};
  const field = { tagName: 'INPUT', blurred: 0, blur() { this.blurred++; doc.activeElement = doc.body; } };
  const doc = {
    pointerLockElement: null, visibilityState: 'visible', activeElement: null, body: { append() {}, classList: { toggle() {} } }, head: { append() {} },
    getElementById: () => null, createElement: () => ({ setAttribute() {} }), querySelector: () => null, hasFocus: () => true,
    addEventListener(t, f) { (dls[t] ||= []).push(f); }, removeEventListener() {}, fire(t, e = {}) { for (const f of dls[t] || []) f(e); },
    exitPointerLock() { this.pointerLockElement = null; this.fire('pointerlockchange'); },
  };
  doc.activeElement = doc.body;
  const target = { tagName: 'CANVAS', requests: 0, addEventListener(t, f) { (tls[t] ||= []).push(f); }, removeEventListener() {}, fire(t, e) { for (const f of tls[t] || []) f(e); },
    requestPointerLock() { this.requests++; doc.pointerLockElement = this; doc.fire('pointerlockchange'); } };
  const win = { innerWidth: 1280, innerHeight: 720, addEventListener(t, f) { (wls[t] ||= []).push(f); }, removeEventListener() {} };
  let clock = 0; const aim = createMouseAim({ target, input: {}, doc, win, now: () => (clock += 100), mode: () => 'aim', touch: () => false, active: () => true, onAction() {}, onEscape() {} });
  const click = () => target.fire('pointerdown', { pointerType: 'mouse', button: 0, ctrlKey: false, preventDefault() {} });
  return { doc, target, aim, field, click };
}

test('mouse aim: a click on the scene while the chat line has the focus leaves the line and takes the pointer', () => {
  const w = aimWorld();
  w.click(); assert.equal(w.aim.locked, true);
  // the chat opens: its line takes the focus and the game gives the cursor back
  w.doc.activeElement = w.field; w.aim.update(); assert.equal(w.aim.locked, false);
  // the click into the scene (its preventDefault keeps the focus where it is, so the game must move it)
  w.click();
  assert.equal(w.field.blurred, 1, 'the chat line lets go of the focus');
  assert.equal(w.aim.locked, true, 'and the pointer is taken again');
});

test('mouse aim: closing the chat (resume) takes the pointer back inside that key or click', () => {
  const w = aimWorld();
  w.click(); w.doc.activeElement = w.field; w.aim.update(); assert.equal(w.aim.locked, false);
  w.doc.activeElement = w.doc.body; // the chat closed: its line let go
  const before = w.target.requests;
  w.aim.resume();
  assert.equal(w.target.requests, before + 1); assert.equal(w.aim.locked, true);
});

test('the game wires the chat\'s close to the mouse aim', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(src, /createMultiplayer\(\{ onChatClose: \(\) => mouseAim\.resume\(\),/);
  const mp = readFileSync(new URL('../../src/play/multiplayer.js', import.meta.url), 'utf8');
  assert.match(mp, /onClose: onChatClose/);
});
