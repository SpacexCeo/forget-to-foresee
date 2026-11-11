// Holder access (src/net/holder.js, src/play/holder-panel.js, audit QW-6): a read-only NFT check unlocks cosmetic
// perks; a non-holder and an RPC failure unlock nothing and say why; the profile shows the perk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';
import { checkHolder, perksFor, isAccountId, loadHolder, saveHolder, holderContracts, JUDGE_ACCOUNT } from '../../src/net/holder.js';
import { createPlayI18n, PLAY_MESSAGES } from '../../src/play/i18n.js';

const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
/** A fake RPC: `held[contract]` lists tokens; `down` makes every call fail. */
function fakeFetch(held, { down = false } = {}) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body.params.account_id);
    if (down) throw new Error('offline');
    const args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString());
    const list = (held[body.params.account_id] || []).map((id) => ({ token_id: id, owner_id: args.account_id, metadata: { title: 'T ' + id } }));
    return { ok: true, json: async () => ({ result: { result: enc(list) } }) };
  };
  f.calls = calls; return f;
}

test('account ids and perks', () => {
  assert.ok(isAccountId(JUDGE_ACCOUNT)); assert.ok(isAccountId('a-1.guests.ftf-coordinator.testnet'));
  for (const s of ['', 'A.testnet', 'x', 'bad..id', 'a'.repeat(65)]) assert.equal(isAccountId(s), false, s);
  assert.deepEqual(perksFor([{ kind: 'shard' }, { kind: 'heroine' }]), { title: 'shardkeeper', perks: ['ring', 'elise'] });
  assert.deepEqual(perksFor([{ kind: 'agent' }]), { title: 'cardholder', perks: [] });
  assert.deepEqual(perksFor([]), { title: null, perks: [] });
  assert.deepEqual(holderContracts().map((c) => c.kind), ['shard', 'agent', 'heroine']);
});

test('holder, non-holder, RPC failure, invalid id', async () => {
  const held = { 'ftf-shards.testnet': ['s-7'], 'agents.ftf-coordinator.testnet': ['s-agent-iris'] };
  const r = await checkHolder(JUDGE_ACCOUNT, { fetch: fakeFetch(held) });
  assert.equal(r.state, 'holder'); assert.equal(r.title, 'shardkeeper'); assert.deepEqual(r.perks, ['ring']);
  assert.equal(r.tokens.length, 2); assert.match(r.tokens[0].href, /^https:\/\/testnet\.nearblocks\.io\/nft-token\/ftf-shards\.testnet\/s-7$/);
  assert.equal((await checkHolder('nobody.testnet', { fetch: fakeFetch({}) })).state, 'none');
  const off = await checkHolder('nobody.testnet', { fetch: fakeFetch({}, { down: true }) });
  assert.equal(off.state, 'offline'); assert.deepEqual(off.perks, []);
  const f = fakeFetch(held); assert.equal((await checkHolder('Not An Id', { fetch: f })).state, 'invalid'); assert.equal(f.calls.length, 0);
  const s = memoryStorage(); saveHolder(s, r); assert.equal(loadHolder(s).title, 'shardkeeper');
  saveHolder(s, { state: 'none' }); assert.equal(loadHolder(s), null);
});

test('the panel unlocks the perk, the profile shows it; non-holder clears it; five locales', async () => {
  const { doc } = installDom();
  const { holderSection } = await import('../../src/play/holder-panel.js');
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const storage = memoryStorage();
  let result = { state: 'holder', account: JUDGE_ACCOUNT, tokens: [{ kind: 'shard', contractId: 'ftf-shards.testnet', tokenId: 's-7', title: 'Shard 7', href: 'https://testnet.nearblocks.io/x' }], title: 'shardkeeper', perks: ['ring'] };
  const changes = [];
  const box = holderSection({ doc, t, storage, check: async () => result, onChange: (h) => changes.push(h) });
  const judge = box.querySelectorAll('button').find((b) => b.dataset.judge === '1');
  judge.click(); await new Promise((r) => setTimeout(r, 0));
  assert.match(box.textContent, /Unlocked: Shard keeper/);
  assert.equal(loadHolder(storage).account, JUDGE_ACCOUNT); assert.equal(changes.at(-1).title, 'shardkeeper');
  result = { state: 'offline', tokens: [], perks: [], title: null };
  judge.click(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(loadHolder(storage), 'an RPC failure keeps the earlier perk and invents nothing');
  result = { state: 'none', account: 'x.testnet', tokens: [], perks: [], title: null };
  judge.click(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(loadHolder(storage), null); assert.match(box.textContent, /holds no Forget to Foresee NFT/);
  for (const loc of Object.keys(PLAY_MESSAGES)) for (const k of ['holder.heading', 'holder.note', 'holder.unlocked', 'holder.title.shardkeeper', 'holder.title.cardholder', 'holder.title.elise']) assert.ok(PLAY_MESSAGES[loc][k], loc + ' ' + k);
});
