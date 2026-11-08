// World HUD — P2 Signs & Visions (docs/ui-world-hud.md §6.4, §6.5, §7.7, §7.8).
// Desktop: the right-hand panel (open by default). Mobile: a bottom sheet over a scrim (closed by
// default; the orchestrator opens it from the Signs & Visions tile). Filter chips really filter
// (`filterSigns`); a card click reports `onAction('sign', id)`. Keyboard: `V` toggles, `Escape`
// closes while open. Focus moves to the close button on open and back to the opener on close.
// Chrome labels are `wh.*` keys (data-i18n); narrative values are the model's TextRefs.
import { h, tx, applyI18n } from '../dom.js';
import { icon } from './icons.js';
import { filterSigns, signCount } from './model.js';

const FILTERS = ['all', 'active', 'resolved', 'anchors'];
/** Compact desktop range (docs §1): the panel starts closed there and overlays when opened. */
const COMPACT_QUERY = '(min-width: 701px) and (max-width: 1086px)';
const STAT_ICONS = { stability: 'shield', anchorStrength: 'link', powerRange: 'bolt', delay: 'clock' };
/** Node-hole fill of the ring sigil: the card interior tone (§2.1). */
const RING_HOLE = '#101d20';

const STAR = (cx, cy, r) => `M${cx} ${cy - r}C${cx + r * .12} ${cy - r * .35} ${cx + r * .35} ${cy - r * .12} ${cx + r} ${cy}C${cx + r * .35} ${cy + r * .12} ${cx + r * .12} ${cy + r * .35} ${cx} ${cy + r}C${cx - r * .12} ${cy + r * .35} ${cx - r * .35} ${cy + r * .12} ${cx - r} ${cy}C${cx - r * .35} ${cy - r * .12} ${cx - r * .12} ${cy - r * .35} ${cx} ${cy - r}Z`;

/**
 * The sign-card logogram ring, redrawn from the mockup (measured at 8x on ref/desktop.png): a
 * 26.5-radius ring with a cream-to-gold gradient, an open core ring (r 8), four small stars at
 * r 19 and four bead nodes (r 4, dark hole) sitting on the ring at N E S W; N and S carry a short
 * point outward. Same 70-unit grid as icons.js `ringSigil` (which it replaces for this package).
 */
function signRing(hole = RING_HOLE) {
  const id = 'wh-sg-ring-' + (++uid);
  const bead = (x, y) => `<circle cx="${x}" cy="${y}" r="4.1" fill="url(#${id}-g)"/><circle cx="${x}" cy="${y}" r="1.35" fill="${hole}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" width="70" height="70" overflow="visible" fill="none" aria-hidden="true" focusable="false" data-icon="sg-ring">'
    + `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".45" stop-color="#f0cf86"/><stop offset="1" stop-color="#c7983f"/></linearGradient>`
    + `<radialGradient id="${id}-d" cx="35" cy="35" r="26" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#05100f" stop-opacity=".55"/><stop offset="1" stop-color="#05100f" stop-opacity=".15"/></radialGradient></defs>`
    + `<circle cx="35" cy="35" r="25.4" fill="url(#${id}-d)"/>`
    + `<circle cx="35" cy="35" r="26.6" stroke="url(#${id}-g)" stroke-width="2.2"/>`
    + `<circle cx="35" cy="35" r="8.1" stroke="url(#${id}-g)" stroke-width="2"/>`
    + `<path d="${STAR(35, 16, 2.9)}${STAR(54, 35, 2.6)}${STAR(35, 54, 2.9)}${STAR(16, 35, 2.6)}" fill="#f6dc9a"/>`
    + `<path d="M46.2 35h2.6" stroke="#f6dc9a" stroke-width="1" stroke-linecap="round" opacity=".45"/>`
    + `<path d="M35 0.6l2.6 3.6h-5.2ZM35 70.4l-2.6-4.4h5.2Z" fill="url(#${id}-g)"/>`
    + bead(35, 4.6) + bead(65.6, 35) + bead(35, 65.4) + bead(4.4, 35)
    + '</svg>';
}

/** Chevron with the mockup's proportions (10×16 box; icons.js draws it on a square grid). */
const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-icon="sg-chevron"><path d="M1.8 1.4L8.4 8 1.8 14.6"/></svg>';

let uid = 0;

const ensureCss = (doc = document) => {
  if (doc.querySelector('link[data-wh-css="signs"]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./signs.css', import.meta.url).href;
  link.dataset.whCss = 'signs';
  doc.head.appendChild(link);
};

/** `<span class="wh-icon …">` holding an inline SVG; its box is sized in CSS (u). */
function ic(markup, cls) {
  const span = h('span', { class: 'wh-icon ' + cls, attrs: { 'aria-hidden': 'true' } });
  span.innerHTML = markup;
  return span;
}

const isTyping = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));

// ---------------------------------------------------------------- pieces

/**
 * Anchor pill args: "Anchor: Shell III, Tiers 11–13". `el._short` (set by fitAnchors on mobile when
 * the full text overflows) switches to `wh.sign.tiersShort` (RU "ур. 11–13").
 */
function anchorArgs(i18n, a, el) {
  const count = a.tierTo > a.tierFrom ? 2 : 1;
  const tiersKey = el && el._short ? 'wh.sign.tiersShort' : 'wh.sign.tiers';
  return { shell: i18n.t('shell.' + a.shell), tiers: i18n.t(tiersKey, { count, from: a.tierFrom, to: a.tierTo }) };
}

function card(i18n, s, mobile, onAction) {
  const id = 'wh-sign-' + (++uid);
  const title = tx(h('span', { class: 'wh-sign__title wh-heavy', attrs: { id: id + '-t' } }), i18n, 'wh.sign.number', { n: s.number });
  const stats = h('dl', { class: 'wh-sign__stats wh-body', attrs: { id: id + '-s' } },
    ...s.stats.map((st) => h('div', { class: 'wh-sign__stat', dataset: { stat: st.id } },
      ic(icon(STAT_ICONS[st.id] || 'sparkle'), 'wh-sign__sicon'),
      h('dt', { class: 'wh-sign__k', i18n: 'wh.sign.statLabel', args: () => ({ label: i18n.t('wh.sign.' + st.id) }) }),
      tx(h('dd', { class: 'wh-sign__v' }), i18n, st.value.key, st.value.args))));
  const atext = h('span', { class: 'wh-sign__atext wh-heavy-sm' });
  tx(atext, i18n, 'wh.sign.anchor', () => anchorArgs(i18n, s.anchor, atext));
  const anchor = h('span', { class: 'wh-pill wh-pill--anchor wh-sign__anchor', attrs: { id: id + '-a' } },
    ic(icon('target'), 'wh-sign__aicon'), atext);
  const activate = () => onAction('sign', s.id);
  return h('div', {
    class: 'wh-card wh-sign' + (mobile ? ' wh-sign--mobile' : ''),
    attrs: {
      role: 'button', tabindex: '0',
      'aria-labelledby': id + '-t',
      'aria-describedby': id + '-s ' + id + '-a',
    },
    dataset: { sign: s.id, state: s.state, whKey: 'sign-' + s.id },
    on: {
      click: activate,
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } },
    },
  },
  ic(signRing(), 'wh-sign__ring'),
  h('div', { class: 'wh-sign__head' },
    title,
    h('span', { class: 'wh-pill wh-sign__type' },
      ic(icon('sparkle'), 'wh-sign__spark'),
      h('span', { i18n: 'wh.sign.type.' + s.type }))),
  stats,
  anchor,
  ic(CHEVRON, 'wh-sign__chev'));
}

function chips(i18n, model, filter, onPick) {
  const row = h('div', { class: 'wh-signs__filters', attrs: { role: 'group' } },
    ...FILTERS.map((f) => h('button', {
      class: 'wh-chip wh-signs__chip',
      attrs: { type: 'button', 'aria-pressed': f === filter ? 'true' : 'false' },
      dataset: { filter: f, whKey: 'filter-' + f },
      i18n: 'wh.signs.filter.' + f,
      args: f === 'all' ? { n: signCount(model) } : undefined,
      on: { click: () => onPick(f) },
    })));
  return row;
}

// ---------------------------------------------------------------- mount

/**
 * @param {HTMLElement} root  the `.wh-root` element
 * @param {{model: object, i18n: object, layout: 'desktop'|'mobile', onAction?: Function, prefs?: object}} o
 * @returns {{el: HTMLElement, update(model: object, layout?: string): void, destroy(): void,
 *   open(opener?: HTMLElement): void, close(): void, toggle(): void, isOpen(): boolean}}
 */
export function mountSigns(root, o) {
  const { i18n } = o;
  const onAction = (...a) => { if (o.onAction) o.onAction(...a); };
  const doc = root.ownerDocument || document;
  const win = doc.defaultView || globalThis;
  ensureCss(doc);
  const el = h('div', { class: 'wh-signs-root' });
  root.appendChild(el);

  let model = o.model;
  let layout = o.layout === 'mobile' ? 'mobile' : 'desktop';
  let filter = FILTERS.includes(model.signs.filter) ? model.signs.filter : 'all';
  let modelFilter = model.signs.filter;
  let desktopOpen = model.signs.open !== false;
  let isOpenNow = layout === 'desktop' ? desktopOpen : false;
  let opener = null;
  /** Current DOM refs. */
  let ui = null;

  function pickFilter(f) {
    if (f === filter) return;
    filter = f;
    renderChips();
    renderList();
    onAction('filter', f);
  }

  function renderChips() {
    for (const b of ui.filters.children) b.setAttribute('aria-pressed', b.dataset.filter === filter ? 'true' : 'false');
    const all = ui.filters.querySelector('[data-filter="all"]');
    all._i18nArgs = { n: signCount(model) };
    applyI18n(all, i18n);
  }

  function renderList() {
    const active = doc.activeElement;
    const focusKey = active && ui.list.contains(active) && active.dataset ? active.dataset.whKey : null;
    ui.list.textContent = '';
    const mobile = layout === 'mobile';
    for (const s of filterSigns(model, filter)) {
      const c = card(i18n, s, mobile, onAction);
      applyI18n(c, i18n);
      ui.list.appendChild(c);
    }
    if (focusKey) {
      const again = ui.list.querySelector(`[data-wh-key="${focusKey}"]`);
      if (again) again.focus();
    }
  }

  function build() {
    el.textContent = '';
    el.dataset.layout = layout;
    const mobile = layout === 'mobile';
    const titleId = 'wh-signs-title-' + (++uid);
    const eye = ic(icon('eye-sigil'), 'wh-signs__eye');
    const head = h('header', { class: 'wh-signs__head' },
      eye,
      h('div', { class: 'wh-signs__text' },
        h('h2', { class: 'wh-signs__title wh-heavy', i18n: 'wh.signs.title', attrs: { id: titleId } }),
        h('p', { class: 'wh-signs__sub', i18n: 'wh.signs.subtitle' })));
    const close = mobile
      ? h('button', {
        class: 'wh-btn-icon wh-btn-icon--round wh-signs__close wh-signs__close--round',
        attrs: { type: 'button' }, i18nAttrs: { 'aria-label': 'wh.signs.closeAria' },
        dataset: { whKey: 'close' },
        on: { click: () => api.close() },
      }, ic(icon('close'), 'wh-signs__x'))
      : h('button', {
        class: 'wh-signs__close',
        attrs: { type: 'button', 'aria-keyshortcuts': 'Escape' }, i18nAttrs: { 'aria-label': 'wh.signs.closeAria' },
        dataset: { whKey: 'close' },
        on: { click: () => api.close() },
      }, h('span', { class: 'wh-signs__close-label', i18n: 'wh.signs.close' }), h('span', { class: 'wh-kbd wh-signs__esc', text: 'Esc', attrs: { 'aria-hidden': 'true' } }));
    head.appendChild(close);
    const filters = chips(i18n, model, filter, pickFilter);
    filters.setAttribute('aria-labelledby', titleId);
    const list = h('div', { class: 'wh-signs__list' });

    let panel, scrim = null;
    if (mobile) {
      scrim = h('div', { class: 'wh-sheet__scrim wh-interactive', attrs: { 'aria-hidden': 'true' }, on: { click: () => api.close() } });
      panel = h('section', {
        class: 'wh-panel wh-frame wh-sheet wh-interactive',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        on: { keydown: trapTab },
      },
      h('span', { class: 'wh-sheet__handle', i18nAttrs: { title: 'wh.signs.handle' }, attrs: { 'aria-hidden': 'true' } }),
      head, filters, list);
      el.append(scrim, panel);
    } else {
      const corner = h('span', { class: 'wh-frame__corner', attrs: { 'aria-hidden': 'true' } });
      corner.innerHTML = icon('flourish');
      panel = h('section', {
        class: 'wh-panel wh-frame wh-signs wh-interactive',
        attrs: { 'aria-labelledby': titleId },
      }, corner, head, filters, list);
      el.append(panel);
    }
    ui = { panel, scrim, close, filters, list };
    renderList();
    applyI18n(el, i18n);
    paintOpen();
  }

  function paintOpen() {
    const { panel, scrim } = ui;
    panel.dataset.open = isOpenNow ? 'true' : 'false';
    if (isOpenNow) { panel.removeAttribute('inert'); panel.removeAttribute('aria-hidden'); }
    else { panel.setAttribute('inert', ''); panel.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.dataset.open = isOpenNow ? 'true' : 'false';
    el.dataset.open = isOpenNow ? 'true' : 'false';
  }

  /** Keeps Tab inside the modal sheet. */
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const items = [...ui.panel.querySelectorAll('button, [tabindex="0"]')].filter((n) => !n.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /** Last input modality: the focus ring on open shows for keyboard users only (tile tap, preview). */
  let keyboardLast = false;
  const onPointer = () => { keyboardLast = false; };

  function onKey(e) {
    keyboardLast = true;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    if (e.key === 'Escape') {
      if (!isOpenNow) return;
      e.preventDefault();
      api.close();
    } else if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') {
      if (e.repeat) return;
      e.preventDefault();
      api.toggle();
    }
  }
  win.addEventListener('keydown', onKey);
  win.addEventListener('pointerdown', onPointer, true);

  const api = {
    el,
    update(next, nextLayout) {
      const nl = nextLayout ? (nextLayout === 'mobile' ? 'mobile' : 'desktop') : layout;
      const prev = model;
      model = next || model;
      if (model.signs.filter !== modelFilter) {
        modelFilter = model.signs.filter;
        if (FILTERS.includes(modelFilter)) filter = modelFilter;
      }
      if (nl !== layout) {
        if (layout === 'desktop') desktopOpen = isOpenNow;
        layout = nl;
        isOpenNow = layout === 'desktop' ? desktopOpen : false;
        opener = null;
        build();
        return;
      }
      if (prev.signs !== model.signs) { renderChips(); renderList(); }
    },
    open(from) {
      if (isOpenNow) return;
      const active = from || doc.activeElement;
      opener = active && active !== doc.body && !el.contains(active) ? active : null;
      isOpenNow = true;
      if (layout === 'desktop') desktopOpen = true;
      paintOpen();
      ui.close.focus({ focusVisible: keyboardLast });
      onAction('signsOpen');
    },
    close() {
      if (!isOpenNow) return;
      const hadFocus = el.contains(doc.activeElement);
      isOpenNow = false;
      if (layout === 'desktop') desktopOpen = false;
      paintOpen();
      if (opener && opener.isConnected && (hadFocus || doc.activeElement === doc.body)) opener.focus();
      else if (hadFocus && doc.activeElement && el.contains(doc.activeElement)) doc.activeElement.blur();
      opener = null;
      onAction('signsClose');
    },
    toggle() { if (isOpenNow) api.close(); else api.open(); },
    isOpen: () => isOpenNow,
    destroy() {
      win.removeEventListener('keydown', onKey);
      win.removeEventListener('pointerdown', onPointer, true);
      el.remove();
      ui = null;
    },
  };

  build();
  return api;
}
