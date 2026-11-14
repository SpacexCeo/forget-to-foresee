// On-chain receipts (lead, 14.11: "a judge must see within minutes that this runs on NEAR"): every transaction the
// game's existing flows already get back from the relayer (the guest account and heroine mint, a chest opening, the
// wheel's skin, a dragon, a Town Works act, the Gate-Loom toll, a stall trade) is noted here with its explorer link,
// kept in this browser (last 40) and announced as the window event 'ftf:tx' {kind, hash, url, at, note} for the
// receipt toast (ui/tx-toast.js). No chain call of its own: it only records hashes the flows already have.
import { NEAR_DEPLOYMENT } from './near-deployment.js';

export const RECEIPTS_KEY = 'ftf.receipts.v1';
export const RECEIPT_KINDS = Object.freeze(['guest', 'chest', 'skin', 'dragon', 'act', 'gate', 'trade']);
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX = 40;

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
/** The explorer link of a transaction (this build's network). */
export const txLink = (hash) => `${String(NEAR_DEPLOYMENT.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '')}/txns/${hash}`;

/** The receipts, newest first: [{kind, hash, url, at, note}]. */
export function loadReceipts(storage = store()) {
  try { const v = JSON.parse((storage && storage.getItem(RECEIPTS_KEY)) || '[]'); return Array.isArray(v) ? v.filter((r) => r && HASH.test(r.hash)).map((r) => ({ ...r, url: txLink(r.hash) })) : []; } catch { return []; }
}

/**
 * Notes one landed transaction; a repeated hash is kept once. Returns the receipt, or null for no/invalid hash.
 * @param {string} kind one of RECEIPT_KINDS  @param {string|null} hash  @param {{note?: string, storage?: object, now?: number}} [o]
 */
export function recordTx(kind, hash, { note = null, storage = store(), now = Date.now() } = {}) {
  const h = String(hash || '').replace(/^https?:\/\/[^/]+\/txns\//, '');
  if (!HASH.test(h) || !RECEIPT_KINDS.includes(kind)) return null;
  const rec = { kind, hash: h, at: now, note: note == null ? null : String(note).slice(0, 80) };
  const list = loadReceipts(storage);
  if (!list.some((r) => r.hash === h)) {
    try { if (storage) storage.setItem(RECEIPTS_KEY, JSON.stringify([{ kind, hash: h, at: now, note: rec.note }, ...list.map(({ url, ...r }) => r)].slice(0, MAX))); } catch { /* memory only */ }
    try { if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') globalThis.dispatchEvent(new CustomEvent('ftf:tx', { detail: { ...rec, url: txLink(h) } })); } catch { /* no window */ }
  }
  return { ...rec, url: txLink(h) };
}
