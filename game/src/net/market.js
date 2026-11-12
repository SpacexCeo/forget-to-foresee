// The town market, the browser side (docs/town-economy.md): reads the relayer's /api/market/stats (today's trade count and
// the last trades with their testnet transaction hashes) for the ticker. No keys, no signing: the trades are made by
// the relayer's daemon, each signed by that townsperson's own key. Pure apart from fetch.
import { relayerUrl } from './tee-agent.js';

export const EXPLORER = 'https://testnet.nearblocks.io';
export const POLL_MS = 20_000;
const KEYS = /^[a-z_]{2,16}$/, HASH = /^[1-9A-HJ-NP-Za-km-z]{40,50}$/;

export const txUrl = (hash, explorer = EXPLORER) => (HASH.test(String(hash || '')) ? `${explorer}/txns/${hash}` : null);

/** Normalises a stats answer: {live, today, recent: [{buyer, seller, item, qty, price, hash, url, at}]} (bad rows dropped). */
export function normalizeStats(j) {
  if (!j || typeof j !== 'object') return { live: false, today: null, recent: [] };
  const today = Number.isFinite(j.today) ? j.today : (j.chain && Number.isFinite(j.chain.today) ? j.chain.today : null);
  const recent = (Array.isArray(j.recent) ? j.recent : []).filter((r) => r && KEYS.test(r.buyer) && KEYS.test(r.seller) && KEYS.test(r.item) && Number.isInteger(r.qty) && Number.isInteger(r.price))
    .slice(0, 10).map((r) => ({ buyer: r.buyer, seller: r.seller, item: r.item, qty: r.qty, price: r.price, silk: Number.isInteger(r.silk) && r.silk > 0 ? r.silk : null, at: Number(r.at) || 0, hash: HASH.test(r.hash || '') ? r.hash : null, url: txUrl(r.hash) }));
  return { live: !!j.enabled && !j.paused, today, recent };
}

/** One poll of the relayer. Resolves the normalised stats, or null when there is no relayer or it did not answer. */
export async function fetchMarket({ base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!base || typeof fetch !== 'function') return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const r = await fetch(base + '/api/market/stats', { signal: ac ? ac.signal : undefined });
    if (!r.ok) return null;
    return normalizeStats(await r.json());
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

/** A line for one trade in the current language: names and goods come from the locale (mk.t.*, mk.i.*). */
export function tradeLine(t, r) {
  const name = (k) => t('mk.t.' + k);
  // ftf-town rows carry the silk paid (micro-units): show it as silk; the parked market contract's rows a unit price
  const price = r.silk ? (Math.round(r.silk / 10_000) / 100).toString() : r.price;
  return t('mk.line', { buyer: name(r.buyer), seller: name(r.seller), item: t('mk.i.' + r.item), qty: r.qty, price });
}
