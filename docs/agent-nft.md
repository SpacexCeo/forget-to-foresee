# The agent card: Iris's end-of-season NFT

Status (09.11): **built and tested, not deployed.** The contract, the judge card's arguments and the game's read-only
card are in the repository; nothing is on testnet until the owner runs the commands below. Until then the game says
"Not minted yet" and shows a preview of the card the season would mint, never a fake token.

## What it is

The owner's decision (08.11, re-confirmed 09.11): one NEP-171 mint at season end, carrying a state hash, a version,
traits and a biography, and no claim of a cross-season dictionary, because the stroke-to-meaning permutation is per
seed. For the hackathon: the judge season only, minted by the coordinator, like the memory shards.

- **Contract:** [`contracts/agent-card`](../contracts/agent-card/README.md) (Rust, near-sdk and near-contract-standards
  5.30): NEP-171 core, NEP-177 metadata, NEP-181 enumeration, no approvals. One token per (season, agent), id
  `<seasonId>-agent-<agent>`: the judge card is `793f6c05e89839f2-agent-iris`. Only a coordinator mints; cards are
  immutable (no update method; a transfer moves ownership, the data stays). The minting coordinator pays the storage
  with an attached deposit; the rest is refunded.
- **The state** (spec `ftf-agent/1`, the token's `extra`): season id, agent, rules version, the season's schedule root,
  the agent's state version (1 = its first season card), the last trial, the outcome, Iris's vote and the Heir choice;
  **traits**: reading rule, the 16 dictionary cells she knows, confident cells, bought words, wild or obedient
  (attention), silk, her fragment, trust both ways with each clan and broken links; **biography**: the memories she
  kept and the ones she forgot, each with its fate (bought by whom for how much, burned, or still at auction) and its
  memory-shard token id on `ftf-shards.testnet`. No secret phrase (the owner's Key, Ash's Key) ever enters it.
- **State hash:** sha256 of the canonical state JSON. The contract recomputes it at mint and refuses a mismatch;
  because the JSON is the token's `extra`, anyone can check `sha256(metadata.extra) == state_hash`.
- **Image:** a 320×420 SVG rendered on-chain from the state (dictionary grid, memories, trust bars, outcome, the
  first digits of the state hash), byte-identical to the game's `agentSvg()`.
- **Game side:** `game/src/net/agent-nft.js` builds the same canonical state from the room's end observation
  (`agentStateFromObservation`) and `loadAgentCard({obs})` returns the card model; `game/src/ui/world-hud/agent-card.js`
  draws it (`renderAgentCard(model, {t})`). The end-panel hook is one line in `game/src/play/ui.js`, left to the
  end-panel rebuild.

## What it proves, and what it does not

| Claim | Status |
|---|---|
| The card's data hashes to its state hash | **proved on-chain**: the contract recomputes the hash at mint; anyone can recompute `sha256(extra)` |
| The card belongs to the committed judge season | **checkable by anyone**: its `schedule_root` must equal `get_season(793f6c05e89839f2).schedule_root` on `ftf-seasons.testnet` (the game does this compare); the contract stores the root and the season-commit account, it does not call it |
| The card is the judge playthrough's Iris | **reproducible**: `scripts/judge-agent-args.mjs` replays the recorded playthrough (the same one the shards came from) through the real room and gets the same bytes; the game recomputes the hash from its own end observation and shows "verified" only if it is equal |
| The forgotten memory is a real NFT | the biography lists `793f6c05e89839f2-7`, minted on `ftf-shards.testnet` (docs/near.md) |
| Iris is a player-owned, persistent agent | **no**: the coordinator mints the card for the judge season; the player's session never signs; ordinary seasons mint nothing |
| Iris carries her dictionary into the next season | **no**: the dictionary is per seed; the card records this season's only |
| The season was played fairly | **no more than before**: the root is committed before trial 1, but the client still runs the rules |

In the game, the card's states are exactly these (`loadAgentCard`):

| State | When | The card says |
|---|---|---|
| `minted` | the token exists, its hash is sha256 of its data, its root equals the committed root and the local one, and this browser's end state hashes the same (the Heir is chosen after the season: a card minted with `heir: null` is compared with the local heir left out) | "Minted on NEAR testnet · verified", the link to nearblocks |
| `mismatch`, reason `playthrough` | the token is real and checked, but the judge played differently (any extra stake changes silk, trust or the dictionary) | "On NEAR testnet · the recorded judge playthrough", both hashes |
| `mismatch`, reason `state-hash`, `root` or `invalid` | a check failed | "Does not match · not verified" and why |
| `not-minted` | no contract or no token yet (before the owner's mint), or a live season (`judgeOnly`) | "Not minted yet" with a preview, or "agent cards exist for the judge season only"; a live season makes no RPC call |
| `offline` | the RPC did not answer, or the season record could not be read | "NEAR testnet did not answer · not verified" |
| `null` | the season is still running | nothing |

## Owner steps (testnet; nothing here was run by an agent)

Prerequisites: Rust, `cargo-near`, the `near` CLI (see `contracts/season-commit/README.md`), and the
`lambada_eth.testnet` key in the keychain (it is the coordinator on both existing contracts). From the repository root:

```bash
cd contracts/agent-card
node scripts/judge-agent-args.mjs --check     # the committed arguments are current (prints the commands too)
```

Then, one at a time (the same list is in `contracts/agent-card/judge/793f6c05e89839f2/commands.sh`):

```bash
# 1. the contract account (faucet; skip if it exists)
near account create-account sponsor-by-faucet-service ftf-agents.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
# 2. build, deploy and initialize: owner and coordinator lambada_eth.testnet, referring to the two live contracts
cargo near deploy build-non-reproducible-wasm --no-abi ftf-agents.testnet with-init-call new json-args '{"owner_id":"lambada_eth.testnet","coordinators":["lambada_eth.testnet"],"season_contract":"ftf-seasons.testnet","shard_contract":"ftf-shards.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
# 3. check
near contract call-function as-read-only ftf-agents.testnet get_coordinators json-args '{}' network-config testnet now
# 4. free dry run: expect "state_hash": "16d0ed44a990fb5d36ebbfc79d44c4d597b50a2a27bdd7aba6cc125e9c85754d"
near contract call-function as-read-only ftf-agents.testnet preview_agent file-args judge/793f6c05e89839f2/preview-agent.json network-config testnet now
# 5. mint the judge card to lambada_eth.testnet (0.5 NEAR deposit; about 0.1 NEAR is kept for storage, the rest refunded)
near contract call-function as-transaction ftf-agents.testnet mint_agent file-args judge/793f6c05e89839f2/mint-agent.json prepaid-gas '100.0 Tgas' attached-deposit '0.5 NEAR' sign-as lambada_eth.testnet network-config testnet sign-with-keychain send
# 6. read it back and compare the root with the committed season
near contract call-function as-read-only ftf-agents.testnet get_agent json-args '{"token_id":"793f6c05e89839f2-agent-iris"}' network-config testnet now
near contract call-function as-read-only ftf-seasons.testnet get_season json-args '{"season_id":"793f6c05e89839f2"}' network-config testnet now
```

The faucet gives the new account enough for the ~300 KB contract (about 3 NEAR of storage). A sub-account works too:
`near account create-account fund-myself ftf-agents.lambada_eth.testnet '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as lambada_eth.testnet network-config testnet sign-with-keychain send`,
then use that id in steps 2–6 (or regenerate them with `node scripts/judge-agent-args.mjs --contract ftf-agents.lambada_eth.testnet`).

After the mint, record it for the game (public data only), by hand in `game/src/net/near-deployment.js` next to
`shardMints`:
```js
  agentContractId: "ftf-agents.testnet",
  agentMints: { "793f6c05e89839f2": "<the mint transaction id>" },
```
(`write-deployment.mjs` does not know these two fields; if it is re-run, add them again.) Without `agentContractId` the
game already looks at `ftf-agents.testnet`; `agentContractId: null` turns the lookup off. Then add the hashes to
`docs/near.md` and `contracts/deployments/`, and update the README's real/mock table.

## Commands

```bash
cd contracts/agent-card && cargo test --lib --target wasm32-wasip1      # Windows: 6 pure tests (all tiers on Linux: cargo test)
cargo near build non-reproducible-wasm --no-abi                       # target/near/agent_card.wasm
node scripts/judge-agent-args.mjs [--check]                           # judge/793f6c05e89839f2/ and the owner's commands
cd game && npm run agent-vectors && npm test                          # vectors current; tests/client/agent-nft.test.mjs
```
