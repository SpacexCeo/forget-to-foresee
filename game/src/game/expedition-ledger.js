// The Expedition's ledger façade (TZ §4.1): town silk through the town ledger (grant / spend) plus the hash-chained log
// of every delta the story makes, persisted at EXPEDITION_KEY. The log entry is written before the balance moves, so
// a reload never double-spends; the same seq is never appended twice. Never reads the engine's S.silk. Pure apart from
// storage.
import { makeEntry, verifyLog } from './expedition-log.js';
import { EXPEDITION } from './expedition-config.js';

export const EXPEDITION_KEY = 'ftf.expedition.v1';

/**
 * @param {{storage?: object, now?: () => number, town: {silk: number, grant: Function, spend: Function}}} o
 */
export function createExpeditionLedger({ storage = null, now = () => Date.now(), town }) {
  let st = null;
  try { st = JSON.parse((storage && storage.getItem(EXPEDITION_KEY)) || 'null'); } catch { st = null; }
  if (!st || st.v !== 1 || !Array.isArray(st.log)) st = { v: 1, log: [] };
  const subs = new Set();
  const save = () => { try { if (storage) storage.setItem(EXPEDITION_KEY, JSON.stringify(st)); } catch { /* memory only */ } for (const f of [...subs]) f(api); };
  const api = {
    get balanceC() { return town.silk; },
    get log() { return st.log.slice(); },
    /** Story silk earned (all) and verifiable (T2 plus T1 up to the cap). */
    get earnedC() { return verifyLog(st.log).earned; },
    get earnedVerifiedC() { return verifyLog(st.log, { killVerifyCapC: EXPEDITION.killVerifyCapC }).earnedVerified; },
    /**
     * Records one story event and moves town silk by its delta: income is granted, a negative delta is spent (all or
     * nothing). Returns {ok, entry} or {ok: false, reason}.
     */
    append({ kind, data = {}, silkC = 0, trust = 'T2' }) {
      if (silkC < 0 && town.silk < -silkC) return { ok: false, reason: 'no_silk' };
      const entry = makeEntry(st.log, { t: now(), kind, data, silkC, trust });
      st.log = [...st.log, entry]; save(); // logged first: a reload replays the log, it does not pay twice
      if (silkC > 0) town.grant({ silk: silkC });
      else if (silkC < 0) { const r = town.spend({ silkC: -silkC, reason: kind }); if (!r.ok) return { ok: false, reason: r.reason, entry }; }
      return { ok: true, entry };
    },
    verify: () => verifyLog(st.log, { killVerifyCapC: EXPEDITION.killVerifyCapC }),
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}
