// World HUD package P3a (docs/ui-world-hud.md §6.6, §7.4): the desktop Log / Hints / Lore panel
// and the mobile tile row (Signs & Visions, Log, Lore). Mount contract: §9.1.
import { h, tx, applyI18n } from '../dom.js';
import { icon } from './icons.js';

const TABS = [
  { id: 'log', icon: 'chat-bubble', bullet: 'diamond' },
  { id: 'hints', icon: 'bulb', bullet: 'bulb' },
  { id: 'lore', icon: 'book', bullet: 'book' },
];
const TILES = [
  { id: 'signs', icon: 'eye', label: 'wh.tiles.signs' },
  { id: 'log', icon: 'chat-bubble', label: 'wh.tiles.log' },
  { id: 'lore', icon: 'book', label: 'wh.tiles.lore', stretch: true }, // the mockup's book is flatter than the 24-grid icon
];
/** Rows kept in the DOM per tab; older entries drop off (the list scrolls). */
export const MAX_LOG_ROWS = 40;

let uid = 0;

function ensureCss() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.querySelector('link[data-wh-css="log"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./log.css', import.meta.url).href;
  link.dataset.whCss = 'log';
  document.head.appendChild(link);
}

/** A gold icon wrapper (`.wh-icon` sizes by font-size / explicit CSS box). */
function ic(name, cls, opts) {
  const s = h('span', { class: 'wh-icon ' + cls, attrs: { 'aria-hidden': 'true' } });
  const svg = icon(name, opts && opts.strokeWidth ? { strokeWidth: opts.strokeWidth } : undefined);
  s.innerHTML = opts && opts.stretch ? svg.replace('<svg ', '<svg preserveAspectRatio="none" ') : svg;
  return s;
}

/**
 * @param {HTMLElement} root  the `.wh-root` element
 * @param {{model: object, i18n: object, layout?: 'desktop'|'mobile', onAction?: Function, prefs?: object}} o
 */
export function mountLog(root, o = {}) {
  ensureCss();
  const i18n = o.i18n;
  const emit = (...a) => { if (o.onAction) o.onAction(...a); };
  const el = h('div', { class: 'wh-log-root' });
  root.appendChild(el);

  const id = 'wh-log-' + (++uid).toString(36);
  let model = o.model;
  let layout = o.layout === 'mobile' ? 'mobile' : 'desktop';
  let tab = validTab(model && model.journal && model.journal.tab);
  /** @type {{tabs?: HTMLElement[], body?: HTMLElement, list?: HTMLElement, dot?: HTMLElement, srUnread?: HTMLElement}} */
  let refs = {};

  function validTab(t) { return TABS.some((x) => x.id === t) ? t : 'log'; }

  function render() {
    el.textContent = '';
    refs = {};
    if (!model || !model.journal) return;
    if (layout === 'mobile') renderTiles(); else renderPanel();
    applyI18n(el, i18n);
  }

  // ---------- desktop: tabs + body ----------
  function renderPanel() {
    const tabs = TABS.map((t) => {
      const b = h('button', {
        class: 'wh-log__tab',
        attrs: { type: 'button', role: 'tab', id: `${id}-tab-${t.id}`, 'aria-controls': `${id}-panel`, 'data-tab': t.id },
        on: { click: () => { setTab(t.id); emit('tab', t.id); } },
      }, ic(t.icon, 'wh-log__tab-icon'), h('span', { class: 'wh-log__tab-label', i18n: 'wh.tabs.' + t.id }));
      return b;
    });
    const tablist = h('div', {
      class: 'wh-log__tabs',
      attrs: { role: 'tablist' },
      i18nAttrs: { 'aria-label': 'wh.log.label' },
      on: { keydown: onTabKey },
    }, tabs);
    const list = h('ol', { class: 'wh-log__list', attrs: { 'aria-live': 'off' } });
    const body = h('div', {
      class: 'wh-log__body wh-panel',
      attrs: { role: 'tabpanel', id: `${id}-panel`, tabindex: '0' },
    }, list);
    const panel = h('section', { class: 'wh-log wh-interactive', i18nAttrs: { 'aria-label': 'wh.log.label' } }, tablist, body);
    el.appendChild(panel);
    refs = { tabs, body, list };
    syncTab();
  }

  function syncTab() {
    if (!refs.tabs) return;
    for (const b of refs.tabs) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('wh-log__tab--active', on);
    }
    // A divider shows between two neighbouring inactive tabs only.
    refs.tabs.forEach((b, i) => {
      const prev = refs.tabs[i - 1];
      b.classList.toggle('wh-log__tab--sep', !!prev && prev.dataset.tab !== tab && b.dataset.tab !== tab);
    });
    refs.body.setAttribute('aria-labelledby', `${id}-tab-${tab}`);
    renderRows();
  }

  function renderRows() {
    const list = refs.list;
    list.textContent = '';
    const def = TABS.find((t) => t.id === tab);
    const items = (model.journal[tab] || []).slice(0, MAX_LOG_ROWS);
    list.dataset.tab = tab;
    for (const it of items) {
      const text = h('span', { class: 'wh-log__text wh-body' });
      tx(text, i18n, it.text.key, it.text.args);
      list.appendChild(h('li', { class: 'wh-log__row', dataset: { id: it.id } },
        ic(def.bullet, 'wh-log__bullet wh-log__bullet--' + def.bullet, def.bullet === 'diamond' ? { strokeWidth: 5 } : undefined),
        h('span', { class: 'wh-log__time wh-body', text: it.time || '' }),
        text));
    }
    list.scrollTop = 0;
  }

  function onTabKey(e) {
    const keys = { ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last' };
    if (!(e.key in keys) || !refs.tabs) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const k = keys[e.key];
    const j = k === 'first' ? 0 : k === 'last' ? TABS.length - 1 : (i + k + TABS.length) % TABS.length;
    setTab(TABS[j].id);
    emit('tab', TABS[j].id);
    refs.tabs[j].focus();
  }

  // ---------- mobile: tiles ----------
  function renderTiles() {
    const tiles = TILES.map((t) => h('button', {
      class: 'wh-tile wh-tile--' + t.id,
      attrs: { type: 'button', 'data-tile': t.id },
      on: { click: () => emit('tile', t.id) },
    }, ic(t.icon, 'wh-tile__icon', t.stretch ? { stretch: true } : undefined), h('span', { class: 'wh-tile__label', i18n: t.label })));
    el.appendChild(h('nav', { class: 'wh-tiles wh-interactive', i18nAttrs: { 'aria-label': 'wh.log.label' } }, tiles));
    refs = { logTile: tiles[1] };
    syncUnread();
  }

  /** The Log tile's notification dot, with an sr-only "New entries" so colour is not the only cue. */
  function syncUnread() {
    const tile = refs.logTile;
    const unread = !!model.journal.unread;
    const dot = tile.querySelector('.wh-tile__dot');
    if (unread && !dot) {
      tile.append(h('span', { class: 'wh-tile__dot', attrs: { 'aria-hidden': 'true' } }),
        tx(h('span', { class: 'sr-only wh-tile__unread' }), i18n, 'wh.tiles.unread'));
    } else if (!unread && dot) {
      dot.remove();
      const sr = tile.querySelector('.wh-tile__unread');
      if (sr) sr.remove();
    }
  }

  function setTab(next) {
    next = validTab(next);
    if (next === tab) return;
    tab = next;
    syncTab();
  }

  render();

  return {
    el,
    get tab() { return tab; },
    setTab,
    update(next, nextLayout) {
      const l = nextLayout === 'mobile' ? 'mobile' : nextLayout === 'desktop' ? 'desktop' : layout;
      const prevJournal = model && model.journal;
      if (next === model && l === layout) return;
      const nj = next && next.journal;
      if (nj && prevJournal && nj.tab !== prevJournal.tab) tab = validTab(nj.tab);
      model = next;
      if (l !== layout) { layout = l; render(); return; }
      if (nj === prevJournal) return;
      // Desktop keeps the tab buttons (and their focus) and re-renders the rows only.
      if (layout === 'desktop' && refs.list) { syncTab(); applyI18n(refs.list, i18n); return; }
      if (layout === 'mobile' && refs.logTile) { syncUnread(); return; }
      render();
    },
    destroy() { el.textContent = ''; el.remove(); refs = {}; },
  };
}
