// TEE agents: crypto vectors, the recorded attestation, the signed-answer flow with a mock NEAR AI Cloud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hex, keccak256, personalMessageHash, recoverPersonal, signHashForTest, publicAddressForTest, sha256Hex } from '../lib/tee-crypto.js';
import { verifyModelAttestation, verifyTdxQuote, reportDataBinds } from '../lib/tee-attest.js';
import { FOLK, teeChat, validateSay, validateDecide, sayRequest, decideRequest, parseDecision, contentOf, checkSignature } from '../lib/tee.js';
import { teeHandler } from '../lib/tee-http.js';
import { createBucket } from '../lib/core.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/attestation-report.json', import.meta.url))).model_attestations[0];
const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const ADDR = '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23';

test('keccak256 and personal_sign recovery match the published Ethereum vectors', () => {
  assert.equal(hex(keccak256(new Uint8Array())), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(hex(personalMessageHash('Some data')), '1da44b586eb0729ff70a73c326926f6ed5a25f5b056e7f47fbc6e58d86871655');
  assert.equal(recoverPersonal('Some data', '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'), ADDR);
  assert.equal(publicAddressForTest(KEY), ADDR);
  assert.notEqual(recoverPersonal('Some datA', '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'), ADDR);
  assert.equal(recoverPersonal('x', '0x00'), null);
});

test('the recorded attestation passes: Intel chain, report data, RTMR replay, compose hash, GPU nonce', async () => {
  const r = await verifyModelAttestation(FIXTURE, { nonce: FIXTURE.request_nonce });
  assert.equal(r.pass, true, JSON.stringify(r.checks));
  assert.deepEqual(r.summary.pck_chain, ['Intel SGX PCK Certificate', 'Intel SGX PCK Platform CA', 'Intel SGX Root CA']);
  assert.equal(r.checks.gpu_verdict, null); // the network check is off in tests
});

test('a tampered quote, a wrong nonce or another address fail', async () => {
  const q = FIXTURE.intel_quote, i = 48 * 2 + 520 * 2 + 10; // a byte inside report_data
  const bad = q.slice(0, i) + (q[i] === '0' ? '1' : '0') + q.slice(i + 1);
  assert.equal(verifyTdxQuote(bad).ok, false);
  assert.equal(verifyTdxQuote(bad).reason, 'quote_signature');
  const wrongNonce = await verifyModelAttestation(FIXTURE, { nonce: '00'.repeat(32) });
  assert.equal(wrongNonce.pass, false); assert.equal(wrongNonce.checks.report_data_binds_nonce, false);
  assert.equal(reportDataBinds(verifyTdxQuote(q).reportData, ADDR).address, false);
  const other = await verifyModelAttestation({ ...FIXTURE, info: { ...FIXTURE.info, tcb_info: { ...FIXTURE.info.tcb_info, app_compose: FIXTURE.info.tcb_info.app_compose + ' ' } } }, { nonce: FIXTURE.request_nonce });
  assert.equal(other.checks.compose_hash_measured, false);
});

test('townsfolk list mirrors the game', () => {
  const src = readFileSync(new URL('../../game/src/game/town-economy.js', import.meta.url), 'utf8');
  const block = /FOLK_TEMPERAMENT = Object\.freeze\(\{([\s\S]*?)\}\)/.exec(src)[1];
  const game = Object.fromEntries([...block.matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual({ ...FOLK }, game);
});

test('validation and prompts', () => {
  assert.equal(validateSay({ npc: 'baker', question: '' }).error, 'bad_question');
  assert.equal(validateSay({ npc: 'king', question: 'hi' }).error, 'bad_npc');
  assert.equal(validateSay({ npc: 'toString', question: 'hi' }).error, 'bad_npc');
  const s = validateSay({ npc: 'baker', question: 'hi\u0000 there'.repeat(30), lang: 'xx' });
  assert.equal(s.question.length, 120); assert.equal(s.lang, 'en');
  assert.match(sayRequest(validateSay({ npc: 'baker', question: 'hi', lang: 'ru' })).messages[0].content, /Russian/);
  assert.equal(validateDecide({ npc: 'baker', echo: 'ember', bars: [1] }).error, 'bad_bars');
  assert.equal(validateDecide({ npc: 'baker', echo: 'ember', bars: [100, 101], position: 2 }).error, 'bad_position');
  assert.match(decideRequest(validateDecide({ npc: 'courier', echo: 'ember', bars: [100, 101] })).messages[1].content, /100, 101/);
  assert.deepEqual(parseDecision('Sure: {"action":"BUY","reason":"rising"}'), { action: 'buy', reason: 'rising', parsed: true });
  assert.equal(parseDecision('I would buy').action, 'hold');
  assert.equal(contentOf({ choices: [{ message: { content: '<think>x</think> "Fresh bread!"' } }] }), 'Fresh bread!');
});

/** A mock NEAR AI Cloud: answers a chat, signs sha256(request):sha256(response) with the test key. */
function mockCloud({ content = 'Good morning, traveller.', tamper = false } = {}) {
  const store = new Map();
  return async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/v1/chat/completions')) {
      const body = JSON.stringify({ id: 'chatcmpl-test1', model: JSON.parse(init.body).model, choices: [{ message: { role: 'assistant', content } }] });
      store.set('chatcmpl-test1', { req: init.body, res: body });
      return new Response(tamper ? body.replace('morning', 'evening') : body, { status: 200 });
    }
    if (u.includes('/v1/signature/')) {
      const s = store.get('chatcmpl-test1');
      const text = `${await sha256Hex(s.req)}:${await sha256Hex(s.res)}`;
      return Response.json({ text, signature: '0x' + hex(signHashForTest(personalMessageHash(text), KEY)), signing_address: ADDR, signing_algo: 'ecdsa' });
    }
    return new Response('{}', { status: 404 });
  };
}
const passAttest = async () => ({ pass: true, checks: { tdx_quote: true }, summary: { signing_address: ADDR } });

test('teeChat: a signed, attested answer is verified; a changed response is not', async () => {
  const ok = await teeChat(sayRequest(validateSay({ npc: 'baker', question: 'hi' })), { apiKey: 'k', fetch: mockCloud(), attest: passAttest });
  assert.equal(ok.status, 200); assert.equal(ok.body.text, 'Good morning, traveller.');
  assert.equal(ok.body.tee.verified, true); assert.equal(ok.body.tee.signing_address, ADDR);
  const re = await checkSignature({ requestBody: ok.body.tee.request_body, responseBody: ok.body.tee.response_body, sig: { text: ok.body.tee.signed_text, signature: ok.body.tee.signature, signing_address: ADDR } });
  assert.ok(re.signature_ok && re.request_hash_ok && re.response_hash_ok);
  const bad = await teeChat(sayRequest(validateSay({ npc: 'baker', question: 'hi' })), { apiKey: 'k', fetch: mockCloud({ tamper: true }), attest: passAttest });
  assert.equal(bad.body.tee.verified, false); assert.equal(bad.body.tee.signature_check.response_hash_ok, false);
  const failAtt = await teeChat(sayRequest(validateSay({ npc: 'baker', question: 'hi' })), { apiKey: 'k', fetch: mockCloud(), attest: async () => ({ pass: false }) });
  assert.equal(failAtt.body.tee.verified, false);
  assert.equal((await teeChat({ model: 'm', messages: [] }, { apiKey: '' })).status, 503);
  const up = await teeChat({ model: 'm', messages: [] }, { apiKey: 'k', fetch: async () => Response.json({ error: { type: 'no_limit_configured' } }, { status: 402 }) });
  assert.equal(up.status, 502); assert.equal(up.body.upstream_type, 'no_limit_configured');
});

function fakeRes() { return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; } }; }
const call = async (h, body) => { const res = fakeRes(); await h({ method: 'POST', headers: {}, body, socket: { remoteAddress: '1.2.3.4' } }, res); return { status: res.statusCode, body: JSON.parse(res.body || '{}') }; };

test('handlers: validation, no key, decision with hash, daily cap', async () => {
  const env = { NEARAI_API_KEY: 'k', TRUST_PROXY: '0' };
  assert.equal((await call(teeHandler('say', { env: {} }), { npc: 'baker', question: 'hi' })).status, 503);
  assert.equal((await call(teeHandler('say', { env }), { npc: 'nobody', question: 'hi' })).status, 400);
  const d = await call(teeHandler('decide', { env, fetch: mockCloud({ content: '{"action":"sell","reason":"too high"}' }), attest: passAttest, bucket: createBucket({ capacity: 9 }) }), { npc: 'courier', echo: 'ember', bars: [100, 104, 109] });
  assert.equal(d.status, 200); assert.equal(d.body.decision.action, 'sell'); assert.match(d.body.decision.decision_hash, /^[0-9a-f]{64}$/);
  assert.equal(d.body.tee.verified, true);
  const capped = teeHandler('say', { env, fetch: mockCloud(), attest: passAttest, daily: { take: () => false }, bucket: createBucket({ capacity: 9 }) });
  assert.equal((await call(capped, { npc: 'baker', question: 'hi' })).body.error, 'daily_cap');
});

test('server.js loads relayer/.env without overriding the environment', async () => {
  const { loadDotEnv } = await import('../server.js');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const f = join(mkdtempSync(join(tmpdir(), 'ftf-env-')), '.env');
  writeFileSync(f, '# comment\nNEARAI_API_KEY="sk-test"\nexport FTF_TEE_DAILY_CAP=10\nALREADY=file\n');
  const env = { ALREADY: 'set' };
  assert.equal(loadDotEnv(f, env), 2);
  assert.deepEqual(env, { ALREADY: 'set', NEARAI_API_KEY: 'sk-test', FTF_TEE_DAILY_CAP: '10' });
  assert.equal(loadDotEnv(f + '.missing', {}), 0);
});
