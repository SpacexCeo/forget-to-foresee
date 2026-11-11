// Foresight Exchange over HTTP (docs/agent-market-plan.md Scope A): the catalog lists the actions, orders go through
// the same envelope (409 on a stale version, replay on a reused actionId, 422 on no_silk), the observation never
// shows an unpublished bar, HTTP equals in-process, and the example agent finishes a drill with no rejections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDirect, startHttp, seededBytes } from './helpers.mjs';
import { playDrill } from '../examples/exchange-agent.mjs';

test('catalog lists the exchange actions; HTTP place_order, 409, replay and 422 no_silk; no future mids', async (t) => {
  const { app, req } = await startHttp();
  t.after(() => app.close());
  const cat = (await req('GET', '/v1/actions')).body;
  assert.equal(cat.catalogVersion, '1.1.0');
  const kinds = Object.fromEntries(cat.actions.map((a) => [a.type, a.kind + ':' + a.status]));
  assert.equal(kinds.start_exchange, 'exchange:implemented');
  assert.equal(kinds.place_order, 'exchange:implemented');
  assert.equal(kinds.advance_exchange_bar, 'exchange:implemented');
  assert.equal(kinds.cancel_order, 'exchange:planned');
  const c = (await req('POST', '/v1/sessions', { rules: 'v3', timeScale: 1000 })).body;
  const obs = async () => (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation;
  const send = async (actionId, type, args, version) => req('POST', `/v1/sessions/${c.sessionId}/commands`, { actionId, expectedVersion: version ?? (await obs()).version, type, args }, c.token);
  assert.equal((await send('x-start-0001', 'start_exchange', { startIndex: 0, barCount: 4 })).status, 200);
  const v = (await obs()).version;
  const ok = await send('x-order-0001', 'place_order', { echo: 'amber', side: 'buy', qty: 5 }, v);
  assert.equal(ok.status, 200);
  assert.equal((await send('x-order-0002', 'place_order', { echo: 'amber', side: 'buy', qty: 1 }, v)).status, 409, 'stale version');
  const again = await send('x-order-0001', 'place_order', { echo: 'amber', side: 'buy', qty: 5 }, v);
  assert.equal(again.body.replayed, true, 'same actionId replays, no second fill');
  assert.equal((await obs()).exchange.you.positions.amber, 5);
  await send('x-order-0003', 'place_order', { echo: 'frost', side: 'buy', qty: 4 });
  const broke = await send('x-order-0004', 'place_order', { echo: 'salt', side: 'buy', qty: 5 });
  assert.equal(broke.status, 422);
  assert.equal(broke.body.error.reason, 'no_silk');
  const o = await obs();
  for (const e of o.exchange.echoes) assert.equal(e.history.length, o.exchange.bar, 'only published bars');
  assert.match(o.exchange.disclaimer, /no prizes, no real money, not financial advice/);
});

test('the same drill in-process and over HTTP gives identical observations and boards', async (t) => {
  const script = [['start_exchange', { startIndex: 7, barCount: 5 }], ['place_order', { echo: 'salt', side: 'buy', qty: 2 }], ['advance_exchange_bar', {}], ['place_order', { echo: 'salt', side: 'sell', qty: 1 }], ['advance_exchange_bar', {}], ['advance_exchange_bar', {}], ['advance_exchange_bar', {}], ['advance_exchange_bar', {}]];
  const { p } = newDirect({ rules: 'v3', worldRules: 'free', seedHex: '0123456789abcdef0123456789abcdef' }, { seasonRandomBytes: seededBytes(4) });
  const { app, req } = await startHttp({ registry: { seasonRandomBytes: seededBytes(4) } });
  t.after(() => app.close());
  const c = (await req('POST', '/v1/sessions', { rules: 'v3', worldRules: 'free', seedHex: '0123456789abcdef0123456789abcdef' })).body;
  for (const [i, [type, args]] of script.entries()) {
    const d = p.cmd(type, args);
    const v = (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation.version;
    const h = await req('POST', `/v1/sessions/${c.sessionId}/commands`, { actionId: 'xeq-step-00' + i, expectedVersion: v, type, args }, c.token);
    assert.equal(h.status, d.status, type);
  }
  const hx = (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation.exchange;
  assert.deepEqual(hx, p.obs().exchange);
  assert.equal(hx.phase, 'settled');
});

test('the example exchange agent finishes a drill over HTTP with no rejections and never sees a future bar', async (t) => {
  const { app, base } = await startHttp();
  t.after(() => app.close());
  const r = await playDrill({ url: base, startIndex: 12, barCount: 4 });
  assert.equal(r.rejected, 0);
  assert.equal(r.peekedFuture, false);
  assert.equal(r.scores.length, 4);
  assert.match(r.hash, /^[0-9a-f]{64}$/);
});
