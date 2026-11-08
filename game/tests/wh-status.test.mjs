// World HUD P1 (status & quest): mounts in a tiny dependency-free DOM, renders the mockup content
// in both layouts and both languages, re-renders on update, cleans up on destroy, and uses only
// existing `wh.*` keys (docs/ui-world-hud.md §9.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, createI18n } from '../src/ui/i18n/index.js';

// ---------------------------------------------------------------- minimal DOM

const camelToKebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class Node {
  constructor() { this.parentNode = null; this.childNodes = []; }
  get ownerDocument() { return globalThis.document; }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this; this.childNodes.push(c); return c;
  }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(n) {
    const p = this.parentNode; if (!p) return;
    if (n.parentNode) n.parentNode.removeChild(n);
    p.childNodes[p.childNodes.indexOf(this)] = n; n.parentNode = p; this.parentNode = null;
  }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text(String(v))); }
}
class Text extends Node { constructor(v) { super(); this.data = v; } get textContent() { return this.data; } }

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.listeners = new Map();
    this.rawHTML = '';
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => el.getAttribute('data-' + camelToKebab(String(k))) ?? undefined,
      set: (_, k, v) => { el.setAttribute('data-' + camelToKebab(String(k)), String(v)); return true; },
      deleteProperty: (_, k) => { el.attributes.delete('data-' + camelToKebab(String(k))); return true; },
      ownKeys: () => [...el.attributes.keys()].filter((a) => a.startsWith('data-')).map((a) => kebabToCamel(a.slice(5))),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    this.classList = {
      contains: (c) => el.className.split(/\s+/).includes(c),
      add: (c) => { if (!el.classList.contains(c)) el.className = (el.className + ' ' + c).trim(); },
      remove: (c) => { el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      toggle: (c, force) => { const on = force ?? !el.classList.contains(c); if (on) el.classList.add(c); else el.classList.remove(c); return on; },
    };
  }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  set innerHTML(v) { this.textContent = ''; this.rawHTML = String(v); }
  get innerHTML() { return this.rawHTML; }
  get children() { return this.childNodes.filter((c) => c instanceof Element); }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(fn); }
  removeEventListener(t, fn) { this.listeners.get(t)?.delete(fn); }
  dispatch(t, extra = {}) { const ev = { type: t, target: this, preventDefault() {}, ...extra }; for (const fn of this.listeners.get(t) || []) fn(ev); }
  click() { this.dispatch('click'); }
  focus() { globalThis.document.activeElement = this; }
  // compound selectors only (tag, .class, [attr], [attr="v"]) joined by commas; no combinators
  matches(sel) { return sel.split(',').some((s) => matchCompound(this, s.trim())); }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function matchCompound(el, sel) {
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m, any = false;
  while ((m = re.exec(sel))) {
    any = true;
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && !el.classList.contains(m[2])) return false;
    if (m[3] && (m[4] === undefined ? !el.hasAttribute(m[3]) : el.getAttribute(m[3]) !== m[4])) return false;
  }
  return any;
}

function installDom() {
  const doc = {
    activeElement: null,
    createElement: (t) => new Element(t),
    createTextNode: (v) => new Text(v),
    head: new Element('head'),
    body: new Element('body'),
    documentElement: new Element('html'),
    querySelector(sel) { return this.head.querySelector(sel) || this.body.querySelector(sel); },
  };
  globalThis.document = doc;
  return doc;
}

// ---------------------------------------------------------------- helpers

const doc = installDom();
const { mountStatus } = await import('../src/ui/world-hud/status.js');
const { DEMO_MODEL } = await import('../src/ui/world-hud/model.js');
const { applyI18n } = await import('../src/ui/dom.js');

const makeRoot = () => { const r = doc.createElement('div'); r.className = 'wh-root'; doc.body.appendChild(r); return r; };
const i18nFor = (locale) => createI18n({ messages: MESSAGES, locale });
const all = (el) => [el, ...el.querySelectorAll('[data-i18n], [data-i18n-attrs]')];
const keysUsed = (el) => {
  const keys = new Set();
  for (const n of all(el)) {
    if (n.dataset && n.dataset.i18n) keys.add(n.dataset.i18n);
    if (n.dataset && n.dataset.i18nAttrs) for (const k of Object.values(JSON.parse(n.dataset.i18nAttrs))) keys.add(k);
  }
  return keys;
};
const text = (el) => el.textContent.replace(/\s+/g, ' ');
const attrText = (el) => all(el).map((n) => n.getAttribute('aria-label') || '').join(' | ');

// ---------------------------------------------------------------- tests

test('status: adds its stylesheet once', () => {
  const root = makeRoot();
  const a = mountStatus(root, { model: DEMO_MODEL, i18n: i18nFor('en'), layout: 'desktop' });
  const b = mountStatus(root, { model: DEMO_MODEL, i18n: i18nFor('en'), layout: 'mobile' });
  const links = doc.head.querySelectorAll('link[data-wh-css="status"]');
  assert.equal(links.length, 1);
  assert.match(links[0].href, /status\.css$/);
  a.destroy(); b.destroy();
});

for (const locale of ['en', 'ru']) {
  test(`status (${locale}): desktop shows the trial card, quest banner and hint toast with the demo text`, () => {
    const i18n = i18nFor(locale);
    const root = makeRoot();
    const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout: 'desktop' });
    assert.equal(root.children.length, 1);
    assert.ok(s.el.classList.contains('wh-status'));
    for (const cls of ['wh-trial', 'wh-quest', 'wh-toast']) assert.ok(s.el.querySelector('.' + cls), cls);
    assert.equal(s.el.querySelector('.wh-topbar'), null);
    const t = i18n.t.bind(i18n);
    const shown = text(s.el);
    const expected = [
      t('wh.trial.title', { n: 13, total: 17 }), t('wh.trial.phase'), t('wh.trial.phase.explore'), t('wh.trial.skillTier'), '12',
      t('wh.trial.attempts'), t('wh.trial.attemptsValue', { n: 3, max: 3 }), t('wh.trial.arena'), t('wh.demo.arena'),
      t('wh.trial.progress'), t('wh.trial.progressValue', { done: 12, total: 17 }), t('wh.trial.percent', { n: 71 }),
      t('wh.quest.tag'), t('wh.demo.quest.title'), t('wh.demo.quest.body1'), t('wh.demo.quest.body2'), t('wh.demo.hint'),
    ];
    for (const e of expected) assert.ok(shown.includes(e), `missing "${e}"`);
    assert.equal(s.el.querySelector('.wh-trial__bar').querySelectorAll('.wh-bar__seg').length, 17);
    assert.equal(s.el.querySelector('.wh-trial__bar').querySelectorAll('.wh-bar__seg--on').length, 12);
    assert.equal(s.el.querySelector('.wh-toast').getAttribute('role'), 'status');
    assert.ok(attrText(s.el).includes(t('wh.trial.progressAria', { done: 12, total: 17, pct: 71 })));
    assert.deepEqual(i18n.missing.size, 0, [...i18n.missing].join(', '));
    s.destroy();
    assert.equal(root.childNodes.length, 0, 'destroy() empties the root');
  });

  test(`status (${locale}): mobile shows the top bar, quest card with dots and the compact trial card`, () => {
    const i18n = i18nFor(locale);
    const root = makeRoot();
    const actions = [];
    const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout: 'mobile', onAction: (...a) => actions.push(a) });
    for (const cls of ['wh-topbar', 'wh-quest--mobile', 'wh-quest__dots', 'wh-trial--mobile']) assert.ok(s.el.querySelector('.' + cls), cls);
    assert.equal(s.el.querySelector('.wh-trial'), null);
    assert.equal(s.el.querySelector('.wh-toast'), null);
    const t = i18n.t.bind(i18n);
    const shown = text(s.el);
    const expected = [
      t('wh.quest.tag'), t('wh.demo.quest.title'), t('wh.demo.quest.body1'), t('wh.demo.quest.bodyShort2'),
      t('wh.trial.title', { n: 13, total: 17 }), t('wh.trial.phase.explore'), t('wh.trial.percent', { n: 71 }),
      t('wh.trial.attempts'), t('wh.trial.attemptsValue', { n: 3, max: 3 }), t('wh.trial.skillTierShort'), '12',
    ];
    for (const e of expected) assert.ok(shown.includes(e), `missing "${e}"`);
    const labels = attrText(s.el);
    for (const k of ['wh.top.menu', 'wh.top.journal', 'wh.top.settings']) assert.ok(labels.includes(t(k)), k);
    // top bar, quest card and dots report intents
    s.el.querySelector('[data-wh-key="top-menu"]').click();
    s.el.querySelector('[data-wh-key="top-settings"]').click();
    s.el.querySelector('.wh-quest--mobile').click();
    const dots = s.el.querySelectorAll('.wh-quest__dot');
    assert.equal(dots.length, DEMO_MODEL.quests.length);
    assert.equal(dots[0].getAttribute('aria-selected'), 'true');
    dots[2].click();
    assert.deepEqual(actions, [['top', 'menu'], ['top', 'settings'], ['quest'], ['questDot', 2]]);
    assert.equal(s.el.querySelector('.wh-trial--mobile').querySelectorAll('.wh-bar__seg').length, 8);
    assert.equal(s.el.querySelector('.wh-trial--mobile').querySelectorAll('.wh-bar__seg--on').length, 6);
    assert.deepEqual(i18n.missing.size, 0, [...i18n.missing].join(', '));
    s.destroy();
    assert.equal(root.childNodes.length, 0, 'destroy() empties the root');
  });
}

test('status: every data-i18n key it renders exists in en and ru', () => {
  const i18n = i18nFor('en');
  for (const layout of ['desktop', 'mobile']) {
    const root = makeRoot();
    const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout });
    const keys = keysUsed(s.el);
    assert.ok(keys.size > 5);
    for (const k of keys) {
      assert.ok(Object.hasOwn(MESSAGES.en, k), `en is missing ${k}`);
      assert.ok(Object.hasOwn(MESSAGES.ru, k), `ru is missing ${k}`);
    }
    s.destroy();
  }
});

test('status: update() is cheap when nothing changed and re-renders only what did', () => {
  const i18n = i18nFor('en');
  const root = makeRoot();
  const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout: 'desktop' });
  const trial = s.el.querySelector('.wh-trial');
  const quest = s.el.querySelector('.wh-quest');
  const toast = s.el.querySelector('.wh-toast');
  s.update(DEMO_MODEL);
  assert.equal(s.el.querySelector('.wh-trial'), trial, 'same model → same nodes');

  // hiding the hint toggles the toast in place (so it can fade)
  const hidden = { ...DEMO_MODEL, hint: { ...DEMO_MODEL.hint, visible: false } };
  s.update(hidden);
  assert.equal(s.el.querySelector('.wh-toast'), toast);
  assert.ok(toast.classList.contains('wh-toast--hidden'));
  assert.equal(toast.getAttribute('aria-hidden'), 'true');

  // a new trial rebuilds the card only
  const next = { ...hidden, trial: { ...DEMO_MODEL.trial, n: 14, phase: 'interpret', progressDone: 13, progressPct: 76 } };
  s.update(next);
  assert.notEqual(s.el.querySelector('.wh-trial'), trial);
  assert.equal(s.el.querySelector('.wh-quest'), quest);
  assert.ok(text(s.el).includes(i18n.t('wh.trial.title', { n: 14, total: 17 })));
  assert.ok(text(s.el).includes(i18n.t('wh.trial.phase.interpret')));
  assert.equal(s.el.querySelector('.wh-trial__bar').querySelectorAll('.wh-bar__seg--on').length, 13);

  // switching quests swaps the banner content
  s.update({ ...next, questIndex: 1 });
  assert.ok(text(s.el).includes(i18n.t('wh.demo.quest2.title')));
  assert.ok(!text(s.el).includes(i18n.t('wh.demo.quest.title')));
  s.destroy();
});

test('status: layout switch re-renders for the other layout and keeps working', () => {
  const i18n = i18nFor('en');
  const root = makeRoot();
  const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout: 'desktop' });
  s.update(DEMO_MODEL, 'mobile');
  assert.ok(s.el.querySelector('.wh-topbar'));
  assert.equal(s.el.querySelector('.wh-trial'), null);
  s.update({ ...DEMO_MODEL, questIndex: 2 });
  assert.equal(s.el.querySelectorAll('.wh-quest__dot')[2].getAttribute('aria-selected'), 'true');
  s.update(DEMO_MODEL, 'desktop');
  assert.ok(s.el.querySelector('.wh-trial'));
  assert.equal(s.el.querySelector('.wh-topbar'), null);
  s.destroy();
  assert.equal(root.childNodes.length, 0);
});

test('status: a language switch re-renders chrome and narrative in place', () => {
  const i18n = i18nFor('en');
  const root = makeRoot();
  const s = mountStatus(root, { model: DEMO_MODEL, i18n, layout: 'desktop' });
  const trial = s.el.querySelector('.wh-trial');
  i18n.setLocale('ru');
  applyI18n(root, i18n); // what the orchestrator's bindI18n does on a locale change
  assert.equal(s.el.querySelector('.wh-trial'), trial, 'nodes are kept');
  assert.ok(text(s.el).includes(MESSAGES.ru['wh.demo.quest.title']));
  assert.ok(text(s.el).includes('Испытание 13 из 17'));
  s.destroy();
});
