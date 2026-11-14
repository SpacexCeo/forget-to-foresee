// Where the season-commit and shard contracts live on NEAR mainnet: the account ids from net/network.js, no season
// committed yet. Rewritten by `contracts/season-commit/scripts/write-deployment.mjs --network mainnet` after the
// mainnet deploy (docs/deploy/mainnet.md). Nothing here is a key or a balance.
export const NEAR_DEPLOYMENT_MAINNET = {
  network: "mainnet",
  contractId: "ftf-seasons.near",
  rpcUrls: [
    "https://free.rpc.fastnear.com",
    "https://rpc.mainnet.near.org"
  ],
  explorer: "https://nearblocks.io",
  seasons: {},
  shardContractId: "ftf-shards.near",
  shardMints: {}
};
