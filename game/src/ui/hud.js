// In-world HUD overlay: season status, the localized chronicle, and subtitles for
// agent lines (spec §3, §9). Tells never rely on colour alone: every chronicle
// entry has a glyph and a screen-reader label; tension has a number, a level word,
// a glyph and a fill pattern. Re-renders in place when the language changes.
import { h, tx, bindI18n, ensureStyles } from './dom.js';
import { getUiContext } from './context.js';
import { localizeFeedEntry, fxToLine, renderLine } from './i18n/engine-adapter.js';
import { TICKS } from '../game/engine.js';

export const TELL_GLYPH = { good: '+', bad: '!', key: '◆', muted: '·', tick: '—', '': '•' };
const TELL_KEY = { good: 'tell.good', bad: 'tell.bad', key: 'tell.key', muted: 'tell.muted', tick: 'tell.tick', '': 'tell.plain' };
export const tensionLevel = (H) => (H >= 70 ? 'critical' : H >= 40 ? 'strained' : 'calm');
const MAX_LOG = 40;

/**
 * @param {HTMLElement} root  positioned container (the HUD fills it)
 * @param {{getState: () => object, subscribe?: (fn: () => void) => () => void}} store
 * @param {{ctx?: object}} opts
 */
export function mountHud(root, store, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const { i18n, prefs } = ctx;
  ensureStyles();

  const tick = h('div'), phase = h('div'), silk = h('div'), attention = h('div'), pips = h('span', { class: 'ftf-pips', attrs: { 'aria-hidden': 'true' } });
  const tensionText = h('span'), level = h('span', { class: 'ftf-level' });
  const fill = h('div', { class: 'ftf-meter-fill' });
  const meter = h('div', { class: 'ftf-meter', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' } }, fill);
  const outcome = h('div', { attrs: { role: 'status' } });
  const status = h('section', { class: 'ftf-hud-status', i18nAttrs: { 'aria-label': 'hud.label' } },
    tick, phase, silk, h('div', {}, attention, ' ', pips), h('div', {}, tensionText, ' · ', level), meter, outcome);

  const logId = 'ftf-log-' + Math.random().toString(36).slice(2, 7);
  const log = h('ol', { class: 'ftf-log', attrs: { id: logId } });
  const toggle = h('button', { class: 'ftf-btn ftf-btn-small', attrs: { type: 'button', 'aria-expanded': 'true', 'aria-controls': logId } });
  toggle.addEventListener('click', () => {
    const open = log.hidden;
    log.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    tx(toggle, i18n, open ? 'hud.chronicle.hide' : 'hud.chronicle.show');
  });
  tx(toggle, i18n, 'hud.chronicle.hide');
  const chronicle = h('aside', { class: 'ftf-hud-chronicle', attrs: { 'aria-labelledby': logId + '-h' } },
    h('header', {}, h('h2', { i18n: 'hud.chronicle', attrs: { id: logId + '-h' } }), toggle), log);

  const subs = h('div', { class: 'ftf-subtitles', attrs: { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' }, i18nAttrs: { 'aria-label': 'hud.subtitles' } });
  const toast = h('div', { class: 'ftf-hud-toast', attrs: { role: 'alert', hidden: true } });
  const wrap = h('div', { class: 'ftf-root ftf-hud', attrs: { style: 'background:transparent;min-height:0' } }, status, chronicle, subs, toast);
  root.appendChild(wrap);

  let lastVersion = -1, lastFeedTop = null;
  /** Lines are kept as semantic data so they re-render in the new language. */
  const lines = [];
  let queue = [], timer = 0;

  function renderStatus(S) {
    tx(tick, i18n, 'hud.tick', { tick: S.tick, total: TICKS });
    tx(phase, i18n, 'hud.phase', () => ({ phase: i18n.t('hud.phase.' + S.phase) }));
    tx(silk, i18n, 'hud.silk', { n: S.silk[0] });
    const max = S.wild ? 2 : 3;
    tx(attention, i18n, 'hud.attention', { n: S.ap, max });
    pips.textContent = '●'.repeat(Math.max(0, S.ap)) + '○'.repeat(Math.max(0, max - S.ap));
    const H = Math.min(100, S.H), lv = tensionLevel(H);
    tx(tensionText, i18n, 'hud.tension', { n: H });
    level.dataset.level = lv; meter.dataset.level = lv;
    tx(level, i18n, 'hud.tension.' + lv);
    fill.style.width = H + '%';
    meter.setAttribute('aria-valuenow', String(H));
    meter.setAttribute('aria-valuetext', `${i18n.t('hud.tension', { n: H })}, ${i18n.t('hud.tension.' + lv)}`);
    if (S.outcome) tx(outcome, i18n, 'hud.outcome', () => ({ outcome: i18n.t('outcome.' + S.outcome) }));
    else { outcome.textContent = ''; delete outcome.dataset.i18n; }
  }

  function renderLog(S) {
    log.replaceChildren(...S.feed.slice(0, MAX_LOG).map((f) => {
      const e = localizeFeedEntry(f, i18n);
      const cls = TELL_GLYPH[e.cls] != null ? e.cls : '';
      return h('li', { dataset: { cls } },
        h('span', { class: 'ftf-glyph', text: TELL_GLYPH[cls], attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'ftf-t', text: String(e.tick) }),
        h('span', { class: 'ftf-text' }, h('span', { class: 'sr-only', text: i18n.t(TELL_KEY[cls]) + ': ' }), e.text));
    }));
  }

  function renderSubs() {
    const shown = lines.slice(-2);
    subs.replaceChildren(...shown.map((ln, k) => {
      const r = renderLine(ln, i18n);
      return h('p', { class: 'ftf-sub-line', dataset: { speaker: r.speakerId, ...(k < shown.length - 1 ? { old: '' } : {}) }, attrs: { lang: i18n.locale } },
        h('span', { class: 'ftf-speaker', text: r.speaker }), h('span', { text: r.text }));
    }));
  }

  function pump() {
    timer = 0;
    if (!queue.length) return;
    const ln = queue.shift();
    lines.push(ln);
    if (lines.length > 20) lines.shift();
    renderSubs();
    const text = renderLine(ln, i18n).text;
    const ms = Math.max(2400, 60 * text.length) * (queue.length > 3 ? 0.4 : 1);
    timer = setTimeout(pump, ms);
  }

  const api = {
    /** Re-reads state from the store; cheap when nothing changed. */
    update(force = false) {
      const S = store.getState();
      if (!S) return;
      const top = S.feed[0];
      if (!force && S.version === lastVersion && top === lastFeedTop) return;
      lastVersion = S.version; lastFeedTop = top;
      renderStatus(S); renderLog(S);
    },
    /** Feeds semantic visual events (engine S.fx); each becomes a subtitle line. */
    pushFx(list) { for (const f of list || []) { const ln = fxToLine(f); if (ln) api.say(ln); } },
    /** Queues an agent line {speakerId, key, args}. */
    say(line) { queue.push(line); if (queue.length > 12) queue = queue.slice(-12); if (!timer) pump(); },
    /** Shows a localized rejection reason from an engine action result. */
    showRejection(reason) {
      tx(toast, i18n, 'hud.rejected', () => ({ reason: i18n.t('reason.' + reason) }));
      toast.hidden = false;
      clearTimeout(api._toastT);
      api._toastT = setTimeout(() => { toast.hidden = true; }, 3200);
    },
    el: wrap,
    destroy() { clearTimeout(timer); clearTimeout(api._toastT); unbind(); if (unStore) unStore(); unPrefs(); wrap.remove(); },
  };

  const unbind = bindI18n(wrap, i18n, () => { api.update(true); renderSubs(); });
  const unStore = store.subscribe ? store.subscribe(() => api.update()) : null;
  const unPrefs = prefs.subscribe(() => renderSubs());
  api.update(true);
  return api;
}

/** A minimal store over the engine module for pages that drive it directly. */
export function createEngineStore(E) {
  const subs = new Set();
  const notify = () => { for (const fn of [...subs]) fn(); };
  return {
    getState: () => E.S,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Calls an engine action by name and notifies; returns the engine result. */
    act(name, ...args) { const r = E[name](...args); notify(); return r; },
    notify,
    takeFx: () => E.takeFx(),
  };
}
