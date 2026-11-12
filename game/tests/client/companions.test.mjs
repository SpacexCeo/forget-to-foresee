// Dragon companions (docs/companion-nft-plan.md): the kind of a token, the heroine token's account, and the read of
// the dragons it owns (a fake RPC); nothing flies without a confirmed token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragonKind, heroineAccount, readCompanions } from '../../src/net/companions.js';

const rpc = (value) => async (url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(body.params.account_id, 'companions.ftf-coordinator.testnet');
  assert.equal(body.params.method_name, 'nft_tokens_for_owner');
  const args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString());
  assert.equal(args.account_id, '7.heroine.ftf-coordinator.testnet');
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { result: [...Buffer.from(JSON.stringify(value))], block_height: 1, block_hash: 'h' } }) };
};

test('kinds from metadata.extra, the title or the id', () => {
  assert.equal(dragonKind({ token_id: 'd1', metadata: { extra: '{"kind":"rill"}' } }), 'rill');
  assert.equal(dragonKind({ token_id: 'd2', metadata: { title: 'Cinder, amber ember' } }), 'cinder');
  assert.equal(dragonKind({ token_id: 'nacre-3', metadata: {} }), 'nacre');
  assert.equal(dragonKind({ token_id: 'x', metadata: { title: 'A hat' } }), null);
  assert.equal(heroineAccount('7'), '7.heroine.ftf-coordinator.testnet');
  assert.equal(heroineAccount(null), null);
});

test('the read lists only dragons the heroine account holds; no heroine, no read', async () => {
  assert.deepEqual(await readCompanions({ tokenId: null }), { state: 'none' });
  const r = await readCompanions({ tokenId: '7', rpcUrls: ['https://rpc.example'], fetch: rpc([{ token_id: 'nacre-1', owner_id: '7.heroine.ftf-coordinator.testnet', metadata: { title: 'Nacre' } }, { token_id: 'hat', metadata: { title: 'Hat' } }]) });
  assert.equal(r.state, 'loaded');
  assert.deepEqual(r.dragons.map((d) => d.kind), ['nacre']);
  assert.match(r.dragons[0].href, /nft-token\/companions\.ftf-coordinator\.testnet\/nacre-1$/);
  const off = await readCompanions({ tokenId: '7', rpcUrls: ['https://rpc.example'], fetch: async () => { throw new Error('down'); } });
  assert.equal(off.state, 'offline');
});
