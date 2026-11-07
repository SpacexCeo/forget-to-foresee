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
| 3D game (Three.js): clan island + scene inside a Shell | **in progress** | `game/` |
| NEAR contract (commit-reveal, NEP-171 fragment NFTs, escrow) | **not started** | — |

### Real / mock

| What | Now |
|---|---|
| AI clans | deterministic heuristics, not an LLM (**mock**) |
| On-chain commitments, NFTs, escrow | simulated locally (**mock**) |
| Hashes and Merkle proofs | real SHA-256 (**real**, but local) |
| Money | in-game "silk", no real tokens |
| Season generator | 32-bit seed (mulberry32): fine for a demo, not brute-force resistant; production needs a 128-bit seed and a CSPRNG stream |

## Run

### Engine tests
```bash
cd game
npm install
npm test
```
**See:** `tests 75 · pass 75`.
- 60 tests replay seasons recorded from the 2D prototype (20 seeds × 3 player strategies) and compare the engine state with the prototype after every move.
- 8 tests cover edge cases (tension reaching 100, missing silk, the tick-13 crisis) and tampered Merkle proofs.
- 7 tests cover rules v2: strong salts leave all 60 seasons unchanged, commitments verify, each defect fix holds.

The engine rules are documented in [docs/rules-baseline.md](docs/rules-baseline.md).

### 2D prototype (no install)
Open `prototype-2d/index.html` in a browser.
**Do:** enter any Key phrase → "Начать сезон" (start season) → pick the reading rule "Начало задают точки в ядре" (dots set the start) → end ticks.
**See:** Iris's dictionary becomes confident, anchors on a Gift pay silk, and from tick 3 the "Контракт" (contract) panel shows "✓ сверен" (verified): the event reveal matched the Merkle root published before the season began.

### 3D game
```bash
cd game
npm install
npm run dev
```
Requires Node.js 20+.

## Baseline and third-party code (Q-001–005)

- All code was written **after 19.10.2026**, during the hackathon. There is no earlier code.
- Tag `pre-hackathon` is an empty root commit. Tag `hackathon-submission` will mark the submitted version; the diff between them is the whole work.
- Libraries: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT). Google Fonts (OFL).
- **Code and design were made with AI assistance:** Claude Code (Claude Opus 5.5); game-design review by Claude Fable 5.1 and independent reviewer agents.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

<!-- If a participant submits a second project, both READMEs must link to each other (Q-015). -->
—

## License

MIT, see [LICENSE](LICENSE).
