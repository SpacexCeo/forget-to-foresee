// Where the whitelist pass lives (story TZ §11.4; contract contracts/whitelist-pass; relayer docs/pass-claim-api.md).
// `network: null` hides the endgame modal and its entry points entirely ("Built, dormant").
// The default is the TESTNET rehearsal: the modal shows a "TESTNET REHEARSAL, not mainnet" banner and the testnet
// explorer. Switch to mainnet only after the owner's runbook (docs/mainnet-pass-runbook.md) has passed its checks.
// Nothing here is a key or a balance.
export const PASS_DEPLOYMENT = Object.freeze({
  network: 'testnet',
  contract: null,          // set after the owner's deploy (e.g. "pass.<owner>.testnet")
  relayerBase: null,       // null: the Day 1 relayer (net/tee-agent.js relayerUrl)
  explorerBase: 'https://testnet.nearblocks.io/txns/',
});
