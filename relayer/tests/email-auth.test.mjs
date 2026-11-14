// Email sign-in and account linking (lib/email-auth.js, api/auth.js): codes (hashed, 10 min, 5 tries, 5 an hour),
// no account discovery, account proofs (signed by the account's own key, once, 5 min), the email key stored encrypted
// and given back only for a proven email while it is still on the account, the methods list and unlink, the HTTP routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createIdentityStore } from '../lib/auth.js';
import { createEmailAuth, createCodes, normEmail, emailId, maskEmail, seal, unseal, proofMessage, keyFromEnv, EMAIL } from '../lib/email-auth.js';
import { authHandler } from '../api/auth.js';
import { generateKeyPair, importSecretKey } from '../lib/near-tx.js';

const ACC = 'ann-1a.guests.ftf-coordinator.testnet';
const snake = (k) => ({ public_key: k.publicKey, secret_key: k.secretKey });
const KEY = randomBytes(32);
async function rig({ ready = true } = {}) {
  let t = 1_763_100_000_000; const now = () => t;
  const dir = mkdtempSync(join(tmpdir(), 'ftf-email-'));
  const store = createIdentityStore(join(dir, 'identities.json'));
  const accountKey = await generateKeyPair(), ak = await importSecretKey(accountKey.secretKey);
  const onChain = new Map([[ACC, new Set([accountKey.publicKey])]]);
  const accessKey = async (acc, pub) => ((onChain.get(acc) || new Set()).has(pub) ? { permission: 'FullAccess' } : null);
  const outbox = [];
  const mailer = { configured: ready, send: async (to, code, purpose) => { outbox.push({ to, code, purpose }); return true; } };
  const codes = createCodes({ now });
  const email = createEmailAuth({ store, codes, mailer, accessKey, key: ready ? KEY : null, now });
  const proof = async (action, detail, acc = ACC, signer = ak, pub = accountKey.publicKey) => { t += 1; const at = now(); return { account_id: acc, public_key: pub, at, signature: Buffer.from(await signer.sign(new TextEncoder().encode(proofMessage(action, acc, detail, at)))).toString('base64') }; };
  return { email, store, outbox, onChain, proof, accountKey, adv: (ms) => { t += ms; }, dir };
}

test('emails, ids, masks, sealing', () => {
  assert.equal(normEmail('  Ann.Lee+x@Gmail.COM '), 'ann.lee+x@gmail.com'); assert.equal(normEmail('nope'), null); assert.equal(normEmail('a@b'), null);
  assert.match(emailId('a@b.co'), /^email:[0-9a-f]{64}$/); assert.ok(!emailId('a@b.co').includes('b.co'), 'the address never appears in the store');
  assert.equal(maskEmail('ann@gmail.com'), 'a***@gmail.com');
  const box = seal('ed25519:secret', KEY); assert.notEqual(box, 'ed25519:secret'); assert.equal(unseal(box, KEY), 'ed25519:secret');
  assert.throws(() => unseal(box, randomBytes(32)), 'another key cannot open it');
  assert.equal(keyFromEnv({ FTF_EMAIL_KEY_SECRET: KEY.toString('base64') }).length, 32); assert.equal(keyFromEnv({}), null); assert.equal(keyFromEnv({ FTF_EMAIL_KEY_SECRET: 'short' }), null);
});

test('codes: 6 digits, one use, 5 tries, 10 minutes, 5 an hour per email', () => {
  let t = 0; const c = createCodes({ now: () => t, rand: () => 42 });
  assert.equal(c.issue('a@b.co', 'login').code, '000042');
  assert.equal(c.take('a@b.co', '000042', 'link').error, 'code_expired', 'another purpose');
  assert.equal(c.take('a@b.co', '111111', 'login').error, 'wrong_code');
  assert.equal(c.take('a@b.co', '000042', 'login').ok, true); assert.equal(c.take('a@b.co', '000042', 'login').ok, false, 'one use');
  c.issue('a@b.co', 'login'); for (let i = 0; i < EMAIL.maxTries; i++) c.take('a@b.co', '999999', 'login');
  assert.equal(c.take('a@b.co', '000042', 'login').error, 'too_many_tries');
  c.issue('a@b.co', 'login'); t += EMAIL.codeTtlMs + 1; assert.equal(c.take('a@b.co', '000042', 'login').error, 'code_expired');
  for (let i = 0; i < 3; i++) c.issue('a@b.co', 'login');
  assert.equal(c.issue('a@b.co', 'login').error, 'too_many_codes');
});

test('link an email: proof by the account key, a code to that email, the email key must be on the account; stored encrypted', async () => {
  const r = await rig();
  const emailKey = await generateKeyPair();
  assert.equal((await r.email.start({ email: 'Ann@Gmail.com', purpose: 'link', account: { account_id: ACC, public_key: r.accountKey.publicKey, at: 0, signature: 'x' } })).body.error, 'stale_proof');
  const s = await r.email.start({ email: 'Ann@Gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com') });
  assert.equal(s.status, 200); assert.equal(r.outbox.length, 1); assert.equal(r.outbox[0].to, 'ann@gmail.com');
  const code = r.outbox[0].code;
  const linkBody = async () => ({ email: 'ann@gmail.com', code, account: await r.proof('link-email', 'ann@gmail.com|' + emailKey.publicKey), email_key: snake(emailKey) });
  assert.equal((await r.email.link(await linkBody())).body.error, 'email_key_not_on_account', 'the browser adds the key on chain first');
  await r.email.start({ email: 'ann@gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com') });
  r.onChain.get(ACC).add(emailKey.publicKey);
  const ok = await r.email.link({ ...(await linkBody()), code: r.outbox.at(-1).code });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { status: 'linked', account_id: ACC, hint: 'a***@gmail.com' });
  const file = readFileSync(join(r.dir, 'identities.json'), 'utf8');
  assert.ok(!file.includes(emailKey.secretKey.slice(8, 30)), 'the secret key is never stored in clear'); assert.ok(!file.includes('ann@gmail.com'), 'nor the address');
});

test('sign in by email: the same answer for unknown emails, the key back for a proven email, nothing once the key is off the account', async () => {
  const r = await rig();
  const emailKey = await generateKeyPair(); r.onChain.get(ACC).add(emailKey.publicKey);
  await r.email.start({ email: 'ann@gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com') });
  await r.email.link({ email: 'ann@gmail.com', code: r.outbox[0].code, account: await r.proof('link-email', 'ann@gmail.com|' + emailKey.publicKey), email_key: snake(emailKey) });
  const unknown = await r.email.start({ email: 'bob@gmail.com', purpose: 'login' });
  assert.deepEqual(unknown.body, { status: 'sent' }); assert.equal(r.outbox.length, 1, 'no mail to an unknown address');
  await r.email.start({ email: 'ann@gmail.com', purpose: 'login' });
  const code = r.outbox.at(-1).code;
  assert.equal((await r.email.login({ email: 'ann@gmail.com', code: '000000' === code ? '000001' : '000000' })).body.error, 'wrong_code');
  const ok = await r.email.login({ email: 'ann@gmail.com', code });
  assert.deepEqual(ok.body, { status: 'signed_in', account_id: ACC, key: { public_key: emailKey.publicKey, secret_key: emailKey.secretKey } });
  r.onChain.get(ACC).delete(emailKey.publicKey);
  await r.email.start({ email: 'ann@gmail.com', purpose: 'login' });
  assert.equal((await r.email.login({ email: 'ann@gmail.com', code: r.outbox.at(-1).code })).body.error, 'key_removed');
});

test('another account cannot take a linked email; proofs work once and only with a key of the account', async () => {
  const r = await rig();
  const emailKey = await generateKeyPair(); r.onChain.get(ACC).add(emailKey.publicKey);
  await r.email.start({ email: 'ann@gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com') });
  await r.email.link({ email: 'ann@gmail.com', code: r.outbox[0].code, account: await r.proof('link-email', 'ann@gmail.com|' + emailKey.publicKey), email_key: snake(emailKey) });
  const other = await generateKeyPair(), ok2 = await importSecretKey(other.secretKey); r.onChain.set('bob.guests.ftf-coordinator.testnet', new Set([other.publicKey]));
  assert.equal((await r.email.start({ email: 'ann@gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com', 'bob.guests.ftf-coordinator.testnet', ok2, other.publicKey) })).body.error, 'email_in_use');
  const p = await r.proof('list', '-');
  assert.equal((await r.email.methods({ account: p })).status, 200); assert.equal((await r.email.methods({ account: p })).body.error, 'proof_used');
  const stranger = await generateKeyPair(), sk = await importSecretKey(stranger.secretKey);
  assert.equal((await r.email.methods({ account: await r.proof('list', '-', ACC, sk, stranger.publicKey) })).body.error, 'not_account_key');
});

test('methods and unlink: the account lists its logins (email masked); unlinking an email forgets its stored key', async () => {
  const r = await rig();
  r.store.set('evm:0xabcdef0123456789abcdef0123456789abcdef01', { account: ACC, kind: 'evm', address: '0xabcdef0123456789abcdef0123456789abcdef01', linked_at: 'x', history: [] });
  const emailKey = await generateKeyPair(); r.onChain.get(ACC).add(emailKey.publicKey);
  await r.email.start({ email: 'ann@gmail.com', purpose: 'link', account: await r.proof('link-email', 'ann@gmail.com') });
  await r.email.link({ email: 'ann@gmail.com', code: r.outbox[0].code, account: await r.proof('link-email', 'ann@gmail.com|' + emailKey.publicKey), email_key: snake(emailKey) });
  const m = (await r.email.methods({ account: await r.proof('list', '-') })).body;
  assert.deepEqual(m.methods.map((x) => [x.kind, x.hint]).sort(), [['email', 'a***@gmail.com'], ['evm', '0xabcd…ef01']]); assert.equal(m.email, true);
  const id = m.methods.find((x) => x.kind === 'email').id;
  r.adv(1);
  const u = await r.email.unlink({ id, account: await r.proof('unlink', id) });
  assert.deepEqual(u.body, { status: 'unlinked', key_pub: emailKey.publicKey });
  assert.equal(r.store.get(id), null);
  await r.email.start({ email: 'ann@gmail.com', purpose: 'login' }); assert.equal(r.outbox.length, 1, 'no code for an unlinked email');
  const evm = 'evm:0xabcdef0123456789abcdef0123456789abcdef01'; r.adv(1);
  assert.equal((await r.email.unlink({ id: evm, account: await r.proof('unlink', evm) })).body.error, 'last_method', 'the last wallet stays');
});

test('without a mail provider or a secret: 503 email_not_configured, the list still answers', async () => {
  const r = await rig({ ready: false });
  assert.equal((await r.email.start({ email: 'ann@gmail.com', purpose: 'login' })).status, 503);
  assert.deepEqual((await r.email.methods({ account: await r.proof('list', '-') })).body, { methods: [], email: false });
});

test('HTTP: the routes go through api/auth.js (CORS, rate limit, JSON), no address or code in the log', async () => {
  const r = await rig(), lines = [];
  const h = authHandler({ env: { FTF_DATA_DIR: r.dir }, email: r.email, linker: async () => ({ status: 200, body: {} }), log: (l) => lines.push(l) });
  const call = async (url, body) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } }; await h({ method: 'POST', headers: {}, url, body }, res); return { status: res.statusCode, body: JSON.parse(res.body) }; };
  assert.deepEqual((await call('/api/auth/email/start', { email: 'ann@gmail.com', purpose: 'login' })).body, { status: 'sent' });
  assert.equal((await call('/api/auth/email/login', { email: 'ann@gmail.com', code: '123456' })).status, 401);
  assert.equal((await call('/api/auth/nope', {})).status, 404);
  assert.ok(lines.every((l) => !l.includes('ann@') && !/\d{6}/.test(l)), lines.join('\n'));
});
