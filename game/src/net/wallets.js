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
 * The NEAR provider through NEAR Connect: the player picks HOT, Meteor, Intear, MyNearWallet… in its own chooser.
 * connect() is the device-key signature (it names the account, as with MyNearWallet).
 */
export function nearConnectProvider({ connector = nearConnector } = {}) {
  let wallet = null, first = null;
  const sign = async (message, nonce) => wallet.signMessage({ message, recipient: RECIPIENT, nonce, network: 'mainnet' });
  return {
    kind: 'near', id: 'near-connect', name: 'NEAR Connect',
    async connect() {
      const c = await connector();
      wallet = await c.connect();
      first = await sign(DEVICE_KEY_TEXT, await deviceKeyNonce());
      if (!first || !first.accountId || !first.signature) throw new Error('no_account');
      return { address: first.accountId, publicKey: first.publicKey };
    },
    async signDeviceKey() { if (!first) throw new Error('not_connected'); return sigToBytes(first.signature); },
    async signMessage(text, nonceHex) {
      const r = await sign(text, fromHex(nonceHex));
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
