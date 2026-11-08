// Guest/testnet onboarding (spec §1): synthetic entitlement (labeled demo) →
// tutorial → hologram customization → first contact. The order is enforced by
// flow.js; this module only renders the current step.
import { h, tx, bindI18n, ensureStyles } from './dom.js';
import { getUiContext } from './context.js';
import { createOnboardingFlow, FLOW_STEPS } from './flow.js';
import { issueDemoEntitlement, getEntitlement } from './entitlement.js';
import { mountConstructor } from './hologram/constructor.js';
import { mountBackground } from './background.js';
import { saveRecipe, loadRecipe, recipeHash, DEFAULT_RECIPE } from './hologram/recipe.js';
import { actionButton } from './controls.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); kids.forEach((c) => el.appendChild(c)); return el; };
const FORM_PATHS = [
  (c) => s('path', { d: 'M -28 -93 Q 0 -114 28 -93', fill: 'none', stroke: c, 'stroke-width': 5, 'stroke-linecap': 'round' }),
  (c) => s('path', { d: 'M -11 -88 L 0 -118 L 11 -88', fill: 'none', stroke: c, 'stroke-width': 5, 'stroke-linejoin': 'round' }),
  (c) => s('circle', { cx: 0, cy: -103, r: 10, fill: 'none', stroke: c, 'stroke-width': 5 }),
  (c) => s('path', { d: 'M 0 -119 C 11 -102 11 -91 0 -88 C -11 -91 -11 -102 0 -119 Z', fill: c }),
];
/** The tutorial example "Shell II · Gift · 20 · +2": one dot, so reading starts at the right-hand slot. */
export const TUTORIAL_SIGN = Object.freeze({
  dots: 1,
  // reading order: [slot index, form index, meaning index]
  read: [[0, 2, 1], [1, 0, 0], [2, 1, 1], [3, 3, 1]],
});

function glyph(i18n, step) {
  const { dots, read } = TUTORIAL_SIGN;
  const svg = s('svg', { viewBox: '-130 -130 260 260', role: 'img' });
  svg.appendChild(s('circle', { cx: 0, cy: 0, r: 90, fill: 'none', stroke: '#b7c6bd', 'stroke-width': 2, opacity: 0.7 }));
  read.forEach(([, form], k) => {
    const pos = (dots + k) % 4; // 0 = top, clockwise
    const highlight = step >= 2 && k === 0;
    const g = s('g', { transform: `rotate(${pos * 90})` });
    g.appendChild(FORM_PATHS[form](highlight ? '#d4a15f' : '#e9e9db'));
    if (step >= 2) {
      const tEl = s('text', { x: 0, y: -60, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: highlight ? '#d4a15f' : '#b7c6bd', 'font-size': 16, transform: `rotate(${-pos * 90} 0 -60)` });
      tEl.textContent = String(k + 1);
      g.appendChild(tEl);
    }
    svg.appendChild(g);
  });
  svg.appendChild(s('circle', { cx: 0, cy: 0, r: 26, fill: '#18231f', stroke: step === 2 ? '#d4a15f' : '#53645d', 'stroke-width': 2 }));
  for (let d = 0; d < dots; d++) svg.appendChild(s('circle', { cx: (d - (dots - 1) / 2) * 12, cy: 0, r: 4.5, fill: '#e9e9db' }));
  if (step === 4) svg.appendChild(s('path', { d: 'M 70 70 l 18 -8 l 6 20 l -16 6 Z', fill: '#8f86a8', opacity: 0.9 }));
  const slots = read.map(([slot, form]) => `${i18n.t('slot.' + slot)} (${i18n.t('form.' + form)})`).join(', ');
  svg.setAttribute('aria-label', i18n.t('tut.glyphAlt', { count: dots, slots }));
  return svg;
}

/**
 * @param {HTMLElement} root
 * @param {{ctx?: object, flow?: object, onFirstContact?: (info) => void, onExit?: () => void, firstContactNoteKey?: string}} opts
 */
export function mountOnboarding(root, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const { i18n, prefs, storage } = ctx;
  const flow = opts.flow || createOnboardingFlow(storage);
  ensureStyles();
  const bgEl = h('div', { class: 'ftf-bg', attrs: { 'aria-hidden': 'true' } });
  const bg = mountBackground(bgEl, { reducedMotion: true, tier: prefs.tier() });
  const stepper = h('ol', { class: 'ftf-stepper', i18nAttrs: { 'aria-label': 'flow.progress' } });
  const stage = h('div', { class: 'ftf-step' });
  const top = h('div', { class: 'ftf-spread' }, stepper,
    h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'flow.toLobby', attrs: { type: 'button', 'data-gamepad-back': true }, on: { click: () => { flow.toLobby(); if (opts.onExit) opts.onExit(); } } }));
  const wrap = h('div', { class: 'ftf-root' }, bgEl, h('main', { class: 'ftf-screen' }, top, stage));
  root.appendChild(wrap);
  let child = null;
  let tutPage = 1;

  function renderStepper() {
    stepper.replaceChildren(...FLOW_STEPS.slice(1).map((st, k) => {
      const state = flow.step === st ? 'current' : flow.done[st] ? 'done' : 'locked';
      return h('li', { dataset: { state }, attrs: { 'aria-current': state === 'current' ? 'step' : null } },
        h('span', { i18n: 'flow.step.' + st }),
        h('span', { class: 'sr-only', i18n: 'flow.state.' + state }),
        h('span', { class: 'sr-only', i18n: 'flow.stepOf', args: { n: k + 1, total: 4 } }));
    }));
  }

  const heading = (key) => h('h1', { i18n: key, attrs: { tabindex: '-1' } });
  const primary = (key, fn) => actionButton({ key, variant: 'primary', symbol: 'arrow', trailing: true, onClick: fn });

  function viewEntitlement() {
    return h('section', { class: 'ftf-card' },
      heading('ent.title'),
      h('p', {}, h('span', { class: 'ftf-badge ftf-badge-demo', i18n: 'ent.badge' })),
      h('p', { i18n: 'ent.body' }),
      h('p', { class: 'ftf-muted', i18n: 'ent.wallet' }),
      primary('ent.accept', () => { issueDemoEntitlement(storage, ctx.guestId); flow.complete('entitlement'); }));
  }

  function viewTutorial() {
    const page = tutPage;
    const nav = h('div', { class: 'ftf-row' },
      page > 1 ? h('button', { class: 'ftf-btn', i18n: 'common.back', attrs: { type: 'button', 'data-gamepad-back': true }, on: { click: () => { tutPage--; render(); } } }) : null,
      page < 4 ? primary('common.next', () => { tutPage++; render(); }) : primary('tut.finish', () => flow.complete('tutorial')));
    const readout = page === 3 ? h('ol', { class: 'ftf-example' }, TUTORIAL_SIGN.read.map(([slot, form, m], k) =>
      h('li', { i18n: 'tut.readLine', args: () => ({ slot: i18n.t('slot.' + slot), form: i18n.t('form.' + form), meaning: i18n.t(`meaning.${slot}.${m}`) }) }))) : null;
    const g = glyph(i18n, page);
    const box = h('section', { class: 'ftf-card' },
      h('p', { class: 'ftf-muted', i18n: 'tut.title' }),
      h('div', { class: 'ftf-tut' }, g,
        h('div', {}, heading(`tut.${page}.title`), h('p', { i18n: `tut.${page}.body` }), page >= 2 ? h('p', { class: 'ftf-muted', i18n: 'tut.dots', args: { count: TUTORIAL_SIGN.dots } }) : null,
          page === 3 ? h('p', { class: 'ftf-example', i18n: 'tut.example' }) : null, readout, nav)));
    box._relabel = () => g.setAttribute('aria-label', glyph(i18n, page).getAttribute('aria-label'));
    return box;
  }

  function viewCustomization() {
    const box = h('section', {}, heading('ctor.title'), h('p', { class: 'ftf-muted', i18n: 'ctor.subtitle' }));
    const host = h('div', { class: 'ftf-card' });
    box.append(host, h('div', { class: 'ftf-row', attrs: { style: 'margin-top:20px' } }, primary('ctor.done', () => {
      saveRecipe(storage, child.getRecipe());
      flow.complete('customization');
    })));
    queueMicrotask(() => { child = mountConstructor(host, { ctx }); });
    return box;
  }

  function viewFirstContact() {
    const recipe = loadRecipe(storage) || DEFAULT_RECIPE;
    return h('section', { class: 'ftf-card' },
      heading('fc.title'),
      h('p', { i18n: 'fc.body' }),
      opts.firstContactNoteKey ? h('p', { class: 'ftf-muted', i18n: opts.firstContactNoteKey }) : null,
      primary('fc.enter', () => {
        if (opts.onFirstContact) opts.onFirstContact({ guestId: ctx.guestId, entitlement: getEntitlement(storage), recipe, recipeHash: recipeHash(recipe), locale: i18n.locale });
      }));
  }

  let view = null;
  function render() {
    if (child) { child.destroy(); child = null; }
    renderStepper();
    const st = flow.step;
    view = st === 'entitlement' ? viewEntitlement() : st === 'tutorial' ? viewTutorial() : st === 'customization' ? viewCustomization() : st === 'firstContact' ? viewFirstContact() : null;
    stage.replaceChildren(...(view ? [view] : []));
    bindAll();
    const hd = stage.querySelector('h1');
    if (hd) hd.focus({ preventScroll: false });
  }
  let unbind = null;
  function bindAll() { if (unbind) unbind(); unbind = bindI18n(wrap, i18n, () => { if (view && view._relabel) view._relabel(); }); }

  const unFlow = flow.subscribe((st) => { if (st !== 'lobby') { tutPage = 1; render(); } });
  if (flow.step === 'lobby') flow.enter(); else render();

  return {
    el: wrap,
    flow,
    destroy() { unFlow(); if (unbind) unbind(); if (child) child.destroy(); bg.destroy(); wrap.remove(); },
  };
}
