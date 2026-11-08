// The island map panel (key N, the hotbar "Map" button, a round tap target on phones): a stylized
// top-down drawing of the archipelago from play/map.js in the world HUD's parchment, ink and gold
// (docs/ui-world-hud.md tokens through .wh-root). Clicking a place walks there over the room's walk
// graph; in the Shell hub clicking a Shell flies into it. Self-contained: its own styles, its own
// DOM under the play UI root, no three.js. Only one panel is open at a time: opening the map asks
// the host to close the others (onOpen), and the host closes the map when another panel opens.
import { renderMsg } from './i18n.js';
import { buildMapModel, MAP_SIZE, ROMAN } from './map.js';

const SVG = 'http://www.w3.org/2000/svg';
const REFRESH = 0.2;        // seconds between marker refreshes while open
const KEY_DEDUPE_MS = 400;  // N arrives twice while input.js also forwards it (own listener + PLAY_KEYS)

const CSS = `
.ftf-map-host { position: fixed; inset: 0; z-index: 5; pointer-events: auto; display: grid; place-items: center; padding: 16px; overflow: hidden; }
.ftf-map-host[hidden] { display: none; }
.ftf-map-scrim { position: absolute; inset: 0; background: var(--wh-scrim, rgba(0,0,0,.35)); }
.ftf-map { position: relative; width: min(560px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 12px;
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
.ftf-map-canvas { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: min(70vh, 560px); margin: 0 auto; }
.ftf-map-canvas svg { display: block; width: 100%; height: 100%; overflow: visible; font-family: var(--wh-font, Georgia, serif); }
.ftf-map-sea { fill: url(#ftf-map-sea); }
.ftf-map-haze { fill: url(#ftf-map-haze); }
.ftf-map-bridge { stroke: #b9a87f; stroke-linecap: round; }
.ftf-map-bridge-ink { stroke: #4a3f2a; stroke-linecap: round; }
.ftf-map-platform { fill: #d7c9a2; stroke: #4a3f2a; stroke-width: 1.2; }
.ftf-map-platform--plaza { fill: #e3d8b8; }
.ftf-map-platform--balcony { fill: #cfc39e; }
.ftf-map-ring { fill: none; stroke: #8a7a52; stroke-width: .8; stroke-dasharray: 2 3; }
.ftf-map-scroll { fill: none; stroke: var(--wh-gold-deep, #b48d3c); stroke-width: 1.6; }
.ftf-map-anchor { fill: rgba(228,194,114,.18); stroke: var(--wh-gold-deep, #b48d3c); stroke-width: 1; }
.ftf-map-anchor-n { font: 400 7px/1 var(--wh-font, Georgia, serif); fill: #4a3f2a; text-anchor: middle; pointer-events: none; }
.ftf-map-shell { fill: rgba(250,247,238,.08); stroke: var(--wh-frame-soft, rgba(196,186,156,.45)); stroke-width: 1.2; stroke-dasharray: 3 2.5; }
.ftf-map-shell--waiting { fill: rgba(228,194,114,.28); stroke: var(--wh-gold, #e4c272); stroke-dasharray: none; filter: drop-shadow(0 0 5px rgba(255,205,120,.55)); }
.ftf-map-shell--inside { fill: rgba(250,247,238,.18); stroke: var(--wh-gold-bright, #fbe6a6); stroke-width: 2; stroke-dasharray: none; }
.ftf-map-shell-n { font: 400 13px/1 var(--wh-font, Georgia, serif); fill: var(--wh-text, #faf7ee); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.ftf-map-badge { fill: var(--wh-gold, #e4c272); }
.ftf-map-badge-n { font: 700 8px/1 var(--wh-font-body, system-ui, sans-serif); fill: #2a2112; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.ftf-map-place { cursor: pointer; outline: none; }
.ftf-map-place--off { cursor: default; opacity: .7; }
.ftf-map-hit { fill: transparent; stroke: transparent; stroke-width: 1.5; transition: stroke 160ms ease, fill 160ms ease; }
.ftf-map-place:hover .ftf-map-hit, .ftf-map-place:focus-visible .ftf-map-hit { fill: rgba(228,194,114,.16); stroke: var(--wh-gold-bright, #fbe6a6); }
.ftf-map-label { font: 400 13px/1 var(--wh-font, Georgia, serif); fill: var(--wh-text, #faf7ee); paint-order: stroke; stroke: rgba(8,18,21,.9); stroke-width: 3px; stroke-linejoin: round; text-anchor: middle; pointer-events: none; }
.ftf-map-label--sub { font: 500 8.5px/1 var(--wh-font-body, system-ui, sans-serif); fill: var(--wh-text-muted, #c9c6b8); letter-spacing: .06em; text-transform: uppercase; }
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
.ftf-map-legend li { display: inline-flex; align-items: center; gap: 6px; }
.ftf-map-legend svg { width: 14px; height: 14px; flex: none; }
.ftf-map-hint { margin: 0; font: var(--wh-font-body-weight, 500) 12.5px/1.35 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.ftf-map-fab { position: fixed; left: calc(8px + env(safe-area-inset-left, 0px)); bottom: calc(96px + env(safe-area-inset-bottom, 0px)); z-index: 4; display: none; width: 48px; height: 48px;
  align-items: center; justify-content: center; border-radius: 50%; color: var(--wh-gold, #e4c272); background: rgba(10,22,23,.78); border: 1px solid rgba(232,214,172,.6); box-shadow: 0 4px 14px rgba(0,0,0,.35); cursor: pointer; pointer-events: auto; }
.ftf-map-fab svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
@media (pointer: coarse) { body.in-world .ftf-map-fab { display: flex; } }
body.ftf-map-open .ftf-map-fab { display: none !important; }
/* only one panel at a time: while the map is open the dock, the reading card and the spot menu wait underneath the scrim */
body.ftf-map-open .hub-dock, body.ftf-map-open .hub-read, body.ftf-map-open .pl-context, body.ftf-map-open #prompt, body.ftf-map-open .ftf-scene-cue { visibility: hidden; }
@media (max-width: 700px) {
  .ftf-map-host { padding: 8px; }
  .ftf-map { padding: 10px 12px 10px; gap: 8px; }
  .ftf-map h2 { font-size: 17px; }
  .ftf-map-canvas { max-height: min(62vh, 100vw); }
  .ftf-map-legend { font-size: 11px; gap: 4px 10px; }
  .ftf-map-hint { font-size: 11.5px; }
}
@media (prefers-reduced-motion: reduce) { .ftf-map-goal { animation: none; } .ftf-map-hit { transition: none; } }
html[data-motion="reduce"] .ftf-map-goal { animation: none; }
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
const isTyping = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

/**
 * @param {object} o
 * @param {HTMLElement} o.root play UI root (#ui) @param {object} o.ctx play context (i18n)
 * @param {object} o.session PlaySession @param {boolean} [o.hub] Shell hub mode
 * @param {() => {playerPos: number[], heading: number, zone: string, agents: {clan: string, position: number[]}[]}} o.getState
 * @param {(route: {kind: 'walk', place: string} | {kind: 'fly', shell: number}, place: object) => void} o.onRoute
 * @param {() => void} [o.onOpen] called before the map shows, so the host can close its other panels
 * @param {boolean} [o.phoneButton=true] the round tap target on coarse pointers (Task F may replace it with the hotbar)
 */
export function createMapPanel({ root, ctx, session, hub = false, getState, onRoute, onOpen = () => {}, phoneButton = true }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const win = doc.defaultView;
  const t = (k, a) => renderMsg(i18n, k, a);
  if (!doc.getElementById('ftf-map-style')) doc.head.append(el(doc, 'style', { id: 'ftf-map-style', text: CSS }));

  const host = el(doc, 'div', { class: 'wh-root ftf-map-host', role: 'dialog', 'aria-modal': 'true', hidden: true });
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
    const s = svg(doc, 'svg', { viewBox: `0 0 ${MAP_SIZE} ${MAP_SIZE}`, role: 'img', 'aria-label': title });
    const defs = svg(doc, 'defs');
    const sea = svg(doc, 'radialGradient', { id: 'ftf-map-sea', cx: '50%', cy: '48%', r: '70%' },
      svg(doc, 'stop', { offset: '0%', 'stop-color': '#1b2a2c' }), svg(doc, 'stop', { offset: '100%', 'stop-color': '#0a1416' }));
    const haze = svg(doc, 'radialGradient', { id: 'ftf-map-haze', cx: '50%', cy: '50%', r: '50%' },
      svg(doc, 'stop', { offset: '0%', 'stop-color': 'rgba(214,226,232,.26)' }), svg(doc, 'stop', { offset: '100%', 'stop-color': 'rgba(214,226,232,0)' }));
    defs.append(sea, haze);
    s.append(defs,
      svg(doc, 'rect', { class: 'ftf-map-sea', x: 0, y: 0, width: MAP_SIZE, height: MAP_SIZE, rx: 14 }),
      svg(doc, 'ellipse', { class: 'ftf-map-haze', cx: MAP_SIZE / 2, cy: MAP_SIZE / 2, rx: MAP_SIZE * 0.46, ry: MAP_SIZE * 0.42 }));
    // Bridges (ink edge under a parchment deck), then the walkable discs on top.
    const decks = svg(doc, 'g');
    for (const b of g.bridges) {
      decks.append(svg(doc, 'line', { class: 'ftf-map-bridge-ink', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1], 'stroke-width': b.width + 2.4 }));
      decks.append(svg(doc, 'line', { class: 'ftf-map-bridge', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1], 'stroke-width': b.width }));
    }
    s.append(decks);
    const discs = svg(doc, 'g');
    for (const p of g.platforms) {
      const cls = 'ftf-map-platform' + (p.id === 'plaza' ? ' ftf-map-platform--plaza' : p.id === 'balcony' ? ' ftf-map-platform--balcony' : '');
      discs.append(svg(doc, 'circle', { class: cls, cx: p.center[0], cy: p.center[1], r: p.r }));
    }
    s.append(discs);
    // The plaza: the Scroll medallion and the four anchor zones with their Shell numerals.
    s.append(svg(doc, 'circle', { class: 'ftf-map-ring', cx: g.scroll.center[0], cy: g.scroll.center[1], r: g.platforms[0].r - 4 }));
    s.append(svg(doc, 'circle', { class: 'ftf-map-scroll', cx: g.scroll.center[0], cy: g.scroll.center[1], r: g.scroll.r }));
    s.append(svg(doc, 'circle', { class: 'ftf-map-scroll', cx: g.scroll.center[0], cy: g.scroll.center[1], r: g.scroll.r * 0.45, 'stroke-width': 1 }));
    for (const a of g.anchors) {
      s.append(svg(doc, 'circle', { class: 'ftf-map-anchor', cx: a.center[0], cy: a.center[1], r: a.r }),
        svg(doc, 'text', { class: 'ftf-map-anchor-n', x: a.center[0], y: a.center[1] + 2.5, text: ROMAN[a.shell - 1] }));
    }
    // Shells: state from the hub (quiet / waiting with a count / inside).
    for (const sh of g.shells) {
      const st = m.shells[sh.shell - 1];
      const grp = svg(doc, 'g');
      grp.append(svg(doc, 'circle', { class: 'ftf-map-shell' + (st.state === 'waiting' ? ' ftf-map-shell--waiting' : st.state === 'inside' ? ' ftf-map-shell--inside' : ''), cx: sh.center[0], cy: sh.center[1], r: sh.r }));
      grp.append(svg(doc, 'text', { class: 'ftf-map-shell-n', x: sh.center[0], y: sh.center[1], text: ROMAN[sh.shell - 1] }));
      if (st.signs) {
        grp.append(svg(doc, 'circle', { class: 'ftf-map-badge', cx: sh.center[0] + sh.r * 0.8, cy: sh.center[1] - sh.r * 0.8, r: 6.5 }),
          svg(doc, 'text', { class: 'ftf-map-badge-n', x: sh.center[0] + sh.r * 0.8, y: sh.center[1] - sh.r * 0.8, text: String(st.signs) }));
      }
      s.append(grp);
    }
    // Places: a hit area, a label placed away from the island centre, the camp's clan colour.
    const placesG = svg(doc, 'g');
    const c = MAP_SIZE / 2;
    for (const p of m.places) {
      const [u, v] = p.point;
      const dx = u - c, dy = v - c, len = Math.hypot(dx, dy) || 1;
      const outward = [dx / len, dy / len];
      const name = labelFor(p);
      const hitR = p.kind === 'shell' ? 24 : p.kind === 'camp' ? 24 : p.kind === 'balcony' ? 18 : p.kind === 'scroll' ? 16 : p.kind === 'anchor' ? 9 : 10;
      const grp = svg(doc, 'g', { class: 'ftf-map-place' + (p.route ? '' : ' ftf-map-place--off'), 'data-place': p.id, role: 'button', tabindex: 0, 'aria-label': actionText(p), 'aria-disabled': p.route ? null : 'true' });
      grp.append(svg(doc, 'title', { text: actionText(p) }));
      grp.append(svg(doc, 'circle', { class: 'ftf-map-hit', cx: u, cy: v, r: hitR }));
      if (p.kind === 'camp') grp.append(svg(doc, 'circle', { class: 'ftf-map-camp-dot', cx: u, cy: v, r: 4.5, fill: hex(p.color) }));
      if (p.kind === 'pedestal') grp.append(svg(doc, 'path', { class: 'ftf-map-gem', d: `M${u} ${v - 5} l3.5 5 -3.5 5 -3.5 -5 z` }));
      if (p.kind !== 'pedestal' && p.kind !== 'anchor') { // those two keep their tooltip only: the plaza is too small for more labels
        let lx = u, ly = v, anchor = 'middle';
        if (p.kind === 'scroll') { lx = u + g.platforms[0].r + 6; ly = v + 4; anchor = 'start'; }
        else if (p.kind === 'shell') { lx = u + outward[0] * (hitR + 2); ly = v + outward[1] * (hitR + 4) + (outward[1] > 0 ? 8 : -2); anchor = outward[0] > 0.2 ? 'start' : outward[0] < -0.2 ? 'end' : 'middle'; }
        else { const r = hitR - 2; lx = u; ly = outward[1] >= 0 ? v + r + 12 : v - r - 6; }
        const label = svg(doc, 'text', { class: 'ftf-map-label' + (p.kind === 'camp' ? ' ftf-map-label--camp' : ''), x: lx, y: ly, text: name });
        label.setAttribute('text-anchor', anchor);
        grp.append(label);
        if (p.kind === 'camp') grp.append(svg(doc, 'text', { class: 'ftf-map-label ftf-map-label--sub', x: lx, y: ly + 10, text: t('map.camp') }));
        if (p.kind === 'shell' && p.shellState) grp.append(svg(doc, 'text', { class: 'ftf-map-label ftf-map-label--sub', x: lx, y: ly + 10, 'text-anchor': anchor, text: shellCaption(p.shellState) }));
      }
      grp.addEventListener('click', () => choose(p));
      grp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); choose(p); } });
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
    doc.body.classList.add('ftf-map-open');
    const btn = panel.querySelector('.ftf-map-close');
    if (btn) btn.focus({ preventScroll: true });
  }
  function close() {
    if (!open) return;
    open = false;
    host.hidden = true;
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

  // Until input.js forwards KeyN (request to Task G in docs/collab-requests.md), the panel listens itself.
  function onKeyDown(e) {
    if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isTyping(e.target) || !doc.body.classList.contains('in-world') || doc.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggleFromKey();
  }
  if (win) win.addEventListener('keydown', onKeyDown);

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
    destroy() { offs.forEach((f) => f()); if (win) win.removeEventListener('keydown', onKeyDown); close(); host.remove(); if (fab) fab.remove(); },
  };
}
