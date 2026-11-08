// The island map panel (key N, the hotbar "Map" button, a round tap target on phones): a stylized
// top-down drawing of the archipelago from play/map.js in the world HUD's parchment, ink and gold
// (docs/ui-world-hud.md tokens through .wh-root). Clicking a place walks there over the room's walk
// graph; in the Shell hub clicking a Shell flies into it. Self-contained: its own styles, its own
// DOM under the play UI root, no three.js. Only one panel is open at a time: opening the map asks
// the host to close the others (onOpen), and the host closes the map when another panel opens.
import { renderMsg } from './i18n.js';
import { buildMapModel, MAP_SIZE, ROMAN, scaleLength, project } from './map.js';
import { planRoute } from '../net/world-map.js';
import { MOTION, installMotionStyles, enter, exit, stagger, drawOn } from '../ui/motion/index.js';

const SVG = 'http://www.w3.org/2000/svg';
const REFRESH = 0.2;        // seconds between marker refreshes while open
const KEY_DEDUPE_MS = 400;  // N arrives twice while input.js also forwards it (own listener + PLAY_KEYS)

const CSS = `
.ftf-map-host { position: fixed; inset: 0; z-index: 5; pointer-events: auto; display: grid; place-items: center; padding: 16px; overflow: hidden; }
.ftf-map-host[hidden] { display: none; }
.ftf-map-place, .ftf-map-dynamic > * { transform-box: fill-box; transform-origin: center; }
.ftf-map-dynamic { pointer-events: none; }
.ftf-map-route { fill: none; stroke: var(--wh-gold, #e4c272); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: .9; pointer-events: none; filter: drop-shadow(0 0 2px rgba(0,0,0,.6)); }
.ftf-map-scrim { position: absolute; inset: 0; background: var(--wh-scrim, rgba(0,0,0,.35)); }
.ftf-map { position: relative; width: min(max(560px, 34vw), 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 12px;
  background: var(--wh-panel-bg, rgba(16,26,27,.92)); border: 1px solid var(--wh-frame, rgba(232,214,172,.8)); border-radius: var(--wh-r-banner, 18px);
  box-shadow: var(--wh-shadow, 0 10px 30px rgba(0,0,0,.42)); -webkit-backdrop-filter: blur(var(--wh-panel-blur, 10px)); backdrop-filter: blur(var(--wh-panel-blur, 10px)); color: var(--wh-text, #faf7ee); }
.ftf-map::before { content: ""; position: absolute; inset: 5px; border: 1px solid var(--wh-frame-soft, rgba(196,186,156,.45)); border-radius: calc(var(--wh-r-banner, 18px) - 5px); pointer-events: none; }
.ftf-map header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ftf-map-eyebrow { font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); margin-bottom: 6px; }
.ftf-map h2 { margin: 0; font: 400 21px/1.15 var(--wh-font, Georgia, serif); -webkit-text-stroke: var(--wh-stroke-title, .38px) currentColor; }
.ftf-map-close { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; font: 600 13.5px/1 var(--wh-font-body, system-ui, sans-serif);
  color: var(--wh-text, #faf7ee); background: var(--wh-btn-bg, rgba(10,22,23,.78)); border: 1px solid var(--wh-frame-soft, rgba(196,186,156,.45)); border-radius: var(--wh-r-btn, 10px); cursor: pointer; }
.ftf-map-close:hover { border-color: var(--wh-gold, #e4c272); }
.ftf-map-close kbd { font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); border: 1px solid var(--wh-kbd-border, rgba(222,210,180,.85)); border-radius: 4px; padding: 3px 5px; background: var(--wh-kbd-bg, rgba(42,38,30,.92)); }
.ftf-map-canvas { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: min(68vh, 760px); margin: 0 auto; }
.ftf-map-canvas svg { display: block; width: 100%; height: 100%; overflow: visible; font-family: var(--wh-font, Georgia, serif); }
.ftf-map-sea { fill: url(#ftf-map-sea); }
.ftf-map-haze { fill: url(#ftf-map-haze); }
.ftf-map-bridge { stroke: #c4b38a; stroke-linecap: round; }
.ftf-map-bridge-ink { stroke: #3f3523; stroke-linecap: round; }
.ftf-map-bridge-joint { stroke: rgba(74,63,42,.45); stroke-width: .6; stroke-dasharray: 2 2; }
.ftf-map-cliff { fill: none; stroke: #3f3523; stroke-width: 4.5; stroke-dasharray: 1.1 2.4; opacity: .5; }
.ftf-map-platform { fill: url(#ftf-map-paper); stroke: #3f3523; stroke-width: 1.3; }
.ftf-map-platform--plaza { fill: #e6dcbd; }
.ftf-map-platform--balcony { fill: #cfc39e; }
.ftf-map-terrace { fill: none; stroke: rgba(74,63,42,.35); stroke-width: .7; }
.ftf-map-ring { fill: none; stroke: #8a7a52; stroke-width: .8; stroke-dasharray: 2 3; }
.ftf-map-scroll { fill: none; stroke: var(--wh-gold-deep, #b48d3c); stroke-width: 1.6; }
.ftf-map-scroll-core { fill: var(--wh-gold, #e4c272); }
.ftf-map-shell-glow { fill: rgba(255,205,120,.14); }
.ftf-map-coil { fill: none; stroke: rgba(250,247,238,.55); stroke-width: 1.1; stroke-linecap: round; }
.ftf-map-coil--lit { stroke: var(--wh-gold-bright, #fbe6a6); stroke-width: 1.3; }
.ftf-map-flourish { fill: none; stroke: var(--wh-gold, #e4c272); stroke-width: .9; opacity: .55; }
.ftf-map-rose-ring { fill: rgba(8,18,21,.35); stroke: rgba(232,214,172,.55); stroke-width: .7; }
.ftf-map-rose-pts { fill: rgba(232,214,172,.45); }
.ftf-map-rose-n { fill: var(--wh-gold, #e4c272); }
.ftf-map-rose-text { font: 400 9px/1 var(--wh-font, Georgia, serif); fill: var(--wh-gold-text, #f6df9b); text-anchor: middle; }
.ftf-map-scale path { fill: none; stroke: rgba(232,214,172,.7); stroke-width: .9; }
.ftf-map-scale text { font: 500 7.5px/1 var(--wh-font-body, system-ui, sans-serif); fill: var(--wh-text-muted, #c9c6b8); text-anchor: middle; }
.ftf-map-anchor { fill: rgba(228,194,114,.18); stroke: var(--wh-gold-deep, #b48d3c); stroke-width: 1; }
.ftf-map-anchor-n { font: 400 7px/1 var(--wh-font, Georgia, serif); fill: #4a3f2a; text-anchor: middle; pointer-events: none; }
.ftf-map-shell { fill: rgba(250,247,238,.07); stroke: var(--wh-frame-soft, rgba(196,186,156,.5)); stroke-width: 1.1; stroke-dasharray: 3 2.5; }
.ftf-map-shell--waiting { fill: rgba(228,194,114,.28); stroke: var(--wh-gold, #e4c272); stroke-dasharray: none; filter: drop-shadow(0 0 5px rgba(255,205,120,.55)); }
.ftf-map-shell--inside { fill: rgba(250,247,238,.18); stroke: var(--wh-gold-bright, #fbe6a6); stroke-width: 2; stroke-dasharray: none; }
.ftf-map-badge { fill: var(--wh-gold, #e4c272); }
.ftf-map-badge-n { font: 700 8px/1 var(--wh-font-body, system-ui, sans-serif); fill: #2a2112; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.ftf-map-place { cursor: pointer; outline: none; }
.ftf-map-place--off { cursor: default; opacity: .7; }
.ftf-map-hit { fill: transparent; stroke: transparent; stroke-width: 1.5; transition: stroke 160ms ease, fill 160ms ease; }
.ftf-map-place:hover .ftf-map-hit, .ftf-map-place:focus-visible .ftf-map-hit { fill: rgba(228,194,114,.16); stroke: var(--wh-gold-bright, #fbe6a6); }
.ftf-map-label { font: 400 13px/1 var(--wh-font, Georgia, serif); fill: var(--wh-text, #faf7ee); paint-order: stroke; stroke: rgba(8,18,21,.9); stroke-width: 3px; stroke-linejoin: round; text-anchor: middle; pointer-events: none; }
.ftf-map-label--sub { font: 600 9px/1 var(--wh-font-body, system-ui, sans-serif); fill: var(--wh-text-muted, #c9c6b8); letter-spacing: .07em; text-transform: uppercase; }
.ftf-map-label--lit { fill: var(--wh-gold-text, #f6df9b); }
.ftf-map-label--camp { fill: var(--wh-gold-text, #f6df9b); }
.ftf-map-camp-dot { stroke: #4a3f2a; stroke-width: 1; }
.ftf-map-gem { fill: #bfe0ec; stroke: #4a3f2a; stroke-width: .8; }
.ftf-map-agent { stroke: #1a1a14; stroke-width: 1; }
.ftf-map-iris-halo { fill: rgba(228,194,114,.22); }
.ftf-map-iris { fill: var(--wh-gold-bright, #fbe6a6); stroke: #2a2112; stroke-width: 1.2; stroke-linejoin: round; }
.ftf-map-iris-ring { fill: none; stroke: var(--wh-gold-bright, #fbe6a6); stroke-width: 2; }
.ftf-map-goal { fill: none; stroke: var(--wh-gold, #e4c272); stroke-width: 2; transform-box: fill-box; transform-origin: center; animation: ftf-map-pulse 1.8s ease-in-out infinite; }
.ftf-map-goal-core { fill: var(--wh-gold-bright, #fbe6a6); }
@keyframes ftf-map-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .55; } }
.ftf-map-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; font: var(--wh-font-body-weight, 500) 12px/1.3 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-2, #e6e3d7); }
.ftf-map-legend li { display: inline-flex; align-items: flex-start; gap: 6px; max-width: 100%; min-width: 0; }
.ftf-map-legend li span { min-width: 0; }
.ftf-map-legend svg { margin-top: 1px; }
.ftf-map-legend svg { width: 14px; height: 14px; flex: none; }
.ftf-map-hint { margin: 0; font: var(--wh-font-body-weight, 500) 12.5px/1.35 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.ftf-map-fab { position: fixed; left: calc(8px + env(safe-area-inset-left, 0px)); bottom: calc(96px + env(safe-area-inset-bottom, 0px)); z-index: 4; display: none; width: 48px; height: 48px;
  align-items: center; justify-content: center; border-radius: 50%; color: var(--wh-gold, #e4c272); background: rgba(10,22,23,.78); border: 1px solid rgba(232,214,172,.6); box-shadow: 0 4px 14px rgba(0,0,0,.35); cursor: pointer; pointer-events: auto; }
.ftf-map-fab svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
@media (pointer: coarse) { body.in-world .ftf-map-fab { display: flex; } }
body.ftf-map-open .ftf-map-fab { display: none !important; }
/* only one panel at a time: while the map is open the dock, the reading card and the spot menu wait underneath the scrim */
body.ftf-map-open .hub-dock, body.ftf-map-open .hub-read, body.ftf-map-open .pl-context, body.ftf-map-open #prompt, body.ftf-map-open .ftf-scene-cue, body.ftf-map-open .ftf-run-toggle, body.ftf-map-open .hub-card, body.ftf-map-open .hub-status { visibility: hidden; }
@media (max-width: 700px) {
  .ftf-map-host { padding: 8px; }
  .ftf-map { padding: 10px 12px 10px; gap: 8px; }
  .ftf-map h2 { font-size: 17px; }
  .ftf-map-canvas { max-height: min(62vh, 100vw); }
  .ftf-map-legend { font-size: 11px; gap: 4px 10px; }
  .ftf-map-hint { font-size: 11.5px; }
}
@media (prefers-reduced-motion: reduce) { .ftf-map-goal { animation: none; } .ftf-map-hit { transition: none; } }
.ftf-map-host--still .ftf-map-goal { animation: none; } .ftf-map-host--still .ftf-map-hit { transition: none; }
html[data-tier="low"] .ftf-map, html[data-fx="low"] .ftf-map { -webkit-backdrop-filter: none; backdrop-filter: none; }
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
function svg(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
/** A planispiral coil (the Shells' silhouette) as an SVG path inside radius R; each Shell turns a little differently. */
function coilPath(cx, cy, R, n) {
  const turns = 2.6 + n * 0.15, k = 0.22, steps = 64;
  const thetaMax = turns * Math.PI * 2, rMax = Math.exp(k * thetaMax);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * thetaMax, r = (Math.exp(k * th) / rMax) * R;
    const x = cx + Math.cos(th + n) * r, y = cy + Math.sin(th + n) * r;
    d += (i ? ' L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}


/**
 * @param {object} o
 * @param {HTMLElement} o.root play UI root (#ui) @param {object} o.ctx play context (i18n)
 * @param {object} o.session PlaySession @param {boolean} [o.hub] Shell hub mode
 * @param {() => {playerPos: number[], heading: number, zone: string, agents: {clan: string, position: number[]}[]}} o.getState
 * @param {(route: {kind: 'walk', place: string} | {kind: 'fly', shell: number}, place: object) => void} o.onRoute
 * @param {() => void} [o.onOpen] called before the map shows, so the host can close its other panels
 * @param {boolean} [o.phoneButton=true] the round tap target on coarse pointers (Task F may replace it with the hotbar)
 * @param {() => boolean} [o.reducedMotion] the look-dev's reduced-motion flag (?motion=reduce or the setting); the system media query is honoured anyway
 */
export function createMapPanel({ root, ctx, session, hub = false, getState, onRoute, onOpen = () => {}, phoneButton = true, reducedMotion = () => false }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const win = doc.defaultView;
  const t = (k, a) => renderMsg(i18n, k, a);
  if (!doc.getElementById('ftf-map-style')) doc.head.append(el(doc, 'style', { id: 'ftf-map-style', text: CSS }));
  installMotionStyles(doc);

  const host = el(doc, 'div', { class: 'wh-root ftf-map-host', role: 'dialog', 'aria-modal': 'true', hidden: true });
  // Tab stays inside the dialog while it is open (close button, then the places in reading order).
  host.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    const items = [...host.querySelectorAll('button, [tabindex="0"]')].filter((n) => !n.hasAttribute('disabled'));
    if (!items.length) return;
    const i = items.indexOf(doc.activeElement);
    const next = e.shiftKey ? (i <= 0 ? items[items.length - 1] : items[i - 1]) : (i < 0 || i === items.length - 1 ? items[0] : items[i + 1]);
    e.preventDefault();
    next.focus({ preventScroll: true });
  });
  const scrim = el(doc, 'div', { class: 'ftf-map-scrim', onclick: () => close() });
  const panel = el(doc, 'section', { class: 'ftf-map' });
  host.append(scrim, panel);
  root.append(host);
  const fab = phoneButton ? el(doc, 'button', { class: 'ftf-map-fab', type: 'button', onclick: () => toggle() }, mapIcon(doc)) : null;
  if (fab) { fab.addEventListener('pointerdown', (e) => e.stopPropagation()); doc.body.append(fab); }

  let open = false, acc = 0, lastKey = -Infinity, dynamic = null, lastFocus = null, model = null;

  function mapIcon(d) {
    const s = svg(d, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    s.append(svg(d, 'path', { d: 'M3 6.5 9 4l6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z' }), svg(d, 'path', { d: 'M9 4v15M15 6.5v13' }));
    return s;
  }

  function currentModel() {
    const s = getState ? getState() : {};
    return buildMapModel({ obs: session.obs, hub, zone: s.zone || 'island', playerPos: s.playerPos || null, heading: s.heading || 0, goal: session.goal, agents: s.agents || [] });
  }

  function labelFor(p) {
    return t(p.labelKey, p.labelArgs);
  }
  function shellCaption(st) {
    if (!st) return '';
    if (st.state === 'inside') return t('map.shell.inside');
    return st.signs ? t('map.shell.waiting', { count: st.signs }) : t('map.shell.quiet');
  }
  function actionText(p) {
    const name = labelFor(p);
    if (!p.route) return t('map.noRoute');
    return p.route.kind === 'fly' ? t('map.action.fly', { place: name }) : t('map.action.walk', { place: name });
  }

  function choose(p) {
    if (!p.route) { hint.textContent = t('map.noRoute'); return; }
    onRoute(p.route, p);
    close();
  }

  const hint = el(doc, 'p', { class: 'ftf-map-hint' });

  function render() {
    model = currentModel();
    const m = model;
    const g = m.geometry;
    const title = t('map.title');
    host.setAttribute('aria-label', title);
    host.classList.toggle('ftf-map-host--still', !!reducedMotion());
    // no role="img" here: the places inside are buttons and must stay in the accessibility tree
    const s = svg(doc, 'svg', { viewBox: `0 0 ${MAP_SIZE} ${MAP_SIZE}`, 'aria-label': title });
    const c = MAP_SIZE / 2;
    const defs = svg(doc, 'defs');
    defs.append(
      svg(doc, 'radialGradient', { id: 'ftf-map-sea', cx: '50%', cy: '48%', r: '70%' },
        svg(doc, 'stop', { offset: '0%', 'stop-color': '#1c2c2e' }), svg(doc, 'stop', { offset: '100%', 'stop-color': '#0a1416' })),
      svg(doc, 'radialGradient', { id: 'ftf-map-haze', cx: '50%', cy: '50%', r: '50%' },
        svg(doc, 'stop', { offset: '0%', 'stop-color': 'rgba(214,226,232,.22)' }), svg(doc, 'stop', { offset: '100%', 'stop-color': 'rgba(214,226,232,0)' })),
      svg(doc, 'radialGradient', { id: 'ftf-map-paper', cx: '38%', cy: '34%', r: '80%' },
        svg(doc, 'stop', { offset: '0%', 'stop-color': '#e6dab8' }), svg(doc, 'stop', { offset: '100%', 'stop-color': '#c9b98f' })),
      // paper grain: fine fractal noise multiplied over the parchment
      svg(doc, 'filter', { id: 'ftf-map-grain', x: '-5%', y: '-5%', width: '110%', height: '110%' },
        svg(doc, 'feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '2', seed: '7', result: 'noise' }),
        svg(doc, 'feColorMatrix', { in: 'noise', type: 'matrix', values: '0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .28 0', result: 'tint' }),
        svg(doc, 'feComposite', { in: 'tint', in2: 'SourceGraphic', operator: 'in', result: 'grain' }),
        svg(doc, 'feBlend', { in: 'grain', in2: 'SourceGraphic', mode: 'multiply' })),
      svg(doc, 'filter', { id: 'ftf-map-shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, svg(doc, 'feGaussianBlur', { stdDeviation: '2.2' })),
      svg(doc, 'filter', { id: 'ftf-map-cloud', x: '-40%', y: '-40%', width: '180%', height: '180%' }, svg(doc, 'feGaussianBlur', { stdDeviation: '9' })));
    s.append(defs,
      svg(doc, 'rect', { class: 'ftf-map-sea', x: 0, y: 0, width: MAP_SIZE, height: MAP_SIZE, rx: 14 }),
      svg(doc, 'ellipse', { class: 'ftf-map-haze', cx: c, cy: c, rx: MAP_SIZE * 0.47, ry: MAP_SIZE * 0.43 }));
    // The sea of clouds: soft banks along the edges, under the archipelago.
    const clouds = svg(doc, 'g', { class: 'ftf-map-clouds', filter: 'url(#ftf-map-cloud)' });
    for (const [cx, cy, rx, ry, o] of [[60, 150, 52, 22, .16], [345, 140, 46, 20, .14], [120, 372, 70, 18, .13], [300, 388, 60, 16, .12], [200, 28, 90, 14, .1], [386, 260, 30, 40, .1]]) {
      clouds.append(svg(doc, 'ellipse', { cx, cy, rx, ry, fill: `rgba(222,230,234,${o})` }));
    }
    s.append(clouds);
    // Drop shadows of the rock pillars, then the cliff hatching, then the walkable tops.
    const shadows = svg(doc, 'g', { filter: 'url(#ftf-map-shadow)', opacity: '.55' });
    for (const p of g.platforms) shadows.append(svg(doc, 'circle', { cx: p.center[0] + 2, cy: p.center[1] + 3.5, r: p.r + 1, fill: '#050b0c' }));
    s.append(shadows);
    const decks = svg(doc, 'g');
    for (const b of g.bridges) {
      decks.append(svg(doc, 'line', { class: 'ftf-map-bridge-ink', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1], 'stroke-width': b.width + 2.6 }));
      decks.append(svg(doc, 'line', { class: 'ftf-map-bridge', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1], 'stroke-width': b.width }));
      // railing hairline down the middle of the deck reads as the paving joint
      decks.append(svg(doc, 'line', { class: 'ftf-map-bridge-joint', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1] }));
    }
    s.append(decks);
    const discs = svg(doc, 'g', { filter: 'url(#ftf-map-grain)' });
    for (const p of g.platforms) {
      discs.append(svg(doc, 'circle', { class: 'ftf-map-cliff', cx: p.center[0], cy: p.center[1], r: p.r + 2.4 }));
      const cls = 'ftf-map-platform' + (p.id === 'plaza' ? ' ftf-map-platform--plaza' : p.id === 'balcony' ? ' ftf-map-platform--balcony' : '');
      discs.append(svg(doc, 'circle', { class: cls, cx: p.center[0], cy: p.center[1], r: p.r }));
      if (p.id !== 'plaza') discs.append(svg(doc, 'circle', { class: 'ftf-map-terrace', cx: p.center[0], cy: p.center[1], r: p.r - 2.6 }));
    }
    s.append(discs);
    // The plaza: the anchor ring, the Scroll medallion with its six clan sectors, the four anchor zones.
    const [su, sv] = g.scroll.center;
    s.append(svg(doc, 'circle', { class: 'ftf-map-ring', cx: su, cy: sv, r: g.platforms[0].r - 4 }));
    s.append(svg(doc, 'circle', { class: 'ftf-map-scroll', cx: su, cy: sv, r: g.scroll.r }));
    s.append(svg(doc, 'circle', { class: 'ftf-map-scroll', cx: su, cy: sv, r: g.scroll.r * 0.55, 'stroke-width': 1 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.append(svg(doc, 'line', { class: 'ftf-map-scroll', x1: su + Math.sin(a) * g.scroll.r * 0.55, y1: sv + Math.cos(a) * g.scroll.r * 0.55, x2: su + Math.sin(a) * g.scroll.r, y2: sv + Math.cos(a) * g.scroll.r, 'stroke-width': .8 }));
    }
    s.append(svg(doc, 'circle', { class: 'ftf-map-scroll-core', cx: su, cy: sv, r: 2.2 }));
    for (const a of g.anchors) {
      s.append(svg(doc, 'circle', { class: 'ftf-map-anchor', cx: a.center[0], cy: a.center[1], r: a.r }),
        svg(doc, 'text', { class: 'ftf-map-anchor-n', x: a.center[0], y: a.center[1] + 2.5, text: ROMAN[a.shell - 1] }));
    }
    // Shells: a coiled glyph (the ammonite silhouette of the art) on a disc that carries the hub state.
    for (const sh of g.shells) {
      const st = m.shells[sh.shell - 1];
      const grp = svg(doc, 'g');
      grp.append(svg(doc, 'circle', { class: 'ftf-map-shell-glow', cx: sh.center[0], cy: sh.center[1], r: sh.r + 6, style: st.state === 'waiting' ? '' : 'display:none' }));
      grp.append(svg(doc, 'circle', { class: 'ftf-map-shell' + (st.state === 'waiting' ? ' ftf-map-shell--waiting' : st.state === 'inside' ? ' ftf-map-shell--inside' : ''), cx: sh.center[0], cy: sh.center[1], r: sh.r }));
      grp.append(svg(doc, 'path', { class: 'ftf-map-coil' + (st.state === 'quiet' ? '' : ' ftf-map-coil--lit'), d: coilPath(sh.center[0], sh.center[1], sh.r * 0.78, sh.shell) }));
      if (st.signs) {
        grp.append(svg(doc, 'circle', { class: 'ftf-map-badge', cx: sh.center[0] + sh.r * 0.85, cy: sh.center[1] - sh.r * 0.85, r: 6.5 }),
          svg(doc, 'text', { class: 'ftf-map-badge-n', x: sh.center[0] + sh.r * 0.85, y: sh.center[1] - sh.r * 0.85, text: String(st.signs) }));
      }
      s.append(grp);
    }
    // Cartouche details: corner flourishes, a compass rose (north = -Z, the top of the map) and a 10 m scale bar.
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ox = sx > 0 ? 7 : MAP_SIZE - 7, oy = sy > 0 ? 7 : MAP_SIZE - 7;
      s.append(svg(doc, 'path', { class: 'ftf-map-flourish', d: `M${ox} ${oy + sy * 22} L${ox} ${oy} L${ox + sx * 22} ${oy} M${ox + sx * 3} ${oy + sy * 14} L${ox + sx * 3} ${oy + sy * 3} L${ox + sx * 14} ${oy + sy * 3}` }));
    }
    const rose = svg(doc, 'g', { class: 'ftf-map-rose', transform: `translate(30 ${c})` });
    rose.append(svg(doc, 'circle', { cx: 0, cy: 0, r: 11, class: 'ftf-map-rose-ring' }),
      svg(doc, 'path', { class: 'ftf-map-rose-pts', d: 'M0 -15 L3 -3 L0 0 L-3 -3 Z M0 15 L3 3 L0 0 L-3 3 Z M15 0 L3 3 L0 0 L3 -3 Z M-15 0 L-3 3 L0 0 L-3 -3 Z' }),
      svg(doc, 'path', { class: 'ftf-map-rose-n', d: 'M0 -15 L3 -3 L0 0 L-3 -3 Z' }),
      svg(doc, 'text', { class: 'ftf-map-rose-text', x: 0, y: -19, text: 'N' }));
    s.append(rose);
    const tenM = scaleLength(10);
    s.append(svg(doc, 'g', { class: 'ftf-map-scale', transform: `translate(${c - tenM / 2} ${MAP_SIZE - 14})` },
      svg(doc, 'path', { d: `M0 -3 V0 H${tenM} V-3 M${tenM / 2} 0 V-2` }), svg(doc, 'text', { x: tenM / 2, y: -5.5, text: '10 m' })));
    // Places: a hit area, a label (camps below or above their plateau, Shells in their corner of the sea), the clan colour.
    const placesG = svg(doc, 'g');
    const corner = (p) => ({ x: p.point[0] < c ? 20 : MAP_SIZE - 20, y: p.point[1] < c ? 36 : MAP_SIZE - 32, anchor: p.point[0] < c ? 'start' : 'end' });
    for (const p of m.places) {
      const [u, v] = p.point;
      const name = labelFor(p);
      const hitR = p.kind === 'shell' ? 24 : p.kind === 'camp' ? 24 : p.kind === 'balcony' ? 18 : p.kind === 'scroll' ? 16 : p.kind === 'anchor' ? 9 : 10;
      const grp = svg(doc, 'g', { class: 'ftf-map-place' + (p.route ? '' : ' ftf-map-place--off'), 'data-place': p.id, role: 'button', tabindex: 0, 'aria-label': actionText(p), 'aria-disabled': p.route ? null : 'true' });
      grp.append(svg(doc, 'title', { text: actionText(p) }));
      grp.append(svg(doc, 'circle', { class: 'ftf-map-hit', cx: u, cy: v, r: hitR }));
      if (p.kind === 'camp') grp.append(svg(doc, 'circle', { class: 'ftf-map-camp-dot', cx: u, cy: v, r: 4.5, fill: hex(p.color) }));
      if (p.kind === 'pedestal') grp.append(svg(doc, 'path', { class: 'ftf-map-gem', d: `M${u} ${v - 5} l3.5 5 -3.5 5 -3.5 -5 z` }));
      if (p.kind !== 'pedestal' && p.kind !== 'anchor') { // those two keep their tooltip only: the plaza is too small for more labels
        let lx = u, ly = v, anchor = 'middle';
        if (p.kind === 'scroll') { lx = u + g.platforms[0].r + 7; ly = v + 4; anchor = 'start'; }
        else if (p.kind === 'shell') { const k = corner(p); lx = k.x; ly = k.y; anchor = k.anchor; }
        else { const r = hitR - 2; lx = u; ly = v >= c ? v + r + 12 : v - r - 7; }
        // the stylesheet sets text-anchor: middle; an inline style wins where a label hangs to one side
        grp.append(svg(doc, 'text', { class: 'ftf-map-label' + (p.kind === 'camp' ? ' ftf-map-label--camp' : ''), x: lx, y: ly, style: `text-anchor:${anchor}`, text: name }));
        if (p.kind === 'camp') grp.append(svg(doc, 'text', { class: 'ftf-map-label ftf-map-label--sub', x: lx, y: ly + 10.5, text: t('map.camp') }));
        if (p.kind === 'shell' && p.shellState) grp.append(svg(doc, 'text', { class: 'ftf-map-label ftf-map-label--sub' + (p.shellState.state === 'quiet' ? '' : ' ftf-map-label--lit'), x: lx, y: ly + 11, style: `text-anchor:${anchor}`, text: shellCaption(p.shellState) }));
      }
      grp.addEventListener('click', () => choose(p));
      grp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); choose(p); } });
      // Route draw-on: hovering or focusing a walkable place draws the walk from Iris along the island's graph.
      grp.addEventListener('pointerenter', () => showRoute(p));
      grp.addEventListener('focus', () => showRoute(p));
      grp.addEventListener('pointerleave', hideRoute);
      grp.addEventListener('blur', hideRoute);
      placesG.append(grp);
    }
    s.append(placesG);
    dynamic = svg(doc, 'g', { class: 'ftf-map-dynamic', 'aria-hidden': 'true' });
    s.append(dynamic);
    drawDynamic(m);

    const legendItem = (shape, text) => el(doc, 'li', {}, shape, el(doc, 'span', { text }));
    const lg = (fn) => { const i = svg(doc, 'svg', { viewBox: '0 0 14 14' }); fn(i); return i; };
    const legend = el(doc, 'ul', { class: 'ftf-map-legend' },
      legendItem(lg((i) => i.append(svg(doc, 'path', { class: 'ftf-map-iris', d: 'M7 1.5 11 12 7 9.5 3 12z' }))), t('map.you')),
      legendItem(lg((i) => i.append(svg(doc, 'path', { class: 'ftf-map-goal', style: 'animation:none', d: 'M7 1.5 12.5 7 7 12.5 1.5 7z' }))), t('map.goal')),
      legendItem(lg((i) => i.append(svg(doc, 'circle', { class: 'ftf-map-shell ftf-map-shell--waiting', style: 'filter:none', cx: 7, cy: 7, r: 5.5 }))), t('map.legend.waiting')),
      legendItem(lg((i) => i.append(svg(doc, 'circle', { class: 'ftf-map-shell', cx: 7, cy: 7, r: 5.5 }))), t('map.legend.quiet')),
      legendItem(lg((i) => i.append(svg(doc, 'circle', { class: 'ftf-map-agent', cx: 7, cy: 7, r: 4, fill: '#9fc4d6' }))), t('map.agents')));
    hint.textContent = t(hub ? 'map.hint.hub' : 'map.hint');
    const closeBtn = el(doc, 'button', { class: 'ftf-map-close', type: 'button', onclick: () => close() }, el(doc, 'kbd', { text: 'Esc' }), t('map.close'));
    panel.replaceChildren(
      el(doc, 'header', {}, el(doc, 'div', {}, el(doc, 'div', { class: 'ftf-map-eyebrow', text: t('map.eyebrow') }), el(doc, 'h2', { text: title })), closeBtn),
      el(doc, 'div', { class: 'ftf-map-canvas' }, s),
      legend, hint);
  }

  let routeEl = null;
  function hideRoute() { if (routeEl) { routeEl.remove(); routeEl = null; } }
  function showRoute(p) {
    hideRoute();
    if (!model || !p.route || p.route.kind !== 'walk' || !dynamic) return;
    const st = getState ? getState() : {};
    const from = st.playerPos; if (!from) return;
    const place = p.route.place || p.route.to || p.id;
    let pts = null;
    try { pts = planRoute([from[0], 0, from[2]], place); } catch { pts = null; }
    if (!pts || pts.length < 1) return;
    const all = [project(from), ...pts.map(([x, z]) => project([x, 0, z]))];
    routeEl = svg(doc, 'polyline', { class: 'ftf-map-route', points: all.map(([u, v]) => `${u},${v}`).join(' ') });
    dynamic.insertBefore(routeEl, dynamic.firstChild);
    let len = 0; for (let i = 1; i < all.length; i++) len += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
    drawOn(routeEl, len);
  }

  /** The parchment unfolds: places arrive in a stagger ordered by their distance from Iris, markers pop in. */
  function revealPlaces(m) {
    const groups = [...panel.querySelectorAll('.ftf-map-place')];
    const here = m.iris ? m.iris.point : [MAP_SIZE / 2, MAP_SIZE / 2];
    const dist = (g) => { const pl = m.places.find((p) => p.id === g.getAttribute('data-place')); return pl ? Math.hypot(pl.point[0] - here[0], pl.point[1] - here[1]) : 1e9; };
    groups.sort((a, b) => dist(a) - dist(b));
    stagger(groups, { from: 'fade', duration: MOTION.duration.base, delay: 120, step: 25, cap: 260 });
    if (dynamic) stagger([...dynamic.children].filter((c) => c !== routeEl), { from: 'pop', duration: MOTION.duration.slow, delay: 200, step: 40, cap: 200 });
  }

  /** Markers that move: the other agents, the goal, Iris. */
  function drawDynamic(m) {
    if (!dynamic) return;
    dynamic.replaceChildren();
    for (const a of m.agents) {
      const g = svg(doc, 'g');
      g.append(svg(doc, 'title', { text: i18n.t('agent.' + a.clan) }));
      g.append(svg(doc, 'circle', { class: 'ftf-map-agent', cx: a.point[0], cy: a.point[1], r: 4, fill: hex(a.color) }));
      dynamic.append(g);
    }
    if (m.goal) {
      const [u, v] = m.goal.point;
      dynamic.append(svg(doc, 'path', { class: 'ftf-map-goal', d: `M${u} ${v - 11} l11 11 -11 11 -11 -11 z` }));
      dynamic.append(svg(doc, 'circle', { class: 'ftf-map-goal-core', cx: u, cy: v, r: 2.2 }));
    }
    if (m.iris) {
      const [u, v] = m.iris.point;
      if (m.iris.angle == null) dynamic.append(svg(doc, 'circle', { class: 'ftf-map-iris-ring', cx: u, cy: v, r: 11 }));
      else {
        dynamic.append(svg(doc, 'circle', { class: 'ftf-map-iris-halo', cx: u, cy: v, r: 11 }));
        dynamic.append(svg(doc, 'path', { class: 'ftf-map-iris', d: 'M0 -9 L6.5 7 L0 3.2 L-6.5 7 Z', transform: `translate(${u} ${v}) rotate(${m.iris.angle})` }));
      }
    }
  }

  function openPanel() {
    if (open) return;
    onOpen();
    open = true;
    lastFocus = doc.activeElement;
    render();
    host.hidden = false;
    scrim.style.opacity = ''; panel.style.opacity = '';
    doc.body.classList.add('ftf-map-open');
    // Unfold (docs/motion.md): the scrim fades, the parchment scales up from 0.96 and rises, then the places and markers arrive.
    enter(scrim, { from: 'fade', duration: MOTION.duration.fast });
    enter(panel, { from: 'scale', duration: MOTION.duration.slow });
    revealPlaces(model);
    const btn = panel.querySelector('.ftf-map-close');
    if (btn) btn.focus({ preventScroll: true });
  }
  let closing = 0;
  function close() {
    if (!open) return;
    open = false;
    hideRoute();
    const token = ++closing;
    Promise.all([exit(panel, { to: 'scale', duration: MOTION.duration.fast }), exit(scrim, { to: 'fade', duration: MOTION.duration.fast })])
      .then(() => { if (token === closing && !open) { host.hidden = true; panel.style.opacity = ''; scrim.style.opacity = ''; } });
    doc.body.classList.remove('ftf-map-open');
    if (lastFocus && lastFocus.focus && doc.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch { /* fine */ } }
    lastFocus = null;
  }
  function toggle() { if (open) close(); else openPanel(); }
  /** N from either path (own listener below, or PLAY_KEYS → handleKey) toggles once. */
  function toggleFromKey() {
    const now = (win && win.performance ? win.performance.now() : Date.now());
    if (now - lastKey < KEY_DEDUPE_MS) return true;
    lastKey = now;
    toggle();
    return true;
  }

  const offs = [
    session.on('obs', () => { if (open) render(); }),
    session.on('goal', () => { if (open) render(); }),
    i18n.subscribe(() => { if (open) render(); }),
  ];

  return {
    open: openPanel, close, toggle,
    isOpen: () => open,
    /** Keys while in the world: N toggles, Escape closes when open. Returns true when used. */
    handleKey(code) {
      if (code === 'KeyN') return toggleFromKey();
      if (code === 'Escape' && open) { close(); return true; }
      return false;
    },
    /** Per frame from the play layer: refreshes the moving markers a few times a second while open. */
    update(dt) {
      if (!open) return;
      acc += dt;
      if (acc < REFRESH) return;
      acc = 0;
      drawDynamic(currentModel());
    },
    /** The last rendered view model (tests and the dev console). */
    get model() { return model; },
    element: host,
    destroy() { offs.forEach((f) => f()); close(); host.remove(); if (fab) fab.remove(); },
  };
}
