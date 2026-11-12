// Shared bits of the pass endpoints (the leading underscore keeps it from being an endpoint on serverless hosts).
export const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
export async function readBody(req, max = 4096) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = ''; for await (const c of req) { s += c; if (s.length > max) return null; }
  try { return JSON.parse(s); } catch { return null; }
}
export const query = (req) => new URL(req.url || '/', 'http://x').searchParams;
