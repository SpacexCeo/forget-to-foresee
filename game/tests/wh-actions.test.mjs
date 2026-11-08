// World HUD P3b: prompt, dialogue strip + replies, hotkey bar, mobile prompt pill and dialogue bar
// (docs/ui-world-hud.md §6.7–6.9, §7.5–7.6, §9.1). Runs in a tiny in-file DOM (no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- minimal DOM ----------
function installDom() {
  const kebab = (k) => 'data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  class Node {
    constructor() { this.parentNode = null; this.childNodes = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.documentElement; }
    remove() { if (this.parentNode) { const a = this.parentNode.childNodes; a.splice(a.indexOf(this), 1); this.parentNode = null; } }
  }
  class Text extends Node { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
  class Element extends Node {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.attributes = new Map();
      this.listeners = {};
      this.rawHTML = '';
      this.scrollTop = 0;
      const self = this;
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === 'string' ? self.getAttribute(kebab(k)) ?? undefined : undefined),
        set: (_, k, v) => { self.setAttribute(kebab(k), String(v)); return true; },
        has: (_, k) => self.hasAttribute(kebab(k)),
        deleteProperty: (_, k) => { self.removeAttribute(kebab(k)); return true; },
      });
      this.classList = {
        add: (...c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); self.className = [...s].join(' '); },
        remove: (...c) => { self.className = self.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
        contains: (c) => self.className.split(/\s+/).includes(c),
        toggle: (c, force) => { const on = force === undefined ? !self.classList.contains(c) : !!force; if (on) self.classList.add(c); else self.classList.remove(c); return on; },
      };
    }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get tabIndex() { const v = this.getAttribute('tabindex'); return v == null ? (this.tagName === 'BUTTON' ? 0 : -1) : +v; }
    set tabIndex(v) { this.setAttribute('tabindex', String(v)); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    get children() { return this.childNodes.filter((n) => n instanceof Element); }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(n) { n.remove(); n.parentNode = this; this.childNodes.push(n); return n; }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Text(n) : n); }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) { for (const n of [...this.childNodes]) n.remove(); if (v !== '' && v != null) this.appendChild(new Text(v)); }
    get innerHTML() { return this.rawHTML; }
    set innerHTML(v) { this.textContent = ''; this.rawHTML = String(v); }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    removeEventListener(t, fn) { const a = this.listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    dispatchEvent(e) {
      e.target ||= this;
      e.preventDefault ||= () => { e.defaultPrevented = true; };
      for (let n = this; n; n = n.parentNode) for (const fn of [...(n.listeners?.[e.type] || [])]) fn(e);
      return true;
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    focus() { doc.activeElement = this; }
    get descendants() { return this.children.flatMap((c) => [c, ...c.descendants]); }
    matches(sel) { return sel.split(',').some((s) => matchSel(this, s.trim())); }
    querySelectorAll(sel) { return this.descendants.filter((e) => e.matches(sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  function matchCompound(el, c) {
    const re = /^([a-z0-9]+)?((?:\.[\w-]+|\[[^\]]+\])*)$/i;
    const m = c.match(re);
    if (!m) throw new Error('selector not supported: ' + c);
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
      if (part[0] === '.') { if (!el.classList.contains(part.slice(1))) return false; continue; }
      const [, k, v] = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (!el.hasAttribute(k) || (v !== undefined && el.getAttribute(k) !== v)) return false;
    }
    return true;
  }
  function matchSel(el, sel) {
    const parts = sel.split(/\s+/);
    if (!matchCompound(el, parts.pop())) return false;
    let n = el.parentNode;
    while (parts.length && n) { if (n instanceof Element && matchCompound(n, parts[parts.length - 1])) parts.pop(); n = n.parentNode; }
    return parts.length === 0;
  }
  const doc = {
    createElement: (t) => new Element(t),
    createTextNode: (t) => new Text(t),
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
  };
  doc.documentElement = new Element('html');
  doc.head = doc.documentElement.appendChild(new Element('head'));
  doc.body = doc.documentElement.appendChild(new Element('body'));
  doc.activeElement = doc.body;
  const win = { listeners: {}, addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }, removeEventListener(t, fn) { const a = this.listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  globalThis.document = doc;
  globalThis.window = win;
  return { doc, win };
}

const { doc, win } = installDom();
const { mountActions } = await import('../src/ui/world-hud/actions.js');
const { DEMO_MODEL } = await import('../src/ui/world-hud/model.js');
const { createI18n, MESSAGES } = await import('../src/ui/i18n/index.js');
const { applyI18n } = await import('../src/ui/dom.js');

const en = MESSAGES.en;
function setup(layout = 'desktop', model = DEMO_MODEL) {
  const root = doc.body.appendChild(doc.createElement('div'));
  root.className = 'wh-root';
  const actions = [];
  const i18n = createI18n({ messages: MESSAGES, locale: 'en' });
  const api = mountActions(root, { model, i18n, layout, onAction: (...a) => actions.push(a) });
  return { root, api, actions, i18n };
}
const text = (root, sel) => root.querySelector(sel)?.textContent;
const texts = (root, sel) => root.querySelectorAll(sel).map((e) => e.textContent);
const key = (code, extra = {}) => {
  const e = { type: 'keydown', code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, target: doc.body, ...extra };
  e.preventDefault = () => { e.defaultPrevented = true; };
  for (const fn of [...(win.listeners.keydown || [])]) fn(e);
  return e;
};
const allKeys = (root) => root.querySelectorAll('[data-i18n], [data-i18n-attrs]').flatMap((e) => [
  ...(e.dataset.i18n ? [e.dataset.i18n] : []),
  ...(e.dataset.i18nAttrs ? Object.values(JSON.parse(e.dataset.i18nAttrs)) : []),
]);

test('actions (desktop): prompt, dialogue strip, reply and hotbar render the demo texts', () => {
  const { root, api, i18n } = setup('desktop');
  const prompt = root.querySelector('.wh-prompt');
  assert.equal(prompt.tagName, 'BUTTON');
  assert.equal(text(root, '.wh-prompt__kbd'), 'E');
  assert.equal(text(root, '.wh-prompt__text'), 'Inspect the Scroll Table');
  assert.equal(prompt.getAttribute('aria-label'), 'Press E: Inspect the Scroll Table');
  assert.equal(root.querySelectorAll('.wh-prompt__knot').length, 2);
  assert.equal(text(root, '.wh-dialogue__speaker'), 'Ash');
  assert.equal(text(root, '.wh-dialogue__line .wh-dialogue__text'), 'I sense a change in the flow.');
  assert.equal(root.querySelector('.wh-dialogue__line').getAttribute('aria-live'), 'polite');
  assert.ok(root.querySelector('.wh-dialogue__connector'));
  const reply = root.querySelector('.wh-dialogue__reply');
  assert.equal(reply.tagName, 'BUTTON');
  assert.equal(text(root, '.wh-dialogue__kbd'), 'A');
  assert.equal(text(root, '.wh-dialogue__reply-text'), 'I am ready to speak to Merec.');
  assert.equal(reply.getAttribute('aria-label'), 'Reply A: I am ready to speak to Merec.');
  assert.deepEqual(root.querySelectorAll('.wh-hotbar__btn').map((b) => b.dataset.hotkey), ['map', 'signs', 'inventory', 'help', 'settings']);
  assert.deepEqual(texts(root, '.wh-hotbar__label'), ['Map', 'Signs & Visions', 'Inventory', 'Help', 'Settings']);
  assert.deepEqual(texts(root, '.wh-hotbar__kbd'), ['M', 'V', 'I', 'H']);
  assert.ok(root.querySelector('[data-hotkey="settings"] .wh-hotbar__gear'));
  assert.equal(root.querySelector('.wh-hotbar').getAttribute('aria-label'), 'Shortcuts');
  assert.equal(root.querySelector('.wh-prompt--mobile'), null);
  assert.equal(i18n.missing.size, 0);
  api.destroy();
});

test('actions: clicks report prompt / reply / hotkey (V only forwards "signs")', () => {
  const { root, api, actions } = setup('desktop');
  root.querySelector('.wh-prompt').click();
  root.querySelector('.wh-dialogue__reply').click();
  for (const b of root.querySelectorAll('.wh-hotbar__btn')) b.click();
  assert.deepEqual(actions, [['prompt'], ['reply', 'r-merec'], ['hotkey', 'map'], ['hotkey', 'signs'], ['hotkey', 'inventory'], ['hotkey', 'help'], ['hotkey', 'settings']]);
  api.destroy();
});

test('actions: keyboard E / A / M I H fire; V, modifiers, typing and repeats are ignored', () => {
  const { api, actions } = setup('desktop');
  key('KeyE'); key('KeyA'); key('KeyM'); key('KeyI'); key('KeyH');
  assert.deepEqual(actions, [['prompt'], ['reply', 'r-merec'], ['hotkey', 'map'], ['hotkey', 'inventory'], ['hotkey', 'help']]);
  actions.length = 0;
  key('KeyV');
  key('KeyE', { ctrlKey: true }); key('KeyE', { altKey: true }); key('KeyE', { metaKey: true }); key('KeyE', { shiftKey: true });
  key('KeyE', { target: { tagName: 'INPUT' } }); key('KeyA', { target: { tagName: 'textarea' } });
  key('KeyE', { repeat: true });
  key('KeyS'); key('KeyD'); // no second / third reply in the demo
  assert.deepEqual(actions, []);
  // RU layout: the physical E key sends "у"; the code still says KeyE
  key('KeyE', { key: 'у' });
  assert.deepEqual(actions, [['prompt']]);
  api.destroy();
});

test('actions: replies A/S/D follow their hotkey fields; a hidden prompt ignores E', () => {
  const model = {
    ...DEMO_MODEL,
    prompt: { ...DEMO_MODEL.prompt, visible: false },
    dialogue: { ...DEMO_MODEL.dialogue, replies: [
      { id: 'one', hotkey: 'A', text: { key: 'wh.demo.reply' } },
      { id: 'two', hotkey: 'S', text: { key: 'wh.demo.reply' } },
      { id: 'three', hotkey: 'D', text: { key: 'wh.demo.reply' } },
    ] },
  };
  const { root, api, actions } = setup('desktop', model);
  assert.equal(root.querySelectorAll('.wh-dialogue__reply').length, 3);
  const prompt = root.querySelector('.wh-prompt');
  assert.ok(prompt.classList.contains('wh-is-hidden'));
  assert.equal(prompt.getAttribute('aria-hidden'), 'true');
  key('KeyE'); key('KeyD'); key('KeyS'); key('KeyA');
  assert.deepEqual(actions, [['reply', 'three'], ['reply', 'two'], ['reply', 'one']]);
  // visibility toggles in place (same node, fade class removed)
  api.update({ ...model, prompt: { ...model.prompt, visible: true } }, 'desktop');
  assert.equal(root.querySelector('.wh-prompt'), prompt);
  assert.ok(!prompt.classList.contains('wh-is-hidden'));
  assert.equal(prompt.getAttribute('aria-hidden'), null);
  api.destroy();
});

test('actions (mobile): gold prompt pill and the collapsible dialogue bar', () => {
  const { root, api, actions } = setup('mobile');
  assert.equal(root.querySelector('.wh-hotbar'), null, 'no hotbar on mobile');
  assert.ok(root.querySelector('.wh-prompt.wh-prompt--mobile'));
  assert.equal(text(root, '.wh-prompt--mobile .wh-prompt__text'), 'Inspect the Scroll Table');
  assert.equal(root.querySelector('.wh-prompt__knot'), null);
  const bar = root.querySelector('.wh-dialogue--mobile .wh-dialogue__bar');
  assert.equal(bar.tagName, 'BUTTON');
  assert.equal(text(root, '.wh-dialogue__bar .wh-dialogue__speaker'), 'Ash:');
  assert.equal(text(root, '.wh-dialogue__bar .wh-dialogue__text'), 'I am done speaking to Moss.');
  assert.ok(root.querySelector('.wh-dialogue__chevron'));
  assert.equal(bar.getAttribute('aria-expanded'), 'false');
  assert.equal(bar.getAttribute('title'), 'Show dialogue');
  assert.equal(root.querySelector(`[id="${bar.getAttribute('aria-controls')}"]`).hasAttribute('inert'), true);
  assert.equal(text(root, '.wh-dialogue--mobile .wh-dialogue__reply-text'), 'I am ready to speak to Merec.');
  bar.click();
  assert.equal(bar.getAttribute('aria-expanded'), 'true');
  assert.ok(root.querySelector('.wh-dialogue--mobile').classList.contains('wh-is-expanded'));
  assert.deepEqual(actions, [['dialogueToggle', true]]);
  api.setDialogueExpanded(false);
  assert.equal(bar.getAttribute('aria-expanded'), 'false');
  assert.equal(api.isDialogueExpanded(), false);
  assert.equal(actions.length, 1, 'programmatic changes do not echo an action');
  root.querySelector('.wh-dialogue--mobile .wh-dialogue__reply').click();
  key('KeyE');
  assert.deepEqual(actions.slice(1), [['reply', 'r-merec'], ['prompt']]);
  api.update(DEMO_MODEL, 'desktop');
  assert.ok(root.querySelector('.wh-hotbar'));
  assert.equal(root.querySelector('.wh-dialogue--mobile'), null);
  api.destroy();
});

test('actions: destroy() empties root and removes the window keydown listener; stylesheet added once', () => {
  const before = (win.listeners.keydown || []).length;
  const a = setup('desktop');
  const b = setup('mobile');
  assert.equal(win.listeners.keydown.length, before + 2);
  assert.equal(doc.head.querySelectorAll('link[data-wh-css="actions"]').length, 1);
  a.api.destroy();
  b.api.destroy();
  assert.equal(win.listeners.keydown.length, before);
  assert.equal(a.root.childNodes.length, 0);
  assert.equal(b.root.childNodes.length, 0);
  key('KeyE');
  assert.deepEqual(a.actions, []);
});

test('actions: every data-i18n key exists in en; a locale switch re-renders text and labels', () => {
  const keys = new Set();
  for (const layout of ['desktop', 'mobile']) {
    const { root, api } = setup(layout);
    allKeys(root).forEach((k) => keys.add(k));
    api.destroy();
  }
  for (const k of ['wh.prompt.aria', 'wh.dialogue.reply', 'wh.hotbar.map', 'wh.dialogue.speaker', 'wh.demo.line.mobile']) assert.ok(keys.has(k), k);
  for (const k of keys) assert.ok(k in en, `missing en key ${k}`);
  const { root, api, i18n } = setup('mobile');
  i18n.setLocale('ru');
  applyI18n(root, i18n);
  const ru = MESSAGES.ru;
  assert.equal(text(root, '.wh-prompt__text'), ru['wh.demo.prompt']);
  assert.equal(text(root, '.wh-dialogue__bar .wh-dialogue__speaker'), ru['wh.dialogue.speaker'].replace('{name}', ru['agent.ash']));
  assert.equal(root.querySelector('.wh-prompt').getAttribute('aria-label'), ru['wh.prompt.aria'].replace('{key}', 'E').replace('{text}', ru['wh.demo.prompt']));
  assert.equal(i18n.missing.size, 0);
  api.destroy();
});
