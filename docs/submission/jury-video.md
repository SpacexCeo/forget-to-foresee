# Jury video (60 s): storyboard

Task J3 (owner brief 09.11): one 60 s English video for the jury and the hackathon X post. It explains the mechanics and
sells the game. Rules for this cut: no flicker; every line readable on a phone inside the X app; nothing shown that
does not run; anything illustrated is drawn as a diagram, never as a fake UI.

Status: **storyboard, waiting for the lead's review.** Script: `tools/capture/shots/jury.mjs`. The motion-graphics
pages are `game/cine/jury-*.html`, dev server only and not part of the game build.

## Format and craft

| | |
|---|---|
| Output | 1920×1080, 60 fps, H.264 High yuv420p, AAC, `+faststart`, ≤ 60.0 s, under 90 MB; SRT; contact sheet of keyframes |
| Text | At most 3 words per second. Each line holds for at least 1.5 s. Body text ≥ 44 px, titles ≥ 72 px at 1080p. Cream ink `#f3e7c4` on a dark scrim (contrast ≥ 7:1). |
| Safe area | All text sits inside a 5% horizontal and 8% vertical margin. Nothing important goes in the bottom 12%, where X's mobile player puts its scrubber and buttons. |
| Fonts | Atkinson Hyperlegible for body text, Source Sans 3 for labels, Libre Caslon for the title (the game's title face). All three are bundled in `game/node_modules/@fontsource`. |
| Motion | The game's tokens from `game/src/ui/motion/index.js`: `ease.out` / `ease.emphasized`, durations 200–640 ms, rise 12 px. The seal uses the "settle" spring, which overshoots once. |
| Anti-flicker | In-engine shots use the existing capture path: virtual clock, frozen governor/autoTier/adaptive resolution, and the luma/black-edge check that fails a shot. Motion-graphics pages draw each frame as a pure function of `t` (`window.__jury.render(t)`) under the same virtual clock, so every frame is identical on every run. |
| Sound | The game's own stems through `lib/mix.mjs`: music rises with tension (35 → 92 at the crisis), falls to 40 at the vote and to 8 at the end card; stingers are `gift_chime`, `guest_spike`, `guest_call` and `sting_survived`. No voice-over. |

## Shot list

`IE` = in-engine (GPU final, current Iris and current Guests). `MG` = motion graphics (HTML/SVG page, renders on CPU,
final quality). Times are on the final timeline, and cuts land on whole seconds of the 60 bpm music.

| # | Time | Kind | Picture | On-screen text (words · hold) | Source of every claim |
|---|---|---|---|---|---|
| 1 | 0.0–4.0 | IE `emerge` | Out of black: the Guest comes forward through the mist and draws the ring sign on the glass. Iris stands small in front. | "They draw the future." (4 w · 2.6 s) | `docs/guests-stage.md`; `guestSign` action |
| 2 | 4.0–6.5 | IE `island` | Crane over the archipelago: four Shells hovering, six camps, bridges | "Four Shells. Six clans. One message." (6 w · 2.2 s) | README product paragraph; `scenes/layout.js` |
| 3 | 6.5–8.0 | IE `ink` | Push in on the glass as the ink ring closes | none | as 1 |
| 4 | 8.0–12.0 | MG `decode` | The real sign of trial 3 (judge leaf #0, drawn by the game's `drawLogogram`). Each slot lights up and a large label flies out: **PLACE** Shell II · **ACTION** Gift · **POWER** 20 · **DELAY** trial 3. Then a yes/no chip pops on one stroke. | "Read the sign, slot by slot" (6 w · 2.0 s) → "Ask the Guests: yes or no" (6 w · 2.0 s) | engine `MEAN`/`SLOTS`; leaf 0 = `{t:3, place:1, action:0, power:1}` (`docs/near.md`); `askGuests` (5 silk, refunded on "no" in v3) |
| 5 | 12.0–15.0 | IE `forget` | Walk path, trial 4. Memories panel → **Forget it for a vision** → the vision cards arrive. | "Forget a memory forever…" (4 w · 2.8 s) | README judge table row 6; `forget()` |
| 6 | 15.0–17.5 | MG `shard` | The memory card cracks into a shard. Arrows lead to "2 future signs, seen first" and "Shard → auction". | "…to see the future first" (5 w · 2.3 s) | `forget()`: a vision shows as many signs as the memory weighs; Call weighs 2 |
| 7 | 17.5–20.5 | IE `faces` | Three 1-second close-ups of the round-5 clan agents (Moss, Salt, Frost) | "Six clans. Each one an agent." (6 w · 2.6 s) | README; `agent_<clan>.glb` |
| 8 | 20.5–25.0 | MG `agents` | Six clan cards in a ring. Each card shows its silk (60 at the start), its temper (Honest / Greedy / Wary) and one memory. Lines pulse between the cards: **Frost bids 13** for Iris's shard (sold), **Ash: pact, fragments by trial 14** (a solid line = kept), **Moss: loan 15, repay 25** (dashed, then it breaks in red = broken). | "Silk, a memory, a temper" (5 w · 1.8 s) → "They bid, lend, make pacts… and break them" (8 w · 2.6 s) | `PERS` (h/g/p) in `rules-baseline.md`; shard 7 → Frost for 13 (`judge-shards-args.mjs`); `offers()` t5 Ash pact by 14, t3 Moss loan 15 → 25 |
| 9 | 25.0–30.0 | MG + IE `api` | Split screen. Left, labelled **Browser**: the in-engine stake shot (reading card, F stakes 10 silk). Right, labelled **AI agent · HTTP API**: a terminal types `node examples/agent.mjs` and then the real output lines (`session s-… (rules v3)`, `tick 2: anchor Shell 1 @ tick 3`, … `"rejected": 0`, `"firstProofVerified": true`). The endpoints `POST /v1/sessions` and `POST /v1/sessions/{id}/commands` show above. | "Humans and agents. Same rules." (5 w · 2.0 s) → "Open HTTP API · OpenAPI 3.1" (5 w · 2.0 s) | README "Second path"; real output saved in `docs/submission/jury-video-agent.txt`; `server/` routes. Wording is "same rules / same room code", **not** "the same live room": the browser runs the room locally and does not talk to the HTTP server. |
| 10 | 30.0–35.0 | MG `season` | Timeline 1→17. Each trial lights up in turn. From trial 3, a ✓ lands on each reveal. The tension meter fills. | "17 trials. Every reveal checked ✓" (5 w · 2.4 s) → "Tension rises" (2 w · 1.6 s) | 15 leaves for ticks 3–17; `addH` |
| 11 | 35.0–38.0 | IE `crisis` | Inside a Shell at trial 13: the giants loom, the mist churns | "Trial 13 · The crisis" (title, 4 w · 2.4 s) | `crisis()`; guests-stage `crisis` cue |
| 12 | 38.0–41.0 | MG `ash` | The six-card ring again. Ash's links snap (red) and Ash's card dims: **isolated**. A key icon: "Ash's Key: hash matches the commitment ✓", and the links re-form in gold. | "Ash cuts every tie" (4 w · 1.5 s) → "Ash's Key restores them ✓" (4 w · 1.5 s) | `crisis()` breaks Ash's two weakest links and isolates Ash; `speakKey()` checks the hash and restores the links; the Ash key commitment is on testnet (`commit_ash_key` E3ppFx…) |
| 13 | 41.0–43.5 | IE `vote` | Before the vote: every Guest faces the visitor | "Trial 17. Gift or Weapon?" (5 w · 2.2 s) | `vote()`; guests-stage `vote` cue |
| 14 | 43.5–49.0 | MG `rewards` | **Top:** a stake of 10 silk on a Gift. The pot (10 / 20 / 40 / 80 by power) splits between two stakes, bars sized by how early each was placed (example: 20 → 12 + 8). Storm: the coin burns. Silence / Call: the coin returns. **Bottom:** four vote tiles: **GIFT** +60 each contributor · **WEAPON** all silk → 0 · **SURVIVED** +30 each contributor · **LOST** nothing. | "Stake early, earn a bigger share" (5 w · 2.0 s) → "A Storm burns it. Silence returns it." (7 w · 2.4 s); the tiles are labels (≈ 10 w, held 3.0 s) | `resolveTick` (weight = trials waited + 1, `apportion` = largest remainder, ties to the earlier stake; `apportion(20,[3,2])` = 12, 8); finale in `vote()` with `V3.finaleGift` = 60, `V3.finaleSurvived` = 30 |
| 15 | 49.0–53.0 | MG `nft` | The real token card, drawn from on-chain data: the ink-ring SVG of `793f6c05e89839f2-7` (the bytes of `shardSvg()`, identical on-chain) with its fields: memory **Iris · Call (weight 2)** · forgotten **trial 4** · auction **Frost, 13 silk** · opened **sign #4, leaf 63903cca…** · season **793f6c05e89839f2**. Footer: `ftf-shards.testnet · NEP-171 · mint tx 2nqGqiVf…` | "The forgotten memory becomes an NFT" (6 w · 2.4 s) → "Minted on NEAR testnet" (4 w · 1.5 s) | `contracts/deployments/testnet-memory-shard-…json`; `docs/shard-nft.md`; mint args regenerated by `contracts/memory-shard/scripts/judge-shards-args.mjs` |
| 16 | 53.0–57.0 | MG `backend` | Animated data-flow diagram. Packets travel the lines and check marks pop at each approval: **Seed** → **Engine: 17 trials** → **Merkle root (SHA-256)** → **Coordinator** signs `commit_season` → **ftf-seasons.testnet** (tx `6TtWeZ3W…`). Each reveal: **leaf + proof** → the contract recomputes the leaf and folds the path ✓ (15/15) → **Browser: "Verified on NEAR testnet ✓"** (read-only RPC views). A side branch: **Shard → `mint_shard` → ftf-shards.testnet**, carrying leaf #3. A third input: **HTTP agent API → same engine**. | "Sealed before trial 1. Checked on NEAR." (7 w · 2.4 s) | `docs/near.md` (diagram, tx hashes, read-only client); `game/src/net/near-deployment.js` |
| 17 | 57.0–60.0 | MG `end` | End card over a slow drift of the ink ring | **Forget to Foresee** · spacexceo.github.io/forget-to-foresee/?demo=judge · Built at NEAR HACKATHON · Made by Lambada_eth | owner brief |

Total on-screen words ≈ 110 in 60 s. Every line stays under 3 words per second, and the checker enforces the 1.5 s
minimum hold.

## Truth notes (checked against the engine and the README)

- **The vote payouts use the game's rules (v3), not the 2D baseline.** The brief said gift +40 and survived +15. Those
  are the `baseline-2d-1` numbers. The browser and the API run v3, where they are **+60 and +30**
  (`V3.finaleGift`, `V3.finaleSurvived`). The video shows +60 / +30. Weapon (everyone's silk → 0) and lost (nothing) are
  the same in both rule sets.
- Stakes: a stake on the wrong Shell is refunded; a Storm on the staked Shell burns it; Silence and Call refund it (and a
  Call gives Iris a new memory). The pot is 10/20/40/80 by power, and an earlier stake weighs more (`t − placedAt + 1`).
- Only the judge season is on testnet. Live seasons stay local, and the diagram says so in a small footnote. The seed
  box reads "fixed seed (judge)"; the ftf-seed/1 protocol for live seasons is a footnote under it, because those roots are
  not committed on-chain.
- The browser never signs. The commit and the reveals were sent by the coordinator's script, and shards are minted by
  the coordinator, not by the player's session. The diagram draws the coordinator as its own node.
- The shard's leaf is **checkable** against `ftf-seasons.testnet` (the same bytes as leaf #3). The shard contract does
  not call the season contract to check it, so the diagram uses a dotted "same leaf" line with no check mark there.
- The clans' wallets hold in-game silk. There is no NEAR payment, no token and no real money. The clan agents are
  deterministic heuristics with tempers, not an LLM: the video says "agent" and never "AI decides".
- No HUD element shows shard NFTs yet, so the NFT appears as a motion-graphics card built from the real token data.
- "Humans and agents. Same rules.": the browser and the HTTP API run the same room module and engine, but not the same
  live session. The split screen is labelled as two windows, not one shared game.

## Illustrated, not captured

Shots 4, 6, 8, 10, 12, 14, 15, 16 and 17 are motion graphics. Their data is real (the judge season's leaf #0, shard 7's
token, the tx hashes, the engine's numbers, the agent's real output), and they look like diagrams, not like the game's HUD.
The terminal in shot 9 replays the saved output of a real run (`node examples/agent.mjs --time-scale 1000`, 09.11). It is
typed at reading speed, not in real time, and is labelled "replay of a real run".

## In-engine shots for the GPU

`emerge`, `island`, `ink`, `forget`, `face-moss`, `face-salt`, `face-frost`, `stake` (the left half of shot 9), `crisis`
and `vote`. They are rendered with the current Guests (Task O, on the integration branch) and with the new Iris if her
glb lands by 11.11 12:00 Kyiv; otherwise they use the current Iris, and the report says so.
