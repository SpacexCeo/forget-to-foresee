# Forget to Foresee

A 3D strategy game where **Iris**, a doctor-linguist who came through the glass, pays for prophecy with her own memories (you guide her; she is a character, not an AI). Every prophecy of a season is written and **committed to NEAR testnet before the first move**, then revealed with a Merkle proof you can check yourself.

- **Play it now (no install, desktop browser with WebGL 2):** https://spacexceo.github.io/forget-to-foresee/ (one entry: the full game, the Expedition included)
- **Built at NEAR HACKATHON** (1–14 Nov 2026) by Lambada_eth. Tracks: **Games** (primary) and **NFTs** (memory shards); see [Tracks](#tracks).
- **Licence:** MIT. **AI use:** see [Baseline, third-party code and AI disclosure](#baseline-third-party-code-and-ai-disclosure).
- **Numbers** (test counts, build size) are generated, not typed: [docs/STATS.md](docs/STATS.md) (`node scripts/stats.mjs --write`).

## Judge path: do X, see Y (90 seconds)

| # | Do (on https://spacexceo.github.io/forget-to-foresee/) | See | Proof |
|---|---|---|---|
| 1 | Open the page, wait for the town | Iris in the hill town; no wallet, no gas prompt | `curl -sI https://spacexceo.github.io/forget-to-foresee/ \| head -1` → 200 |
| 2 | Look at the market ticker at the top of the town | Scripted traders' trades, each with a tx hash | [ftf-town.testnet](https://testnet.nearblocks.io/address/ftf-town.testnet), [`/api/market/stats`](https://159-195-130-113.sslip.io/api/market/stats) (`chain.total`, `recent[].hash`) |
| 3 | **Profile → NFTs → Holder access → Try the demo account** | The memory shards, agent card and Elise of `lambada_eth.testnet`, and the "Shard keeper" title | [ftf-shards.testnet](https://testnet.nearblocks.io/address/ftf-shards.testnet) (`nft_tokens_for_owner`) |
| 4 | Walk to the Tournament altar, press **E**, then **V** | Revealed signs checked against the root fixed before trial 1 | [ftf-seasons.testnet](https://testnet.nearblocks.io/address/ftf-seasons.testnet), the `curl` in [Verify in 60 seconds](#no-gpu) |
| 5 | Talk to a townsperson (press **E**) | A line from a model on NEAR AI Cloud in a TEE, or the scripted line if it does not answer | `node tools/verify-tee/verify.mjs answer.json` → PASS ([docs/tee.md](docs/tee.md)); model in [`/api/health`](https://159-195-130-113.sslip.io/api/health) |
| 6 | Take the free Day 1 mint | A guest account of your own owning an Elise NFT, and a dragon owned by that NFT's account | [heroine.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/heroine.ftf-coordinator.testnet), [companions.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/companions.ftf-coordinator.testnet) |
| 7 | Kill monsters outside the walls; open a chest if one drops | The chest's roll from the committed 10,000-card deck | [chests.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/chests.ftf-coordinator.testnet), `node tools/verify-chest/verify.mjs` |

What NEAR work exists and how to check each piece: [docs/near-built-1-14-nov.md](docs/near-built-1-14-nov.md). Pitch: [docs/pitch.md](docs/pitch.md).

## Hackathon window and legal

- **Built in the window.** Every commit is dated 7–14 Nov 2026 (first commit: the empty baseline on 7 Nov; `git log --reverse --format=%ad origin/main | head -1`). 0 commits before 1 Nov. Nothing was built before the hackathon; no template or earlier code. Details: [Baseline, third-party code and AI disclosure](#baseline-third-party-code-and-ai-disclosure).
- **Testnet only.** Every contract and account is on NEAR testnet. Nothing in the game has real-world value. Testnet NEAR is free.
- **Silk.** Silk is in-game only. Play silk (the dice and the wheel) cannot be bought, cannot be cashed out and cannot open the Gate-Loom.
- **Under 18.** In-game wording on the play-money games: "These games use play silk. It has no real value, cannot be bought, and cannot be cashed out or used to open the Gate-Loom. The odds are shown on every game. If you are under 18, please skip this tab."

## Try it: four checks

Each row ends with something you can check yourself, without trusting the game window.

| Do | You'll see | How to check it yourself |
|---|---|---|
| Open https://spacexceo.github.io/forget-to-foresee/ | The hill town, no wallet and no gas prompt (a NEAR guest account exists only if you take the free Day 1 mint) | `curl -sI https://spacexceo.github.io/forget-to-foresee/ \| head -1` prints a 200 status |
| `bash scripts/verify-all.sh --skip-rust` | One table, one line per suite, exit 0 | The counts equal [docs/STATS.md](docs/STATS.md) (`node scripts/stats.mjs`) |
| Read the sealed season on chain (the `curl` under [Verify in 60 seconds](#no-gpu)) | `"leaf_count":15`, `"revealed_count":15`, `"ash_key_committed":true` | The public testnet RPC, no code of ours |
| In the game: **Signs & Visions → What does this prove? → Copy proof**, save it as `proof.json`, run `node tools/verify/verify.mjs proof.json` | Every line `✓`, exit 0 | Change one digit of the leaf in `proof.json`: the same command prints `✗` and exits 1 |

## The problem

Games that advertise "AI agents" and "on-chain economies" often hide two lies: the AI secretly decides the outcome, and the chain is decoration. Forget to Foresee fixes the future before play begins and lets anyone check it afterwards. The agent's memories are the currency.

## What you do in the game (30 seconds)

Six clans read round signs of four slots (Place, Action, Power, Delay), stake silk on where a Gift will land, trade, trust, betray, and must assemble one message before trial 13. You guide Iris; the other five clans are computer-run agents. To see the future early she can **forget a memory forever**; the forgotten memory is auctioned as a **shard** and, for the recorded season on testnet, is a NEP-171 NFT bound to the sealed season.

## The game loop

Only what runs today. [Expedition] marks the story layer, on by default (`?story=0` switches it off).

| Every | The player |
|---|---|
| **30 seconds** | Walks the hill town, talks to a townsperson (**E**), hires one as an agent; outside the walls fights the monster packs (strike, dash, the **Q** / **V** casts) for XP and dropped chests. In a season: reads a sign, anchors a guess at a Shell pad, ends the trial (**T**). [Expedition] Each kill also counts toward the active citizen quest and earns town silk. |
| **5 minutes** | Collects a hired agent's result, spins the wheel by the Inn, plays a Foresight Exchange drill (practice silk, no prizes), plays a few trials and decides whether to forget a memory for a vision. [Expedition] Turns in a citizen quest (the guard's ten stone spiders, the lamplighter's spare part, the crown on the lookout, the repeatable bounty); the objective line always shows one next goal. |
| **Session** | Plays one 17-trial season at the Tournament altar, checks the revealed signs against the root committed on NEAR testnet, and sees the forgotten memory become a shard (a NEP-171 token for the recorded season on testnet). [Expedition] The Expedition: gather 10,000 town silk (about 1.5 to 2 hours by the pacing test), pay it at the Gate-Loom beside the arrival point, and the Loom sends Iris onward to the archipelago, not home; the Shell monument shows the board (a local preview until a snapshot is published, [docs/leaderboard.md](docs/leaderboard.md)). |

Not in the loop yet: the town market and pledges to the town works (built, not deployed; see the table below), the weekly tournament card (a labelled simulation). One currency: silk, in-game, testnet, no value outside the game.

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

## How to see it (about 90 seconds)

There is one entry: the link above opens the full game (`?story=0` switches the Expedition off; the old `?demo=judge` link opens the same game).

| # | Do | See |
|---|---|---|
| 1 | Wait for the town. | Iris at her arrival point; the objective line at the top reads "Speak with the elder · 100 / 10,000 silk". Beside her stand the **Gate-Loom** (right) and the **Shell monument** (left). |
| 2 | Walk to the elder and press **E**; then walk a few metres and talk again. | The starter guide: the Gate-Loom wants 10,000 silk; the guard at the lower gate gives the first quest. |
| 3 | Outside the walls, fight the stone spiders (strike / dash, **Q** / **V** casts). | Kills count toward the guard's quest and drop resources (spider silk thread); the quest asks for them at the turn-in. |
| 4 | At the Shell monument press **E**. | The board: Humans and Scripted NPC tabs, your score from your own play log ("Local preview, not ranked" until a snapshot is published). |
| 5 | Walk up the main street stairs to the Tournament altar and press **E**. | The floating archipelago and **Trial 1 of 17**. Press **V**: revealed signs are checked against the root fixed before trial 1. Press **M** to forget a memory for a vision (in a fresh season its shard is an honest "Unminted shard preview"). |

The recorded season on NEAR testnet (`793f6c05e89839f2`) is evidence you can check without playing it again:

- **The NFT does something (holder access):** open **Profile** (top right) → **NFTs** → *Holder access* → **Try the demo account**. The page reads `nft_tokens_for_owner` on `ftf-shards.testnet`, `agents.ftf-coordinator.testnet` and `heroine.ftf-coordinator.testnet` for `lambada_eth.testnet`, lists the tokens with nearblocks links and unlocks "Unlocked: Shard keeper"; the **Profile** tab then shows the *Shard keeper* title and an ink-ring frame on the portrait. Any testnet account id works; an account that holds nothing unlocks nothing. Read-only and cosmetic: no wallet, no signature, kept in this browser.
- The **replay link** of the recorded season replays it command by command in your browser and checks its Merkle root against `ftf-seasons.testnet`: [open the replay](https://spacexceo.github.io/forget-to-foresee/?replay=r1.eyJzIjoiY2MxNjFkMzA4ZmFhNjc1MzlhZjQ0MjA1YjU2YjZkNGYiLCJyIjoidjMiLCJjIjpbWyJzdGFydF9zZWFzb24iLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbInNhY3JpZmljZV9tZW1vcnkiLHsibWVtb3J5SWQiOjJ9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJlbmRfdGljayIse31dLFsiZW5kX3RpY2siLHt9XSxbImVuZF90aWNrIix7fV0sWyJjYXN0X3ZvdGUiLHsiYWNjZXB0Ijp0cnVlfV1dfQ) (generated by `node game/scripts/judge-replay-link.mjs`). Its memory shard is token `793f6c05e89839f2-7` on `ftf-shards.testnet`.

On a machine without a GPU (software rendering, about 5 fps) the walks take a few minutes and keys pressed while Iris is still walking or a trial is still ending do nothing; wait for her to stop and for the trial counter to change.

Controls: **W A S D** / click to walk, **Shift** run, **G** walk to the goal, **E** do the highlighted action, **T** end the trial, **M** memories, **V** signs and visions, **N** map, **H** help. Outside the town walls **Q** and **V** cast Iris's two skills. Gamepad and touch are supported.

## What is AI, what is scripted

| Who | What decides | How it is labelled |
|---|---|---|
| **Iris** | You. She is a doctor-linguist (the story's character), not an AI | — |
| The five rival clans in a season | Scripted rules: deterministic heuristics with tempers, no model | Scripted |
| The clans' strategy layer in the town economy (live on the relayer; `strategy` in `/api/market/stats`) | `Qwen/Qwen3-VL-30B-A3B-Instruct` on NEAR AI Cloud picks bounded parameters about once an hour when it answers; the rules engine makes every move | `LLM-chosen strategy (<model> via NEAR AI Cloud, attestation <id>)`, else `Scripted (model unavailable: <reason>)`; one function, `labelFor` in `relayer/lib/clan-strategy.js` |
| Townsfolk speech, the trade advisor | NEAR AI Cloud confidential inference through the relayer; the browser re-checks the TEE signature before the answer replaces the scripted line | The checked answer, else the scripted line ([docs/tee.md](docs/tee.md)) |
| Hired townsfolk agents (the Inn, the hire card) | A scripted learning program (Thompson sampling over three trade styles), no model; town silk only | "The agent is a scripted learning program (Thompson sampling), not an AI model." |
| Season Cup entrants (sprint, behind a flag) | Whatever the entrant runs; each entry declares `driver: scripted` or `driver: llm` with its model id | The declared driver and model |
| Town traders, quest givers, the Guests' language, the season's signs | Scripted rules, no model (the sealed signs never contain model output) | Scripted |
| The arena's NPC economy, the 20 on-chain market traders | Scripted (price rules and demand schedules in `relayer/market/`), no model | "scripted NPC activity, owner-run, testnet, public seeds" |
| Your own agent | Whatever you run, over the [agent HTTP API](#agent-api) | — |

Details: [docs/ai-use.md](docs/ai-use.md).

## Sprint features (13 Nov, behind feature flags)

Quest journal and auto-walk, RPG HUD with skills and a skill tree, the market and trade, chests and loot effects,
play-money games, the new-player intro and prologue, agents in the tournament. They are merged behind flags in
`game/public/features.json` and **off on the live page until the owner switches them on**; preview them with
`?ff=all`. Checks: `bash scripts/verify-sprint.sh`. The 90-second path: [docs/how-to-see.md](docs/how-to-see.md).

## Real vs mock

| What | Status | Evidence |
|---|---|---|
| Game rules, 17-trial season | **Real, local**: runs in your browser tab with a headless engine; nothing about silk, stakes or outcomes is on-chain | `game/src/game/engine.js` |
| Clan agents (5 computer clans) | **Scripted, real rules**: deterministic heuristics with tempers, not an LLM; in-game silk only | `game/src/play/` |
| Season commitment | **Real**: SHA-256 Merkle root fixed before trial 1, each reveal checked in the browser; for the recorded season `793f6c05e89839f2` the root and all 15 leaves are on NEAR testnet and verified by the contract | `ftf-seasons.testnet`, `contracts/season-commit/` |
| Fresh seasons (every new game) | Commitment is local only; not registered on-chain | [docs/verify.md](docs/verify.md) |
| Memory-shard NFTs | **Real on testnet** for the recorded season: 3 NEP-171 tokens minted by the coordinator script, not by your session, held by `lambada_eth.testnet`; the game reads them | `ftf-shards.testnet`, `contracts/memory-shard/` |
| Holder access (NFT-gated perk) | **Real, read-only**: the game reads which Forget to Foresee NFTs any testnet account holds and unlocks a cosmetic title and portrait frame in this browser; not a wallet login, nothing signed or written | `game/src/net/holder.js`, `game/src/play/holder-panel.js` |
| Shards in other playthroughs | **Preview only**, labelled "Unminted shard preview" | `game/src/ui/world-hud/shard-card-model.js` |
| Agent card NFT (Iris's end-of-season state) | **Real on testnet**, coordinator-minted, owned by the owner's account | `agents.ftf-coordinator.testnet`, `contracts/agent-card/` |
| Day 1 free mint (player-owned guest account + Elise NFT) | **Contracts deployed; the relayer is live** (a test guest was created and minted through it on 11 Nov). The hosted page calls it (its public URL is in `game/src/net/day1-deployment.js`; a `VITE_FTF_RELAYER_URL` build variable overrides it); limits: 200 new guests a day, 0.05 testnet NEAR each; checked live end to end again on 12 Nov | `contracts/guests/`, `relayer/`, `game/src/play/day1-mint.js` |
| Agent track records (a hired agent's trades and PnL, re-computable by anyone) | **Deployed on testnet** (`ledger.ftf-coordinator.testnet`; checked end to end on 11 Nov with a test guest account: the game's recording code signed the record and re-verified it, and `node tools/verify-agent/verify.mjs ledgercheck-5.guests.ftf-coordinator.testnet baker 1` prints PASS): the player's guest account records a hire on the `agent-ledger` contract; the page shows "Verified" only after it re-computes the record read back from the chain; `node tools/verify-agent/verify.mjs` does the same | `contracts/agent-ledger/`, `game/src/game/track-record.js`, [docs/api/verify-agent.md](docs/api/verify-agent.md) |
| TEE agents (townsfolk speech, trade advisor) | **Live on the relayer** (since 12.11): `/api/agent/say` and `/api/agent/decide` on `https://159-195-130-113.sslip.io` answer through NEAR AI Cloud confidential inference (`Qwen/Qwen3-VL-30B-A3B-Instruct`); each answer carries the request/response bodies and the TEE signature, and the browser re-checks the signature before it replaces the scripted line. A fresh answer checked with `node tools/verify-tee/verify.mjs answer.json` prints PASS (signature, Intel TDX chain, report data with our nonce, RTMR replay, GPU evidence and vendor verdict; Intel TCB level and revocation are left to the official verifier). The ledger's `record_tee_decision` checks a signature on chain (tested with a fixture signature, labelled as such). | [docs/tee.md](docs/tee.md) |
| Loot chests from monsters | **Live on testnet**: `chests.ftf-coordinator.testnet`, deck of 10,000 with exactly 1,000 NFT committed on chain; the season seed is fixed (TEE-attested) and the relayer opens chests one transaction each (health on 13.11: 36 openings, 0 errors). `node tools/verify-chest/verify.mjs` checks the deck and every opening. | [docs/chests.md](docs/chests.md) |
| Wheel grand prize (Sheriffchenko skin NFT) | **Contract live, mint pending**: `skins.ftf-coordinator.testnet` (cap 100, one per account, 0 minted as of 13.11). The claim route re-checks the roll server-side; the route is on the deployed relayer (12.11) with its minter key on the server, but that key is not yet added to the contract, so a winning spin shows "mint pending" in the game. Known limit: the roll is public, so a player can pick a winning spin within the allowed count (documented). | [docs/wheel-skin.md](docs/wheel-skin.md), `contracts/skin-nft/` |
| Shared town and chat (rooms of 15) | **Real**: `presence/` (WebSocket rooms, server-side limits) runs on the owner's server behind the relayer's domain (`wss://159-195-130-113.sslip.io/presence`, `/presence/health` answers); the game joins it from `day1-deployment.js`. |
| Town economy (20 scripted traders on chain; pledges to the town works as deeds; tournament entry and purse) | **Real on testnet, traders live**: `ftf-town.testnet` (v4) with 26 NPC wallets (20 traders, 6 clans) holding game-methods-only keys, genesis silk and the on-chain portal (`pay_gate`, `pay_gate_for`, 200 silk). The scripted trader loop sends from the relayer: daily target 24,000 trades; `/api/market/stats` on 13.11 showed 7,716 trades on chain in total and 356 failed sends that day (3.06 Tgas a trade). Players' own pledges, claims, stall pledges and tournament entry go through the relayer (`*_for`, `/api/town/act`; v4 deployed 12.11, `docs/town-act.md`). |
| Town items as NEP-245 multi-tokens (monster resources first) | **Deployed on testnet, nothing minted yet**: `items.ftf-town.testnet` (NEP-245 core, metadata, events; no approvals; minters only) with the five monster resources registered, supply 0 on 13.11; the minters are the trader wallets. |
| Combat outside the town walls | **Real, local**: 4 monster types, strike / dash / casts, health; in-game only, nothing on-chain | `game/src/play/mobs.js` |
| Photo mode (**P**), townsfolk barks, narrator subtitles when films are off, shard history timeline on the card | **Real**, local presentation | `game/src/render/photo-mode.js`, `game/src/scenes/barks.js`, `game/src/play/narrator.js`, `game/src/ui/world-hud/shard-card.js` |
| Dragon companion NFT | **Live on testnet**: `companions.ftf-coordinator.testnet` (6 dragons minted on 13.11), each owned by a heroine token's own account (an NFT that owns an NFT), e.g. `nacre-cy-8` owned by `elise-cy-8.heroine.ftf-coordinator.testnet`; one at the Day 1 mint, a second after the first boss, checked against the stored log (`docs/companions.md`) | `game/src/net/companions.js`, `game/src/net/companion-claim.js`, `relayer/lib/companion.js` |
| Wallet sign-in, on-chain escrow, player-owned agent NFT | **Not built** | — |
| Agent HTTP API | **Real**: OpenAPI, idempotent commands, redacted observations, Merkle proofs, an example agent that plays a whole season; in-memory test sessions, no accounts | `server/`, [docs/api/](docs/api/README.md) |
| Foresight Exchange (practice drill) | **Real rules, practice silk**: three Echoes follow a sealed snapshot of public reference rates; no prizes, no real money, not on NEAR | `game/src/game/exchange.js` |
| Weekly tournament card | **UI simulation**, labelled "Simulation"; not part of the game loop | [docs/status.md](docs/status.md) |
| Townsfolk, hired agents, level, profile | **Local**: scripted programs (the hired agents learn by Thompson sampling; no AI model), in-game town silk only | `game/src/game/town-economy.js` |
| Art, audio, VFX | Own procedural work; exceptions: CMU motion-capture clips in a review build and the licensed music (Scott Buckley, Kevin MacLeod, CC-BY 4.0) | [docs/art/manifest.md](docs/art/manifest.md) |
| Money | In-game silk only. Nothing is sold and nothing is paid; testnet only | — |

**Free to play, nothing to buy.** There is no purchase, no sale and no promised value anywhere in the game; everything runs on NEAR testnet.
Silk is the game's one currency and has no value outside the game; testnet NEAR is free and worthless.
Any later distribution of real value would happen only after a legal and security review and an explicit owner decision; nothing in this build promises one.

The full feature table and every detail of the old README: [docs/status.md](docs/status.md).

## How NEAR is used

1. **Commit-reveal of the season** (`season-commit`): the contract stores the Merkle root, recomputes each revealed leaf byte for byte and verifies the proof on-chain; a separate commit-reveal covers the crisis key. The game reads the records back and shows "Verified on NEAR testnet ✓".
2. **NEP-171 memory shards** (`memory-shard`): token metadata carries the season id, the memory's kind and weight, the trial it was forgotten, the auction result and the Merkle leaf of the sign its vision opened; the on-chain ink-ring SVG is byte-identical to the game's own.
3. **NFT as account, Day 1** (`guests`, `character-nft`, `token-account`): a browser-made key becomes the full-access key of a guest sub-account that owns the player's Elise NFT; heroine tokens can have their own sub-account through which the owner acts (`act_as_token`). Status in the table above.
4. **Invisible chain:** the normal game loop never shows a wallet, a seed phrase or a gas prompt.

| Part | Where it runs |
|---|---|
| Season commitment, memory shards, agent cards, Day 1 guest accounts, agent track records, chests, the Gate (`pay_gate`) | NEAR testnet |
| Anything on mainnet | Nothing: there is no mainnet deployment |
| Townsfolk speech and the trade advisor (TEE) | NEAR AI Cloud confidential inference through the relayer; the scripted line stays when it does not answer ([What is AI, what is scripted](#what-is-ai-what-is-scripted)) |
| Clan strategy layer (town economy) | NEAR AI Cloud (`Qwen/Qwen3-VL-30B-A3B-Instruct`) picks each clan's bounded parameters; scripted when it does not answer; live on the relayer |
| The 17-trial season rules, combat, the town, quests | Local, in your browser tab |

Explicitly not proven: the browser runs the rules, so a modified client could change silk and outcomes; the commitment fixes what the Guests said, not what you did. See [docs/verify.md](docs/verify.md).

## Prerequisites

- Node.js 20+ (`.nvmrc`: 22). Rust only for the contracts: the toolchain is pinned in `contracts/*/rust-toolchain.toml`; `cargo test --lib` also needs `pkg-config` and OpenSSL headers (`apt-get install pkg-config libssl-dev`).
- Use `git clone --depth 1`: the full history is large because of videos.
- `cd game && npm run build` writes the production build (size in [docs/STATS.md](docs/STATS.md), mostly compressed 3D models). The first load of the game streams a large part of it; on a machine without a GPU the page runs at a low frame rate and says so, and every step above still completes. Without WebGL 2 the page explains it and links the paths that need no GPU.

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
- **nfts** ("NFTs That Do Something"), claimed for the memory shards only: a forgotten memory becomes a memory shard, a NEP-171 NFT whose metadata carries its biography (the season, the memory's kind and weight, the trial it was forgotten, the auction result), the season's schedule root and, when its vision opened a sign (Iris's shard 7), that sign's Merkle leaf, so the token is bound to the sealed season. The contract `memory-shard` runs on testnet as `ftf-shards.testnet` with the recorded season's 3 shards minted by the coordinator script; the on-chain ink-ring SVG is byte-identical to the game's. In the game, Profile → NFTs → Holder access reads the minted shards of the recorded season (token id, owner, explorer link); it reads only, never signs. Holding a shard (or the agent card, or a Day 1 Elise) unlocks a visible perk through *Holder access* (read-only check of any testnet account; cosmetic). Live seasons mint nothing and say so (see the real/mock table). Not claimed: a persistent, player-owned agent NFT; that is future work.

| Track hint | In this project |
|---|---|
| Social or e-mail login | Not used. The Day 1 free mint makes a NEAR guest account from a key made in your browser (no wallet, no seed phrase); without the mint you play without an account |
| Agent NPCs | Townsfolk speak through a model on NEAR AI Cloud (TEE; the browser re-checks the signature) when it answers; the five rival clans play by scripted rules; their strategy layer in the town economy is chosen by a model on NEAR AI Cloud (live). See [What is AI, what is scripted](#what-is-ai-what-is-scripted) |
| NEAR Intents | Not used |
| NEP-245 multi-token | Deployed on testnet (`items.ftf-town.testnet`) |

## Baseline, third-party code and AI disclosure

- All code was written **after 19.10.2026**, inside the hackathon window. There is no earlier code or template: the game, engine, server, contract and art pipeline were started for this hackathon.
- **The window, from git alone** (`node scripts/window-facts.mjs`, written to [docs/window.md](docs/window.md); needs a full clone, `git fetch --unshallow --filter=blob:none`):

  | Before the window | Inside the window |
  |---|---|
  | 0 commits before 1 Nov 2026 (`git rev-list --count --before=2026-11-01 HEAD`), 0 before 19 Oct | Every commit is dated 7 Nov 2026 or later; the first is the empty `pre-hackathon` root (the count and dates: [docs/window.md](docs/window.md)) |

  The organizers' Q-001 counts the window from 19 Oct; the hackathon facts table says 1 Nov; the first commit here is 7 Nov 2026, so both readings give the same answer.
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
