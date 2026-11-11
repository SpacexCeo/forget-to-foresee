// The shard card's history timeline (feature 8): built from public card fields only, a preview never carries a link
// or a "minted" step, a real token links its mint and its revealed sign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shardTimeline } from '../../src/ui/world-hud/shard-card-model.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';

const preview = { state: 'preview', ownerClan: 'iris', kind: 'call', weight: 2, forgottenAt: 4, closesAt: 6, winner: 'salt', price: 12, leaf: null, owner: null, tokenHref: null, mintTxHref: null };
const minted = { ...preview, state: 'minted', owner: 'lambada_eth.testnet', leaf: { index: 3, href: 'https://testnet.nearblocks.io/txns/R' }, mintTxHref: 'https://testnet.nearblocks.io/txns/M', tokenHref: 'https://testnet.nearblocks.io/nft-token/x/1' };

test('a preview: forgotten, auctioned, sold, unminted; no links', () => {
  const s = shardTimeline(preview);
  assert.deepEqual(s.map((x) => x.id), ['forgotten', 'auction', 'sold', 'unminted']);
  assert.ok(s.every((x) => x.href === null));
  assert.deepEqual(s[2].args, { clan: 'salt', price: 12 });
  assert.equal(s[2].trial, 6);
});

test('a burned shard says so', () => {
  assert.deepEqual(shardTimeline({ ...preview, winner: null }).map((x) => x.id), ['forgotten', 'auction', 'burned', 'unminted']);
});

test('a real token: the revealed sign and the mint, each with its explorer link', () => {
  const s = shardTimeline(minted);
  assert.deepEqual(s.map((x) => x.id), ['forgotten', 'auction', 'sold', 'vision', 'minted']);
  assert.equal(s[3].href, minted.leaf.href);
  assert.equal(s[4].href, minted.mintTxHref);
  assert.equal(s[4].args.owner, 'lambada_eth.testnet');
  assert.deepEqual(shardTimeline(null), []);
});

test('every step renders in all five locales', () => {
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = createPlayI18n(loc);
    for (const st of shardTimeline(minted).concat(shardTimeline({ ...preview, winner: null }))) {
      const out = renderMsg(m, st.key, st.args);
      assert.ok(out && out !== st.key && !/[{}]/.test(out), `${loc} ${st.key}: ${out}`);
    }
    assert.ok(!/[{}]/.test(renderMsg(m, 'shard.tl.trial', { trial: 4 })));
    assert.notEqual(renderMsg(m, 'shard.tl.heading'), 'shard.tl.heading');
  }
});
