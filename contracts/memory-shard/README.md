# memory-shard (NEAR NEP-171 contract)

Forget to Foresee's memory shards as NFTs, **for NEAR testnet only**. Rust + near-sdk 5.30 + near-contract-standards 5.30.
No token, no paid entry, no mainnet: the only deposit is the minting coordinator's refundable storage deposit.

## What it does

A forgotten memory becomes a shard (the Price of Memory) and goes to the clans' auction. The season coordinator mints
one token per shard to the auction winner's account. The token is tied to the season committed in
[`season-commit`](../season-commit/README.md): it carries the season id, the season's schedule root and the Merkle leaf
of the sign the vision opened, so anyone can check that leaf against the committed root (`check_leaf` /
`get_revealed_leaf` there).

| Method | Who | What |
|---|---|---|
| `new(owner_id, coordinators, season_contract?)` | deploy | owner, coordinators, the season-commit contract this collection refers to |
| `mint_shard(receiver_id, shard)` | a coordinator, payable | validates the shard data (below), builds the NEP-177 metadata with the on-chain image, mints token `<season_id>-<shard_id>` to `receiver_id`, once; every shard of a season must carry the same `schedule_root`; refunds the unused deposit; emits the standard `nft_mint` event |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_resolve_transfer` | NEP-171 core | the owner of a shard moves it (1 yoctoNEAR); no approvals (NEP-178) are enabled |
| `nft_total_supply`, `nft_tokens`, `nft_supply_for_owner`, `nft_tokens_for_owner` | NEP-181 | enumeration |
| `nft_metadata` | NEP-177 | `Forget to Foresee: Memory Shards`, symbol `FTFSHARD` |
| `get_shard(token_id)`, `shards_of_season(season_id, from_index?, limit?)`, `season_shard_count`, `season_schedule_root`, `shard_svg(token_id)`, `preview_shard(shard)` | views | the shard record with owner and metadata; a season's shards in mint order (at most 100 per page); the image; the metadata the contract would mint, without minting (validates) |
| `add_coordinator` / `remove_coordinator` | owner, 1 yoctoNEAR | owner only |
| `get_owner`, `get_coordinators`, `is_coordinator`, `season_commit_contract`, `shard_spec` | views | |

### Shard data (`extra` of the token, spec `ftf-shard/1`)

```json
{"season_id":"793f6c05e89839f2","shard_id":7,"owner_clan":"iris","kind":"call","weight":2,"forgotten_at_tick":4,"closes_at_tick":6,
 "winner_clan":"frost","price":13,"unlocked_index":3,"unlocked_leaf":"63903cca…","schedule_root":"03dbd458…"}
```
- `season_id` 8–64 lowercase hex; `shard_id` ≥ 1 (the engine's shard id); token id `<season_id>-<shard_id>`;
- `owner_clan` / `winner_clan` ∈ iris, salt, ash, moss, amber, frost (`winner_clan` null = burned unsold);
- `kind` ∈ first, call, gift, betrayal, debt, promise (Iris's memories) or insight, lie (a clan's shard, weight 0);
- `weight` 0–4, `forgotten_at_tick` 1–17, `closes_at_tick` 1–19, `price` ≥ 0 or null;
- `unlocked_index` (0–1023) and `unlocked_leaf` (64 hex) together or both null: the first future sign the vision opened;
- `schedule_root` 64 hex: the season's committed root (the same for every shard of the season, enforced).
Errors start with a stable code: `ERR_NOT_COORDINATOR`, `ERR_TOKEN_EXISTS`, `ERR_SEASON_ROOT`, `ERR_BAD_KIND`,
`ERR_BAD_CLAN`, `ERR_BAD_WEIGHT`, `ERR_BAD_TICK`, `ERR_BAD_HASH`, `ERR_BAD_UNLOCK`, `ERR_BAD_SEASON_ID`, `ERR_BAD_SHARD_ID`.

### Metadata and image

`title` = `Memory shard #<id> · <Kind> · season <season_id>`; `description` says who forgot what, when, the auction
result, the sign the vision opened and the schedule root; `media` = `data:image/svg+xml;base64,…` of a 320×320 ink
ring drawn from the data (eight strokes from the first sixteen nibbles of the unlocked leaf, or of the root when there
is none; one dot per weight; a full core when bought, hollow when burned; the kind's colour); `media_hash` = sha256 of
the SVG; `copies` 1; `issued_at` the block time in ms; `extra` the data above. The image uses integer arithmetic only
and is byte-identical to `game/src/net/shard-nft.js` (`shardSvg`, `shardMetadata`), so the game can show the exact
token image before and without a mint.

## Build and test

```bash
cd contracts/memory-shard
cargo near build non-reproducible-wasm --no-abi     # -> target/near/memory_shard.wasm (about 280 KB)
cargo test --lib                                     # 21 tests: 5 vector tests + 16 on near-sdk's mocked chain
```
**See:** `test result: ok. 21 passed`. The vectors (`tests/vectors.json`, 8 shards incl. edge cases and 8 invalid
inputs) are generated from the JavaScript twin: `cd game && npm run shard-vectors`; `npm test` checks they are current.
CI: `.github/workflows/contracts.yml`, job `memory-shard`.

## Deploy and mint the judge playthrough's shards (testnet, owner permission)

```bash
cd contracts/memory-shard
node scripts/judge-shards-args.mjs [seedHex] [--receiver <account.testnet>]   # -> target/judge-shards/<seasonId>/mint-<id>.json, shard-<id>.svg, summary.json
scripts/deploy-judge-shards.sh <CONTRACT_ID> <COORDINATOR_ID> [RECEIVER_ID] [seedHex] [keychain|legacy-keychain] [SEASON_CONTRACT_ID]
node ../season-commit/scripts/write-deployment.mjs    # -> game/src/net/near-deployment.js (shardContractId, shardMints)
```
The canonical judge playthrough (`?demo=judge`: start, trials 1–3, forget the Call for a vision at trial 4, then the
season runs to its end) produces three shards: Iris's Call (bought by Frost for 13, opened sign #4) and two Frost
insights (bought by Salt). The script creates the accounts through the faucet, deploys and initializes the contract,
runs the free `preview_shard` for each shard and then `mint_shard` with a 0.1 NEAR storage deposit, and records every
transaction hash; every step is skipped when already done. Like `season-commit`, it is not run until the owner permits
testnet transactions (`docs/near.md`).
