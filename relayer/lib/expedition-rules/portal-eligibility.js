// Whitelist-pass eligibility from an expedition log (story TZ §3.4 / §11.3): the full Gate-Loom fee paid exactly once,
// covered by verifiable income earned before it. Pure (no DOM, no storage); importable by the relayer. A ?portalFee=
// demo fee never counts; there is one currency, silk.
import { EXPEDITION } from './expedition-config.js';

export const PORTAL_FEE_C = EXPEDITION.PORTAL_FEE_C;

/**
 * @param {object[]} log the stored expedition log entries (call verifyLog first: this function trusts the chain)
 * @returns {{eligible: boolean, paid: boolean, earnedC: number, neededC: number, paidAt: number|null, reason: string|null}}
 */
export function portalEligibility(log, { feeC = PORTAL_FEE_C, killVerifyCapC = EXPEDITION.killVerifyCapC } = {}) {
  const entries = Array.isArray(log) ? log : [];
  const paid = entries.filter((e) => e && e.kind === 'portal_paid' && !(e.data && e.data.demo) && (e.data && e.data.feeC) === feeC && e.silkC === -feeC);
  const first = paid[0] || null;
  let t2 = 0, t1 = 0;
  for (const e of entries) {
    if (first && e.seq >= first.seq) break;
    if (!e || !(e.silkC > 0)) continue;
    if (e.trust === 'T2') t2 += e.silkC; else if (e.trust === 'T1') t1 += e.silkC;
  }
  const earnedC = t2 + Math.min(t1, killVerifyCapC);
  const reason = !first ? 'not_paid' : paid.length > 1 ? 'paid_twice' : earnedC < feeC ? 'income_unverified' : null;
  return { eligible: reason === null, paid: !!first, earnedC, neededC: feeC, paidAt: first ? first.t : null, reason };
}
