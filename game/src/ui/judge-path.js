// The judge's 90-second guided route behind ?judge=1 (lead's Move 4): a small skippable panel that walks the same 7
// steps as the README's "Judge path", each with a proof link. On a touch screen nothing pops up: only a small chip
// that opens the panel when tapped. Pure DOM, no game state; Skip removes it.
export const STEPS = 7;

/** wanted(search): true only for ?judge=1. */
export const wanted = (search) => { try { return new URLSearchParams(search || '').get('judge') === '1'; } catch { return false; } };

/** stepView(t, i): the text and proof link of step i (0-based); pure. */
export function stepView(t, i) {
  const n = Math.max(0, Math.min(STEPS - 1, i | 0)) + 1;
  return { n, label: t('judge.step', { n, total: STEPS }), text: t('judge.s' + n), proof: t('judge.p' + n) };
}

/**
 * mountJudgePath({doc, t, touch}): mounts the panel; returns {dispose()}.
 * @param {{doc?: Document, t: (k: string, a?: object) => string, touch?: boolean}} o
 */
export function mountJudgePath({ doc = globalThis.document, t, touch = false } = {}) {
  if (!doc || !doc.body || typeof t !== 'function') return { dispose() {} };
  let i = 0;
  const root = doc.createElement('div');
  root.id = 'ftf-judge-path'; root.setAttribute('role', 'region'); root.setAttribute('aria-label', t('judge.title'));
  root.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:60;max-width:min(360px,calc(100vw - 24px));font:14px/1.45 system-ui,sans-serif;color:#efe9dc;';
  const box = 'background:rgba(18,20,24,.92);border:1px solid rgba(217,180,122,.5);border-radius:10px;padding:10px 12px;';
  const btn = (label, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'margin:6px 6px 0 0;padding:4px 10px;border-radius:6px;border:1px solid rgba(217,180,122,.6);background:transparent;color:inherit;cursor:pointer;font:inherit;'; b.addEventListener('click', fn); return b; };
  const render = (open) => {
    root.textContent = '';
    if (!open) { const c = btn(t('judge.open'), () => render(true)); c.style.cssText += box + 'margin:0;'; root.append(c); return; }
    const card = doc.createElement('div'); card.style.cssText = box;
    if (i >= STEPS) {
      const p = doc.createElement('p'); p.style.margin = '0'; p.textContent = t('judge.done');
      card.append(p, btn(t('judge.skip'), () => dispose()));
    } else {
      const v = stepView(t, i);
      const h = doc.createElement('div'); h.style.cssText = 'font-size:12px;opacity:.75'; h.textContent = t('judge.title') + ' · ' + v.label;
      const p = doc.createElement('p'); p.style.margin = '4px 0 2px'; p.textContent = v.text;
      const a = doc.createElement('a'); a.href = v.proof; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t('judge.proof') + ' ↗'; a.style.color = '#d9b47a';
      card.append(h, p, a, doc.createElement('br'));
      if (i > 0) card.append(btn(t('judge.back'), () => { i -= 1; render(true); }));
      card.append(btn(t('judge.next'), () => { i += 1; render(true); }), btn(t('judge.skip'), () => dispose()));
    }
    root.append(card);
  };
  const dispose = () => { root.remove(); };
  render(!touch);
  doc.body.append(root);
  return { dispose };
}
