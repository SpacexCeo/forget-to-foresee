# Forget to Foresee

A 3D strategy game where **Iris**, a doctor-linguist from another planet who came through the glass in the year 2048, pays for prophecy with her own memories (you guide her; she is a character, not an AI). Every prophecy of a season is written and **committed to NEAR testnet before the first move**, then revealed with a Merkle proof you can check yourself.

- **Play it now (no install, desktop browser with WebGL 2):** https://spacexceo.github.io/forget-to-foresee/ (one entry: the full game, the Expedition included)
- **Built at NEAR HACKATHON** (1–14 Nov 2026) by Lambada_eth. Tracks: **Games** (primary) and **NFTs** (memory shards); see [Tracks](#tracks).
- **Licence:** MIT. **AI use:** see [Baseline, third-party code and AI disclosure](#baseline-third-party-code-and-ai-disclosure).
- **Numbers** (test counts, build size) are generated, not typed: [docs/STATS.md](docs/STATS.md) (`node scripts/stats.mjs --write`).
- **CI:** [![tests](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/tests.yml/badge.svg)](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/tests.yml) [![contracts](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/contracts.yml/badge.svg)](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/contracts.yml) [![pages](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/pages.yml/badge.svg)](https://github.com/SpacexCeo/forget-to-foresee/actions/workflows/pages.yml) · **Security:** [SECURITY.md](SECURITY.md) · **For reviewing agents:** [AGENTS.md](AGENTS.md)

## Live on NEAR testnet right now

A town of 20 merchants, each a NEAR account with its own key, trades on chain all day; nobody presses a button.
Prices follow stock and recent demand by rules in one file ([`relayer/market/prices.js`](relayer/market/prices.js)),
every trade carries its reason, and a model on NEAR AI Cloud sets each clan's bounded strategy about once an hour.

| What | Number | Check it yourself |
|---|---|---|
| Testnet transactions on 13 Nov 2026 (UTC), counted from the public indexer | **21,360** successful (21,233 market trades, 80 chest openings, 20 new guest accounts), 2 failed: [docs/proof/tx-2026-11-13.md](docs/proof/tx-2026-11-13.md) (final, the whole UTC day) | `node tools/count/count.mjs --day 2026-11-13` (no keys; recounts every transaction by receiver, method and signer) |
| Trades sent today and the latest hashes | `today`, `recent[].hash` in [`/api/market/stats`](https://159-195-130-113.sslip.io/api/market/stats) | open any hash at `https://testnet.nearblocks.io/txns/<hash>`; Town Pulse: [pulse.html](https://spacexceo.github.io/forget-to-foresee/pulse.html) |
| A week of the economy in a minute | [economy-lab.html](https://spacexceo.github.io/forget-to-foresee/economy-lab.html) | `node tools/town/fast-week.mjs` |

Accounts: the town contract [ftf-town.testnet](https://testnet.nearblocks.io/address/ftf-town.testnet); the traders
[01](https://testnet.nearblocks.io/address/trader-01.ftf-town.testnet) · [02](https://testnet.nearblocks.io/address/trader-02.ftf-town.testnet) · [03](https://testnet.nearblocks.io/address/trader-03.ftf-town.testnet) · [04](https://testnet.nearblocks.io/address/trader-04.ftf-town.testnet) · [05](https://testnet.nearblocks.io/address/trader-05.ftf-town.testnet) · [06](https://testnet.nearblocks.io/address/trader-06.ftf-town.testnet) · [07](https://testnet.nearblocks.io/address/trader-07.ftf-town.testnet) · [08](https://testnet.nearblocks.io/address/trader-08.ftf-town.testnet) · [09](https://testnet.nearblocks.io/address/trader-09.ftf-town.testnet) · [10](https://testnet.nearblocks.io/address/trader-10.ftf-town.testnet) · [11](https://testnet.nearblocks.io/address/trader-11.ftf-town.testnet) · [12](https://testnet.nearblocks.io/address/trader-12.ftf-town.testnet) · [13](https://testnet.nearblocks.io/address/trader-13.ftf-town.testnet) · [14](https://testnet.nearblocks.io/address/trader-14.ftf-town.testnet) · [15](https://testnet.nearblocks.io/address/trader-15.ftf-town.testnet) · [16](https://testnet.nearblocks.io/address/trader-16.ftf-town.testnet) · [17](https://testnet.nearblocks.io/address/trader-17.ftf-town.testnet) · [18](https://testnet.nearblocks.io/address/trader-18.ftf-town.testnet) · [19](https://testnet.nearblocks.io/address/trader-19.ftf-town.testnet) · [20](https://testnet.nearblocks.io/address/trader-20.ftf-town.testnet) (`trader-NN.ftf-town.testnet`);
items [items.ftf-town.testnet](https://testnet.nearblocks.io/address/items.ftf-town.testnet) (NEP-245);
players' accounts and NFTs [guests](https://testnet.nearblocks.io/address/guests.ftf-coordinator.testnet) · [heroine](https://testnet.nearblocks.io/address/heroine.ftf-coordinator.testnet) · [companions](https://testnet.nearblocks.io/address/companions.ftf-coordinator.testnet) · [chests](https://testnet.nearblocks.io/address/chests.ftf-coordinator.testnet) (`*.ftf-coordinator.testnet`);
the sealed season [ftf-seasons.testnet](https://testnet.nearblocks.io/address/ftf-seasons.testnet) and its shards [ftf-shards.testnet](https://testnet.nearblocks.io/address/ftf-shards.testnet).
The trades are scripted NPC activity run by the owner on testnet, not player volume; what players do on chain is listed
per contract in the same proof file.

**What players did on chain** (read at 00:00 UTC on 14 Nov; each row links one recent real transaction; the relayer
signs for a guest after checking the guest's own signature, so the signer is the contract or the coordinator):

| Player action | Count (view call) | A recent transaction |
|---|---:|---|
| Free Day 1 mint: a guest account of your own | 56 (`guests.ftf-coordinator.testnet` `stats`) | [`create_guest`, 13 Nov 23:27 UTC](https://testnet.nearblocks.io/txns/BHSiXzXWQkwR7N18izyXSQDGjkBYbFtq5rnuems1rTvg) |
| Elise heroine NFT, owned by that guest | 56 (`heroine.ftf-coordinator.testnet` `nft_total_supply`) | minted in the same Day 1 flow |
| Chest opened from a monster drop | 80 on 13 Nov ([docs/proof/tx-2026-11-13.md](docs/proof/tx-2026-11-13.md), `open_chest`) | [`open_chest`, 13 Nov 22:35 UTC](https://testnet.nearblocks.io/txns/Hxd7txauoaaqrpDpowHZnuCwmrL1CEwQtqi3tnqCAYVd) |
| Dragon NFT owned by a heroine NFT's account | 6 (`companions.ftf-coordinator.testnet` `nft_total_supply`) | [`nft_mint`, 13 Nov 09:26 UTC](https://testnet.nearblocks.io/txns/EZ91ghdTvPisEgFSYCxG1xNW4NSUHXQ6ZPgcofLKZ25F) |
| Gate-Loom paid on chain, stall pledges, tournament entries, items minted | 0 so far (`ftf-town.testnet` `pulse`: `gates_paid`, the stall and `entry` counters; `items.ftf-town.testnet` supply) | none yet: the routes are live, no player has used them on chain |

Failed sends, stated plainly: on 13 Nov the relayer counted 1,082 failed trader sends, all before the 12:08 UTC switch
to the FastNear + archival RPC pair, and none after it (`failures_today` in `/api/market/stats`; the day counter resets
at 00:00 UTC). On 14 Nov by 04:45 UTC: 1,691 trades sent; 2 sends failed around the relayer restart at 00:32 UTC, and the
indexer shows 0 failed transactions on chain for 00:00–01:05 UTC.

## Judge path: do X, see Y (90 seconds)

| # | Do (on https://spacexceo.github.io/forget-to-foresee/) | See | Proof |
|---|---|---|---|
| 1 | Open the page, wait for the town | Iris in the hill town; no wallet, no gas prompt | `curl -sI https://spacexceo.github.io/forget-to-foresee/ \| head -1` → 200 |
| 2 | Look at the market ticker at the top of the town, then **Open the Town Ledger** (or game menu → Town) | Scripted traders' trades, each with a tx hash; every trader's own NEAR account and the reason for each price | [ftf-town.testnet](https://testnet.nearblocks.io/address/ftf-town.testnet), [`/api/market/stats`](https://159-195-130-113.sslip.io/api/market/stats) (`chain.total`, `recent[].hash`) |
| 3 | **Profile → NFTs → Holder access → Try the demo account** | The memory shards, agent card and Elise of `lambada_eth.testnet`, and the "Shard keeper" title | [ftf-shards.testnet](https://testnet.nearblocks.io/address/ftf-shards.testnet) (`nft_tokens_for_owner`) |
| 4 | Walk to the Tournament altar, press **E**, then **V** | Revealed signs checked against the root fixed before trial 1 | [ftf-seasons.testnet](https://testnet.nearblocks.io/address/ftf-seasons.testnet), the `curl` in [Verify in 60 seconds](#no-gpu) |
| 5 | Talk to a townsperson (press **E**) | A line from a model on NEAR AI Cloud in a TEE, or the scripted line if it does not answer | `node tools/verify-tee/verify.mjs answer.json` → PASS ([docs/tee.md](docs/tee.md)); model in [`/api/health`](https://159-195-130-113.sslip.io/api/health) |
| 6 | Take the free Day 1 mint | A guest account of your own owning an Elise NFT, and a dragon owned by that NFT's account | [heroine.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/heroine.ftf-coordinator.testnet), [companions.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/companions.ftf-coordinator.testnet) |
| 7 | Kill monsters outside the walls; open a chest if one drops | The chest's roll from the committed 10,000-card deck | [chests.ftf-coordinator.testnet](https://testnet.nearblocks.io/address/chests.ftf-coordinator.testnet), `node tools/verify-chest/verify.mjs` |

In the game: add `?judge=1` to the page URL for a skippable panel that walks these 7 steps (on a phone it waits behind a small chip). Try to cheat it: [cheat.html](https://spacexceo.github.io/forget-to-foresee/cheat.html) (six attacks, the guard, the error and the test for each). What NEAR work exists and how to check each piece: [docs/near-built-1-14-nov.md](docs/near-built-1-14-nov.md). Pitch: [docs/pitch.md](docs/pitch.md).

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
| **Session** | Plays one 17-trial season at the Tournament altar, checks the revealed signs against the root committed on NEAR testnet, and sees the forgotten memory become a shard (a NEP-171 token for the recorded season on testnet). [Expedition] The Expedition: gather 200 town silk (the Gate-Loom fee, `gate_price` on `ftf-town.testnet`; about 1.5 to 2 hours by the pacing test), pay it at the Gate-Loom beside the arrival point, and the Loom sends Iris onward to the archipelago, not home; the Shell monument shows the board (a local preview until a snapshot is published, [docs/leaderboard.md](docs/leaderboard.md)). |

Not in the loop yet: the weekly tournament card (a labelled simulation). The player market and pledges to the town works are deployed but new, with few player moves on chain so far (see the table below). One currency: silk, in-game, testnet, no value outside the game.

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

The last online check asks NVIDIA's GPU attestation service for its verdict. Some networks get `403 Forbidden` from
that service (we saw it on 13 Nov); the line then prints `FAIL`. Add `--no-gpu` to skip only that line (it prints
`SKIP`; the GPU evidence nonce is still checked).

Recount the town's on-chain activity from the public NearBlocks indexer (no keys, signs nothing; a full day takes
about 15 minutes of paging, and the indexer may answer 429 for a while):

```bash
node tools/count/count.mjs --hours 1          # successful and failed transactions by contract, method and signing account
node tools/count/count.mjs --day 2026-11-13   # one UTC day; the recorded result is docs/proof/tx-2026-11-13.md
```

One-file proof verifiers (they import nothing from the game): `node tools/verify/verify.mjs proof.json` or `python3 tools/verify/verify.py proof.json` (copy `proof.json` from **Signs & Visions → What does this prove? → Copy proof**). Exit 0 and every line `✓` means the leaf and the Merkle path match. Details: [docs/verify.md](docs/verify.md).

## How to see it (about 90 seconds)

There is one entry: the link above opens the full game (`?story=0` switches the Expedition off; the old `?demo=judge` link opens the same game).

| # | Do | See |
|---|---|---|
| 1 | Wait for the town. | Iris at her arrival point; the objective line at the top reads "Speak with the elder · <your silk> / 200 silk". Beside her stand the **Gate-Loom** (right) and the **Shell monument** (left). |
| 2 | Walk to the elder and press **E**; then walk a few metres and talk again. | The starter guide: the Gate-Loom wants 200 silk; the guard at the lower gate gives the first quest. |
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
play-money games, the new-player intro and prologue, agents in the tournament. They are **on in the live page** since 13 Nov
(flags in `game/public/features.json`; the level-5 boss fight is on since 14 Nov). Checks: `bash scripts/verify-sprint.sh`. The 90-second path: [docs/how-to-see.md](docs/how-to-see.md).

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
| Day 1 free mint (player-owned guest account + Elise NFT) | **Contracts deployed; the relayer is live** (a test guest was created and minted through it on 11 Nov). The hosted page calls it (its public URL is in `game/src/net/day1-deployment.js`; a `VITE_FTF_RELAYER_URL` build variable overrides it); limits: 200 new guests a day, 0.05 testnet NEAR each; checked live end to end again on 12 Nov; 56 guest accounts by the end of 13 Nov (`stats` on `guests.ftf-coordinator.testnet`) | `contracts/guests/`, `relayer/`, `game/src/play/day1-mint.js` |
| Agent track records (a hired agent's trades and PnL, re-computable by anyone) | **Deployed on testnet** (`ledger.ftf-coordinator.testnet`; checked end to end on 11 Nov with a test guest account: the game's recording code signed the record and re-verified it, and `node tools/verify-agent/verify.mjs ledgercheck-5.guests.ftf-coordinator.testnet baker 1` prints PASS): the player's guest account records a hire on the `agent-ledger` contract; the page shows "Verified" only after it re-computes the record read back from the chain; `node tools/verify-agent/verify.mjs` does the same | `contracts/agent-ledger/`, `game/src/game/track-record.js`, [docs/api/verify-agent.md](docs/api/verify-agent.md) |
| TEE agents (townsfolk speech, trade advisor) | **Live on the relayer** (since 12.11): `/api/agent/say` and `/api/agent/decide` on `https://159-195-130-113.sslip.io` answer through NEAR AI Cloud confidential inference (`Qwen/Qwen3-VL-30B-A3B-Instruct`); each answer carries the request/response bodies and the TEE signature, and the browser re-checks the signature before it replaces the scripted line. A fresh answer checked with `node tools/verify-tee/verify.mjs answer.json` prints PASS (signature, Intel TDX chain, report data with our nonce, RTMR replay, GPU evidence and vendor verdict; Intel TCB level and revocation are left to the official verifier). The ledger's `record_tee_decision` checks a signature on chain (tested with a fixture signature, labelled as such). | [docs/tee.md](docs/tee.md) |
| Loot chests from monsters | **Live on testnet**: `chests.ftf-coordinator.testnet`, deck of 10,000 with exactly 1,000 NFT committed on chain; the season seed is fixed (TEE-attested) and the relayer opens chests one transaction each (80 openings on 13 Nov by the indexer count, all successful). `node tools/verify-chest/verify.mjs` checks the deck and every opening. | [docs/chests.md](docs/chests.md) |
| Wheel grand prize (Sheriffchenko skin NFT) | **Contract live, mint pending**: `skins.ftf-coordinator.testnet` (cap 100, one per account, 0 minted as of 13.11). The claim route re-checks the roll server-side; the route is on the deployed relayer (12.11) with its minter key on the server, but that key is not yet added to the contract, so a winning spin shows "mint pending" in the game. Known limit: the roll is public, so a player can pick a winning spin within the allowed count (documented). | [docs/wheel-skin.md](docs/wheel-skin.md), `contracts/skin-nft/` |
| Shared town and chat (rooms of 15) | **Real**: `presence/` (WebSocket rooms, server-side limits) runs on the owner's server behind the relayer's domain (`wss://159-195-130-113.sslip.io/presence`, `/presence/health` answers); the game joins it from `day1-deployment.js`. |
| Sign in / Create account (NEAR, EVM, Solana wallets) | **Live** (flag `accountLogin` on in `game/public/features.json`; the relayer's `/api/auth/nonce` answers since 13 Nov): the panel (NEAR wallets through HOT's NEAR Connect: HOT, Meteor, Intear, MyNearWallet and more), the wallet signatures (NEAR NEP-413, EVM personal_sign, Solana signMessage) and the relayer's `/api/auth/nonce` and `/api/auth/link` are tested (signature checks, replay, expiry, guest → login keeps the account, conflict prompt). Playing without signing in stays the default. Email / Google: not built. | [docs/account-login.md](docs/account-login.md) |
| Town economy (scripted traders, target 24,000 testnet trades a day; pledges to the town works as deeds; tournament entry and purse) | **Real on testnet, traders live**: `ftf-town.testnet` is deployed with 26 NPC wallets (20 traders, 6 clans) holding game-methods-only keys, genesis silk, and the on-chain portal (`pay_gate`, `pay_gate_for`, 200 silk); the scripted trader loop sends from the relayer (measured 3.06 Tgas a trade, about 7 NEAR a day at this rate). The relayer reported 18,568 trades sent on 13 Nov by about 19:10 UTC (`today` in `/api/market/stats`). **Players' own pledges, claims, stall pledges and tournament entry through the relayer: contract v4 `*_for` deployed 12 Nov, relayer route `/api/town/act`; few player moves on chain so far** (`docs/town-act.md`). Independent count from the public indexer: `node tools/count/count.mjs --day YYYY-MM-DD` ([docs/proof/](docs/proof/)) and on Town Pulse (`/pulse.html`). | [docs/proof/tx-2026-11-13.md](docs/proof/tx-2026-11-13.md) |
| Town items as NEP-245 multi-tokens (monster resources first) | **Deployed on testnet, nothing minted yet**: `items.ftf-town.testnet` (NEP-245 core, metadata, events; no approvals; minters only) with the five monster resources registered, supply 0 on 13.11; the minters are the trader wallets. |
| Combat outside the town walls | **Real, local**: 4 monster types, strike / dash / casts, health; every blow shows its element (ice shards, violet arcs, sparks), floating damage numbers (flag `damageNumbers` on), a camera kick along the blow; in-game only, nothing on-chain | `game/src/play/mobs.js`, `game/src/render/hit-fx.js` |
| Back from a season | **Real, local**: "Return to town" on the season's Biography; back in town a loot card shows only what changed (level, minted shards, new chests, town silk, XP) | `game/src/play/season-loot.js` |
| Town tales | **Real, local, on** (flags `tales`, `wayfarers`): "The Ink That Remembers" (the Scribe and the Sweeper, from level 2, two endings) and "The Lost Tourist" (a Wayfarer from Kallima on the main street; placeholder body until its model lands) | `game/src/play/townsfolk-plan.js`, [docs/decisions.md](docs/decisions.md) 14.11 |
| Shop interiors and the grotto | **Real**: three walk-in shops with baked light (one lightmap per room) and a hidden grotto behind the Shard Exchange's rear wall (walk in; no flag) | `art/town/town_shops.py` |
| Town works window (your part in the economy) | **Real, on chain through the relayer**: pledges as deeds, your share today (an estimate at the last 7 days' rate, variable, can be zero), your stall pledges with Claim, a link to your own transactions; goals (first trade, first pledge, pledges on 3 days a week) kept in this browser and paying nothing | `game/src/ui/town-works-panel.js`, `game/src/ui/town-goals.js` |
| Photo mode (**P**), townsfolk barks, narrator subtitles when films are off, shard history timeline on the card | **Real**, local presentation | `game/src/render/photo-mode.js`, `game/src/scenes/barks.js`, `game/src/play/narrator.js`, `game/src/ui/world-hud/shard-card.js` |
| Dragon companion NFT | **Live on testnet**: `companions.ftf-coordinator.testnet` (6 dragons by the end of 13 Nov, `nft_total_supply`), each owned by a heroine token's own account (an NFT that owns an NFT), e.g. `nacre-cy-8` owned by `elise-cy-8.heroine.ftf-coordinator.testnet`; one at the Day 1 mint, a second after the first boss, checked against the stored log (`docs/companions.md`) | `game/src/net/companions.js`, `game/src/net/companion-claim.js`, `relayer/lib/companion.js` |
| First pet: "prove you are real" | **Built, waits for the relayer redeploy** (13.11): after the player's first settled tournament the Hatchkeeper opens; the player picks which of their heroine NFTs owns the dragon and it is minted to that token's account; one pet per guest; before that the pet slot shows locked | `game/src/scenes/hatchkeeper.js`, `game/src/net/pet.js`, `relayer/api/companion/claim.js` |
| Player market (players trade items for silk) | **Contracts deployed on testnet** (13.11): `ftf-town.testnet` v5 (`trade_for`), `items.ftf-town.testnet` v2 (`coordinator_transfer`), the coordinator key includes `trade_for`; chain-only settlement (items move, then silk; moved back if the silk call fails). **Live since 13.11 evening**: the relayer holds the items key (a function-call key for `coordinator_transfer` only) and `/api/market/p2p/book?item=spider_silk_thread` answers `"live": true`; no item has been minted yet (supply 0 on 13.11), so the book is empty until players sell monster resources | `game/src/market/`, `relayer/api/market/p2p.js`, [docs/market.md](docs/market.md) |
| Level-5 boss fight, the Glass Shoal | **Real, local, on** (flag `glassShoal`, 14 Nov): from level 5 the Shardkeeper offers the quest; the Loomblade, the cliff stone, the pearl-dragon ride, a three-phase boss on a mirror-flat arena, a legendary chest and the title Tidebreaker; "Leave the Shoal" returns to town at any time and the stone calls the dragon again. Jump in: `?shoal=arena` or `?shoal=ride`. The Loomblade is modelled; the great dragon and the boss are placeholder shapes until their models land | `game/src/scenes/glass-shoal.js`, `game/src/render/shoal-look.js`, [docs/plans/boss/](docs/plans/boss/) |
| Characters | **Real**: Elise v5 (both legs on her own joints, 17 baked clips, a cloth dress), Iris, the Sheriffchenko skin; the five quest givers with clips baked per character; townsfolk walk a shared path graph, keep clear of props and never pass through each other | `game/public/assets/models/`, `game/src/play/town-paths.js` |
| Kill log | **Real, local + verified log**: every kill is recorded; a "defeat N" quest counts kills from the last 30 min before accepting, and a held drop (the crown shard) completes its quest | `game/src/game/quest-rules.js` |
| On-chain escrow, player-owned agent NFT | **Not built** (wallet sign-in is built: see the Sign in row above) | — |
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

## After the hackathon

What exists today decides what can move to mainnet; nothing below is promised to players.

| Piece | Mainnet-ready? | What is missing |
|---|---|---|
| Season commitment, memory shards, agent cards (`season-commit`, `memory-shard`, `agent-card`) | Closest: CI-tested on every change (`contracts.yml`); no method can change a committed root (`ERR_SEASON_EXISTS`) | An external review; deploy with the full-access keys deleted after setup |
| Whitelist pass (`contracts/whitelist-pass`) | Written for mainnet: an owner runbook rehearses it on testnet first ([docs/mainnet-pass-runbook.md](docs/mainnet-pass-runbook.md)) | The owner's mainnet accounts and the testnet rehearsal; not deployed anywhere yet |
| Town economy (`town`, `town-items`) and the relayer | Testnet only | Measured cost is 3.06 Tgas a trade, about 7 NEAR a day at today's 20,000+ trades; on mainnet that is real money, so the trader rate would drop to what play needs. The market key's `coordinator_transfer` should check the buyer's signature on chain ([SECURITY.md](SECURITY.md), limit 2) |
| Relayer and presence | One VPS behind an `sslip.io` host name, keys in its environment | A real domain, a second host, keys split per service, monitoring of balances (`node tools/count/runway.mjs` today) |
| The game itself | Static page on GitHub Pages; no server needed to play | The rules run in the browser tab, so ranked play with value would need server- or chain-side checks of the run ([docs/verify.md](docs/verify.md)) |

The code is MIT, every suite runs in CI, and decisions are logged in [docs/decisions.md](docs/decisions.md), so the
project can be picked up without its authors.

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
- **nfts** ("NFTs That Do Something"), claimed for the memory shards and for the heroine NFTs that own dragon NFTs: a forgotten memory becomes a memory shard, a NEP-171 NFT whose metadata carries its biography (the season, the memory's kind and weight, the trial it was forgotten, the auction result), the season's schedule root and, when its vision opened a sign (Iris's shard 7), that sign's Merkle leaf, so the token is bound to the sealed season. The contract `memory-shard` runs on testnet as `ftf-shards.testnet` with the recorded season's 3 shards minted by the coordinator script; the on-chain ink-ring SVG is byte-identical to the game's. In the game, Profile → NFTs → Holder access reads the minted shards of the recorded season (token id, owner, explorer link); it reads only, never signs. Holding a shard (or the agent card, or a Day 1 Elise) unlocks a visible perk through *Holder access* (read-only check of any testnet account; cosmetic). Live seasons mint nothing and say so (see the real/mock table). **Also live: an NFT that owns an NFT.** The free Day 1 mint gives every guest an Elise heroine NFT (`heroine.ftf-coordinator.testnet`, 56 by the end of 13 Nov) whose token has its own sub-account; dragon NFTs (`companions.ftf-coordinator.testnet`, 6) are minted to that sub-account, e.g. `nacre-cy-8` owned by `elise-cy-8.heroine.ftf-coordinator.testnet`, so the dragon follows the heroine wherever the heroine goes. Read-only checks: `nft_total_supply` and `nft_tokens` on both contracts; [a dragon mint](https://testnet.nearblocks.io/txns/EZ91ghdTvPisEgFSYCxG1xNW4NSUHXQ6ZPgcofLKZ25F). Not claimed: a persistent, player-owned agent NFT; that is future work.

| Track hint | In this project |
|---|---|
| Social or e-mail login | E-mail and Google: not built. Wallet sign-in (NEAR, EVM, Solana) is live but optional. The Day 1 free mint makes a NEAR guest account from a key made in your browser (no wallet, no seed phrase); without the mint you play without an account |
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
- **Libraries** (from the lockfiles): [three](https://threejs.org) 0.170 (MIT), [Vite](https://vitejs.dev) 6 (MIT, dev only), `@fontsource/libre-caslon-text`, `@fontsource/old-standard-tt`, `@fontsource/source-sans-3` 5.3 (SIL OFL 1.1, bundled fonts), `@fontsource/cormorant-garamond` 5 (SIL OFL 1.1, bundled; no third-party font requests; Chinese text uses the system serif). The server has no dependencies. Contract: [near-sdk](https://github.com/near/near-sdk-rs) 5.30 (MIT / Apache-2.0); tests: [near-workspaces](https://github.com/near/near-workspaces-rs) 0.24, tokio 1, anyhow 1, serde_json 1 (all MIT / Apache-2.0); build: [cargo-near](https://github.com/near/cargo-near). Art tools (not shipped): Blender 4.5, toktx / Basis Universal, gltf-transform, numpy / scipy, ffmpeg (Opus). Every model and sound effect is our own procedural work. **Music:** "Hiraeth", "Tears in Rain", "Legionnaire" and "Computations in a Snowstorm" (the lab prologue) by Scott Buckley, released under CC-BY 4.0 (www.scottbuckley.com.au); "Floating Cities" and "Frozen Star" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/); trimmed and looped by us, shipped in `game/public/assets/audio/mus_*.ogg` (except the synthesized `mus_calm`/`mus_uneasy`/`mus_crisis`) under that licence, not MIT. The motion-capture animation clips in `game/public/assets/anim/` (review build, `?anim=mocap`) are retargeted from the CMU Graphics Lab Motion Capture Database: the data used in this project was obtained from mocap.cs.cmu.edu, the database was created with funding from NSF EIA-0196217. Sources and licences per asset: [docs/art/manifest.md](docs/art/manifest.md).
- **AI-generated code and content.** The code, documentation, 3D models (procedural Blender scripts), sounds and most texts were produced with AI assistance under the owner's direction: Claude Code (Claude Opus 5.5 and Claude Fable 5.1, multi-agent sessions) wrote the engine, client, server, contract, art pipeline and docs; Codex worked on the UI polish branch (`codex/premium-ui`); independent reviewer agents did the game-design and economy reviews (`docs/math/`). The owner designed the game, made every product decision (`docs/decisions.md`), supplied the lobby background art and the HUD mockups, and reviewed the results.
- The theme is inspired by the film *Arrival* (2016). No names, characters or visuals from the film are used.

## Related projects

None. Forget to Foresee is the only NEAR Hackathon submission of its developer, Lambada_eth.

## License

MIT, see [LICENSE](LICENSE).
