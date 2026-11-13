// Account login (src/net/account-login.js, src/play/account-panel.js, relayer/lib/auth.js; docs/account-login.md):
// the browser flow against the REAL relayer linker (no network: fetch, the chain and the wallets are fakes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';
import { loginMessage, deviceKeyFromSignature, createAccountLogin, DEVICE_KEY_TEXT, PREV_KEY } from '../../src/net/account-login.js';
import { loginMessage as relayerMessage, createLinker, createNonces, createIdentityStore } from '../../../relayer/lib/auth.js';
import { signHashForTest, publicAddressForTest, personalMessageHash, hex } from '../../src/net/tee-crypto.js';
import { generateKeyPair } from '../../src/net/near-tx.js';
import { createPlayI18n } from '../../src/play/i18n.js';
import { DEFAULT_FLAGS, SPRINT_FLAGS, queryFlags } from '../../src/features.js';

const EVM_KEY = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318n;
const enc = (s) => new TextEncoder().encode(s);

/** An EVM wallet: deterministic personal_sign (as MetaMask's RFC 6979), so the device key is the same everywhere. */
function evmWallet(key = EVM_KEY) {
  const address = publicAddressForTest(key);
  const k = (text) => 1n + BigInt('0x' + hex(personalMessageHash(text)).slice(0, 30)) + key % 1000n; // deterministic per text
  const sign = (text) => '0x' + hex(signHashForTest(personalMessageHash(text), key, k(text)));
  return { kind: 'evm', connect: async () => ({ address }), signMessage: async (text) => sign(text), signDeviceKey: async () => Uint8Array.from(Buffer.from(sign(DEVICE_KEY_TEXT).slice(2), 'hex')).slice(0, 64), address };
}

/** The chain: accounts with their full-access keys; guest_of by the Day-1 key; AddKey recorded. */
function fakeChain() {
  const keys = new Map(), guests = new Map(), calls = [];
  return {
    keys, guests, calls,
    client: {
      async accessKey(acc, pk) { return (keys.get(acc) || new Set()).has(pk) ? 'FullAccess' : null; },
      async addKey({ key, signerId, newKey }) { calls.push(['addKey', signerId, newKey]); if (!(keys.get(signerId) || new Set()).has(key.publicKey)) return { ok: false }; keys.get(signerId).add(newKey); return { ok: true }; },
      async view(c, m, a) { if (m === 'guest_of') return guests.get(a.public_key) || null; throw new Error(m); },
    },
    accessKeyForRelayer: async (acc, pk) => ((keys.get(acc) || new Set()).has(pk) ? { permission: 'FullAccess' } : null),
  };
}

/** The relayer: the real linker behind a fake fetch. Counts the calls (a guest never makes one). */
function fakeRelayer(chain) {
  const nonces = createNonces(), store = createIdentityStore(null);
  const link = createLinker({ store, nonces, accessKey: chain.accessKeyForRelayer });
  const hits = [];
  const fetch = async (url, init) => {
    const path = new URL(url).pathname; hits.push(path);
    const body = init && init.body ? JSON.parse(init.body) : {};
    let r;
    if (path === '/api/auth/nonce') r = { status: 200, body: nonces.issue() };
    else if (path === '/api/auth/link') r = await link(body);
    else r = { status: 404, body: {} };
    return { status: r.status, ok: r.status === 200, json: async () => r.body };
  };
  return { fetch, hits, store };
}

/** One browser: its storage and a Day-1 mint fake that makes a guest account with whatever playerKey it holds. */
function browser(chain, name) {
  const storage = memoryStorage();
  let rec = {};
  const mint = {
    get record() { return { ...rec }; },
    setRecord(p) { rec = { ...rec, ...p }; },
    async mint(nickname) {
      if (!rec.playerKey) rec.playerKey = await generateKeyPair();
      if (rec.minted && rec.guest) return { phase: 'minted' };
      const account = `${name}${chain.guests.size}.guests.testnet`;
      chain.keys.set(account, new Set([rec.playerKey.publicKey]));
      const g = { account_id: account, token_id: 't' + chain.guests.size, minted: true, nickname: nickname || name };
      chain.guests.set(rec.playerKey.publicKey, g);
      rec = { ...rec, guest: g, minted: true, nickname: nickname || name };
      return { phase: 'minted' };
    },
  };
  return { storage, mint };
}
const loginFor = (b, chain, rel) => createAccountLogin({ relayer: 'https://relayer.test', guests: 'guests.testnet', mint: b.mint, client: chain.client, storage: b.storage, fetch: rel.fetch });

test('the browser builds exactly the message the relayer verifies', () => {
  const f = { kind: 'sol', address: 'Abc', account: 'ann.guests.testnet', deviceKey: 'ed25519:K', nonce: 'ab'.repeat(32), expires: '2026-11-13T12:00:00.000Z' };
  assert.equal(loginMessage(f), relayerMessage(f));
  assert.equal(loginMessage({ ...f, account: null }), relayerMessage({ ...f, account: null }));
});

test('the device key is the same for the same wallet signature and different for another', async () => {
  const sig = new Uint8Array(64).fill(7);
  const a = await deviceKeyFromSignature(sig), b = await deviceKeyFromSignature(sig), c = await deviceKeyFromSignature(new Uint8Array(64).fill(8));
  assert.deepEqual(a, b);
  assert.notEqual(a.publicKey, c.publicKey);
  assert.match(a.publicKey, /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/);
  await assert.rejects(deviceKeyFromSignature(new Uint8Array(10)));
});

test('a guest starts without any login provider: nothing calls the relayer or a wallet', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain), b = browser(chain, 'ann');
  await b.mint.mint('Ann'); // the Day-1 guest, as today
  const login = loginFor(b, chain, rel);
  assert.equal(login.login, null);
  assert.equal(login.account, 'ann0.guests.testnet');
  assert.deepEqual(rel.hits, []);
  // and the panel's first button just plays on as a guest, without building the login at all
  const { doc } = installDom(); doc.listeners = {}; doc.addEventListener = (t, fn) => { (doc.listeners[t] ||= []).push(fn); }; doc.removeEventListener = () => {};
  const { openAccountPanel } = await import('../../src/play/account-panel.js');
  const i18n = createPlayI18n('en');
  let built = 0;
  const p = openAccountPanel({ doc, t: (k, a) => i18n.t(k, a), makeLogin: async () => { built++; return login; }, wallets: { discoverEvm: async () => [], discoverSolana: () => [] } });
  const first = p.el.querySelector('.acct-guest');
  assert.equal(first.textContent, 'Play as guest');
  assert.equal(p.el.querySelector('.acct-card').children[2], first, 'the guest button comes first, before every login');
  assert.ok(p.el.textContent.includes('Play as guest: your progress is saved in this browser only. Sign in any time to keep it on every device.'));
  assert.ok(p.el.textContent.includes('Your account lives on NEAR testnet. Nothing here has real-world value.'));
  first.click();
  assert.deepEqual(await p.done, { status: 'guest' });
  assert.equal(built, 0);
  assert.equal(doc.body.querySelector('.acct'), null, 'closed');
});

test('the panel closes with a tap outside the card', async () => {
  const { doc } = installDom(); doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  const { openAccountPanel } = await import('../../src/play/account-panel.js');
  const i18n = createPlayI18n('ru');
  const p = openAccountPanel({ doc, t: (k, a) => i18n.t(k, a), makeLogin: async () => null, wallets: { discoverEvm: async () => [], discoverSolana: () => [] } });
  assert.equal(p.el.querySelector('.acct-guest').textContent, 'Играть как гость');
  p.el.dispatchEvent({ type: 'pointerdown', target: p.el });
  assert.deepEqual(await p.done, { status: 'guest' });
});

test('guest -> sign in later: the CURRENT guest account is kept (same id) and the device key is added to it', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain), b = browser(chain, 'ann');
  await b.mint.mint('Ann');
  const before = b.mint.record.guest.account_id;
  const r = await loginFor(b, chain, rel).signIn(evmWallet());
  assert.equal(r.status, 'linked');
  assert.equal(r.account, before);
  assert.equal(b.mint.record.guest.account_id, before, 'silk, items, NFTs stay on the same account');
  assert.equal(chain.calls.filter((c) => c[0] === 'addKey').length, 1);
  assert.equal(b.mint.record.login.kind, 'evm');
});

test('the same login on another device restores the same account (no server-held key: the wallet derives it)', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  await loginFor(a, chain, rel).signIn(evmWallet());
  const phone = browser(chain, 'phone'); // a fresh device, no guest yet
  const r = await loginFor(phone, chain, rel).signIn(evmWallet());
  assert.deepEqual(r, { status: 'restored', account: 'ann0.guests.testnet' });
  assert.equal(phone.mint.record.guest.account_id, 'ann0.guests.testnet');
  assert.equal(phone.mint.record.guest.token_id, 't0', 'the Day-1 record comes back through guest_of');
  assert.equal(phone.mint.record.minted, true);
  assert.equal(chain.guests.size, 1, 'no second guest was made');
});

test('a brand-new player who signs in first gets one guest account made with the device key, then linked', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain), b = browser(chain, 'new');
  const r = await loginFor(b, chain, rel).signIn(evmWallet(), { nickname: 'Nova' });
  assert.equal(r.status, 'linked');
  assert.equal(chain.guests.size, 1);
  assert.equal(chain.calls.length, 0, 'the device key is the guest key: no AddKey needed');
  const other = browser(chain, 'x');
  assert.equal((await loginFor(other, chain, rel).signIn(evmWallet())).account, r.account);
});

test('conflict: the login has another account; the player is asked; keeping either drops nothing', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  await loginFor(a, chain, rel).signIn(evmWallet());
  const b = browser(chain, 'bob'); await b.mint.mint('Bob');
  const bobAccount = b.mint.record.guest.account_id, bobKey = b.mint.record.playerKey;
  const r = await loginFor(b, chain, rel).signIn(evmWallet());
  assert.equal(r.status, 'conflict');
  assert.equal(r.existing, 'ann0.guests.testnet');
  assert.equal(r.current, bobAccount);
  assert.equal(b.mint.record.guest.account_id, bobAccount, 'nothing changes until the player chooses');
  // keep the login's account: this browser switches, and the Bob account (with its key) is kept in this browser
  const kept = await r.choose('existing');
  assert.deepEqual(kept, { status: 'restored', account: 'ann0.guests.testnet' });
  const prev = JSON.parse(b.storage.getItem(PREV_KEY));
  assert.equal(prev[0].guest.account_id, bobAccount);
  assert.equal(prev[0].playerKey.secretKey, bobKey.secretKey);
});

test('conflict, keep this browser\'s account: the login moves here, the old account stays in the history', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  await loginFor(a, chain, rel).signIn(evmWallet());
  const b = browser(chain, 'bob'); await b.mint.mint('Bob');
  const r = await loginFor(b, chain, rel).signIn(evmWallet());
  const moved = await r.choose('current');
  assert.equal(moved.status, 'linked');
  assert.equal(moved.previous, 'ann0.guests.testnet');
  const rec = rel.store.get('evm:' + evmWallet().address.toLowerCase());
  assert.equal(rec.account, b.mint.record.guest.account_id);
  assert.equal(rec.history[0].account, 'ann0.guests.testnet');
});

test('a wallet whose key never reached the account is told so, and the browser is not switched', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  await loginFor(a, chain, rel).signIn(evmWallet());
  for (const set of chain.keys.values()) for (const k of [...set]) if (k !== a.mint.record.playerKey.publicKey) set.delete(k); // AddKey lost
  const phone = browser(chain, 'phone');
  assert.equal((await loginFor(phone, chain, rel).signIn(evmWallet())).status, 'no_device_key');
  assert.equal(phone.mint.record.guest, undefined);
});

test('a refused wallet signature ends in an error and leaves the guest as it was', async () => {
  const chain = fakeChain(), rel = fakeRelayer(chain), b = browser(chain, 'ann');
  await b.mint.mint('Ann');
  const w = evmWallet(); w.signMessage = async () => { throw new Error('User rejected'); };
  const r = await loginFor(b, chain, rel).signIn(w);
  assert.equal(r.status, 'error');
  assert.equal(b.mint.record.login, undefined);
  assert.equal(b.mint.record.guest.account_id, 'ann0.guests.testnet');
});

test('the accountLogin flag is off by default; ?ff=accountLogin switches it on for one page, ?ff=all leaves it off', () => {
  assert.equal(DEFAULT_FLAGS.accountLogin, false);
  assert.deepEqual(queryFlags('?ff=accountLogin'), { accountLogin: true });
  assert.ok(!SPRINT_FLAGS.includes('accountLogin'));
});

test('NEAR through NEAR Connect: the wallet signs NEP-413 twice; the relayer checks it with the account\'s full-access key', async () => {
  const { nearConnectProvider, sigToBytes, bestNearProvider } = await import('../../src/net/wallets.js');
  const { nep413Hash } = await import('../../../relayer/lib/auth.js');
  const { importSecretKey } = await import('../../src/net/near-tx.js');
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const nearKey = await generateKeyPair(), signer = await importSecretKey(nearKey.secretKey);
  chain.keys.set('ann.testnet', new Set([nearKey.publicKey])); // the player's own NEAR account (a HOT or Meteor key)
  const seen = [];
  const wallet = { async signMessage({ message, recipient, nonce, network }) { seen.push({ recipient, network, n: nonce.length }); const sig = await signer.sign(nep413Hash(message, Buffer.from(nonce), recipient)); return { accountId: 'ann.testnet', publicKey: nearKey.publicKey, signature: Buffer.from(sig).toString('base64') }; } };
  const provider = nearConnectProvider({ connector: async () => ({ connect: async () => wallet }) });
  const b = browser(chain, 'ann'); await b.mint.mint('Ann');
  const r = await loginFor(b, chain, rel).signIn(provider);
  assert.equal(r.status, 'linked');
  assert.deepEqual(seen.map((s) => [s.recipient, s.network, s.n]), [['forget-to-foresee', 'mainnet', 32], ['forget-to-foresee', 'mainnet', 32]]);
  assert.ok(rel.store.get('near:ann.testnet'));
  // the same NEAR account on a phone restores the same game account
  const phone = browser(chain, 'phone');
  assert.equal((await loginFor(phone, chain, rel).signIn(nearConnectProvider({ connector: async () => ({ connect: async () => wallet }) }))).account, 'ann0.guests.testnet');
  // signatures in base64, base58 or hex decode the same
  const raw = new Uint8Array(64).fill(9);
  assert.deepEqual(sigToBytes(Buffer.from(raw).toString('base64')), raw);
  assert.deepEqual(sigToBytes('0x' + Buffer.from(raw).toString('hex')), raw);
  // NEAR Connect unreachable (CDN down): the panel falls back to MyNearWallet directly
  assert.equal((await bestNearProvider({ connector: async () => { throw new Error('offline'); } })).id, 'mynearwallet');
});

test('HOT Wallet through NEAR Connect: one approval connects and signs the device-key text; the nonce travels as a plain array; an implicit account links the guest', async () => {
  const { nearConnectProvider, signedOf, nonceFor } = await import('../../src/net/wallets.js');
  const { nep413Hash } = await import('../../../relayer/lib/auth.js');
  const { importSecretKey, b58decode } = await import('../../src/net/near-tx.js');
  const chain = fakeChain(), rel = fakeRelayer(chain);
  const hotKey = await generateKeyPair(), signer = await importSecretKey(hotKey.secretKey);
  const implicit = Buffer.from(b58decode(hotKey.publicKey.replace('ed25519:', ''))).toString('hex'); // a HOT account: 64 hex of its key
  const signed = async ({ message, recipient, nonce }) => ({ accountId: implicit, publicKey: hotKey.publicKey, signature: Buffer.from(await signer.sign(nep413Hash(message, Buffer.from(nonce), recipient))).toString('base64') });
  const asked = [];
  /** HOT's executor: every request is JSON on its way to the wallet, so only a plain-array nonce survives. */
  const hot = {
    manifest: { id: 'hot-wallet' },
    async signMessage(p) { asked.push('signMessage'); const sent = JSON.parse(JSON.stringify(p)); if (!Array.isArray(sent.nonce)) return new Promise(() => {}); return signed(sent); },
  };
  const connector = () => {
    const on = {};
    return {
      on(ev, cb) { on[ev] = cb; },
      async connect(input) { // signInAndSignMessage: HOT answers flat, [{accountId, publicKey, signature}]
        asked.push('connect'); assert.equal(input.signMessageParams.recipient, 'forget-to-foresee'); assert.equal(input.signMessageParams.nonce.length, 32);
        on['wallet:signInAndSignMessage']({ wallet: hot, accounts: [await signed(input.signMessageParams)], success: true });
        return hot;
      },
    };
  };
  const b = browser(chain, 'owner'); await b.mint.mint('Owner');
  const c1 = connector();
  const r = await loginFor(b, chain, rel).signIn(nearConnectProvider({ connector: async () => c1 }));
  assert.deepEqual([r.status, r.account, r.deviceKeyAdded], ['linked', 'owner0.guests.testnet', true]);
  assert.deepEqual(asked, ['connect', 'signMessage']); // two wallet approvals in all, not three
  assert.equal(rel.store.get('near:' + implicit).account, 'owner0.guests.testnet');
  assert.equal(b.mint.record.login.address, implicit);
  // the device key is the same whichever step signed its text: another browser (a wallet that only connects) restores the account
  const plain = { manifest: { id: 'hot-wallet' }, signMessage: hot.signMessage };
  const phone = browser(chain, 'phone');
  const r2 = await loginFor(phone, chain, rel).signIn(nearConnectProvider({ connector: async () => ({ connect: async () => plain }) }));
  assert.deepEqual([r2.status, r2.account], ['restored', 'owner0.guests.testnet']);
  // the answer shapes wallets give
  assert.deepEqual(signedOf({ accountId: 'a.near', publicKey: 'ed25519:k', signedMessage: { accountId: 'a.near', publicKey: 'ed25519:k', signature: 'c2ln' } }), { accountId: 'a.near', publicKey: 'ed25519:k', signature: 'c2ln' });
  assert.deepEqual(signedOf({ account_id: 'a.near', public_key: 'ed25519:k', signature: [1, 2, 3] }), { accountId: 'a.near', publicKey: 'ed25519:k', signature: 'AQID' });
  assert.equal(signedOf({ accountId: 'a.near', publicKey: 'ed25519:k' }), null); // connected, nothing signed
  assert.equal(signedOf(null), null);
  const n = new Uint8Array([1, 2]);
  assert.deepEqual(nonceFor(hot, n), [1, 2]);
  assert.equal(nonceFor({ manifest: { id: 'meteor-wallet' } }, n), n);
});

test('while a wallet is being asked the panel stays: a tap outside or Esc does not drop the sign-in; the Continue step is one clear button', async () => {
  const { doc } = installDom(); let onKey = null; doc.addEventListener = (ev, cb) => { if (ev === 'keydown') onKey = cb; }; doc.removeEventListener = () => {};
  const { openAccountPanel } = await import('../../src/play/account-panel.js');
  const i18n = createPlayI18n('en');
  let finish; const steps = [];
  const login = { signIn: async (provider, { gesture }) => { await gesture('connect'); steps.push('connected'); await gesture('sign'); steps.push('signed'); return new Promise((r) => { finish = r; }); } };
  const wallets = { discoverEvm: async () => [], discoverSolana: () => [], bestNearProvider: async () => ({ kind: 'near' }) };
  const p = openAccountPanel({ doc, t: (k, a) => i18n.t(k, a), makeLogin: async () => login, wallets });
  const nearBtn = [...p.el.querySelectorAll('.acct-row .acct-btn')].find((x) => x.textContent === i18n.t('acct.near'));
  nearBtn.dispatchEvent({ type: 'click', target: nearBtn });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(steps, ['connected']);
  const go = p.el.querySelector('.acct-status .acct-go');
  assert.equal(go.textContent, 'Continue in your wallet');
  p.el.dispatchEvent({ type: 'pointerdown', target: p.el }); // a stray tap on the way back from the wallet
  if (onKey) onKey({ key: 'Escape', stopPropagation() {} });
  assert.ok(p.el.querySelector('.acct-card'), 'still open');
  go.dispatchEvent({ type: 'click', target: go });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(steps, ['connected', 'signed']);
  assert.equal(p.el.querySelector('.acct-status').textContent, 'Waiting for your wallet…');
  finish({ status: 'error', error: 'wallet_closed' });
  await new Promise((r) => setTimeout(r, 5));
  assert.match(p.el.querySelector('.acct-status').textContent, /wallet_closed/);
  p.el.dispatchEvent({ type: 'pointerdown', target: p.el }); // idle again: a tap outside closes
  assert.deepEqual(await p.done, { status: 'guest' });
});

// ---------- passkeys: the real provider (src/net/wallets.js) against a fake authenticator and the real linker ----------
/** A synced passkey: one P-256 key and PRF secret shared by every "device" (as iCloud Keychain / Google Password Manager). */
async function fakePasskey({ prf = true, origin = 'https://spacexceo.github.io' } = {}) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  const rawId = crypto.getRandomValues(new Uint8Array(20)), secret = crypto.getRandomValues(new Uint8Array(32));
  const sha = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
  const der = (raw) => { const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); return b[0] & 0x80 ? [0, ...b] : [...b]; }; const r = int(raw.slice(0, 32)), s = int(raw.slice(32)); return new Uint8Array([0x30, r.length + s.length + 4, 2, r.length, ...r, 2, s.length, ...s]); };
  const u64 = (u8) => Buffer.from(u8).toString('base64url');
  const ext = async () => (prf ? { prf: { results: { first: (await sha(new Uint8Array([...secret, 1]))).buffer } } } : {});
  const creds = {
    calls: [],
    async create(o) { creds.calls.push('create'); return { rawId: rawId.buffer, response: { getPublicKey: () => spki.buffer }, getClientExtensionResults: () => ({}) }; },
    async get(o) {
      creds.calls.push('get');
      const cdj = enc(JSON.stringify({ type: 'webauthn.get', challenge: u64(new Uint8Array(o.publicKey.challenge)), origin }));
      const authData = new Uint8Array([...(await sha(enc(new URL(origin).hostname))), 0x05, 0, 0, 0, 1]);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new Uint8Array([...authData, ...(await sha(cdj))])));
      const e = await ext();
      return { rawId: rawId.buffer, response: { authenticatorData: authData.buffer, clientDataJSON: cdj.buffer, signature: der(raw).buffer }, getClientExtensionResults: () => e };
    },
  };
  return creds;
}

test('passkey: create links the current guest; the same synced passkey on another device restores it via PRF', async () => {
  const { passkeyProvider } = await import('../../src/net/wallets.js');
  const chain = fakeChain(), rel = fakeRelayer(chain), creds = await fakePasskey();
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  const r = await loginFor(a, chain, rel).signIn(passkeyProvider({ mode: 'create', creds, rpId: 'spacexceo.github.io', storage: a.storage }));
  assert.equal(r.status, 'linked'); assert.equal(r.account, 'ann0.guests.testnet');
  assert.equal(a.mint.record.login.kind, 'passkey');
  const b = browser(chain, 'bo');
  const r2 = await loginFor(b, chain, rel).signIn(passkeyProvider({ mode: 'get', creds, rpId: 'spacexceo.github.io', storage: b.storage }));
  assert.deepEqual(r2, { status: 'restored', account: 'ann0.guests.testnet' });
});

test('passkey without PRF: works on this device; another device is told honestly it has no key yet', async () => {
  const { passkeyProvider } = await import('../../src/net/wallets.js');
  const chain = fakeChain(), rel = fakeRelayer(chain), creds = await fakePasskey({ prf: false });
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  assert.equal((await loginFor(a, chain, rel).signIn(passkeyProvider({ mode: 'create', creds, rpId: 'spacexceo.github.io', storage: a.storage }))).status, 'linked');
  const b = browser(chain, 'bo');
  assert.equal((await loginFor(b, chain, rel).signIn(passkeyProvider({ mode: 'get', creds, rpId: 'spacexceo.github.io', storage: b.storage }))).status, 'no_device_key');
});

test('passkey from a foreign origin is refused by the relayer', async () => {
  const { passkeyProvider } = await import('../../src/net/wallets.js');
  const chain = fakeChain(), rel = fakeRelayer(chain), creds = await fakePasskey({ origin: 'https://evil.example' });
  const a = browser(chain, 'ann'); await a.mint.mint('Ann');
  const r = await loginFor(a, chain, rel).signIn(passkeyProvider({ mode: 'create', creds, rpId: 'evil.example', storage: a.storage }));
  assert.deepEqual(r, { status: 'error', error: 'bad_origin' });
});

test('the panel offers passkeys first when the browser supports them', async () => {
  const { doc } = installDom(); doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  const { openAccountPanel } = await import('../../src/play/account-panel.js');
  const i18n = createPlayI18n('en');
  const p = openAccountPanel({ doc, t: (k, a) => i18n.t(k, a), makeLogin: async () => null, wallets: { passkeySupported: () => true, discoverEvm: async () => [], discoverSolana: () => [] } });
  const rows = [...p.el.querySelectorAll('.acct-row .acct-btn')].map((b) => b.textContent);
  assert.equal(rows[0], 'Sign in with a passkey (Face ID, fingerprint, device PIN)'); assert.equal(rows[1], 'Create a passkey');
  const q = openAccountPanel({ doc, t: (k, a) => i18n.t(k, a), makeLogin: async () => null, wallets: { passkeySupported: () => false, discoverEvm: async () => [], discoverSolana: () => [] } });
  assert.ok(![...q.el.querySelectorAll('.acct-row .acct-btn')].some((b) => /passkey/.test(b.textContent)));
});
