# agent-card (NEAR NEP-171 contract)

Forget to Foresee's agent card: one NFT per (season, agent) that records the agent's end-of-season state, **for NEAR
testnet only**. Rust + near-sdk 5.30 + near-contract-standards 5.30. No token, no paid entry, no mainnet: the only
deposit is the minting coordinator's refundable storage deposit. Background and limits: [`docs/agent-nft.md`](../../docs/agent-nft.md).

## What it does

At the end of a season the coordinator mints one card for an agent (for the hackathon: Iris in the judge season).
The card stores the agent's canonical state and the contract **recomputes its state hash** (sha256 of the canonical
JSON) and refuses the mint if it differs from the declared one. The state carries the season's schedule root, which
anyone can compare with the root committed on [`season-commit`](../season-commit/README.md) (`get_season` there), and
the token ids of the memory shards the agent forgot ([`memory-shard`](../memory-shard/README.md)). Cards are
immutable: there is no update method. NEP-171 transfers move ownership; the data stays.

| Method | Who | What |
|---|---|---|
| `new(owner_id, coordinators, season_contract?, shard_contract?)` | deploy | owner, coordinators, the season-commit and memory-shard contracts the cards refer to |
| `mint_agent(receiver_id, state, state_hash)` | a coordinator, payable | validates the state (below), recomputes the hash (`ERR_STATE_HASH` if it differs), mints token `<season_id>-agent-<agent>` to `receiver_id`, once; every card of a season must carry the same `schedule_root`; charges the storage of the whole mint to the deposit and refunds the rest; emits the standard `nft_mint` event |
| `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_resolve_transfer` | NEP-171 core | the owner of a card moves it (1 yoctoNEAR); no approvals (NEP-178) |
| `nft_total_supply`, `nft_tokens`, `nft_supply_for_owner`, `nft_tokens_for_owner` | NEP-181 | enumeration |
| `nft_metadata` | NEP-177 | `Forget to Foresee: Agent Cards`, symbol `FTFAGENT` |
| `get_agent(token_id)`, `agent_of_season(season_id, agent)`, `agent_svg(token_id)`, `season_schedule_root(season_id)`, `preview_agent(state)` | views | the card (state, state hash, owner, minter, block, metadata); the image; the root of a season's cards; a free dry run of the mint (validates, returns the token id, hash and metadata) |
| `add_coordinator` / `remove_coordinator` | owner, 1 yoctoNEAR | owner only |
| `get_owner`, `get_coordinators`, `is_coordinator`, `season_commit_contract`, `shard_contract`, `agent_spec` | views | |

### The state (`extra` of the token, spec `ftf-agent/1`)

The judge playthrough's Iris (`judge/793f6c05e89839f2/state.json`, 1227 bytes, sha256 `16d0ed44…9c85754d`):
```json
{"spec":"ftf-agent/1","season_id":"793f6c05e89839f2","agent":"iris","rules":"v3","schedule_root":"03dbd458…5075769a","version":1,
 "final_tick":17,"outcome":"weapon","vote":true,"heir":null,
 "traits":{"reading_rule":"unknown","words_known":0,"confident_cells":0,"bought_words":0,"cells":[null,…16],"wild":false,"attention":3,"silk":0,"fragment":"dark",
   "trust":[{"clan":"salt","trust":50,"trusted_by":50,"link_broken":false,"remembers_betrayal":false},…]},
 "biography":{"remembered":[{"id":1,"kind":"first","weight":4,"about":null},{"id":3,"kind":"gift","weight":1,"about":"moss"}],
   "forgotten":[{"shard_id":7,"shard_token":"793f6c05e89839f2-7","kind":"call","weight":2,"forgotten_at_tick":4,"fate":"bought","buyer":"frost","price":13,"unlocked_index":3}]}}
```
- `spec` `ftf-agent/1`; `season_id` 8–64 lowercase hex; `agent` a clan id; `rules` v1–v3; `schedule_root` 64 hex;
  `version` 1–1000 (the agent's state version: 1 = the first season card); `final_tick` 1–19; `outcome` gift, weapon,
  survived, lost, gone or proof_failed; `vote` and `heir` true, false or null (not cast / not chosen when minted);
- `traits`: `reading_rule` unknown, top or dots; `cells` the season's 16 dictionary cells (slot-major), each a meaning
  0–3 or null, counted by `words_known`; `confident_cells` and `bought_words` 0–16; `wild` (the agent forgot its owner);
  `attention` 1–3; `silk` 0–1 000 000; `fragment` held, dark or scroll; `trust` the other clans once each, 0–100 both ways;
- `biography`: at most 24 `remembered` memories (id, kind first/call/gift/betrayal/debt/promise, weight 0–4, about a
  clan or null) and 24 `forgotten` ones (shard id and its token id `<season_id>-<shard_id>`, kind, weight, the trial it
  was forgotten 1–17, fate bought (with buyer and price), burned or open (still at auction when the season ended), the
  index of the sign the vision opened or null).
The dictionary is valid for this season only: every seed draws its own stroke-to-meaning permutation, so the card makes
no claim about a dictionary carried across seasons.

Errors start with a stable code: `ERR_NOT_COORDINATOR`, `ERR_TOKEN_EXISTS`, `ERR_STATE_HASH`, `ERR_SEASON_ROOT`,
`ERR_BAD_SPEC`, `ERR_BAD_SEASON_ID`, `ERR_BAD_AGENT`, `ERR_BAD_RULES`, `ERR_BAD_HASH`, `ERR_BAD_VERSION`, `ERR_BAD_TICK`,
`ERR_BAD_OUTCOME`, `ERR_BAD_TRAITS`, `ERR_BAD_TRUST`, `ERR_BAD_MEMORY`, `ERR_BAD_SHARD`, `ERR_BAD_FATE`; a short deposit
fails with near-contract-standards' `Must attach … to cover storage`.

### Metadata and image

`title` = `<Agent> · agent card · season <season_id>`; `description` sums up the outcome, the vote and the Heir, what
was remembered and forgotten (with buyers, prices and shard ids), the traits, the state hash and the schedule root;
`media` = `data:image/svg+xml;base64,…` of a 320×420 card drawn from the state (the 16-cell dictionary, gold = known;
the reading rule and counts; up to 12 memories, full = kept, hollow = forgotten, a dot when bought; trust bars, red =
broken link; the outcome; the first 16 hex digits of the state hash); `media_hash` = sha256 of the SVG; `copies` 1;
`issued_at` the block time in ms; `extra` = the canonical state JSON, so **sha256(extra) = state_hash**. The image uses
integer arithmetic only and is byte-identical to `game/src/net/agent-nft.js` (`agentSvg`, `agentMetadata`).

## Build and test

```bash
cd contracts/agent-card
cargo near build non-reproducible-wasm --no-abi     # -> target/near/agent_card.wasm (about 300 KB: about 3 NEAR of storage)
```
Three tiers, all driven by `tests/vectors.json` (6 states, 33 invalid cases, generated from the JavaScript twin:
`cd game && npm run agent-vectors`; `npm test` checks they are current) and the judge arguments in `judge/`:

| Tier | File | Runs on |
|---|---|---|
| Pure: canonical JSON, state hash, SVG, metadata byte for byte; every invalid case rejected with the JavaScript error code; the judge mint arguments | `src/vector_tests.rs` (6 tests) | everywhere (Windows: wasm32-wasip1 under Node's WASI) |
| Contract on near-sdk's mocked blockchain: mint, recomputed hash, duplicates, season root, deposit, preview, transfer, coordinators | `src/tests.rs` (16 tests) | Linux, macOS (C toolchain) |
| Real wasm on a local sandbox: season-commit commits the judge root, the card is minted from `judge/…/mint-agent.json`, its root equals `get_season`, the on-chain SVG equals `judge/…/card.svg`, refusals | `tests/sandbox.rs` (2 tests) | Linux, macOS (no Windows sandbox) |

Linux / macOS (all tiers; the sandbox test also needs `../season-commit/target/near/season_commit.wasm`):
```bash
cargo near build non-reproducible-wasm --no-abi && (cd ../season-commit && cargo near build non-reproducible-wasm --no-abi)
cargo test
```
Windows (pure tier; if linking a proc-macro fails with `ld: cannot find @C:\Windows\TEMP\…`, point `TMP`/`TEMP` at a
writable folder on another drive first):
```bash
rustup target add wasm32-wasip1
cargo test --lib --target wasm32-wasip1
```
**See:** `test result: ok. 6 passed`. CI: `.github/workflows/contracts.yml`, job `agent-card` (all tiers).

## Deploy and mint the judge card (testnet, the owner runs it)

```bash
cd contracts/agent-card
node scripts/judge-agent-args.mjs            # -> judge/793f6c05e89839f2/ and the commands below; --check verifies the committed files
```
The commands, in order (also in `judge/793f6c05e89839f2/commands.sh` and `summary.json`); account
`ftf-agents.testnet`, owner, coordinator and receiver `lambada_eth.testnet`:
```bash
near account create-account sponsor-by-faucet-service ftf-agents.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
cargo near deploy build-non-reproducible-wasm --no-abi ftf-agents.testnet with-init-call new json-args '{"owner_id":"lambada_eth.testnet","coordinators":["lambada_eth.testnet"],"season_contract":"ftf-seasons.testnet","shard_contract":"ftf-shards.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-read-only ftf-agents.testnet get_coordinators json-args '{}' network-config testnet now
near contract call-function as-read-only ftf-agents.testnet preview_agent file-args judge/793f6c05e89839f2/preview-agent.json network-config testnet now
near contract call-function as-transaction ftf-agents.testnet mint_agent file-args judge/793f6c05e89839f2/mint-agent.json prepaid-gas '100.0 Tgas' attached-deposit '0.5 NEAR' sign-as lambada_eth.testnet network-config testnet sign-with-keychain send
near contract call-function as-read-only ftf-agents.testnet get_agent json-args '{"token_id":"793f6c05e89839f2-agent-iris"}' network-config testnet now
near contract call-function as-read-only ftf-seasons.testnet get_season json-args '{"season_id":"793f6c05e89839f2"}' network-config testnet now
```
**See:** `preview_agent` returns `"state_hash": "16d0ed44a990fb5d36ebbfc79d44c4d597b50a2a27bdd7aba6cc125e9c85754d"`; the
mint prints a transaction id; `get_agent` returns the same hash and a `state.schedule_root` equal to `get_season`'s
`schedule_root` (`03dbd458…5075769a`). Then record the mint for the game (public data only) in
`game/src/net/near-deployment.js`: `agentContractId: "ftf-agents.testnet"` and
`agentMints: { "793f6c05e89839f2": "<mint transaction id>" }`. Another account name (for example the sub-account
`ftf-agents.lambada_eth.testnet`) works the same: pass `--contract <id>` to the script and set `agentContractId` to it.
