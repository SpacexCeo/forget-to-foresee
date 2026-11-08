// World HUD P2 — Signs & Visions (docs/ui-world-hud.md §6.4, §6.5, §7.7, §7.8, §9.1).
// Runs the real module in Node against a tiny in-file DOM (no jsdom/linkedom dependency): mounts
// with DEMO_MODEL in both layouts, checks the demo texts, the filter chips, open/close/Esc/V,
// focus hand-off, actions, the locale switch, destroy() cleanup and the i18n keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- minimal DOM

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class Node {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.childNodes.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? this.ownerDocument.createTextNode(c) : c); }
  remove() {
    if (!this.parentNode) return;
    const a = this.parentNode.childNodes; a.splice(a.indexOf(this), 1); this.parentNode = null;
    const doc = this.ownerDocument;
    if (doc.activeElement && (doc.activeElement === this || this.contains(doc.activeElement))) doc.activeElement = doc.body;
  }
  replaceWith(n) { const p = this.parentNode; const a = p.childNodes; const i = a.indexOf(this); if (n.parentNode) n.remove(); a[i] = n; n.parentNode = p; this.parentNode = null; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of [...this.childNodes]) c.remove(); if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))); }
}

class Text extends Node {
  constructor(doc, data) { super(doc); this.data = data; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

/** Opaque markup set through innerHTML (inline SVG icons); not parsed. */
class Raw extends Node {
  constructor(doc, html) { super(doc); this.html = html; }
  get textContent() { return ''; }
}

class Element extends Node {
  constructor(doc, tag) {
    super(doc);
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.listeners = new Map();
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === 'string' ? el.getAttribute('data-' + kebab(k)) ?? undefined : undefined),
      set: (_, k, v) => { el.setAttribute('data-' + kebab(k), String(v)); return true; },
      deleteProperty: (_, k) => { el.removeAttribute('data-' + kebab(k)); return true; },
      ownKeys: () => [...el.attributes.keys()].filter((a) => a.startsWith('data-')).map((a) => camel(a.slice(5))),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  }
  get children() { return this.childNodes.filter((c) => c instanceof Element); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean));
    return {
      contains: (c) => set().has(c),
      add: (...cs) => { const s = set(); cs.forEach((c) => s.add(c)); this.className = [...s].join(' '); },
      remove: (...cs) => { const s = set(); cs.forEach((c) => s.delete(c)); this.className = [...s].join(' '); },
      toggle: (c, on) => { const s = set(); const v = on ?? !s.has(c); if (v) s.add(c); else s.delete(c); this.className = [...s].join(' '); return v; },
    };
  }
  get id() { return this.getAttribute('id') || ''; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  set innerHTML(v) { this.textContent = ''; this.appendChild(new Raw(this.ownerDocument, v)); }
  get innerHTML() { return this.childNodes.map((c) => c.html || '').join(''); }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(fn); }
  removeEventListener(t, fn) { this.listeners.get(t)?.delete(fn); }
  dispatchEvent(e) {
    e.target = e.target || this;
    for (let n = this; n && !e.stopped; n = n.parentNode) { e.currentTarget = n; for (const fn of [...(n.listeners?.get(e.type) || [])]) fn.call(n, e); }
    if (this.ownerDocument.defaultView && !e.stopped) this.ownerDocument.defaultView.dispatchEvent(e, true);
    return !e.defaultPrevented;
  }
  click() { this.dispatchEvent(new Event('click')); }
  focus(opts) { this.ownerDocument.activeElement = this; this.lastFocusOptions = opts; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  get disabled() { return this.hasAttribute('disabled'); }
  querySelectorAll(sel) { const out = []; const m = compile(sel); walk(this, (n) => { if (m(n)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function walk(root, fn) { for (const c of root.childNodes) if (c instanceof Element) { fn(c); walk(c, fn); } }

/** Selector lists of compound selectors: tag, .class, #id, [attr], [attr="v"]. No combinators. */
function compile(sel) {
  const parts = sel.split(',').map((s) => s.trim()).map((s) => {
    const tests = [];
    const re = /^([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
    let m, used = 0;
    while ((m = re.exec(s))) {
      used += m[0].length;
      if (m[1]) { const t = m[1].toUpperCase(); tests.push((n) => n.tagName === t); }
      else if (m[2]) { const c = m[2]; tests.push((n) => n.classList.contains(c)); }
      else if (m[3]) { const i = m[3]; tests.push((n) => n.id === i); }
      else { const [a, v] = [m[4], m[5]]; tests.push((n) => n.hasAttribute(a) && (v === undefined || n.getAttribute(a) === v)); }
    }
    if (used !== s.length) throw new Error('test DOM: unsupported selector ' + s);
    return (n) => tests.every((t) => t(n));
  });
  return (n) => parts.some((p) => p(n));
}

class Event {
  constructor(type, init = {}) { Object.assign(this, init); this.type = type; this.defaultPrevented = false; this.stopped = false; }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
}

function makeDocument() {
  const win = {
    listeners: new Map(),
    addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(fn); },
    removeEventListener(t, fn) { this.listeners.get(t)?.delete(fn); },
    dispatchEvent(e, bubbled) { if (!bubbled) e.target = e.target || doc.body; for (const fn of [...(this.listeners.get(e.type) || [])]) fn(e); return !e.defaultPrevented; },
    count() { let n = 0; for (const s of this.listeners.values()) n += s.size; return n; },
  };
  const doc = new Node(null);
  doc.ownerDocument = doc;
  doc.defaultView = win;
  doc.createElement = (t) => new Element(doc, t);
  doc.createTextNode = (s) => new Text(doc, s);
  doc.documentElement = doc.appendChild(new Element(doc, 'html'));
  doc.head = doc.documentElement.appendChild(new Element(doc, 'head'));
  doc.body = doc.documentElement.appendChild(new Element(doc, 'body'));
  doc.activeElement = doc.body;
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  doc.querySelector = (s) => doc.documentElement.querySelector(s);
  return doc;
}

const document = makeDocument();
globalThis.document = document;
globalThis.window = document.defaultView;

// ---------------------------------------------------------------- module under test

const { mountSigns } = await import('../src/ui/world-hud/signs.js');
const { DEMO_MODEL } = await import('../src/ui/world-hud/model.js');
const { createI18n } = await import('../src/ui/i18n/i18n.js');
const { MESSAGES } = await import('../src/locales/index.js');
const { applyI18n } = await import('../src/ui/dom.js');

function setup(layout, extra = {}) {
  const i18n = createI18n({ messages: MESSAGES, locale: 'en' });
  const root = document.createElement('div');
  root.className = 'wh-root';
  document.body.appendChild(root);
  const actions = [];
  const api = mountSigns(root, { model: DEMO_MODEL, i18n, layout, onAction: (...a) => actions.push(a), ...extra });
  return { i18n, root, api, actions };
}
const key = (k, init = {}) => window.dispatchEvent(new Event('keydown', { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, ...init }));
const cards = (root) => root.querySelectorAll('.wh-sign');
const chip = (root, f) => root.querySelector(`[data-filter="${f}"]`);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const DEMO_TEXTS = [
  'Signs and Visions', 'Read the signs, interpret their meaning, and find what lies beyond.',
  'All Signs (4)', 'Active', 'Resolved', 'Anchors',
  'Sign #10', 'Sign #11', 'Sign #13', 'Sign #9', 'Elemental', 'Conditional',
  'Shell stability', 'Anchor strength', 'Power range', 'Delay',
  '34%', '+5%', '20 – 51%', '4.6 s – 47.6 s', '45%', '+3%', '10 – 42%', '3.9 s – 62.9 s', '39%', '10 – 39%', '4.1 s – 55.2 s',
  'Anchor: Shell III, Tiers 11–13', 'Anchor: Shell III, Tiers 14–15', 'Anchor: Shell III, Tier 16',
];

// ---------------------------------------------------------------- tests

for (const layout of ['desktop', 'mobile']) {
  test(`signs (${layout}): mounts with DEMO_MODEL and shows every demo text`, () => {
    const { root, api } = setup(layout);
    assert.equal(root.children.length, 1);
    assert.ok(api.el.classList.contains('wh-signs-root'));
    assert.equal(api.el.dataset.layout, layout);
    const panel = root.querySelector(layout === 'desktop' ? '.wh-signs' : '.wh-sheet');
    assert.ok(panel, 'panel element for the layout');
    assert.equal(root.querySelectorAll(layout === 'desktop' ? '.wh-sheet' : '.wh-signs').length, 0, 'the other layout is not rendered');
    const text = norm(api.el.textContent);
    for (const t of DEMO_TEXTS) assert.ok(text.includes(t), `"${t}" is rendered`);
    assert.equal(cards(root).length, 4);
    assert.equal(root.querySelectorAll('.wh-signs__chip').length, 4);
    assert.equal(chip(root, 'all').getAttribute('aria-pressed'), 'true');
    assert.ok(document.querySelector('link[data-wh-css="signs"]'), 'stylesheet link added once');
    assert.match(document.querySelector('link[data-wh-css="signs"]').href, /signs\.css$/);
    api.destroy();
  });
}

test('signs: desktop is open by default, mobile sheet is closed (modal dialog markup)', () => {
  const d = setup('desktop');
  assert.equal(d.api.isOpen(), true);
  assert.equal(d.root.querySelector('.wh-signs').dataset.open, 'true');
  assert.equal(d.root.querySelector('.wh-signs__close').textContent.includes('Close'), true);
  assert.ok(d.root.querySelector('.wh-signs__esc.wh-kbd'), 'Esc key hint');
  d.api.destroy();

  const m = setup('mobile');
  assert.equal(m.api.isOpen(), false);
  const sheet = m.root.querySelector('.wh-sheet');
  assert.equal(sheet.dataset.open, 'false');
  assert.ok(sheet.hasAttribute('inert'));
  assert.equal(sheet.getAttribute('role'), 'dialog');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  const title = m.root.querySelector('.wh-signs__title');
  assert.equal(sheet.getAttribute('aria-labelledby'), title.id);
  assert.ok(m.root.querySelector('.wh-sheet__handle'));
  assert.ok(m.root.querySelector('.wh-sheet__scrim'));
  assert.ok(m.root.querySelector('.wh-btn-icon--round.wh-signs__close'));
  m.api.destroy();
});

test('signs: filter chips really filter and report onAction("filter", id)', () => {
  const { root, api, actions } = setup('desktop');
  const ids = () => cards(root).map((c) => c.dataset.sign);
  chip(root, 'resolved').click();
  assert.deepEqual(ids(), ['sign-9']);
  assert.equal(chip(root, 'resolved').getAttribute('aria-pressed'), 'true');
  assert.equal(chip(root, 'all').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(actions.at(-1), ['filter', 'resolved']);
  chip(root, 'active').click();
  assert.deepEqual(ids(), ['sign-10', 'sign-11', 'sign-13']);
  chip(root, 'anchors').click();
  assert.deepEqual(ids(), ['sign-10', 'sign-11', 'sign-13']);
  chip(root, 'all').click();
  assert.deepEqual(ids(), ['sign-10', 'sign-11', 'sign-13', 'sign-9']);
  const n = actions.length;
  chip(root, 'all').click();
  assert.equal(actions.length, n, 'clicking the pressed chip is a no-op');
  api.destroy();
});

test('signs: a card click or Enter reports onAction("sign", id)', () => {
  const { root, api, actions } = setup('desktop');
  const c = cards(root)[0];
  assert.equal(c.getAttribute('role'), 'button');
  assert.equal(c.getAttribute('tabindex'), '0');
  c.click();
  assert.deepEqual(actions.at(-1), ['sign', 'sign-10']);
  const ev = new Event('keydown', { key: 'Enter' });
  cards(root)[1].dispatchEvent(ev);
  assert.deepEqual(actions.at(-1), ['sign', 'sign-11']);
  assert.ok(ev.defaultPrevented);
  api.destroy();
});

test('signs: V toggles, Escape closes while open, focus moves in and back to the opener', () => {
  const { root, api, actions } = setup('mobile');
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  key('v');
  assert.equal(api.isOpen(), true);
  assert.equal(root.querySelector('.wh-sheet').dataset.open, 'true');
  assert.equal(root.querySelector('.wh-sheet').hasAttribute('inert'), false);
  assert.equal(document.activeElement, root.querySelector('.wh-signs__close'), 'focus moves to the close button');
  assert.deepEqual(actions.at(-1), ['signsOpen']);
  key('Escape');
  assert.equal(api.isOpen(), false);
  assert.equal(document.activeElement, opener, 'focus returns to the opener');
  assert.deepEqual(actions.at(-1), ['signsClose']);
  // Escape while closed does nothing (and does not swallow the key for others).
  const esc = new Event('keydown', { key: 'Escape' });
  window.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, false);
  // Modifiers and typing targets are ignored.
  key('v', { ctrlKey: true });
  assert.equal(api.isOpen(), false);
  const input = document.createElement('input');
  document.body.appendChild(input);
  window.dispatchEvent(new Event('keydown', { key: 'v', code: 'KeyV', target: input }));
  assert.equal(api.isOpen(), false);
  // Programmatic open/close/toggle and the close button / scrim.
  api.toggle();
  assert.equal(api.isOpen(), true);
  root.querySelector('.wh-signs__close').click();
  assert.equal(api.isOpen(), false);
  api.open();
  root.querySelector('.wh-sheet__scrim').click();
  assert.equal(api.isOpen(), false);
  key('V');
  key('V');
  assert.equal(api.isOpen(), false, 'V toggles back');
  api.destroy();
  opener.remove(); input.remove();
});

test('signs: desktop Close button closes the panel and V reopens it', () => {
  const { root, api } = setup('desktop');
  root.querySelector('.wh-signs__close').click();
  assert.equal(api.isOpen(), false);
  assert.equal(root.querySelector('.wh-signs').dataset.open, 'false');
  assert.ok(root.querySelector('.wh-signs').hasAttribute('inert'));
  key('v');
  assert.equal(api.isOpen(), true);
  api.destroy();
});

test('signs: update() re-renders for a new model and for a layout change, keeping state', () => {
  const { root, api } = setup('desktop');
  chip(root, 'resolved').click();
  const next = { ...DEMO_MODEL, signs: { ...DEMO_MODEL.signs, items: DEMO_MODEL.signs.items.map((s) => ({ ...s, state: 'resolved' })) } };
  api.update(next);
  assert.equal(cards(root).length, 4, 'filter state kept, new items rendered');
  assert.equal(chip(root, 'resolved').getAttribute('aria-pressed'), 'true');
  const before = root.querySelector('.wh-signs');
  api.update(next);
  assert.equal(root.querySelector('.wh-signs'), before, 'same model: no rebuild');
  api.update(next, 'mobile');
  assert.ok(root.querySelector('.wh-sheet'));
  assert.equal(root.querySelector('.wh-signs'), null);
  assert.equal(api.isOpen(), false, 'the sheet starts closed');
  assert.equal(cards(root)[0].classList.contains('wh-sign--mobile'), true);
  api.update(next, 'desktop');
  assert.equal(api.isOpen(), true, 'desktop open state restored');
  api.update({ ...next, signs: { ...next.signs, filter: 'anchors' } });
  assert.equal(chip(root, 'anchors').getAttribute('aria-pressed'), 'true', 'a new model filter is adopted');
  api.destroy();
});

test('signs: a locale switch re-renders chrome and narrative text in place', () => {
  const { root, api, i18n } = setup('desktop');
  i18n.setLocale('ru');
  applyI18n(root, i18n); // the orchestrator's bindI18n does this on .wh-root
  const text = norm(api.el.textContent);
  for (const t of ['Знаки и видения', 'Все знаки (4)', 'Знак №10', 'Стихийный', 'Якорь: Раковина III, уровни 11–13', '4,6 с – 47,6 с']) {
    assert.ok(text.includes(t), `"${t}" is rendered in Russian`);
  }
  assert.ok(!text.includes('Tiers'), 'no stale English inside the anchor pill');
  api.destroy();
});

test('signs: destroy() empties root and removes the window listeners', () => {
  const baseline = window.count();
  for (const layout of ['desktop', 'mobile']) {
    const { root, api } = setup(layout);
    assert.ok(window.count() > baseline, 'listens on window while mounted');
    api.destroy();
    assert.equal(root.childNodes.length, 0, 'root is empty');
    assert.equal(window.count(), baseline, 'window listeners removed');
    key('v');
    assert.equal(api.isOpen(), layout === 'desktop', 'no reaction after destroy');
    root.remove();
  }
});

test('signs: every data-i18n key exists in en and ru', () => {
  for (const layout of ['desktop', 'mobile']) {
    const { root, api } = setup(layout);
    const keys = new Set();
    for (const el of [root, ...root.querySelectorAll('[data-i18n]')]) if (el.dataset.i18n) keys.add(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-attrs]')) for (const k of Object.values(JSON.parse(el.dataset.i18nAttrs))) keys.add(k);
    assert.ok(keys.size >= 15, 'keys collected');
    for (const k of keys) {
      assert.ok(k in MESSAGES.en, `en has ${k}`);
      assert.ok(k in MESSAGES.ru, `ru has ${k}`);
    }
    api.destroy();
  }
});
