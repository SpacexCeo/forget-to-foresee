// The fun layer on screen (play/fun.js, docs/fun-layer.md): the dictionary chip and book, the "new word" moment,
// the streak, the burning memory, the "who lied to me?" case file and the first-chapter card. It reads the
// per-viewer observation and the outcome reports; it sends no command and changes no rule.
import { renderMsg, reasonText } from './i18n.js';
import { createOutcomeTracker } from './outcome.js';
import { understanding, askFor, dictionaryCells, newWords, createStreak, caseFile, newLies, forgottenMemory, memoryMotif, chapterOneDue, chapterSummary } from './fun.js';

const ROMAN = ['I', 'II', 'III', 'IV'];
const POWER = [10, 20, 40, 80];
export const CHAPTER_KEY = 'ftf.fun.chapter1.v1';

/** The four strokes as small line drawings (24-unit box). */
const STROKES = [
  'M4 17 Q12 2 20 17',                              // arc
  'M4 19 L12 4 L20 19',                             // spike
  'M12 20 C2 20 2 5 12 5 C22 5 22 20 12 20 Z',      // loop
  'M12 3 C12 10 19 12 19 16 A7 7 0 0 1 5 16 C5 12 12 10 12 3 Z', // drop
];
const strokeSvg = (form, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${STROKES[form] || STROKES[0]}"/></svg>`;

const CSS = `
.fun-host { position: absolute; inset: 0; pointer-events: none; z-index: 4; font-family: var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text, #faf7ee); }
.fun-host button { font: inherit; color: inherit; cursor: pointer; }
.fun-box { pointer-events: auto; background: var(--wh-panel-bg, rgba(16,26,27,.94)); border: 1px solid var(--wh-frame, rgba(232,214,172,.8)); box-shadow: 0 8px 28px rgba(0,0,0,.45); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }

/* ---- chips: the dictionary as a 4x4 collection, the streak ---- */
.fun-chips { position: absolute; left: 18px; top: 190px; display: flex; gap: 8px; align-items: center; pointer-events: auto; }
body.wh-compact .fun-chips { left: calc(var(--whc-side) + 84px); top: calc(var(--whc-top) + var(--whc-pill) + 8 * var(--wh-px, 1px) + 42px + 10px); }
body.wh-compact:not(.hub-dock-on) .fun-chips { top: calc(var(--whc-top) + var(--whc-pill) + 8 * var(--wh-px, 1px)); }
body.wh-mobile .fun-chips, body.pl-modal-open .fun-chips, body.ftf-simple-on .fun-chips { display: none; }
.fun-chip { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 8px; border-radius: 999px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fun-chip:hover, .fun-chip:focus-visible { border-color: var(--wh-gold-bright, #fbe6a6); outline: none; }
.fun-mini { display: grid; grid-template-columns: repeat(4, 5px); gap: 2px; }
.fun-mini i { width: 5px; height: 5px; border-radius: 1.5px; background: rgba(226,214,186,.18); }
.fun-mini i[data-kind="guess"] { background: rgba(226,214,186,.5); }
.fun-mini i[data-kind="guests"], .fun-mini i[data-kind="outcome"] { background: var(--wh-gold-bright, #fbe6a6); box-shadow: 0 0 4px rgba(251,230,166,.7); }
.fun-mini i.fun-pop { animation: fun-pop .9s ease-out; }
.fun-streak { color: var(--wh-gold-bright, #fbe6a6); padding: 0 12px; }
.fun-streak[hidden] { display: none; }
.fun-streak.fun-bump { animation: fun-bump .5s ease-out; }
@keyframes fun-pop { 0% { transform: scale(1); } 35% { transform: scale(3.2); box-shadow: 0 0 14px rgba(251,230,166,1); } 100% { transform: scale(1); } }
@keyframes fun-bump { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 100% { transform: scale(1); } }

/* ---- the book: all 16 words, the streak rule, the case file ---- */
.fun-book { position: absolute; left: 18px; top: 232px; width: min(420px, calc(100vw - 36px)); max-height: calc(100vh - 320px); overflow: auto; padding: 16px 18px 18px; border-radius: 16px; }
body.wh-compact .fun-book { left: var(--whc-side); top: calc(var(--whc-top) + var(--whc-pill) + 8 * var(--wh-px, 1px) + 42px + 10px + 44px); max-height: calc(100vh - 300px); }
.fun-book[hidden] { display: none; }
.fun-book h3 { margin: 0; font: 400 22px/1.2 var(--wh-font, Georgia, serif); }
.fun-book h4 { margin: 16px 0 6px; font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.fun-book p { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--wh-text-muted, #c9c6b8); }
.fun-book-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.fun-book-head button { flex: none; min-width: 36px; height: 36px; border-radius: 999px; background: none; border: 1px solid rgba(232,214,172,.45); font-size: 20px; line-height: 1; }
.fun-grid { display: grid; grid-template-columns: auto repeat(4, 1fr); gap: 5px; margin-top: 12px; align-items: stretch; }
.fun-grid .fun-h { display: flex; align-items: center; justify-content: center; font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--wh-text-muted, #c9c6b8); }
.fun-grid .fun-h.fun-row { justify-content: flex-start; padding-right: 8px; }
.fun-grid .fun-h svg { color: var(--wh-gold, #e4c272); }
.fun-cell { min-height: 46px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 9px; border: 1px dashed rgba(226,214,186,.25); font: 400 15px/1.1 var(--wh-font, Georgia, serif); text-align: center; padding: 3px; }
.fun-cell small { font: 600 10px/1 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.fun-cell[data-kind="guess"] { border-style: solid; color: var(--wh-text-muted, #c9c6b8); }
.fun-cell[data-kind="guests"], .fun-cell[data-kind="outcome"] { border: 1px solid var(--wh-gold, #e4c272); background: rgba(228,194,114,.18); color: var(--wh-text, #faf7ee); }
.fun-cell[data-kind="guests"] small, .fun-cell[data-kind="outcome"] small { color: var(--wh-gold, #e4c272); }
.fun-cell[data-kind="guess"] { background: linear-gradient(to top, rgba(226,214,186,.2) var(--c, 0%), transparent var(--c, 0%)); }
button.fun-cell { cursor: pointer; background-color: transparent; color: inherit; }
button.fun-cell:hover, button.fun-cell:focus-visible { border-color: var(--wh-gold-bright, #fbe6a6); outline: none; }
.fun-cell.fun-picked { box-shadow: 0 0 0 2px var(--wh-gold-bright, #fbe6a6); }
.fun-ask { margin-top: 12px; padding: 10px 12px 12px; border-radius: 12px; border: 1px solid rgba(232,214,172,.45); }
.fun-ask strong { display: block; font: 400 16px/1.25 var(--wh-font, Georgia, serif); }
.fun-ask-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.fun-ask-opts button { min-height: 36px; padding: 0 12px; border-radius: 999px; background: rgba(10,22,23,.82); border: 1px solid rgba(232,214,172,.45); font-size: 13.5px; }
.fun-ask-opts button[aria-pressed="true"] { background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); }
.fun-ask-opts button.fun-primary { margin-left: auto; background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); color: var(--wh-text-on-gold, #fffcec); font-weight: 600; }
.fun-ask-opts button:disabled { opacity: .5; cursor: default; }
.fun-ask .fun-warn { color: #f0a98b; }
.fun-cell.fun-pop { animation: fun-cellpop 1.1s ease-out; }
@keyframes fun-cellpop { 0% { box-shadow: 0 0 0 0 rgba(251,230,166,.9); transform: scale(.9); } 40% { box-shadow: 0 0 0 10px rgba(251,230,166,0); transform: scale(1.08); } 100% { transform: scale(1); } }
.fun-case { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.fun-case li { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; font-size: 13px; line-height: 1.35; padding: 6px 10px; border-radius: 9px; border: 1px solid rgba(226,214,186,.25); }
.fun-case li b { flex: none; font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; color: var(--wh-text-muted, #c9c6b8); }
.fun-case li[data-status="lie"] { border-color: #d98a6a; } .fun-case li[data-status="lie"] b { color: #f0a98b; }
.fun-case li[data-status="true"] b { color: var(--wh-gold-bright, #fbe6a6); }

/* ---- banners: a new word, the streak, a lie ---- */
.fun-banners { position: absolute; left: 50%; top: 86px; transform: translateX(-50%); display: grid; gap: 8px; justify-items: center; width: max-content; max-width: calc(100vw - 24px); }
body.wh-mobile .fun-banners { top: calc(118px + env(safe-area-inset-top, 0px)); }
.fun-banner { display: flex; align-items: center; gap: 12px; padding: 10px 18px 10px 12px; border-radius: 999px; max-width: 100%; animation: fun-in .35s ease-out; }
.fun-banner.fun-out { opacity: 0; transform: translateY(-6px); transition: opacity .3s ease, transform .3s ease; }
.fun-banner .fun-ico { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(228,194,114,.2); color: var(--wh-gold-bright, #fbe6a6); border: 1px solid var(--wh-gold, #e4c272); }
.fun-banner[data-kind="aha"] .fun-ico { animation: fun-flash 1.2s ease-out; }
.fun-banner[data-kind="lie"], .fun-banner[data-kind="miss"] { border-color: #d98a6a; }
.fun-banner[data-kind="lie"] .fun-ico, .fun-banner[data-kind="miss"] .fun-ico { color: #f0a98b; border-color: #d98a6a; background: rgba(217,138,106,.16); }
.fun-banner div { min-width: 0; }
.fun-banner strong { display: block; font: 600 11px/1.1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.fun-banner[data-kind="lie"] strong, .fun-banner[data-kind="miss"] strong { color: #f0a98b; }
.fun-banner span { display: block; margin-top: 3px; font: 400 17px/1.25 var(--wh-font, Georgia, serif); }
@keyframes fun-in { from { opacity: 0; transform: translateY(-10px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes fun-flash { 0% { box-shadow: 0 0 0 0 rgba(251,230,166,.95); } 100% { box-shadow: 0 0 0 26px rgba(251,230,166,0); } }

/* ---- the burning memory ---- */
.fun-burn { position: absolute; inset: 0; pointer-events: auto; display: grid; place-items: center; background: rgba(6,10,11,.72); animation: fun-fade .3s ease-out; z-index: 3; }
.fun-burn.fun-out { opacity: 0; transition: opacity .45s ease; }
.fun-burn-card { width: min(380px, calc(100vw - 40px)); text-align: center; }
.fun-burn-card strong { display: block; font: 600 12px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .16em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.fun-burn-pic { position: relative; margin: 14px auto 12px; width: 100%; aspect-ratio: 16 / 10; }
.fun-burn-pic canvas { width: 100%; height: 100%; display: block; border-radius: 14px; border: 1px solid var(--wh-frame, rgba(232,214,172,.8));
  -webkit-mask-image: linear-gradient(to bottom, #000 0 33%, transparent 46% 100%); mask-image: linear-gradient(to bottom, #000 0 33%, transparent 46% 100%);
  -webkit-mask-size: 100% 300%; mask-size: 100% 300%; -webkit-mask-position: 0 0; mask-position: 0 0; }
.fun-burn.fun-burning .fun-burn-pic canvas { animation: fun-burnup 2.1s ease-in forwards; }
.fun-burn-pic i { position: absolute; bottom: 8%; width: 4px; height: 4px; border-radius: 50%; background: #ffcf7a; box-shadow: 0 0 8px #ff9a3c; opacity: 0; }
.fun-burn.fun-burning .fun-burn-pic i { animation: fun-ember 1.8s ease-out forwards; }
.fun-burn-card p { margin: 0; font: 400 20px/1.3 var(--wh-font, Georgia, serif); }
.fun-burn-card em { display: block; margin-top: 10px; font: 400 15px/1.3 var(--wh-font, Georgia, serif); font-style: normal; color: #f0a98b; opacity: 0; transition: opacity .5s ease; }
.fun-burn.fun-gone .fun-burn-card em { opacity: 1; }
.fun-burn.fun-gone .fun-burn-card p { color: var(--wh-text-muted, #c9c6b8); text-decoration: line-through; text-decoration-color: rgba(240,169,139,.7); }
@keyframes fun-burnup { from { -webkit-mask-position: 0 0; mask-position: 0 0; } to { -webkit-mask-position: 0 100%; mask-position: 0 100%; } }
@keyframes fun-ember { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx, 0px), -160px); } }
@keyframes fun-fade { from { opacity: 0; } to { opacity: 1; } }

/* ---- chapter one ---- */
.fun-chapter-scrim { position: absolute; inset: 0; pointer-events: auto; display: grid; place-items: center; background: rgba(6,10,11,.6); animation: fun-fade .3s ease-out; z-index: 2; }
.fun-chapter { width: min(460px, calc(100vw - 32px)); padding: 22px 24px 20px; border-radius: 18px; text-align: center; }
.fun-chapter h3 { margin: 0; font: 400 26px/1.2 var(--wh-font, Georgia, serif); }
.fun-chapter p { margin: 10px 0 0; font-size: 14.5px; line-height: 1.5; color: var(--wh-text-muted, #c9c6b8); }
.fun-chapter .fun-mini { grid-template-columns: repeat(4, 12px); gap: 4px; justify-content: center; margin: 16px auto 4px; width: max-content; }
.fun-chapter .fun-mini i { width: 12px; height: 12px; border-radius: 3px; }
.fun-chapter-row { display: grid; gap: 8px; margin-top: 18px; }
.fun-chapter-row button { min-height: 44px; padding: 0 16px; border-radius: 10px; background: rgba(10,22,23,.82); border: 1px solid rgba(232,214,172,.45); font-size: 14.5px; font-weight: 600; }
.fun-chapter-row button.fun-primary { background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); color: var(--wh-text-on-gold, #fffcec); }
.fun-chapter-row button:focus-visible { outline: 2px solid var(--wh-gold-bright, #fbe6a6); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) { .fun-host * { animation: none !important; transition: none !important; } }
html[data-motion="reduce"] .fun-host * { animation: none !important; transition: none !important; }
`;

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null) e.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return e;
}

/** A line drawing for a memory, by motif (fun.js memoryMotif): gold ink on the panel colour. */
export function memoryPicture(canvas, motif) {
  const g = canvas.getContext && canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.3;
  const bg = g.createRadialGradient(cx, cy, 10, cx, cy, w * 0.7);
  bg.addColorStop(0, '#22353a'); bg.addColorStop(1, '#0d1718');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f3e0a8'; g.lineWidth = Math.max(2, w / 110); g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(232,190,110,.8)'; g.shadowBlur = w / 40;
  const ring = (rad, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.arc(cx, cy, rad, a0, a1); g.stroke(); };
  if (motif === 'word') { // the first word: a ring with four strokes around it
    ring(r * 0.55);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 - Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.22, a + 0.6, a + Math.PI * 1.4); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, r * 0.08, 0, 7); g.fillStyle = '#f3e0a8'; g.fill();
  } else if (motif === 'call') { // a call in the night: widening arcs from one point
    for (let k = 1; k <= 4; k++) ring(r * 0.35 * k, -Math.PI * 0.75, -Math.PI * 0.25);
    g.beginPath(); g.arc(cx, cy, r * 0.1, 0, 7); g.fillStyle = '#f3e0a8'; g.fill();
  } else if (motif === 'gift') { // shared silk: two hands of thread meeting in a bundle
    g.beginPath(); g.moveTo(cx - r * 1.7, cy + r * 0.5); g.bezierCurveTo(cx - r, cy - r, cx - r * 0.4, cy + r * 0.8, cx, cy); g.stroke();
    g.beginPath(); g.moveTo(cx + r * 1.7, cy + r * 0.5); g.bezierCurveTo(cx + r, cy - r, cx + r * 0.4, cy + r * 0.8, cx, cy); g.stroke();
    ring(r * 0.3);
  } else if (motif === 'crack') { // a betrayal: a ring broken by a jagged line
    ring(r, 0.25, Math.PI - 0.25); ring(r, Math.PI + 0.25, Math.PI * 2 - 0.25);
    g.beginPath(); g.moveTo(cx - r * 0.2, cy - r * 1.2); g.lineTo(cx + r * 0.15, cy - r * 0.4); g.lineTo(cx - r * 0.18, cy + r * 0.1); g.lineTo(cx + r * 0.2, cy + r * 1.2); g.stroke();
  } else if (motif === 'knot') { // a debt: two loops tied through each other
    g.beginPath(); g.ellipse(cx - r * 0.45, cy, r * 0.8, r * 0.5, 0.5, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(cx + r * 0.45, cy, r * 0.8, r * 0.5, -0.5, 0, 7); g.stroke();
  } else if (motif === 'ring') { // a promise: a closed ring with a small mark
    ring(r); ring(r * 0.78);
    g.beginPath(); g.arc(cx, cy - r * 0.89, r * 0.09, 0, 7); g.fillStyle = '#f3e0a8'; g.fill();
  } else { // a thread of memory
    g.beginPath(); g.moveTo(cx - r * 1.8, cy);
    for (let k = 0; k <= 24; k++) g.lineTo(cx - r * 1.8 + (r * 3.6 * k) / 24, cy + Math.sin(k * 0.8) * r * 0.45);
    g.stroke();
  }
  g.shadowBlur = 0;
}

/**
 * @param {{root: HTMLElement, ctx: object, session: object, hooks?: object, hub?: object, firstRun?: boolean,
 *   reducedMotion?: () => boolean, onRestart?: () => void, timers?: {set: Function, clear: Function}}} o
 */
export function attachFun({ root, ctx, session, hooks = null, hub = null, firstRun = false, reducedMotion = () => false, onRestart = null, timers = null }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const t = (k, a) => renderMsg(i18n, k, a);
  const later = timers ? timers.set : (fn, ms) => setTimeout(fn, ms);
  if (doc.head && !doc.querySelector('style[data-fun-css]')) doc.head.append(el(doc, 'style', { 'data-fun-css': '', text: CSS }));

  const tracker = createOutcomeTracker();
  const streak = createStreak();
  const storage = ctx.storage && typeof ctx.storage.getJSON === 'function' ? ctx.storage : null;
  let prev = null, bookOpen = false, chapterShown = !firstRun, popCells = new Set();
  let picked = null, askMeaning = null, askBusy = false, askNote = '';

  const mini = el(doc, 'span', { class: 'fun-mini', 'aria-hidden': 'true' }, Array.from({ length: 16 }, () => el(doc, 'i')));
  const count = el(doc, 'span', { class: 'fun-count' });
  const dictBtn = el(doc, 'button', { type: 'button', class: 'fun-box fun-chip fun-dict', 'aria-expanded': 'false', onclick: () => toggleBook() }, mini, count);
  const streakChip = el(doc, 'button', { type: 'button', class: 'fun-box fun-chip fun-streak', hidden: true, onclick: () => toggleBook(true) });
  const chips = el(doc, 'div', { class: 'fun-chips' }, dictBtn, streakChip);
  const book = el(doc, 'section', { class: 'fun-box fun-book', role: 'dialog', hidden: true });
  const banners = el(doc, 'div', { class: 'fun-banners', 'aria-live': 'polite' });
  const host = el(doc, 'div', { class: 'wh-root fun-host' }, chips, book, banners);
  root.append(host);

  const who = (id) => i18n.t('agent.' + id);
  const slotName = (s) => i18n.t('slot.' + s);
  const formName = (f) => i18n.t('form.' + f);
  const meaningName = (s, m) => i18n.t(`meaning.${s}.${m}`);
  const shortMeaning = (s, m) => (s === 0 ? ROMAN[m] : s === 1 ? i18n.t('meaning.1.' + m) : s === 2 ? String(POWER[m]) : '+' + (m + 1));
  const sound = (name) => { try { if (hooks && hooks.audio) hooks.audio.play(name); } catch { /* audio is optional */ } };
  const known = (cells) => cells.filter((c) => c.kind === 'guests' || c.kind === 'outcome').length;

  function renderChips(obs) {
    const cells = dictionaryCells(obs);
    const n = known(cells);
    cells.forEach((c, i) => {
      const dot = mini.children[i];
      dot.setAttribute('data-kind', c.kind);
      dot.setAttribute('style', c.kind === 'guess' ? `opacity:${Math.min(1, 0.3 + c.confidence).toFixed(2)}` : '');
      if (popCells.has(c.slot + '_' + c.form)) { dot.classList.remove('fun-pop'); void dot.offsetWidth; dot.classList.add('fun-pop'); }
    });
    count.textContent = n + ' / 16 · ' + understanding(obs) + '%';
    dictBtn.setAttribute('aria-label', t('fun.dict.open', { n }));
    dictBtn.setAttribute('title', t('fun.dict.open', { n }));
    const s = streak.state;
    if (s.hits || s.misses) {
      streakChip.removeAttribute('hidden');
      streakChip.textContent = s.streak > 0 ? t('fun.streak.chip', { n: s.streak }) : t('fun.insight', { n: s.insight });
      streakChip.setAttribute('aria-label', t('fun.streak.aria', { n: s.streak, insight: s.insight }));
    }
  }

  function renderBook(obs) {
    book.textContent = '';
    if (!bookOpen) return;
    const rows = [0, 1, 2, 3].map((s) => dictionaryCells(obs).filter((c) => c.slot === s));
    const n = known(rows.flat());
    const s = streak.state;
    const file = caseFile(obs);
    const parts = [
      el(doc, 'div', { class: 'fun-book-head' },
        el(doc, 'div', {}, el(doc, 'h3', { text: t('fun.dict.title') }), el(doc, 'p', { text: t('fun.dict.sub', { n }) })),
        el(doc, 'button', { type: 'button', 'aria-label': t('fun.close'), text: '×', onclick: () => toggleBook(false) })),
      el(doc, 'div', { class: 'fun-grid', role: 'table', 'aria-label': t('fun.dict.title') },
        el(doc, 'span', { class: 'fun-h' }),
        [0, 1, 2, 3].map((f) => el(doc, 'span', { class: 'fun-h', title: formName(f), html: strokeSvg(f, 20) })),
        rows.map((row, sl) => [
          el(doc, 'span', { class: 'fun-h fun-row', text: slotName(sl) }),
          row.map((c) => el(doc, askFor(c) ? 'button' : 'span', {
            type: askFor(c) ? 'button' : null, onclick: askFor(c) ? () => pick(c) : null, style: c.kind === 'guess' ? `--c:${Math.round(c.confidence * 100)}%` : null,
            class: 'fun-cell' + (popCells.has(c.slot + '_' + c.form) ? ' fun-pop' : '') + (picked === c.slot + '_' + c.form ? ' fun-picked' : ''), 'data-kind': c.kind, 'data-cell': c.slot + '_' + c.form,
            title: c.kind === 'unknown' ? t('fun.dict.empty') : t('fun.aha.line', { slot: slotName(c.slot), form: formName(c.form), meaning: meaningName(c.slot, c.meaning) }),
          }, c.kind === 'unknown' ? '' : shortMeaning(c.slot, c.meaning),
          c.kind === 'guess' ? el(doc, 'small', { text: Math.round(c.confidence * 100) + '%' }) : c.kind === 'unknown' ? null : el(doc, 'small', { text: '✓' }))),
        ])),
      el(doc, 'p', { text: t('fun.dict.legend') }),
      askBox(obs, rows.flat()),
      el(doc, 'h4', { text: s.streak > 0 ? t('fun.streak.chip', { n: s.streak }) + ' · ' + t('fun.insight', { n: s.insight }) : t('fun.insight', { n: s.insight }) }),
      el(doc, 'p', { text: t('fun.streak.rule') }),
      el(doc, 'h4', { text: t('fun.case.title') }),
      file.length
        ? el(doc, 'ul', { class: 'fun-case' }, file.map((c) => el(doc, 'li', { 'data-status': c.status },
          el(doc, 'span', { text: t('fun.case.row', { who: who(c.from), slot: slotName(c.slot), form: formName(c.form), meaning: meaningName(c.slot, c.meaning) }) }),
          el(doc, 'b', { text: t('fun.case.' + c.status) }))))
        : el(doc, 'p', { text: t('fun.case.none') })];
    book.append(...parts.filter(Boolean));
  }

  function pick(c) {
    const k = c.slot + '_' + c.form;
    picked = picked === k ? null : k; askMeaning = null; askNote = '';
    if (session.obs) renderBook(session.obs);
  }

  /** "Ask the Guests" for the picked word: the room's own action (1 attention, 5 silk, inside a Shell at the glass). */
  function askBox(obs, cells) {
    const q = picked ? askFor(cells.find((c) => c.slot + '_' + c.form === picked)) : null;
    if (!q) { picked = null; return null; }
    if (askMeaning == null || !q.options.includes(askMeaning)) askMeaning = q.meaning;
    const inShell = obs.you && obs.you.zone === 'shell';
    const note = askNote || (inShell ? t('ask.intro') : reasonText(i18n, 'wrong_zone'));
    return el(doc, 'div', { class: 'fun-ask' },
      el(doc, 'strong', { text: t('ask.title') + ' · ' + slotName(q.slot) + ', ' + formName(q.form) }),
      el(doc, 'div', { class: 'fun-ask-opts' },
        q.options.map((m) => el(doc, 'button', { type: 'button', 'aria-pressed': String(m === askMeaning), text: meaningName(q.slot, m), onclick: () => { askMeaning = m; askNote = ''; renderBook(session.obs); } })),
        el(doc, 'button', { type: 'button', class: 'fun-primary', 'data-fun': 'ask', disabled: !inShell || askBusy || null, text: t('ask.send'), onclick: () => sendAsk(q, askMeaning) })),
      el(doc, 'p', { class: askNote || !inShell ? 'fun-warn' : null, text: note }));
  }

  async function sendAsk(q, meaning) {
    if (askBusy) return;
    askBusy = true; askNote = '';
    try {
      await session.bus.send('move', { to: 'guest_glass' }, { silent: true }); // the Guests answer at the glass
      const r = await session.send('ask_guests', { slot: q.slot, form: q.form, meaning });
      if (!r.ok) askNote = reasonText(i18n, r.reason);
      else {
        const cell = dictionaryCells(session.obs).find((c) => c.slot === q.slot && c.form === q.form);
        if (cell && !(cell.kind === 'guests' || cell.kind === 'outcome')) {
          banner('miss', '?', t('ask.title'), t('ask.excluded', { list: meaningName(q.slot, meaning) }));
          askMeaning = null;
        }
      }
    } catch (e) { askNote = String(e && e.message ? e.message : e); }
    askBusy = false;
    if (session.obs) renderBook(session.obs);
  }

  function toggleBook(on) {
    bookOpen = on == null ? !bookOpen : !!on;
    if (bookOpen) book.removeAttribute('hidden'); else book.setAttribute('hidden', '');
    dictBtn.setAttribute('aria-expanded', String(bookOpen));
    if (session.obs) renderBook(session.obs);
  }

  function banner(kind, icon, title, text, ms = 4600) {
    const b = el(doc, 'div', { class: 'fun-box fun-banner', 'data-kind': kind },
      el(doc, 'span', { class: 'fun-ico', html: icon }),
      el(doc, 'div', {}, el(doc, 'strong', { text: title }), el(doc, 'span', { text })));
    banners.append(b);
    while (banners.children.length > 3) banners.firstChild.remove();
    later(() => { b.classList.add('fun-out'); later(() => b.remove(), 320); }, ms);
    return b;
  }

  /** The memory's picture, then the burn, then "Gone for good." A click skips it. */
  function burn(memory) {
    const still = reducedMotion();
    const pic = el(doc, 'canvas', { width: '480', height: '300' });
    memoryPicture(pic, memoryMotif(memory.kind));
    const embers = still ? [] : Array.from({ length: 12 }, (_, k) => el(doc, 'i', { style: `left:${8 + ((k * 37) % 84)}%;--dx:${((k * 53) % 60) - 30}px;animation-delay:${0.15 + (k % 6) * 0.22}s` }));
    const over = el(doc, 'div', { class: 'fun-burn', role: 'status' },
      el(doc, 'div', { class: 'fun-burn-card' },
        el(doc, 'strong', { text: t('fun.burn.title') }),
        el(doc, 'div', { class: 'fun-burn-pic' }, pic, embers),
        el(doc, 'p', { text: memory.text }),
        el(doc, 'em', { text: t('fun.burn.gone') })));
    let closed = false;
    const close = () => { if (closed) return; closed = true; over.classList.add('fun-out'); later(() => over.remove(), 460); };
    over.addEventListener('click', close);
    host.append(over);
    if (still) { over.classList.add('fun-gone'); later(close, 2200); return over; }
    later(() => over.classList.add('fun-burning'), 900);
    later(() => over.classList.add('fun-gone'), 2700);
    later(close, 4300);
    return over;
  }

  function chapter(obs) {
    const sum = chapterSummary(obs, streak.state);
    const grid = el(doc, 'span', { class: 'fun-mini', 'aria-hidden': 'true' }, dictionaryCells(obs).map((c) => el(doc, 'i', { 'data-kind': c.kind, style: c.kind === 'guess' ? `opacity:${Math.min(1, 0.3 + c.confidence)}` : null })));
    let scrim;
    const close = () => { if (scrim) scrim.remove(); };
    const go = el(doc, 'button', { type: 'button', class: 'fun-primary', 'data-fun': 'continue', text: t('fun.chapter.go', { n: sum.left }), onclick: close });
    scrim = el(doc, 'div', { class: 'fun-chapter-scrim' },
      el(doc, 'section', { class: 'fun-box fun-chapter', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('fun.chapter.title') },
        el(doc, 'h3', { text: t('fun.chapter.title') }), grid,
        el(doc, 'p', { text: t('fun.chapter.body', sum) }),
        el(doc, 'div', { class: 'fun-chapter-row' }, go,
          el(doc, 'button', { type: 'button', 'data-fun': 'restart', text: t('fun.chapter.new'), onclick: () => { close(); if (onRestart) onRestart(); else { try { doc.defaultView.location.reload(); } catch { /* no page */ } } } }))));
    host.append(scrim);
    try { go.focus({ preventScroll: true }); } catch { /* no focus in tests */ }
    try { if (hub && hub.advancing && hub.stop) hub.stop(); } catch { /* the card still shows */ }
    sound('ui_notify');
    if (storage) storage.setJSON(CHAPTER_KEY, { shown: true });
  }

  function onObs() {
    const obs = session.obs;
    if (!obs || !obs.season) return;
    popCells = new Set();
    const { outcomes } = tracker.observe(obs);
    for (const r of outcomes) {
      const s = streak.observe(r);
      if (!s) continue;
      if (s.result === 'hit') {
        banner('hit', '★', t('fun.streak.chip', { n: s.streak }), t('fun.streak.hit', { n: s.streak, gain: s.gained }));
        streakChip.classList.remove('fun-bump'); void streakChip.offsetWidth; streakChip.classList.add('fun-bump');
        sound('ui_confirm');
      } else if (s.ended > 0) banner('miss', '✕', t('fun.streak.chip', { n: 0 }), t('fun.streak.miss', { n: s.ended }));
    }
    const words = newWords(prev, obs);
    for (const w of words.slice(0, 2)) {
      popCells.add(w.slot + '_' + w.form);
      banner('aha', strokeSvg(w.form), t('fun.aha.title'), t('fun.aha.line', { slot: slotName(w.slot), form: formName(w.form), meaning: meaningName(w.slot, w.meaning) }), 5200);
    }
    for (const w of words.slice(2)) popCells.add(w.slot + '_' + w.form);
    if (words.length) sound('gift_chime');
    for (const l of newLies(prev, obs)) {
      banner('lie', '!', t('fun.lie.title', { who: who(l.from) }), t('fun.lie.body', { who: who(l.from), slot: slotName(l.slot), form: formName(l.form), meaning: meaningName(l.slot, l.meaning) }), 7000);
      sound('ui_error');
    }
    const gone = forgottenMemory(prev, obs);
    if (gone) burn(gone);
    renderChips(obs);
    renderBook(obs);
    if (chapterOneDue({ tick: obs.season.tick, phase: obs.season.phase, firstRun, shown: chapterShown })) { chapterShown = true; chapter(obs); }
    prev = obs;
  }

  const off = session.on('obs', onObs);
  onObs();

  return {
    host,
    get streak() { return streak.state; },
    get bookOpen() { return bookOpen; },
    toggleBook,
    /** Escape closes the book; returns true when it did. */
    handleKey(code) { if (code === 'Escape' && bookOpen) { toggleBook(false); return true; } return false; },
    refresh: onObs,
    destroy() { if (typeof off === 'function') off(); host.remove(); },
  };
}
