# Demo video: shot list

Master cut 2:42, X cut 2:04 (under 2:10). Source: docs/plans/sprint/FTF-5h-Six-Agent-Sprint.md 11.2-11.3. Every shot shows only what is live on the recording day; use the alternates otherwise.

### 11.2 Rules for the video

- It shows only things that exist in the live build on the day. If a shot's feature is not live (for example the whitelist pass), use the alternate line and card written for that shot; never show a mock as real.
- Testnet is said out loud and shown on screen ("practice network, no real money").
- Silk is the only currency named. Iris is a doctor of languages from 2048 (never "AI"). English only.
- Every on-chain claim is followed by a clickable NearBlocks page in the same shot (real transaction hash).
- The "Demo data" chip is visible whenever a demo seed is on; recording uses real silk on chain for the portal (8.5).

### 11.3 Shot list with timestamps (master cut and X cut)

| Shot | Master time | X-cut time | What is on screen (exact actions) | Setup | On-screen caption (lower third, 28 px) | Must be visible (pass check) |
|---|---|---|---|---|---|---|
| **V1** Lab prologue hook | 0:00 to 0:12 | 0:00 to 0:10 | Title card "FORGET TO FORESEE", Iris jogs into the lab (P2), the red key press (P5), the device wakes (P6), she approaches (P7), **"Oh no..." voice and subtitle (P8)**, the vortex pulls her (P9) | `?intro=1`, prologue cut in the edit from the 38 s original (keep P2 1.5 s, P4 1.5 s, P5 1.0 s, P7 2.0 s, P8 2.5 s, P9 3.5 s) | "2048" | the title, the key, the vortex, the subtitle "Oh no..." |
| **V2** Town and the reason | 0:12 to 0:24 | 0:10 to 0:22 | wake-up (W1 to W3, 3 s), dialogue lines W10 and W13 (6 s), the "What waits for you" card flash (3 s) | continue from V1 or `?intro=1` retake | "She needs 200 silk to go home" | townsfolk ring, the Gate-Loom dormant, the card's seven rows |
| **V3** Quest journal | 0:24 to 0:38 | 0:22 to 0:32 | press **J**: the journal list (Story tab), select "Stone Spiders on the Road" showing 7/10 and the giver "Guard" and the reward; **click the row again: Iris runs** to the Guard; press **W** mid-run: she stops; close | `?demo=video&intro=0` | "Quest journal" | tabs, counters, giver, reward, the run and the stop |
| **V4** Combat, HUD, skills | 0:38 to 0:56 | 0:32 to 0:46 | fight spiders: hotbar cooldown sweeps, mana, damage numbers (white and gold crit), the objective counter reaching 10/10, the level-up banner, press **N**, learn "Echo Word", it appears on slot 5 and is cast | `?demo=video&intro=0` | "Skills, cooldowns, levels" | sweeps, numbers, banner, tree with three branches |
| **V5** Chests and loot | 0:56 to 1:10 | 0:46 to 0:56 | a legendary orange beam, pickup, press **I** (bag shows "This device" and "On NEAR" badges), **Open all (8)**, the animation, the results grid with "Verified ✓", click one link to the NearBlocks page, the odds table | 8 sealed chests from the seed; relayer live | "Chests: odds shown, drawn on NEAR" | beams by rarity, badges, the batch result, a real explorer page |
| **V6** Play-money games | 1:10 to 1:22 | 0:56 to 1:02 | press **B**, **Games** tab, the first-open modal ("Play-money games…") and **I understand**, spin the wheel, roll the dice once (odds and the 4% edge visible) | `?demo=video` | "Play money. No cash value." | disclaimer, odds table, a roll with Verify |
| **V7** Trade | 1:22 to 1:42 | 1:02 to 1:18 | two windows side by side: Player A lists 10 spider silk thread at the price band, Player B buys 4; both silk numbers change, the ticker shows the trade with the settlement chip, the fee line "2% removed forever" | `?demo=market` in two profiles; chain settlement if deployed, else the Demo chip stays visible and the VO variant is used | "Players trade resources for silk" | the listing, the confirm, both balances, the ticker, the settlement label |
| **V8** Agent in the tournament | 1:42 to 1:56 | 1:18 to 1:28 | split screen: a terminal running `node server/examples/agent-tournament.mjs --agents 3`, then the tournament card with **Agent** badges and scores, then Add an agent | terminal font 18 px; no secrets visible | "Agents play too: no human needed" | the command, the badges, the sealed leaderboard |
| **V9** Portal on chain | 1:56 to 2:20 | 1:28 to 1:48 | the Road Home bar at 200 / 200 and the chip tooltip, walk to the Gate-Loom, the prompt, the confirm "Pay the Gate-Loom?", pay, the transaction hash, **the NearBlocks page for the `pay_gate_for` transaction**; then the Gate-Loom flares and cuts to black | real silk on chain (8.5); NearBlocks tab pre-loaded | "200 silk, paid on chain, burned" | the hash text, the explorer page with the method name and the receiver `ftf-town` |
| **V10** Leaderboard | 2:20 to 2:32 | 1:48 to 1:56 | the Shell wall board: ranks, Player and Agent badges, Iris's rank | `?demo=video` | "The Shell wall" | ranks and badges |
| **V11** Closing | 2:32 to 2:42 | 1:56 to 2:04 | end card: title, the live URL, the repo URL, "Built at NEAR HACKATHON · practice network · play money", music out | static | URL and repo (large, 32 px) | links readable for 3 s |

**Alternates (use only if the feature is not live):** V9 ending when the whitelist pass is **not** live: replace the third VO line (M19 and X14 in 11.4) by "But the Gate-Loom has other plans. To be continued." and end on a black card "To be continued". V7 when the trade settles only in the demo store: use VO variant M14d and keep the **Demo** chip visible in the shot. V1 when the prologue is not ready: use the title card and the wake-up only (2 s title, then V2).
