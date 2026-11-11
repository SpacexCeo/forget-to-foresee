// Guest/testnet onboarding (spec §1): synthetic entitlement (labeled demo) → tutorial → hologram
// customization → first contact. The order is enforced by flow.js; this module only renders the
// current step. The tutorial is five show-don't-tell beats (docs/tutorial.md §2.1): one idea, one
// action, immediate feedback, at most about twelve words of body per beat; "Skip tutorial" on every
// beat; the beat index is saved so a reload resumes; a returning player (every step done) goes
// straight to the island with no screen at all.
import { h, tx, bindI18n, ensureStyles } from './dom.js';
import { MOTION, installMotionStyles, enter, exit, stagger, press, seal, tickNumber, ringFlash } from './motion/index.js';
import { getUiContext } from './context.js';
import { createOnboardingFlow, createTutorial, FLOW_STEPS, TUTORIAL_BEATS, TUTORIAL_SIGN } from './flow.js';
import { issueDemoEntitlement, getEntitlement } from './entitlement.js';
import { mountConstructor } from './hologram/constructor.js';
import { mountBackground } from './background.js';
import { saveRecipe, loadRecipe, recipeHash, DEFAULT_RECIPE } from './hologram/recipe.js';
import { actionButton } from './controls.js';

export { TUTORIAL_SIGN } from './flow.js';

// Task Q's narration (game/src/play/narration.js) is optional: present → the tutorial speaks each beat on its
// 'tutorial' channel when the player turned narration on; absent → nothing happens. Vite resolves the glob at
// build time, so a missing module is an empty map, never an error.
const NARRATION_MODULES = typeof import.meta.glob === 'function' ? import.meta.glob('../play/narration.js') : {};

/** 'touch' | 'gamepad' | 'keyboard' for the device-aware copy ({input, select, …} in the strings). */
export function inputKindFor(win = globalThis) {
  try {
    const pads = win.navigator && win.navigator.getGamepads ? [...win.navigator.getGamepads()] : [];
    if (pads.some((p) => p && p.connected)) return 'gamepad';
  } catch { /* no gamepad API */ }
  try { if (win.matchMedia && win.matchMedia('(pointer: coarse)').matches) return 'touch'; } catch { /* no DOM */ }
  return 'keyboard';
}

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); kids.forEach((c) => el.appendChild(c)); return el; };
const FORM_PATHS = [
  (c, w) => s('path', { d: 'M -28 -93 Q 0 -114 28 -93', fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }),
  (c, w) => s('path', { d: 'M -11 -88 L 0 -118 L 11 -88', fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round' }),
  (c, w) => s('circle', { cx: 0, cy: -103, r: 10, fill: 'none', stroke: c, 'stroke-width': w }),
  (c, w) => s('path', { d: 'M 0 -119 C 11 -102 11 -91 0 -88 C -11 -91 -11 -102 0 -119 Z', fill: c, stroke: c, 'stroke-width': Math.max(0, w - 5) }),
];
const PEARL = '#e9e9db', AMBER = '#d4a15f', MIST = '#b7c6bd', STONE = '#53645d', INK = '#18231f';
/** Trial pacing of beat 4 (ms per trial); reduced motion plays all three at once. */
const TRIAL_MS = 650;

/** Scoped styles for the tutorial beats (the shared stylesheet is owned by the UI polish task). */
const CSS = `
.ftf-tutcard { position: relative; }
.ftf-tut-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.ftf-tut-head .ftf-muted { letter-spacing: .08em; text-transform: uppercase; font-size: .82rem; }
.ftf-tut-dots { display: inline-flex; gap: 8px; margin-left: 14px; vertical-align: middle; }
.ftf-tut-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--ftf-stone); display: inline-block; transition: transform var(--mo-base, 200ms) var(--mo-ease-out, ease-out), background-color var(--mo-fast, 120ms); }
.ftf-tut-dots i[data-state="current"] { transform: scale(1.25); }
.ftf-tut-dots i[data-state="done"] { background: var(--ftf-good); }
.ftf-tut-dots i[data-state="current"] { background: var(--ftf-amber); box-shadow: 0 0 0 3px rgba(212,161,95,.25); }
.ftf-ring { position: relative; width: min(320px, 100%); margin: 0 auto; aspect-ratio: 1; }
.ftf-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ftf-ring .ftf-slotbtn { position: absolute; width: 30%; height: 30%; margin: -15% 0 0 -15%; border-radius: 50%; border: 1px solid transparent; background: transparent; cursor: pointer; padding: 0; }
.ftf-ring .ftf-slotbtn:hover:enabled { border-color: rgba(212,161,95,.55); background: rgba(212,161,95,.08); }
.ftf-ring .ftf-slotbtn[disabled] { cursor: default; }
.ftf-ring .ftf-slotbtn[data-expected="true"] { animation: ftf-pulse 1.2s ease-in-out infinite; border-color: rgba(212,161,95,.7); }
.ftf-ring .ftf-corebtn { position: absolute; left: 50%; top: 50%; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; border: 1px solid transparent; background: transparent; cursor: pointer; padding: 0; }
.ftf-ring .ftf-corebtn:hover:enabled { border-color: rgba(212,161,95,.6); }
.ftf-ring .ftf-corebtn[data-expected="true"] { animation: ftf-pulse 1.2s ease-in-out infinite; border-color: rgba(212,161,95,.7); }
@keyframes ftf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(212,161,95,.0); } 50% { box-shadow: 0 0 0 8px rgba(212,161,95,.22); } }
.ftf-tut-text h1 { font-size: clamp(1.45rem, 3vw, 2rem); }
.ftf-tut-body { font-size: 1.08rem; margin: 0 0 14px; }
.ftf-tut-stage { min-height: 96px; display: grid; gap: 8px; align-content: start; justify-items: start; margin-bottom: 10px; }
.ftf-tut-stage > .ftf-row, .ftf-tut-stage > .ftf-field, .ftf-tut-stage > ol { justify-self: stretch; }
.ftf-tut-fb { min-height: 1.6em; color: var(--ftf-amber); margin: 0 0 14px; font-size: 1.02rem; }
.ftf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ftf-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 4px 12px; border: 1px solid var(--ftf-stone); border-radius: 17px; color: var(--ftf-mist); font-size: .95rem; }
.ftf-chip[data-on="true"] { border-color: var(--ftf-amber); color: var(--ftf-pearl); }
button.ftf-chip { min-height: 40px; min-width: 40px; padding: 6px 14px; border-radius: 20px; background: transparent; font: inherit; font-size: .95rem; cursor: pointer; }
button.ftf-chip:hover, button.ftf-chip:focus-visible { border-color: var(--ftf-amber); background: rgba(212,161,95,.08); }
button.ftf-chip[data-expected="true"] { border-color: rgba(212,161,95,.7); animation: ftf-pulse 1.2s ease-in-out infinite; }
button.ftf-chip[data-hint="true"] { box-shadow: 0 0 0 2px rgba(212,161,95,.3); }
.ftf-slot-hint { margin: 0; color: var(--ftf-pearl); font-size: 1rem; min-height: 1.5em; }
.ftf-chip[data-on="true"]::before { content: "✓"; color: var(--ftf-amber); }
.ftf-readrow { display: grid; grid-template-columns: 1.6em 1fr; gap: 6px 10px; margin: 0; padding: 0; list-style: none; font-size: 1.02rem; }
.ftf-readrow li { display: contents; }
.ftf-readrow .ftf-n { color: var(--ftf-amber); font-family: var(--ftf-mono); }
.ftf-readrow .ftf-k { color: var(--ftf-mist); }
.ftf-sentence { font-size: 1.15rem; color: var(--ftf-pearl); margin: 6px 0 0; }
.ftf-silk { display: inline-flex; align-items: center; gap: 8px; font-family: var(--ftf-mono); color: var(--ftf-pearl); font-size: 1.05rem; }
.ftf-silk b { color: var(--ftf-amber); font-weight: 600; min-width: 2ch; text-align: right; transition: color var(--ftf-motion-fast); }
.ftf-trials { display: flex; gap: 8px; }
.ftf-trials span { min-width: 72px; text-align: center; padding: 6px 10px; border: 1px solid var(--ftf-stone); border-radius: 4px; color: var(--ftf-mist); font-size: .95rem; white-space: nowrap; }
.ftf-trials span { transition: transform var(--mo-base, 200ms) var(--mo-ease-out, ease-out), border-color var(--mo-fast, 120ms), color var(--mo-fast, 120ms), background-color var(--mo-fast, 120ms); }
.ftf-trials span[data-on="true"] { border-color: var(--ftf-amber); color: var(--ftf-pearl); }
.ftf-trials span[data-on="true"]:not([data-sealed="true"]) { transform: scale(1.04); }
.ftf-chip { transition: transform var(--mo-base, 200ms) var(--mo-ease-out, ease-out), opacity var(--mo-fast, 120ms); }
.ftf-chip[data-on="true"] { transform: scale(1.06); }
.ftf-stepper li { transition: color var(--mo-fast, 120ms), transform var(--mo-base, 200ms) var(--mo-ease-out, ease-out); }
.ftf-stepper li[data-state="current"] { transform: translateX(2px); }
html[data-motion="reduce"] .ftf-tut-dots i, html[data-motion="reduce"] .ftf-trials span, html[data-motion="reduce"] .ftf-chip, html[data-motion="reduce"] .ftf-stepper li { transform: none !important; }
.ftf-trials span[data-sealed="true"] { background: rgba(212,161,95,.14); color: var(--ftf-amber); }
.ftf-seal { font-size: 1.15rem; color: var(--ftf-amber); margin: 0; }
.ftf-memcard { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid var(--ftf-stone); border-radius: 6px; max-width: 420px; transition: opacity .5s, transform .5s; }
.ftf-memcard[data-gone="true"] { opacity: .32; transform: translateY(2px) scale(.98); text-decoration: line-through; }
.ftf-memcard b { font-weight: 600; letter-spacing: .04em; }
.ftf-vision { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; max-width: 420px; }
.ftf-vision .ftf-ghost { width: 44px; height: 44px; border-radius: 50%; border: 2px dashed var(--ftf-iris-text); opacity: .9; }
.ftf-mode-question { margin: 10px 0 0; }
.ftf-mode-question .ftf-strong { font-size: 1.05rem; margin: 0 0 10px; }
.ftf-looks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.ftf-look { flex-direction: column; gap: 8px; padding: 12px 6px; min-height: 76px; }
.ftf-look[aria-pressed="true"] { border-color: var(--ftf-amber); color: var(--ftf-amber); }
.ftf-look[aria-pressed="true"]::before { content: none; }
.ftf-look-swatch { display: inline-flex; gap: 3px; }
.ftf-look-swatch i { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,.35); }
.ftf-ctor-compact .ftf-ctor-preview { max-width: 380px; margin: 0 auto; position: static; }
.ftf-ctor-compact .ftf-ctor-canvas { max-height: 300px; max-width: 300px; margin: 0 auto; }
.ftf-ctor-compact:not(.ftf-ctor-open) { grid-template-columns: minmax(0, 1fr); }
.ftf-ctor-detail { display: grid; gap: 10px; }
.ftf-ctor-detail[hidden], .ftf-ctor-controls[hidden] { display: none; }
.ftf-access details { margin: 0 0 16px; }
.ftf-access summary { cursor: pointer; color: var(--ftf-mist); }
.ftf-access details p { margin: .6em 0 0; }
@media (max-width: 520px) { .ftf-looks { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ftf-trials span { min-width: 0; flex: 1; padding: 6px 4px; font-size: .88rem; } }
`;
function ensureTutStyles(doc = document) {
  if (doc.getElementById('ftf-tut-style')) return;
  const el = doc.createElement('style'); el.id = 'ftf-tut-style'; el.textContent = CSS; doc.head.appendChild(el);
}

/** Position (0 = top, clockwise) of the stroke read k-th. */
const posOf = (k, dots) => (dots + k) % 4;
/** The reading index of the stroke at position p (0 = top), or -1 when there are no dots to read from. */
const readAt = (p, dots) => (p - dots + 4) % 4;
const SLOT_POS = [[50, 19], [81, 50], [50, 81], [19, 50]]; // % of the ring box per position: the middle of a stroke and its name, so one target covers both

/**
 * The example sign. `o.dots` dots in the core; strokes keep their ring positions (the example's
 * layout under one dot) while the numbers follow the dots, which is what beat 2 teaches.
 * @param {{dots: number, lit: Set<number>, numbers: boolean, labels: boolean, sealed?: boolean, ghost?: boolean, expected?: number|null}} o
 */
function ring(i18n, o) {
  const svg = s('svg', { viewBox: '-130 -130 260 260', role: 'img', 'aria-hidden': 'true' });
  svg.appendChild(s('circle', { cx: 0, cy: 0, r: 90, fill: 'none', stroke: o.sealed ? AMBER : MIST, 'stroke-width': o.sealed ? 3 : 2, opacity: o.sealed ? 0.95 : 0.7 }));
  if (o.sealed) svg.appendChild(s('circle', { cx: 0, cy: 0, r: 100, fill: 'none', stroke: AMBER, 'stroke-width': 1.5, opacity: 0.5, 'stroke-dasharray': '4 6' }));
  // strokes sit where the example puts them (one dot): reading index k → position (1 + k) % 4
  TUTORIAL_SIGN.read.forEach(([slot, form], k) => {
    const p = posOf(k, TUTORIAL_SIGN.dots);
    const lit = o.lit.has(slot);
    const g = s('g', { transform: `rotate(${p * 90})`, 'data-pos': p });
    g.appendChild(FORM_PATHS[form](lit ? AMBER : PEARL, lit ? 6.5 : 5));
    const n = readAt(p, o.dots) + 1;
    if (o.numbers) {
      const tEl = s('text', { x: 0, y: -60, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: lit ? AMBER : MIST, 'font-size': 16, transform: `rotate(${-p * 90} 0 -60)` });
      tEl.textContent = String(n);
      g.appendChild(tEl);
    }
    if (o.labels) {
      const tEl = s('text', { x: 0, y: -56, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: lit ? AMBER : MIST, 'font-size': 10.5, 'letter-spacing': 0.8, transform: `rotate(${-p * 90} 0 -56)` });
      tEl.textContent = i18n.t('slot.' + slot).toUpperCase();
      g.appendChild(tEl);
    }
    svg.appendChild(g);
  });
  svg.appendChild(s('circle', { cx: 0, cy: 0, r: 26, fill: INK, stroke: o.expected === 'core' ? AMBER : STONE, 'stroke-width': 2 }));
  for (let d = 0; d < o.dots; d++) svg.appendChild(s('circle', { cx: (d - (o.dots - 1) / 2) * 12, cy: 0, r: 4.5, fill: PEARL }));
  if (o.sealed) {
    const badge = s('g', { transform: 'translate(78 -78)' });
    badge.appendChild(s('circle', { cx: 0, cy: 0, r: 22, fill: AMBER }));
    badge.appendChild(s('path', { d: 'M -9 1 L -3 7 L 10 -7', fill: 'none', stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    svg.appendChild(badge);
  }
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
  ensureTutStyles(root.ownerDocument || document);
  installMotionStyles(root.ownerDocument || document);
  const bgEl = h('div', { class: 'ftf-bg', attrs: { 'aria-hidden': 'true' } });
  const bg = mountBackground(bgEl, { reducedMotion: true, tier: prefs.tier() });
  const stepper = h('ol', { class: 'ftf-stepper', i18nAttrs: { 'aria-label': 'flow.progress' } });
  const stage = h('div', { class: 'ftf-step' });
  const top = h('div', { class: 'ftf-spread' }, stepper,
    h('button', { class: 'ftf-btn ftf-btn-small mo-lift', i18n: 'flow.toLobby', attrs: { type: 'button', 'data-gamepad-back': true }, on: { click: () => leave(() => { flow.toLobby(); if (opts.onExit) opts.onExit(); }) } }));
  const wrap = h('div', { class: 'ftf-root' }, bgEl, h('main', { class: 'ftf-screen' }, top, stage));
  root.appendChild(wrap);
  let child = null;
  let timers = [];
  const input = () => inputKindFor(root.ownerDocument ? root.ownerDocument.defaultView : globalThis);
  // narration: created once the optional module loads; speaks only when prefs say so (narration.enabled())
  let narration = null;
  const loader = Object.values(NARRATION_MODULES)[0];
  if (loader) loader().then((m) => { if (m && m.createNarration) narration = m.createNarration({ prefs, i18n }); }).catch(() => {});
  const narrate = (keys, args = {}) => {
    if (!narration || !narration.enabled || !narration.enabled()) return;
    const text = keys.map((k) => i18n.t(k, args)).join('. ');
    try { narration.speak(text, { channel: 'tutorial', interrupt: true }); } catch { /* speech is optional */ }
  };
  let leaving = false;
  // The screen leaves (fade + slight scale) before the next one mounts; never blocks input (docs/motion.md).
  const leave = (then) => { if (leaving) return; leaving = true; exit(wrap, { to: 'scale', duration: MOTION.duration.fast }).then(() => { leaving = false; then(); }); };
  const unPress = [];
  const pressAll = (scope) => { for (const b of scope.querySelectorAll('button')) { b.classList.add('mo-lift'); unPress.push(press(b)); } };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers = []; };

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
  const primary = (key, fn, attrs = {}) => actionButton({ key, variant: 'primary', symbol: 'arrow', trailing: true, onClick: fn, attrs });

  function enterWorld() {
    const recipe = loadRecipe(storage) || DEFAULT_RECIPE;
    const go = () => { if (opts.onFirstContact) opts.onFirstContact({ guestId: ctx.guestId, entitlement: getEntitlement(storage), recipe, recipeHash: recipeHash(recipe), locale: i18n.locale }); };
    // Into the island: the onboarding fades and shrinks away over the screen duration (the world is already rendering beneath).
    if (wrap.isConnected && !flow.returning) { leaving = true; exit(wrap, { to: 'scale', duration: MOTION.duration.screen }).then(() => { leaving = false; go(); }); } else go();
  }

  // ---- access: one line, the labeled badge, the details folded away ----
  function viewEntitlement() {
    narrate(['onb.access.title', 'onb.access.body']);
    return h('section', { class: 'ftf-card ftf-access' },
      heading('onb.access.title'),
      h('p', {}, h('span', { class: 'ftf-badge ftf-badge-demo', i18n: 'ent.badge' })),
      h('p', { class: 'ftf-tut-body', i18n: 'onb.access.body' }),
      h('details', {}, h('summary', { i18n: 'onb.access.details' }), h('p', { class: 'ftf-muted', i18n: 'ent.body' }), h('p', { class: 'ftf-muted', i18n: 'ent.wallet' })),
      primary('onb.access.play', () => { issueDemoEntitlement(storage, ctx.guestId); flow.complete('entitlement'); }));
  }

  // ---- tutorial: five beats over one example sign ----
  let tut = null, spokenBeat = -1, lastSilk = null, sealShown = false;
  function viewTutorial() {
    if (!tut) tut = createTutorial({ beat: flow.beat });
    const v = tut.view();
    const id = v.id;
    if (spokenBeat !== v.index) { spokenBeat = v.index; narrate([`tut.${id}.title`, `tut.${id}.body`], { input: input() }); }
    const box = h('section', { class: 'ftf-card ftf-tutcard' });
    const dots = h('span', { class: 'ftf-tut-dots', attrs: { 'aria-hidden': 'true' } }, TUTORIAL_BEATS.map((b, k) => h('i', { dataset: { state: k < v.index ? 'done' : k === v.index ? 'current' : 'todo' } })));
    const head = h('div', { class: 'ftf-tut-head' },
      h('p', { class: 'ftf-muted', attrs: { style: 'margin:0' } }, h('span', { i18n: 'tut.title' }), dots, h('span', { class: 'sr-only', i18n: 'flow.stepOf', args: { n: v.index + 1, total: v.count } })),
      h('button', { class: 'ftf-btn ftf-btn-ghost ftf-btn-small', i18n: 'tut.skip', attrs: { type: 'button' }, on: { click: () => { tut = null; flow.skip('tutorial'); } } }));

    // ring + its tap targets
    const lit = new Set(id === 'slots' || id === 'read' ? tut.tapped() : id === 'stake' || id === 'price' ? [0, 1, 2, 3] : []);
    const expected = id === 'read' ? tut.expected() : null;
    const ringBox = h('div', { class: 'ftf-ring' },
      ring(i18n, { dots: id === 'dots' ? v.dots : TUTORIAL_SIGN.dots, lit, numbers: id !== 'slots', labels: id === 'slots', sealed: v.sealed, expected: id === 'dots' && !v.done ? 'core' : null }));
    const srAlt = i18n.t('tut.glyphAlt', { count: id === 'dots' ? v.dots : TUTORIAL_SIGN.dots, slots: TUTORIAL_SIGN.read.map(([slot, form]) => `${i18n.t('slot.' + slot)} (${i18n.t('form.' + form)})`).join(', ') });
    ringBox.appendChild(h('span', { class: 'sr-only', text: srAlt }));
    if (id === 'slots' || id === 'read') {
      TUTORIAL_SIGN.read.forEach(([slot, form], k) => {
        const p = posOf(k, TUTORIAL_SIGN.dots);
        const [x, y] = SLOT_POS[p];
        const b = h('button', { class: 'ftf-slotbtn', attrs: { type: 'button', 'data-slot': slot, 'data-expected': expected === slot ? 'true' : null, 'aria-pressed': lit.has(slot) ? 'true' : 'false', 'aria-label': `${i18n.t('slot.' + slot)} · ${i18n.t('form.' + form)}`, style: `left:${x}%;top:${y}%` },
          on: { click: () => { tut.tap(slot); render(); } } });
        ringBox.appendChild(b);
      });
    }
    // The slot names are buttons too: the same action as the stroke (flow.js tapLabel), in slot order.
    const slotChips = () => h('div', { class: 'ftf-chips', attrs: { role: 'group' }, i18nAttrs: { 'aria-label': 'tut.slots.names' } }, [0, 1, 2, 3].map((slot) => h('button', {
      class: 'ftf-chip', i18n: 'slot.' + slot, dataset: { on: String(lit.has(slot)) },
      attrs: { type: 'button', 'data-slot-label': slot, 'data-expected': expected === slot ? 'true' : null, 'data-hint': v.hintSlot === slot ? 'true' : null, 'aria-pressed': lit.has(slot) ? 'true' : 'false' },
      on: { click: () => { tut.tapLabel(slot); render(); } } })));
    const slotHint = () => h('p', { class: 'ftf-slot-hint', i18n: `slot.${v.hintSlot}.hint`, attrs: { 'data-slot-hint': v.hintSlot } });
    if (id === 'dots') ringBox.appendChild(h('button', { class: 'ftf-corebtn', attrs: { type: 'button', 'data-core': true, 'data-expected': v.done ? null : 'true' }, i18nAttrs: { 'aria-label': 'tut.dots.core' }, attrArgs: () => ({ input: input() }), on: { click: () => { tut.tapCore(); render(); } } }));

    // text column
    const body = h('p', { class: 'ftf-tut-body', i18n: `tut.${id}.body`, args: () => ({ input: input() }) });
    const stageEl = h('div', { class: 'ftf-tut-stage' });
    const fb = h('p', { class: 'ftf-tut-fb', attrs: { 'aria-live': 'polite' } });
    if (id === 'slots') {
      stageEl.append(slotChips(), slotHint());
      if (v.done) tx(fb, i18n, 'tut.slots.done'); else tx(fb, i18n, 'tut.slots.left', { n: 4 - v.slots.length });
    } else if (id === 'dots') {
      tx(fb, i18n, v.done ? 'tut.dots.one' : 'tut.dots', { count: v.dots });
      if (!v.done) stageEl.append(h('p', { class: 'ftf-muted', attrs: { style: 'margin:0' }, i18n: 'tut.dots.want' }));
    } else if (id === 'read') {
      const rows = TUTORIAL_SIGN.read.slice(0, v.readIndex).map(([slot, , m], k) => h('li', {}, h('span', { class: 'ftf-n', text: String(k + 1) }), h('span', {}, h('span', { class: 'ftf-k', i18n: 'slot.' + slot }), ': ', h('span', { i18n: `meaning.${slot}.${m}` }))));
      stageEl.append(slotChips(), slotHint(), h('ol', { class: 'ftf-readrow' }, rows));
      if (v.done) { stageEl.append(h('p', { class: 'ftf-sentence', i18n: 'tut.read.sentence' })); tx(fb, i18n, 'tut.read.done'); }
      else if (v.lastRead && v.lastRead.ok === false) tx(fb, i18n, 'tut.read.wrong', { n: v.lastRead.step });
      else tx(fb, i18n, 'tut.read.next', { n: v.readIndex + 1 });
    } else if (id === 'stake') {
      const silkNum = h('b', { text: String(lastSilk ?? v.silk) });
      const silk = h('span', { class: 'ftf-silk' }, h('span', { i18n: 'tut.stake.silk' }), silkNum);
      if (lastSilk != null && lastSilk !== v.silk) queueMicrotask(() => tickNumber(silkNum, v.silk, { from: lastSilk }));
      lastSilk = v.silk;
      const trials = h('div', { class: 'ftf-trials' }, [1, 2, 3].map((n) => h('span', { dataset: { on: String(v.staked && v.trial >= n), sealed: String(v.sealed && n === TUTORIAL_SIGN.trial) }, i18n: 'tut.stake.trial', args: { n } })));
      const stakeBtn = primary('tut.stake.button', () => { if (tut.stake()) { render(); runTrials(); } }, v.staked ? { disabled: true, 'aria-disabled': 'true' } : {});
      stageEl.append(silk, stakeBtn, trials);
      if (v.sealed) {
        const sealEl = h('p', { class: 'ftf-seal', i18n: 'tut.stake.sealed', attrs: { style: 'position:relative;display:inline-block' } });
        stageEl.append(sealEl); tx(fb, i18n, 'tut.stake.sealedNote');
        if (!sealShown) { sealShown = true; queueMicrotask(() => { seal(sealEl); ringFlash(sealEl); }); }
      }
      else if (v.staked) tx(fb, i18n, 'tut.stake.staked');
      else fb.textContent = '';
    } else if (id === 'price') {
      const card = h('div', { class: 'ftf-memcard', dataset: { gone: String(v.forgotten) } },
        h('b', { i18n: 'tut.price.memory' }), h('span', { class: 'ftf-muted', i18n: 'tut.price.memoryNote' }),
        v.forgotten ? null : h('div', {}, primary('tut.price.forget', () => { if (tut.forget()) render(); })));
      stageEl.append(card);
      fb.textContent = '';
      if (v.forgotten) {
        stageEl.append(h('div', { class: 'ftf-vision' }, h('span', { class: 'ftf-ghost', attrs: { 'aria-hidden': 'true' } }), h('span', { i18n: 'tut.price.vision' })),
          h('p', { class: 'ftf-tut-fb', attrs: { style: 'margin:0', 'aria-live': 'polite' }, i18n: 'tut.price.shard' }));
        // The one-time interface question (docs/design/clarity-layers.md §9.1 row 4): Novice is the default
        // and the primary button; both can be changed later in Settings.
        const choose = (mode) => { prefs.set({ hudMode: mode }); tut = null; flow.complete('tutorial'); };
        stageEl.append(h('div', { class: 'ftf-field ftf-mode-question' },
          h('p', { class: 'ftf-strong', i18n: 'tut.mode.question' }),
          h('div', { class: 'ftf-row' },
            primary('tut.mode.novice', () => choose('novice')),
            h('button', { class: 'ftf-btn', i18n: 'tut.mode.pro', attrs: { type: 'button', 'data-mode': 'pro' }, on: { click: () => choose('pro') } })),
          h('p', { class: 'ftf-muted', attrs: { style: 'margin:0' }, i18n: 'tut.mode.note' })));
      }
    }

    const nav = h('div', { class: 'ftf-row' },
      v.index > 0 ? h('button', { class: 'ftf-btn', i18n: 'common.back', attrs: { type: 'button', 'data-gamepad-back': true }, on: { click: () => { tut.back(); flow.setBeat(tut.index); render(); } } }) : null,
      id !== 'price' ? primary('common.next', () => { if (tut.next()) { flow.setBeat(tut.index); render(); } }, v.done ? {} : { disabled: true, 'aria-disabled': 'true' }) : null);
    box.append(head, h('div', { class: 'ftf-tut' }, ringBox, h('div', { class: 'ftf-tut-text' }, heading(`tut.${id}.title`), body, stageEl, fb, nav)));
    return box;
  }

  /** Beat 4: trials 1 → 2 → 3 pass on their own after the stake; reduced motion plays them at once. */
  function runTrials() {
    const reduced = prefs.reducedMotion();
    if (reduced) { while (!tut.view().sealed) tut.tickTrial(); render(); return; }
    const step = () => { if (!tut || tut.id !== 'stake') return; tut.tickTrial(); render(); if (!tut.view().sealed) later(step, TRIAL_MS); };
    later(step, TRIAL_MS);
  }

  // ---- hologram: four looks, the full constructor folded under "Customize" ----
  function viewCustomization() {
    narrate(['onb.look.title', 'onb.look.body']);
    const begin = () => { saveRecipe(storage, child ? child.getRecipe() : DEFAULT_RECIPE); flow.complete('customization'); };
    // One Begin, beside the title (QA-016: never below the fold); the tiles and Customize stay secondary.
    const box = h('section', {},
      h('div', { class: 'ftf-spread' }, heading('onb.look.title'), primary('onb.look.begin', begin)),
      h('p', { class: 'ftf-tut-body ftf-muted', i18n: 'onb.look.body' }));
    const host = h('div', { class: 'ftf-card' });
    box.append(host);
    queueMicrotask(() => { child = mountConstructor(host, { ctx, compact: true }); });
    return box;
  }

  function viewFirstContact() {
    narrate(['fc.title', 'onb.fc.body']);
    return h('section', { class: 'ftf-card' },
      heading('fc.title'),
      h('p', { class: 'ftf-tut-body', i18n: 'onb.fc.body' }),
      opts.firstContactNoteKey ? h('p', { class: 'ftf-muted', i18n: opts.firstContactNoteKey }) : null,
      primary('fc.enter', enterWorld));
  }

  let view = null, lastStep = null, lastBeat = -1;
  function render() {
    clearTimers();
    if (child) { child.destroy(); child = null; }
    renderStepper();
    const st = flow.step;
    const prev = view;
    const beat = st === 'tutorial' ? (tut ? tut.index : flow.beat) : -1; // the machine is created by the first tutorial render, at the saved beat
    const newScreen = st !== lastStep || beat !== lastBeat; // a step or beat change animates; a re-render in place does not
    lastStep = st; lastBeat = beat;
    view = st === 'entitlement' ? viewEntitlement() : st === 'tutorial' ? viewTutorial() : st === 'customization' ? viewCustomization() : st === 'firstContact' ? viewFirstContact() : null;
    if (newScreen && prev && prev.isConnected) {
      // The old card drops away while the new one rises; the old one is kept out of the flow during its exit.
      prev.style.position = 'absolute'; prev.style.inset = '0'; prev.style.pointerEvents = 'none'; prev.setAttribute('aria-hidden', 'true');
      stage.style.position = 'relative';
      exit(prev, { to: 'drop', duration: MOTION.duration.fast }).then(() => prev.remove());
      stage.append(...(view ? [view] : []));
    } else stage.replaceChildren(...(view ? [view] : []));
    if (view && newScreen) {
      const parts = view.classList.contains('ftf-tutcard') ? [view.querySelector('.ftf-tut-head'), view.querySelector('.ftf-ring'), ...(view.querySelector('.ftf-tut-text') ? view.querySelector('.ftf-tut-text').children : [])] : [...view.children];
      stagger(parts.filter(Boolean), { from: 'rise', duration: MOTION.duration.slow, step: 50, cap: 300 });
    }
    pressAll(view || stage);
    bindAll();
    const hd = stage.querySelector('h1');
    if (hd) hd.focus({ preventScroll: false });
  }
  let unbind = null;
  function bindAll() { if (unbind) unbind(); unbind = bindI18n(wrap, i18n, () => { if (flow.step === 'tutorial') render(); }); }

  const unFlow = flow.subscribe((st) => {
    if (st === 'lobby') return;
    // A returning player (every step done before this session) never sees a screen: straight to the island.
    if (st === 'firstContact' && flow.returning && opts.onFirstContact && !opts.firstContactNoteKey) { enterWorld(); return; }
    if (st !== 'tutorial') tut = null;
    render();
  });
  if (flow.step === 'lobby') flow.enter(); else render();

  return {
    el: wrap,
    flow,
    destroy() { clearTimers(); unFlow(); if (unbind) unbind(); if (child) child.destroy(); bg.destroy(); unPress.forEach((f) => f()); wrap.remove(); },
  };
}
