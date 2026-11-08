# Forget to Foresee

> A game by RAEN Computers. Built at NEAR HACKATHON (1–14 Nov 2026). Tracks: **games**, **nfts** (tentative).

Shells have appeared over a world of agents. The Guests speak in round signs. Each clan is an NFT agent with its own wallet and memory. To see the future, an agent **forgets a memory forever**, and the forgotten memory goes to auction. The Guests' message can only be assembled from the fragments of all six clans, and the season's future is committed to a Merkle root before the first move.

**Play in the browser:** https://spacexceo.github.io/forget-to-foresee/ · judges' 3-minute path: https://spacexceo.github.io/forget-to-foresee/?demo=judge (local demo session: the rules run in your browser; published by `.github/workflows/pages.yml` on every push to `main`; first load ~250 MB of models).

**Signature mechanic — "The Price of Memory":** an NFT pays for prophecy with its own biography.

## How to play (3 minutes)

Open the judge path above (or `npm run dev` in `game/` and `http://localhost:5173/?demo=judge`).

1. **Fly into a Shell.** The Shell dock on the right shows the four Shells; a gold one has a sign waiting. Click it or press <kbd>F</kbd>.
2. **Read the sign.** Inside, the Guest draws a round logogram on the glass. The reading card shows Iris's guess for each of the four slots (Place, Action, Power, Delay) and how sure she is. Change any slot you read differently with ‹ ›.
3. **Stake 10 silk on your reading** (<kbd>F</kbd>). The card shows where it lands ("Gift at Shell II, trial 3").
4. **Leave the Shell** (<kbd>T</kbd>). Leaving ends the trial: the trial's event is revealed and checked against the Merkle root sealed before trial 1 ("Verified ✓" in Signs & Visions, <kbd>V</kbd>). Trials with no new sign pass on their own; they stop for a new sign or a one-click decision (an offer, your fragment, Ash's Key at the trial-13 crisis, the final vote).
5. **The Price of Memory** (<kbd>M</kbd>): forget a memory forever to see future signs as a vision. The memory goes to auction as a shard.

**See:** silk changes after each reveal, the log fills with the clans' moves, and from trial 3 the revealed signs carry "Verified ✓". The season ends after the vote on trial 17. `?mode=walk` plays the same season by walking the island instead of the hub; `?hud=old` shows the earlier greybox overlay.

## What works today

| Part | Status | Where |
|---|---|---|
| Browser 3D game (Three.js): floating archipelago, Shell interior with the Guests drawing logograms on the glass, rigged clan agents, 360° camera that zooms to third person, WASD / click / touch / gamepad, swept capsule collision at 30 Hz, `.glb` streaming with greybox stand-ins | **works**; a full 17-trial season is played in it (local demo session: the rules run in the browser through the same room code as the agent API) | `game/index.html`, `game/src/` |
| Shell hub (owner design 08.11): fly into a Shell, read the sign with Iris's pre-filled reading, change slots, stake 10 silk, leaving ends the trial, automatic trials, one-click decision cards | **works** (default; `?mode=walk` for the walking play) | `game/src/play/hub.js`, `game/src/play/hub-ui.js` |
| World HUD to the owner's mockups (desktop and phone), Novice and Pro modes, Novice hints from A to Z | **works** | `game/src/ui/world-hud/`, `game/src/play/world-hud.js`, `game/src/play/hints.js` |
| UI languages: English (primary), Ukrainian, Russian, Italian, Chinese; switch mid-season (<kbd>L</kbd> or Settings) | **works**; all five are full translations | `game/src/locales/`, `game/src/play/locales/` |
| Lobby, guest-demo onboarding, settings, hologram constructor (cosmetic) | **works** | `game/src/ui/` |
| Headless game engine: all rules of the 2D prototype | **works**, matches `prototype-2d/` move for move on 60 recorded seasons | `game/src/game/engine.js` |
| Rules v3 (owner-approved 07.11): success-conditional prizes, exact Gift split, proof-bound reveal, 128-bit CSPRNG seed with a secret-free client projection, and the other approved fixes | **works**; the game and the agent API run v3 (the engine's own default stays v2 for the parity tests) | `game/src/game/engine.js`, `docs/rules-baseline.md` §14 |
| SHA-256 Merkle root of the season's events, verification of every reveal | **works**, covered by test vectors | `game/src/game/crypto.js` |
| Agent-playable API: every player action over HTTP (OpenAPI 3.1, idempotent version-checked commands, per-viewer observations, SSE, Merkle proofs) and an example agent that plays a full season | **works** locally (`npm start` in `server/`); the browser game uses the same room code in-process, not over HTTP | `server/`, `game/src/net/`, [docs/api/](docs/api/README.md) |
| NEAR contract `season-commit`: season root commitment, **on-chain verification** of each revealed event's Merkle proof, Ash's key commit-reveal | **builds and passes tests** (unit, mocked-chain and local sandbox in CI); **not deployed to testnet yet** (the owner deploys with one command) | `contracts/season-commit/` |
| Audio: 60 procedurally synthesized sounds, ambience per zone, the Guest "speaks" the strokes it draws | **works** in the 3D client (WebAudio, starts on the first key or tap); the mix is not yet tuned by ear | `game/src/audio/`, `docs/audio.md` |
| VFX: GPU particles and flipbooks on room events (anchors, reveals, memories, crisis) | **works** in the 3D client | `game/src/vfx/`, `docs/vfx.md` |
| 3D art: island, six camps, four Shells, Shell interior, anchor, Scroll table, shard, six rigged agents, the Guest, props, fauna (procedural Blender sources, KTX2 + meshopt, phone variants) | **models in the game**; owner review pending; agent faces are being rebuilt (see `docs/HANDOFF.md`) | `game/public/assets/models/`, `art/` |
| 2D prototype of the full loop | **works**, frozen parity reference (UI in Russian) | `prototype-2d/index.html` |
| Weekly tournament card | **simulation**: local UI state, no server, no prizes | `game/src/ui/tournament.js` |
| NEP-171 agent / fragment NFTs, escrow on chain | **not built** | — |

### Real / mock

| What | Now |
|---|---|
| AI clans | deterministic heuristics, not an LLM (**mock** of autonomous agents) |
| Iris's autopilot in the hub | **real** client logic, public and small: accepts free gifts, lets word sales expire, asks the player for everything else; it sends ordinary room commands |
| On-chain commitments | contract ready and tested on a local NEAR sandbox, not deployed; the game verifies reveals in the browser against its own root (**mock** until deployed and wired) |
| NFTs, escrow | simulated in the engine (**mock**) |
| Hashes and Merkle proofs | real SHA-256 (**real**, local) |
| Season generator | rules v3: 128-bit CSPRNG seed (**real**); legacy modes keep the prototype's 32-bit seed for parity |
| Money | in-game silk only; no real tokens, no payments |
| Paid access check | **mock**: a free synthetic demo entitlement stored in the browser, clearly labeled |
| Weekly tournament | **mock**: synthetic schedule and results on the device, labeled "simulation" |
| Agent API sessions | **real** server logic, test sessions only: in-memory, per-session tokens, no accounts or money |

## Run

Requires Node.js 20+.

### 3D game
```bash
cd game
npm install
npm run dev        # then open http://localhost:5173/?demo=judge
```
**Do / see:** the steps in "How to play" above. `npm run build` writes the production build to `game/dist/`.
Controls: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or click to walk (<kbd>Shift</kbd>, a double click or, on phones, a far tap runs), <kbd>F</kbd> fly / stake, <kbd>T</kbd> leave the Shell or let time pass, <kbd>M</kbd> memories, <kbd>V</kbd> signs, <kbd>L</kbd> language, <kbd>H</kbd> help, <kbd>F3</kbd> dev HUD.
Other pages: `/hud-preview.html` (world HUD, `?live=1` for a real season), `/ui-preview.html` (UI shell), `/review.html?model=anchor` (asset review, dev).

### Tests
```bash
cd game
npm install
npm test
```
**See:** `tests 266 · pass 266`:
- 60 seasons replayed from the 2D prototype (20 seeds × 3 strategies), compared after every move; edge cases and tampered proofs;
- rules v2 and v3: every approved proposal and the six commercial-review findings replayed and neutralised, legacy modes pinned unchanged;
- the play layer: command bus, walk replay, onboarding end to end, a full season through the play session, and the Shell hub (a whole season played only through the hub with zero rejected commands);
- the 3D client's pure logic (collision, camera, streaming, layout, input), asset budgets (KTX2 only, phone variants);
- UI: ICU formatting, key parity across five languages, the engine-text adapter, the language switch mid-season, the world HUD packages, Novice hints, accessibility checks;
- the Monte Carlo harness and the NEAR contract's test vectors.

### Agent API
```bash
cd game && npm install
cd ../server && npm start          # API on http://127.0.0.1:8787/v1
node examples/agent.mjs --time-scale 1000   # second terminal
npm test
```
**See:** the agent walks, contributes, anchors and votes, then prints the season outcome; `tests 28 · pass 28`. Details: [docs/api/README.md](docs/api/README.md).

### NEAR contract
Build, test and testnet deploy commands: [contracts/season-commit/README.md](contracts/season-commit/README.md).
```bash
cd contracts/season-commit
cargo near build non-reproducible-wasm --no-abi   # -> target/near/season_commit.wasm
cargo test                                         # Linux/macOS: unit, mocked-chain and sandbox tests
cargo test --lib --target wasm32-wasip1            # Windows: pure vector tests (needs Node.js)
```

### Economy simulation
```bash
cd game && npm run sim -- --quick
```
Results and analysis: [docs/math/economy-report.md](docs/math/economy-report.md).

### 2D prototype (no install)
Open `prototype-2d/index.html` in a browser (Russian UI, the frozen rules reference).

## Baseline and third-party code (Q-001–005)

- All code was written **after 19.10.2026**, during the hackathon. There is no earlier code.
- Tag `pre-hackathon` is an empty root commit. Tag `hackathon-submission` will mark the submitted version; the diff between them is the whole work.
- Libraries: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT). Fonts bundled through Fontsource (no CDN): Libre Caslon Text, Old Standard TT, Source Sans 3 (all SIL OFL). Contract: [near-sdk](https://github.com/near/near-sdk-rs), [near-workspaces](https://github.com/near/near-workspaces-rs) (tests), [cargo-near](https://github.com/near/cargo-near) (build), all MIT/Apache-2.0.
- **Code and design were made with AI assistance:** Claude Code (Claude Opus 5.5); OpenAI Codex (controls and premium UI branch `codex/premium-ui`); game-design review by Claude Fable 5.1 and independent reviewer agents. Translations (uk, it, zh) were AI-generated and are not yet reviewed by native speakers.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

<!-- If a participant submits a second project, both READMEs must link to each other (Q-015). -->
—

## License

MIT, see [LICENSE](LICENSE).
