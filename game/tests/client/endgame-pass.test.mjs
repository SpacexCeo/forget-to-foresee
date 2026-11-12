// The endgame whitelist pass, the game side (story TZ §11.4): the modal's state machine for every relayer status, the
// account-id vectors shared with the relayer, a minted view that can only carry the server's hash, the signed claim
// the relayer can verify, no hash-like literal in the source, the demo path without a hash, a dormant build, and the
// legal copy of the pass.* strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkWallet, viewModel, STATUS_VIEW, createPassClient, claimIdFor, canonicalClaim } from '../../src/net/pass-client.js';
import { reduce, initial, createEndgamePass } from '../../src/ui/endgame-pass.js';
import { PASS_DEPLOYMENT } from '../../src/net/pass-deployment.js';
import { generateKeyPair } from '../../src/net/near-tx.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const ids = JSON.parse(readFileSync(new URL('../../../relayer/tests/fixtures/account-ids.json', import.meta.url), 'utf8'));
const HASH = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'; // a syntactically valid base58 sample for the view model only
const EX = 'https://testnet.nearblocks.io/txns/';

test('pass client: wallet id vectors are the relayer\'s (one fixture file)', () => {
  for (const c of ids.cases) assert.equal(checkWallet(c.id, { network: c.network, forbidden: ids.forbidden }).ok, c.valid, `${c.id} on ${c.network}`);
});

test('pass view model: every relayer status maps to a state and a message; a hash only for minted with a well-formed hash', () => {
  for (const status of Object.keys(STATUS_VIEW)) {
    const vm = viewModel({ status, tx_hash: HASH, token_id: '7', claim_id: 'c' }, { explorerBase: EX });
    assert.ok(['minted', 'queued', 'error'].includes(vm.state), status);
    assert.ok(PLAY_MESSAGES.en[vm.key], `${status}: ${vm.key} exists`);
    if (vm.state === 'minted') { assert.equal(vm.hash, HASH); assert.equal(vm.explorer, EX + HASH); }
    else { assert.equal(vm.hash, null, status); assert.equal(vm.explorer, null, status); }
  }
  assert.equal(viewModel({ status: 'minted', token_id: '1' }).hash, null, 'minted without a hash shows no hash');
  assert.equal(viewModel({ status: 'minted', tx_hash: 'not a hash!', token_id: '1' }).hash, null, 'a malformed hash is dropped');
  assert.equal(viewModel({ status: 'something new' }).state, 'error');
  assert.equal(viewModel(null).state, 'error');
  assert.deepEqual(viewModel({ status: 'not_eligible', earned: 4200 }).args, { earned: '4,200' });
  assert.deepEqual(viewModel({ status: 'rate_limited', retry_after_s: 125 }).args, { n: 3 });
});

test('pass modal: the state machine (idle -> validating -> submitting -> minted | queued | error), minted only through an answer', () => {
  let s = initial();
  s = reduce(s, { type: 'input', value: 'Ann.testnet', network: 'testnet' });
  assert.deepEqual([s.state, s.inline], ['validating', 'pass.err.invalid']);
  assert.equal(reduce(s, { type: 'submit' }).state, 'validating', 'an invalid id cannot be submitted');
  s = reduce(s, { type: 'input', value: 'ann.testnet', network: 'testnet' });
  assert.equal(s.inline, null);
  s = reduce(s, { type: 'submit' });
  assert.equal(s.state, 'submitting');
  for (const [status, state] of [['minted', 'minted'], ['already_claimed', 'minted'], ['queued', 'queued'], ['budget_exhausted', 'queued'], ['paused', 'queued'], ['rpc_unavailable', 'queued'],
    ['not_eligible', 'error'], ['wallet_taken', 'error'], ['invalid_account', 'error'], ['account_missing', 'error'], ['signature_invalid', 'error'], ['rate_limited', 'error'],
    ['captcha_required', 'error'], ['sold_out', 'error'], ['tx_failed', 'error'], ['not_configured', 'error'], ['offline', 'error']]) {
    const n = reduce(s, { type: 'answer', ans: { status, claim_id: 'c1', tx_hash: HASH, token_id: '1' }, explorerBase: EX });
    assert.equal(n.state, state, status);
    assert.equal(n.vm.hash, state === 'minted' ? HASH : null, status);
    assert.equal(n.claimId, 'c1');
  }
  assert.equal(reduce(reduce(s, { type: 'answer', ans: { status: 'tx_failed' } }), { type: 'reset' }).state, 'idle');
  // nothing but an answer reaches minted
  for (const e of [{ type: 'input', value: 'x' }, { type: 'submit' }, { type: 'reset' }]) assert.notEqual(reduce(initial(), e).state, 'minted');
});

test('pass modal: the demo answer carries no hash (a labelled simulation)', () => {
  const src = readFileSync(new URL('../../src/ui/endgame-pass.js', import.meta.url), 'utf8');
  const demo = /if \(demo\) \{ setTimer\(\(\) => dispatch\(\{ type: 'answer', ans: (\{[^}]*\})/.exec(src);
  assert.ok(demo, 'the demo branch exists');
  assert.doesNotMatch(demo[1], /tx_hash/);
  const s = reduce({ ...initial(), state: 'submitting' }, { type: 'answer', ans: { status: 'minted', token_id: 'demo' }, explorerBase: EX });
  assert.equal(s.state, 'minted'); assert.equal(s.vm.hash, null); assert.equal(s.vm.explorer, null);
});

test('pass: network null creates nothing; the default deployment is the testnet rehearsal', () => {
  const touched = [];
  const doc = new Proxy({}, { get: (_, k) => { touched.push(k); return () => null; } });
  assert.equal(createEndgamePass({ t: (k) => k, client: {}, deployment: { network: null }, doc }), null);
  assert.deepEqual(touched, [], 'not even the document is touched');
  assert.equal(PASS_DEPLOYMENT.network, 'testnet');
  assert.match(PASS_DEPLOYMENT.explorerBase, /^https:\/\/testnet\.nearblocks\.io\/txns\/$/);
});

test('pass client: the claim is signed by the guest key over the relayer\'s canonical text; answers pass through; offline is honest', async () => {
  const kp = await generateKeyPair();
  const store = new Map([['ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann.guests.ftf-coordinator.testnet' }, playerKey: { secretKey: kp.secretKey } })]]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let sent = null;
  const fetch = async (url, init) => { sent = { url, init }; return { status: 202, json: async () => ({ status: 'queued', claim_id: JSON.parse(init.body).claim.claim_id }) }; };
  const c = createPassClient({ base: 'https://relayer.example', fetch, storage, network: 'testnet' });
  const r = await c.claim('ann.testnet', { now: () => 1762960000000 });
  assert.equal(r.status, 'queued');
  const body = JSON.parse(sent.init.body);
  assert.equal(sent.url, 'https://relayer.example/api/pass/claim');
  assert.equal(body.claim.claim_id, await claimIdFor('ann.guests.ftf-coordinator.testnet'));
  assert.equal(sent.init.headers['Idempotency-Key'], body.claim.claim_id);
  const pub = (await import('../../src/net/near-tx.js')).b58decode(body.public_key.slice(8));
  const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
  const sig = (await import('../../src/net/near-tx.js')).b58decode(body.signature.slice(8));
  assert.ok(await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(canonicalClaim(body.claim, 'ann.testnet'))), 'the relayer can verify it');
  const off = createPassClient({ base: 'https://relayer.example', fetch: async () => { throw new Error('down'); }, storage });
  assert.equal((await off.status('a'.repeat(64))).status, 'offline');
  assert.equal((await createPassClient({ base: '', fetch, storage }).status('x')).status, 'not_configured');
  assert.equal((await createPassClient({ base: 'https://r', fetch, storage: { getItem: () => null } }).claim('ann.testnet')).status, 'signature_invalid', 'no guest: nothing is sent');
});

test('pass: no hash-like literal and no key literal in the pass source', () => {
  for (const f of ['src/net/pass-client.js', 'src/net/pass-deployment.js', 'src/ui/endgame-pass.js']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.equal(/['"`][1-9A-HJ-NP-Za-km-z]{43,44}['"`]/.test(src), false, f + ': base58 hash literal');
    assert.equal(/['"`][0-9a-f]{64}['"`]/.test(src), false, f + ': hex hash literal');
    assert.equal(/ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/.test(src), false, f + ': key literal');
  }
});

test('pass copy: every pass.* key in five locales; no price, resale, value or investment promise (TZ §10)', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('pass.'));
  assert.ok(keys.length >= 40);
  for (const lang of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[lang][k], `${lang}:${k}`);
  const en = keys.map((k) => PLAY_MESSAGES.en[k]).join(' ');
  assert.doesNotMatch(en, /\b(price|resale|resell|profit|invest|investment|worth|valuable|return on|airdrop|guaranteed|earn money|sell)\b/i);
  assert.match(PLAY_MESSAGES.en['pass.safety'], /never ask for a seed phrase or a private key/);
  assert.match(PLAY_MESSAGES.en['pass.lead.mainnet'], /free: no purchase, no seed phrase, no signature/);
  assert.match(PLAY_MESSAGES.en['pass.demo'], /^Demo only\./);
});
