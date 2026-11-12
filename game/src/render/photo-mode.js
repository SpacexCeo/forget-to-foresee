// Photo mode (feature 9): P (or the camera button) freezes Iris, hides every overlay but the picture, frees the
// orbit camera (drag or arrows to orbit, wheel to zoom, wider limits than play), offers three looks on top of the
// render and saves the frame as a PNG on click. The look is a CSS filter on the canvas while shooting and the same
// filter on a 2D copy when saving, so what you see is what you get. The copy is taken right after the frame renders
// (requestCapture → the frame loop calls capture()), so the WebGL canvas needs no preserveDrawingBuffer.
import { cue } from '../audio/town-audio.js';

export const PHOTO_FILTERS = Object.freeze([
  { id: 'none', css: 'none' },
  { id: 'film', css: 'sepia(0.55) saturate(1.15) contrast(1.12) brightness(1.02)' },
  { id: 'mono', css: 'grayscale(1) contrast(1.18) brightness(1.02)' },
  { id: 'dusk', css: 'hue-rotate(-14deg) saturate(1.35) contrast(1.06) brightness(0.94)' },
]);

/** Camera limits while shooting: closer, further and lower than play. */
export const PHOTO_CAMERA = Object.freeze({ minDist: 2.2, maxDist: 60, minPitch: -0.12 });

/** The file name of a saved frame (local time, sortable). */
export function photoFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `forget-to-foresee-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

const CAMERA_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 4.5 7.6 6.5H4.5A1.5 1.5 0 0 0 3 8v10a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V8a1.5 1.5 0 0 0-1.5-1.5h-3.1L15 4.5H9Zm3 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 1.8a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z"/></svg>';

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas the WebGL canvas @param {object} o.i18n
 * @param {object} [o.rig] the camera rig (limits widened while shooting, restored after)
 * @param {(on: boolean) => void} [o.onChange] @param {Document} [o.doc]
 * @param {(blob: Blob, name: string) => void} [o.save] defaults to a download link
 * @param {boolean} [o.coarse] a touch screen: the hint speaks of drag and pinch
 */
export function createPhotoMode({ canvas, i18n, rig = null, onChange = () => {}, doc = globalThis.document, save = null, coarse = false }) {
  const t = (k) => i18n.t(k);
  /** hidden + display: the inline display below would otherwise beat the hidden attribute */
  const showEl = (e, on, display) => { e.hidden = !on; e.style.display = on ? display : 'none'; };
  const state = { on: false, filter: 0, pending: false, hidden: [], saved: null };
  let available = false; // the town on foot shows the button (setAvailable)
  const btn = (cls, label, onclick) => { const b = doc.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); onclick(); }); b.addEventListener('pointerdown', (e) => e.stopPropagation()); return b; };

  const open = btn('ftf-photo-open', '', () => toggle());
  open.innerHTML = CAMERA_SVG; open.title = t('photo.open'); open.setAttribute('aria-label', t('photo.open'));
  open.style.cssText = 'position:fixed;right:max(12px,env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);z-index:12;width:40px;height:40px;border-radius:50%;'
    + 'border:1px solid rgba(233,180,76,.55);background:rgba(16,22,24,.72);color:#f3ead8;display:grid;place-items:center;cursor:pointer;padding:0';
  doc.body.append(open);
  showEl(open, false, 'grid');

  const bar = doc.createElement('div'); bar.className = 'ftf-photo-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', t('photo.title'));
  bar.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;'
    + 'padding:8px 10px;border-radius:14px;background:rgba(10,14,16,.78);color:#f3ead8;font:13px/1.2 system-ui,sans-serif;max-width:calc(100vw - 32px)';
  const pill = 'padding:7px 11px;border-radius:999px;border:1px solid rgba(243,234,216,.28);background:transparent;color:inherit;font:inherit;cursor:pointer';
  const filterBtns = PHOTO_FILTERS.map((f, i) => { const b = btn('ftf-photo-filter', t('photo.filter.' + f.id), () => setFilter(i)); b.style.cssText = pill; b.dataset.filter = f.id; return b; });
  const shot = btn('ftf-photo-save', t('photo.save'), () => requestCapture()); shot.style.cssText = pill + ';background:#e9b44c;color:#14201c;border-color:#e9b44c;font-weight:600';
  const exit = btn('ftf-photo-exit', t('photo.exit'), () => toggle(false)); exit.style.cssText = pill;
  const hint = doc.createElement('span'); hint.className = 'ftf-photo-hint'; hint.textContent = t(coarse ? 'photo.hintTouch' : 'photo.hint'); hint.style.cssText = 'flex-basis:100%;text-align:center;opacity:.7;font-size:12px';
  bar.append(...filterBtns, shot, exit, hint);
  doc.body.append(bar);
  showEl(bar, false, 'flex');

  function renderFilters() {
    filterBtns.forEach((b, i) => { const on = i === state.filter; b.setAttribute('aria-pressed', String(on)); b.style.background = on ? 'rgba(233,180,76,.25)' : 'transparent'; });
    canvas.style.filter = state.on && PHOTO_FILTERS[state.filter].css !== 'none' ? PHOTO_FILTERS[state.filter].css : '';
  }
  function setFilter(i) { state.filter = ((i % PHOTO_FILTERS.length) + PHOTO_FILTERS.length) % PHOTO_FILTERS.length; renderFilters(); cue('ui_click'); }

  /** Every top-level overlay but the canvas (and its host) and the bar goes invisible; restored on exit. */
  function hideOverlays(on) {
    if (on) {
      state.hidden = [];
      for (const el of Array.from(doc.body.children)) {
        if (el === bar || el === canvas || (el.contains && el.contains(canvas)) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        state.hidden.push([el, el.style.visibility]); el.style.visibility = 'hidden';
      }
      // inside the canvas host, its siblings (HUD layers) go too
      const host = canvas.parentElement;
      if (host && host !== doc.body) for (const el of Array.from(host.children)) if (el !== canvas) { state.hidden.push([el, el.style.visibility]); el.style.visibility = 'hidden'; }
    } else {
      for (const [el, v] of state.hidden) el.style.visibility = v;
      state.hidden = [];
    }
  }

  function toggle(want = !state.on) {
    if (want === state.on) return state.on;
    state.on = want;
    hideOverlays(want);
    showEl(bar, want, 'flex'); showEl(open, !want && available, 'grid');
    if (rig) {
      if (want) { state.saved = { minDist: rig.minDist, maxDist: rig.maxDist, minPitch: rig.minPitch }; Object.assign(rig, PHOTO_CAMERA); }
      else if (state.saved) { Object.assign(rig, state.saved); rig.dist = Math.min(Math.max(rig.dist, rig.minDist), rig.maxDist); state.saved = null; }
    }
    renderFilters();
    cue(want ? 'ui_confirm' : 'ui_click');
    onChange(want);
    if (want) { const b = filterBtns[state.filter]; if (b && b.focus) b.focus(); }
    return state.on;
  }

  function requestCapture() { if (state.on) state.pending = true; }

  /** Called by the frame loop right after the frame is drawn: copies it with the look and a small mark, then saves. */
  function capture() {
    if (!state.pending) return false;
    state.pending = false;
    const w = canvas.width, h = canvas.height;
    const out = doc.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext ? out.getContext('2d') : null; if (!g) return false;
    const css = PHOTO_FILTERS[state.filter].css;
    if ('filter' in g) g.filter = css;
    g.drawImage(canvas, 0, 0);
    g.filter = 'none';
    const s = Math.max(14, Math.round(h * 0.022));
    g.font = `600 ${s}px system-ui, sans-serif`; g.textAlign = 'right'; g.fillStyle = 'rgba(243,234,216,.78)';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = s * 0.4;
    g.fillText('Forget to Foresee', w - s, h - s);
    const name = photoFileName();
    const done = (blob) => {
      if (!blob) return;
      if (save) { save(blob, name); return; }
      const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    if (out.toBlob) out.toBlob(done, 'image/png'); else done(null);
    shot.textContent = t('photo.saved'); setTimeout(() => { shot.textContent = t('photo.save'); }, 1400);
    cue('gift_chime');
    return true;
  }

  return {
    get on() { return state.on; }, get filter() { return PHOTO_FILTERS[state.filter].id; }, get pending() { return state.pending; },
    toggle, setFilter, requestCapture, capture,
    /** Shows or hides the camera button (the town on foot only). */
    setAvailable(on) { if (on === available) return; available = on; showEl(open, on && !state.on, 'grid'); },
    elements: { open, bar },
    dispose() { toggle(false); open.remove(); bar.remove(); },
  };
}
