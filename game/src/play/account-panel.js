// "Sign in / Create account" (docs/account-login.md), behind the `accountLogin` flag. Play as guest is the first and
// largest button and costs nothing: it only closes the panel. The wallet rows load their code on tap, never before,
// so a slow or missing wallet never holds up the game. Phones: nothing opens by itself; a tap outside, Esc or the ×
// closes it; while a wallet is being asked only the × does, so a stray tap on the way back from the wallet never drops
// a sign-in half way. The flow itself is net/account-login.js; this file only draws it.

const CSS = `
.acct, .acct * { box-sizing: border-box; }
.acct { position: fixed; inset: 0; z-index: calc(var(--z-dialogue, 50) + 3); display: grid; place-items: center; background: rgba(3, 7, 7, .62); font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ftf-text, #eef0ea); padding: 12px; }
.acct-card { position: relative; width: min(440px, 100%); max-height: calc(100dvh - 24px); overflow: auto; padding: 20px 18px 16px; border-radius: 18px; background: #0f1716; border: 1px solid rgba(214, 226, 214, .16); box-shadow: 0 18px 50px rgba(0, 0, 0, .5); }
.acct h2 { margin: 0 32px 12px 0; font: 600 22px/1.2 "Cormorant Garamond", Georgia, serif; }
.acct-x { position: absolute; top: 8px; right: 8px; width: 44px; height: 44px; border: 0; border-radius: 10px; background: transparent; color: inherit; font-size: 24px; cursor: pointer; }
.acct-guest { display: block; width: 100%; min-height: 56px; margin: 0 0 6px; border: 0; border-radius: 14px; background: var(--ftf-gold, #c5a469); color: #1b1407; font: 700 18px/1.2 var(--font-ui, system-ui); cursor: pointer; }
.acct-note { margin: 0 0 14px; color: rgba(233, 230, 220, .75); font-size: 13.5px; }
.acct-row { display: grid; gap: 8px; margin: 10px 0; }
.acct-btn { min-height: 46px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(214, 226, 214, .22); background: #16211f; color: inherit; font: 600 15px/1.2 var(--font-ui, system-ui); text-align: left; cursor: pointer; }
.acct-btn:disabled { opacity: .5; cursor: default; }
.acct-go { display: block; width: 100%; text-align: center; border: 0; background: var(--ftf-gold, #c5a469); color: #1b1407; }
.acct-status { min-height: 1.4em; margin: 8px 0 4px; font-size: 14px; }
.acct-small { margin: 12px 0 0; color: rgba(233, 230, 220, .6); font-size: 12.5px; }
.acct-sec { margin: 14px 0 6px; padding-top: 12px; border-top: 1px solid rgba(214, 226, 214, .14); }
.acct-sec h3 { margin: 0 0 8px; font: 600 15px/1.3 var(--font-ui, system-ui); }
.acct-form { display: flex; gap: 8px; flex-wrap: wrap; }
.acct-form input { flex: 1 1 180px; min-height: 44px; padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(214, 226, 214, .28); background: #0b1110; color: inherit; font: 16px/1.2 var(--font-ui, system-ui); }
.acct-form .acct-btn { flex: 0 0 auto; text-align: center; }
.acct-list { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
.acct-list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 40px; padding: 4px 4px 4px 12px; border-radius: 10px; background: #131c1b; font-size: 14px; }
.acct-list .acct-btn { min-height: 36px; padding: 6px 10px; font-size: 13px; }
`;

function ensureStyle(doc) {
  if (doc.head.querySelector('style[data-acct]')) return;
  const s = doc.createElement('style'); s.setAttribute('data-acct', ''); s.textContent = CSS; doc.head.append(s);
}

/**
 * @param {{doc?: Document, t: Function, makeLogin: () => Promise<object>, wallets?: object, nickname?: string|null, onDone?: Function}} o
 *   makeLogin: resolves the createAccountLogin() api (built lazily, after the tap)
 *   wallets: net/wallets.js (injected for tests)
 * @returns {{close: Function, el: Element, done: Promise<object>}} done resolves {status: 'guest'|'linked'|'restored'|...}
 */
export function openAccountPanel({ doc = document, t, makeLogin, makeEmail = null, wallets = null, nickname = null, onDone = null }) {
  ensureStyle(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'acct'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('acct.title'));
  const card = el('div', 'acct-card');
  const x = el('button', 'acct-x', '×'); x.type = 'button'; x.setAttribute('aria-label', t('acct.close'));
  const guest = el('button', 'acct-guest', t('acct.guest')); guest.type = 'button';
  const rows = el('div', 'acct-row');
  const status = el('p', 'acct-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  card.append(x, el('h2', null, t('acct.title')), guest, el('p', 'acct-note', t('acct.guest.note')), rows, status, el('p', 'acct-small', t('acct.testnet')));
  root.append(card);
  let settle; const done = new Promise((r) => { settle = r; });
  let busy = false, closed = false;
  const close = (result = { status: 'guest' }) => {
    if (closed) return; closed = true;
    doc.removeEventListener('keydown', onKey, true); root.remove();
    settle(result); if (onDone) onDone(result);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!busy) close(); } };
  doc.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => { if (e.target === root && !busy) close(); }); // a tap outside the card
  card.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  x.addEventListener('click', () => close());
  guest.addEventListener('click', () => close({ status: 'guest' }));
  const say = (text) => { status.replaceChildren(doc.createTextNode(text)); };
  const disable = (on) => { for (const b of rows.querySelectorAll('button')) b.disabled = on; };

  /** A tap the browser needs before a wallet popup (NEAR web wallets); EVM and Solana extensions need none. */
  const gestureFor = (kind) => (step) => (kind !== 'near' || step === 'connect') ? Promise.resolve() : new Promise((resolve) => {
    const b = el('button', 'acct-btn acct-go', t('acct.continue')); b.type = 'button';
    b.addEventListener('click', () => { b.remove(); say(t('acct.busy')); resolve(); }, { once: true });
    status.replaceChildren(b);
    b.focus({ preventScroll: true });
  });

  async function run(provider) {
    if (busy) return; busy = true; disable(true); say(t('acct.busy'));
    let r;
    try { const login = await makeLogin(); r = await login.signIn(provider, { gesture: gestureFor(provider.kind), nickname }); } catch (e) { r = { status: 'error', error: (e && e.message) || 'error' }; }
    busy = false; disable(false);
    show(r);
  }
  function show(r) {
    if (r.status === 'linked') { say(t('acct.linked', { account: r.account })); setTimeout(() => close(r), 1600); return; }
    if (r.status === 'restored') { say(t('acct.restored', { account: r.account })); setTimeout(() => close(r), 1600); return; }
    if (r.status === 'no_device_key') { say(t('acct.nokey')); return; }
    if (r.status === 'conflict') {
      const box = el('div', 'acct-row');
      box.append(el('p', null, t('acct.conflict', { existing: r.existing, current: r.current })));
      for (const [choice, key, acc] of [['existing', 'acct.keep.existing', r.existing], ['current', 'acct.keep.current', r.current]]) {
        const b = el('button', 'acct-btn', t(key, { account: acc })); b.type = 'button';
        b.addEventListener('click', async () => { for (const o of box.querySelectorAll('button')) o.disabled = true; say(t('acct.busy')); show(await r.choose(choice)); });
        box.append(b);
      }
      box.append(el('p', 'acct-small', t('acct.conflict.note')));
      status.replaceChildren(box);
      return;
    }
    say(t('acct.error', { reason: r.error || 'error' }));
  }

  // the wallet rows: discovery is local and fast; nothing loads from the network until a tap
  const loadWallets = () => (wallets ? Promise.resolve(wallets) : import('../net/wallets.js'));
  const add = (label, onTap) => { const b = el('button', 'acct-btn', label); b.type = 'button'; b.addEventListener('click', onTap); rows.append(b); return b; };
  const pkWin = doc.defaultView || globalThis.window;
  const pkOk = wallets ? !!(wallets.passkeySupported && wallets.passkeySupported(pkWin)) : !!(pkWin && pkWin.PublicKeyCredential);
  if (pkOk) { // passkeys first: the "email-like" login, nothing to install
    add(t('acct.passkey'), () => loadWallets().then((w) => run(w.passkeyProvider({ mode: 'get', storage: globalThis.localStorage }))));
    add(t('acct.passkey.new'), () => loadWallets().then((w) => run(w.passkeyProvider({ mode: 'create', storage: globalThis.localStorage }))));
  }
  add(t('acct.near'), () => { say(t('acct.busy')); loadWallets().then(async (w) => run(w.bestNearProvider ? await w.bestNearProvider() : w.nearProvider())); });
  add(t('acct.near.testnet'), () => loadWallets().then((w) => run(w.nearProvider())));
  const evmBtn = add(t('acct.evm.any'), () => loadWallets().then(async (w) => { const list = await w.discoverEvm(); if (!list.length) { say(t('acct.none.evm')); return; } run(w.evmProvider(list[0])); }));
  const solBtn = add(t('acct.sol.any'), () => loadWallets().then((w) => { const list = w.discoverSolana(); if (!list.length) { say(t('acct.none.sol')); return; } run(w.solanaProvider(list[0])); }));
  // name the wallets this browser has, and one row per extra wallet (EIP-6963 announces each)
  loadWallets().then(async (w) => {
    const evm = await w.discoverEvm();
    if (evm.length) { evmBtn.textContent = t('acct.evm', { name: evm[0].name }); for (const extra of evm.slice(1)) add(t('acct.evm', { name: extra.name }), () => run(w.evmProvider(extra))); }
    const sol = w.discoverSolana();
    if (sol.length) { solBtn.textContent = t('acct.sol', { name: sol[0].name }); for (const extra of sol.slice(1)) add(t('acct.sol', { name: extra.name }), () => run(w.solanaProvider(extra))); }
  }).catch(() => {});

  // email (net/account-email.js): sign in by email on a device with no wallet app; a signed-in browser lists its linked
  // methods, links an email and unlinks. Built after the panel shows; nothing is sent until a button is tapped.
  /** An inline step: one input and its button; resolves the next step from onSubmit's answer. */
  const form = (placeholder, type, label, onSubmit) => {
    const f = el('form', 'acct-form'); const i = el('input'); i.type = type; i.placeholder = placeholder; i.required = true; i.setAttribute('aria-label', placeholder);
    if (type === 'email') i.autocomplete = 'email'; else { i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 6; }
    const b = el('button', 'acct-btn acct-go', label); b.type = 'submit';
    f.addEventListener('submit', async (e) => { e.preventDefault(); if (busy) return; busy = true; b.disabled = true; say(t('acct.busy')); try { await onSubmit(i.value); } finally { busy = false; b.disabled = false; } });
    f.append(i, b); return f;
  };
  const errText = (r) => (r.error === 'email_not_configured' ? t('acct.email.off') : t('acct.error', { reason: r.error || 'error' }));
  if (makeEmail) {
    makeEmail().then(async (mail) => {
      if (closed) return;
      const sec = el('div', 'acct-sec');
      if (mail.canLink) {
        sec.append(el('h3', null, t('acct.methods')));
        const list = el('ul', 'acct-list'); sec.append(list);
        const refresh = async () => {
          const m = await mail.methods();
          list.replaceChildren();
          if (m.status !== 'ok') { list.append(el('li', null, errText(m))); return; }
          if (!m.methods.length) list.append(el('li', null, t('acct.methods.none')));
          for (const x of m.methods) {
            const li = el('li'); li.append(el('span', null, t('acct.kind.' + x.kind) + ' · ' + x.hint));
            const u = el('button', 'acct-btn', t('acct.unlink')); u.type = 'button';
            u.addEventListener('click', async () => { u.disabled = true; const r = await mail.unlink(x.id); say(r.status === 'unlinked' ? t('acct.unlinked') : errText(r)); refresh(); });
            li.append(u); list.append(li);
          }
        };
        refresh();
        sec.append(el('h3', null, t('acct.email.link')), el('p', 'acct-small', t('acct.email.note')));
        const step = el('div'); sec.append(step);
        let sentTo = null;
        step.append(form(t('acct.email.place'), 'email', t('acct.email.send'), async (v) => {
          const r = await mail.linkStart(v);
          if (r.status !== 'sent') { say(errText(r)); return; }
          sentTo = r.email; say(t('acct.email.sent', { email: sentTo }));
          step.replaceChildren(form(t('acct.email.code'), 'text', t('acct.email.linkGo'), async (code) => {
            const l = await mail.linkFinish(code);
            if (l.status === 'linked') { say(t('acct.email.linked', { hint: l.hint })); refresh(); } else say(errText(l));
          }));
        }));
        sec.append(el('p', 'acct-small', t('acct.wallet.link')));
      } else {
        sec.append(el('h3', null, t('acct.email.title')));
        const step = el('div'); sec.append(step);
        step.append(form(t('acct.email.place'), 'email', t('acct.email.send'), async (v) => {
          const r = await mail.loginStart(v);
          if (r.status !== 'sent') { say(errText(r)); return; }
          say(t('acct.email.sent', { email: r.email }));
          step.replaceChildren(form(t('acct.email.code'), 'text', t('acct.email.go'), async (code) => { const s = await mail.loginFinish(r.email, code); show(s.status === 'restored' ? s : { status: 'error', error: s.error === 'email_not_configured' ? s.error : s.error }); }));
        }));
      }
      card.insertBefore(sec, status);
    }).catch(() => {});
  }

  doc.body.append(root);
  guest.focus({ preventScroll: true });
  return { close, el: root, done, show };
}
