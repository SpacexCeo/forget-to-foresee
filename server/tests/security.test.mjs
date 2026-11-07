// Redaction, secrets and abuse limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDirect, startHttp, seededBytes } from './helpers.mjs';

const SECRET_KEYS = ['seed', 'rng', 'truth', 'salt', 'perm', 'mastery', 'phrase', 'honest', 'valuation'];
function keysDeep(o, out = new Set()) {
  if (Array.isArray(o)) o.forEach((x) => keysDeep(x, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(k); keysDeep(v, out); }
  return out;
}

test('observations never contain hidden engine state', () => {
  const { p } = newDirect({ worldRules: 'free' });
  p.cmd('start_season', { phrase: 'the owner secret phrase' });
  for (let i = 0; i < 4; i++) p.cmd('end_tick');
  const o = p.obs();
  // The controller typed the owner phrase and is shown it back under iris.ownerKey; nothing else.
  assert.equal(o.iris.ownerKey.phrase, 'the owner secret phrase');
  delete o.iris.ownerKey.phrase;
  const keys = keysDeep(o);
  for (const k of SECRET_KEYS) assert.ok(![...keys].some((x) => x.toLowerCase() === k), `observation leaks key "${k}"`);
  assert.ok(!JSON.stringify(o).includes('the owner secret phrase'));
});

test('helpers see public state only; private events stay private', () => {
  const { api, p } = newDirect({ worldRules: 'free' });
  const j = api.join(p.id, { inviteCode: p.created.body.inviteCode }).body;
  p.cmd('start_season', { phrase: 'the owner phrase' });
  for (let i = 0; i < 3; i++) p.cmd('end_tick');
  const h = api.observe(p.id, j.token).body.observation;
  for (const k of ['iris', 'inventory', 'memories', 'offers', 'auctions', 'dictionary', 'log', 'logograms']) assert.equal(h[k], undefined, `helper sees ${k}`);
  assert.ok(h.prophecies.every((x) => !x.vision), 'helper sees a vision');
  const evs = api.events(p.id, j.token, 0, 1000).body.events;
  assert.ok(evs.every((e) => e.visibility === 'public'));
  const own = api.events(p.id, p.token, 0, 1000).body.events;
  assert.ok(own.some((e) => e.visibility === 'private'));
  assert.ok(!JSON.stringify(h).includes('the owner phrase') && !JSON.stringify(evs).includes('the owner phrase'));
  const hist = api.history(p.id, j.token).body.history;
  assert.ok(hist.filter((x) => x.playerId !== j.playerId).every((x) => x.actionId === undefined), 'helper sees the controller\'s idempotency keys');
});

test('a token of one session does not open another session', () => {
  const { api, p } = newDirect();
  const other = api.createSession({});
  assert.equal(api.observe(other.body.sessionId, p.token).status, 401);
});

test('client-chosen seeds can be disabled and are marked when allowed', () => {
  const { api } = newDirect();
  const ok = api.createSession({ rules: 'v2', seed: 42 });
  assert.equal(ok.body.session.clientChoseSeed, true);
  const strict = newDirect({}, { allowClientSeed: false }).api;
  assert.equal(strict.createSession({ seed: 42 }).status, 403);
});

test('rate limits answer 429 with Retry-After; logs never carry tokens', async (t) => {
  const lines = [];
  const { app, req } = await startHttp({ limits: { commands: { rate: 0.001, burst: 2 } }, log: (e) => lines.push(JSON.stringify(e)), registry: { seasonRandomBytes: seededBytes(5) } });
  t.after(() => app.close());
  const { sessionId: id, token } = (await req('POST', '/v1/sessions', {})).body;
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await req('POST', `/v1/sessions/${id}/commands`, { actionId: 'rl-test-000' + i, expectedVersion: 1, type: 'set_reading_rule', args: { rule: 'top' } }, token)).status);
  assert.deepEqual(statuses.slice(2), [429, 429]);
  const r = await req('POST', `/v1/sessions/${id}/commands`, {}, token);
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => !l.includes(token) && !l.includes('ftf_')));
});

test('the API exposes no wallet, signing or transfer routes', async (t) => {
  const { app, req } = await startHttp();
  t.after(() => app.close());
  for (const path of ['/v1/wallet', '/v1/sign', '/v1/transfer', '/v1/sessions/x/sign']) assert.equal((await req('POST', path, {})).status, 404);
  const cat = (await req('GET', '/v1/actions')).body;
  const mint = cat.actions.find((a) => a.type === 'mint_final_card');
  assert.equal(mint.status, 'planned');
  assert.equal(mint.kind, 'chain');
});
