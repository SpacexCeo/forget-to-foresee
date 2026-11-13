// The Town Ledger's data side (docs/plans/track-fit-gaps.md): reads the relayer's /api/market/stats and turns it into
// what the in-game ledger shows: today's trade count against the daily target, the latest trades with the trader's
// reason and the testnet transaction, each trader's own NEAR account, purse and stall, and the clans' trading
// strategy chosen on NEAR AI Cloud. Pure apart from fetch; no keys, no signing. Everything from the server is
// checked against a narrow shape and anything else is dropped, so a bad answer can never put markup on the page.
import { relayerUrl } from './tee-agent.js';
import { normalizeLedger } from '../ui/town-ledger-data.js';
export * from '../ui/town-ledger-data.js';

export async function fetchLedger({ base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!base || typeof fetch !== 'function') return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const r = await fetch(base + '/api/market/stats', { signal: ac ? ac.signal : undefined });
    if (!r.ok) return null;
    return normalizeLedger(await r.json());
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}
