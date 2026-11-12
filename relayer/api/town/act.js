// The player's moves in the town economy (lib/town-act.js; docs/town-act.md):
//   GET  /api/town/act?account_id=<guest>  -> {registered, silk, credit, staked, deeds: [{token_id, asset, principal, tier,
//        state, locked_until_day, unbond_ready_day, claimable}], limits: {today, per_day, all_today, all_per_day}, day,
//        season_id, entered, entry_fee, season {id, entered, entrants, purse}, works, pools, rate_7d_per_100, params, configured, contract}
//   GET  /api/town/act?account_id=<guest>&trader=<stall> -> {stall, position {amount, claimable}, trader_silk, open, close_below, reopen_at}
//   POST /api/town/act {account_id, public_key, at, action, args, signature}
//        signature over "ftf-town-act|<account>|<action>|<args in order, joined by ','>|<at>"
//        actions: pledge {asset 0-3, amount µsilk, tier 0-3} · claim {token_id} · unbond {token_id} · exit_early {token_id}
//                 invest_stall {trader, amount µsilk} · claim_stall {trader} · enter_tournament {season_id}
//        -> {ok, action, tx_hash, request_hash, result, silk, credit, contract}
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../../lib/core.js';
import { createTxClient } from '../../lib/near-tx.js';
import { createReplayGuard } from '../../lib/chest.js';
import { townGateEnv, createCreditLedger, queuedClient } from '../../lib/town-gate.js';
import { validateAct, actFor } from '../../lib/town-act.js';
import { jsonlLog } from '../../market/index.js';
import { BANKRUPT_SILK, REOPEN_SILK } from '../../market/prices.js';
import { join } from 'node:path';

const bucket = createBucket({ capacity: 10, refillMs: 60 * 1000 });
const replay = createReplayGuard(15 * 60 * 1000);
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

/** What the game's windows show for one guest, read from the chain. */
export async function actState(client, town, acc) {
  const [row, pulse, owned, limits, pools, params] = await Promise.all([
    client.view(town, 'balance_of', { account_id: acc }), client.view(town, 'pulse', {}),
    client.view(town, 'nft_tokens_for_owner', { account_id: acc, from_index: '0', limit: 20 }).catch(() => []),
    client.view(town, 'act_limits', { account_id: acc }).catch(() => null),
    client.view(town, 'stake_pools', {}).catch(() => null), client.view(town, 'params', {}).catch(() => null),
  ]);
  const deeds = [];
  for (const tk of owned || []) {
    const d = await client.view(town, 'get_deed', { token_id: tk.token_id }).catch(() => null);
    if (d) deeds.push({ token_id: tk.token_id, asset: d[1].asset, principal: String(d[1].principal), tier: d[1].tier, state: d[1].state, locked_until_day: d[1].locked_until_day, unbond_ready_day: d[1].unbond_ready_day, claimable: String(d[2]) });
  }
  const season = pulse && pulse.season_id ? pulse.season_id : null;
  const entered = season ? !!(await client.view(town, 'has_entered', { season_id: season, account_id: acc }).catch(() => false)) : false;
  return {
    registered: !!row, silk: row ? String(row.silk) : '0', credit: row ? String(row.credit) : '0', staked: row ? String(row.staked) : '0', deeds,
    limits: limits ? { today: limits[0], per_day: limits[1], all_today: String(limits[2]), all_per_day: String(limits[3]) } : null,
    day: pulse ? pulse.day : null, season_id: season, entered, entry_fee: pulse ? pulse.entry_fee : null, paused: pulse ? pulse.paused : null,
    season: season ? { id: season, entered, entrants: pulse.season_entrants, purse: pulse.purse } : null,
    works: ['loom', 'caravan', 'archive', 'observatory'], pools, rate_7d_per_100: pulse ? pulse.rate_7d_per_100 : null,
    params: params ? { lock_days: params.lock_days, lock_mult_bps: params.lock_mult_bps, cooldown_days: params.cooldown_days, deed_fee: String(params.deed_fee), min_trade: String(params.min_trade), entry_fee: String(params.entry_fee), early_exit_bps: params.early_exit_bps, stall_fee_bps: params.stall_fee_bps } : null,
  };
}

/** One stall for the "Invest in this stall" panel: its pool, the guest's position, and whether it trades. A stall
 *  closes below 40 silk and reopens at 120 (market/prices.js); between the two it keeps its last state (null here). */
export async function stallState(client, town, trader, acc) {
  const [stall, position, row] = await Promise.all([
    client.view(town, 'stall_of', { trader }), acc ? client.view(town, 'stall_position', { trader, investor: acc }).catch(() => null) : null,
    client.view(town, 'balance_of', { account_id: trader }),
  ]);
  const silk = row ? Number(BigInt(row.silk) / 1_000_000n) : 0;
  return { trader, stall, position: position ? { amount: String(position[0].amount), claimable: String(position[1]) } : null, trader_silk: row ? String(row.silk) : '0',
    open: silk >= REOPEN_SILK ? true : silk < BANKRUPT_SILK ? false : null, close_below: BANKRUPT_SILK, reopen_at: REOPEN_SILK };
}

export function townActHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), gcfg = townGateEnv(env);
    if (cors(req, res, cfg.origins)) return;
    const client = opts.client || queuedClient(createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 30_000 }));
    const configured = !!(gcfg.coord && gcfg.coordKey);
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, acc = q.get('account_id') || '', trader = q.get('trader');
      if (!/^[a-z0-9._-]{2,64}$/.test(acc)) return json(res, 400, { error: 'bad_account' });
      if (trader != null && !/^[a-z0-9._-]{2,64}$/.test(trader)) return json(res, 400, { error: 'bad_trader' });
      try {
        if (trader) return json(res, 200, { ...(await stallState(client, gcfg.town, trader, acc)), configured, contract: gcfg.town });
        return json(res, 200, { ...(await actState(client, gcfg.town, acc)), configured, contract: gcfg.town });
      } catch { return json(res, 502, { error: 'rpc' }); }
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (!configured) return json(res, 503, { error: 'town_act_not_configured' });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const v = validateAct(await readBody(req), opts.now ? opts.now() : Date.now());
    if (!v.ok) return json(res, 400, { error: v.error });
    const deps = { client, cfg: gcfg, ledger: opts.ledger || createCreditLedger(join(gcfg.dataDir, 'town-credits')), replay: opts.replay || replay, log: jsonlLog(join(gcfg.dataDir, 'town-act')), key: opts.key, loadLog: opts.loadLog, now: opts.now };
    try { const r = await actFor(v, deps); return json(res, r.status, r.body); } catch (e) { return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default townActHandler();
