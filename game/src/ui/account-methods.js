// The account's sign-in methods (docs/account-login.md "Email and linked methods"), drawn in two places: the account
// panel (play/account-panel.js) and Settings → Account (ui/settings-popup.js). A signed-in browser sees its linked
// methods (each with Unlink) and Link an email; a browser with no account sees Sign in with email. The flow is
// net/account-email.js (`mail`); this file only draws it. Plain DOM, no play/ imports (a ui -> play edge is a boot cycle).

const CSS = `
.acct-sec { margin: 14px 0 6px; padding-top: 12px; border-top: 1px solid rgba(214, 226, 214, .14); }
.acct-sec h3 { margin: 0 0 8px; font: 600 15px/1.3 var(--font-ui, system-ui); }
.acct-form { display: flex; gap: 8px; flex-wrap: wrap; }
.acct-form input { flex: 1 1 180px; min-height: 44px; padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(214, 226, 214, .28); background: #0b1110; color: inherit; font: 16px/1.2 var(--font-ui, system-ui); }
.acct-form button, .acct-list button { min-height: 44px; padding: 8px 14px; border-radius: 12px; border: 0; background: var(--ftf-gold, #c5a469); color: #1b1407; font: 700 14px/1.2 var(--font-ui, system-ui); cursor: pointer; }
.acct-form button:disabled, .acct-list button:disabled { opacity: .5; cursor: default; }
.acct-list { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
.acct-list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 40px; padding: 4px 4px 4px 12px; border-radius: 10px; background: rgba(255, 255, 255, .05); font-size: 14px; }
.acct-list button { min-height: 36px; padding: 6px 10px; font-size: 13px; background: transparent; color: inherit; border: 1px solid rgba(214, 226, 214, .3); }
.acct-msg { min-height: 1.3em; margin: 6px 0; font-size: 13.5px; }
.acct-hint { margin: 6px 0; color: rgba(233, 230, 220, .65); font-size: 12.5px; }
`;

/**
 * @param {{doc?: Document, t: Function, mail: object, onSignedIn?: (r: object) => void, say?: (text: string) => void}} o
 *   mail: net/account-email.js createAccountEmail(); say: where messages go (default: the section's own line)
 * @returns {HTMLElement} the section
 */
export function mountAccountMethods({ doc = globalThis.document, t, mail, onSignedIn = null, say = null }) {
  if (doc.head && !doc.head.querySelector('style[data-acct-methods]')) { const s = doc.createElement('style'); s.setAttribute('data-acct-methods', ''); s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sec = el('div', 'acct-sec');
  const msg = el('p', 'acct-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  const tell = say || ((text) => { msg.textContent = text; });
  const errText = (r) => (r.error === 'email_not_configured' ? t('acct.email.off') : t('acct.error', { reason: r.error || 'error' }));
  let busy = false;
  /** One inline step: an input and its button (email or the 6-digit code). */
  const form = (placeholder, type, label, onSubmit) => {
    const f = el('form', 'acct-form'); const i = el('input'); i.type = type; i.placeholder = placeholder; i.required = true; i.setAttribute('aria-label', placeholder);
    if (type === 'email') i.autocomplete = 'email'; else { i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 6; }
    const b = el('button', null, label); b.type = 'submit';
    f.addEventListener('submit', async (e) => { if (e && e.preventDefault) e.preventDefault(); if (busy) return; busy = true; b.disabled = true; tell(t('acct.busy')); try { await onSubmit(i.value); } finally { busy = false; b.disabled = false; } });
    f.append(i, b); return f;
  };

  if (mail.canLink) {
    const list = el('ul', 'acct-list');
    sec.append(el('h3', null, t('acct.methods')), list);
    const refresh = async () => {
      const m = await mail.methods();
      list.replaceChildren();
      if (m.status !== 'ok') { list.append(el('li', null, errText(m))); return; }
      if (!m.methods.length) list.append(el('li', null, t('acct.methods.none')));
      for (const x of m.methods) {
        const li = el('li'); li.append(el('span', null, t('acct.kind.' + x.kind) + ' · ' + x.hint));
        const u = el('button', null, t('acct.unlink')); u.type = 'button';
        u.addEventListener('click', async () => { u.disabled = true; const r = await mail.unlink(x.id); tell(r.status === 'unlinked' ? t('acct.unlinked') : errText(r)); refresh(); });
        li.append(u); list.append(li);
      }
    };
    refresh();
    const step = el('div');
    sec.append(el('h3', null, t('acct.email.link')), el('p', 'acct-hint', t('acct.email.note')), step);
    step.append(form(t('acct.email.place'), 'email', t('acct.email.send'), async (v) => {
      const r = await mail.linkStart(v);
      if (r.status !== 'sent') { tell(errText(r)); return; }
      tell(t('acct.email.sent', { email: r.email }));
      step.replaceChildren(form(t('acct.email.code'), 'text', t('acct.email.linkGo'), async (code) => {
        const l = await mail.linkFinish(code);
        if (l.status === 'linked') { tell(t('acct.email.linked', { hint: l.hint })); refresh(); } else tell(errText(l));
      }));
    }));
    sec.append(el('p', 'acct-hint', t('acct.wallet.link')));
  } else {
    const step = el('div');
    sec.append(el('h3', null, t('acct.email.title')), el('p', 'acct-hint', t('acct.email.note')), step);
    step.append(form(t('acct.email.place'), 'email', t('acct.email.send'), async (v) => {
      const r = await mail.loginStart(v);
      if (r.status !== 'sent') { tell(errText(r)); return; }
      tell(t('acct.email.sent', { email: r.email }));
      step.replaceChildren(form(t('acct.email.code'), 'text', t('acct.email.go'), async (code) => {
        const s = await mail.loginFinish(r.email, code);
        if (s.status === 'restored') { tell(t('acct.restored', { account: s.account })); if (onSignedIn) onSignedIn(s); } else tell(errText(s));
      }));
    }));
  }
  if (!say) sec.append(msg);
  return sec;
}
