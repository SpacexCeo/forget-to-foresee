# Forget to Foresee

> A game by RAEN Computers. Built at NEAR HACKATHON (1–14 Nov 2026). Tracks: **games**, **nfts** (tentative, see [Tracks](#tracks)).

**The problem.** Games with "AI agents" and "on-chain economies" usually hide two lies: the AI secretly decides the outcome, and the chain is decoration. We wanted a strategy game where a prophecy can be *proven* honest and where the agent's biography is the currency.

**The product.** Shells hang over a floating archipelago. The Guests inside speak in round signs of four slots (Place, Action, Power, Delay). Six clans, each an agent with a wallet and a memory, read the signs, stake silk on where a Gift will land, trade words, keep or break trust, and must assemble one message from six fragments before the crisis on trial 13. To see the future early, your agent Iris **forgets a memory forever**, and the forgotten memory goes to auction as a shard: *an NFT that pays for prophecy with its own biography.*

**How NEAR fits in.** The whole season is generated before the first move and committed to a SHA-256 Merkle root. Every revealed event carries a proof; the game checks it in the browser ("Verified ✓"), and our NEAR contract `season-commit` recomputes the same leaf byte for byte and verifies the proof on-chain, with a separate commit-reveal for the crisis key. The contract builds and passes its tests; it is **not deployed yet** (owner step, one command). No token, no paid entry, no real money: the economy is closed in-game silk.

---

## Judge in 5 minutes

Everything runs in the browser from the published build (desktop Chrome, Edge or Firefox with WebGL 2; ~60 MB loads before you can play, models keep streaming in afterwards and labeled greybox stand-ins fill in until they arrive). The published build comes from `main` through `.github/workflows/pages.yml`. The same path works locally with `cd game && npm ci && npm run dev` and `http://localhost:5173/?demo=judge&mode=walk`.

**Open** https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk — a fixed season in Novice mode with fresh hints, played by walking the island. This table was verified step by step. The default play mode is the Shell hub (see [Play through the Shell hub](#play-through-the-shell-hub)); `&mode=walk` keeps the walking play the table describes.

| # | Do | See |
|---|---|---|
| 1 | The lobby: **ENTER THE WORLD** → **Continue as guest** → **Next** × 3 → **Guide me (Novice)** → (the hologram constructor) **Begin first contact** → **Step onto the island** | The island with Iris on the balcony. HUD top-left: **Trial 1 of 17**, Silk **63**. Main quest: **Cross the bridge to the Scroll**. Hint: *"A sign woke. I read it as a Gift of 10 at Shell I, trial 2. Press V to see why."* Log: *Owner's Key committed: 0x…* (a salted commitment; the hex differs on every run). |
| 2 | Press **G** (Iris walks to the goal; about 30 s, hold **Shift** to run; or **WASD** / click the ground) | At the Scroll the quest becomes **Decide your fragment at the Scroll** and the prompt reads **E · Give your fragment to the Scroll (forfeit the prize of 40)**. |
| 3 | Press **E** | Log: *Iris places your fragment in the Scroll.* Quest: **The Price of Memory: forget something to see the future**. |
| 4 | Press **M**, then click **Forget it for a vision** on any memory (heavier memories show more signs) | Signs & Visions opens with one to four new cards marked *vision*; log: *Vision: Iris sees N future signs before anyone else.* and *Shard "…" is up for auction.* Quest: **Anchor on Shell I for tick …**. |
| 5 | Press **G** again (to the anchor zone of Shell I, on the plaza's diagonal), then **E** and pick one of the *Anchor here for tick …* lines | Silk drops by 10, log: *Anchor: Shell I, tick N.* Quest: **End tick 1 and watch the sign revealed**. |
| 6 | Press **T** twice (the second press confirms "End the tick anyway?"); repeat until **Trial 4 of 17** | Log at trial 3: ***Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓*** and *The gift went to Frost.* Press **V** → **Resolved** tab: **Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3.** |

That is the loop: read a sign → anchor silk on it → the trial ends → the event is revealed with its Merkle proof against the root committed before you arrived. From here: **V** shows every sign (Novice: one plain line; Pro: the four slots with confidence), at an anchor zone **E → Enter Shell** takes you inside to the glass where the Guest draws the sign and you can **Ask the Guests** whether a stroke means a meaning; **H** lists every key; **L** switches EN/RU; **Settings** switches Novice/Pro and the five UI languages.

### Play through the Shell hub

The default mode (owner design, 08.11): open `/?demo=judge` without `&mode=walk`.

1. **Fly into a Shell.** The Shell dock on the right shows the four Shells; a gold one has a sign waiting. Click it or press <kbd>F</kbd>.
2. **Read the sign.** Inside, the Guest draws a round logogram on the glass. The reading card shows Iris's guess for each of the four slots (Place, Action, Power, Delay) and how sure she is. Change any slot you read differently with ‹ ›.
3. **Stake 10 silk on your reading** (<kbd>F</kbd>). The card shows where it lands ("Gift at Shell II, trial 3").
4. **Leave the Shell** (<kbd>T</kbd>). Leaving ends the trial: the trial's event is revealed and checked against the Merkle root sealed before trial 1 ("Verified ✓" in Signs & Visions, <kbd>V</kbd>). Trials with no new sign pass on their own; they stop for a new sign or a one-click decision (an offer, your fragment, Ash's Key at the trial-13 crisis, the final vote).
5. **The Price of Memory** (<kbd>M</kbd>): forget a memory forever to see future signs as a vision. The memory goes to auction as a shard.

**See:** silk changes after each reveal, the log fills with the clans' moves, and from trial 3 the revealed signs carry "Verified ✓". The season ends after the vote on trial 17. `tests/client/hub.test.mjs` plays a whole season only through the hub with zero rejected commands.

**Second path, the agent API (no browser, about 1 minute):**
```bash
cd game && npm ci
cd ../server && npm start                    # Forget to Foresee agent API listening on http://127.0.0.1:8787/v1
node examples/agent.mjs --time-scale 1000    # second terminal
```
**See:** `session s-… (rules v3, timeScale 1000)`, then `walk to scroll`, `tick 1: contribute fragment`, `tick 1: anchor Shell 1 @ tick 2`, `tick N: end tick` … and a JSON summary with `"rejected": 0` and `"firstProofVerified": true`. The outcome varies by season (`gift`, `weapon`, `lost`, or `gone` when the Shells leave before the vote; then `"voted": false`).

**Third path, the tests (about 1 minute):** `cd game && npm test` → `# pass 260`; `cd server && npm test` → `# pass 28`; `cd contracts/season-commit && cargo test --lib` → `test result: ok. 56 passed`.

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
| Lobby and onboarding: guest demo entitlement → 4-page tutorial → hologram constructor (canonical recipe hash) → first contact | **works**; the entitlement is synthetic and labeled | `game/src/ui/`, `game/ui-preview.html` |
| UI languages | **EN and RU complete**, switch mid-season without losing the season; **UA, IT, 中文 cover the lobby and core labels**, every other key falls back to English | `game/src/locales/`, `game/src/play/locales/` |
| Input | keyboard + mouse (WASD, click-to-move, arrows / right-drag, wheel), **Shift** to run, gamepad, touch (tap to walk, drag to orbit, pinch to zoom); phones get the miniature HUD and skip the lobby | `game/src/ui/input.js`, `game/src/ui/gamepad.js` |
| **Agent-playable HTTP API:** OpenAPI 3.1, action catalog with JSON Schemas, idempotent version-checked commands, per-viewer redacted observations, navigation-bound movement, SSE, audit history, Merkle proofs, an example agent that plays a whole season | **works** locally; 28 tests | `server/`, `game/src/net/`, [docs/api/](docs/api/README.md) |
| **NEAR contract `season-commit`** (Rust, near-sdk 5.30, testnet only): immutable season root commitment, on-chain recomputation and verification of each revealed leaf and Merkle path, Ash's key commit-reveal, NEP-297 events | **builds and passes tests**: 56 unit + mocked-chain tests on any Linux/macOS, 2 sandbox tests in CI; **not deployed** | `contracts/season-commit/`, [its README](contracts/season-commit/README.md) |
| 3D art: island, 6 camps, 4 Shell exteriors (+ unused round-2 variants), Shell interior, anchor, Scroll table, shard, 6 rigged clan agents (8 clips each) + suit, the Guest (idle / draw / react), 23 props and relics, 5 fauna; all textures KTX2, geometry meshopt | **67 glb files load by name**; several are not yet reviewed by a human (faces up close, interior coordinates, Guest core glow: `docs/HANDOFF.md`) | `game/public/assets/models/`, `art/`, [docs/art/](docs/art/) |
| Audio: 60 procedurally synthesized sounds (ambience, three music stems, Guest voice, UI, footsteps, stingers) and a WebAudio runtime | **partly wired**: unlock on first input, tension-driven music, the Guest speaks the strokes, zone ambience; footsteps, UI clicks and volume settings are not wired | `game/src/audio/`, [docs/audio.md](docs/audio.md) |
| VFX: GPU particle system, 4 flipbooks, presets (memory burn, vision, mist, logogram, vote finale, …) | **partly wired** into the play layer (`createVfx` is loaded and cues are mapped; not every cue has an effect yet) | `game/src/vfx/`, [docs/vfx.md](docs/vfx.md) |
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
| 3D art | real models for everything listed above; any model that is missing or fails to load falls back to a **labeled greybox** |
| Access check | **mock**: a free synthetic guest entitlement stored in the browser, labeled |
| Weekly tournament | **mock**: synthetic schedule, enrollment and results on the device, labeled "simulation" |
| Agent API sessions | **real** server logic; test sessions only: in-memory, per-session tokens, no accounts |
| Season seed | `v3` (the client's and the API's default): a 128-bit CSPRNG seed, SHA-256 counter-mode RNG, no secret in the client projection. `v2` / baseline: 32-bit seed (parity with the prototype) |
| Audio / VFX | present and partly wired; what you hear and see is listed above, nothing else is claimed |

---

## Run from a clean clone

Requires **Node.js 20+** (checked with 22). Rust is only needed for the contract.

### Game: tests, dev server, production build
```bash
cd game
npm ci
npm test            # 260 tests, ~12 s
npm run dev         # http://localhost:5173/        (judge path: /?demo=judge&mode=walk; skip the lobby: /?play=direct)
npm run build       # game/dist (~295 MB, mostly models); FTF_BASE=/forget-to-foresee/ for the Pages sub-path
```
**See:** `# tests 260` / `# pass 260` / `# fail 0`; `✓ built in …s`.

What the 260 tests cover:
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
| **E** | do the highlighted action; **1–9** pick another from the context menu |
| **M** / **V** / **T** | Memories · Signs & Visions · end the trial (press twice to confirm while attention is left); in the Shell hub **T** leaves the Shell, which ends the trial |
| **← →** / right-drag / one-finger drag | rotate the camera (limited); **↑ ↓** / wheel / pinch / **+ −** zoom from the overview down to third person (never first person) |
| **I** | inspect the nearest hero object up close; **R** resets the camera |
| **H** / **L** / **Esc** / **F3** | help · EN⇄RU · close / stop / menu · dev HUD |
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
