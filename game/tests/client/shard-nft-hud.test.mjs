// Shard NFT cards and the mint toast (src/ui/world-hud/shard-card-model.js): the view model and its gating. A card
// shows only when the token exists on-chain AND its data equals this playthrough's shard; live seasons get the quiet
// "judge season only" line; RPC failures show nothing. No network: every fetch is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../src/net/api.js';
import { demoRandomBytes } from '../../src/net/near-season.js';
import { shardData, shardMetadata, shardSvg, shardDataFromAuction, createShardWatcher } from '../../src/net/shard-nft.js';
import { NEAR_DEPLOYMENT } from '../../src/net/near-deployment.js';
import { shardCardModel, shardCards, createMintMoments, localShardData, tokenUrl } from '../../src/ui/world-hud/shard-card-model.js';
import { PLAY_MESSAGES, createPlayI18n, renderMsg } from '../../src/play/i18n.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const SEASON = '793f6c05e89839f2';

/** The judge playthrough (as contracts/memory-shard/scripts/judge-shards-args.mjs plays it), every observation kept. */
function judgePlaythrough() {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(JUDGE_SEED) });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex: JUDGE_SEED }).body;
  let n = 0;
  const seen = [];
  const observe = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => { const o = observe(); const r = api.command(sessionId, token, { actionId: `shard-hud-${++n}`, expectedVersion: o.version, type, args }); assert.equal(r.status, 200, type + JSON.stringify(r.body.error)); seen.push(observe()); };
  cmd('start_season');
  for (let i = 0; i < 3; i++) cmd('end_tick');
  cmd('sacrifice_memory', { memoryId: observe().memories.find((m) => m.kind === 'call').id });
  for (let guard = 0; guard < 80 && observe().season.phase !== 'end'; guard++) {
    const avail = observe().availableActions;
    const types = avail.map((a) => a.type);
    if (types.includes('end_tick')) cmd('end_tick');
    else if (types.includes('cast_vote')) cmd('cast_vote', { accept: true });
    else if (types.includes('set_heir')) cmd('set_heir', { heir: false });
    else { const d = avail.find((a) => a.type === 'decline_offer'); cmd('decline_offer', d.args); }
  }
  return { seen, final: observe() };
}
const PLAY = judgePlaythrough();

/** What the contract returns from shards_of_season: the coordinator minted the judge playthrough's shards. */
const ONCHAIN = PLAY.final.shards.map((s) => {
  const d = shardDataFromAuction(PLAY.final.season, s);
  return { token_id: `${SEASON}-${s.id}`, owner_id: 'lambada_eth.testnet', data: d, metadata: shardMetadata(d) };
});
const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
const fakeRpc = (list) => async (url, init) => {
  const body = JSON.parse(init.body);
  if (body.params.method_name !== 'shards_of_season') return { ok: true, json: async () => ({ result: { error: 'MethodNotFound' } }) };
  return { ok: true, json: async () => ({ result: { result: enc(list), block_height: 1, block_hash: 'h' } }) };
};
async function watcher(fetch, obs = PLAY.final) {
  const w = createShardWatcher({ deployment: NEAR_DEPLOYMENT, fetch });
  w.observe(obs); await w.settle();
  return w;
}

test('on-chain present: a full NFT card per shard, Iris first, bound to the sealed season', async () => {
  const w = await watcher(fakeRpc(ONCHAIN));
  assert.equal(w.status.state, 'loaded');
  const { cards, judgeOnly } = shardCards({ status: w.status, obs: PLAY.final });
  assert.equal(judgeOnly, false);
  assert.deepEqual(cards.map((c) => c.card.tokenId), [`${SEASON}-7`, `${SEASON}-10`, `${SEASON}-15`]);
  const c = cards[0].card;
  assert.equal(c.state, 'minted');
  assert.equal(c.standard, 'NEP-171');
  assert.equal(c.contractId, 'ftf-shards.testnet');
  assert.equal(c.owner, 'lambada_eth.testnet');
  assert.equal(c.ownerHref, 'https://testnet.nearblocks.io/address/lambada_eth.testnet');
  assert.deepEqual([c.ownerClan, c.kind, c.weight, c.forgottenAt, c.closesAt, c.winner, c.price], ['iris', 'call', 2, 4, 6, 'frost', 13]);
  assert.equal(c.leaf.index, 3);
  assert.equal(c.leaf.href, `https://testnet.nearblocks.io/txns/${NEAR_DEPLOYMENT.seasons[SEASON].revealTx['3']}`, 'links the reveal of leaf #3 on ftf-seasons');
  assert.equal(c.tokenHref, `https://testnet.nearblocks.io/nft-token/ftf-shards.testnet/${SEASON}-7`);
  assert.equal(c.mintTxHref, `https://testnet.nearblocks.io/txns/${NEAR_DEPLOYMENT.shardMints[SEASON]['7']}`);
  assert.equal(c.svgVerified, true);
  assert.equal(c.svg, shardSvg(ONCHAIN[0].data), 'the drawn SVG is byte-identical to the chain media');
  assert.equal(cards[1].card.leaf, null, 'an insight shard opened no sign');
  assert.equal(tokenUrl(NEAR_DEPLOYMENT, 'x-1'), 'https://testnet.nearblocks.io/nft-token/ftf-shards.testnet/x-1');
});

test('on-chain media that differs from the game is shown as an image and not marked verified', async () => {
  const bad = ONCHAIN.map((t, i) => (i ? t : { ...t, metadata: { ...t.metadata, media: 'data:image/svg+xml;base64,PHN2Zy8+' } }));
  const w = await watcher(fakeRpc(bad));
  const c = shardCards({ status: w.status, obs: PLAY.final }).cards[0].card;
  assert.equal(c.svgVerified, false); assert.equal(c.svg, null); assert.equal(c.media, 'data:image/svg+xml;base64,PHN2Zy8+');
});

test('on-chain absent or different: no card, never a fake token', async () => {
  const none = await watcher(fakeRpc([]));
  assert.deepEqual(shardCards({ status: none.status, obs: PLAY.final }), { cards: [], judgeOnly: false });
  // A judge who plays differently: shard #7 on-chain is Iris's call, the local shard #7 is something else.
  const other = { ...PLAY.final, shards: PLAY.final.shards.map((s) => (s.id === 7 ? { ...s, winner: 'salt' } : s)) };
  const w = await watcher(fakeRpc(ONCHAIN));
  assert.deepEqual(shardCards({ status: w.status, obs: other }).cards.map((c) => c.card.shardId), [10, 15]);
  // Before the auction closes the shard is not minted yet: no card even though the token exists.
  const open = PLAY.seen.find((o) => o.shards.some((s) => s.id === 7 && s.open));
  assert.ok(open);
  assert.equal(localShardData(open.season, open.shards.find((s) => s.id === 7)), null);
  assert.equal(shardCardModel({ status: w.status, season: open.season, shard: open.shards.find((s) => s.id === 7) }), null);
  // On-chain data that fails validation is ignored.
  const broken = await watcher(fakeRpc([{ ...ONCHAIN[0], data: { ...ONCHAIN[0].data, kind: 'dream' } }]));
  assert.equal(shardCards({ status: broken.status, obs: PLAY.final }).cards.length, 0);
  // No shard deployment at all: nothing.
  assert.equal(shardCardModel({ status: w.status, season: PLAY.final.season, shard: PLAY.final.shards[0], deployment: { ...NEAR_DEPLOYMENT, shardContractId: null } }), null);
});

test('live season: "on-chain for the judge season only", no card and no RPC call', async () => {
  let calls = 0;
  const live = { ...PLAY.final, season: { ...PLAY.final.season, seasonId: 'aaaaaaaaaaaaaaaa' } };
  const w = await watcher(async () => { calls++; throw new Error('no'); }, live);
  assert.equal(w.status.state, 'other-season');
  assert.equal(calls, 0);
  assert.deepEqual(shardCards({ status: w.status, obs: live }), { cards: [], judgeOnly: true });
  assert.deepEqual(shardCardModel({ status: w.status, season: live.season, shard: live.shards[0] }), { state: 'judge-only' });
});

test('RPC error: silent (no card, no judge-only line, no toast)', async () => {
  const w = await watcher(async () => { throw new TypeError('fetch failed'); });
  assert.equal(w.status.state, 'offline');
  assert.deepEqual(shardCards({ status: w.status, obs: PLAY.final }), { cards: [], judgeOnly: false });
  const m = createMintMoments();
  for (const o of PLAY.seen) m.observe(o);
  assert.equal(m.pending.length, 3);
  assert.deepEqual(m.take(w.status, PLAY.final), []);
  assert.equal(m.pending.length, 0, 'dropped, not retried as a late toast');
});

test('mint moment: the toast fires once, when Frost buys Iris\'s call for 13 silk, only if the token exists', async () => {
  const w = await watcher(fakeRpc(ONCHAIN));
  const m = createMintMoments();
  const fired = [];
  for (const o of PLAY.seen) { m.observe(o); for (const x of m.take(w.status, o)) fired.push({ tick: o.season.tick, id: x.card.shardId, winner: x.card.winner, price: x.card.price }); }
  assert.deepEqual(fired.map((f) => f.id), [7, 10, 15], 'each shard once');
  assert.deepEqual(fired[0], { tick: fired[0].tick, id: 7, winner: 'frost', price: 13 });
  assert.ok(fired[0].tick >= 6, 'after the trial-6 auction closed');
  // While the watcher is still checking, the moment waits; with no token it is dropped.
  const waiting = createMintMoments();
  for (const o of PLAY.seen) waiting.observe(o);
  assert.deepEqual(waiting.take({ state: 'checking' }, PLAY.final), []);
  assert.equal(waiting.pending.length, 3);
  const empty = await watcher(fakeRpc([]));
  assert.deepEqual(waiting.take(empty.status, PLAY.final), []);
  // A shard first seen already sold (a reload mid-season) does not toast.
  const late = createMintMoments(); late.observe(PLAY.final);
  assert.deepEqual(late.take(w.status, PLAY.final), []);
});

test('every shard NFT string exists in all five locales and renders', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('shard.nft.'));
  assert.ok(keys.length >= 20);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  const en = createPlayI18n('en'), ru = createPlayI18n('ru');
  assert.equal(renderMsg(en, 'shard.nft.leaf', { index: 3 }), 'Bound to the sealed season · leaf #3');
  assert.equal(renderMsg(en, 'shard.nft.toast', { id: 7, kind: 'call', clan: 'Frost', price: 13 }), 'Shard #7 · call → Frost for 13 silk');
  assert.match(renderMsg(ru, 'shard.nft.minted'), /Отчеканен в NEAR testnet/);
  assert.match(renderMsg(ru, 'shard.nft.bio', { clan: renderMsg(ru, 'agent.iris'), kind: renderMsg(ru, 'shard.nft.kind.call'), weight: 2, trial: 4 }), /забыта память «зов» весом 2 на испытании 4/);
});
