// Loot chests in the browser: the leaf, Merkle root and draw random match the relayer's deck library; openChest end to end
// with a mock relayer and RPC; failures fall back with a reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leafOf, rootOf, drawRandomHex, checkOpening, openChest, _resetChestHealth, chestAvailable } from '../../src/net/chest.js';
import { generateKeyPair } from '../../src/net/near-tx.js';
import { buildDeck, commitment, leafHash, seasonSeed, drawRandom } from '../../../relayer/lib/chest-deck.js';
import { outcomeAt } from '../../../relayer/lib/chest.js';

const C = commitment('s1');

test('leaf, root and draw random agree with relayer/lib/chest-deck.js', async () => {
  const deck = buildDeck();
  for (const p of [0, 61, 999, 1000, 9999]) {
    const a = outcomeAt('s1', p);
    assert.equal(await leafOf('s1', p, a.outcome), leafHash('s1', deck[p]).toString('hex'));
    assert.equal(await rootOf(a.leaf, a.proof), C.root);
  }
  const seed = seasonSeed('ab'.repeat(65), Buffer.alloc(32, 1));
  assert.equal(await drawRandomHex(seed.toString('hex'), 7, '02'.repeat(32)), drawRandom(seed, 7, Buffer.alloc(32, 2)).toString('hex'));
});

function answerFor(position, index = 4) {
  const seed = 'cd'.repeat(32), br = 'ef'.repeat(32);
  const a = outcomeAt('s1', position);
  const random = drawRandom(Buffer.from(seed, 'hex'), index, Buffer.from(br, 'hex')).toString('hex');
  return { info: { season: 's1', root: C.root, seed: { seed } }, ans: { season: 's1', ...a, opening: { index, position, nft: position < 1000, token_id: position < 1000 ? 's1-' + index : null, random, block_random: br }, tx_hash: 'TX1' } };
}

test('checkOpening: true for an honest answer; false for a swapped outcome or random', async () => {
  const { info, ans } = answerFor(1234);
  assert.equal((await checkOpening(ans, info)).ok, true);
  assert.equal((await checkOpening({ ...ans, outcome: { ...ans.outcome, amount: 999 } }, info)).ok, false);
  assert.equal((await checkOpening({ ...ans, opening: { ...ans.opening, random: '00'.repeat(32) } }, info)).random_ok, false);
  assert.equal((await checkOpening(ans, { ...info, root: '11'.repeat(32) })).proof_ok, false);
});

test('openChest: verified result for the guest; reasons on failure', async () => {
  const kp = await generateKeyPair();
  const storage = { getItem: () => JSON.stringify({ minted: true, guest: { account_id: 'ann-1.guests.ftf-coordinator.testnet' }, playerKey: { secretKey: kp.secretKey } }) };
  const { info, ans } = answerFor(5);
  const dep = { chests: 'chests.ftf-coordinator.testnet', relayer: 'https://r.example' };
  let sent = null;
  const fetch = async (url, init) => {
    if (String(url).endsWith('/api/chest/open')) { sent = JSON.parse(init.body); return Response.json(ans); }
    return Response.json({ jsonrpc: '2.0', id: 'ftf', result: { result: [...Buffer.from(JSON.stringify(info))] } });
  };
  const r = await openChest({ storage, deployment: dep, base: dep.relayer, fetch, rpcUrls: ['http://rpc.test'] });
  assert.equal(r.ok, true); assert.equal(r.verified, true); assert.equal(r.outcome.kind, 'nft'); assert.equal(r.nft.token_id, 's1-4');
  assert.equal(sent.account_id, 'ann-1.guests.ftf-coordinator.testnet'); assert.match(sent.signature, /^[1-9A-HJ-NP-Za-km-z]{60,90}$/);
  assert.equal((await openChest({ storage: { getItem: () => null }, deployment: dep })).reason, 'need_guest');
  const busy = async () => Response.json({ error: 'daily_cap' }, { status: 429 });
  assert.equal((await openChest({ storage, deployment: dep, base: dep.relayer, fetch: busy })).reason, 'daily_cap');
  assert.equal((await openChest({ storage, deployment: dep, base: dep.relayer, fetch: async () => { throw new Error('x'); } })).reason, 'network');
  _resetChestHealth();
  assert.equal(await chestAvailable({ base: '' }), false);
});
