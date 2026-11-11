// Command processing in the authoritative room: envelopes, idempotency, versions, schemas, roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDirect } from './helpers.mjs';

test('create returns a token, an invite code and a v3 test session by default', () => {
  const { p } = newDirect();
  const b = p.created.body;
  assert.equal(b.role, 'controller');
  assert.match(b.token, /^ftf_[0-9a-f]{64}$/);
  assert.match(b.inviteCode, /^[0-9a-f]{16}$/);
  assert.equal(b.session.rules, 'v3');
  assert.equal(b.session.testSession, true);
  assert.equal(b.session.realMoney, false);
});

test('start_season then end_tick advance the engine and bump the version', () => {
  const { p } = newDirect({ worldRules: 'free' });
  const v0 = p.obs().version;
  const r = p.cmd('start_season', { phrase: 'quiet tide' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.version, v0 + 1);
  assert.equal(p.obs().season.phase, 'play');
  const t = p.obs().season.tick;
  assert.equal(p.cmd('end_tick').status, 200);
  assert.equal(p.obs().season.tick, t + 1);
});

test('the same actionId replays the stored result; reuse with other args is refused', () => {
  const { p } = newDirect({ worldRules: 'free' });
  const env = { actionId: 'idem-key-0001', expectedVersion: p.obs().version, type: 'start_season', args: {} };
  const a = p.raw(env);
  const b = p.raw(env);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(b.body.replayed, true);
  assert.equal(p.obs().version, a.body.version, 'replay must not apply twice');
  const c = p.raw({ ...env, type: 'end_tick' });
  assert.equal(c.status, 409);
  assert.equal(c.body.error.code, 'idempotency_key_reused');
});

test('a stale expectedVersion is a 409 with the current version and changes nothing', () => {
  const { p } = newDirect({ worldRules: 'free' });
  p.cmd('start_season');
  const v = p.obs().version;
  const r = p.raw({ actionId: 'stale-0000001', expectedVersion: v - 1, type: 'end_tick', args: {} });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'version_conflict');
  assert.equal(r.body.error.currentVersion, v);
  assert.equal(p.obs().version, v);
});

test('malformed envelopes and args are 400 with precise errors', () => {
  const { p } = newDirect();
  const v = p.obs().version;
  assert.equal(p.raw({ expectedVersion: v, type: 'end_tick' }).body.error.code, 'invalid_request');
  assert.equal(p.raw({ actionId: 'short', expectedVersion: v, type: 'end_tick' }).body.error.code, 'invalid_request');
  assert.equal(p.raw({ actionId: 'no-version-1', type: 'end_tick' }).body.error.code, 'invalid_request');
  assert.equal(p.raw({ actionId: 'unknown-0001', expectedVersion: v, type: 'teleport' }).body.error.code, 'unknown_action');
  const bad = p.raw({ actionId: 'bad-args-0001', expectedVersion: v, type: 'mend', args: { clan: 'iris', extra: 1 } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'invalid_params');
  assert.ok(bad.body.error.errors.some((e) => e.path === 'clan'));
  assert.ok(bad.body.error.errors.some((e) => e.path === 'extra'));
});

test('planned actions answer 501 and are listed as planned in the catalog', () => {
  const { api, p } = newDirect();
  const r = p.cmd('propose_trade', {});
  assert.equal(r.status, 501);
  assert.equal(r.body.error.code, 'not_implemented');
  const cat = api.catalog().body;
  const planned = cat.actions.filter((a) => a.status === 'planned').map((a) => a.type);
  assert.deepEqual(planned.sort(), ['cancel_order', 'chat', 'helper_contribute', 'mint_final_card', 'propose_trade']);
  assert.ok(cat.actions.filter((a) => a.status === 'implemented').every((a) => a.backedBy));
});

test('proximity: contributing away from the Scroll is rejected (422), stored, and nothing changes', () => {
  const { p } = newDirect();
  p.cmd('start_season');
  const before = p.obs();
  const env = { actionId: 'contrib-far-01', expectedVersion: before.version, type: 'contribute_fragment', args: {} };
  const r = p.raw(env);
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'action_rejected');
  assert.equal(r.body.error.reason, 'not_near');
  assert.equal(p.obs().version, before.version);
  assert.deepEqual(p.obs().scroll, before.scroll);
  assert.equal(p.raw(env).body.replayed, true);
});

test('engine guards come from the engine: end_tick before start_season is rejected by rules', () => {
  const { p } = newDirect();
  const r = p.cmd('end_tick');
  assert.equal(r.status, 422);
  assert.equal(r.body.error.source, 'rules');
});

test('helpers join with the invite code and may not run rules actions', () => {
  const { api, p } = newDirect();
  const wrong = api.join(p.id, { inviteCode: '0000000000000000' });
  assert.equal(wrong.status, 403);
  const j = api.join(p.id, { inviteCode: p.created.body.inviteCode, name: 'Ada' });
  assert.equal(j.status, 201);
  assert.equal(j.body.role, 'helper');
  const v = api.observe(p.id, j.body.token).body.observation.version;
  const r = api.command(p.id, j.body.token, { actionId: 'helper-start-1', expectedVersion: v, type: 'start_season', args: {} });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'forbidden');
  const mv = api.command(p.id, j.body.token, { actionId: 'helper-move-01', expectedVersion: v, type: 'move', args: { to: 'scroll' } });
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
});

test('the room is full at four members; leaving revokes the token', () => {
  const { api, p } = newDirect();
  const code = p.created.body.inviteCode;
  const tokens = [1, 2, 3].map(() => api.join(p.id, { inviteCode: code }).body.token);
  assert.equal(api.join(p.id, { inviteCode: code }).status, 409);
  assert.equal(api.leave(p.id, tokens[0]).status, 200);
  assert.equal(api.observe(p.id, tokens[0]).status, 401);
});

test('available actions carry concrete args and the failing preconditions', () => {
  const { p } = newDirect();
  const acts = p.actions();
  assert.ok(acts.find((a) => a.type === 'start_season' && a.available));
  const c = acts.find((a) => a.type === 'contribute_fragment');
  assert.equal(c.available, false);
  assert.ok(c.failed.some((f) => f.id === 'near_scroll'));
  assert.ok(p.obs().availableActions.every((a) => a.type && a.args));
});

test('history records every command; proofs are published only after a reveal and verify', () => {
  const { api, p } = newDirect({ worldRules: 'free' });
  p.cmd('start_season');
  assert.equal(api.proof(p.id, p.token, 0).status, 403);
  let ticks = 0;
  while (!p.obs().chronicle.length && ticks < 10) { p.cmd('end_tick'); ticks++; }
  const chron = p.obs().chronicle;
  assert.ok(chron.length >= 1);
  const pr = api.proof(p.id, p.token, chron[0].index);
  assert.equal(pr.status, 200);
  assert.equal(pr.body.proof.verified, true);
  const h = api.history(p.id, p.token).body.history;
  assert.deepEqual(h.map((x) => x.type), ['start_season', ...Array(ticks).fill('end_tick')]);
});
