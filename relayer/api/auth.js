// Account login (lib/auth.js, docs/account-login.md):
//   POST /api/auth/nonce                 -> {nonce, expires, recipient}   one-time, 10 minutes
//   POST /api/auth/link {kind, address, public_key?, signature, account?, device_key?, nonce, expires}
//        -> {status: 'new' | 'linked' | 'existing', account_id?, guest_key?}  or 409 {status: 'conflict', existing, current, resolve}
//   POST /api/auth/link {resolve, choice: 'existing' | 'current'}   answers a conflict (no new signature)
//   POST /api/auth/email/start {email, purpose: 'link'|'login', account?}  -> {status: 'sent'}   (lib/email-auth.js)
//   POST /api/auth/email/link {email, code, account, email_key}         -> {status: 'linked', account_id, hint}
//   POST /api/auth/email/login {email, code}                            -> {status: 'signed_in', account_id, key}
//   POST /api/auth/methods {account}   POST /api/auth/unlink {id, account}   the account's linked sign-in methods
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../lib/core.js';
import { createTxClient } from '../lib/near-tx.js';
import { AUTH, createNonces, createIdentityStore, createLinker, identityFile } from '../lib/auth.js';
import { createEmailAuth, createCodes, createMailer, keyFromEnv } from '../lib/email-auth.js';

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
  let linker = opts.linker || null, email = opts.email || null;
  const codes = opts.codes || createCodes({ now: opts.now });
  const log = opts.log || ((line) => console.log(line));
  return async function handler(req, res) {
    const cfg = envConfig(env);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const lim = bucket.take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const path = (req.url || '').split('?')[0].replace(/\/$/, '');
    if (path.endsWith('/nonce')) return json(res, 200, { ...nonces.issue(), recipient: AUTH.recipient });
    const route = ['/email/start', '/email/link', '/email/login', '/methods', '/unlink'].find((r) => path.endsWith(r)) || (path.endsWith('/link') ? '/link' : null);
    if (!route) return json(res, 404, { error: 'not_found' });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'bad_body' });
    if (!linker) {
      store = store || createIdentityStore(identityFile(env));
      const client = opts.client || createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 20_000 });
      const mainnet = opts.mainnetClient || createTxClient({ rpcUrls: env.FTF_MAINNET_RPC ? env.FTF_MAINNET_RPC.split(',').map((s) => s.trim()).filter(Boolean) : MAINNET_RPC, fetch: opts.fetch || globalThis.fetch, timeoutMs: 20_000 });
      const ak = opts.accessKey || accessKeyVia(client, mainnet);
      linker = createLinker({ store, nonces, accessKey: ak, origins: cfg.origins, now: opts.now });
      email = email || createEmailAuth({ store, codes, mailer: opts.mailer || createMailer({ env, fetch: opts.fetch || globalThis.fetch, log }), accessKey: ak, key: keyFromEnv(env), now: opts.now });
    }
    if (route !== '/link') {
      const fn = { '/email/start': 'start', '/email/link': 'link', '/email/login': 'login', '/methods': 'methods', '/unlink': 'unlink' }[route];
      try { const r = await email[fn](body); log(`[auth] ${fn} -> ${r.status} ${r.body.status || r.body.error || ''}`); return json(res, r.status, r.body); } // never the address or the code
      catch (e) { log(`[auth] ${fn} error: ${String((e && e.message) || e).slice(0, 80)}`); return json(res, 502, { error: 'rpc' }); }
    }
    try {
      const r = await linker(body);
      log(`[auth] link ${String(body.resolve ? 'resolve' : body.kind).slice(0, 12)} -> ${r.status} ${r.body.status || r.body.error || ''}`); // public outcome only
      return json(res, r.status, r.body);
    } catch (e) {
      log(`[auth] link rpc error: ${String((e && e.message) || e).slice(0, 120)}`);
      return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) });
    }
  };
}

const handler = authHandler();
export default handler;
