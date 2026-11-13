import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AUTH, loginMessage, verifyLogin, verifyGuest, nep413Hash, createNonces, createIdentityStore, createLinker, identityOf, sigBytes } from '../lib/auth.js';
import { signHashForTest, publicAddressForTest, personalMessageHash, hex } from '../lib/tee-crypto.js';
import { generateKeyPair, importSecretKey, b58encode, b58decode } from '../lib/near-tx.js';

const EVM_KEY = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318n;
const EVM_ADDR = publicAddressForTest(EVM_KEY);
const evmSign = (text, k = EVM_KEY) => '0x' + hex(signHashForTest(personalMessageHash(text), k));
const NONCE = 'ab'.repeat(32);
const fields = (o = {}) => ({ kind: 'evm', address: EVM_ADDR, account: null, deviceKey: null, nonce: NONCE, expires: '2026-11-13T12:10:00.000Z', ...o });

async function edKey() {
  const kp = await generateKeyPair();
  const k = await importSecretKey(kp.secretKey);
  return { ...kp, sign: async (bytes) => k.sign(bytes) };
}
const b64 = (u8) => Buffer.from(u8).toString('base64');
const solAddress = (kp) => kp.publicKey.replace(/^ed25519:/, '');

test('the message names the login, the account, the device key, the nonce and the expiry, and says it is testnet', () => {
  const m = loginMessage(fields({ account: 'ann.guests.testnet', deviceKey: 'ed25519:abc' }));
  for (const s of [`Login: evm:${EVM_ADDR}`, 'Game account: ann.guests.testnet', 'Device key: ed25519:abc', `Nonce: ${NONCE}`, 'Expires: 2026-11-13T12:10:00.000Z', 'NEAR testnet', 'nothing here has real-world value']) assert.ok(m.includes(s), s);
  assert.ok(loginMessage(fields()).includes('Game account: new'));
});

test('EVM personal_sign: the right address passes; another key, another text or garbage fails', async () => {
  const m = loginMessage(fields());
  assert.deepEqual(await verifyLogin({ kind: 'evm', address: EVM_ADDR, signature: evmSign(m) }, m, NONCE), { ok: true, identity: 'evm:' + EVM_ADDR.toLowerCase() });
  assert.equal((await verifyLogin({ kind: 'evm', address: EVM_ADDR, signature: evmSign(m, 0x1234n) }, m, NONCE)).ok, false);
  assert.equal((await verifyLogin({ kind: 'evm', address: EVM_ADDR, signature: evmSign(m + 'x') }, m, NONCE)).ok, false);
  assert.equal((await verifyLogin({ kind: 'evm', address: EVM_ADDR, signature: 'nope' }, m, NONCE)).ok, false);
  assert.equal((await verifyLogin({ kind: 'evm', address: '0x12', signature: evmSign(m) }, m, NONCE)).error, 'bad_login');
});

test('Solana signMessage: ed25519 over the UTF-8 text with the base58 address (base58 or base64 signature)', async () => {
  const kp = await edKey(), addr = solAddress(kp);
  const m = loginMessage(fields({ kind: 'sol', address: addr }));
  const sig = await kp.sign(new TextEncoder().encode(m));
  assert.equal((await verifyLogin({ kind: 'sol', address: addr, signature: b58encode(sig) }, m, NONCE)).identity, 'sol:' + addr);
  assert.equal((await verifyLogin({ kind: 'sol', address: addr, signature: b64(sig) }, m, NONCE)).ok, true);
  const other = await edKey();
  assert.equal((await verifyLogin({ kind: 'sol', address: solAddress(other), signature: b64(sig) }, m, NONCE)).ok, false);
});

test('NEAR NEP-413: a full-access key of the named account passes; a function-call key or a bad signature fails; implicit = hex(key)', async () => {
  const kp = await edKey();
  const m = loginMessage(fields({ kind: 'near', address: 'ann.testnet' }));
  const sig = b64(await kp.sign(nep413Hash(m, Buffer.from(NONCE, 'hex'))));
  const fa = async (acc, pk) => (acc === 'ann.testnet' && pk === kp.publicKey ? { permission: 'FullAccess' } : null);
  assert.equal((await verifyLogin({ kind: 'near', address: 'ann.testnet', publicKey: kp.publicKey, signature: sig }, m, NONCE, { accessKey: fa })).identity, 'near:ann.testnet');
  assert.equal((await verifyLogin({ kind: 'near', address: 'ann.testnet', publicKey: kp.publicKey, signature: sig }, m, NONCE, { accessKey: async () => ({ permission: { FunctionCall: {} } }) })).error, 'not_full_access_key');
  assert.equal((await verifyLogin({ kind: 'near', address: 'ann.testnet', publicKey: kp.publicKey, signature: sig }, m + '!', NONCE, { accessKey: fa })).error, 'bad_signature');
  // the NEP-413 recipient is part of the signed payload
  const wrongRecipient = b64(await kp.sign(nep413Hash(m, Buffer.from(NONCE, 'hex'), 'other.app')));
  assert.equal((await verifyLogin({ kind: 'near', address: 'ann.testnet', publicKey: kp.publicKey, signature: wrongRecipient }, m, NONCE, { accessKey: fa })).ok, false);
  const imp = Buffer.from(b58decode(kp.publicKey.replace('ed25519:', ''))).toString('hex');
  const mi = loginMessage(fields({ kind: 'near', address: imp }));
  const si = b64(await kp.sign(nep413Hash(mi, Buffer.from(NONCE, 'hex'))));
  assert.equal((await verifyLogin({ kind: 'near', address: imp, publicKey: kp.publicKey, signature: si }, mi, NONCE)).ok, true);
});

test('the NEP-413 payload matches the borsh layout (tag, message, nonce, recipient, no callback)', () => {
  const h = nep413Hash('hi', Buffer.alloc(32, 7), 'r');
  const expect = createHash('sha256').update(Buffer.concat([Buffer.from([0x9d, 0x01, 0x00, 0x80]), Buffer.from([2, 0, 0, 0]), Buffer.from('hi'), Buffer.alloc(32, 7), Buffer.from([1, 0, 0, 0]), Buffer.from('r'), Buffer.from([0])])).digest();
  assert.deepEqual(h, expect);
  assert.equal(AUTH.nep413Tag, 2 ** 31 + 413);
});

test('nonces are single use and expire', () => {
  let t = 1_000;
  const n = createNonces({ now: () => t, ttlMs: 100 });
  const a = n.issue();
  assert.match(a.nonce, /^[0-9a-f]{64}$/);
  assert.equal(n.take(a.nonce), a.expires);
  assert.equal(n.take(a.nonce), null, 'replayed');
  const b = n.issue(); t += 101;
  assert.equal(n.take(b.nonce), null, 'expired');
  assert.equal(n.take('ff'.repeat(32)), null, 'unknown');
});

test('identity ids are normalised; signature text decodes from hex, base58 and base64', () => {
  assert.equal(identityOf('evm', EVM_ADDR.toUpperCase().replace('0X', '0x')), 'evm:' + EVM_ADDR.toLowerCase());
  assert.equal(identityOf('near', 'Bad..name'), null);
  assert.equal(identityOf('x', 'a'), null);
  assert.equal(sigBytes('0x0102').length, 2);
  assert.equal(sigBytes(b64(new Uint8Array(64))).length, 64);
});

// ---- the link flow ------------------------------------------------------------------------------------------------
function harness() {
  let t = Date.UTC(2026, 10, 13, 12);
  const dir = mkdtempSync(join(tmpdir(), 'ftf-auth-'));
  const file = join(dir, 'auth', 'identities.json');
  const store = createIdentityStore(file);
  const nonces = createNonces({ now: () => t });
  const keys = new Map(); // account -> public key (full access)
  const accessKey = async (acc, pk) => (keys.get(acc) === pk ? { permission: 'FullAccess' } : null);
  const link = createLinker({ store, nonces, accessKey, now: () => t });
  return { link, store, nonces, keys, file, advance: (ms) => { t += ms; } };
}
/** One signed link request: the EVM login and, when given, the guest account proof. */
async function request(h, { evmKey = EVM_KEY, guest = null, deviceKey = null, expires = null } = {}) {
  const { nonce, expires: exp } = h.nonces.issue();
  const address = publicAddressForTest(evmKey);
  const msg = loginMessage({ kind: 'evm', address, account: guest ? guest.account : null, deviceKey, nonce, expires: expires || exp });
  const body = { kind: 'evm', address, signature: evmSign(msg, evmKey), nonce, expires: expires || exp, device_key: deviceKey };
  if (guest) body.account = { account_id: guest.account, public_key: guest.kp.publicKey, signature: b64(await guest.kp.sign(new TextEncoder().encode(msg))), guest_key: guest.kp.publicKey };
  return body;
}
async function guestOf(h, account) { const kp = await edKey(); h.keys.set(account, kp.publicKey); return { account, kp }; }

test('guest -> sign in later: the login links to the CURRENT guest account (same account id), stored without secrets', async () => {
  const h = harness();
  const g = await guestOf(h, 'ann.guests.testnet');
  const r = await h.link(await request(h, { guest: g, deviceKey: 'ed25519:dev' }));
  assert.deepEqual(r, { status: 200, body: { status: 'linked', account_id: 'ann.guests.testnet' } });
  const saved = JSON.parse(readFileSync(h.file, 'utf8'));
  const rec = saved.identities['evm:' + EVM_ADDR.toLowerCase()];
  assert.equal(rec.account, 'ann.guests.testnet');
  assert.equal(rec.guest_key, g.kp.publicKey);
  assert.ok(!JSON.stringify(saved).includes('secret'), 'no secret in the file');
  if (process.platform !== 'win32') assert.equal(statSync(h.file).mode & 0o777, 0o600);
});

test('the same login on another device (no guest yet) gets the same account back', async () => {
  const h = harness();
  const g = await guestOf(h, 'ann.guests.testnet');
  await h.link(await request(h, { guest: g }));
  const r = await h.link(await request(h));
  assert.deepEqual(r.body, { status: 'existing', account_id: 'ann.guests.testnet', guest_key: g.kp.publicKey });
});

test('an unknown login with no guest answers "new" (the browser creates the guest, then links)', async () => {
  const h = harness();
  assert.deepEqual((await h.link(await request(h))).body, { status: 'new' });
});

test('a replayed or expired request is refused', async () => {
  const h = harness();
  const g = await guestOf(h, 'ann.guests.testnet');
  const body = await request(h, { guest: g });
  assert.equal((await h.link(body)).status, 200);
  assert.deepEqual(await h.link(body), { status: 401, body: { error: 'nonce_used_or_expired' } });
  const late = await request(h, { guest: g });
  h.advance(AUTH.nonceTtlMs + 1);
  assert.equal((await h.link(late)).body.error, 'nonce_used_or_expired');
  const forged = await request(h, { guest: g, expires: '2099-01-01T00:00:00.000Z' });
  assert.equal((await h.link(forged)).body.error, 'expiry_mismatch');
});

test("nobody can link someone else's guest account: the guest proof must be a full-access key of that account", async () => {
  const h = harness();
  const g = await guestOf(h, 'ann.guests.testnet');
  const thief = { account: 'ann.guests.testnet', kp: await edKey() }; // signs, but the key is not on the account
  assert.equal((await h.link(await request(h, { guest: thief }))).body.error, 'not_account_key');
  const bad = await request(h, { guest: g }); bad.account.signature = b64(new Uint8Array(64));
  assert.equal((await h.link(bad)).body.error, 'bad_account_signature');
});

test('conflict: the login already has another account -> 409 with both; keeping either drops nothing', async () => {
  const h = harness();
  const a = await guestOf(h, 'ann.guests.testnet'), b = await guestOf(h, 'bob.guests.testnet');
  await h.link(await request(h, { guest: a }));
  const c = await h.link(await request(h, { guest: b }));
  assert.equal(c.status, 409);
  assert.deepEqual({ ...c.body, resolve: 'x' }, { status: 'conflict', existing: 'ann.guests.testnet', current: 'bob.guests.testnet', resolve: 'x' });
  assert.equal(h.store.get('evm:' + EVM_ADDR.toLowerCase()).account, 'ann.guests.testnet', 'nothing changes before the choice');
  // keep the existing one: the mapping stays, the device switches
  assert.deepEqual((await h.link({ resolve: c.body.resolve, choice: 'existing' })).body, { status: 'existing', account_id: 'ann.guests.testnet', guest_key: a.kp.publicKey });
  assert.equal((await h.link({ resolve: c.body.resolve, choice: 'current' })).status, 410, 'a token answers once');
  // keep the current one: remapped, the old account kept in the history
  const c2 = await h.link(await request(h, { guest: b }));
  assert.deepEqual((await h.link({ resolve: c2.body.resolve, choice: 'current' })).body, { status: 'linked', account_id: 'bob.guests.testnet', previous: 'ann.guests.testnet' });
  const rec = h.store.get('evm:' + EVM_ADDR.toLowerCase());
  assert.equal(rec.account, 'bob.guests.testnet');
  assert.equal(rec.history[0].account, 'ann.guests.testnet');
});

test('the same guest linking again is idempotent', async () => {
  const h = harness();
  const g = await guestOf(h, 'ann.guests.testnet');
  await h.link(await request(h, { guest: g }));
  assert.equal((await h.link(await request(h, { guest: g }))).body.status, 'existing');
});

test('verifyGuest refuses a malformed account', async () => {
  assert.equal((await verifyGuest({ account_id: 'Bad Name', public_key: 'x', signature: 'y' }, 'm')).error, 'bad_account');
});

test('a NEAR login key is checked on the account\'s own network: *.testnet on testnet, other names on mainnet', async () => {
  const { accessKeyVia, networkOf } = await import('../api/auth.js');
  assert.equal(networkOf('ann.guests.testnet'), 'testnet');
  assert.equal(networkOf('ann.near'), 'mainnet');
  const hits = [];
  const client = (net) => ({ rpc: async (m, p) => { hits.push([net, p.account_id]); return { permission: 'FullAccess' }; } });
  const ak = accessKeyVia(client('testnet'), client('mainnet'));
  await ak('ann.near', 'ed25519:x'); await ak('bob.testnet', 'ed25519:y');
  assert.deepEqual(hits, [['mainnet', 'ann.near'], ['testnet', 'bob.testnet']]);
});

// ---------- passkeys (WebAuthn, ECDSA P-256) ----------
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { verifyPasskey } from '../lib/auth.js';
const u64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = (b) => createHash('sha256').update(b).digest();
function passkey() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { id: u64(Buffer.from('credential-id-0123456789')), spki: u64(publicKey.export({ format: 'der', type: 'spki' })), privateKey };
}
/** What navigator.credentials.get returns for challenge = sha256(message), serialised as the browser sends it. */
function assertion(pk, message, { origin = 'https://spacexceo.github.io', type = 'webauthn.get', flags = 0x05, challengeOf = message } = {}) {
  const cdj = Buffer.from(JSON.stringify({ type, challenge: u64(sha(Buffer.from(challengeOf, 'utf8'))), origin, crossOrigin: false }));
  const authData = Buffer.concat([sha(new URL(origin).hostname), Buffer.from([flags]), Buffer.from([0, 0, 0, 1])]);
  const signature = nodeSign('sha256', Buffer.concat([authData, sha(cdj)]), { key: pk.privateKey, dsaEncoding: 'der' });
  return JSON.stringify({ authenticatorData: u64(authData), clientDataJSON: u64(cdj), signature: u64(signature) });
}
const ORIGINS = ['https://spacexceo.github.io'];

test('passkey: a good assertion passes; another key, another text, a foreign origin, no user presence or a create-type fails', () => {
  const pk = passkey(), other = passkey();
  const m = loginMessage(fields({ kind: 'passkey', address: pk.id }));
  assert.deepEqual(verifyPasskey(assertion(pk, m), m, pk.spki, { origins: ORIGINS }), { ok: true });
  assert.equal(verifyPasskey(assertion(other, m), m, pk.spki, { origins: ORIGINS }).error, 'bad_signature');
  assert.equal(verifyPasskey(assertion(pk, m, { challengeOf: m + 'x' }), m, pk.spki, { origins: ORIGINS }).error, 'bad_challenge');
  assert.equal(verifyPasskey(assertion(pk, m, { origin: 'https://evil.example' }), m, pk.spki, { origins: ORIGINS }).error, 'bad_origin');
  assert.equal(verifyPasskey(assertion(pk, m, { flags: 0x04 }), m, pk.spki, { origins: ORIGINS }).error, 'not_user_present');
  assert.equal(verifyPasskey(assertion(pk, m, { type: 'webauthn.create' }), m, pk.spki, { origins: ORIGINS }).error, 'bad_signature');
  assert.equal(verifyPasskey('garbage', m, pk.spki, { origins: ORIGINS }).error, 'bad_signature');
  assert.equal(verifyPasskey(assertion(pk, m), m, 'not-a-key', { origins: ORIGINS }).error, 'bad_public_key');
  assert.equal(identityOf('passkey', 'short'), null);
});

function passkeyHarness() {
  let t = Date.UTC(2026, 10, 13, 12);
  const store = createIdentityStore(join(mkdtempSync(join(tmpdir(), 'ftf-pk-')), 'auth', 'identities.json'));
  const nonces = createNonces({ now: () => t });
  const keys = new Map();
  const accessKey = async (acc, pk) => (keys.get(acc) === pk ? { permission: 'FullAccess' } : null);
  return { store, nonces, keys, link: createLinker({ store, nonces, accessKey, origins: ORIGINS, now: () => t }), advance: (ms) => { t += ms; } };
}
async function pkRequest(h, pk, { guest = null, sendKey = true, signer = pk, expires = null } = {}) {
  const { nonce, expires: exp } = h.nonces.issue();
  const msg = loginMessage({ kind: 'passkey', address: pk.id, account: guest ? guest.account : null, deviceKey: 'ed25519:dev', nonce, expires: expires || exp });
  const body = { kind: 'passkey', address: pk.id, public_key: sendKey ? signer.spki : undefined, signature: assertion(signer, msg), nonce, expires: expires || exp, device_key: 'ed25519:dev' };
  if (guest) body.account = { account_id: guest.account, public_key: guest.kp.publicKey, signature: b64(await guest.kp.sign(new TextEncoder().encode(msg))), guest_key: guest.kp.publicKey };
  return body;
}

test('passkey link: pins the P-256 key to the guest; another device gets the account back; a swapped key is refused', async () => {
  const h = passkeyHarness();
  const pk = passkey();
  const kp = await edKey(); h.keys.set('ann.guests.testnet', kp.publicKey);
  const r = await h.link(await pkRequest(h, pk, { guest: { account: 'ann.guests.testnet', kp } }));
  assert.deepEqual(r.body, { status: 'linked', account_id: 'ann.guests.testnet' });
  assert.equal(h.store.get('passkey:' + pk.id).passkey_key, pk.spki);
  // a synced passkey on another device: no key sent, the pinned one verifies
  assert.deepEqual((await h.link(await pkRequest(h, pk, { sendKey: false }))).body, { status: 'existing', account_id: 'ann.guests.testnet', guest_key: kp.publicKey });
  // an attacker reusing the credential id with their own key: the pinned key wins
  const thief = { ...passkey(), id: pk.id };
  assert.equal((await h.link(await pkRequest(h, pk, { signer: thief }))).status, 401);
});

test('passkey: a replayed or expired request is refused', async () => {
  const h = passkeyHarness();
  const pk = passkey();
  const body = await pkRequest(h, pk);
  assert.deepEqual((await h.link(body)).body, { status: 'new' });
  assert.deepEqual(await h.link(body), { status: 401, body: { error: 'nonce_used_or_expired' } });
  const late = await pkRequest(h, pk);
  h.advance(AUTH.nonceTtlMs + 1);
  assert.equal((await h.link(late)).body.error, 'nonce_used_or_expired');
  assert.equal((await h.link(await pkRequest(h, pk, { expires: '2099-01-01T00:00:00.000Z' }))).body.error, 'expiry_mismatch');
});
