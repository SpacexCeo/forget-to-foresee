// The account's sign-in methods (docs/account-login.md "Email and linked methods"), drawn in two places: the account
// panel (play/account-panel.js) and Settings → Account (ui/settings-popup.js). A signed-in browser sees its linked
// methods (each with Unlink) and Link an email; a browser with no account sees Sign in with email. The flow is
// net/account-email.js (`mail`); this file only draws it. Plain DOM, no play/ imports (a ui -> play edge is a boot cycle).

const OPEN_ICONS = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'assets/ui/icons/open/'; // art/ui/build_open_icons.py
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
.acct-row2 { margin-top: 8px; }
.acct-form .acct-ghost { min-height: 40px; padding: 6px 12px; background: transparent; color: inherit; border: 1px solid rgba(214, 226, 214, .3); font-weight: 600; font-size: 13px; }
.acct-msg { min-height: 1.3em; margin: 6px 0; font-size: 13.5px; }
.acct-hint { margin: 6px 0; color: rgba(233, 230, 220, .65); font-size: 12.5px; }
.acct-sec [data-ic]::before { content: ''; display: inline-block; width: 1.3em; height: 1.3em; margin-right: 6px; vertical-align: -.3em; background: center / contain no-repeat; }
.acct-sec [data-ic=email]::before { background-image: url("${OPEN_ICONS}account_email_glyph_48.webp"); }
.acct-sec [data-ic=wallet]::before { background-image: url("${OPEN_ICONS}account_wallet_glyph_48.webp"); }
.acct-sec [data-ic=link]::before { background-image: url("${OPEN_ICONS}account_link_glyph_48.webp"); }
.acct-sec [data-ic=unlink]::before { background-image: url("${OPEN_ICONS}account_unlink_glyph_48.webp"); width: 1.1em; height: 1.1em; margin-right: 4px; }
`;

/**
 * @param {{doc?: Document, t: Function, mail: object, onSignedIn?: (r: object) => void, say?: (text: string) => void}} o
 *   mail: net/account-email.js createAccountEmail(); say: where messages go (default: the section's own line)
 * @returns {HTMLElement} the section
 */
/** Seconds before "Resend code" can be pressed (again). */
export const RESEND_S = 30;

export function mountAccountMethods({ doc = globalThis.document, t, mail, onSignedIn = null, say = null, timers = globalThis }) {
  if (doc.head && !doc.head.querySelector('style[data-acct-methods]')) { const s = doc.createElement('style'); s.setAttribute('data-acct-methods', ''); s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ic = (e, name) => { e.dataset.ic = name; return e; }; // the open icon set (CSS above)
  const sec = el('div', 'acct-sec');
  const msg = el('p', 'acct-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  const tell = say || ((text) => { msg.textContent = text; });
  const errText = (r) => (r.error === 'email_not_configured' ? t('acct.email.off') : t('acct.error', { reason: r.error || 'error' }));
  let busy = false;
  /** One inline step: an input and its button (email or the 6-digit code). */
  const form = (placeholder, type, label, onSubmit, value = '') => {
    const f = el('form', 'acct-form'); const i = el('input'); i.type = type; i.placeholder = placeholder; i.required = true; i.setAttribute('aria-label', placeholder); if (value) i.value = value;
    if (type === 'email') i.autocomplete = 'email'; else { i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 6; }
    const b = el('button', null, label); b.type = 'submit';
    f.addEventListener('submit', async (e) => { if (e && e.preventDefault) e.preventDefault(); if (busy) return; busy = true; b.disabled = true; tell(t('acct.busy')); try { await onSubmit(i.value); } finally { busy = false; b.disabled = false; } });
    f.append(i, b); return f;
  };

  /**
   * The two steps of an email flow in `step`: the address, then the code. The code step has a way back (owner 14.11: a
   * player who typed the wrong address was stuck): "Change email" returns to the address field with the address kept,
   * and "Resend code" sends a new one after RESEND_S seconds. start(email) -> {status: 'sent', email}; finish(email, code)
   * -> true when the flow is over (the address step comes back empty).
   */
  let cooldown = null;
  const stopCooldown = () => { if (cooldown != null) { timers.clearInterval(cooldown); cooldown = null; } };
  function emailFlow(step, { start, finish, goLabel }) {
    const askEmail = (prefill = '') => { stopCooldown(); step.replaceChildren(form(t('acct.email.place'), 'email', t('acct.email.send'), async (v) => {
      const r = await start(v);
      if (r.status !== 'sent') { tell(errText(r)); return; }
      tell(t('acct.email.sent', { email: r.email })); askCode(r.email);
    }, prefill)); };
    const askCode = (email) => {
      stopCooldown();
      const back = el('button', 'acct-ghost', t('acct.email.back')); back.type = 'button';
      back.addEventListener('click', () => { if (busy) return; tell(''); askEmail(email); });
      const again = el('button', 'acct-ghost'); again.type = 'button';
      let left = RESEND_S;
      const paint = () => { again.disabled = left > 0; again.textContent = left > 0 ? t('acct.email.resendIn', { s: left }) : t('acct.email.resend'); };
      const arm = () => { stopCooldown(); left = RESEND_S; paint(); cooldown = timers.setInterval(() => { left -= 1; paint(); if (left <= 0) stopCooldown(); }, 1000); };
      again.addEventListener('click', async () => {
        if (busy || left > 0) return; busy = true; again.disabled = true; tell(t('acct.busy'));
        try { const r = await start(email); tell(r.status === 'sent' ? t('acct.email.sent', { email: r.email }) : errText(r)); } finally { busy = false; arm(); }
      });
      const row = el('div', 'acct-form acct-row2'); row.append(back, again);
      step.replaceChildren(form(t('acct.email.code'), 'text', goLabel, async (code) => { if (await finish(email, code)) askEmail(''); }), row);
      arm();
    };
    askEmail('');
  }

  if (mail.canLink) {
    const list = el('ul', 'acct-list');
    sec.append(ic(el('h3', null, t('acct.methods')), 'link'), list);
    const refresh = async () => {
      const m = await mail.methods();
      list.replaceChildren();
      if (m.status !== 'ok') { list.append(el('li', null, errText(m))); return; }
      if (!m.methods.length) list.append(el('li', null, t('acct.methods.none')));
      for (const x of m.methods) {
        const li = el('li'); li.append(ic(el('span', null, t('acct.kind.' + x.kind) + ' · ' + x.hint), x.kind === 'email' ? 'email' : 'wallet'));
        const u = ic(el('button', null, t('acct.unlink')), 'unlink'); u.type = 'button';
        u.addEventListener('click', async () => { u.disabled = true; const r = await mail.unlink(x.id); tell(r.status === 'unlinked' ? t('acct.unlinked') : errText(r)); refresh(); });
        li.append(u); list.append(li);
      }
    };
    refresh();
    const step = el('div');
    sec.append(ic(el('h3', null, t('acct.email.link')), 'email'), el('p', 'acct-hint', t('acct.email.note')), step);
    emailFlow(step, { goLabel: t('acct.email.linkGo'), start: (v) => mail.linkStart(v), finish: async (email, code) => {
      const l = await mail.linkFinish(code);
      if (l.status === 'linked') { tell(t('acct.email.linked', { hint: l.hint })); refresh(); return true; }
      tell(errText(l)); return false;
    } });
    sec.append(ic(el('p', 'acct-hint', t('acct.wallet.link')), 'wallet'));
  } else {
    const step = el('div');
    sec.append(ic(el('h3', null, t('acct.email.title')), 'email'), el('p', 'acct-hint', t('acct.email.note')), step);
    emailFlow(step, { goLabel: t('acct.email.go'), start: (v) => mail.loginStart(v), finish: async (email, code) => {
      const r = await mail.loginFinish(email, code);
      if (r.status === 'restored') { tell(t('acct.restored', { account: r.account })); if (onSignedIn) onSignedIn(r); return true; }
      tell(errText(r)); return false;
    } });
  }
  if (!say) sec.append(msg);
  return sec;
}
