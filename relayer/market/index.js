// The town traders' wiring (docs/town-economy.md): environment, key file, state file, JSONL log, and one shared daemon
// for the process. Off unless FTF_TOWN=1 (ftf-town, lib/town-traders.js; a dry run unless FTF_TOWN_SEND=1). The trader keys live in data/market-keys.json on the relayer's server
// (made there by scripts/market-keys.mjs, mode 600, never committed); this module never prints them.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTxClient } from '../lib/near-tx.js';
import { DEFAULTS } from '../lib/core.js';
import { createMarketDaemon } from './daemon.js';
import { DEFAULT_TARGET } from './schedule.js';
import { TOWN_POLICY, townEnv } from '../lib/town-traders.js';
import { TRADERS, traderAccount } from './catalog.js';
import { createStrategyBook, runStrategyRound } from '../lib/clan-strategy.js';
import { runClanRound } from '../lib/clan-actions.js';
import { CLAN_WALLETS, clanAccount, CATALOG as ITEMS } from './catalog.js';
import { buybackOf } from './prices.js';
import { teeEnv } from '../lib/tee.js';

export const marketEnv = (env = process.env) => ({
  keysFile: env.FTF_MARKET_KEYS || join(env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname, 'market-keys.json'),
  dataDir: env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname,
  target: Math.max(1, Math.min(100_000, Number(env.FTF_MARKET_TARGET) || DEFAULT_TARGET)),
  maxPerMinute: Math.max(1, Math.min(600, Number(env.FTF_MARKET_MAX_PER_MIN) || 60)),
  paused: env.FTF_MARKET_PAUSED === '1',
  walletDayNear: Math.max(0.01, Number(env.FTF_WALLET_DAY_NEAR) || 0.5),
  txNear: Math.max(0.00001, Number(env.FTF_TX_NEAR) || 0.0003),
  rpcUrls: (env.FTF_MARKET_RPC || env.NEAR_RPC || '').split(',').map((s) => s.trim()).filter(Boolean),
});

/** [{key, account, secretKey}] from the key file (`traders` or `clans`), or [] when it is missing or malformed. */
export function loadTraderKeys(path, kind = 'traders') {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return (j[kind] || []).filter((t) => t && typeof t.key === 'string' && typeof t.account === 'string' && /^ed25519:/.test(t.secretKey || ''));
  } catch { return []; }
}

/** A JSON file store with an atomic replace. */
export function fileStore(path) {
  return {
    load() { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } },
    save(obj) { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(obj)); renameSync(path + '.tmp', path); },
  };
}
/** Appends one JSON line per entry (a new file per UTC day). */
export const jsonlLog = (dir) => (entry) => {
  try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, `market-${new Date(entry.at || Date.now()).toISOString().slice(0, 10)}.jsonl`), JSON.stringify(entry) + '\n'); } catch { /* disk full: keep trading */ }
};

let daemon = null;
/** The stalls for the stats: each good's maker, stock, price (fifths of a silk) and whether its stall is closed. */
const stallsOf = (st) => (st && st.stock ? ITEMS.map((i) => ({ item: i.id, kind: i.kind, maker: i.maker, stock: st.stock[i.id] ?? 0, price: st.prices[i.id] ?? i.base, closed: !!(st.closed && st.closed[i.maker]),
  ...(i.kind === 'resource' ? { buys_at: buybackOf(i, st.stock[i.id] ?? 0, (st.demand && st.demand[i.id]) || 0).price } : {}) })) : []);
/** The process's daemon (started on first call when enabled and keys exist), or null. */
export function marketDaemon(env = process.env) {
  if (daemon) return daemon;
  const cfg = marketEnv(env), town = townEnv(env);
  if (!town.enabled) return null;
  let traders = loadTraderKeys(cfg.keysFile);
  if (!traders.length && town.enabled && !town.send) traders = TRADERS.map((key) => ({ key, account: traderAccount(key), secretKey: null })); // a dry run needs no keys
  if (!traders.length) return null;
  const book = createStrategyBook({ log: jsonlLog(join(cfg.dataDir, 'clan-decisions')) });
  daemon = createMarketDaemon({
    strategyOf: env.FTF_STRATEGY === '0' ? null : (k) => book.get(k),
    contractId: town.contract, target: town.target, policy: TOWN_POLICY, dryRun: !town.send,
    traders, maxPerMinute: cfg.maxPerMinute, paused: cfg.paused,
    // per-wallet budget (estimated NEAR of gas a day) and one global kill switch: FTF_TOWN_KILL=1 or a file data/KILL
    walletDayNear: cfg.walletDayNear, txNear: cfg.txNear,
    killed: () => env.FTF_TOWN_KILL === '1' || existsSync(join(cfg.dataDir, 'KILL')),
    client: createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, timeoutMs: 30_000 }),
    store: fileStore(join(cfg.dataDir, 'town-state.json')), log: jsonlLog(join(cfg.dataDir, 'town-log')),
  });
  daemon.start().catch(() => {});
  if (env.FTF_STRATEGY !== '0') {
    // the clans' strategy round: at start, then every FTF_STRATEGY_MINUTES (default 60); the model when NEAR AI answers, else scripted
    const tee = teeEnv(env), every = Math.max(10, Number(env.FTF_STRATEGY_MINUTES) || 60) * 60_000;
    const round = () => runStrategyRound({ book, st: daemon.state(), opts: { apiKey: tee.apiKey, model: tee.model, base: tee.base } }).catch(() => {});
    setTimeout(round, 5_000).unref?.(); setInterval(round, every).unref?.();
  }
  // the clans' own wallets: pledge, enter the tournament, claim (every FTF_CLAN_MINUTES, default 120); dry unless FTF_TOWN_SEND=1
  let clanLast = [];
  let clanWallets = loadTraderKeys(cfg.keysFile, 'clans');
  if (!clanWallets.length && !town.send) clanWallets = CLAN_WALLETS.map((key) => ({ key, account: clanAccount(key), secretKey: null }));
  if (clanWallets.length && env.FTF_CLANS !== '0') {
    const client = createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, timeoutMs: 30_000 });
    const clanRound = async () => { if (env.FTF_TOWN_KILL === '1' || existsSync(join(cfg.dataDir, 'KILL'))) return; clanLast = await runClanRound({ client, town: town.contract, wallets: clanWallets, strategyOf: (k) => book.get(k), send: town.send, log: jsonlLog(join(cfg.dataDir, 'clan-actions')) }).catch(() => clanLast); };
    setTimeout(clanRound, 60_000).unref?.(); setInterval(clanRound, Math.max(10, Number(env.FTF_CLAN_MINUTES) || 120) * 60_000).unref?.();
  }
  const inner = daemon;
  daemon = { ...inner, stats: () => ({ ...inner.stats(), stalls: stallsOf(inner.state()), balances: Object.fromEntries(Object.entries((inner.state() || {}).balances || {}).map(([k, v]) => [k, String(v)])), strategy: book.stats(), clan_actions: clanLast.map((e) => ({ clan: e.clan, account: e.account, at: e.at, action: e.action && e.action.method, ok: e.ok, hash: e.hash || null, dry: !!e.dry })) }) };
  return daemon;
}
