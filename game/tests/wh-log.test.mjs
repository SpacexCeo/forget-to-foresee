// World HUD P3a: Log / Hints / Lore panel (desktop) and mobile tiles (docs/ui-world-hud.md §6.6, §7.4, §9.1).
// Runs in a tiny in-file DOM (no dependencies), like the rest of the UI tests.
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
const { mountLog, MAX_LOG_ROWS } = await import('../src/ui/world-hud/log.js');
const { DEMO_MODEL } = await import('../src/ui/world-hud/model.js');
const { createI18n, MESSAGES } = await import('../src/ui/i18n/index.js');
const { applyI18n } = await import('../src/ui/dom.js');

const en = MESSAGES.en;
const makeI18n = (locale = 'en') => createI18n({ messages: MESSAGES, locale });
function setup(layout = 'desktop', model = DEMO_MODEL) {
  const root = doc.body.appendChild(doc.createElement('div'));
  root.className = 'wh-root';
  const actions = [];
  const i18n = makeI18n();
  const api = mountLog(root, { model, i18n, layout, onAction: (...a) => actions.push(a) });
  return { root, api, actions, i18n };
}
const texts = (root, sel) => root.querySelectorAll(sel).map((e) => e.textContent);
const allKeys = (root) => root.querySelectorAll('[data-i18n], [data-i18n-attrs]').flatMap((e) => [
  ...(e.dataset.i18n ? [e.dataset.i18n] : []),
  ...(e.dataset.i18nAttrs ? Object.values(JSON.parse(e.dataset.i18nAttrs)) : []),
]);

test('log (desktop): mounts with DEMO_MODEL, Log tab selected, every row rendered newest first', () => {
  const { root, api, i18n } = setup('desktop');
  assert.ok(root.querySelector('.wh-log-root .wh-log'));
  const tabs = root.querySelectorAll('.wh-log__tab');
  assert.deepEqual(tabs.map((t) => t.dataset.tab), ['log', 'hints', 'lore']);
  assert.deepEqual(texts(root, '.wh-log__tab-label'), ['Log', 'Hints', 'Lore']);
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false']);
  assert.equal(root.querySelector('.wh-log__tabs').getAttribute('role'), 'tablist');
  const panel = root.querySelector('.wh-log__body');
  assert.equal(panel.getAttribute('role'), 'tabpanel');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[0].id);
  assert.deepEqual(texts(root, '.wh-log__time'), DEMO_MODEL.journal.log.map((e) => e.time));
  assert.deepEqual(texts(root, '.wh-log__text'), DEMO_MODEL.journal.log.map((e) => en[e.text.key]));
  assert.equal(texts(root, '.wh-log__text')[0], 'The bridge responds to your presence. A memory stirs.');
  assert.equal(root.querySelectorAll('.wh-log__bullet--diamond').length, 7);
  assert.equal(root.querySelector('.wh-log__list').getAttribute('aria-live'), 'off');
  assert.equal(api.tab, 'log');
  assert.equal(i18n.missing.size, 0);
  api.destroy();
});

test('log (desktop): tabs switch content (click, setTab, arrow keys) and report onAction("tab")', () => {
  const { root, api, actions } = setup('desktop');
  const tab = (id) => root.querySelector(`.wh-log__tab[data-tab="${id}"]`);
  tab('hints').click();
  assert.deepEqual(actions.at(-1), ['tab', 'hints']);
  assert.equal(tab('hints').getAttribute('aria-selected'), 'true');
  assert.equal(tab('log').getAttribute('aria-selected'), 'false');
  assert.deepEqual(texts(root, '.wh-log__text'), DEMO_MODEL.journal.hints.map((e) => en[e.text.key]));
  assert.equal(root.querySelectorAll('.wh-log__bullet--bulb').length, 2);
  // the divider shows only between two inactive neighbours
  assert.deepEqual(root.querySelectorAll('.wh-log__tab').map((t) => t.classList.contains('wh-log__tab--sep')), [false, false, false]);

  api.setTab('lore');
  assert.deepEqual(texts(root, '.wh-log__text'), DEMO_MODEL.journal.lore.map((e) => en[e.text.key]));
  assert.deepEqual(texts(root, '.wh-log__time'), ['', '']);
  assert.equal(actions.length, 1, 'setTab() is programmatic: no action');

  const n = actions.length;
  root.querySelector('.wh-log__tabs').dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.equal(api.tab, 'log', 'wraps from the last tab to the first');
  assert.deepEqual(actions.slice(n), [['tab', 'log']]);
  assert.equal(doc.activeElement, tab('log'));
  assert.deepEqual(root.querySelectorAll('.wh-log__tab').map((t) => t.classList.contains('wh-log__tab--sep')), [false, false, true]);
  api.setTab('nonsense');
  assert.equal(api.tab, 'log');
  api.destroy();
});

test('log (desktop): update() follows the model tab, keeps the DOM when nothing changed, caps rows', () => {
  const { root, api } = setup('desktop');
  const list = root.querySelector('.wh-log__list');
  api.update(DEMO_MODEL, 'desktop');
  assert.equal(root.querySelector('.wh-log__list'), list, 'same model: no re-render');
  api.update({ ...DEMO_MODEL, journal: { ...DEMO_MODEL.journal, tab: 'hints' } }, 'desktop');
  assert.equal(api.tab, 'hints');
  assert.equal(root.querySelectorAll('.wh-log__row').length, 2);
  const many = Array.from({ length: 55 }, (_, i) => ({ id: 'x' + i, time: '00:' + String(i).padStart(2, '0'), text: { key: 'wh.demo.log.1' } }));
  api.update({ ...DEMO_MODEL, journal: { ...DEMO_MODEL.journal, tab: 'log', log: many } }, 'desktop');
  assert.equal(root.querySelectorAll('.wh-log__row').length, MAX_LOG_ROWS);
  assert.equal(root.querySelector('.wh-log__time').textContent, '00:00', 'newest (first) entries are kept');
  api.destroy();
});

test('log (mobile): three tiles with the unread dot; taps report onAction("tile", id)', () => {
  const { root, api, actions } = setup('mobile');
  assert.equal(root.querySelector('.wh-log'), null, 'no desktop panel on mobile');
  const tiles = root.querySelectorAll('.wh-tiles .wh-tile');
  assert.deepEqual(tiles.map((t) => t.dataset.tile), ['signs', 'log', 'lore']);
  assert.deepEqual(texts(root, '.wh-tile__label'), ['Signs & Visions', 'Log', 'Lore']);
  assert.ok(root.querySelector('.wh-tile--log .wh-tile__dot'));
  assert.equal(root.querySelector('.wh-tile--log .sr-only').textContent, 'New entries');
  for (const t of tiles) t.click();
  assert.deepEqual(actions, [['tile', 'signs'], ['tile', 'log'], ['tile', 'lore']]);
  const before = root.querySelector('.wh-tile--log');
  api.update({ ...DEMO_MODEL, journal: { ...DEMO_MODEL.journal, unread: false } }, 'mobile');
  assert.equal(root.querySelector('.wh-tile__dot'), null);
  assert.equal(root.querySelector('.wh-tile--log .sr-only'), null);
  assert.equal(root.querySelector('.wh-tile--log'), before, 'tiles are kept (focus survives)');
  api.update(DEMO_MODEL, 'desktop');
  assert.ok(root.querySelector('.wh-log'));
  assert.equal(root.querySelector('.wh-tiles'), null);
  api.destroy();
});

test('log: stylesheet link added once; destroy() leaves root empty', () => {
  const a = setup('desktop');
  const b = setup('mobile');
  const links = doc.head.querySelectorAll('link[data-wh-css="log"]');
  assert.equal(links.length, 1);
  assert.match(links[0].getAttribute('href') || links[0].href, /log\.css$/);
  a.api.destroy();
  b.api.destroy();
  assert.equal(a.root.childNodes.length, 0);
  assert.equal(b.root.childNodes.length, 0);
});

test('log: every data-i18n key exists in en (both layouts, every tab) and the locale switch re-renders', () => {
  const keys = new Set();
  for (const layout of ['desktop', 'mobile']) {
    const { root, api } = setup(layout);
    for (const t of ['log', 'hints', 'lore']) { api.setTab(t); allKeys(root).forEach((k) => keys.add(k)); }
    api.destroy();
  }
  assert.ok(keys.size > 10);
  for (const k of keys) assert.ok(k in en, `missing en key ${k}`);
  const { root, api, i18n } = setup('desktop');
  i18n.setLocale('ru');
  applyI18n(root, i18n);
  assert.equal(root.querySelector('.wh-log__tab-label').textContent, MESSAGES.ru['wh.tabs.log']);
  assert.equal(root.querySelector('.wh-log__text').textContent, MESSAGES.ru['wh.demo.log.1']);
  assert.equal(i18n.missing.size, 0);
  api.destroy();
  assert.equal(Object.values(win.listeners).flat().length, 0, 'the log adds no window listeners');
});
