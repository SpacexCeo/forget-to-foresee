// The receipt toast: when a transaction lands (window event 'ftf:tx' from net/receipts.js) a small gold-edged card
// says what happened on NEAR testnet, with the short hash and an explorer link, for 7 s (hover or focus keeps it).
// Several in a row stack, newest on top, at most three. Plain DOM; it imports nothing from net or play.

const CSS = `
.ftf-txt-stack { position: fixed; top: max(64px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 60; display: grid; gap: 6px; width: min(420px, calc(100vw - 24px)); pointer-events: none; }
.ftf-txt { pointer-events: auto; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 12px; background: rgba(12, 19, 18, .94); border: 1px solid rgba(233, 180, 76, .65); box-shadow: 0 8px 24px rgba(0,0,0,.45); color: #f3ead6; font: 13.5px/1.35 system-ui, sans-serif; animation: ftf-txt-in .25s ease-out; }
.ftf-txt i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #e9b44c; color: #14201c; font: 700 13px/1 system-ui; font-style: normal; }
.ftf-txt b { display: block; font-weight: 600; } .ftf-txt code { color: #9fd4cf; font: 12px ui-monospace, monospace; }
.ftf-txt a { color: #e9b44c; font-weight: 700; text-decoration: none; white-space: nowrap; } .ftf-txt a:hover, .ftf-txt a:focus-visible { text-decoration: underline; }
@keyframes ftf-txt-in { from { opacity: 0; transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { .ftf-txt { animation: none; } }
`;

/** Starts listening; returns a stop function. `t(key, args)` for the words (chain.toast, chain.kind.*, chain.view). */
export function installTxToast({ doc = globalThis.document, win = globalThis.window, t, seconds = 7 } = {}) {
  if (!doc || !win) return () => {};
  if (!doc.getElementById('ftf-txt-css')) { const s = doc.createElement('style'); s.id = 'ftf-txt-css'; s.textContent = CSS; doc.head.append(s); }
  const stack = doc.createElement('div'); stack.className = 'ftf-txt-stack'; stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite');
  doc.body.append(stack);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const onTx = (e) => {
    const r = e && e.detail; if (!r || !r.hash || !r.url) return;
    const card = el('div', 'ftf-txt');
    const body = el('div'); body.append(el('b', null, t('chain.toast', { what: t('chain.kind.' + r.kind) })), el('code', null, r.hash.slice(0, 10) + '…' + r.hash.slice(-4)));
    const a = el('a', null, t('chain.view')); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    card.append(el('i', null, 'Ⓝ'), body, a);
    stack.prepend(card);
    while (stack.children.length > 3) stack.lastChild.remove();
    let hold = false; card.addEventListener('pointerenter', () => { hold = true; }); card.addEventListener('pointerleave', () => { hold = false; });
    const end = Date.now() + seconds * 1000;
    const tick = () => { if (!card.isConnected) return; if (!hold && !card.contains(doc.activeElement) && Date.now() > end) card.remove(); else win.setTimeout(tick, 500); };
    win.setTimeout(tick, 500);
  };
  win.addEventListener('ftf:tx', onTx);
  return () => { win.removeEventListener('ftf:tx', onTx); stack.remove(); };
}
