// Email sign-in and the account's linked methods, the browser side (relayer: relayer/lib/email-auth.js;
// docs/account-login.md). Pure flow, no DOM: the relayer is reached through `fetch`, the chain through the injected
// near-tx client, so every path is unit-tested against the real relayer code.
//
//   link an email (a signed-in browser): a code to the email -> a fresh "email key" is added to the account on chain
//     (AddKey, signed by this browser's key) -> the code, the key and an account proof go to the relayer, which keeps
//     the key encrypted;
//   sign in by email (any device, no wallet app): a code -> the relayer hands back the account and its email key ->
//     this browser plays as that account (the same Day-1 account every login maps to; mints go there as before);
//   the methods list and unlink, each with a fresh account proof.
import { NET } from './network.js';

/** The account proof text; must equal relayer/lib/email-auth.js proofMessage byte for byte (a test checks). */
export const proofMessage = (action, accountId, detail, at) => `Forget to Foresee account\nAction: ${action}\nAccount: ${accountId}\nDetail: ${detail}\nAt: ${at}\nThis proves you control this game account on ${NET.label}. It sends no transaction.`;
/** The same normalization as the relayer's: lower case, trimmed, a plain address; null otherwise. */
export function normEmail(s) { const e = String(s == null ? '' : s).trim().toLowerCase(); return e.length <= 254 && /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/.test(e) ? e : null; }
export const PREV_KEY = 'ftf.day1.prev.v1'; // the same list net/account-login.js keeps
export const validCode = (c) => /^\d{6}$/.test(String(c || '').trim());

const enc = (s) => new TextEncoder().encode(s);
const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };

/**
 * @param {{relayer: string, mint: object, client: object, guests?: string, signerFor: (secret: string) => Promise<{publicKey, sign}>,
 *          newKey: () => Promise<{publicKey, secretKey}>, fetch?: Function, now?: () => number}} o
 *   mint: play/day1-mint.js api (record, setRecord); client: net/near-tx.js createTxClient (addKey, accessKey, view)
 */
export function createAccountEmail({ relayer, mint, client, guests = null, signerFor, newKey, storage = null, fetch = globalThis.fetch, now = () => Date.now() }) {
  const base = String(relayer || '').replace(/\/$/, '');
  const post = async (path, body) => {
    try { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json().catch(() => ({})) }; }
    catch { return { status: 0, body: { error: 'network' } }; }
  };
  const rec = () => mint.record || {};
  const current = () => { const r = rec(); return r.playerKey && r.guest && r.guest.account_id ? { account_id: r.guest.account_id, key: r.playerKey } : null; };
  let lastAt = 0;
  /** A fresh proof by this browser's account key (a new millisecond each time: the relayer takes each proof once). */
  async function proof(action, detail) {
    const g = current(); if (!g) return null;
    const s = await signerFor(g.key.secretKey);
    const at = Math.max(now(), lastAt + 1); lastAt = at;
    return { account_id: g.account_id, public_key: s.publicKey, at, signature: b64(await s.sign(enc(proofMessage(action, g.account_id, detail, at)))) };
  }
  const fail = (r, fallback) => ({ status: 'error', error: (r.body && r.body.error) || fallback || 'http_' + r.status });
  let pendingLink = null; // the email being linked and its key, between the two steps
  /** A browser that signs in to another account keeps its own record (key included) under PREV_KEY, as a wallet sign-in does. */
  const keepPrevious = (r) => {
    if (!storage || !r || !r.playerKey) return;
    try { const list = JSON.parse(storage.getItem(PREV_KEY) || '[]'); list.push({ ...r, kept_at: new Date(now()).toISOString() }); storage.setItem(PREV_KEY, JSON.stringify(list.slice(-10))); } catch { /* memory only */ }
  };

  return {
    /** This browser has an account it can prove (it may link methods). */
    get canLink() { return !!current(); },
    get account() { const g = current(); return g ? g.account_id : null; },

    /** Step 1 of linking: a code goes to the email. Resolves {status: 'sent'} | {status: 'error', error}. */
    async linkStart(raw) {
      const email = normEmail(raw); if (!email) return { status: 'error', error: 'bad_email' };
      const p = await proof('link-email', email); if (!p) return { status: 'error', error: 'no_account' };
      const r = await post('/api/auth/email/start', { email, purpose: 'link', account: p });
      if (r.status !== 200) return fail(r);
      pendingLink = { email, key: null };
      return { status: 'sent', email };
    },
    /** Step 2: the code; the email key goes onto the account (AddKey), then to the relayer. {status: 'linked', hint} */
    async linkFinish(code) {
      if (!pendingLink) return { status: 'error', error: 'no_code_sent' };
      if (!validCode(code)) return { status: 'error', error: 'bad_code' };
      const g = current(); if (!g) return { status: 'error', error: 'no_account' };
      const k = pendingLink.key || (pendingLink.key = await newKey()); // the same key again on a retry: no second AddKey
      if ((await client.accessKey(g.account_id, k.publicKey)) !== 'FullAccess') {
        const a = await client.addKey({ key: await signerFor(g.key.secretKey), signerId: g.account_id, newKey: k.publicKey });
        if (!a || !a.ok) return { status: 'error', error: 'add_key_failed' };
      }
      const p = await proof('link-email', pendingLink.email + '|' + k.publicKey);
      const r = await post('/api/auth/email/link', { email: pendingLink.email, code: String(code).trim(), account: p, email_key: { public_key: k.publicKey, secret_key: k.secretKey } });
      if (r.status !== 200) return fail(r);
      pendingLink = null;
      return { status: 'linked', hint: r.body.hint, account: r.body.account_id };
    },

    /**
     * Register by email, step 1 (owner 14.11). A browser with no account first asks whether the address is free (so a
     * typo'd or taken address never makes an account), then makes the free Day-1 account with a key made here
     * (mint.mint: create_guest through the relayer), then asks for the link code. With an account it is linkStart.
     * {status: 'sent', email} | {status: 'error', error: 'email_in_use' | 'mint_failed' | ...}
     */
    async registerStart(raw, { nickname = null } = {}) {
      const email = normEmail(raw); if (!email) return { status: 'error', error: 'bad_email' };
      if (!current()) {
        const q = await post('/api/auth/email/start', { email, purpose: 'register' });
        if (q.status !== 200) return fail(q);
        let m; try { m = await mint.mint(nickname || rec().nickname || undefined); } catch (e) { m = { phase: 'failed', reason: String((e && e.message) || e).slice(0, 60) }; }
        if (!m || m.phase !== 'minted' || !current()) return { status: 'error', error: (m && m.reason) || 'mint_failed' };
      }
      return this.linkStart(email);
    },

    /** Sign in by email, step 1: a code; an address with no account answers {status: 'error', error: 'no_account'}. */
    async loginStart(raw) {
      const email = normEmail(raw); if (!email) return { status: 'error', error: 'bad_email' };
      const r = await post('/api/auth/email/start', { email, purpose: 'login' });
      return r.status === 200 ? { status: 'sent', email } : fail(r);
    },
    /** Step 2: the code; this browser becomes that account (its previous record kept by the caller's mint.setRecord). */
    async loginFinish(raw, code) {
      const email = normEmail(raw); if (!email) return { status: 'error', error: 'bad_email' };
      if (!validCode(code)) return { status: 'error', error: 'bad_code' };
      const r = await post('/api/auth/email/login', { email, code: String(code).trim() });
      if (r.status !== 200 || !r.body.key) return fail(r);
      const key = { publicKey: r.body.key.public_key, secretKey: r.body.key.secret_key }, account = r.body.account_id;
      if ((await client.accessKey(account, key.publicKey)) !== 'FullAccess') return { status: 'error', error: 'key_not_on_account' };
      const prev = rec().guest || null;
      if (prev && prev.account_id !== account) keepPrevious(rec()); // this browser's own account is not thrown away
      // the guest record (its Day-1 mint) comes back from the chain when the guests contract is given
      const back = guests ? await client.view(guests, 'guest_of', { public_key: key.publicKey }).catch(() => null) : null;
      if (back && back.account_id === account) { mint.setRecord({ playerKey: key, guest: back, minted: !!back.minted, login: { kind: 'email', address: email.replace(/^(.).*@/, '$1***@') } }); return { status: 'restored', account }; }
      mint.setRecord({ playerKey: key, guest: prev && prev.account_id === account ? prev : { account_id: account }, minted: prev && prev.account_id === account ? !!rec().minted : true, login: { kind: 'email', address: email.replace(/^(.).*@/, '$1***@') } });
      return { status: 'restored', account };
    },

    /** The account's linked sign-in methods: {status: 'ok', methods: [{id, kind, hint}], email: boolean}. */
    async methods() {
      const p = await proof('list', '-'); if (!p) return { status: 'error', error: 'no_account' };
      const r = await post('/api/auth/methods', { account: p });
      return r.status === 200 ? { status: 'ok', methods: r.body.methods || [], email: !!r.body.email } : fail(r);
    },
    async unlink(id) {
      const p = await proof('unlink', id); if (!p) return { status: 'error', error: 'no_account' };
      const r = await post('/api/auth/unlink', { id, account: p });
      return r.status === 200 ? { status: 'unlinked' } : fail(r);
    },
  };
}
