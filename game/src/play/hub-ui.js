// The Shell hub's screen layer (play/hub.js): the Shell dock on the island (four Shells, a mark where
// a sign waits, "let time pass"), the reading card inside a Shell (the Guest's sign, Iris's reading
// per slot that the player may change, the trial it points at, Stake / Leave), the one-click
// decision cards of the autopilot (offer, fragment, the Key, the vote, the Heir), the status line
// while trials pass, and the fade that covers a flight. It reuses the world HUD tokens (.wh-root)
// so it reads as part of the same HUD. All text is localized; every decision is a hub call.
import { renderMsg, reasonText } from './i18n.js';
import { logogramCanvas } from './logogram.js';
import { openSignsByShell, signForShell, waitingShells } from './hub.js';
import { panelArbiterFor } from './panels.js';
import { glossary, slotReason, signCells, knownCount } from './reasons.js';
import { GUIDE_STEPS } from './guide.js';

const ROMAN = ['I', 'II', 'III', 'IV'];
const POWER = [10, 20, 40, 80];

const CSS = `
/* Spacing scale 4/8/12/16/24; radii 10 (buttons) / 14 (panels) / 16 (cards) / 999 (pills); 40 px targets, 48 on phones. */
.hub-host { position: absolute; inset: 0; pointer-events: none; z-index: 3; } /* inside #ui, which is as tall as the visible viewport */
@keyframes hub-rise { from { opacity: 0; translate: 0 var(--pl-rise, 10px); } to { opacity: 1; translate: 0 0; } }
@keyframes hub-glow { 0%, 100% { box-shadow: 0 0 10px rgba(228,194,114,.25); } 50% { box-shadow: 0 0 18px rgba(228,194,114,.5); } }
.hub-host .hub-box.hub-enter { animation: hub-rise var(--pl-dur-slow, 360ms) var(--pl-ease-out, ease-out) both; }
.hub-host .hub-status.hub-enter { animation-duration: var(--pl-dur, 220ms); }
.hub-host .hub-box { position: absolute; pointer-events: auto; background: var(--wh-panel-bg, rgba(16,26,27,.92)); border: 1px solid var(--wh-frame, rgba(232,214,172,.8));
  border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.05); -webkit-backdrop-filter: blur(var(--wh-panel-blur, 10px)); backdrop-filter: blur(var(--wh-panel-blur, 10px)); color: var(--wh-text, #faf7ee); }
.hub-host h3 { margin: 0; font: 400 20px/1.2 var(--wh-font, Georgia, serif); color: var(--wh-text, #faf7ee); -webkit-text-stroke: .3px currentColor; }
.hub-host p { margin: 4px 0 0; font: var(--wh-font-body-weight, 500) 13.5px/1.4 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-2, #e6e3d7); }
.hub-host .hub-pass-short { display: none; }
.hub-host .hub-eyebrow { margin-bottom: 4px; font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.hub-host .hub-muted { color: var(--wh-text-muted, #c9c6b8); font-size: 12.5px; }
.hub-host .hub-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.hub-host button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 16px;
  font: 600 14px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text, #faf7ee); background: var(--wh-btn-bg, rgba(10,22,23,.78));
  border: 1px solid rgba(232,214,172,.45); border-radius: 10px; cursor: pointer; transition: border-color .16s ease, background-color .16s ease, transform .08s ease; }
.hub-host button:hover { border-color: var(--wh-gold, #e4c272); background: rgba(22,36,37,.92); }
.hub-host button:active { transform: translateY(1px); }
.hub-host button:focus-visible { outline: 2px solid var(--wh-gold-bright, #fbe6a6); outline-offset: 2px; }
.hub-host button[disabled] { opacity: .45; cursor: default; transform: none; }
.hub-host button.hub-primary { background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); color: var(--wh-text-on-gold, #fffcec); }
.hub-host button.hub-primary:hover { filter: brightness(1.08); }
.hub-host kbd { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); border: 1px solid rgba(232,214,172,.6); border-radius: 4px; background: var(--wh-kbd-bg, rgba(42,38,30,.92)); }
.hub-dock { right: 16px; bottom: calc(23 * var(--wh-px, 1px) + 60px + 12px); width: 340px; padding: 16px; } /* 12 px above the hotbar, whatever its height */
.hub-shells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
.hub-shells button { position: relative; flex-direction: column; gap: 6px; min-height: 60px; padding: 8px 4px; font: 400 20px/1 var(--wh-font, Georgia, serif); }
.hub-shells button small { display: block; font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); letter-spacing: .04em; }
.hub-shells button.hub-wait { border-color: var(--wh-gold, #e4c272); box-shadow: 0 0 14px rgba(228,194,114,.35); animation: hub-glow 2.4s ease-in-out infinite; }
.hub-shells button.hub-wait small { color: var(--wh-gold, #e4c272); }
.hub-read { right: 16px; top: 120px; width: 380px; padding: 16px; max-height: calc(100vh - 240px); overflow: auto; scrollbar-width: thin; scrollbar-color: var(--wh-gold-deep, #b48d3c) transparent; }
.hub-sign { display: grid; grid-template-columns: 112px 1fr; gap: 12px; align-items: center; margin-top: 8px; }
.hub-sign canvas { border-radius: 50%; background: #0f1a1b; }
.hub-slots { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.hub-slots li { display: grid; grid-template-columns: 64px 40px 1fr 40px; align-items: center; gap: 8px; }
.hub-slots li > span:first-child { font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); text-transform: uppercase; letter-spacing: .08em; color: var(--wh-text-muted, #c9c6b8); }
.hub-slots li button { width: 40px; min-height: 40px; padding: 0; font: 400 20px/1 var(--wh-font, Georgia, serif); }
.hub-slots .hub-mean { text-align: center; font: 400 15px/1.15 var(--wh-font, Georgia, serif); }
.hub-slots .hub-mean small { display: block; margin-top: 2px; font: 500 10.5px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.hub-slots .hub-mean.hub-edited small { color: var(--wh-gold, #e4c272); }
/* Read → Choose → See guide: one line next to the eyebrow, the current step lit (play/guide.js). */
.hub-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; min-width: 0; }
.hub-head .hub-eyebrow { margin-bottom: 0; flex: none; }
.hub-guide { display: block; min-width: 0; margin: 0; padding: 0; list-style: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font: 600 10.5px/1.2 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .02em; color: var(--wh-text-muted, #c9c6b8); opacity: .85; }
.hub-guide li { display: inline; }
.hub-guide li + li::before { content: " \\2192  "; opacity: .55; }
.hub-guide li.hub-done { color: var(--wh-text-2, #e6e3d7); }
.hub-guide li.hub-now { color: var(--wh-gold-bright, #fbe6a6); }
/* when the line does not fit (long eyebrows, phones), the other steps shrink to their numbers: "1 → Choose → 3" */
.hub-guide.hub-guide--short li:not(.hub-now) { font-size: 0; }
.hub-guide.hub-guide--short li::before, .hub-guide.hub-guide--short li:not(.hub-now)::after { font-size: 10.5px; }
.hub-guide.hub-guide--short li:not(.hub-now)::after { content: attr(data-n); }
/* "Iris thinks this because…": one line under each slot (play/reasons.js). */
.hub-slots .hub-why { grid-column: 1 / -1; margin: -4px 0 0; font: 500 11.5px/1.3 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.hub-slots .hub-why.hub-warn { color: var(--wh-gold, #e4c272); }
.hub-elsewhere { margin-top: 8px; padding: 8px 12px; border-radius: 8px; background: var(--wh-anchor-bg, rgba(38,34,22,.7)); }
/* Glossary on the glass: 16 words, rows = slots, columns = strokes; silver = the Guests, gold = a true word, % = a guess. */
.hub-gloss { margin-top: 12px; border-top: 1px solid rgba(232,214,172,.2); padding-top: 8px; }
.hub-gloss summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; gap: 8px; font: 600 12.5px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-2, #e6e3d7); border-radius: 6px; }
.hub-gloss summary:focus-visible { outline: 2px solid var(--wh-gold-bright, #fbe6a6); outline-offset: 2px; }
.hub-gloss table { width: 100%; border-collapse: separate; border-spacing: 4px; table-layout: fixed; margin-top: 4px; }
.hub-gloss th { font: 600 10px/1.1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .04em; text-transform: uppercase; color: var(--wh-text-muted, #c9c6b8); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-gloss th[scope="row"] { width: 54px; text-align: left; }
.hub-gloss td { height: 36px; padding: 2px; text-align: center; vertical-align: middle; border-radius: 6px; border: 1px dashed rgba(232,214,172,.22); font: 400 13px/1.1 var(--wh-font, Georgia, serif); color: var(--wh-text-2, #e6e3d7); cursor: default; overflow: hidden; }
.hub-gloss td small { display: block; margin-top: 1px; font: 600 9.5px/1 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.hub-gloss td.hub-g-guess { border-style: solid; border-color: rgba(232,214,172,.3); }
.hub-gloss td.hub-g-guests { border: 1px solid #d5dde2; background: rgba(205,215,222,.16); color: #f2f6f8; }
.hub-gloss td.hub-g-guests small { color: #d5dde2; }
.hub-gloss td.hub-g-outcome { border: 1px solid var(--wh-gold, #e4c272); background: rgba(228,194,114,.2); color: var(--wh-text, #faf7ee); }
.hub-gloss td.hub-g-outcome small { color: var(--wh-gold, #e4c272); }
.hub-gloss td.hub-g-here { box-shadow: 0 0 0 2px var(--wh-gold-bright, #fbe6a6); }
.hub-gloss td:focus-visible { outline: 2px solid var(--wh-gold-bright, #fbe6a6); outline-offset: 1px; }
.hub-gloss .hub-gloss-detail { min-height: 2.6em; margin-top: 4px; font-size: 12px; }
.hub-gloss .hub-gloss-legend { margin-top: 4px; font-size: 11px; color: var(--wh-text-muted, #c9c6b8); }
.hub-target { margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: var(--wh-anchor-bg, rgba(38,34,22,.7)); font: 400 15px/1.3 var(--wh-font, Georgia, serif); }
.hub-card { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 32px)); max-height: calc(var(--vvh, 100vh) - 24px); overflow: auto; padding: 20px 24px 24px; border-radius: 16px; border-color: var(--wh-gold, #e4c272); background: rgba(12, 20, 21, .96) !important; }
.hub-card .hub-row { margin-top: 16px; }
.hub-status { left: 50%; top: calc(152 * var(--wh-px, 1px) + 48px); transform: translateX(-50%); /* the transient row under the quest banner (152 u), below the inspect hint slot */ padding: 8px 8px 8px 16px; border-radius: 999px; font: 400 15px/1.2 var(--wh-font, Georgia, serif); display: flex; gap: 12px; align-items: center; }
.hub-status button { min-height: 36px; padding: 0 12px; font-size: 12.5px; border-radius: 999px; }
.hub-fade { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity .45s ease; z-index: 6;
  background: radial-gradient(circle at 50% 40%, rgba(255,250,238,.95), rgba(214,226,232,.98) 55%, rgba(170,186,196,1)); display: grid; place-items: center; }
.hub-fade span { font: 400 26px/1.2 var(--wh-font, Georgia, serif); color: #2b3433; letter-spacing: .06em; }
.hub-fade.on { opacity: 1; pointer-events: auto; }
/* Exclusivity (play/panels.js): a modal panel hides the dock and the reading card; the open Signs panel leaves the dock's corner free. */
body.pl-modal-open .hub-host .hub-dock, body.pl-modal-open .hub-host .hub-read { display: none; }
body.hub-dock-on .wh-root .wh-signs { max-height: calc(100% - 94 * var(--wh-px, 1px) - 330px); }
@media (max-width: 700px), (pointer: coarse) and (max-height: 900px) {
  .hub-host button { min-height: 48px; padding: 0 16px; }
  .hub-dock { left: 8px; right: 8px; width: auto; bottom: auto; top: calc(112px + env(safe-area-inset-top, 0px)); padding: 12px; }
  .hub-dock p { display: none; }
  .hub-shells { margin-top: 8px; gap: 8px; } .hub-shells button { min-height: 56px; padding: 6px 2px; font-size: 18px; }
  .hub-read { left: 8px; right: 8px; width: auto; top: calc(112px + env(safe-area-inset-top, 0px)); bottom: auto; max-height: calc(100vh - 260px); padding: 12px; background: rgba(12,20,21,.96); }
  body.hub-in-shell .wh-root .wh-quest-m, body.hub-in-shell .wh-root .wh-quest--mobile, body.hub-in-shell .wh-root .wh-trial--mobile, body.hub-in-shell .wh-root .wh-tiles,
  body.hub-in-shell .wh-root .wh-prompt, body.hub-in-shell .wh-root .wh-prompt--mobile, body.hub-in-shell .wh-root .wh-dialogue--mobile { visibility: hidden; } /* the reading card owns the phone screen: Leave / Stake are on it */
  body.hub-dock-on .wh-root .wh-signs { max-height: none; }
  .hub-dock h3, .hub-read .hub-sign p.hub-muted, .hub-read > p.hub-muted:last-child { display: none; }
  .hub-sign { grid-template-columns: 76px 1fr; } .hub-sign canvas { width: 76px; height: 76px; }
  .hub-host h3 { font-size: 17px; } .hub-host p { font-size: 12.5px; }
  .hub-slots li { grid-template-columns: 56px 44px 1fr 44px; gap: 6px; } .hub-slots li button { width: 44px; min-height: 44px; }
  .hub-status { top: calc(64px + env(safe-area-inset-top, 0px)); font-size: 13px; padding: 6px 6px 6px 12px; } .hub-status button { min-height: 36px; }
  .hub-slots li { row-gap: 2px; } .hub-slots .hub-why { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
  /* Stake / Leave stay in view while the card scrolls (the reason lines and the glossary make it taller) */
  .hub-read > .hub-row { position: sticky; bottom: -12px; z-index: 1; margin: 8px -12px 0; padding: 8px 12px 12px; background: rgba(12,20,21,.97); border-top: 1px solid rgba(232,214,172,.18); flex-wrap: nowrap; }
  .hub-read > .hub-row button { flex: 1 1 auto; min-width: 0; padding: 0 10px; white-space: normal; line-height: 1.15; }
  .hub-read > .hub-row #hub-hop { flex: none; white-space: nowrap; }
  .hub-gloss summary { min-height: 44px; }
  .hub-gloss td { height: 34px; font-size: 12px; } .hub-gloss th[scope="row"] { width: 46px; }
}
/* Short phones (QA-011): the bottom-anchored HUD stack rises to ~220 px on a 664 px screen, so the dock at 112 px
   gets compact: no eyebrow, 44 px Shell cells, a 40 px pass row; 112 + 8 + 44 + 6 + 40 + 8 = 218 px. */
@media (max-width: 700px) and (max-height: 760px) {
  .hub-dock { padding: 8px; top: calc(104px + env(safe-area-inset-top, 0px)); } /* 6 px under the top bar's buttons: a two-line quest title (uk, ru, it) still clears it */
  .hub-dock .hub-eyebrow, .hub-dock .hub-head { display: none; }
  .hub-shells { margin-top: 0; gap: 6px; } .hub-shells button { min-height: 44px; padding: 4px 2px 3px; font-size: 16px; gap: 3px; }
  .hub-shells button small { font-size: 9.5px; }
  .hub-dock .hub-row { margin-top: 6px; } .hub-dock .hub-row button { min-height: 40px; width: 100%; }
}
/* Short viewports (html[data-vh], see tokens.css): the dock is a slim bar of five cells under the top bar; the
   reading card fits the visible height; every button keeps a 44 px hit zone around its 40 px box. */
@media (max-width: 700px) {
  html[data-vh="short"] .hub-host button, html[data-vh="tiny"] .hub-host button { position: relative; min-height: 40px; }
  html[data-vh="short"] .hub-host button::before, html[data-vh="tiny"] .hub-host button::before { content: ""; position: absolute; inset: -4px; border-radius: inherit; }
  html[data-vh="short"] .hub-dock, html[data-vh="tiny"] .hub-dock { top: calc(88px + env(safe-area-inset-top, 0px)); padding: 6px; border-radius: 12px; display: grid; grid-template-columns: repeat(4, 1fr) 1.7fr; gap: 6px; }
  html[data-vh="short"] .hub-dock .hub-head, html[data-vh="tiny"] .hub-dock .hub-head,
  html[data-vh="short"] .hub-dock .hub-eyebrow, html[data-vh="tiny"] .hub-dock .hub-eyebrow, html[data-vh="short"] .hub-dock h3, html[data-vh="tiny"] .hub-dock h3, html[data-vh="short"] .hub-dock p, html[data-vh="tiny"] .hub-dock p { display: none; }
  html[data-vh="short"] .hub-dock .hub-shells, html[data-vh="tiny"] .hub-dock .hub-shells, html[data-vh="short"] .hub-dock .hub-row, html[data-vh="tiny"] .hub-dock .hub-row { display: contents; }
  html[data-vh="short"] .hub-shells button, html[data-vh="tiny"] .hub-shells button { min-height: 40px; padding: 2px 2px 1px; font-size: 15px; gap: 1px; border-radius: 10px; }
  html[data-vh="short"] .hub-shells button small, html[data-vh="tiny"] .hub-shells button small { font-size: 9px; letter-spacing: 0; }
  html[data-vh="short"] .hub-dock .hub-row button, html[data-vh="tiny"] .hub-dock .hub-row button { display: block; min-height: 40px; padding: 0 8px; font-size: 12px; line-height: 40px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 10px; }
  html[data-vh="short"] .hub-dock .hub-row button kbd, html[data-vh="tiny"] .hub-dock .hub-row button kbd { display: none; }
  html[data-vh="short"] .hub-read, html[data-vh="tiny"] .hub-read { top: calc(88px + env(safe-area-inset-top, 0px)); max-height: calc(var(--vvh, 100vh) - 100px - env(safe-area-inset-top, 0px)); padding: 10px; }
  html[data-vh="short"] .hub-read h3, html[data-vh="tiny"] .hub-read h3 { font-size: 15px; }
  html[data-vh="short"] .hub-read > .hub-row, html[data-vh="tiny"] .hub-read > .hub-row { bottom: -10px; margin: 6px -10px 0; padding: 6px 10px 10px; }
  html[data-vh="short"] .hub-sign, html[data-vh="tiny"] .hub-sign { grid-template-columns: 64px 1fr; } html[data-vh="short"] .hub-sign canvas, html[data-vh="tiny"] .hub-sign canvas { width: 64px; height: 64px; }
  html[data-vh="short"] .hub-slots, html[data-vh="tiny"] .hub-slots { gap: 6px; } html[data-vh="short"] .hub-slots li button, html[data-vh="tiny"] .hub-slots li button { width: 40px; min-height: 40px; }
  html[data-vh="short"] .hub-status, html[data-vh="tiny"] .hub-status { top: calc(148px + env(safe-area-inset-top, 0px)); font-size: 12.5px; padding: 4px 4px 4px 12px; } html[data-vh="short"] .hub-status button, html[data-vh="tiny"] .hub-status button { min-height: 32px; }
  html[data-vh="short"] .hub-card, html[data-vh="tiny"] .hub-card { padding: 12px 14px 14px; } html[data-vh="short"] .hub-card .hub-row, html[data-vh="tiny"] .hub-card .hub-row { margin-top: 10px; }
}
/* tiny landscape (667×300): the dock takes the right half, the quest line (status.css) the left half */
@media (max-width: 700px) and (max-height: 520px) and (orientation: landscape) {
  html[data-vh="tiny"] .hub-dock { left: calc(50% + 6px); right: 8px; }
  html[data-vh="tiny"] .hub-status { left: auto; right: 8px; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .hub-fade { transition: none; } .hub-host button { transition: none; } .hub-shells button.hub-wait { animation: none; } }
html[data-motion="reduce"] .hub-shells button.hub-wait { animation: none; }
`;

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return e;
}

/**
 * @param {{root: HTMLElement, ctx: object, hub: import('./hub.js').ShellHub, onFly: (n:number)=>void, onRejected?: (reason:string)=>void}} o
 */
export function createHubUi({ root, ctx, hub, onFly, onRejected = () => {} }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const t = (k, a) => renderMsg(i18n, k, a);
  if (!doc.getElementById('hub-style')) doc.head.append(el(doc, 'style', { id: 'hub-style', text: CSS }));
  const arb = panelArbiterFor(root); // panels.js: the dock and the reading card give way to any open modal panel
  const host = el(doc, 'div', { class: 'wh-root hub-host' });
  const fade = el(doc, 'div', { class: 'hub-fade', 'aria-hidden': 'true' }, el(doc, 'span'));
  root.append(host);
  doc.body.append(fade);
  let notice = null, noticeTimer = 0, signKey = '';
  // the glossary keeps its open state and the focused word across re-renders; collapsed by default on phones
  let glossOpen = null, glossFocus = 0;
  const narrow = () => { try { return doc.defaultView.matchMedia('(max-width: 700px), (pointer: coarse) and (max-height: 900px)').matches; } catch { return false; } };

  const shellLabel = (n) => ROMAN[n - 1];
  const btn = (attrs, ...kids) => el(doc, 'button', { type: 'button', ...attrs }, ...kids);

  function dock(obs) {
    const by = openSignsByShell(obs);
    const busy = !!hub.busy || hub.advancing;
    const canPass = obs.season.phase === 'play';
    return el(doc, 'section', { class: 'hub-box hub-dock', 'aria-label': t('hub.dock.title') },
      head(t('hub.dock.eyebrow')),
      el(doc, 'h3', { text: t('hub.dock.title') }),
      el(doc, 'p', { text: t('hub.dock.hint') }),
      // the first trial says once where the season lives (season-local.js); Settings repeats it with the restart
      obs.season.tick <= 1 ? el(doc, 'p', { class: 'hub-muted', 'data-season-note': '', text: t('season.local.note') }) : null,
      el(doc, 'div', { class: 'hub-shells' }, [1, 2, 3, 4].map((n) => {
        const k = by.get(n).length;
        return btn({ class: k ? 'hub-wait' : null, 'data-shell': n, disabled: busy || null, 'aria-label': t('hub.dock.shell', { shell: shellLabel(n), count: k }), onclick: () => onFly(n) },
          shellLabel(n), el(doc, 'small', { text: k ? t('hub.dock.signs', { count: k }) : t('hub.dock.quiet') }));
      })),
      el(doc, 'div', { class: 'hub-row' },
        btn({ class: by.size && [...by.values()].some((v) => v.length) ? null : 'hub-primary', id: 'hub-pass', disabled: busy || !canPass || null, onclick: () => hub.advance() }, el(doc, 'kbd', { text: 'T' }), el(doc, 'span', { class: 'hub-pass-long', text: t('hub.dock.pass', { tick: obs.season.tick }) }), el(doc, 'span', { class: 'hub-pass-short', 'aria-hidden': 'true', text: t('hub.dock.passShort') }))));
  }

  /** The card header: the eyebrow and, on the same line, the Read → Choose → See guide. */
  function head(eyebrow) {
    const step = hub.guide();
    const i = GUIDE_STEPS.indexOf(step);
    return el(doc, 'div', { class: 'hub-head' },
      el(doc, 'div', { class: 'hub-eyebrow', text: eyebrow }),
      el(doc, 'ol', { class: 'hub-guide', 'aria-label': t('hub.guide.title'), 'data-step': step }, GUIDE_STEPS.map((s, k) =>
        el(doc, 'li', { class: k < i ? 'hub-done' : k === i ? 'hub-now' : null, 'aria-current': k === i ? 'step' : null, 'data-n': String(k + 1), text: t('hub.guide.' + s) }))));
  }

  /** A short meaning for a glossary cell: Roman Shell, the action's name, the power, +delay. */
  function shortMeaning(slot, m) {
    if (slot === 0) return ROMAN[m];
    if (slot === 1) return i18n.t('meaning.1.' + m);
    if (slot === 2) return String(POWER[m]);
    return '+' + (m + 1);
  }

  function cellText(c) {
    const args = { form: i18n.t('form.' + c.form), slot: i18n.t('slot.' + c.slot), meaning: c.meaning != null ? i18n.t(`meaning.${c.slot}.${c.meaning}`) : '', confidence: Math.round(c.confidence * 100) };
    const text = t('hub.gloss.cell.' + c.kind, args);
    return c.excluded.length ? t('hub.gloss.not', { text, list: c.excluded.map((m) => i18n.t(`meaning.${c.slot}.${m}`)).join(', ') }) : text;
  }

  /** Glossary on the glass: a collapsible 4 × 4 grid (rows = slots, columns = strokes), arrow keys move between words. */
  function glossaryEl(obs, p) {
    const rows = glossary(obs);
    const here = signCells(p);
    const open = glossOpen != null ? glossOpen : !narrow();
    const detail = el(doc, 'p', { class: 'hub-gloss-detail', 'aria-live': 'polite', text: t('hub.gloss.pick') });
    const cells = [];
    const show = (idx) => { const c = rows[idx >> 2][idx & 3]; detail.textContent = cellText(c); };
    const moveTo = (idx) => {
      glossFocus = idx;
      cells.forEach((td, k) => td.setAttribute('tabindex', k === idx ? '0' : '-1'));
      cells[idx].focus();
      show(idx);
    };
    const table = el(doc, 'table', { role: 'grid', 'aria-label': t('hub.gloss.grid'), onkeydown: (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); moveTo(e.key === 'Home' ? glossFocus & ~3 : glossFocus | 3); return; }
      if (!d) return;
      e.preventDefault(); e.stopPropagation(); // the arrows move between words here, not the camera
      const next = glossFocus + d;
      if (next < 0 || next > 15 || (Math.abs(d) === 1 && (next >> 2) !== (glossFocus >> 2))) return;
      moveTo(next);
    } },
      el(doc, 'thead', {}, el(doc, 'tr', {}, el(doc, 'td', { 'aria-hidden': 'true', style: 'border:0' }),
        [0, 1, 2, 3].map((f) => el(doc, 'th', { scope: 'col', text: i18n.t('form.' + f) })))),
      el(doc, 'tbody', {}, rows.map((row, s) => el(doc, 'tr', {},
        el(doc, 'th', { scope: 'row', text: i18n.t('slot.' + s) }),
        row.map((c, f) => {
          const idx = s * 4 + f;
          const sub = c.kind === 'guests' || c.kind === 'outcome' ? '✓' : c.kind === 'guess' ? Math.round(c.confidence * 100) + '%' : '';
          const td = el(doc, 'td', {
            role: 'gridcell', tabindex: idx === glossFocus ? '0' : '-1', 'data-cell': s + '_' + f, 'data-kind': c.kind,
            class: 'hub-g-' + c.kind + (here.has(s + '_' + f) ? ' hub-g-here' : ''), 'aria-label': cellText(c), title: cellText(c),
            onfocus: () => { glossFocus = idx; show(idx); }, onmouseenter: () => show(idx),
          }, c.kind === 'unknown' ? '' : shortMeaning(s, c.meaning), sub ? el(doc, 'small', { text: sub }) : null);
          cells.push(td);
          return td;
        })))));
    return el(doc, 'details', { class: 'hub-gloss', open: open || null, ontoggle: (e) => { glossOpen = e.currentTarget.open; } },
      el(doc, 'summary', { text: t('hub.gloss.summary', { count: knownCount(obs) }) }),
      table, detail,
      el(doc, 'p', { class: 'hub-gloss-legend', text: t('hub.gloss.legend') }));
  }

  /** From a quiet Shell straight into the Shell Iris reads the waiting sign for; the trial does not end. */
  async function hop(n) {
    if (!hub.beginTransit('fly')) return;
    let r;
    try {
      fade.firstChild.textContent = t('hub.flying', { shell: shellLabel(n) });
      fade.classList.add('on');
      await new Promise((res) => setTimeout(res, reducedMotion(doc) ? 0 : 480));
      r = await hub.flyTo(n);
    } finally { hub.endTransit(); }
    setTimeout(() => fade.classList.remove('on'), 160);
    if (r && !r.ok && r.reason !== 'busy') onRejected(r.reason);
  }

  function reading(obs) {
    const p = signForShell(obs, obs.you.shell);
    const box = el(doc, 'section', { class: 'hub-box hub-read', 'aria-label': t('hub.read.title') },
      head(t('hub.read.eyebrow', { shell: shellLabel(obs.you.shell) })));
    if (!p) {
      // a quiet Shell stays quiet (it never borrows another Shell's sign); a waiting sign elsewhere is one hop away
      const other = waitingShells(obs, obs.you.shell)[0];
      box.append(el(doc, 'h3', { text: t('hub.read.silent') }),
        other ? el(doc, 'p', { class: 'hub-elsewhere', text: t('hub.read.elsewhere', { shell: shellLabel(other) }) }) : el(doc, 'p', { text: t('hub.read.silentHint') }),
        el(doc, 'div', { class: 'hub-row' },
          other ? btn({ class: 'hub-primary', id: 'hub-hop', 'data-shell': other, disabled: !!hub.busy || !!hub.transit || null, onclick: () => hop(other) }, t('hub.read.hop', { shell: shellLabel(other) })) : null,
          btn({ class: other ? null : 'hub-primary', id: 'hub-leave', disabled: !!hub.busy || null, onclick: () => hub.leave() }, el(doc, 'kbd', { text: 'T' }), t('hub.read.leave'))),
        glossaryEl(obs, null));
      return box;
    }
    hub.syncDraft();
    const d = hub.draft;
    const target = hub.target();
    const staked = target && obs.iris.anchors.some((a) => a.shell === target.shell && a.tick === target.tick);
    const passed = target && (target.tick < obs.season.tick || target.tick > obs.season.ticks);
    const canStake = target && !staked && !passed && obs.iris.attention >= 1 && obs.iris.silk >= 10 && obs.season.phase === 'play';
    const actionName = i18n.t('meaning.1.' + d.slots[1]);
    box.append(...[
      el(doc, 'h3', { text: p.vision ? t('hub.read.titleVision') : t('hub.read.title') }),
      el(doc, 'div', { class: 'hub-sign' },
        logogramCanvas({ forms: p.forms, dots: p.dots }, 112, { labels: true, background: '#0f1a1b' }),
        el(doc, 'div', {},
          el(doc, 'p', { text: p.vision ? t('hub.read.vision') : t('hub.read.published', { tick: p.publishedAt }) }),
          el(doc, 'p', { class: 'hub-muted', text: t('hub.read.howto') }))),
      el(doc, 'ul', { class: 'hub-slots' }, [0, 1, 2, 3].map((k) => {
        const s = p.reading ? p.reading.slots[k] : null;
        const edited = d.edited[k] && (!s || s.meaning !== d.slots[k]);
        const sub = edited ? t('hub.read.yours') : s ? t('hub.read.iris', { confidence: Math.round(s.confidence * 100) }) : '';
        // no line for a slot the first-stake pre-fill changed (hub.prefillFirstDelay): it is policy, not Iris's evidence
        const why = edited ? slotReason(obs, p, k, d.slots[k]) : s && s.meaning !== d.slots[k] ? null : slotReason(obs, p, k);
        const whyText = why ? t(why.key, why.args) : '';
        return el(doc, 'li', {},
          el(doc, 'span', { text: i18n.t('slot.' + k) }),
          btn({ 'aria-label': t('hub.read.prev', { slot: i18n.t('slot.' + k) }), onclick: () => hub.cycleSlot(k, -1) }, '‹'),
          el(doc, 'div', { class: 'hub-mean' + (edited ? ' hub-edited' : '') }, i18n.t(`meaning.${k}.${d.slots[k]}`), el(doc, 'small', { text: sub })),
          btn({ 'aria-label': t('hub.read.next', { slot: i18n.t('slot.' + k) }), onclick: () => hub.cycleSlot(k, 1) }, '›'),
          whyText ? el(doc, 'p', { class: 'hub-why' + (/^hub\.why\.yours(Known|RuledOut|Taken)$/.test(why.key) ? ' hub-warn' : ''), 'data-why': why.key, title: whyText, text: whyText }) : null);
      })),
      el(doc, 'div', { class: 'hub-target' }, target ? t('hub.read.target', { action: actionName, shell: shellLabel(target.shell), tick: target.tick }) : ''),
      el(doc, 'p', { class: 'hub-muted', text: t('hub.read.purse', { silk: obs.iris.silk, attention: obs.iris.attention }) }),
      staked ? el(doc, 'p', { class: 'hub-muted', text: t('hub.read.staked') }) : passed ? el(doc, 'p', { class: 'hub-muted', text: t('hub.read.passed') }) : null,
      el(doc, 'div', { class: 'hub-row' },
        btn({ class: 'hub-primary', id: 'hub-stake', disabled: !canStake || !!hub.busy || null, onclick: () => stake() }, el(doc, 'kbd', { text: 'F' }), t('hub.read.stake')),
        d.edited.some(Boolean) ? btn({ onclick: () => hub.resetDraft() }, t('hub.read.reset')) : null,
        btn({ id: 'hub-leave', disabled: !!hub.busy || null, onclick: () => hub.leave() }, el(doc, 'kbd', { text: 'T' }), t('hub.read.leave'))),
      glossaryEl(obs, p),
      el(doc, 'p', { class: 'hub-muted', text: t('hub.read.leaveHint') })].filter(Boolean));
    return box;
  }

  function card(c, obs) {
    const box = el(doc, 'section', { class: 'hub-box hub-card', role: 'dialog', 'aria-modal': 'false', 'aria-label': t('hub.card.' + c.kind + '.title', cardArgs(c, obs)) },
      el(doc, 'div', { class: 'hub-eyebrow', text: t('hub.card.eyebrow') }),
      el(doc, 'h3', { text: t('hub.card.' + c.kind + '.title', cardArgs(c, obs)) }),
      el(doc, 'p', { text: t('hub.card.' + c.kind + '.body', cardArgs(c, obs)) }));
    const choices = {
      offer: [['accept', true], ['decline'], ['later']],
      fragment: [['give', true], ['later']],
      speak: [['speak', true], ['later']],
      key: [['memories', true], ['later']],
      vote: [['accept', true], ['reject']],
      heir: [['heir', true], ['keep']],
    }[c.kind] || [['later']];
    box.append(el(doc, 'div', { class: 'hub-row' }, choices.map(([id, primary], i) => btn({
      class: primary ? 'hub-primary' : null, 'data-choice': id, disabled: !!hub.busy || null,
      onclick: () => choose(id),
    }, el(doc, 'kbd', { text: String(i + 1) }), t('hub.choice.' + c.kind + '.' + id, cardArgs(c, obs))))));
    return box;
  }

  function cardArgs(c, obs) {
    const iris = obs.iris;
    switch (c.kind) {
      case 'offer': return { who: { $agentId: c.offer.from }, offer: { key: c.offer.key || 'offer.' + c.offer.kind, args: c.offer.args || {} }, price: c.offer.price || 0, kind: c.offer.kind };
      case 'fragment': return { prize: iris.fragment.prize.amount, tick: iris.fragment.prize.tick, deadline: obs.season.contributionDeadline };
      case 'key': return { have: c.keyVision.confidentCells, need: c.keyVision.needCells };
      case 'heir': return { outcome: obs.season.outcome };
      default: return {};
    }
  }

  async function choose(id) {
    const c = hub.card;
    if (!c) return;
    if (c.kind === 'key' && id === 'memories') { hub.dismiss(); if (hub.onOpenMemories) hub.onOpenMemories(); return; }
    const r = await hub.resolve(id);
    if (r && !r.ok && r.reason !== 'busy') onRejected(r.reason);
    // after a decision on the island, time keeps passing unless another card is waiting
    if (r && r.ok && !hub.card && hub.obs.season.phase === 'play' && !hub.inShell && ['offer', 'fragment', 'speak'].includes(c.kind)) hub.advance();
  }

  async function stake() {
    const r = await hub.stake();
    if (r && !r.ok && r.reason !== 'busy') onRejected(r.reason);
    else if (r && r.ok && hub.lastStake) flash(t('hub.notice.staked', { shell: shellLabel(hub.lastStake.shell), tick: hub.lastStake.tick }));
  }

  function status(obs) {
    if (!hub.advancing && !notice) return null;
    const text = hub.advancing ? t('hub.status.passing', { tick: obs.season.tick }) : t(notice.key, notice.args);
    return el(doc, 'div', { class: 'hub-box hub-status', role: 'status' }, el(doc, 'span', { text }),
      hub.advancing ? btn({ onclick: () => hub.stop() }, t('hub.status.stop')) : null);
  }

  function flash(text, ms = 4200) { notice = { key: 'wh.raw', args: { text } }; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice = null; render(); }, ms); render(); }

  let rendering = false, lastKind = '', lastStatus = false;
  function render() {
    const obs = hub.obs;
    if (!obs || rendering) return;
    rendering = true;
    try {
      const kids = [];
      const c = hub.card;
      const inShell = obs.you.zone === 'shell';
      doc.body.classList.toggle('hub-in-shell', inShell && !c);
      // A decision card is modal: it closes whatever panel is open and stays until the player decides.
      if (c && !arb.isOpen('hub-card')) arb.claim('hub-card', () => {});
      else if (!c && arb.isOpen('hub-card')) arb.release('hub-card');
      const modal = arb.modal;
      let dockOn = false;
      if (c) kids.push(card(c, obs));
      else if (inShell) { if (!modal) kids.push(reading(obs)); }
      else if (obs.season.phase === 'play' && !modal) { kids.push(dock(obs)); dockOn = true; }
      doc.body.classList.toggle('hub-dock-on', dockOn);
      const st = status(obs);
      if (st) kids.push(st);
      // enter motion only when a different box appears (the dock re-renders on every change)
      const kind = c ? 'card:' + c.id : inShell ? 'read' : dockOn ? 'dock' : '';
      if (kind !== lastKind && kids[0] && kind) kids[0].classList.add('hub-enter');
      lastKind = kind;
      if (st && !lastStatus) st.classList.add('hub-enter');
      lastStatus = !!st;
      const glossHadFocus = !!(doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('.hub-gloss td'));
      const oldRead = host.querySelector('.hub-read');
      const readScroll = oldRead && kind === 'read' ? oldRead.scrollTop : 0;
      host.replaceChildren(...kids);
      if (readScroll) { const nr = host.querySelector('.hub-read'); if (nr) nr.scrollTop = readScroll; } // a slot change keeps the card where it was
      if (glossHadFocus) { const td = host.querySelectorAll('.hub-gloss td[role="gridcell"]')[glossFocus]; if (td) td.focus(); }
      for (const g of host.querySelectorAll('.hub-guide')) if (g.scrollWidth > g.clientWidth + 1) g.classList.add('hub-guide--short');
    } finally { rendering = false; }
  }

  const offs = [
    hub.on('change', render),
    hub.on('advanced', ({ reason }) => {
      if (reason === 'sign' && hub.notice) flash(t(hub.notice.key, hub.notice.args), 6000);
    }),
    hub.on('auto', (reason) => flash(t(reason.key, reason.args))),
    hub.session.on('obs', () => {
      // a new sign inside the current Shell resets nothing; a different sign resets the draft view
      const p = hub.currentSign();
      const k = p ? p.index + ':' + hub.shell : '';
      if (k !== signKey) signKey = k;
      render();
    }),
    i18n.subscribe(render),
    arb.subscribe(() => render()),
  ];
  render();

  return {
    render,
    flash,
    /** Covers the screen for a flight: resolves when fully covered. */
    async cover(text) {
      fade.firstChild.textContent = text || '';
      fade.classList.add('on');
      await new Promise((r) => setTimeout(r, reducedMotion(doc) ? 0 : 480));
    },
    uncover() { fade.classList.remove('on'); },
    /** Keys in hub mode: F stakes (in a Shell) or flies to the waiting Shell, T leaves or lets time pass, 1–3 answer a card. */
    handleKey(code) {
      const obs = hub.obs;
      if (!obs) return false;
      // during a flight or a running operation F and T are swallowed, not queued (QA-002); T still stops automatic trials
      if ((hub.transit || hub.busy) && (code === 'KeyF' || code === 'KeyT')) return true;
      if (hub.card) {
        const m = /^Digit([1-3])$/.exec(code);
        if (m) { const b = host.querySelectorAll('.hub-card [data-choice]')[Number(m[1]) - 1]; if (b && !b.disabled) b.click(); return true; }
        return false;
      }
      if (code === 'KeyF') {
        if (obs.you.zone === 'shell') { stake(); return true; }
        const by = openSignsByShell(obs);
        const n = [1, 2, 3, 4].find((s) => by.get(s).length);
        if (n) { onFly(n); return true; }
        return false;
      }
      if (code === 'KeyT') {
        if (hub.advancing) { hub.stop(); return true; }
        if (obs.you.zone === 'shell') hub.leave(); else hub.advance();
        return true;
      }
      return false;
    },
    destroy() { offs.forEach((f) => f()); arb.release('hub-card'); doc.body.classList.remove('hub-dock-on', 'hub-in-shell'); host.remove(); fade.remove(); },
  };
}

function reducedMotion(doc) { try { return doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

export { reasonText };
