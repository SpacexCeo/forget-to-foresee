// The ONE silk balance every surface reads (sprint 6.2; docs/silk-sources.md). Before this, the HUD chip showed the
// town ledger kept in this browser (every silk gain from every source, "128.64") while the portal showed the silk on
// NEAR (ftf-town balance_of through GET /api/town/gate, "38"): two numbers for one word. The model splits the silk
// plainly:
//
//   onChainC  recorded on NEAR (ftf-town balance_of): what the Gate-Loom can take right now; the headline (gateC)
//   pendingC  earned and checked (the verified expedition log) but not yet recorded on NEAR: Sync moves it
//   playC     saved on this device only (wheel, dice, unverified or capped silk): it can never open the Gate-Loom
//   totalC    onChainC + pendingC + playC
//
// A failed read never shows 0: the last good number stays, marked stale. Amounts are in cents (1 silk = 100), the
// story log's unit; the contract counts micro-silk (1 silk = 1,000,000). One formatter, formatSilkC, for every silk
// number on screen. Sync = flush the expedition log, then POST /api/town/gate {credit_only} signed by the guest key.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';
import { EXPEDITION } from '../game/expedition-config.js';
import { computeSilkView } from './silk-core.js';
export { formatSilkC, computeSilkView } from './silk-core.js';

export const MICRO_PER_CENT = 10_000;
export const SILK_MODEL = Object.freeze({ refreshMs: 30_000, debounceMs: 2_000, autoSyncMs: 60_000 });
const centsOf = (micro) => Math.floor(Number(micro || 0) / MICRO_PER_CENT);

/**
 * The live model. `ledger` is the town ledger (game/town-economy.js: {silk, subscribe}); `flush` sends the expedition
 * log first (net/expedition-sync.js). Reads GET /api/town/gate; syncs with POST {credit_only}.
 * @returns {{view(): object, refresh(force?: boolean): Promise<object>, syncNow(): Promise<{ok, creditedC?, reason?, retryAfterS?}>, subscribe(fn): () => void, dispose(): void}}
 */
export function createSilkModel({ ledger = null, storage = null, flush = null, base = relayerUrl(), fetch = globalThis.fetch, now = () => Date.now(), timers = globalThis, doc = globalThis.document, win = globalThis } = {}) {
  let s = { onChainC: 0, creditableC: null, creditedC: null, feeC: EXPEDITION.PORTAL_FEE_C, chainOk: false, stale: false, syncing: false, lastSyncAt: null, dayRoomC: null, noAccount: false };
  let reading = null, lastRead = -Infinity, lastAutoSync = -Infinity, disposed = false;
  const subs = new Set();
  const view = () => computeSilkView({ ...s, localTotalC: ledger ? ledger.silk : 0 });
  const emit = () => { const v = view(); for (const f of [...subs]) { try { f(v); } catch { /* a listener's own problem */ } } };
  const url = () => String(base || '').replace(/\/$/, '');

  async function read() {
    const g = guestFrom(storage);
    if (!g || !url() || typeof fetch !== 'function') return null;
    const r = await fetch(url() + '/api/town/gate?account_id=' + encodeURIComponent(g.accountId));
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  /** Reads the chain (debounced 2 s unless forced); a failure keeps the last good number, stale. */
  function refresh(force = false) {
    if (reading) return reading;
    if (!force && now() - lastRead < SILK_MODEL.debounceMs) return Promise.resolve(view());
    lastRead = now();
    reading = (async () => {
      try {
        const b = await read();
        if (!b) s = { ...s, noAccount: true };
        if (b) {
          s = { ...s, noAccount: false, onChainC: centsOf(b.silk), feeC: b.gate_price != null ? centsOf(b.gate_price) : s.feeC, chainOk: true, stale: false,
            creditableC: b.creditable != null ? centsOf(b.creditable) : s.creditableC, creditedC: b.credited != null ? centsOf(b.credited) : s.creditedC,
            dayRoomC: b.day_room != null ? centsOf(b.day_room) : s.dayRoomC };
        }
      } catch { s = { ...s, stale: s.chainOk }; } // never 0 by itself: the last good number stays, marked stale
      reading = null; emit(); autoSync(); return view();
    })();
    return reading;
  }
  /** Records the waiting silk on NEAR now. */
  async function syncNow() {
    const g = guestFrom(storage);
    if (!g) return { ok: false, reason: 'need_guest' };
    if (!url()) return { ok: false, reason: 'not_configured' };
    if (s.syncing) return { ok: false, reason: 'busy' };
    s = { ...s, syncing: true }; emit();
    try {
      if (flush) { try { await flush(); } catch { /* the relayer credits what it already has */ } }
      const key = await importSecretKey(g.secretKey);
      const at = now();
      const signature = b58encode(await key.sign(new TextEncoder().encode(`ftf-town-credit|${g.accountId}|${at}`)));
      const r = await fetch(url() + '/api/town/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, signature, credit_only: true }) });
      let b = {}; try { b = await r.json(); } catch { /* empty */ }
      if (r.status === 429) return { ok: false, reason: 'rate_limited', retryAfterS: Number(r.headers && r.headers.get && r.headers.get('Retry-After')) || 60 };
      if (!r.ok) return { ok: false, reason: b.error || 'network' };
      s = { ...s, onChainC: b.silk != null ? centsOf(b.silk) : s.onChainC, creditableC: b.creditable != null ? centsOf(b.creditable) : s.creditableC,
        creditedC: b.credited_total != null ? centsOf(b.credited_total) : s.creditedC, chainOk: true, stale: false, lastSyncAt: now() };
      return { ok: true, creditedC: centsOf(b.credited_now) };
    } catch { return { ok: false, reason: 'network' }; } finally { s = { ...s, syncing: false }; emit(); }
  }
  function autoSync() {
    const v = view();
    if (!disposed && v.chainOk && v.pendingC > 0 && !s.syncing && now() - lastAutoSync >= SILK_MODEL.autoSyncMs) { lastAutoSync = now(); syncNow().catch(() => {}); }
  }

  const unLedger = ledger && ledger.subscribe ? ledger.subscribe(emit) : null;
  const tick = timers.setInterval ? timers.setInterval(() => { if (!doc || doc.visibilityState !== 'hidden') refresh(); }, SILK_MODEL.refreshMs) : null;
  const onFocus = () => refresh();
  if (win && win.addEventListener) win.addEventListener('focus', onFocus);
  return {
    view, refresh, syncNow,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispose() { disposed = true; if (unLedger) unLedger(); if (tick && timers.clearInterval) timers.clearInterval(tick); if (win && win.removeEventListener) win.removeEventListener('focus', onFocus); subs.clear(); },
  };
}

// the one shared instance lives in silk-core.js (readers need no network code)
export { installSilkModel, silkView, subscribeSilk, syncSilkNow, refreshSilk } from './silk-core.js';
