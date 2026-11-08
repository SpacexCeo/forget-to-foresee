// Settings and language controls shared by the lobby, onboarding and HUD. The Accessibility section
// (docs/accessibility.md): interface mode Simple / Novice / Pro, interface size 100–200 %, high contrast,
// readable font, colour-blind-safe colours, narration with its rate and a "try it" sample.
import { h, applyI18n } from './dom.js';
import { PREF_OPTIONS } from './prefs.js';
import { NARRATION_RATES } from '../play/narration.js';
import { attachA11y } from './a11y.js';

/** Settings labels for the narration rate steps (NARRATION_RATES order). */
export const RATE_LABEL = Object.freeze({ 0.75: 'slower', 0.9: 'slow', 1: 'normal', 1.15: 'fast', 1.3: 'faster' });

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

function checkbox(labelKey, checked, onChange, extra = null) {
  const id = uid('chk');
  return h('div', { class: 'ftf-field' }, h('div', { class: 'ftf-choice' }, h('label', { attrs: { for: id } },
    h('input', { attrs: { id, type: 'checkbox', checked }, on: { change: (e) => onChange(e.target.checked) } }),
    h('span', { i18n: labelKey }))), extra);
}

/** The settings form. Every change applies immediately and is stored on this device. */
export function buildSettings(ctx) {
  const { prefs, i18n } = ctx;
  const p = prefs.get();
  const body = h('div', {},
    radios('lang', 'settings.language', i18n.locales, i18n.locale, (l) => 'lang.' + l, (l) => { prefs.set({ locale: l }); i18n.setLocale(l); }),
    radios('motion', 'settings.motion', PREF_OPTIONS.motion, p.motion, (m) => 'settings.motion.' + m, (m) => prefs.set({ motion: m })),
    checkbox('settings.subtitles', p.subtitles, (on) => prefs.set({ subtitles: on })),
    select('settings.subtitleSize', PREF_OPTIONS.subtitleSize, p.subtitleSize, (s) => 'settings.size.' + s, (s) => prefs.set({ subtitleSize: s })),
    radios('hudMode', 'settings.hudMode', PREF_OPTIONS.hudMode, p.hudMode, (m) => 'settings.hudMode.' + m, (m) => prefs.set({ hudMode: m })),
    select('settings.hudScale', PREF_OPTIONS.hudScale, p.hudScale, (s) => 'settings.hudScale.' + s, (s) => prefs.set({ hudScale: s })),
    select('settings.quality', PREF_OPTIONS.quality, p.quality, (q) => 'settings.quality.' + q, (q) => prefs.set({ quality: q })),
    buildAccessibility(ctx),
    h('p', { class: 'ftf-muted', i18n: 'settings.note' }));
  // Keep the language radios in sync when the language changes elsewhere.
  i18n.subscribe((loc) => { const r = body.querySelector(`input[type="radio"][value="${loc}"]`); if (r) r.checked = true; });
  applyI18n(body, i18n);
  return body;
}

/**
 * The Accessibility section alone (docs/accessibility.md): mounted inside buildSettings and, in the
 * world, appended to the scene controls dialog by play/all-ages.js so every option is reachable mid-season.
 */
export function buildAccessibility(ctx) {
  const { prefs, i18n } = ctx;
  const p = prefs.get();
  const narration = attachA11y(ctx);
  const scaleId = uid('scale'), rateId = uid('rate');
  const scaleSel = h('select', { class: 'ftf-select', attrs: { id: scaleId }, on: { change: (e) => prefs.set({ uiScale: Number(e.target.value) }) } },
    PREF_OPTIONS.uiScale.map((n) => h('option', { text: n + ' %', attrs: { value: n, selected: n === p.uiScale } }))); // numbers need no translation
  const rateSel = h('select', { class: 'ftf-select', attrs: { id: rateId }, on: { change: (e) => prefs.set({ narrationRate: Number(e.target.value) }) } },
    NARRATION_RATES.map((r) => h('option', { i18n: 'settings.a11y.rate.' + RATE_LABEL[r], attrs: { value: r, selected: r === p.narrationRate } })));
  const tryBtn = h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'settings.a11y.try', attrs: { type: 'button', 'data-a11y': 'try' }, on: { click: () => {
    narration.force(true);
    const t = narration.say('a11y.narration.sample', {}, { channel: 'ui', interrupt: true });
    if (t) t.done.then(() => narration.force(null)); else narration.force(null);
  } } });
  const avail = narration.available;
  const section = h('fieldset', { class: 'ftf-field ftf-a11y', attrs: { 'data-a11y': 'section' } }, h('legend', { i18n: 'settings.a11y' }),
    h('div', { class: 'ftf-field' }, h('label', { i18n: 'settings.a11y.uiScale', attrs: { for: scaleId } }), scaleSel),
    checkbox('settings.a11y.contrast', p.contrast === 'high', (on) => prefs.set({ contrast: on ? 'high' : 'normal' })),
    checkbox('settings.a11y.font', p.font === 'readable', (on) => prefs.set({ font: on ? 'readable' : 'default' })),
    checkbox('settings.a11y.palette', p.palette === 'safe', (on) => prefs.set({ palette: on ? 'safe' : 'default' })),
    checkbox('settings.a11y.narration', p.narration, (on) => prefs.set({ narration: on }),
      avail ? null : h('p', { class: 'ftf-muted', i18n: 'settings.a11y.narration.none' })),
    h('div', { class: 'ftf-field ftf-a11y-rate', attrs: { hidden: !avail } }, h('label', { i18n: 'settings.a11y.rate', attrs: { for: rateId } }), h('div', { class: 'ftf-row' }, rateSel, tryBtn)),
    h('p', { class: 'ftf-muted', i18n: 'settings.a11y.note' }));
  // other panels (the tutorial's mode question, the recap) may change these prefs: mirror them here
  prefs.subscribe((q) => {
    scaleSel.value = String(q.uiScale); rateSel.value = String(q.narrationRate);
    const boxes = section.querySelectorAll('input[type="checkbox"]');
    const want = [q.contrast === 'high', q.font === 'readable', q.palette === 'safe', q.narration];
    boxes.forEach((b, k) => { if (k < want.length) b.checked = want[k]; });
  });
  applyI18n(section, i18n);
  return section;
}
