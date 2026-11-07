// The HTTP transport: routes, auth, status codes, headers, body limit, SSE with resume.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttp } from './helpers.mjs';

test('HTTP routes map onto the API with correct statuses', async (t) => {
  const { app, req } = await startHttp();
  t.after(() => app.close());

  assert.equal((await req('GET', '/v1/health')).body.ok, true);
  const cat = await req('GET', '/v1/actions');
  assert.equal(cat.status, 200);
  assert.ok(cat.body.actions.length >= 20);
  const spec = await req('GET', '/v1/openapi.yaml');
  assert.equal(spec.status, 200);
  assert.match(spec.text, /^openapi: 3\.1/m);
  assert.equal((await req('GET', '/v1/nope')).status, 404);

  const c = await req('POST', '/v1/sessions', { rules: 'v3', worldRules: 'free' });
  assert.equal(c.status, 201);
  const { sessionId: id, token } = c.body;
  assert.equal((await req('GET', `/v1/sessions/${id}/observation`)).status, 401, 'no token');
  assert.equal((await req('GET', `/v1/sessions/${id}/observation`, undefined, 'ftf_wrong')).status, 401);
  const o = await req('GET', `/v1/sessions/${id}/observation`, undefined, token);
  assert.equal(o.status, 200);
  assert.equal(o.headers.get('cache-control'), 'no-store');

  const env = { actionId: 'http-start-001', expectedVersion: o.body.observation.version, type: 'start_season', args: {} };
  const r1 = await req('POST', `/v1/sessions/${id}/commands`, env, token);
  assert.equal(r1.status, 200);
  const r2 = await req('POST', `/v1/sessions/${id}/commands`, env, token);
  assert.equal(r2.headers.get('idempotent-replayed'), 'true');

  assert.equal((await req('POST', `/v1/sessions/${id}/commands`, '{not json', token)).status, 400);
  const big = await req('POST', `/v1/sessions/${id}/commands`, { actionId: 'big-body-0001', pad: 'x'.repeat(20000) }, token).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);

  const ev = await req('GET', `/v1/sessions/${id}/events?after=0&limit=5`, undefined, token);
  assert.equal(ev.status, 200);
  assert.ok(ev.body.events.length <= 5);
  assert.equal((await req('GET', `/v1/sessions/${id}/history`, undefined, token)).body.history.length, 1);
});

test('SSE delivers the backlog after Last-Event-ID and then live events', async (t) => {
  const { app, req, base } = await startHttp();
  t.after(() => app.close());
  const { sessionId: id, token } = (await req('POST', '/v1/sessions', { worldRules: 'free' })).body;
  const first = (await req('GET', `/v1/sessions/${id}/events`, undefined, token)).body.lastSeq;

  const ctrl = new AbortController();
  const res = await fetch(`${base}/v1/sessions/${id}/events/stream`, { headers: { Authorization: 'Bearer ' + token, 'Last-Event-ID': String(first) }, signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const v = (await req('GET', `/v1/sessions/${id}/observation`, undefined, token)).body.observation.version;
  await req('POST', `/v1/sessions/${id}/commands`, { actionId: 'sse-start-0001', expectedVersion: v, type: 'start_season', args: {} }, token);
  let text = '';
  const dec = new TextDecoder();
  while (!/event: action\.result/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value);
  }
  ctrl.abort();
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
  assert.ok(ids.length > 0);
  assert.ok(ids.every((x) => x > first), 'nothing at or before Last-Event-ID is replayed');
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('SSE without a valid token is 401', async (t) => {
  const { app, req } = await startHttp();
  t.after(() => app.close());
  const { sessionId: id } = (await req('POST', '/v1/sessions', {})).body;
  assert.equal((await req('GET', `/v1/sessions/${id}/events/stream`)).status, 401);
});
