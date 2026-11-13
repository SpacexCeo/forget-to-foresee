// The player's own moves in the town economy, through the relayer (contract v4; docs/town-act.md). A guest's browser
// key is a function-call key of the guests contract and cannot sign to ftf-town, so the guest signs a request and the
// relayer (a coordinator) makes the move for it with the matching *_for method, exactly like the portal
// (lib/town-gate.js):
//
//   "ftf-town-act|<account>|<action>|<args>|<at>"    <args> = the action's fields in order, joined by ","
//
// The relayer checks the signature, that the key is an access key of that account (view_access_key), the timestamp,
// and that the request was never used (here and on chain, act_request_used). Moves that spend silk first credit the
// guest's verified income (syncCredit; a guest without a log keeps what it already holds). The contract records the
// request's sha256 once, counts the move against a per-player and an all-players daily limit, and moves silk only on
// the guest's own row; a deed is minted to the guest.
import { signatureValid, syncCredit, requestHash, GATE } from './town-gate.js';

const DIGITS = /^[1-9][0-9]{0,17}$/;                      // micro-silk, at most 10^18 - 1 (a trillion silk)
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
const TOKEN_RE = /^[a-z0-9-]{1,64}$/;
const SEASON_RE = /^[A-Za-z0-9_-]{1,32}$/;
const small = (n) => (x) => Number.isInteger(x) && x >= 0 && x <= n;

/** Each action: its fields (signed in this order), their checks, the contract method, and whether it spends silk. */
export const ACTIONS = Object.freeze({
  pledge:           { fields: ['asset', 'amount', 'tier'], check: { asset: small(3), amount: (x) => DIGITS.test(String(x)), tier: small(3) }, method: 'pledge_for', spends: true,
                      args: (a) => ({ asset: a.asset, amount: String(a.amount), tier: a.tier }) },
  claim:            { fields: ['token_id'], check: { token_id: (x) => TOKEN_RE.test(String(x)) }, method: 'claim_for', args: (a) => ({ token_id: a.token_id }) },
  unbond:           { fields: ['token_id'], check: { token_id: (x) => TOKEN_RE.test(String(x)) }, method: 'unbond_for', args: (a) => ({ token_id: a.token_id }) },
  exit_early:       { fields: ['token_id'], check: { token_id: (x) => TOKEN_RE.test(String(x)) }, method: 'exit_early_for', args: (a) => ({ token_id: a.token_id }) },
  invest_stall:     { fields: ['trader', 'amount'], check: { trader: (x) => ACCOUNT_RE.test(String(x)), amount: (x) => DIGITS.test(String(x)) }, method: 'invest_stall_for', spends: true,
                      args: (a) => ({ trader: a.trader, amount: String(a.amount) }) },
  claim_stall:      { fields: ['trader'], check: { trader: (x) => ACCOUNT_RE.test(String(x)) }, method: 'claim_stall_for', args: (a) => ({ trader: a.trader }) },
  enter_tournament: { fields: ['season_id'], check: { season_id: (x) => SEASON_RE.test(String(x)) }, method: 'enter_tournament_for', spends: true, args: (a) => ({ season_id: a.season_id }) },
});

export const actMessage = (accountId, action, args, at) => `ftf-town-act|${accountId}|${action}|${ACTIONS[action].fields.map((f) => String(args[f])).join(',')}|${at}`;

/** Shape check of a signed move. */
export function validateAct(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > GATE.maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  const spec = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) ? ACTIONS[b.action] : null;
  if (!spec) return { ok: false, error: 'bad_action' };
  const a = b.args && typeof b.args === 'object' ? b.args : null;
  if (!a || !spec.fields.every((f) => spec.check[f](a[f]))) return { ok: false, error: 'bad_args' };
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature, action: b.action, args: a, message: actMessage(b.account_id, b.action, a, b.at) };
}

/** The contract's return value of a final outcome (JSON), or null. */
export function returnValueOf(outcome) {
  try { const v = outcome && outcome.status && outcome.status.SuccessValue; return v ? JSON.parse(Buffer.from(v, 'base64').toString('utf8')) : null; } catch { return null; }
}

const REASON = [[/ERR_ACT_CAP/, 429, 'daily_limit'], [/ERR_ACT_REQUEST/, 409, 'replayed'], [/ERR_FUNDS/, 402, 'not_enough_silk'], [/ERR_CAP:/, 409, 'pledge_cap'],
  [/ERR_LOCKED/, 409, 'locked'], [/ERR_NOT_READY/, 409, 'cooling_down'], [/ERR_NOT_DEED_OWNER|ERR_NO_DEED/, 403, 'not_your_deed'], [/ERR_STATE/, 409, 'wrong_state'],
  [/ERR_NO_STALL/, 404, 'no_stall'], [/ERR_ENTERED/, 409, 'already_entered'], [/ERR_SEASON/, 409, 'no_open_season'], [/ERR_PAUSED/, 503, 'paused'], [/ERR_MIN_TRADE/, 400, 'too_small'],
  [/ERR_ACT_FOR/, 403, 'not_for_town_wallets'], [/ERR_NO_EXIT_YET/, 409, 'no_exit_yet'], [/ERR_UNKNOWN_ACCOUNT/, 409, 'not_registered'], [/MethodNotFound|CodeDoesNotExist/, 503, 'contract_not_upgraded']];

/**
 * Makes a guest's signed move on ftf-town. deps: {client, cfg (townGateEnv), replay, key, ledger, loadLog, now, log}.
 * @returns {Promise<{status, body}>}
 */
export async function actFor(v, deps) {
  const { client, cfg } = deps, spec = ACTIONS[v.action];
  if (!(await signatureValid(v.publicKey, v.signature, v.message))) return { status: 401, body: { error: 'bad_signature' } };
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: v.accountId, public_key: v.publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const hash = requestHash(v.message, v.signature);
  if (!deps.replay.use(hash) || (await client.view(cfg.town, 'act_request_used', { request_hash: hash }))) return { status: 409, body: { error: 'replayed' } };
  let credit = null;
  const key = deps.key || (await (await import('./near-tx.js')).importSecretKey(cfg.coordKey));
  if (spec.spends && cfg.logDir) {
    const c = await syncCredit(v.accountId, deps); // registers the account first, then credits the verified income
    if (c.status === 200) credit = { credited_now: c.body.credited_now, silk: c.body.silk, registered_now: !!c.body.registered_now };
    else if (!(c.status === 409 && c.body.error === 'no_verified_log')) return c;
  } else if (!(await client.view(cfg.town, 'balance_of', { account_id: v.accountId }))) {
    // not in the town yet: register it in the same request, then make the move (live bug 13.11: ERR_UNKNOWN_ACCOUNT)
    const r = await client.call({ key, signerId: cfg.coord, receiverId: cfg.town, methodName: 'register', args: { accounts: [v.accountId] }, gas: GATE.gas });
    if (!r.ok) return { status: 502, body: { error: 'register_failed', tx_hash: r.hash } };
    credit = { credited_now: '0', registered_now: true };
  }
  const r = await client.call({ key, signerId: cfg.coord, receiverId: cfg.town, methodName: spec.method, args: { account_id: v.accountId, ...spec.args(v.args), request_hash: hash }, gas: GATE.gas });
  if (!r.ok) {
    const f = String(r.failure || ''), hit = REASON.find(([re]) => re.test(f));
    return { status: hit ? hit[1] : 502, body: { error: hit ? hit[2] : 'act_failed', detail: f.slice(0, 160), tx_hash: r.hash } };
  }
  const value = returnValueOf(r.outcome);
  if (deps.log) deps.log({ at: (deps.now || Date.now)(), guest: v.accountId, action: v.action, tx: r.hash });
  const after = await client.view(cfg.town, 'balance_of', { account_id: v.accountId });
  return { status: 200, body: { ok: true, action: v.action, tx_hash: r.hash, request_hash: hash, result: value, silk: after ? String(after.silk) : null, credit, contract: cfg.town } };
}

