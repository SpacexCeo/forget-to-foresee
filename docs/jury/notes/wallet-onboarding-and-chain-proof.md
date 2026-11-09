# Wallet onboarding and on-chain proof a judge can check (C1, C4)

Research cycle 6, 2026-11-08 22:48 UTC. Search-result snippets read, not full pages. Moderate depth.

## Findings
1. **Play first, wallet later is the established pattern.** The first screen offers "Play as Guest"; the wallet is
   asked for only when an on-chain action matters.
   - https://alliance.xyz/essays/removing-web3s-friction-pt-1-progressive-onboarding-and-games (2026-11-08):
     progressive onboarding; Marvel Snap's guest-first screen; Primodium praised for guest-first and criticised for a
     two-minute world-state load on first connect.
   - https://sequence.xyz/blog/why-embedded-wallets-are-better-for-web3-games (2026-11-08): Skyweaver's
     play-first flow, a vendor-reported 73% conversion gain from guest wallets.
   - Drop-off figures (70 to 90%, or 60 to 75% wallet versus 15 to 25% walletless) come only from vendor blogs
     (https://www.cobo.com/post/mpc-wallet-as-a-service-web3-gaming, https://www.nadcab.com/blog/walletless-onboarding-dapps,
     2026-11-08); no primary source. Do not quote these numbers as fact.
   - No NEAR-specific source on guest flows or Wallet Selector drop-off was found this cycle.
2. **What a judge can open to check a NEAR claim:** testnet NearBlocks (https://testnet.nearblocks.io/about,
   2026-11-08) shows account, contract code, transactions with status, signer, receiver, gas and logs. Contract
   source can be verified on NearBlocks through SourceScan (https://github.com/SourceScan/verification-guide,
   2026-11-08): open the contract page, Contract Code, Verify. View methods can be called over RPC with no wallet
   (https://docs.near.org/api-reference/network-query.md, 2026-11-08). A testnet transaction does not appear on
   the mainnet explorer, a common source of "link is broken" in judging. NEAR Explorer (Pagoda) was sunset
   (https://docs.near.org/docs/tools/near-explorer, 2026-11-08); links should go to NearBlocks.

## Checks added to the judging procedure (phase 2)
1. The judge path reaches the core loop without a wallet (guest), and the wallet prompt appears only at the
   commitment or claim moment, with one sentence on why.
2. The README gives the contract account as a testnet NearBlocks link (not NEAR Explorer, not a mainnet link).
3. One season's commit transaction is linked; its logs or arguments show the Merkle root the game displays
   (the judge can compare the two strings by eye).
4. A no-wallet view call is documented (`near view` or curl to RPC) that returns the stored root.
5. Contract source is verified on NearBlocks, or the README states the build is reproducible and gives the hash.
Missing items 2 to 4 keep C4 in the "undeployed or unverifiable" calibration (at most 5).
