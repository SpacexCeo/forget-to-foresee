// Season replay links (src/net/replay.js): a played season packs into one URL parameter and replays to the same end
// state in a fresh room; the judge season's replayed root equals the root committed on NEAR testnet (deployment
// record); a non-judge season says "not committed"; bad links are rejected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../src/net/api.js';
import { demoRandomBytes } from '../../src/net/near-season.js';
import { NEAR_DEPLOYMENT } from '../../src/net/near-deployment.js';
import { replayCommands, encodeReplay, decodeReplay, runReplay, rootCheck, replayLink, REPLAY_PREFIX } from '../../src/net/replay.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';

/** Plays a season the way the 3D client does (local room, seed-derived salts), with some world noise in between. */
function play(seedHex, phrase = '') {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(seedHex) });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex }).body;
  let n = 0;
  const obs = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => api.command(sessionId, token, { actionId: `orig-${++n}-x`, expectedVersion: obs().version, type, args });
  cmd('start_season', phrase ? { phrase } : {});
  cmd('move', { to: 'scroll' });
  for (let i = 0; i < 3; i++) cmd('end_tick');
  cmd('place_anchor', { shell: 9, tick: 2 }); // rejected: never part of the replay
  cmd('sacrifice_memory', { memoryId: obs().memories.find((m) => m.kind === 'call').id });
  for (let g = 0; g < 80 && obs().season.phase !== 'end'; g++) {
    const t = obs().availableActions.map((a) => a.type);
    if (t.includes('end_tick')) cmd('end_tick'); else if (t.includes('cast_vote')) cmd('cast_vote', { accept: true }); else if (t.includes('set_heir')) cmd('set_heir', { heir: false }); else { const d = obs().availableActions.find((a) => a.type === 'decline_offer'); if (!d) break; cmd('decline_offer', d.args); }
  }
  return { final: obs(), history: api.history(sessionId, token).body.history };
}

test('judge season: the link replays to the same end state and the root equals the one committed on NEAR', () => {
  const { final, history } = play(JUDGE_SEED);
  const commands = replayCommands(history);
  assert.ok(commands.length > 10);
  assert.ok(commands.every(([t]) => t !== 'move'), 'world actions are not needed');
  const param = encodeReplay({ seedHex: JUDGE_SEED, rules: 'v3', commands });
  assert.ok(param.startsWith(REPLAY_PREFIX) && /^[A-Za-z0-9._-]+$/.test(param), 'URL-safe');
  const r = runReplay(decodeReplay(param));
  assert.equal(r.ok, true);
  assert.equal(r.applied, commands.length);
  for (const k of ['seasonId', 'merkleRoot', 'tick', 'phase', 'outcome']) assert.equal(r.season[k], final.season[k] ?? null, k);
  assert.equal(r.season.silk, final.iris.silk);
  assert.deepEqual(r.obs.chronicle, final.chronicle);
  assert.equal(r.season.seasonId, '793f6c05e89839f2');
  assert.equal(rootCheck(r), 'match');
  assert.equal(r.committed.scheduleRoot, NEAR_DEPLOYMENT.seasons['793f6c05e89839f2'].scheduleRoot);
  assert.match(replayLink('https://spacexceo.github.io/forget-to-foresee/?demo=judge#x', { seedHex: JUDGE_SEED, commands }), /^https:\/\/spacexceo\.github\.io\/forget-to-foresee\/\?replay=r1\./);
});

test('another seed: replays the same way, and says it was never committed on NEAR', () => {
  const seed = '0123456789abcdef0123456789abcdef';
  const { final, history } = play(seed, 'ключ ✓');
  const r = runReplay(decodeReplay(encodeReplay({ seedHex: seed, commands: replayCommands(history) })));
  assert.equal(r.ok, true);
  assert.equal(r.season.merkleRoot, final.season.merkleRoot);
  assert.equal(r.season.outcome, final.season.outcome ?? null);
  assert.equal(rootCheck(r), 'not-committed');
  assert.equal(r.committed, null);
});

test('bad links are rejected: wrong prefix, bad seed, unknown or world commands, too many, garbage', () => {
  const ok = { seedHex: JUDGE_SEED, rules: 'v3', commands: [['start_season', {}]] };
  assert.ok(decodeReplay(encodeReplay(ok)));
  assert.equal(decodeReplay('x' + encodeReplay(ok)), null);
  assert.equal(decodeReplay(encodeReplay({ ...ok, seedHex: 'zz' })), null);
  assert.equal(decodeReplay(encodeReplay({ ...ok, commands: [['move', { to: 'scroll' }]] })), null);
  assert.equal(decodeReplay(encodeReplay({ ...ok, commands: [['drop_tables', {}]] })), null);
  assert.equal(decodeReplay(encodeReplay({ ...ok, rules: 'v9' })), null);
  assert.equal(decodeReplay(encodeReplay({ ...ok, commands: Array(401).fill(['end_tick', {}]) })), null);
  assert.equal(decodeReplay(REPLAY_PREFIX + '!!!'), null);
  assert.equal(decodeReplay(null), null);
});

test('replay strings exist in all five locales and never claim a check for an uncommitted season', async () => {
  const { PLAY_MESSAGES } = await import('../../src/play/i18n.js');
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('replay.'));
  assert.ok(keys.length >= 24);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  assert.match(PLAY_MESSAGES.en['replay.check.not-committed'], /never committed/);
});
