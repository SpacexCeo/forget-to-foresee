// The season's end and continuity (readiness audit 09.11): Iris's biography (remembered, sacrificed with each fate,
// the shard NFT, the season record: committed only when checked live, else local), "Copy biography", and the
// local-season notice with "Start a new season" that asks before discarding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { biographyModel, biographyLines, biographyText, fateOf, chainOf, BIOGRAPHY_FORMAT } from '../../src/play/biography.js';
import { buildSeasonSection, fixedSeedFromSearch, restartAskKey } from '../../src/play/season-local.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';
import { createLocalTransport } from '../../src/play/transport-local.js';

const SEASON = '793f6c05e89839f2';
const ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const DEPLOY = { network: 'testnet', contractId: 'ftf-seasons.testnet', explorer: 'https://testnet.nearblocks.io', seasons: { [SEASON]: { commitTx: 'CommitTx' } } };
const obs = (extra = {}) => ({
  season: { seasonId: SEASON, rules: 'v3', outcome: 'gift', heir: null, merkleRoot: ROOT, ...extra },
  memories: [{ text: 'Moss shared silk on the first night', kind: 'gift', weight: 2 }],
  iris: { forgotten: [
    { text: 'The Shells’ Call on the night of arrival', fate: 'bought by Frost for 13' },
    { text: 'Frost gave a word from the chronicle', fate: 'burned' },
  ] },
});
const shardCard = { shard: { from: 'iris', id: 7 }, card: { state: 'minted', tokenId: SEASON + '-7', contractId: 'ftf-shards.testnet', owner: 'lambada_eth.testnet', winner: 'frost', price: 13, tokenHref: 'https://testnet.nearblocks.io/nft-token/ftf-shards.testnet/' + SEASON + '-7' } };
const committed = { state: 'committed', seasonId: SEASON, contractId: 'ftf-seasons.testnet', commitTxUrl: 'https://testnet.nearblocks.io/txns/CommitTx', contractUrl: 'https://testnet.nearblocks.io/address/ftf-seasons.testnet' };

test('fateOf and chainOf: buyer and price from the room text; only a live committed record links as verified', () => {
  assert.deepEqual(fateOf('bought by Frost for 13'), { fate: 'bought', buyer: 'frost', price: 13 });
  assert.deepEqual(fateOf('burned'), { fate: 'burned', buyer: null, price: null });
  assert.deepEqual(fateOf('at auction'), { fate: 'auction', buyer: null, price: null });
  assert.equal(fateOf('???').fate, 'unknown');
  assert.equal(chainOf(committed, SEASON, DEPLOY).href, 'https://testnet.nearblocks.io/txns/CommitTx');
  assert.equal(chainOf(committed, 'another', DEPLOY).state, 'local', 'a status for another season says nothing about this one');
  const off = chainOf({ state: 'offline', seasonId: SEASON }, SEASON, DEPLOY);
  assert.deepEqual([off.state, off.href, off.recordedHref], ['offline', null, 'https://testnet.nearblocks.io/txns/CommitTx'], 'offline: recorded, never a verified link');
  assert.equal(chainOf({ state: 'other-season', seasonId: SEASON }, SEASON, DEPLOY).state, 'local');
  assert.equal(chainOf(null, SEASON, DEPLOY).state, 'local');
  assert.equal(chainOf({ state: 'mismatch', seasonId: SEASON, contractUrl: 'c' }, SEASON, DEPLOY).state, 'mismatch');
});

test('biography: remembered, sacrificed with fates, the shard NFT and the committed season link; JSON keeps canonical data', () => {
  const b = biographyModel({ obs: obs(), nearStatus: committed, shards: { cards: [shardCard, { shard: { from: 'frost', id: 10 }, card: { state: 'minted', tokenId: 'x' } }] }, deployment: DEPLOY });
  assert.equal(b.format, BIOGRAPHY_FORMAT);
  assert.equal(b.seasonId, SEASON);
  assert.equal(b.outcome, 'gift');
  assert.deepEqual(b.remembered, [{ text: 'Moss shared silk on the first night', kind: 'gift', weight: 2 }]);
  assert.deepEqual(b.sacrificed.map((x) => [x.fate, x.buyer, x.price]), [['bought', 'frost', 13], ['burned', null, null]]);
  assert.deepEqual(b.shards, [{ tokenId: SEASON + '-7', contractId: 'ftf-shards.testnet', owner: 'lambada_eth.testnet', buyer: 'frost', price: 13, url: shardCard.card.tokenHref }], 'only Iris’s own minted shards');
  assert.equal(b.chain.state, 'committed');
  assert.equal(b.chain.merkleRoot, ROOT);
  const i18n = createPlayI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
  const t = (k, a) => renderMsg(i18n, k, a);
  const text = biographyText(b, t, i18n);
  assert.match(text, /^Forget to Foresee — Iris’s biography\nSeason 793f6c05e89839f2\nThe season is over: the message was a gift/);
  assert.match(text, /✓ Moss shared silk on the first night/);
  assert.match(text, /✕ The Shells’ Call on the night of arrival — bought by Frost for 13/);
  assert.match(text, /✕ Frost gave a word from the chronicle — burned/);
  assert.match(text, /Memory shard NFT 793f6c05e89839f2-7 · owner lambada_eth\.testnet https:\/\/testnet\.nearblocks\.io\/nft-token\//);
  assert.match(text, /Season committed on NEAR testnet ✓ https:\/\/testnet\.nearblocks\.io\/txns\/CommitTx/);
  assert.ok(text.includes('Schedule root ' + ROOT), 'the full root, never shortened or translated');
  assert.match(text, /This season lives in this browser tab/);
  // the Russian text translates the labels and memories, never the ids, the root or the links
  const ru = createPlayI18n('ru', { onMissing: () => {} });
  const rt = biographyText(b, (k, a) => renderMsg(ru, k, a), ru);
  assert.match(rt, /Сезон 793f6c05e89839f2/);
  assert.ok(rt.includes(ROOT) && rt.includes('https://testnet.nearblocks.io/txns/CommitTx'));
});

test('biography: a local season says so plainly; offline shows the recorded commit, never a verified one', () => {
  const i18n = createPlayI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
  const t = (k, a) => renderMsg(i18n, k, a);
  const local = biographyModel({ obs: obs({ seasonId: 'abcdef0123456789' }), nearStatus: { state: 'other-season', seasonId: 'abcdef0123456789' }, shards: { cards: [], judgeOnly: true }, deployment: DEPLOY });
  const L = biographyLines(local, t, i18n);
  assert.equal(L.chain.text, 'Local season, not committed on-chain');
  assert.equal(L.chain.href, null);
  assert.deepEqual(L.shards, []);
  assert.ok(!/✓ https/.test(biographyText(local, t, i18n)));
  const off = biographyLines(biographyModel({ obs: obs(), nearStatus: { state: 'offline', seasonId: SEASON }, deployment: DEPLOY }), t, i18n);
  assert.equal(off.chain.href, null);
  assert.match(off.chain.text, /Could not reach NEAR testnet/);
  assert.match(off.chain.recorded.text, /^Recorded commit transaction/);
  const empty = biographyText(biographyModel({ obs: { season: { seasonId: null, outcome: null }, memories: [], iris: { forgotten: [] } } }), t, i18n);
  assert.match(empty, /Remembered:\n— nothing/);
  assert.match(empty, /Season —/);
});

test('biography of a real local season: the room’s own observation goes through without a missing key', async () => {
  const tr = createLocalTransport({ seedHex: 'cc161d308faa67539af44205b56b6d4f' });
  let o = (await tr.observe()).body.observation;
  await tr.command({ actionId: 'bio-start', expectedVersion: o.version, type: 'start_season', args: {} });
  o = (await tr.observe()).body.observation;
  const forgettable = o.memories.find((m) => m.kind !== 'first');
  if (forgettable) await tr.command({ actionId: 'bio-forget', expectedVersion: o.version, type: 'sacrifice_memory', args: { memoryId: forgettable.id, purpose: 'vision' } });
  o = (await tr.observe()).body.observation;
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const missing = [];
    const i18n = createPlayI18n(loc, { onMissing: (k) => missing.push(k) });
    const text = biographyText(biographyModel({ obs: o }), (k, a) => renderMsg(i18n, k, a), i18n);
    assert.ok(text.includes(o.season.seasonId), loc);
    assert.ok(!text.includes('…\n✓') && !/\{[a-z]+\}/.test(text), loc + ': no raw placeholders');
    assert.deepEqual(missing, [], loc);
  }
});

test('local season notice: "Start a new season" asks first; only "Discard and restart" restarts; a fixed seed says so', () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
  let restarts = 0;
  const s = buildSeasonSection({ t: (k, a) => renderMsg(i18n, k, a), i18n, doc, onRestart: () => restarts++ });
  doc.body.append(s.el);
  assert.match(s.el.textContent, /This season lives in this browser tab; a refresh starts a new one\. Preferences and tutorial progress are kept\./);
  s.el.querySelector('[data-season="restart"]').click();
  assert.equal(restarts, 0, 'the first click only asks');
  assert.match(s.el.textContent, /Discard this season and start a new one\?/);
  assert.equal(doc.activeElement, s.el.querySelector('[data-season="keep"]'), '"Keep playing" has the focus');
  s.el.querySelector('[data-season="keep"]').click();
  assert.equal(restarts, 0);
  assert.equal(s.el.querySelector('[data-season="confirm"]'), null, 'kept: back to the single button');
  s.el.querySelector('[data-season="restart"]').click();
  s.el.querySelector('[data-season="confirm"]').click();
  assert.equal(restarts, 1);
  // the language follows the player's choice
  i18n.setLocale('uk');
  assert.match(s.el.textContent, /Цей сезон живе в цій вкладці браузера/);
  s.destroy();
  assert.equal(restartAskKey(true), 'season.restart.askFixed');
  assert.equal(fixedSeedFromSearch('?demo=judge&play=direct'), true);
  assert.equal(fixedSeedFromSearch('?seed=0123456789abcdef0123456789abcdef'), true);
  assert.equal(fixedSeedFromSearch('?seed=nope'), false);
  assert.equal(fixedSeedFromSearch(''), false);
  const fixed = buildSeasonSection({ t: (k, a) => renderMsg(i18n, k, a), i18n, doc, fixedSeed: true, onRestart: () => {} });
  i18n.setLocale('en');
  fixed.el.querySelector('[data-season="restart"]').click();
  assert.match(fixed.el.textContent, /fixed seed, so the same season starts again from trial 1/);
});
