// Shard NFT cards and the mint toast (src/ui/world-hud/shard-card-model.js): the view model and its gating. A card
// is a real token only when it exists on-chain AND its data equals this playthrough's shard; otherwise Iris's closed
// shard is an "Unminted shard preview" with no token id or link (docs/hackathon-tz.md P1-C). No network: fakes only.
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

/** A preview never carries anything that could pass for a token. */
function assertPreview(card, id) {
  assert.equal(card.state, 'preview');
  assert.equal(card.shardId, id);
  for (const k of ['tokenId', 'contractId', 'standard', 'owner', 'ownerHref', 'tokenHref', 'mintTxHref', 'leaf']) assert.equal(card[k], null, k);
  assert.equal(card.svgVerified, false);
  assert.ok(card.svg && card.svg.startsWith('<svg'), 'the game draws its own ink ring');
}

test('on-chain absent or different: Iris gets an "Unminted shard preview", never a fake token', async () => {
  const none = await watcher(fakeRpc([]));
  const v = shardCards({ status: none.status, obs: PLAY.final });
  assert.deepEqual(v.cards.map((c) => [c.shard.id, c.card.state]), [[7, 'preview']], 'other clans\' unminted shards stay quiet');
  assertPreview(v.cards[0].card, 7);
  assert.deepEqual([v.cards[0].card.ownerClan, v.cards[0].card.kind, v.cards[0].card.winner, v.cards[0].card.price], ['iris', 'call', 'frost', 13]);
  // A judge who plays differently: shard #7 on-chain is Iris's call, the local shard #7 is something else.
  const other = { ...PLAY.final, shards: PLAY.final.shards.map((s) => (s.id === 7 ? { ...s, winner: 'salt' } : s)) };
  const w = await watcher(fakeRpc(ONCHAIN));
  const diverged = shardCards({ status: w.status, obs: other }).cards;
  assert.deepEqual(diverged.map((c) => [c.card.shardId, c.card.state]), [[7, 'preview'], [10, 'minted'], [15, 'minted']]);
  assertPreview(diverged[0].card, 7);
  // Before the auction closes the shard is not minted yet: no card even though the token exists.
  const open = PLAY.seen.find((o) => o.shards.some((s) => s.id === 7 && s.open));
  assert.ok(open);
  assert.equal(localShardData(open.season, open.shards.find((s) => s.id === 7)), null);
  assert.equal(shardCardModel({ status: w.status, season: open.season, shard: open.shards.find((s) => s.id === 7) }), null);
  // On-chain data that fails validation is ignored: a preview, not a token.
  const broken = await watcher(fakeRpc([{ ...ONCHAIN[0], data: { ...ONCHAIN[0].data, kind: 'dream' } }]));
  assert.deepEqual(shardCards({ status: broken.status, obs: PLAY.final }).cards.map((c) => c.card.state), ['preview']);
  // No shard deployment at all: a preview.
  assertPreview(shardCardModel({ status: w.status, season: PLAY.final.season, shard: PLAY.final.shards[0], deployment: { ...NEAR_DEPLOYMENT, shardContractId: null } }), 7);
  // While the watcher is still checking: nothing yet (no preview flashing before the real token).
  assert.equal(shardCardModel({ status: { state: 'checking', seasonId: SEASON }, season: PLAY.final.season, shard: PLAY.final.shards[0] }), null);
});

test('other seed (live season): an unminted preview, no RPC call', async () => {
  let calls = 0;
  const live = { ...PLAY.final, season: { ...PLAY.final.season, seasonId: 'aaaaaaaaaaaaaaaa' } };
  const w = await watcher(async () => { calls++; throw new Error('no'); }, live);
  assert.equal(w.status.state, 'other-season');
  assert.equal(calls, 0);
  const v = shardCards({ status: w.status, obs: live });
  assert.equal(v.judgeOnly, false);
  assert.deepEqual(v.cards.map((c) => c.card.state), ['preview']);
  assertPreview(v.cards[0].card, 7);
  const m = createMintMoments();
  for (const o of PLAY.seen) m.observe({ ...o, season: { ...o.season, seasonId: live.season.seasonId } });
  const out = m.take(w.status, live);
  assert.deepEqual(out.map((x) => [x.shard.id, x.card.state]), [[7, 'preview']], 'the moment still happens, as a preview, never as minted');
});

test('RPC error on the judge path: no fake card; only the labeled preview of Iris\'s shard', async () => {
  const w = await watcher(async () => { throw new TypeError('fetch failed'); });
  assert.equal(w.status.state, 'offline');
  const v = shardCards({ status: w.status, obs: PLAY.final });
  assert.ok(v.cards.every((c) => c.card.state === 'preview'));
  assert.deepEqual(v.cards.map((c) => c.shard.id), [7]);
  const m = createMintMoments();
  for (const o of PLAY.seen) m.observe(o);
  assert.equal(m.pending.length, 3);
  const out = m.take(w.status, PLAY.final);
  assert.deepEqual(out.map((x) => [x.shard.id, x.card.state]), [[7, 'preview']], 'no minted toast without a token');
  assert.equal(m.pending.length, 0, 'dropped, not retried as a late toast');
});

test('mint moment: the toast fires once, when Frost buys Iris\'s call for 13 silk, only if the token exists', async () => {
  const w = await watcher(fakeRpc(ONCHAIN));
  const m = createMintMoments();
  const fired = [];
  for (const o of PLAY.seen) { m.observe(o); for (const x of m.take(w.status, o)) if (x.card.state === 'minted') fired.push({ tick: o.season.tick, id: x.card.shardId, winner: x.card.winner, price: x.card.price }); }
  assert.deepEqual(fired.map((f) => f.id), [7, 10, 15], 'each shard once');
  assert.deepEqual(fired[0], { tick: fired[0].tick, id: 7, winner: 'frost', price: 13 });
  assert.ok(fired[0].tick >= 6, 'after the trial-6 auction closed');
  // While the watcher is still checking, the moment waits; with no token it is dropped.
  const waiting = createMintMoments();
  for (const o of PLAY.seen) waiting.observe(o);
  assert.deepEqual(waiting.take({ state: 'checking' }, PLAY.final), []);
  assert.equal(waiting.pending.length, 3);
  const empty = await watcher(fakeRpc([]));
  assert.deepEqual(waiting.take(empty.status, PLAY.final).map((x) => [x.shard.id, x.card.state]), [[7, 'preview']], 'no token: Iris\'s moment is a preview');
  // A shard first seen already sold (a reload mid-season) does not toast.
  const late = createMintMoments(); late.observe(PLAY.final);
  assert.deepEqual(late.take(w.status, PLAY.final), []);
});

test('every shard NFT string exists in all five locales and renders', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('shard.nft.'));
  assert.match(PLAY_MESSAGES.en['shard.nft.preview.title'], /^Unminted/);
  assert.ok(keys.includes('shard.nft.preview.note'));
  assert.ok(keys.length >= 20);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  const en = createPlayI18n('en'), ru = createPlayI18n('ru');
  assert.equal(renderMsg(en, 'shard.nft.leaf', { index: 3 }), 'Bound to the sealed season · leaf #3');
  assert.equal(renderMsg(en, 'shard.nft.toast', { id: 7, kind: 'call', clan: 'Frost', price: 13 }), 'Shard #7 · call → Frost for 13 silk');
  assert.match(renderMsg(ru, 'shard.nft.minted'), /Отчеканен в NEAR testnet/);
  assert.match(renderMsg(ru, 'shard.nft.bio', { clan: renderMsg(ru, 'agent.iris'), kind: renderMsg(ru, 'shard.nft.kind.call'), weight: 2, trial: 4 }), /забыта память «зов» весом 2 на испытании 4/);
});

test('preview card DOM: the word Unminted, no token id, no link, no verified mark', async () => {
  const { renderShardCard } = await import('../../src/ui/world-hud/shard-card.js');
  const mk = (tag) => ({ tag, attrs: {}, kids: [], className: '', textContent: '', style: { setProperty() {} }, classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, append(...c) { this.kids.push(...c); } });
  const doc = { createElement: mk };
  const none = await watcher(fakeRpc([]));
  const card = shardCards({ status: none.status, obs: PLAY.final }).cards[0].card;
  const en = createPlayI18n('en');
  const node = renderShardCard(card, { t: (k, a) => renderMsg(en, k, a), doc });
  const all = []; const walk = (n) => { if (!n || typeof n !== 'object') return; all.push(n); (n.kids || []).forEach(walk); }; walk(node);
  const text = all.map((n) => n.textContent).join(' | ');
  assert.equal(node.attrs['data-state'], 'preview');
  assert.equal(node.attrs['data-token'], undefined);
  assert.match(text, /Unminted shard preview/);
  assert.match(text, /judge season only/);
  assert.ok(!all.some((n) => n.tag === 'a'), 'no explorer link');
  assert.doesNotMatch(text, /nearblocks|NEP-171|Minted on NEAR|identical to the game/);
});

test('the shard section says "on NEAR" only when a real token is in it', async () => {
  const { renderShardSection } = await import('../../src/ui/world-hud/shard-card.js');
  const mk = (tag) => ({ tag, attrs: {}, kids: [], className: '', textContent: '', style: { setProperty() {} }, classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, append(...c) { this.kids.push(...c); } });
  const doc = { createElement: (tag) => Object.assign(mk(tag), { dataset: {} }), head: { appendChild() {} }, querySelector: () => null };
  const en = createPlayI18n('en'); const t = (k, a) => renderMsg(en, k, a);
  const none = await watcher(fakeRpc([]));
  const prev = renderShardSection(shardCards({ status: none.status, obs: PLAY.final }), { t, doc });
  assert.equal(prev.attrs['aria-label'], 'Memory shards');
  const real = await watcher(fakeRpc(ONCHAIN));
  assert.equal(renderShardSection(shardCards({ status: real.status, obs: PLAY.final }), { t, doc }).attrs['aria-label'], 'Memory shards on NEAR');
});

test('?demo=judge: the recorded on-chain judge shard is one click away when this playthrough diverged (audit QW-3)', async () => {
  const { renderShardSection } = await import('../../src/ui/world-hud/shard-card.js');
  const other = { ...PLAY.final, shards: PLAY.final.shards.map((s) => (s.id === 7 ? { ...s, winner: 'salt' } : s)) };
  const w = await watcher(fakeRpc(ONCHAIN));
  // not on the judge link: no button
  assert.equal(shardCards({ status: w.status, obs: other }).recorded, null);
  const v = shardCards({ status: w.status, obs: other, judge: true });
  assert.equal(v.recorded.state, 'minted');
  const c = v.recorded.card;
  assert.equal(c.recorded, true); assert.equal(c.state, 'minted');
  assert.equal(c.tokenId, `${SEASON}-7`); assert.equal(c.owner, 'lambada_eth.testnet'); assert.equal(c.leaf.index, 3);
  assert.equal(c.tokenHref, `https://testnet.nearblocks.io/nft-token/ftf-shards.testnet/${SEASON}-7`);
  assert.equal(c.svgVerified, true);
  assert.equal(v.cards.find((x) => x.card.shardId === 7).card.state, 'preview', 'the player\'s own shard stays an Unminted preview');
  // the playthrough matched: its own card already is the token, no second button
  assert.equal(shardCards({ status: w.status, obs: PLAY.final, judge: true }).recorded, null);
  // RPC failure: the honest reason, no fake data
  const dead = await watcher(async () => { throw new TypeError('fetch failed'); }, other);
  assert.deepEqual(shardCards({ status: dead.status, obs: other, judge: true }).recorded, { state: 'offline' });
  // a live season: nothing recorded to show
  const live = { ...other, season: { ...other.season, seasonId: '0000000000000000' } };
  assert.equal(shardCards({ status: w.status, obs: live, judge: true }).recorded, null);
  // DOM: a button that opens the labelled card
  const listeners = [];
  const mk = (tag) => ({ tag, attrs: {}, kids: [], className: '', textContent: '', hidden: false, style: { setProperty() {} }, classList: { add() {} }, dataset: {},
    get firstChild() { return this.kids[0] || null; }, setAttribute(k, val) { this.attrs[k] = val; if (k === 'hidden') this.hidden = true; }, addEventListener(e, fn) { listeners.push([this, e, fn]); }, append(...k) { this.kids.push(...k); } });
  const doc = { createElement: mk, head: { appendChild() {} }, querySelector: () => null };
  const en = createPlayI18n('en'); const t = (k, a) => renderMsg(en, k, a);
  const node = renderShardSection(v, { t, doc });
  const all = []; const walk = (n) => { if (!n || typeof n !== 'object') return; all.push(n); (n.kids || []).forEach(walk); }; walk(node);
  const btn = all.find((n) => n.className && n.className.includes('sh-recorded-open'));
  assert.equal(btn.textContent, "Open the judge playthrough's on-chain shard (#7)");
  listeners.find(([n]) => n === btn)[2]();
  const after = []; const walk2 = (n) => { if (!n || typeof n !== 'object') return; after.push(n); (n.kids || []).forEach(walk2); }; walk2(node);
  const text = after.map((n) => n.textContent).join(' | ');
  assert.match(text, /recorded judge playthrough: minted by the coordinator, not by your session/);
  assert.ok(after.some((n) => n.attrs && n.attrs['data-token'] === `${SEASON}-7`), 'the token card is rendered');
});
