// Title and premise in the first seconds (audit QW-11): a lower-third shown once, right after the town is revealed,
// so a first-time visitor knows what the game is before the first step. It never takes input (pointer-events: none),
// hides on the first key or tap or after `ms`, and stays off in captures and cinematic runs.

export const PREMISE_MS = 5000;

/**
 * Pure policy: should the premise show for this page load?
 * @param {URLSearchParams} params
 * @param {{reducedMotion?: boolean, shown?: boolean}} [o]
 * @returns {{show: boolean, animate: boolean}}
 */
export function premisePolicy(params, { reducedMotion = false, shown = false } = {}) {
  const off = shown
    || params.has('films') || params.has('cinematic') || params.has('capture') || params.has('replay')
    || params.get('premise') === '0';
  return { show: !off, animate: !off && !reducedMotion };
}

let shownOnce = false;

/** Shows the lower-third once per page load. `t` is the i18n translator. */
export function showPremise(doc, t, { params, reducedMotion = false, ms = PREMISE_MS } = {}) {
  const p = premisePolicy(params || new URLSearchParams(), { reducedMotion, shown: shownOnce });
  if (!p.show) return null;
  shownOnce = true;
  const el = doc.createElement('div');
  el.className = 'ftf-premise';
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:5%;transform:translateX(-50%);z-index:40;max-width:min(92vw,640px);'
    + 'padding:14px 22px;border-radius:12px;background:rgba(10,14,16,.78);color:#f3efe6;text-align:center;pointer-events:none;'
    + 'font:15px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);'
    + (p.animate ? 'opacity:0;transition:opacity .5s ease;' : '');
  const title = doc.createElement('div');
  title.style.cssText = 'font:600 24px/1.2 Georgia,serif;letter-spacing:.04em;margin-bottom:4px';
  title.textContent = t('app.title.full');
  const line = doc.createElement('div'); line.textContent = t('premise.line');
  const hint = doc.createElement('div'); hint.style.cssText = 'opacity:.75;font-size:13px;margin-top:6px'; hint.textContent = t('premise.hint');
  el.append(title, line, hint);
  doc.body.append(el);
  if (p.animate) requestAnimationFrame(() => { el.style.opacity = '1'; });
  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    doc.removeEventListener('keydown', hide, true);
    doc.removeEventListener('pointerdown', hide, true);
    if (p.animate) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); } else el.remove();
  };
  timer = setTimeout(hide, ms);
  doc.addEventListener('keydown', hide, true);   // capture, passive: the key still reaches the game
  doc.addEventListener('pointerdown', hide, true);
  return el;
}
