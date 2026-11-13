// Account login, the browser side (docs/account-login.md; relayer: relayer/lib/auth.js). Pure flow, no DOM: the wallets
// are injected "providers" (net/wallets.js), so every path is unit-tested without a browser or a network.
//
// The Day-1 guest account stays the on-chain identity. A login (NEAR, EVM or Solana wallet) links to it:
//   1. the wallet signs a FIXED text; that signature (deterministic for ed25519 and for RFC 6979 secp256k1) is hashed
//      into this player's device key, the same on every device. It never leaves the browser;
//   2. the wallet signs the login message (relayer nonce + expiry); the guest's own key signs it too;
//   3. the relayer maps login -> account; the device key is added to the guest account (AddKey, signed by the guest key);
//   4. on another device the same wallet derives the same key, the relayer names the account, the key is already on it.
// Playing as a guest never touches any of this: nothing here runs until the player picks a login.

export const DEVICE_KEY_TEXT = 'Forget to Foresee: unlock my game key on this device.\nSign this only on the Forget to Foresee page. It sends no transaction and costs nothing.';
export const DEVICE_KEY_DOMAIN = 'ftf-device-key-v1';
export const RECIPIENT = 'forget-to-foresee';
export const PREV_KEY = 'ftf.day1.prev.v1';

/** The login message; must equal relayer/lib/auth.js loginMessage byte for byte (a test checks). */
export function loginMessage(f) {
  return [
    'Forget to Foresee: sign in',
    `Login: ${f.kind}:${f.address}`,
    `Game account: ${f.account || 'new'}`,
    `Device key: ${f.deviceKey || 'none'}`,
    `Nonce: ${f.nonce}`,
    `Expires: ${f.expires}`,
    'This proves you own this login. It sends no transaction and costs nothing. Your account lives on NEAR testnet; nothing here has real-world value.',
  ].join('\n');
}

const subtle = () => globalThis.crypto.subtle;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = '1' + s; }
  return s;
}
const enc = (s) => new TextEncoder().encode(s);
export const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toHex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => Uint8Array.from(String(h).replace(/^0x/, '').match(/../g) || [], (x) => parseInt(x, 16));
const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

/** The fixed NEP-413 nonce of the device-key text (32 bytes, the same everywhere). */
export async function deviceKeyNonce() { return new Uint8Array(await subtle().digest('SHA-256', enc(DEVICE_KEY_DOMAIN))); }

/**
 * The device key from the wallet's signature of DEVICE_KEY_TEXT (its first 64 bytes: r||s for EVM, the ed25519
 * signature otherwise): seed = sha256(domain || sig). Returns a NEAR key pair {secretKey, publicKey}.
 */
export async function deviceKeyFromSignature(sig) {
  if (!sig || sig.length < 64) throw new Error('bad_signature');
  const seed = new Uint8Array(await subtle().digest('SHA-256', new Uint8Array([...enc(DEVICE_KEY_DOMAIN), ...sig.slice(0, 64)])));
  const key = await subtle().importKey('pkcs8', new Uint8Array([...PKCS8_PREFIX, ...seed]), { name: 'Ed25519' }, true, ['sign']);
  const jwk = await subtle().exportKey('jwk', key);
  const pub = unb64(jwk.x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (jwk.x.length % 4)) % 4));
  return { secretKey: 'ed25519:' + b58(new Uint8Array([...seed, ...pub])), publicKey: 'ed25519:' + b58(pub) };
}

async function edSigner(secretKey) {
  const { b58decode } = await import('./near-tx.js');
  const sk = b58decode(String(secretKey).replace(/^ed25519:/, ''));
  const key = await subtle().importKey('pkcs8', new Uint8Array([...PKCS8_PREFIX, ...sk.slice(0, 32)]), { name: 'Ed25519' }, false, ['sign']);
  return { publicKey: 'ed25519:' + b58(sk.slice(32)), sign: async (bytes) => new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, bytes)) };
}

/**
 * @param {{
 *   relayer: string,                    the relayer origin (DAY1_DEPLOYMENT.relayer)
 *   mint: object,                       play/day1-mint.js api: record, setRecord(patch), mint(nickname)
 *   client: object,                     net/near-tx.js createTxClient(): view, addKey, accessKey
 *   guests: string,                     the guests contract (guest_of)
 *   storage?: object, fetch?: Function, signerFor?: Function
 * }} o
 */
export function createAccountLogin({ relayer, mint, client, guests, storage = null, fetch = globalThis.fetch, signerFor = edSigner }) {
  const base = String(relayer || '').replace(/\/$/, '');
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  };
  const rec = () => mint.record || {};
  const currentGuest = () => { const r = rec(); return r.playerKey && r.guest && r.guest.account_id ? { account_id: r.guest.account_id, key: r.playerKey } : null; };
  const keepPrevious = (r) => {
    if (!storage || !r || !r.playerKey) return;
    try { const list = JSON.parse(storage.getItem(PREV_KEY) || '[]'); list.push({ ...r, kept_at: new Date().toISOString() }); storage.setItem(PREV_KEY, JSON.stringify(list.slice(-10))); } catch { /* memory only */ }
  };

  /** One signed link request (the login message, signed by the wallet and, when there is one, by the guest key). */
  async function linkOnce(provider, who, deviceKey, guest) {
    const n = await post('/api/auth/nonce');
    if (n.status !== 200 || !n.body.nonce) return { status: 'error', error: n.body.error || 'nonce_' + n.status };
    const message = loginMessage({ kind: provider.kind, address: who.address, account: guest ? guest.account_id : null, deviceKey: deviceKey.publicKey, nonce: n.body.nonce, expires: n.body.expires });
    const signature = await provider.signMessage(message, n.body.nonce);
    const body = { kind: provider.kind, address: who.address, public_key: who.publicKey || undefined, signature, nonce: n.body.nonce, expires: n.body.expires, device_key: deviceKey.publicKey };
    if (guest) {
      const s = await signerFor(guest.key.secretKey);
      body.account = { account_id: guest.account_id, public_key: s.publicKey, signature: b64(await s.sign(enc(message))), guest_key: rec().guestKey || s.publicKey };
    }
    return post('/api/auth/link', body);
  }

  /** The device key goes onto the guest account once (AddKey signed by the guest key); a no-op when it is the guest key. */
  async function ensureDeviceKey(guest, deviceKey) {
    if (guest.key.publicKey === deviceKey.publicKey) return true;
    if (await client.accessKey(guest.account_id, deviceKey.publicKey)) return true;
    const r = await client.addKey({ key: await signerFor(guest.key.secretKey), signerId: guest.account_id, newKey: deviceKey.publicKey });
    return !!r.ok;
  }

  /** Switch this browser to `account` with the device key (only when that key is a full-access key there). */
  async function adopt(account, guestKey, deviceKey, login) {
    if ((await client.accessKey(account, deviceKey.publicKey)) !== 'FullAccess') return { status: 'no_device_key', account };
    const before = rec();
    if (before.playerKey && before.playerKey.publicKey !== deviceKey.publicKey) keepPrevious(before);
    const g = guestKey ? await client.view(guests, 'guest_of', { public_key: guestKey }).catch(() => null) : null;
    mint.setRecord({ playerKey: deviceKey, guest: g || { account_id: account }, minted: !!(g && g.minted), guestKey: guestKey || null, login });
    return { status: 'restored', account };
  }

  /**
   * Sign in with a provider ({kind, connect(), signMessage(text, nonceHex), signDeviceKey()}).
   * `gesture(step)` waits for a tap before each wallet popup that a browser would block without one (NEAR web wallets).
   * Resolves {status: 'linked'|'restored'|'conflict'|'no_device_key'|'error', account?, existing?, current?, choose?}.
   */
  async function signIn(provider, { gesture = async () => {}, nickname = null } = {}) {
    try {
      await gesture('connect');
      const who = await provider.connect();
      const deviceKey = await deviceKeyFromSignature(await provider.signDeviceKey());
      const login = { kind: provider.kind, address: who.address, device_key: deviceKey.publicKey };
      await gesture('sign');
      let guest = currentGuest();
      let r = await linkOnce(provider, who, deviceKey, guest);
      if (r.status === 'error') return r;
      if (r.status === 200 && r.body.status === 'new') {
        // no account anywhere yet: the free Day-1 guest is made with the device key itself, then linked
        mint.setRecord({ playerKey: deviceKey });
        const m = await mint.mint(nickname || rec().nickname || undefined);
        if (m.phase !== 'minted') return { status: 'error', error: m.reason || 'mint_failed' };
        guest = currentGuest();
        await gesture('sign');
        r = await linkOnce(provider, who, deviceKey, guest);
      }
      if (r.status === 200 && (r.body.status === 'linked' || (r.body.status === 'existing' && guest && r.body.account_id === guest.account_id))) {
        const ok = await ensureDeviceKey(guest, deviceKey);
        mint.setRecord({ login });
        return { status: 'linked', account: guest.account_id, deviceKeyAdded: ok };
      }
      if (r.status === 200 && r.body.status === 'existing') return adopt(r.body.account_id, r.body.guest_key, deviceKey, login);
      if (r.status === 409 && r.body.status === 'conflict') {
        const { existing, current, resolve } = r.body;
        return {
          status: 'conflict', existing, current,
          /** 'existing': switch to the login's account (this one is kept in this browser); 'current': the login moves here. */
          async choose(choice) {
            if (choice === 'existing' && (await client.accessKey(existing, deviceKey.publicKey)) !== 'FullAccess') return { status: 'no_device_key', account: existing };
            const c = await post('/api/auth/link', { resolve, choice });
            if (c.status !== 200) return { status: 'error', error: c.body.error || 'resolve_' + c.status };
            if (c.body.status === 'existing') return adopt(c.body.account_id, c.body.guest_key, deviceKey, login);
            const ok = await ensureDeviceKey(guest, deviceKey);
            mint.setRecord({ login });
            return { status: 'linked', account: current, previous: existing, deviceKeyAdded: ok };
          },
        };
      }
      return { status: 'error', error: (r.body && r.body.error) || 'link_' + r.status };
    } catch (e) {
      return { status: 'error', error: String((e && e.message) || e).slice(0, 120) };
    }
  }

  return {
    signIn,
    /** The login this browser is signed in with, or null (a guest). */
    get login() { return rec().login || null; },
    get account() { const g = currentGuest(); return g ? g.account_id : null; },
  };
}
