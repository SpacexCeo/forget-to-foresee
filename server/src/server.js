// Agent-playable HTTP API for Forget to Foresee (OpenAPI: docs/api/openapi.yaml).
// node:http only, no dependencies. Routes map onto the transport-independent operations in
// game/src/net/api.js, which run the authoritative room (the same code the browser's local
// transport runs). Adds what only a network server needs: bearer auth from the Authorization
// header, rate limits (429 + Retry-After), a 16 KiB body limit, CORS for local dev, SSE with resume.
// Request logs carry method, route, status and duration only: never headers, bodies or tokens.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createApi } from '../../game/src/net/api.js';
import { RateLimiter } from './rate-limit.js';

const MAX_BODY = 16 * 1024;
const OPENAPI_PATH = fileURLToPath(new URL('../../docs/api/openapi.yaml', import.meta.url));

/**
 * @param {object} [o]
 * @param {object} [o.registry]   SessionRegistry options (clock, maxTimeScale, allowClientSeed, seasonRandomBytes, ...)
 * @param {{commands?: {rate, burst}, reads?: {rate, burst}, create?: {rate, burst}}} [o.limits]
 * @param {(entry: object) => void} [o.log]   receives {method, route, status, ms, session}
 * @param {string[]} [o.corsOrigins]
 * @param {() => number} [o.clock]   rate-limit clock (defaults to the registry clock or Date.now)
 * @param {number} [o.tickMs]   how often walking avatars are advanced for live SSE arrivals (10 Hz)
 */
export function createServer({ registry = {}, limits = {}, log = () => {}, corsOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'], clock, tickMs = 100 } = {}) {
  const api = createApi(registry);
  const now = clock || api.registry.clock;
  const lim = {
    commands: new RateLimiter({ rate: 20, burst: 40, clock: now, ...limits.commands }),
    reads: new RateLimiter({ rate: 50, burst: 100, clock: now, ...limits.reads }),
    create: new RateLimiter({ rate: 0.5, burst: 10, clock: now, ...limits.create }),
  };
  let openapi = null;
  const streams = new Set();

  const send = (res, status, body, headers = {}) => {
    const data = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(data);
  };
  const error = (res, status, code, message, extra = {}, headers = {}) => send(res, status, { ok: false, error: { code, message, ...extra } }, headers);

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Last-Event-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After, Idempotent-Replayed');
    }
  }

  const bearer = (req) => { const h = req.headers.authorization || ''; const m = /^Bearer ([A-Za-z0-9_]{1,200})$/.exec(h); return m ? m[1] : null; };
  const keyOf = (token, req) => (token ? 't:' + createHash('sha256').update(token).digest('hex').slice(0, 32) : 'ip:' + (req.socket.remoteAddress || '?'));

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 'payload_too_large' })); req.destroy(); return; } chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('invalid JSON'), { code: 'invalid_request' })); }
      });
      req.on('error', reject);
    });
  }

  function limited(res, limiter, key) {
    const r = limiter.take(key);
    if (r.ok) return false;
    error(res, 429, 'rate_limited', 'too many requests', { retryAfterSeconds: r.retryAfter }, { 'Retry-After': String(r.retryAfter) });
    return true;
  }

  function stream(req, res, id, token, after) {
    const unsub = api.subscribe(id, token, (ev) => write(ev));
    if (!unsub) return error(res, 401, 'unauthorized', 'missing or invalid bearer token for this session');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    let last = after;
    const write = (ev) => { if (ev.seq <= last) return; last = ev.seq; res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`); };
    res.write(': forget-to-foresee event stream\nretry: 2000\n\n');
    const backlog = api.events(id, token, after, 10000);
    if (backlog.status === 200) for (const ev of backlog.body.events) write(ev);
    const hb = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    const s = { close: () => { clearInterval(hb); unsub(); streams.delete(s); } };
    streams.add(s);
    req.on('close', s.close);
  }

  const routes = [
    ['GET', /^\/v1\/health$/, (req, res) => send(res, 200, { ok: true, service: 'forget-to-foresee-api', apiVersion: 'v1' })],
    ['GET', /^\/v1\/openapi\.yaml$/, (req, res) => { openapi ||= readFileSync(OPENAPI_PATH, 'utf8'); res.writeHead(200, { 'Content-Type': 'application/yaml; charset=utf-8' }); res.end(openapi); }],
    ['GET', /^\/v1\/actions$/, (req, res) => { const r = api.catalog(); send(res, r.status, r.body); }],
    ['POST', /^\/v1\/sessions$/, async (req, res) => {
      if (limited(res, lim.create, keyOf(null, req))) return;
      const r = api.createSession(await readBody(req)); send(res, r.status, r.body);
    }],
    ['POST', /^\/v1\/sessions\/([\w-]+)\/join$/, async (req, res, [id]) => {
      if (limited(res, lim.create, keyOf(null, req))) return;
      const r = api.join(id, await readBody(req)); send(res, r.status, r.body);
    }],
    ['POST', /^\/v1\/sessions\/([\w-]+)\/leave$/, (req, res, [id], token) => { const r = api.leave(id, token); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)$/, (req, res, [id], token) => { const r = api.session(id, token); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/observation$/, (req, res, [id], token) => { const r = api.observe(id, token); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/actions$/, (req, res, [id], token) => { const r = api.actions(id, token); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/history$/, (req, res, [id], token) => { const r = api.history(id, token); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/proofs\/(\d+)$/, (req, res, [id, idx], token) => { const r = api.proof(id, token, Number(idx)); send(res, r.status, r.body); }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/events$/, (req, res, [id], token, url) => {
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0), limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
      const r = api.events(id, token, after, limit); send(res, r.status, r.body);
    }],
    ['GET', /^\/v1\/sessions\/([\w-]+)\/events\/stream$/, (req, res, [id], token, url) => {
      const after = Math.max(0, Number(req.headers['last-event-id'] || url.searchParams.get('after')) || 0);
      stream(req, res, id, token, after);
    }],
    ['POST', /^\/v1\/sessions\/([\w-]+)\/commands$/, async (req, res, [id], token) => {
      if (limited(res, lim.commands, keyOf(token, req))) return;
      const r = api.command(id, token, await readBody(req));
      send(res, r.status, r.body, r.body && r.body.replayed ? { 'Idempotent-Replayed': 'true' } : {});
    }],
  ];

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url, 'http://local');
    let route = 'unmatched', session = null;
    res.on('finish', () => { try { log({ method: req.method, route, status: res.statusCode, ms: Date.now() - t0, session }); } catch { /* logging never breaks a request */ } });
    try {
      cors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      for (const [method, re, handler] of routes) {
        const m = re.exec(url.pathname);
        if (!m) continue;
        if (req.method !== method) continue;
        route = method + ' ' + re.source.replace(/\\\//g, '/').replace(/\(\[\\w-\]\+\)/g, '{id}').replace(/\(\\d\+\)/g, '{n}').replace(/[\^$\\]/g, '');
        session = m[1] && m[1].startsWith('s-') ? m[1] : null;
        const token = bearer(req);
        if (method === 'GET' && session && limited(res, lim.reads, keyOf(token, req))) return;
        await handler(req, res, m.slice(1), token, url);
        return;
      }
      error(res, 404, 'not_found', 'no such route; see GET /v1/openapi.yaml');
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e.code === 'payload_too_large') return error(res, 413, 'payload_too_large', 'request body over 16 KiB');
      if (e.code === 'invalid_request') return error(res, 400, 'invalid_request', 'body must be JSON');
      error(res, 500, 'internal', 'internal error');
    }
  });

  // 10 Hz world tick: completes walks so SSE subscribers get arrival events without polling.
  const ticker = setInterval(() => {
    for (const e of api.registry.sessions.values()) {
      for (const m of e.room.members.values()) if (m.avatar.transit) { e.room.advance(); break; }
    }
  }, tickMs);
  ticker.unref();
  server.on('close', () => { clearInterval(ticker); for (const s of [...streams]) s.close(); });

  return {
    server, api,
    listen(port = 8787, host = '127.0.0.1') { return new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))); },
    close() { for (const s of [...streams]) s.close(); server.closeAllConnections?.(); return new Promise((resolve) => server.close(() => resolve())); },
  };
}
