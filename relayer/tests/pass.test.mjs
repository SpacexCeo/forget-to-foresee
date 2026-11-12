// The whitelist pass claim (lib/pass.js, story TZ §11.3): every status of the table, the account-id vectors shared
// with the game, no hash before FINAL, idempotency under concurrency, a lost-state restart, the budget guard, the caps,
// the kill switch, captcha, rate limits, dry-run without signing, the queue worker and a source scan. Mock RPC and
// in-memory keys only: nothing here reaches a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { b58encode, generateKeyPair, importSecretKey } from '../lib/near-tx.js';
import { checkWallet, claimIdFor, canonicalClaim, createPassService, createPassStore, passEnv, HTTP, BACKOFF_MS, EXPIRE_MS } from '../lib/pass.js';

const ids = JSON.parse(readFileSync(new URL('./fixtures/account-ids.json', import.meta.url), 'utf8'));
const CONTRACT = 'pass.owner.testnet', MINTER = 'minter.owner.testnet', GUEST = 'ann.guests.ftf-coordinator.testnet';
const tmp = () => mkdtempSync(join(tmpdir(), 'ftf-pass-'));

/** A fake chain: accounts, the guest's keys, the pass contract and its minter key. */
function fakeChain({ minterKey, guestKey, mode = 'final' } = {}) {
  const st = { accounts: new Set(['ann.testnet', 'bob.testnet', CONTRACT, MINTER]), minted: 0, cap: 1000, daily: 100, today: 0, paused: false,
    claims: new Set(), mintedTo: new Set(), tokens: new Map(), allowance: (10n ** 24n).toString(), fullAccessMinter: false, balance: (5n * 10n ** 24n).toString(),
    guestKeys: new Set(guestKey ? [guestKey] : []), sends: 0, mode, txs: new Map(), down: false };
  const err = (name) => { const e = new Error(name); e.rpc = { cause: { name } }; return e; };
  const mint = (receiver, claim) => {
    if (st.claims.has(claim)) return 'ERR_CLAIM_USED'; if (st.mintedTo.has(receiver)) return 'ERR_WALLET_MINTED'; if (st.minted >= st.cap) return 'ERR_SOLD_OUT';
    st.minted++; st.today++; st.claims.add(claim); st.mintedTo.add(receiver);
    const t = { token_id: String(st.minted), owner_id: receiver, metadata: { extra: `{"board_season":1,"claim":"${claim}"}` } }; st.tokens.set(t.token_id, t); return t;
  };
  const client = {
    async rpc(method, p) {
      if (st.down) throw new Error('fetch failed');
      if (method === 'query' && p.request_type === 'view_account') { if (!st.accounts.has(p.account_id) && !/^[0-9a-f]{64}$/.test(p.account_id)) throw err('UNKNOWN_ACCOUNT'); return { amount: p.account_id === CONTRACT ? st.balance : '1', storage_usage: 100000 }; }
      if (method === 'query' && p.request_type === 'view_access_key') {
        if (p.account_id === MINTER && p.public_key === minterKey) return { nonce: 5, permission: st.fullAccessMinter ? 'FullAccess' : { FunctionCall: { allowance: st.allowance, receiver_id: CONTRACT, method_names: ['mint_pass'] } } };
        if (p.account_id === GUEST && st.guestKeys.has(p.public_key)) return { nonce: 1, permission: 'FullAccess' };
        throw err('UNKNOWN_ACCESS_KEY');
      }
      if (method === 'block') return { header: { hash: b58encode(new Uint8Array(32).fill(7)) } };
      if (method === 'send_tx') {
        st.sends++;
        const raw = Buffer.from(p.signed_tx_base64, 'base64').toString('latin1');
        const a = JSON.parse(/\{"receiver_id".*?\}/.exec(raw)[0]);
        if (st.mode === 'timeout') { st.pendingMint = a; throw err('TIMEOUT_ERROR'); }
        if (st.mode === 'optimistic') { st.pendingMint = a; return { final_execution_status: 'EXECUTED_OPTIMISTIC', status: { SuccessValue: '' } }; }
        if (st.mode.startsWith('fail:')) return { final_execution_status: 'FINAL', status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${st.mode.slice(5)}` } } } } }, receipts_outcome: [] };
        const r = mint(a.receiver_id, a.claim_id);
        if (typeof r === 'string') return { final_execution_status: 'FINAL', status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${r}` } } } } }, receipts_outcome: [] };
        return { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify(r)).toString('base64') }, receipts_outcome: [] };
      }
      if (method === 'tx') throw err('UNKNOWN_TRANSACTION');
      throw new Error('unexpected ' + method);
    },
    async view(contract, method, args) {
      if (st.down) throw new Error('fetch failed');
      if (method === 'pass_info') return { cap: st.cap, daily_cap: st.daily, minted: st.minted, minted_today: st.today, paused: st.paused };
      if (method === 'is_claimed') return st.claims.has(args.claim_id);
      if (method === 'has_minted') return st.mintedTo.has(args.account_id);
      if (method === 'nft_token') return st.tokens.get(args.token_id) || null;
      if (method === 'nft_tokens_for_owner') return [...st.tokens.values()].filter((t) => t.owner_id === args.account_id);
      throw new Error('view ' + method);
    },
  };
  return { st, client, mint };
}

async function setup({ env = {}, eligible = true, mode = 'final', key = true, dir = tmp(), chain = null, eligibility = null } = {}) {
  const minter = await generateKeyPair(), guest = await generateKeyPair();
  const ch = chain || fakeChain({ minterKey: minter.publicKey, guestKey: guest.publicKey, mode });
  const cfg = { ...passEnv({ FTF_PASS_CONTRACT: CONTRACT, FTF_PASS_MINTER: MINTER, FTF_PASS_KEY: key ? minter.secretKey : '', FTF_PASS_ENABLED: '1', FTF_PASS_DIR: dir, ...env }) };
  let signs = 0;
  let t = 1_762_960_000_000;
  const svc = createPassService({ cfg, client: ch.client, guestClient: ch.client, now: () => t, log: () => {},
    eligibility: eligibility || (async () => (eligible ? { eligible: true, paid: true, earned: 10000, needed: 10000 } : { eligible: false, paid: false, earned: 4200, needed: 10000 })),
    signer: async (s) => { signs++; return importSecretKey(s); }, verifyCaptcha: async (tok) => tok === 'ok' });
  const sk = await importSecretKey(guest.secretKey);
  async function body(wallet = 'ann.testnet', { guestAcc = GUEST, signWith = sk, pub = guest.publicKey, captcha } = {}) {
    const claim = { v: 1, board_season: 1, claim_id: claimIdFor(guestAcc), log_head: 'h0', log_len: 412, issued_at: t };
    const sig = await signWith.sign(new TextEncoder().encode(canonicalClaim(claim, wallet)));
    return { guest_account: guestAcc, public_key: pub, wallet, claim, signature: 'ed25519:' + b58encode(sig), ...(captcha ? { captcha } : {}) };
  }
  return { svc, ch, cfg, body, signs: () => signs, advance: (ms) => { t += ms; }, guest, dir };
}

test('pass: wallet id vectors (the fixture the game reads too)', () => {
  for (const c of ids.cases) assert.equal(checkWallet(c.id, { network: c.network, forbidden: ids.forbidden }).ok, c.valid, `${c.id} on ${c.network}`);
});

test('pass: minted only after FINAL and the token read back; the answer carries the hash and the explorer link', async () => {
  const s = await setup();
  const r = await s.svc.claim(await s.body(), '1.2.3.4');
  assert.equal(r.http, 200);
  assert.equal(r.body.status, 'minted');
  assert.match(r.body.tx_hash, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  assert.equal(r.body.token_id, '1');
  assert.equal(r.body.explorer, 'https://testnet.nearblocks.io/txns/' + r.body.tx_hash);
  assert.equal(s.ch.st.tokens.get('1').owner_id, 'ann.testnet');
  const again = await s.svc.claim(await s.body(), '1.2.3.4');
  assert.deepEqual([again.http, again.body.status, again.body.replay, again.body.tx_hash], [200, 'already_claimed', true, r.body.tx_hash]);
  assert.equal(s.ch.st.sends, 1);
  assert.equal(s.svc.status(r.body.claim_id).body.tx_hash, r.body.tx_hash);
});

test('pass: no hash before final (optimistic outcome, then a timeout) -> queued without a hash', async () => {
  for (const mode of ['optimistic', 'timeout']) {
    const s = await setup({ mode });
    const r = await s.svc.claim(await s.body(), 'ip');
    assert.equal(r.http, 202, mode);
    assert.equal(r.body.status, 'queued');
    assert.equal(r.body.tx_hash, undefined);
    assert.equal(JSON.stringify(r.body).match(/[1-9A-HJ-NP-Za-km-z]{43,44}/), null, 'no hash-like string at all');
    assert.equal(s.svc.status(r.body.claim_id).body.tx_hash, undefined);
  }
});

test('pass: 20 concurrent identical requests mint once', async () => {
  const s = await setup();
  const b = await s.body();
  const rs = await Promise.all(Array.from({ length: 20 }, () => s.svc.claim(b, 'ip')));
  assert.equal(s.ch.st.sends, 1);
  assert.equal(s.ch.st.minted, 1);
  assert.ok(rs.every((r) => r.body.status === 'minted'));
});

test('pass: a lost-state restart reads is_claimed and answers already_claimed (token id, never an invented hash)', async () => {
  const s = await setup();
  await s.svc.claim(await s.body(), 'ip');
  const fresh = createPassService({ cfg: { ...s.cfg, dir: tmp() }, client: s.ch.client, guestClient: s.ch.client, log: () => {}, eligibility: async () => ({ eligible: true }) , signer: importSecretKey });
  const r = await fresh.claim(await s.body(), 'ip');
  assert.deepEqual([r.http, r.body.status, r.body.token_id, r.body.tx_hash], [200, 'already_claimed', '1', undefined]);
  assert.equal(s.ch.st.sends, 1, 'no second send');
});

test('pass: dry run without a key answers not_configured after validation and eligibility, and never signs', async () => {
  const s = await setup({ key: false });
  const r = await s.svc.claim(await s.body(), 'ip');
  assert.deepEqual([r.http, r.body.status, r.body.checked], [503, 'not_configured', true]);
  assert.equal(s.signs(), 0);
  assert.equal(s.ch.st.sends, 0);
  const no = await setup({ key: false, eligible: false });
  assert.equal((await no.svc.claim(await no.body(), 'ip')).body.status, 'not_eligible', 'eligibility runs before not_configured');
});

test('pass: kill switch: FTF_PASS_ENABLED=0 or a STOP file -> paused (the claim is kept), nothing signed', async () => {
  const off = await setup({ env: { FTF_PASS_ENABLED: '0' } });
  const r = await off.svc.claim(await off.body(), 'ip');
  assert.deepEqual([r.http, r.body.status], [202, 'paused']);
  assert.equal(off.ch.st.sends, 0); assert.equal(off.signs(), 0);
  const dir = tmp(); writeFileSync(join(dir, 'STOP'), '');
  const stop = await setup({ dir });
  assert.equal((await stop.svc.claim(await stop.body(), 'ip')).body.status, 'paused');
  assert.equal(stop.ch.st.sends, 0);
});

test('pass: budget guard queues instead of sending (allowance, balance, full-access minter key, daily cap); total cap is sold_out', async () => {
  const cases = [['allowance', (st) => { st.allowance = '1000'; }, 'budget_exhausted'], ['balance', (st) => { st.balance = String(100000n * 10n ** 19n + 10n ** 21n); }, 'budget_exhausted'],
    ['full access key', (st) => { st.fullAccessMinter = true; }, 'budget_exhausted'], ['daily cap', (st) => { st.today = 100; }, 'budget_exhausted'],
    ['contract paused', (st) => { st.paused = true; }, 'paused'], ['total cap', (st) => { st.minted = 1000; }, 'sold_out']];
  for (const [name, f, status] of cases) {
    const s = await setup(); f(s.ch.st);
    const r = await s.svc.claim(await s.body(), 'ip');
    assert.equal(r.body.status, status, name);
    assert.equal(r.http, HTTP[status], name);
    assert.equal(s.ch.st.sends, 0, name);
  }
});

test('pass: every other row of the status table', async () => {
  let s = await setup();
  assert.equal((await s.svc.claim(await s.body('Ann.testnet'), 'ip')).body.status, 'invalid_account');
  assert.equal((await s.svc.claim(await s.body('ann.near'), 'ip')).body.status, 'invalid_account', '.near on testnet');
  assert.deepEqual(Object.values(await s.svc.claim(await s.body('nobody.testnet'), 'ip')).map((x) => x.status || x), [422, 'account_missing']);
  const other = await importSecretKey((await generateKeyPair()).secretKey);
  assert.equal((await s.svc.claim(await s.body('ann.testnet', { signWith: other }), 'ip')).body.status, 'signature_invalid', 'signed by another key');
  const stranger = await generateKeyPair(); const sk2 = await importSecretKey(stranger.secretKey);
  assert.equal((await s.svc.claim(await s.body('ann.testnet', { signWith: sk2, pub: stranger.publicKey }), 'ip')).body.status, 'signature_invalid', 'a key that is not the guest\'s');
  s.ch.st.mintedTo.add('bob.testnet');
  assert.deepEqual(Object.values(await s.svc.claim(await s.body('bob.testnet'), 'ip')).map((x) => x.status || x), [409, 'wallet_taken']);
  const ne = await setup({ eligible: false });
  const r = await ne.svc.claim(await ne.body(), 'ip');
  assert.deepEqual([r.http, r.body.status, r.body.needed, r.body.paid, r.body.earned], [403, 'not_eligible', 10000, false, 4200]);
  const fl = await setup({ mode: 'fail:ERR_SOMETHING' });
  const f = await fl.svc.claim(await fl.body(), 'ip');
  assert.deepEqual([f.http, f.body.status, f.body.code, f.body.tx_hash], [502, 'tx_failed', 'ERR_SOMETHING', undefined]);
  const dn = await setup(); dn.ch.st.down = true;
  assert.deepEqual(Object.values(await dn.svc.claim(await dn.body(), 'ip')).map((x) => x.status || x), [202, 'rpc_unavailable']);
  assert.equal((await s.svc.claim({ nonsense: 1 }, 'ip')).body.status, 'bad_body');
});

test('pass: captcha only when FTF_CAPTCHA_SECRET is set', async () => {
  const s = await setup({ env: { FTF_CAPTCHA_SECRET: 'x' } });
  assert.deepEqual(Object.values(await s.svc.claim(await s.body(), 'ip')).map((x) => x.status || x), [428, 'captcha_required']);
  s.advance(11 * 60_000); // the per-guest limit: one claim attempt per 10 minutes
  assert.equal((await s.svc.claim(await s.body('ann.testnet', { captcha: 'nope' }), 'ip2')).body.status, 'captcha_required');
  s.advance(11 * 60_000);
  assert.equal((await s.svc.claim(await s.body('ann.testnet', { captcha: 'ok' }), 'ip3')).body.status, 'minted');
});

test('pass: per-IP rate limit (3 at once) answers 429 with a wait', async () => {
  const s = await setup();
  // four different guests from one IP: their keys must be the guests' own, so use the same key added to each guest name
  const guests = ['a1', 'a2', 'a3', 'a4'].map((n) => `${n}.guests.ftf-coordinator.testnet`);
  s.ch.client.rpc = ((orig) => async (m, p) => (m === 'query' && p.request_type === 'view_access_key' && guests.includes(p.account_id) ? { nonce: 1, permission: 'FullAccess' } : orig(m, p)))(s.ch.client.rpc.bind(s.ch.client));
  const wallets = ['ann.testnet', 'bob.testnet', 'cat.testnet', 'dan.testnet']; for (const w of wallets) s.ch.st.accounts.add(w);
  const out = [];
  for (let i = 0; i < 4; i++) out.push(await s.svc.claim(await s.body(wallets[i], { guestAcc: guests[i] }), '9.9.9.9'));
  assert.deepEqual(out.map((r) => r.body.status), ['minted', 'minted', 'minted', 'rate_limited']);
  assert.equal(out[3].http, 429);
  assert.ok(out[3].body.retry_after_s > 0);
});

test('pass: the queue worker retries with backoff, mints once, and expires after 24 h', async () => {
  const s = await setup({ env: { FTF_PASS_ENABLED: '0' } });
  const r = await s.svc.claim(await s.body(), 'ip');
  assert.equal(r.body.status, 'paused');
  s.cfg.enabled = true;
  assert.equal(await s.svc.work(), 0, 'too early for the backoff');
  s.advance(BACKOFF_MS[0] + 1);
  await s.svc.work();
  assert.equal(s.svc.status(r.body.claim_id).body.status, 'minted');
  assert.equal(s.ch.st.sends, 1);
  const e = await setup({ env: { FTF_PASS_ENABLED: '0' } });
  const r2 = await e.svc.claim(await e.body(), 'ip');
  e.advance(EXPIRE_MS + 1);
  await e.svc.work();
  assert.equal(e.svc.status(r2.body.claim_id).body.status, 'expired');
});

test('pass: an ambiguous send is looked up, never re-sent blindly', async () => {
  const s = await setup({ mode: 'timeout' });
  const r = await s.svc.claim(await s.body(), 'ip');
  assert.equal(r.body.status, 'queued');
  // the chain did mint it after all
  s.ch.mint(s.ch.st.pendingMint.receiver_id, s.ch.st.pendingMint.claim_id);
  s.ch.st.mode = 'final';
  s.advance(BACKOFF_MS[3] + 1);
  await s.svc.work();
  const st = s.svc.status(r.body.claim_id).body;
  assert.equal(st.status, 'minted', 'found through is_claimed and read back');
  assert.equal(s.ch.st.sends, 1, 'not sent again');
});

test('pass: the store survives a restart (append-only JSONL, last line wins)', async () => {
  const dir = tmp();
  const a = createPassStore(dir); a.put({ claim_id: 'c1', wallet: 'w', status: 'queued' }); a.put({ claim_id: 'c1', wallet: 'w', status: 'minted', tx_hash: 'H' });
  const b = createPassStore(dir);
  assert.equal(b.get('c1').status, 'minted');
  assert.equal(b.byWallet('w').claim_id, 'c1');
});

test('pass: source scan: no secret keys and no hash literals in the pass code', () => {
  const files = ['lib/pass.js', 'lib/pass-service.js', ...readdirSync(new URL('../api/pass/', import.meta.url)).map((f) => 'api/pass/' + f)];
  for (const f of files) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.equal(/ed25519:[1-9A-HJ-NP-Za-km-z]{60,}/.test(src), false, f + ': no key literal');
    assert.equal(/['"`][1-9A-HJ-NP-Za-km-z]{43,44}['"`]/.test(src), false, f + ': no base58 hash literal');
    assert.equal(/['"`][0-9a-f]{64}['"`]/.test(src), false, f + ': no hex hash literal');
  }
});
