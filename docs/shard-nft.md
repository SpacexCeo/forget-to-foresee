# Memory shards as NEP-171 NFTs

Status (08.11): contract built and tested, game side ready, **not deployed and no shard minted**: the testnet transactions
wait for the owner's permission path, like `season-commit` (`docs/near.md`). The game shows the shard badge only once
`game/src/net/near-deployment.js` records a shard collection (`shardContractId`, `shardMints`).

## Design

A forgotten memory becomes a shard (the Price of Memory) and goes to the clans' auction. On-chain, a shard is one NEP-171
token (`<seasonId>-<shardId>`) minted by the season coordinator to the auction winner's account (the coordinator's vault
stands in for the AI clans). Its `extra` is the shard data, validated on-chain: season id, owner clan, memory kind and
weight, the trial it was forgotten, the auction close, winner and price, the index and Merkle leaf of the first future
sign the vision opened, and the season's schedule root (every shard of a season must carry the same root). The leaf and
root are checkable in `season-commit` (`check_leaf`, `get_revealed_leaf`), so a shard is provably tied to the committed
season. The media is a deterministic 320×320 ink-ring SVG rendered on-chain and byte-identical to the game's
`shardSvg()` (`game/src/net/shard-nft.js`); `contracts/memory-shard/tests/vectors.json` pins both (8 shards, 8 invalid
cases). Transfers: the owner of a token moves it with `nft_transfer`; no approvals. Details, methods and error codes:
[`contracts/memory-shard/README.md`](../contracts/memory-shard/README.md).

## Game side

- Observation: `obs.shards` lists every shard of the season (the engine drops a shard the tick after its auction; the
  room keeps the last snapshot) and `obs.auctions` the open ones, both with `kind`, `memory {kind, weight}`,
  `forgottenAtTick`, `price`, `unlocked {index, leaf}` (Iris's shards: the first sign the vision opened) and `tokenId`.
- `game/src/net/shard-nft.js`: `shardData`, `shardTokenId`, `shardSvg`, `shardMetadata`, `shardDataFromAuction(season,
  auction)`, `createShardNftClient` (read-only views: `get_shard`, `shards_of_season`, `season_shard_count`, `nft_token`,
  `nft_metadata`), `createShardWatcher` (one view per season; `badge(auctionId)` → "Shard minted on NEAR testnet ✓" with
  the mint transaction link; silent when disabled, offline or for unlisted seasons).
- HUD rendering: Task F, request 9 in `docs/collab-requests.md` (strings `wh.shard.near.*` in all five locales).

## Commands

```bash
cd contracts/memory-shard && cargo test --lib                 # 21 passed
cargo near build non-reproducible-wasm --no-abi               # target/near/memory_shard.wasm
node scripts/judge-shards-args.mjs                            # the judge playthrough's 3 shards -> target/judge-shards/793f6c05e89839f2/
scripts/deploy-judge-shards.sh <CONTRACT_ID> <COORDINATOR_ID> # testnet, owner permission; then node ../season-commit/scripts/write-deployment.mjs
cd game && npm run shard-vectors && npm test                  # vectors current; tests/client/shard-nft.test.mjs
```
