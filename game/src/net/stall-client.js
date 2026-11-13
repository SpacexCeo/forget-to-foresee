// The town stalls for monster resources, the browser side (relayer lib/resource-desk.js, docs/town-items.md).
//   quote: GET /api/market/resource?side&item&qty -> {ok, silk, unit, reason, stock, stall, town, items, reference, dry_run}
//   buy:   the player signs ftf-town trade({counterparty: stall, silk, reference}) with its own Day 1 guest key, then
//          POSTs the transaction hash; the stall mints the items when the desk verified it.
//   sell:  the player signs items mt_transfer({receiver_id: stall, token_id, amount}) (1 yoctoNEAR), then POSTs.
// The relayer never holds the player's key. While the desk is in dry run (FTF_TOWN_SEND off) nothing would be minted or
// paid back, so the panel does not let the player sign: `canTrade` is false and says why.
import { createTxClient, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';

/** Which townsperson keeps which resource stall (relayer market/catalog.js RESOURCES makers). */
export const STALLS = Object.freeze({ guard: Object.freeze(['spider_silk_thread', 'chitin_plate']), shrinekeeper: Object.freeze(['veil_dust']), ash: Object.freeze(['ash_ore']), shardkeeper: Object.freeze(['crown_shard']) });
export const stallItems = (npc) => STALLS[npc] || [];
export const MAX_QTY = 20;
export const EXPLORER = 'https://testnet.nearblocks.io/txns/';
const HASH = /^[1-9A-HJ-NP-Za-km-z]{40,50}$/;
const ACCOUNT = /^[a-z0-9._-]{2,64}$/;
/** silk micro-units (1e6 per silk) -> shown silk with two decimals */
export const silkText = (micro) => (Math.round(Number(micro) / 10_000) / 100).toFixed(2);
export const txUrl = (h) => (HASH.test(String(h || '')) ? EXPLORER + h : null);

/** A quote answer, checked: {ok, side, item, qty, silk, unit, reason, stock, stall, town, items, reference, dryRun} or {ok: false, reason}. */
export function readQuote(j, { side, item, qty }) {
  if (!j || typeof j !== 'object') return { ok: false, reason: null, error: 'offline' };
  if (j.error) return { ok: false, reason: null, error: j.error };
  const reason = typeof j.reason === 'string' ? j.reason.replace(/[^a-z0-9 ,.:'()%-]/gi, '').slice(0, 90) : null;
  if (j.ok === false) return { ok: false, reason, stock: Number.isFinite(j.stock) ? j.stock : null, dryRun: !!j.dry_run };
  if (j.item !== item || j.side !== side || j.qty !== qty || !(Number(j.silk) > 0) || !ACCOUNT.test(String(j.stall || '')) || !ACCOUNT.test(String(j.town || '')) || !ACCOUNT.test(String(j.items || ''))) return { ok: false, reason: null, error: 'bad_quote' };
  if (side === 'buy' && j.reference !== `buy:${item}:${qty}`) return { ok: false, reason: null, error: 'bad_quote' };
  return { ok: true, side, item, qty, silk: String(j.silk), unit: Number(j.unit) || 0, reason, stock: Number.isFinite(j.stock) ? j.stock : null, stall: j.stall, town: j.town, items: j.items, reference: j.reference || null, dryRun: !!j.dry_run };
}

/** Whether the player may sign for this quote, and why not: 'dry_run' | 'no_guest' | 'no_deal' | null. */
export function canTrade(q, guest) {
  if (!q || !q.ok) return { ok: false, why: 'no_deal' };
  if (q.dryRun) return { ok: false, why: 'dry_run' };
  if (!guest) return { ok: false, why: 'no_guest' };
  return { ok: true, why: null };
}

/** The one call the player signs for a quote (pure: the tests check it against the desk's checkCall). */
export function playerCall(q) {
  if (q.side === 'buy') return { receiverId: q.town, methodName: 'trade', args: { counterparty: q.stall, silk: q.silk, reference: q.reference }, gas: 30_000_000_000_000n, deposit: 0n };
  return { receiverId: q.items, methodName: 'mt_transfer', args: { receiver_id: q.stall, token_id: q.item, amount: String(q.qty) }, gas: 30_000_000_000_000n, deposit: 1n };
}

/** The desk's settle answer -> {state: 'done' | 'error', settled, dryRun, hash, url, error}. Verified only with a hash. */
export function readSettle(status, j, playerHash) {
  if (!j || typeof j !== 'object') return { state: 'error', error: 'offline', playerUrl: txUrl(playerHash) };
  if (status === 200 && j.settled === true && HASH.test(String(j.tx_hash || ''))) return { state: 'done', settled: true, hash: j.tx_hash, url: txUrl(j.tx_hash), playerUrl: txUrl(playerHash) };
  if (status === 200 && j.dry_run) return { state: 'done', settled: false, dryRun: true, hash: null, url: null, playerUrl: txUrl(playerHash) };
  return { state: 'error', error: String(j.error || 'failed').replace(/[^a-z_]/g, '').slice(0, 32) || 'failed', playerUrl: txUrl(playerHash) };
}

/**
 * @param {{base?: string, fetch?: Function, storage?: object, rpcUrls?: string[], client?: object, signer?: Function}} o
 */
export function createStallClient({ base = relayerUrl(), fetch = globalThis.fetch, storage = null, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, client = null, signer = importSecretKey } = {}) {
  const url = base ? String(base).replace(/\/$/, '') : null;
  const net = () => client || createTxClient({ rpcUrls, fetch, timeoutMs: 60_000 });
  return {
    guest: () => guestFrom(storage),
    async quote(side, item, qty) {
      if (!url) return { ok: false, error: 'not_configured' };
      try { const r = await fetch(`${url}/api/market/resource?side=${side}&item=${encodeURIComponent(item)}&qty=${qty}`); return readQuote(await r.json(), { side, item, qty }); }
      catch { return { ok: false, error: 'offline' }; }
    },
    /** Signs the player's call for a quote, then asks the desk to settle it. onStep('signing' | 'settling'). */
    async trade(q, onStep = () => {}) {
      const g = guestFrom(storage);
      const c = canTrade(q, g);
      if (!c.ok) return { state: 'error', error: c.why };
      // a buy pays from the player's row on ftf-town: an account not yet in the town would be refused on chain
      // (ERR_UNKNOWN_ACCOUNT, live bug 13.11), so ask first and offer the one-tap set-up instead of a failed transaction
      if (q.side === 'buy') { try { if (!(await net().view(q.town, 'balance_of', { account_id: g.accountId }))) return { state: 'error', error: 'not_registered' }; } catch { /* the chain answers on the call */ } }
      onStep('signing');
      let tx;
      try { const key = await signer(g.secretKey); tx = await net().call({ key, signerId: g.accountId, ...playerCall(q) }); }
      catch { return { state: 'error', error: 'sign_failed' }; }
      if (!tx || !tx.ok) return { state: 'error', error: /ERR_UNKNOWN_ACCOUNT/.test(String(tx && tx.failure)) ? 'not_registered' : 'tx_failed', playerUrl: txUrl(tx && tx.hash) };
      onStep('settling');
      try {
        const r = await fetch(url + '/api/market/resource', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ side: q.side, item: q.item, qty: q.qty, account_id: g.accountId, tx_hash: tx.hash }) });
        return readSettle(r.status, await r.json().catch(() => null), tx.hash);
      } catch { return { state: 'error', error: 'offline', playerUrl: txUrl(tx.hash) }; }
    },
  };
}
