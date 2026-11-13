import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTxClient, endpointError } from '../lib/near-tx.js';

const ok = (result) => ({ status: 200, json: async () => ({ jsonrpc: '2.0', id: 'ftf', result }) });
const rpcErr = (error, status = 200) => ({ status, json: async () => ({ jsonrpc: '2.0', id: 'ftf', error }) });

test('a -429 JSON answer (rate limit, deprecated endpoint) moves on to the next RPC instead of failing', async () => {
  const seen = [];
  const fetch = async (url) => { seen.push(url); return url.includes('a.') ? rpcErr({ code: -429, message: 'ENDPOINT IS DEPRECATED. Please switch to fastnear' }) : ok({ ok: 1 }); };
  const c = createTxClient({ rpcUrls: ['https://a.example', 'https://b.example'], fetch });
  assert.deepEqual(await c.rpc('status', {}), { ok: 1 });
  assert.deepEqual(seen, ['https://a.example', 'https://b.example']);
});

test('HTTP 429 or 5xx also moves on; a real request error (bad args) still fails at once', async () => {
  const c1 = createTxClient({ rpcUrls: ['https://a.example', 'https://b.example'], fetch: async (url) => (url.includes('a.') ? { status: 429, json: async () => ({}) } : ok(7)) });
  assert.equal(await c1.rpc('status', {}), 7);
  let calls = 0;
  const c2 = createTxClient({ rpcUrls: ['https://a.example', 'https://b.example'], fetch: async () => { calls++; return rpcErr({ code: -32000, message: 'Server error', cause: { name: 'UNKNOWN_ACCOUNT' } }); } });
  await assert.rejects(c2.rpc('query', {}), /UNKNOWN_ACCOUNT/);
  assert.equal(calls, 1);
});

test('endpointError tells endpoint trouble from request errors', () => {
  assert.equal(endpointError({ code: -429, message: 'x' }), true);
  assert.equal(endpointError({ code: -32000, message: 'Too Many Requests' }), true);
  assert.equal(endpointError({ code: -32000, message: 'Server error', cause: { name: 'INVALID_NONCE' } }), false);
});
