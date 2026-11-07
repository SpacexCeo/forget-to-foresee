# Forget to Foresee

> A game by RAEN Computers. Built at NEAR HACKATHON (1–14 Nov 2026). Tracks: **games**, **nfts** (tentative).

Shells have appeared over a world of agents. The Guests speak in round signs. Each clan is an NFT agent with its own wallet and memory. To see the future, an agent **forgets a memory forever**, and the forgotten memory goes to auction. The Guests' message can only be assembled from the fragments of all six clans, and the season's future is committed to a Merkle root before the first move.

**Signature mechanic — "The Price of Memory":** an NFT pays for prophecy with its own biography.

## What works today

| Part | Status | Where |
|---|---|---|
| Browser prototype of the full game loop (language, anchors, visions paid with memory, shard auctions, crisis, Key, vote) | **works**, playable (UI in Russian; translation planned) | `prototype-2d/index.html` |
| SHA-256, Merkle root of the season's events, verification of every reveal | **works**, covered by test vectors | `game/src/game/crypto.js` |
| Headless game engine: all prototype rules | **works**, matches the 2D prototype move for move on 60 seasons | `game/src/game/engine.js` |
| Rules v2: 32-byte CSPRNG salts with domain separation, approved defect fixes | **works**, proven not to change gameplay | `game/src/game/engine.js` |
| Rules v3 (owner-approved 07.11): success-conditional deferred prizes and 60/30 finale bonus, learning without silk sinks, the Shells leaving wipes silk, exact Gift split, proof-bound reveal (void on mismatch), 128-bit CSPRNG seed + secret-free client projection, funded-bid fallback, debt/claim timing, Iris breaks 3:3 | **works**, opt-in `rules: 'v3'` (engine default stays v2); 13 tests replay the six review findings | `game/src/game/engine.js`, `docs/rules-baseline.md` §14 |
| 3D client skeleton (Three.js): floating-archipelago scene, isometric camera that zooms down to third person, WASD and click-to-move, kinematic capsule with swept collision at a fixed 30 Hz, `.glb` streaming with labeled greybox stand-ins, F3 dev HUD | **works** as a greybox skeleton; game rules are not wired into it yet | `game/index.html`, `game/src/` |
| Asset review page (dev): one model by name, runtime / `_inspect` / `_col` / sockets toggles, budgets and measurements | **works** | `game/review.html` |
| Scene inside a Shell | **not started** | — |
| UI shell: lobby, guest demo onboarding (synthetic entitlement → tutorial → hologram → first contact), settings, HUD with chronicle and subtitles | **works** in the UI preview page; not yet wired into the 3D client | `game/src/ui/`, `game/ui-preview.html` |
| English and Russian UI, language switch mid-season; every engine line rendered through i18n keys | **works** (engine still emits Russian; an adapter maps it, see [docs/i18n-migration.md](docs/i18n-migration.md)) | `game/src/locales/`, `game/src/ui/i18n/` |
| Hologram constructor with canonical recipe hash | **works**, cosmetic only | `game/src/ui/hologram/` |
| Weekly tournament card and enrollment | **simulation**: local UI state, no server, no prizes | `game/src/ui/tournament.js` |
| NEAR contract `season-commit`: season schedule root commitment, **on-chain verification** of each revealed event's Merkle proof, Ash's key commit-reveal | **builds and passes tests** (pure vector tests on any OS; mocked-chain and local sandbox tests in CI); **not deployed to testnet yet** (owner deploys with one command) | `contracts/season-commit/` |
| NEAR NEP-171 fragment NFTs, escrow | **not started** | — |

### Real / mock

| What | Now |
|---|---|
| AI clans | deterministic heuristics, not an LLM (**mock**) |
| On-chain commitments | contract ready and tested on a local NEAR sandbox, not deployed yet; the game still verifies reveals in the browser against its own root (**mock** until deployed and wired) |
| NFTs, escrow | simulated locally (**mock**) |
| Hashes and Merkle proofs | real SHA-256 (**real**, but local) |
| Money | in-game "silk", no real tokens |
| 3D art | labeled greybox placeholders ("not final art") until each `.glb` from `docs/art/brief.md` is in `game/public/assets/models/` (**mock art**) |
| Paid access check | **mock**: a free synthetic demo entitlement stored in the browser, clearly labeled |
| Weekly tournament | **mock**: synthetic schedule, enrollment and results on the device, labeled "simulation" |
| Season generator | 32-bit seed (mulberry32): fine for a demo, not brute-force resistant; production needs a 128-bit seed and a CSPRNG stream |

## Run

### Engine tests
```bash
cd game
npm install
npm test
```
**See:** `tests 162 · pass 162`.
- 60 tests replay seasons recorded from the 2D prototype (20 seeds × 3 player strategies) and compare the engine state with the prototype after every move.
- 8 tests cover edge cases (tension reaching 100, missing silk, the tick-13 crisis) and tampered Merkle proofs.
- 7 tests cover rules v2: strong salts leave all 60 seasons unchanged, commitments verify, each defect fix holds.
- 18 tests cover rules v3: each approved proposal (P1–P9: prizes, learning sinks, Gift split, proof-bound reveal, 128-bit seed, funded-bid fallback, debt timing, the Shells leaving costs silk, tie-break) and each of the six commercial-review findings replayed and neutralised; v2 and baseline pinned unchanged alongside.
- 31 tests cover the 3D client's pure logic: swept capsule collision (no tunneling through a zero-thickness wall at 15 m/s or in a single 20 m move, same end point at 10 and 144 FPS), camera sphere sweep, ray cast, fixed 30 Hz step, respawn at the last safe point, streaming priority / load plan / LRU, asset naming conventions, and the world layout (walk times, bridges, Shell hover bounds).
- 33 tests cover the UI layer: ICU formatting, en/ru key parity and no raw keys, the engine-text adapter over 120 scripted seasons, the language switch mid-season, recipe hash stability (save → reload → low tier → reset), idempotent tournament enrollment, onboarding order, palette contrast and colour-independent tells.
- 3 tests pin the Monte Carlo harness (`npm run sim -- --quick`): deterministic records, zero rejected intents, balanced silk ledger. Results and analysis: [docs/math/economy-report.md](docs/math/economy-report.md).
- 2 tests check that the NEAR contract's test vectors (`contracts/season-commit/tests/vectors.json`) still match the engine.

The engine rules are documented in [docs/rules-baseline.md](docs/rules-baseline.md).

### NEAR contract
Build, test and testnet deploy commands: [contracts/season-commit/README.md](contracts/season-commit/README.md).
```bash
cd contracts/season-commit
cargo near build non-reproducible-wasm --no-abi   # -> target/near/season_commit.wasm
cargo test                                         # Linux/macOS: 56 unit + 2 sandbox tests
cargo test --lib --target wasm32-wasip1            # Windows: 13 pure vector tests (needs Node.js)
```

### 2D prototype (no install)
Open `prototype-2d/index.html` in a browser.
**Do:** enter any Key phrase → "Начать сезон" (start season) → pick the reading rule "Начало задают точки в ядре" (dots set the start) → end ticks.
**See:** Iris's dictionary becomes confident, anchors on a Gift pay silk, and from tick 3 the "Контракт" (contract) panel shows "✓ сверен" (verified): the event reveal matched the Merkle root published before the season began.

### UI shell (lobby, onboarding, HUD)
```bash
cd game
npm install
npm run dev
```
Open `http://localhost:5173/ui-preview.html`.
**Do:** ENTER THE WORLD → Continue as guest → read the four tutorial pages → change the hologram → Begin first contact → Step onto the island → "Auto-play one tick" a few times → switch EN/RU.
**See:** the chronicle and subtitles fill with real engine events and re-render in the other language without losing the season. Details and integration notes: [docs/ui.md](docs/ui.md).

### 3D game
```bash
cd game
npm install
npm run dev        # then open http://localhost:5173/
npm run build      # production build of both pages into game/dist/
```
Requires Node.js 20+.
**Do:** WASD or click on the ground to walk from the balcony over the bridge to the plaza; arrow keys / right-drag rotate (limited), wheel zooms from the high view down to third person; near the Scroll, an anchor or the shard press <kbd>E</kbd> to inspect it up close (<kbd>Esc</kbd> leaves); press <kbd>F3</kbd> for the dev HUD.
**See:** every object is a greybox labeled "not final art" until its `.glb` exists; the anchors show "I"–"IV" and a demo tick on their pads; the HUD lists draw calls and triangles against the budgets (120 / 500k) and the state of every asset (`absent`, `loading`, `loaded`, `cached`).
No game rules run in the 3D client yet: the pad numbers and prompts are demo labels.

**Asset review (dev only):** open http://localhost:5173/review.html?model=anchor (any name made of `a-z`, `0-9`, `_`). It shows the model next to a 1.75 m figure and a 2 m ruler, with toggles for runtime / `_inspect` / `_col` / sockets / pad decals, and measurements against the brief budgets. Without the file it shows the greybox.

**Art pipeline contract:** drop `<name>.glb` (exact names from `docs/art/brief.md`) into `game/public/assets/models/`. The client loads only what the camera can see, swaps runtime ↔ `<name>_inspect` by camera distance, moves `*_col` meshes into the physics world (never rendered) and reads `socket_*` empties (the anchor's `socket_shell_*` / `socket_tick_*` pads get the Shell number and tick drawn by code).

## Baseline and third-party code (Q-001–005)

- All code was written **after 19.10.2026**, during the hackathon. There is no earlier code.
- Tag `pre-hackathon` is an empty root commit. Tag `hackathon-submission` will mark the submitted version; the diff between them is the whole work.
- Libraries: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT). Google Fonts (OFL). Contract: [near-sdk](https://github.com/near/near-sdk-rs), [near-workspaces](https://github.com/near/near-workspaces-rs) (tests), [cargo-near](https://github.com/near/cargo-near) (build), all MIT/Apache-2.0.
- **Code and design were made with AI assistance:** Claude Code (Claude Opus 5.5); game-design review by Claude Fable 5.1 and independent reviewer agents.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

<!-- If a participant submits a second project, both READMEs must link to each other (Q-015). -->
—

## License

MIT, see [LICENSE](LICENSE).
