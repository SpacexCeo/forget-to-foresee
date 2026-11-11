// Agent track records, browser side (src/net/agent-ledger.js): honest blockers, a record signed with the Day 1 guest
// key, "verified" only after the read-back re-computes; the copy-paste steps; the "verify" dialogue intent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createTownLedger } from '../../src/game/town-economy.js';
import { recordBlocker, recordHire, verificationSteps, guestFrom, LEDGER_DEPOSIT } from '../../src/net/agent-ledger.js';
import { generateKeyPair, b58encode } from '../../src/net/near-tx.js';
import { matchIntent, replyFor } from '../../src/game/intents.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';
import { memoryStorage } from '../../src/ui/storage.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const DEP = { ledger: 'ledger.c.testnet' };

function hireResult() {
  let t = 1e6; const L = createTownLedger({ storage: memoryStorage(), now: () => t });
  L.hire('baker'); t += 60_000; return L.collect('baker').result;
}
async function guestStorage() {
  const s = memoryStorage(); const kp = await generateKeyPair();
  s.setItem('ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann-1.guests.c.testnet' }, playerKey: kp }));
  return s;
}

test('blockers: no contract, no guest account, a hire from before records', async () => {
  const r = hireResult();
  assert.equal(recordBlocker({ storage: await guestStorage(), result: r, deployment: {} }), 'not_deployed');
  assert.equal(recordBlocker({ storage: memoryStorage(), result: r, deployment: DEP }), 'need_guest');
  assert.equal(recordBlocker({ storage: await guestStorage(), result: { ...r, before: undefined }, deployment: DEP }), 'old_hire');
  assert.equal(recordBlocker({ storage: await guestStorage(), result: r, deployment: DEP }), null);
  assert.equal(guestFrom(memoryStorage()), null);
});

test('record with the guest key, read back, re-compute: verified; a chain that returns something else is not', async () => {
  const r = hireResult(); const storage = await guestStorage();
  let stored = null; const sent = [];
  const fakeFetch = (tamper) => async (url, init) => {
    const b = JSON.parse(init.body);
    let result;
    if (b.method === 'query' && b.params.request_type === 'view_access_key') result = { nonce: 3 };
    else if (b.method === 'block') result = { header: { hash: b58encode(new Uint8Array(32).fill(4)) } };
    else if (b.method === 'send_tx') {
      sent.push(b);
      const bytes = Buffer.from(b.params.signed_tx_base64, 'base64').toString('latin1');
      const json = bytes.slice(bytes.indexOf('{"npc"'), bytes.lastIndexOf('}') + 1);
      stored = JSON.parse(json);
      result = { status: { SuccessValue: '' }, receipts_outcome: [] };
    } else if (b.method === 'query' && b.params.method_name === 'get_track') {
      const v = stored ? { ...stored, ...(tamper ? { pnl_bp: stored.pnl_bp + 7 } : {}), account_id: 'ann-1.guests.c.testnet', trades: 5 } : null;
      result = { result: Array.from(Buffer.from(JSON.stringify(v))) };
    }
    return { json: async () => ({ result }) };
  };
  const ok = await recordHire({ storage, npc: 'baker', result: r, deployment: DEP, fetch: fakeFetch(false), rpcUrls: ['https://r'] });
  assert.equal(ok.ok, true); assert.equal(ok.verified, true); assert.equal(ok.accountId, 'ann-1.guests.c.testnet'); assert.equal(ok.epoch, r.epoch);
  assert.equal(stored.npc, 'baker'); assert.equal(stored.policy_version, 'town-ts-1');
  assert.ok(sent.length === 1 && LEDGER_DEPOSIT === 10n ** 22n);
  const bad = await recordHire({ storage, npc: 'baker', result: { ...r, epoch: r.epoch }, deployment: DEP, fetch: fakeFetch(true), rpcUrls: ['https://r'] });
  assert.equal(bad.ok, true); assert.equal(bad.verified, false); assert.equal(bad.reason, 'pnl');
});

test('verification steps name the record, the contract, the snapshot and the one-line verifier', () => {
  const s = verificationSteps({ accountId: 'ann-1.guests.c.testnet', npc: 'baker', epoch: 3, deployment: DEP });
  for (const want of ['get_track', '"npc":"baker"', '"epoch":3', 'ledger.c.testnet', 'snapshot-v1.js', 'hireResult', 'node tools/verify-agent/verify.mjs ann-1.guests.c.testnet baker 3 ledger.c.testnet']) assert.ok(s.includes(want), want);
});

test('the agent explains how to verify it (all five locales)', () => {
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const M = PLAY_MESSAGES[loc], en = PLAY_MESSAGES.en;
    const lex = (k) => (M[k] || '') + '|' + (en[k] || '');
    for (const k of ['chat.verify', 'chat.lex.verify', 'ledger.record', 'ledger.verified', 'ledger.copy', 'ledger.why.need_guest', 'ledger.why.not_deployed', 'ledger.why.old_hire']) assert.ok(M[k], `${loc} ${k}`);
    const phrase = { en: 'how can I verify you?', ru: 'как тебя проверить?', uk: 'як тебе перевірити?', it: 'come posso verificare?', zh: '怎么验证你' }[loc];
    assert.equal(matchIntent(phrase, lex).intent, 'verify', loc);
  }
  assert.equal(replyFor({ intent: 'verify' }).key, 'chat.verify');
});
