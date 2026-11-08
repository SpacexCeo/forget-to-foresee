// Settings and language controls shared by the lobby, onboarding and HUD.
import { h, applyI18n } from './dom.js';
import { PREF_OPTIONS } from './prefs.js';

let n = 0;
const uid = (p) => `ftf-${p}-${++n}`;

/** EN | UA | RU | IT | 中文 toggle. Switching re-renders everything in place. */
export function buildLangToggle(ctx) {
  const { i18n } = ctx;
  const group = h('div', { class: 'ftf-lang', attrs: { role: 'group' }, i18nAttrs: { 'aria-label': 'lang.label' } });
  const buttons = i18n.locales.map((loc) => h('button', {
    class: 'ftf-btn ftf-btn-small', i18n: 'lang.short.' + loc, i18nAttrs: { 'aria-label': 'lang.' + loc },
    attrs: { type: 'button', lang: loc }, on: { click: () => { ctx.prefs.set({ locale: loc }); i18n.setLocale(loc); } },
  }));
  const sync = () => buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(i18n.locales[k] === i18n.locale)));
  buttons.forEach((b, k) => { if (k) group.append(h('span', { class: 'ftf-lang-sep', text: '|', attrs: { 'aria-hidden': 'true' } })); group.append(b); });
  sync();
  i18n.subscribe(sync);
  return group;
}

function radios(name, legendKey, options, current, labelKey, onPick) {
  const id = uid(name);
  return h('fieldset', { class: 'ftf-field' }, h('legend', { i18n: legendKey }),
    h('div', { class: 'ftf-choice' }, options.map((opt) => h('label', {},
      h('input', { attrs: { type: 'radio', name: id, value: opt, checked: opt === current }, on: { change: () => onPick(opt) } }),
      h('span', { i18n: labelKey(opt) })))));
}
function select(labelKey, options, current, optionKey, onPick) {
  const id = uid('sel');
  const sel = h('select', { class: 'ftf-select', attrs: { id }, on: { change: (e) => onPick(e.target.value) } },
    options.map((o) => h('option', { i18n: optionKey(o), attrs: { value: o, selected: o === current } })));
  return h('div', { class: 'ftf-field' }, h('label', { i18n: labelKey, attrs: { for: id } }), sel);
}

/** The settings form. Every change applies immediately and is stored on this device. */
export function buildSettings(ctx) {
  const { prefs, i18n } = ctx;
  const p = prefs.get();
  const subId = uid('subs');
  const body = h('div', {},
    radios('lang', 'settings.language', i18n.locales, i18n.locale, (l) => 'lang.' + l, (l) => { prefs.set({ locale: l }); i18n.setLocale(l); }),
    radios('motion', 'settings.motion', PREF_OPTIONS.motion, p.motion, (m) => 'settings.motion.' + m, (m) => prefs.set({ motion: m })),
    h('div', { class: 'ftf-field' }, h('div', { class: 'ftf-choice' }, h('label', { attrs: { for: subId } },
      h('input', { attrs: { id: subId, type: 'checkbox', checked: p.subtitles }, on: { change: (e) => prefs.set({ subtitles: e.target.checked }) } }),
      h('span', { i18n: 'settings.subtitles' })))),
    select('settings.subtitleSize', PREF_OPTIONS.subtitleSize, p.subtitleSize, (s) => 'settings.size.' + s, (s) => prefs.set({ subtitleSize: s })),
    select('settings.quality', PREF_OPTIONS.quality, p.quality, (q) => 'settings.quality.' + q, (q) => prefs.set({ quality: q })),
    h('p', { class: 'ftf-muted', i18n: 'settings.note' }));
  // Keep the language radios in sync when the language changes elsewhere.
  i18n.subscribe((loc) => { const r = body.querySelector(`input[type=radio][value="${loc}"]`); if (r) r.checked = true; });
  applyI18n(body, i18n);
  return body;
}
