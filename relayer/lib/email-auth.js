// Email sign-in and account linking (owner 14.11: "a player who signed in with a wallet links an email; later he signs
// in by email on the phone, no wallet app needed, and everything still goes to the same account"). docs/account-login.md.
//
// One canonical account per player: the Day-1 NEAR account every login already maps to (lib/auth.js identities).
// Email has no deterministic key of its own, so linking one stores a dedicated "email key": the signed-in browser makes
// it, adds it to the account on chain (AddKey, signed by the account's own key) and hands it over; the relayer keeps it
// encrypted (AES-256-GCM, FTF_EMAIL_KEY_SECRET) and gives it back to whoever proves the email with a one-time code.
//   - codes: 6 digits, 10 minutes, 5 tries, only sha256(salt, email, code) is kept, in memory; 5 codes an hour per email;
//   - the answer to "send me a code" is the same for a known and an unknown email (no account discovery);
//   - an account proof (a message signed by a full-access key of the account, 5 minutes) guards link, list and unlink;
//   - no password exists anywhere; the stored key is useless without the env secret.
// Testnet only: the key holds testnet NEAR and game items with no real value; that custody is stated in the docs.
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { verifyGuest } from './auth.js';

export const EMAIL = Object.freeze({ codeTtlMs: 10 * 60 * 1000, maxTries: 5, perEmailPerHour: 5, proofTtlMs: 5 * 60 * 1000, maxCodes: 20000 });
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

/** A normalized email (lower case, trimmed) or null. */
export function normEmail(s) { const e = String(s == null ? '' : s).trim().toLowerCase(); return e.length <= 254 && EMAIL_RE.test(e) ? e : null; }
/** The identity key of an email in identities.json: its hash, never the address. */
export const emailId = (email) => 'email:' + createHash('sha256').update('ftf-email-v1|' + email).digest('hex');
/** "a***@gmail.com": what the account's own settings show. */
export function maskEmail(email) { const [u, d] = String(email).split('@'); return (u ? u[0] : '') + '***@' + (d || ''); }

/** The 32-byte encryption key from the env (base64), or null when email sign-in is not configured. */
export function keyFromEnv(env = process.env) { try { const k = Buffer.from(String(env.FTF_EMAIL_KEY_SECRET || ''), 'base64'); return k.length === 32 ? k : null; } catch { return null; } }
/** AES-256-GCM: text -> 'v1.<iv>.<tag>.<ciphertext>' (base64url parts). */
export function seal(text, key) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function unseal(box, key) {
  const [v, iv, tag, ct] = String(box).split('.');
  if (v !== 'v1') throw new Error('bad_box');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** The account proof text a full-access key of the account signs (the browser builds the same; a test checks). */
export const proofMessage = (action, accountId, detail, at) => `Forget to Foresee account\nAction: ${action}\nAccount: ${accountId}\nDetail: ${detail}\nAt: ${at}\nThis proves you control this game account on NEAR testnet. It sends no transaction.`;

/** One-time codes in memory: issue(email, purpose, bind) -> code | {error}; take(email, code, purpose) -> {ok, bind} | {ok:false, error}. */
export function createCodes({ now = () => Date.now(), rand = () => randomInt(0, 1_000_000), salt = randomBytes(16) } = {}) {
  const codes = new Map(), sent = new Map(); // email -> {hash, purpose, bind, exp, tries}; email -> [times]
  const hash = (email, code) => createHash('sha256').update(salt).update(email + '|' + code).digest();
  return {
    issue(email, purpose, bind = null) {
      const t = now(), times = (sent.get(email) || []).filter((x) => t - x < 3600_000);
      if (times.length >= EMAIL.perEmailPerHour) return { error: 'too_many_codes' };
      times.push(t); sent.set(email, times);
      if (codes.size >= EMAIL.maxCodes) codes.delete(codes.keys().next().value);
      const code = String(rand()).padStart(6, '0');
      codes.set(email, { hash: hash(email, code), purpose, bind, exp: t + EMAIL.codeTtlMs, tries: 0 });
      return { code };
    },
    take(email, code, purpose) {
      const c = codes.get(email);
      if (!c || c.exp <= now() || c.purpose !== purpose) return { ok: false, error: 'code_expired' };
      if (!/^\d{6}$/.test(String(code))) return { ok: false, error: 'bad_code' };
      if (++c.tries > EMAIL.maxTries) { codes.delete(email); return { ok: false, error: 'too_many_tries' }; }
      if (!timingSafeEqual(c.hash, hash(email, String(code)))) return { ok: false, error: 'wrong_code' };
      codes.delete(email);
      return { ok: true, bind: c.bind };
    },
  };
}

/** The mail sender: Resend's HTTPS API (RESEND_API_KEY, FTF_EMAIL_FROM). configured false -> the routes answer 503. */
export function createMailer({ env = process.env, fetch = globalThis.fetch, log = () => {} } = {}) {
  const apiKey = env.RESEND_API_KEY || '', from = env.FTF_EMAIL_FROM || '';
  return {
    configured: !!(apiKey && from),
    async send(to, code, purpose) {
      const subject = purpose === 'link' ? 'Link this email to your Forget to Foresee account' : 'Your Forget to Foresee sign-in code';
      const text = `Your code: ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this email: nothing happens without the code.\n\nForget to Foresee runs on NEAR testnet; nothing in the game has real-world value.`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text }) });
      if (!r.ok) { log(`[auth] email send failed ${r.status}`); throw new Error('send_failed'); }
      return true;
    },
  };
}

/**
 * The email routes, pure apart from the injected store (lib/auth.js createIdentityStore), codes, mailer and access-key
 * lookup. Each returns {status, body}.
 */
export function createEmailAuth({ store, codes, mailer, accessKey, key, now = () => Date.now() }) {
  const usedProofs = new Map(); // signature -> expiry: an account proof works once
  const ready = () => !!(key && mailer && mailer.configured);
  async function proof(account, action, detail) {
    if (!account || typeof account !== 'object' || !Number.isFinite(account.at) || Math.abs(now() - account.at) > EMAIL.proofTtlMs) return { ok: false, error: 'stale_proof' };
    const sig = String(account.signature || '');
    for (const [s, exp] of usedProofs) if (exp < now()) usedProofs.delete(s);
    if (usedProofs.has(sig)) return { ok: false, error: 'proof_used' };
    const v = await verifyGuest(account, proofMessage(action, account.account_id, detail, account.at), { accessKey });
    if (!v.ok) return v;
    usedProofs.set(sig, now() + EMAIL.proofTtlMs * 2);
    return { ok: true };
  }
  const methodsOf = (accountId) => store.all().filter(([, r]) => r.account === accountId).map(([id, r]) => ({ id, kind: r.kind, hint: r.kind === 'email' ? r.email_hint : r.address ? String(r.address).slice(0, 6) + '…' + String(r.address).slice(-4) : r.kind, linked_at: r.linked_at }));

  return {
    get ready() { return ready(); },
    /** POST /api/auth/email/start {email, purpose: 'link'|'login', account?}: always {status: 'sent'} for a valid request. */
    async start(b) {
      if (!ready()) return { status: 503, body: { error: 'email_not_configured' } };
      const email = normEmail(b && b.email);
      if (!email) return { status: 400, body: { error: 'bad_email' } };
      const purpose = b.purpose === 'link' ? 'link' : 'login';
      let bind = null;
      if (purpose === 'link') {
        const p = await proof(b.account, 'link-email', email); if (!p.ok) return { status: 401, body: { error: p.error } };
        const cur = store.get(emailId(email));
        if (cur && cur.account !== b.account.account_id) return { status: 409, body: { error: 'email_in_use' } };
        bind = b.account.account_id;
      } else if (!store.get(emailId(email))) return { status: 200, body: { status: 'sent' } }; // unknown email: the same answer, nothing sent
      const c = codes.issue(email, purpose, bind);
      if (c.error) return { status: 429, body: { error: c.error } };
      try { await mailer.send(email, c.code, purpose); } catch { return { status: 502, body: { error: 'send_failed' } }; }
      return { status: 200, body: { status: 'sent' } };
    },
    /** POST /api/auth/email/link {email, code, account, email_key: {public_key, secret_key}}: the email now signs in to this account. */
    async link(b) {
      if (!ready()) return { status: 503, body: { error: 'email_not_configured' } };
      const email = normEmail(b && b.email); if (!email) return { status: 400, body: { error: 'bad_email' } };
      const k = b.email_key || {};
      if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(String(k.public_key)) || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(String(k.secret_key))) return { status: 400, body: { error: 'bad_key' } };
      const p = await proof(b.account, 'link-email', email + '|' + k.public_key); if (!p.ok) return { status: 401, body: { error: p.error } };
      const ak = await accessKey(b.account.account_id, k.public_key).catch(() => null); // first: a key not yet on chain does not burn the code
      if (!ak || ak.permission !== 'FullAccess') return { status: 400, body: { error: 'email_key_not_on_account' } };
      const c = codes.take(email, b.code, 'link');
      if (!c.ok) return { status: 401, body: { error: c.error } };
      if (c.bind !== b.account.account_id) return { status: 401, body: { error: 'code_for_another_account' } };
      const id = emailId(email), cur = store.get(id), stamp = new Date(now()).toISOString();
      if (cur && cur.account !== b.account.account_id) return { status: 409, body: { error: 'email_in_use' } };
      store.set(id, { account: b.account.account_id, kind: 'email', email_hint: maskEmail(email), key_pub: k.public_key, key_box: seal(k.secret_key, key), linked_at: stamp, history: cur ? [...(cur.history || []), { key_pub: cur.key_pub, until: stamp }] : [] });
      return { status: 200, body: { status: 'linked', account_id: b.account.account_id, hint: maskEmail(email) } };
    },
    /** POST /api/auth/email/login {email, code}: {account_id, key: {public_key, secret_key}} for a proven, linked email. */
    async login(b) {
      if (!ready()) return { status: 503, body: { error: 'email_not_configured' } };
      const email = normEmail(b && b.email); if (!email) return { status: 400, body: { error: 'bad_email' } };
      const c = codes.take(email, b.code, 'login');
      if (!c.ok) return { status: 401, body: { error: c.error } };
      const r = store.get(emailId(email));
      if (!r || !r.key_box) return { status: 404, body: { error: 'not_linked' } };
      const ak = await accessKey(r.account, r.key_pub).catch(() => null);
      if (!ak || ak.permission !== 'FullAccess') return { status: 410, body: { error: 'key_removed' } };
      let secret; try { secret = unseal(r.key_box, key); } catch { return { status: 500, body: { error: 'key_unreadable' } }; }
      return { status: 200, body: { status: 'signed_in', account_id: r.account, key: { public_key: r.key_pub, secret_key: secret } } };
    },
    /** POST /api/auth/methods {account}: the sign-in methods linked to this account. */
    async methods(b) {
      const p = await proof(b && b.account, 'list', '-'); if (!p.ok) return { status: 401, body: { error: p.error } };
      return { status: 200, body: { methods: methodsOf(b.account.account_id), email: ready() } };
    },
    /** POST /api/auth/unlink {id, account}: forgets one linked method (an email's stored key is destroyed). */
    async unlink(b) {
      const id = String((b && b.id) || '');
      const p = await proof(b && b.account, 'unlink', id); if (!p.ok) return { status: 401, body: { error: p.error } };
      const r = store.get(id);
      if (!r || r.account !== b.account.account_id) return { status: 404, body: { error: 'not_linked' } };
      if (methodsOf(r.account).length <= 1 && r.kind !== 'email') return { status: 409, body: { error: 'last_method' } };
      store.remove(id);
      return { status: 200, body: { status: 'unlinked', key_pub: r.key_pub || null } };
    },
  };
}
