// Standalone relayer: plain Node http serving the same handlers as the serverless entry points in api/.
// node server.js   (env: FTF_GUEST_KEY, ALLOWED_ORIGIN, PORT=8787, HOST=0.0.0.0, TRUST_PROXY=1 behind a reverse proxy)
import http from 'node:http';
import createGuest from './api/create-guest.js';
import health from './api/health.js';

const routes = { '/api/create-guest': createGuest, '/api/health': health };
if (!process.env.TRUST_PROXY) process.env.TRUST_PROXY = '0'; // direct exposure: do not trust X-Forwarded-For

export function createServer() {
  return http.createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0].replace(/\/$/, '');
    const fn = routes[path];
    if (!fn) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"not_found"}'); return; }
    try { await fn(req, res); } catch { if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"internal"}'); } }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8787, host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => console.log(`relayer on http://${host}:${port} (key ${process.env.FTF_GUEST_KEY ? 'set' : 'NOT set'})`));
}
