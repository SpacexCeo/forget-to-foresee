// Settings -> Controls (owner 12.11: "the Controls tab is empty; draw the keyboard with the binds"): the pane renders
// (it used to throw before anything showed), lists the bindings, and ends with the drawn keyboard lit from the CURRENT
// bindings (a rebind shows at once) plus the mouse; on a touch device the touch layout instead. Every play locale has
// the diagram's strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// a tiny DOM: enough for the popup and the diagram
class Node_ {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = { setProperty: (k, v) => { this.style[k] = v; } }; this.className = ''; this._text = ''; this.listeners = {}; this.open = false; }
  append(...c) { for (const x of c) this.children.push(typeof x === 'string' ? Object.assign(new Node_('#text'), { _text: x }) : x); }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); } removeEventListener() {}
  set textContent(v) { this._text = String(v); this.children = []; } get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  querySelector() { return null; } contains() { return false; } focus() {} showModal() { this.open = true; } close() { this.open = false; }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
}
const makeDoc = () => {
  const ids = {};
  const doc = { head: new Node_('head'), body: new Node_('body'), activeElement: null,
    createElement: (t) => new Node_(t), createElementNS: (ns, t) => new Node_(t), createTextNode: (s) => Object.assign(new Node_('#text'), { _text: s }),
    getElementById: (id) => ids[id] || null, addEventListener() {}, removeEventListener() {} };
  const append = doc.head.append.bind(doc.head); doc.head.append = (...c) => { for (const x of c) if (x.id) ids[x.id] = x; append(...c); };
  return doc;
};
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const t = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

const { createSettingsPopup } = await import('../../src/ui/settings-popup.js');
const { keyActions, KEY_ROWS } = await import('../../src/ui/keyboard-map.js');
const KB = await import('../../src/ui/keybinds.js');

function openControls(touch) {
  const doc = makeDoc();
  const pop = createSettingsPopup({ doc, t, i18n: null, prefs: { get: () => ({ quality: 'auto', motion: 'system' }), set() {} }, storage: memory(), hooks: { touch: () => ({ available: touch, mode: 'sticks', setMode() {} }) } });
  pop.open('controls');
  return { doc, pop, body: pop.dialog.all((n) => n.className === 'ftf-set-body')[0] };
}

test('controls pane: it renders (no throw), lists every binding, and ends with the keyboard and the mouse', () => {
  const { body } = openControls(false);
  assert.ok(body.children.length > 10, 'the pane has content');
  const keys = body.all((n) => n.className === 'ftf-set-key');
  assert.equal(keys.length, KB.KEY_ACTIONS.length, 'a row per bindable action');
  const fig = body.children[body.children.length - 1];
  assert.equal(fig.className, 'ftf-kbd', 'the diagram is last (at the bottom)');
  const caps = fig.all((n) => n.className === 'ftf-kbd-k');
  assert.equal(caps.length, KEY_ROWS.flat().length);
  const lit = Object.fromEntries(caps.filter((c) => c.dataset.on === '1').map((c) => [c.dataset.code, c.textContent]));
  for (const [code, label] of [['KeyW', 'set.kbd.forward'], ['KeyA', 'set.kbd.left'], ['KeyS', 'set.kbd.back'], ['KeyD', 'set.kbd.right'], ['ShiftLeft', 'set.kbd.run'], ['Space', 'set.kbd.dash'],
    ['KeyF', 'set.kbd.strike'], ['KeyQ', 'set.kbd.lance'], ['KeyV', 'set.kbd.snare'], ['KeyE', 'set.kbd.interact'], ['KeyK', 'set.kbd.skin'], ['KeyP', 'set.kbd.photo'], ['Escape', 'set.kbd.menu'], ['Digit1', 'set.kbd.lance'], ['Digit3', 'set.kbd.strike']]) {
    assert.ok(lit[code] && lit[code].includes(label), `${code} lit with ${label}`);
  }
  assert.ok(!lit.KeyG && !lit.KeyC, 'unbound keys stay dark');
  const mouse = fig.all((n) => n.className === 'ftf-kbd-mouse')[0];
  assert.ok(mouse && /set\.kbd\.m\.left.*set\.kbd\.walkTalk/.test(mouse.textContent) && /set\.kbd\.m\.right/.test(mouse.textContent) && /set\.kbd\.m\.wheel/.test(mouse.textContent));
});

test('the diagram follows a rebind; two actions on one key are marked; touch shows the touch layout', () => {
  const b = { ...KB.defaultBindings(), photo: 'KeyC', interact: 'KeyF' };
  const map = keyActions(b);
  assert.deepEqual(map.KeyC, ['photo']); assert.ok(!map.KeyP); assert.deepEqual(map.KeyF.sort(), ['interact', 'strike']);
  assert.deepEqual(map.Escape, ['menu']); assert.deepEqual(map.Digit2, ['snare']);
  assert.deepEqual(keyActions({ ...KB.defaultBindings(), run: 'Digit1' }).Digit1, ['run'], 'a rebind onto a number key wins over its alias');
  const { body } = openControls(true);
  const fig = body.children[body.children.length - 1];
  assert.equal(fig.className, 'ftf-kbd');
  assert.equal(fig.all((n) => n.className === 'ftf-kbd-k').length, 0, 'no keyboard on touch');
  assert.match(fig.textContent, /set\.kbd\.t\.stick.*set\.kbd\.move/); assert.match(fig.textContent, /set\.kbd\.t\.pinch.*set\.kbd\.zoom/);
});

test('every play locale has the diagram strings', async () => {
  const keys = [...KB.KEY_ACTIONS.map((a) => 'set.kbd.' + a.id), 'set.kbd.menu', 'set.kbd.title', 'set.kbd.touchTitle', 'set.kbd.m.left', 'set.kbd.m.right', 'set.kbd.m.wheel', 'set.kbd.walkTalk', 'set.kbd.look', 'set.kbd.zoom',
    'set.kbd.move', 'set.kbd.skills', 'set.kbd.t.stick', 'set.kbd.t.drag', 'set.kbd.t.pinch', 'set.kbd.t.tap', 'set.kbd.t.bar'];
  for (const L of ['en', 'ru', 'uk', 'it', 'zh']) {
    const d = (await import(`../../src/play/locales/${L}.js`)).default;
    for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k].length, `${L} ${k}`);
  }
});
