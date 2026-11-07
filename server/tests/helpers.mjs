// Shared test helpers: deterministic season randomness, a manual clock and command shorthands.
import { createApi } from '../../game/src/net/api.js';
import { createServer } from '../src/server.js';

/** A deterministic randomBytes source (xorshift) so two registries build identical seasons. */
export function seededBytes(seed = 1) {
  return () => {
    let x = seed >>> 0 || 1;
    return (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 255; } return out; };
  };
}

export function manualClock(start = 1_000_000) { let t = start; const clock = () => t; clock.add = (ms) => { t += ms; }; return clock; }

/** A direct (in-process) API client bound to one session token. */
export function directPlayer(api, created) {
  const { sessionId: id, token } = created.body;
  let n = 0;
  return {
    id, token, created,
    obs: () => api.observe(id, token).body.observation,
    actions: () => api.actions(id, token).body.actions,
    cmd(type, args = {}, extra = {}) {
      const version = api.observe(id, token).body.observation.version;
      return api.command(id, token, { actionId: `t-${id}-${++n}`, expectedVersion: version, type, args, ...extra });
    },
    raw: (envelope) => api.command(id, token, envelope),
  };
}

export function newDirect(opts = {}, registry = {}) {
  const api = createApi(registry);
  const created = api.createSession(opts);
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  return { api, p: directPlayer(api, created) };
}

/** Starts an HTTP server on a free port; returns {base, app, req(method, path, body, token)}. */
export async function startHttp(o = {}) {
  const app = createServer({ tickMs: 20, ...o });
  const addr = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${addr.port}`;
  const req = async (method, path, body, token, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, body: json, text };
  };
  return { base, app, req };
}
