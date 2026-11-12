// The Gate-Loom on chain (story rev 4 §3.1), through the relayer (relayer/api/town/gate.js, docs/town-gate.md): a
// guest's browser key is a function-call key of the guests contract and cannot sign to ftf-town, so the relayer acts
// for the guest on what the guest proves. readGate asks GET /api/town/gate for the on-chain balance_of, gate_price and
// gate_paid_of; payGate signs "ftf-gate|<account>|<gate_id>|<at>" with the Day 1 guest key and POSTs it: the relayer
// credits the guest's verified income (its stored expedition log), then calls pay_gate_for; the contract burns the
// price once and records gate_paid_of, which the whitelist pass reads. Amounts: the contract counts micro-silk
// (1 silk = 1,000,000), the story log hundredths (1 silk = 100). Loaded lazily; failures resolve to {ok: false, reason}.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

export const GATE_ID = 'loom';
export const UNIT = 1_000_000;
/** Contract micro-silk → story hundredths (floor). */
export const toHundredths = (micro) => Math.floor(Number(micro || 0) / (UNIT / 100));
export const gateMessage = (accountId, gateId, at) => `ftf-gate|${accountId}|${gateId}|${at}`;
const REASON = Object.freeze({ not_enough_silk: 'no_silk', already_paid: 'already_paid', gate_not_configured: 'not_configured', not_your_key: 'need_guest', rate_limited: 'rate', replayed: 'retry' });

/**
 * The gate as the chain sees it for an account: {ok, priceC, balanceC, paid, configured} | {ok: false, reason}.
 * @param {{account: string, base?: string, fetch?: Function}} o
 */
export async function readGate({ account, base = relayerUrl(), fetch = globalThis.fetch }) {
  if (!account) return { ok: false, reason: 'need_guest' };
  if (!base) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/api/town/gate?account_id=' + encodeURIComponent(account));
    if (!r.ok) return { ok: false, reason: r.status === 404 ? 'not_configured' : 'network' };
    const b = await r.json();
    return { ok: true, priceC: toHundredths(b.gate_price), balanceC: toHundredths(b.silk), paid: b.gate || null, configured: b.configured !== false };
  } catch { return { ok: false, reason: 'network' }; }
}

/**
 * Pays the gate for this browser's guest: {ok, hash, record} | {ok: false, reason: 'need_guest'|'not_configured'|
 * 'no_silk'|'rate'|'retry'|'tx_failed'|'network'}. An already paid gate answers ok with the record.
 * @param {{storage: object, base?: string, fetch?: Function, now?: () => number, flush?: () => Promise}} o `flush`
 *   sends the expedition log first (the relayer credits from the stored log)
 */
export async function payGate({ storage, base = relayerUrl(), fetch = globalThis.fetch, now = () => Date.now(), flush = null, gateId = GATE_ID }) {
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!base) return { ok: false, reason: 'not_configured' };
  try {
    if (flush) { try { await flush(); } catch { /* the relayer answers with what it has */ } }
    const key = await importSecretKey(g.secretKey);
    const at = now();
    const signature = b58encode(await key.sign(new TextEncoder().encode(gateMessage(g.accountId, gateId, at))));
    const r = await fetch(base.replace(/\/$/, '') + '/api/town/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, gate_id: gateId, signature }) });
    let b = {}; try { b = await r.json(); } catch { /* empty */ }
    if (r.status === 200 && b.paid) return { ok: true, hash: b.tx_hash || null, record: b.gate || null, accountId: g.accountId };
    if (b.error === 'already_paid') return { ok: true, hash: null, record: b.gate || null, accountId: g.accountId };
    return { ok: false, reason: REASON[b.error] || (r.status >= 500 ? 'tx_failed' : 'network'), hash: b.tx_hash || null };
  } catch { return { ok: false, reason: 'network' }; }
}
