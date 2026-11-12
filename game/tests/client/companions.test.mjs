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

// Dragon claims (net/companion-claim.js): signed by the guest key, remembered once confirmed, never invented.
test('a dragon claim signs the reason with the guest key, is remembered once confirmed, and refuses without a guest', async () => {
  const { claimCompanion, claimed, bossInLog } = await import('../../src/net/companion-claim.js');
  const { generateKeyPair } = await import('../../src/net/near-tx.js');
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  assert.deepEqual(await claimCompanion({ reason: 'welcome', storage, base: 'https://r.example' }), { ok: false, reason: 'need_guest' });
  const kp = await generateKeyPair();
  storage.setItem('ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann-1.guests.testnet', token_id: 'elise-ann-1' }, playerKey: { secretKey: kp.secretKey } }));
  const sent = [];
  const fetch = async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ kind: 'rill', token_id: 'dragon-ann-1', owner_id: 'elise-ann-1.heroine.testnet', tx_hash: 'TX', already: false }) }; };
  const r = await claimCompanion({ reason: 'welcome', storage, base: 'https://r.example', fetch, now: () => 5 });
  assert.equal(r.ok, true); assert.equal(r.kind, 'rill');
  assert.equal(sent[0][0], 'https://r.example/api/companion/claim');
  assert.equal(sent[0][1].reason, 'welcome'); assert.equal(sent[0][1].at, 5); assert.equal(sent[0][1].account_id, 'ann-1.guests.testnet');
  assert.equal(claimed(storage, 'welcome'), true); assert.equal(claimed(storage, 'boss'), false);
  assert.equal((await claimCompanion({ reason: 'welcome', storage, base: 'https://r.example', fetch })).cached, true); assert.equal(sent.length, 1);
  const refuse = async () => ({ ok: false, json: async () => ({ error: 'boss_not_down' }) });
  assert.deepEqual(await claimCompanion({ reason: 'boss', storage, base: 'https://r.example', fetch: refuse }), { ok: false, reason: 'boss_not_down' });
  assert.equal(claimed(storage, 'boss'), false);
  assert.equal(bossInLog([{ kind: 'kill_ticketed', data: { mob: 'crownrift' } }]), true);
  assert.equal(bossInLog([{ kind: 'kill_ticketed', data: { mob: 'skitter' } }]), false);
});
