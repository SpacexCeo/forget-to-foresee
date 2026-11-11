// The standalone server routes to the same handlers (no network: the RPC points at a closed local port).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b58encode } from '../lib/near-tx.js';

test('node server.js: health, validation, CORS preflight, 404, no key leaks', async () => {
  process.env.FTF_RPC_URLS = 'http://127.0.0.1:9';
  process.env.FTF_GUEST_KEY = '';
  process.env.ALLOWED_ORIGIN = 'https://game.example';
  const { createServer } = await import('../server.js');
  const srv = createServer(); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const h = await fetch(base + '/api/health', { headers: { origin: 'https://game.example' } });
    assert.equal(h.status, 200); assert.equal(h.headers.get('access-control-allow-origin'), 'https://game.example');
    const hb = await h.json(); assert.equal(hb.configured, false); assert.equal(hb.stats, null); assert.ok(!('secretKey' in hb));
    const bad = await fetch(base + '/api/create-guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"public_key":"nope"}' });
    assert.equal(bad.status, 400); assert.equal((await bad.json()).error, 'bad_public_key');
    const pre = await fetch(base + '/api/create-guest', { method: 'OPTIONS', headers: { origin: 'https://other.example' } });
    assert.equal(pre.status, 403);
    const ok = await fetch(base + '/api/create-guest', { method: 'OPTIONS', headers: { origin: 'http://localhost:5181' } });
    assert.equal(ok.status, 204);
    assert.equal((await fetch(base + '/nope')).status, 404);
    const nokey = await fetch(base + '/api/create-guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_key: 'ed25519:' + b58encode(new Uint8Array(32).fill(9)) }) });
    assert.equal(nokey.status, 503); assert.equal((await nokey.json()).error, 'not_configured');
  } finally { srv.close(); }
});
