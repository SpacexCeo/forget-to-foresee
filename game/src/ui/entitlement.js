// Guest profile and the synthetic demo entitlement.
// Hackathon slice (spec §1): no paid account check, no real money. The entitlement
// is clearly labeled, free, testnet-only, and lives in this browser.
import { STORAGE_KEYS } from './storage.js';

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  try { globalThis.crypto.getRandomValues(a); } catch { for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A stable anonymous guest id for this device. */
export function getGuestId(storage) {
  let id = storage.getItem(STORAGE_KEYS.guest);
  if (!id || !/^guest-[0-9a-f]{8}$/.test(id)) { id = 'guest-' + randomHex(4); storage.setItem(STORAGE_KEYS.guest, id); }
  return id;
}

export function getEntitlement(storage) {
  const e = storage.getJSON(STORAGE_KEYS.entitlement);
  return e && e.kind === 'synthetic-demo' ? e : null;
}

/** Idempotent: issuing twice returns the same entitlement. */
export function issueDemoEntitlement(storage, guestId, now = Date.now()) {
  const existing = getEntitlement(storage);
  if (existing && existing.guestId === guestId) return existing;
  const e = Object.freeze({ kind: 'synthetic-demo', label: 'demo', network: 'testnet', paid: false, priceNear: 0, guestId, issuedAt: new Date(now).toISOString() });
  storage.setJSON(STORAGE_KEYS.entitlement, e);
  return e;
}
