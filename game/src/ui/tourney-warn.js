// Before the Tournament (owner 12.11): after Register at the altar, a short warning that the Tournament lasts at least
// 3 minutes and how to come back (Settings → End the Tournament). "Don't show again" is kept on this device.
// Plain DOM, no play imports. Never shown on the judge link (boot-world.js passes no confirm there).
export const TOURNEY_WARN_KEY = 'ftf.tourneyWarn.v1';

export const tourneyWarnSkipped = (storage) => { try { return !!storage && storage.getItem(TOURNEY_WARN_KEY) === 'off'; } catch { return false; } };

/** Resolves true to enter the Tournament, false to stay in town. */
export function confirmTournament({ doc = globalThis.document, t, storage = null }) {
  if (tourneyWarnSkipped(storage)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const d = el('dialog', 'ftf-set ftf-tw'); d.setAttribute('aria-labelledby', 'ftf-tw-title');
    d.style.cssText = 'width:min(480px,calc(100vw - 32px));padding:18px 20px;border:1px solid rgba(233,180,76,.55);border-radius:14px;background:#121a1b;color:#f3ead6;font:15px/1.5 system-ui,sans-serif';
    const h = el('h2', null, t('tw.title')); h.id = 'ftf-tw-title'; h.style.cssText = 'margin:0 0 8px;font:600 14px/1.2 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#e9b44c';
    const p = el('p', null, t('tw.body')); p.style.margin = '0 0 12px';
    const lab = el('label'); lab.style.cssText = 'display:flex;gap:8px;align-items:center;margin:0 0 14px;color:#d8cfbd;font-size:14px;min-height:36px';
    const cb = el('input'); cb.type = 'checkbox'; cb.style.cssText = 'width:20px;height:20px;accent-color:#d9a441';
    lab.append(cb, doc.createTextNode(t('tw.dontShow')));
    const row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end';
    const btn = (key, primary) => { const b = el('button', null, t(key)); b.type = 'button'; b.style.cssText = `min-height:42px;padding:6px 16px;border-radius:8px;border:1px solid ${primary ? '#e9b44c' : 'rgba(233,180,76,.6)'};background:${primary ? '#e9b44c' : 'rgba(233,180,76,.12)'};color:${primary ? '#1b1407' : '#f3ead6'};font:${primary ? 600 : 400} 15px system-ui,sans-serif;cursor:pointer`; return b; };
    const stay = btn('tw.stay', false), go = btn('tw.enter', true);
    row.append(stay, go); d.append(h, p, lab, row); doc.body.append(d);
    let done = false;
    const finish = (yes) => {
      if (done) return; done = true;
      if (cb.checked) { try { storage && storage.setItem(TOURNEY_WARN_KEY, 'off'); } catch { /* private mode */ } }
      if (d.open) d.close(); d.remove(); resolve(yes);
    };
    go.addEventListener('click', () => finish(true)); stay.addEventListener('click', () => finish(false));
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') { e.preventDefault(); finish(false); } });
    d.showModal(); go.focus();
  });
}
