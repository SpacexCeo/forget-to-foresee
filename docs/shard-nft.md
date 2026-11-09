# Memory shards as NEP-171 NFTs

Status (09.11): **deployed on testnet** as [`ftf-shards.testnet`](https://testnet.nearblocks.io/address/ftf-shards.testnet), the judge playthrough's
three shards minted (`793f6c05e89839f2-7`, `-10`, `-15`; hashes in `docs/near.md`). The game shows them: NFT cards in the
Memories panel and a "Minted on NEAR testnet" toast on the judge path (see Game side).

Scope, exactly: the three tokens were minted by the coordinator script (`ftf-coordinator.testnet`) for the recorded judge
playthrough, not by a player's session, and were transferred to the owner's `lambada_eth.testnet` the same day. An
ordinary season mints nothing (the game says "on-chain for the judge season only"); the player never signs. Iris is
not an NFT: a persistent, player-owned agent NFT, live minting per season and wallet-controlled play are future work.

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
- HUD (`game/src/ui/world-hud/shard-card-model.js`, `shard-card.js`, `shard-card.css`; wired in `game/src/play/world-hud.js`
  and the Memories panel of `game/src/play/ui.js`):
  - **Memories panel → "Memory shards on NEAR"**: one card per shard of the season that exists on-chain, Iris's first:
    the ink ring (the token's `metadata.media`, compared byte for byte with `shardSvg()` of the on-chain data, then
    drawn in stroke by stroke; a mismatch would show the chain's image unverified), "NFT · NEP-171 · ftf-shards.testnet",
    token id, owner account (explorer link), the biography (who forgot which memory of which weight at which trial,
    who bought it for how much at which auction), "Bound to the sealed season · leaf #N" linked to that leaf's reveal
    transaction on `ftf-seasons.testnet`, and "View on nearblocks" (`/nft-token/ftf-shards.testnet/<token>`).
  - **Toast "Minted on NEAR testnet"**: when a shard seen open in this session closes with a buyer and the token
    exists on-chain (judge path: trial 6, Frost buys Iris's call for 13 silk; later Salt buys Frost's two insights).
    It holds while hovered or focused; "Open card" opens the Memories panel.
  - **Gating, never a fake token**: a card needs the token on-chain AND `shardExtra(local) === shardExtra(chain)`
    (a judge who plays differently has a different shard #7, so nothing shows); open auctions never match. Live
    seasons (not in `NEAR_DEPLOYMENT.shardMints`): no RPC call, one quiet line "Shard NFTs are on-chain for the judge
    season only." RPC failure: nothing. Strings `shard.nft.*` in all five play locales.
  - Tests: `game/tests/client/shard-nft-hud.test.mjs` (present, absent or different, live season, RPC error, the mint
    moment, locales). Headless capture on the production build: `node tests/client/shard-hud-capture.mjs`
    (screens in `docs/screens/shard-nft/`).

## Commands

```bash
cd contracts/memory-shard && cargo test --lib                 # 21 passed
cargo near build non-reproducible-wasm --no-abi               # target/near/memory_shard.wasm
node scripts/judge-shards-args.mjs                            # the judge playthrough's 3 shards -> target/judge-shards/793f6c05e89839f2/
scripts/deploy-judge-shards.sh <CONTRACT_ID> <COORDINATOR_ID> # testnet, owner permission; then node ../season-commit/scripts/write-deployment.mjs
cd game && npm run shard-vectors && npm test                  # vectors current; tests/client/shard-nft.test.mjs
```
