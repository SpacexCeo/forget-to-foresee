// Agent track records on NEAR testnet (docs/agent-track-record-plan.md), the browser side: the player's Day 1 guest
// account (key in this browser) records a closed hire on the agent-ledger contract; the page then reads the record
// back and re-runs it (game/track-record.js) before it shows "Verified". Read-only helpers for the agent card and the
// copy-paste verification steps for any AI agent. Loaded lazily (dynamic import) when the player asks for it.
import { createTxClient, importSecretKey } from './near-tx.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { trackArgs, verifyTrack } from '../game/track-record.js';

/** 0.01 NEAR for storage (a record is a few hundred bytes; the contract refunds the rest). */
export const LEDGER_DEPOSIT = 10n ** 22n;
/** 20 Tgas: the record needs a few; the guest account holds only 0.05 NEAR, and prepaid gas counts against it. */
export const LEDGER_GAS = 20_000_000_000_000n;
const DAY1_KEY = 'ftf.day1.v1';
const REPO = 'https://github.com/SpacexCeo/forget-to-foresee';

export const ledgerContract = (dep = DAY1_DEPLOYMENT) => (dep && dep.ledger) || null;

/** The player's guest account and its key, from the Day 1 record in this browser, or null. */
export function guestFrom(storage) {
  try {
    const rec = JSON.parse((storage && storage.getItem(DAY1_KEY)) || '{}');
    return rec.minted && rec.guest && rec.guest.account_id && rec.playerKey && rec.playerKey.secretKey ? { accountId: rec.guest.account_id, secretKey: rec.playerKey.secretKey } : null;
  } catch { return null; }
}

/** What stops recording right now, or null: 'not_deployed' | 'need_guest' | 'old_hire'. */
export function recordBlocker({ storage, result, deployment = DAY1_DEPLOYMENT }) {
  if (!ledgerContract(deployment)) return 'not_deployed';
  if (!guestFrom(storage)) return 'need_guest';
  if (!result || result.before === undefined) return 'old_hire';
  return null;
}

/** Reads a record and re-runs it. {ok, reason, track}. */
export async function verifyOnChain({ accountId, npc, epoch, deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls }) {
  const client = createTxClient({ rpcUrls, fetch });
  const track = await client.view(ledgerContract(deployment), 'get_track', { account_id: accountId, npc, epoch });
  if (!track) return { ok: false, reason: 'missing', track: null };
  const v = verifyTrack(track);
  return { ok: v.ok, reason: v.reason, track };
}

/**
 * Records a collected hire and verifies it. Resolves {ok, reason, hash, verified, accountId, epoch}.
 * "verified" is true only after the record read back from the chain re-computes exactly.
 */
export async function recordHire({ storage, npc, result, deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls }) {
  const why = recordBlocker({ storage, result, deployment });
  if (why) return { ok: false, reason: why };
  const g = guestFrom(storage);
  const client = createTxClient({ rpcUrls, fetch });
  const key = await importSecretKey(g.secretKey);
  const r = await client.call({ key, signerId: g.accountId, receiverId: ledgerContract(deployment), methodName: 'record_track', args: trackArgs(npc, result), gas: LEDGER_GAS, deposit: LEDGER_DEPOSIT });
  if (!r.ok) return { ok: false, reason: 'tx_failed', hash: r.hash, failure: r.failure };
  const v = await verifyOnChain({ accountId: g.accountId, npc, epoch: result.epoch, deployment, fetch, rpcUrls });
  return { ok: true, hash: r.hash, verified: v.ok, reason: v.ok ? null : v.reason, accountId: g.accountId, epoch: result.epoch };
}

/** Copy-paste steps for a person or any AI agent to verify one record independently (English on purpose). */
export function verificationSteps({ accountId, npc, epoch, deployment = DAY1_DEPLOYMENT }) {
  const ledger = ledgerContract(deployment) || 'ledger.ftf-coordinator.testnet';
  return [
    `Verify the Forget to Foresee agent "${npc}" (account ${accountId}, epoch ${epoch}) on NEAR testnet:`,
    `1. Read the record: call the view method get_track({"account_id":"${accountId}","npc":"${npc}","epoch":${epoch}}) on ${ledger} through any testnet RPC (e.g. https://rpc.testnet.near.org, method "query", request_type "call_function").`,
    `2. Load the sealed price snapshot from ${REPO}/blob/main/game/src/game/exchange/snapshot-v1.js and check that sha256 of its canonical payload equals the record's snapshot_sha256.`,
    `3. Check sha256(params) equals params_hash, then re-run hireResult() from game/src/game/town-economy.js with the record's seed and the temperament, price, rounds and "before" state from params.`,
    `4. Compare: the re-computed trades must equal trades_compact (echo index, bar, arm index, stake, back per trade) and the PnL in basis points must equal pnl_bp.`,
    `Or run it in one line from a clone: node tools/verify-agent/verify.mjs ${accountId} ${npc} ${epoch} ${ledger}  (prints PASS or FAIL with the first mismatch).`,
  ].join('\n');
}
