# season-commit (NEAR contract)

The Forget to Foresee season commitment contract, **for NEAR testnet only**. Rust + near-sdk 5.30.
No token, no paid entry, no mainnet: every deposit is a refundable storage deposit.

## What it does

| Method | Who | What the contract checks |
|---|---|---|
| `commit_season(season_id, schedule_root, schema_version, leaf_count)` | a coordinator | caller is a coordinator; ids/hash are well formed; `schema_version` is `v2`; the season was never committed. The commitment can never change afterwards. |
| `commit_ash_key(season_id, commitment)` | a coordinator | the season is committed, no leaf is revealed yet, no Ash key is committed. Immutable. |
| `reveal_leaf(season_id, index, canonical_event, salt, merkle_path)` | anyone | recomputes the leaf **byte for byte as the game does** and folds the Merkle path; records the event only if the result equals the committed root (details below). |
| `reveal_ash_key(season_id, phrase, salt)` | anyone | `keyCommit(phrase, salt)` equals the committed Ash key commitment. |
| `add_coordinator` / `remove_coordinator` | owner, 1 yoctoNEAR | owner only. |

Views: `get_season`, `get_revealed_leaf`, `get_revealed_leaves(season_id, from_index?, limit?)`, `get_ash_key`,
`check_leaf` (free dry run of `reveal_leaf`, returns `{valid, leaf, error}`), `compute_leaf`, `get_owner`,
`get_coordinators`, `is_coordinator`, `supported_schemas`.

Events (NEP-297, standard `ftf_season`, version `1.0.0`): `season_committed`, `leaf_revealed`,
`ash_key_committed`, `ash_key_revealed`, `coordinator_added`, `coordinator_removed`.

Errors start with a stable code (`ERR_ROOT_MISMATCH`, `ERR_SEASON_EXISTS`, `ERR_NOT_COORDINATOR`, ...); see `src/lib.rs` and `src/proof.rs`.

### Byte format (same as `game/src/game/engine.js` rules v2 and `game/src/game/crypto.js`)

- leaf = `SHA-256("ftf:leaf:v2|" + seasonId + "|" + index + "|" + canonicalEvent + "|" + salt)`
- canonicalEvent = `{"t":T,"place":P,"action":A,"power":W,"delay":D,"dots":O}` exactly as `JSON.stringify` writes it
- salt = 64 lowercase hex characters (32 CSPRNG bytes; the contract accepts 32-64 bytes)
- node = `SHA-256(leftHex + rightHex)` over the 128 ASCII hex characters; an odd last node is paired with itself
- Ash key = `SHA-256("ftf:key:v2|" + seasonId + "|" + phrase + "|" + salt)` (phrase is opaque UTF-8, never translated)

## What is verified on-chain and what is not

Say "verified on-chain" only for the first block below.

**Verified on-chain by this contract** (when `reveal_leaf` / `reveal_ash_key` succeeds):
- the schedule root was committed by an authorized coordinator, once, and recorded with its block height and timestamp;
- the revealed event is in canonical v2 form with v2 value ranges, and its salt is at least 32 bytes;
- SHA-256 of the domain-tagged leaf, folded along the supplied path, equals the committed root. The side of every
  step is derived from `index`, the path length must equal the tree depth for `leaf_count`, and an index outside
  the tree is rejected, so a proof is valid for exactly one position;
- Ash's phrase and salt hash to the commitment made before the first reveal.

**Not verified on-chain** (checked in the browser or not at all):
- that the committed schedule is what the game actually played (the client compares the engine's events with the
  revealed leaves; the contract never runs game rules);
- *when* in the season a leaf is revealed: the contract records block time, not game ticks. "Committed before the
  season started" means the commit block precedes the first action, which the client must show;
- that salts came from a CSPRNG (only their length is checked);
- visions' contingent branches, silk, memory, fragments and the vote: all local game state.

Until a leaf is submitted to `reveal_leaf`, the game's own check is **browser verification against the root**, and
must be labeled that way.

## Prerequisites

- Rust via [rustup](https://rustup.rs) (stable; the crate's `rust-toolchain.toml` adds `wasm32-unknown-unknown`)
- [cargo-near](https://github.com/near/cargo-near) 0.23+:
  - Linux/macOS: `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh`
  - Windows: `irm https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.ps1 | iex`
- [near CLI](https://github.com/near/near-cli-rs) for calls: `npm install -g near-cli-rs`
- Node.js 20+ (vectors; pure tests on Windows)

## Build

```bash
cd contracts/season-commit
cargo near build non-reproducible-wasm --no-abi
```
**See:** `Contract successfully built!` and `target/near/season_commit.wasm` (about 200 KB, so the contract
account needs about 2 NEAR of testnet balance for storage).
`--no-abi` skips the ABI step, which needs a host linker that can leave NEAR host functions unresolved
(it fails with the Windows GNU toolchain); the contract itself is identical.

## Test

Three tiers, all driven by `tests/vectors.json`:

| Tier | File | Runs on |
|---|---|---|
| Pure verification: every vector leaf, root, path and Ash commitment; tampered event/salt/path, wrong season, wrong index, malformed input | `src/vector_tests.rs` (13 tests) | everywhere |
| Contract on near-sdk's mocked blockchain: views, events, storage deposits, re-commit, unauthorized commit, reveal before commit, double reveal, Ash key rules | `src/tests.rs` (43 tests) | Linux, macOS (needs a C compiler for near-sdk's `unit-testing` dependencies) |
| Real wasm on a local NEAR sandbox node (near-workspaces): full season, all forgeries and unauthorized calls | `tests/sandbox.rs` (2 tests, about 60 transactions) | Linux, macOS (the NEAR sandbox has no Windows build) |

Linux / macOS (all tiers; the sandbox tests deploy `target/near/season_commit.wasm`, and the sandbox node
binary is downloaded on first run):
```bash
cd contracts/season-commit
cargo near build non-reproducible-wasm --no-abi
cargo test
```

Windows (pure tier, runs as a wasm32-wasip1 binary under Node's WASI, no C toolchain needed):
```bash
cd contracts/season-commit
rustup target add wasm32-wasip1
cargo test --lib --target wasm32-wasip1
```
**See:** `test result: ok. 13 passed`.

On Linux the expected output is `test result: ok. 56 passed` (13 pure + 43 mocked-chain) for `src/lib.rs` and
`test result: ok. 2 passed` for `tests/sandbox.rs`.

CI: `.github/workflows/contracts.yml` builds the wasm and runs `cargo test` (all tiers) on Ubuntu for every push that
touches the contract or the engine.

### Vectors

`tests/vectors.json` is generated by `game/scripts/gen-contract-vectors.mjs` from the real engine (rules v2, with
deterministic test bytes in place of CSPRNG output so the file is reproducible) and `crypto.js`:
three 15-leaf seasons with Ash keys (one phrase has multi-byte UTF-8) and 1-, 2- and 5-leaf edge trees.
```bash
cd game
npm run vectors   # regenerate
npm test          # includes a check that the committed vectors still match engine.js
```

## Deploy to testnet (owner)

Placeholders: `<CONTRACT_ID>` (e.g. `ftf-seasons.<you>.testnet`), `<OWNER_ID>`, `<COORDINATOR_ID>`.
The owner creates the accounts; nothing here touches mainnet.

1. Accounts (skip any that exist):
   ```bash
   near account create-account sponsor-by-faucet-service <CONTRACT_ID> autogenerate-new-keypair save-to-keychain network-config testnet create
   ```
2. Build, deploy and initialize in one command:
   ```bash
   cd contracts/season-commit
   cargo near deploy build-non-reproducible-wasm --no-abi <CONTRACT_ID> with-init-call new json-args '{"owner_id":"<OWNER_ID>","coordinators":["<COORDINATOR_ID>"]}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
   ```
   (Already built? `near contract deploy <CONTRACT_ID> use-file target/near/season_commit.wasm with-init-call new json-args '...' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send`.)
3. Check:
   ```bash
   near contract call-function as-read-only <CONTRACT_ID> get_coordinators json-args '{}' network-config testnet now
   ```

## Demo calls (testnet)

Write argument files for the first vector season (an engine-generated season with test salts):
```bash
node scripts/demo-args.mjs        # -> target/demo-args/*.json
```
Then, with the coordinator's key in the keychain:
```bash
# 1. commit the schedule root and Ash's key (0.01 NEAR covers storage; the rest is refunded)
near contract call-function as-transaction <CONTRACT_ID> commit_season file-args target/demo-args/commit-season.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <COORDINATOR_ID> network-config testnet sign-with-keychain send
near contract call-function as-transaction <CONTRACT_ID> commit_ash_key file-args target/demo-args/commit-ash-key.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <COORDINATOR_ID> network-config testnet sign-with-keychain send

# 2. dry run, then verify leaf 0 on-chain (any account may sign)
near contract call-function as-read-only <CONTRACT_ID> check_leaf file-args target/demo-args/reveal-0.json network-config testnet now
near contract call-function as-transaction <CONTRACT_ID> reveal_leaf file-args target/demo-args/reveal-0.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <COORDINATOR_ID> network-config testnet sign-with-keychain send

# 3. a forgery is rejected: expect "ERR_ROOT_MISMATCH"
near contract call-function as-transaction <CONTRACT_ID> reveal_leaf file-args target/demo-args/reveal-5-tampered-salt.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <COORDINATOR_ID> network-config testnet sign-with-keychain send

# 4. open Ash's key, read the state
near contract call-function as-transaction <CONTRACT_ID> reveal_ash_key file-args target/demo-args/reveal-ash-key.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <COORDINATOR_ID> network-config testnet sign-with-keychain send
near contract call-function as-read-only <CONTRACT_ID> get_season file-args target/demo-args/season.json network-config testnet now
near contract call-function as-read-only <CONTRACT_ID> get_ash_key file-args target/demo-args/season.json network-config testnet now
```
Each vector season can be committed once per contract; `node scripts/demo-args.mjs 1` (or `2`) gives a fresh one.

## Commit a game season (the judge demo), one script

`?demo=judge` plays a fixed v3 season whose commitment is reproducible (seed-derived season id and salts,
`game/src/net/near-season.js`): season `793f6c05e89839f2`, root `03dbd458…`, 15 leaves. The script below creates the
accounts (faucet), builds, deploys and initializes the contract, commits the root and Ash's key, reveals every leaf
(after a free `check_leaf` dry run) and records every transaction hash; each step is skipped when already done.

```bash
node scripts/judge-season-args.mjs [seedHex]                                   # arguments only -> target/judge-args/<seasonId>/
scripts/deploy-judge-season.sh <CONTRACT_ID> <COORDINATOR_ID> [seedHex] [keychain|legacy-keychain]
node scripts/write-deployment.mjs                                              # -> game/src/net/near-deployment.js for the game client
```
**See:** `wrote target/judge-deploy/793f6c05e89839f2.json`, then the game's `npm test` green and, in the browser, the
"Committed on NEAR testnet ✓" badge next to "Verified ✓" (`docs/near.md`). The game reads the contract through
read-only RPC views only (`get_season`, `get_revealed_leaf`, `check_leaf`); it never signs.

Live seasons (no client seed) are not committed by the game: their salts come from the CSPRNG in the browser and no
server holds a coordinator key. The judge season and the vector seasons are the testnet slice.