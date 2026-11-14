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

test('after the code is sent: Change email goes back with the address kept; Resend code waits 30 s, then sends again', async () => {
  const { installDom } = await import('../lib/mini-dom.mjs');
  const { mountAccountMethods, RESEND_S } = await import('../../src/ui/account-methods.js');
  for (const canLink of [false, true]) {
    const { doc } = installDom();
    const sent = []; let tickFn = null, cleared = 0;
    const timers = { setInterval: (fn) => { tickFn = fn; return 1; }, clearInterval: () => { cleared++; tickFn = null; } };
    const start = async (v) => { sent.push(v); return v.includes('@') ? { status: 'sent', email: v } : { status: 'error', error: 'bad_email' }; };
    const mail = { canLink, methods: async () => ({ status: 'ok', methods: [], email: true }), linkStart: start, loginStart: start, linkFinish: async () => ({ status: 'error', error: 'wrong_code' }), loginFinish: async () => ({ status: 'error', error: 'wrong_code' }) };
    const t = (k, a) => (a ? `${k}${JSON.stringify(a)}` : k);
    const sec = mountAccountMethods({ doc, t, mail, timers }); doc.body.append(sec);
    const wait = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
    const input = () => sec.querySelector('input'), btn = (text) => sec.querySelectorAll('button').find((b) => b.textContent.startsWith(text));
    const submit = async (value) => { const i = input(); i.value = value; sec.querySelector('form').dispatchEvent({ type: 'submit', preventDefault() {} }); await wait(); };
    await wait();
    await submit('wrong@exmaple.com');
    assert.equal(input().type, 'text', 'the code step'); assert.ok(btn('acct.email.back'), 'a way back'); 
    const again = btn('acct.email.resendIn'); assert.ok(again && again.disabled, 'resend waits'); assert.ok(again.textContent.includes(String(RESEND_S)));
    again.click(); await wait(); assert.equal(sent.length, 1, 'a tap during the wait sends nothing');
    btn('acct.email.back').click(); await wait();
    assert.equal(input().type, 'email'); assert.equal(input().value, 'wrong@exmaple.com', 'the address is prefilled'); assert.equal(btn('acct.email.back'), undefined);
    await submit('right@example.com');
    assert.deepEqual(sent, ['wrong@exmaple.com', 'right@example.com']);
    for (let i = 0; i < RESEND_S; i++) tickFn && tickFn();
    const ready = btn('acct.email.resend'); assert.equal(ready.textContent, 'acct.email.resend'); assert.equal(ready.disabled, false);
    ready.click(); await wait();
    assert.deepEqual(sent.at(-1), 'right@example.com', 'the same address gets a new code'); assert.ok(btn('acct.email.resendIn').disabled, 'and the wait starts again');
    assert.equal(input().type, 'text', 'still on the code step');
    await submit('000000'); assert.equal(input().type, 'text', 'a wrong code keeps the step (with its way back)'); assert.ok(btn('acct.email.back'));
  }
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) { for (const k of ['acct.email.back', 'acct.email.resend']) assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`); assert.match(PLAY_MESSAGES[lang]['acct.email.resendIn'], /\{s\}/, lang); }
});
