// The silk chip (sprint plan 5.12): the ONE silk number (gateC from A3's silkView()), a "+N waiting" line with Sync,
// "Syncing…", "Offline", and the exact tooltip breakdown. Pure text functions plus a small DOM builder.

/** Silk from hundredths: whole numbers when whole, else up to 2 decimals. */
export function fmtSilk(c) {
  const v = Math.round(Number(c) || 0) / 100;
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

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
  const line1 = fmtSilk(v.gateC);
  let line2 = null, kind = null;
  if (v.chainOk === false) { line2 = t('silk.offline'); kind = 'offline'; }
  else if (v.syncing) { line2 = t('silk.syncing'); kind = 'syncing'; }
  else if (v.pendingC > 0) { line2 = t('silk.waiting', { n: fmtSilk(v.pendingC) }); kind = 'pending'; }
  const tip = [{ text: t('silk.tip.gate', { n: fmtSilk(v.gateC) }), bold: true }, { text: t('silk.tip.chain', { n: fmtSilk(v.onChainC) }) }];
  if (v.pendingC > 0) tip.push({ text: t('silk.tip.pending', { n: fmtSilk(v.pendingC) }) });
  if (v.playC > 0) tip.push({ text: t('silk.tip.play', { n: fmtSilk(v.playC) }) });
  tip.push({ text: t('silk.tip.total', { n: fmtSilk(v.totalC) }) }, { text: t('silk.tip.fee', { n: fmtSilk(v.feeC) }) }, { text: t('silk.tip.help') });
  return { line1, line2, line2Kind: kind, showSync: kind === 'pending', tooltip: tip, link: t('silk.tip.what') };
}
