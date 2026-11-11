<!--
DRAFT for the owner / Claude. Not applied to the repo.
Before pasting into README.md, verify every line marked [VERIFY] and delete this comment.
Values below were measured on 11 Nov 2026 against commit 83465f6 unless marked [VERIFY].
  [VERIFY] 1. Test counts (game 728, server 31, relayer 7, season-commit 56, memory-shard 21, agent-card 21, guests 9) -> rerun on the final commit.
  [VERIFY] 2. dist size (431 MB) and clone size (2.3 GiB full / ~0.43 GB shallow) -> rerun after QW-8.
  [VERIFY] 3. Silk after trial 4 is observed as 82, not 72. Values after trial 3 are removed on purpose.
  [VERIFY] 4. Day 1 free mint row: change to "real on testnet" ONLY after the relayer is deployed and the live check passes (QW-2).
  [VERIFY] 5. Replay URL placeholder in the judge section (QW-3).
  [VERIFY] 6. Rust version in "Prerequisites" -> the version pinned by QW-7.
  [VERIFY] 7. AI-disclosure model names are copied from the current README; owner to confirm wording.
-->

# Forget to Foresee

A 3D strategy game where an AI clan agent, **Iris**, pays for prophecy with her own memories. Every prophecy of a season is written and **committed to NEAR testnet before the first move**, then revealed with a Merkle proof you can check yourself.

- **Play it now (no install, desktop browser with WebGL 2):** https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk
- **Built at NEAR HACKATHON** by Lambada_eth. Tracks: **Games** (primary) and **NFTs** (memory shards).
- **Licence:** MIT. **Source:** this repository. **AI use:** see [AI disclosure](#baseline-third-party-code-and-ai-disclosure).

## The problem

Games that advertise "AI agents" and "on-chain economies" often hide two lies: the AI secretly decides the outcome, and the chain is decoration. Forget to Foresee fixes the future before play begins and lets anyone check it afterwards. The agent's memories are the currency.

## What you do in the game (30 seconds)

Six clans read round signs of four slots (Place, Action, Power, Delay), stake silk on where a Gift will land, trade, trust, betray, and must assemble one message before trial 13. You guide Iris. To see the future early she can **forget a memory forever**; the forgotten memory is auctioned as a **shard** and, on the judge path, minted as a NEP-171 NFT bound to the sealed season.

## Verify in 60 seconds (no GPU, no browser)

```bash
git clone --depth 1 https://github.com/SpacexCeo/forget-to-foresee && cd forget-to-foresee
cd game && npm ci && npm test            # expect: tests 728, pass 728, fail 0  (~15 s)   [VERIFY]
cd ../server && npm test                  # expect: pass 31, fail 0                          [VERIFY]
cd ../relayer && npm test                 # expect: pass 7, fail 0                           [VERIFY]
```

Play a whole season through the agent HTTP API (second terminal after `npm start`):

```bash
cd server && npm start                                   # Forget to Foresee agent API listening on http://127.0.0.1:8787/v1
node examples/agent.mjs --time-scale 1000                # about 1 s
# expect a JSON summary with: "outcome": "gift" (outcome varies by season), "rejected": 0, "firstProofVerified": true
```

Check the on-chain commitment without our code (public testnet RPC, read-only):

```bash
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"ftf-seasons.testnet","method_name":"get_season","args_base64":"eyJzZWFzb25faWQiOiI3OTNmNmMwNWU4OTgzOWYyIn0="}}' \
 | python3 -c 'import sys,json;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
# expect: "leaf_count":15, "revealed_count":15, "ash_key_committed":true
```

Contracts (needs Rust stable ≥ 1.95 [VERIFY], `pkg-config`, OpenSSL headers):

```bash
cd contracts/season-commit && cargo test --lib     # expect: test result: ok. 56 passed
cd ../memory-shard && cargo test --lib             # expect: 21 passed
cd ../agent-card && cargo test --lib               # expect: 21 passed
cd ../guests && cargo test --lib                   # expect: 9 passed
```

One-file proof verifiers (import nothing from the game): `node tools/verify/verify.mjs proof.json` or `python3 tools/verify/verify.py proof.json` (copy `proof.json` from **Signs & Visions → What does this prove? → Copy proof**). Exit 0 and every line `✓` means the leaf and Merkle path match.

## Judge path (about 5 minutes)

Open `https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk` (fixed judge season `793f6c05e89839f2`, Novice mode).

| # | Do | See |
|---|---|---|
| 1 | Walk Iris up the main street stairs to the altar (WASD or click the ground; Shift runs). Press **E** at the altar. | HUD chip "Walk to the Tournament altar", then a short cover and the floating archipelago. Top-left: **Trial 1 of 17**, **Silk 63**. Quest: *Test Iris's guess at Shell I's pad*. |
| 2 | Press **G** (Iris walks to the pad of Shell I; about 30 s, hold **Shift** to run). At the pad press **E** (the highlighted option is *Anchor here for trial 3*). | Silk **53**. Quest: *End trial 1*. |
| 3 | Press **T** twice (the second press confirms). | **Trial 2 of 17**, silk **56**. Quest: *Watch trial 3 come true*. |
| 4 | Press **T** twice, then **T** twice again. | **Trial 4 of 17**. Quest: *The Price of Memory*. Press **V** for Signs & Visions: revealed signs show "Verified ✓" (the event matched the root committed before you arrived). |
| 5 | **While the HUD still reads Trial 4**, press **M** and click **Forget it for a vision** on *The Shells' Call on the night of arrival* (weight 2). Confirm with **Forget this memory**. | A dialog states what changes, what Iris gains and that it cannot be undone. Signs & Visions shows new cards marked *vision*. |
| 6 | Press **T** (twice each time) until trial 6. | A toast **Minted on NEAR testnet** and, in Memories, the card **Shard #7 · call**: token `793f6c05e89839f2-7`, owner `lambada_eth.testnet`, "Bound to the sealed season · leaf #3", **View on nearblocks**. |

If you forget a different memory, or after trial 4, the game shows an honest **Unminted shard preview** ("On-chain mint is for the published judge season only"): that is the designed behaviour for any playthrough that diverges from the recorded one.

Shortcut that does not depend on timing [VERIFY, QW-3]: open the **replay link** `<REPLAY-URL>`; it replays the recorded judge playthrough command by command and checks its Merkle root against `ftf-seasons.testnet`.

Controls: **W A S D** / click to walk, **Shift** run, **G** walk to the goal, **E** do the highlighted action, **T** end the trial, **M** memories, **V** signs and visions, **N** map, **H** help. Gamepad and touch are supported.

## Real vs mock

| What | Status | Evidence |
|---|---|---|
| Game rules, 17-trial season | **Real, local**: runs in your browser tab with a headless engine; nothing about silk, stakes or outcomes is on-chain | `game/src/game/engine.js`, 728 tests |
| Clan agents (5 AI clans) | **Mock AI, real rules**: deterministic heuristics with tempers, not an LLM; in-game silk, no NEAR accounts | `game/src/play/agents.js` |
| Season commitment | **Real**: SHA-256 Merkle root fixed before trial 1; each reveal is checked in the browser. For the judge season the root and all 15 leaves are **on NEAR testnet and verified by the contract** | `ftf-seasons.testnet`, `contracts/season-commit/` |
| Live (non-judge) seasons | Commitment is local only; not registered on-chain | README "What is proven" |
| Memory-shard NFTs | **Real on testnet** for the judge season: 3 NEP-171 tokens minted **by the coordinator script**, not by your session, and held by `lambada_eth.testnet`; the game reads them read-only | `ftf-shards.testnet`, `contracts/memory-shard/` |
| Shards in other playthroughs | **Preview only**, labelled "Unminted shard preview" | `game/src/ui/world-hud/shard-card-model.js` |
| Agent card NFT (Iris's end-of-season state) | **Real on testnet**, coordinator-minted, owned by the owner's account | `agents.ftf-coordinator.testnet`, `contracts/agent-card/` |
| Day 1 free mint (player-owned guest account + Elise NFT) | **Contracts deployed; the hosted page is not connected to its relayer at the time of writing** [VERIFY, QW-2]. Code complete: relayer signs one method, the contract creates `<name>-<id>.guests.ftf-coordinator.testnet` and mints to it | `contracts/guests/`, `relayer/`, `game/src/play/day1-mint.js` |
| Wallet sign-in, on-chain escrow, player-owned agent NFT, multiplayer | **Not built** | — |
| Agent HTTP API | **Real**: OpenAPI, idempotent commands, redacted observations, Merkle proofs, an example agent that plays a whole season; test sessions only (in memory, no accounts) | `server/`, [docs/api/](docs/api/README.md) |
| Foresight Exchange (practice drill) | **Real rules, practice silk**: three Echoes follow a sealed snapshot of ECB reference rates (via Frankfurter, attribution in README); no prizes, no real money, not on NEAR | `game/src/game/exchange.js` |
| Weekly tournament card | **UI simulation**, labelled "Simulation"; not part of the judged loop | `game/src/ui/tournament.js` |
| Townsfolk, hired agents, level, profile | **Local, scripted or learning agents, in-game currency only** | `game/src/game/town-economy.js` |
| Art, audio, VFX | Own procedural work (Blender scripts, synthesized audio); one exception: CMU mocap clips in a review build | `docs/art/manifest.md` |
| Money | In-game silk only. No token, no payment, testnet only | — |

## How NEAR is used

1. **Commit-reveal of the season** (`season-commit`): the contract stores the Merkle root, recomputes each revealed leaf byte for byte and verifies the proof on-chain; separate commit-reveal for the crisis key. The game reads the records back and shows "Verified on NEAR testnet ✓".
2. **NEP-171 memory shards** (`memory-shard`): token metadata carries the season id, the memory's kind and weight, the trial it was forgotten, the auction result and the Merkle leaf of the sign its vision opened; the on-chain ink-ring SVG is byte-identical to the game's own.
3. **NFT as account, Day 1** (`guests`, `character-nft`, `token-account`): a browser-made key becomes the full-access key of a guest sub-account that owns the player's Elise NFT; heroine tokens can have their own sub-account through which the owner acts (`act_as_token`). Status above.
4. **Invisible chain:** the normal game loop never shows a wallet, a seed phrase or a gas prompt.

Explicitly not proven: the browser runs the rules, so a modified client could change silk and outcomes; the commitment fixes what the Guests said, not what you did. See [docs/verify.md](docs/verify.md).

## Prerequisites

Node.js 20+ (CI uses 22; also passes on 24). Rust only for contracts. Disk: the full history is about 2.3 GiB; use `git clone --depth 1`. `npm run build` writes about 431 MB to `game/dist` (mostly compressed 3D models). First load of the judge page transfers roughly 120 MB over two minutes while the island streams in. On a machine without a GPU the page runs at about 5 fps but every step above still completes.

## Repository map

| Path | What |
|---|---|
| `game/` | Vite + Three.js client, headless engine, play layer, UI, tests |
| `server/` | agent HTTP API (`node:http`, no dependencies) |
| `relayer/` | signs `guests.create_guest` server-side so no key ships to the browser |
| `contracts/` | `season-commit`, `memory-shard`, `agent-card`, `guests`, `character-nft`, `token-account` (Rust, near-sdk 5.30) and deployment records |
| `tools/verify/` | one-file proof verifiers (Node and Python) |
| `prototype-2d/` | the frozen 2D reference prototype the engine is tested against |
| `art/`, `docs/` | procedural art sources; specs, decisions, API, QA, submission package |

## Baseline, third-party code and AI disclosure

- Written after 19 Oct 2026 inside the hackathon window. Tag `pre-hackathon` points to the empty root commit; the owner creates `hackathon-submission` at the freeze. Diff: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission (live once the tag is pushed).
- Libraries: three 0.170 (MIT), Vite 6 (MIT, dev), bundled fonts Libre Caslon Text, Old Standard TT, Source Sans 3, Atkinson Hyperlegible (SIL OFL 1.1), Cormorant Garamond and Noto Serif SC from Google Fonts for the lobby (OFL), near-sdk 5.30 and near-workspaces 0.24 (MIT/Apache-2.0). Full list and asset licences: [docs/art/manifest.md](docs/art/manifest.md). Motion-capture clips in `game/public/assets/anim/` (review build, `?anim=mocap`) are retargeted from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu; NSF EIA-0196217).
- **AI-generated code and content.** The code, documentation, procedural 3D models, sounds and most texts were produced with AI assistance under the owner's direction: Claude Code (multi-agent sessions) wrote the engine, client, server, contracts, art pipeline and docs; Codex worked on the UI polish branch (`codex/premium-ui`); independent reviewer agents did the game-design and economy reviews (`docs/math/`). The owner designed the game, made every product decision (`docs/decisions.md`), supplied the lobby art and HUD mockups, and reviewed the results. [VERIFY model names against the current README]
- The theme is inspired by the film *Arrival* (2016); no names, characters or visuals from the film are used.

## Related projects

None. Forget to Foresee is the only NEAR Hackathon submission of its developer; RAEN is the company name of the same team, not a separate project.

## Further reading

[docs/status.md](docs/status.md) (full feature table — move the old "What works today" here, QW-1) · [docs/near.md](docs/near.md) (account ids and transaction hashes) · [docs/verify.md](docs/verify.md) · [docs/api/README.md](docs/api/README.md) · [docs/accessibility.md](docs/accessibility.md) · [docs/decisions.md](docs/decisions.md).

## License

MIT, see [LICENSE](LICENSE).
