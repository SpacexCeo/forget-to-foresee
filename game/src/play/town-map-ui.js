// The town map window (M, the tray Map): the painted map with the places, the quest marks over the townsfolk,
// Iris with her facing, a legend, zoom (buttons, the wheel) and a drag to pan. An open <dialog>, so the world keys and
// the mouse aim wait while it shows; M, Esc, × or a click on the dark around it close it. Desktop and phone.
import { toMap, headingDeg, onTownMap, MAP_PLACES, MAP_DECOR, MAP_LEGEND, zoomStep } from './town-map.js';

const CSS = `
.tm-wrap { position: fixed; inset: 0; z-index: calc(var(--z-modal, 40) + 2); width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 12px; box-sizing: border-box; border: 0;
  display: flex; align-items: center; justify-content: center; gap: 14px; background: rgba(4, 7, 7, .78); color: #f3ead8; font: 14px/1.4 var(--font-ui, system-ui, sans-serif); }
.tm-frame { position: relative; width: min(calc(100vh - 24px), calc(100vw - 260px)); aspect-ratio: 1; border-radius: 14px; overflow: hidden; border: 1px solid rgba(217, 178, 106, .6);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .55); background: #d8c79a; touch-action: none; cursor: grab; }
.tm-frame.tm-drag { cursor: grabbing; }
.tm-layer { position: absolute; inset: 0; transform-origin: 0 0; }
.tm-layer img.tm-img { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; pointer-events: none; }
.tm-mark { position: absolute; transform: translate(-50%, -100%) scale(var(--tm-inv, 1)); transform-origin: 50% 100%; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.tm-mark img { width: 26px; height: auto; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .6)); }
.tm-mark b { margin-top: 1px; padding: 1px 6px; border-radius: 6px; background: rgba(18, 22, 20, .78); color: #f6ecd2; font: 600 11px/1.3 var(--font-ui, system-ui, sans-serif); white-space: nowrap; }
.tm-mark.tm-decor b { background: rgba(70, 52, 24, .55); font-style: italic; }
.tm-mark.tm-q img { width: 22px; }
.tm-mark.tm-q { animation: tm-bob 1.6s ease-in-out infinite; }
.tm-iris { position: absolute; width: 0; height: 0; transform: scale(var(--tm-inv, 1)); pointer-events: none; }
.tm-iris i { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: #2fc4b2; border: 2px solid #fff; box-shadow: 0 0 0 3px rgba(47, 196, 178, .35), 0 2px 6px rgba(0, 0, 0, .6); }
.tm-iris s { position: absolute; left: -7px; top: -30px; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 16px solid #fff; transform-origin: 7px 30px; text-decoration: none; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .7)); }
.tm-side { width: 220px; max-height: calc(100vh - 24px); overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.tm-side h2 { margin: 0; font: 600 20px/1.2 "Libre Caslon Text", Georgia, serif; color: #fff6dc; }
.tm-side p { margin: 0; color: rgba(243, 234, 216, .7); font-size: 13px; }
.tm-legend { list-style: none; margin: 0; padding: 10px; display: grid; gap: 6px; border-radius: 10px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(217, 178, 106, .25); }
.tm-legend li { display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 8px; }
.tm-legend img { width: 18px; height: auto; justify-self: center; }
.tm-legend .tm-dot { width: 14px; height: 14px; border-radius: 50%; background: #2fc4b2; border: 2px solid #fff; justify-self: center; box-sizing: border-box; }
.tm-tools { display: flex; gap: 6px; }
.tm-tools button, .tm-x { min-width: 44px; min-height: 44px; border-radius: 10px; border: 1px solid rgba(243, 234, 216, .35); background: rgba(217, 178, 106, .14); color: inherit; font: 600 16px system-ui; cursor: pointer; }
.tm-tools button:hover, .tm-x:hover { background: rgba(217, 178, 106, .28); }
.tm-tools button:focus-visible, .tm-x:focus-visible { outline: 2px solid #fbe6a6; outline-offset: 2px; }
.tm-x { position: absolute; right: 8px; top: 8px; z-index: 2; background: rgba(12, 16, 18, .7); }
.tm-out { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); padding: 4px 10px; border-radius: 8px; background: rgba(12, 16, 18, .8); font-size: 12px; z-index: 2; }
.tm-out[hidden] { display: none; }
@keyframes tm-bob { 50% { margin-top: -3px; } }
@media (prefers-reduced-motion: reduce) { .tm-mark.tm-q { animation: none; } }
@media (max-width: 760px) {
  .tm-wrap { flex-direction: column; padding: 8px; gap: 8px; }
  .tm-frame { width: min(calc(100vw - 16px), calc(100vh - 190px)); }
  .tm-side { width: min(calc(100vw - 16px), 520px); max-height: 170px; }
  .tm-legend { grid-template-columns: repeat(3, 1fr); }
  .tm-side p { display: none; }
}
`;

/**
 * Opens the map. Returns {close, refresh, root}.
 * @param {object} o
 * @param {(k: string, a?: object) => string} o.t
 * @param {() => {pos: number[], heading: number}} o.iris her town-local position and heading
 * @param {() => Array<{key: string, sym: '!'|'?', pos: number[]}>} o.quests quest marks: town-local positions
 * @param {string} [o.base] @param {() => void} [o.onClose] @param {boolean} [o.big] the 2048 picture (desktop)
 */
export function openTownMap({ t, iris, quests = () => [], base = '/', onClose = null, big = true, doc = globalThis.document, win = globalThis }) {
  if (!doc.getElementById('tm-css')) { const st = doc.createElement('style'); st.id = 'tm-css'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const img = (badge) => { const i = el('img'); i.alt = ''; i.decoding = 'async'; i.src = `${base}assets/ui/map/mark_${badge}.webp`; return i; };
  const wrap = el('dialog', 'tm-wrap'); wrap.setAttribute('open', ''); wrap.setAttribute('aria-label', t('tmap.title'));
  const frame = el('div', 'tm-frame'), layer = el('div', 'tm-layer');
  const pic = el('img', 'tm-img'); pic.alt = t('tmap.title'); pic.src = `${base}assets/ui/map/town_map_${big ? 2048 : 1024}.webp`;
  layer.append(pic); frame.append(layer);
  const place = (cls, uv) => { const m = el('div', 'tm-mark ' + cls); m.style.left = (uv[0] * 100).toFixed(2) + '%'; m.style.top = (uv[1] * 100).toFixed(2) + '%'; layer.append(m); return m; };
  for (const p of MAP_PLACES) { const m = place('tm-place', toMap(p.at, { clamp: true })); if (p.badge) m.append(img(p.badge)); m.append(el('b', null, t('tmap.place.' + p.id))); }
  for (const d of MAP_DECOR) place('tm-decor', d.uv).append(el('b', null, t('tmap.place.' + d.id)));
  const questLayer = el('div'); layer.append(questLayer);
  const me = el('div', 'tm-iris'); const dot = el('i'), arrow = el('s'); me.append(arrow, dot); layer.append(me);
  const out = el('div', 'tm-out', t('tmap.outside')); out.hidden = true; frame.append(out);
  const x = el('button', 'tm-x', '×'); x.type = 'button'; x.setAttribute('aria-label', t('tmap.close')); frame.append(x);

  const side = el('div', 'tm-side');
  side.append(el('h2', null, t('tmap.title')), el('p', null, t('tmap.hint')));
  const tools = el('div', 'tm-tools');
  const zin = el('button', null, '+'), zout = el('button', null, '−'), zre = el('button', null, '⟲');
  for (const [b, k] of [[zin, 'tmap.zoomIn'], [zout, 'tmap.zoomOut'], [zre, 'tmap.reset']]) { b.type = 'button'; b.setAttribute('aria-label', t(k)); b.title = t(k); tools.append(b); }
  side.append(tools);
  const legend = el('ul', 'tm-legend'); legend.setAttribute('aria-label', t('tmap.legend'));
  for (const [id, badge] of MAP_LEGEND) { const li = el('li'); li.append(badge ? img(badge) : el('span', 'tm-dot'), el('span', null, t('tmap.key.' + id))); legend.append(li); }
  side.append(legend);
  wrap.append(frame, side);

  // ---- zoom and pan: the layer is scaled about the frame's corner; marks keep their screen size (--tm-inv)
  let zoom = 1, panX = 0, panY = 0;
  const size = () => frame.getBoundingClientRect().width || 1;
  const clampPan = () => { const s = size(), lim = s * (zoom - 1); panX = Math.min(0, Math.max(-lim, panX)); panY = Math.min(0, Math.max(-lim, panY)); };
  const apply = () => { clampPan(); layer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; layer.style.setProperty('--tm-inv', String(1 / zoom)); };
  const zoomAt = (dir, cx, cy) => { const z0 = zoom; zoom = zoomStep(zoom, dir); if (zoom === z0) return; const k = zoom / z0; panX = cx - (cx - panX) * k; panY = cy - (cy - panY) * k; apply(); };
  const centre = () => { const s = size(); return [s / 2, s / 2]; };
  zin.addEventListener('click', () => zoomAt(1, ...centre()));
  zout.addEventListener('click', () => zoomAt(-1, ...centre()));
  zre.addEventListener('click', () => { zoom = 1; panX = panY = 0; apply(); });
  frame.addEventListener('wheel', (e) => { e.preventDefault(); const r = frame.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  frame.addEventListener('pointerdown', (e) => { if (e.target === x) return; drag = { x: e.clientX, y: e.clientY, px: panX, py: panY, id: e.pointerId }; frame.classList.add('tm-drag'); try { frame.setPointerCapture(e.pointerId); } catch { /* */ } });
  frame.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; panX = drag.px + e.clientX - drag.x; panY = drag.py + e.clientY - drag.y; apply(); });
  const endDrag = () => { drag = null; frame.classList.remove('tm-drag'); };
  frame.addEventListener('pointerup', endDrag); frame.addEventListener('pointercancel', endDrag);

  // ---- live marks
  function refresh() {
    const q = quests() || [];
    questLayer.replaceChildren(...q.filter((m) => m.pos && onTownMap(m.pos)).map((m) => {
      const k = el('div', 'tm-mark tm-q'); const uv = toMap(m.pos, { clamp: true });
      k.style.left = (uv[0] * 100).toFixed(2) + '%'; k.style.top = (uv[1] * 100).toFixed(2) + '%';
      k.append(img(m.sym === '?' ? 'quest_turnin' : 'quest_offer')); if (m.name) k.append(el('b', null, m.name)); return k;
    }));
    const her = iris(); if (!her || !her.pos) return;
    const inside = onTownMap(her.pos), uv = toMap(her.pos, { clamp: true });
    me.style.left = (uv[0] * 100).toFixed(2) + '%'; me.style.top = (uv[1] * 100).toFixed(2) + '%';
    arrow.style.transform = `rotate(${headingDeg(her.heading || 0).toFixed(1)}deg)`;
    out.hidden = inside;
  }
  refresh(); apply();
  const timer = setInterval(refresh, 250);

  let closed = false;
  const close = () => {
    if (closed) return; closed = true; clearInterval(timer);
    doc.removeEventListener('keydown', onKey, true); wrap.remove(); if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' || e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1, ...centre()); } else if (e.key === '-') { e.preventDefault(); zoomAt(-1, ...centre()); }
    e.stopPropagation();
  };
  x.addEventListener('click', close);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  doc.addEventListener('keydown', onKey, true);
  doc.body.append(wrap);
  try { x.focus({ preventScroll: true }); } catch { /* */ }
  void win;
  return { root: wrap, close, refresh, get zoom() { return zoom; } };
}
