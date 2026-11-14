// Email sign-in and the linked methods, the browser flow (src/net/account-email.js) against the real relayer code
// (relayer/lib/email-auth.js): link an email on a signed-in desktop (the email key goes onto the account on chain, then
// to the relayer), sign in by email on a fresh phone (the same account, the key back), list and unlink; the proof text
// equals the relayer's; the account panel shows the right section; five locales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccountEmail, proofMessage, normEmail } from '../../src/net/account-email.js';
import { edSigner } from '../../src/net/account-login.js';
import { generateKeyPair } from '../../src/net/near-tx.js';
import { createEmailAuth, createCodes, proofMessage as relayerProof } from '../../../relayer/lib/email-auth.js';
import { createIdentityStore } from '../../../relayer/lib/auth.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const ACC = 'ann-1a.guests.ftf-coordinator.testnet';
async function world() {
  const chain = new Map(); // account -> Set(public keys)
  const outbox = [];
  const store = createIdentityStore(join(mkdtempSync(join(tmpdir(), 'ftf-acct-')), 'identities.json'));
  const relay = createEmailAuth({ store, codes: createCodes(), key: randomBytes(32), mailer: { configured: true, send: async (to, code) => { outbox.push({ to, code }); } },
    accessKey: async (acc, pub) => ((chain.get(acc) || new Set()).has(pub) ? { permission: 'FullAccess' } : null) });
  const routes = { '/api/auth/email/start': 'start', '/api/auth/email/link': 'link', '/api/auth/email/login': 'login', '/api/auth/methods': 'methods', '/api/auth/unlink': 'unlink' };
  const fetch = async (url, init) => { const r = await relay[routes[new URL(url).pathname]](JSON.parse(init.body)); return { status: r.status, json: async () => r.body }; };
  const client = {
    accessKey: async (acc, pub) => ((chain.get(acc) || new Set()).has(pub) ? 'FullAccess' : null),
    addKey: async ({ signerId, newKey, key }) => { if (!(chain.get(signerId) || new Set()).has(key.publicKey)) return { ok: false }; chain.get(signerId).add(newKey); return { ok: true }; },
    view: async () => null,
  };
  const device = (record = {}) => { const mint = { record, setRecord(p) { this.record = { ...this.record, ...p }; } }; return { mint, mail: createAccountEmail({ relayer: 'https://r.example', mint, client, signerFor: edSigner, newKey: generateKeyPair, fetch }) }; };
  return { chain, outbox, device, store };
}

test('the account proof text is the relayer\'s, byte for byte; emails normalize the same way', () => {
  assert.equal(proofMessage('link-email', ACC, 'a@b.co', 1), relayerProof('link-email', ACC, 'a@b.co', 1));
  assert.equal(normEmail(' A@B.Co '), 'a@b.co'); assert.equal(normEmail('x'), null);
});

test('link on the desktop, sign in on a phone with no wallet: the same account, its email key, and every mint still goes there', async () => {
  const w = await world();
  const deskKey = await generateKeyPair(); w.chain.set(ACC, new Set([deskKey.publicKey]));
  const desk = w.device({ playerKey: deskKey, guest: { account_id: ACC }, minted: true, nickname: 'ann' });
  assert.equal(desk.mail.canLink, true);
  assert.deepEqual(await desk.mail.linkStart('Ann@Example.com'), { status: 'sent', email: 'ann@example.com' });
  assert.equal((await desk.mail.linkFinish('12')).error, 'bad_code');
  const linked = await desk.mail.linkFinish(w.outbox.at(-1).code);
  assert.deepEqual(linked, { status: 'linked', hint: 'a***@example.com', account: ACC });
  assert.equal(w.chain.get(ACC).size, 2, 'the email key was added to the account on chain');
  const m = await desk.mail.methods();
  assert.deepEqual(m.methods.map((x) => [x.kind, x.hint]), [['email', 'a***@example.com']]);

  const phone = w.device({});
  assert.equal(phone.mail.canLink, false, 'a fresh phone has no account to link from');
  assert.equal((await phone.mail.loginStart('ann@example.com')).status, 'sent');
  const r = await phone.mail.loginFinish('ann@example.com', w.outbox.at(-1).code);
  assert.deepEqual(r, { status: 'restored', account: ACC });
  assert.equal(phone.mint.record.guest.account_id, ACC, 'the phone plays as the same account (mints go there)');
  assert.ok(w.chain.get(ACC).has(phone.mint.record.playerKey.publicKey), 'with a key that is on that account');
  assert.equal(phone.mint.record.login.kind, 'email'); assert.ok(!JSON.stringify(phone.mint.record.login).includes('ann@'), 'the address is not kept in the clear');
  assert.equal(phone.mail.canLink, true, 'and may now see its methods too');
});

test('unknown email: a calm "sent" and no mail; wrong code; unlink forgets the email', async () => {
  const w = await world();
  const deskKey = await generateKeyPair(); w.chain.set(ACC, new Set([deskKey.publicKey]));
  const desk = w.device({ playerKey: deskKey, guest: { account_id: ACC } });
  await desk.mail.linkStart('ann@example.com'); await desk.mail.linkFinish(w.outbox.at(-1).code);
  const phone = w.device({});
  assert.equal((await phone.mail.loginStart('nobody@example.com')).status, 'sent'); assert.equal(w.outbox.length, 1);
  await phone.mail.loginStart('ann@example.com');
  assert.equal((await phone.mail.loginFinish('ann@example.com', w.outbox.at(-1).code === '000000' ? '000001' : '000000')).error, 'wrong_code');
  const id = (await desk.mail.methods()).methods[0].id;
  assert.deepEqual(await desk.mail.unlink(id), { status: 'unlinked' });
  assert.deepEqual((await desk.mail.methods()).methods, []);
  await phone.mail.loginStart('ann@example.com'); assert.equal(w.outbox.length, 2, 'no new code for an unlinked email');
});

test('account panel copy: five locales, the email and methods keys, no invest words', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('acct.email.') || k.startsWith('acct.methods') || k.startsWith('acct.kind.') || ['acct.unlink', 'acct.unlinked', 'acct.wallet.link'].includes(k));
  assert.ok(keys.length >= 21, String(keys.length));
  for (const lang of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`);
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) assert.match(PLAY_MESSAGES[lang]['acct.email.sent'], /\{email\}/);
});
