// World HUD — P2 Signs & Visions (docs/ui-world-hud.md §6.4, §6.5, §7.7, §7.8).
// Desktop: the right-hand panel (open by default). Mobile: a bottom sheet over a scrim (closed by
// default; the orchestrator opens it from the Signs & Visions tile). Filter chips really filter
// (`filterSigns`); a card click reports `onAction('sign', id)`. Keyboard: `V` toggles, `Escape`
// closes while open. Focus moves to the close button on open and back to the opener on close.
// Chrome labels are `wh.*` keys (data-i18n); narrative values are the model's TextRefs.
import { h, tx, applyI18n } from '../dom.js';
import { icon, ringSigil, iconUrl } from './icons.js';
import { filterSigns, signCount } from './model.js';

const FILTERS = ['all', 'active', 'resolved', 'anchors'];
/** Compact desktop range (docs §1): the panel starts closed there and overlays when opened. */
const COMPACT_QUERY = '(min-width: 701px) and (max-width: 1086px)';
const STAT_ICONS = { stability: 'shield', anchorStrength: 'link', powerRange: 'bolt', delay: 'clock', place: 'map-pin', action: 'compass-star', power: 'bolt' };

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
 * the full text overflows) switches to `wh.sign.tiersShort` (the abbreviated form, e.g. in Russian).
 */
function anchorArgs(i18n, a, el) {
  if (a.trial != null) return { shell: i18n.t('shell.' + a.shell), tiers: i18n.t('wh.sign.trialShort', { n: a.trial }) };
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
  if (s.anchor) tx(atext, i18n, 'wh.sign.anchor', () => anchorArgs(i18n, s.anchor, atext));
  const anchor = s.anchor ? h('span', { class: 'wh-pill wh-pill--anchor wh-sign__anchor' + (s.anchored ? ' wh-sign__anchor--mine' : ''), attrs: { id: id + '-a' } },
    ic(icon('target'), 'wh-sign__aicon'), atext) : null;
  // Live model (from-obs.js): one plain reading line ("Likely: Gift of 20 at Shell II, trial 3"),
  // and on resolved cards the proof check against the sealed root.
  const plain = s.plain ? tx(h('p', { class: 'wh-sign__plain wh-body', attrs: { id: id + '-p' }, dataset: { confidence: s.confidence || '' } }), i18n, s.plain.key, s.plain.args) : null;
  const verified = s.verified === 'ok' || s.verified === 'fail'
    ? h('span', { class: 'wh-pill wh-sign__verified wh-sign__verified--' + s.verified, i18n: 'wh.sign.verified.' + s.verified, dataset: { tip: 'verified' } })
    : null;
  // NEAR testnet badge (request 9): a real link after the proof pill; it must not trigger the card
  const near = s.near && verified
    ? h('a', { class: 'wh-pill wh-sign__near wh-sign__near--' + s.near.state, i18n: s.near.labelKey, i18nAttrs: { title: s.near.tipKey }, attrs: { href: s.near.href, target: '_blank', rel: 'noopener' } })
    : null;
  if (near) { near.addEventListener('click', (e) => e.stopPropagation()); near.addEventListener('keydown', (e) => e.stopPropagation()); }
  const activate = () => onAction('sign', s.id);
  return h('div', {
    class: 'wh-card wh-sign' + (mobile ? ' wh-sign--mobile' : ''),
    attrs: {
      role: 'button', tabindex: '0',
      'aria-labelledby': id + '-t',
      'aria-describedby': [s.plain ? id + '-p' : '', s.stats.length ? id + '-s' : '', s.anchor ? id + '-a' : ''].filter(Boolean).join(' '),
    },
    dataset: { sign: s.id, state: s.state, whKey: 'sign-' + s.id },
    on: {
      click: activate,
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } },
    },
  },
  ic(ringSigil(), 'wh-sign__ring'),
  h('div', { class: 'wh-sign__head' },
    title,
    h('span', { class: 'wh-pill wh-sign__type' },
      ic(icon('sparkle'), 'wh-sign__spark'),
      h('span', { class: 'wh-sign__tlabel wh-heavy-sm', i18n: 'wh.sign.type.' + s.type })),
    verified),
  plain,
  s.stats.length ? stats : null,
  anchor,
  near, // its own row under the anchor: the head row has a fixed height and the label is long in every locale
  ic(icon('chevron-slim'), 'wh-sign__chev'));
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
  const compact = () => { try { return !!(win.matchMedia && win.matchMedia(COMPACT_QUERY).matches); } catch { return false; } };
  let desktopOpen = model.signs.open !== false && !compact();
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
    let i = 0;
    for (const s of filterSigns(model, filter)) {
      const c = card(i18n, s, mobile, onAction);
      if (c.style && c.style.setProperty) c.style.setProperty('--i', String(Math.min(i, 8))); // staggered rise, capped so a long list never waits
      i++;
      applyI18n(c, i18n);
      ui.list.appendChild(c);
    }
    if (focusKey) {
      const again = ui.list.querySelector(`[data-wh-key="${focusKey}"]`);
      if (again) again.focus();
    }
    scheduleFit();
  }

  /** Mobile: an anchor pill whose text overflows switches to the short tiers form (docs §3.2). */
  function fitAnchors() {
    if (!ui || layout !== 'mobile') return;
    for (const a of ui.list.querySelectorAll('.wh-sign__atext')) {
      if (typeof a.scrollWidth !== 'number' || !a.clientWidth) continue;
      if (a._short) { a._short = false; applyI18n(a, i18n); }
    }
    // batched: all long forms are written above, read every width, then switch the overflowing ones
    const over = [...ui.list.querySelectorAll('.wh-sign__atext')].filter((a) => typeof a.scrollWidth === 'number' && a.clientWidth && a.scrollWidth > a.clientWidth + 1);
    for (const a of over) { a._short = true; applyI18n(a, i18n); }
  }
  let fitQueued = false;
  function scheduleFit() {
    if (fitQueued || layout !== 'mobile' || typeof win.requestAnimationFrame !== 'function') return;
    fitQueued = true;
    win.requestAnimationFrame(() => { fitQueued = false; fitAnchors(); });
  }
  // Re-fit once the fonts arrive and after every language switch (bindI18n re-renders first).
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => scheduleFit(), () => {});
  const unsubLocale = i18n.subscribe ? i18n.subscribe(() => scheduleFit()) : null;

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
        h('p', { class: 'wh-signs__sub wh-body', i18n: 'wh.signs.subtitle' })));
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
      }, h('span', { class: 'wh-signs__close-label wh-body', i18n: 'wh.signs.close' }), h('span', { class: 'wh-kbd wh-signs__esc wh-body', text: 'Esc', attrs: { 'aria-hidden': 'true' } }));
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
      // the woven strip down the left edge (mockup); one source of truth in icons.js
      const braid = h('span', { class: 'wh-signs__braid', attrs: { 'aria-hidden': 'true', style: 'background-image:' + iconUrl('braid') } });
      panel = h('section', {
        class: 'wh-panel wh-frame wh-signs wh-interactive',
        attrs: { 'aria-labelledby': titleId },
      }, corner, braid, head, filters, list);
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
  // `keys: false`: the host routes V and Escape (the 3D client) through toggle()/close()
  if (o.keys !== false) win.addEventListener('keydown', onKey);
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
      if (unsubLocale) unsubLocale();
      el.remove();
      ui = null;
    },
  };

  build();
  return api;
}
