# NEAR testnet: the season commitment, live

How the game's season commitment reaches NEAR **testnet** and how the browser recognises it. Testnet only: no mainnet,
no real funds, no wallet in the client, no key in the repository. The contract itself is documented in
[`contracts/season-commit/README.md`](../contracts/season-commit/README.md) (methods, byte format, what is and is not
verified on-chain); this page covers the pieces around it.

## Deployment status: live on testnet (09.11.2026)

Deployed by worker M with the owner's permission ("I allow the testnet deployment"), testnet only, faucet-sponsored accounts,
refundable storage deposits; keys stay in the deploying machine's `~/.near-credentials`, never in the repository.
Records (account ids and public transaction hashes only): `contracts/deployments/`.

| Account | Role |
|---|---|
| [`ftf-seasons.testnet`](https://testnet.nearblocks.io/address/ftf-seasons.testnet) | `season-commit` contract |
| [`ftf-shards.testnet`](https://testnet.nearblocks.io/address/ftf-shards.testnet) | `memory-shard` NEP-171 contract (refers to `ftf-seasons.testnet`) |
| [`ftf-coordinator.testnet`](https://testnet.nearblocks.io/address/ftf-coordinator.testnet) | owner and coordinator of both; holds the 3 shards (standing in for the AI clans) |

The judge season (`?demo=judge`, seed `cc161d308faa67539af44205b56b6d4f`): season `793f6c05e89839f2`, root
`03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a`, 15 leaves, Ash key commitment
`d1a397141934211d4673b7db523824988957b5d2d06b1ab050341a4b545d99b6` (committed, not revealed: it is the tick-13 secret).

| Transaction | Hash |
|---|---|
| deploy + init `ftf-seasons.testnet` | [`GaBgeb5uFwTqF1w7bXq9gFiEXvAaKKnS3svbXse9ir5C`](https://testnet.nearblocks.io/txns/GaBgeb5uFwTqF1w7bXq9gFiEXvAaKKnS3svbXse9ir5C) |
| commit_season | [`6TtWeZ3WuHfhAEkPa9k7mfHAs6ayxqG4iY2iJyGLahbA`](https://testnet.nearblocks.io/txns/6TtWeZ3WuHfhAEkPa9k7mfHAs6ayxqG4iY2iJyGLahbA) |
| commit_ash_key | [`E3ppFxXgvtEZbJeFUsa5dstyueCF85HqiBuG9wmVWXey`](https://testnet.nearblocks.io/txns/E3ppFxXgvtEZbJeFUsa5dstyueCF85HqiBuG9wmVWXey) |
| reveal_leaf #0 | [`BQo9Rb1sLBqXxcRbyiw82owYbL9f2pgTdFbp1is5ZW7G`](https://testnet.nearblocks.io/txns/BQo9Rb1sLBqXxcRbyiw82owYbL9f2pgTdFbp1is5ZW7G) |
| reveal_leaf #1 | [`EuE4iErrT1R6wXvJesAzPpANSi9odjAF5x59nw7RBrK7`](https://testnet.nearblocks.io/txns/EuE4iErrT1R6wXvJesAzPpANSi9odjAF5x59nw7RBrK7) |
| reveal_leaf #2 | [`E1BAaCAisrxfZ5tsv8GNpz5nLmosuRnWCSf8SAUJjiTB`](https://testnet.nearblocks.io/txns/E1BAaCAisrxfZ5tsv8GNpz5nLmosuRnWCSf8SAUJjiTB) |
| reveal_leaf #3 | [`FSBYd2RoirKgTuhjHBuVz3Y5YeLDQQhQfk3kQhySivGk`](https://testnet.nearblocks.io/txns/FSBYd2RoirKgTuhjHBuVz3Y5YeLDQQhQfk3kQhySivGk) |
| reveal_leaf #4 | [`EPwSPojfpLANuEoLrsFZFt63AjejjY7HfP3rU39VUmYZ`](https://testnet.nearblocks.io/txns/EPwSPojfpLANuEoLrsFZFt63AjejjY7HfP3rU39VUmYZ) |
| reveal_leaf #5 | [`GyNT7qqE4ETEDwHVhV5Rd3yjFKb311N2tt8SVYM6fDz9`](https://testnet.nearblocks.io/txns/GyNT7qqE4ETEDwHVhV5Rd3yjFKb311N2tt8SVYM6fDz9) |
| reveal_leaf #6 | [`5XQTv3L6Rn62r2H89AQzqYKUi3ZH3YtDTE94xn6ocT9T`](https://testnet.nearblocks.io/txns/5XQTv3L6Rn62r2H89AQzqYKUi3ZH3YtDTE94xn6ocT9T) |
| reveal_leaf #7 | [`69HJV7seGGrFQPGA6BBT5hpymW7aWBP1s8bVSZNjehrb`](https://testnet.nearblocks.io/txns/69HJV7seGGrFQPGA6BBT5hpymW7aWBP1s8bVSZNjehrb) |
| reveal_leaf #8 | [`5LWv9soYdyVZLTS9XnHQeXAGELauYsA4dz28aScY6Jow`](https://testnet.nearblocks.io/txns/5LWv9soYdyVZLTS9XnHQeXAGELauYsA4dz28aScY6Jow) |
| reveal_leaf #9 | [`4ndqwYLNeSjkoYuu1JA2kdnCjCjBHUvsiSnmYZTw9q9o`](https://testnet.nearblocks.io/txns/4ndqwYLNeSjkoYuu1JA2kdnCjCjBHUvsiSnmYZTw9q9o) |
| reveal_leaf #10 | [`GP33yvHm7VYRTmAfSjUmk8UVXNug2MVbUxJhEeBi2Tcf`](https://testnet.nearblocks.io/txns/GP33yvHm7VYRTmAfSjUmk8UVXNug2MVbUxJhEeBi2Tcf) |
| reveal_leaf #11 | [`BX5y5SdD7SsgLH9A9kuxUx5LUQjSkW6cZptgagphDNyy`](https://testnet.nearblocks.io/txns/BX5y5SdD7SsgLH9A9kuxUx5LUQjSkW6cZptgagphDNyy) |
| reveal_leaf #12 | [`5T6QtFxJw6aohEkjFkyw3Vvuf13Nnbm7UWZePHZG2A9e`](https://testnet.nearblocks.io/txns/5T6QtFxJw6aohEkjFkyw3Vvuf13Nnbm7UWZePHZG2A9e) |
| reveal_leaf #13 | [`5FodXX9DEnEaDFqAarZ7VNJcWh9w9xd3TJkrzhgTtpCG`](https://testnet.nearblocks.io/txns/5FodXX9DEnEaDFqAarZ7VNJcWh9w9xd3TJkrzhgTtpCG) |
| reveal_leaf #14 | [`968wtGh9VTifeNfGQwAqw2MHkn1aYe6NYburABhwqBxQ`](https://testnet.nearblocks.io/txns/968wtGh9VTifeNfGQwAqw2MHkn1aYe6NYburABhwqBxQ) |
| deploy + init `ftf-shards.testnet` | [`6RBYGycH8uf9ub519KPRriUKRxxs7gXDZ8Jp3FZy4eGt`](https://testnet.nearblocks.io/txns/6RBYGycH8uf9ub519KPRriUKRxxs7gXDZ8Jp3FZy4eGt) |
| mint_shard `793f6c05e89839f2-7` | [`2nqGqiVfk8pQaC6ue9naxR8XDYAEHXcqRZ8DovHi7LLc`](https://testnet.nearblocks.io/txns/2nqGqiVfk8pQaC6ue9naxR8XDYAEHXcqRZ8DovHi7LLc) |
| mint_shard `793f6c05e89839f2-10` | [`D279h9JSGt2iZhbwnGwTHhne3pEgJikPyR4ZTVZpeJgF`](https://testnet.nearblocks.io/txns/D279h9JSGt2iZhbwnGwTHhne3pEgJikPyR4ZTVZpeJgF) |
| mint_shard `793f6c05e89839f2-15` | [`6BpYCfy8s5zBe1w2eBBabwGx8spwLwMd7oCzNfkmN5xR`](https://testnet.nearblocks.io/txns/6BpYCfy8s5zBe1w2eBBabwGx8spwLwMd7oCzNfkmN5xR) |

Checked after the deploy with read-only RPC views (anyone can repeat them, no key needed):
```bash
near contract call-function as-read-only ftf-seasons.testnet get_season json-args '{"season_id":"793f6c05e89839f2"}' network-config testnet now
# -> schedule_root 03dbd458…5075769a, leaf_count 15, revealed_count 15, ash_key_committed true
near contract call-function as-read-only ftf-seasons.testnet check_leaf file-args <reveal-5 with one salt digit changed> network-config testnet now
# -> {"valid": false, "error": "ERR_ROOT_MISMATCH: the proof does not lead to the committed schedule root"}
near contract call-function as-read-only ftf-shards.testnet shards_of_season json-args '{"season_id":"793f6c05e89839f2"}' network-config testnet now
# -> 3 shards; shard 7 (Iris's Call, bought by Frost for 13) carries unlocked_leaf 63903cca…, equal to leaf #3 in ftf-seasons.testnet
```
The on-chain `shard_svg` of shard 7 is byte-identical to the game's `shardSvg()` output.

In the game (headless Chromium, 1280×800, 1920×1080, 390×844): `?demo=judge&mode=walk`, after trial 3 the revealed
Sign #1 shows **Verified ✓** and, below the anchor, **Verified on NEAR testnet ✓** linking to the reveal transaction of
leaf #0. No console errors. The game never signs: it only reads `get_season` and `get_revealed_leaf`.
Shard NFTs in the game (09.11, `claude/shard-nft-hud`): after Frost buys Iris's shard at the trial-6 auction a
"Minted on NEAR testnet" toast appears, and the Memories panel shows the 3 shards as NFT cards (one `shards_of_season`
view). Screens: `docs/screens/shard-nft/`.

### Control handed to the owner (09.11.2026)

At the owner's request the project's testnet control moved to the owner's account
[`lambada_eth.testnet`](https://testnet.nearblocks.io/address/lambada_eth.testnet). Only public data is recorded here.
Nothing was deleted: the original keys still work.

| Step | Transaction |
|---|---|
| nft_transfer `793f6c05e89839f2-7` → lambada_eth.testnet | [`GEVd8yFZ65vCDg2svnzmgn5iiQHbUqDhpzT1jV4fZwDR`](https://testnet.nearblocks.io/txns/GEVd8yFZ65vCDg2svnzmgn5iiQHbUqDhpzT1jV4fZwDR) |
| nft_transfer `793f6c05e89839f2-10` → lambada_eth.testnet | [`BmtfYVVdyPqsmiWAyEXFrph6Mxr2DUbxLt6BvCMHAvDt`](https://testnet.nearblocks.io/txns/BmtfYVVdyPqsmiWAyEXFrph6Mxr2DUbxLt6BvCMHAvDt) |
| nft_transfer `793f6c05e89839f2-15` → lambada_eth.testnet | [`9gJNZ3oAeXsQYqNHZpb78UAwZn9QMgAnXmwJ3JfpNThe`](https://testnet.nearblocks.io/txns/9gJNZ3oAeXsQYqNHZpb78UAwZn9QMgAnXmwJ3JfpNThe) |
| add_coordinator lambada_eth.testnet on ftf-seasons.testnet | [`3XFA567BHqiVEYngFgv8KEcQFwMsKBRjLbenVbqKnjK8`](https://testnet.nearblocks.io/txns/3XFA567BHqiVEYngFgv8KEcQFwMsKBRjLbenVbqKnjK8) |
| add_coordinator lambada_eth.testnet on ftf-shards.testnet | [`3uxfFkWeXJij2SJYjJDiF7woSevRQsDRnbsJ26zeA2SK`](https://testnet.nearblocks.io/txns/3uxfFkWeXJij2SJYjJDiF7woSevRQsDRnbsJ26zeA2SK) |
| owner's public key as full-access key on ftf-coordinator.testnet | [`AfpJpLA2JsMEuKWGEY6VTKn9nENiPCpWVkN3oqXYzqnW`](https://testnet.nearblocks.io/txns/AfpJpLA2JsMEuKWGEY6VTKn9nENiPCpWVkN3oqXYzqnW) |
| owner's public key as full-access key on ftf-seasons.testnet | [`6wLLGk72iwcssMV9D5VXM4G4QaUaZwzb2ptRGpMs8sHu`](https://testnet.nearblocks.io/txns/6wLLGk72iwcssMV9D5VXM4G4QaUaZwzb2ptRGpMs8sHu) |
| owner's public key as full-access key on ftf-shards.testnet | [`FUAjLVpwa1rBhXadnYcqxZL5TKDRbAeAFmFVNgEhJeDs`](https://testnet.nearblocks.io/txns/FUAjLVpwa1rBhXadnYcqxZL5TKDRbAeAFmFVNgEhJeDs) |

Verified afterwards with read-only RPC:
- `nft_tokens_for_owner(lambada_eth.testnet)` on ftf-shards.testnet returns the 3 judge shards; ftf-coordinator.testnet holds 0.
- `get_coordinators` on both contracts returns `ftf-coordinator.testnet` and `lambada_eth.testnet`.
- `view_access_key_list` on all three accounts lists two full-access keys: the original one and the owner's
  `ed25519:7w8hrbbdxUFhxShfGBT4rP6k8W7j4Q1TTD6rP6ky5LTE`.

The contracts' `owner_id` (which manages coordinators) is still `ftf-coordinator.testnet`, because neither contract has
an owner-transfer method. The owner controls that account through the added full-access key.

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
