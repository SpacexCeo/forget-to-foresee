// The town market daemon (docs/market.md): runs inside the relayer, 24/7. Every trader has its own loop: wait an
// exponential gap (schedule.js), pick a trade (behaviour.js), sign it with that trader's own trade-only key and send
// it to the market contract. Each trader signs only its own transactions, so nonces never collide; the nonce and a
// recent block hash are cached, so a trade costs one RPC call. A global cap limits sends per minute, a pause stops
// sending without stopping the process, the state (balances, prices, today's count, the last trades) is saved to a
// file and reloaded after a restart, and every trade or failure is appended to a JSONL log.
import { b58encode, findFailure, importSecretKey, serializeFunctionCallTx, sha256, signedTxBytes } from '../lib/near-tx.js';
import { TRADERS, traderKey } from './catalog.js';
import { applyTrade, initialState, pickTrade } from './behaviour.js';
import { DEFAULT_TARGET, createRateCap, nextGapMs, utcDay } from './schedule.js';

export const RECENT = 30;
export const TRADE_GAS = 10_000_000_000_000n; // 10 Tgas prepaid; ~2.2 Tgas is burnt, the rest is refunded
export const LOW_FUNDS_YOCTO = 50_000_000_000_000_000_000_000n; // 0.05 NEAR
const SYNC_MS = 10 * 60_000, HASH_MS = 5 * 60_000, LOW_RETRY_MS = 10 * 60_000, PAUSE_POLL_MS = 30_000;
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const errText = (e) => String((e && e.rpc && JSON.stringify(e.rpc.data || e.rpc.cause || e.rpc)) || (e && e.message) || e).slice(0, 300);

/** Default rand: Math.random (the daemon is not meant to be reproducible; tests pass their own). */
export function createMarketDaemon({
  contractId, traders, client, store = null, log = () => {}, target = DEFAULT_TARGET, now = () => Date.now(),
  rand = Math.random, maxPerMinute = 60, paused = false, timers = { setTimeout, clearTimeout }, gas = TRADE_GAS,
}) {
  const keys = traders.map((t) => t.key).filter((k) => TRADERS.includes(k));
  const saved = (store && store.load()) || null;
  const st = {
    ...initialState(keys), recent: [], day: utcDay(now()), today: 0, failures: 0, ...(saved || {}),
  };
  if (st.day !== utcDay(now())) { st.day = utcDay(now()); st.today = 0; st.failures = 0; }
  const signers = new Map(traders.map((t) => [t.key, { ...t, signer: null, nonce: null, low: false, lowUntil: 0 }]));
  const cap = createRateCap({ perMinute: maxPerMinute, now });
  let block = null, chain = null, lastError = null, running = false, isPaused = !!paused, dirty = 0;
  const handles = new Map();

  const save = (force = false) => { if (!store) return; if (force || ++dirty >= 10) { dirty = 0; try { store.save({ balances: st.balances, prices: st.prices, recent: st.recent, day: st.day, today: st.today, failures: st.failures }); } catch { /* disk full: keep running */ } } };
  const rollDay = () => { const d = utcDay(now()); if (d !== st.day) { st.day = d; st.today = 0; st.failures = 0; } };

  async function blockHash() {
    if (!block || now() - block.at > HASH_MS) block = { hash: (await client.rpc('block', { finality: 'final' })).header.hash, at: now() };
    return block.hash;
  }

  /** Reads balances, prices and the contract's counters; marks traders whose NEAR is low. */
  async function sync() {
    try {
      const [bal, items, stats] = await Promise.all([client.view(contractId, 'balances'), client.view(contractId, 'items'), client.view(contractId, 'stats')]);
      for (const [acc, v] of bal || []) { const k = traderKey(acc); if (k && k in st.balances) st.balances[k] = Number(v); }
      for (const it of items || []) st.prices[it.id] = it.last;
      chain = { ...stats, at: now() };
    } catch (e) { lastError = 'sync: ' + errText(e); }
    for (const s of signers.values()) {
      try {
        const a = await client.rpc('query', { request_type: 'view_account', finality: 'final', account_id: s.account });
        s.low = BigInt(a.amount) < LOW_FUNDS_YOCTO;
      } catch { /* keep the last answer */ }
    }
  }

  /** Signs and sends one trade for trader `s`. Resolves {ok, hash, failure, retry}. */
  async function send(s, t) {
    if (!s.signer) s.signer = await importSecretKey(s.secretKey);
    if (s.nonce === null) s.nonce = BigInt((await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: s.account, public_key: s.signer.publicKey })).nonce);
    const nonce = s.nonce + 1n;
    const tx = serializeFunctionCallTx({ signerId: s.account, publicKey: s.signer.publicKey, nonce, receiverId: contractId, blockHash: await blockHash(), methodName: 'trade', args: { to: signers.get(t.seller).account, item: t.item, qty: t.qty, price: t.price }, gas, deposit: 0n });
    const hash = await sha256(tx);
    const sig = await s.signer.sign(hash);
    try {
      s.nonce = nonce;
      const out = await client.rpc('send_tx', { signed_tx_base64: b64(signedTxBytes(tx, sig)), wait_until: 'EXECUTED_OPTIMISTIC' });
      const failure = findFailure(out);
      return { ok: !failure, hash: b58encode(hash), failure };
    } catch (e) {
      const text = errText(e);
      if (/InvalidNonce|nonce/i.test(text)) s.nonce = null;
      if (/Expired|InvalidChain/i.test(text)) block = null;
      if (/NotEnoughBalance|LackBalance|NotEnoughAllowance/i.test(text)) s.low = true;
      return { ok: false, hash: b58encode(hash), failure: text, sent: !/INVALID_TRANSACTION|InvalidTxError/i.test(text) };
    }
  }

  /** One trade attempt by trader `key` now. Resolves the logged entry (or null when it skipped). */
  async function tickOnce(key) {
    rollDay();
    const s = signers.get(key);
    if (!s || isPaused || (s.low && now() < s.lowUntil)) return null;
    if (!cap.take()) return null;
    const t = pickTrade(st, key, rand, keys);
    if (!t || !signers.has(t.seller)) return null;
    const r = await send(s, t);
    const entry = { at: now(), ...t, hash: r.hash, ok: r.ok };
    if (r.ok) {
      applyTrade(st, t); st.today++;
      st.recent.unshift({ at: entry.at, buyer: t.buyer, seller: t.seller, item: t.item, qty: t.qty, price: t.price, hash: r.hash });
      st.recent.length = Math.min(st.recent.length, RECENT);
      s.low = false;
    } else {
      st.failures++; lastError = `${key}: ${String(r.failure).slice(0, 200)}`; entry.failure = r.failure;
      if (/ERR_FUNDS|ERR_PRICE/.test(String(r.failure))) await sync();
      if (s.low) s.lowUntil = now() + LOW_RETRY_MS;
    }
    log(entry); save();
    return entry;
  }

  function loop(key) {
    if (!running) return;
    const delay = isPaused ? PAUSE_POLL_MS : nextGapMs(now(), rand, { target, traders: keys.length });
    handles.set(key, timers.setTimeout(async () => {
      try { await tickOnce(key); } catch (e) { lastError = `${key}: ${errText(e)}`; }
      loop(key);
    }, delay));
  }

  return {
    tickOnce, sync,
    async start() {
      if (running) return; running = true;
      await sync();
      for (const k of keys) if (signers.has(k)) loop(k);
      const syncLoop = () => { if (running) handles.set('_sync', timers.setTimeout(async () => { await sync(); save(true); syncLoop(); }, SYNC_MS)); };
      syncLoop();
    },
    stop() { running = false; for (const h of handles.values()) timers.clearTimeout(h); handles.clear(); save(true); },
    pause(on = true) { isPaused = !!on; },
    stats() {
      rollDay();
      return {
        enabled: true, paused: isPaused, contract: contractId, target, traders: keys.length, day: st.day, today: st.today, failures_today: st.failures,
        chain: chain && { day: chain.day, today: chain.today, total: chain.total, at: chain.at },
        low_funds: [...signers.values()].filter((s) => s.low).map((s) => s.key),
        recent: st.recent.slice(0, RECENT), last_error: lastError,
      };
    },
    state: () => st,
  };
}
