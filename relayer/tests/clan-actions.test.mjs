import test from 'node:test';
import assert from 'node:assert/strict';
import { planClanAction, runClanRound, CLAN_WORKS } from '../lib/clan-actions.js';
import { CLAN_WALLETS, clanAccount, CLAN_METHODS } from '../market/catalog.js';

const M = 1_000_000;
const base = { clan: 'frost', silk: 1_000 * M, staked: 0, entered: true, seasonId: 's1', entryFee: 40 * M, deeds: [], cap: 800 * M };

test('clan wallets: claim first, then the tournament, then a pledge sized by the strategy; methods stay inside the key', () => {
  assert.deepEqual(planClanAction({ ...base, deeds: [{ token_id: 'deed-s1-3', claimable: 2 * M }] }), { method: 'claim', args: { token_id: 'deed-s1-3' } });
  assert.deepEqual(planClanAction({ ...base, entered: false }), { method: 'enter_tournament', args: { season_id: 's1' } });
  const p = planClanAction(base, { risk: 1 });
  assert.deepEqual(p, { method: 'stake', args: { asset: CLAN_WORKS.frost, amount: String(300 * M), tier: 1 } });
  assert.equal(planClanAction(base, { risk: 1.5 }).args.amount, String(450 * M));
  assert.equal(planClanAction(base, { risk: 0.5 }).args.tier, 0);
  assert.equal(planClanAction({ ...base, staked: 300 * M, silk: 700 * M }, { risk: 1 }), null); // at its target
  assert.equal(planClanAction({ ...base, silk: 100 * M }), null); // keeps silk for the next entry
  for (const a of [planClanAction(base), planClanAction({ ...base, entered: false })]) assert.ok(CLAN_METHODS.includes(a.method));
  assert.equal(CLAN_WALLETS.length, 6); assert.equal(clanAccount('salt'), 'clan-salt.ftf-town.testnet');
});

test('clan wallets: a dry round reads each wallet and signs nothing', async () => {
  const calls = [];
  const client = {
    async view(c, m, a) { calls.push(m); if (m === 'balances_of') return [{ silk: String(1_000 * M), staked: '0' }]; if (m === 'pulse') return { season_id: 's1', entry_fee: String(40 * M), tvl_staked: '0' }; if (m === 'nft_tokens_for_owner') return []; if (m === 'has_entered') return false; return null; },
    async call() { throw new Error('must not sign in a dry run'); },
  };
  const wallets = CLAN_WALLETS.map((key) => ({ key, account: clanAccount(key), secretKey: null }));
  const out = await runClanRound({ client, town: 'ftf-town.testnet', wallets });
  assert.equal(out.length, 6);
  assert.ok(out.every((e) => e.dry && e.action && e.action.method === 'enter_tournament'));
});
