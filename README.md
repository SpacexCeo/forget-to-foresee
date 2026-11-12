# Forget to Foresee

A 3D strategy game where an AI clan agent, **Iris**, pays for prophecy with her own memories. Every prophecy of a season is written and **committed to NEAR testnet before the first move**, then revealed with a Merkle proof you can check yourself.

- **Play it now (no install, desktop browser with WebGL 2):** https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk
- **Built at NEAR HACKATHON** (1–14 Nov 2026) by Lambada_eth. Tracks: **Games** (primary) and **NFTs** (memory shards); see [Tracks](#tracks).
- **Licence:** MIT. **AI use:** see [Baseline, third-party code and AI disclosure](#baseline-third-party-code-and-ai-disclosure).
- **Numbers** (test counts, build size) are generated, not typed: [docs/STATS.md](docs/STATS.md) (`node scripts/stats.mjs --write`).

## The problem

Games that advertise "AI agents" and "on-chain economies" often hide two lies: the AI secretly decides the outcome, and the chain is decoration. Forget to Foresee fixes the future before play begins and lets anyone check it afterwards. The agent's memories are the currency.

## What you do in the game (30 seconds)

Six clans read round signs of four slots (Place, Action, Power, Delay), stake silk on where a Gift will land, trade, trust, betray, and must assemble one message before trial 13. You guide Iris; the other five clans are computer-run agents. To see the future early she can **forget a memory forever**; the forgotten memory is auctioned as a **shard** and, on the judge path, is a NEP-171 NFT bound to the sealed season.

<a id="no-gpu"></a>
## Verify in 60 seconds (no GPU, no browser)

```bash
git clone --depth 1 https://github.com/SpacexCeo/forget-to-foresee && cd forget-to-foresee
bash scripts/verify-all.sh --skip-rust   # game, server, relayer and presence tests; prints one table, exit 0 when all pass
bash scripts/verify-all.sh               # the same plus the Rust contracts (Rust, pkg-config, OpenSSL headers)
```

Each line of the table is one suite; the counts it prints are the ones recorded in [docs/STATS.md](docs/STATS.md). Node.js 20+ is enough for `--skip-rust`; missing prerequisites are reported in one line each.

<a id="agent-api"></a>
Play a whole season through the agent HTTP API (no dependencies):

```bash
cd server && npm start                         # "Forget to Foresee agent API listening on http://127.0.0.1:8787/v1"
node examples/agent.mjs --time-scale 1000      # second terminal, about 1 s
# expect a JSON summary with "tick": 17, "rejected": 0, "firstProofVerified": true ("outcome" varies by season)
```

Check the on-chain commitment without our code (public testnet RPC, read-only):

```bash
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"ftf-seasons.testnet","method_name":"get_season","args_base64":"eyJzZWFzb25faWQiOiI3OTNmNmMwNWU4OTgzOWYyIn0="}}' \
 | python3 -c 'import sys,json;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
# expect: "leaf_count":15, "revealed_count":15, "ash_key_committed":true
```

Check a NEAR AI Cloud TEE attestation live (Intel TDX quote, event log, GPU evidence; if the endpoint asks for an API key, set `NEARAI_API_KEY`, the tool sends it):

```bash
node tools/verify-tee/verify.mjs --model Qwen/Qwen3-VL-30B-A3B-Instruct   # every line "ok", last line PASS
```

One-file proof verifiers (they import nothing from the game): `node tools/verify/verify.mjs proof.json` or `python3 tools/verify/verify.py proof.json` (copy `proof.json` from **Signs & Visions → What does this prove? → Copy proof**). Exit 0 and every line `✓` means the leaf and the Merkle path match. Details: [docs/verify.md](docs/verify.md).

## Judge path (about 5 minutes)

Open https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk (fixed judge season `793f6c05e89839f2`, Novice mode). The game starts in the town.

| # | Do | See |
|---|---|---|
| 1 | Walk Iris up the main street stairs to the altar (WASD or click the ground; Shift runs). Press **E** at the altar. | HUD chip "Walk to the Tournament altar", then a short cover and the floating archipelago. Top left: **Trial 1 of 17**, **Silk 63**. Quest: *Test Iris’s guess at Shell I’s pad*. |
| 2 | Press **G** (Iris walks to the pad of Shell I; hold **Shift** to run). When she stops at the pad press **E** once (the highlighted option is *Anchor here for trial 3*). | Silk **53**. Quest: *End trial 1*. |
| 3 | Press **T** twice (the second press confirms). | **Trial 2 of 17**, silk **56**. Quest: *Watch trial 3 come true*. |
| 4 | Press **T** twice, then **T** twice again. | **Trial 4 of 17**. Quest: *The Price of Memory*. Press **V** for Signs & Visions: revealed signs show "Verified ✓" (the event matched the root committed before you arrived). |
| 5 | **While the HUD still reads Trial 4**, press **M** and click **Forget it for a vision** on *The Shells' Call on the night of arrival* (weight 2). Confirm with **Forget this memory**. | A dialog states what changes, what Iris gains and that it cannot be undone. Signs & Visions shows new cards marked *vision*. |
| 6 | Press **T** (twice each time) until trial 6. | A toast **Minted on NEAR testnet** and, in Memories, the card **Shard #7 · call**: token `793f6c05e89839f2-7`, owner `lambada_eth.testnet`, "Bound to the sealed season · leaf #3", **View on nearblocks**. |

If you forget a different memory, or later than trial 4, the game shows an honest **Unminted shard preview** for Iris's shard: any playthrough that diverges from the recorded one gets no token. Two shortcuts that do not depend on timing:

- On `?demo=judge`, Memories has a button **Open the judge playthrough's on-chain shard (#7)**: it reads `ftf-shards.testnet` and shows the real token card, labelled "From the recorded judge playthrough: minted by the coordinator, not by your session".
- **The NFT does something (holder access):** open **Profile** (top right) → **NFTs** → *Holder access* → **Try the judge account**. The page reads `nft_tokens_for_owner` on `ftf-shards.testnet`, `agents.ftf-coordinator.testnet` and `heroine.ftf-coordinator.testnet` for `lambada_eth.testnet`, lists the tokens with nearblocks links and unlocks "Unlocked: Shard keeper"; the **Profile** tab then shows the *Shard keeper* title and an ink-ring frame on the portrait. Any testnet account id works; an account that holds nothing unlocks nothing. Read-only and cosmetic: no wallet, no signature, kept in this browser.
- The **replay link** of the recorded judge playthrough replays it command by command in your browser and checks its Merkle root against `ftf-seasons.testnet`: [open the judge replay](https://spacexceo.github.io/forget-to-foresee/?replay=r1.eyJzIjoiY2MxNjFkMzA4ZmFhNjc1MzlhZjQ0MjA1YjU2YjZkNGYiLCJyIjoidjMiLCJjIjpbWyJzdGFydF9zZWFzb24iLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbInNhY3JpZmljZV9tZW1vcnkiLHsibWVtb3J5SWQiOjJ9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJjYXN0X3ZvdGUiLHsiYWNjZXB0Ijp0cnVlfV1dfQ) (generated by `node game/scripts/judge-replay-link.mjs`).

On a machine without a GPU (software rendering, about 5 fps) the walks take a few minutes and keys pressed while Iris is still walking or a trial is still ending do nothing; wait for her to stop and for the trial counter to change.

Controls: **W A S D** / click to walk, **Shift** run, **G** walk to the goal, **E** do the highlighted action, **T** end the trial, **M** memories, **V** signs and visions, **N** map, **H** help. Outside the town walls **Q** and **V** cast Iris's two skills. Gamepad and touch are supported.

## Real vs mock

| What | Status | Evidence |
|---|---|---|
| Game rules, 17-trial season | **Real, local**: runs in your browser tab with a headless engine; nothing about silk, stakes or outcomes is on-chain | `game/src/game/engine.js` |
| Clan agents (5 computer clans) | **Scripted, real rules**: deterministic heuristics with tempers, not an LLM; in-game silk only | `game/src/play/` |
| Season commitment | **Real**: SHA-256 Merkle root fixed before trial 1, each reveal checked in the browser; for the judge season the root and all 15 leaves are on NEAR testnet and verified by the contract | `ftf-seasons.testnet`, `contracts/season-commit/` |
| Live (non-judge) seasons | Commitment is local only; not registered on-chain | [docs/verify.md](docs/verify.md) |
| Memory-shard NFTs | **Real on testnet** for the judge season: 3 NEP-171 tokens minted by the coordinator script, not by your session, held by `lambada_eth.testnet`; the game reads them | `ftf-shards.testnet`, `contracts/memory-shard/` |
| Holder access (NFT-gated perk) | **Real, read-only**: the game reads which Forget to Foresee NFTs any testnet account holds and unlocks a cosmetic title and portrait frame in this browser; not a wallet login, nothing signed or written | `game/src/net/holder.js`, `game/src/play/holder-panel.js` |
| Shards in other playthroughs | **Preview only**, labelled "Unminted shard preview" | `game/src/ui/world-hud/shard-card-model.js` |
| Agent card NFT (Iris's end-of-season state) | **Real on testnet**, coordinator-minted, owned by the owner's account | `agents.ftf-coordinator.testnet`, `contracts/agent-card/` |
| Day 1 free mint (player-owned guest account + Elise NFT) | **Contracts deployed; the relayer is live** (a test guest was created and minted through it on 11 Nov). The hosted page calls it (its public URL is in `game/src/net/day1-deployment.js`; a `VITE_FTF_RELAYER_URL` build variable overrides it); limits: 200 new guests a day, 0.05 testnet NEAR each; checked live end to end again on 12 Nov | `contracts/guests/`, `relayer/`, `game/src/play/day1-mint.js` |
| Agent track records (a hired agent's trades and PnL, re-computable by anyone) | **Deployed on testnet** (`ledger.ftf-coordinator.testnet`; checked end to end on 11 Nov with a test guest account: the game's recording code signed the record and re-verified it, and `node tools/verify-agent/verify.mjs ledgercheck-5.guests.ftf-coordinator.testnet baker 1` prints PASS): the player's guest account records a hire on the `agent-ledger` contract; the page shows "Verified" only after it re-computes the record read back from the chain; `node tools/verify-agent/verify.mjs` does the same | `contracts/agent-ledger/`, `game/src/game/track-record.js`, [docs/api/verify-agent.md](docs/api/verify-agent.md) |
| TEE agents (townsfolk speech, trade advisor) | **Built, not live**: the client, the relayer routes and the verifier are tested with recorded fixtures, but the deployed relayer does not have the `/api/agent/*` routes yet (404, it waits for the redeploy in [docs/handoff/relayer-tee-deploy.md](docs/handoff/relayer-tee-deploy.md)) and the NEAR AI Cloud account has no credits (chat answers 402). The game uses its scripted lines. What does run live today: `node tools/verify-tee/verify.mjs --model Qwen/Qwen3-VL-30B-A3B-Instruct` checks the TEE attestation (Intel TDX chain, report data, RTMR replay, GPU evidence and vendor verdict) and prints PASS; the ledger's `record_tee_decision` checks a signature on chain (tested with a fixture signature, labelled as such). | [docs/tee.md](docs/tee.md) |
| Loot chests from monsters | Contract live on testnet (`chests.ftf-coordinator.testnet`), deck of 10,000 with exactly 1,000 NFT committed on chain; the season seed and openings wait for the TEE seed and the relayer redeploy. In the game, chests drop, can be picked up and opened in the UI; until the relayer's `/api/chest/open` is deployed (404 today) a chest stays sealed and says so. `node tools/verify-chest/verify.mjs` checks the deck and every opening: today the three deck lines print `ok` and it ends `FAIL` on "season seed is fixed" until that seed is set. | [docs/chests.md](docs/chests.md) |
| Wheel grand prize (Sheriffchenko skin NFT) | **Contract live, mint pending**: `skins.ftf-coordinator.testnet` (cap 100, one per account, 0 minted). The claim route re-checks the roll server-side; it is not on the deployed relayer yet (404) and its minter key is not set, so a winning spin shows "mint pending" in the game. Known limit: the roll is public, so a player can pick a winning spin within the allowed count (documented). | [docs/wheel-skin.md](docs/wheel-skin.md), `contracts/skin-nft/` |
| Shared town and chat (rooms of 15) | **Built, dormant**: `presence/` (WebSocket rooms, server-side limits) and the client are tested, and a two-browser run on a local server showed the other player and the chat; the service is not deployed, so the hosted town stays single-player and shows no chat. `?bots=N` shows walkers labelled "AI" that run in the browser (no network). | [docs/multiplayer.md](docs/multiplayer.md) |
| Town economy (scripted traders, ~22,000 testnet transactions a day; wool/silk pool; pledges to the town works as deeds) | **Built, not live**: the `ftf-town` contract (`contracts/town`, 36 unit tests: conservation, AMM, deed lifecycle and transfer, caps, negative wash-trading EV), the shared integer rules with test vectors (Rust ↔ JS), the relayer's trader loop (dry run by default) and the Town Pulse page (`/pulse.html`) are tested. The contract and the 20 trader accounts are **not deployed**, so the Pulse page says so. Once live: **scripted townsfolk making automated trades on NEAR testnet**, rules not an LLM; wool and silk are testnet game resources with no value outside the game. | [docs/town-economy.md](docs/town-economy.md), [docs/security-town.md](docs/security-town.md) |
| Combat outside the town walls | **Real, local**: 4 monster types, strike / dash / casts, health; in-game only, nothing on-chain | `game/src/play/mobs.js` |
| Photo mode (**P**), townsfolk barks, narrator subtitles when films are off, shard history timeline on the card | **Real**, local presentation | `game/src/render/photo-mode.js`, `game/src/scenes/barks.js`, `game/src/play/narrator.js`, `game/src/ui/world-hud/shard-card.js` |
| Dragon companion NFT | **Client real; one dragon minted on testnet** to a test guest's Elise token account (an agentic NFT that owns an NFT): `nacre-cy-8` on `companions.ftf-coordinator.testnet`, owner `elise-cy-8.heroine.ftf-coordinator.testnet`; visible in that guest's browser only | `game/src/net/companions.js` |
| Wallet sign-in, on-chain escrow, player-owned agent NFT | **Not built** | — |
| Agent HTTP API | **Real**: OpenAPI, idempotent commands, redacted observations, Merkle proofs, an example agent that plays a whole season; in-memory test sessions, no accounts | `server/`, [docs/api/](docs/api/README.md) |
| Foresight Exchange (practice drill) | **Real rules, practice silk**: three Echoes follow a sealed snapshot of public reference rates; no prizes, no real money, not on NEAR | `game/src/game/exchange.js` |
| Weekly tournament card | **UI simulation**, labelled "Simulation"; not part of the judged loop | [docs/status.md](docs/status.md) |
| Townsfolk, hired agents, level, profile | **Local**: scripted or learning agents, in-game town silk only | `game/src/game/town-economy.js` |
| Art, audio, VFX | Own procedural work; exceptions: CMU motion-capture clips in a review build and the licensed music (Scott Buckley, Kevin MacLeod, CC-BY 4.0) | [docs/art/manifest.md](docs/art/manifest.md) |
| Money | In-game silk only. No token sale, no payment, testnet only | — |

The full feature table and every detail of the old README: [docs/status.md](docs/status.md).

## How NEAR is used

1. **Commit-reveal of the season** (`season-commit`): the contract stores the Merkle root, recomputes each revealed leaf byte for byte and verifies the proof on-chain; a separate commit-reveal covers the crisis key. The game reads the records back and shows "Verified on NEAR testnet ✓".
2. **NEP-171 memory shards** (`memory-shard`): token metadata carries the season id, the memory's kind and weight, the trial it was forgotten, the auction result and the Merkle leaf of the sign its vision opened; the on-chain ink-ring SVG is byte-identical to the game's own.
3. **NFT as account, Day 1** (`guests`, `character-nft`, `token-account`): a browser-made key becomes the full-access key of a guest sub-account that owns the player's Elise NFT; heroine tokens can have their own sub-account through which the owner acts (`act_as_token`). Status in the table above.
4. **Invisible chain:** the normal game loop never shows a wallet, a seed phrase or a gas prompt.

Explicitly not proven: the browser runs the rules, so a modified client could change silk and outcomes; the commitment fixes what the Guests said, not what you did. See [docs/verify.md](docs/verify.md).

## Prerequisites

- Node.js 20+ (`.nvmrc`: 22). Rust only for the contracts: the toolchain is pinned in `contracts/*/rust-toolchain.toml`; `cargo test --lib` also needs `pkg-config` and OpenSSL headers (`apt-get install pkg-config libssl-dev`).
- Use `git clone --depth 1`: the full history is large because of videos.
- `cd game && npm run build` writes the production build (size in [docs/STATS.md](docs/STATS.md), mostly compressed 3D models). The first load of the judge page streams a large part of it; on a machine without a GPU the page runs at a low frame rate and says so, and every step above still completes. Without WebGL 2 the page explains it and links the paths that need no GPU.

## Repository map

| Path | What |
|---|---|
| `game/` | Vite + Three.js client, headless engine, play layer, UI, tests |
| `server/` | agent HTTP API (`node:http`, no dependencies) |
| `relayer/` | signs `guests.create_guest` server-side so no key ships to the browser; TEE agent, chest and wheel routes (`relayer/README.md`) |
| `presence/` | the shared town's WebSocket service (rooms of 15, chat), no dependencies |
| `contracts/` | `season-commit`, `memory-shard`, `agent-card`, `guests`, `character-nft`, `token-account`, `agent-ledger`, `loot-chest`, `skin-nft` (Rust, near-sdk 5.30) and deployment records |
| `scripts/` | `verify-all.sh` (every suite, one table) and `stats.mjs` (writes docs/STATS.md) |
| `tools/verify/` | one-file proof verifiers (Node and Python) |
| `tools/verify-tee/`, `tools/verify-chest/`, `tools/verify-agent/` | independent checks of TEE answers, chest openings and agent track records |
| `prototype-2d/` | the frozen 2D reference prototype the engine is tested against |
| `art/`, `docs/` | procedural art sources; specs, decisions, API, QA, submission package |

## Tracks

- **games** ("Games With Real Economies"), the primary track: the economy *is* the game loop. Six clans (yours and five computer-run agents) trade words, silk, promises and memories; anchors pay out from a Gift split exactly between those who staked; forgotten memories are sold at auction; defection raises world tension until the Shells leave and everyone loses. The season's events are sealed before the first move, so neither we nor the clan agents can change what the Guests said once the root is shown; the rules themselves run locally in the browser ([How NEAR is used](#how-near-is-used)).
- **nfts** ("NFTs That Do Something"), claimed for the memory shards only: a forgotten memory becomes a memory shard, a NEP-171 NFT whose metadata carries its biography (the season, the memory's kind and weight, the trial it was forgotten, the auction result), the season's schedule root and, when its vision opened a sign (Iris's shard 7), that sign's Merkle leaf, so the token is bound to the sealed season. The contract `memory-shard` runs on testnet as `ftf-shards.testnet` with the judge playthrough's 3 shards minted by the coordinator script; the on-chain ink-ring SVG is byte-identical to the game's. In the game, the judge path shows the minted shards as NFT cards in the Memories panel (on-chain SVG, token id, owner, biography, leaf binding, explorer link) and a "Minted on NEAR testnet" toast when Frost buys Iris's shard; it reads only, never signs. Holding a shard (or the agent card, or a Day 1 Elise) unlocks a visible perk through *Holder access* (read-only check of any testnet account; cosmetic). Live seasons mint nothing and say so (see the real/mock table). Not claimed: a persistent, player-owned agent NFT; that is future work.

## Baseline, third-party code and AI disclosure

- All code was written **after 19.10.2026**, inside the hackathon window. There is no earlier code or template: the game, engine, server, contract and art pipeline were started for this hackathon.
- **Tags.** `pre-hackathon` exists and points to the empty root commit. `hackathon-submission` is created by the owner at the freeze on the commit that is submitted:
  ```bash
  git tag -a hackathon-submission -m "NEAR Hackathon submission" <commit-on-main>
  git push origin hackathon-submission
  ```
  The diff between them is the whole work: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission (live once the tag is pushed).
- **Libraries** (from the lockfiles): [three](https://threejs.org) 0.170 (MIT), [Vite](https://vitejs.dev) 6 (MIT, dev only), `@fontsource/libre-caslon-text`, `@fontsource/old-standard-tt`, `@fontsource/source-sans-3` 5.3 (SIL OFL 1.1, bundled fonts), `@fontsource/cormorant-garamond` 5 (SIL OFL 1.1, bundled; no third-party font requests; Chinese text uses the system serif). The server has no dependencies. Contract: [near-sdk](https://github.com/near/near-sdk-rs) 5.30 (MIT / Apache-2.0); tests: [near-workspaces](https://github.com/near/near-workspaces-rs) 0.24, tokio 1, anyhow 1, serde_json 1 (all MIT / Apache-2.0); build: [cargo-near](https://github.com/near/cargo-near). Art tools (not shipped): Blender 4.5, toktx / Basis Universal, gltf-transform, numpy / scipy, ffmpeg (Opus). Every model and sound effect is our own procedural work. **Music:** "Hiraeth", "Tears in Rain" and "Legionnaire" by Scott Buckley, released under CC-BY 4.0 (www.scottbuckley.com.au); "Floating Cities" and "Frozen Star" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/); trimmed and looped by us, shipped in `game/public/assets/audio/mus_*.ogg` (except the synthesized `mus_calm`/`mus_uneasy`/`mus_crisis`) under that licence, not MIT. The motion-capture animation clips in `game/public/assets/anim/` (review build, `?anim=mocap`) are retargeted from the CMU Graphics Lab Motion Capture Database: the data used in this project was obtained from mocap.cs.cmu.edu, the database was created with funding from NSF EIA-0196217. Sources and licences per asset: [docs/art/manifest.md](docs/art/manifest.md).
- **AI-generated code and content.** The code, documentation, 3D models (procedural Blender scripts), sounds and most texts were produced with AI assistance under the owner's direction: Claude Code (Claude Opus 5.5 and Claude Fable 5.1, multi-agent sessions) wrote the engine, client, server, contract, art pipeline and docs; Codex worked on the UI polish branch (`codex/premium-ui`); independent reviewer agents did the game-design and economy reviews (`docs/math/`). The owner designed the game, made every product decision (`docs/decisions.md`), supplied the lobby background art and the HUD mockups, and reviewed the results.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

None. Forget to Foresee is the only NEAR Hackathon submission of its developer, Lambada_eth.

## License

MIT, see [LICENSE](LICENSE).
