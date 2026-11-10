// The compact desktop skin (docs/ui-compact-hud.md): the journal as a row of tabs with an unread count, the short
// pass label, the stylesheet's contract. Runs in the mini DOM (tests/lib/mini-dom.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from './lib/mini-dom.mjs';

const { doc } = installDom();
const { mountLog } = await import('../src/ui/world-hud/log.js');
const { DEMO_MODEL } = await import('../src/ui/world-hud/model.js');
const { createI18n, MESSAGES } = await import('../src/ui/i18n/index.js');

function setup({ compact = true, model = DEMO_MODEL } = {}) {
  doc.body.classList.toggle('wh-compact', compact);
  const root = doc.body.appendChild(doc.createElement('div'));
  root.className = 'wh-root';
  const actions = [];
  const api = mountLog(root, { model, i18n: createI18n({ messages: MESSAGES, locale: 'en' }), layout: 'desktop', onAction: (...a) => actions.push(a) });
  const tabs = root.querySelectorAll('.wh-log__tab');
  return { root, api, actions, tabs, body: root.querySelector('.wh-log__body'), panel: root.querySelector('.wh-log'), count: root.querySelector('.wh-log__count') };
}
const entry = (id) => ({ id, time: 'T1', text: { key: 'wh.tabs.log' } });
const withLog = (ids) => ({ ...DEMO_MODEL, journal: { ...DEMO_MODEL.journal, tab: 'log', log: ids.map(entry) } });

test('compact: the journal starts as a row of tabs; the Log tab counts what has not been read', () => {
  const h = setup({ model: withLog(['a', 'b']) });
  assert.equal(h.api.collapsed, true);
  assert.ok(h.panel.classList.contains('wh-log--collapsed'));
  assert.ok(h.body.hasAttribute('hidden'));
  assert.equal(h.count.textContent, '2');
  assert.ok(!h.count.hasAttribute('hidden'));
  assert.deepEqual(h.tabs.map((t) => t.getAttribute('aria-expanded')), ['false', 'false', 'false']);
});

test('compact: a tab opens the journal on that tab, the same tab closes it, another tab switches', () => {
  const h = setup({ model: withLog(['a', 'b']) });
  h.tabs[0].click();
  assert.equal(h.api.collapsed, false);
  assert.ok(!h.body.hasAttribute('hidden'));
  assert.equal(h.tabs[0].getAttribute('aria-expanded'), 'true');
  assert.ok(h.count.hasAttribute('hidden'), 'reading the Log clears the count');
  h.tabs[1].click();
  assert.equal(h.api.collapsed, false);
  assert.equal(h.api.tab, 'hints');
  h.tabs[1].click();
  assert.equal(h.api.collapsed, true);
  assert.ok(h.body.hasAttribute('hidden'));
  assert.deepEqual(h.actions.map((a) => a.join(':')), ['tab:log', 'tab:hints', 'tab:hints']);
});

test('compact: entries that arrive while closed, or while another tab is open, are counted; opening Log clears them', () => {
  const h = setup({ model: withLog(['a']) });
  h.tabs[0].click(); h.tabs[0].click(); // read, then close
  assert.ok(h.count.hasAttribute('hidden'));
  h.api.update(withLog(['c', 'b', 'a']));
  assert.equal(h.count.textContent, '2');
  h.tabs[2].click(); // Lore open: the Log entries stay unread
  assert.equal(h.count.textContent, '2');
  h.tabs[0].click();
  assert.ok(h.count.hasAttribute('hidden'));
});

test('classic (no body.wh-compact): the journal is always open and shows no count', () => {
  const h = setup({ compact: false, model: withLog(['a', 'b']) });
  assert.equal(h.api.collapsed, false);
  assert.ok(!h.panel.classList.contains('wh-log--collapsed'));
  assert.ok(!h.body.hasAttribute('hidden'));
  assert.ok(h.count.hasAttribute('hidden'));
  h.tabs[0].click();
  assert.ok(!h.body.hasAttribute('hidden'), 'a click on the active tab does not close it');
  doc.body.classList.remove('wh-compact');
});

test('the short pass label exists in every play locale and differs from the long one', async () => {
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = (await import(`../src/play/locales/${l}.js`)).default;
    assert.ok(m['hub.dock.passShort'] && m['hub.dock.passShort'].length <= 12, l);
    assert.notEqual(m['hub.dock.passShort'], m['hub.dock.pass'], l);
  }
});

test('compact.css: every rule is scoped to body.wh-compact, so ?hud=classic and phones are untouched', () => {
  const css = readFileSync(new URL('../src/ui/world-hud/compact.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.replace(/@media[^{]+\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
  assert.ok(selectors.length > 40);
  for (const group of selectors) for (const sel of group.split(',')) assert.match(sel.trim(), /^body\.wh-compact/, sel);
  assert.match(css, /\.hub-pass-long\s*\{[^}]*clip-path/, 'the long pass label stays in the accessibility tree');
});
