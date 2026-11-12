// The player's path to the portal on chain (City Economy rev 4 §2.13; docs/town-gate.md). A guest's browser key is a
// function-call key of the guests contract and cannot sign to ftf-town, so the relayer acts for the guest, and only
// on what the guest proves:
//
//  1. CREDIT. The silk a guest earned in the game is its stored, hash-chained expedition log (lib/expedition-store.js,
//     verified with the shared rules' verifyLog: T2 income in full, T1 kill income up to its cap). Scaled to the
//     on-chain gate (game fee 10,000 → gate price, 200 by default: ×0.02), that is what the guest may hold on
//     ftf-town. The relayer registers the guest and credits the difference with credit_silk, within a daily cap per
//     guest and the contract's own ceiling, idempotently: a per-guest ledger records what was credited, written
//     before the call and rolled back if the call fails.
//  2. GATE. The guest signs "ftf-gate|<account>|<gate_id>|<at>" with its own key. The relayer checks the signature,
//     that the key is an access key of that account (view_access_key), the timestamp, and that the request was never
//     used; it credits first, checks the balance and that this gate is unpaid, then calls pay_gate_for(account,
//     gate_id, sha256(request)). The contract burns the price, records the request hash once and logs gate_paid.
//
// Keys: FTF_TOWN_COORD (an account the owner added to the town's coordinators) and FTF_TOWN_COORD_KEY (its
// function-call key: register, credit_silk, pay_gate_for) live only on the relayer's server; without them both are
// read from data/coord-key.json, which scripts/coord-key.mjs writes (mode 600) and only ever prints the public key of.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b58decode, importSecretKey } from './near-tx.js';
import { loadLog } from './pass-eligibility.js';
import { verifyLog } from './expedition-rules/expedition-log.js';
import { EXPEDITION } from './expedition-rules/expedition-config.js';

export const GATE = Object.freeze({ maxSkewMs: 5 * 60 * 1000, guestDaySilk: 300, gas: 30_000_000_000_000n });
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
const GATE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MICRO = 1_000_000n;
const DAY = 86_400_000;

export const gateMessage = (accountId, gateId, at) => `ftf-gate|${accountId}|${gateId}|${at}`;
export const creditMessage = (accountId, at) => `ftf-town-credit|${accountId}|${at}`;
export const requestHash = (message, signature) => createHash('sha256').update(message + '|' + signature).digest('hex');

/** Where scripts/coord-key.mjs keeps the coordinator key on the server: {account, secretKey}. */
export const coordKeyFile = (env = process.env) => env.FTF_TOWN_COORD_FILE || join(env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname, 'coord-key.json');
const readCoordFile = (env) => { try { const r = JSON.parse(readFileSync(coordKeyFile(env), 'utf8')); return r && typeof r.secretKey === 'string' ? r : null; } catch { return null; } };

export const townGateEnv = (env = process.env) => {
  const f = env.FTF_TOWN_COORD_KEY ? null : readCoordFile(env);
  return {
  town: env.FTF_TOWN_CONTRACT || 'ftf-town.testnet',
  coord: env.FTF_TOWN_COORD || (f ? f.account : ''), coordKey: env.FTF_TOWN_COORD_KEY || (f ? f.secretKey : ''),
  logDir: env.FTF_EXPEDITION_DIR || '', dataDir: env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname,
  guestDaySilk: Math.max(1, Number(env.FTF_GUEST_CREDIT_DAY) || GATE.guestDaySilk),
  };
};

/** Shape check of a signed request. */
export function validateRequest(b, now = Date.now(), { gate = false } = {}) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > GATE.maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  if (gate && (typeof b.gate_id !== 'string' || !GATE_RE.test(b.gate_id))) return { ok: false, error: 'bad_gate' };
  const message = gate ? gateMessage(b.account_id, b.gate_id, b.at) : creditMessage(b.account_id, b.at);
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature, gateId: b.gate_id || null, message };
}

/** ed25519 over the message with the request's own public key (WebCrypto). */
export async function signatureValid(publicKey, signature, message) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(message));
  } catch { return false; }
}

/**
 * What a guest may hold on chain from its verified log, in silk micro-units: the verified income (T2 + T1 up to its
 * cap) in whole game silk, times gatePrice / gameFee. Null when the log is missing or does not verify.
 */
export function creditableMicro(log, gatePriceMicro, { feeC = EXPEDITION.PORTAL_FEE_C, killVerifyCapC = EXPEDITION.killVerifyCapC } = {}) {
  if (!Array.isArray(log) || !log.length) return null;
  const v = verifyLog(log, { killVerifyCapC });
  if (!v || !v.ok) return null;
  return (BigInt(v.earnedVerified) * BigInt(gatePriceMicro)) / BigInt(feeC); // cents × (price µ / fee cents) = µ silk
}

/** The per-guest credit ledger: {credited: "µ silk", day, today: "µ silk"} in <dir>/<guest>.json. */
export function createCreditLedger(dir) {
  const file = (g) => join(dir, g + '.json');
  return {
    get(g) { try { return JSON.parse(readFileSync(file(g), 'utf8')); } catch { return { credited: '0', day: 0, today: '0' }; } },
    put(g, rec) { mkdirSync(dir, { recursive: true }); writeFileSync(file(g) + '.tmp', JSON.stringify(rec)); renameSync(file(g) + '.tmp', file(g)); },
  };
}

/**
 * Registers the guest on ftf-town if needed and credits what its verified log allows beyond what was credited before
 * (up to the per-guest daily cap). deps: {client, cfg, ledger, now, log, key}.
 * @returns {Promise<{status, body}>}
 */
export async function syncCredit(guest, deps) {
  const { client, cfg, ledger } = deps, now = deps.now || Date.now;
  const price = BigInt(await client.view(cfg.town, 'gate_price', {}));
  const target = creditableMicro((deps.loadLog || loadLog)(cfg.logDir, guest), price);
  if (target === null) return { status: 409, body: { error: 'no_verified_log' } };
  const rec = ledger.get(guest);
  const day = Math.floor(now() / DAY);
  const today = rec.day === day ? BigInt(rec.today) : 0n;
  const room = BigInt(cfg.guestDaySilk) * MICRO - today;
  let delta = target - BigInt(rec.credited);
  if (delta > room) delta = room > 0n ? room : 0n;
  const key = deps.key || (await importSecretKey(cfg.coordKey));
  const row = await client.view(cfg.town, 'balance_of', { account_id: guest });
  if (!row) {
    const r = await client.call({ key, signerId: cfg.coord, receiverId: cfg.town, methodName: 'register', args: { accounts: [guest] }, gas: GATE.gas });
    if (!r.ok) return { status: 502, body: { error: 'register_failed', tx_hash: r.hash } };
  }
  let tx = null;
  if (delta > 0n) {
    // write-ahead: the ledger counts it first, so a crash never credits twice; a failed call rolls it back
    const next = { credited: String(BigInt(rec.credited) + delta), day, today: String(today + delta) };
    ledger.put(guest, next);
    const r = await client.call({ key, signerId: cfg.coord, receiverId: cfg.town, methodName: 'credit_silk', args: { account_id: guest, amount: String(delta), reference: `story:${guest.slice(0, 40)}` }, gas: GATE.gas });
    if (!r.ok) { ledger.put(guest, rec); return { status: 502, body: { error: 'credit_failed', detail: String(r.failure || '').slice(0, 120), tx_hash: r.hash } }; }
    tx = r.hash;
    if (deps.log) deps.log({ at: now(), guest, credited: String(delta), total: next.credited, tx });
  }
  const after = await client.view(cfg.town, 'balance_of', { account_id: guest });
  return { status: 200, body: { registered: true, credited_now: String(delta > 0n ? delta : 0n), credited_total: String(BigInt(rec.credited) + (delta > 0n ? delta : 0n)), creditable: String(target), silk: after ? String(after.silk) : '0', gate_price: String(price), tx_hash: tx, capped_today: delta < target - BigInt(rec.credited) } };
}

/**
 * Pays the portal for a guest from its own signed request. deps as syncCredit, plus a replay guard {use(hash)}.
 * @returns {Promise<{status, body}>}
 */
export async function payGateFor(v, deps) {
  const { client, cfg } = deps;
  if (!(await signatureValid(v.publicKey, v.signature, v.message))) return { status: 401, body: { error: 'bad_signature' } };
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: v.accountId, public_key: v.publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const hash = requestHash(v.message, v.signature);
  if (!deps.replay.use(hash) || (await client.view(cfg.town, 'gate_request_used', { request_hash: hash }))) return { status: 409, body: { error: 'replayed' } };
  if (await client.view(cfg.town, 'gate_paid_for', { account_id: v.accountId, gate_id: v.gateId })) return { status: 409, body: { error: 'already_paid', gate: await client.view(cfg.town, 'gate_paid_of', { account_id: v.accountId }) } };
  const credit = await syncCredit(v.accountId, deps);
  if (credit.status !== 200) return credit;
  if (BigInt(credit.body.silk) < BigInt(credit.body.gate_price)) return { status: 402, body: { error: 'not_enough_silk', silk: credit.body.silk, gate_price: credit.body.gate_price, creditable: credit.body.creditable } };
  const key = deps.key || (await importSecretKey(cfg.coordKey));
  const r = await client.call({ key, signerId: cfg.coord, receiverId: cfg.town, methodName: 'pay_gate_for', args: { account_id: v.accountId, gate_id: v.gateId, request_hash: hash }, gas: GATE.gas });
  if (!r.ok) return { status: 502, body: { error: 'gate_failed', detail: String(r.failure || '').slice(0, 160), tx_hash: r.hash } };
  return { status: 200, body: { paid: true, tx_hash: r.hash, request_hash: hash, gate: await client.view(cfg.town, 'gate_paid_of', { account_id: v.accountId }), contract: cfg.town } };
}
