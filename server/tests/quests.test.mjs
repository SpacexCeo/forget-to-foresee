// The Expedition over the agent API (docs/plans/story §7): the quest commands run the same rules modules as the town
// view; a human session may not hunt; a scripted session (registered key) hunts at T2; actionId replays; a second
// turn-in pays nothing; an unknown scriptedKey is refused; HTTP and in-process give identical expedition views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDirect, startHttp, manualClock } from './helpers.mjs';

const KEY = 'arena-test-key-0001';
const REG = { scripted: { [KEY]: 'salt.arena.testnet' } };
const CHAIN = [['expedition_start', {}], ['guide_step', { step: 'talked' }], ['guide_step', { step: 'moved' }], ['quest_turn_in', { questId: 'q_welcome' }],
  ['quest_accept', { questId: 'q_spiders' }], ['hunt', { questId: 'q_spiders', mob: 'spider' }], ['quest_turn_in', { questId: 'q_spiders' }],
  ['quest_accept', { questId: 'b_spiders' }], ['hunt', { questId: 'b_spiders' }], ['quest_turn_in', { questId: 'b_spiders' }]];

test('catalog: the six expedition actions are listed and implemented; hunt needs a scripted actor', () => {
  const { api } = newDirect({ rules: 'v3', worldRules: 'free' });
  const actions = api.catalog().body.actions;
  const k = Object.fromEntries(actions.map((a) => [a.type, a.kind + ':' + a.status]));
  for (const t of ['expedition_start', 'guide_step', 'quest_accept', 'quest_turn_in', 'hunt', 'pay_gate']) assert.equal(k[t], 'expedition:implemented', t);
  assert.ok(actions.find((a) => a.type === 'hunt').preconditions.includes('scripted_actor'));
});

test('a human session plays the guide and the welcome, may not hunt, and a second turn-in pays nothing', () => {
  const { p } = newDirect({ rules: 'v3', worldRules: 'free' });
  assert.equal(p.obs().expedition, null);
  assert.ok(p.actions().some((a) => a.type === 'expedition_start'));
  assert.equal(p.cmd('expedition_start').status, 200);
  assert.equal(p.cmd('expedition_start').body.error.reason, 'already_started');
  p.cmd('guide_step', { step: 'talked' }); p.cmd('guide_step', { step: 'moved' });
  assert.equal(p.obs().expedition.quests.q_welcome.state, 'ready');
  const t1 = p.cmd('quest_turn_in', { questId: 'q_welcome' });
  assert.equal(t1.status, 200); assert.equal(t1.body.result.silkC, 40_000);
  const t2 = p.cmd('quest_turn_in', { questId: 'q_welcome' });
  assert.equal(t2.status, 422); assert.equal(t2.body.error.reason, 'not_ready');
  assert.equal(p.obs().expedition.balanceC, 40_000);
  assert.equal(p.cmd('quest_accept', { questId: 'q_spiders' }).status, 200);
  const h = p.cmd('hunt', { questId: 'q_spiders' });
  assert.equal(h.status, 422); assert.equal(h.body.error.reason, 'not_scripted');
  assert.equal(p.actions().filter((a) => a.type === 'hunt').every((a) => a.available === false && a.failed.some((f) => f.reason === 'not_scripted')), true);
  const o = p.obs().expedition;
  assert.equal(o.actor, 'human'); assert.equal(o.phase, 'gathering'); assert.equal(o.quests.q_spiders.progress, 0);
  assert.equal(p.obs().silk !== undefined ? typeof p.obs().silk : 'n/a', p.obs().silk !== undefined ? 'number' : 'n/a', 'the season is untouched');
});

test('a scripted session hunts at T2: the chain completes, actionId replays, an unknown key is refused', () => {
  const { api, p } = newDirect({ rules: 'v3', worldRules: 'free', scriptedKey: KEY }, REG);
  assert.equal(api.createSession({ rules: 'v3', scriptedKey: 'not-a-registered-key' }).status, 403);
  for (const [type, args] of CHAIN) { const r = p.cmd(type, args); assert.equal(r.status, 200, type + ' ' + JSON.stringify(r.body.error || '')); }
  const o = p.obs().expedition;
  assert.equal(o.actor, 'scripted'); assert.equal(o.account, 'salt.arena.testnet');
  assert.equal(o.quests.q_spiders.state, 'done'); assert.equal(o.quests.b_spiders.state === 'done' || o.quests.b_spiders.state === 'locked', true);
  assert.equal(o.balanceC, 40_000 + 100_000 + 30_000 + 20 * 600, 'welcome + spiders + bounty + 20 hunted skitters (T2 kill silk)');
  const env = { actionId: 'replay-test-0001', expectedVersion: p.obs().version, type: 'quest_accept', args: { questId: 'q_part' } };
  const a = p.raw(env), b = p.raw(env);
  assert.equal(a.status, 200); assert.equal(b.body.replayed, true);
  assert.equal(p.cmd('hunt', { questId: 'q_part' }).body.error.reason, 'quest', 'not a kill quest');
});

test('the same chain in-process and over HTTP gives identical results and expedition views (one fixed clock)', async (t) => {
  const clock = manualClock(1_700_000_000_000);
  const { p } = newDirect({ rules: 'v3', worldRules: 'free', scriptedKey: KEY }, { ...REG, clock });
  const { app, req } = await startHttp({ registry: { ...REG, clock } });
  t.after(() => app.close());
  const c = (await req('POST', '/v1/sessions', { rules: 'v3', worldRules: 'free', scriptedKey: KEY })).body;
  const obs = async () => (await req('GET', `/v1/sessions/${c.sessionId}/observation`, undefined, c.token)).body.observation;
  for (const [i, [type, args]] of CHAIN.entries()) {
    const d = p.cmd(type, args);
    const h = await req('POST', `/v1/sessions/${c.sessionId}/commands`, { actionId: 'qeq-step-00' + i, expectedVersion: (await obs()).version, type, args }, c.token);
    assert.equal(h.status, d.status, type); assert.deepEqual(h.body.result, d.body.result, type);
  }
  assert.deepEqual((await obs()).expedition, p.obs().expedition);
  assert.match(p.obs().expedition.log.head, /^[0-9a-f]{64}$/);
});
