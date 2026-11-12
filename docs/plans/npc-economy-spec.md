# NPC economy on testnet (Move 2): owner's spec, excerpt

Owner's technical specification of 12 Nov 2026 (16:20 Kyiv), the parts the Move 2 builder needs: global rules, repo facts, Move 2.
Lead adaptation for this team (owner: lean team, Opus medium): one builder session, PRs to `main` through the lead (the lead is the
merge captain), no `integration/sprint` branch; every signing / deploy / funding step stays owner-gated and is run by the lead or the
owner only after the owner's explicit yes. The earlier "market contract" idea (silk balances on a new contract) is dropped in favour of
this spec: arena instances of the existing contracts, every transaction the record of a real engine event.

---


- `contracts/season-commit/scripts/judge-season-args.mjs [seedHex]` writes `commit-season`, `commit-ash-key`, `reveal-0..14`, `reveal-ash-key` argument files for any 32-hex seed through `createSeason` (`game/src/net/engine-host.js`) and `contractArgs` (`game/src/net/near-season.js`). Fixed-seed seasons derive salts from the public seed (`demoRandomBytes`), so **arena seasons are public-seed demonstration seasons, not secret-schedule fair-play seasons. Label them so.**
## 2. Global rules (every agent, every move)

1. **English only** in code, comments, docs, UI strings, PR text, commit messages.
2. **Branches:** `claude/<item-id>-<slug>`, created **off `integration/sprint`** (not `main`). **One PR per item**, targeting `integration/sprint`. Keep PRs under about 400 changed lines of code (docs and generated files excluded) unless the item says otherwise.
3. **Never** push to `main`, create or move a tag, change repo settings, force-push, or rewrite history. Only the merge captain (owner or designated agent plus deputy) merges `integration/sprint` into `main`.
4. **No mainnet, no signing, no spending, no deploying, no posting, no form submission.** Testnet transactions signed with any key count as signing. Code that *can* send transactions must default to dry-run and refuse to send without `--yes` plus an owner-supplied environment, and **agents never run the send path**. If you need one of these actions, stop and write the exact command, its cost and its risk for the owner.
5. **No secrets in the repo, logs, tests, screenshots or PR text:** no `.env`, no private keys or seed phrases (not even testnet), no tokens. Keys live only on the owner's runner host. **No coordinator or relayer key in CI, ever.** Test keys are generated in memory.
6. **Keep tests green.** Before each PR run and paste real output for: `cd game && npm test`, `cd server && npm test`, `cd relayer && npm test`, `cd presence && npm test`, and `cd contracts/<name> && cargo test --lib` for any contract touched. Do not weaken or delete tests. New tests need a place in the runner: **`game/package.json` and `server/package.json` list test files explicitly in the `test` script** (a new game test file must be appended to that list; this is a merge hot spot, append at the end on one line and tell the captain); `relayer` and `presence` use globs (`tests/*.test.mjs`).
7. **No overclaiming.** Every sentence that claims a capability in README, docs, UI, post, video or form carries a `Proof:` line in the PR (command with real output, URL, or transaction hash) and uses the README vocabulary: "Real on testnet", "Built, dormant", "Local", "Not built". Scripted behaviour is "scripted" or "rules-based", never "AI" or "LLM". Never invent a transaction count, balance, user number or date; read it from the chain or the repo and write the command beside it. Mark anything you could not verify **[VERIFY]**.
8. **File ownership** (sprint plan section 2.0 plus the new streams in section 3.3). Edit only your stream's paths. Anything else: describe it in the PR.
9. **Feature flags default OFF** for anything that changes what a judge sees on `?demo=judge`; test that flag-off behaviour is unchanged.
10. **No binary over 2 MB**, no videos in the tree, no new dependency in `game/`, `server/`, `relayer/`, `presence/` unless the item says so (these packages are intentionally dependency-light; check each `package.json`).
11. **Locale parity:** UI strings go in all five locale files (`game/src/play/locales/{en,ru,uk,it,zh}.js`), append-only inside `// --- <item-id> ---`; the parity tests stay green.
12. **Time-box.** If an item is not green by its deadline, close the PR and cut the item. Cutting is a good outcome.
13. **Shared preamble:** paste the block in section 3.4 at the top of every agent session.

---
## 4. Repo facts the agents must rely on (verified on `8bbdc4fb`)

### 4.1 Accounts and contracts (testnet)

| Account | Contract | Notes |
|---|---|---|
| `ftf-seasons.testnet` | `season-commit` | owner `ftf-coordinator.testnet`; coordinators `ftf-coordinator.testnet`, `lambada_eth.testnet` (`docs/near.md`). Judge season `793f6c05e89839f2` (seed `cc161d308faa67539af44205b56b6d4f`, root `03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a`, 15 leaves) |
| `ftf-shards.testnet` | `memory-shard` (NEP-171) | 3 judge tokens `793f6c05e89839f2-7`, `-10`, `-15`, held by `lambada_eth.testnet` |
| `guests.ftf-coordinator.testnet` | `guests` | `create_guest` callable only by the contract itself or its owner (`require!(caller == env::current_account_id() || caller == self.owner_id)`); the relayer signs as the contract with a create_guest-only key; `stats` returns guests, today, daily_cap, fund |
| `heroine.`, `companions.`, `agents.`, `ledger.`, `chests.`, `skins.` `ftf-coordinator.testnet` | `character-nft` (x2), `agent-card`, `agent-ledger`, `loot-chest`, `skin-nft` | account ids from `game/src/net/day1-deployment.js` |
| Relayer | `https://159-195-130-113.sslip.io` | public URL in `day1-deployment.js`; `GET /api/health` returns `{ok, contract, configured, stats, tee, chests}` |

Other accounts named in the repo and chain facts from my earlier read-only RPC check (12 Nov 12:35 Kyiv; **re-measure**, they change): `guests.ftf-coordinator.testnet` 4.95 NEAR, fund 0.05 NEAR per guest, daily_cap 200, guests created 18 (12 today); `ftf-coordinator.testnet` 6.51 NEAR; `heroine.ftf-coordinator.testnet` 6.00 NEAR.

### 4.2 Who may call what (read from the contract sources)

| Contract | Method | Access | Deposit |
|---|---|---|---|
| season-commit | `commit_season(season_id, schedule_root, schema_version, leaf_count)` | **coordinator only**; immutable; `ERR_SEASON_EXISTS` on repeat | payable (0.01 NEAR "plenty", unused part refunded) |
| season-commit | `commit_ash_key(season_id, commitment)` | **coordinator only**, before the first reveal | payable |
| season-commit | `reveal_leaf(season_id, index, canonical_event, salt, merkle_path)` | **anyone**; the contract recomputes the leaf and folds the path; `ERR_ALREADY_REVEALED` on repeat | payable (storage settled from deposit) |
| season-commit | `reveal_ash_key(season_id, phrase, salt)` | **anyone** | payable |
| season-commit | views `get_season`, `get_revealed_leaf`, `get_revealed_leaves`, `get_ash_key`, `check_leaf`, `compute_leaf`, `get_coordinators`, `is_coordinator` | public | none |
| memory-shard | `mint_shard(receiver_id, shard)` | **coordinator only**; token id `<season_id>-<shard_id>`; first mint of a season pins `season_root` in this contract (`season_root` map) | payable ("0.1 NEAR is plenty"; refund to caller) |
| memory-shard | `nft_transfer` and NEP-171 views | standard `near-contract-standards` `NonFungibleToken`, approvals **not enabled** (`approval_prefix` is `None`) | 1 yoctoNEAR |
| memory-shard | `get_shard`, `shard_svg`, `season_shard_count`, `shards_of_season`, `season_schedule_root`, `preview_shard` | public views | none |
| agent-ledger | `record_track(npc, epoch, seed, policy_version, params, params_hash, snapshot_sha256, bar_from, bar_to, trades_compact, pnl_bp)` | **anyone** (recorded for `predecessor`); unique per (account, npc, epoch) (`ERR_EXISTS`); `npc` matches `[a-z0-9_]{1,32}`; at most 50 trades | payable (client uses 0.01 NEAR = `LEDGER_DEPOSIT`, gas 20 Tgas) |
| agent-ledger | `get_track`, `list_tracks`, `agent_summary`, `stats()` (count of tracks) | public | none |
| guests | `stats`, `guest_of` | public views | none |

**Critical consequence for Move 2:** `commit_season`, `commit_ash_key` and `mint_shard` need a coordinator. The production coordinators must **not** be handed to a bot runner. Move 2 therefore uses **separate arena contract instances** (same audited code, new accounts) whose coordinator is an arena sealer account. See section 6.

### 4.3 Existing tooling to reuse (do not rewrite)

- `contracts/season-commit/scripts/judge-season-args.mjs [seedHex]` writes `commit-season`, `commit-ash-key`, `reveal-0..14`, `reveal-ash-key` argument files for any 32-hex seed through `createSeason` (`game/src/net/engine-host.js`) and `contractArgs` (`game/src/net/near-season.js`). Fixed-seed seasons derive salts from the public seed (`demoRandomBytes`), so **arena seasons are public-seed demonstration seasons, not secret-schedule fair-play seasons. Label them so.**
- `contracts/memory-shard/scripts/judge-shards-args.mjs [seedHex] [--receiver <account>]` plays the canonical judge playthrough (forget the Call memory at trial 4, run to the end) through `createApi` and writes one `mint_shard` args file per shard.
- `game/src/net/near-tx.js` (byte-identical copy in `relayer/lib/near-tx.js`, a test enforces it): `createTxClient({rpcUrls, fetch, timeoutMs})` with `view`, `call({key, signerId, receiverId, methodName, args, gas, deposit})`, `importSecretKey`, `generateKeyPair`. **It fetches the access-key nonce on every call and waits `send_tx` with `wait_until: 'FINAL'`, one call at a time, FunctionCall only.** A throughput runner needs its own nonce-managed lane around it (section 6.5); do not modify the shared file (client and relayer copies must stay identical).
- `game/src/game/track-record.js` (`trackArgs`, `verifyTrack`), `game/src/game/town-economy.js` (`hireResult`, `TEMPERAMENTS`, `ARMS`, `HIRE`), `game/src/game/exchange-agents.js` (`POLICIES` = salt, amber, frost), `tools/verify-agent/verify.mjs <account> <npc> <epoch> [ledger]` (prints PASS or FAIL after re-running the policy over the sealed snapshot).
- `tools/verify/verify.mjs` (zero-dependency Merkle verifier), `game/scripts/replay-season.mjs`, `game/scripts/judge-replay-link.mjs`, `game/src/net/replay.js` and `game/src/ui/replay-view.js` (`?replay=r1.…`).
- Agent HTTP API: `server/` (`cd server && npm start`, `node examples/agent.mjs --time-scale 1000` plays a season in about 1 s; OpenAPI at `docs/api/openapi.yaml`). It exposes **no wallet, signing or transfer endpoints by design**; `mint_final_card` is never available to agents. Keep it that way: the NPC runner is a separate tool that calls the room code in process (`createApi` from `game/src/net/api.js`, same as the arg scripts).
- Relayer (`relayer/`): per-IP token bucket "3 at once, then 1 per 10 min" in instance memory (`createBucket`), the contract's `daily_cap` as the hard limit; `429 daily_cap` is returned before any transaction; client error handling today is `set('failed', body.error || 'relayer_' + status)` in `game/src/play/day1-mint.js`.

### 4.4 Test and verify commands (real)

```bash
bash scripts/verify-all.sh --skip-rust     # game, server, relayer, presence; exit 0 when all pass; BROKEN on Node 23+ (parser), see Move 7
bash scripts/verify-all.sh                 # plus Rust contracts (rustup, pkg-config, libssl-dev)
cd game && npm test                        # explicit file list in package.json
cd server && npm test                      # node --test with an explicit file list
cd relayer && npm test                     # node --test tests/*.test.mjs
cd presence && npm test                    # node --test --test-concurrency=2 tests/*.test.mjs
cd contracts/<c> && cargo test --lib       # c in season-commit memory-shard agent-card guests character-nft token-account agent-ledger loot-chest skin-nft
node scripts/stats.mjs [--skip-rust] [--write]   # writes docs/STATS.md and docs/stats.json
```

Confirmed bug (reproduced on Node 24.22.1 on this commit): `parseCounts` in `scripts/stats.mjs` matches only `^# pass (\d+)`; with `ℹ pass 31` it returns `null`, so every JS suite is marked FAILED. `docs/STATS.md` is stale (game 824 vs 845 in my review; no `presence` or `skin-nft` row, commit `19f5ca0`).


## 6. MOVE 2 (+3): On-chain NPC economy on testnet: about 20,000 real transactions in 24 h · P0 headline · SAFE to build, OWNER-GATED to run

### 6.1 Goal, criteria, competitors

**Goal.** Close the largest visible gap to the Games leaders: a running, autonomous, verifiable on-chain activity. **Hard target: at least 20,000 successful testnet transactions in a 24-hour run**, from at least 10 dedicated arena accounts, across at least 7 action types, each transaction the on-chain record of a real engine event, with every season and every track independently re-verifiable by a published script.
**What this is not.** Not a token economy and not money (README "Money: in-game silk only" stays true: nothing here transfers value; shard transfers carry no payment). Not an LLM (clans are scripted: say "scripted"). Not human play: say so on every surface.

### 6.2 What counts as a genuine action (and what does not)

Every counted transaction must (a) call a method of an FTF contract that changes state in a way the contract's own tests describe, (b) be traceable in the runner journal to an engine event or a documented policy decision, and (c) be re-verifiable from a public seed. **A transaction that does not meet (a) to (c) is not sent.** No self-transfers, no empty or no-op calls, no repeating the same call, no loops for volume, no failed-on-purpose calls.

| # | Action (tx) | Contract method | Signed by | Engine or policy source | Re-verification |
|---|---|---|---|---|---|
| 1 | Seal a season | `seasons.commit_season` | arena sealer (coordinator of the **arena** instance) | `createSeason` for public seed `arena:v1:<n>` (`contracts/season-commit/scripts/judge-season-args.mjs`) | `tools/verify-arena` regenerates root from the seed |
| 2 | Seal the crisis key | `seasons.commit_ash_key` | sealer | same args script | same |
| 3 | Reveal a leaf | `seasons.reveal_leaf` (anyone) | the clan account assigned to that leaf (scripted assignment: leaf index mod 5 over the five clans; **a scripted rule, say so**) | the season's 15 leaves; the contract recomputes the leaf and folds the path | `get_revealed_leaf` plus `check_leaf` view; independent Merkle check |
| 4 | Open the crisis key | `seasons.reveal_ash_key` | a guide account | args script | `get_ash_key` |
| 5 | Mint a shard to the auction winner | `shards.mint_shard` | sealer (arena coordinator) | `judgeShards(seed)` in `judge-shards-args.mjs`: engine auction result gives winner clan and shard data (`game/src/net/shard-nft.js`) | `get_shard`, leaf equals the sealed leaf, `tools/verify-arena` |
| 6 | Move a shard (scripted market) | `shards.nft_transfer` (1 yocto) | current holder clan | scripted market policy (section 6.10, N4): buyer is the clan with the highest valuation; each shard moves at most twice; **no payment on chain** | `nft_token` owner view plus `nft_transfer` event log |
| 7 | Record a closed hire | `ledger.record_track` | clan account | `hireResult` from `game/src/game/town-economy.js` with the account's `createTownLedger` state (silk, level, `MAX_HIRES`); stops when the town ledger says the account cannot afford a hire | `node tools/verify-agent/verify.mjs <account> <npc> <epoch> <arena ledger>` prints PASS |

The scheduler sends only what the rules allow; if hires cannot be afforded, volume shifts to seasons. If funds run short, it stops at the budget cap (section 6.7). The default quota mix is about 56% season pipeline (rows 1 to 5), 30% tracks (row 7), 14% shard moves (row 6); the scheduler fills the quota with whatever is legal and affordable. These shares are a **plan, not a promise**; publish the realized mix.

### 6.3 Throughput math

- 20,000 tx / 24 h = **833 tx/h = 13.9 tx/min = 0.23 tx/s** average.
- A season is about **20 to 21 transactions**: 1 `commit_season` + 1 `commit_ash_key` + 15 `reveal_leaf` + 1 `reveal_ash_key` + the minted shards (the judge season minted 3; **[VERIFY]** the average over arena seeds in the dry run). 20,000 transactions are about 560 seasons if the 56/30/14 mix holds, or about 1,000 seasons if only seasons are sent.
- **Required average rate depends on when the long run starts**, because the deadline is Sat 15 Nov 01:59 Kyiv:

| Long run starts (Kyiv) | Minutes to the deadline | Rate for 20,000 by the deadline | Tx at the Fri 20:00 hard freeze at that rate |
|---|---|---|---|
| Fri 06:00 | 1,199 | 16.7 tx/min | 14 h x 60 x 16.7 = about 14,000 |
| **Fri 10:00 (target)** | 959 | **20.9 tx/min** | 10 h = about 12,500 |
| Fri 14:00 | 719 | 27.8 tx/min | 6 h = about 10,000 |
| Fri 18:00 | 479 | 41.8 tx/min | 2 h = about 5,000 |
| (24 h exactly) | 1,440 | 13.9 tx/min | n/a (ends 24 h after the start) |

  Decision for the owner: **the exact meaning of the headline is "20,000 successful transactions recorded on chain by the time judging starts (Mon 16 Nov 02:00 Kyiv)"**; if a run started Fri 10:00 at 13.9 tx/min it reaches 20,000 at Sat 10:00 and keeps going. Judging starts 16 Nov 00:00 UTC, so activity after the deadline is visible to judges, but whether the organizers weight post-deadline activity is **[VERIFY with organizers; do not assume]**. Anything quoted in the X post or the form is the count **at that moment** read from the counter, never a projection.
- **Burst plan.** Steady state is capped at **25 tx/min**; a burst allows up to **60 tx/min for at most 10 minutes** to catch up after an RPC outage, never more. Capacity target: 40 tx/min sustained across the arena accounts. At 20.9 tx/min across 10 accounts that is about 2.1 tx/min per account (one transaction every 29 s), far below what one key can do (`send_tx` FINAL takes a few seconds), so **throughput is limited by the budget and the RPC allowance, not by nonces** (section 6.5).
- **RPC load.** Each transaction needs about 4 to 5 RPC calls (block hash, optional nonce resync, `send_tx`, status, plus 1 idempotency view). At 25 tx/min that is about 2 requests per second on average; the runner enforces a global limit of **3 requests/s with bursts of 8** and spreads over the RPC list in section 6.5.

### 6.4 Architecture: separate arena instances, no production keys

**Why separate instances.** `commit_season`, `commit_ash_key`, `mint_shard` need a coordinator. We do **not** add bot keys to `ftf-seasons.testnet` or `ftf-shards.testnet` (judged state stays untouched, no coordinator key goes near a bot, and bot volume gets its own counters for the honest human/bot split). The arena uses **new instances of the same audited code**, deployed under a fresh account tree created with the faucet (the repo's own `deploy-judge-season.sh` already does this: `near account create-account sponsor-by-faucet-service ...`), so **no production key is used at all**.

Proposed account tree (**names are proposals; availability [VERIFY]; the owner confirms**):

```
ftf-arena.testnet                      arena owner (created via faucet by the owner; key stays on the owner's machine)
├── seasons.ftf-arena.testnet          season-commit instance   (owner ftf-arena.testnet; coordinator: sealer)
├── shards.ftf-arena.testnet           memory-shard instance    (season_contract = seasons.ftf-arena.testnet; coordinator: sealer)
├── ledger.ftf-arena.testnet           agent-ledger instance
├── sealer.ftf-arena.testnet           the only coordinator (commit_season, commit_ash_key, mint_shard)
├── salt.ftf-arena.testnet  ash.  moss.  amber.  frost.     the five clan accounts (reveal_leaf, nft_transfer, record_track)
└── guide1..guide4.ftf-arena.testnet   four scripted guide accounts (they play the "Iris seat" through the room code; reveal_ash_key; record_track)
```

That is **10 signing accounts** (sealer, 5 clans, 4 guides) plus 3 contract accounts. The guide accounts are named `guide*`, not `iris*`: they are scripted players, not the character. **Keys:** one full-access key per account at minimum, stored in a key file **outside the repository** on the owner's runner host (chmod 600), loaded by path; never in CI, never in the repo, never in a log. `ftf-arena.testnet` keeps its key off the runner (it is needed only for setup and for `drain`).
Documentation records only account ids and public transaction hashes (`contracts/deployments/arena-*.json`, same shape as `testnet-season-commit-*.json`).

### 6.5 Keys, nonces, RPC, batching

- **Payable calls need full-access keys.** `reveal_leaf`, `commit_season`, `mint_shard`, `record_track` are `#[payable]` and settle storage from the attached deposit; **a function-call access key cannot attach a deposit** (NEAR protocol rule **[VERIFY against the NEAR access-key docs]**). So the NPC accounts use **full-access keys on throwaway arena accounts holding a capped balance**, never on production accounts. This is why the kill switch includes `DeleteKey` and `drain` (section 6.7).
- **Nonce strategy.** The nonce is per (account, public key). `createTxClient.call` re-reads it before each call and waits for `FINAL`, which is correct but slow and unsafe for concurrent use. The runner uses a **lane** per (account, key): a serial queue, a local nonce counter initialised once from `view_access_key`, incremented per transaction, re-synced from the chain on `InvalidNonce` (once, then retry), and one lane never has two transactions in flight with the same key. Because the target is about 2 tx/min per account, **one key per account is enough**; give only the sealer (the highest-volume signer in the season pipeline) up to **3 extra full-access keys** (4 lanes) and the clans 1 to 2 extra keys each if the burst plan is used. Extra keys are added by the owner with `AddKey` during setup (owner-gated). Do not parallelise one key.
- **Confirmation.** Send with `send_tx` and `wait_until: 'EXECUTED_OPTIMISTIC'` (fast), then confirm finality by a status poll before the transaction is counted as `ok` in the journal; unknown outcome (timeout) is resolved by `tx` status for the known hash, never by blind resend. Count only transactions whose final status is `SuccessValue`.
- **Idempotency.** Before every send the runner reads the target state (`get_revealed_leaf`, `get_track`, `get_season`, `nft_token`, `get_ash_key`); if the effect already exists it records `already` and does not send. The contracts back this: `ERR_SEASON_EXISTS`, `ERR_ALREADY_REVEALED`, `ERR_EXISTS` on repeat. A restart replays the journal and the scheduler recomputes the next legal action from chain state.
- **RPC list and limits.** The repo's defaults are `https://test.rpc.fastnear.com` then `https://rpc.testnet.near.org` (`game/src/net/near-deployment.js`, `relayer/lib/core.js`). Public endpoints have rate limits and may change **[VERIFY current limits and sunset notices]**. The runner takes an ordered list (config), health-checks each, rotates on 429, 5xx or timeout, obeys `Retry-After`, and **never shares a rate budget with the relayer** (do not load the same key or IP that serves the guest flow; if possible the owner supplies a separate RPC API key). If the relayer's `GET /api/health` slows by more than 3x during a human launch (Move 3), the runner halves its rate (config switch, default on).
- **Batching (state honestly).** A NEAR transaction may carry several actions (for example several `FunctionCall`s to one receiver). That is **one transaction hash** on explorers. **We do not batch counted game actions**: one logical action is one transaction, so the counter equals the game's activity. Batching is allowed only for non-counted setup (create account, fund, add keys) and is excluded from the counter. If any batch is used for counted actions in future, publish "transactions" and "actions" as two separate numbers. Splitting one action into several empty transactions to raise the count is forbidden.
- **Backoff.** On 429, 5xx, timeouts: exponential backoff with jitter (base 1 s, factor 2, cap 60 s), per RPC and per lane. `InvalidNonce`: resync once. Contract panics that mean "already done" (`ERR_ALREADY_REVEALED`, `ERR_EXISTS`, `ERR_SEASON_EXISTS`): record `already`, continue, **no retry loop**. Any other contract panic: mark the season or track `failed`, skip it, and count it toward the circuit breaker; never retry a deterministic failure.

### 6.6 Cost: gas, storage, and the top-up plan

**Unit costs are not known yet; they must be measured, not guessed.** Item N1 measures the storage delta per method in the `near-workspaces` sandbox (`contracts/season-commit/tests/sandbox.rs` and `contracts/agent-card/tests/sandbox.rs` show the pattern **[VERIFY a sandbox test can be added for memory-shard and agent-ledger with the toolchain on CI]**) and the gas burnt per method; the stage-0 dry run (section 6.9) confirms them on testnet.

Formulas (protocol constants **[VERIFY at gas and storage docs]**): storage cost = bytes added x 1e19 yoctoNEAR (0.00001 NEAR per byte; 1 NEAR = 100 KB). Gas cost = gas burnt x gas price (testnet minimum price; 1 Tgas is about 0.0001 NEAR at the minimum price **[VERIFY with the `gas_price` RPC]**); unused prepaid gas is refunded. **Storage is locked on the contract account's balance, not burned**; the unused part of an attached deposit is refunded to the caller (the contracts' `settle_storage`). Storage cannot be reclaimed because arena records are permanent.

**Illustrative arithmetic on ESTIMATED byte counts; N1 replaces every number below with a measurement. Do not quote these in any public text.**

| Action | Count in a 20,000-tx plan | Est. storage per tx | Est. NEAR |
|---|---|---|---|
| `commit_season` | 560 | about 200 B | 1.1 |
| `commit_ash_key` | 560 | about 150 B | 0.8 |
| `reveal_leaf` | 8,400 | about 350 B | 29.4 |
| `reveal_ash_key` | 560 | about 100 B | 0.6 |
| `mint_shard` (about 2 per season) | 1,120 | 1 to 4 KB (metadata and SVG data) | 33.6 (at 3 KB) |
| `record_track` | 6,000 | about 1 KB (params, trades) | 60.0 |
| `nft_transfer` | 2,800 | near zero | 1.4 |
| **Storage subtotal** | 20,000 | | **about 127** |
| Gas, all transactions | 20,000 | about 0.0007 NEAR average | about 14 |
| Account creation and float | 13 accounts | | about 13 |
| **Estimate** | | | **about 154 NEAR; with a 1.4x safety margin about 215 NEAR** |

The plausible range is 100 to 300 NEAR; the budget cap is set from the stage-0 measurement (section 6.9). **If the funds are lower, the run is shorter, and we say so**; the scheduler's cost-per-transaction ordering (cheapest genuine action first: `nft_transfer`, `reveal_leaf`, `reveal_ash_key`, then `record_track`, then `mint_shard`) maximises transactions per NEAR without inventing activity.

**Funding and top-up plan (OWNER-GATED).**
1. The owner creates `ftf-arena.testnet` through the faucet-sponsored path used by the repo's scripts (`near account create-account sponsor-by-faucet-service ...`); faucet amounts and rate limits **[VERIFY]**. More testnet NEAR may come from additional faucet-created accounts consolidated into `ftf-arena.testnet`, from the owner's existing testnet balances (`lambada_eth.testnet`: **[VERIFY balance]**), or from an organizer request (**[owner decision; VERIFY that organizers provide testnet funds]**). Do **not** draw from `guests.ftf-coordinator.testnet` (Move 3) or from `ftf-coordinator.testnet`: those fund real players.
2. Fund each arena account with a **per-account cap** (config), for example the sealer 40 NEAR, each clan 15 NEAR, each guide 5 NEAR, then the contract accounts' balances rise by the storage deposits. The runner halts an account that falls below its floor (section 6.7).
3. Top-ups happen in tranches triggered by the budget gauge (`budget.mjs` prints the projected remaining NEAR to hit the target); each tranche is an owner action with the exact command printed by `tools/npc-economy/bin/print-topup.mjs` (never sent by the tool).
4. `drain` (owner-gated) returns balances to `ftf-arena.testnet` and deletes the runner's keys when the run ends.

### 6.7 Safety design

| Mechanism | Requirement |
|---|---|
| **Dedicated subaccounts** | the 10 arena accounts only; never a production account or key; runner refuses a config that names any of the accounts in section 4.1 |
| **Budget cap** | `--budget-near` hard cap on NEAR spent (sum of balance deltas of all arena signers plus deposits, measured, not estimated); at 90% the runner switches to cheapest-first, at 100% it stops |
| **Per-account floor and share cap** | no account's balance may fall below `floorNear` (default 1); no single account may sign more than 35% of the counted transactions (diversity guard, reviewed in the go/no-go) |
| **Rate limits** | steady 25 tx/min, burst 60 tx/min for at most 10 minutes (config); global RPC 3 req/s; per-lane serial |
| **Kill switch (layered)** | (1) a `STOP` file in the runner's working directory checked every loop (halt within 10 s); (2) `SIGINT`/`SIGTERM` finish the in-flight transaction and exit; (3) `--max-tx`, `--deadline`, `--budget-near`; (4) circuit breaker: more than 20% failures in the last 50 transactions pauses 10 minutes, 3 trips halt the run; (5) owner hard kill: `bin/drain.mjs` and `DeleteKey` (printed commands) |
| **Idempotency** | section 6.5; restarting never double-sends |
| **No coordinator or relayer key in CI** | CI runs only offline tests with in-memory test keys and a mock RPC; no workflow may read a secret named like a key; the secret scan (sprint item A8) gets a rule for `ed25519:` strings of length 88 |
| **Honest labelling** | every public surface says "scripted NPC activity, owner-run, testnet, public seeds"; no "AI", no "players", no "users" for bot activity |
| **Send path guard** | `bin/run.mjs` defaults to `--dry-run` (no signing, no network writes); real sending needs `--yes`, a key file path and the config's `ownerAck: "<date>"`; agents never run it |

### 6.8 Monitoring, counter, and the diversity metrics

- **Journal** (`npc-journal.jsonl`, outside the repo, append-only): one line per transaction attempt: `{"ts","seq","account","lane","contract","method","purpose":{"kind","season","index","token","epoch"},"argsHash","gas","deposit","status":"ok|already|failed","txHash","nearSpent","latencyMs","rpc"}`. No keys, no phrases beyond what the contract stores.
- **`status.json`** every 10 s (outside the repo): `{counted, ok, already, failed, perType, perAccount, txPerMin1, txPerMin60, nearSpent, budgetLeft, rpcErrors, breaker, running}`; the runner also serves it on `127.0.0.1` only.
- **Independent counter** (Move 5a, `tools/stats/count.mjs`): the **canonical number is computed from the chain, not from the journal**. Primary: an indexer lookup of transactions per arena account **[VERIFY the endpoint: the scorecard used the fastnear transaction index; nearblocks returned 403 to scripts from my box]**. Chain-native fallback with no indexer: enumerate the published seed list (`arena-seasons.json`) and read `get_season` plus `revealed_count`, `get_ash_key`, `nft_total_supply`/`nft_tokens_for_owner`, and `ledger.stats()`; the derived lower bound is `sum(2 + revealed_count + ash_revealed + mints) + tracks + recorded transfers`. The two must agree within 1% in the go/no-go.
- **Metrics that show diversity and honesty** (the stats page and `docs/npc-economy.md` publish all of them): unique signing accounts (target at least 10); transactions per action type (target at least 7 types, none above 50%); unique seasons sealed; unique shards minted and unique holders; shard moves and distinct holder pairs; distinct (account, npc, epoch) tracks and the verifier pass rate on a random sample (target 100%); the largest account share (cap 35%); transactions per hour histogram (no flat 24-hour line of identical gaps: add jitter of at least plus or minus 20% to inter-send delay); success rate; **human versus bot split** from the production contracts shown in a separate column (guests created, Elise tokens, shards held by human accounts; the 18 guests on 12 Nov are a **measured** number to be re-read, not a claim). Never label bot activity as players or users.
- **Wash-activity warning to state in `docs/npc-economy.md` and the PR:** judges and the AI screener may discount repetitive bot activity. The defence is not volume but verifiability: every season replays from its public seed, every track passes `verify-agent`, every transfer follows a published policy, and the activity is split by type, account and time. Say plainly what the numbers do **not** prove: that any human played.

### 6.9 Staged ramp with go/no-go checks (every stage is OWNER-GATED: it signs testnet transactions with the owner's keys on the owner's host)

| Stage | When (target, Kyiv) | Scope | Go / no-go (all must hold) |
|---|---|---|---|
| **-1 Setup** | Thu night or Fri early | owner creates `ftf-arena.testnet`, subaccounts, deploys the three instances (existing `deploy-judge-season.sh <CONTRACT_ID> <COORDINATOR_ID>` pattern; `memory-shard` and `agent-ledger` have deploy scripts **[VERIFY]**), adds keys, funds accounts; runner config validated | `node tools/npc-economy/bin/preflight.mjs` prints all `ok`: accounts exist, contracts' `get_coordinators`/`owner` are as expected, balances above floors, no production account named, RPC list healthy, `STOP` file works |
| **0 Dry run** | Fri about 08:00 | **3 accounts** (sealer, `salt`, `guide1`), about 60 to 120 transactions, 10 to 20 minutes: 1 season end to end, 3 shard moves, 5 tracks | (1) 100% of attempted transactions `ok` or `already`; (2) kill mid-season then restart: no duplicate, no unexpected failure; (3) `STOP` halts within 10 s; (4) measured NEAR per transaction by type within 1.5x of N1's estimate (else recompute the budget and stop); (5) `verify-arena` and `verify-agent` PASS on every season and track sent; (6) independent counter equals the journal; (7) no secret in any log (secret scan on the journal) |
| **1 Soak** | Fri about 09:00 to 10:00 | all **10 accounts**, 1 hour, at the planned steady rate (about 14 to 21 tx/min, so about 840 to 1,260 transactions) | success rate at least 98%; p95 confirmation under 30 s; RPC 429 rate under 2%; projected 24 h NEAR (from measured burn) within the budget; no account above 35% share; at least 7 action types present; independent counter within 1% of the journal; stats page equals the counter; breaker never tripped, or tripped and recovered; relayer health unaffected |
| **2 Long run** | Fri about 10:00 (latest sensible 14:00) | all accounts, 24 h, steady 25 tx/min cap, burst allowed | hourly checkpoint by the captain: counter vs plan; halt rules: breaker 3 trips, budget cap, any production-account touch (hard stop), any key exposure, stage-1 criteria violated for 2 consecutive hours |
| **3 Wind-down** | after the run | `drain`, delete keys, publish the final counter | final counter published with the run's start and end timestamps; `docs/npc-economy.md` updated with the realized mix, accounts and seeds |

**If Stage 0 or 1 fails the no-go, do not retry at higher rate: fix, or cut Move 2 and keep the smaller true number.**

### 6.10 Work breakdown (stream N, plus S for the counter)

| ID | Item | Files (stream N unless noted) | Effort |
|---|---|---|---|
| **N1** | Unit-cost and gas measurement; budget model | `tools/npc-economy/measure/` (sandbox tests; `cargo test` run on a temporary copy, **no change to `contracts/*/src`**), `docs/npc-economy.md` §Budget, `tools/npc-economy/lib/budget.mjs` | 5 to 7 h |
| **N2** | Runner core: config, lanes, nonce management, RPC pool with limiter and backoff, journal, status, kill switch, dry-run default, preflight, drain/topup printers | `tools/npc-economy/lib/{config,lane,rpc,limiter,journal,killswitch}.mjs`, `tools/npc-economy/bin/{run,preflight,drain,print-topup}.mjs` | 10 to 12 h |
| **N3** | Season pipeline: seed list `arena:v1:<n>` to 32-hex; args through `judge-season-args.mjs` functions (import, do not copy); scheduler with several seasons in flight; leaf assignment to clans | `tools/npc-economy/lib/seasons.mjs`, `arena-seasons.json` format | 6 to 8 h |
| **N4** | Shard mint to the auction winner clan and the scripted market policy (at most 2 moves per shard, valuation gap threshold, no payment) | `tools/npc-economy/lib/{shards,market-policy}.mjs`, `docs/npc-economy.md` §Market | 6 to 8 h |
| **N5** | Track recorder: per-clan `createTownLedger` state, `hireResult`, `trackArgs`; stops when unaffordable | `tools/npc-economy/lib/tracks.mjs` | 5 to 6 h |
| **N6** | `tools/verify-arena/verify.mjs`: regenerate any arena season (root, leaf, shard data) from its seed and compare with the arena contracts by read-only RPC; sample mode; pairs with `verify-agent` | `tools/verify-arena/` | 5 to 6 h |
| **S-count (CM5a)** | `tools/stats/count.mjs`: indexer count plus chain-native fallback, both outputs, agreement check | `tools/stats/` | 4 h |
| **N7** | Runbook, owner scripts and staged-ramp checklist; README row text proposal (to stream H); claims entries (to H2) | `docs/launch/npc-runbook.md`, `docs/npc-economy.md` | 4 h |

**Interfaces.**
- `config.json` (path argument; no keys inside): `{network:"testnet", rpcUrls:[...], contracts:{seasons,shards,ledger}, accounts:{sealer, clans:{salt,ash,moss,amber,frost}, guides:[...]}, keyFile:"<absolute path outside repo>", limits:{maxTx:20000, budgetNear:<n>, steadyTxPerMin:25, burstTxPerMin:60, burstMinutes:10, rpcMaxRps:3, perAccountMaxShare:0.35, floorNear:1}, mix:{seasons:0.56, tracks:0.30, shardMoves:0.14}, seeds:{prefix:"arena:v1:", start:0}, ownerAck:null}`.
- `arena-seasons.json` (public, committed after the run by the owner's explicit decision, or published by the owner): `[{n, seedHex, seasonId, root, commitTx, shardTokens:[...]}]` so anyone can replay.
- Seed rule: `seedHex = first 32 hex of sha256("arena:v1:" + n)`, **[VERIFY a 32-lowercase-hex seed is what `createSeason` requires; `judge-season-args.mjs` enforces `/^[0-9a-f]{32}$/`]**.

**Tests and acceptance (agent-verifiable, no network, no keys).**
- `cd tools/npc-economy && node --test tests/*.test.mjs` (no dependencies; Node 20, 22, 24): lane nonce handling (monotonic, resync once on `InvalidNonce`, never two in flight per key); limiter never exceeds configured rates under a fake clock; backoff schedule; kill switch (`STOP` file, signals, breaker); idempotency against a mock chain (replay the journal, no duplicate sends); scheduler obeys per-account share cap and budget; config validator rejects any production account id from section 4.1 and any config containing something that looks like a private key; `--dry-run` performs **zero** signed sends (the signer is replaced by a function that throws); journal contains no key material.
- Season pipeline test: for 3 seeds the generated `commit_season`/`reveal_*` args are byte-identical to `judge-season-args.mjs` output for the same seed; shard args equal `judge-shards-args.mjs` output with receivers mapped to clan accounts.
- `node tools/verify-arena/verify.mjs --self-test` passes against recorded fixtures.
- `bash scripts/verify-all.sh --skip-rust` still passes (after Move 7's A1 on Node 24).
- **Definition of done:** a reviewer who is not the author runs preflight and a complete **dry run against a local mock RPC** (`tools/npc-economy/tests/mock-rpc.mjs`) producing at least 600 simulated transactions across 10 accounts and 7 action types with every invariant above green; the runbook lists the exact owner commands; the budget table is filled from N1 measurements (not estimates); `docs/npc-economy.md` states honestly what the numbers prove and do not prove.

### 6.11 Risks and explicit DO-NOT rules (Move 2)

- **DO NOT** send any transaction, deploy, create accounts, add keys or fund anything. Agents write, test (mock RPC) and document; the owner runs stages -1 to 3.
- **DO NOT** add a bot key or any account as coordinator on `ftf-seasons.testnet` or `ftf-shards.testnet`; do not touch the judge season; do not use `ftf-coordinator.testnet` or `lambada_eth.testnet` as a signer.
- **DO NOT** modify contract sources, `game/src/game/` (engine), `game/src/net/near-tx.js` (client and relayer copies must stay identical), or the relayer.
- **DO NOT** call any activity "players", "users", "AI" or "LLM". **DO NOT** send empty, repeated or no-op calls, or loops to inflate a counter. **DO NOT** hide the bot/human split.
- **DO NOT** raise rates after a failed stage; **DO NOT** run two runners against the same accounts.
- Risks: testnet or RPC instability (mitigated by pool, backoff, breaker); the budget estimate being off by 2x (mitigated by measuring in N1 and Stage 0); the faucet limit capping the run (the realized number is published); judges discounting bot activity (mitigated by verifiability and diversity, never by volume); a seed list making arena seasons look "fair-play" when salts derive from public seeds (label them demonstration seasons); running into the freeze (the runner code is frozen at Fri 16:00; the run itself may continue).

**Label:** SAFE to build; **OWNER-GATED to run** (signs testnet transactions with owner keys and spends testnet NEAR). **Estimate:** 40 to 55 agent hours over 8 agents; the run is 24 h wall clock plus 2 h of stages -1 to 1. **Dependencies:** Move 7 A1 (verify-all on Node 24) for the green gate; Move 5a for the counter; Move 3 F1 so the runner does not drain the guest fund; owner decisions in section 12 (account names, budget, funding, run window).

**Prompts (paste the shared preamble first).**

*N1:*
```
Item N1 (stream N). Own tools/npc-economy/measure/, tools/npc-economy/lib/budget.mjs and the Budget section of docs/npc-economy.md. Goal: replace guesses with measurements. For season-commit (commit_season, commit_ash_key, reveal_leaf, reveal_ash_key), memory-shard (mint_shard, nft_transfer) and agent-ledger (record_track) measure, in the near-workspaces sandbox (copy the pattern of contracts/season-commit/tests/sandbox.rs into a TEMPORARY test directory outside contracts/*/src; do not change any contract source), the storage_usage delta and gas burnt per call for realistic arguments produced by contracts/season-commit/scripts/judge-season-args.mjs, contracts/memory-shard/scripts/judge-shards-args.mjs and game/src/game/track-record.js trackArgs. Output a table (bytes, NEAR at 1e19 yocto per byte, gas, NEAR at the testnet gas price from the gas_price RPC [read-only]) and budget.mjs: given a mix and a target tx count, prints the NEAR needed with a 1.4x margin and the formula. Never invent a number: mark anything you could not measure [VERIFY]. No testnet transaction.
```
*N2:*
```
Item N2 (stream N). Own tools/npc-economy/lib/{config,lane,rpc,limiter,journal,killswitch}.mjs and tools/npc-economy/bin/{run,preflight,drain,print-topup}.mjs plus tests/. Build the runner core, no dependencies, Node 20+, ES modules. Reuse signing from game/src/net/near-tx.js (import; do not edit it). Lanes: one serial queue per (account, public key), local nonce counter from view_access_key, resync once on InvalidNonce, send_tx with wait_until EXECUTED_OPTIMISTIC then a status poll before counting ok; unknown outcome is resolved by tx status, never blind resend. RPC pool with ordered fallback, global limiter 3 req/s burst 8, Retry-After, exponential backoff with jitter (1 s, x2, cap 60 s). Idempotency: view the target state before each send; record 'already' instead of sending. Journal JSONL (no key material), status.json every 10 s, STOP file within 10 s, SIGINT/SIGTERM graceful, breaker (>20% failures in last 50 => pause 10 min, 3 trips => halt), budget cap from measured balance deltas, per-account floor and 35% share cap. bin/run.mjs defaults to --dry-run with a signer that THROWS; real sending requires --yes, a key file path outside the repo and config.ownerAck. Config validator rejects any account id from the production list (ftf-seasons.testnet, ftf-shards.testnet, ftf-coordinator.testnet, lambada_eth.testnet, guests./heroine./companions./agents./ledger./chests./skins.ftf-coordinator.testnet) and anything resembling a private key. Tests with a fake clock and a mock RPC. You never run the send path.
```
*N3:*
```
Item N3 (stream N). Own tools/npc-economy/lib/seasons.mjs and tests. Seed rule: seedHex = first 32 lowercase hex of sha256("arena:v1:" + n). Import judgeSeason/contractArgs from the existing scripts (do not copy their logic) to produce commit_season, commit_ash_key, reveal-0..14 and reveal_ash_key arguments. Scheduler: several seasons in flight; commit_season and commit_ash_key by the sealer first, then the 15 reveals spread over the five clan accounts by leaf index mod 5 (a scripted assignment: document it), then reveal_ash_key by a guide account after the last leaf. Write arena-seasons.json entries after each season. Tests: args byte-identical to judge-season-args.mjs for 3 seeds; ordering invariants (no reveal before commit, ash commit before first reveal); restart resumes mid-season from chain state with a mock RPC.
```
*N4:*
```
Item N4 (stream N). Own tools/npc-economy/lib/{shards,market-policy}.mjs and the Market section of docs/npc-economy.md. Mint: reuse judgeShards(seed) from contracts/memory-shard/scripts/judge-shards-args.mjs; map each shard's winner_clan (the buyer; fall back to owner_clan when there is no winner; ShardData fields are in contracts/memory-shard/src/image.rs) to its clan account (shards of the Iris seat go to a guide account); mint_shard by the sealer with the standard deposit. Market policy (scripted; LABEL IT "scripted market policy, not an engine rule"; no payment is made on chain, silk stays in game): candidate buyer = the clan with the highest valuation (reuse the engine's own shard valuation if it can be imported without editing game/src/game/; otherwise implement a documented deterministic function in market-policy.mjs and say so); transfer only if the valuation gap >= a threshold in config; each shard moves at most twice; only the current holder signs nft_transfer with 1 yoctoNEAR. Tests: determinism, move cap, holder-only signing, no transfer when the gap is below threshold, no self-transfer.
```
*N5:*
```
Item N5 (stream N). Own tools/npc-economy/lib/tracks.mjs and tests. For each clan account keep a createTownLedger state (game/src/game/town-economy.js: silk, level, MAX_HIRES, priceFor), choose temperament and npc id from the repo's tables, run hireResult with the seeds "arena:v1:<account>:<epoch>" and the account's learned agent state as `before`, build record_track args with trackArgs (game/src/game/track-record.js) and verify each with verifyTrack BEFORE returning it. Never produce a hire the town ledger cannot afford: skip it (the scheduler shifts volume to seasons). Tests: every produced track passes verifyTrack; epochs strictly increase per (account, npc); unaffordable hires are skipped; npc ids match [a-z0-9_]{1,32}.
```
*N6:*
```
Item N6 (stream N). Own tools/verify-arena/ (verify.mjs, README, tests). Usage: node tools/verify-arena/verify.mjs --seed <hex> | --n <i> | --sample <k> [--config config.json]. Regenerate the season and its shards from the seed with the same functions the runner uses and compare by read-only RPC with seasons/shards arena contracts: schedule root, leaf_count, each get_revealed_leaf leaf hash, ash key, shard metadata leaf. Print per-check ok/FAIL and a final PASS/FAIL; exit 0/1. Also print the command to run tools/verify-agent/verify.mjs for a sampled track. --self-test uses recorded fixtures (no network). Zero dependencies.
```
*N7:*
```
Item N7 (stream N). Own docs/launch/npc-runbook.md and docs/npc-economy.md. The runbook is for the OWNER: exact commands for stages -1, 0, 1, 2, 3 of section 6.9 of the TZ (create ftf-arena.testnet via the faucet path used by contracts/season-commit/scripts/deploy-judge-season.sh, deploy the three instances, add keys, fund per-account caps, run preflight, dry run, soak, long run, drain), expected output shapes, go/no-go checks with numbers, kill switch use, rollback. docs/npc-economy.md: what it is (scripted NPC activity, public seeds, testnet, owner-run), what each tx type is and which engine event it records, the realized-mix table (filled by the owner after the run from count.mjs; leave TODO(owner) until then), and "what this does NOT prove". Also propose to stream H: one README real/mock row and claims-ledger entries, each with a Proof command. No numbers about the run until they are measured.
```
*CM5a (counter, stream S):*
```
Item CM5a (stream S). Own tools/stats/count.mjs and tests. Output JSON {production:{...}, arena:{...}, generatedAt, source}. Primary source: a transaction index per account [VERIFY endpoint; the scorecard used the fastnear transaction index; nearblocks returns 403 to scripts]; fallback chain-native: enumerate arena-seasons.json and call get_season/get_ash_key, nft_total_supply, ledger.stats() over public RPC. Report both and fail loudly if they disagree by more than 1%. Never print an estimated number as measured; every number carries the exact RPC call or URL. Cache 60 s on disk. Tests with recorded RPC fixtures, no network.
```

---

