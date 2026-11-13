// STUB (A3 implements; sprint plan 3.2, 6.2): the single silk model. The shape is final; values are placeholders read
// from the town ledger when one is attached, so the HUD and the tracker can code against it today.
import { portalFee } from '../game/expedition-config.js';
let ledgerRef = null, feeC = portalFee(globalThis.location ? globalThis.location.search : '').feeC;
const subs = new Set();
export function _attach({ ledger = null, portalFeeC = null } = {}) { ledgerRef = ledger; if (Number.isFinite(portalFeeC)) feeC = portalFeeC; }
export function silkView() {
  const playC = ledgerRef ? ledgerRef.silk : 0;
  return { totalC: playC, gateC: 0, onChainC: 0, pendingC: 0, playC, feeC, enoughForGate: false, syncing: false, lastSyncAt: 0, chainOk: false };
}
export function subscribeSilk(fn) { subs.add(fn); return () => subs.delete(fn); }
export async function syncSilkNow() { return { ok: false, reason: 'not-implemented' }; }
