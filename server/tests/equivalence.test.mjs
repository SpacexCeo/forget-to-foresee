// The HTTP server and the in-process API give identical results for identical requests: there is
// one authoritative implementation, the transport only adds auth headers and limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDirect, startHttp, seededBytes } from './helpers.mjs';

const SCRIPT = [
  ['start_season', { phrase: 'same phrase' }],
  ['set_reading_rule', { rule: 'dots' }],
  ['end_tick', {}], ['end_tick', {}],
  ['mend', { clan: 'ash' }],
  ['end_tick', {}],
  ['contribute_fragment', {}],
  ['end_tick', {}], ['end_tick', {}],
];
// ownerKeyCommitment is salted with fresh CSPRNG bytes at start_season on purpose, so it differs.
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (['id', 'sessionId', 'simTime', 'at', 'arriveAt', 'actionId', 'events', 'ownerKeyCommitment', 'commitment'].includes(k) ? undefined : v)));

test('direct and HTTP sessions with the same seed evolve identically', async (t) => {
  const opts = { rules: 'v3', worldRules: 'free', seedHex: '0123456789abcdef0123456789abcdef' };
  const { p } = newDirect(opts, { seasonRandomBytes: seededBytes(9) });
  const { app, req } = await startHttp({ registry: { seasonRandomBytes: seededBytes(9) } });
  t.after(() => app.close());
  const c = (await req('POST', '/v1/sessions', opts)).body;
  for (const [i, [type, args]] of SCRIPT.entries()) {
    const d = p.cmd(type, args);
    const v = (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation.version;
    const h = await req('POST', `/v1/sessions/${c.sessionId}/commands`, { actionId: 'eq-step-000' + i, expectedVersion: v, type, args }, c.token);
    assert.equal(h.status, d.status, `${type}: status`);
    assert.deepEqual(strip(h.body), strip(d.body), `${type}: body`);
  }
  const ho = (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation;
  const dobs = p.obs();
  for (const k of ['season', 'scroll', 'chronicle', 'proofs', 'iris', 'memories', 'relationships', 'dictionary']) assert.deepEqual(strip(ho[k]), strip(dobs[k]), k);
});
