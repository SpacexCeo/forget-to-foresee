// Quest receipts on NEAR testnet (TZ §7.4): agent-ledger `record_track` arguments for one completed quest or bounty in
// an expedition log, and a local re-implementation of the contract's argument checks. Builds arguments only: it never
// signs, never sends and holds no keys (the scripted accounts' runner signs, owner-gated).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonical } from '../../game/src/game/expedition-log.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
export const POLICY = 'quest-1';
export const RECEIPT_KINDS = Object.freeze(['quest_turned_in', 'bounty_resolved', 'portal_paid']);
const KIND_CODE = { story_started: 1, guide_step: 2, quest_accepted: 3, quest_progress: 4, quest_ready: 5, quest_turned_in: 6, quest_abandoned: 7, kill_ticketed: 8, bounty_resolved: 9, salvage_dropped: 10, stipend_granted: 11, portal_paid: 12, pass_claimed: 13 };
const MOB_CODE = { skitter: 1, veilbell: 2, hulker: 3, crownrift: 4 };

/** sha256 of the rules bundle the receipt was computed with (snapshot_sha256). */
export function rulesBundleHash() {
  const h = createHash('sha256');
  for (const f of ['expedition-config.js', 'quests-data.js', 'quest-rules.js', 'expedition.js']) h.update(readFileSync(new URL('../../game/src/game/' + f, import.meta.url)));
  return h.digest('hex');
}

/**
 * Arguments for the receipt of log entry `seq` (a quest turn-in, a bounty or the portal fee). The window runs from
 * that quest's acceptance (or the log start) to the entry; trades_compact lists up to 50 entries of the window as
 * `kindCode,seq,mobCode,silkC,0`.
 */
export function receiptArgs(log, seq, { rules = rulesBundleHash(), seed = null } = {}) {
  const e = log.find((x) => x.seq === seq);
  if (!e || !RECEIPT_KINDS.includes(e.kind)) throw new Error('entry ' + seq + ' is not a quest turn-in, a bounty or the portal fee');
  const questId = e.kind === 'portal_paid' ? 'portal_paid' : e.data.questId;
  const attempt = e.kind === 'portal_paid' ? 1 : Number(e.data.attempt) || 1;
  const acc = [...log].reverse().find((x) => x.seq < seq && x.kind === 'quest_accepted' && x.data.questId === questId);
  const from = acc ? acc.seq : Math.max(0, seq - 1);
  const window = log.filter((x) => x.seq >= from && x.seq <= seq).slice(-50);
  const params = canonical({ questId, attempt, silkC: e.silkC, logHead: e.hash });
  return {
    npc: questId, epoch: attempt, seed: seed || e.hash.slice(0, 64), policy_version: POLICY,
    params, params_hash: sha(params), snapshot_sha256: rules,
    bar_from: from, bar_to: seq > from ? seq : from + 1,
    trades_compact: compact(window),
    pnl_bp: 0,
  };
}

/** Five-integer tuples, oldest dropped until the string fits the contract's MAX_COMPACT (1200). */
function compact(window) {
  const t = window.map((x) => [KIND_CODE[x.kind] || 0, x.seq, MOB_CODE[x.data && x.data.mob] || 0, x.silkC, 0].join(','));
  while (t.length > 1 && t.join(';').length > 1200) t.shift();
  return t.join(';');
}

/** The contract's checks (contracts/agent-ledger/src/lib.rs record_track), re-implemented: null when valid, else the error. */
export function contractCheck(a) {
  const hex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  if (typeof a.npc !== 'string' || !/^[a-z0-9_]{1,32}$/.test(a.npc)) return 'ERR_NPC';
  if (!a.seed || a.seed.length > 64 || !a.policy_version || a.policy_version.length > 32 || !a.params || a.params.length > 512) return 'ERR_FIELD';
  if (!hex64(a.params_hash) || !hex64(a.snapshot_sha256)) return 'ERR_HASH';
  if (!(a.bar_from < a.bar_to)) return 'ERR_BARS';
  const t = String(a.trades_compact || '');
  if (!t || t.length > 1200) return 'ERR_TRADES'; // MAX_COMPACT
  const parts = t.split(';');
  if (parts.length > 50 || parts.some((p) => { const f = p.split(','); return f.length !== 5 || f.some((x) => x === '' || !/^-?\d+$/.test(x)); })) return 'ERR_TRADES';
  if (!Number.isInteger(a.epoch) || a.epoch < 0 || a.epoch > 0xffffffff) return 'ERR_FIELD';
  return null;
}
