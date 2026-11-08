# Forget to Foresee

> A game by RAEN Computers. Built at NEAR HACKATHON (1–14 Nov 2026). Tracks: **games**, **nfts** (tentative, see [Tracks](#tracks)).

**The problem.** Games with "AI agents" and "on-chain economies" usually hide two lies: the AI secretly decides the outcome, and the chain is decoration. We wanted a strategy game where every prophecy is fixed before play begins and can be checked afterwards, and where the agent's biography is the currency.

**The product.** Shells hang over a floating archipelago. The Guests inside speak in round signs of four slots (Place, Action, Power, Delay). Six clans, each an agent with a wallet and a memory, read the signs, stake silk on where a Gift will land, trade words, keep or break trust, and must assemble one message from six fragments before the crisis on trial 13. To see the future early, your agent Iris **forgets a memory forever**, and the forgotten memory goes to auction as a shard: *an NFT that pays for prophecy with its own biography.*

**How NEAR fits in.** The whole season is generated before the first move and committed to a SHA-256 Merkle root. Every revealed event carries a proof; the game checks it in the browser ("Verified ✓"), and our NEAR contract `season-commit` recomputes the same leaf byte for byte and verifies the proof on-chain, with a separate commit-reveal for the crisis key. The contract builds and passes its tests; it is **not deployed yet** (owner step, one command). **What "Verified ✓" proves, exactly:** the revealed event is the one fixed before trial 1 and was not changed afterwards. It does not prove the season was chosen fairly: today the same client generates the season, commits the root and checks it, so the root is only independent once it is registered on NEAR before trial 1 (the deployment step above). No token, no paid entry, no real money: the economy is closed in-game silk.

**Verify it yourself, without this code.** Every revealed sign exports as one JSON (`Copy proof` in Signs & Visions, once the
HUD button lands; the same document comes from `game/src/net/verify-export.js`): full hashes, the byte recipe, the Merkle path.
Check it with a one-file verifier that imports nothing from the game: `node tools/verify/verify.mjs proof.json` or
`python3 tools/verify/verify.py proof.json` → every line `✓` and `OK` (exit 0); change one digit → `✗` and `FAIL` (exit 1).
The leaf alone needs only a shell: the `recipe.shell` line of the file is a `printf … | sha256sum` command whose output is the
leaf hash. Live seasons (not the fixed judge season) follow a seed protocol in which the room commits to its random bytes
before the player's nonce is sent and reveals them at the end, so anyone can recompute the seed and regenerate the schedule
(`node game/scripts/replay-season.mjs <seed> season.json`). Details, limits and what each check proves: [docs/verify.md](docs/verify.md).

---

## Judge in 5 minutes

Everything runs in the browser from the published build (desktop Chrome, Edge or Firefox with WebGL 2; ~60 MB loads before you can play, models keep streaming in afterwards and unlabeled greybox stand-ins fill in until they arrive; place names are on the map, key **N**). The published build comes from `main` through `.github/workflows/pages.yml`. The same path works locally with `cd game && npm ci && npm run dev` and `http://localhost:5173/?demo=judge&mode=walk`.

**Open** https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk — a fixed season in Novice mode with fresh hints, played by walking the island. This table was verified step by step. The default play mode is the Shell hub (see [Play through the Shell hub](#play-through-the-shell-hub)); `&mode=walk` keeps the walking play the table describes.

| # | Do | See |
|---|---|---|
| 1 | The lobby: **ENTER THE WORLD** → **Play as guest** → the five tutorial beats (tap the four strokes → **Next**; tap the core once → **Next**; tap the strokes 1 to 4 → **Next**; **Stake 10 silk on Shell II, trial 3**, watch trials 1–3 pass and the ring seal **Verified ✓** → **Next**; **Forget it for a vision** → **Guide me (Novice)**) → **Begin** (the hologram look picker) → **Step onto the island**. Every beat has **Skip tutorial**; a returning player goes straight to the island. | The island with Iris on the balcony. HUD top-left: **Trial 1 of 17**, Silk **63**. Main quest: **Stake 10 silk at Shell I’s pad** · *G walks there. At the pad choose “Anchor here for trial 3”.* Log: *Owner's Key committed: 0x…* (a salted commitment; the hex differs on every run). |
| 2 | Press **G** (Iris walks to the pad of Shell I on the plaza rim; about 30 s, hold **Shift** to run; or **WASD** / click the ground) | At the pad the context menu lists **E Anchor here for trial 3 · 2 Anchor here for trial 2 (as your reading says) · 3 … trial 1 · 4 … trial 4 · 5 Enter Shell I · 6 Look at the zone** (before the first reveal the trial-3 stake is the highlighted one: the first Gift of every season lands on trial 3, and a stake on trial 1 or 2 can never pay). |
| 3 | Press **E** | Silk drops to **53**, log: *Anchor: Shell I, tick 3.* Quest: **End trial 1** · *Press T twice. Trials pass; trial 3 reveals the sign.* |
| 4 | Press **T** twice (the second press confirms "End the tick anyway?") | **Trial 2 of 17**, silk 56. Quest: **Watch trial 3 come true** · *Keep pressing T. The reveal is checked against the seal.* |
| 5 | Press **T** twice more, twice (to **Trial 4 of 17**) | Silk **72** (the stake came back: the Gift fell on Shell II). Log: ***Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓***. Hint: *It came true, and the seal matches: this future was written before we arrived.* Press **V** → **Resolved** tab: **Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3.** Quest: **The Price of Memory** · *Press M. Forget a memory: Iris sees the next signs early.* |
| 6 | Press **M**, then click **Forget it for a vision** on any memory (heavier memories show more signs) | Signs & Visions opens with one to four new cards marked *vision*; log: *Vision: Iris sees N future signs before anyone else.* and *Shard "…" is up for auction.* Quest: **Decide your fragment at the Scroll** · *Give it for a share, or hold it: 40 silk at trial 13.* (**G** walks there; **E** gives it.) |

That is the loop: read a sign → stake silk on it → the trial ends → the event is revealed with its Merkle proof against the root committed before you arrived. Then the Price of Memory: forget a memory, see the next signs early. From here: **V** shows every sign (Novice: one plain line; Pro: the four slots with confidence), at an anchor zone **E → Enter Shell** takes you inside to the glass where the Guest draws the sign and you can **Ask the Guests** whether a stroke means a meaning; **H** lists every key; **L** switches EN/RU; **Settings** switches Novice/Pro and the five UI languages.

### Play through the Shell hub

The default mode (owner design, 08.11): open `/?demo=judge` without `&mode=walk`.

1. **Fly into a Shell.** Quest: *Fly into Shell I · A sign waits there. Press F or tap the gold Shell.* The Shell dock on the right shows the four Shells; a gold one has a sign waiting. Click it or press <kbd>F</kbd>.
2. **Read the sign.** Inside, the Guest draws a round logogram on the glass. The reading card shows Iris's guess for each of the four slots (Place, Action, Power, Delay) and how sure she is. Change any slot you read differently with ‹ ›. Before the first reveal the card's Delay is pre-filled so the stake lands on trial 3 (the first Gift of every season lands there; a stake on trial 1 or 2 could never pay). Quest: *Stake 10 silk on the sign · Iris read it: trial 3. Press F to stake 10 silk.*
3. **Stake 10 silk on your reading** (<kbd>F</kbd>). The card shows where it lands ("Gift at Shell I, trial 3"). Quest: *Leave and let time pass.*
4. **Leave the Shell** (<kbd>T</kbd>). Leaving ends the trial. Quest: *Watch trial 3 come true · Let trials pass (T).* Trials with no new sign pass on their own; they stop for a new sign or a one-click decision (Moss's loan at trial 3: any answer). At trial 4 the log reads *Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓*, the stake is back, and "Verified ✓" shows in Signs & Visions (<kbd>V</kbd>).
5. **The Price of Memory** (<kbd>M</kbd>): forget a memory forever to see future signs as a vision. The memory goes to auction as a shard.

**See:** silk changes after each reveal, the log fills with the clans' moves, and from trial 3 the revealed signs carry "Verified ✓". The season ends after the vote on trial 17. `tests/client/hub.test.mjs` plays a whole season only through the hub with zero rejected commands.

**Second path, the agent API (no browser, about 1 minute):**
```bash
cd game && npm ci
cd ../server && npm start                    # Forget to Foresee agent API listening on http://127.0.0.1:8787/v1
node examples/agent.mjs --time-scale 1000    # second terminal
```
**See:** `session s-… (rules v3, timeScale 1000)`, then `walk to scroll`, `tick 1: contribute fragment`, `tick 1: anchor Shell 1 @ tick 2`, `tick N: end tick` … and a JSON summary with `"rejected": 0` and `"firstProofVerified": true`. The outcome varies by season (`gift`, `weapon`, `lost`, or `gone` when the Shells leave before the vote; then `"voted": false`).

**Third path, the tests (about 1 minute):** `cd game && npm test` → `# pass 363`; `cd server && npm test` → `# pass 28`; `cd contracts/season-commit && cargo test --lib` → `test result: ok. 56 passed`.

---

## What works today

Measured on 08.11.2026 from a fresh clone (`docs/handoff/agent-reports/submission.md` has the raw output).

| Part | Status | Where |
|---|---|---|
| Headless game engine with three rule modes: `baseline-2d-1` (bit-exact with the 2D prototype on 60 recorded seasons), `v2` (32-byte CSPRNG salts, domain separation, defect fixes), `v3` (owner-approved: success-conditional prizes, exact Gift split, proof-bound reveal, 128-bit CSPRNG seed, funded-bid fallback, debt timing, the Shells leaving wipes silk) | **works**; 93 engine tests | `game/src/game/engine.js`, [docs/rules-baseline.md](docs/rules-baseline.md) |
| SHA-256, Merkle root of the season's events, proof of every reveal, negative tests for tampering | **works** | `game/src/game/crypto.js` |
| **3D client (Three.js):** the floating archipelago (island, 6 camps, 4 levitating Shells, bridges, balcony spawn), isometric camera that zooms to third person, swept kinematic capsule at 30 Hz, model streaming (KTX2 + meshopt, phone `_m` variants), look-dev stack with quality tiers | **works** | `game/index.html`, `game/src/main.js`, `game/src/render/` |
| **Play layer:** a full 17-trial season in the 3D client through the same room module as the agent API (local transport; rules `v3`), goals and A-to-Z hints, context actions (E / 1–9), Memories and Signs & Visions panels, clan agents walking to their camps, the Scroll, anchor zones, shard pedestal | **works** (local demo session; the browser does not talk to the HTTP server) | `game/src/play/`, `game/src/net/room.js` |
| **Inside a Shell:** enter from an anchor zone, the Guest behind the glass draws the current sign stroke by stroke, Ask the Guests (a "no" refunds the silk) | **works**; the interior model's coordinates are still off (the glass sits where the entrance should be), so the hall reads as a greybox-quality scene | `game/src/play/game.js`, `game/src/play/logogram.js` |
| **World HUD** to the owner's mockups (desktop and phone): trial card, quest banner, Signs & Visions with plain readings (Novice) or the four slots (Pro), "Verified ✓" on revealed signs, log / hints / lore tabs, dialogue strip, hotkey bar | **works**; `?hud=old` shows the previous greybox overlay | `game/src/ui/world-hud/`, `game/src/play/world-hud.js` |
| **Novice / Pro** presentation modes (same rules; Novice unlocks HUD layers L0→L2 as the season advances) and 15 hint rows | **works** | `game/src/play/hints.js`, `docs/design/clarity-layers.md` |
| Lobby and onboarding: guest demo entitlement → a five-beat interactive tutorial (tap the slots, the dot, read the sign, stake and watch trial 3 verified, forget a memory; skippable, resumes after a reload) → hologram look picker over the full constructor (canonical recipe hash) → first contact; a returning player skips all of it | **works**; the entitlement is synthetic and labeled; design and audit in [docs/tutorial.md](docs/tutorial.md) | `game/src/ui/`, `game/ui-preview.html` |
| UI languages | **EN, UA, RU, IT, 中文 complete** (UA, IT and 中文 AI-translated, not yet proofread by native speakers; key and placeholder parity enforced by `tests/ui-i18n-locales.test.mjs`); switch mid-season without losing the season | `game/src/locales/`, `game/src/play/locales/` |
| Input | keyboard + mouse (WASD, click-to-move, arrows / right-drag, wheel), **Shift** to run, gamepad, touch (tap to walk, drag to orbit, pinch to zoom; run button, double tap or a far tap to run); phones get the miniature HUD, a phone quality profile and skip the lobby | `game/src/ui/input.js`, `game/src/ui/gamepad.js` |
| **Agent-playable HTTP API:** OpenAPI 3.1, action catalog with JSON Schemas, idempotent version-checked commands, per-viewer redacted observations, navigation-bound movement, SSE, audit history, Merkle proofs, an example agent that plays a whole season | **works** locally; 28 tests | `server/`, `game/src/net/`, [docs/api/](docs/api/README.md) |
| **NEAR contract `season-commit`** (Rust, near-sdk 5.30, testnet only): immutable season root commitment, on-chain recomputation and verification of each revealed leaf and Merkle path, Ash's key commit-reveal, NEP-297 events | **builds and passes tests**: 56 unit + mocked-chain tests on any Linux/macOS, 2 sandbox tests in CI; **not deployed** | `contracts/season-commit/`, [its README](contracts/season-commit/README.md) |
| 3D art: island, 6 camps, 4 Shell exteriors (+ unused round-2 variants), Shell interior, anchor, Scroll table, shard, 6 rigged clan agents (8 clips each) + suit, the Guest (idle / draw / react), 23 props and relics, 5 fauna; all textures KTX2, geometry meshopt | **67 glb files load by name**; several are not yet reviewed by a human (faces up close, interior coordinates, Guest core glow: `docs/HANDOFF.md`) | `game/public/assets/models/`, `art/`, [docs/art/](docs/art/) |
| Audio: 60 procedurally synthesized sounds (ambience, three music stems, Guest voice, UI, footsteps, stingers) and a WebAudio runtime | **wired**: unlock on first input, tension-driven music, the Guest speaks the strokes, zone ambience, one positional hum per Shell, footsteps by surface (Iris and agents), UI click/confirm/error, music/SFX/master volume sliders in the scene controls dialog; not yet tuned by a human listener | `game/src/audio/`, [docs/audio.md](docs/audio.md) |
| VFX: GPU particle system, 4 flipbooks, presets (memory burn, vision, mist, logogram, vote finale, …) | **wired**: mist under every Shell, Shell IV crack pulse, season-tension tint, logogram on the Shell glass, vote-finale beams, cue effects; follows the quality tier and reduced motion; every cue is mapped or listed as silent (enforced by a test) | `game/src/vfx/`, [docs/vfx.md](docs/vfx.md) |
| Asset review page, UI preview page, HUD preview page (dev) | **work** | `game/review.html`, `game/ui-preview.html`, `game/hud-preview.html` |
| Weekly tournament card and enrollment | **simulation**: local UI state, no server, no prizes | `game/src/ui/tournament.js` |
| Browser prototype of the full game loop (2D) | **works**, the frozen parity reference (UI in Russian by design) | `prototype-2d/index.html` |
| NEAR NEP-171 fragment / shard NFTs, escrow, wallet sign-in | **not started** | — |

### Real / mock

| What | Now |
|---|---|
| AI clans | deterministic heuristics with personalities, not an LLM (**mock AI, real rules**) |
| Season commitment | the browser generates the season, commits the Merkle root before trial 1 and verifies every reveal against it: **real cryptography, local** ("browser verification against the root"). The contract that would make it **on-chain** is tested but **not deployed**, so the game never says "verified on-chain" |
| NFTs, shards, escrow | simulated in the engine (**mock**) |
| Hashes and Merkle proofs | real SHA-256; the contract's test vectors are generated from the same engine (**real**) |
| Money | in-game silk, no token, no payments |
| 3D art | real models for everything listed above; any model that is missing or fails to load falls back to an unlabeled **greybox** stand-in (its "not final art" label shows only with `?dev=1`, the F3 dev HUD or on the asset review page) |
| Access check | **mock**: a free synthetic guest entitlement stored in the browser, labeled |
| Weekly tournament | **mock**: synthetic schedule, enrollment and results on the device, labeled "simulation" |
| Agent API sessions | **real** server logic; test sessions only: in-memory, per-session tokens, no accounts |
| Season seed | `v3` (the client's and the API's default): a 128-bit CSPRNG seed, SHA-256 counter-mode RNG, no secret in the client projection. `v2` / baseline: 32-bit seed (parity with the prototype) |
| Audio / VFX | present and wired as listed above; nothing else is claimed |

---

## Run from a clean clone

Requires **Node.js 20+** (checked with 22). Rust is only needed for the contract.

### Game: tests, dev server, production build
```bash
cd game
npm ci
npm test            # 363 tests, ~20 s
npm run dev         # http://localhost:5173/        (judge path: /?demo=judge&mode=walk; skip the lobby: /?play=direct)
npm run build       # game/dist (~295 MB, mostly models); FTF_BASE=/forget-to-foresee/ for the Pages sub-path
```
**See:** `# tests 363` / `# pass 363` / `# fail 0`; `✓ built in …s`.

What the 363 tests cover (the breakdown below is the 260 of the first measurement; 103 were added on 08.11: 6 Shell hub, 9 uk/it/zh locale parity, 12 mobile run and phone quality tier, 5 audio/VFX cue mapping, 18 locomotion and camera, 9 island map, 12 NEAR read-only client (mocked RPC), 3 QA regressions, 18 tutorial and first loop, 9 living NPC agents):
- 60 parity seasons replayed from the 2D prototype (20 seeds × 3 strategies), 8 edge cases and tampered proofs, 7 rules-v2 tests, 18 rules-v3 tests (each proposal and each of the six review findings), 3 Monte Carlo harness pins (`npm run sim -- --quick`; analysis in [docs/math/economy-report.md](docs/math/economy-report.md)), 2 contract-vector checks.
- 3D client logic (no WebGL needed): 15 swept-collision tests (no tunneling at 15 m/s or in a 20 m step, same end point at 10 and 144 FPS), 9 streaming (priority, load plan, LRU), 5 smooth motion, 7 world layout, 8 play layer, 6 input, 7 hints, 2 asset budgets (KTX2-only textures, meshopt, phone variants), 6 audio, 14 VFX.
- UI: 16 i18n (ICU subset, en/ru parity, no raw keys, the engine-text adapter over 120 scripted seasons), 13 UI logic (flow order, recipe hash, tournament idempotency), 6 accessibility (contrast, colour-independent tells), 48 world HUD (status, signs, log, actions, shared, view model from observations).

Dev URL parameters: `?demo=judge`, `?mode=walk` (walking play instead of the Shell hub), `?play=direct`, `?seed=<32 hex>`, `?lang=en|uk|ru|it|zh`, `?hud=old`, `?hints=reset`, `?tier=ultra|high|low`, `?motion=reduce`, `?view=overview|camp|close`. **F3** opens the dev HUD (draw calls and triangles against the 120 / 500k budgets, asset states).

### Agent API
```bash
cd game && npm ci          # once; the server has no dependencies and reuses ../game
cd ../server
npm test                   # 28 tests, ~2 s
npm start                  # API on http://127.0.0.1:8787/v1 (OpenAPI: /v1/openapi.yaml, catalog: /v1/actions)
node examples/agent.mjs --time-scale 1000 [--rules v2]   # second terminal
```
**See:** `# pass 28`; the agent's step log and JSON summary as in the judge section. Full reference: [docs/api/README.md](docs/api/README.md).

### NEAR contract
```bash
cd contracts/season-commit
cargo test --lib                                   # 56 tests: 13 pure vector tests + 43 on near-sdk's mocked chain
cargo near build non-reproducible-wasm --no-abi    # -> target/near/season_commit.wasm (needs cargo-near)
cargo test                                         # adds the 2 near-workspaces sandbox tests (Linux/macOS; they need the wasm above)
cargo test --lib --target wasm32-wasip1            # Windows: the 13 pure tests under Node's WASI
```
**See:** `test result: ok. 56 passed`. CI runs every tier on Ubuntu (`.github/workflows/contracts.yml`, green on `main`). Build, test and testnet deploy details, and the exact list of what is and is not verified on-chain: [contracts/season-commit/README.md](contracts/season-commit/README.md).

### 2D prototype (no install)
Open `prototype-2d/index.html` in a browser. It is the frozen rules reference the engine is tested against, so its UI stays Russian.
**Do:** enter any Key phrase → "Начать сезон" (start season) → pick the reading rule "Начало задают точки в ядре" (dots set the start) → end ticks.
**See:** Iris's dictionary becomes confident, anchors on a Gift pay silk, and from tick 3 the "Контракт" panel shows "✓ сверен" (verified): the reveal matched the Merkle root published before the season began.

### UI and HUD previews (dev)
With `npm run dev` running: `http://localhost:5173/ui-preview.html` (lobby → onboarding → chronicle with "Auto-play one tick", EN/RU switch), `http://localhost:5173/hud-preview.html` (`?live=1` drives the HUD from a real local season), `http://localhost:5173/review.html?model=anchor` (one model next to a 1.75 m figure, runtime / `_inspect` / `_col` / socket toggles). Details: [docs/ui.md](docs/ui.md), [docs/ui-world-hud.md](docs/ui-world-hud.md).

---

## Controls

| Key | Action |
|---|---|
| **W A S D** / click the ground / tap | walk; **Shift** run; on phones the run button (bottom right), a double tap or a far tap runs |
| **F** | Shell hub: fly into the gold Shell; inside, stake 10 silk on your reading |
| **G** | walk to the current goal |
| **N** | the island map: camps, the Scroll, anchor zones, the four Shells with their state, your position and goal; click a place to walk there (in the Shell hub a Shell click flies) |
| **E** | do the highlighted action; **1–9** pick another from the context menu |
| **M** / **V** / **T** | Memories · Signs & Visions · end the trial (press twice to confirm while attention is left); in the Shell hub **T** leaves the Shell, which ends the trial |
| **← →** / right-drag / one-finger drag | rotate the camera (limited); **↑ ↓** / wheel / pinch / **+ −** zoom from the overview down to third person (never first person) |
| **I** | inspect the nearest hero object up close; **R** resets the camera |
| **H** / **L** / **Esc** / **F3** | help · next UI language (EN → UA → RU → IT → 中文) · close / stop / menu · dev HUD |
| Gamepad | left stick walk, right stick look, A interact, B back, menu button settings |

---

## Repository map

| Path | What |
|---|---|
| `game/` | Vite + Three.js client, engine, play layer, UI, tests |
| `server/` | the agent API (`node:http`, no dependencies) |
| `contracts/season-commit/` | the NEAR contract (Rust) |
| `prototype-2d/` | the 2D reference prototype (frozen) |
| `art/` | procedural Blender sources and tools for every model, audio synthesis |
| `docs/` | spec, decisions, rules baseline, API, art, audio, VFX, design, hackathon checklist, submission drafts |
| `.github/workflows/` | `pages.yml` (tests + build + deploy to GitHub Pages on every push to `main`), `contracts.yml` (wasm build + all contract test tiers) |

## Tracks

- **games** ("Games With Real Economies"): the economy *is* the game loop. Six agent clans trade words, silk, promises and memories; anchors pay out from a Gift split exactly between those who staked; defection raises world tension until the Shells leave and everyone loses. The season's randomness is sealed before the first move, so no patch, no admin and no AI can bend an outcome.
- **nfts** ("NFTs That Do Something"), tentative: the game is designed around an agent whose NFT card carries its biography (what it remembers, what it forgot, who bought the shard). Today that card is simulated in the engine; the only contract is the commitment contract above. The README says so, and the owner decides whether to list the track.

## Baseline and third-party code (Q-001–005)

- All code was written **after 19.10.2026**, inside the hackathon window. There is no earlier code or template: the game, engine, server, contract and art pipeline were started for this hackathon.
- **Tags.** `pre-hackathon` exists and points to the empty root commit. `hackathon-submission` is created by the owner at the freeze on the commit that is submitted:
  ```bash
  git tag -a hackathon-submission -m "NEAR Hackathon submission" <commit-on-main>
  git push origin hackathon-submission
  ```
  The diff between them is the whole work: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission (live once the tag is pushed).
- **Libraries** (from the lockfiles): [three](https://threejs.org) 0.170 (MIT), [Vite](https://vitejs.dev) 6 (MIT, dev only), `@fontsource/libre-caslon-text`, `@fontsource/old-standard-tt`, `@fontsource/source-sans-3` 5.3 (SIL OFL 1.1, bundled fonts), Cormorant Garamond and Noto Serif SC from Google Fonts for the lobby (SIL OFL 1.1, loaded from fonts.googleapis.com). The server has no dependencies. Contract: [near-sdk](https://github.com/near/near-sdk-rs) 5.30 (MIT / Apache-2.0); tests: [near-workspaces](https://github.com/near/near-workspaces-rs) 0.24, tokio 1, anyhow 1, serde_json 1 (all MIT / Apache-2.0); build: [cargo-near](https://github.com/near/cargo-near). Art tools (not shipped): Blender 4.5, toktx / Basis Universal, gltf-transform, numpy / scipy, ffmpeg (Opus). Every model and sound is our own procedural work; sources and licences per asset: [docs/art/manifest.md](docs/art/manifest.md).
- **AI-generated code and content.** The code, documentation, 3D models (procedural Blender scripts), sounds and most texts were produced with AI assistance under the owner's direction: Claude Code (Claude Opus 5.5 and Claude Fable 5.1, multi-agent sessions) wrote the engine, client, server, contract, art pipeline and docs; Codex worked on the UI polish branch (`codex/premium-ui`); independent reviewer agents did the game-design and economy reviews (`docs/math/`). The owner designed the game, made every product decision (`docs/decisions.md`), supplied the lobby background art and the HUD mockups, and reviewed the results.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

<!-- If the owner submits a second, independent project (Q-015), both READMEs must link to each other. -->
None submitted yet.

## License

MIT, see [LICENSE](LICENSE).
