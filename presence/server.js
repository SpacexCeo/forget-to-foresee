// Presence service: the shared sky town for up to 15 players per room (docs/multiplayer.md). Plain Node, no deps.
//   node server.js   (env: PER_IP (local tests only; default 3), PORT=8788, HOST=0.0.0.0, ALLOWED_ORIGIN (comma list; localhost always allowed), TRUST_PROXY=1 behind Caddy,
//                     PRESENCE_DATA_DIR: the folder of chat-history.json, the rooms' last lines and actions; unset keeps them in memory only)
// GET /health -> counts only. WebSocket on /presence (or /).
import http from 'node:http';
import { createHash } from 'node:crypto';
import { handshake, wrapSocket } from './lib/ws.js';
import { createHub, LIMITS } from './lib/hub.js';
import { createHistory } from './lib/history.js';

export const NET = Object.freeze({ perIp: 3, newPerIpPerMin: 10, maxSockets: LIMITS.roomSize * LIMITS.maxRooms, maxPayload: 1024, pingMs: 15000 });
const DEFAULT_ORIGINS = ['https://spacexceo.github.io'];

export function originAllowed(origin, origins = DEFAULT_ORIGINS) {
  if (typeof origin !== 'string') return false;
  return origins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** The service; returns the http server (not yet listening) and the hub. */
export function createPresence({ env = process.env, now = () => Date.now(), log = (...a) => console.log(new Date().toISOString(), ...a), net: base = NET } = {}) {
  // PER_IP raises the per-IP socket cap for a local test server (presence/tools/bots.mjs); production keeps 3
  const net = Number(env.PER_IP) > 0 ? { ...base, perIp: Number(env.PER_IP), newPerIpPerMin: Math.max(base.newPerIpPerMin, 2 * Number(env.PER_IP)) } : base;
  const origins = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
  const trustProxy = env.TRUST_PROXY === '1';
  const history = createHistory({ dir: env.PRESENCE_DATA_DIR || null, now, log });
  const hub = createHub({ now, log, history });
  const perIp = new Map(), recent = new Map(); // ip hash -> open sockets / timestamps of new connections
  const sockets = new Set();
  const rejected = {};
  const reject = (socket, code, why) => { rejected[why] = (rejected[why] || 0) + 1; socket.end(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  // the IP only as a short salted hash in memory: never logged or stored
  const salt = String(Math.random());
  const ipKey = (req) => createHash('sha256').update(salt + String((trustProxy && (req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress)).digest('hex').slice(0, 16);

  const server = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health' || path === '/presence/health') {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      const o = req.headers.origin; if (originAllowed(o, origins)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
      res.end(JSON.stringify({ ok: true, sockets: sockets.size, ...hub.stats(), roomSize: LIMITS.roomSize, rejected }));
      return;
    }
    res.statusCode = 404; res.end();
  });
  server.on('upgrade', (req, socket) => {
    const path = (req.url || '/').split('?')[0];
    if (path !== '/presence' && path !== '/') return reject(socket, 404, 'not_found');
    if (!originAllowed(req.headers.origin, origins)) return reject(socket, 403, 'origin');
    if (sockets.size >= net.maxSockets) return reject(socket, 503, 'full');
    const ip = ipKey(req), t = now();
    const times = (recent.get(ip) || []).filter((x) => t - x < 60000);
    if (times.length >= net.newPerIpPerMin) { recent.set(ip, times); return reject(socket, 429, 'rate'); }
    times.push(t); recent.set(ip, times);
    if ((perIp.get(ip) || 0) >= net.perIp) return reject(socket, 429, 'per_ip');
    if (!handshake(req, socket)) return;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    let conn = null, alive = true;
    const ws = wrapSocket(socket, {
      maxPayload: net.maxPayload,
      onText: (s) => conn.onText(s),
      onPong: () => { alive = true; },
      onClose: () => { sockets.delete(ws); conn.onClose(); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); },
    });
    ws.heartbeat = () => { if (!alive) return ws.close(1001); alive = false; ws.ping(); };
    sockets.add(ws);
    conn = hub.connect(ws);
  });
  const tick = setInterval(() => hub.tick(), 1000 / LIMITS.tickHz);
  const beat = setInterval(() => { for (const ws of sockets) ws.heartbeat(); for (const [k, v] of recent) if (!v.some((x) => now() - x < 60000)) recent.delete(k); }, net.pingMs);
  tick.unref(); beat.unref();
  server.on('close', () => { clearInterval(tick); clearInterval(beat); history.save(); });
  return { server, hub, sockets, history };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8788, host = process.env.HOST || '0.0.0.0';
  const { server, history } = createPresence();
  // a restart keeps the last lines: the pending write goes out before the process ends
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { history.save(); process.exit(0); });
  server.listen(port, host, () => console.log(`presence on ${host}:${port}`));
}
