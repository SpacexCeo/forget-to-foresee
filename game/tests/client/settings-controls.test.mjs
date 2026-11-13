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
const { EN_HUD } = await import('../../src/rpg/hud-text.js');

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
  assert.equal(keys.length, KB.KEY_ACTIONS.length, 'a Rebind button per bindable action');
  assert.equal(body.all((n) => n.className === 'ftf-set-grp').length, KB.KEY_GROUPS.length, 'grouped');
  const fig = body.children[body.children.length - 1];
  assert.equal(fig.className, 'ftf-kbd', 'the diagram is last (at the bottom)');
  const caps = fig.all((n) => n.className === 'ftf-kbd-k');
  assert.equal(caps.length, KEY_ROWS.flat().length);
  const lit = Object.fromEntries(caps.filter((c) => c.dataset.on === '1').map((c) => [c.dataset.code, c.textContent]));
  for (const [code, label] of [['KeyW', 'set.kbd.forward'], ['KeyA', 'set.kbd.left'], ['KeyS', 'set.kbd.back'], ['KeyD', 'set.kbd.right'], ['ShiftLeft', 'set.kbd.run'], ['Space', 'set.kbd.dash'],
    ['KeyF', 'set.kbd.strike'], ['KeyQ', 'set.kbd.lance'], ['KeyV', 'set.kbd.snare'], ['KeyE', 'set.kbd.interact'], ['KeyK', 'set.kbd.skin'], ['KeyP', 'set.kbd.photo'], ['Escape', 'set.kbd.menu'], ['Digit1', 'set.kbd.hotbar1'], ['Digit9', 'set.kbd.hotbar9'], ['KeyJ', 'set.kbd.journal'], ['KeyN', 'set.kbd.skills'], ['KeyC', 'set.kbd.character'], ['F1', 'set.kbd.help']]) {
    assert.ok(lit[code] && (lit[code].includes(label) || lit[code].includes(EN_HUD[label] || '\u0000')), `${code} lit with ${label}`);
  }
  assert.ok(!lit.KeyG && !lit.KeyZ, 'unbound keys stay dark');
  const mouse = fig.all((n) => n.className === 'ftf-kbd-mouse')[0];
  assert.ok(mouse && /set\.kbd\.m\.left.*set\.kbd\.walkTalk/.test(mouse.textContent) && /set\.kbd\.m\.right/.test(mouse.textContent) && /set\.kbd\.m\.wheel/.test(mouse.textContent));
});

test('the diagram follows a rebind; two actions on one key are marked; touch shows the touch layout', () => {
  const b = { ...KB.defaultBindings(), photo: 'KeyG', interact: 'KeyF' };
  const map = keyActions(b);
  assert.deepEqual(map.KeyG, ['photo']); assert.ok(!map.KeyP); assert.deepEqual(map.KeyF.sort(), ['interact', 'strike']);
  assert.deepEqual(map.Escape, ['menu']); assert.deepEqual(map.Digit2, ['hotbar2']);
  const { body } = openControls(true);
  const fig = body.children[body.children.length - 1];
  assert.equal(fig.className, 'ftf-kbd');
  assert.equal(fig.all((n) => n.className === 'ftf-kbd-k').length, 0, 'no keyboard on touch');
  assert.match(fig.textContent, /set\.kbd\.t\.stick.*set\.kbd\.move/); assert.match(fig.textContent, /set\.kbd\.t\.pinch.*set\.kbd\.zoom/);
});

test('every diagram and rebind string resolves: the five locales for the old keys, English (en-hud) for the sprint ones', async () => {
  const { hudT } = await import('../../src/rpg/hud-text.js');
  const old = ['forward', 'back', 'left', 'right', 'run', 'interact', 'strike', 'dash', 'lance', 'snare', 'photo', 'skin', 'chat', 'camera', 'panel'];
  const keys = [...old.map((id) => 'set.kbd.' + id), 'set.kbd.menu', 'set.kbd.title', 'set.kbd.touchTitle', 'set.kbd.m.left', 'set.kbd.m.right', 'set.kbd.m.wheel', 'set.kbd.walkTalk', 'set.kbd.look', 'set.kbd.zoom',
    'set.kbd.move', 'set.kbd.skills', 'set.kbd.t.stick', 'set.kbd.t.drag', 'set.kbd.t.pinch', 'set.kbd.t.tap', 'set.kbd.t.bar'];
  for (const L of ['en', 'ru', 'uk', 'it', 'zh']) {
    const d = (await import(`../../src/play/locales/${L}.js`)).default;
    for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k].length, `${L} ${k}`);
  }
  const en = (await import('../../src/play/locales/en.js')).default, tt = hudT((k) => en[k] || k);
  for (const a of KB.KEY_ACTIONS) { assert.notEqual(tt('set.key.' + a.id), 'set.key.' + a.id, a.id); assert.notEqual(tt('set.kbd.' + a.id), 'set.kbd.' + a.id, a.id); }
  for (const g of KB.KEY_GROUPS) assert.notEqual(tt('set.grp.' + g), 'set.grp.' + g);
});

test('rebind: a taken key asks to swap, a reserved key is refused, a swap trades the keys', () => {
  const b = KB.defaultBindings();
  const taken = KB.rebind(b, 'strike', 'KeyE'); assert.equal(taken.ok, false); assert.equal(taken.reason, 'taken'); assert.equal(taken.swapWith, 'interact');
  const sw = KB.rebind(b, 'strike', 'KeyE', { swap: true }); assert.ok(sw.ok); assert.equal(sw.bindings.strike, 'KeyE'); assert.equal(sw.bindings.interact, 'KeyF');
  for (const code of ['Escape', 'Tab', 'F5', 'KeyL']) assert.equal(KB.rebind(b, 'strike', code).reason, 'reserved', code);
  const free = KB.rebind(b, 'strike', 'KeyG'); assert.ok(free.ok); assert.equal(free.bindings.strike, 'KeyG');
  assert.equal(KB.remapTable(free.bindings).get('KeyG'), 'KeyF', 'G now strikes'); assert.equal(KB.remapTable(free.bindings).get('KeyF'), null);
  for (const [id, code] of [['hotbar1', 'Digit1'], ['hotbar9', 'Digit9'], ['journal', 'KeyJ'], ['map', 'KeyM'], ['skills', 'KeyN'], ['character', 'KeyC'], ['bag', 'KeyI'], ['market', 'KeyB'], ['track', 'KeyT'], ['target', 'KeyX'], ['help', 'F1']]) assert.equal(b[id], code, id);
});

test('the rebind screen: Rebind, press a taken key, the swap question, Swap applies both', () => {
  const { pop, body } = openControls(false);
  const btn = body.all((n) => n.className === 'ftf-set-key' && n.dataset.action === 'strike')[0];
  btn.listeners.click[0]();
  const keydown = pop.dialog.listeners.keydown[0];
  keydown({ code: 'KeyE', preventDefault() {}, stopPropagation() {} });
  const b2 = pop.dialog.all((n) => n.className === 'ftf-set-body')[0];
  const ask = b2.all((n) => n.className === 'ftf-set-swap')[0];
  assert.ok(ask, 'the swap question'); assert.match(ask.textContent, /set\.rebind\.swap/);
  ask.all((n) => n.tagName === 'BUTTON')[0].listeners.click[0]();
  assert.equal(KB.bindings().strike, 'KeyE'); assert.equal(KB.bindings().interact, 'KeyF');
  KB.setBindings(KB.defaultBindings());
});
