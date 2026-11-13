// The Town Ledger's data side (docs/plans/track-fit-gaps.md): reads the relayer's /api/market/stats and turns it into
// what the in-game ledger shows: today's trade count against the daily target, the latest trades with the trader's
// reason and the testnet transaction, each trader's own NEAR account, purse and stall, and the clans' trading
// strategy chosen on NEAR AI Cloud. Pure apart from fetch; no keys, no signing. Everything from the server is
// checked against a narrow shape and anything else is dropped, so a bad answer can never put markup on the page.
import { relayerUrl } from './tee-agent.js';

export const EXPLORER = 'https://testnet.nearblocks.io';
export const TOWN_ACCOUNT = 'ftf-town.testnet';
export const POLL_MS = 20_000;
export const MICRO = 1_000_000; // silk is kept in millionths on ftf-town
export const PRICE_UNIT = 5; // stall prices are in fifths of a silk (relayer lib/town-traders.js PRICE_UNIT)

/** The traders in account order: trader-01 … trader-20 (relayer/market/catalog.js TRADERS, pinned by a test). */
export const TRADERS = Object.freeze(['guard', 'shardkeeper', 'scribe', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician', 'sweeper', 'lamplighter', 'courier', 'child_a', 'child_b',
  'iris', 'salt', 'ash', 'moss', 'amber', 'frost', 'tinker']);
/** The clans with a wallet of their own besides their trader account (catalog.js CLAN_WALLETS). */
export const CLAN_WALLETS = Object.freeze(['salt', 'ash', 'moss', 'amber', 'frost', 'iris']);
/** Base prices in fifths of a silk (catalog.js CATALOG), for "base → now" next to a price. */
export const BASE = Object.freeze({
  bread: 3, honey_cake: 7, stew: 5, cider: 4, ink: 4, scroll_copy: 12, shard_dust: 15, polished_shard: 40, incense: 4, candles: 2, lamp_oil: 3,
  ballad: 6, delivery: 3, broom: 5, escort: 10, herbal_remedy: 8, wildflowers: 1, river_stones: 1, woven_silk: 20, salt: 2, charcoal: 3,
  moss_poultice: 6, amber_resin: 14, ice_block: 2, bronze_gear: 16, spider_silk_thread: 15, chitin_plate: 25, veil_dust: 75, ash_ore: 200, crown_shard: 1000,
});
export const BUY_STYLES = Object.freeze(['staples', 'dear', 'balanced']);

const KEY = /^[a-z_]{2,20}$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{40,50}$/;
const CHAT = /^[A-Za-z0-9_-]{4,80}$/;
const nat = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.floor(Number(x)) : null);
const words = (s, n) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} ,.:'%()/-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');

export const traderAccount = (key) => (TRADERS.includes(key) ? `trader-${String(TRADERS.indexOf(key) + 1).padStart(2, '0')}.${TOWN_ACCOUNT}` : null);
export const clanAccount = (key) => (CLAN_WALLETS.includes(key) ? `clan-${key}.${TOWN_ACCOUNT}` : null);
export const accountUrl = (account) => (account ? `${EXPLORER}/address/${account}` : null);
export const txUrl = (hash) => (HASH.test(String(hash || '')) ? `${EXPLORER}/txns/${hash}` : null);
export const shortHash = (hash) => (hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : '');
/** Silk from millionths, at most two decimals, no trailing zeros ("3.2", "1222"). */
export const silkOf = (micro) => String(Math.round(Number(micro) / (MICRO / 100)) / 100);
/** A stall price (fifths) as silk ("0.8"). */
export const unitSilk = (fifths) => String(Math.round((Number(fifths) / PRICE_UNIT) * 100) / 100);

/**
 * The trader's reason words (relayer/market/prices.js reasonFor) as parts the game can translate:
 * "dear: only 3 iron left, demand rose" → {mood: 'dear', parts: [{k: 'left', n: 3}, {k: 'demand'}]}.
 * Buy-back lines ("buys at 60 % of its price (…)") and unknown words come back as {mood: null, raw}.
 */
export function parseReason(reason) {
  const raw = words(reason, 80);
  const m = /^(dear|cheap|fair)(?: price|: (.+))$/.exec(raw);
  if (!m) return { mood: null, parts: [], raw };
  const parts = [];
  for (const p of (m[2] || '').split(', ').filter(Boolean)) {
    let x;
    if ((x = /^only (\d+) .+ left$/.exec(p))) parts.push({ k: 'left', n: Number(x[1]) });
    else if ((x = /^(\d+) .+ on the shelf$/.exec(p))) parts.push({ k: 'shelf', n: Number(x[1]) });
    else if (p === 'demand rose') parts.push({ k: 'demand' });
    else if (p === 'few buyers') parts.push({ k: 'few' });
    else return { mood: null, parts: [], raw };
  }
  return { mood: m[1], parts, raw };
}

/** "why this price" in the current language: t('led.why.*'); falls back to the trader's own words. */
export function reasonText(t, reason) {
  const r = parseReason(reason);
  if (!r.mood) return r.raw;
  const mood = t('led.mood.' + r.mood);
  if (!r.parts.length) return t('led.why.plain', { mood });
  return t('led.why.parts', { mood, parts: r.parts.map((p) => t('led.r.' + p.k, { n: p.n })).join(', ') });
}

function trade(r) {
  if (!r || !KEY.test(r.buyer) || !KEY.test(r.seller) || !KEY.test(r.item)) return null;
  const qty = nat(r.qty), price = nat(r.price);
  if (!qty || price == null) return null;
  const silk = nat(r.silk);
  return { buyer: r.buyer, seller: r.seller, item: r.item, qty, price, base: BASE[r.item] ?? null, silk: silk || null, reason: words(r.reason, 80) || null,
    stock: nat(r.stock), at: nat(r.at) || 0, hash: HASH.test(r.hash || '') ? r.hash : null, url: txUrl(r.hash) };
}

function decision(c) {
  if (!c || !KEY.test(c.clan)) return null;
  const p = c.params && typeof c.params === 'object' ? c.params : {};
  const risk = Number(p.risk);
  return {
    clan: c.clan, at: nat(c.at) || 0, llm: c.source === 'llm', model: words(c.model, 60) || null,
    chat: CHAT.test(c.chat_id || '') ? c.chat_id : null, verified: c.verified === true,
    risk: Number.isFinite(risk) ? Math.round(risk * 100) / 100 : null, buy: BUY_STYLES.includes(p.buy) ? p.buy : null,
    favour: KEY.test(p.favour || '') ? p.favour : null, reason: words(p.reason, 100) || null, fallback: words(c.fallback_reason, 60) || null,
  };
}

/** Normalises one /api/market/stats answer for the ledger. */
export function normalizeLedger(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const recent = (Array.isArray(j.recent) ? j.recent : []).map(trade).filter(Boolean).slice(0, 40);
  const balances = {};
  if (j.balances && typeof j.balances === 'object') for (const [k, v] of Object.entries(j.balances)) if (KEY.test(k) && /^\d{1,20}$/.test(String(v))) balances[k] = String(v);
  const stalls = (Array.isArray(j.stalls) ? j.stalls : []).filter((s) => s && KEY.test(s.item) && KEY.test(s.maker))
    .map((s) => ({ item: s.item, maker: s.maker, kind: s.kind === 'resource' ? 'resource' : 'good', stock: nat(s.stock), price: nat(s.price), base: BASE[s.item] ?? null, closed: s.closed === true }));
  const st = j.strategy && typeof j.strategy === 'object' ? j.strategy : {};
  const clans = (Array.isArray(st.clans) ? st.clans : []).map(decision).filter(Boolean);
  const failures = nat(j.failures_today);
  return {
    live: !!j.enabled && !j.paused && !j.killed,
    today: nat(j.today), target: nat(j.target), traders: nat(j.traders), failures,
    contract: typeof j.contract === 'string' && /^[a-z0-9._-]{2,64}$/.test(j.contract) ? j.contract : TOWN_ACCOUNT,
    recent, balances, stalls,
    strategy: { decisions: nat(st.decisions_today) || 0, llm: nat(st.llm_today) || 0, clans },
  };
}

/** Share of today's target, 0…1 (null without both numbers). */
export const progressOf = (d) => (d && d.today != null && d.target ? Math.min(1, d.today / d.target) : null);

/** Everything the ledger knows about one trader: accounts, purse, stall goods, latest trades, clan strategy. */
export function traderCard(d, key) {
  if (!d || !TRADERS.includes(key)) return null;
  return {
    key, account: traderAccount(key), clanAccount: clanAccount(key),
    silk: d.balances[key] != null ? silkOf(d.balances[key]) : null,
    sells: d.stalls.filter((s) => s.maker === key),
    trades: d.recent.filter((r) => r.buyer === key || r.seller === key).slice(0, 6),
    strategy: d.strategy.clans.find((c) => c.clan === key) || null,
  };
}

/** "12 s ago" / "3 min ago" / "2 h ago" as {k, n} for t('led.ago.' + k, {n}). */
export function agoOf(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return { k: 's', n: s };
  if (s < 3600) return { k: 'm', n: Math.floor(s / 60) };
  return { k: 'h', n: Math.floor(s / 3600) };
}

/** One poll of the relayer: the normalised ledger, or null when there is no relayer or it did not answer. */
export async function fetchLedger({ base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!base || typeof fetch !== 'function') return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const r = await fetch(base + '/api/market/stats', { signal: ac ? ac.signal : undefined });
    if (!r.ok) return null;
    return normalizeLedger(await r.json());
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}
