// The NEAR network the relayer serves (FTF_NEAR_NETWORK=mainnet; anything else is testnet) and its per-network table:
// RPC endpoints, explorer, account suffix and every contract/account id. Every network-dependent default in the relayer
// comes from here; the specific env overrides (FTF_TOWN_CONTRACT, FTF_RPC_URLS, FTF_CHESTS_CONTRACT, ...) still win.
import { readFileSync } from 'node:fs';

const ids = (s) => ({
  coordinator: `ftf-coordinator${s}`, guests: `guests.ftf-coordinator${s}`, heroine: `heroine.ftf-coordinator${s}`,
  companions: `companions.ftf-coordinator${s}`, agents: `agents.ftf-coordinator${s}`, ledger: `ledger.ftf-coordinator${s}`,
  chests: `chests.ftf-coordinator${s}`, skins: `skins.ftf-coordinator${s}`, pass: null,
  town: `ftf-town${s}`, items: `items.ftf-town${s}`, seasons: `ftf-seasons${s}`, shards: `ftf-shards${s}`, agentCards: `ftf-agents${s}`,
});
// two public endpoints each, the client fails over (docs/deploy/mainnet.md: check their limits before launch)
export const NETWORKS = Object.freeze({
  testnet: Object.freeze({ network: 'testnet', rpcUrls: Object.freeze(['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']), explorer: 'https://testnet.nearblocks.io', suffix: '.testnet', ...ids('.testnet') }),
  mainnet: Object.freeze({ network: 'mainnet', rpcUrls: Object.freeze(['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org']), explorer: 'https://nearblocks.io', suffix: '.near', ...ids('.near') }),
});

const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
export const networkName = (env = ENV) => (env.FTF_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet');
export const netOf = (env = ENV) => NETWORKS[networkName(env)];

// server.js loads relayer/.env only after every import has run (imports are hoisted), and the scripts do not load it,
// so the switch is taken from that file here when the environment does not set it (the environment still wins).
if (ENV.FTF_NEAR_NETWORK === undefined) {
  try {
    const m = /^\s*(?:export\s+)?FTF_NEAR_NETWORK\s*=\s*['"]?([A-Za-z]+)/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
    if (m) ENV.FTF_NEAR_NETWORK = m[1];
  } catch { /* no .env */ }
}
/** The network this process serves, fixed at startup. */
export const NET = netOf();
export const txUrl = (h, net = NET) => `${net.explorer}/txns/${h}`;
