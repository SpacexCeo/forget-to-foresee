// Remote feature flags (src/features.js, a reference game teardown M8): defaults off, a remote file merges only known names
// with real booleans, failures (offline, timeout, bad JSON, HTTP error) keep the defaults, the source is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeatures, mergeFlags, DEFAULT_FLAGS } from '../../src/features.js';

const ok = (body) => async () => ({ ok: true, json: async () => body });

// The owner switched the sprint features and account sign-in on for the live page on 13 Nov (docs/decisions.md).
const LIVE_ON = new Set(['questJournal', 'questTracker', 'autoWalk', 'starterGuide', 'rpgHud', 'skillTree', 'hotbar', 'marketplace', 'lootFx',
  'playGames', 'silkView', 'newPlayerIntro', 'labPrologue', 'agentTournament', 'firstSeenTips', 'accountLogin']);
test('flags: every feature is off by default in code except the layer itself; the shipped file turns on only the live set', () => {
  for (const [k, v] of Object.entries(DEFAULT_FLAGS)) assert.equal(v, k === 'flags', k);
  const file = JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8'));
  for (const [k, v] of Object.entries(file.flags)) { assert.ok(k in DEFAULT_FLAGS, k); assert.equal(v, LIVE_ON.has(k), k); }
});

test('flags: merge keeps only known names and real booleans ("true" is not true)', () => {
  const m = mergeFlags({ flags: { damageNumbers: true, loadRitual: 'true', register: 1, mystery: true } });
  assert.equal(m.damageNumbers, true);
  assert.equal(m.loadRitual, false);
  assert.equal(m.register, false);
  assert.equal('mystery' in m, false);
  assert.equal(mergeFlags({ damageNumbers: true }).damageNumbers, true, 'a flat object works too');
  assert.deepEqual(mergeFlags(null), { ...DEFAULT_FLAGS });
  assert.deepEqual(mergeFlags([1, 2]), { ...DEFAULT_FLAGS });
});

test('flags: a remote file turns things on; the source becomes remote; listeners hear it', async () => {
  const f = createFeatures({ url: '/features.json', fetch: ok({ flags: { damageNumbers: true, flags: false } }) });
  assert.equal(f.on('damageNumbers'), false, 'defaults until it answers');
  let heard = null; f.subscribe((x) => { heard = x; });
  await f.load();
  assert.equal(f.on('damageNumbers'), true);
  assert.equal(f.on('flags'), false, 'even the layer can be switched off');
  assert.equal(f.source, 'remote');
  assert.equal(heard.damageNumbers, true);
  assert.equal(f.on('unknown'), false);
});

test('flags: offline, HTTP error, bad JSON and a timeout keep the defaults', async () => {
  const cases = [async () => { throw new Error('offline'); }, async () => ({ ok: false, json: async () => ({}) }), async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }), () => new Promise(() => {})];
  for (const fetch of cases) {
    const f = createFeatures({ url: '/f', fetch, timeoutMs: 50 });
    await f.load();
    assert.equal(f.source, 'default');
    assert.deepEqual(f.all(), { ...DEFAULT_FLAGS });
  }
});
