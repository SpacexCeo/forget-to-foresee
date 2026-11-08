// World HUD P3a: Log / Hints / Lore panel (desktop) and mobile tiles (docs/ui-world-hud.md §6.6, §7.4, §9.1).
// Runs in the dependency-free mini DOM from tests/lib/mini-dom.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './lib/mini-dom.mjs';

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
