// World HUD phone layout (src/ui/world-hud/mobile.js, docs/ui-mobile-hud.md): Exploration shows the status
// bar, the Shell selector, one objective line, Iris's line and the navigation; Command opens the quests or
// journal sheet with the navigation still there. Rendered in the dependency-free mini DOM in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './lib/mini-dom.mjs';
import { MESSAGES, createI18n } from '../src/ui/i18n/index.js';

const { doc, win } = installDom();
doc.defaultView = win; // signs.js reads doc.defaultView (as wh-signs.test does)
win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
const blurable = (el) => { if (el && typeof el.blur !== 'function') el.blur = () => { doc.activeElement = doc.body; }; return el; };
const origCreate = doc.createElement.bind(doc);
doc.createElement = (t) => blurable(origCreate(t));
blurable(doc.body);
const { mountMobileHud, navItems, irisVisible, showsAttention } = await import('../src/ui/world-hud/mobile.js');
const { mountWorldHud, DEMO_MODEL, MOBILE_QUERY } = await import('../src/ui/world-hud/index.js');
const { applyI18n } = await import('../src/ui/dom.js');

const i18n = createI18n({ messages: MESSAGES, locale: 'en' });
const HUB = { shells: [{ n: 1, signs: 1 }, { n: 2, signs: 0 }, { n: 3, signs: 0 }, { n: 4, signs: 0 }], inShell: false, shell: null, busy: false, canPass: true, visible: true };
const STATS = [
  { id: 'silk', icon: 'sparkle', label: 'wh.trial.silk', value: { key: 'wh.raw', args: { text: '63' } } },
  { id: 'attention', icon: 'bookmark', label: 'wh.trial.attention', value: { key: 'wh.trial.attemptsValue', args: { n: 3, max: 3 } } },
];
const model = (extra = {}) => ({ ...DEMO_MODEL, trial: { ...DEMO_MODEL.trial, mobileStats: STATS }, hub: HUB, ...extra });
const root = () => { const r = document.createElement('div'); r.className = 'wh-root'; document.body.appendChild(r); return r; };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('mobile: Exploration renders the slim status bar, the Shell selector, one objective line and the nav', () => {
  const actions = [];
  const r = root();
  const m = mountMobileHud(r, { model: model(), i18n, onAction: (...a) => actions.push(a) });
  assert.equal(m.el.dataset.mode, 'explore');
  const status = m.el.querySelector('.wh-m-status');
  assert.ok(status);
  assert.match(text(status.querySelector('.wh-m-status__title')), /^Trial 13\/17$/);
  assert.equal(status.querySelectorAll('.wh-bar__seg').length, 8);
  assert.equal(status.querySelectorAll('.wh-bar__seg--on').length, 6, '12/17 → 6 of 8 cells');
  assert.equal(text(status.querySelector('.wh-m-stat--silk .wh-m-stat__num')), '63');
  assert.equal(text(status.querySelector('.wh-m-stat--attention .wh-m-stat__num')), '3 / 3');
  // Shell selector: four pills, the one with a sign is marked, tapping flies
  const shells = m.el.querySelectorAll('.wh-m-shell');
  assert.equal(shells.length, 4);
  assert.ok(shells[0].classList.contains('wh-m-shell--wait'));
  assert.equal(shells[0].getAttribute('aria-label'), 'Shell I: a sign awaits');
  assert.equal(shells[1].getAttribute('aria-label'), 'Shell II: quiet');
  shells[2].click();
  assert.deepEqual(actions.at(-1), ['shell', 3]);
  // the objective is one line until expanded; the expanded body carries the full text and "take me there"
  const head = m.el.querySelector('.wh-m-objective__head');
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.equal(text(m.el.querySelector('.wh-m-objective__title')), 'Ash Has Turned Away: Learn Ash’s Key');
  head.click();
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  assert.ok(m.el.querySelector('.wh-m-objective').classList.contains('wh-is-expanded'));
  m.el.querySelector('.wh-m-btn--go').click();
  assert.deepEqual(actions.at(-1), ['quest']);
  // navigation: quests, signs, map (the demo hotbar has it), journal; no Memories (not in the demo hotbar)
  assert.deepEqual([...m.el.querySelectorAll('.wh-m-nav__item')].map((b) => b.dataset.nav), ['quests', 'signs', 'map', 'log']);
  assert.ok(m.el.querySelector('.wh-m-nav__item--unread'), 'the journal has unread entries');
  // Iris's bar: the demo line from Ash with a reply, so the bar is open and the reply is one tap away
  const iris = m.el.querySelector('.wh-m-iris');
  assert.ok(iris.classList.contains('wh-is-expanded'));
  assert.equal(text(iris.querySelector('.wh-m-iris__speaker')), 'Ash:');
  iris.querySelector('.wh-m-reply').click();
  assert.deepEqual(actions.at(-1), ['reply', 'r-merec']);
  // the contextual prompt
  const prompt = m.el.querySelector('.wh-m-prompt');
  assert.ok(prompt && !prompt.classList.contains('wh-is-hidden'));
  prompt.click();
  assert.deepEqual(actions.at(-1), ['prompt']);
  m.destroy();
  assert.equal(r.querySelector('.wh-m'), null);
});

test('mobile: the quests sheet is Command mode — nav highlighted, Shells listed, pass and go, Escape closes', () => {
  const actions = [];
  const r = root();
  const m = mountMobileHud(r, { model: model(), i18n, onAction: (...a) => actions.push(a) });
  const quests = m.el.querySelector('[data-nav="quests"]');
  quests.click();
  assert.equal(m.sheet, 'quests');
  assert.equal(m.el.dataset.mode, 'command');
  assert.equal(quests.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(actions.at(-1), ['sheetOpen', 'quests']);
  const panel = m.el.querySelector('.wh-m-sheet');
  assert.equal(panel.dataset.open, 'true');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.ok(!panel.hasAttribute('inert'));
  assert.equal(text(panel.querySelector('.wh-m-sheet__title')), 'Quests');
  assert.equal(document.activeElement, panel.querySelector('.wh-m-sheet__close'), 'focus moves into the sheet');
  assert.equal(panel.querySelectorAll('.wh-m-row').length, 4);
  assert.equal(text(panel.querySelector('.wh-m-row--wait .wh-m-row__text')), 'Shell I: a sign awaits');
  assert.equal(text(panel.querySelector('[data-wh-key="pass"]')), 'TLet trial 13 pass');
  panel.querySelector('[data-wh-key="pass"]').click();
  assert.equal(m.sheet, null, 'a command closes the sheet');
  assert.deepEqual(actions.at(-1), ['pass']);
  assert.equal(m.el.dataset.mode, 'explore');
  // the same tap again toggles; Escape closes; the Shell row flies
  quests.click();
  assert.equal(m.sheet, 'quests');
  assert.equal(m.handleKey('Escape'), true);
  assert.equal(m.sheet, null);
  assert.equal(m.handleKey('Escape'), false);
  quests.click();
  m.el.querySelector('.wh-m-sheet [data-shell="2"]').click();
  assert.deepEqual(actions.at(-1), ['shell', 2]);
  assert.equal(m.sheet, null);
  m.destroy();
});

test('mobile: the journal sheet has the three tabs and the model rows; Signs, Map and Memories go to the host', () => {
  const actions = [];
  const r = root();
  const m = mountMobileHud(r, { model: model(), i18n, onAction: (...a) => actions.push(a) });
  m.el.querySelector('[data-nav="log"]').click();
  assert.equal(m.sheet, 'log');
  const body = m.el.querySelector('.wh-m-sheet__body');
  assert.deepEqual([...body.querySelectorAll('.wh-m-tab')].map((b) => text(b)), ['Log', 'Hints', 'Lore']);
  assert.equal(body.querySelectorAll('.wh-m-log__row').length, DEMO_MODEL.journal.log.length);
  assert.equal(text(body.querySelector('.wh-m-log__time')), '13:48');
  body.querySelector('[data-tab="lore"]').click();
  assert.equal(body.querySelector('[data-tab="lore"]').getAttribute('aria-selected'), 'true');
  assert.equal(body.querySelectorAll('.wh-m-log__row').length, DEMO_MODEL.journal.lore.length);
  // host surfaces: the nav reports them and the host highlights through setActive
  m.el.querySelector('[data-nav="signs"]').click();
  assert.deepEqual(actions.slice(-3), [['nav', 'signs'], ['sheetClose', 'log'], ['tile', 'signs']]);
  assert.equal(m.sheet, null, 'another surface closes the own sheet');
  m.setActive('signs');
  assert.equal(m.el.querySelector('[data-nav="signs"]').getAttribute('aria-pressed'), 'true');
  assert.equal(m.el.dataset.mode, 'command');
  m.el.querySelector('[data-nav="signs"]').click();
  assert.deepEqual(actions.at(-1), ['signsClose'], 'a second tap closes the open surface');
  m.setActive(null);
  m.el.querySelector('[data-nav="map"]').click();
  assert.deepEqual(actions.at(-1), ['hotkey', 'map']);
  m.el.querySelector('.wh-m-menu').click();
  assert.deepEqual(actions.at(-1), ['top', 'menu']);
  m.destroy();
});

test('mobile: updates patch in place — prompt visibility, Iris idle, a Shell entered, attention by layer', () => {
  const r = root();
  const base = model({ mode: 'novice', unlocks: { memory: false, words: false, tension: false } });
  const m = mountMobileHud(r, { model: base, i18n });
  assert.equal(m.el.querySelector('.wh-m-stat--attention'), null, 'L0 shows silk only');
  assert.ok(m.el.querySelector('.wh-m-stat--silk'));
  const prompt = m.el.querySelector('.wh-m-prompt');
  m.update({ ...base, prompt: { ...base.prompt, visible: false } });
  assert.ok(prompt.classList.contains('wh-is-hidden'), 'the same prompt toggles without a rebuild');
  assert.equal(prompt.getAttribute('aria-hidden'), 'true');
  // Iris idle: the bar leaves the screen
  m.update({ ...base, dialogue: { speaker: 'iris', line: { key: 'wh.dialogue.idle' }, replies: [] } });
  assert.equal(m.el.querySelector('.wh-m-iris'), null);
  assert.equal(irisVisible({ dialogue: { speaker: 'iris', line: { key: 'wh.dialogue.idle' }, replies: [] } }), false);
  assert.equal(irisVisible(DEMO_MODEL), true);
  // inside Shell II: that pill is current, the others wait
  m.update({ ...base, hub: { ...HUB, inShell: true, shell: 2 } });
  const shells = m.el.querySelectorAll('.wh-m-shell');
  assert.equal(shells[1].getAttribute('aria-current'), 'location');
  assert.ok(shells[1].classList.contains('wh-m-shell--here'));
  assert.ok(shells[0].hasAttribute('disabled'));
  // Pro, or L1, shows attention; Memories joins the nav once the hotbar has it
  m.update({ ...base, mode: 'pro' });
  assert.ok(m.el.querySelector('.wh-m-stat--attention'));
  assert.equal(showsAttention({ mode: 'novice', unlocks: { memory: true } }), true);
  assert.deepEqual(navItems({ hotbar: [{ id: 'memory' }, { id: 'signs' }], journal: { unread: false } }).map((x) => x.id), ['quests', 'signs', 'memory', 'log']);
  // no hub (walk mode): no Shell selector
  m.update({ ...base, hub: null });
  assert.equal(m.el.querySelector('.wh-m-shells'), null);
  m.destroy();
});

test('mobile: Russian renders every label; the i18n re-render keeps the layout', () => {
  const ru = createI18n({ messages: MESSAGES, locale: 'ru' });
  const r = root();
  const m = mountMobileHud(r, { model: model(), i18n: ru });
  assert.deepEqual([...m.el.querySelectorAll('.wh-m-nav__label')].map((b) => text(b)), ['Квесты', 'Знаки', 'Карта', 'Дневник']);
  assert.equal(m.el.querySelector('.wh-m-shell').getAttribute('aria-label'), 'Раковина I: ждёт знак');
  assert.equal(text(m.el.querySelector('.wh-m-status__title')), 'Испытание 13/17');
  ru.setLocale('en');
  applyI18n(m.el, ru);
  assert.equal(text(m.el.querySelector('.wh-m-nav__label')), 'Quests');
  for (const k of ['wh.m.nav.quests', 'wh.m.shell.wait', 'wh.m.pass', 'wh.m.objective.go', 'wh.m.empty.lore']) for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) assert.equal(typeof MESSAGES[loc][k], 'string', loc + ':' + k);
  m.destroy();
});

test('orchestrator: layout "mobile" mounts the phone package and the Signs sheet; desktop keeps the four packages', () => {
  assert.match(MOBILE_QUERY, /max-width: 700px/);
  assert.match(MOBILE_QUERY, /pointer: coarse/, 'landscape phones by height');
  const r = root();
  const hud = mountWorldHud(r, { model: model(), ctx: { i18n, prefs: null }, layout: 'mobile', keys: false });
  assert.ok(hud.mobile, 'phone package');
  assert.ok(hud.signs, 'Signs sheet');
  assert.equal(hud.status, null);
  assert.ok(document.body.classList.contains('wh-mobile'));
  assert.equal(hud.el.dataset.layout, 'mobile');
  assert.ok(hud.el.querySelector('.wh-m-nav'));
  assert.equal(hud.el.querySelector('.wh-tiles'), null, 'no tile row');
  assert.equal(hud.el.querySelector('.wh-topbar'), null, 'no old top bar');
  // the nav's Signs tap opens the sheet through the orchestrator and highlights the item
  hud.el.querySelector('[data-nav="signs"]').click();
  assert.equal(hud.signs.isOpen(), true);
  assert.equal(hud.mobile.active, 'signs');
  hud.signs.close();
  assert.equal(hud.mobile.active, null);
  hud.setLayout('desktop');
  assert.equal(hud.mobile, null);
  assert.ok(hud.status && hud.log && hud.actions);
  assert.ok(!document.body.classList.contains('wh-mobile'));
  hud.destroy();
});
