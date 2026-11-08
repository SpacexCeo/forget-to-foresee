// Where the season-commit contract lives on NEAR testnet and which seasons were committed there.
// Written by `contracts/season-commit/scripts/write-deployment.mjs` after a deploy (docs/near.md); edit by hand
// only to point the game at another deployment. `contractId: null` disables every NEAR lookup in the game.
// Testnet only: nothing here is a key, a balance or a mainnet address.
export const NEAR_DEPLOYMENT = {
  network: 'testnet',
  contractId: null,
  rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  explorer: 'https://testnet.nearblocks.io',
  /** seasonId -> { seedHex, scheduleRoot, commitTx, ashKeyTx, revealTx: { [index]: txHash } } */
  seasons: {},
};
