// Agent track records (docs/agent-track-record-plan.md): one closed hire of a townsperson-agent as a compact,
// replayable record. The trades are deterministic from (seed, temperament, price, rounds, the agent's learned state
// before the hire) over the sealed Echo snapshot, so anyone can re-run the policy and the PnL math and compare: a
// forged trade, a forged PnL or another snapshot fails. Pure (no DOM, no network): the browser, the Node verifier
// (tools/verify-agent/verify.mjs) and the tests share it. The record goes on NEAR testnet through the agent-ledger
// contract (contracts/agent-ledger).
import { sha256 } from './crypto.js';
import SNAPSHOT from './exchange/snapshot-v1.js';
import { canonicalSnapshotPayload, ECHO_IDS } from './exchange.js';
import { hireResult, ARMS, HIRE } from './town-economy.js';

export const POLICY_VERSION = 'town-ts-1';
export const SNAPSHOT_SHA256 = SNAPSHOT.hash;
export const MAX_TRADES = 50;

/** The policy inputs that, with the seed, decide every trade (stored on-chain as JSON, hashed into params_hash). */
export function trackParams({ temperament, price, rounds, before }) {
  return { temperament, price, rounds, before: before || null };
}
const paramsJson = (p) => JSON.stringify({ temperament: p.temperament, price: p.price, rounds: p.rounds, before: p.before });

/** One trade as `echo index,bar,arm index,stake,back` (integers; ~16 bytes). */
export const compactTrades = (rounds) => rounds.map((r) => [ECHO_IDS.indexOf(r.echo), r.t, ARMS.indexOf(r.arm), r.stake, r.back].join(',')).join(';');
export const parseTrades = (s) => (s ? String(s).split(';').map((x) => { const [e, t, a, stake, back] = x.split(',').map(Number); return { echo: ECHO_IDS[e], t, arm: ARMS[a], stake, back }; }) : []);
/** PnL of a hire in basis points of its price. */
export const pnlBp = (net, priceCents) => Math.round((net / priceCents) * 10000);

/**
 * The `record_track` arguments for a collected hire (town-economy collect() result: seed, epoch, temperament, price
 * in cents, rounds, net, before).
 */
export function trackArgs(npc, result) {
  if (!result || result.before === undefined) throw new Error('no agent state recorded for this hire');
  const params = trackParams({ temperament: result.temperament, price: result.price / 100, rounds: result.rounds.length, before: result.before });
  const ts = result.rounds.map((r) => r.t);
  return {
    npc, epoch: result.epoch, seed: result.seed, policy_version: POLICY_VERSION,
    params: paramsJson(params), params_hash: sha256(paramsJson(params)), snapshot_sha256: SNAPSHOT_SHA256,
    bar_from: Math.min(...ts), bar_to: Math.max(...ts) + 1,
    trades_compact: compactTrades(result.rounds), pnl_bp: pnlBp(result.net, result.price),
  };
}

/**
 * Re-runs a stored track and compares everything. Returns {ok, reason, at, expected, actual, replay}.
 * reason: 'policy' | 'snapshot' | 'params-hash' | 'params' | 'trades' | 'pnl' | null.
 */
export function verifyTrack(track, { snapshot = SNAPSHOT } = {}) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  if (!track) return fail('missing');
  if (track.policy_version !== POLICY_VERSION) return fail('policy', { expected: POLICY_VERSION, actual: track.policy_version });
  const snapSha = sha256(canonicalSnapshotPayload(snapshot));
  if (snapSha !== snapshot.hash || track.snapshot_sha256 !== snapSha) return fail('snapshot', { expected: snapSha, actual: track.snapshot_sha256 });
  if (sha256(track.params) !== track.params_hash) return fail('params-hash');
  let p;
  try { p = JSON.parse(track.params); } catch { return fail('params'); }
  if (!p || typeof p.price !== 'number' || typeof p.rounds !== 'number' || p.rounds < 1 || p.rounds > MAX_TRADES) return fail('params');
  const replay = hireResult({ seed: track.seed, temperament: p.temperament, price: p.price, rounds: p.rounds, agent: p.before, npc: track.npc });
  const expected = compactTrades(replay.rounds);
  if (expected !== track.trades_compact) {
    const e = expected.split(';'), a = String(track.trades_compact).split(';');
    const at = e.findIndex((x, i) => x !== a[i]);
    return fail('trades', { at: at < 0 ? e.length : at, expected: e[at] || null, actual: a[at] || null, replay });
  }
  const bp = pnlBp(replay.net, replay.price);
  if (bp !== track.pnl_bp) return fail('pnl', { expected: bp, actual: track.pnl_bp, replay });
  return { ok: true, reason: null, replay, trades: replay.rounds.length, pnlBp: bp };
}

export const HIRE_ROUNDS = HIRE.rounds;
