// The NEAR network the game talks to, from ONE build switch: VITE_FTF_NEAR_NETWORK=mainnet (anything else, or
// nothing, is testnet). Every network-dependent value in the client (RPC hosts, explorer, wallet, the label the
// player reads, contract and account ids) comes from this table; the deployment files (near-deployment.js,
// day1-deployment.js, pass-deployment.js) pick their per-network record with it. The relayer has the same table in
// relayer/lib/network.js (FTF_NEAR_NETWORK); docs/deploy/mainnet.md is the runbook. Nothing here is a key or a balance.
const envNet = () => { try { return import.meta.env && import.meta.env.VITE_FTF_NEAR_NETWORK; } catch { return undefined; } };

const ids = (tld) => Object.freeze({
  coordinator: `ftf-coordinator.${tld}`,
  guests: `guests.ftf-coordinator.${tld}`, heroine: `heroine.ftf-coordinator.${tld}`, companions: `companions.ftf-coordinator.${tld}`,
  agents: `agents.ftf-coordinator.${tld}`, ledger: `ledger.ftf-coordinator.${tld}`, chests: `chests.ftf-coordinator.${tld}`, skins: `skins.ftf-coordinator.${tld}`,
  town: `ftf-town.${tld}`, items: `items.ftf-town.${tld}`, seasons: `ftf-seasons.${tld}`, shards: `ftf-shards.${tld}`, agentCards: `ftf-agents.${tld}`,
});

export const NETWORKS = Object.freeze({
  testnet: Object.freeze({ network: 'testnet', label: 'NEAR testnet', suffix: '.testnet', rpcUrls: Object.freeze(['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']),
    explorer: 'https://testnet.nearblocks.io', wallet: 'https://testnet.mynearwallet.com', accounts: ids('testnet') }),
  mainnet: Object.freeze({ network: 'mainnet', label: 'NEAR mainnet', suffix: '.near', rpcUrls: Object.freeze(['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org']),
    explorer: 'https://nearblocks.io', wallet: 'https://app.mynearwallet.com', accounts: ids('near') }),
});

/** 'mainnet' or 'testnet' (the build switch). */
export const NEAR_NETWORK = envNet() === 'mainnet' ? 'mainnet' : 'testnet';
/** This build's row of NETWORKS. */
export const NET = NETWORKS[NEAR_NETWORK];
/** The explorer's base URL, no trailing slash. */
export const EXPLORER = NET.explorer;
/** An explorer link to a transaction / an account / an NFT token. */
export const txUrl = (hash) => `${EXPLORER}/txns/${hash}`;
export const addressUrl = (account) => `${EXPLORER}/address/${account}`;

// The player-facing text says which network it is on. Written for testnet; a mainnet build swaps the network's name,
// account suffix and hosts in every message once at load (all five locales). docs/deploy/mainnet.md asks the owner to
// read the swapped copy before launch (some testnet lines also promise "no real-world value").
const SWAP = [
  [/https:\/\/testnet\.nearblocks\.io/g, 'https://nearblocks.io'], [/testnet\.mynearwallet\.com/g, 'app.mynearwallet.com'],
  [/rpc\.testnet\.near\.org/g, 'rpc.mainnet.near.org'], [/test\.rpc\.fastnear\.com/g, 'free.rpc.fastnear.com'],
  [/\.testnet\b/g, '.near'], [/testnet/g, 'mainnet'], [/Testnet/g, 'Mainnet'], [/TESTNET/g, 'MAINNET'],
  [/测试网/g, '主网'], [/тестнет/g, 'мейннет'], [/Тестнет/g, 'Мейннет'],
];
/** One string as this network says it (unchanged on testnet). */
export const forNetwork = (s, net = NEAR_NETWORK) => (net === 'mainnet' && typeof s === 'string' ? SWAP.reduce((a, [re, to]) => a.replace(re, to), s) : s);
/** A locale's message table as this network says it (the same object on testnet). */
export const messagesForNetwork = (messages, net = NEAR_NETWORK) => (net === 'mainnet' ? Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, forNetwork(v, net)])) : messages);
