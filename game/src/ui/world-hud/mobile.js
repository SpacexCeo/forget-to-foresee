// World HUD — the phone layout (docs/ui-mobile-hud.md). One package renders the whole touch HUD from
// the shared view model (model.js, from-obs.js) in two modes:
//
//   Exploration — the 3D world owns the screen: a slim status bar (menu · trial progress · silk ·
//                 attention), the Shell selector (I–IV), one objective line, Iris's line when she
//                 speaks, the contextual prompt, and the bottom navigation.
//   Command     — a bottom sheet over the dimmed world (quests and Shells, the journal; the Signs sheet
//                 comes from signs.js, the Memories panel and the map from the play layer) with the
//                 navigation still visible, so the player moves between sheets without walking.
//
// Chrome labels are `wh.*` keys (data-i18n), narrative text comes from the model's TextRefs, so the
// orchestrator's bindI18n re-renders everything in place on a language switch. Every control keeps a
// 44 px hit zone; the stylesheet positions by the measured visible height (--vvh), never 100vh.
import { h, tx, applyI18n } from '../dom.js';
import { icon } from './icons.js';
import { barSegments } from './model.js';

const BAR_CELLS = 8;
const TABS = ['log', 'hints', 'lore'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const IDLE_LINE = 'wh.dialogue.idle';
let uid = 0;

function ensureCss(doc = document) {
  if (!doc || !doc.head || doc.querySelector('link[data-wh-css="mobile"]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./mobile.css', import.meta.url).href;
  link.dataset.whCss = 'mobile';
  doc.head.appendChild(link);
}

function ic(name, cls, o) {
  const span = h('span', { class: 'wh-icon ' + (cls || ''), attrs: { 'aria-hidden': 'true' } });
  span.innerHTML = icon(name, o || {});
  return span;
}

const ref = (i18n, r, cls, tag = 'span') => (r ? tx(h(tag, { class: cls }), i18n, r.key, r.args) : h(tag, { class: cls }));
const plain = (i18n, r) => (r ? i18n.t(r.key, typeof r.args === 'function' ? r.args() : r.args) : '');

/** Bottom navigation items for a model: Quests and Signs always, Memories once unlocked, Map when wired, Journal. */
export function navItems(model) {
  const hot = new Set((model.hotbar || []).map((x) => x.id));
  return [
    { id: 'quests', icon: 'sparkle', label: 'wh.m.nav.quests' },
    { id: 'signs', icon: 'eye', label: 'wh.m.nav.signs' },
    ...(hot.has('memory') ? [{ id: 'memory', icon: 'bookmark', label: 'wh.m.nav.memory' }] : []),
    ...(hot.has('map') ? [{ id: 'map', icon: 'map-pin', label: 'wh.m.nav.map' }] : []),
    { id: 'log', icon: 'book', label: 'wh.m.nav.log', unread: !!(model.journal && model.journal.unread) },
  ];
}

/** Attention shows once the Novice layer unlocks it (clarity-layers §2); Pro always sees it. */
export function showsAttention(model) {
  if (model.mode === 'pro') return true;
  if (model.unlocks) return !!model.unlocks.memory;
  return true; // the preview model has no layers
}

/** Iris's bar hides while she only has the idle line: the world stays clear until she speaks. */
export function irisVisible(model) {
  const d = model.dialogue;
  if (!d || !d.line) return false;
  if (d.line.key === IDLE_LINE && !(d.replies && d.replies.length)) return false;
  return true;
}

/**
 * @param {HTMLElement} root  the `.wh-root` element
 * @param {{model: object, i18n: object, onAction?: Function, prefs?: object}} o
 * @returns {{el: HTMLElement, update(model: object): void, destroy(): void, openSheet(id: 'quests'|'log'): void,
 *   closeSheet(): void, sheet: string|null, setActive(id: string|null): void, active: string|null, handleKey(code: string): boolean}}
 */
export function mountMobileHud(root, o) {
  const { i18n } = o;
  const doc = root.ownerDocument || document;
  ensureCss(doc);
  const emit = (...a) => { if (o.onAction) o.onAction(...a); };
  const id = 'wh-m-' + (++uid).toString(36);
  const el = h('div', { class: 'wh-m', dataset: { mode: 'explore' } });
  root.appendChild(el);

  let model = o.model;
  let sheet = null;          // 'quests' | 'log' | null — the sheets this package owns
  let active = null;         // the nav item whose surface is open (own sheets, Signs, Memories, Map)
  let tab = 'log';
  let objectiveOpen = false, irisOpen = false;
  let opener = null;
  const refs = {};
  /** Focus without scrolling: a sheet starts translated off screen, and .wh-root (overflow hidden) would scroll to it. */
  const focus = (node) => {
    if (!node || typeof node.focus !== 'function') return;
    try { node.focus({ preventScroll: true }); } catch { node.focus(); }
    if (root.scrollTop) root.scrollTop = 0;
    if (root.scrollLeft) root.scrollLeft = 0;
  };

  // ---------------------------------------------------------------- top bar
  function topBar(m) {
    const t = m.trial;
    const bar = h('span', { class: 'wh-bar wh-m-status__bar', attrs: { 'aria-hidden': 'true' } });
    const seg = barSegments(t.progressDone, t.progressTotal);
    const filled = seg.total > 0 ? Math.round((seg.filled / seg.total) * BAR_CELLS) : 0;
    for (let i = 0; i < BAR_CELLS; i++) bar.appendChild(h('span', { class: 'wh-bar__seg' + (i < filled ? ' wh-bar__seg--on' : '') }));
    const stat = (cls, iconName, labelKey, value) => h('span', { class: 'wh-m-stat wh-m-stat--' + cls },
      ic(iconName, 'wh-m-stat__icon'), h('span', { class: 'sr-only', i18n: labelKey }), h('span', { class: 'wh-m-stat__v' }, value));
    // live models carry mobileStats (from-obs.js); the preview model falls back to its attempts counter
    const stats = t.mobileStats || [
      ...(t.silk != null ? [{ id: 'silk', icon: 'sparkle', label: 'wh.trial.silk', value: { key: 'wh.raw', args: { text: String(t.silk) } } }] : []),
      { id: 'attention', icon: 'bookmark', label: 'wh.trial.attention', value: { key: 'wh.trial.attemptsValue', args: { n: t.attempts, max: t.attemptsMax } } },
    ];
    const silk = stats.find((s) => s.id === 'silk');
    const attention = stats.find((s) => s.id === 'attention');
    const status = h('button', {
      class: 'wh-m-status wh-interactive', attrs: { type: 'button' }, dataset: { whKey: 'status' },
      i18nAttrs: { 'aria-label': 'wh.m.status.open' },
      on: { click: () => api.openSheet('quests', status) },
    },
    h('span', { class: 'wh-m-status__trial' },
      tx(h('span', { class: 'wh-m-status__title' }), i18n, 'wh.trial.titleShort', { n: t.n, total: t.total }),
      h('span', { class: 'wh-m-status__row' }, bar, tx(h('span', { class: 'wh-m-status__pct' }), i18n, 'wh.trial.percent', { n: t.progressPct }))),
    silk ? stat('silk', silk.icon, silk.label, ref(i18n, silk.value, 'wh-m-stat__num')) : null,
    attention && showsAttention(m) ? stat('attention', attention.icon, attention.label, ref(i18n, attention.value, 'wh-m-stat__num')) : null);
    return h('header', { class: 'wh-m-top', i18nAttrs: { 'aria-label': 'wh.root.label' } },
      h('button', {
        class: 'wh-btn-icon wh-m-icon wh-m-menu wh-interactive', attrs: { type: 'button' }, dataset: { whKey: 'menu' },
        i18nAttrs: { 'aria-label': 'wh.top.menu' }, on: { click: () => emit('top', 'menu') },
      }, ic('menu-wide', 'wh-m-menu__icon')),
      status);
  }

  // ---------------------------------------------------------------- Shell selector
  function shellState(hub, n) {
    if (hub.inShell && hub.shell === n) return 'here';
    const s = (hub.shells || []).find((x) => x.n === n);
    return s && s.signs > 0 ? 'wait' : 'quiet';
  }
  function shells(m) {
    const hub = m.hub;
    if (!hub || !hub.visible) return null;
    return h('nav', { class: 'wh-m-shells wh-interactive', i18nAttrs: { 'aria-label': 'wh.m.shells.label' } },
      ...[1, 2, 3, 4].map((n) => {
        const state = shellState(hub, n);
        const disabled = hub.busy || (hub.inShell && state !== 'here');
        return h('button', {
          class: 'wh-m-shell wh-m-shell--' + state, attrs: { type: 'button', 'aria-current': state === 'here' ? 'location' : null, disabled: disabled || null },
          dataset: { whKey: 'shell-' + n, shell: String(n) },
          i18nAttrs: { 'aria-label': 'wh.m.shell.' + state }, attrArgs: { shell: ROMAN[n - 1] },
          on: { click: () => { if (state !== 'here') emit('shell', n); } },
        }, h('span', { class: 'wh-m-shell__numeral', text: ROMAN[n - 1] }), h('span', { class: 'wh-m-shell__dot', attrs: { 'aria-hidden': 'true' } }));
      }));
  }

  // ---------------------------------------------------------------- bottom stack: prompt, objective, Iris
  function prompt(m) {
    const p = m.prompt;
    if (!p || !p.text) return null;
    const btn = h('button', {
      class: 'wh-m-prompt wh-interactive' + (p.visible ? '' : ' wh-is-hidden'),
      attrs: { type: 'button', 'aria-keyshortcuts': p.hotkey || null, 'aria-hidden': p.visible ? null : 'true', tabindex: p.visible ? null : '-1' },
      i18nAttrs: { 'aria-label': 'wh.prompt.aria' }, attrArgs: () => ({ key: p.hotkey, text: plain(i18n, p.text) }),
      on: { click: () => emit('prompt') },
    }, h('span', { class: 'wh-kbd wh-m-prompt__kbd', attrs: { 'aria-hidden': 'true' }, text: p.hotkey || '' }), ref(i18n, p.text, 'wh-m-prompt__text'));
    refs.prompt = btn;
    return btn;
  }

  function objective(m) {
    const q = m.quests[m.questIndex] || m.quests[0];
    if (!q) return null;
    const moreId = id + '-objective';
    const lines = (q.body || []).filter(Boolean);
    const head = h('button', {
      class: 'wh-m-objective__head', attrs: { type: 'button', 'aria-expanded': String(objectiveOpen), 'aria-controls': moreId },
      dataset: { whKey: 'objective' },
      on: { click: () => { objectiveOpen = !objectiveOpen; syncObjective(); } },
    },
    h('span', { class: 'wh-m-objective__tag' }, ic('sparkle', 'wh-m-objective__spark'), h('span', { i18n: 'wh.quest.tag' })),
    ref(i18n, q.title, 'wh-m-objective__title'),
    ic('chevron-up', 'wh-m-objective__chev', { strokeWidth: 1.9 }));
    const more = h('div', { class: 'wh-m-objective__more', attrs: { id: moreId } },
      h('div', { class: 'wh-m-objective__more-inner' },
        ...lines.map((b) => ref(i18n, b, 'wh-m-objective__line', 'p')),
        h('button', { class: 'wh-m-btn wh-m-btn--go', attrs: { type: 'button' }, dataset: { whKey: 'go' }, on: { click: () => emit('quest') } },
          h('span', { i18n: 'wh.m.objective.go' }), ic('chevron-right', 'wh-m-btn__chev'))));
    const box = h('section', { class: 'wh-m-objective wh-panel wh-interactive', dataset: { quest: q.id } }, head, more);
    refs.objective = box; refs.objectiveHead = head; refs.objectiveMore = more;
    syncObjective();
    return box;
  }
  function syncObjective() {
    if (!refs.objective) return;
    refs.objective.classList.toggle('wh-is-expanded', objectiveOpen);
    refs.objectiveHead.setAttribute('aria-expanded', String(objectiveOpen));
    if (objectiveOpen) refs.objectiveMore.removeAttribute('inert'); else refs.objectiveMore.setAttribute('inert', '');
  }

  function iris(m) {
    if (!irisVisible(m)) return null;
    const d = m.dialogue;
    const moreId = id + '-iris';
    const speaker = h('span', { class: 'wh-m-iris__speaker' });
    tx(speaker, i18n, 'wh.dialogue.speaker', () => ({ name: i18n.t('agent.' + d.speaker) }));
    const bar = h('button', {
      class: 'wh-m-iris__bar', attrs: { type: 'button', 'aria-controls': moreId, 'aria-expanded': String(irisOpen) },
      dataset: { whKey: 'iris' },
      on: { click: () => { irisOpen = !irisOpen; syncIris(); emit('dialogueToggle', irisOpen); } },
    },
    h('span', { class: 'wh-m-iris__avatar wh-m-iris__avatar--' + d.speaker, attrs: { 'aria-hidden': 'true' } }, ic('bubble', 'wh-m-iris__bubble')),
    speaker,
    ref(i18n, d.lineMobile || d.line, 'wh-m-iris__text'),
    ic('chevron-up', 'wh-m-iris__chev', { strokeWidth: 1.9 }));
    const replies = (d.replies || []).slice(0, 3).map((r) => h('button', {
      class: 'wh-m-reply wh-interactive', attrs: { type: 'button', 'data-reply': r.id, 'aria-keyshortcuts': r.hotkey || null },
      i18nAttrs: { 'aria-label': 'wh.dialogue.reply' }, attrArgs: () => ({ key: r.hotkey, text: plain(i18n, r.text) }),
      on: { click: () => emit('reply', r.id) },
    }, h('span', { class: 'wh-kbd wh-m-reply__kbd', attrs: { 'aria-hidden': 'true' }, text: r.hotkey || '' }), ref(i18n, r.text, 'wh-m-reply__text')));
    const more = h('div', { class: 'wh-m-iris__more', attrs: { id: moreId } },
      h('div', { class: 'wh-m-iris__more-inner' }, ref(i18n, d.line, 'wh-m-iris__full', 'p'), ...replies));
    const box = h('section', { class: 'wh-m-iris wh-panel wh-interactive', attrs: { role: 'group', 'aria-live': 'polite' }, i18nAttrs: { 'aria-label': 'wh.dialogue.label' } }, bar, more);
    refs.iris = box; refs.irisBar = bar; refs.irisMore = more;
    if (replies.length && !irisOpen) { irisOpen = true; } // a question opens the bar so the replies are one tap away
    syncIris();
    return box;
  }
  function syncIris() {
    if (!refs.iris) return;
    refs.iris.classList.toggle('wh-is-expanded', irisOpen);
    refs.irisBar.setAttribute('aria-expanded', String(irisOpen));
    refs.irisBar.setAttribute('title', i18n.t(irisOpen ? 'wh.dialogue.collapse' : 'wh.dialogue.expand'));
    if (irisOpen) refs.irisMore.removeAttribute('inert'); else refs.irisMore.setAttribute('inert', '');
  }

  function bottom(m) {
    return h('div', { class: 'wh-m-bottom' }, prompt(m), objective(m), iris(m));
  }

  // ---------------------------------------------------------------- bottom navigation
  function nav(m) {
    const items = navItems(m);
    const bar = h('nav', { class: 'wh-m-nav wh-interactive', i18nAttrs: { 'aria-label': 'wh.m.nav.label' } },
      ...items.map((it) => h('button', {
        class: 'wh-m-nav__item' + (it.unread ? ' wh-m-nav__item--unread' : ''),
        attrs: { type: 'button', 'aria-pressed': String(active === it.id) }, dataset: { nav: it.id, whKey: 'nav-' + it.id },
        on: { click: (e) => onNav(it.id, e.currentTarget) },
      },
      ic(it.icon, 'wh-m-nav__icon wh-m-nav__icon--' + it.icon),
      h('span', { class: 'wh-m-nav__label', i18n: it.label }),
      it.unread ? h('span', { class: 'sr-only', i18n: 'wh.tiles.unread' }) : null)));
    refs.nav = bar;
    return bar;
  }
  function onNav(navId, button) {
    if (navId === 'quests' || navId === 'log') {
      if (sheet === navId) api.closeSheet(); else api.openSheet(navId, button);
      return;
    }
    emit('nav', navId);
    if (sheet) api.closeSheet(); // one surface at a time: another sheet replaces an own one
    if (active === navId) { // a second tap on the open surface closes it
      if (navId === 'signs') emit('signsClose'); else emit('hotkey', navId);
      return;
    }
    if (navId === 'signs') emit('tile', 'signs');
    else emit('hotkey', navId);
  }
  function syncNav() {
    if (!refs.nav) return;
    for (const b of refs.nav.querySelectorAll('.wh-m-nav__item')) b.setAttribute('aria-pressed', String(active === b.dataset.nav));
    el.dataset.mode = active ? 'command' : 'explore';
    if (active) el.dataset.active = active; else delete el.dataset.active;
  }

  // ---------------------------------------------------------------- own sheets: quests, journal
  function sheetHost() {
    const scrim = h('div', { class: 'wh-m-scrim wh-interactive', attrs: { 'aria-hidden': 'true' }, dataset: { open: 'false' }, on: { click: () => api.closeSheet() } });
    const titleId = id + '-sheet-title';
    const close = h('button', {
      class: 'wh-btn-icon wh-btn-icon--round wh-m-sheet__close', attrs: { type: 'button' }, dataset: { whKey: 'sheet-close' },
      i18nAttrs: { 'aria-label': 'wh.m.close' }, on: { click: () => api.closeSheet() },
    }, ic('close', 'wh-m-sheet__x'));
    const title = h('h2', { class: 'wh-m-sheet__title', attrs: { id: titleId } });
    const body = h('div', { class: 'wh-m-sheet__body' });
    const panel = h('section', {
      class: 'wh-panel wh-m-sheet wh-interactive', dataset: { open: 'false' },
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, inert: '', 'aria-hidden': 'true' },
    }, h('span', { class: 'wh-m-sheet__handle', attrs: { 'aria-hidden': 'true' } }), h('header', { class: 'wh-m-sheet__head' }, title, close), body);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); api.closeSheet(); } });
    Object.assign(refs, { scrim, panel, sheetTitle: title, sheetBody: body, sheetClose: close });
    return h('div', { class: 'wh-m-sheet-host' }, scrim, panel);
  }

  function questsSheet(m) {
    const q = m.quests[m.questIndex] || m.quests[0];
    const kids = [];
    if (q) {
      kids.push(h('section', { class: 'wh-m-sheet__section wh-m-quest' },
        h('span', { class: 'wh-m-objective__tag' }, ic('sparkle', 'wh-m-objective__spark'), h('span', { i18n: 'wh.quest.tag' })),
        ref(i18n, q.title, 'wh-m-quest__title', 'h3'),
        ...(q.body || []).map((b) => ref(i18n, b, 'wh-m-quest__line', 'p')),
        h('button', { class: 'wh-m-btn wh-m-btn--go', attrs: { type: 'button' }, dataset: { whKey: 'sheet-go' }, on: { click: () => { api.closeSheet(); emit('quest'); } } },
          h('span', { i18n: 'wh.m.objective.go' }), ic('chevron-right', 'wh-m-btn__chev'))));
    }
    if (m.hint && m.hint.visible && m.hint.text) {
      kids.push(h('p', { class: 'wh-m-sheet__hint' }, ic('info-i', 'wh-m-sheet__hint-icon'), ref(i18n, m.hint.text, 'wh-m-sheet__hint-text')));
    }
    const hub = m.hub;
    if (hub && hub.visible) {
      kids.push(h('section', { class: 'wh-m-sheet__section' },
        h('h3', { class: 'wh-m-sheet__h', i18n: 'wh.m.shells.label' }),
        h('ul', { class: 'wh-m-list' }, ...[1, 2, 3, 4].map((n) => {
          const state = shellState(hub, n);
          const disabled = hub.busy || (hub.inShell && state !== 'here');
          return h('li', {}, h('button', {
            class: 'wh-m-row wh-m-row--' + state, attrs: { type: 'button', disabled: disabled || state === 'here' || null, 'aria-current': state === 'here' ? 'location' : null },
            dataset: { whKey: 'sheet-shell-' + n, shell: String(n) },
            on: { click: () => { api.closeSheet(); emit('shell', n); } },
          },
          h('span', { class: 'wh-m-row__numeral', text: ROMAN[n - 1] }),
          tx(h('span', { class: 'wh-m-row__text' }), i18n, 'wh.m.shell.' + state, { shell: ROMAN[n - 1] }),
          state === 'here' ? null : ic('chevron-right', 'wh-m-row__chev')));
        })),
        hub.canPass ? h('button', {
          class: 'wh-m-btn wh-m-btn--ghost', attrs: { type: 'button', disabled: hub.busy || null }, dataset: { whKey: 'pass' },
          on: { click: () => { api.closeSheet(); emit('pass'); } },
        }, h('span', { class: 'wh-kbd wh-m-btn__kbd', attrs: { 'aria-hidden': 'true' }, text: 'T' }), tx(h('span'), i18n, 'wh.m.pass', { n: m.trial.n })) : null));
    }
    return kids;
  }

  function logSheet(m) {
    const tabs = h('div', { class: 'wh-m-tabs', attrs: { role: 'tablist' } }, ...TABS.map((t) => h('button', {
      class: 'wh-chip wh-m-tab', attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab === t), tabindex: tab === t ? '0' : '-1' },
      dataset: { tab: t, whKey: 'tab-' + t },
      on: { click: () => { tab = t; renderSheet(); focus(refs.sheetBody.querySelector(`[data-tab="${t}"]`)); } },
    }, h('span', { i18n: 'wh.tabs.' + t }))));
    tabs.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(tab);
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      renderSheet();
      focus(refs.sheetBody.querySelector(`[data-tab="${tab}"]`));
    });
    const items = (m.journal && m.journal[tab]) || [];
    const list = h('ol', { class: 'wh-m-log', attrs: { role: 'tabpanel' }, dataset: { tab } }, ...items.slice(0, 40).map((it) => {
      const time = h('span', { class: 'wh-m-log__time' });
      if (it.time && typeof it.time === 'object' && it.time.key) tx(time, i18n, it.time.key, it.time.args); else time.textContent = it.time || '';
      return h('li', { class: 'wh-m-log__row', dataset: { id: it.id, tone: it.tone || '' } }, time, ref(i18n, it.text, 'wh-m-log__text'));
    }));
    return [tabs, items.length ? list : h('p', { class: 'wh-m-sheet__empty', i18n: 'wh.m.empty.' + tab })];
  }

  function renderSheet() {
    if (!sheet || !refs.sheetBody) return;
    refs.sheetTitle.dataset.i18n = sheet === 'quests' ? 'wh.m.nav.quests' : 'wh.m.nav.log';
    refs.sheetBody.textContent = '';
    refs.sheetBody.dataset.sheet = sheet;
    refs.sheetBody.append(...(sheet === 'quests' ? questsSheet(model) : logSheet(model)).filter(Boolean));
    applyI18n(refs.panel, i18n);
  }
  function syncSheet() {
    const open = !!sheet;
    refs.panel.dataset.open = String(open);
    refs.scrim.dataset.open = String(open);
    if (open) { refs.panel.removeAttribute('inert'); refs.panel.removeAttribute('aria-hidden'); } else { refs.panel.setAttribute('inert', ''); refs.panel.setAttribute('aria-hidden', 'true'); }
    el.dataset.sheet = sheet || '';
  }

  // ---------------------------------------------------------------- render
  function render() {
    const focused = doc.activeElement && el.contains(doc.activeElement) && doc.activeElement.dataset ? doc.activeElement.dataset.whKey : null;
    const wasOpen = sheet;
    el.textContent = '';
    for (const k of Object.keys(refs)) delete refs[k];
    el.append(...[topBar(model), shells(model), bottom(model), nav(model), sheetHost()].filter(Boolean));
    applyI18n(el, i18n);
    syncNav();
    if (wasOpen) { renderSheet(); syncSheet(); }
    if (focused) { const again = el.querySelector(`[data-wh-key="${focused}"]`); if (again) focus(again); }
  }

  /** Re-renders only the parts whose sub-objects changed (the host reuses unchanged ones, from-obs.js reuse()). */
  function patch(prev, next) {
    const same = (k) => prev && prev[k] === next[k];
    if (!prev || !same('trial') || !same('hotbar') || !same('hub') || !same('journal') || prev.mode !== next.mode || prev.unlocks !== next.unlocks) { render(); return; }
    let changed = false;
    if (!same('quests') || prev.questIndex !== next.questIndex) { const n = objective(next); const old = el.querySelector('.wh-m-objective'); if (old && n) old.replaceWith(n); else if (n) el.querySelector('.wh-m-bottom').appendChild(n); changed = true; }
    if (!same('dialogue')) {
      const old = el.querySelector('.wh-m-iris');
      irisOpen = !!(next.dialogue && next.dialogue.replies && next.dialogue.replies.length) || (irisOpen && !!old && !!prev.dialogue && !!next.dialogue && prev.dialogue.speaker === next.dialogue.speaker);
      const n = iris(next);
      if (old && n) old.replaceWith(n); else if (old) old.remove(); else if (n) el.querySelector('.wh-m-bottom').appendChild(n);
      changed = true;
    }
    if (!same('prompt')) {
      const old = refs.prompt;
      if (old && next.prompt && prev.prompt && prev.prompt.text === next.prompt.text && prev.prompt.hotkey === next.prompt.hotkey) {
        old.classList.toggle('wh-is-hidden', !next.prompt.visible);
        if (next.prompt.visible) { old.removeAttribute('aria-hidden'); old.removeAttribute('tabindex'); } else { old.setAttribute('aria-hidden', 'true'); old.setAttribute('tabindex', '-1'); }
      } else {
        const n = prompt(next);
        if (old && n) old.replaceWith(n); else if (old) old.remove(); else if (n) el.querySelector('.wh-m-bottom').prepend(n);
      }
      changed = true;
    }
    if (!same('hint') && sheet === 'quests') renderSheet();
    if (changed) applyI18n(el.querySelector('.wh-m-bottom'), i18n);
  }

  render();

  const api = {
    el,
    get sheet() { return sheet; },
    get active() { return active; },
    /** Opens one of the package's own sheets (quests, log) and reports `sheetOpen` so the host can claim exclusivity. */
    openSheet(which, from = null) {
      if (which !== 'quests' && which !== 'log') return;
      if (sheet === which) return;
      opener = from || (doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement : null);
      const switching = !!sheet;
      sheet = which;
      renderSheet();
      syncSheet();
      api.setActive(which);
      emit('sheetOpen', which);
      if (!switching && refs.sheetClose) focus(refs.sheetClose);
    },
    closeSheet() {
      if (!sheet) return;
      const was = sheet;
      sheet = null;
      syncSheet();
      if (active === was) api.setActive(null);
      emit('sheetClose', was);
      if (opener && opener.isConnected !== false) focus(opener);
      opener = null;
    },
    /** The host says which surface is open (own sheet, 'signs', 'memory', 'map', or null): the nav highlights it. */
    setActive(navId) {
      active = navId || null;
      if (active !== 'quests' && active !== 'log' && sheet) { sheet = null; syncSheet(); }
      syncNav();
    },
    /** Escape closes an own sheet. Returns true when used. */
    handleKey(code) { if (code === 'Escape' && sheet) { api.closeSheet(); return true; } return false; },
    update(next) {
      if (!next || next === model) return;
      const prev = model;
      model = next;
      patch(prev, next);
      if (sheet) renderSheet();
    },
    destroy() { el.remove(); for (const k of Object.keys(refs)) delete refs[k]; },
  };
  return api;
}
