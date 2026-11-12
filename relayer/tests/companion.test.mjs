import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClaim, companionMessage, claimCompanion, dragonKinds, dragonTokenId, bossDown, DRAGON_KINDS } from '../lib/companion.js';
import { makeEntry } from '../lib/expedition-rules/expedition-log.js';
import { generateKeyPair, importSecretKey, b58encode } from '../lib/near-tx.js';

const NOW = Date.UTC(2026, 10, 13, 12);
const ACC = 'lambada-1a.guests.ftf-coordinator.testnet', TOKEN = 'elise-lambada-1a';
function logOf(entries) { const log = []; for (const e of entries) log.push(makeEntry(log, e)); return log; }
const BOSS_LOG = logOf([{ t: 1, kind: 'quest_accepted', data: { questId: 'q_boss' } }, { t: 2, kind: 'kill_ticketed', data: { mob: 'crownrift', killId: 'k1' }, silkC: 20_000, trust: 'T2' }]);
const NO_BOSS = logOf([{ t: 1, kind: 'kill_ticketed', data: { mob: 'skitter', killId: 'k1' }, silkC: 600, trust: 'T2' }]);

async function signed(reason, { at = NOW, account = ACC } = {}) {
  const key = await importSecretKey((await generateKeyPair()).secretKey);
  const signature = b58encode(await key.sign(new TextEncoder().encode(companionMessage(account, at, reason))));
  return { body: { account_id: account, public_key: key.publicKey, at, signature, reason }, key };
}
function chain({ guest = { account_id: ACC, token_id: TOKEN, minted: true }, failMint = null } = {}) {
  const calls = [], tokens = new Map(), st = { only: null };
  return { calls, tokens, st, client: {
    async view(c, m, a) {
      if (m === 'guest_of') return st.only && a.public_key !== st.only ? null : guest;
      if (m === 'nft_token') return tokens.get(a.token_id) || null;
      throw new Error(m);
    },
    async rpc(m, p) { if (p.account_id !== ACC) throw new Error('UNKNOWN'); return {}; },
    async call({ signerId, receiverId, methodName, args }) {
      calls.push({ signerId, receiverId, methodName, args });
      if (failMint) return { ok: false, failure: failMint, hash: 'TXF' };
      tokens.set(args.token_id, { token_id: args.token_id, owner_id: args.receiver_id, metadata: args.metadata });
      return { ok: true, hash: 'TX' + calls.length };
    },
  } };
}
const cfg = { secretKey: 'x', companions: 'companions.ftf-coordinator.testnet', heroine: 'heroine.ftf-coordinator.testnet', guests: 'guests.ftf-coordinator.testnet', logDir: '/x' };
const deps = (c, extra = {}) => ({ cfg, client: c.client, key: {}, loadLog: () => BOSS_LOG, ...extra });

test('companion: kinds are seeded by the account, the boss dragon is another kind, token ids are fixed per heroine', async () => {
  const a = await dragonKinds(ACC), b = await dragonKinds(ACC);
  assert.deepEqual(a, b); assert.ok(DRAGON_KINDS.includes(a.welcome)); assert.ok(DRAGON_KINDS.includes(a.boss)); assert.notEqual(a.welcome, a.boss);
  const seen = new Set(); for (let i = 0; i < 60; i++) seen.add((await dragonKinds(`g-${i}.guests.testnet`)).welcome);
  assert.equal(seen.size, 3); // all three kinds occur
  assert.equal(dragonTokenId(TOKEN, 'welcome'), 'dragon-lambada-1a');
  assert.equal(dragonTokenId(TOKEN, 'boss'), 'crown-dragon-lambada-1a');
});

test('companion: the boss counts only from a verified log with a crownrift kill or the boss quest ready', () => {
  assert.equal(bossDown(BOSS_LOG), true);
  assert.equal(bossDown(NO_BOSS), false);
  assert.equal(bossDown(logOf([{ t: 1, kind: 'quest_ready', data: { questId: 'q_boss' } }])), true);
  const forged = BOSS_LOG.map((e) => ({ ...e })); forged[1].data = { mob: 'crownrift', killId: 'k2' };
  assert.equal(bossDown(forged), false); // the hash chain breaks
  assert.equal(bossDown(null), false);
});

test('companion: welcome mints one dragon to the heroine token account, once', async () => {
  const c = chain(); const { body } = await signed('welcome'); c.st.only = body.public_key;
  const v = validateClaim(body, NOW); assert.ok(v.ok);
  const r1 = await claimCompanion(v, deps(c));
  assert.equal(r1.status, 200); assert.equal(r1.body.already, false); assert.equal(r1.body.tx_hash, 'TX1');
  assert.equal(r1.body.owner_id, `${TOKEN}.heroine.ftf-coordinator.testnet`);
  const call = c.calls[0];
  assert.equal(call.methodName, 'nft_mint'); assert.equal(call.signerId, cfg.companions); assert.equal(call.receiverId, cfg.companions);
  assert.equal(JSON.parse(call.args.metadata.extra).kind, (await dragonKinds(ACC)).welcome);
  const r2 = await claimCompanion(validateClaim((await signed('welcome')).body, NOW), deps(c));
  assert.equal(r2.status, 403); // another key is not this guest's
  const r3 = await claimCompanion(v, deps(c));
  assert.equal(r3.status, 200); assert.equal(r3.body.already, true); assert.equal(c.calls.length, 1); // no second mint
});

test('companion: boss needs the boss down in the stored log, then mints the second kind', async () => {
  const c = chain(); const v = validateClaim((await signed('boss')).body, NOW);
  const no = await claimCompanion(v, deps(c, { loadLog: () => NO_BOSS }));
  assert.equal(no.status, 409); assert.equal(no.body.error, 'boss_not_down'); assert.equal(c.calls.length, 0);
  const none = await claimCompanion(v, deps(c, { loadLog: () => null }));
  assert.equal(none.status, 409);
  const ok = await claimCompanion(v, deps(c));
  assert.equal(ok.status, 200); assert.equal(ok.body.token_id, 'crown-dragon-lambada-1a'); assert.equal(ok.body.kind, (await dragonKinds(ACC)).boss);
});

test('companion: refusals — bad signature, stale, no heroine yet, not configured, not a minter', async () => {
  const { body } = await signed('welcome');
  assert.equal(validateClaim({ ...body, at: NOW - 10 * 60 * 1000 }, NOW).error, 'stale');
  assert.equal(validateClaim({ ...body, reason: 'gift' }, NOW).error, 'bad_reason');
  const tampered = validateClaim({ ...body, reason: 'boss' }, NOW);
  assert.equal((await claimCompanion(tampered, deps(chain()))).status, 401);
  const v = validateClaim(body, NOW);
  assert.equal((await claimCompanion(v, deps(chain({ guest: { account_id: ACC, token_id: TOKEN, minted: false } })))).body.error, 'no_heroine');
  assert.equal((await claimCompanion(v, { ...deps(chain()), key: null, cfg: { ...cfg, secretKey: '' } })).status, 503);
  const r = await claimCompanion(v, deps(chain({ failMint: 'Smart contract panicked: ERR_NOT_MINTER: only an authorized minter can mint' })));
  assert.equal(r.status, 502); assert.equal(r.body.error, 'not_minter');
});
