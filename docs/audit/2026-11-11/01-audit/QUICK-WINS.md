# Quick wins for Forget to Foresee

Ranked by (judge impact × certainty) ÷ effort. Each is ≤ ~4 h of focused work for an agent plus owner review. Baseline: `main` @ `83465f6`. Freeze: 13 Nov 20:00 Kyiv.

Rules that apply to every prompt below (keep them at the top of each Claude session):
- Work on a branch `claude/<name>`, open a PR, never push to `main`, do not tag. The owner merges.
- English only for code, copy, docs, comments.
- Do not add secrets. Do not claim anything that does not run. Keep the README real/mock table true.
- `cd game && npm test` must stay green (728/728 at baseline). Add tests for new logic.

Legend: Effort = hands-on hours. Impact = expected effect on screener and judge score (H/M/L).

| Rank | ID | Title | Effort | Impact |
|---:|---|---|---:|---|
| 1 | QW-1 | Rewrite README for the AI screener (use `README-PROPOSED.md`) | 1.5 h | **H** |
| 2 | QW-2 | Turn on the Day 1 free mint on the live build (deploy relayer, set variable) | 2–3 h | **H** |
| 3 | QW-3 | Make the on-chain shard moment reachable in one click | 2.5 h | **H** |
| 4 | QW-4 | Link preview, favicon, repo description, topics, homepage | 1 h | M–H |
| 5 | QW-5 | WebGL/no-GPU graceful path and "what to expect" boot note | 2 h | M |
| 6 | QW-6 | One visible "NFT does something" behaviour (holder panel) | 4 h | **H** |
| 7 | QW-7 | Pin toolchains, document prerequisites, one `verify-all` script | 2 h | M |
| 8 | QW-8 | Cut dev-only models from the deploy and document shallow clone | 1 h | M |
| 9 | QW-9 | CI: server and relayer tests, guests/token-account build, built-page smoke | 3.5 h | M–H |
| 10 | QW-10 | Re-cut the 60 s video to open on the town and end on the on-chain shard | 3–4 h (owner + agent) | M–H |
| 11 | QW-11 | Premise line and title in the first 5 seconds | 1.5 h | M |
| 12 | QW-12 | Fix stale numbers everywhere (single source of truth) | 1 h | M |

---

## QW-1 — README for the AI screener

- **Why:** the screener runs your README literally. Today it is 47 KB with 2,600-character table cells (`README.md:119`), stale counts (`:73,79,138,142,144`: 668 tests vs 728; 28 vs 31; ~295 MB vs 431 MB), a literal check that fails (`:45` silk 72, observed 82), and it hides the strongest commands (agent API in 1 s) inside paragraphs. A short, honest, machine-first top section raises the preliminary score.
- **Effort:** 1.5 h (draft is ready).
- **Impact:** High.
- **Files:** `README.md` (replace top ~130 lines with `README-PROPOSED.md`), move the long "What works today" and "Real / mock" detail to `docs/status.md`; keep the existing sections below a "Details" divider or link them.
- **Acceptance criteria:**
  1. First screen answers: what it is, problem, 3 commands with expected output, live link, tracks.
  2. Real vs mock table has ≤ 20 rows, each cell ≤ 200 characters.
  3. Every number in the README is produced by a command shown next to it (728 / 31 / 7 / 56 / 21 / 21 / 9 unless they change).
  4. All relative links resolve (`python3` link check in QW-9).
  5. The do-X-see-Y table uses UI text exactly as in `game/src/play/locales/en.js` (e.g. "Test Iris's guess at Shell I's pad", not "Stake 10 silk at Shell I's pad") and does not quote silk values past trial 3 unless verified.
- **Claude prompt:**
  ```
  Branch claude/readme-screener. Replace the top of README.md with the content of /workspace/ftf-audit/audit/README-PROPOSED.md (copy the file into the repo as a starting point, then verify every claim).
  1) Run every command in it from a clean clone (cd game && npm ci && npm test; cd ../server && npm test; cd ../relayer && npm test; node examples/agent.mjs) and replace the numbers with the real output.
  2) Move the long "What works today" table and the long "Real / mock" rows from README.md into docs/status.md, keep a 20-row summary table in README.md that links there.
  3) For the judge table, play ?demo=judge&mode=walk and copy the HUD strings from game/src/play/locales/en.js; remove values you did not observe.
  4) Keep: license, baseline and third-party section, AI disclosure, tracks, hackathon-submission tag instructions.
  5) Run a relative-link checker and fix any broken link. Do not touch game code. Open a PR.
  ```

## QW-2 — Day 1 free mint live

- **Why:** this is your most "NFT does something" feature: browser makes its own key, a relayer calls `guests.create_guest`, the contract creates `<name>-<id>.guests.ftf-coordinator.testnet` and mints Elise to it (player-owned NFT, no wallet popup — the Games track bonus). Contracts are deployed and healthy (guests stats `3/200`), code is complete (`relayer/`, `game/src/play/day1-mint.js`). But the live bundle has `relayerUrl = undefined` (the minified code is `rc&&void 0`), so a player sees "the free mint is not connected". Judges never see it, and it is not on `?demo=judge` unless `&day1=1` (`src/boot-world.js:350`).
- **Effort:** 2–3 h (owner step to host the relayer, agent step to wire and test).
- **Impact:** High (turns the NFT story from "coordinator minted three tokens" to "your account owns your NFT").
- **Files:** owner: host `relayer/` (Vercel per `relayer/vercel.json`, or Docker/`node server.js`), set `FTF_GUEST_KEY` there (private key never in repo), set repo variable `FTF_RELAYER_URL` (Settings → Secrets and variables → Actions → Variables), run Pages workflow manually (`workflow_dispatch`). Agent: `README.md` text, `docs/submission/owner-steps.md` §0, optionally a visible "Mint your Elise (testnet)" entry in the town that works on `?demo=judge&day1=1`, and a README line with the explicit URL.
- **Acceptance criteria:**
  1. `curl https://<relayer>/api/health` → `{"ok":true,"configured":true,…}` (no key in output).
  2. On the live URL with a fresh browser profile, `?demo=judge&day1=1` ends in "Minted on NEAR testnet ✓" with a nearblocks link, and `view guest_of` on `guests.ftf-coordinator.testnet` returns `minted:true`.
  3. The Pages bundle contains the relayer URL (grep the built JS) and no `ed25519:` secret (CI check).
  4. Failure path: with the relayer stopped, UI says "Unminted preview — tap to retry" (already built; verify).
  5. README real/mock row updated from "built; the mint is real once the owner deploys…" to "real on testnet" (only after criterion 2 passes live).
- **Claude prompt:**
  ```
  Branch claude/day1-live. The owner has deployed relayer/ and set the Actions variable FTF_RELAYER_URL (ask the owner for the URL if empty; never ask for or write the signing key).
  1) Verify game/src/play/day1-mint.js picks up import.meta.env.VITE_FTF_RELAYER_URL in the Pages build (.github/workflows/pages.yml). Add a CI step that fails the Pages build if FTF_RELAYER_URL is empty AND the repo is the main one, or at least prints a notice.
  2) Make the Day 1 free mint reachable from the README judge path: document ?demo=judge&mode=walk&day1=1, and make sure the town shows an obvious "Free mint your Elise" step that does not break the judge timing.
  3) Add an end-to-end smoke script tools/smoke/day1-live.mjs that opens the live URL headless, drives the mint, and checks guest_of via public RPC.
  4) Update the README real/mock table only if the live check passes.
  ```

## QW-3 — One-click on-chain shard moment

- **Why:** reproduced live: forgetting the memory at trial 5 instead of 4 shows **"Unminted shard preview"** instead of the on-chain token (`sh-09-shard-card.png`). The honesty is great, but a judge on a loose path misses the best proof of the NFT track. The README already knows the minted path needs the "call" memory at trial 4 and Frost winning the trial-6 auction.
- **Effort:** 2.5 h.
- **Impact:** High.
- **Files:** `game/src/play/` (Memories panel or hub), `game/src/ui/world-hud/shard-card-model.js`, `game/src/net/shard-nft.js`, `game/src/play/locales/en.js` (+ keep locale parity test), `game/tests/client/shard-nft-hud.test.mjs`, `README.md`.
- **Design (honest):** when `demo=judge`, show in Memories a button **"Open the judge playthrough's on-chain shard (#7)"** that reads `ftf-shards.testnet` read-only and renders the existing token card, captioned "From the recorded judge playthrough — minted by the coordinator, not by your session". Also add the `?replay=r1.…` link to the README, which replays the judge playthrough deterministically and verifies the root on-chain (the machinery exists: `src/net/replay.js`).
- **Acceptance criteria:**
  1. On `?demo=judge` at any trial, one click opens the token card with token id `793f6c05e89839f2-7`, owner, leaf #3 and a working nearblocks link.
  2. The card is clearly labelled as recorded (not "your" token). The "Unminted shard preview" for the player's own shard is unchanged.
  3. Works with RPC failure by showing "Could not reach testnet RPC" (no fake data).
  4. A test asserts the button is absent without `demo=judge`.
  5. README contains the replay URL; opening it ends on the replay view with "root matches ftf-seasons.testnet".
- **Claude prompt:**
  ```
  Branch claude/judge-shard-shortcut. Goal: on ?demo=judge a visitor can open the on-chain judge shard card in one click without playing exactly right.
  Read game/src/net/shard-nft.js, game/src/ui/world-hud/shard-card-model.js, game/src/play/ (Memories panel), game/src/net/replay.js. Add a clearly labelled button in the Memories panel, only on demo=judge, that reads ftf-shards.testnet (shards_of_season for 793f6c05e89839f2, read-only, same byte-identical SVG check as today) and opens the existing token card with the caption "From the recorded judge playthrough - minted by the coordinator, not by your session". Add the English strings to game/src/play/locales/en.js and the other four locales (keep the parity test green). Generate a replay link for the recorded judge playthrough using encodeReplay and put it in README under the judge steps. Add tests. Do not change the engine or any committed payloads.
  ```

## QW-4 — Link preview, favicon, repo metadata

- **Why:** the X post links the demo. `game/index.html` has no `og:*`/`twitter:*`/description (only `<title>`) and a blank favicon (`index.html:23` `data:,`), so the card is empty. The GitHub description (`"3D game where NFT agents pay for prophecy…"`, "by RAEN Computers") overclaims against the README ("Iris is game state, not a token"). No topics, no homepage.
- **Effort:** 1 h (30 min code, 10 min repo settings by the owner).
- **Impact:** Medium–High (every share and every judge's first glance).
- **Files:** `game/index.html`, `game/public/og.jpg` (1200×630; reuse a still from `docs/media/jury-sheet.jpg` or the postcard renderer), `game/public/favicon.svg`; GitHub settings (owner).
- **Acceptance criteria:**
  1. Opening https://cards-dev.x.com/validator or `curl` of the page shows `og:title`, `og:description`, `og:image` (absolute URL under `/forget-to-foresee/`), `twitter:card=summary_large_image`.
  2. `<meta name="description">` ≤ 160 chars, English.
  3. Favicon returns 200 (no `data:,`).
  4. GitHub description is accurate, e.g. "Strategy game where an AI clan agent pays for prophecy with her own memories. Seasons are sealed on NEAR testnet before play; forgotten memories become NEP-171 shards. Built at NEAR HACKATHON."; homepage = live demo; topics: `near`, `nft`, `game`, `threejs`, `nep-171`, `agents`.
- **Claude prompt:**
  ```
  Branch claude/meta. Add Open Graph and Twitter card meta, a meta description and a real favicon to game/index.html. Use an absolute URL built from the Pages base (https://spacexceo.github.io/forget-to-foresee/og.jpg). Create game/public/og.jpg (1200x630, a good in-game still; use an existing image from docs/ or the postcard renderer, no stock art) and game/public/favicon.svg. Respect %BASE_URL%. Add a node test that parses dist/index.html after build and asserts the tags exist. Also draft (do not apply) the new GitHub repo description and topics in the PR body for the owner.
  ```

## QW-5 — WebGL / no-GPU graceful path

- **Why:** `new THREE.WebGLRenderer(...)` at `src/boot-world.js:57` is unguarded; failure ends in the generic `src/main.js:100` message. A screener or judge on a locked-down VM gets nothing. Even when WebGL works, the page pulls ~123 MB in two minutes at ~5 fps on software GL.
- **Effort:** 2 h.
- **Impact:** Medium (protects against the worst-case first impression).
- **Files:** `game/src/main.js`, `game/src/ui/loading.js`, `game/src/boot-world.js`, `game/index.html` boot markup, locales (en + parity), test in `game/tests/client/boot.test.mjs`.
- **Acceptance criteria:**
  1. Without WebGL2 (`?forceNoGL=1` test switch, or a stubbed `canvas.getContext`), the boot screen shows: "This game needs a desktop browser with WebGL 2" plus three links: the README "no GPU" section, the agent-API 1-minute path, and the 60 s video.
  2. A one-line boot note when a software renderer is detected (`UNMASKED_RENDERER` contains `SwiftShader`/`llvmpipe`): "Software rendering detected: expect ~5 fps; the game still completes."
  3. Never blocks a working GPU path; unit test for the detection function.
- **Claude prompt:**
  ```
  Branch claude/webgl-guard. Wrap WebGLRenderer creation (game/src/boot-world.js:57) in a capability check that runs before the heavy imports (put the check in game/src/main.js using a throwaway canvas getContext('webgl2')). On failure call loading.fail with a specific English message and links (README no-GPU section, agent API path, video). Detect software renderers (SwiftShader, llvmpipe, Microsoft Basic Render) from WEBGL_debug_renderer_info and show a one-line note. Add the strings to locales with parity, add tests for the pure detection function, and a ?forceNoGL=1 dev switch.
  ```

## QW-6 — One visible "NFT does something" behaviour

- **Why:** the NFTs track says "NFTs as accounts … ownership with behavior." Right now the visible NFTs only commemorate. The cheapest honest behaviour is **holder-gated access with a history view**: enter any NEAR testnet account id, the page reads `nft_tokens_for_owner` on `ftf-shards.testnet` (and `agents.ftf-coordinator.testnet`, `heroine.ftf-coordinator.testnet`); a holder unlocks a visible in-game effect (for example the shard's ink-ring on Iris's HUD, a "Shard holder" title, and an extra Foresight Exchange "holder echo") and sees a per-token history (mint tx, current owner, transfer events from the NEP-297 log via RPC/nearblocks link). The owner account `lambada_eth.testnet` already holds the 3 judge shards and the Iris card, so the judge demo works with one pre-filled button.
- **Effort:** 4 h.
- **Impact:** High on the NFTs track.
- **Files:** new `game/src/net/holder.js` (read-only RPC; reuse `src/net/near.js`), new `game/src/ui/holder-panel.js`, hook in Profile (`game/src/play/profile.js`), `game/src/play/locales/*.js`, `game/tests/client/holder.test.mjs`, README table row.
- **Acceptance criteria:**
  1. Panel opens from Profile → "Holder access (testnet, read-only)" and has a pre-filled "Try the judge account" button.
  2. For a holder, shows tokens (id, title, media from the contract's own SVG), a history list (mint, transfers) with explorer links, and activates one visible effect that persists in `localStorage` only (no chain write, no wallet).
  3. For a non-holder or RPC failure, shows the honest reason and no effect.
  4. README states plainly: read-only gating, not a wallet login, not a transfer of control. Real/mock table updated.
  5. Tests with a fake RPC for holder / non-holder / failure.
- **Claude prompt:**
  ```
  Branch claude/holder-access. Implement a read-only "holder access" feature for the NFTs track. Read game/src/net/near.js, shard-nft.js, agent-nft.js, game/src/play/profile.js. Create game/src/net/holder.js (nft_tokens_for_owner on ftf-shards.testnet, agents.ftf-coordinator.testnet, heroine.ftf-coordinator.testnet using the existing RPC client and fallbacks; token history from nft_token plus nearblocks links, no private APIs). Create a Profile panel with an account-id field, a "Try the judge account" button (lambada_eth.testnet), and an effect for holders that is cosmetic and stored in localStorage (a Shard holder title and an ink-ring on the Iris HUD). Everything English, five-locale parity, honest copy: read-only, no wallet, testnet. Add tests with a fake fetch for holder, non-holder, and RPC failure. Update the README real/mock table. No new dependencies.
  ```

## QW-7 — Pin toolchains, document prerequisites, one verify script

- **Why:** `cargo test --lib` fails on a clean machine: rustc < 1.95 is rejected by the lockfile (`near-sdk 5.30.1 requires rustc 1.95`), `channel = "stable"` floats (`contracts/*/rust-toolchain.toml:2`), and `near-workspaces` drags in `openssl-sys` even for `--lib` so `pkg-config` and OpenSSL headers are required. README says only "Rust is only needed for the contract" (`README.md:132`). `game/package.json` has no `engines`.
- **Effort:** 2 h.
- **Impact:** Medium (a screener that tries the contract tests and fails records "not reproducible").
- **Files:** `contracts/*/rust-toolchain.toml`, `game/package.json` (`engines.node >=20`), `.nvmrc`, new `scripts/verify-all.sh`, `README.md` prerequisites block, `.github/workflows/contracts.yml` (pin `cargo-near` version).
- **Acceptance criteria:**
  1. `bash scripts/verify-all.sh` on a clean Ubuntu 24.04 container prints a final table: game, server, relayer, season-commit, memory-shard, agent-card, guests, with pass counts, exit code 0.
  2. Missing prerequisites produce one clear line ("install pkg-config libssl-dev; Rust >= X") rather than a build log.
  3. Toolchain pinned to the exact stable used in CI today (record the version in the PR), `cargo-near` pinned.
  4. A `--skip-rust` flag exists for JS-only screeners.
- **Claude prompt:**
  ```
  Branch claude/verify-all. Pin contracts/*/rust-toolchain.toml to the exact stable version that CI currently resolves (print it from a CI run first), pin cargo-near in .github/workflows/contracts.yml, add "engines": {"node": ">=20"} to game/package.json and an .nvmrc with 22. Write scripts/verify-all.sh: checks prerequisites (node, npm, cargo, pkg-config, libssl headers) with one-line fixes, runs game/server/relayer tests and cargo test --lib for season-commit, memory-shard, agent-card, guests, parses the pass counts, prints a table, supports --skip-rust, exits non-zero on failure. Test it in a clean Docker ubuntu:24.04. Document in README under "Run from a clean clone".
  ```

## QW-8 — Cut dev-only weight, document shallow clone

- **Why:** `game/public/assets/models/shell_*_r2*.glb` are 55 MB that load only with `?shells=r2` (`src/boot-world.js:74`), 13% of the 431 MB deploy. The git history is 2.3 GiB because of large videos (`docs/video/jury-test-4/jury-test-4k.mp4` 97 MB, `docs/media/*.mp4`). A screener's `git clone` is slow, and history cannot be rewritten safely before the freeze.
- **Effort:** 1 h.
- **Impact:** Medium.
- **Files:** move `game/public/assets/models/shell_*_r2*.glb` to `art/review/` (or `.gitignore` + release asset) and keep `?shells=r2` working only in dev (`import.meta.env.DEV`), `.gitignore` for `docs/video/**` and `docs/media/*.mp4` going forward, `README.md` clone line, `game/tests/client/assets-budget.test.mjs` if it lists them.
- **Acceptance criteria:**
  1. `dist/` ≤ 376 MB, `npm test` green, judge path unchanged.
  2. README says `git clone --depth 1 https://github.com/SpacexCeo/forget-to-foresee` (≈0.43 GB) as the default screener command.
  3. No new binary above 5 MB tracked in `docs/` going forward (CI size check, see QW-9).
  4. **Do not** rewrite history or force-push. If the owner wants a smaller history, that is a separate post-submission task.
- **Claude prompt:**
  ```
  Branch claude/trim-deploy. Measure first: du -sh game/dist before and after. Move game/public/assets/models/shell_*_r2*.glb out of public/ (to art/review/) and make the ?shells=r2 override dev-only; update tests that enumerate model files. Add docs/video/ and docs/media/*.mp4 to .gitignore for future files (do not untrack history, do not rewrite history). Update README to recommend git clone --depth 1. Report dist size before/after in the PR.
  ```

## QW-9 — CI: more jobs, built-page smoke

- **Why:** the live link is the product. Nothing in CI opens the built page; e2e tests are excluded and "meant to be red" (`game/tests/e2e/README.md`). `server/`, `relayer/`, and `contracts/guests|token-account|character-nft` are never run in CI. A 13 Nov late fix could break the judge link silently.
- **Effort:** 3.5 h.
- **Impact:** Medium–High (insurance for the last 48 hours).
- **Files:** `.github/workflows/pages.yml` (add `server`/`relayer` test steps), new `.github/workflows/smoke.yml`, `game/tests/e2e/smoke-judge.mjs` (new, small), `.github/workflows/contracts.yml` (add `guests`, `token-account`), new `scripts/check-links.py`, size guard script.
- **Acceptance criteria:**
  1. On every PR: game tests (Node 22 and 24), server tests, relayer tests, contract tests including `guests`, link check for README, repo-size guard (no tracked file > 25 MB outside `game/public/assets/models`).
  2. Smoke job serves `game/dist` and opens `?demo=judge&mode=walk` in headless Chromium (SwiftShader): asserts town ready within 60 s, zero `console.error`, zero 4xx, then `town.register()` and `session.obs.phase==='play'`.
  3. Smoke is allowed to take ≤ 6 min and does not gate deploys (informational) until stable.
- **Claude prompt:**
  ```
  Branch claude/ci-smoke. Add server and relayer test steps to .github/workflows/pages.yml, a Node 22/24 matrix for game tests, a job for contracts/guests and contracts/token-account in contracts.yml, scripts/check-links.py for README relative links, and a repo size guard. Add .github/workflows/smoke.yml that builds game with FTF_BASE=/ , serves dist with vite preview, and runs a short Playwright test (copy the harness idea from game/tests/e2e/lib/env.mjs but only the judge-path smoke: town.ready within 60 s, no console errors, no 4xx, window.__ftf.town.register() then play session phase). Keep it informational for now. Do not touch game code.
  ```

## QW-10 — Re-cut the 60 s video

- **Why:** `docs/media/jury.mp4` (60 s, 1080p) shows the dark Shell interior, the agent API and the shard; it predates the bright town and the Day 1 flow. A judge sees the video on X, then opens a sunlit town. Mismatch costs trust, and the X post is a hard requirement. Also: the owner steps file already warns the 75 s cut has a stale caption.
- **Effort:** 3–4 h (render time dominates).
- **Impact:** Medium–High.
- **Files:** `tools/capture/shots/jury.mjs`, `docs/submission/jury-video.md`, `docs/submission/x-post.md`.
- **Acceptance criteria:**
  1. Opens with 3–4 s of the town and the one-line premise, shows the loop (read sign → stake → verified), the forget moment, the **on-chain shard card with the nearblocks link**, and the closing URL. If QW-2 is live, include the free mint.
  2. ≤ 60 s, captions match README claims; no "wallet" or "player-owned" wording unless live.
  3. X post text re-checked against the real/mock table.
- **Claude prompt:**
  ```
  Branch claude/video-recut. Read docs/submission/jury-video.md and tools/capture. Re-script shot 1-3 so the video opens in the town (use the current ?demo=judge&mode=walk path), keeps the stake -> verified loop, the forget moment, and the on-chain shard card (read from ftf-shards.testnet), and ends on the live URL. Keep captions truthful to README. Output docs/submission/jury-video.md (updated storyboard) and the captured plates; the owner will approve before rendering the final mp4.
  ```

## QW-11 — Premise and title in the first 5 seconds

- **Why:** the first screen is a street and "Walk to the Tournament altar". Nothing says what the game is. Humans decide in the first minute (`JUDGE-SIM.md`); the screener cannot see the page at all.
- **Effort:** 1.5 h.
- **Impact:** Medium.
- **Files:** `game/src/ui/loading.js` or a new `game/src/ui/premise.js`, `game/index.html`, locales (+ parity), `game/tests/client/boot.test.mjs`.
- **Acceptance criteria:**
  1. For 5 s after the first town frame (dismissible on any key), a lower-third reads "Forget to Foresee — Pay for prophecy with your memories. Built on NEAR testnet." with a 2-line subtitle "Walk up the stairs to begin."
  2. Respects reduced motion; does not delay input; not shown on `&films=` captures or `?cinematic=`.
  3. Screenshot test via `tools/capture` shows it once.
- **Claude prompt:**
  ```
  Branch claude/premise. After townReady (game/src/main.js townShown), show a dismissible lower-third with the title and a one-line premise (English, five-locale parity, reduced-motion safe, not during cinematic capture). It must not block input or delay the first interaction. Add a unit test of the show/hide policy.
  ```

## QW-12 — Single source of truth for numbers

- **Why:** stale numbers destroy trust with a machine reader. Examples: README 668 vs 728, 28 vs 31, ~295 vs 431 MB; `docs/submission/owner-steps.md:38-39` says 516.
- **Effort:** 1 h.
- **Impact:** Medium.
- **Files:** new `scripts/stats.mjs` (runs tests, counts, sizes, writes `docs/STATS.md` and a small JSON), README references the file, replace hard-coded numbers in `README.md`, `docs/submission/owner-steps.md`.
- **Acceptance criteria:** README quotes test counts only as "see `docs/STATS.md`, generated 2026-11-13"; one command regenerates; CI fails if `STATS.md` is older than the last test-file change.
- **Claude prompt:**
  ```
  Branch claude/stats. Write scripts/stats.mjs that runs the game, server and relayer test suites, counts passes, measures dist size, and writes docs/STATS.md with date and git SHA. Replace every hard-coded count in README.md and docs/submission/owner-steps.md with a link to docs/STATS.md. Do not change any test.
  ```

---

## Suggested schedule (Kyiv time)

| When | Do |
|---|---|
| Wed 11 Nov evening | QW-4 (30 min), QW-12, start QW-7 |
| Thu 12 Nov | QW-2 (owner hosts relayer in the morning), QW-3, QW-1, QW-8 |
| Fri 13 Nov before 16:00 | QW-6 (only if QW-2 and QW-3 are green), QW-5, QW-11, QW-9 |
| Fri 13 Nov 16:00–20:00 | merge freeze rehearsal: run `verify-all`, smoke, rewrite README numbers via QW-12 |
| Sat 14 Nov | QW-10 final video, tag `hackathon-submission`, post, submit |

Cut order if time runs short: drop QW-11, then QW-5, then QW-6. Never drop QW-1, QW-3, QW-4.
