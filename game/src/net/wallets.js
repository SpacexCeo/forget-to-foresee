// Wallet providers for the account login (net/account-login.js), no libraries:
//   - EVM: EIP-6963 discovery (every injected wallet announces itself), else window.ethereum; EIP-191 personal_sign.
//   - Solana: the injected providers (Phantom, Solflare, Backpack, window.solana); signMessage (ed25519 over bytes).
//   - NEAR: HOT's NEAR Connect (HOT, Meteor, Intear, MyNearWallet, Nightly…), loaded from esm.sh at a pinned version
//     only when the player taps the NEAR row; if it cannot load, MyNearWallet's sign-message popup directly (the same
//     request @near-wallet-selector/my-near-wallet makes). Both answer NEP-413 (message, nonce, recipient).
// A provider: {kind, id, name, connect() -> {address, publicKey?}, signMessage(text, nonceHex) -> signature text,
// signDeviceKey() -> Uint8Array (>= 64 bytes)}. Nothing here runs until the player taps a wallet.
import { DEVICE_KEY_TEXT, RECIPIENT, deviceKeyNonce, b58, b64, unb64, toHex, fromHex } from './account-login.js';

const utf8 = (s) => new TextEncoder().encode(s);

/** EIP-6963: the injected EVM wallets that answer within `waitMs`, plus window.ethereum when none announce. */
export function discoverEvm(win = globalThis.window, waitMs = 250) {
  return new Promise((resolve) => {
    if (!win || typeof win.addEventListener !== 'function') { resolve([]); return; }
    const found = new Map();
    const on = (e) => { const d = e && e.detail; if (d && d.info && d.provider && !found.has(d.info.uuid)) found.set(d.info.uuid, { id: d.info.rdns || d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider }); };
    win.addEventListener('eip6963:announceProvider', on);
    try { win.dispatchEvent(new Event('eip6963:requestProvider')); } catch { /* old browser */ }
    setTimeout(() => {
      win.removeEventListener('eip6963:announceProvider', on);
      const list = [...found.values()];
      if (!list.length && win.ethereum) list.push({ id: 'injected', name: win.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: null, provider: win.ethereum });
      resolve(list);
    }, waitMs);
  });
}

/** An EVM provider for one discovered wallet. */
export function evmProvider(w) {
  let address = null;
  const sign = (text) => w.provider.request({ method: 'personal_sign', params: ['0x' + toHex(utf8(text)), address] });
  return {
    kind: 'evm', id: w.id, name: w.name,
    async connect() { const [a] = await w.provider.request({ method: 'eth_requestAccounts' }); if (!a) throw new Error('no_account'); address = a; return { address: a }; },
    signMessage: (text) => sign(text),
    async signDeviceKey() { return fromHex(await sign(DEVICE_KEY_TEXT)).slice(0, 64); }, // r || s (v differs between wallets)
  };
}

/** The injected Solana wallets of this page. */
export function discoverSolana(win = globalThis.window) {
  if (!win) return [];
  const out = [], seen = new Set();
  const add = (id, name, p) => { if (p && typeof p.signMessage === 'function' && !seen.has(p)) { seen.add(p); out.push({ id, name, provider: p }); } };
  add('phantom', 'Phantom', win.phantom && win.phantom.solana);
  add('solflare', 'Solflare', win.solflare);
  add('backpack', 'Backpack', win.backpack && (win.backpack.solana || win.backpack));
  add('solana', 'Solana wallet', win.solana);
  return out;
}

/** A Solana provider for one injected wallet. */
export function solanaProvider(w) {
  let address = null;
  const sig = async (text) => { const r = await w.provider.signMessage(utf8(text), 'utf8'); const s = r && (r.signature || r); return s instanceof Uint8Array ? s : Uint8Array.from(s); };
  return {
    kind: 'sol', id: w.id, name: w.name,
    async connect() {
      const r = await w.provider.connect();
      const pk = (r && r.publicKey) || w.provider.publicKey;
      address = pk && (typeof pk.toBase58 === 'function' ? pk.toBase58() : String(pk));
      if (!address) throw new Error('no_account');
      return { address };
    },
    async signMessage(text) { return b58(await sig(text)); },
    signDeviceKey: () => sig(DEVICE_KEY_TEXT),
  };
}

export const MNW_TESTNET = 'https://testnet.mynearwallet.com';
/** NEP-413 through MyNearWallet's popup: resolves {accountId, publicKey, signature (base64)}. */
export function myNearWalletSign({ message, nonce, recipient = RECIPIENT, walletUrl = MNW_TESTNET, win = globalThis.window }) {
  return new Promise((resolve, reject) => {
    const href = new URL(walletUrl); href.pathname = 'sign-message';
    href.searchParams.append('message', message);
    href.searchParams.append('nonce', b64(nonce));
    href.searchParams.append('recipient', recipient);
    href.searchParams.append('callbackUrl', win.location.href);
    const child = win.open(href.toString(), 'MyNearWallet', 'width=480,height=640');
    if (!child) { reject(new Error('popup_blocked')); return; }
    const origin = new URL(walletUrl).origin;
    const done = (fn, v) => { win.removeEventListener('message', on); clearInterval(poll); try { child.close(); } catch { /* gone */ } fn(v); };
    const on = (e) => {
      if (e.origin !== origin || !e.data) return;
      if (e.data.status === 'success' && e.data.signedRequest) done(resolve, e.data.signedRequest);
      else if (e.data.status === 'failure') done(reject, new Error(e.data.errorMessage || 'wallet_refused'));
    };
    win.addEventListener('message', on);
    const poll = setInterval(() => { if (child.closed) done(reject, new Error('wallet_closed')); }, 500);
  });
}

/** The NEAR provider (MyNearWallet). connect() is the device-key signature: it is also where the account comes from. */
export function nearProvider({ sign = myNearWalletSign } = {}) {
  let first = null;
  return {
    kind: 'near', id: 'mynearwallet', name: 'MyNearWallet',
    async connect() {
      first = await sign({ message: DEVICE_KEY_TEXT, nonce: await deviceKeyNonce() });
      if (!first || !first.accountId || !first.signature) throw new Error('no_account');
      return { address: first.accountId, publicKey: first.publicKey };
    },
    async signDeviceKey() { if (!first) throw new Error('not_connected'); return sigToBytes(first.signature); },
    async signMessage(text, nonceHex) {
      const r = await sign({ message: text, nonce: fromHex(nonceHex) });
      if (!first || r.accountId !== first.accountId) throw new Error('account_changed');
      return r.signature;
    },
  };
}

export const NEAR_CONNECT_URL = 'https://esm.sh/@hot-labs/near-connect@0.12.0?target=es2022';
let connectorP = null;
/**
 * One NearConnector for the page, loaded on first use. Mainnet: the login is the player's own NEAR account (HOT,
 * MyNearWallet, OKX… declare no testnet support); signing a message is free and moves nothing. The game account stays
 * the Day-1 guest on testnet; the relayer checks the signing key on the account's own network.
 */
export function nearConnector(load = () => import(/* @vite-ignore */ NEAR_CONNECT_URL)) {
  return (connectorP ||= load().then((m) => new m.NearConnector({ network: 'mainnet', features: { signMessage: true }, footerBranding: null }))
    .catch((e) => { connectorP = null; throw e; }));
}

/**
 * A NEAR Connect answer -> {accountId, publicKey, signature}, or null. Wallets differ: the typed shape nests it under
 * `signedMessage`, HOT's sign-in answers flat, some name the fields in snake case or give the signature as bytes.
 */
export function signedOf(a) {
  if (!a || typeof a !== 'object') return null;
  const m = a.signedMessage && typeof a.signedMessage === 'object' ? a.signedMessage : a;
  const accountId = m.accountId || m.account_id || a.accountId || a.account_id;
  const publicKey = m.publicKey || m.public_key || a.publicKey || a.public_key;
  let signature = m.signature;
  if (signature && typeof signature !== 'string') { try { signature = b64(Uint8Array.from(signature.data || signature)); } catch { signature = null; } }
  return accountId && signature ? { accountId: String(accountId), publicKey: publicKey ? String(publicKey) : undefined, signature } : null;
}
/**
 * The NEP-413 nonce as this wallet takes it. HOT's executor sends the request as JSON, where a Uint8Array turns into
 * {"0":…,"1":…}; its own sign-in step sends a plain array, so HOT gets one here too.
 */
export const nonceFor = (wallet, nonce) => (wallet && wallet.manifest && wallet.manifest.id === 'hot-wallet' ? Array.from(nonce) : nonce);

/**
 * The NEAR provider through NEAR Connect: the player picks HOT, Meteor, Intear, MyNearWallet… in its own chooser.
 * connect() is the device-key signature (it names the account, as with MyNearWallet). It is asked for inside the
 * wallet's own sign-in step (signInAndSignMessage: one approval, not two); a wallet that connects without signing is
 * asked once more.
 */
export function nearConnectProvider({ connector = nearConnector } = {}) {
  let wallet = null, first = null;
  const sign = async (message, nonce) => signedOf(await wallet.signMessage({ message, recipient: RECIPIENT, nonce: nonceFor(wallet, nonce), network: 'mainnet' }));
  return {
    kind: 'near', id: 'near-connect', name: 'NEAR Connect',
    async connect() {
      const c = await connector();
      const nonce = await deviceKeyNonce();
      let signed = null;
      const onSigned = (e) => { signed = signedOf(e && e.accounts && e.accounts[0]); };
      if (typeof c.on === 'function') c.on('wallet:signInAndSignMessage', onSigned);
      try { wallet = await c.connect({ signMessageParams: { message: DEVICE_KEY_TEXT, recipient: RECIPIENT, nonce } }); }
      finally { if (typeof c.off === 'function') c.off('wallet:signInAndSignMessage', onSigned); }
      first = signed || await sign(DEVICE_KEY_TEXT, nonce);
      if (!first) throw new Error('no_account');
      return { address: first.accountId, publicKey: first.publicKey };
    },
    async signDeviceKey() { if (!first) throw new Error('not_connected'); return sigToBytes(first.signature); },
    async signMessage(text, nonceHex) {
      const r = await sign(text, fromHex(nonceHex));
      if (!r) throw new Error('no_signature');
      if (!first || r.accountId !== first.accountId) throw new Error('account_changed');
      return r.signature;
    },
  };
}
/** A NEP-413 signature as wallets return it (base64 by the standard; some give base58 or 0x-hex) -> bytes. */
export function sigToBytes(s) {
  if (s instanceof Uint8Array) return s;
  if (/^0x[0-9a-f]+$/i.test(s)) return fromHex(s);
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) return b58decodeBytes(s);
  return unb64(s);
}
const B58A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decodeBytes(s) {
  let n = 0n; for (const c of s) n = n * 58n + BigInt(B58A.indexOf(c));
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}

/** The NEAR provider the panel uses: NEAR Connect, or MyNearWallet directly when NEAR Connect cannot load. */
export async function bestNearProvider({ connector = nearConnector } = {}) {
  try { await connector(); return nearConnectProvider({ connector }); } catch { return nearProvider(); }
}

// ---- passkeys (WebAuthn): the "email-like" login, no provider secret, no extension -----------------------------
// The passkey's P-256 key signs the login message (challenge = sha256(message)); the relayer pins the public key to the
// credential id on the first link. Device key: the PRF extension's output for a fixed salt (the same on every device
// the passkey syncs to); a browser without PRF gets a key kept in this browser only (another device then answers
// "no device key", as for a non-deterministic wallet).
const u64 = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const un64 = (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4));
const sha256 = async (u8) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', u8));
export const PASSKEY_LOCAL = 'ftf.passkey.dev.';
export const passkeySupported = (win = globalThis.window) => !!(win && win.PublicKeyCredential && win.navigator && win.navigator.credentials);

/** mode 'create' makes a new passkey; mode 'get' uses one the browser or phone already has. */
export function passkeyProvider({ mode = 'get', creds = globalThis.navigator && globalThis.navigator.credentials, rpId = globalThis.location && globalThis.location.hostname, storage = null, rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)) } = {}) {
  let rawId = null, prf = null;
  const salt = () => sha256(utf8('ftf-device-key-v1'));
  const prfOf = (cred) => { const r = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {}; const f = r && r.prf && r.prf.results && r.prf.results.first; return f ? new Uint8Array(f) : null; };
  return {
    kind: 'passkey', id: 'passkey-' + mode, name: 'Passkey',
    async connect() {
      const extensions = { prf: { eval: { first: await salt() } } };
      if (mode === 'create') {
        const cred = await creds.create({ publicKey: { challenge: rand(32), rp: { name: 'Forget to Foresee', id: rpId }, user: { id: rand(16), name: 'Forget to Foresee player', displayName: 'Forget to Foresee player' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, extensions } });
        if (!cred) throw new Error('no_passkey');
        rawId = new Uint8Array(cred.rawId); prf = prfOf(cred);
        const spki = cred.response && cred.response.getPublicKey && cred.response.getPublicKey();
        if (!spki) throw new Error('no_public_key');
        return { address: u64(rawId), publicKey: u64(new Uint8Array(spki)) };
      }
      const cred = await creds.get({ publicKey: { challenge: rand(32), rpId, userVerification: 'preferred', extensions } });
      if (!cred) throw new Error('no_passkey');
      rawId = new Uint8Array(cred.rawId); prf = prfOf(cred);
      return { address: u64(rawId) };
    },
    async signDeviceKey() {
      if (!prf && mode === 'create') { // many browsers give PRF only on an assertion: ask once with this credential
        try { const c = await creds.get({ publicKey: { challenge: rand(32), rpId, allowCredentials: [{ type: 'public-key', id: rawId }], userVerification: 'preferred', extensions: { prf: { eval: { first: await salt() } } } } }); if (c) prf = prfOf(c); } catch { /* no PRF: a local key */ }
      }
      if (prf && prf.length >= 32) return new Uint8Array([...prf.slice(0, 32), ...(await sha256(prf))]);
      const k = PASSKEY_LOCAL + u64(rawId);
      try { const s = storage && storage.getItem(k); if (s) return un64(s); } catch { /* memory only */ }
      const fresh = rand(64);
      try { if (storage) storage.setItem(k, u64(fresh)); } catch { /* memory only */ }
      return fresh;
    },
    async signMessage(text) {
      const cred = await creds.get({ publicKey: { challenge: await sha256(utf8(text)), rpId, allowCredentials: [{ type: 'public-key', id: rawId }], userVerification: 'preferred' } });
      if (!cred) throw new Error('no_passkey');
      const r = cred.response;
      return JSON.stringify({ authenticatorData: u64(new Uint8Array(r.authenticatorData)), clientDataJSON: u64(new Uint8Array(r.clientDataJSON)), signature: u64(new Uint8Array(r.signature)) });
    },
  };
}
