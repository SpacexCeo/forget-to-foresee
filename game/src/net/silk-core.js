// The pure half of the one silk number (sprint 6.2; net/silk-balance.js is the live model): the single formatter and
// the view from its inputs. No imports beyond the portal's configured price, so any surface can use it.
import { EXPEDITION } from '../game/expedition-config.js';

/** "38", "38.01", "0.5", "1,234.5", "128.64": a whole number when whole, else at most 2 decimals, thousands separators. */
export function formatSilkC(c) {
  const v = Math.round(Number(c) || 0) / 100;
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * The view from its inputs (pure). `creditedC` (what the relayer has credited so far) makes `pendingC` right after the
 * gate burned silk; without it the on-chain number stands in for it.
 */
export function computeSilkView({ localTotalC = 0, onChainC = 0, creditableC = null, creditedC = null, feeC = EXPEDITION.PORTAL_FEE_C, chainOk = false, stale = false, syncing = false, lastSyncAt = null, dayRoomC = null } = {}) {
  const on = Math.max(0, Math.round(onChainC));
  const pendingC = creditableC == null ? 0 : Math.max(0, Math.round(creditableC) - Math.round(creditedC == null ? on : creditedC));
  const playC = Math.max(0, Math.round(localTotalC) - on - pendingC);
  const gateC = on;
  return {
    feeC, onChainC: on, creditableC, pendingC, playC, localTotalC: Math.round(localTotalC), totalC: on + pendingC + playC, gateC,
    enoughForGate: chainOk && gateC >= feeC, canSyncToEnough: chainOk && gateC < feeC && gateC + pendingC >= feeC,
    chainOk, stale, syncing, lastSyncAt, dayRoomC,
  };
}

// ---- the one shared instance (sprint seam: game/src/sprint/silk-view.js re-exports these)
let shared = null;
const sharedSubs = new Set();
let unShared = null;
/** Makes `model` the one every surface reads (boot calls it once). */
export function installSilkModel(model) {
  if (unShared) unShared();
  shared = model;
  unShared = model ? model.subscribe((v) => { for (const f of [...sharedSubs]) { try { f(v); } catch { /* listener */ } } }) : null;
  for (const f of [...sharedSubs]) { try { f(silkView()); } catch { /* listener */ } }
}
/** The current view; before boot installs a model: "Checking…" (chainOk false, zeros). */
export const silkView = () => (shared ? shared.view() : computeSilkView({}));
export const subscribeSilk = (fn) => { sharedSubs.add(fn); return () => sharedSubs.delete(fn); };
export const syncSilkNow = () => (shared ? shared.syncNow() : Promise.resolve({ ok: false, reason: 'not_ready' }));
export const refreshSilk = (force = true) => (shared ? shared.refresh(force) : Promise.resolve(silkView()));
