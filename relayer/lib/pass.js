// The whitelist pass claim (story TZ §11.3; contract: contracts/whitelist-pass; API: docs/pass-claim-api.md).
//
// A player who paid 10,000 town silk at the Gate-Loom asks for a free pass to a NEAR wallet. The relayer checks, in
// this order (each step is its own function, tested): the wallet id's syntax; that a named wallet exists on the pass
// network; that the claim is signed by a key of the player's Day 1 guest account (testnet); one claim per guest and
// one per wallet (server index, then the contract's is_claimed / has_minted); eligibility from the replayed
// expedition log (injected: the story module's portalEligibility); rate limits; the budget (minter allowance, contract
// balance, pass_info). Only then it sends `mint_pass` with the minter's FUNCTION-CALL key, waits for FINAL and reads
// the token back with the wallet as owner. A transaction hash is returned only with status `minted`.
//
// Safe by default: without FTF_PASS_KEY the endpoint answers 503 not_configured after validation and eligibility (a
// rehearsal), and nothing signs unless FTF_PASS_ENABLED=1. FTF_PASS_ENABLED=0 or a STOP file in FTF_PASS_DIR halts
// sending (claims keep queueing). The default network is testnet.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { b58decode, b58encode, createTxClient, findFailure, importSecretKey, serializeFunctionCallTx, sha256, signedTxBytes } from './near-tx.js';
import { createBucket, DEFAULTS } from './core.js';

export const PORTAL_FEE_SILK = 10_000;
export const BOARD_SEASON = 1;
export const RPC = Object.freeze({
  // [VERIFY current public RPC limits and sunset notices before mainnet] two endpoints each, the client fails over
  mainnet: Object.freeze(['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com']),
  testnet: DEFAULTS.rpcUrls,
});
export const EXPLORER = Object.freeze({ mainnet: 'https://nearblocks.io/txns/', testnet: 'https://testnet.nearblocks.io/txns/' });
export const BACKOFF_MS = Object.freeze([30_000, 120_000, 600_000, 3_600_000]);
export const EXPIRE_MS = 24 * 3_600_000;
const YOCTO = 10n ** 24n;
const BYTE_COST = 10n ** 19n;

/** status -> HTTP code (story TZ §11.3 table). */
export const HTTP = Object.freeze({
  minted: 200, already_claimed: 200, queued: 202, paused: 202, budget_exhausted: 202, rpc_unavailable: 202,
  invalid_account: 400, bad_body: 400, signature_invalid: 401, not_eligible: 403, wallet_taken: 409, sold_out: 410,
  account_missing: 422, captcha_required: 428, rate_limited: 429, tx_failed: 502, not_configured: 503,
});

/** Environment -> config. Testnet and dry-run unless the owner sets otherwise. Never logs or returns the key. */
export function passEnv(env = process.env) {
  const network = env.FTF_PASS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null);
  return {
    network,
    contract: env.FTF_PASS_CONTRACT || '',
    minter: env.FTF_PASS_MINTER || '',
    secretKey: env.FTF_PASS_KEY || '',
    enabled: env.FTF_PASS_ENABLED === '1',
    dir: env.FTF_PASS_DIR || new URL('../data/pass', import.meta.url).pathname,
    rpcUrls: list(env.FTF_PASS_RPC_URLS) || RPC[network],
    guestRpcUrls: list(env.FTF_RPC_URLS) || RPC.testnet,
    dailyCap: Math.max(1, Number(env.FTF_PASS_DAILY_CAP) || 100),
    minAllowanceYocto: BigInt(env.FTF_PASS_MIN_ALLOWANCE_YOCTO || String(YOCTO / 20n)),   // 0.05 NEAR of gas left on the key
    minBalanceYocto: BigInt(env.FTF_PASS_MIN_BALANCE_YOCTO || String(YOCTO / 10n)),        // 0.1 NEAR available on the contract
    captchaSecret: env.FTF_CAPTCHA_SECRET || '',
    requireFundedImplicit: env.FTF_PASS_REQUIRE_FUNDED_IMPLICIT === '1',
    alertUrl: env.FTF_PASS_ALERT_URL || '',
  };
}

// ---------------------------------------------------------------- 1. wallet syntax

export const NAMED_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const IMPLICIT_RE = /^[0-9a-f]{64}$/;
/** {ok} or {ok: false, status: 'invalid_account'}. Uppercase is refused, never lowercased: the player sees what is used. */
export function checkWallet(id, { network = 'testnet', forbidden = [] } = {}) {
  const bad = { ok: false, status: 'invalid_account' };
  if (typeof id !== 'string' || id.length < 2 || id.length > 64) return bad;
  const implicit = IMPLICIT_RE.test(id);
  if (!implicit && !NAMED_RE.test(id)) return bad;
  if (forbidden.filter(Boolean).includes(id)) return bad;
  if (!implicit && network === 'mainnet' && id.endsWith('.testnet')) return bad;
  if (!implicit && network === 'testnet' && !id.endsWith('.testnet')) return bad;
  return { ok: true, implicit };
}

// ---------------------------------------------------------------- the claim body and its signature

export const claimIdFor = (guest, season = BOARD_SEASON) => createHash('sha256').update(`ftf-pass-1|${season}|${guest}`).digest('hex');
/** The exact text the guest key signs: every claim field and the wallet, in a fixed order. */
export const canonicalClaim = (c, wallet) => ['ftf-pass-claim', c.v, c.board_season, c.claim_id, c.log_head, c.log_len, c.issued_at, wallet].join('|');
const GUEST_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/** Shape checks without the network: {ok, guest, wallet, publicKey, claim, signature} or {ok: false, status}. */
export function readClaim(b) {
  const bad = { ok: false, status: 'bad_body' };
  if (!b || typeof b !== 'object' || !b.claim || typeof b.claim !== 'object') return bad;
  const c = b.claim;
  if (typeof b.guest_account !== 'string' || !GUEST_RE.test(b.guest_account)) return bad;
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return bad;
  if (typeof b.signature !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(b.signature)) return bad;
  if (c.v !== 1 || c.board_season !== BOARD_SEASON || !Number.isSafeInteger(c.log_len) || c.log_len < 0 || !Number.isSafeInteger(c.issued_at)) return bad;
  if (typeof c.log_head !== 'string' || c.log_head.length > 128) return bad;
  if (c.claim_id !== claimIdFor(b.guest_account, c.board_season)) return bad;
  return { ok: true, guest: b.guest_account, wallet: b.wallet, publicKey: b.public_key, claim: c, signature: b.signature, captcha: typeof b.captcha === 'string' ? b.captcha : '' };
}

/** 3a. The ed25519 signature over canonicalClaim by `publicKey`. */
export async function verifySignature({ claim, wallet, publicKey, signature }) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature.slice(8));
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(canonicalClaim(claim, wallet)));
  } catch { return false; }
}

// ---------------------------------------------------------------- the network reads (each against a client: rpc, view)

/** 2. Named accounts must exist on the pass network; implicit ones may be unfunded (unless the owner requires it). */
export async function walletExists(client, wallet, { implicit, requireFundedImplicit = false } = {}) {
  if (implicit && !requireFundedImplicit) return true;
  try { await client.rpc('query', { request_type: 'view_account', finality: 'final', account_id: wallet }); return true; }
  catch (e) { if (/UNKNOWN_ACCOUNT|does not exist/i.test(JSON.stringify((e && e.rpc) || (e && e.message) || ''))) return false; throw e; }
}
/** 3b. The public key is an access key of the guest account (testnet). */
export async function guestOwnsKey(client, guest, publicKey) {
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: guest, public_key: publicKey }); return true; }
  catch (e) { if (e && e.rpc) return false; throw e; }
}
/** 7. The budget: the minter key's allowance, the contract's available balance, pass_info. {ok, info} or {ok: false, status}. */
export async function checkBudget(client, cfg, minterPublicKey) {
  const info = await client.view(cfg.contract, 'pass_info', {});
  if (!info) return { ok: false, status: 'rpc_unavailable' };
  if (info.minted >= info.cap) return { ok: false, status: 'sold_out', info };
  if (info.paused) return { ok: false, status: 'paused', info };
  if (info.minted_today >= Math.min(info.daily_cap, cfg.dailyCap)) return { ok: false, status: 'budget_exhausted', info, why: 'daily_cap' };
  const acct = await client.rpc('query', { request_type: 'view_account', finality: 'final', account_id: cfg.contract });
  const available = BigInt(acct.amount) - BigInt(acct.storage_usage) * BYTE_COST;
  if (available < cfg.minBalanceYocto) return { ok: false, status: 'budget_exhausted', info, why: 'contract_balance' };
  if (minterPublicKey) {
    const ak = await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: cfg.minter, public_key: minterPublicKey });
    const fc = ak && ak.permission && ak.permission.FunctionCall;
    if (!fc) return { ok: false, status: 'budget_exhausted', info, why: 'minter_key_not_function_call' };   // a full-access key is refused
    if (fc.allowance != null && BigInt(fc.allowance) < cfg.minAllowanceYocto) return { ok: false, status: 'budget_exhausted', info, why: 'allowance' };
  }
  return { ok: true, info };
}

// ---------------------------------------------------------------- the store: append-only JSONL, the last line per claim wins

export function createPassStore(dir) {
  const file = join(dir, 'pass-claims.jsonl');
  const byClaim = new Map();
  try { for (const l of readFileSync(file, 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); byClaim.set(r.claim_id, r); } catch { /* a torn line */ } } } catch { /* first run */ }
  return {
    get: (claimId) => byClaim.get(claimId) || null,
    byWallet: (wallet) => [...byClaim.values()].find((r) => r.wallet === wallet && r.status !== 'tx_failed') || null,
    pending: () => [...byClaim.values()].filter((r) => ['queued', 'paused', 'budget_exhausted', 'rpc_unavailable'].includes(r.status)),
    put(r) {
      byClaim.set(r.claim_id, r);
      try { mkdirSync(dir, { recursive: true }); appendFileSync(file, JSON.stringify(r) + '\n', { mode: 0o600 }); } catch { /* memory only */ }
      return r;
    },
  };
}

/** The kill switch: FTF_PASS_ENABLED must be 1 and no STOP file in the pass directory. */
export const sendingAllowed = (cfg) => cfg.enabled && !existsSync(join(cfg.dir, 'STOP'));

// ---------------------------------------------------------------- 8. the send

/**
 * Signs mint_pass with the minter key, sends it with wait_until FINAL, reads the token back. The hash is computed before
 * sending and recorded as `pending_tx` so an ambiguous outcome is looked up, never re-sent blindly.
 * Returns {status: 'minted', tx_hash, token_id} | {status: 'queued'} | {status: 'tx_failed', code}.
 */
export async function sendMint(client, cfg, key, rec, { onPending = () => {} } = {}) {
  const ak = await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: cfg.minter, public_key: key.publicKey });
  const block = await client.rpc('block', { finality: 'final' });
  const tx = serializeFunctionCallTx({ signerId: cfg.minter, publicKey: key.publicKey, nonce: BigInt(ak.nonce) + 1n, receiverId: cfg.contract, blockHash: block.header.hash, methodName: 'mint_pass', args: { receiver_id: rec.wallet, claim_id: rec.claim_id }, gas: 30_000_000_000_000n, deposit: 0n });
  const hashBytes = await sha256(tx);
  const hash = b58encode(hashBytes);
  onPending(hash);
  const sig = await key.sign(hashBytes);
  let outcome;
  try { outcome = await client.rpc('send_tx', { signed_tx_base64: Buffer.from(signedTxBytes(tx, sig)).toString('base64'), wait_until: 'FINAL' }); }
  catch (e) { if (e && e.rpc && !/TIMEOUT|Timeout/i.test(JSON.stringify(e.rpc))) return { status: 'tx_failed', code: (e.rpc.cause && e.rpc.cause.name) || 'rpc_error' }; return { status: 'queued' }; }
  return settle(client, cfg, rec, hash, outcome);
}

/** From a final outcome to a status: minted only when the token reads back with the wallet as owner. */
export async function settle(client, cfg, rec, hash, outcome) {
  if (!outcome || !outcome.final_execution_status && !outcome.status) return { status: 'queued' };
  if (outcome.final_execution_status && outcome.final_execution_status !== 'FINAL') return { status: 'queued' };
  const failure = findFailure(outcome);
  if (failure) {
    const code = (/ERR_[A-Z_]+/.exec(failure) || ['tx_failed'])[0];
    if (code === 'ERR_CLAIM_USED') return readBack(client, cfg, rec, null);
    return { status: code === 'ERR_WALLET_MINTED' ? 'wallet_taken' : code === 'ERR_SOLD_OUT' ? 'sold_out' : code === 'ERR_PAUSED' ? 'paused' : code === 'ERR_DAILY_CAP' ? 'budget_exhausted' : 'tx_failed', code };
  }
  let token = null;
  try { token = JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString()); } catch { token = null; }
  return readBack(client, cfg, rec, hash, token && token.token_id);
}

/** The token minted for this claim, read from the chain; minted only with the wallet as its owner (it may move later). */
async function readBack(client, cfg, rec, hash, tokenId = null) {
  let t = tokenId ? await client.view(cfg.contract, 'nft_token', { token_id: tokenId }) : null;
  if (!t) {
    const mine = (await client.view(cfg.contract, 'nft_tokens_for_owner', { account_id: rec.wallet, limit: 50 })) || [];
    t = mine.find((x) => x && x.metadata && typeof x.metadata.extra === 'string' && x.metadata.extra.includes(rec.claim_id)) || null;
  }
  if (!t || t.owner_id !== rec.wallet) return { status: 'queued' };
  return hash ? { status: 'minted', tx_hash: hash, token_id: t.token_id } : { status: 'minted_unknown_hash', token_id: t.token_id };
}

/** An ambiguous earlier send: the tx by its hash, else the contract's claim set. Never re-sends while it may be in flight. */
export async function lookUp(client, cfg, rec) {
  if (rec.pending_tx) {
    try {
      const o = await client.rpc('tx', { tx_hash: rec.pending_tx, sender_account_id: cfg.minter, wait_until: 'FINAL' });
      const r = await settle(client, cfg, rec, rec.pending_tx, o);
      if (r.status !== 'queued') return r;
    } catch { /* unknown tx: fall through */ }
  }
  const claimed = await client.view(cfg.contract, 'is_claimed', { claim_id: rec.claim_id });
  // minted earlier but this server lost the hash: the token is real, the hash is unknown and is never invented
  if (claimed) { const r = await readBack(client, cfg, rec, rec.pending_tx || null); return r.status === 'minted_unknown_hash' ? { status: 'already_claimed', token_id: r.token_id } : r; }
  return { status: 'not_sent' };
}

// ---------------------------------------------------------------- the service

const publicBody = (r, cfg) => {
  const b = { status: r.status, claim_id: r.claim_id, network: cfg.network };
  if (r.status === 'minted' || r.status === 'already_claimed') { b.token_id = r.token_id; b.contract = cfg.contract; if (r.tx_hash) { b.tx_hash = r.tx_hash; b.explorer = EXPLORER[cfg.network] + r.tx_hash; } }
  if (r.replay) b.replay = true;
  for (const k of ['needed', 'paid', 'earned', 'retry_after_s', 'code']) if (r[k] !== undefined) b[k] = r[k];
  return b;
};

/**
 * The claim service. Dependencies are injected so the tests run with a mock RPC and in-memory keys only.
 * @param {{cfg: object, store?: object, eligibility: (guest: string) => Promise<{eligible: boolean, paid: boolean, earned: number, needed: number}>,
 *   client?: object, guestClient?: object, now?: () => number, ipBucket?: object, guestBucket?: object,
 *   verifyCaptcha?: (token: string) => Promise<boolean>, signer?: (secret: string) => Promise<object>, log?: (level: string, msg: string) => void}} o
 */
export function createPassService({ cfg, store = createPassStore(cfg.dir), eligibility, client, guestClient, now = Date.now, ipBucket, guestBucket, verifyCaptcha = async () => false, signer = importSecretKey, log = (lvl, m) => console[lvl === 'error' ? 'error' : 'log'](`[pass] ${m}`) }) {
  const net = client || createTxClient({ rpcUrls: cfg.rpcUrls, timeoutMs: 5000 });
  const guests = guestClient || createTxClient({ rpcUrls: cfg.guestRpcUrls, timeoutMs: 5000 });
  const ips = ipBucket || createBucket({ capacity: 3, refillMs: 10 * 60 * 1000, now });
  const perGuest = guestBucket || createBucket({ capacity: 1, refillMs: 10 * 60 * 1000, now });
  const inflight = new Map();
  let lane = Promise.resolve();
  const oneAtATime = (fn) => { const p = lane.then(fn, fn); lane = p.catch(() => {}); return p; };
  let keyP = null;
  const key = () => (keyP ||= signer(cfg.secretKey));
  const alert = (m) => log('error', `ALERT ${m}`);
  const forbidden = () => [cfg.contract, cfg.minter];

  const done = (rec, extra = {}) => ({ http: HTTP[extra.status || rec.status] || 500, body: publicBody({ ...rec, ...extra }, cfg) });
  const fail = (status, extra = {}) => ({ http: HTTP[status], body: { status, network: cfg.network, ...extra } });

  /** Steps 7 and 8 for a stored record; it is saved after each change. */
  async function attempt(rec) {
    if (!cfg.secretKey) return rec;
    if (!sendingAllowed(cfg)) return store.put({ ...rec, status: 'paused', updated_at: now() });
    try {
      const prior = await lookUp(net, cfg, rec);
      if (prior.status === 'minted' || prior.status === 'already_claimed') return store.put({ ...rec, status: prior.status, tx_hash: prior.tx_hash, token_id: prior.token_id, updated_at: now() });
      if (prior.status === 'queued') return store.put({ ...rec, status: 'queued', updated_at: now() });   // in flight or unread: wait
      const k = await key();
      const b = await checkBudget(net, cfg, k.publicKey);
      if (!b.ok) { if (b.status === 'budget_exhausted' || b.status === 'rpc_unavailable') alert(`budget: ${b.why || b.status}`); return store.put({ ...rec, status: b.status, updated_at: now() }); }
      const r = await oneAtATime(() => sendMint(net, cfg, k, rec, { onPending: (h) => store.put({ ...rec, status: 'queued', pending_tx: h, updated_at: now() }) }));
      const cur = store.get(rec.claim_id) || rec;
      if (r.status === 'minted') return store.put({ ...cur, status: 'minted', tx_hash: r.tx_hash, token_id: r.token_id, updated_at: now() });
      return store.put({ ...cur, status: r.status, code: r.code, updated_at: now() });
    } catch (e) {
      log('error', `send: ${String((e && e.message) || e).slice(0, 120)}`);
      return store.put({ ...(store.get(rec.claim_id) || rec), status: 'rpc_unavailable', updated_at: now() });
    }
  }

  async function claimOnce(body, ip) {
    const c = readClaim(body);
    if (!c.ok) return fail(c.status);
    const w = checkWallet(c.wallet, { network: cfg.network, forbidden: forbidden() });             // 1
    if (!w.ok) return fail('invalid_account');
    const prev = store.get(c.claim.claim_id);
    if (prev && (prev.status === 'minted' || prev.status === 'already_claimed')) return done(prev, { status: 'already_claimed', replay: true });
    try { if (!(await walletExists(net, c.wallet, { implicit: w.implicit, requireFundedImplicit: cfg.requireFundedImplicit }))) return fail('account_missing'); }  // 2
    catch { return fail('rpc_unavailable'); }
    if (!(await verifySignature(c))) return fail('signature_invalid');                               // 3
    try { if (!(await guestOwnsKey(guests, c.guest, c.publicKey))) return fail('signature_invalid'); } catch { return fail('rpc_unavailable'); }
    if (prev) return done(prev, { replay: true });                                                   // 4 (server index)
    const other = store.byWallet(c.wallet);
    if (other) return fail('wallet_taken');
    if (cfg.contract) {
      try {
        if (await net.view(cfg.contract, 'is_claimed', { claim_id: c.claim.claim_id })) {
          const r = await lookUp(net, cfg, { claim_id: c.claim.claim_id, wallet: c.wallet });
          if (r.status === 'minted' || r.status === 'already_claimed') return done(store.put({ claim_id: c.claim.claim_id, guest: c.guest, wallet: c.wallet, status: r.status, tx_hash: r.tx_hash, token_id: r.token_id, created_at: now(), updated_at: now() }), { status: 'already_claimed', replay: true });
          return fail('queued', { claim_id: c.claim.claim_id });
        }
        if (await net.view(cfg.contract, 'has_minted', { account_id: c.wallet })) return fail('wallet_taken');
      } catch { return fail('rpc_unavailable'); }
    }
    let el;                                                                                          // 5
    try { el = await eligibility(c.guest); } catch { return fail('rpc_unavailable'); }
    if (!el || !el.eligible) return fail('not_eligible', { needed: (el && el.needed) || PORTAL_FEE_SILK, paid: !!(el && el.paid), earned: (el && el.earned) || 0 });
    const lim = ips.take(ip);                                                                        // 6
    if (!lim.ok) return fail('rate_limited', { retry_after_s: lim.retryAfterS });
    const g = perGuest.take(c.guest);
    if (!g.ok) return fail('rate_limited', { retry_after_s: g.retryAfterS });
    if (cfg.captchaSecret) { if (!c.captcha) return fail('captcha_required'); if (!(await verifyCaptcha(c.captcha))) return fail('captcha_required'); }
    if (!cfg.secretKey || !cfg.contract) return fail('not_configured', { checked: true, claim_id: c.claim.claim_id });   // dry run: validated, eligible, nothing sent
    const rec = store.put({ claim_id: c.claim.claim_id, guest: c.guest, wallet: c.wallet, status: 'queued', attempts: 0, created_at: now(), updated_at: now() });
    const after = await attempt({ ...rec, attempts: 1 });
    return done(after);
  }

  return {
    /** POST /api/pass/claim. Identical concurrent requests share one run (one mint). */
    async claim(body, ip = 'unknown') {
      const id = body && body.claim && typeof body.claim.claim_id === 'string' ? body.claim.claim_id : null;
      if (id && inflight.has(id)) return inflight.get(id);
      const p = claimOnce(body, ip);
      if (id) { inflight.set(id, p); p.finally(() => inflight.delete(id)); }
      return p;
    },
    /** GET /api/pass/status?claim_id= */
    status(claimId) {
      if (typeof claimId !== 'string' || !/^[0-9a-f]{64}$/.test(claimId)) return fail('bad_body');
      const r = store.get(claimId);
      if (!r) return { http: 404, body: { status: 'unknown', claim_id: claimId } };
      return done(r);
    },
    /** GET /api/pass/eligibility?guest= : the replayed log's verdict, never a promise. */
    async eligibility(guest) {
      if (typeof guest !== 'string' || !GUEST_RE.test(guest)) return fail('bad_body');
      try { const e = await eligibility(guest); return { http: 200, body: { eligible: !!e.eligible, paid: !!e.paid, earned: e.earned || 0, needed: e.needed || PORTAL_FEE_SILK } }; }
      catch { return fail('rpc_unavailable'); }
    },
    /** The queue worker: one pass over pending claims whose backoff has elapsed; old ones expire. */
    async work() {
      const t = now(); let sent = 0;
      for (const r of store.pending()) {
        if (t - r.created_at > EXPIRE_MS) { store.put({ ...r, status: 'expired', updated_at: t }); continue; }
        const wait = BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, Math.max(0, (r.attempts || 1) - 1))];
        if (t - (r.updated_at || 0) < wait) continue;
        await attempt({ ...r, attempts: (r.attempts || 0) + 1 }); sent++;
      }
      return sent;
    },
    health: () => ({ network: cfg.network, contract: cfg.contract || null, configured: !!cfg.secretKey, enabled: sendingAllowed(cfg) }),
    store,
  };
}

/** The default eligibility before the story module is wired: nobody is eligible yet (honest, never a guess). */
export const notYetEligible = async () => ({ eligible: false, paid: false, earned: 0, needed: PORTAL_FEE_SILK });
