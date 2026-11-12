// The expedition log, posted to the relayer (story TZ Q4): the browser's hash-chained log (game/expedition-ledger.js)
// goes up in signed batches of up to 50 entries to POST /api/expedition/log, where the endgame pass reads it. The Day 1
// guest key signs "ftf-expedition-log|<account>|<at>|<from_seq>|<count>|<hash of the last entry>". Batched (a few
// seconds after a change), resumed from the stored length, retried with back-off; it stops quietly when there is no
// guest, no relayer, or the relayer stores nothing (storage_off). A refused log (422) is not retried. Loaded lazily.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

export const SYNC_KEY = 'ftf.expedition.sync.v1';
export const SYNC = Object.freeze({ batch: 50, debounceMs: 4000, backoffMinMs: 2000, backoffMaxMs: 60_000 });

export const logMessage = (accountId, at, fromSeq, count, lastHash) => `ftf-expedition-log|${accountId}|${at}|${fromSeq}|${count}|${lastHash}`;

/**
 * @param {object} o
 * @param {{log: object[], subscribe?: Function}} o.ledger the expedition ledger
 * @param {object} [o.storage] @param {string} [o.base] relayer URL @param {Function} [o.fetch] @param {() => number} [o.now]
 * @param {() => {accountId: string, secretKey: string}|null} [o.guest] @param {Function} [o.setTimer] @param {Function} [o.clearTimer]
 */
export function createExpeditionSync({ ledger, storage = null, base = relayerUrl(), fetch = globalThis.fetch, now = () => Date.now(), guest = () => guestFrom(storage), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let st = { guest: null, length: 0 };
  try { const v = JSON.parse((storage && storage.getItem(SYNC_KEY)) || 'null'); if (v && typeof v.length === 'number') st = v; } catch { /* fresh */ }
  const save = () => { try { if (storage) storage.setItem(SYNC_KEY, JSON.stringify(st)); } catch { /* memory only */ } };
  let state = 'idle', timer = null, busy = false, failures = 0, lastError = null, stopped = false;

  function schedule(ms = SYNC.debounceMs) { if (stopped || state === 'off' || state === 'refused') return; if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, ms); }
  async function post(g, key, from, entries) {
    const at = now();
    const signature = b58encode(await key.sign(new TextEncoder().encode(logMessage(g.accountId, at, from, entries.length, entries[entries.length - 1].hash))));
    const r = await fetch(base.replace(/\/$/, '') + '/api/expedition/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, signature, from_seq: from, entries }) });
    let body = {}; try { body = await r.json(); } catch { /* empty */ }
    return { status: r.status, body };
  }
  /** Sends what the relayer does not have yet; resolves to the state. */
  async function flush() {
    if (busy || stopped) return state;
    const g = guest();
    if (!g || !base) { state = 'off'; lastError = !g ? 'no_guest' : 'no_relayer'; return state; }
    if (st.guest !== g.accountId) { st = { guest: g.accountId, length: 0 }; save(); }
    busy = true;
    try {
      const key = await importSecretKey(g.secretKey);
      for (let guard = 0; guard < 400; guard++) {
        const log = ledger.log;
        if (st.length >= log.length) { state = 'synced'; break; }
        const from = st.length, entries = log.slice(from, from + SYNC.batch);
        const r = await post(g, key, from, entries);
        if (r.status === 200 && r.body.stored === false) { state = 'off'; lastError = r.body.reason || 'storage_off'; break; }
        if (r.status === 200) { st.length = r.body.length; save(); failures = 0; continue; }
        if (r.status === 409 && r.body.error === 'gap' && Number.isInteger(r.body.length)) { st.length = r.body.length; save(); continue; }
        if (r.status === 409 || r.status === 422 || r.status === 400 || r.status === 401 || r.status === 403 || r.status === 413) { state = 'refused'; lastError = r.body.error || String(r.status); break; }
        throw Object.assign(new Error('retry'), { status: r.status });
      }
    } catch (e) {
      failures++; state = 'retrying'; lastError = (e && e.status) ? 'http_' + e.status : 'network';
      busy = false; schedule(Math.min(SYNC.backoffMaxMs, SYNC.backoffMinMs * 2 ** (failures - 1)));
      return state;
    }
    busy = false;
    return state;
  }
  const un = ledger.subscribe ? ledger.subscribe(() => schedule()) : null;
  schedule(1000);
  return {
    flush, schedule,
    get state() { return state; }, get synced() { return st.length; }, get lastError() { return lastError; },
    dispose() { stopped = true; if (timer) clearTimer(timer); if (un) un(); },
  };
}
