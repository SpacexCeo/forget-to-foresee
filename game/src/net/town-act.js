// The player's side of the town economy on chain (docs/town-economy.md, docs/town-act.md), through the relayer, like
// the portal gate (net/town-gate.js): a guest's browser key is a function-call key of the guests contract and cannot
// sign to ftf-town, so the guest signs a request and the relayer, a town coordinator, calls the matching *_for method.
//
//   GET  /api/town/act?account_id=            -> {registered, silk, deeds, pools, rate_7d_per_100, params, season, day, paused, configured}
//   GET  /api/town/act?account_id=&trader=    -> {stall, position, trader_silk, open (null between the lines), close_below, reopen_at}
//   POST /api/town/act {account_id, public_key, at, action, args, signature} -> {ok, tx_hash, result, silk} | {error}
//
// The signed text is "ftf-town-act|<account>|<action>|<the action's fields in order, joined by ','>|<at>"; amounts are
// micro-silk decimal strings. Words: pledge, reward share, rate (variable, can be zero). Every failure resolves to
// {ok: false, reason}; a relayer or contract not ready yet is 'not_available', never a simulated success.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

export const UNIT = 1_000_000;
export const WORKS = Object.freeze(['loom', 'caravan', 'archive', 'observatory']);
export const TIERS = Object.freeze([0, 1, 2, 3]);
export const ACTIONS = Object.freeze({
  pledge: ['asset', 'amount', 'tier'], claim: ['token_id'], unbond: ['token_id'], exit_early: ['token_id'],
  invest_stall: ['trader', 'amount'], claim_stall: ['trader'], enter_tournament: ['season_id'],
});
/** Which ftf-town trader account keeps each stall keeper's stall (relayer market/catalog.js traderAccount). */
export const STALL_TRADER = Object.freeze({ guard: 'trader-01.ftf-town.testnet', shardkeeper: 'trader-02.ftf-town.testnet', shrinekeeper: 'trader-06.ftf-town.testnet' });
const REASON = Object.freeze({
  not_enough_silk: 'no_silk', locked: 'locked', cooling_down: 'not_ready', pledge_cap: 'cap', too_small: 'min_trade',
  already_entered: 'entered', no_open_season: 'season', no_stall: 'no_stall', paused: 'paused', not_your_deed: 'not_owner', wrong_state: 'state', no_exit_yet: 'state',
  daily_limit: 'daily', rate_limited: 'rate', replayed: 'retry', stale: 'retry', not_your_key: 'need_guest', not_registered: 'not_registered',
  town_act_not_configured: 'not_available', contract_not_upgraded: 'not_available', bad_args: 'bad_args', act_failed: 'tx_failed',
});

/** Whole silk (number or string) -> micro-silk decimal string; null when not a positive amount. */
export function toMicro(silk) {
  const s = String(silk ?? '').trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const v = (BigInt(w) * BigInt(UNIT) + BigInt((f + '000000').slice(0, 6))).toString();
  return v === '0' ? null : v;
}
/** micro-silk -> silk text with up to two decimals. */
export const silkOf = (micro) => { try { const n = BigInt(String(micro || '0')); return (Number(n / 10_000n) / 100).toFixed(2).replace(/\.00$/, ''); } catch { return '0'; } };

/** The args object for an action, with exactly its keys in signing order; null when a key is missing or malformed. */
export function canonicalArgs(action, args = {}) {
  const keys = ACTIONS[action];
  if (!keys) return null;
  const out = {};
  for (const k of keys) {
    const v = args[k];
    if (k === 'amount') { if (!/^[1-9]\d{0,30}$/.test(String(v))) return null; out[k] = String(v); }
    else if (k === 'asset' || k === 'tier') { if (!Number.isInteger(v) || v < 0 || v > 3) return null; out[k] = v; }
    else if (k === 'trader') { if (!/^[a-z0-9._-]{2,64}$/.test(String(v))) return null; out[k] = String(v); }
    else { if (typeof v !== 'string' || !v || v.length > 64) return null; out[k] = v; }
  }
  return out;
}
export const actMessage = (accountId, action, args, at) => `ftf-town-act|${accountId}|${action}|${(ACTIONS[action] || []).map((k) => String(args[k])).join(',')}|${at}`;

const base0 = (b) => (b ? String(b).replace(/\/$/, '') : null);
async function getJson(fetch, url) {
  const r = await fetch(url);
  if (r.status === 404 || r.status === 503) return { ok: false, reason: 'not_available' };
  if (!r.ok) return { ok: false, reason: 'network' };
  return { ok: true, body: await r.json() };
}

/** The relayer's town read for one account, checked for shape (amounts stay micro-silk strings). */
export function readMe(b) {
  if (!b || typeof b !== 'object') return null;
  const pools = Array.isArray(b.pools) ? b.pools.slice(0, 4) : [];
  const rates = Array.isArray(b.rate_7d_per_100) ? b.rate_7d_per_100 : [];
  const works = WORKS.map((id, i) => ({ id, principal: String((pools[i] && pools[i].principal) || '0'), rate: String(rates[i] || '0') }));
  const deeds = (Array.isArray(b.deeds) ? b.deeds : []).filter((d) => d && typeof d.token_id === 'string').slice(0, 50).map((d) => ({
    id: d.token_id, asset: Number(d.asset) | 0, principal: String(d.principal || '0'), tier: Number(d.tier) | 0,
    state: Number(d.state) === 1 ? 'unbonding' : 'active', lockedUntil: Number(d.locked_until_day) || 0, readyDay: Number(d.unbond_ready_day) || 0,
    claimable: String(d.claimable || '0'),
  }));
  const p = b.params || {};
  const s = b.season || {};
  const lim = b.limits || {};
  return {
    registered: !!b.registered, configured: b.configured !== false, silk: String(b.silk || '0'), day: Number(b.day) || 0, paused: !!b.paused, works, deeds,
    limits: { today: Number(lim.today) || 0, perDay: Number(lim.per_day) || 0 },
    params: { lockDays: Array.isArray(p.lock_days) ? p.lock_days.map(Number) : [], multBps: Array.isArray(p.lock_mult_bps) ? p.lock_mult_bps.map(Number) : [], cooldown: Number(p.cooldown_days) || 0, deedFee: String(p.deed_fee || '0'), minTrade: String(p.min_trade || '0'), entryFee: String(p.entry_fee || b.entry_fee || '0') },
    season: { id: typeof s.id === 'string' ? s.id : (b.season_id || ''), entered: !!(s.entered ?? b.entered), entrants: Number(s.entrants) || 0, purse: String(s.purse || '0') },
  };
}

/** What the player can do with a deed today: 'claim' | 'begin_unbond' | 'finish_unbond' each with a reason when not. */
export function deedActions(d, day) {
  return {
    claim: d.state === 'active' && BigInt(d.claimable || '0') > 0n,
    begin_unbond: d.state === 'active' && day >= d.lockedUntil,   // both send 'unbond' (the contract's unbond_for begins or finishes)
    finish_unbond: d.state === 'unbonding' && day >= d.readyDay,
  };
}

/**
 * @param {{storage: object, base?: string, fetch?: Function, now?: () => number, flush?: () => Promise}} o
 */
export function createTownAct({ storage, base = relayerUrl(), fetch = globalThis.fetch, now = () => Date.now(), flush = null } = {}) {
  const url = base0(base);
  return {
    guest: () => guestFrom(storage),
    get configured() { return !!url; },
    /** The player's town state: {ok, me} | {ok: false, reason}. */
    async me() {
      const g = guestFrom(storage);
      if (!g) return { ok: false, reason: 'need_guest' };
      if (!url) return { ok: false, reason: 'not_available' };
      try { const r = await getJson(fetch, `${url}/api/town/act?account_id=${encodeURIComponent(g.accountId)}`); if (!r.ok) return r; const me = readMe(r.body); if (!me) return { ok: false, reason: 'network' }; if (!me.configured) return { ok: false, reason: 'not_available' }; return { ok: true, me }; }
      catch { return { ok: false, reason: 'network' }; }
    },
    /** A stall's state for this player: {ok, open (true | false | null between the lines), invested, mine, share, claimable, reopenAt} | {ok: false, reason}. */
    async stall(trader) {
      if (!url) return { ok: false, reason: 'not_available' };
      const g = guestFrom(storage);
      try {
        const r = await getJson(fetch, `${url}/api/town/act?trader=${encodeURIComponent(trader)}${g ? '&account_id=' + encodeURIComponent(g.accountId) : ''}`);
        if (!r.ok) return r;
        const b = r.body || {}; const st = b.stall || {}; const pos = b.position && typeof b.position === 'object' ? b.position : null;
        if (b.error) return { ok: false, reason: REASON[b.error] || 'network' };
        const invested = String(st.invested || '0'), mine = pos ? String(pos.amount || '0') : '0';
        const share = BigInt(invested) > 0n ? Number((BigInt(mine) * 10_000n) / BigInt(invested)) / 100 : 0;
        return { ok: true, exists: !!b.stall, open: b.open === true ? true : b.open === false ? false : null, invested, mine, share, claimable: pos ? String(pos.claimable || '0') : '0', reopenAt: Number(b.reopen_at) || 0, closeBelow: Number(b.close_below) || 0 };
      } catch { return { ok: false, reason: 'network' }; }
    },
    /** Signs and sends one action: {ok, hash, result} | {ok: false, reason}. */
    async act(action, args) {
      const g = guestFrom(storage);
      if (!g) return { ok: false, reason: 'need_guest' };
      if (!url) return { ok: false, reason: 'not_available' };
      const a = canonicalArgs(action, args);
      if (!a) return { ok: false, reason: 'bad_args' };
      try {
        if (flush) { try { await flush(); } catch { /* the relayer credits from what it has */ } }
        const key = await importSecretKey(g.secretKey);
        const at = now();
        const signature = b58encode(await key.sign(new TextEncoder().encode(actMessage(g.accountId, action, a, at))));
        const r = await fetch(url + '/api/town/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, action, args: a, signature }) });
        let b = {}; try { b = await r.json(); } catch { /* empty */ }
        if (r.status === 200 && b.ok) { const h = String(b.tx_hash || '').replace(/^https:\/\/testnet\.nearblocks\.io\/txns\//, ''); return { ok: true, hash: /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(h) ? h : null, result: b.result ?? null }; }
        if (r.status === 404 && !b.error) return { ok: false, reason: 'not_available' };
        return { ok: false, reason: REASON[b.error] || (r.status === 503 ? 'not_available' : r.status >= 500 ? 'tx_failed' : 'network'), hash: null };
      } catch { return { ok: false, reason: 'network' }; }
    },
  };
}
