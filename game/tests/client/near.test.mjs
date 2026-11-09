// NEAR testnet slice (src/net/near*.js): the seed-derived commitment of fixed-seed demo seasons, the contract
// argument builder, the read-only RPC client against a mocked RPC, and the watcher that drives the
// "Committed on NEAR testnet ✓" badge. No network: every fetch here is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { createSeason } from '../../src/net/engine-host.js';
import { demoRandomBytes, seasonCommitment, contractArgs, canonicalEvent, COMMITMENT_SCHEMA } from '../../src/net/near-season.js';
import { createNearClient, createNearWatcher, compareSeason, leafArgs, explorerLinks, seasonBadge, leafBadge, NearError } from '../../src/net/near.js';
import { NEAR_DEPLOYMENT } from '../../src/net/near-deployment.js';
import { sha256, verifyProof } from '../../src/game/crypto.js';
import * as E from '../../src/game/engine.js';

// The judge demo season (game/src/main.js JUDGE_SEED). These constants are what the contract on testnet holds;
// if they change, every committed season on-chain stops matching the game (docs/near.md).
const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const JUDGE_SEASON_ID = '793f6c05e89839f2';
const JUDGE_ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const JUDGE_ASH_KEY = 'd1a397141934211d4673b7db523824988957b5d2d06b1ab050341a4b545d99b6';

const observe = async (tr) => (await tr.observe()).body.observation;
/** A live (unseeded) season after start_season: its id and root exist only once the seed protocol sealed it. */
async function startedSeason() {
  const tr = createLocalTransport({});
  const o = await observe(tr);
  const r = await tr.command({ actionId: 'near-live-start', expectedVersion: o.version, type: 'start_season', args: { nonce: 'test nonce' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (await observe(tr)).season;
}

test('demoRandomBytes: deterministic per seed, different across seeds, rejects a bad seed', () => {
  const a = demoRandomBytes(JUDGE_SEED), b = demoRandomBytes(JUDGE_SEED), c = demoRandomBytes('0'.repeat(32));
  const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');
  assert.equal(hex(a(8)), hex(b(8)));
  assert.equal(hex(a(40)), hex(b(40)), 'a draw across block boundaries agrees');
  assert.notEqual(hex(a(8)), hex(c(8)));
  assert.equal(a(0).length, 0);
  assert.throws(() => demoRandomBytes('zz'), /32 lowercase hex/);
  assert.throws(() => demoRandomBytes(JUDGE_SEED.toUpperCase()), /32 lowercase hex/);
});

test('fixed-seed local sessions reproduce the season id, root and Ash key; unseeded sessions do not', async () => {
  const s1 = (await observe(createLocalTransport({ seedHex: JUDGE_SEED }))).season;
  const s2 = (await observe(createLocalTransport({ seedHex: JUDGE_SEED }))).season;
  assert.equal(s1.rules, 'v3');
  assert.equal(s1.seasonId, JUDGE_SEASON_ID);
  assert.equal(s1.merkleRoot, JUDGE_ROOT);
  assert.equal(s1.ashKeyCommitment, JUDGE_ASH_KEY);
  assert.deepEqual([s2.seasonId, s2.merkleRoot, s2.ashKeyCommitment], [s1.seasonId, s1.merkleRoot, s1.ashKeyCommitment]);
  const other = (await observe(createLocalTransport({ seedHex: '0123456789abcdef0123456789abcdef' }))).season;
  assert.notEqual(other.seasonId, s1.seasonId);
  assert.notEqual(other.merkleRoot, s1.merkleRoot);
  const r1 = await startedSeason();
  const r2 = await startedSeason();
  assert.notEqual(r1.seasonId, r2.seasonId, 'a real season keeps the CSPRNG');
  assert.notEqual(r1.merkleRoot, r2.merkleRoot);
  const intro = (await observe(createLocalTransport({}))).season;
  assert.equal(intro.seasonId, null, 'before start_season a live season shows only the entropy commitment');
  assert.equal(intro.merkleRoot, null);
  assert.equal(intro.entropy.protocol, 'ftf-seed/1');
});

test('seasonCommitment: the contract arguments match the room and the game proof endpoint byte for byte', async () => {
  const { state } = createSeason({ rules: 'v3', seedHex: JUDGE_SEED, randomBytes: demoRandomBytes(JUDGE_SEED) });
  const c = seasonCommitment(state);
  assert.equal(c.seasonId, JUDGE_SEASON_ID);
  assert.equal(c.scheduleRoot, JUDGE_ROOT);
  assert.equal(c.schemaVersion, COMMITMENT_SCHEMA);
  assert.equal(c.leafCount, 15);
  assert.equal(c.ashKey.commitment, JUDGE_ASH_KEY);
  assert.match(c.ashKey.salt, /^[0-9a-f]{64}$/);
  for (const l of c.leaves) {
    assert.match(l.salt, /^[0-9a-f]{64}$/);
    assert.match(l.canonicalEvent, /^\{"t":\d+,"place":[0-3],"action":[0-3],"power":[0-3],"delay":[1-4],"dots":[0-3]\}$/);
    assert.equal(l.leaf, sha256(`ftf:leaf:v2|${c.seasonId}|${l.index}|${l.canonicalEvent}|${l.salt}`));
    assert.ok(verifyProof(l.leaf, l.path, c.scheduleRoot));
  }
  // The same season through the local transport: reveal ticks until a proof exists and compare with the endpoint.
  const tr = createLocalTransport({ seedHex: JUDGE_SEED });
  await tr.command({ actionId: 'near-test-start', expectedVersion: (await observe(tr)).version, type: 'start_season', args: {} });
  for (let i = 0; i < 3; i++) {
    const o = await observe(tr);
    const r = await tr.command({ actionId: 'near-test-end-' + i, expectedVersion: o.version, type: 'end_tick', args: {} });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const obs = await observe(tr);
  assert.ok(obs.proofs.length >= 1, 'trial 3 revealed a leaf');
  const idx = obs.proofs[0].index;
  const p = (await tr.proof(idx)).body.proof;
  const mine = c.leaves[idx];
  assert.deepEqual(leafArgs(p), { season_id: c.seasonId, index: idx, canonical_event: mine.canonicalEvent, salt: mine.salt, merkle_path: mine.path });
  assert.deepEqual(contractArgs(c).reveal_leaf[idx], leafArgs(p));
  const args = contractArgs(c);
  assert.deepEqual(args.commit_season, { season_id: JUDGE_SEASON_ID, schedule_root: JUDGE_ROOT, schema_version: 'v2', leaf_count: 15 });
  assert.deepEqual(args.commit_ash_key, { season_id: JUDGE_SEASON_ID, commitment: JUDGE_ASH_KEY });
  assert.equal(args.reveal_ash_key.phrase, state.pepelKey.phrase);
});

test('seasonCommitment: agrees with the committed contract vectors (rules v2) and rejects baseline seasons', () => {
  const v = JSON.parse(readFileSync(new URL('../../../contracts/season-commit/tests/vectors.json', import.meta.url), 'utf8'));
  const first = v.seasons[0];
  // Rebuild vector season 0 with the vector generator's byte source, then compare the commitment.
  let counter = 0; const pool = [];
  const detBytes = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { if (!pool.length) { const h = sha256(`ftf-vectors|season-${first.seed}|${counter++}`); for (let j = 0; j < 64; j += 2) pool.push(parseInt(h.slice(j, j + 2), 16)); } out[i] = pool.shift(); } return out; };
  const S = E.newSeason(first.seed, { rules: 'v2', randomBytes: detBytes });
  const c = seasonCommitment(S);
  assert.equal(c.seasonId, first.seasonId);
  assert.equal(c.scheduleRoot, first.scheduleRoot);
  assert.deepEqual(c.leaves.map((l) => ({ index: l.index, canonicalEvent: l.canonicalEvent, salt: l.salt, leaf: l.leaf, path: l.path })), first.leaves);
  assert.equal(canonicalEvent(S.events[0]), first.leaves[0].canonicalEvent);
  const base = E.newSeason(7, { rules: 'baseline-2d-1' });
  assert.throws(() => seasonCommitment(base), /no commitment/);
});

/* ---------- a fake NEAR RPC ---------- */

const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
const decodeArgs = (params) => JSON.parse(Buffer.from(params.args_base64, 'base64').toString('utf8'));

/** fetch(url, init) that answers JSON-RPC view calls from `views[method](args)`; `failUrls` throw like a dead host. */
function fakeRpc({ views = {}, failUrls = [], http = null, log = [] } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, method: body.params && body.params.method_name, args: body.params && decodeArgs(body.params) });
    if (failUrls.includes(url)) throw new TypeError('fetch failed');
    if (http) return { ok: false, status: http, json: async () => ({}) };
    const name = body.params.method_name;
    if (body.params.account_id === 'missing.testnet') return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT' }, code: -32000, message: 'Server error', data: 'account missing.testnet does not exist while viewing' } }) };
    if (!views[name]) return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { error: `wasm execution failed with error: MethodResolveError(MethodNotFound)`, logs: [], block_height: 1, block_hash: 'h' } }) };
    const value = views[name](decodeArgs(body.params));
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { result: value === null ? enc(null) : enc(value), logs: [], block_height: 276786815, block_hash: '4GRfGvhHpggr2HYF4mLttWAhLHQ4HS8NKKwTEkfPLVqs' } }) };
  };
}

const SEASON_VIEW = {
  season_id: JUDGE_SEASON_ID, schema_version: 'v2', schedule_root: JUDGE_ROOT, leaf_count: 15, committed_by: 'coordinator.testnet',
  committed_at_ns: '1762600000000000000', committed_at_block: '276700000', revealed_count: 15, ash_key_committed: true,
};
const DEPLOY = {
  network: 'testnet', contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example', 'https://b.example'], explorer: 'https://testnet.nearblocks.io',
  seasons: { [JUDGE_SEASON_ID]: { seedHex: JUDGE_SEED, scheduleRoot: JUDGE_ROOT, commitTx: 'CommitTxHash', ashKeyTx: 'AshTxHash', revealTx: { 0: 'Reveal0Hash' } } },
};

test('near client: view calls encode args as base64 JSON, decode byte results, surface contract errors with a code', async () => {
  const log = [];
  const fetch = fakeRpc({ views: { get_season: (a) => (a.season_id === JUDGE_SEASON_ID ? SEASON_VIEW : null), get_coordinators: () => ['coordinator.testnet'] }, log });
  const near = createNearClient({ contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example'], fetch });
  assert.deepEqual(await near.getSeason(JUDGE_SEASON_ID), SEASON_VIEW);
  assert.equal(await near.getSeason('0000000000000000'), null);
  assert.deepEqual(await near.getCoordinators(), ['coordinator.testnet']);
  assert.deepEqual(log[0], { url: 'https://a.example', method: 'get_season', args: { season_id: JUDGE_SEASON_ID } });
  const body = JSON.parse((await (async () => { let b; await createNearClient({ contractId: 'x.testnet', rpcUrls: ['https://a.example'], fetch: async (u, i) => { b = i.body; return { ok: true, json: async () => ({ result: { result: enc(1) } }) }; } }).view('m', { k: 1 }); return b; })()));
  assert.equal(body.method, 'query');
  assert.equal(body.params.request_type, 'call_function');
  assert.equal(body.params.finality, 'final');
  assert.equal(Buffer.from(body.params.args_base64, 'base64').toString(), '{"k":1}');
  await assert.rejects(near.view('no_such_method'), (e) => e instanceof NearError && e.code === 'CONTRACT_EXECUTION_ERROR');
  const missing = createNearClient({ contractId: 'missing.testnet', rpcUrls: ['https://a.example'], fetch });
  await assert.rejects(missing.getSeason(JUDGE_SEASON_ID), (e) => e instanceof NearError && e.code === 'UNKNOWN_ACCOUNT');
  assert.throws(() => createNearClient({ contractId: null }), /contractId/);
});

test('near client: a dead RPC host falls through to the next one; all dead → NETWORK; HTTP errors too', async () => {
  const log = [];
  const fetch = fakeRpc({ views: { get_season: () => SEASON_VIEW }, failUrls: ['https://a.example'], log });
  const near = createNearClient({ contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example', 'https://b.example'], fetch });
  assert.deepEqual(await near.getSeason(JUDGE_SEASON_ID), SEASON_VIEW);
  assert.deepEqual(log.map((l) => l.url), ['https://a.example', 'https://b.example']);
  await near.getSeason(JUDGE_SEASON_ID);
  assert.equal(log[2].url, 'https://b.example', 'sticks with the host that answered');
  const dead = createNearClient({ contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example'], fetch: fakeRpc({ failUrls: ['https://a.example'] }) });
  await assert.rejects(dead.getSeason(JUDGE_SEASON_ID), (e) => e instanceof NearError && e.code === 'NETWORK');
  const http = createNearClient({ contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example'], fetch: fakeRpc({ http: 503 }) });
  await assert.rejects(http.getSeason(JUDGE_SEASON_ID), (e) => e instanceof NearError && e.code === 'NETWORK');
});

test('near client: a hanging RPC is aborted after timeoutMs and the next host is tried', async () => {
  const fetch = async (url, init) => {
    if (url === 'https://a.example') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return fakeRpc({ views: { get_season: () => SEASON_VIEW } })(url, init);
  };
  const near = createNearClient({ contractId: 'ftf-seasons.testnet', rpcUrls: ['https://a.example', 'https://b.example'], fetch, timeoutMs: 20 });
  assert.deepEqual(await near.getSeason(JUDGE_SEASON_ID), SEASON_VIEW);
});

test('compareSeason, explorerLinks and the badge models', () => {
  assert.equal(compareSeason({ merkleRoot: JUDGE_ROOT, leafCount: 15 }, SEASON_VIEW), 'committed');
  assert.equal(compareSeason({ merkleRoot: JUDGE_ROOT, leafCount: null }, SEASON_VIEW), 'committed', 'the observation carries no leaf count');
  assert.equal(compareSeason({ merkleRoot: 'ff' + JUDGE_ROOT.slice(2), leafCount: 15 }, SEASON_VIEW), 'mismatch');
  assert.equal(compareSeason({ merkleRoot: JUDGE_ROOT, leafCount: 14 }, SEASON_VIEW), 'mismatch');
  assert.equal(compareSeason({ merkleRoot: JUDGE_ROOT }, null), 'mismatch');
  const links = explorerLinks(DEPLOY, { txHash: 'T', accountId: 'a.testnet' });
  assert.deepEqual(links, { contract: 'https://testnet.nearblocks.io/address/ftf-seasons.testnet', account: 'https://testnet.nearblocks.io/address/a.testnet', tx: 'https://testnet.nearblocks.io/txns/T' });
  assert.equal(explorerLinks({ ...DEPLOY, explorer: 'https://x.example/' }).contract, 'https://x.example/address/ftf-seasons.testnet');
  assert.equal(seasonBadge({ state: 'offline' }), null);
  assert.equal(seasonBadge(null), null);
  const st = { state: 'committed', contractUrl: 'C', commitTxUrl: 'T' };
  assert.deepEqual(seasonBadge(st), { kind: 'season', state: 'committed', labelKey: 'wh.sign.near.committed', tipKey: 'wh.sign.near.tip', href: 'T' });
  assert.equal(seasonBadge({ ...st, commitTxUrl: null }).href, 'C');
  assert.equal(leafBadge(st, null), null);
  assert.equal(leafBadge({ state: 'mismatch', contractUrl: 'C' }, { state: 'on-chain' }), null, 'no leaf badge when the season itself does not match');
  assert.deepEqual(leafBadge(st, { state: 'on-chain', txUrl: 'R' }), { kind: 'leaf', state: 'on-chain', labelKey: 'wh.sign.near.leaf', tipKey: 'wh.sign.near.tip', href: 'R' });
  assert.equal(leafBadge(st, { state: 'dry-run' }).labelKey, 'wh.sign.near.dryrun');
  assert.equal(leafBadge(st, { state: 'mismatch' }).labelKey, 'wh.sign.near.mismatch');
  for (const s of ['unknown', 'checking', 'missing', 'offline']) assert.equal(leafBadge(st, { state: s }), null, s);
});

/** A judge season played to its first reveal, plus the matching proof record. */
async function playedJudgeSession() {
  const tr = createLocalTransport({ seedHex: JUDGE_SEED });
  let obs = await observe(tr);
  await tr.command({ actionId: 'near-play-start', expectedVersion: obs.version, type: 'start_season', args: {} });
  for (let i = 0; i < 3; i++) { obs = await observe(tr); await tr.command({ actionId: 'near-play-end-' + i, expectedVersion: obs.version, type: 'end_tick', args: {} }); }
  obs = await observe(tr);
  return { tr, obs, index: obs.proofs[0].index, proof: (await tr.proof(obs.proofs[0].index)).body.proof };
}

test('watcher: disabled deployment and unknown seasons never touch the network', async () => {
  const { tr, obs } = await playedJudgeSession();
  const log = [];
  const off = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: { ...NEAR_DEPLOYMENT, contractId: null }, fetch: fakeRpc({ log }) });
  off.observe(obs); await off.settle();
  assert.equal(off.status.state, 'disabled');
  assert.equal(off.seasonBadge(), null);
  assert.equal(off.client(), null);
  const other = await startedSeason();
  const w = createNearWatcher({ season: () => other, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ log }) });
  w.observe({ season: other, proofs: [], chronicle: [] }); await w.settle();
  assert.equal(w.status.state, 'other-season');
  assert.equal(w.seasonBadge(), null);
  assert.deepEqual(log, [], 'no RPC call for a seed that was never committed');
  assert.equal(NEAR_DEPLOYMENT.network, 'testnet');
  assert.ok(NEAR_DEPLOYMENT.contractId === null || /\.testnet$/.test(NEAR_DEPLOYMENT.contractId), 'the shipped deployment is testnet only');
});

test('watcher: the committed judge season gets the season badge and an on-chain leaf badge with the reveal link', async () => {
  const { tr, obs, index, proof } = await playedJudgeSession();
  const log = [];
  const views = {
    get_season: (a) => (a.season_id === JUDGE_SEASON_ID ? SEASON_VIEW : null),
    get_revealed_leaf: (a) => (a.index === index ? { season_id: a.season_id, index, leaf: proof.leaf, canonical_event: proof.canonicalEvent, salt: proof.salt, revealed_by: 'coordinator.testnet', revealed_at_ns: '1', revealed_at_block: '2' } : null),
    check_leaf: () => { throw new Error('check_leaf must not be called when the leaf is recorded'); },
  };
  const events = [];
  const near = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views, log }) });
  near.subscribe(() => events.push(near.status.state));
  near.observe(obs);
  assert.equal(near.status.state, 'checking');
  await near.settle();
  assert.equal(near.status.state, 'committed');
  assert.equal(near.status.contractUrl, 'https://testnet.nearblocks.io/address/ftf-seasons.testnet');
  assert.equal(near.status.commitTxUrl, 'https://testnet.nearblocks.io/txns/CommitTxHash');
  assert.deepEqual(near.seasonBadge(), { kind: 'season', state: 'committed', labelKey: 'wh.sign.near.committed', tipKey: 'wh.sign.near.tip', href: 'https://testnet.nearblocks.io/txns/CommitTxHash' });
  const leaf = near.leaf(index);
  assert.equal(leaf.state, 'on-chain');
  assert.equal(leaf.txUrl, index === 0 ? 'https://testnet.nearblocks.io/txns/Reveal0Hash' : null);
  assert.equal(near.leafBadge(index).labelKey, 'wh.sign.near.leaf');
  assert.equal(near.leafBadge(index).href, index === 0 ? 'https://testnet.nearblocks.io/txns/Reveal0Hash' : near.status.contractUrl);
  assert.equal(near.leafBadge(index + 1), null, 'unrevealed signs have no badge');
  assert.ok(events.includes('checking') && events.includes('committed'));
  const calls = log.map((l) => l.method);
  assert.deepEqual(calls, ['get_season', 'get_revealed_leaf']);
  near.observe(obs); await near.settle();
  assert.equal(log.length, 2, 'a repeated observation re-asks nothing');
});

test('watcher: dry-run, mismatch, not-committed and offline states degrade without throwing', async () => {
  const { tr, obs, index, proof } = await playedJudgeSession();
  // Season committed, leaf not yet recorded on-chain, but the contract accepts the browser proof in a view call.
  let w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views: {
    get_season: () => SEASON_VIEW, get_revealed_leaf: () => null,
    check_leaf: (a) => { assert.deepEqual(a, leafArgs(proof)); return { valid: true, leaf: proof.leaf, error: null }; },
  } }) });
  w.observe(obs); await w.settle();
  assert.equal(w.leaf(index).state, 'dry-run');
  assert.equal(w.leafBadge(index).labelKey, 'wh.sign.near.dryrun');
  // The contract rejects the browser proof: nothing recorded, dry run invalid → missing, no badge.
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views: { get_season: () => SEASON_VIEW, get_revealed_leaf: () => null, check_leaf: () => ({ valid: false, leaf: null, error: 'ERR_ROOT_MISMATCH: ...' }) } }) });
  w.observe(obs); await w.settle();
  assert.equal(w.leaf(index).state, 'missing');
  assert.equal(w.leafBadge(index), null);
  // A different leaf recorded under this index on-chain → mismatch badge.
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views: { get_season: () => SEASON_VIEW, get_revealed_leaf: () => ({ leaf: 'ab'.repeat(32) }) } }) });
  w.observe(obs); await w.settle();
  assert.equal(w.leaf(index).state, 'mismatch');
  assert.equal(w.leafBadge(index).labelKey, 'wh.sign.near.mismatch');
  // The root on-chain differs from the browser's → season mismatch, no badges at all.
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views: { get_season: () => ({ ...SEASON_VIEW, schedule_root: 'ff' + JUDGE_ROOT.slice(2) }) } }) });
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'mismatch');
  assert.equal(w.seasonBadge(), null);
  assert.equal(w.leafBadge(index), null);
  // Listed in the deployment but the contract has no record (e.g. redeployed under another account).
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ views: { get_season: () => null } }) });
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'not-committed');
  assert.equal(w.seasonBadge(), null);
  // Offline: every host dead; retried only after retryMs.
  let t = 1000; const log = [];
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch: fakeRpc({ failUrls: DEPLOY.rpcUrls, log }), retryMs: 500, now: () => t });
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'offline');
  assert.equal(w.status.error, 'NETWORK');
  assert.equal(w.seasonBadge(), null);
  const n = log.length;
  w.observe(obs); await w.settle();
  assert.equal(log.length, n, 'no retry before retryMs');
  t += 600; w.observe(obs); await w.settle();
  assert.ok(log.length > n, 'retries after retryMs');
  assert.equal(w.status.state, 'offline');
  // Unknown contract account: reported as offline-like degradation, never thrown.
  w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: { ...DEPLOY, contractId: 'missing.testnet' }, fetch: fakeRpc({}) });
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'offline');
  assert.equal(w.status.error, 'UNKNOWN_ACCOUNT');
});

test('watcher: a new season in the same watcher resets the leaves and asks again', async () => {
  const a = await playedJudgeSession();
  const log = [];
  let current = a.obs;
  const views = { get_season: () => SEASON_VIEW, get_revealed_leaf: () => ({ leaf: a.proof.leaf }) };
  const w = createNearWatcher({ season: () => current.season, proof: (i) => a.tr.proof(i), deployment: { ...DEPLOY, seasons: { ...DEPLOY.seasons, '0000000000000000': {} } }, fetch: fakeRpc({ views, log }) });
  w.observe(current); await w.settle();
  assert.equal(w.leaf(a.index).state, 'on-chain');
  current = { season: { seasonId: '0000000000000000', merkleRoot: 'ff'.repeat(32), rules: 'v3' }, proofs: [], chronicle: [] };
  w.observe(current); await w.settle();
  assert.equal(w.status.seasonId, '0000000000000000');
  assert.equal(w.status.state, 'mismatch');
  assert.equal(w.leaf(a.index), null);
});

test('watcher: an observation that arrives while the season check is in flight still gets its leaf badge', async () => {
  // Real play: the first observation (no reveals yet) starts get_season; the reveal of trial 3 arrives before the
  // RPC answers. The leaf must be checked as soon as the season is confirmed, without waiting for another action.
  const { tr, obs, index, proof } = await playedJudgeSession();
  let release;
  const gate = new Promise((r) => { release = r; });
  const views = { get_season: () => SEASON_VIEW, get_revealed_leaf: (a) => (a.index === index ? { leaf: proof.leaf } : null) };
  const inner = fakeRpc({ views });
  const fetch = async (url, init) => { if (JSON.parse(init.body).params.method_name === 'get_season') await gate; return inner(url, init); };
  const w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch });
  w.observe({ ...obs, proofs: [], chronicle: [] }); // before any reveal
  w.observe(obs); // the reveal arrives while get_season is pending
  release();
  await w.settle();
  assert.equal(w.status.state, 'committed');
  assert.equal(w.leaf(index).state, 'on-chain', 'checked from the latest observation');
  assert.equal(w.leafBadge(index).labelKey, 'wh.sign.near.leaf');
});

test('watcher: a leaf that failed on the network is asked again after retryMs (and on a timer when autoRetry is on)', async () => {
  const { tr, obs, index, proof } = await playedJudgeSession();
  let leafUp = false, t = 1000;
  const views = { get_season: () => SEASON_VIEW, get_revealed_leaf: () => ({ leaf: proof.leaf }) };
  const inner = fakeRpc({ views });
  const fetch = async (url, init) => { if (!leafUp && JSON.parse(init.body).params.method_name === 'get_revealed_leaf') throw new TypeError('timeout'); return inner(url, init); };
  const w = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch, retryMs: 500, now: () => t, autoRetry: false });
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'committed');
  assert.equal(w.leaf(index).state, 'offline');
  assert.equal(w.leafBadge(index), null);
  leafUp = true;
  w.observe(obs); await w.settle();
  assert.equal(w.leaf(index).state, 'offline', 'not before retryMs');
  t += 600; w.observe(obs); await w.settle();
  assert.equal(w.leaf(index).state, 'on-chain', 'asked again after retryMs');
  // autoRetry: a real timer re-observes the latest observation without any new player action.
  leafUp = false;
  const w2 = createNearWatcher({ season: () => obs.season, proof: tr.proof, deployment: DEPLOY, fetch, retryMs: 30, autoRetry: true });
  w2.observe(obs); await w2.settle();
  assert.equal(w2.leaf(index).state, 'offline');
  leafUp = true;
  await new Promise((r) => setTimeout(r, 80)); await w2.settle();
  assert.equal(w2.leaf(index).state, 'on-chain', 'retried by the timer');
  w2.destroy();
});
