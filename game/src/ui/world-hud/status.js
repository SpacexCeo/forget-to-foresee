// World HUD — P1 Status & Quest (docs/ui-world-hud.md §6.1–6.3, §7.1–7.3).
// Desktop: trial status card, main quest banner, hint toast.
// Mobile: top bar, quest card with carousel dots, compact trial card.
// Chrome labels come from `wh.*` keys (data-i18n), narrative text from the model's TextRefs, so
// the orchestrator's bindI18n re-renders everything in place on a language switch.
import { h, tx, applyI18n } from '../dom.js';
import { icon, keyArt } from './icons.js';
import { barSegments } from './model.js';

/** Glyphs the shared icon set lacks (folded into icons.js later, see the P1 report). */
const LOCAL_ICONS = {
  // The toast's "i": the circle is the CSS border of .wh-toast__icon, so only stem, serif and dot here.
  'st-info-i': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 14" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-icon="st-info-i"><circle cx="5" cy="2.2" r="1.15" fill="currentColor" stroke="none"/><path d="M3.4 6.1H5.3V12.4M3.2 12.4H7"/></svg>',
  // Mobile menu: three 21×12 rules (the shared `menu` icon is drawn on a square grid).
  'st-menu': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 12" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false" data-icon="st-menu"><path d="M.75 .9h19.5M.75 6h19.5M.75 11.1h19.5"/></svg>',
};

const MOBILE_BAR_CELLS = 8;

const ensureCss = (doc = document) => {
  const have = doc.querySelector('link[data-wh-css="status"]');
  if (have) return have;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./status.css', import.meta.url).href;
  link.dataset.whCss = 'status';
  doc.head.appendChild(link);
  return link;
};

/** `<span class="wh-icon …">` holding an inline SVG; its box is sized in CSS (u).
 *  `o.stretch` lets the glyph fill a non-square box (the mockup's book is wider than the grid icon). */
function ic(name, cls, o = {}) {
  const span = h('span', { class: 'wh-icon ' + cls, attrs: { 'aria-hidden': 'true' } });
  let svg = LOCAL_ICONS[name] || icon(name, o.strokeWidth ? { strokeWidth: o.strokeWidth } : {});
  if (o.stretch) svg = svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
  span.innerHTML = svg;
  return span;
}

const ref = (i18n, r, cls, tag = 'span') => (r ? tx(h(tag, { class: cls }), i18n, r.key, r.args) : h(tag, { class: cls }));

/** Segmented progress bar (17 segments → 12 filled). */
function bar(i18n, trial, cls, segments) {
  let { total, filled } = barSegments(trial.progressDone, trial.progressTotal);
  if (segments && total > 0) {
    // The mobile mockup draws the same progress with 8 wide cells (12/17 → 6/8).
    filled = Math.round((filled / total) * segments);
    total = segments;
  }
  const el = h('div', {
    class: 'wh-bar ' + cls,
    attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': trial.progressTotal, 'aria-valuenow': trial.progressDone },
    i18nAttrs: { 'aria-label': 'wh.trial.progressAria' },
    attrArgs: { done: trial.progressDone, total: trial.progressTotal, pct: trial.progressPct },
  });
  for (let i = 0; i < total; i++) el.appendChild(h('span', { class: 'wh-bar__seg' + (i < filled ? ' wh-bar__seg--on' : '') }));
  return el;
}

// ---------------------------------------------------------------- desktop

function trialDesktop(i18n, t) {
  const row = (iconName, labelKey, value) => h('div', { class: 'wh-trial__row' },
    ic(iconName, 'wh-trial__ricon wh-trial__ricon--' + iconName),
    h('span', { class: 'wh-trial__text wh-heavy-sm' }, h('span', { class: 'wh-trial__k', i18n: labelKey }), value));
  const v = (key, args, num) => tx(h('span', { class: 'wh-trial__v' + (num ? ' wh-trial__v--num' : '') }), i18n, key, args);
  return h('section', { class: 'wh-panel wh-trial', i18nAttrs: { 'aria-label': 'wh.trial.title' }, attrArgs: { n: t.n, total: t.total } },
    h('div', { class: 'wh-trial__head' },
      ic('compass-star', 'wh-trial__hicon'),
      tx(h('h2', { class: 'wh-trial__title wh-heavy-sm' }), i18n, 'wh.trial.title', { n: t.n, total: t.total })),
    h('div', { class: 'wh-divider wh-trial__rule wh-trial__rule--a' }),
    row('target', 'wh.trial.phase', v('wh.trial.phase.' + t.phase)),
    row('bar-chart', 'wh.trial.skillTier', h('span', { class: 'wh-trial__v', text: String(t.skillTier) })),
    row('bookmark', 'wh.trial.attempts', v('wh.trial.attemptsValue', { n: t.attempts, max: t.attemptsMax }, true)),
    row('map-pin', 'wh.trial.arena', ref(i18n, t.arena, 'wh-trial__v')),
    h('div', { class: 'wh-divider wh-trial__rule wh-trial__rule--b' }),
    h('div', { class: 'wh-trial__progress' },
      h('p', { class: 'wh-trial__plabel wh-heavy-sm' },
        h('span', { class: 'wh-trial__k', i18n: 'wh.trial.progress' }),
        v('wh.trial.progressValue', { done: t.progressDone, total: t.progressTotal }, true),
        h('span', { class: 'wh-trial__dot', text: '•', attrs: { 'aria-hidden': 'true' } }),
        v('wh.trial.percent', { n: t.progressPct })),
      bar(i18n, t, 'wh-trial__bar')));
}

function questDesktop(i18n, q) {
  const corner = (mod) => {
    const c = h('span', { class: 'wh-frame__corner' + (mod ? ' wh-frame__corner--' + mod : ''), attrs: { 'aria-hidden': 'true' } });
    c.innerHTML = icon('flourish');
    return c;
  };
  const art = h('span', { class: 'wh-quest__art', attrs: { 'aria-hidden': 'true' } });
  art.innerHTML = keyArt({ size: 100 });
  return h('section', { class: 'wh-panel wh-frame wh-quest', dataset: { quest: q ? q.id : '' } },
    corner(''), corner('bl'), corner('tr'), corner('br'),
    ic('key', 'wh-quest__key'),
    art,
    h('div', { class: 'wh-quest__body' },
      tag(),
      ref(i18n, q && q.title, 'wh-quest__title wh-heavy', 'h2'),
      h('div', { class: 'wh-quest__text wh-body' }, ...(q ? q.body : []).map((b) => ref(i18n, b, 'wh-quest__line', 'p')))));
}

function tag() {
  return h('span', { class: 'wh-tag wh-quest__tag' }, ic('sparkle', 'wh-quest__sparkle'), h('span', { i18n: 'wh.quest.tag' }));
}

function toast(i18n, hint) {
  return h('div', {
    class: 'wh-panel wh-toast' + (hint && hint.visible ? '' : ' wh-toast--hidden'),
    attrs: { role: 'status', 'aria-hidden': hint && hint.visible ? null : 'true' },
  },
  h('span', { class: 'wh-toast__icon', attrs: { 'aria-hidden': 'true' } }, ic('st-info-i', 'wh-toast__i')),
  h('span', { class: 'sr-only', i18n: 'wh.hint.label' }),
  ref(i18n, hint && hint.text, 'wh-toast__text wh-body', 'p'));
}

// ---------------------------------------------------------------- mobile

function topbar(onAction) {
  const btn = (id, label, iconName, cls, io) => h('button', {
    class: 'wh-btn-icon wh-interactive wh-topbar__btn wh-topbar__btn--' + cls,
    attrs: { type: 'button' }, dataset: { whKey: 'top-' + id },
    i18nAttrs: { 'aria-label': label },
    on: { click: () => onAction('top', id) },
  }, ic(iconName, 'wh-topbar__icon wh-topbar__icon--' + cls, io));
  return h('nav', { class: 'wh-topbar', i18nAttrs: { 'aria-label': 'wh.root.label' } },
    btn('menu', 'wh.top.menu', 'st-menu', 'menu'),
    h('span', { class: 'wh-topbar__logo', attrs: { 'aria-hidden': 'true' } }, ic('logo-a', 'wh-topbar__logo-a', { strokeWidth: 2.7 })),
    h('span', { class: 'wh-topbar__end' },
      btn('journal', 'wh.top.journal', 'book', 'book', { stretch: true }),
      btn('settings', 'wh.top.settings', 'gear', 'gear')));
}

function questMobile(i18n, model, onAction) {
  const q = model.quests[model.questIndex] || model.quests[0];
  const lines = q ? (q.bodyShort || q.body) : [];
  const art = h('span', { class: 'wh-quest__art', attrs: { 'aria-hidden': 'true' } });
  art.innerHTML = keyArt({ size: 98, tall: true });
  const card = h('button', {
    class: 'wh-panel wh-frame wh-quest--mobile wh-interactive',
    attrs: { type: 'button' }, dataset: { whKey: 'quest', quest: q ? q.id : '' },
    on: { click: () => onAction('quest') },
  },
  art,
  h('span', { class: 'wh-quest__body' },
    tag(),
    ref(i18n, q && q.title, 'wh-quest__title wh-heavy'),
    h('span', { class: 'wh-quest__text wh-body' }, ...lines.map((b) => ref(i18n, b, 'wh-quest__line'))),
    h('span', { class: 'sr-only', i18n: 'wh.quest.open' })),
  ic('chevron-right', 'wh-quest__chev'));

  const n = model.quests.length;
  const dots = h('div', { class: 'wh-quest__dots wh-interactive', attrs: { role: 'tablist' } },
    ...model.quests.map((qq, i) => h('button', {
      class: 'wh-quest__dot',
      attrs: { type: 'button', role: 'tab', 'aria-selected': i === model.questIndex ? 'true' : 'false', tabindex: i === model.questIndex ? '0' : '-1' },
      dataset: { whKey: 'dot-' + i },
      i18nAttrs: { 'aria-label': 'wh.quest.dot' }, attrArgs: { n: i + 1, total: n },
      on: { click: () => onAction('questDot', i) },
    })));
  dots.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    onAction('questDot', (model.questIndex + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
  });
  return h('div', { class: 'wh-quest-m' }, card, dots);
}

function trialMobile(i18n, t) {
  const stat = (cls, iconName, labelKey, value) => h('div', { class: 'wh-trial__stat wh-trial__stat--' + cls },
    ic(iconName, 'wh-trial__sicon wh-trial__sicon--' + cls),
    h('span', { class: 'wh-trial__stack' }, h('span', { class: 'wh-trial__label wh-body', i18n: labelKey }), value));
  return h('section', { class: 'wh-panel wh-trial--mobile', i18nAttrs: { 'aria-label': 'wh.trial.title' }, attrArgs: { n: t.n, total: t.total } },
    ic('target', 'wh-trial__micon'),
    h('div', { class: 'wh-trial__main' },
      tx(h('h2', { class: 'wh-trial__title wh-heavy-sm', dataset: { fit: 'wh.trial.titleShort' } }), i18n, 'wh.trial.title', { n: t.n, total: t.total }),
      tx(h('span', { class: 'wh-trial__phase wh-body' }), i18n, 'wh.trial.phase.' + t.phase),
      h('span', { class: 'wh-trial__barrow' },
        bar(i18n, t, 'wh-trial__bar', MOBILE_BAR_CELLS),
        tx(h('span', { class: 'wh-trial__pct wh-body' }), i18n, 'wh.trial.percent', { n: t.progressPct }))),
    h('span', { class: 'wh-trial__vr', attrs: { 'aria-hidden': 'true' } }),
    stat('attempts', 'bookmark', 'wh.trial.attempts', tx(h('span', { class: 'wh-trial__value wh-heavy-sm' }), i18n, 'wh.trial.attemptsValue', { n: t.attempts, max: t.attemptsMax })),
    h('span', { class: 'wh-trial__vr', attrs: { 'aria-hidden': 'true' } }),
    stat('skill', 'bar-chart', 'wh.trial.skillTierShort', h('span', { class: 'wh-trial__value wh-heavy-sm', text: String(t.skillTier) })));
}

// ---------------------------------------------------------------- mount

/**
 * @param {HTMLElement} root  the `.wh-root` element
 * @param {{model: object, i18n: object, layout: 'desktop'|'mobile', onAction?: Function, prefs?: object}} o
 * @returns {{el: HTMLElement, update(model: object, layout?: string): void, destroy(): void}}
 */
export function mountStatus(root, o) {
  const { i18n } = o;
  const onAction = (...a) => { if (o.onAction) o.onAction(...a); };
  const cssLink = ensureCss(root.ownerDocument || document);
  const el = h('div', { class: 'wh-status' });
  root.appendChild(el);

  let model = null;
  let layout = null;
  /** part name → { node, deps } */
  let parts = {};

  const PARTS = {
    desktop: {
      trial: { deps: (m) => [m.trial], build: (m) => trialDesktop(i18n, m.trial) },
      quest: { deps: (m) => [m.quests, m.questIndex], build: (m) => questDesktop(i18n, m.quests[m.questIndex] || m.quests[0]) },
      hint: { deps: (m) => [m.hint], build: (m) => toast(i18n, m.hint), patch: patchToast },
    },
    mobile: {
      top: { deps: () => [], build: () => topbar(onAction) },
      quest: { deps: (m) => [m.quests, m.questIndex], build: (m) => questMobile(i18n, m, onAction) },
      trial: { deps: (m) => [m.trial], build: (m) => trialMobile(i18n, m.trial) },
    },
  };

  /** Toggles visibility without rebuilding so the fade can run; rebuilds when the text changed. */
  function patchToast(node, prev, next) {
    if (!prev || prev.text !== next.text) return false;
    node.classList.toggle('wh-toast--hidden', !next.visible);
    if (next.visible) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', 'true');
    return true;
  }

  function render(next, nextLayout) {
    const doc = el.ownerDocument || document;
    const active = doc.activeElement;
    const focusKey = active && el.contains(active) && active.dataset ? active.dataset.whKey : null;
    if (nextLayout !== layout) {
      el.textContent = '';
      parts = {};
      el.dataset.layout = nextLayout;
    }
    const defs = PARTS[nextLayout];
    let changed = false;
    for (const [name, def] of Object.entries(defs)) {
      const deps = def.deps(next);
      const cur = parts[name];
      if (cur && deps.length === cur.deps.length && deps.every((d, i) => d === cur.deps[i])) continue;
      if (cur && def.patch && def.patch(cur.node, model && model.hint, next.hint)) { cur.deps = deps; continue; }
      const node = def.build(next);
      applyI18n(node, i18n);
      if (cur) cur.node.replaceWith(node); else el.appendChild(node);
      changed = true;
      parts[name] = { node, deps };
    }
    model = next;
    layout = nextLayout;
    if (changed && layout === 'mobile') { fit(); queueFit(); }
    if (focusKey && !el.contains(doc.activeElement)) {
      // a focused carousel dot follows the selection (arrow keys move it)
      const key = focusKey.startsWith('dot-') ? 'dot-' + next.questIndex : focusKey;
      const again = el.querySelector(`[data-wh-key="${key}"]`);
      if (again) again.focus();
    }
  }

  /** Mobile trial title: the full key when it fits, `wh.trial.titleShort` when it overflows (RU). */
  function fit() {
    for (const node of el.querySelectorAll('[data-fit]')) {
      const args = node._i18nArgs;
      tx(node, i18n, node.dataset.fitLong || (node.dataset.fitLong = node.dataset.i18n), args);
      if (typeof node.scrollWidth === 'number' && node.scrollWidth > node.clientWidth + 0.5) tx(node, i18n, node.dataset.fit, args);
    }
  }
  const later = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));
  let fitQueued = false;
  const queueFit = () => {
    if (fitQueued) return;
    fitQueued = true;
    // after bindI18n has re-rendered the new locale (it subscribes after the packages mount)
    later(() => { fitQueued = false; if (el.parentNode) fit(); });
  };
  const unsubscribe = i18n.subscribe ? i18n.subscribe(queueFit) : () => {};
  // widths change once the stylesheet and the web fonts arrive, and on resize
  if (cssLink && cssLink.addEventListener) cssLink.addEventListener('load', queueFit);
  const fonts = typeof document !== 'undefined' && document.fonts;
  if (fonts && fonts.ready) fonts.ready.then(queueFit, () => {});
  if (fonts && fonts.addEventListener) fonts.addEventListener('loadingdone', queueFit);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', queueFit);

  render(o.model, o.layout === 'mobile' ? 'mobile' : 'desktop');

  return {
    el,
    update(next, nextLayout) {
      render(next || model, nextLayout ? (nextLayout === 'mobile' ? 'mobile' : 'desktop') : layout);
    },
    destroy() {
      unsubscribe();
      if (cssLink && cssLink.removeEventListener) cssLink.removeEventListener('load', queueFit);
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', queueFit);
      if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', queueFit);
      el.remove();
      parts = {};
    },
  };
}
