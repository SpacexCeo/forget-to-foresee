// The Loom meter's numbers (ui/loom-meter-core.js): the relayer's gate day (GET /api/town/gate?stats=1, relayer/api/town/gate.js)
// and, when the relayer cannot answer, the town contract's own counters through a read-only RPC view (pulse). Returns the
// raw answer for loomView, or null. Never throws, never signs anything.
import { relayerUrl } from './tee-agent.js';

/** @param {{base?: string, fetch?: Function, timeoutMs?: number, chain?: () => Promise<object|null>}} [o] */
export async function fetchLoomStats({ base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 8000, chain = readPulse } = {}) {
  if (base && fetch) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetch(String(base).replace(/\/$/, '') + '/api/town/gate?stats=1', ctl ? { signal: ctl.signal } : undefined);
      if (r && r.ok) { const j = await r.json(); if (j && (j.today || j.total)) return j; }
    } catch { /* the chain below */ } finally { if (timer) clearTimeout(timer); }
  }
  try { return await chain(); } catch { return null; }
}

/** The town contract's pulse (gate_burned, gates_paid), read-only, or null. */
export async function readPulse({ fetch = globalThis.fetch } = {}) {
  const [{ createNearClient }, { DAY1_DEPLOYMENT }, { NEAR_DEPLOYMENT }] = await Promise.all([import('./near.js'), import('./day1-deployment.js'), import('./near-deployment.js')]);
  if (!DAY1_DEPLOYMENT || !DAY1_DEPLOYMENT.town) return null;
  const near = createNearClient({ contractId: DAY1_DEPLOYMENT.town, rpcUrls: NEAR_DEPLOYMENT.rpcUrls, fetch, timeoutMs: 8000 });
  const r = await near.view('pulse', {});
  return r && r.value && (r.value.gates_paid != null || r.value.gate_burned != null) ? { gates_paid: r.value.gates_paid, gate_burned: r.value.gate_burned } : null;
}
