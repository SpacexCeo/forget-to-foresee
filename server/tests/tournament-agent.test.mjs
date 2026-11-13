// Agents in the Season Cup (sprint 7.9, 7.11): enter_tournament through the public command endpoint, idempotency,
// already_entered, bad_name, bad_driver, entry_limit, no_open_season, version_conflict, the catalogue lists the
// action, GET /v1/tournament's shape, an agents-only cup seals with scores, the OpenAPI file documents it all, and the
// example client exits with every agent on the leaderboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startHttp, seededBytes } from './helpers.mjs';

const enter = (req, s, args, n = 1, extra = {}) => req('POST', `/v1/sessions/${s.sessionId}/commands`, { actionId: `cup-${s.sessionId}-${n}`, expectedVersion: s.version, type: 'enter_tournament', args, ...extra }, s.token);
const newSession = async (req, name = 'cup-test') => (await req('POST', '/v1/sessions', { rules: 'v3', timeScale: 500, name })).body;
const ENTRANT_KEYS = ['id', 'account', 'name', 'kind', 'driver', 'model', 'owner', 'enteredAt', 'score'];

test('cup: an agent enters with no human; the same key replays the same answer; the catalogue lists the action', async () => {
  const { app, req } = await startHttp({ registry: { seasonRandomBytes: seededBytes(3) } });
  try {
    const cat = await req('GET', '/v1/actions');
    const def = cat.body.actions.find((a) => a.type === 'enter_tournament');
    assert.ok(def, 'listed'); assert.deepEqual(def.params.required, ['season_id', 'name', 'driver']);
    const cup = (await req('GET', '/v1/tournament')).body;
    assert.deepEqual(Object.keys(cup).sort(), ['entrants', 'leaderboard', 'ok', 'sealedAt', 'season']);
    assert.equal(cup.season.status, 'enrolling'); assert.equal(cup.entrants.length, 0);
    const s = await newSession(req);
    const r = await enter(req, s, { season_id: cup.season.id, name: 'Scribe-7', driver: 'scripted', model: null });
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.settlement, 'simulation', 'honest: nothing on chain');
    assert.deepEqual(Object.keys(r.body.result.entrant), ENTRANT_KEYS);
    assert.equal(r.body.result.entrant.kind, 'agent'); assert.equal(r.body.result.entrant.driver, 'scripted'); assert.equal(r.body.result.entrant.model, null);
    assert.equal(r.body.events[0].type, 'tournament_entered');
    const again = await enter(req, s, { season_id: cup.season.id, name: 'Scribe-7', driver: 'scripted', model: null });
    assert.equal(again.status, 200); assert.equal(again.body.replayed, true); assert.equal(again.body.result.entrant.id, r.body.result.entrant.id);
    assert.equal((await enter(req, s, { season_id: cup.season.id, name: 'Other', driver: 'scripted' })).body.error.code, 'idempotency_key_reused');
    const llm = await enter(req, s, { season_id: cup.season.id, name: 'Qwen Scout', driver: 'llm', model: 'Qwen/Qwen3-VL-30B-A3B-Instruct' }, 2);
    assert.equal(llm.body.result.entrant.model, 'Qwen/Qwen3-VL-30B-A3B-Instruct');
    const after = (await req('GET', '/v1/tournament')).body;
    assert.equal(after.entrants.length, 2); assert.ok(after.entrants.every((e) => e.kind === 'agent'));
  } finally { await app.close(); }
});

test('cup: refusals carry a code and never record an entry', async () => {
  const { app, req } = await startHttp({ registry: { seasonRandomBytes: seededBytes(4) } });
  try {
    const id = (await req('GET', '/v1/tournament')).body.season.id;
    const s = await newSession(req);
    const ok = { season_id: id, name: 'A1', driver: 'scripted' };
    assert.equal((await enter(req, s, { ...ok, name: '' }, 1)).body.error.code, 'bad_name');
    assert.equal((await enter(req, s, { ...ok, name: 'x'.repeat(21) }, 2)).body.error.code, 'bad_name');
    assert.equal((await enter(req, s, { ...ok, name: 'Bad<name>' }, 3)).body.error.code, 'bad_name');
    assert.equal((await enter(req, s, { ...ok, driver: 'human' }, 4)).body.error.code, 'bad_driver');
    assert.equal((await enter(req, s, { ...ok, driver: 'llm' }, 5)).body.error.code, 'bad_driver', 'an llm names its model');
    assert.equal((await enter(req, s, { ...ok, season_id: 'nope' }, 6)).status, 404);
    assert.equal((await enter(req, s, ok, 7, { expectedVersion: s.version + 5 })).body.error.code, 'version_conflict');
    assert.equal((await req('POST', `/v1/sessions/${s.sessionId}/commands`, { actionId: 'cup-x-0001', expectedVersion: s.version, type: 'enter_tournament', args: ok }, 'wrongtoken')).status, 401);
    assert.equal((await req('GET', '/v1/tournament')).body.entrants.length, 0, 'nothing recorded so far');
    assert.equal((await enter(req, s, ok, 8)).status, 200);
    assert.equal((await enter(req, s, { ...ok, name: 'a1' }, 9)).body.error.code, 'already_entered');
    for (const [n, name] of [[10, 'A2'], [11, 'A3'], [12, 'A4']]) assert.equal((await enter(req, s, { ...ok, name }, n)).status, 200);
    const lim = await enter(req, s, { ...ok, name: 'A5' }, 13);
    assert.equal(lim.status, 429); assert.equal(lim.body.error.code, 'entry_limit');
    assert.equal((await req('GET', '/v1/tournament?season_id=zzz')).status, 404);
  } finally { await app.close(); }
});

test('cup: an agents-only cup runs, scores and seals (the example client, three agents, exits clean)', async () => {
  const { app, base, req } = await startHttp({ registry: { seasonRandomBytes: seededBytes(5), maxTimeScale: 1000 } });
  try {
    const { runCup } = await import('../examples/agent-tournament.mjs');
    const { results, cup } = await runCup({ url: base, agents: 3, timeScale: 1000 });
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.outcome), 'every season ended');
    assert.equal(cup.season.status, 'sealed'); assert.ok(cup.sealedAt);
    assert.equal(cup.leaderboard.length, 3);
    assert.deepEqual(cup.leaderboard.map((r) => r.rank), [1, 2, 3]);
    assert.ok(cup.leaderboard.every((r) => r.kind === 'agent' && Number.isFinite(r.score)));
    for (let i = 1; i < 3; i++) assert.ok(cup.leaderboard[i - 1].score >= cup.leaderboard[i].score, 'sorted by score');
    assert.equal((await enter(req, await newSession(req), { season_id: cup.season.id, name: 'Late', driver: 'scripted' })).body.error.code, 'no_open_season', 'a sealed cup takes no entries');
  } finally { await app.close(); }
});

test('cup: OpenAPI documents the action, the route and the entrant schema', () => {
  const y = readFileSync(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
  assert.match(y, /\/v1\/tournament:/); assert.match(y, /enter_tournament/);
  for (const k of ['Entrant:', 'Tournament:', 'already_entered', 'entry_limit', 'bad_driver', 'no_open_season']) assert.ok(y.includes(k), k);
  for (const k of ENTRANT_KEYS) assert.ok(new RegExp(`\\n\\s+${k}:`).test(y.slice(y.indexOf('Entrant:'))), `Entrant.${k}`);
});
