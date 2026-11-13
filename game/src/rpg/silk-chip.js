// The silk chip (sprint plan 5.12): the ONE silk number (gateC from A3's silkView()), a "+N waiting" line with Sync,
// "Syncing…", "Offline", and the exact tooltip breakdown. Pure text functions plus a small DOM builder.

import { formatSilkC } from '../net/silk-core.js';

/** Silk from hundredths, in the one format of the game (net/silk-core.js formatSilkC). */
export const fmtSilk = (c) => formatSilkC(c);

/** A silkView()-shaped object from the town ledger, used only until A3's silkView exists (everything is play silk). */
export const ledgerSilkView = (ledger, feeC = 0) => {
  const c = ledger ? ledger.silk : 0;
  return { totalC: c, gateC: c, onChainC: 0, pendingC: 0, playC: c, feeC, enoughForGate: feeC > 0 && c >= feeC, syncing: false, lastSyncAt: 0, chainOk: true, fallback: true };
};

/**
 * Chip text for a view: {line1, line2, line2Kind: 'pending'|'syncing'|'offline'|null, showSync, tooltip: [{text, bold?}], link}.
 * `t` is the HUD translator.
 */
export function silkChipText(v, t) {
  // no NEAR account, or NEAR not reachable: the silk on this device, labelled honestly (design review 13.11)
  const local = v.noAccount || v.chainOk === false;
  const line1 = fmtSilk(local ? (v.localTotalC != null ? v.localTotalC : v.totalC) : v.gateC);
  let line2 = null, kind = null;
  if (local) { line2 = t('silk.device'); kind = 'local'; }   // "Playing locally" in all five locales
  else if (v.syncing) { line2 = t('silk.syncing'); kind = 'syncing'; }
  else if (v.pendingC > 0) { line2 = t('silk.waiting', { n: fmtSilk(v.pendingC) }); kind = 'pending'; }
  const tip = [{ text: t('silk.tip.gate', { n: fmtSilk(v.gateC) }), bold: true }, { text: t('silk.tip.chain', { n: fmtSilk(v.onChainC) }) }];
  if (v.pendingC > 0) tip.push({ text: t('silk.tip.pending', { n: fmtSilk(v.pendingC) }) });
  if (v.playC > 0) tip.push({ text: t('silk.tip.play', { n: fmtSilk(v.playC) }) });
  tip.push({ text: t('silk.tip.total', { n: fmtSilk(v.totalC) }) }, { text: t('silk.tip.fee', { n: fmtSilk(v.feeC) }) }, { text: t('silk.tip.help') });
  return { line1, line2, line2Kind: kind, showSync: kind === 'pending', tooltip: tip, link: t('silk.tip.what') };
}
