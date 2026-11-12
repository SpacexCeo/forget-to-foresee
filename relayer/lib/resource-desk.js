// The resource desk (docs/town-items.md "Buying and selling resources"): players buy monster resources from the
// town's stalls and sell them back, settled on chain without the relayer ever holding a player's key.
//
//   BUY:  the player calls ftf-town trade({counterparty: <stall wallet>, silk: <quote>, reference: "buy:<item>:<qty>"})
//         with its own key, then POSTs the transaction hash. The desk checks that transaction on chain (signer, contract,
//         method, stall, item, quantity, enough silk, success, never used before) and the stall mints the items to the
//         player on the items contract (NEP-245 mint).
//   SELL: the player calls items mt_transfer({receiver_id: <stall wallet>, token_id: <item>, amount}) with its own
//         key, then POSTs the hash. The desk checks it the same way and the stall pays the buy-back price in silk with
//         its own trade key (ftf-town trade).
//
// Prices are the town's price rules (market/prices.js priceOf / buybackOf) on the stall's current shelf. A quote is
// honoured for QUOTE_SLACK above or below. DRY RUN unless FTF_TOWN_SEND=1: the desk verifies and answers the plan, and
// nothing is minted or paid. Every settled hash is journalled once (replays refused).
import { RESOURCES, traderAccount } from '../market/catalog.js';
import { priceOf, buybackOf, STOCK_CAP } from '../market/prices.js';
import { PRICE_UNIT } from './town-traders.js';

export const QUOTE_SLACK = 0.1;
export const MAX_QTY = 20;
const b64json = (s) => { try { return JSON.parse(Buffer.from(String(s || ''), 'base64').toString('utf8')); } catch { return null; } };

export const resourceById = (id) => RESOURCES.find((r) => r.id === id) || null;
export const stallOf = (r, town) => traderAccount(r.maker, town);

/** A quote in silk micro-units for `qty` units (buy: what the player pays; sell: what the stall pays). */
export function quote(st, item, qty, side) {
  const r = resourceById(item);
  if (!r || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
  const stock = (st && st.stock && st.stock[item]) ?? r.start ?? 0, demand = (st && st.demand && st.demand[item]) || 0;
  if (side === 'buy') {
    if (stock < qty) return { ok: false, reason: `only ${stock} ${item.replace(/_/g, ' ')} on the shelf`, stock };
    const p = priceOf(r, stock, demand);
    return { ok: true, side, item, qty, unit: p.price, silk: qty * p.price * PRICE_UNIT, reason: p.reason, stock };
  }
  if (stock + qty > (r.cap ?? STOCK_CAP)) return { ok: false, reason: `the stall's shelf is full (${stock})`, stock };
  const p = buybackOf(r, stock, demand);
  return { ok: p.price > 0, side, item, qty, unit: p.price, silk: qty * p.price * PRICE_UNIT, reason: p.reason, stock };
}

/** The one FunctionCall of a final, successful transaction, or an error string. */
export async function fetchCall(client, hash, signer) {
  let tx;
  try { tx = await client.rpc('tx', { tx_hash: hash, sender_account_id: signer, wait_until: 'FINAL' }); } catch (e) { return { error: 'tx_not_found' }; }
  const st = tx && tx.status;
  if (!st || st.Failure || !('SuccessValue' in st)) return { error: 'tx_failed' };
  for (const r of tx.receipts_outcome || []) if (r.outcome && r.outcome.status && r.outcome.status.Failure) return { error: 'tx_failed' };
  const t = tx.transaction || {};
  const acts = t.actions || [];
  if (acts.length !== 1 || !acts[0].FunctionCall) return { error: 'not_one_call' };
  const fc = acts[0].FunctionCall;
  return { signer: t.signer_id, receiver: t.receiver_id, method: fc.method_name, args: b64json(fc.args) || {} };
}

/** Checks a player's payment (buy) or item transfer (sell) against the quote. Pure apart from the fetched call. */
export function checkCall(call, { side, item, qty, account, town, items, quoteSilk }) {
  if (call.error) return call.error;
  const r = resourceById(item);
  if (!r) return 'unknown_item';
  if (call.signer !== account) return 'wrong_signer';
  const stall = stallOf(r, town);
  if (side === 'buy') {
    if (call.receiver !== town || call.method !== 'trade') return 'not_a_town_trade';
    if (call.args.counterparty !== stall) return 'wrong_stall';
    if (call.args.reference !== `buy:${item}:${qty}`) return 'wrong_reference';
    if (Number(call.args.silk) < Math.floor(quoteSilk * (1 - QUOTE_SLACK))) return 'paid_too_little';
    return null;
  }
  if (call.receiver !== items || call.method !== 'mt_transfer') return 'not_an_item_transfer';
  if (call.args.receiver_id !== stall || call.args.token_id !== item || Number(call.args.amount) !== qty) return 'wrong_transfer';
  return null;
}

/** The used-hash journal (in memory, loaded from and appended to a log by the caller). */
export function createHashJournal(initial = []) {
  const used = new Set(initial);
  return { has: (h) => used.has(h), add: (h) => { used.add(h); }, drop: (h) => { used.delete(h); }, size: () => used.size };
}

/**
 * Settles one request. `deps`: {client, st, town, items, send, journal, mint({account, item, qty}), pay({stall, account, silk, item})}.
 * Resolves {status, ...}: 200 settled / dry_run, or an error with its status.
 */
export async function settle(req, deps) {
  const { side, item, account, hash } = req;
  const qty = Number(req.qty);
  if (!['buy', 'sell'].includes(side) || !resourceById(item) || !/^[a-z0-9._-]{2,64}$/.test(String(account || '')) || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(String(hash || ''))) return { status: 400, error: 'bad_request' };
  if (deps.journal.has(hash)) return { status: 409, error: 'already_settled' };
  const q = quote(deps.st, item, qty, side);
  if (!q) return { status: 400, error: 'bad_quantity' };
  if (!q.ok) return { status: 409, error: 'no_deal', reason: q.reason };
  const call = await fetchCall(deps.client, hash, account);
  const bad = checkCall(call, { side, item, qty, account, town: deps.town, items: deps.items, quoteSilk: q.silk });
  if (bad) return { status: 422, error: bad };
  deps.journal.add(hash);
  const stall = stallOf(resourceById(item), deps.town);
  const plan = side === 'buy' ? { mint: { contract: deps.items, to: account, token_id: item, amount: qty } } : { pay: { from: stall, to: account, silk: String(q.silk) } };
  // the stall's shelf follows the deal at once (the daemon's state), so the next quote sees it
  if (deps.st && deps.st.stock) { deps.st.stock[item] = Math.max(0, (deps.st.stock[item] || 0) + (side === 'buy' ? -qty : qty)); if (side === 'buy') deps.st.demand[item] = (deps.st.demand[item] || 0) + qty; }
  if (!deps.send) return { status: 200, settled: false, dry_run: true, side, item, qty, silk: q.silk, reason: q.reason, plan };
  const r = side === 'buy' ? await deps.mint({ account, item, qty }) : await deps.pay({ stall, account, silk: q.silk, item });
  if (r && r.ok) return { status: 200, settled: true, side, item, qty, silk: q.silk, reason: q.reason, tx_hash: r.hash, plan };
  deps.journal.drop(hash); // not settled: the player may retry with the same payment
  return { status: 502, error: 'settle_failed', detail: r && r.failure, plan };
}
