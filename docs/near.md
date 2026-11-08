# NEAR testnet: the season commitment, live

How the game's season commitment reaches NEAR **testnet** and how the browser recognises it. Testnet only: no mainnet,
no real funds, no wallet in the client, no key in the repository. The contract itself is documented in
[`contracts/season-commit/README.md`](../contracts/season-commit/README.md) (methods, byte format, what is and is not
verified on-chain); this page covers the pieces around it.

## Deployment status

| Item | State |
|---|---|
| Contract build and tests | `cargo test --lib` 56/56 in this session (Linux); wasm build via `cargo near build` (see the report) |
| Testnet accounts and deployment | **not done from the worker session**: the sandbox's permission layer refused `near account create-account sponsor-by-faucet-service …` as a real-world transaction (network to `rpc.testnet.near.org` and the faucet is open). One command does it, below. |
| `game/src/net/near-deployment.js` | `contractId: null` → every NEAR lookup in the game is off until the deploy record is written |
| Game client | read-only RPC client, watcher and badge model done and tested; the HUD renders the badge after Task F's step (request 7 in `docs/collab-requests.md`) |

Until the table's second row says *done*, the README keeps saying the contract is **not deployed**, and the game says only
"Verified ✓" (browser verification against the root).

## What runs where

```
engine.js (rules v3)  ──►  season id, salts, 15 leaves, Merkle root, Ash key commitment
        │                        │
        │   fixed seed? ─────────┤  src/net/near-season.js: seed-derived bytes → the same commitment on every machine
        │                        │
        ▼                        ▼
browser: "Verified ✓"      contracts/season-commit on testnet: commit_season, commit_ash_key, reveal_leaf × 15
 (crypto.js proof)               ▲                                  │
        │                        │ scripts/deploy-judge-season.sh    │ get_season / get_revealed_leaf / check_leaf (views)
        │                        │                                  ▼
        └──────────────► src/net/near.js watcher: "Committed on NEAR testnet ✓" + per-sign badge with the explorer link
```

### 1. The judge season is reproducible, so it can be committed once

The engine draws the season id and every salt from `randomBytes` (a CSPRNG by default). Two runs of `?demo=judge` used to
share the schedule (seed `cc161d308faa67539af44205b56b6d4f`) but not the commitment, so nothing on-chain could ever match
the browser. Fixed-seed sessions (`seedHex` on the local transport: `?demo=judge`, `?seed=<hex>`) now draw those bytes
from `demoRandomBytes(seedHex)`: SHA-256 in counter mode over `ftf:demo-bytes:v1|<seed>|<n>`
(`game/src/net/near-season.js`). Real seasons (no client seed) keep the CSPRNG. The demo seed is public, and the whole
schedule derives from it, so the derived salts hide nothing that was secret before.

The judge season, as the game builds it and as the contract stores it:

| | |
|---|---|
| seed (`?demo=judge`) | `cc161d308faa67539af44205b56b6d4f` |
| rules | `v3` (commitment schema `v2`) |
| season id | `793f6c05e89839f2` |
| schedule root | `03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a` |
| leaves | 15 (ticks 3–17) |
| Ash key commitment | `d1a397141934211d4673b7db523824988957b5d2d06b1ab050341a4b545d99b6` |
| leaf 0 (tick 3) | `{"t":3,"place":1,"action":0,"power":1,"delay":2,"dots":2}` = Shell II, Gift, power 20 (the README judge table) |

`game/tests/client/near.test.mjs` pins these constants; if a rules or engine change moves them, the test fails and the
season has to be committed again under its new id.

```bash
cd contracts/season-commit
node scripts/judge-season-args.mjs            # -> target/judge-args/793f6c05e89839f2/{commit-season,commit-ash-key,reveal-0..14,reveal-ash-key,season,summary}.json
node scripts/judge-season-args.mjs <seedHex>  # any other fixed seed
```
The script goes through `createSeason` (`game/src/net/engine-host.js`) with the same byte stream as the local transport,
and `seasonCommitment()` re-derives every leaf with the contract's preimage and checks it against the engine's own leaf
and root, so a drift between `engine.js` and the contract fails here, not on-chain.

### 2. Deploy and commit (testnet, one script)

Prerequisites: Rust, `cargo-near`, `near` CLI (contract README). Then:

```bash
cd contracts/season-commit
scripts/deploy-judge-season.sh <CONTRACT_ID>.testnet <COORDINATOR_ID>.testnet            # OS keychain
scripts/deploy-judge-season.sh <CONTRACT_ID>.testnet <COORDINATOR_ID>.testnet cc161d308faa67539af44205b56b6d4f legacy-keychain   # containers / CI
```
What it does, skipping any step already done (re-runnable after a failure):
1. creates both accounts through the testnet faucet (`near account create-account sponsor-by-faucet-service … autogenerate-new-keypair save-to-keychain`; the keys stay in the keychain);
2. `cargo near deploy build-non-reproducible-wasm --no-abi <CONTRACT_ID> with-init-call new {"owner_id": <COORDINATOR_ID>, "coordinators": [<COORDINATOR_ID>]}`;
3. `commit_season` (root, schema `v2`, 15 leaves) and `commit_ash_key`, signed by the coordinator, 0.01 NEAR storage deposit each (the rest is refunded);
4. for every leaf 0–14: the free `check_leaf` dry run, then `reveal_leaf` (the contract recomputes the leaf byte for byte and folds the path to the root);
5. writes `target/judge-deploy/<seasonId>.json` with the account ids and every transaction hash (public data only).

Then record the deployment for the client and commit the result:
```bash
node scripts/write-deployment.mjs             # -> game/src/net/near-deployment.js (contract id, RPC hosts, explorer, committed seasons + tx hashes)
cd ../../game && npm test && npm run build
```
Nothing in this flow writes a key or a seed phrase anywhere under the repository; `write-deployment.mjs` refuses a contract
id that does not end in `.testnet`.

Not revealed by the script on purpose: **Ash's key**. The phrase is the in-game secret of tick 13; revealing it on-chain
would print it on the explorer. The owner can run it when the season is over:
```bash
near contract call-function as-transaction <CONTRACT_ID> reveal_ash_key file-args target/judge-args/793f6c05e89839f2/reveal-ash-key.json prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as <ANY_ACCOUNT> network-config testnet sign-with-keychain send
```
The contract README's "Demo calls" (vector season 0, a forgery that fails with `ERR_ROOT_MISMATCH`, an Ash key reveal) run
on the same contract and make a good second season for the judges.

### 3. The game reads testnet, read-only

`game/src/net/near.js`:
- `createNearClient({ contractId, rpcUrls })`: JSON-RPC `query` / `call_function` view calls only (`finality: final`),
  arguments as base64 JSON, results decoded from the byte array. Hosts: `rpc.testnet.near.org`, then
  `test.rpc.fastnear.com`; a dead host falls through to the next one, a hanging one is aborted after 6 s, and the host
  that answered is kept. Contract-side errors come back as `NearError` with a code (`UNKNOWN_ACCOUNT`,
  `CONTRACT_EXECUTION_ERROR`, `NETWORK`).
- `createNearWatcher({ season, proof })`: one per play session. `observe(obs)` after every observation; it asks the
  contract once per season (`get_season`) and once per revealed sign (`get_revealed_leaf`, then `check_leaf` only when
  nothing is recorded), and `subscribe(fn)` fires when a badge appears or changes.

States and what the player sees:

| `status.state` | Meaning | Badge |
|---|---|---|
| `disabled` | `near-deployment.js` has no contract id | none |
| `other-season` | this season id is not in the deployment's list (a random seed): the contract is not even asked | none |
| `checking` | `get_season` in flight | none |
| `committed` | `schedule_root` on-chain equals the browser's Merkle root (and the leaf count, when known) | **Committed on NEAR testnet ✓** → the commit transaction |
| `not-committed` | listed in the deployment but the contract has no record (redeployed elsewhere) | none |
| `mismatch` | a record exists with a different root | none (the browser's own check stands) |
| `offline` | no RPC answered / unknown account; retried on the next observation after 30 s | none |

| `leaf(index).state` | Meaning | Badge on the sign card |
|---|---|---|
| `on-chain` | `get_revealed_leaf` returns a record with the browser's leaf hash: the contract verified this proof in a transaction | **Verified on NEAR testnet ✓** → the reveal transaction |
| `dry-run` | nothing recorded, but the contract's free `check_leaf` view accepts the browser's proof | **Checked by the NEAR contract ✓** → the contract |
| `mismatch` | a different leaf is recorded under this index | **NEAR record differs ✗** |
| `missing` / `unknown` / `checking` / `offline` | not recorded and the dry run failed, no proof yet, in flight, or network down | none |

Leaf badges appear only while the season state is `committed`. Wording follows the contract README's rule: "verified
on-chain" is said only for a leaf the contract recorded (`on-chain`); the dry run is labelled as a check, and the
browser's own "Verified ✓" never changes meaning. Strings: `wh.sign.near.*` in all five locales.

Rendering is Task F's step (request 7 in `docs/collab-requests.md`): an `<a class="wh-pill wh-sign__near …">` after the
`Verified ✓` pill, built from `near.leafBadge(index)` / `near.seasonBadge()`.

### 4. Tests

`cd game && npm test` includes `tests/client/near.test.mjs` (12 tests, mocked RPC, no network): the byte source, the pinned
judge constants, the commitment against the room's proof endpoint and against the contract vectors, the RPC encoding and
fallbacks, the abort on a hanging host, every watcher state above, and that a disabled deployment or an unlisted season
never touches the network. The contract's own tiers: contract README.

## Security and scope notes

- The client never signs: no wallet, no key, no transaction. The only writes are the owner's / coordinator's CLI calls.
- Faucet accounts hold testnet NEAR only; the deposits are storage deposits refunded in the same call.
- The deployment module and the deploy records contain account ids and transaction hashes, nothing else.
- Seed-derived salts apply to fixed-seed sessions only, which are already labelled dev/demo (`clientChoseSeed`); a
  season without a client seed is as unpredictable as before.
