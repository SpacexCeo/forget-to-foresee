// Memory shards as NEP-171 NFTs (src/net/shard-nft.js, contracts/memory-shard): the data mapping from the room's
// observation, the deterministic SVG and metadata pinned by the contract vectors, the judge playthrough's shards,
// and the read-only watcher that drives the "Shard minted on NEAR testnet" badge. No network: every fetch is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApi } from '../../src/net/api.js';
import { demoRandomBytes } from '../../src/net/near-season.js';
import { shardData, shardTokenId, shardSvg, shardMetadata, shardExtra, shardDataFromAuction, createShardNftClient, createShardWatcher, SHARD_KINDS, CLANS, KIND_COLOR, DIRS } from '../../src/net/shard-nft.js';
import { buildVectors, serialize, OUT } from '../../scripts/gen-shard-vectors.mjs';
import { NEAR_DEPLOYMENT } from '../../src/net/near-deployment.js';
import { sha256 } from '../../src/game/crypto.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const base = { season_id: '793f6c05e89839f2', shard_id: 7, owner_clan: 'iris', kind: 'call', weight: 2, forgotten_at_tick: 4, closes_at_tick: 6, winner_clan: 'frost', price: 13, unlocked_index: 3, unlocked_leaf: sha256('x'), schedule_root: ROOT };

test('shard vectors are up to date with shard-nft.js (the Rust contract reproduces them)', () => {
  assert.equal(readFileSync(OUT, 'utf8'), serialize(buildVectors()));
});

test('shardData validates and normalises; the token id, extra and image are deterministic', () => {
  const d = shardData({ ...base, extraneous: 1 });
  assert.deepEqual(Object.keys(d), ['season_id', 'shard_id', 'owner_clan', 'kind', 'weight', 'forgotten_at_tick', 'closes_at_tick', 'winner_clan', 'price', 'unlocked_index', 'unlocked_leaf', 'schedule_root']);
  assert.equal(shardTokenId(d), '793f6c05e89839f2-7');
  assert.equal(shardExtra(d), JSON.stringify(d));
  assert.equal(shardSvg(d), shardSvg(base));
  for (const bad of [{ kind: 'dream' }, { weight: 5 }, { weight: -1 }, { forgotten_at_tick: 18 }, { closes_at_tick: 0 }, { shard_id: 0 }, { owner_clan: 'guests' }, { winner_clan: 'guests' }, { season_id: 'ABC' }, { season_id: 'abc' }, { schedule_root: 'ab' }, { unlocked_leaf: null }, { unlocked_index: null }, { unlocked_index: 1024 }, { price: 1.5 }]) {
    assert.throws(() => shardData({ ...base, ...bad }), `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(SHARD_KINDS.length, 8);
  assert.equal(CLANS[0], 'iris');
  for (const k of SHARD_KINDS) assert.match(KIND_COLOR[k], /^#[0-9a-f]{6}$/);
  assert.equal(DIRS.length, 16);
  for (const [x, y] of DIRS) assert.ok(Math.abs(Math.hypot(x, y) - 1000) < 2, 'unit directions');
});

test('the image reads the data: colour by kind, weight dots, full core when bought, strokes from the leaf', () => {
  const bought = shardSvg(base);
  assert.ok(bought.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"'));
  assert.ok(bought.endsWith('</svg>'));
  assert.equal((bought.match(/<line /g) || []).length, 8);
  assert.equal((bought.match(/r="7"/g) || []).length, 2, 'weight 2 → two dots');
  assert.ok(bought.includes('r="12" fill="#7fb3d5"'), 'bought → full core in the call colour');
  assert.ok(bought.includes('SEASON 793f6c05e89839f2') && bought.includes('CALL · TRIAL 4 · #7'));
  const burned = shardSvg({ ...base, winner_clan: null, price: null, kind: 'betrayal', weight: 4 });
  assert.ok(burned.includes('r="9" fill="none" stroke="#c0504d"'), 'burned → hollow core');
  assert.equal((burned.match(/r="7"/g) || []).length, 4);
  assert.notEqual(shardSvg(base), shardSvg({ ...base, unlocked_leaf: sha256('y') }), 'another leaf → other strokes');
  const noLeaf = shardSvg({ ...base, unlocked_leaf: null, unlocked_index: null, kind: 'insight', weight: 0, owner_clan: 'frost' });
  assert.equal((noLeaf.match(/r="7"/g) || []).length, 0);
  assert.ok(!/\d\.\d/.test(bought.replace(/opacity="0\.\d+"/g, '')), 'integer coordinates only');
  const m = shardMetadata(base);
  assert.equal(m.title, 'Memory shard #7 · Call · season 793f6c05e89839f2');
  assert.match(m.description, /^Iris forgot a call memory of weight 2 at trial 4 of season 793f6c05e89839f2; the shard was bought by Frost for 13 silk at the trial-6 auction\. The vision it paid for opened sign #4/);
  assert.ok(m.description.includes(ROOT));
  assert.ok(m.media.startsWith('data:image/svg+xml;base64,'));
  assert.equal(Buffer.from(m.media.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8'), bought);
  assert.equal(Buffer.from(m.media_hash, 'base64').toString('hex'), sha256(bought));
  assert.equal(m.copies, 1);
  assert.equal(JSON.parse(m.extra).shard_id, 7);
  assert.match(shardMetadata({ ...base, kind: 'lie', weight: 0, owner_clan: 'frost', unlocked_index: null, unlocked_leaf: null, winner_clan: null, price: null }).description, /Frost forgot a lie at trial 4 .*unsold at the trial-6 auction and burned\. The season/);
});

/** The canonical judge playthrough (as contracts/memory-shard/scripts/judge-shards-args.mjs plays it). */
async function judgePlaythrough() {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(JUDGE_SEED) });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex: JUDGE_SEED }).body;
  let n = 0;
  const observe = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => { const o = observe(); const r = api.command(sessionId, token, { actionId: `shard-test-${++n}`, expectedVersion: o.version, type, args }); assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.body.error)}`); return r; };
  cmd('start_season');
  for (let i = 0; i < 3; i++) cmd('end_tick');
  let obs = observe();
  const call = obs.memories.find((m) => m.kind === 'call');
  const before = { auctions: obs.auctions.length, shards: obs.shards.length };
  cmd('sacrifice_memory', { memoryId: call.id });
  const after = observe();
  for (let guard = 0; guard < 80 && observe().season.phase !== 'end'; guard++) {
    obs = observe();
    const avail = obs.availableActions.map((a) => a.type);
    if (avail.includes('end_tick')) cmd('end_tick');
    else if (avail.includes('cast_vote')) cmd('cast_vote', { accept: true });
    else if (avail.includes('set_heir')) cmd('set_heir', { heir: false });
    else { const d = obs.availableActions.find((a) => a.type === 'decline_offer'); assert.ok(d, 'stuck'); cmd('decline_offer', d.args); }
  }
  return { before, after, final: observe() };
}

test('the observation carries the shard fields and keeps every shard of the season; the judge playthrough mints 3 shards', async () => {
  const { before, after, final } = await judgePlaythrough();
  assert.equal(before.auctions, 0); assert.equal(before.shards, 0);
  const a = after.auctions[0];
  assert.equal(a.from, 'iris'); assert.equal(a.kind, 'call'); assert.deepEqual(a.memory, { kind: 'call', weight: 2 });
  assert.equal(a.forgottenAtTick, 4); assert.equal(a.closesAtTick, 6); assert.equal(a.open, true); assert.equal(a.price, null);
  assert.equal(a.unlocked.index, 3, 'the vision opened sign #4 (the first still-unpublished sign)');
  assert.match(a.unlocked.leaf, /^[0-9a-f]{64}$/);
  assert.equal(a.tokenId, '793f6c05e89839f2-' + a.id);
  assert.deepEqual(after.shards.map((s) => s.id), [a.id], 'obs.shards mirrors the open auction');
  assert.equal(final.season.phase, 'end');
  assert.ok(final.auctions.length <= 1, 'resolved auctions leave the engine list');
  assert.equal(final.shards.length, 3, 'but every shard of the season stays in obs.shards');
  const [iris, f1, f2] = final.shards;
  assert.equal(iris.open, false); assert.equal(iris.winner, 'frost'); assert.equal(iris.price, 13);
  assert.equal(f1.from, 'frost'); assert.equal(f1.kind, 'insight'); assert.equal(f1.memory, null); assert.equal(f1.unlocked, null);
  const data = final.shards.map((s) => shardDataFromAuction(final.season, s));
  assert.deepEqual(data.map(shardTokenId), ['793f6c05e89839f2-7', '793f6c05e89839f2-10', '793f6c05e89839f2-15']);
  assert.equal(data[0].unlocked_leaf, a.unlocked.leaf);
  assert.equal(data[0].schedule_root, ROOT);
  assert.equal(data[1].weight, 0); assert.equal(data[1].winner_clan, 'salt'); assert.equal(data[1].price, 7);
  assert.equal(data[2].forgotten_at_tick, 11);
  // The helper's output is exactly what scripts/judge-shards-args.mjs writes (summary.json shape).
  for (const d of data) assert.equal(shardSvg(d).length < 2200, true);
});

/* ---------- fake RPC for the client and the watcher ---------- */
const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
function fakeRpc(views, log = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString('utf8'));
    log.push({ method: body.params.method_name, args });
    if (!views[body.params.method_name]) return { ok: true, json: async () => ({ result: { error: 'MethodNotFound' } }) };
    const v = views[body.params.method_name](args);
    return { ok: true, json: async () => ({ result: { result: enc(v), block_height: 1, block_hash: 'h' } }) };
  };
}
const MINTED = [
  { token_id: '793f6c05e89839f2-7', owner_id: 'player.testnet', data: shardData(base), minted_at_ns: '1', minted_at_block: '2', minted_by: 'coord.testnet', metadata: shardMetadata(base) },
];
const DEPLOY = { ...NEAR_DEPLOYMENT, contractId: 'ftf-seasons.testnet', shardContractId: 'ftf-shards.testnet', explorer: 'https://testnet.nearblocks.io', rpcUrls: ['https://a.example'], shardMints: { '793f6c05e89839f2': { 7: 'MintTx7' } } };

test('shard client views and the watcher badge: minted → link to the mint tx; silent when disabled, unknown or offline', async () => {
  const log = [];
  const views = { shards_of_season: (a) => (a.season_id === '793f6c05e89839f2' ? MINTED : []), get_shard: (a) => MINTED.find((m) => m.token_id === a.token_id) || null, season_shard_count: () => 1, nft_token: (a) => ({ token_id: a.token_id, owner_id: 'player.testnet' }), nft_metadata: () => ({ spec: 'nft-1.0.0', name: 'Forget to Foresee: Memory Shards', symbol: 'FTFSHARD' }) };
  const client = createShardNftClient({ contractId: 'ftf-shards.testnet', rpcUrls: ['https://a.example'], fetch: fakeRpc(views, log) });
  assert.equal((await client.getShard('793f6c05e89839f2-7')).owner_id, 'player.testnet');
  assert.equal(await client.getShard('nope'), null);
  assert.equal((await client.shardsOfSeason('793f6c05e89839f2')).length, 1);
  assert.equal(await client.seasonShardCount('793f6c05e89839f2'), 1);
  assert.equal((await client.nftMetadata()).symbol, 'FTFSHARD');
  assert.deepEqual(log[2].args, { season_id: '793f6c05e89839f2', from_index: 0, limit: 50 });
  const obs = { season: { seasonId: '793f6c05e89839f2', merkleRoot: ROOT }, shards: [] };
  const off = createShardWatcher({ deployment: { ...DEPLOY, shardContractId: null }, fetch: fakeRpc(views) });
  off.observe(obs); await off.settle();
  assert.equal(off.status.state, 'disabled'); assert.equal(off.badge(7), null);
  const log2 = [];
  const w = createShardWatcher({ deployment: DEPLOY, fetch: fakeRpc(views, log2) });
  const states = []; w.subscribe(() => states.push(w.status.state));
  w.observe(obs); await w.settle();
  assert.equal(w.status.state, 'loaded');
  assert.deepEqual(states, ['checking', 'loaded']);
  assert.deepEqual(w.badge(7), { kind: 'shard', state: 'minted', labelKey: 'wh.shard.near.minted', tipKey: 'wh.shard.near.tip', href: 'https://testnet.nearblocks.io/txns/MintTx7', tokenId: '793f6c05e89839f2-7', owner: 'player.testnet' });
  assert.equal(w.token(7).owner_id, 'player.testnet');
  assert.equal(w.badge(10), null, 'a shard not minted has no badge');
  w.observe(obs); await w.settle();
  assert.equal(log2.length, 1, 'asked once per season');
  const other = createShardWatcher({ deployment: DEPLOY, fetch: fakeRpc(views, []) });
  other.observe({ season: { seasonId: '0000000000000000' } }); await other.settle();
  assert.equal(other.status.state, 'other-season'); assert.equal(other.badge(7), null);
  let t = 1000;
  const dead = createShardWatcher({ deployment: DEPLOY, fetch: async () => { throw new TypeError('fetch failed'); }, retryMs: 500, now: () => t });
  dead.observe(obs); await dead.settle();
  assert.equal(dead.status.state, 'offline'); assert.equal(dead.badge(7), null);
  dead.observe(obs); await dead.settle(); assert.equal(dead.status.state, 'offline');
  t += 600; dead.observe(obs); await dead.settle(); assert.equal(dead.status.state, 'offline', 'retried, still offline, still silent');
  // A deployment without a mint tx for the shard links to the collection instead.
  const noTx = createShardWatcher({ deployment: { ...DEPLOY, shardMints: { '793f6c05e89839f2': {} } }, fetch: fakeRpc(views) });
  noTx.observe(obs); await noTx.settle();
  assert.equal(noTx.badge(7).href, 'https://testnet.nearblocks.io/address/ftf-shards.testnet?tab=nfts');
  // The recorded testnet deployment (09.11): the judge playthrough's three shards, testnet only.
  assert.equal(NEAR_DEPLOYMENT.shardContractId, 'ftf-shards.testnet');
  assert.deepEqual(Object.keys(NEAR_DEPLOYMENT.shardMints['793f6c05e89839f2']).sort(), ['10', '15', '7']);
  for (const h of Object.values(NEAR_DEPLOYMENT.shardMints['793f6c05e89839f2'])) assert.match(h, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'base58 tx hash');
});
