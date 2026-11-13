// Account login (lib/auth.js, docs/account-login.md):
//   POST /api/auth/nonce                 -> {nonce, expires, recipient}   one-time, 10 minutes
//   POST /api/auth/link {kind, address, public_key?, signature, account?, device_key?, nonce, expires}
//        -> {status: 'new' | 'linked' | 'existing', account_id?, guest_key?}  or 409 {status: 'conflict', existing, current, resolve}
//   POST /api/auth/link {resolve, choice: 'existing' | 'current'}   answers a conflict (no new signature)
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../lib/core.js';
import { createTxClient } from '../lib/near-tx.js';
import { AUTH, createNonces, createIdentityStore, createLinker, identityFile } from '../lib/auth.js';

const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 8192) return null; }
  try { return JSON.parse(s || '{}'); } catch { return null; }
}

export const MAINNET_RPC = ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'];
/** The network of a NEAR account id: *.testnet (and the guests) on testnet, every other named account on mainnet. */
export const networkOf = (account_id) => (/.testnet$/.test(account_id) ? 'testnet' : 'mainnet');
/** RPC view_access_key on the account's own network -> {permission: 'FullAccess' | {FunctionCall}} or null. */
export const accessKeyVia = (client, mainnet = client) => async (account_id, public_key) => {
  try {
    const r = await (networkOf(account_id) === 'testnet' ? client : mainnet).rpc('query', { request_type: 'view_access_key', finality: 'final', account_id, public_key });
    return { permission: r.permission === 'FullAccess' ? 'FullAccess' : r.permission };
  } catch { return null; }
};

export function authHandler(opts = {}) {
  const env = opts.env || process.env;
  const nonces = opts.nonces || createNonces({ now: opts.now });
  let store = opts.store || null; // opened on the first request: the env (FTF_DATA_DIR) is final by then
  const bucket = opts.bucket || createBucket({ capacity: 20, refillMs: 60 * 1000 });
  let linker = opts.linker || null;
  return async function handler(req, res) {
    const cfg = envConfig(env);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const lim = bucket.take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const path = (req.url || '').split('?')[0].replace(/\/$/, '');
    if (path.endsWith('/nonce')) return json(res, 200, { ...nonces.issue(), recipient: AUTH.recipient });
    if (!path.endsWith('/link')) return json(res, 404, { error: 'not_found' });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'bad_body' });
    if (!linker) {
      store = store || createIdentityStore(identityFile(env));
      const client = opts.client || createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 20_000 });
      const mainnet = opts.mainnetClient || createTxClient({ rpcUrls: env.FTF_MAINNET_RPC ? env.FTF_MAINNET_RPC.split(',').map((s) => s.trim()).filter(Boolean) : MAINNET_RPC, fetch: opts.fetch || globalThis.fetch, timeoutMs: 20_000 });
      linker = createLinker({ store, nonces, accessKey: opts.accessKey || accessKeyVia(client, mainnet), origins: cfg.origins, now: opts.now });
    }
    try {
      const r = await linker(body);
      return json(res, r.status, r.body);
    } catch (e) {
      return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) });
    }
  };
}

const handler = authHandler();
export default handler;
