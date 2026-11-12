// The market daemon's wiring (docs/market.md): environment, key file, state file, JSONL log, and one shared daemon
// for the process. Off unless FTF_TOWN=1 (ftf-town, lib/town-traders.js; dry run unless FTF_TOWN_SEND=1) or
// FTF_MARKET=1 (the parked market contract). The trader keys live in data/market-keys.json on the relayer's server
// (made there by scripts/market-keys.mjs, mode 600, never committed); this module never prints them.
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTxClient } from '../lib/near-tx.js';
import { DEFAULTS } from '../lib/core.js';
import { createMarketDaemon } from './daemon.js';
import { DEFAULT_TARGET } from './schedule.js';
import { TOWN_POLICY, townEnv } from '../lib/town-traders.js';
import { TRADERS, traderAccount } from './catalog.js';

export const marketEnv = (env = process.env) => ({
  enabled: env.FTF_MARKET === '1',
  contract: env.FTF_MARKET_CONTRACT || 'market.ftf-coordinator.testnet',
  keysFile: env.FTF_MARKET_KEYS || join(env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname, 'market-keys.json'),
  dataDir: env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname,
  target: Math.max(1, Math.min(100_000, Number(env.FTF_MARKET_TARGET) || DEFAULT_TARGET)),
  maxPerMinute: Math.max(1, Math.min(600, Number(env.FTF_MARKET_MAX_PER_MIN) || 60)),
  paused: env.FTF_MARKET_PAUSED === '1',
  rpcUrls: (env.FTF_MARKET_RPC || env.NEAR_RPC || '').split(',').map((s) => s.trim()).filter(Boolean),
});

/** [{key, account, secretKey}] from the key file, or [] when it is missing or malformed. */
export function loadTraderKeys(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return (j.traders || []).filter((t) => t && typeof t.key === 'string' && typeof t.account === 'string' && /^ed25519:/.test(t.secretKey || ''));
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
/** The process's daemon (started on first call when enabled and keys exist), or null. */
export function marketDaemon(env = process.env) {
  if (daemon) return daemon;
  const cfg = marketEnv(env), town = townEnv(env);
  if (!cfg.enabled && !town.enabled) return null;
  let traders = loadTraderKeys(cfg.keysFile);
  if (!traders.length && town.enabled && !town.send) traders = TRADERS.map((key) => ({ key, account: traderAccount(key), secretKey: null })); // a dry run needs no keys
  if (!traders.length) return null;
  daemon = createMarketDaemon({
    ...(town.enabled ? { contractId: town.contract, target: town.target, policy: TOWN_POLICY, dryRun: !town.send } : { contractId: cfg.contract, target: cfg.target }),
    traders, maxPerMinute: cfg.maxPerMinute, paused: cfg.paused,
    client: createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, timeoutMs: 30_000 }),
    store: fileStore(join(cfg.dataDir, town.enabled ? 'town-state.json' : 'market-state.json')), log: jsonlLog(join(cfg.dataDir, town.enabled ? 'town-log' : 'market-log')),
  });
  daemon.start().catch(() => {});
  return daemon;
}
