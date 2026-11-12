# Forget to Foresee — Quality Audit

Audited: `SpacexCeo/forget-to-foresee` @ `83465f6` (merge of PR #40, 11 Nov 2026 18:35 Kyiv), read-only clone in `/workspace/ftf-audit/repo`.
Live build: https://spacexceo.github.io/forget-to-foresee/ (deployed from the same commit; Pages run `success`).
Audit date: 11 Nov 2026, evening Kyiv. Code freeze: 13 Nov 20:00 Kyiv. Deadline: 15 Nov 01:59 Kyiv.
Environment: Debian box, **no GPU** (Chrome headless on SwiftShader, ~5 fps), Node 24.22.1 / npm 11 (repo documents Node 22), Rust 1.99.1 via rustup.
Nothing was pushed, no PRs, no remote changes. No secrets appear in this report.

Companion files: `QUICK-WINS.md`, `JUDGE-SIM.md`, `README-PROPOSED.md`.

---

## 0. Verdict

**Overall: 7.3 / 10** (technical 7.5, judge-facing 7.1).

This is an unusually complete hackathon entry: a polished 3D client, a deterministic headless engine with 728 passing tests, three real NEAR testnet contracts that I confirmed live over RPC, an HTTP agent API that completes a full season in about 1 second, and a README that is more honest about real vs mock than most. The risks are not "does it work" but **"will a screener and a human judge see the strongest parts in 5 minutes"**:

1. The strongest NFT feature (Day 1 free mint: a player-owned guest account + NFT-as-account sub-accounts) is **built but dark on the live build** (relayer URL is not baked in; verified in the deployed bundle). The judge path shows only static, coordinator-minted shards.
2. The NFT moment on the judge path is **fragile**: forgetting the memory one trial late (trial 5 instead of 4) gives "Unminted shard preview" instead of the on-chain token (reproduced live).
3. The README is 47 KB / 7,400 words with 2,600-character table cells and **stale numbers** (668 tests documented, 728 actual; "~295 MB" build, 431 MB actual). A Claude Code style screener will find the commands, but will also find several literal checks that do not match.
4. Heavy delivery weight: dist is 431 MB, a clone is 2.3 GiB, and the judge path pulls about 123 MB in the first two minutes.
5. Rust side needs a recent toolchain plus `pkg-config`/OpenSSL headers that the README does not mention; `cargo test --lib` fails on a bare machine.

None of these is a blocker. All are fixable in hours. See `QUICK-WINS.md`.

**Blockers found: none** (build, tests, deploy, contracts all green). Secrets: **none found** in tree or history (patterns checked, see §2.8).

---

## 1. Scorecard (1–10)

| # | Area | Score | One-line reason |
|---|---|---:|---|
| T1 | Build reproducibility (JS) | **9** | `npm ci` + `npm test` + `npm run build` all green from a clean clone; README numbers stale |
| T2 | Build reproducibility (Rust) | **6** | 56/21/21/9 contract tests pass, but only with Rust ≥1.9x, unpinned `stable`, and `pkg-config` |
| T3 | Tests and coverage | **8.5** | 728 game + 31 server + 7 relayer + 107 contract unit tests; no coverage tool, e2e not in CI |
| T4 | CI | **7** | Pages + contracts workflows green; no server/relayer/e2e job, 3 contracts never built in CI |
| T5 | Architecture | **8** | Pure engine, thin entry, chunk plan, local-room == HTTP API; huge files and docs sprawl |
| T6 | Code quality / maintainability | **6.5** | Clever and tested, but 214 lines >240 chars, 118 silent `catch`, no linter or types, duplicated signer |
| T7 | Bundle size, asset weight, load perf | **5.5** | JS is fine (0.85 MB gzip); assets are not (431 MB dist, 55 MB of dev-only models shipped) |
| T8 | Error handling and resilience | **6.5** | Honest fallbacks everywhere on chain reads; no WebGL-specific failure message |
| T9 | Security | **8.5** | No secrets, relayer pattern, CORS allowlist, redaction tests; per-instance rate limit only |
| T10 | Contracts: quality and tests | **8** | Clean near-sdk 5 code, shared vectors, sandbox tests; toolchain unpinned, 3 crates outside CI |
| T11 | Determinism | **9** | Seeded engine, parity tests, bit-exact rules modes, independent verifiers |
| T12 | Accessibility | **8.5** | Narration, Simple mode, WCAG map, reduced motion, e.code keys; tests exist |
| T13 | Browser compatibility | **6** | WebGL2 desktop only; no capability probe; software rendering is ~5 fps (still completes) |
| T14 | Licensing and attribution | **8.5** | MIT, library and font licences, CMU mocap credit, AI-use disclosure; no NOTICE file |
| J1 | AI-screener readiness (README) | **6** | All paths exist and mostly reproduce; the document is too dense and a few literal checks fail |
| J2 | First impression (first 60 s) | **8** | Bright, polished town; but no premise sentence and a 123 MB first-two-minutes download |
| J3 | Clarity of the core loop | **7.5** | Quest line "Step 1 of 7" works; terms still jargon-heavy |
| J4 | Games track fit | **7** | Loop is real; chain is invisible (bonus), but no social login, NEP-245 or live player economy on chain |
| J5 | NFT track fit ("does something") | **5** | Shards are commemorative and static; NFT-as-account is built but not live or shown |
| J6 | Honesty of claims | **9** | Real/mock table is exemplary; one overclaim in GitHub repo description |
| J7 | Fun | **7** | Game loop completes and is readable; not measured with humans (see JUDGE-SIM) |

Weights used for the headline: technical areas 50%, judge areas 50%. Technical mean 7.5, judge mean 7.1, overall 7.3.

---

## 2. Technical lens

### 2.1 Build reproducibility — exact results

All from a fresh `git clone`, no caches except npm's global one.

| Step | Command | Result |
|---|---|---|
| Install | `cd game && npm ci` | 2.1 s, **0 vulnerabilities**, 1 esbuild postinstall notice (npm 11 `allowScripts` warning, harmless) |
| Game tests | `npm test` | **tests 728 / pass 728 / fail 0**, 14.0 s wall (README says 668 and "~35 s") |
| Build | `FTF_BASE=/forget-to-foresee/ npm run build` | `✓ built in 4.87s`, no warnings, `dist/` = **431 MB** (README says ~295 MB) |
| Server tests | `cd server && npm test` | **pass 31 / fail 0**, 2.5 s (README says 28) |
| Relayer tests | `cd relayer && npm test` | **pass 7 / fail 0**, 8.1 s (not mentioned in README) |
| Agent API run | `node src/main.js` + `node examples/agent.mjs --time-scale 1000` | Full season in **1.2 s**: `"outcome":"gift"`, `"rejected":0`, `"firstProofVerified":true` |
| Contracts, bare machine | `cargo test --lib` (rustc 1.85.1, no rustup) | **FAIL**: dependencies require rustc 1.86–1.95 (`near-sdk 5.30.1 requires rustc 1.95`) |
| Contracts, rustup stable 1.99.1, no pkg-config | `cargo test --lib` | **FAIL** at `openssl-sys` (dev-dependency `near-workspaces` pulls it in even for `--lib`) |
| Contracts, with `OPENSSL_DIR=/usr` set by hand | `cargo test --lib` | `season-commit` **56 passed**, `memory-shard` **21 passed**, `agent-card` **21 passed**, `guests` **9 passed** (matches README for 56 and 21) |

Notes:
- I ran Node 24, not the documented 22. Everything passed, so the claim "Node 20+" is plausible, but CI is the only evidence for 22. `game/package.json` has no `engines` field and there is no `.nvmrc`.
- README `README.md:73,79,138,142,144` and `docs/submission/owner-steps.md:38-39` carry stale counts. `README.md:142` is internally inconsistent: "`tests 667` / `pass 668`".
- `contracts/*/rust-toolchain.toml:2` uses `channel = "stable"` (floating). The lockfile already needs ≥1.95, so a judge on Rust 1.85 (common apt version) hits a wall before any test runs.

### 2.2 Tests and coverage

- Game: 728 tests across ~100 files (`game/package.json:10` lists every file explicitly, one very long line; new test files must be added by hand or they silently do not run).
- Strong categories: engine parity (60 recorded seasons vs 2D prototype), rules v2/v3, determinism, contract-vector parity JS vs Rust, i18n key parity (5 locales), collision tunnelling, streaming, HUD logic, a11y contrast, town quest, near-tx signing, Day 1 mint flow (with injected RPC), replay.
- Server: redaction (no hidden state in observations), token isolation, rate limits, idempotency, equivalence with the local room.
- Contracts: pure vector tests, near-sdk mocked-chain tests, `near-workspaces` sandbox tests (CI only).
- **Gaps**
  - No coverage tool (c8/nyc) and no number. Cheap to add (`node --test --experimental-test-coverage`).
  - `game/tests/e2e/` (Playwright, 10 files) is **not run in CI** and is documented as "meant to be red" while defects are open (`game/tests/e2e/README.md`). There is therefore no automated check that the *published page* loads without console errors.
  - `contracts/guests`, `contracts/token-account`, `contracts/character-nft` have unit tests inside `lib.rs` (9, 2 and 9 tests) but **no CI job builds or tests them** (`.github/workflows/contracts.yml` covers season-commit, memory-shard, agent-card only). `guests` is the contract behind the Day 1 free mint.
  - The relayer has 7 tests but no CI job.

### 2.3 CI

- `.github/workflows/pages.yml:40,42`: `npm test` then `npm run build`, then deploy. Good order (tests gate deploy). Last 6 runs all `success`.
- `.github/workflows/contracts.yml`: path-filtered; builds wasm with `cargo near build non-reproducible-wasm`; uploads results as annotations (nice touch for machine readers).
- Missing: server and relayer tests, Node matrix (22 and 24), e2e smoke on the built `dist`, a README/link checker, a "no secrets" scanner. Contract jobs install `cargo-near` from `releases/latest` (unpinned, will drift).
- Pages only rebuilds on changes under `game/**` (`pages.yml:10-12`), so a README-only fix will not redeploy (fine) but a relayer URL variable change needs a manual `workflow_dispatch`.

### 2.4 Architecture

- Strong: `game/src/game/engine.js` (718 lines) is a pure module with no DOM or network; `game/src/net/room.js` wraps it; the browser uses the same room module as the HTTP server (`server/` has zero dependencies and reuses `../game`). That is a rare, judge-friendly design and is proven by `server/tests/equivalence.test.mjs`.
- Boot is staged: tiny entry (`main.js`, 3.7 kB), `ui` chunk first, world and play behind it (`vite.config.js` chunk plan, `build/chunks.js`).
- Weak: `src/boot-world.js` (736 lines, one 1,000-character line at `:155`) and `src/net/room.js` (688) are god-files; `docs/` has 70+ entries including agent work-logs (`docs/handoff/`, `night-polish-log.md`, `fable-queue.md`) that a human judge will wade through.

### 2.5 Code quality

- No ESLint, Prettier, or TypeScript/JSDoc type checking. Conventions are enforced by tests instead, which works but hides drift.
- 214 lines over 240 characters and 15 over 400 characters in non-locale `src`; 118 empty or return-only `catch` blocks. Most are deliberate ("memory only", "next host"), several are commented.
- `relayer/lib/near-tx.js` is a byte-identical copy of `game/src/net/near-tx.js` (verified with `diff`); a test guards it, which is the right mitigation. Acceptable for a hackathon.
- `innerHTML` appears 25 times; every site I read feeds trusted constants or locale strings (`src/play/ui.js:27` says so). On-chain SVG is only drawn after a byte-for-byte equality check with the locally generated one (README, `src/net/shard-nft.js`). No obvious XSS path from chain data.
- Telemetry: none. `console.*` 65 occurrences, mostly `warn`.

### 2.6 Bundle size, asset weight, load and runtime performance

| Item | Measured |
|---|---|
| JS total (all chunks) | 2.66 MB raw, **0.85 MB gzip**. Biggest: `three` 851 kB, `locales` 618 kB (5 languages in one chunk by design), `play` 564 kB |
| CSS total | 224 kB raw |
| `dist/` total | **431 MB**; `assets/models` 417 MB; 126 `.glb` files, 28 over 5 MB |
| Largest models | `scroll_table.glb` 20.9 MB, `anchor.glb` 19.8 MB (both have `_m` phone variants of 8.8–8.9 MB), `shell_*_r2.glb` 7.8–9.5 MB each |
| Dev-only weight in the deploy | `shell_*_r2*.glb` = **55 MB**; they load only with `?shells=r2` (`src/boot-world.js:74`) |
| Transfer encoding on Pages | GLB is gzip-encoded by Pages but compresses ~1% (`anchor.glb` 19.83 MB → 19.64 MB): textures are KTX2 and geometry meshopt already |
| Judge path first two minutes (headless, `?demo=judge&mode=walk`) | **225 requests, ~123 MB** by Content-Length sum; town ready in 7–10 s on a datacenter link; island models stream in behind |
| Repo clone | `.git` pack **2.31 GiB**, working tree 1.4 GB (before my build). Contributors: `docs/video/jury-test-4/jury-test-4k.mp4` 97 MB, `docs/media/jury.mp4` 70 MB, `docs/media/demo.mp4` 82 MB (two revisions), 3 other large mp4s |
| Draw calls and triangles in the town | ~110 and 280–345 k (low tier, software GL); inside the stated budget of 120 / 500 k |
| Runtime on SwiftShader | ~5 fps; every README step still completed (see JUDGE-SIM) |

Takeaways:
- JS is not the problem. Asset delivery and clone size are. A screener running `git clone` on a CI-like machine may time out or fill a disk. `--depth 1` brings the clone to ~0.43 GB; this is not documented.
- The first-view budget logic exists (`src/ui/loading.js`, `firstFrameBudget`), and priorities stream hero models later. That is good engineering. It is invisible to a judge on a slow connection, though: nothing says "~120 MB, WebGL".

### 2.7 Error handling

- Chain reads are defensive and honest: any RPC failure drops to **Unminted shard preview** and says so (`README.md:101`). Verified live that a wrong-timing playthrough degrades this way, with clear copy.
- Boot failure has a generic message: `src/main.js:100` ("Something went wrong while loading. Reload the page."). `new THREE.WebGLRenderer` at `src/boot-world.js:57` is unguarded, so a machine without WebGL2 gets the generic message at best.
- Day 1 mint has explicit phases and reasons (`src/play/day1-mint.js`), idempotent resume via `guest_of`, and a retry path. Good.
- Empty `catch` blocks around `localStorage` are correct for private-mode browsers.

### 2.8 Security

- **Secrets**: scanned the working tree and full history (all branches) for NEAR secret keys (`ed25519:` + 85+ base58), `.env` files, `.pem`, keystores and `private_key`-style assignments. **No secret material found.** Only public keys and account ids (e.g. `src/net/day1-deployment.js` holds a *public* key). `.gitignore` excludes `.env*`.
- Relayer (`relayer/`): signs only `create_guest`; validates inputs like the contract; CORS allowlist (`relayer/lib/core.js:95,104`); per-IP token bucket is **per instance memory** (`:42`), so on serverless it is best-effort. The real limit is the contract's daily cap (200). Worst case is draining the testnet fund (0.05 NEAR × 200/day), not a mainnet loss.
- Browser-held player key: the Day 1 flow generates an ed25519 key in the browser, stores it in `localStorage` (`ftf.day1`) and exports "secret key" text from the Profile (`src/boot-world.js:155`). This is a deliberate testnet design; it must stay clearly labelled "testnet, no real funds". It is, in the README.
- Agent API: loopback by default (`server/src/main.js:11`), CORS allowlist, redaction tests, per-session tokens. Fine for a demo; not for the internet.
- Supply chain: 5 runtime deps in the game (`three` and fonts), 1 dev dep (`vite`). `npm audit`: 0 vulnerabilities. CI installs `cargo-near` from `releases/latest` over `curl | sh` (normal for NEAR, but unpinned).

### 2.9 Contracts (on-chain verified over public RPC, read-only)

| Account | State seen |
|---|---|
| `ftf-seasons.testnet` | `get_season("793f6c05e89839f2")` → `leaf_count 15`, `revealed_count 15`, `ash_key_committed true`, root `03dbd458…5769a` |
| `ftf-shards.testnet` | `nft_total_supply` = `"3"` |
| `agents.ftf-coordinator.testnet` | `nft_total_supply` = `"1"` (Iris card `793f6c05e89839f2-agent-iris`, owner `lambada_eth.testnet`) |
| `heroine.ftf-coordinator.testnet` | 3 tokens, all `Elise` owned by guest sub-accounts `ftfcheck-3`, `leadtest-1`, `localcheck-2` under `guests.ftf-coordinator.testnet` (these are owner test mints, not player mints) |
| `guests.ftf-coordinator.testnet` | `stats` → `guests 3, today 3, daily_cap 200`, fund 0.05 NEAR |
| Token sub-account `elise-ann-1`-style | `token_account_active` false (no heroine token account has been activated) |

Code quality (read): `contracts/guests/src/lib.rs` has input sanitation, a pending map, a daily cap, an owner-only config, retryable mint, `#[private]` callbacks, `overflow-checks = true`, and 9 mocked-chain tests (all pass). `contracts/token-account/src/lib.rs` restricts `execute` to the parent contract. `season-commit` recomputes leaves and verifies Merkle paths on-chain with 56 tests plus sandbox tests.

Risks:
- Toolchain unpinned (`rust-toolchain.toml:2`), `cargo-near` unpinned in CI.
- `guests`, `token-account`, `character-nft` not in CI.
- Minting trust model is "coordinator mints" for shards and cards (documented honestly). `act_as_token` NFT-as-account code exists on chain code-hash level (`heroine` and `companions` share a code hash, `guests` and `agents` have their own) but is **not exercised**.

### 2.10 Determinism

Engine takes an injected `randomBytes` (`engine.js:31-34`), time is injected (`room.js:70`), seasons are seeded (`--time-scale 1000` runs identically), `baseline-2d-1` is bit-exact with the 2D prototype (60 recorded seasons), and independent verifiers (`tools/verify/verify.mjs`, `verify.py`) import nothing from the game. This is the best-engineered part of the project. The only wall-clock use in rules-adjacent code is `drillResult`'s timestamp default (`game/src/game/exchange.js:164`) and the town ledger clock, both injectable.

### 2.11 Accessibility

`docs/accessibility.md` (171 lines) includes narration, Simple mode, readability (Atkinson Hyperlegible bundled), motor (no timing-critical input), "What is happening?" recap, reduced motion (163 references), WCAG 2.2 AA map including what is *not* covered. Keys use `KeyboardEvent.code` (`src/ui/input.js:100-108`), so Cyrillic and other layouts work. Gamepad and touch exist. Gaps: the 3D canvas has no text alternative beyond HUD live regions; no `<meta name="description">`, no social cards (see J2); lobby fonts come from Google Fonts at runtime (`index.html:7`, README discloses).

### 2.12 Browser compatibility

README states desktop Chrome/Edge/Firefox with WebGL 2 (`README.md:33`). No capability check or readable fallback (`src/boot-world.js:57`). Tier detection (`detectTier`) lowers quality on weak GPUs, and phones get `_m` models. Physics is hitch-proof: `fixedSteps` carries up to 1.0 s of a long frame (`src/physics/collision.js:389-400`, wired at `src/boot-world.js:438,633`). **This fix works:** at 4.7–5 fps on SwiftShader, `town.walkRoute()` climbed the stairs and reached the altar in about 90 s. (The earlier playtest failure on the box predates this fix or was a mouse-path issue.) Safari/iOS not tested (no device).

### 2.13 Licensing and attribution

MIT (`LICENSE`, copyright 2026 Lambada_eth). `README.md:218-229` lists libraries with licences, fonts (OFL), CMU mocap credit with the funding line, Frankfurter/ECB data attribution (README row for Foresight Exchange), the AI-generated-code disclosure, and the Arrival inspiration note. Gaps: no `NOTICE`/third-party file in repo root; GitHub repo has no topics or homepage. Q-002 caveat from the hackathon rules ("only NEAR integration built in the window is judged") is satisfied: git history begins 7 Nov and a `pre-hackathon` tag exists; the `hackathon-submission` tag **does not exist yet** (owner step).

---

## 3. Judge lens (summary; full simulation in `JUDGE-SIM.md`)

**What a judge sees live (verified on the deployed build with software rendering):**
- Opens straight in a sunlit cobbled town, polished and coherent, with a single quest line "Walk to the Tournament altar". No title card, no premise sentence.
- `town.walkRoute()` plus `register()` reaches the altar, then a short cover and the floating archipelago HUD (Trial 1 of 17, Silk 63, "Step 1 of 7").
- Literal README step table reproduces: G walks to the pad; E anchors (silk 63 → 53); T,T → trial 2 silk 56; trial 4 reached; Memories panel opens with three memories and "Forget it for a vision".
- One literal check fails: README says silk **72** at trial 4 (`README.md:45`); I observed **82** on the fixed judge season (two separate runs). Not material, but a screener that asserts numbers will flag it.
- The NFT moment is timing-dependent: forgetting at trial 4 matches the committed shard; forgetting at trial 5 (my first attempt) shows "Unminted shard preview … On-chain mint is for the published judge season only". The copy is honest. The risk is that a judge never sees the on-chain card.
- Zero console errors, warnings, 4xx or failed requests across three full runs.

**Does NEAR matter?** Yes for verifiability (commit-reveal on-chain; the game reads it back). Not for ownership or economy. For the Games track, "bonus if players never notice the chain" is satisfied by default. For the NFTs track ("NFTs as accounts with behavior"), the shipped, visible NFTs are static commemorations. The NFT-as-account design exists in code (`contracts/character-nft`, `token-account`, `guests`) and is the right pitch, but nothing on the live build shows it.

**Claims vs reality:** the README is accurate to a fault. The only overclaim I found is the **GitHub repository description**: "3D game where NFT agents pay for prophecy with their own memories", while the README says Iris is "game state, not a token" and "no player-owned agent NFT". Fix the description.

---

## 4. Top risks (ranked by expected score loss)

| # | Risk | Likelihood | Impact | Fix (see QUICK-WINS) |
|---|---|---|---|---|
| 1 | NFTs track judge sees only static, coordinator-minted shards; Day 1 free mint is dark (relayer URL undefined in live bundle) | Certain unless fixed | High | QW-2, QW-6 |
| 2 | Screener hits stale or dense README, fails a literal check (668 vs 728, silk 72 vs 82), or gives up on 47 KB | High | Medium–High | QW-1 |
| 3 | Judge misses the minted shard card because the path is timing-sensitive | Medium | High | QW-3 |
| 4 | Blank link preview and repo description mismatch on X and GitHub | Certain | Medium | QW-4 |
| 5 | Screener on a no-GPU or slow machine: 123 MB first two minutes, ~5 fps, no WebGL message | Medium | Medium | QW-5 |
| 6 | `cargo test` fails on a clean machine (toolchain, pkg-config) | Medium | Medium | QW-7 |
| 7 | 2.3 GiB clone and 431 MB deploy; 55 MB of unused models | Medium | Low–Medium | QW-8 |
| 8 | Demo video predates the town and Day 1 (dark Shell interior; judges open a bright town) | High | Medium | QW-10 |
| 9 | No browser smoke test in CI: a last-day change can silently break the judge link | Medium | High | QW-9 |

---

## 5. Alignment with the existing plans

- `FTF-HACKATHON-TZ.md` P1-A (hitch robustness, keyboard layout) is **done** (`collision.js:389`, `input.js:100`). P1-B (town quest) **done** per `README.md:117` and `tests/client/town-quest.test.mjs`. P1-C (shard card for every player) is implemented as an honest preview, not a real mint, which is the right call. P1-D (`agent-card`) **deployed**. P2-A (tournament) was replaced by the local Foresight Exchange drill (`README.md:120`), consistent with `FTF-AGENT-MARKET-PLAN.md`. P2-B (usage counters) not done; skip it.
- `FTF-COMPETITOR-MAP.md`: the three named threats win on social login (a rival entry), merchant-as-contract (Lunearcy) and dynamic NFT gear (Afterlight). FTF's differentiators are visual quality, verifiable fairness, and the agent API. The gap to close cheaply is **an NFT that visibly does something** (QW-6) and **one invisible-chain moment for a brand-new player** (QW-2).
- Hackathon rules (`HACKATHON.md`): public repo + LICENSE ✓, README for machines (partly), X post with video (video is stale), `hackathon-submission` tag pending, hosted demo should stay up to 18 Nov (Pages is fine).

---

## 6. Evidence index

- Copies of the key logs, five screenshots and the driver script: `/workspace/ftf-audit/audit/evidence/`.
- Logs: `/workspace/ftf-audit/test-game.log`, `build.log`, `test-server.log`, `cargo-all2.log`, `server-run.log`, `pp/judge-lit2.log`, `pp/judge-sh.log`, `pp/judge-mint.log`.
- Screenshots (live build, SwiftShader): `/workspace/ftf-audit/shots/` (`lit-01-town.png`, `lit-03-island.png`, `sh-07-confirm.png`, `sh-09-shard-card.png`, others).
- On-chain reads used public testnet RPC view calls only.
