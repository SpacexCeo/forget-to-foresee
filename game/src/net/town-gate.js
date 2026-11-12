// The Gate-Loom on chain (story rev 4 §3.1): the portal's price is ftf-town's `gate_price`, the player's silk is the
// on-chain `balance_of(account).silk`, and paying is the guest's own `pay_gate(gate_id)` call, signed in the browser by
// the Day 1 guest key; the contract burns the price once per account and records `gate_paid_of(account)`, which the
// relayer reads for the whitelist pass. Amounts: the contract counts micro-silk (1 silk = 1,000,000), the story log
// hundredths (1 silk = 100). Loaded lazily; every failure resolves to {ok: false, reason}.
import { createTxClient, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';

export const GATE_ID = 'loom';
export const GATE_GAS = 30_000_000_000_000n;
export const UNIT = 1_000_000;
/** Contract micro-silk → story hundredths (floor). */
export const toHundredths = (micro) => Math.floor(Number(micro || 0) / (UNIT / 100));
export const townContract = (dep = DAY1_DEPLOYMENT) => (dep && dep.town) || null;

/**
 * The gate as the chain sees it for an account: {ok, priceC, balanceC, paid: {gate_id, at_ms, price}|null}.
 * @param {{account: string, deployment?: object, rpcUrls?: string[], fetch?: Function}} o
 */
export async function readGate({ account, deployment = DAY1_DEPLOYMENT, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, fetch = globalThis.fetch }) {
  const town = townContract(deployment);
  if (!town || !account) return { ok: false, reason: !town ? 'not_configured' : 'need_guest' };
  try {
    const client = createTxClient({ rpcUrls, fetch, timeoutMs: 15000 });
    const [price, bal, paid] = await Promise.all([client.view(town, 'gate_price', {}), client.view(town, 'balance_of', { account_id: account }), client.view(town, 'gate_paid_of', { account_id: account })]);
    if (price == null) return { ok: false, reason: 'no_gate' };
    return { ok: true, priceC: toHundredths(price), balanceC: toHundredths(bal && bal.silk), paid: paid || null };
  } catch { return { ok: false, reason: 'network' }; }
}

/**
 * Pays the gate with the guest key: {ok, hash, record} | {ok: false, reason: 'need_guest'|'not_configured'|'no_silk'|'already_paid'|'tx_failed'|'network', hash?}.
 * A second call is refused by the contract (already_paid) and the record is read back.
 */
export async function payGate({ storage, deployment = DAY1_DEPLOYMENT, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, fetch = globalThis.fetch, gateId = GATE_ID }) {
  const g = guestFrom(storage), town = townContract(deployment);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!town) return { ok: false, reason: 'not_configured' };
  try {
    const client = createTxClient({ rpcUrls, fetch });
    const key = await importSecretKey(g.secretKey);
    const r = await client.call({ key, signerId: g.accountId, receiverId: town, methodName: 'pay_gate', args: { gate_id: gateId }, gas: GATE_GAS, deposit: 0n });
    if (!r.ok) {
      const why = JSON.stringify(r.failure || '');
      const reason = /ERR_GATE_PAID|already/i.test(why) ? 'already_paid' : /ERR_FUNDS|funds/i.test(why) ? 'no_silk' : 'tx_failed';
      if (reason !== 'already_paid') return { ok: false, reason, hash: r.hash };
    }
    const record = await client.view(town, 'gate_paid_of', { account_id: g.accountId });
    return record ? { ok: true, hash: r.hash, record, accountId: g.accountId } : { ok: false, reason: 'tx_failed', hash: r.hash };
  } catch { return { ok: false, reason: 'network' }; }
}
