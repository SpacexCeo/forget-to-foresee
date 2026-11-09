# Jury video (60 s): storyboard

Task J3 (owner brief 09.11): one 60 s English video for the jury and the hackathon X post. It explains the mechanics and
sells the game. Rules for this cut: no flicker; every line readable on a phone inside the X app; nothing shown that
does not run; anything illustrated is drawn as a diagram, never as a fake UI.

Status: **storyboard approved by the lead (09.11); v2 restructured around the two pillars at the owner's request.** Script: `tools/capture/shots/jury.mjs`. The motion-graphics
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

## Shot list (v2, 09.11: two pillars)

The owner asked for two pillars, each with a title card and the most screen time: **I · the agents** (six AI clans
with silk, memory and temper; your own AI agent over the HTTP API) and **II · the memory shard** (a forgotten memory
becomes a NEP-171 NFT bound to the sealed season). The seal, the season, the rewards and the backend support them.
`IE` = in-engine (GPU final). `MG` = motion graphics (`game/cine/jury.js`, CPU, final quality). Every MG scene opens
with the ink-ring wipe; every element moves (enter with the motion tokens, lines draw on, packets travel, numbers count).

| # | Time | Kind | Picture | On-screen text |
|---|---|---|---|---|
| 1 | 0.0–2.5 | IE `emerge` | The Guest comes through the mist and draws the ring sign; Iris small in front | They draw the future. |
| 2 | 2.5–4.5 | IE `island` | Orbit over the archipelago: four Shells, six camps | Four Shells. Six clans. |
| 3 | 4.5–6.0 | IE `ink` | Push in on the glass as the ink ring closes | — |
| 4 | 6.0–10.5 | MG `decode` | The judge season's first sign drawn by the game's `drawLogogram`; each slot lights and its value flies out: Place Shell II · Action Gift · Power 20 · Delay trial 3; then "Gift?" → "Yes ✓" | Read it slot by slot. / Ask the Guests. |
| 5 | 10.5–12.5 | MG `pillar-agents` | Title card **I · The Agents** over the sign's ring | Six AI clans scheme around you |
| 6 | 12.5–14.0 | IE `face-moss` | A clan agent up close | — |
| 7 | 14.0–20.0 | MG `agents` | The six cards (clan material, temper), silk counting up to 60; three real judge-season moments on their ties: Frost wins Iris's shard (−13 / +13), Salt whispers "It is a weapon" (a broadcast ring, no tie), Ash cheats Amber (−16 / +16, the tie breaks) | Silk, a memory, a temper. / They trade… and break trust. |
| 8 | 20.0–24.5 | MG `api` + IE | Two labelled windows: "You · in the browser" (in-engine stake shot) and "AI agent · HTTP API" (a replay of a real `node examples/agent.mjs` run) | Your AI agent can play a whole season via our HTTP API. |
| 9 | 24.5–26.5 | MG `pillar-nft` | Title card **II · The Memory Shard** | Your agent pays for prophecy with a memory |
| 10 | 26.5–29.0 | IE `forget` | Walk path, trial 4: Memories → Forget it for a vision (the Call) | Forget a memory forever… |
| 11 | 29.0–32.0 | MG `shard` | The memory card cracks into the shard; the two future signs its vision opened; the shard to auction | …to see the future first. |
| 12 | 32.0–37.5 | MG `nft` | Token `793f6c05e89839f2-7`: the on-chain ink-ring SVG drawing itself, its fields, the season root, the opened leaf joined by a dotted "same" line to leaf #3 on ftf-seasons | Bound to the sealed season. / Minted on NEAR testnet. |
| 13 | 37.5–41.0 | MG `season` | 17 trials; a seal on each of the 15 reveals; crisis at 13, vote at 17; the tension line | 17 trials. Every reveal checked. / Tension rises. |
| 14 | 41.0–43.0 | IE `crisis` | The giants loom at the glass | Trial 13 · The crisis |
| 15 | 43.0–47.0 | MG `ash` | The six cards; Ash's real broken ties; the Key's seal on the Iris–Ash tie: SHA-256(phrase · salt) = d1a39714…5d99b6; the ties relight | Ash turns away. / Ash's Key restores them. |
| 16 | 47.0–49.0 | IE `vote` | Every Guest faces the visitor | Trial 17: Gift or Weapon? |
| 17 | 49.0–53.5 | MG `rewards` | The Gift pot ring splits 12 / 8 by how early; Storm burns, Silence and Call return; the four outcomes | Stake early, bigger share. / Then the vote pays out. |
| 18 | 53.5–57.0 | MG `backend` | Seed → engine → Merkle root → coordinator → ftf-seasons (seal: leaf + path checked) → browser (seal: Verified on NEAR testnet); HTTP agent API → engine; mint → ftf-shards (dotted "same leaf #3") | Sealed before trial 1. Checked on NEAR. |
| 19 | 57.0–60.0 | MG `end` | Forget to Foresee · spacexceo.github.io/forget-to-foresee/?demo=judge · Built at NEAR HACKATHON · Made by @Lambada_eth | — |

Pillar screen time: agents 14.0 s (shots 5–8) + the crisis of an agent (shot 15, 4.0 s); memory shard 13.0 s (9–12).

## Verified facts (every number, account, hash and arrow, with its source)

| On screen | Value | Source |
|---|---|---|
| Judge sign #1 | Shell II · Gift · power 20 · trial 3 | engine event `t:3` of seed `cc161d30…` via `tools/capture/jury-data.mjs`; `docs/near.md` leaf 0 |
| Ask the Guests | a "no" refunds the 5 silk (v3) | `engine.js` `askGuests`, `V3.askRefundOnNo` |
| Starting silk | 60 for every clan | `engine.js` `newSeason` (`silk: [60, …]`) |
| Tempers | Salt cunning (h .35), Ash wary (p .85), Moss honest (h .92), Amber greedy (g .9), Frost scholar (learning .8) | `engine.js` `PERS`, `docs/rules-baseline.md` |
| Frost wins Iris's shard for 13 | Frost −13, Iris +13 (the price goes to the seller) | judge shard 7 (`judge-shards-args.mjs`); `engine.js` auction close |
| Ash cheats Amber of 16 | Ash +16, Amber −16; Amber cuts the tie (trial 8) | judge-season log (`jury-data.json` `crisis.breaks`); `engine.js` cheat |
| Salt: "It is a weapon" | broadcast at trial 13 | judge-season log; `engine.js` `crisis()` |
| Agent run | `session … (rules v3)`, `tick 2: anchor Shell 1 @ tick 3`, `"rejected": 0`, `"firstProofVerified": true` | `docs/submission/jury-video-agent.txt` (real run, 09.11) |
| Shard 7 | token `793f6c05e89839f2-7`, Iris, Call, weight 2, forgotten trial 4, Frost 13, opened sign #4 (leaf index 3) `63903cca…`, root `03dbd458…` | `contracts/memory-shard/scripts/judge-shards-args.mjs`; `docs/shard-nft.md`; `docs/near.md` |
| Shard SVG | byte-identical to the game's `shardSvg()` | `game/src/net/shard-nft.js`; `docs/near.md` |
| Mint tx | `2nqGqiVf…` on `ftf-shards.testnet`, minted by the coordinator | `contracts/deployments/testnet-memory-shard-…json` |
| 17 trials, 15 reveals (trials 3–17), crisis 13 | `TICKS = 17`, `CRISIS = 13`, 15 leaves | `engine.js`; `docs/near.md` |
| Crisis ties | Ash cut Iris and Salt (trial 13); Amber–Ash broken since trial 8; Moss and Frost stay | judge playthrough at trial 14 (`jury-data.json` `crisis`) |
| Ash's Key check | SHA-256(`ftf:key:v2|season|phrase|salt`) = `d1a39714…5d99b6`, committed on testnet before trial 1 (`commit_ash_key` E3ppFx…); the browser compares; not revealed on-chain | `engine.js` `keyCommit`, `speakKey`; `docs/near.md` |
| Gift pot | 10 / 20 / 40 / 80 by power; split by weight trials-waited + 1; `apportion(20, [3, 2]) = 12, 8` | `engine.js` reveal and `apportion` |
| Storm / Silence / Call | Storm burns the stake; Silence and Call return it | `engine.js` reveal |
| Vote | Gift +60 each contributor; Weapon everyone's silk 0; Survived +30 each contributor; Lost nothing | `engine.js` `vote()` with `V3.finaleGift`, `V3.finaleSurvived` |
| Commit tx | `6TtWeZ3W…` to `ftf-seasons.testnet` by `ftf-coordinator.testnet` | `game/src/net/near-deployment.js`; `docs/near.md` |
| Arrows | coordinator → contract (signed txs); contract → browser (read-only RPC views); agent API → engine; coordinator → ftf-shards (mint) | `docs/near.md` "What runs where"; `game/src/net/near.js` |

## v3: the cinematic test (18.5 s), after the owner's art-direction brief (09.11)

The owner rejected the 18.5 s motion-graphics draft as the visual direction: **the world comes first**. The story
order is: the world creates emotion, the agents create conflict, the memory creates mystery, the blockchain provides
proof. v3 rebuilds the test on **in-engine footage** (GPU, frame-stepped, the anti-flicker path). The interface and the
data are **anchored in depth**: a new layer module (`game/src/cinematic/layers.js`) projects world positions through
the shot's camera every frame. A clan's name sits on that clan's camp, a link runs between two real camps, and the
token assembles out of the shard's own screen position. The layers are rendered by the same virtual clock as the
frame. No flat cards fill the screen and no blurred gameplay sits behind UI. Script: `tools/capture/shots/jury-test.mjs`.

Legend: **R** = real in-engine (models, environments, lighting, Guests, VFX). **D** = data layer anchored in depth
(DOM/SVG in the game's type and tokens, projected each frame). **A** = new artwork: none needed for the test; every
visual is an existing game asset or the contract's own SVG.

| Time | Shot | Camera | Environment and subject (R) | Data layer (D) | Sound |
|---|---|---|---|---|---|
| 0.0–3.0 | `fly-in` | Crane-dolly from inside the cloud deck (y ≈ 95) down through the mist; the archipelago opens beneath; ends in a slow drift over the plaza ring, the four Shells framing it | Sky, the cloud sea, fog, the island, the camps, the Shells hovering | 1.2 s: the chapter title **I · The Agents** emerges from the haze (opacity and a blur that sharpens: the "atmosphere" reveal), held 1.6 s | wind bed, music tension 30 → 40 |
| 3.0–4.5 | `clans-back` | Low lateral dolly along the back of the ring (Salt → Iris → Frost camps), 45° look-across, foreground camp silhouettes passing | Real agent models idling at their camps; their camp architecture | Each clan's **name** (Libre Caslon, 120 px) and **temper** (44 px tracked) pinned above its head, entering in a stagger as the camera passes (expo-out, rise) with a fine anchor stem down to the head | one soft `ui_notify` per name |
| 4.5–6.0 | `clans-front` | The mirror move along the front (Ash → Moss → Amber) | as above | as above | as above |
| 6.0–9.0 | `conflict` | High three-quarter crane over the plaza, slowly rotating, all six camps in frame | The island at golden hour, agents at camps | Links **drawn between the real camps** in depth, one event per beat: 6.2 Frost → Iris (gold line, a packet travels, "Frost buys Iris's memory · 13 silk"); 7.2 Salt's ring broadcast expands over the island ("Salt: 'It is a weapon'"); 8.0 Ash → Amber (rust line, then it **snaps**: "Ash cheats Amber · 16"). Hero line per beat, metadata small | `bid_tick`, `guest_spike` (rumor), `storm_crack` (snap); music 40 → 60 |
| 9.0–12.0 | `shard-macro` | Slow push-in macro on the shard on its pedestal at the Iris plateau (0.4 m crystal in a bronze clasp; glTF transmission and volume), shallow depth (long lens, fov 18 → 12) | The physical shard, its refraction of the island behind, the pedestal | 9.4 title **II · The Memory Shard** low; 10.4 ink cracks draw across the crystal (anchored to the shard); 11.0 the vision's **two real future signs** rise out of it as ink rings (judge signs #4 and #6) | `memory_dissolve`, `vision_whoosh`; music dips to 35 |
| 12.0–15.0 | `token` | The camera arcs 40° around the shard, pulling back to a medium | The shard and the pedestal, the camp behind out of focus | The contract's on-chain SVG **assembles from the shard's position**: its rings and strokes fly in and lock (the bytes of `shardSvg()`). Hero: **Token 793f6c05e89839f2-7**. Secondary: Iris · Call · forgotten trial 4 · sold to Frost, 13. 14.0 the **season seal** ring closes around it: root 03dbd458… | `ui_confirm` on lock |
| 15.0–18.5 | `proof` | Crane up and back from the pedestal toward Shell II hovering over the island (the Shell where sign #1 came true) | The island, the Shell, the sky | A dotted line runs from the token up to the Shell, where a node reads **ftf-seasons.testnet · leaf #3**. Climax line, large: **"Same leaf, sealed on NEAR testnet."** Small: mint 2nqGqiVf… · ftf-shards.testnet | `gift_chime`, music resolves 60 → 30 |

Truth notes for v3: the three events, the token data, the root and the leaf are the verified values in the table
above. The dotted line is "same leaf" (the shard contract stores it and does not call ftf-seasons), so the climax says
"same leaf" and puts no check mark on the link. Shell II is chosen only as the visual anchor for the season contract,
because sign #1 came true there; the diagram does not claim that the leaf lives in that Shell.

GPU: the six in-engine shots render at 1080p60 ultra through `gpu-job.sh` on the RTX 4090. They are drafted first at
480×270 on this container's CPU to check staging, labels and timing.

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
