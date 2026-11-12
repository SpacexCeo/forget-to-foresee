// The clans' own wallets (owner, 12.11): clan-<clan>.ftf-town.testnet pledge silk to the town works, enter the
// season's tournament and claim their rewards, each from its own account with a function-call key limited to the
// town contract's game methods (market/catalog.js CLAN_METHODS). The clan's current strategy (lib/clan-strategy.js:
// LLM-chosen or scripted) only sets how bold it is; the rules below make every move. Dry run unless FTF_TOWN_SEND=1.
import { importSecretKey } from './near-tx.js';

/** Which works each clan favours (lore: Iris is a linguist, Frost watches the Shells, Salt runs caravans…). */
export const CLAN_WORKS = Object.freeze({ salt: 1, ash: 0, moss: 2, amber: 0, frost: 3, iris: 2 });
const MICRO = 1_000_000;
export const ACTION_GAS = 30_000_000_000_000n;

/**
 * What a clan wallet does now (pure): at most one action per round, in priority order — claim a deed's reward,
 * enter the open season's tournament, pledge a share of its free silk.
 * @param {{clan, silk, staked, entered, seasonId, entryFee, deeds: [{token_id, claimable}], cap}} v  (silk in micro-units)
 * @param {{risk?: number}} strat
 */
export function planClanAction(v, strat = null) {
  const risk = strat ? Math.max(0.5, Math.min(1.5, Number(strat.risk) || 1)) : 1;
  const ripe = (v.deeds || []).find((d) => d.claimable >= 1 * MICRO);
  if (ripe) return { method: 'claim', args: { token_id: ripe.token_id } };
  if (v.seasonId && !v.entered && v.silk >= 3 * v.entryFee) return { method: 'enter_tournament', args: { season_id: v.seasonId } };
  const target = Math.floor(Math.min(v.cap, (v.silk + v.staked) * 0.3 * risk));
  const amount = Math.floor((target - v.staked) / MICRO) * MICRO;
  if (amount >= 20 * MICRO && v.silk - amount >= 3 * v.entryFee) return { method: 'stake', args: { asset: CLAN_WORKS[v.clan] ?? 0, amount: String(amount), tier: risk > 1.2 ? 2 : risk > 0.9 ? 1 : 0 } };
  return null;
}

/** Reads a clan wallet's view of the contract. */
export async function clanView(client, town, w) {
  const [rows, pulse, tokens] = await Promise.all([
    client.view(town, 'balances_of', { account_ids: [w.account] }), client.view(town, 'pulse'), client.view(town, 'nft_tokens_for_owner', { account_id: w.account, from_index: '0', limit: 20 }),
  ]);
  const row = (rows && rows[0]) || { silk: '0', staked: '0' };
  const seasonId = (pulse && pulse.season_id) || '';
  const entered = seasonId ? await client.view(town, 'has_entered', { season_id: seasonId, account_id: w.account }) : true;
  const deeds = [];
  for (const t of tokens || []) { const d = await client.view(town, 'get_deed', { token_id: t.token_id }); if (d) deeds.push({ token_id: t.token_id, claimable: Number(d[2]) }); }
  const tvl = Number((pulse && pulse.tvl_staked) || 0);
  const cap = Math.min(8_000 * MICRO, Math.max(800 * MICRO, Math.floor(tvl * 0.05)));
  return { clan: w.key, silk: Number(row.silk), staked: Number(row.staked), entered: !!entered, seasonId, entryFee: Number((pulse && pulse.entry_fee) || 40 * MICRO), deeds, cap };
}

/** One round over the clan wallets; returns the journal entries. `send` false = dry run (nothing signed). */
export async function runClanRound({ client, town, wallets, strategyOf = () => null, send = false, log = () => {}, now = () => Date.now() }) {
  const out = [];
  for (const w of wallets) {
    let entry;
    try {
      const v = await clanView(client, town, w);
      const act = planClanAction(v, strategyOf(w.key));
      entry = { at: now(), clan: w.key, account: w.account, action: act, dry: !send };
      if (act && send) {
        const key = await importSecretKey(w.secretKey);
        const r = await client.call({ key, signerId: w.account, receiverId: town, methodName: act.method, args: act.args, gas: ACTION_GAS, deposit: 0n });
        entry.ok = r.ok; entry.hash = r.hash; if (!r.ok) entry.failure = r.failure;
      }
    } catch (e) { entry = { at: now(), clan: w.key, account: w.account, error: String((e && e.message) || e).slice(0, 160) }; }
    out.push(entry); try { log(entry); } catch { /* disk full */ }
  }
  return out;
}
