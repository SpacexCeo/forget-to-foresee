// Dragon claims, the browser side (docs/companions.md). Every heroine gets ONE dragon right after the Day 1 mint
// ("welcome"), and a second, of another kind, once the first boss is down ("boss"): the guest key signs
// "ftf-companion|<account>|<at>|<reason>" and the relayer mints the dragon on the companions contract to the heroine
// token's own account (relayer/lib/companion.js; the boss is checked there against the stored expedition log). A
// claim that succeeded (or found its dragon already minted) is remembered so it is not asked again; the dragon itself
// is shown only after the chain read in net/companions.js confirms it. Never invents a dragon. Loaded lazily.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

export const CLAIM_KEY = 'ftf.companion.claims.v1';
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Whether this browser already holds a confirmed claim for that reason. */
export function claimed(storage, reason) {
  try { return !!JSON.parse((storage && storage.getItem(CLAIM_KEY)) || '{}')[reason]; } catch { return false; }
}
function remember(storage, reason, rec) {
  try { const all = JSON.parse(storage.getItem(CLAIM_KEY) || '{}'); all[reason] = rec; storage.setItem(CLAIM_KEY, JSON.stringify(all)); } catch { /* memory only */ }
}

/** Whether the local expedition log shows the first boss down (a crownrift kill or the boss quest ready/done). Pure. */
export const bossInLog = (log) => Array.isArray(log) && log.some((e) => e && ((e.kind === 'kill_ticketed' && e.data && e.data.mob === 'crownrift')
  || ((e.kind === 'quest_ready' || e.kind === 'quest_turned_in') && e.data && e.data.questId === 'q_boss')));

/**
 * Asks the relayer for a dragon. {ok: true, kind, tokenId, owner, tx, already} | {ok: false, reason}
 * (reasons: need_guest, not_configured, boss_not_down, no_heroine, rate_limited, network, …).
 */
export async function claimCompanion({ reason = 'welcome', storage, base = relayerUrl(), fetch = globalThis.fetch, now = Date.now } = {}) {
  if (claimed(storage, reason)) return { ok: true, already: true, cached: true };
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!base || typeof fetch !== 'function') return { ok: false, reason: 'not_configured' };
  try {
    const key = await importSecretKey(g.secretKey);
    const at = now();
    const signature = b58encode(await key.sign(new TextEncoder().encode(`ftf-companion|${g.accountId}|${at}|${reason}`)));
    const r = await withTimeout(fetch(base + '/api/companion/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, signature, reason }) }), 60000);
    const ans = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: ans.error === 'companion_not_configured' ? 'not_configured' : ans.error || 'network' };
    remember(storage, reason, { token_id: ans.token_id, kind: ans.kind, tx: ans.tx_hash || null });
    return { ok: true, kind: ans.kind, tokenId: ans.token_id, owner: ans.owner_id, tx: ans.tx_hash || null, already: !!ans.already };
  } catch { return { ok: false, reason: 'network' }; }
}
