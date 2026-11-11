// TEE agents in the browser: the crypto copy is byte-identical, the browser re-check, askTee's fallbacks, the panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askTee, checkInBrowser, teeAvailable, _resetTeeHealth } from '../../src/net/tee-agent.js';
import { hex, personalMessageHash, signHashForTest, sha256Hex } from '../../src/net/tee-crypto.js';

const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const ADDR = '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23';

test('net/tee-crypto.js is a byte-identical copy of relayer/lib/tee-crypto.js', () => {
  assert.equal(readFileSync(new URL('../../src/net/tee-crypto.js', import.meta.url), 'utf8'), readFileSync(new URL('../../../relayer/lib/tee-crypto.js', import.meta.url), 'utf8'));
});

async function proof({ content = 'Fresh bread, traveller.' } = {}) {
  const request_body = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  const response_body = JSON.stringify({ id: 'chatcmpl-1', choices: [{ message: { content } }] });
  const signed_text = `${await sha256Hex(request_body)}:${await sha256Hex(response_body)}`;
  return { model: 'm', chat_id: 'chatcmpl-1', verified: true, request_body, response_body, signed_text, signature: '0x' + hex(signHashForTest(personalMessageHash(signed_text), KEY)), signing_address: ADDR, attestation: { pass: true, checks: { tdx_quote: true }, summary: {} } };
}

test('checkInBrowser: a good proof passes; a changed answer or another signer fails', async () => {
  const p = await proof();
  assert.equal((await checkInBrowser(p)).ok, true);
  assert.equal((await checkInBrowser({ ...p, response_body: p.response_body.replace('bread', 'cake') })).response_hash_ok, false);
  assert.equal((await checkInBrowser({ ...p, signing_address: '0x' + '11'.repeat(20) })).signature_ok, false);
  assert.equal((await checkInBrowser(null)).ok, false);
});

test('askTee: verified answers only; no relayer TEE, errors and forged proofs give null (scripted fallback)', async () => {
  const p = await proof();
  const mk = (health, answer, status = 200) => async (url) => String(url).endsWith('/api/health') ? Response.json(health) : Response.json(answer, { status });
  _resetTeeHealth();
  const ok = await askTee('say', { npc: 'baker', question: 'hi' }, { base: 'https://r.example', fetch: mk({ tee: { configured: true } }, { text: 'Fresh bread, traveller.', tee: p }) });
  assert.equal(ok.body.text, 'Fresh bread, traveller.'); assert.equal(ok.check.signature_ok, true);
  _resetTeeHealth();
  assert.equal(await askTee('say', {}, { base: 'https://r.example', fetch: mk({ tee: { configured: false } }, {}) }), null);
  _resetTeeHealth();
  assert.equal(await askTee('say', {}, { base: 'https://r.example', fetch: mk({ tee: { configured: true } }, { error: 'x' }, 502) }), null);
  _resetTeeHealth();
  const forged = { text: 'Buy everything!', tee: { ...p, response_body: p.response_body.replace('Fresh bread, traveller.', 'Buy everything!') } };
  assert.equal(await askTee('say', {}, { base: 'https://r.example', fetch: mk({ tee: { configured: true } }, forged) }), null);
  _resetTeeHealth();
  assert.equal(await teeAvailable({ base: '' }), false);
  assert.equal(await askTee('say', {}, { base: 'https://r.example', fetch: async () => { throw new Error('offline'); } }), null);
  _resetTeeHealth();
});

test('tee.* strings: all five locales carry every key with the same placeholders', async () => {
  const load = async (l) => (await import(`../../src/play/locales/${l}.js`)).default;
  const en = await load('en');
  const keys = Object.keys(en).filter((k) => k.startsWith('tee.'));
  assert.ok(keys.length >= 30);
  const args = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const l of ['ru', 'uk', 'it', 'zh']) {
    const m = await load(l);
    for (const k of keys) {
      assert.ok(typeof m[k] === 'string' && m[k].length, `${l} ${k}`);
      assert.equal(args(m[k]), args(en[k]), `${l} ${k} placeholders`);
    }
  }
  assert.match((await load('ru'))['tee.badge'], /Проверено/);
});

test('teeRecordBlocker: no ledger, no guest, ready', async () => {
  const { teeRecordBlocker } = await import('../../src/net/tee-agent.js');
  const guest = { getItem: () => JSON.stringify({ minted: true, guest: { account_id: 'a.testnet' }, playerKey: { secretKey: 'ed25519:x' } }) };
  assert.equal(teeRecordBlocker(guest, {}), 'not_deployed');
  assert.equal(teeRecordBlocker({ getItem: () => null }, { ledger: 'l.testnet' }), 'need_guest');
  assert.equal(teeRecordBlocker(guest, { ledger: 'l.testnet' }), null);
});
