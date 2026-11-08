# Task M report: NEAR for real (season commitment on testnet, verified in the game)

Branch `claude/near-live` (based on `claude/loving-curie-ihasft` = `main` + worker docs). Files touched, all inside
Task M's paths plus the two shared files every worker appends to: new `game/src/net/near.js`, `near-season.js`,
`near-deployment.js`, `game/tests/client/near.test.mjs`; one line + a comment in `game/src/play/transport-local.js`
(the existing `seasonRandomBytes` hook of the local API); five `wh.sign.near.*` strings in each locale file;
`game/package.json` (test list); `contracts/season-commit/scripts/{judge-season-args.mjs,deploy-judge-season.sh,
write-deployment.mjs}` and the contract README; new `docs/near.md`; rows appended to `docs/decisions.md` §4, the NEAR row
of `docs/HANDOFF.md`, request 7 in `docs/collab-requests.md`. README real/mock rows and the hackathon-rules NEAR item were
**not** changed: the task allows that only after the deployment runs, and it did not (below).

## Headline

- **Deployed to testnet: no.** The cloud session's permission layer (auto-mode classifier) refused the faucet call
  `near account create-account sponsor-by-faucet-service … network-config testnet create` as a *real-world
  transaction*; the same rule would stop `cargo near deploy` and every `call-function as-transaction`. The network is
  not the problem: `rpc.testnet.near.org` and `test.rpc.fastnear.com` answer JSON-RPC (status, view calls), the faucet
  host `helper.nearprotocol.com` answers, GitHub releases download. So there are **no account ids, contract id or
  transaction hashes to report**. Everything up to that call is built, tested and documented so that one script run
  under an account that may sign finishes the task (`docs/near.md` §2).
- **The judge season is now committable at all.** Before this task a `?demo=judge` run had a new season id and new
  salts every time (CSPRNG), so no on-chain record could ever match the browser. Fixed-seed sessions now derive those
  bytes from the seed; the judge season is always season `793f6c05e89839f2`, root
  `03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a`, 15 leaves, Ash key commitment `d1a39714…`
  (pinned by tests). Real seasons keep the CSPRNG. Recorded in `docs/decisions.md`.
- **The game side is done**: a read-only JSON-RPC client (`get_season`, `get_revealed_leaf`, `check_leaf`, …) with host
  fallback and timeouts, a per-session watcher that produces the "Committed on NEAR testnet ✓" season badge and the
  per-sign "Verified on NEAR testnet ✓" / "Checked by the NEAR contract ✓" badges with explorer links, degrading silently
  (offline, other seeds, no deployment, mismatch → no badge; the browser's own "Verified ✓" stands). No wallet, no signing.
  Rendering the badge model in the sign cards is Task F's two-line step (request 7 in `docs/collab-requests.md`).

## Done

1. **Tooling in the container**: Rust stable 1.99.1 + `wasm32-unknown-unknown` (via `rust-toolchain.toml`), `near-cli-rs`
   0.31.1 (`npm install -g near-cli-rs`), `cargo-near` built from crates.io (`cargo install cargo-near --locked`; it
   needs `libudev-dev` + `pkg-config` for its Ledger dependency, installed with apt). The GitHub installer scripts were
   refused by the permission layer ("code from external"), so crates.io/npm were used instead.
2. **Contract checks**: `cargo test --lib` → `test result: ok. 56 passed` (13 pure + 43 mocked chain);
   `cargo near build non-reproducible-wasm --no-abi` → `target/near/season_commit.wasm`, 199,813 bytes, SHA-256
   `af945497c922c18ab670c1acc9ee3888a50320cfcf5c5dad3d68cc1d3860aea9`. Sandbox tests: see "How it was checked".
3. **Reproducible demo commitment** (`game/src/net/near-season.js`): `demoRandomBytes(seedHex)` (SHA-256 counter mode,
   domain `ftf:demo-bytes:v1`), `seasonCommitment(state)` (re-derives every leaf with the contract preimage and checks it
   against the engine's leaf and root, so a byte-format drift fails locally), `contractArgs()` (the exact
   `commit_season` / `commit_ash_key` / `reveal_leaf` / `reveal_ash_key` arguments). `transport-local.js` passes
   `seasonRandomBytes` only when a `seedHex` is given.
4. **Contract arguments for the judge season**: `node scripts/judge-season-args.mjs [seedHex]` →
   `target/judge-args/<seasonId>/` (commit, Ash key, 15 reveals, season, summary). Goes through `createSeason` so the
   byte stream matches the local transport exactly (the room draws its 32-bit legacy seed first).
5. **Deploy pipeline**: `scripts/deploy-judge-season.sh <CONTRACT_ID> <COORDINATOR_ID> [seedHex] [keychain]`:
   faucet accounts, `cargo near deploy … with-init-call new`, `commit_season`, `commit_ash_key`, `check_leaf` dry run +
   `reveal_leaf` for each of the 15 leaves, every tx hash recorded in `target/judge-deploy/<seasonId>.json`; every step
   is skipped when already done; refuses non-`.testnet` ids. `scripts/write-deployment.mjs` turns the records into
   `game/src/net/near-deployment.js` (also refuses non-testnet ids). Ash's key is committed but deliberately not revealed
   by the script (it is the tick-13 secret; the command for the owner is in `docs/near.md`).
6. **Read-only client and badge model** (`game/src/net/near.js`): `createNearClient`, `createNearWatcher`,
   `compareSeason`, `leafArgs`, `explorerLinks`, `seasonBadge`, `leafBadge`; states documented in `docs/near.md` §3.
   Labels follow the contract README's rule: "verified on-chain" only for a leaf the contract recorded in a transaction.
7. **Strings**: `wh.sign.near.{committed,leaf,dryrun,mismatch,tip}` in en/uk/ru/it/zh (parity test green).
8. **Tests**: `game/tests/client/near.test.mjs`, 12 tests with a fake RPC: byte source; pinned judge constants and
   CSPRNG for unseeded seasons; commitment vs the room's `proof` endpoint and vs the committed contract vectors;
   RPC encoding, host fallback, HTTP and contract errors, abort on a hanging host; every watcher state; no network call
   for a disabled deployment or an unlisted season; season switch resets the leaves.
9. **Docs**: `docs/near.md` (status, architecture, pinned commitment, exact commands, state tables, security notes);
   contract README section; decisions rows; HANDOFF row; collab request 7.

## Not done

- **Accounts, deployment, commit, reveals, explorer links**: blocked by the session's permission layer, not by the
  network (above). To finish: run `contracts/season-commit/scripts/deploy-judge-season.sh` from a machine or session
  that may sign testnet transactions (the owner's PC with the near CLI, or a cloud session whose permission settings
  allow `near account create-account` / `cargo near deploy` / `near contract call-function as-transaction`), then
  `node scripts/write-deployment.mjs`, `cd game && npm test && npm run build`, commit `game/src/net/near-deployment.js`
  and the record, and update the README real/mock rows and `docs/hackathon-rules.md` with the real ids and hashes.
  Expected cost: 0 (faucet testnet NEAR; about 2 NEAR of storage for the wasm, 17 × 0.01 NEAR deposits mostly refunded).
- **The badge in the HUD**: Task F owns the sign cards; the model and strings are ready (request 7). Until F wires it
  and the deployment is recorded, the player sees only the browser's "Verified ✓".
- **Vector-season demo on the same contract** (`ERR_ROOT_MISMATCH` forgery, Ash key reveal) and the README/hackathon-rules
  NEAR rows: both wait for the deployment.
- **Not changed**: `engine.js`, `crypto.js`, the contract source (`src/`), `prototype-2d/`, README.

## How it was checked

- `cd game && npm test` → 304/304 (292 before + 12), `npm run build` green (the NEAR modules are not bundled until F
  imports them).
- `cd contracts/season-commit && cargo test --lib` → 56 passed.
- Live RPC shape (read-only, from the container): `status` on `rpc.testnet.near.org` (chain `testnet`, protocol 88);
  `call_function` view on `wrap.testnet` `ft_metadata` decoded correctly on both RPC hosts; an unknown account returns
  `UNKNOWN_ACCOUNT`, which the client maps to the `offline` state. The faked RPC in the tests mirrors these shapes.
- `node scripts/judge-season-args.mjs` writes 20 files; leaf 0 is `{"t":3,"place":1,"action":0,"power":1,"delay":2,"dots":2}`
  (Shell II, Gift, power 20), consistent with the README's judge path; `bash -n` on the deploy script; the deployment
  writer was dry-run against a fake record and the module re-imported, then restored.
- Self-review against the quality bar: no visual change (no screenshots to take); every behaviour change has a test;
  all five locales have the strings; keyboard focus is free because the badge is a real link (noted for F).
- `cargo test --test sandbox` could not run here: the near-sandbox node demands a file-descriptor limit of 65535 and
  the container's hard limit is 20000 (`Could not startup and run sandbox node`), not a code problem; that tier runs in
  `.github/workflows/contracts.yml` on Ubuntu (green on `main`; the contract source is unchanged by this task).
- Could not verify: a real transaction's CLI output format (the hash parser accepts both `Transaction ID: <hash>` and an
  explorer URL).
