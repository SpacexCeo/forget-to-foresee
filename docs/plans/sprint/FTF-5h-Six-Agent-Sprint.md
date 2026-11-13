# Forget to Foresee: 5-Hour Work Order for Six Parallel Agents

> **Owner, 13 Nov 02:50 Kyiv: run it exactly as written.** Branch `sprint/5h` is cut from `main`; agents push `sprint/5h-aN` and
> open PRs into `sprint/5h`; A5 merges the waves (the lead does it until A5 starts); the final merge to `main` is the owner's.
> Seats: A1 = story worker, A2 = combat worker, A3 = economy/relayer worker, A4 = art worker, A5 = HUD/jury worker, A6 = Fable.
> Pause 06:55–07:40 Kyiv. Owner rule: no other project's name anywhere in the repo.


*Owner's voice. English only. Written Friday 13 November 2026, about 02:20 Kyiv time (UTC+2). Source repo: `SpacexCeo/forget-to-foresee`, checked at `origin/main` 5b4ad54c (13 Nov 2026 01:23 Kyiv). Sibling specs reused: `FTF-Owner-Master-Plan.md` (called MP below), `FTF-City-Economy.md`, `FTF-Story-Quests-Leaderboard-TZ.md` (STZ), `FTF-Jury-Review-2026-11-13.md`, `FTF-a reference game-Teardown-TZ.md`, `FTF-Submission-Checklist.md`.*

Legend: **[V]** = I or an agent verified it in code, on the live relayer, or on chain. **[VERIFY]** = path or fact not yet confirmed: the agent confirms it in its first 15 minutes and writes the correction into `docs/sprint/BOARD.md`. **I will do myself** = owner-only step (keys, mainnet, contract deploy, merge to `main`, tag, posting).

---

## 0. What I want from these five hours

I want five hours of work, six agents in parallel, that turn Forget to Foresee from "a game with a deep chain backend" into **a game a stranger understands in under a minute and enjoys for ten**. The jury will see three things: the first five minutes (lab prologue, wake-up, townsfolk, first quest), the loop (quests, spiders, loot, trade, agents), and the proof (a 200 silk portal payment on chain with a NearBlocks link).

| Agent | Model | Owns (one line) |
|---|---|---|
| **A1** | Opus 5.5 | Quest journal (list, like the best RPGs), quest tracker, auto-walk to the quest giver, starter guide, the portal prompt and the Gate-Loom copy |
| **A2** | Opus 5.5 | HUD, hotbar and cooldowns, skills, progression (XP, levels, stats), skill tree, keybindings and rebind screen, minimap, silk chip display |
| **A3** | Opus 5.5 | Trade and marketplace (player to player, resources for silk), chests and loot, the wheel and the dice (play money), **the single silk balance model**, on-chain wiring, the chest service fix |
| **A4** | Opus 5.5 | New-player experience and lore dialogue, townsfolk and elders script, first-open tooltips, in-game glossary, "What's next" card, voice placeholder, agent entry in the tournament |
| **A5** | Opus 5.5 | Integration captain: the shared seam (bus, flags, tokens, tooltip), tests and CI script, performance, dynamic-import retry, feature flags, README and judge page, demo seed, and the demo video (script, voice-over, capture) |
| **A6** | Fable 5.2 | 3D lab scene, Iris run-and-return animation, device activation, time-vortex VFX, wake-up shot in town, and the Iris skirt/leg clipping fix |

### 0.1 Hackathon video length rule (checked)

- **There is no video length limit.** I fetched the live rules file `https://nearhackathon.com/HACKATHON.md` on 13 Nov 2026 at about 02:10 Kyiv time and searched it for length, seconds, minutes, duration and maximum. Nothing sets a limit. The rules only say the post on X needs "video or screenshots" (Q-012 adds: screenshots are not enough when judges cannot open the demo, so a video is wanted). The earlier audit in `/workspace/ftf-audit` has no limit either. **[V]**
- X itself limits uploads: about 2 minutes 20 seconds for a normal account (longer for Premium). **[VERIFY at posting time; this is outside the hackathon rules.]**
- So my rule: **master cut 2:42 (162 s)** for the repo, README and a video host; **X cut at most 2:10 (130 s)** made by dropping marked shots. Section 11 has both timelines.

### 0.2 What "done" means for the sprint

1. Everything below is on branch `sprint/5h` (PRs from agent branches), green on `scripts/verify-sprint.sh`, with feature flags on in `game/public/features.json`.
2. A stranger passes the **First-time Player Clarity** tests in section 1 (five testers, metrics in 1.7).
3. The four screenshot bugs are fixed and tested: truncated quest pill, 38 vs 128.64 silk, "chest service failed", "Local, kept in this browser only" label confusion (section 1.8 and the owning agents).
4. The demo video exists as a script, a voice-over, captions and a runbook (and clips if the box can render WebGL).

I will do myself: review the sprint branch, merge to `main`, deploy any contract change to testnet, tag, record or approve the final video, and post on X.

---

## 1. First-time player clarity (the top acceptance test for every agent)

**My top criterion:** a person who has never seen the game must understand everything they see. Every agent's work is tested against this section. If a feature passes its own tests but fails here, it is not done.

### 1.1 The twelve clarity rules (apply to every string, panel and number)

| # | Rule | How it is tested |
|---|---|---|
| R1 | **One clear next objective is always on screen** (the tracker's pinned line, or the guide step). Never empty after the first minute. | E2E: poll for 10 minutes of scripted play; the objective element exists and is non-empty at every sample. |
| R2 | **Every number and currency is explained on first appearance**: silk, XP, level, mana, HP, Gate price, odds, fees. A first-seen tooltip names the unit in one plain sentence. | Unit: the `firstSeen` registry has an entry for each id in the table 1.5; E2E: first appearance opens the coach mark once. |
| R3 | **Silk is one number with a visible breakdown.** The headline number is the silk that counts toward the Gate; the tooltip splits on-chain silk, pending silk and play silk (browser only). The same number appears in the HUD, the tracker, the portal prompt, the journal and the market. | Unit: one function `silkView()` feeds all five; E2E: read all five, assert equal. |
| R4 | **No jargon in player text.** Words NEP-245, NEP-171, relayer, RPC, testnet, TEE, Merkle, commit-reveal, gas, nonce never appear without a plain-English gloss next to them. Allowed on proof pages and in tooltips marked "For the curious". | Unit: a lint test scans `game/src/**/locales/en*.js` player keys for the banned words list in 1.6 and fails unless the key is whitelisted `curious.*`. |
| R5 | **Every UI panel has a first-open tooltip** (a coach mark, shown once, with "Got it" and a "?" button to see it again). | E2E: open each panel on a fresh profile; the coach mark appears once; second open shows none. |
| R6 | **Local versus on-chain is always labelled in plain words**: "Saved on this device only" versus "Recorded on NEAR (a public blockchain). Anyone can check it." | Unit: every inventory or balance row has a `scope` field (`device` or `chain`) and renders the matching badge. |
| R7 | **Text is never silently cut.** Truncated text always has a full-text tooltip and an expand control. | Unit: a DOM test finds elements with `text-overflow: ellipsis` and asserts each has `title` or an expand handler. |
| R8 | **Errors say what happened, why, and what to do next**, in that order, in one or two sentences, with no codes. The code goes to the console and the "Details" fold. | Unit: every error key matches the pattern `what / why / next` (three sentence fields in the catalogue). |
| R9 | **Every action that spends silk shows the price first and asks once.** | E2E: market buy, respec, dice, tournament entry, portal all show a confirm with the price. |
| R10 | **Skippable and replayable**: the intro, the guide, every coach mark, every cinematic. Settings has "Replay intro" and "Reset tips". | E2E: skip works; reset brings the tips back. |
| R11 | **Reading level**: sentences at most 20 words in UI; at most 25 words and 140 characters in a character's mouth; no sentence starts with a game term. | Lint on string length in tests. |
| R12 | **Contrast and size**: body text at least 14 px at 1920 wide (scales with `--u`), contrast at least 7:1 on panels; nothing important is only a colour. | Unit: a contrast function over the tokens; E2E: axe-style check on open panels. |

### 1.2 The first ten minutes, minute by minute

Times are for a first-time player who plays normally. "Explained" means the exact surface that explains it. Agents implement their rows; A5 builds the e2e that plays this script.

| Min | What the player sees | What they read | What they do | What is explained, and where | Owner |
|---|---|---|---|---|---|
| 0:00 to 0:05 | Loading ritual (existing `loadRitual` flag on), then black, then a title card "FORGET TO FORESEE" | "Year 2048." | Nothing (or Esc to skip) | Skip hint "Press Esc to skip" appears after 0.5 s | A5, A4 |
| 0:05 to 0:50 | 3D lab prologue: Iris returns from a run, checks the computer, the device wakes, she says "Oh no...", the vortex takes her | Subtitles only (see 9.4 shot list) | Watch, or skip | Nothing technical; just the premise | A6, A4 |
| 0:50 to 1:00 | Iris opens her eyes in town, townsfolk around her | Speaker plate "Townsfolk" | Press E or click to advance | Where she is | A6, A4 |
| 1:00 to 2:30 | Dialogue with the townsfolk and the Elder (script 7.3) | Why she is here, the Guests and the gift, the elders' reward, 200 silk to go home | Advance lines (about 18 lines) | Premise, the goal (200 silk), the Gate-Loom | A4 |
| 2:30 to 2:50 | "What waits for you" card (7 rows) with a **Start** button | The roadmap: quests, tournaments, chests, trade, leaderboard, NFT, Season 1 end and the way home | Press Start | The whole game in one card (rule R1 for the long goal) | A4 |
| 2:50 to 3:00 | HUD fades in. Tracker shows "Starter Guide 0/8" and the Road Home bar "Silk 0 / 200" | "Move with W A S D. Hold Shift to run." | Move | Controls | A1, A2 |
| 3:00 to 3:30 | Coach marks on silk chip, HP/mana, hotbar (one at a time, each dismissable) | "Silk is the town's money..." | Click "Got it" three times | Currency, bars, hotbar (R2, R5) | A4, A2 |
| 3:30 to 4:00 | The first quest "A Stranger at the Shell" is active; a waypoint arrow points to the Elder | "Talk to the Elder" with an auto-walk button | Walk (or click the quest for auto-walk) and press E | Quest tracker, waypoints, auto-walk (cancel with W A S D) | A1 |
| 4:00 to 5:00 | Quest complete toast "+8 silk, +30 XP"; silk chip ticks up; new quest "Stone Spiders on the Road" | "Kill stone spiders 0/10" | Walk to the marked field, press F near a spider | Combat keys, damage numbers | A1, A2 |
| 5:00 to 6:30 | First fights, XP bar fills, first level-up banner | "Level 2. You have 1 skill point and 3 stat points. Press N." | Open Skills (N), pick one node | Skill tree first-open coach mark | A2, A4 |
| 6:30 to 7:30 | First chest drops (the first kill always drops one) with a loot beam | "A chest! Walk over it to pick it up." | Pick it up, open Bag (I), press Open | Chest odds, "what is inside is decided on NEAR", plain-English gloss | A3 |
| 7:30 to 8:30 | Journal quest "Fair Exchange" ready | "Sell a resource to a player or to a stall." | Press B (Market), list or sell a resource | Market first-open mark, fees, local versus chain labels | A3 |
| 8:30 to 9:30 | Silk is climbing: HUD shows "128.64" with breakdown; Road Home "Silk 38 / 200" | Tooltip: "128.64 total: 38 on chain counts for the Gate; 90.64 pending sync. Press Sync." | Press Sync (or wait for auto-sync) | **The one-number rule R3** | A3, A2, A1 |
| 9:30 to 10:00 | Tournament card and "Bring a champion" side quest visible | "Agents can enter too." | Look, optionally enter | Tournament and the Agent badge | A4 |

**Time-to-first-quest target: under 60 seconds after control returns** (not counting the skippable intro). Time-to-understand-the-portal-goal: under 120 seconds from first load, measured by the tester question in 1.7.

### 1.3 The "What's next" roadmap card (exact copy; owner A4, shown after the dialogue, reopenable from the menu as "What's next")

Layout: modal 760 × 640 px at the centre of a 1920 × 1080 reference screen; header "What waits for you"; seven rows 72 px high; footer with **Start** (primary) and **Show me later** (secondary).

| # | Icon | Row title | One-line text |
|---|---|---|---|
| 1 | scroll | Quests | "Villagers need help. Finish quests for silk, XP and chests. Press J any time." |
| 2 | trophy | Tournaments | "Enter the Season Cup. Players and AI agents compete side by side." |
| 3 | chest | Chests and loot | "Monsters drop chests. Open them to find silk, items and rare collectibles." |
| 4 | coins | Trade | "Sell what you find to other players or to the stalls. Press B." |
| 5 | shell | The leaderboard | "The Shell wall shows who is ahead. Your name can be on it." |
| 6 | badge | Your NFT | "Finish the journey and claim a free collectible that proves you were here." |
| 7 | portal | Season 1 and the way home | "Gather 200 silk, step into the Gate-Loom and go home. Season 1 ends on 15 November." |

(Row 7's date: I confirm the Season 1 end date from the submission deadline in config before shipping; `[VERIFY]` in `docs/submission`.)

### 1.4 In-game glossary (owner A4; opened from the menu "Glossary" and from any underlined term; every entry is one or two sentences)

| Term | Plain-English entry |
|---|---|
| Silk | "Silk is the town's money. You earn it from quests, monsters and trade. It has no real-world value and cannot be bought." |
| Silk on chain | "Silk that is recorded on NEAR, a public blockchain, so anyone can check it. Only this silk can pay the Gate-Loom." |
| Pending silk | "Silk you earned that is not on chain yet. It moves on chain when you press Sync or automatically every minute." |
| Play silk | "Silk from the wheel, the dice and some chests. It stays on this device and cannot pay the Gate-Loom." |
| Gate-Loom | "The portal that can take Iris home. It costs 200 silk, paid once on chain and burned (removed forever)." |
| Burn | "Burned silk is destroyed. It keeps silk valuable for everyone." |
| NEAR testnet | "A practice version of NEAR. Nothing here costs real money and nothing here is worth real money." |
| Chest | "A box a monster dropped. What is inside is fixed by a public list and drawn at random when you open it." |
| Loot NFT | "A collectible item that lives in your account. Rare chests can give one." |
| Whitelist pass | "A free collectible for finishing the journey. It may give early access later. It promises no money." |
| Agent | "A program (often an AI) that plays on its own. Agents can enter tournaments and wear an Agent badge." |
| Season | "A set period with its own leaderboard. Season 1 ends on 15 November." |
| Level, XP | "XP comes from fights and quests. Enough XP raises your level, which gives skill and stat points." |
| Mana | "Mana powers your skills. It refills over time." |
| Cooldown | "The wait before you can use a skill again." |

### 1.5 First-seen registry (R2 and R5 made concrete; implemented once by A5 in `sprint/first-seen.js`, copy owned by A4 unless marked)

Each entry shows once per profile, key `ftf.tips.v1`, resettable. Trigger is the event name in the bus (section 3.4).

| Id | Trigger | Anchor | Title | Body | Owner |
|---|---|---|---|---|---|
| tip.silk | `hud.mounted` | silk chip | "Silk" | "Silk is the town's money. You need 200 to go home." | A4 |
| tip.hp | `hud.mounted` | HP bar | "Health" | "If it reaches zero you wake up at the town gate. Nothing is lost." | A4 |
| tip.mana | `hud.mounted` | mana bar | "Mana" | "Skills spend mana. It refills over time." | A4 |
| tip.xp | first `xp.gained` | XP bar | "Experience" | "Fights and quests fill this bar. A full bar is a new level." | A4 |
| tip.hotbar | `hud.mounted` | hotbar | "Skill bar" | "Press 1 to 9 to use a skill. The sweep shows the wait before you can use it again." | A4 |
| tip.minimap | `hud.mounted` | minimap | "Map" | "Yellow marks are quests. Press M for the big map." | A4 |
| tip.tracker | first `quest.accepted` | tracker | "Your goal" | "This is your current quest. Click it to open the journal or to walk there." | A1 |
| tip.journal | first `journal.opened` | journal | "Journal" | "All your quests are here with progress, who gave them and the reward." | A1 |
| tip.skills | first `level.up` | skills button | "Skills" | "You earned a skill point. Pick a path: Linguist, Scholar or Warden." | A2 |
| tip.bag | first `chest.dropped` | bag button | "Bag" | "Chests and items wait here. Press I." | A3 |
| tip.market | first `market.opened` | market | "Market" | "Sell resources to players or stalls. Prices follow a public rule." | A3 |
| tip.gamble | first `games.opened` | games tab | "Play-money games" | "These games use play silk. It cannot be bought or cashed out." | A3 |
| tip.portal | first `portal.near` | portal | "The Gate-Loom" | "It needs 200 silk on chain. Open your wallet tooltip to see how much counts." | A1 |
| tip.tournament | first `tournament.opened` | card | "Tournament" | "Players and agents compete. Agents wear a badge." | A4 |
| tip.chat | `hud.mounted` | chat | "Chat" | "Press Enter to talk to nearby players." | A4 |

Copy that states a game rule (for example `tip.hp`, "you wake up at the town gate") is checked against the code before it ships; if the rule differs, the copy changes, not the code.

### 1.6 Banned jargon list (R4) and the plain replacement

| Jargon (never in player text alone) | Plain replacement |
|---|---|
| NEP-245, NEP-171, multi-token | "collectible item" or "item" |
| relayer, coordinator, RPC, gas, nonce | "the game server" or "the network" |
| testnet | "practice network (no real money)" with a gloss the first time |
| on-chain / off-chain | "recorded on NEAR" / "saved on this device only" |
| TEE, enclave | "a sealed, checkable server" with a "For the curious" link |
| Merkle proof, commit-reveal | "a public list that cannot be changed" |
| guest account | "your player account (no password needed)" |
| burn | "removed forever" (and "burn" in the glossary) |
| mint | "create" |
| idempotency, request hash | never shown |

### 1.7 Fresh-player usability test script (A5 runs it at hour 4:30; owner reviews the results)

**Setup:** five testers who have never seen the game (not agents, not the team); a fresh browser profile; 1920 × 1080 screen recording and think-aloud; the live preview URL of the sprint build with `?intro=1` (forces the intro). Facilitator says nothing except the script. Total 15 minutes each.

**Tasks and success metrics**

| # | Task given verbally | Success | Metric |
|---|---|---|---|
| T1 | "Play. Say what you think is happening." (no help for 3 minutes) | Tester states the premise: a scientist from another place is stuck in a town and needs silk to go home | **Premise understood by at least 4 of 5** |
| T2 | "Do whatever you think the game wants." | Starts the first quest | **Time-to-first-quest under 60 s after control; at least 4 of 5** |
| T3 | "What is silk?" (after minute 5) | Says money / currency of the game | **At least 4 of 5 say it is the game currency** |
| T4 | "How much do you need to go home?" and "How much do you have that counts?" | Says 200; and the on-chain number from the tooltip | **Time-to-understand-the-portal-goal under 120 s; at least 4 of 5 correct on both numbers** |
| T5 | "Open your quests and tell me which one to do next and who gave it." | Opens journal (J or click), names quest and giver | **Under 20 s; 5 of 5** |
| T6 | "Go to the person who gave you the current quest." | Uses auto-walk or walks there | **Under 30 s; at least 4 of 5** |
| T7 | "Open a chest." | Opens a chest without help | **At least 4 of 5; zero error dialogs** |
| T8 | "Sell something for silk." | Completes one trade | **At least 3 of 5 without help** |
| T9 | "Is the silk in this window on the blockchain or only on your computer?" (on the Bag and on the wallet tooltip) | Answers correctly | **At least 4 of 5** |
| T10 | "What is the Agent badge?" (tournament card) | Says it is a program or AI player | **At least 3 of 5** |
| T11 | "What happens at the end?" | Mentions the portal and 200 silk (and the NFT if asked) | **At least 4 of 5** |

**Scoring:** a task fails for a tester if they needed a hint or took more than twice the limit. Sprint passes if every "at least" threshold holds. Any tester who asks "what does this mean?" about a word adds it to the confusion log (1.8). A5 files the results in `docs/sprint/usability-results.md` with the confusion log, and the owning agent fixes within the sprint if time remains; otherwise they go to the "Later" list.

### 1.8 Confusion checklist from the owner's screenshots (each item is a ticket; all must be closed or consciously deferred)

| # | What the screenshot showed | What a first-time player thinks | Root cause found in code | Fix and owner | Test |
|---|---|---|---|---|---|
| C1 | Top quest pill reads "Optional: the innkeeper on the low..." (cut off) | "Is this broken? What is the rest?" | **[V]** `town-quests.js` builds `.ftf-story-goal` with `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none`, so long keys such as `quest.obj.read` ("Optional: the innkeeper on the lower street has a sign to read") are cut and the pill cannot be clicked | Replace the pill with the clickable, wrapping tracker (A1, section 4.8); click opens the journal; tooltip and expand show full text | Unit + e2e: longest objective string is fully readable at 1280 px and 390 px widths; click opens the journal |
| C2 | HUD shows 128.64 silk, while the Gate-Loom prompt says "You hold 38" and the tracker "38 / 200 silk" | "Which one is true? Do I have enough?" | **[V]** two different stores. The HUD chip reads `ledger.silk` (the browser's town ledger: all silk, local). The tracker and the portal prompt use `balanceC()` in `town-quests.js`: `chain.ok ? max(chain.balanceC, ledger.earnedVerifiedC) : 0`, the **on-chain** balance of `ftf-town` (silk the relayer's `syncCredit` has credited, only for the verified story log, capped per day and by `killVerifyCapC`). The 90.64 difference is silk earned locally that is not on chain (unverified sources, not yet synced). Also `balanceC()` returns 0 when the chain read fails, so the number can jump | One `silkView()` model (A3, section 6.2): HUD, tracker, portal, journal and market all use it; HUD headline = silk that counts toward the Gate; tooltip breakdown; "Sync now" button; portal copy explains which silk counts (A1, A2) | Unit: `silkView()` table of cases; e2e: all five surfaces show the same number |
| C3 | Dialog: "Opening 8 chests: The chest service failed: try again. Your chest stays sealed" for Open all (8) and Open 5 | "The game is broken; did I lose the chests?" | **[V]** the text is `chest.err.bad`, shown when the reason is not in the client's `REASON` map (`net/chest-client.js`). Relayer answers such as `tx_failed`, `stale`, `replayed`, `deck_mismatch`, `no_opening`, `bad_request_id`, `rpc` all fall to that generic text, so the real cause is hidden. The relayer's live health counters show 0 transactions and 0 batches since it started, so no batch ever reached the chain **[V]**; the batch gas budget (28 Tgas per action, "must be measured", `docs/chests.md`) was never measured on the network **[V in docs]** | Section 6.6: map every error to a plain cause, log the real code, measure gas, size the batch, retry with backoff, flagged local fallback only for display, e2e opens 1, 5 and all | Relayer unit + live script + e2e |
| C4 | Inventory label "Local: kept in this browser only" next to items and "Spin the wheel" | "Are my items real? Are they lost if I clear my browser?" | **[V]** the bag and wheel keep state in `localStorage` (`ftf.chests.v1`, `ftf.wheel.v1`) by design; only openings and NFT mints are on chain | Plain-English scope badges (R6), "Saved on this device only" vs "Recorded on NEAR", with what each means and what to do (A3, section 6.7) | Unit: every row has a scope badge |

---

## 2. Shared rules (every agent, every prompt starts with these)

1. **English only.** All player-facing text, code comments, docs and commit messages are English. Do not add or edit `ru`, `uk`, `it`, `zh` locale files. If a key is missing in another locale the game must fall back to English `[VERIFY]` the fallback in `game/src/play/` `t()`; if there is none, A5 adds one in the first hour.
2. **Silk only.** One currency, called silk. Never write "wool" in code, copy, tests or docs. Prices, fees, rewards and stakes are in silk. Internal units: the town ledger counts hundredths of silk ("cents", written `C`, so 200 silk = 20,000 C). Show silk with at most 2 decimals, and whole numbers when the value is whole.
3. **The portal costs 200 silk, from config.** Read it from `EXPEDITION.PORTAL_FEE_C` / `portalFee()` in `game/src/game/expedition-config.js` and from `gate_price` on chain at the gate. **No literal 200, 20000 or 10,000 in UI code or copy**: use `{fee}`. Remove any remaining 10,000 silk hardcode you touch (`relayer/lib/pass.js` `PORTAL_FEE_SILK`, `relayer/lib/pass-eligibility.js` fallback, locale `pass.err.eligible`) `[VERIFY]`; the relayer files belong to A3.
4. **No mainnet, no keys, no push to `main`, no deploy.** Work on `sprint/5h-aN`, open a PR into `sprint/5h`. Never print, store or commit a secret. Never call a mainnet RPC with a signing key. Testnet transactions only through the existing relayer and test guest accounts. Contract source may change in the repo; **deploying it is mine** (I will do myself).
5. **Canon Iris.** Iris is a doctor-linguist from another planet, in the year 2048. She is not an AI. She came through the glass (a time-and-space gate), landed in the hill town, and needs 200 silk to return home through the Gate-Loom. Her face, hair, body design and outfit colours do not change in this sprint (A6 changes only rig weights, skirt simulation and animation timing).
6. **Honest labels.** Demo data says "Demo data". Play silk says it cannot be cashed out. Gambling is play money on a practice network. The wheel, dice and chests promise nothing of real value. AI-generated or placeholder voice is labelled in `docs/audio/voice.md`.
7. **Reuse before you build.** Read the file you are about to replace. Extend existing modules (`quests-data.js`, `quest-rules.js`, `keybinds.js`, `float-numbers.js`, `chests.js`, `chest-open.js`, `chest-batch.js`, `wheel.js`, `market.js`, `tournament*.js`, the cinematic runner) rather than inventing parallel ones.
8. **Every new feature is behind a flag** (section 3.6). Flags default off in `features.js`; A5 turns them on in `features.json` at hour 4:00.
9. **Pure rules / render split.** Rules and data in pure `.js` files with unit tests; DOM and Three.js in separate files. No new runtime dependency without a note on `BOARD.md` and A5's OK. Bundle budget: sprint modules lazy-loaded with the retry helper; total new first-load JS at most 40 KB gzipped (A5 checks).
10. **Respect `prefers-reduced-motion` and the in-game reduce setting** (`html[data-motion="reduce"]`): no typewriter, no screen shake, no sweeps animated, instant fades.
11. **Tests are part of the work.** Each feature ships unit tests (Node test runner, same style as `game/tests` `[VERIFY]`) and at least one e2e (headless Chrome through the existing harness `[VERIFY]` `tools/e2e` or `game/tests/e2e`). A feature without tests is not merged.
12. **File ownership is strict** (section 3.8). If you need a change in a file you do not own, write a request under your heading in `docs/sprint/BOARD.md` and keep working; the owner answers within 30 minutes. Do not edit the file.
13. **Commit small, rebase often**: `git pull --rebase origin sprint/5h` at the start of every 30-minute block; push your agent branch at the end of every block (agent branch only).
14. **Time boxes are real.** If a task overruns its block by more than 15 minutes, cut scope to the "minimum polished" line written in that task and note the cut in `BOARD.md`.

---

## 3. Shared foundation (A5 builds it in the first 45 minutes; everyone else codes against these contracts from minute 0)

### 3.1 Branches and merge protocol

- `sprint/5h` is cut from `origin/main` by A5 at minute 0 and pushed (agent branch push only; I will do the final merge to `main`).
- Agent branches: `sprint/5h-a1` ... `sprint/5h-a6`. Each agent opens a PR into `sprint/5h` at hours 1:30, 3:00, 4:30 (three integration waves) and a final one at 5:00.
- A5 merges PRs in the order in section 10.1 after `scripts/verify-sprint.sh` is green on the PR.

### 3.2 Seam files (created by A5; stubs exist at minute 20, real at minute 45)

| File | Purpose | API (exact) |
|---|---|---|
| `game/src/sprint/index.js` | Mounts every sprint module, each behind its flag | `export function mountSprint(ctx): { dispose(): void, update(dt: number): void }` |
| `game/src/sprint/registry.js` | The module list | `export const MODULES = [{ id: 'questJournal', flag: 'questJournal', load: () => retryImport(() => import('../quests/index.js')) }, ...]`; each module exports `mount(ctx) -> { dispose, update?(dt) }` |
| `game/src/sprint/bus.js` | Event bus and telemetry sink | `emit(name, payload)`, `on(name, fn) -> off`, `once(name, fn)`, `state` (a tiny keyed store: `state.set(k, v)`, `state.get(k)`, `state.sub(k, fn)`); every `emit` pushes `{name, t: performance.now(), payload}` to `window.__ftfTelemetry` (ring of 500) and, with `?debug=1`, to the console |
| `game/src/sprint/markers.js` | Map and waypoint markers shared by the journal and the minimap | `setMarkers(sourceId, list)`, `getMarkers()`, `onMarkers(fn)`; marker = `{id, kind: 'quest-available'\|'quest-ready'\|'quest-area'\|'npc'\|'portal'\|'market', pos: [x, z], radius?: number, label: string, color?: string, pinned?: boolean}` (town-local metres, same frame as `quests-data.js` `waypoint.town`) |
| `game/src/sprint/tooltip.js` | One tooltip component | `showTooltip(anchor: HTMLElement, {title, rarity?, lines: string[], footer?, wide?}) -> hide`; `attachTooltip(el, getContent)`; delay 250 ms, max width 320 × `--u`, flips at screen edges, keyboard focus shows it, Esc hides it |
| `game/src/sprint/first-seen.js` | Coach marks that show once (registry 1.5) | `registerTip({id, trigger, anchor, title, body})`, `resetTips()`, `showTip(id)`; persistence `ftf.tips.v1`; "Got it" button and a "?" re-show handle |
| `game/src/sprint/silk-view.js` (stub; **A3 implements**) | The single silk model (section 6.2) | `silkView(): {totalC, gateC, onChainC, pendingC, playC, feeC, enoughForGate, syncing, lastSyncAt, chainOk}`; `subscribeSilk(fn)`; `syncSilkNow(): Promise<{ok, reason?}>` |
| `game/src/sprint/auto-walk.js` (stub; **A1 implements**) | Auto-path to a point | `autoWalkTo({pos: [x, z], stopRadius: 2.2, label}) -> {cancel()}`; emits `autowalk.started/arrived/cancelled` |
| `game/src/sprint/demo-seed.js` | Demo seeding (A5) | `applyDemoSeed(name)` for `?demo=video` (section 8.5) |
| `game/src/sprint/retry-import.js` | Dynamic import retry (A5) | `retryImport(fn, {retries: 3, delaysMs: [300, 900, 2000]})`; on final failure show the "Update available. Reload" banner once, with `sessionStorage` guard against reload loops |
| `game/src/sprint/tokens.css` | Design tokens (3.3) | CSS variables only |
| `game/src/play/locales/en-quests.js`, `en-hud.js`, `en-market.js`, `en-npe.js`, `en-tips.js`, `en-video.js` | English strings per area (each agent edits only its own) | each: `export default { 'key': 'text', ... }`; `en.js` ends with `Object.assign(EN, quests, hud, market, npe, tips)` `[VERIFY]` the name of the exported table; A5 adds the import lines once at minute 20 |
| `docs/sprint/BOARD.md` | Requests and decisions, append-only, one heading per agent | plain Markdown; an agent edits only its own heading |
| `scripts/verify-sprint.sh` | One command for the whole sprint | runs unit tests, lint (jargon, English-only, hardcode scan, wool scan), build, bundle budget, built-page smoke test, e2e |

**Context contract** (`ctx` passed to every `mount(ctx)`): `{ THREE, scene, camera, renderer, player, ledger, town, chests, wheel, t, toast, reduced(), storage, relayerUrl, account, keys, bus, flags, markers, tooltip, silk }` `[VERIFY]` against `game/src/boot-world.js`; A5 documents the real field names in `docs/sprint/CTX.md` at minute 45 and everyone adapts. Names that already exist in `createKillXp({ THREE, scene, camera, player, ledger, t, toast, reduced, active })` are authoritative.

### 3.3 Design tokens (A5 writes `tokens.css`; values are final; all sizes below are at the 1920 × 1080 reference)

Scaling: `--u: calc(min(100vw, 100vh * 1.7778) / 1920)`. Every size in this document written as "N px" means `calc(N * var(--u))` with a floor of `max(0.75px, ...)`. Minimum tap target on touch: 44 CSS px regardless of `--u`.

| Token | Value | Use |
|---|---|---|
| `--ftf-panel` | `rgba(14, 16, 24, 0.90)` | panel background |
| `--ftf-panel-solid` | `#0e1018` | modal body |
| `--ftf-border` | `#3a3f55` | 1 px borders |
| `--ftf-gold` | `#f6c860` | accent, headings, selected state (same as the existing crit ring) |
| `--ftf-gold-dim` | `#b8964a` | disabled accent |
| `--ftf-text` | `#eef0f6` | body text (contrast on panel about 15:1) |
| `--ftf-muted` | `#aab1c5` | secondary text (contrast about 8:1) |
| `--ftf-ok` | `#5ccf8a` | success, completed, heal |
| `--ftf-warn` | `#f0b24a` | warning, pending |
| `--ftf-danger` | `#ff6b62` | errors, damage taken, HP |
| `--ftf-info` | `#4aa3ff` | info, mana, tips |
| `--ftf-silk` | `#e8dcb4` | silk amounts |
| `--ftf-xp` | `#b06cff` | XP |
| `--rar-common` | `#b8b8b8` | rarity: common |
| `--rar-uncommon` | `#5ccf5c` | rarity: uncommon |
| `--rar-rare` | `#4aa3ff` | rarity: rare |
| `--rar-epic` | `#b06cff` | rarity: epic |
| `--rar-legendary` | `#ff9a2e` | rarity: legendary |
| `--rar-mythic` | `#ff5c8a` | rarity: mythic (wheel grand prize) |
| `--hp` / `--hp-bg` | `#d2493f` / `#2a1210` | health bar |
| `--mana` / `--mana-bg` | `#3f8fd2` / `#0f1c2b` | mana bar |
| `--xp` / `--xp-bg` | `#b06cff` / `#1d1230` | XP bar |
| `--font-ui` | `"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif` | all UI (the game already loads Atkinson Hyperlegible in readable mode `[VERIFY]`) |
| `--font-title` | `"Cormorant Garamond", Georgia, serif` | titles only (already used by the chest panel) |
| `--fs-xs / sm / md / lg / xl` | 12 / 14 / 16 / 20 / 28 px | type scale; body is `md`; no body text below 14 px |
| `--radius` | 10 px (modals 14 px) | corners |
| `--shadow` | `0 8px 32px rgba(0,0,0,.55)` | modals |
| `--z-hud` | 10 | HUD |
| `--z-tracker` | 12 | tracker and goal |
| `--z-modal` | 40 | journal, market, skills, character, bag |
| `--z-dialogue` | 50 | dialogue and cinematic overlay |
| `--z-tooltip` | 60 | tooltips and coach marks |
| `--z-toast` | 70 | toasts |
| `--ease` | `cubic-bezier(.2, .8, .2, 1)` | easing |
| `--t-fast / --t-med` | 120 ms / 220 ms | transitions |

### 3.4 Shared component states (every button, tab, row and slot follows this table unless its section overrides it)

| State | Visual | Cursor | Other |
|---|---|---|---|
| default | background `rgba(255,255,255,.06)`, border `--ftf-border`, text `--ftf-text` | pointer | |
| hover | background `rgba(255,255,255,.12)`, border `--ftf-gold-dim` | pointer | tooltip after 250 ms |
| active (pressed) | scale 0.97, background `rgba(246,200,96,.20)` | pointer | 80 ms |
| focus-visible | 2 px outline `--ftf-gold`, offset 2 px | | keyboard only |
| selected | left bar 3 px `--ftf-gold`, background `rgba(246,200,96,.12)` | | `aria-selected=true` |
| disabled | opacity .45, no hover change | not-allowed | tooltip says **why** (rule R8) |
| empty | muted illustration glyph 48 px + one sentence + one next step | | never a blank panel |
| loading | skeleton rows (3) with 1.2 s shimmer (static under reduced motion) | progress | |
| error | border `--ftf-danger`, icon, 2-sentence message (what / why / next), "Retry" and "Details" | | |

Primary button: background `--ftf-gold`, text `#1b1608`, 700 weight, height 44 px, padding 0 22 px, radius `--radius`. Secondary: transparent, 1 px border `--ftf-border`. Danger: border and text `--ftf-danger`.

### 3.5 Keybinding table (A2 owns `keybinds.js`; every other agent reads it, never hard-codes a key)

Existing, unchanged **[V]** (`game/src/ui/keybinds.js`): W A S D move, Shift run, E interact, F strike, Space dash, Q lance, V snare, P photo, K skin, Enter chat, R camera, O panel, Esc menu (fixed). New (A2 adds the actions; defaults below; all rebindable except Esc, Tab and the number row aliases):

| Action id | Default | Alternate | Where | Notes |
|---|---|---|---|---|
| `hotbar1` ... `hotbar9` | Digit1 ... Digit9 | | hotbar | slot 1 = Strike, 2 = Lance, 3 = Snare, 4 = Dash by default; learned skills fill 5 to 9; F, Q, V, Space remain direct aliases |
| `journal` | KeyJ | KeyL (alias, fixed) | journal | toggles |
| `map` | KeyM | | big map | |
| `skills` | KeyN | | skill tree | |
| `character` | KeyC | | character and stats | |
| `bag` | KeyI | | bag (items, chests) | |
| `market` | KeyB | | market (Bazaar) | |
| `track` | KeyT | | journal: track or untrack the selected quest | only inside the journal |
| `target` | KeyX | Tab (fixed, `preventDefault`) | cycle nearest hostile target | click on a mob also targets it; Esc clears the target |
| `autowalkCancel` | any of W A S D, Space, Esc, right mouse drag | | cancels auto-walk | fixed |
| `help` | F1 | | controls cheat sheet and glossary | |

Conflicts: `cleanBindings` already rejects reserved codes (`Escape, Tab, F5, F11, F12, Meta*, ContextMenu`) and A2 extends `duplicates()` so a rebind that collides asks "Swap with <action>?".

### 3.6 Feature flags (A5 adds to `features.js` `DEFAULT_FLAGS` and `game/public/features.json`)

`questJournal` (A1), `questTracker` (A1), `autoWalk` (A1), `starterGuide` (A1), `rpgHud` (A2), `skillTree` (A2), `hotbar` (A2), `marketplace` (A3), `lootFx` (A3), `playGames` (A3), `silkView` (A3), `newPlayerIntro` (A4), `labPrologue` (A6 content, A4 trigger), `agentTournament` (A4), `firstSeenTips` (A4/A5), plus existing `damageNumbers`, `loadRitual`. At hour 4:00 A5 sets every sprint flag to `true` in `features.json` on `sprint/5h` and records it in `BOARD.md`. Kill switch: set any flag `false` and redeploy only `features.json`.

### 3.7 Event and telemetry catalogue (bus names; payload keys exact; every emit also feeds `window.__ftfTelemetry`)

| Event | Payload | Emitted by |
|---|---|---|
| `hud.mounted` | `{layout: 'desktop'\|'phone'}` | A2 |
| `xp.gained` | `{amount, source: 'kill'\|'quest'\|'chest'\|'wheel', total}` | A2 |
| `level.up` | `{level, skillPoints, statPoints}` | A2 |
| `skill.cast` | `{id, slot, targetId?, manaCost, cooldownMs}` | A2 |
| `skill.learned` | `{id, branch, pointsLeft}` | A2 |
| `skill.respec` | `{costSilk, free: boolean}` | A2 |
| `stat.spent` | `{stat: 'voice'\|'mind'\|'grit', value}` | A2 |
| `keybind.changed` | `{action, from, to}` | A2 |
| `mob.hit` / `mob.killed` | `{type, id, dmg?, crit?, xp?}` | existing `mobs.js`; A5 wires the bus emit in one line |
| `quest.available` / `quest.accepted` / `quest.progress` / `quest.ready` / `quest.completed` / `quest.abandoned` | `{id, category, objectiveId?, count?, of?}` | A1 |
| `quest.tracked` / `quest.untracked` | `{id}` | A1 |
| `journal.opened` / `journal.closed` | `{tab}` | A1 |
| `autowalk.started` / `autowalk.arrived` / `autowalk.cancelled` | `{questId?, to: [x, z], reason?: 'input'\|'combat'\|'blocked'\|'replaced'}` | A1 |
| `guide.step` | `{id, done}` | A1 |
| `npc.talked` | `{npc}` | A4 (existing interact hook) |
| `portal.near` / `portal.paid` | `{feeC, onChainC}` / `{tx}` | A1 |
| `silk.changed` | `{totalC, onChainC, pendingC, playC}` | A3 |
| `silk.sync` | `{ok, reason?, creditedC?}` | A3 |
| `chest.dropped` / `chest.picked` / `chest.opened` | `{tier, source}` / `{id}` / `{count, tx?, ok, errorCause?}` | A3 |
| `loot.item` | `{id, rarity, qty, source}` | A3 |
| `market.opened` / `market.listing_created` / `market.listing_filled` / `market.listing_cancelled` / `market.trade_completed` | `{item, qty, priceSilk, feeSilk, side, settlement: 'chain'\|'demo', tx?}` | A3 |
| `games.opened` / `gamble.rolled` / `gamble.limit_hit` / `wheel.spun` | `{game, stakeSilk, win, payoutSilk, seed}` | A3 |
| `npe.started` / `npe.step` / `npe.skipped` / `npe.completed` | `{step, ms}` | A4 |
| `prologue.started` / `prologue.cue` / `prologue.skipped` / `prologue.completed` | `{shot?, cue?, ms}` | A6 emits cues, A4 starts and ends |
| `tip.shown` / `tip.dismissed` | `{id}` | A5 |
| `tournament.opened` / `tournament.entered` / `tournament.agent_entered` | `{season, kind: 'human'\|'agent', account}` | A4 |
| `error.shown` | `{area, cause, code?}` | any |

Telemetry never leaves the browser in this sprint (no network sink). It is for tests and the usability script.

### 3.8 File ownership matrix (strict; "shared seam" files are A5's and are edited only by A5)

| Area | Files (existing and new) | Owner |
|---|---|---|
| Seam | `game/src/sprint/**`, `game/src/features.js`, `game/public/features.json`, `game/src/main.js` (retry), `game/src/boot-world.js` (**one import line and one mount call only**), `scripts/verify-sprint.sh`, `scripts/stats.mjs`, `docs/STATS.md`, `README.md`, `docs/judge-path.md`, `docs/sprint/**` (except per-agent handoff files), `docs/submission/video/**`, `game/src/play/locales/en.js` (import lines only) | A5 |
| Quests | `game/src/quests/**` (new), `game/src/game/quests-data.js`, `game/src/game/quest-rules.js`, `game/src/game/journal-data.js` (new), `game/src/scenes/town-quests.js`, `game/src/scenes/town-quest.js`, `game/src/scenes/town-portal.js`, `game/src/play/objectives.js`, `game/src/play/guide.js`, `game/src/play/map.js`, `game/src/play/map-ui.js`, `game/src/play/locales/en-quests.js` | A1 |
| HUD and RPG | `game/src/rpg/**` (new), `game/src/scenes/player-hud.js`, `game/src/ui/hud.js`, `game/src/ui/keybinds.js`, `game/src/ui/keyboard-map.js`, `game/src/ui/settings-popup.js`, `game/src/ui/float-numbers.js`, `game/src/ui/float-numbers-core.js`, `game/src/play/profile.js`, `game/src/play/kill-xp.js`, `game/src/scenes/town-casting.js`, `game/src/scenes/town-casting-fx.js`, `game/src/game/town-economy.js`, `game/src/play/locales/en-hud.js` | A2 |
| Market, loot, silk | `game/src/market/**` (new), `game/src/net/silk-balance.js` (new), `game/src/sprint/silk-view.js`, `game/src/play/market-scene.js`, `game/src/net/market.js`, `game/src/net/stall-client.js`, `game/src/ui/stall-panel.js`, `game/src/ui/market-ticker.js`, `game/src/game/chests.js`, `game/src/net/chest.js`, `game/src/net/chest-client.js`, `game/src/play/chest-open.js`, `game/src/play/chest-batch.js`, `game/src/game/wheel.js`, `game/src/play/wheel-view.js`, `game/src/play/mobs.js` (**drop hooks only**), `relayer/lib/chest*.js`, `relayer/api/chest/**`, `relayer/api/market/**`, `relayer/api/wheel/**`, `relayer/lib/town-act.js`, `relayer/lib/town-gate.js`, `relayer/lib/resource-desk.js`, `contracts/town/**`, `contracts/town-items/**`, `game/src/play/locales/en-market.js` | A3 |
| Intro and tournament | `game/src/npe/**` (new), `game/src/ui/onboarding.js`, `game/src/ui/premise.js`, `game/src/play/narrator.js`, `game/src/play/narration.js`, `game/src/play/townsfolk.js`, `game/src/play/townsfolk-plan.js`, `game/src/play/hints.js`, `game/src/ui/tournament.js`, `game/src/ui/tournament-card.js`, `game/src/play/agents.js`, `server/src/**` (agent API: new action only), `server/examples/agent-tournament.mjs` (new), `docs/api/openapi.yaml`, `game/public/assets/audio/voice/**`, `docs/audio/voice.md`, `game/src/play/locales/en-npe.js`, `en-tips.js` | A4 |
| 3D and art | `game/src/scenes/lab/**` (new), `game/src/cinematic/prologue/**` (new), `game/public/assets/models/lab_*.glb` (new), `game/public/assets/anim/**`, `art/agents/iris_hero/**`, `art/agents/agent_rig.py`, `art/agents/agent_anim.py`, `art/anim/**`, `docs/art/iris/**`, `docs/art/animation-pipeline.md`, `game/tests/clipping/**` (new) | A6 |

**Shared files with a one-line seam exception:** `game/src/boot-world.js` (A5 only), `game/src/play/mobs.js` (A3 for loot hooks; A5 for the bus emit in one commit at minute 30; no one else), `game/src/play/locales/en.js` (A5 only). `game/src/scenes/town-casting.js` is A2's; A1 and A3 read events, they do not edit.

### 3.9 `docs/sprint/BOARD.md` protocol

Sections: `## A1`, `## A2`, `## A3`, `## A4`, `## A5`, `## A6`, `## Decisions (A5 writes, owner approves)`. In your section write `REQUEST to A<n>:`, `ANSWER to A<n>:`, `CUT:`, `DONE:` lines with the time. The owner reads it at hours 1, 2, 3, 4.

### 3.10 Whole-team timeline in 30-minute blocks (T = start of the sprint)

| Block | A1 | A2 | A3 | A4 | A5 | A6 |
|---|---|---|---|---|---|---|
| T+0:00 | read, branch, data schemas | read, tokens use, skills data | read, **repro chest bug + silk root-cause test**, models | read, script into `en-npe.js` | branch, seam stubs, locale seams, flags | read, scene plan, asset pass, clipping test harness |
| T+0:30 | journal UI shell | HUD frame layout | silkView + sync | dialogue UI + state machine | bus, tooltip, first-seen, ctx doc | lab geometry blockout |
| T+1:00 | journal list + detail | hotbar + cooldown sweeps | silk HUD contract with A2, chest error mapping | townsfolk dialogue + roadmap card | retry-import, verify-sprint script | Iris run clip + camera path |
| T+1:30 | **PR wave 1** tracker + auto-walk start | **PR wave 1** HUD + hotbar | **PR wave 1** silkView + chest fix | **PR wave 1** dialogue | merge wave 1, ctx fixes | **PR wave 1** lab blockout + clipping before-report |
| T+2:00 | auto-walk path + cancel | skills data + skill tree UI | market list/order book | tooltips + glossary | CI wiring, bundle budget | device activation + vortex VFX |
| T+2:30 | starter guide + markers | progression, stats, level-up fx | loot FX + chest open FX | voice placeholder + subtitles | e2e harness | wake-up shot + hand-off cue API |
| T+3:00 | **PR wave 2** | **PR wave 2** | **PR wave 2** market + loot | **PR wave 2** agent tournament entry | merge wave 2, feature flags | **PR wave 2** prologue playable + skirt fix pass 1 |
| T+3:30 | portal copy + silk consistency | rebind screen + minimap | dice + wheel + labels | NPE glue to prologue | README + judge page + demo seed | skirt fix pass 2 + regression test |
| T+4:00 | e2e for quests | e2e for HUD | e2e for market and chests | e2e for NPE | **flags on**, e2e first 10 minutes | before/after contact sheet |
| T+4:30 | fix wave | fix wave | fix wave | fix wave | usability test + video capture | polish and perf pass |
| T+5:00 | **final PR** | **final PR** | **final PR** | **final PR** | final merge, video package, report | **final PR** |

Hard rule: at T+4:30 no new feature starts; only fixes from the usability test, e2e failures and polish.

---

## 4. Agent A1 (Opus 5.5): quest journal, tracker, auto-walk, starter guide, portal copy

### 4.1 Mission

I want quests shown as a **list, like the best RPGs** (a well-known MMO quest log, FFXIV journal, a well-known RPG quest menu, a well-known RPG journal): a tracked quest pinned on the HUD, categories (Story / Side / Daily / Tournament / Done), objectives with counters ("Kill stone spiders 3/10"), rewards in silk and items, "how to get it" hints (especially for the spare part), map markers and waypoints, a completed tab, and keyboard shortcuts J and L. The top-left/top-centre **quest pill must stop truncating** (screenshot C1): clicking it opens the full journal; every quest shows progress, the **giver's name** and the reward; **clicking a quest makes Iris run to the giver** (auto-walk, cancelled by W A S D). Plus a starter guide a stranger can follow, and portal text that is correct about silk.

### 4.2 Scope in and out

In: journal UI, tracker (replaces `.ftf-story-goal` pill), auto-walk, markers and waypoint arrow, quest data v2 (14 quests), starter guide (8 steps), portal prompt copy and confirm dialog, Road Home bar. Out: HUD bars and minimap drawing (A2; you publish markers, A2 draws them), the silk model (A3; you consume `silkView()`), the dialogue box and townsfolk lines (A4), market and chests (A3).

### 4.3 File-by-file change list

| File | Action | Detail |
|---|---|---|
| `game/src/game/journal-data.js` | **create** | the 14 quests as data (schema 4.4), pure, frozen; `CATEGORIES`, `GIVER_NAMES` fallback table |
| `game/src/game/quests-data.js` | modify | keep `QUESTS` ids and rewards (they are tested); add `category`, `level`, `sort`; re-export from `journal-data.js` the new quests |
| `game/src/game/quest-rules.js` | modify | add objective types `talk`, `reach`, `open_chest`, `trade`, `wheel`, `learn_skill`, `enter_tournament`, `enter_agent`, `gather`; keep `applyQuest`, `questLog`, `objective`, `markerFor` signatures; add `progressOf(quest, state)` returning `[ {id, done, count, of} ]`, `statusOf(quest, state, now)` returning `locked\|available\|active\|ready\|completed\|cooldown`, `nextDailyReset(now)` (00:00 UTC) |
| `game/src/quests/index.js` | **create** | `mount(ctx)` for flags `questJournal`, `questTracker`, `autoWalk`, `starterGuide`; wires bus events to `applyQuest` |
| `game/src/quests/journal-ui.js` + `journal.css` | **create** | the journal modal (4.7) |
| `game/src/quests/tracker-ui.js` + `tracker.css` | **create** | tracker and Road Home bar (4.8) |
| `game/src/quests/waypoint-ui.js` | **create** | edge arrow and ground trail (4.9) |
| `game/src/quests/guide.js` | **create** (and `game/src/play/guide.js` modify) | 8-step starter guide (4.11), persisted `ftf.guide.v2` |
| `game/src/sprint/auto-walk.js` | **implement** (stub from A5) | 4.10 |
| `game/src/scenes/town-quests.js` | modify | remove the old pill and old `renderLog` panel behind the flag (keep code path when `questJournal` is off); make `balanceC()` come from `silkView().onChainC`/`gateC` |
| `game/src/scenes/town-portal.js` | modify | `portalPrompt()` uses the new keys (4.12), confirm dialog |
| `game/src/play/objectives.js`, `map.js`, `map-ui.js` | modify | publish and draw markers through `sprint/markers.js` |
| `game/src/play/locales/en-quests.js` | **create** | all strings in this section |
| `game/tests/quests/*.test.mjs` | **create** | 4.14 |

### 4.4 Quest data schema (`journal-data.js`; exact)

```json
{
  "id": "q_spiders",
  "category": "story",
  "sort": 20,
  "level": 1,
  "giver": "guard",
  "requires": ["q_welcome"],
  "title": "Stone Spiders on the Road",
  "summary": "Thin out the stone spiders that block the road.",
  "description": "Stone spiders have webbed the road north of the town. The Guard cannot leave the gate. Clear ten of them and bring back five strands of spider silk thread.",
  "objectives": [
    { "id": "kill", "type": "kill", "mob": "skitter", "count": 10, "text": "Kill stone spiders" },
    { "id": "deliver", "type": "deliver", "resource": "spider_silk_thread", "count": 5, "to": "guard", "text": "Bring spider silk thread to the Guard" }
  ],
  "rewards": { "silk": 20, "xp": 80, "items": [], "chest": null },
  "hints": [
    { "text": "Stone spiders live in the field north-west of the town gate (yellow circle on the map).", "marker": "field_spiders" },
    { "text": "Each spider can drop spider silk thread. If you run short, hunt a few more.", "marker": null }
  ],
  "markers": [ { "id": "field_spiders", "kind": "quest-area", "pos": [-12, 52], "radius": 14, "label": "Stone spider field" } ],
  "turnIn": "guard",
  "autoComplete": false,
  "repeat": null,
  "daily": false,
  "unlockLevel": 1,
  "track": true
}
```

Field rules: `id` unique; `category` in `story|side|daily|tournament`; `turnIn` is a giver key in `GIVERS` plus `innkeeper`; `autoComplete` true means it completes silently with a toast (side/daily/tournament); objective `type` in the list in 4.3; `count >= 1`; every `hints[].marker` must exist in `markers`; every string is plain English with at most 140 characters per hint and 220 per description (unit-tested). Positions `[x, z]` are town-local metres as in the existing `waypoint.town`.

### 4.5 The 14 quests (exact copy and numbers)

Display names of givers come from `t('folk.name.<key>')` `[V]` (existing); the fallback table is Elder, Guard, Lamplighter, Shardkeeper, Innkeeper. Silk rewards go through the existing ledger award path and the existing day caps (`killDaySoftC`, `bounty`); **no new silk source may exceed the city economy caps** (FTF-City-Economy.md).

| Id | Cat. | Lv | Giver | Title | Summary (list row, 1 line) | Objectives (counter text) | Reward | How to get it / hint text (exact) |
|---|---|---|---|---|---|---|---|---|
| `q_welcome` | Story | 1 | Elder | A Stranger at the Shell | "The Elder wants to speak with you." | Talk to the Elder 0/1 · Walk to the lantern post 0/1 | 8 silk, 30 XP | "The Elder stands by the big shell in the town square. Press E when you are close." |
| `q_spiders` | Story | 1 | Guard | Stone Spiders on the Road | "Thin out the stone spiders that block the road." | Kill stone spiders 0/10 · Bring spider silk thread 0/5 | 20 silk, 80 XP | "Stone spiders live in the field north-west of the gate (yellow circle on the map). Each can drop spider silk thread." |
| `q_part` | Story | 1 | Lamplighter | The Missing Spare Part | "The Lamplighter needs a spare part for the lamp-loom." | Find a spare part 0/1 · Bring 2 chitin plates 0/2 | 16 silk, 60 XP | "A spare part drops from stone spiders. Your 5th kill always drops one. You can also find parts in chests and from the daily wheel." |
| `q_boss` | Story | 3 | Shardkeeper | The Crownrift | "Something large guards the old ridge." | Defeat the Crownrift 0/1 · Bring 1 crown shard 0/1 | 60 silk, 250 XP, a rare chest | "The Crownrift waits at the ridge south-east (red marker). Bring friends or learn a few skills first (press N)." |
| `s_sign` | Side | 1 | Innkeeper | The Innkeeper's Sign | "Optional: the innkeeper on the lower street has a sign to read." | Read the sign 0/1 | 2 silk, 20 XP | "Walk down the lower street to the inn. Press E at the wooden sign." |
| `s_chest` | Side | 1 | Guard | Something Heavy | "Open your first chest." | Open a chest 0/1 | 3 silk, 40 XP | "Monsters drop chests. Walk over one to pick it up, press I, then Open." |
| `s_trade` | Side | 2 | Lamplighter | Fair Exchange | "Sell a resource for silk." | Complete a trade 0/1 | 5 silk, 60 XP | "Press B to open the Market. Sell a resource to a player or a stall." |
| `s_wheel` | Side | 1 | Innkeeper | A Turn of the Wheel | "Spin the daily wheel once." | Spin the wheel 0/1 | 2 silk, 25 XP | "Press B, open the Games tab and press Spin. One spin a day is free." |
| `s_voice` | Side | 2 | Elder | Find Your Voice | "Learn your first skill." | Learn a skill 0/1 | 60 XP | "At level 2 you get a skill point. Press N and pick one." |
| `b_spiders` | Daily | 1 | Guard | Spider Bounty | "The Guard pays for every ten spiders. Repeats." | Kill stone spiders 0/10 | 6 silk, 40 XP (existing caps: 3 full a day, then 10%) | "Same field as the spider quest. The bounty resets 30 minutes after you hand it in, up to 3 a day at full pay." |
| `d_gather` | Daily | 1 | Lamplighter | Daily Gathering | "Collect 5 resources of any kind." | Collect resources 0/5 | 4 silk, 30 XP | "Spiders and other monsters drop resources. Look for glowing drops on the ground." |
| `d_deal` | Daily | 2 | Innkeeper | Daily Deal | "Make one trade today." | Complete a trade 0/1 | 4 silk, 30 XP | "Press B. A trade with a stall counts." |
| `t_enter` | Tournament | 3 | Elder | The Season Cup | "Enter the Season Cup." | Enter the tournament 0/1 | 100 XP, title "Contender" | "Open the tournament card (the trophy button on the HUD) and press Enter. The entry costs a little silk and part of it is removed forever." |
| `t_agent` | Tournament | 3 | Shardkeeper | Bring a Champion | "Enter an AI agent in the tournament." | Enter an agent 0/1 | 100 XP, title "Handler" | "Agents enter through the game's agent API. Open the tournament card and press Add an agent." |

Daily quests reset at 00:00 UTC; the journal shows the countdown. Level gates: a quest above the player's level is shown in the list greyed with "Requires level N" (disabled state), not hidden.

### 4.6 State machines

Quest: `locked → available → active → ready → completed`; daily/repeat: `completed → cooldown → available`. Transitions:

| From | Event | To | Side effects |
|---|---|---|---|
| locked | `requires` all completed and level ≥ `unlockLevel` | available | `quest.available`, "!" marker over the giver, journal row "New" badge |
| available | talk to giver and press Accept (or `autoAccept` for side/daily/tournament when visible) | active | `quest.accepted`, auto-track if fewer than 3 tracked |
| active | every objective done | ready (story) or completed (autoComplete) | `quest.ready` ("?" marker over `turnIn`), toast "Quest ready: <title>. Turn it in to <giver>." |
| ready | talk to `turnIn` giver | completed | rewards awarded once (idempotent by `id + completionIndex`), `quest.completed`, toast with rewards, next quest unlocks |
| completed (repeat) | `cooldown` elapsed or daily reset | available | |
| active | Abandon (not allowed for story) | available | progress cleared, confirm dialog "Abandon <title>? Your progress on it will be lost. [Abandon] [Keep]" |

Persistence: `ftf.quests.v2` (extends the existing `QUESTS_KEY`; migrate old state: keep `completed`, `active`, counters). Rewards are idempotent: awarding twice for the same completion is a no-op (unit test).

### 4.7 The journal (modal; opened with J or L, the tracker, the HUD tray button, or the pill)

**Frame:** centred, 1280 × 720 px (max 92 vw × 88 vh; below 900 px width it becomes full screen with the list and the detail as two screens), background `--ftf-panel-solid`, border `--ftf-border`, radius 14 px, shadow `--shadow`, `--z-modal`. Opens in 120 ms (fade and 8 px rise; instant under reduced motion). Closing: J, L, Esc or the close button. Focus is trapped; arrow keys move the selection; Enter selects; Esc closes.

**Header** (height 56 px, border-bottom 1 px): title "Journal" in `--font-title` 28 px `--ftf-gold` at x = 24; centre: Road Home mini bar 320 × 24 ("Road home: 38 / 200 silk", the same `silkView()` number; tooltip with the breakdown); right: close button 40 × 40 at x = 1280 − 24 − 40.

**Left rail** (x = 0, width 384 px, border-right 1 px):
- Tab row at y = 56, height 48 px: five tabs **Story · Side · Daily · Tournament · Done**, each 76.8 px wide, label 14 px 700, a count badge (16 × 16 circle, 12 px) for "ready or new" items; selected tab has the gold underline 3 px; keys `1`..`5` switch tabs while the journal is open.
- Search field at y = 104, height 40 px, placeholder "Search quests", 14 px (filters by title and giver; Esc clears).
- List (y = 152 to 720, scrolls) of rows, each 64 px high, padding 8 px 16 px:
  - status icon 24 × 24 at x = 16: `!` available (gold), `?` ready (green), diamond active (blue), check done (green), lock (muted), clock cooldown (muted);
  - title 16 px 700 (wraps to 2 lines max, never ellipsis), under it "Lv 1 · Guard" 12 px `--ftf-muted`;
  - right side: counter of the first unfinished objective "3/10" 14 px 700 tabular-nums, and a pin icon 16 × 16 when tracked;
  - states per 3.4; "ready" rows have a green 3 px left bar instead of gold.
  - Row order: ready, active, available, locked; inside a group by `sort`.

**Right pane** (x = 384, width 896 px, padding 32 px, scrolls):
1. Title 28 px `--font-title`; chip row under it (height 28 px, gap 8 px): category chip, "Lv N" chip, giver chip "From: Guard" (click: show the giver on the map), status chip ("Active", "Ready to turn in", "New", "Done", "Locked: reach level N").
2. Summary (16 px, `--ftf-muted`) then description (16 px, line-height 1.5, max 70 characters per line).
3. Section header "OBJECTIVES" (14 px 700, letter-spacing .08em, `--ftf-muted`) and one row per objective (min height 32 px): 18 px circle (empty ring, or green check when done), text 16 px (done: muted and struck through), counter right-aligned "3/10" 16 px 700 tabular-nums; for kill and gather types a 6 px progress bar under the row (`--ftf-info`, green at 100%).
4. Section "REWARDS": chips 112 × 72 px (gap 12): silk chip (silk coin icon 24 px, "+20 silk" in `--ftf-silk`), XP chip ("+80 XP" `--ftf-xp`), item chips with a rarity-coloured 2 px border and the item icon 32 px (tooltip via `tooltip.js`), chest chip ("Rare chest"), title chip. A reward already taken shows a check overlay.
5. Section "HOW TO GET IT" (only when `hints` exist): a box with background `rgba(74,163,255,.10)`, border-left 3 px `--ftf-info`, padding 16 px, numbered hints 15 px; a hint with a marker has a small "Show on map" link (opens the map, pins the marker).
6. Footer actions (sticky, bottom, height 72 px, border-top): left, shortcut hint "J close · T track · M map · Enter walk" 12 px muted; right, buttons:
   - **Walk to <Giver>** (primary, label becomes "Walk to <Giver> to turn in" when ready; for an active quest with an area objective the label is "Walk to the <area>"); starts auto-walk and closes the journal;
   - **Track on HUD** / **Untrack** (secondary; disabled with tooltip "You can track 3 quests. Untrack one first." when 3 are tracked);
   - **Show on map** (secondary);
   - **Abandon** (danger, disabled for story with the tooltip "Story quests cannot be abandoned.").

**Click rules (explicit; this is the owner's request):** click a list row = select it and show its detail; click a selected row again, double-click it, or press Enter = start auto-walk to the giver (when ready) or to the objective area, and close the journal. Selecting never moves Iris by itself. A "Walk" button always exists, so the action is discoverable (rule R1).

**Empty states (exact):**
- Story, nothing active: glyph scroll, "No story quest right now." / "Talk to townsfolk with a yellow ! above their head."
- Side: "No side quests yet." / "Reach level 2 and explore the town."
- Daily: "Daily quests are done for today." / "They return at 00:00 UTC (in 03:12:08)." The countdown updates every second.
- Tournament: "No tournament quest yet." / "Open the tournament card to see when the next one starts."
- Done: "Nothing finished yet." / "Completed quests are kept here."
- Search with no match: "No quest matches 'xyz'." / "Clear the search."
- Load error (state failed to parse): "Your quest log could not be read." / "Your progress on this device is untouched. Reload the page or press Retry." with **Retry** and **Details**.

**Phone layout (< 900 px wide):** the list is the first screen (full width rows 72 px), tapping a row opens the detail screen with a back arrow; actions are a bottom sheet of 3 buttons (Walk, Track, Map); tap targets at least 44 px.

### 4.8 The tracker (replaces the truncating pill; screenshot C1)

Placement (desktop, 1920 × 1080): right edge, x = 1576, width 320 px, top = 268 px (below A2's 200 px minimap and its 18 px coordinates row), `--z-tracker`, max height 420 px, background `rgba(14,16,24,.72)`, radius 10 px; it never covers the minimap or the target frame. On phones (< 600 px wide) it is a card under the top row: full width minus 24 px, max 3 lines then "…more" that expands on tap; it can never be clipped to one line.

Content, top to bottom:
1. **Road Home bar** (always visible, height 56 px): label "Road home" 12 px muted; number `"{gate} / {fee} silk"` 16 px 700 `--ftf-silk` from `silkView()` (**never from a local store**); a 6 px bar; tooltip on hover or tap: "Silk that counts for the Gate-Loom: {gate}. On chain {onChain}. Waiting to sync {pending}. Play silk (this device only) {play}. [Sync now]". Click opens the wallet breakdown card (A3 provides the card; A1 calls `bus.emit('wallet.open')`).
2. **Pinned quest block** (the first tracked quest): title 16 px 700 `--ftf-gold` wrapped to at most 2 lines; objective lines 14 px with the counter right; a ready quest shows "Ready: turn in to <Giver>" in `--ftf-ok`; two small icon buttons 28 × 28 at the block's top-right: **walk arrow** (starts auto-walk; tooltip "Walk there") and **expand chevron** (shows full description and hints inline, so long text is never cut).
3. **Other tracked quests** (up to 2 more, compact: title and first objective).
4. **Starter Guide block** while the guide has open steps ("Starter guide 3/8" and the active step text).
5. Header row of the whole tracker: "Quests" 14 px 700 + "[J]" key hint + collapse button 24 × 24 (state saved `ftf.tracker.v1`).

States: default; hover (block highlights, cursor pointer; clicking the title opens the journal at that quest); completed flash (block flashes green for 1.2 s, then slides out); new objective flash (gold underline pulse 0.6 s); hidden while the journal, market, or a cinematic is open. The old `.ftf-story-goal` element is **not created** when `questTracker` is on; when it is off the old element gets `pointer-events:auto`, `white-space:normal`, `max-width: min(560px, 92vw)`, a `title` attribute with the full text, and a click handler that opens the log (the safe fallback for a flag-off deploy).

### 4.9 Waypoint arrow, trail and markers

- **Edge arrow:** a 36 × 36 px gold chevron on an invisible circle of radius 38 vh around the screen centre, pointing to the pinned quest's target when it is off-screen; the distance label under it "42 m" 12 px; when the target is on-screen, a 28 px diamond with the distance floats over it. Hidden when the journal is open or the target is closer than 6 m. Reduced motion: no pulse.
- **Ground trail:** only during auto-walk, instanced 0.18 m discs every 2 m for the next 40 m, additive gold at 55% opacity, one draw call.
- **Markers** published through `setMarkers('quests', list)`: `quest-available` (gold `!`), `quest-ready` (green `?`), `quest-area` (a circle of the objective radius, gold outline), pinned quest in a larger size. A2's minimap and the big map draw them.

### 4.10 Auto-walk (`sprint/auto-walk.js`; cancel with W A S D)

Behaviour:
1. `autoWalkTo({pos, stopRadius: 2.2, label})` builds a path on a 1 m grid A* over the town's walkable area, using the colliders from `scenes/town-layout.js`, `town-props.js` `[VERIFY]` and the player radius; if no collider data is reachable it falls back to straight steering with two 1.5 m whiskers.
2. Iris **runs** (run speed, not walk). Input is injected through the same movement entry as the keyboard `[VERIFY]` `physics/motion.js` so animation, footsteps and camera behave normally. Path is smoothed (string pulling) and replanned every 0.5 s when blocked for more than 1.5 s.
3. **Cancel** on any of: W A S D, Space (dash), Esc, a right-mouse drag, opening a modal, an enemy hit on Iris (`reason: 'combat'`), a new auto-walk (`reason: 'replaced'`), or the path being blocked for more than 6 s (`reason: 'blocked'`, toast "Can't find a way there. Walk closer and try again.").
4. **Arrive** at 2.2 m from the target: stop, face the giver, emit `autowalk.arrived`, and show the interact prompt "Press E to talk to <Giver>" (it does not open the dialogue by itself).
5. HUD: a label under the top edge at y = 96 px, 14 px, pill background: `Walking to Elder · 42 m · press W A S D to stop`; it disappears on arrive or cancel.
6. Targets: giver position via `folkAt(giver)` (existing in `town-quests.js` `[V]`), objective areas via the quest `markers[].pos`; if the target moves (an NPC), the path is refreshed every 2 s.
7. Max path length 400 m; the walk never crosses the town wall except through the gate.
8. Speed limit during auto-walk is the player's normal run speed; it never teleports.

### 4.11 Starter guide (8 steps, `quests/guide.js`; replaces the guide steps `talked`, `moved`; persisted `ftf.guide.v2`)

Layout: a block in the tracker (4.8) with the active step in 14 px and "n/8"; for steps 4, 6, 7 a coach mark (tooltip.js, gold bubble, max width 280 px, 14 px text, 10 px arrow, pulse ring 1 s) points at the UI element. A step turns green with a check and the next step slides in after 600 ms. The guide can be hidden with the ✕ (Settings → "Show starter guide" brings it back).

| # | Id | Text (exact) | Done when (bus event) | Coach mark target |
|---|---|---|---|---|
| 1 | `move` | "Move with W A S D. Hold Shift to run." | `player.moved` distance ≥ 6 m | none |
| 2 | `camera` | "Press R to turn the camera." | `camera.rotated` | none |
| 3 | `talk` | "Walk up to the Elder and press E." | `npc.talked` with npc `elder` | giver marker |
| 4 | `journal` | "Press J to open your Journal." | `journal.opened` | HUD tray journal button |
| 5 | `fight` | "Find a stone spider. Press F to strike, Q to fire your Lance." | `mob.hit` | none |
| 6 | `loot` | "Walk over a chest to pick it up. Press I to open your bag." | `bag.opened` | HUD tray bag button |
| 7 | `market` | "Press B to open the Market and sell a resource for silk." | `market.opened` | HUD tray market button |
| 8 | `home` | "Collect {fee} silk on chain, then step into the Gate-Loom to go home." | `portal.near` | the Road Home bar |

On completion: toast "Starter guide complete. The journal and the market are yours." and `+10 XP` once.

### 4.12 Portal and Gate-Loom copy (consumes `silkView()`; keys in `en-quests.js`; `{fee}` from config, never a literal)

| State | Prompt line (exact) | Key |
|---|---|---|
| dormant, not enough even with pending | "The Gate-Loom needs {fee} silk on chain. {gate} of it counts so far." | `story.portal.wants` |
| dormant, pending would be enough | "You have {total} silk, but only {gate} is on chain. Press E to sync the rest." | `story.portal.syncable` (E triggers `syncSilkNow()`) |
| syncing | "Moving your silk onto the chain. This takes about 10 seconds." | `story.portal.syncing` |
| ready | "The Gate-Loom is ready. Press E to pay {fee} silk and step through." | `story.portal.pay` |
| confirm dialog | Title "Pay the Gate-Loom?" Body "{fee} silk will be removed forever and the payment recorded on NEAR, a public blockchain. You cannot undo it." Buttons **Pay and go home** / **Not yet** | `story.portal.confirm.*` |
| paying | "Paying the Gate-Loom. This takes about 10 seconds." | `story.portal.paying` |
| payment failed | "The payment did not go through. Your silk is safe. Try again in a minute." | `story.portal.failed` |
| not logged in | "Your player account is not ready yet. Wait a moment." | `story.portal.needGuest` |
| offline | "The network is not answering. Your silk is safe. Try again soon." | `story.portal.offline` |
| spent | "The Gate-Loom is quiet." | `story.portal.quiet` |
| demo fee (`?portalFee=N`) | prepend "Demo price: " and a visible "Demo" chip; the payment never counts toward the pass | existing |

The tooltip on the Gate-Loom object and the Road Home bar uses the glossary text for "Silk on chain" (1.4). The confirm dialog is mandatory (rule R9).

### 4.13 Telemetry and API

Emits the quest, journal, autowalk, guide, portal events in 3.7. Calls: `silkView()`, `syncSilkNow()` (A3), `ledger.award({silkC, xp})` `[VERIFY the existing award function name in town-economy.js]`, `chests.add({tier:'rare', source:'quest'})` for `q_boss` (existing). No network calls of its own.

### 4.14 Tests

Unit (`game/tests/quests/`): (1) `journal-data` schema validator accepts all 14 and rejects a missing marker reference, a count of 0, a string over the length limits; (2) `statusOf` for each state in 4.6, including level gate and cooldown; (3) `progressOf` for each objective type with fake events; (4) reward idempotency (complete twice → one award); (5) `nextDailyReset` across a UTC day boundary and DST-free; (6) tracker limit of 3, pin order, persistence round-trip, migration of an old `ftf.quests.v1` blob; (7) guide steps advance only in order and persist; (8) `portalPrompt` table for every row in 4.12 (no literal 200 / 10,000 in the output; fee passed as an argument); (9) truncation lint: no element created by the tracker has `text-overflow: ellipsis` without a `title` (R7); (10) auto-walk planner: path around a box obstacle, no path case, cancel on each input, arrival at 2.2 m (pure planner tested without Three.js).
E2E (headless Chrome, `?demo=quests` seed): (E1) open the page with `questTracker` on: the longest objective string ("Optional: the innkeeper on the lower street has a sign to read") is fully visible at 1280 × 720 and 390 × 844; (E2) press J: the journal opens, five tabs, counts match; (E3) select `q_spiders`: detail shows giver "Guard", counters 0/10 and 0/5, silk 20 and 80 XP; (E4) click the row twice: auto-walk starts, `autowalk.started` fires, Iris position moves toward the giver; (E5) press W mid-walk: `autowalk.cancelled` with `reason: 'input'`; (E6) walk to within 2.2 m: `autowalk.arrived`, the prompt shows; (E7) kill 3 spiders via the test hook: tracker shows 3/10 and the journal agrees; (E8) the Road Home bar equals the HUD tooltip's "counts for the Gate" number; (E9) daily tab shows the countdown; (E10) flag off: the old pill is clickable and wraps.

### 4.15 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line if late |
|---|---|---|
| 0:00 | Read `quests-data.js`, `quest-rules.js`, `town-quests.js`; write `journal-data.js` with all 14 quests; schema validator and its tests | 10 quests (drop 4 side) |
| 0:30 | `statusOf`, `progressOf`, new objective types, persistence and migration; unit tests 1 to 6 | |
| 1:00 | Journal UI shell: frame, header, tabs, list rows, states | |
| 1:30 | **PR wave 1:** journal detail pane, objectives, rewards, hints, empty states, J/L key via A2's action; `en-quests.js` strings | |
| 2:00 | Tracker UI (replacing the pill), Road Home bar (reads `silkView()` stub), collapse, flash states | |
| 2:30 | Auto-walk planner and injection; cancel rules; label; trail | straight steering without A* |
| 3:00 | **PR wave 2:** waypoint arrow, markers to the minimap, starter guide with coach marks | |
| 3:30 | Portal prompt and confirm dialog rewrite; `town-quests.js` uses `silkView()`; flag-off fallback fix | |
| 4:00 | E2E E1 to E10 | |
| 4:30 | Fix wave from usability results; phone layout | |
| 5:00 | **Final PR**, `docs/sprint/HANDOFF-A1.md` (what shipped, flags, known gaps) | |

### 4.16 Acceptance criteria (all must pass)

1. Press J or L: the journal opens within 150 ms with five tabs, 14 quests across the right tabs, counters, giver names, rewards.
2. No text is cut anywhere in the tracker or journal at 1920, 1280, 390 px widths (E1).
3. Clicking a selected quest row (or the Walk button) makes Iris run to the giver; W A S D cancels at once (E4, E5).
4. The Road Home number equals the HUD tooltip's Gate number and the portal prompt's number in the same frame (E8).
5. `story.portal.*` texts match 4.12; a grep for `10,000`, `20000` and a literal `200` in the A1 files finds nothing but tests and comments.
6. The starter guide completes in order on a fresh profile in a scripted run (E-first-10-min, A5).
7. All unit tests and E1 to E10 pass in `scripts/verify-sprint.sh`; the flag-off path still works.

### 4.17 What A1 must NOT touch

`game/src/ui/hud.js`, `player-hud.js`, `keybinds.js` (A2); any `market`, `chest`, `wheel`, `silk-balance` file (A3); `onboarding.js`, `premise.js`, `townsfolk*.js`, dialogue (A4); `main.js`, `boot-world.js` (A5, except to report a missing seam); `scenes/lab/**`, art (A6). `mobs.js` is read-only for you: listen to `mob.killed`.

### 4.18 Hand-off

To A2: marker list API and the tracker's top offset (268 px). To A3: you consume `silkView()` and call `syncSilkNow()`. To A4: you expose `quests.accept(id)`, `quests.state()` and `bus` events `quest.*` for the dialogue; the Elder's first dialogue ends by calling `quests.accept('q_welcome')`. To A5: list the e2e hooks (`window.__ftfTest.quests`).

### 4.19 Ready-to-paste prompt for A1

```
You are Agent A1 on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee, branch sprint/5h-a1, PRs into sprint/5h; never push to main, never deploy, no secrets, no mainnet).
Read first: docs/sprint or /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3 and 4; FTF-Owner-Master-Plan.md section 3; FTF-Story-Quests-Leaderboard-TZ.md quest definitions.
Mission: build the quest journal (list UI, J and L), the tracker that REPLACES the truncating .ftf-story-goal pill, auto-walk to the quest giver (cancel with W A S D), markers/waypoints, the 8-step starter guide, and the portal prompt/confirm copy. Every string, number, layout and test is specified in section 4: follow it exactly. English only, silk only, the portal fee always from config (never a literal 200 or 10,000), flags questJournal/questTracker/autoWalk/starterGuide, honour the file-ownership matrix in 3.8, consume silkView() from A3 for every silk number (never read the local ledger for the Gate number), and use sprint/tooltip.js and first-seen.js from A5.
Work in 30-minute blocks per 4.15, rebase on sprint/5h at each block, open PRs at 1:30, 3:00, 4:30 and final at 5:00. Write unit and e2e tests (4.14). Append requests to other agents under "## A1" in docs/sprint/BOARD.md and do not edit files you do not own. Finish with docs/sprint/HANDOFF-A1.md. If you are behind, cut to the "minimum polished line" in 4.15 and say so on the board.
```

---

## 5. Agent A2 (Opus 5.5): HUD, hotbar, skills, progression, skill tree, controls

### 5.1 Mission

I want a base-MMORPG user interface that every player already knows how to read: **HP, mana and XP bars, a minimap, a hotbar of nine skills with cooldown sweeps, a quest tracker slot, a chat and log panel, buff icons, damage numbers**; **WASD movement, click or Tab targeting, number-key skills, consistent hotkeys and a rebind screen**; **an XP curve, levels 1 to 20, stat points, three skill branches (Linguist, Scholar, Warden) that fit Iris's lore, unlock rules and a respec**; clear tooltips, readable contrast and satisfying feedback. Minimal but polished, in five hours. The silk chip shows the **one** silk number with its breakdown (screenshot C2).

### 5.2 Scope in and out

In: HUD frame, bars, hotbar, cooldowns, buffs, target frame, cast bar, minimap, menu tray, chat/log container, damage-number kinds and colours, XP and level logic, stats, skills data and tree UI, character panel, keybindings and the rebind screen, level-up effect, silk chip display. Out: quest tracker (A1; reserve its slot), market, bag and chest panels (A3), dialogue (A4), 3D art (A6). The HUD is a **new layer** `game/src/rpg/` mounted behind `rpgHud`; the old `player-hud.js` stays as the fallback when the flag is off.

### 5.3 File-by-file change list

| File | Action | Detail |
|---|---|---|
| `game/src/rpg/index.js` | create | `mount(ctx)`; wires bus; mounts HUD, hotbar, tree, character |
| `game/src/rpg/hud-layout.css` | create | every position and size in 5.4 |
| `game/src/rpg/hud.js` | create | player frame, target frame, cast bar, buffs, XP bar, tray, chat/log container |
| `game/src/rpg/hotbar.js` + `hotbar.css` | create | 9 slots, states, cooldown sweep |
| `game/src/rpg/minimap.js` | create | canvas minimap, zoom, markers from `sprint/markers.js` |
| `game/src/rpg/skills-data.js` | create | the 4 base skills and 15 tree nodes as data (5.7), pure |
| `game/src/rpg/skills.js` | create | learn, respec, cast rules, cooldown and mana, effects, pure with a small effect applier |
| `game/src/rpg/progression.js` | create | XP curve, levels, stat points, derived stats (5.6), pure |
| `game/src/rpg/skill-tree-ui.js` + css | create | the tree (5.9) |
| `game/src/rpg/character-panel.js` + css | create | stats panel (5.10) |
| `game/src/rpg/silk-chip.js` | create | silk chip reading `silkView()` (5.12) |
| `game/src/ui/keybinds.js` | modify | add actions of 3.5, `duplicates()` swap flow |
| `game/src/ui/keyboard-map.js`, `settings-popup.js` | modify | the rebind screen (5.11) |
| `game/src/game/town-economy.js` | modify | keep `levelOf` (same curve), extend to cap 20, add `statPoints`, `skillPoints`, saved in the existing profile blob (`[VERIFY]` key) with a migration |
| `game/src/play/kill-xp.js`, `profile.js` | modify | emit `xp.gained`, `level.up`; profile opens the character panel |
| `game/src/scenes/town-casting.js`, `town-casting-fx.js` | modify | route Strike, Lance, Snare, Dash through `skills.js` so mana, cooldown and the hotbar are the single truth; keep existing animations and damage values |
| `game/src/ui/float-numbers*.js` | modify | kinds and colours (5.13) |
| `game/src/play/locales/en-hud.js` | create | strings in this section |
| `game/tests/rpg/*.test.mjs` | create | 5.16 |

### 5.4 HUD layout (1920 × 1080 reference; all "px" scale with `--u`; positions are the top-left of each element unless noted)

| Element | x, y | Size | Content and style |
|---|---|---|---|
| **Player frame** | 24, 24 | 360 × 96 | panel background; portrait circle 72 × 72 at (12, 12) with a 2 px `--ftf-gold-dim` ring; name "Iris" 16 px 700 at (96, 12); level chip "Lv 7" 12 px 700 at (160, 12), 36 × 18, gold text on `rgba(246,200,96,.15)`; **HP bar** at (96, 36), 248 × 18, fill `--hp`, background `--hp-bg`, 1 px border `rgba(0,0,0,.6)`, centred text "142 / 180" 12 px 700 with a 1 px black shadow; **mana bar** at (96, 58), 248 × 14, fill `--mana`; |
| **Buff row** | 24, 128 | up to 10 × 32 px icons, gap 4 | icons 32 × 32 with 2 px border (green buff, red debuff), duration text 11 px **inside** the icon at the bottom, sweep overlay; wraps at 360 px; tooltip on hover |
| **Target frame** | 800, 24 | 320 × 64 | appears only with a target; name 16 px 700; level; HP bar 296 × 14 at (12, 40); elite mobs get a gold dragon-border; a debuff row under it (24 px icons) |
| **Minimap** | 1696, 24 | 200 × 200 circle | ring 3 px `--ftf-gold-dim`; north tick "N" 12 px at the top inside; player arrow at the centre; zoom buttons "+" and "−" 24 × 24 at the circle's lower left; coordinates label under it (1696, 228), 12 px `--ftf-muted`: "x −12 · z 52"; click = big map (M) |
| **Quest tracker slot** | 1576, 268 | 320 × up to 420 | **owned by A1**; A2 reserves the rectangle and never overlaps it |
| **Cast bar** | 810, 940 | 300 × 16 | fill `--ftf-gold`, text 12 px "Lance"; appears only for casts longer than 0.3 s; interrupt turns it red for 300 ms |
| **Hotbar** | 684, 1000 | 552 × 56 | 9 slots 56 × 56, gap 6; key label 12 px 700 at the slot's top-left (4, 2) on a 16 × 14 dark chip; |
| **XP bar** | 684, 1064 | 552 × 8 | fill `--xp`, background `--xp-bg`; tooltip "Level 7: 1,840 / 2,300 XP"; a thin white tick every 25% |
| **Chat and log** | 24, 836 | 420 × 220 | three tabs "Log", "Chat", "Loot" (24 px tall, 13 px); body 14 px with 4 px line gap; background `rgba(14,16,24,.72)`, becomes `.92` on hover or focus; scroll with the wheel; **Enter** opens the input line (40 px) |
| **Silk chip** | 1372, 1012 | 168 × 44 | see 5.12 |
| **Menu tray** | 1552, 1012 | 344 × 44 | seven 44 × 44 buttons gap 6: Character (C), Skills (N), Journal (J), Map (M), Bag (I), Market (B), Menu (Esc); icon 24 px; key label 11 px at the bottom-right; a gold dot badge when something is new (unspent points, quest ready, chest in the bag) |
| **Toasts** | 960 (centre), 140 | up to 480 × 48 | stacked down, max 3, 3.5 s each |

Phone layout (< 900 px wide): player frame scales to 280 × 80 at (12, 12); hotbar shows slots 1 to 5 in a 5 × 1 row at the bottom centre, each 48 × 48, with the rest on a swipe-up drawer; the tray collapses to one "☰" button 48 × 48 at the bottom-right that opens a 3 × 3 grid; minimap 140 × 140; chat collapses to a one-line ticker; every target at least 44 × 44.

### 5.5 Component states

**Hotbar slot** (56 × 56):

| State | Visual |
|---|---|
| empty | dashed 1 px border `--ftf-border`, key label only, tooltip "Empty slot. Learn skills in the Skills window (N)." |
| ready | icon 40 × 40 centred, 2 px solid border `--ftf-border`; hover border `--ftf-gold` and the tooltip |
| pressed | scale 0.94 for 80 ms, border `--ftf-gold` |
| cooldown | icon at 35% brightness; clockwise radial sweep overlay (`conic-gradient`, `rgba(0,0,0,.6)`) that unwinds; remaining seconds centred 16 px 700 (one decimal under 3 s, whole seconds above); the global cooldown (0.5 s) shows only the sweep |
| no mana | icon tinted blue-grey, the key label turns `--ftf-danger`, a 100 ms red flash and the mana bar pulses; the cast does not happen; the log line "Not enough mana." once per second |
| out of range | icon tinted red 30%, a flash on press, log line "Target is out of range." |
| no target (needs one) | same as out of range, message "Select a target first." |
| active (toggle or channelled) | gold 2 px border pulsing 1 s |
| locked (not yet learned, on the tree) | greyscale icon, padlock 14 px, tooltip with the requirement |

**Bars:** default; low (HP below 25%: the bar pulses `--ftf-danger` at 1 Hz and the screen edge gets a 12% red vignette; no pulse under reduced motion); damaged (white "ghost" segment that drains over 500 ms); healed (green flash 200 ms); full (no text change). Text always shows `current / max`.

**Menu tray button:** default, hover, active (the window is open: gold border), badge, disabled while a cinematic plays (tooltip "Not now").

**Buff icon:** buff, debuff, expiring (blink at 3 s left unless reduced motion), stacked (count in the bottom-right 11 px).

**Minimap:** default (60 m radius), zoom 40 m / 60 m / 100 m (buttons disable at the limits with a tooltip), loading (spinner ring while the town data is not ready), fog outside the town walls is dimmed.

### 5.6 Progression (the XP curve keeps the existing formula: **level n needs 50 · n · (n + 1) total XP**, level 0 at 0 `[V]` `levelOf` in `town-economy.js`; the table extends it to 20)

| Lv | Total XP to reach | XP this level needs | Max HP | Max mana | Skill pts (cum.) | Stat pts (cum.) | Stone-spider kills to next (20 XP) | Unlocks |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 100 | 100 | 60 | 0 | 0 | 5 | Strike F, Lance Q, Snare V, Dash Space |
| 2 | 100 | 200 | 112 | 66 | 1 | 3 | 10 | Skill tree (N), stat points (C), first hotbar tiers |
| 3 | 300 | 300 | 124 | 72 | 2 | 6 | 15 | Tier-2 nodes; Side quests board |
| 4 | 600 | 400 | 136 | 78 | 3 | 9 | 20 | Daily quests |
| 5 | 1,000 | 500 | 148 | 84 | 4 | 12 | 25 | Tier-3 nodes; Market listings (10 active) |
| 6 | 1,500 | 600 | 160 | 90 | 5 | 15 | 30 | - |
| 7 | 2,100 | 700 | 172 | 96 | 6 | 18 | 35 | Tier-4 nodes |
| 8 | 2,800 | 800 | 184 | 102 | 7 | 21 | 40 | - |
| 9 | 3,600 | 900 | 196 | 108 | 8 | 24 | 45 | - |
| 10 | 4,500 | 1,000 | 208 | 114 | 9 | 27 | 50 | Tier-5 ultimates; Season Cup entry badge |
| 11 | 5,500 | 1,100 | 220 | 120 | 10 | 30 | 55 | - |
| 12 | 6,600 | 1,200 | 232 | 126 | 11 | 33 | 60 | - |
| 13 | 7,800 | 1,300 | 244 | 132 | 12 | 36 | 65 | - |
| 14 | 9,100 | 1,400 | 256 | 138 | 13 | 39 | 70 | - |
| 15 | 10,500 | 1,500 | 268 | 144 | 14 | 42 | 75 | Respec cost x2 tier |
| 16 | 12,000 | 1,600 | 280 | 150 | 15 | 45 | 80 | - |
| 17 | 13,600 | 1,700 | 292 | 156 | 16 | 48 | 85 | - |
| 18 | 15,300 | 1,800 | 304 | 162 | 17 | 51 | 90 | - |
| 19 | 17,100 | 1,900 | 316 | 168 | 18 | 54 | 95 | - |
| 20 | 19,000 | 0 | 328 | 174 | 19 | 57 | - | Level cap (XP still counts for the board) |

Rules:
- Skill points: 1 per level from level 2 (19 at level 20). Stat points: 3 per level from level 2 (57 at level 20).
- Stats: **Voice** (damage): +2% skill damage per point. **Mind** (mana): +6 max mana and +1% mana regeneration per point. **Grit** (health): +8 max HP per point. Spending is free; stat points can be reset together with skills (5.8).
- Derived: `maxHP = 100 + 12·(L−1) + 8·Grit`, then × (1 + passive %); `maxMana = 60 + 6·(L−1) + 6·Mind`; mana regeneration `3 / s × (1 + 0.01·Mind) × (1 + passive %)`; out-of-combat HP regeneration 1.5% of max HP per second after 5 s without taking damage; crit chance 5% (x1.5 damage), shown in the character panel.
- XP sources (existing, unchanged): stone spider 20, veilbell 40, hulker 90, crownrift 250, critter 15, first kill +40; quest XP from the quest table (4.5). XP gained is never silk.
- Level 20 is the cap; XP keeps counting for the leaderboard.
- Level-up effect (`level.up`): banner top centre (y = 160) "Level {n}" 28 px `--font-title` gold with a 1.2 s rise and fade, a ring burst around Iris (existing `town-casting-fx` ring `[VERIFY]`), the sound cue `levelup`, the log line "You reached level {n}. You have {sp} skill point(s) and {tp} stat points.", and the tray buttons Skills and Character get a gold dot. Under reduced motion: banner only, no ring.

### 5.7 Skills data (`skills-data.js`; exact numbers)

Base skills (always known; **damage values, ranges, animations and timings stay as they are in the code** `[VERIFY in town-casting.js]`, the table adds only the HUD data):

| Id | Name | Key and slot | Type | Mana | Cooldown | Range | Tooltip description (exact) |
|---|---|---|---|---|---|---|---|
| `strike` | Strike | F, slot 1 | active, melee | 0 | existing (default 0.6 s) | 2.5 m | "A quick blow. Costs nothing." |
| `lance` | Lance | Q, slot 2 | active, ranged | 8 | existing (default 2.5 s) | 12 m | "A lance of focused sound. Hits one target from a distance." |
| `snare` | Snare | V, slot 3 | active, control | 12 | existing (default 10 s) | 8 m | "Words that tangle the legs of an enemy. It cannot move for a moment." |
| `dash` | Dash | Space, slot 4 | active, movement | 0 | existing (default 3 s) | 6 m | "A short sprint. You cannot be hit while it lasts." |

Tree nodes (15). `cost` is skill points; `req` is the node that must be learned first in the same branch; `lv` is the minimum level. Damage numbers are multipliers of the base skill's existing damage ("base damage" = the damage of Lance for ranged effects, of Strike for melee ones).

| Id | Branch | Tier | Name | Type | Cost | Lv | Req | Mana | Cooldown | Effect (exact numbers) | Tooltip text (exact) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ling_diction` | Linguist | 1 | Clear Diction | passive | 1 | 2 | none | 0 | 0 | Lance damage +10% | "Your words land cleaner. Lance does 10% more damage." |
| `ling_echo` | Linguist | 2 | Echo Word | active | 1 | 3 | `ling_diction` | 12 | 12 s | Repeats your last damaging skill at 60% power on the same target | "Say it again. Repeats your last attack at 60% power." |
| `ling_hush` | Linguist | 3 | Hushing Phrase | active | 2 | 5 | `ling_echo` | 20 | 20 s | Enemies within 6 m cannot attack for 3 s (bosses: 1.5 s) | "A word that stills a crowd. Nearby enemies cannot attack for 3 seconds." |
| `ling_fluent` | Linguist | 4 | Fluent | passive | 2 | 7 | `ling_hush` | 0 | 0 | Mana regeneration +25% | "You speak without effort. Mana returns 25% faster." |
| `ling_babel` | Linguist | 5 | Babel Burst | active (ultimate) | 3 | 10 | `ling_fluent` | 40 | 45 s | 4 m burst around the target: 250% of Lance damage to every enemy | "Every language at once. A burst of sound hurts all enemies close to the target." |
| `sch_notes` | Scholar | 1 | Field Notes | passive | 1 | 2 | none | 0 | 0 | +10% XP from kills | "You write everything down. Kills give 10% more XP." |
| `sch_catalog` | Scholar | 2 | Cataloguer | passive | 1 | 3 | `sch_notes` | 0 | 0 | +10% (relative) chance that a monster drops a resource or a chest; **the chest contents never change** | "You know where to look. Monsters drop things 10% more often." |
| `sch_insight` | Scholar | 3 | Insight | active | 2 | 5 | `sch_catalog` | 15 | 25 s | Marks the target for 15 s: it takes +25% damage and shows its HP numbers | "You see its weak point. The marked enemy takes 25% more damage for 15 seconds." |
| `sch_reader` | Scholar | 4 | Speed Reader | passive | 2 | 7 | `sch_insight` | 0 | 0 | +15% XP from quests | "You read a notice once. Quests give 15% more XP." |
| `sch_eye` | Scholar | 5 | Omniscient Eye | active (ultimate) | 3 | 10 | `sch_reader` | 25 | 90 s | For 20 s: all enemies show on the minimap and drops show a loot beam from twice as far | "For a short time you see everything. Enemies and loot show far away." |
| `war_stance` | Warden | 1 | Steady Stance | passive | 1 | 2 | none | 0 | 0 | Max HP +10% | "You plant your feet. Max health +10%." |
| `war_brace` | Warden | 2 | Brace | active | 1 | 3 | `war_stance` | 10 | 18 s | Damage taken −35% for 4 s | "Hold fast. You take 35% less damage for 4 seconds." |
| `war_wind` | Warden | 3 | Second Wind | passive | 2 | 5 | `war_brace` | 0 | 0 | Out-of-combat HP regeneration ×2 | "You recover quickly. Health returns twice as fast when you are not fighting." |
| `war_shield` | Warden | 4 | Shield Phrase | active | 2 | 7 | `war_wind` | 20 | 30 s | Absorbs damage equal to 30% of max HP for 8 s | "A phrase that guards you. Absorbs damage up to 30% of your health for 8 seconds." |
| `war_unbroken` | Warden | 5 | Unbroken | passive (ultimate) | 3 | 10 | `war_shield` | 0 | 120 s | A hit that would kill you leaves you at 1 HP once per 120 s; damage taken −5% always | "You refuse to fall. Once every two minutes a deadly hit leaves you with 1 health." |

A full branch costs 1 + 1 + 2 + 2 + 3 = 9 points; a player at level 10 has 9 points, at level 20 has 19: so a player may take one full branch plus a second branch up to tier 4, **never all three**. This is intended (the choice is the point).

Branch colours: Linguist `--ftf-info` (blue), Scholar `--ftf-gold`, Warden `--ftf-ok` (green); each branch has a 28 px glyph (speech bubble, open book, shield).

JSON shape of a node (`skills-data.js` exports the array):

```json
{ "id": "ling_echo", "branch": "linguist", "tier": 2, "name": "Echo Word", "kind": "active",
  "cost": 1, "level": 3, "requires": "ling_diction", "mana": 12, "cooldownMs": 12000,
  "effect": { "type": "echo", "power": 0.6 }, "icon": "echo", "text": "Say it again. Repeats your last attack at 60% power." }
```

Hotbar assignment rule: learned active skills go to the first empty slot among 5 to 9; the player can drag a skill from the tree onto any slot (HTML5 drag, plus keyboard: select a node and press 5 to 9); layout persisted `ftf.hotbar.v1`.

### 5.8 Cast and cooldown state machine

`idle → (key press) → validate → (fail: flash + log) | casting → effect → cooldown → idle`
- validate order: not dead → skill learned → not on cooldown (own and global 0.5 s) → mana ≥ cost → target present if needed → range;
- casting: instant skills skip it; the cast bar shows only if cast time > 0.3 s;
- the mana is spent at effect time, never on a failed validation;
- `skill.cast` is emitted at effect time;
- death resets nothing; respawn at the gate refills HP and mana.

**Respec:** button "Reset skills and stats" in the skill tree footer: returns all points; **free the first time, then a 5-minute cooldown** (no silk is spent, so the silk model stays clean); confirm dialog "Reset all skill and stat points? You get them back to spend again. [Reset] [Cancel]"; emits `skill.respec`.

### 5.9 Skill tree window (N)

Modal 1100 × 640 px, centred, `--z-modal`. Header (56 px): "Skills" 28 px title; right: "Skill points: 3" chip and "Stat points: 6" chip; close 40 × 40. Body: three columns, each 340 px wide with 20 px gaps, branch header (glyph and name, 18 px 700, branch colour) at the top, five nodes stacked vertically (each node 64 × 64 icon with a 2 px border, 24 px connector line between them, tier label to the left 12 px "Tier 1"). Node states: **learned** (solid branch-colour border, check badge), **available** (pulsing border, "Learn" on click), **locked by requirement** (greyscale, padlock, tooltip "Learn Echo Word first"), **locked by level** (tooltip "Requires level 5"), **cannot afford** (tooltip "Costs 2 skill points. You have 1."). Click on an available node = learn immediately with a 200 ms flash (no confirm: it is free and resettable). Right panel? none: details are in the tooltip (see below). Footer (56 px): "Reset skills and stats" secondary button left, a short hint "Drag a skill onto the hotbar, or select it and press 5 to 9" right.

Tooltip layout (via `tooltip.js`): title 16 px 700; line 2 muted: "Active · Linguist · Tier 2"; line 3: "Mana 12 · Cooldown 12 s"; description 14 px; footer for a locked node: the requirement in `--ftf-warn`.

First-open coach mark (A4 copy `tip.skills`) is shown on the first level-up.

### 5.10 Character panel (C)

Modal 720 × 560 px. Left (280 px): portrait 160 × 160 (existing `profile.js` portrait), name, "Level 7 · Linguist" (the branch with the most points, "Newcomer" with none), XP bar with numbers, title chip. Right: stats list with "+" buttons: Voice, Mind, Grit (value, "+" 28 × 28 enabled when stat points > 0, tooltip explains the effect "Each point: +2% skill damage"), then derived numbers (read-only): Max HP, Max mana, Mana regeneration, Crit chance, Damage bonus. Footer: "Stat points left: 6". The "+" has a 150 ms confirm flash; keys: Up/Down select a stat, Enter adds a point.

### 5.11 Rebind screen (Settings → Controls; extends the existing keyboard map)

Layout: left, an on-screen keyboard (existing `keyboard-map.js`) highlighting bound keys; right, a table of actions grouped Movement / Combat / Skills (1 to 9) / Windows / Misc, each row 40 px: action name 16 px, current key as a "keycap" 14 px 700, "Rebind" button, "Reset" icon. Click Rebind: the row shows "Press a key… (Esc to cancel)" in `--ftf-warn`; a collision shows an inline question "E is used by Interact. Swap? [Swap] [Cancel]"; reserved keys show "That key is reserved." Bottom: "Reset all to default" (confirm). Changes apply immediately and persist (`ftf.keys.v1`). `F1` opens a read-only cheat sheet of the same table (A2) and the glossary link (A4).

### 5.12 The silk chip (shows the one number; implements C2 on the HUD side)

Chip 168 × 44 at (1372, 1012): coin icon 24 × 24 at (10, 10); **line 1** (x = 42, 16 px 700, `--ftf-silk`): `gateC` as a whole number or up to 2 decimals (this is the number that counts toward the Gate; it is the same number as the Road Home bar and the portal prompt); **line 2** (12 px, `--ftf-warn`): "+{pending} waiting" shown only when `pendingC > 0`, with a 24 × 24 **Sync** icon button at the right when `!syncing`; while syncing a 14 px spinner and "Syncing…". If `chainOk` is false: line 2 reads "Offline" in `--ftf-muted`.
Tooltip (rich, on hover, focus and tap), exact lines:
1. "Silk that counts for the Gate-Loom: {gate}" (bold)
2. "Recorded on NEAR: {onChain}"
3. "Waiting to be recorded: {pending}" (hidden when 0)
4. "Play silk (saved on this device only): {play}" (hidden when 0)
5. "All silk you hold: {total}"
6. "Gate price: {fee}"
7. "Press Sync to record the waiting silk now. It also syncs by itself every minute."
8. Link "What is silk?" opens the glossary entry.
Float numbers for silk (`+3 silk`) add to **pending** first; the chip's line 1 changes only when the chain number changes; the chip does a small "pop" on a sync that raises it. Clicking the chip opens the wallet breakdown card (A3).

### 5.13 Damage and feedback numbers (extend `float-numbers.js`; flag `damageNumbers` on)

| Kind | Text | Colour | Size | Motion |
|---|---|---|---|---|
| damage dealt | "18" | `#ffffff` with 1 px black outline | 18 px | rises 40 px in 700 ms, fades |
| critical | "34!" | `--ftf-gold` | 26 px with a ring | pop scale 1.0 → 1.4 → 1.0 in 160 ms |
| damage taken | "−7" | `--ftf-danger` | 20 px | rises 30 px, slight left drift |
| heal | "+12" | `--ftf-ok` | 18 px | rises |
| silk gained | "+3 silk" | `--ftf-silk` | 16 px | rises from the mob, then flies to the chip when `reduced()` is false |
| XP gained | "+20 XP" | `--ftf-xp` | 14 px | stacked under the damage, merges within 400 ms ("merge window") |
| miss / resisted | "Miss" | `--ftf-muted` | 14 px | |
| mana spent | not shown | | | |

Pool of 24 elements (existing), merge rule existing (`mergeOrAdd`); under reduced motion numbers fade in place without rising.

### 5.14 Chat and log

Tabs: **Log** (combat and system: hits, xp, loot, quest updates), **Chat** (nearby players, uses the existing chat module `[VERIFY]`), **Loot** (items and silk only). Colours: system `--ftf-muted`, quest `--ftf-gold`, loot by rarity colour, errors `--ftf-danger`. Keep the last 200 lines. Hover opacity .92. Timestamps hidden by default.

### 5.15 Events and API

Emits: `hud.mounted`, `xp.gained`, `level.up`, `skill.cast`, `skill.learned`, `skill.respec`, `stat.spent`, `keybind.changed`. Reads: `silkView()`, `markers`, `mob.killed`. Exposes `window.__ftfTest.rpg = { grantXp(n), setLevel(n), learn(id), cast(slot), state() }` for e2e (behind `?test=1`).

### 5.16 Tests

Unit (`game/tests/rpg/`): (1) XP table: `levelOf(50·(L−1)·L)` returns L for L = 1 to 20 and `levelOf(that − 1)` returns L − 1; (2) HP, mana, regeneration formulas against the table; (3) skill point and stat point totals at every level; (4) learn rules: cost, level, requirement, insufficient points, double-learn; (5) tier chain: a full branch costs 9, three branches cannot all be completed at level 20 (assert); (6) cast validation order and the failure messages; (7) cooldown with a fake clock including global cooldown; (8) echo, hush, insight, brace, shield and unbroken effects (apply to a fake combatant); (9) respec: free first, cooldown, points returned exactly; (10) hotbar assignment, drag and persistence; (11) keybind swap and reserved key rejection, defaults include the 3.5 table; (12) float number kinds colours and merge; (13) silk chip text for every `silkView()` case (5.12), including offline.
E2E: (E1) fresh profile shows every HUD element at the coordinates of 5.4 within ±2 px at 1920 × 1080 and no overlap between the HUD rectangles and the A1 tracker slot; (E2) press 1 to 4: the skills fire, cooldown sweeps and mana move; (E3) kill 5 spiders via the hook: XP bar and level change, `level.up` fires with the banner; (E4) open N, learn `ling_diction`, `ling_echo`; the skill appears on slot 5, pressing 5 casts it; (E5) respec returns the points; (E6) rebind Strike to G, press G, it strikes; the table in settings persisted after reload; (E7) low HP shows the vignette (class present); (E8) the silk chip equals the portal prompt number and shows the pending line; (E9) 390 px phone layout: 5 slots, no overlap, targets ≥ 44 px; (E10) reduced motion: no sweep animation, no vignette pulse.

### 5.17 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line |
|---|---|---|
| 0:00 | Read `player-hud.js`, `hud.js`, `town-casting.js`, `keybinds.js`; write `progression.js` and the XP table test | |
| 0:30 | `hud-layout.css` and `hud.js`: player frame, bars, target, tray | |
| 1:00 | Hotbar, slots, states, cooldown sweep, tooltips | |
| 1:30 | **PR wave 1:** HUD + hotbar working with Strike/Lance/Snare/Dash through `skills.js`, mana and cooldown | |
| 2:00 | `skills-data.js`, learn/respec rules, effects for passives | effects for 9 of 15 nodes (active ultimates last) |
| 2:30 | Skill tree UI, drag to hotbar, character panel | |
| 3:00 | **PR wave 2:** progression wired (xp, level-up fx, stat points), float-number kinds | |
| 3:30 | Rebind screen, F1 cheat sheet, minimap with markers, silk chip | minimap without zoom buttons |
| 4:00 | E2E E1 to E10 | |
| 4:30 | Phone layout, reduced motion, contrast pass, fixes from usability | |
| 5:00 | **Final PR**, `docs/sprint/HANDOFF-A2.md` | |

### 5.18 Acceptance criteria

1. Every rectangle in 5.4 is where the table says (E1) and nothing overlaps the tracker slot.
2. Four base skills fire from 1 to 4 and from F, Q, V, Space; mana, cooldown sweeps and failure messages behave as 5.5 and 5.8.
3. Levels 1 to 20 match the XP table exactly; level-up gives points and the banner.
4. 15 nodes, correct costs and requirements; a player cannot learn all three branches; respec works.
5. Keys of 3.5 work, can be rebound with swap handling, and persist.
6. The silk chip shows the Gate number, the pending line and the tooltip exactly as 5.12; the same value as A1's Road Home bar.
7. Damage numbers use the colours of 5.13; reduced motion honoured.
8. Unit and e2e tests pass in `scripts/verify-sprint.sh`; with `rpgHud` off the old HUD works.

### 5.19 What A2 must NOT touch

Quest files, `town-quests.js`, `town-portal.js` (A1); market, chest, wheel, silk model (A3); dialogue, onboarding, tournament, townsfolk (A4); `boot-world.js`, `main.js`, `features.js`, README (A5); 3D scenes, art, rigs (A6). In `mobs.js` do nothing (the bus emit is A5's).

### 5.20 Hand-off

To A1: tray button ids for coach marks (`#rpg-tray-journal`, `#rpg-tray-bag`, `#rpg-tray-market`) and the tracker slot rectangle. To A3: bag and market tray buttons and `ui.openBag()`, `ui.openMarket()` hooks. To A4: the cheat-sheet table for the guide and the glossary link target. To A5: e2e hook `window.__ftfTest.rpg`.

### 5.21 Ready-to-paste prompt for A2

```
You are Agent A2 on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee, branch sprint/5h-a2, PRs into sprint/5h; never push to main, never deploy, no secrets, no mainnet).
Read first: /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3 and 5; the existing game/src/ui/keybinds.js, game/src/scenes/player-hud.js, game/src/scenes/town-casting.js, game/src/game/town-economy.js (levelOf: level n needs 50*n*(n+1) XP).
Mission: a base-MMORPG HUD layer (HP/mana/XP bars, minimap, 9-slot hotbar with cooldown sweeps, buffs, target frame, cast bar, tray, chat/log container, damage numbers), progression (levels 1-20 per the table), 3 skill branches (Linguist/Scholar/Warden, 15 nodes, exact numbers in 5.7), skill tree window, character panel, keybindings and rebind screen, and the silk chip that shows the single silk number from silkView() with its tooltip breakdown. Every coordinate, colour, state, string, number and test is in section 5: follow it exactly. English only, silk only, no literal portal price, flags rpgHud/skillTree/hotbar, strict file ownership (3.8), use sprint/tooltip.js and the design tokens. Keep existing skill damage values and animations; route them through skills.js so mana and cooldown are one truth.
Work in 30-minute blocks per 5.17, rebase on sprint/5h each block, PRs at 1:30, 3:00, 4:30, final 5:00. Write unit and e2e tests (5.16). Requests to other agents go under "## A2" in docs/sprint/BOARD.md. Finish with docs/sprint/HANDOFF-A2.md. If late, use the minimum polished line in 5.17.
```

---

## 6. Agent A3 (Opus 5.5): silk model, market and trade, chests and loot, play-money games, on-chain wiring

### 6.1 Mission

I want four things finished and demoable. **First, one silk number** (screenshot C2): the HUD, tracker, portal, journal and market all read the same model, with a plain breakdown. **Second, trade and a marketplace**: players trade monster resources for silk with other players (listings and an order book), settled on chain where the contracts support it (`ftf-town`, and NEP-245 items on `items.ftf-town.testnet`), with a clearly labelled demo settlement until I deploy the contract update. **Third, chests and loot done right**: rarity colours, loot beam, a chest-open animation, a chest service that **does not fail** on Open 5 and Open all (screenshot C3), and plain labels for what is saved on this device versus recorded on NEAR (screenshot C4). **Fourth, gambling mechanics framed legally**: a free wheel and a play-money dice game on a practice network, with odds and house edge shown, hard limits and no way to turn play silk into anything of value.

### 6.2 The single silk balance model (root cause of C2 and the fix)

**Root cause (found in code, [V]).** There are two stores and the UI mixed them:
- The HUD chip (`scenes/player-hud.js`) shows `ledger.silk`, the town ledger kept in this browser: every silk gain from every source, formatted with two decimals (`formatSilk`), so "128.64".
- The tracker and the portal prompt use `balanceC()` in `scenes/town-quests.js`: `chain.ok ? Math.max(chain.balanceC, ledger.earnedVerifiedC) : 0`, where `chain.balanceC` is the **on-chain** `balance_of.silk` of `ftf-town` read through `GET /api/town/gate` (`net/town-gate.js`), formatted as a whole number with `Math.floor(balanceC/100)`, so "38".
- The chain balance only contains silk the relayer has **credited** through `syncCredit` (`relayer/lib/town-gate.js`, `credit_silk`), and `syncCredit` credits only the **verified story log** (`creditableMicro`), the log must first be uploaded (`flush`), kill silk that counts is capped (`EXPEDITION.killVerifyCapC` = 100 silk), and the relayer applies a daily guest cap (`guestDaySilk`). Silk from the wheel, chests, some quest rewards and anything unverified never goes on chain.
- Result: 128.64 local silk, of which 38 is on chain; about 90.64 is "pending" (verified but not yet credited or capped) or "play" silk that can never be credited. Two more defects follow: `balanceC()` returns **0** whenever the chain read fails (so the number can jump to 0), and the two surfaces round differently.

**The fix: one model, `game/src/net/silk-balance.js`, exposed as `silkView()` (stub path `game/src/sprint/silk-view.js` re-exports it).**

```js
silkView() -> {
  feeC,            // the Gate price in cents: chain gate_price if read, else EXPEDITION.PORTAL_FEE_C (config); never a literal
  onChainC,        // ftf-town balance_of.silk, in cents (floor of micro-silk / 10,000)
  creditableC,     // silk the relayer would credit from the verified log right now (from the credit_only dry answer or verifyLog)
  pendingC,        // max(0, creditableC - onChainC): earned and verifiable, not yet recorded on chain
  playC,           // max(0, localTotalC - max(creditableC, onChainC)): local-only silk that can never go on chain (wheel, dice, unverified)
  localTotalC,     // ledger.silk, the town ledger in this browser
  totalC,          // onChainC + pendingC + playC
  gateC,           // = onChainC: what pay_gate can use right now (the headline number everywhere)
  enoughForGate,   // gateC >= feeC
  canSyncToEnough, // onChainC + pendingC >= feeC && !enoughForGate
  chainOk, stale,  // chain read succeeded; true if the shown value is the last good one (never silently 0)
  syncing, lastSyncAt, dayRoomC
}
```

Rules:
1. **Headline everywhere = `gateC`** (A1 tracker, A1 portal prompt, A1 journal header, A2 chip line 1, A3 market header). Format: whole number when whole, else at most 2 decimals, thousands separators; **one formatter** `formatSilkC(c)` exported from `silk-balance.js`; `player-hud.js` and `town-quests.js` import it (no local `toFixed`/`Math.floor` formatting of silk anywhere else; a grep test enforces it).
2. If the chain read fails, `silkView()` keeps the **last good** `onChainC` with `stale: true` (UI shows "Offline" and a refresh icon); it never reports 0 by itself. First read before any success: `chainOk: false`, `onChainC: 0`, UI says "Checking…".
3. Refresh: read on boot, after every `silk.sync`, after every on-chain action (portal, tournament, trade), every 30 s while the tab is visible, and on window focus. Debounce 2 s.
4. **Sync** (`syncSilkNow()`): flush the expedition log (`flush` in `net/town-gate.js`), then `POST /api/town/gate` with `credit_only: true`, signed as `ftf-town-credit|<account>|<at>` (**[V]** exists, rate limit 6 per minute per IP). Returns `{ok, creditedC, reason?}`. Auto-sync: when `pendingC > 0`, at most once per 60 s, and always right before the portal confirm. Errors map to plain text (6.7 table). While syncing `syncing = true`.
5. **A table of silk sources** `docs/silk-sources.md` (A3 writes it from `verifyLog` and `expedition-ledger.js`): each source (kill, quest reward, daily bounty, chest silk, wheel, dice, resource sale to a stall, trade) with `creditable: yes|capped|no`, so the glossary and the UI can say which silk "counts". The owner decision I want: **kills and quest rewards are creditable (as today, with their caps); chest silk is creditable if the relayer already writes it on chain, otherwise play silk; wheel and dice silk are play silk.** If an existing source is creditable in code but not in this table, the code wins and the table is corrected.
6. **Wallet breakdown card** (opened by the silk chip and the Road Home bar through `bus.emit('wallet.open')`): modal 520 × 440 px centred; title "Your silk"; four rows (each 56 px): "Counts for the Gate-Loom · {gate} · Recorded on NEAR, a public blockchain", "Waiting to be recorded · {pending} · Earned and checked. It moves on chain when you press Sync.", "Play silk · {play} · Saved on this device only. Used in the play-money games. It cannot open the Gate-Loom.", "Gate price · {fee} · Paid once, then removed forever." Bottom: primary **Sync now** (disabled with tooltip "Nothing is waiting." when `pendingC = 0`; spinner while syncing; error line below in `--ftf-danger`), secondary "What is silk?" (glossary), and the last sync time "Last synced 2 minutes ago". Empty/offline: "We can't reach the network. Your silk is safe. Try again."
7. The portal confirm (A1) calls `silkView()`; when `canSyncToEnough` the prompt offers Sync first (A1 4.12).

**Tests (unit, `game/tests/silk/`):** a table test of `silkView()` for these inputs → outputs: (a) local 128.64, onChain 38, creditable 60 → gate 38, pending 22, play 68.64, total 128.64; (b) local 128.64, onChain 128.64 → pending 0, play 0; (c) onChain 250, fee 200 → `enoughForGate`; (d) onChain 150, pending 60 → `canSyncToEnough`; (e) chain read fails after a good read → `stale`, same `gateC`; (f) chain read fails first → `chainOk:false`; (g) fee from chain overrides config; (h) `formatSilkC` for 0, 0.5, 38, 38.01, 1234.5, 128.64; (i) **grep test**: no file outside `silk-balance.js` contains `toFixed(2)` next to "silk" or `Math.floor(…/100)` of a silk balance; (j) `syncSilkNow` with a fake fetch: success, 429 with Retry-After, `no_verified_log`, network error. E2E: HUD chip, tracker, portal prompt, journal header and market header show the same number in one frame (E-silk-1); a sync button press changes pending into on-chain on the mock relayer (E-silk-2); chain offline shows "Offline" without zero (E-silk-3).

### 6.3 File-by-file change list

| File | Action | Detail |
|---|---|---|
| `game/src/net/silk-balance.js` | create | 6.2 |
| `game/src/sprint/silk-view.js` | implement | re-export |
| `game/src/market/index.js`, `market-ui.js`, `market.css`, `market-rules.js`, `market-client.js` | create | 6.4 |
| `game/src/market/games-ui.js`, `dice.js`, `games.css` | create | 6.8 |
| `game/src/market/wallet-card.js` | create | 6.2 item 6 |
| `game/src/market/loot-fx.js` | create | beam, pickup, chest world object (6.5) |
| `game/src/game/chests.js` | modify | pity rule, `scope` field, keep `DROP`, `TIER_WEIGHTS` and the deck untouched |
| `game/src/net/chest.js`, `chest-client.js` | modify | error mapping, retry and split (6.6) |
| `game/src/play/chest-open.js`, `chest-batch.js` | modify | animation (6.5), plain errors, partial results |
| `game/src/game/wheel.js`, `play/wheel-view.js` | modify | odds link, play-silk accounting, labels |
| `game/src/play/mobs.js` | modify (hooks only) | call `lootFx.onKill(mob)` and `chests.rollDrop`; nothing else |
| `game/src/net/market.js`, `stall-client.js`, `ui/stall-panel.js`, `ui/market-ticker.js`, `play/market-scene.js` | modify | open the new market, tx links |
| `relayer/lib/chest.js`, `relayer/api/chest/open.js` | modify | measured gas, error codes, health counters, rate limit |
| `relayer/api/market/p2p.js`, `relayer/lib/p2p.js` | create | order book and settlement (6.4) |
| `relayer/api/town/gate.js`, `relayer/lib/town-gate.js` | modify (minimal) | a `GET` that also returns `creditable`/`credited`/`day_room` for the model (6.2) |
| `contracts/town/src/lib.rs` (+ tests), `contracts/town-items/src/lib.rs` (+ tests) | modify | `trade_for`, `coordinator_transfer` (6.4); **tests only; deploy is mine** |
| `docs/silk-sources.md`, `docs/market.md`, `docs/chests.md` (append) | create/modify | |
| `game/src/play/locales/en-market.js` | create | strings of this section |
| `game/tests/silk/`, `game/tests/market/`, `relayer/tests/p2p.test.mjs`, `relayer/tests/chest-batch.test.mjs` (extend) | create/modify | 6.11 |

### 6.4 Trade and the marketplace

**What I want:** a player lists monster resources for silk; another player (or an agent) buys them; silk and items change hands, with a small fee that is removed forever, a price band that keeps trades honest, and a visible reason behind the reference price. A trade shows a transaction link when it settles on chain.

**Items that can be traded:** resources only, ids from `game/src/game/resources.js` `[VERIFY]` (`spider_silk_thread`, `chitin_plate`, `crown_shard`, …) mapped to NEP-245 token ids on `items.ftf-town.testnet` `[VERIFY]` through `items.tokens()` and `game/public/assets/items/manifest.json`. Chest items (shards and parts) are tradable too if their ids are in the same manifest. Silk, XP and play silk are not tradable.

**Fee and limit table (exact):**

| Rule | Value |
|---|---|
| Listing fee | 0 silk |
| Sale fee | 2% of the total price, rounded up to 0.01 silk, paid by the seller, **removed forever (burned)** |
| Minimum total per trade | 0.10 silk |
| Price band | unit price must be between 50% and 200% of the **reference price** (the stall's quote from `resource-desk.quote`, which follows the stock-and-demand rule) |
| Quantity per listing | 1 to 99 |
| Active listings per account | 10 |
| Listing duration | 24 hours, then it expires and the items stay with the seller |
| Daily trade volume per account | 500 silk (counted for buyer and seller; blocks wash trading) |
| Self-trade | blocked: "You cannot buy your own listing." |
| Tradable silk | **on-chain silk only** (the `onChainC` part of the model) in chain settlement; in demo settlement the relayer's demo balance |
| Cancel | free, instant |

**Listing schema (JSON):**

```json
{
  "id": "lst_7f3a9c12",
  "seller": "guest-ab12.guests.ftf-coordinator.testnet",
  "sellerKind": "player",
  "item": "spider_silk_thread",
  "tokenId": "spider_silk_thread",
  "qtyTotal": 10,
  "qtyLeft": 10,
  "unitPriceC": 320,
  "referenceUnitC": 300,
  "createdAt": 1790000000000,
  "expiresAt": 1790086400000,
  "status": "active",
  "settlement": "chain",
  "fills": [ { "buyer": "guest-cd34.guests.ftf-coordinator.testnet", "qty": 4, "totalC": 1280, "feeC": 26, "tx": "<hash or null>", "at": 1790000100000 } ]
}
```

`status`: `active → partial → filled`, or `active|partial → cancelled | expired | failed`. `settlement`: `chain` or `demo`. `sellerKind`: `player` or `agent` (shows the Agent badge). `id` is server-generated.

**State machine (relayer):** `create` (validate band, quantity, holdings read from `items.mt_balance_of` or the demo store, active limit, daily cap) → `active`; `buy(qty)` → reserve (lock the quantity for 20 s) → settle (chain path below) → `partial`/`filled`; failures release the reserve and set no fill; a background sweep expires listings.

**Matching:** a buy request names `listingId` and `qty`; the book also supports **bids** (a buyer posts "buy N at up to P"); a new listing that crosses a bid fills it at the **bid's** price, price-time priority. For the 5-hour scope the UI offers listings and bids, with bids shown in the same table as "Wanted" rows.

**Endpoints (new, `relayer/api/market/p2p.js`; same signing style as `relayer/lib/town-act.js`, message `ftf-market|<account>|<action>|<args joined by ,>|<at>`, 5-minute skew, replay-guarded):**

| Method and path | Body or query | Answer |
|---|---|---|
| `GET /api/market/p2p/book?item=<id>&side=sell\|buy` | | `{listings: [...], referenceUnitC, band: {minC, maxC}, settlement}` |
| `GET /api/market/p2p/mine?account_id=` | | `{listings: [...], fills: [...]}` |
| `POST /api/market/p2p/list` | `{account_id, public_key, at, signature, item, qty, unit_price_c, side}` | `{listing}` |
| `POST /api/market/p2p/buy` | `{..., listing_id, qty, request_id}` | `{fill: {qty, totalC, feeC, tx_items, tx_silk}, listing}` |
| `POST /api/market/p2p/cancel` | `{..., listing_id}` | `{listing}` |
| `GET /api/market/p2p/stats` | | `{today, volumeC, lastTrades: [...]}` (feeds the ticker) |

Errors (code → player text, what / why / next): `outside_band` "That price is outside the fair range ({min} to {max} silk each). The range keeps trades honest. Choose a price inside it."; `not_enough_items` "You do not have {qty} of that item. Check your bag."; `not_enough_silk` "You need {need} silk on chain and have {have}. Press Sync or earn more."; `listing_gone` "Someone else bought it first. Pick another listing."; `limit_listings` "You have 10 active listings. Cancel one first."; `daily_cap` "You reached today's trade limit of 500 silk. Come back after 00:00 UTC."; `self_trade`; `paused` "Trading is paused. Try again soon."; `rate_limited`; `network`.

**Settlement.**
- **Path A, `chain` (needs a contract update; code and tests are mine to ship in the repo, deployment is mine):** add to `contracts/town`: `trade_for(account_id: AccountId, counterparty: AccountId, silk: U, fee: U, reference: String, request_hash: String)` (coordinator only, replay-protected like `pay_gate_for`; moves `silk` from `account_id` to `counterparty` minus `fee` which is burned; counted against the existing per-player daily limit `act_limits`). Add to `contracts/town-items`: `coordinator_transfer(from: AccountId, to: AccountId, token_id: TokenId, amount: U128, request_hash: String)` (minter/coordinator only, replay-protected, emits an NEP-245 `mt_transfer` event). Rust unit tests: success, replay, unregistered account, insufficient silk, insufficient items, fee burn, not-coordinator, daily limit. Relayer sequence per fill: verify the buyer's signature and key → reserve → `town.trade_for(buyer → seller)` → `items.coordinator_transfer(seller → buyer)` → mark filled; if the second call fails, send the compensating reverse `trade_for` and mark `failed` (idempotent by `request_hash`). Show both tx hashes.
- **Path B, `demo` (works today, no deploy):** the relayer keeps a JSON store of demo balances (items and silk) per account, seeded from the account's real holdings on first sight (read-only) and moves them between the two accounts with the same rules; every listing, fill and toast says **"Demo settlement: recorded by the game server, not yet on the blockchain"** with a visible chip; no tx link is shown. Env `P2P_SETTLEMENT=demo|chain` (default `demo`); the owner flips it after the contract deploy (**I will do myself**).
- The Resource desk (NPC stalls, `POST /api/market/resource`, **[V] already on chain**) stays: "Sell to the stall now" shows the stall's price with the reasoning tooltip.

**Market UI (modal, `B`; 1180 × 680 px, centred, `--z-modal`; reduced motion: instant):**
- Header (56 px): "Market" title; right: Gate silk number from `silkView()` with its tooltip, close 40 × 40.
- Tabs (y = 56, 44 px): **Buy · Sell · My listings · Stalls · Games**; keys `1` to `5` while open.
- **Buy tab:** left filter column 260 px (search 40 px; category chips Spider, Chitin, Shards, Parts, All; sort select Cheapest / Newest; toggle "Only what I can afford"); table to its right with a header row 40 px and data rows 48 px: Item (32 px icon, name, 2 px rarity left bar), Qty, Unit price (silk), Total, Seller (name plus a **Player** or **Agent** badge, 12 px pills), Age ("12 min"), **Buy** button 80 × 32. A selected row opens a right drawer 320 px: item tooltip, "Reference price {x} silk. Why? (i)" (tooltip: "The stall's price follows stock and demand: more items in stock lowers it, more buyers raises it. Listings must stay within half to double of it."), quantity stepper (1 to qtyLeft), "Total {t} silk", "Seller receives {t − fee} silk (2% fee is removed forever)", the settlement chip (**On NEAR** or **Demo**), primary **Buy for {t} silk** (disabled when silk is not enough, tooltip "You need {n} more silk on chain"). Always a confirm: "Buy 4 Spider silk thread for 12.80 silk from {seller}? [Buy] [Cancel]".
- **Sell tab:** left an inventory grid (items you hold, 72 × 72 cells, rarity border, quantity badge, scope badge "On NEAR" or "This device", only tradable ones enabled); right the form: item, quantity stepper, unit price field prefilled with the reference price and a band hint "Allowed {min} to {max}", duration chip "24 h", preview "You receive {x} silk after the 2% fee", primary **List for sale**; secondary **Sell to the stall now for {s} silk** (with its reason tooltip).
- **My listings:** rows with a status chip (Active, Partly sold 4/10, Sold, Cancelled, Expired, Failed), fills with tx links, **Cancel** button, empty state "You have nothing listed." / "Open the Sell tab to list a resource."
- **Stalls tab:** the existing NPC trader list (existing `stall-panel.js` content) restyled with the same table, status chip (Open, Out of stock, **Closed: needs investors**), existing invest and claim buttons kept.
- **Games tab:** 6.8.
- **Ticker** under the header (existing `market-ticker.js`): last 5 trades "Maren sold 4 spider silk thread to Tobias for 12.80 silk ↗" with the tx link (`https://testnet.nearblocks.io/txns/<hash>`).
- Empty and error states: no listings "No one is selling this yet." / "List yours, or sell to the stall."; loading skeletons; relayer error "The market is not answering. Nothing was spent. Try again." with Retry.

**Telemetry:** `market.opened`, `market.listing_created`, `market.listing_filled`, `market.listing_cancelled`, `market.trade_completed` (payload in 3.7, with `settlement`).

### 6.5 Chests, loot and the open animation

**Truth about chests (unchanged, [V] `docs/chests.md`, `relayer/lib/chest-deck.js`):** the season deck of 10,000 outcomes is committed on chain (root `18b54f9d…0058e`, seed fixed [V]); what a chest contains is drawn on chain when it is opened; the **box tier** (common 80 / rare 17 / legendary 3) is cosmetic only. **Do not change the deck, the odds or the contract.** The odds table shown to the player is generated from `buildDeck()` so it can never drift:

| Outcome | Positions in the 10,000 deck | Probability | Display rarity colour |
|---|---|---|---|
| NFT legendary (loot NFT) | 60 | 0.6% | Orange #ff9a2e |
| NFT rare (loot NFT) | 240 | 2.4% | Blue #4aa3ff |
| NFT uncommon (loot NFT) | 700 | 7.0% | Green #5ccf5c |
| Silk x5 | 2,000 | 20.0% | Grey #b8b8b8 |
| Silk x10 | 1,200 | 12.0% | Green #5ccf5c |
| Silk x25 | 400 | 4.0% | Blue #4aa3ff |
| XP x10 | 1,500 | 15.0% | Grey #b8b8b8 |
| XP x25 | 500 | 5.0% | Green #5ccf5c |
| Common item (6 kinds, 300 each) | 1,800 | 18.0% | Grey #b8b8b8 |
| Uncommon item (5 kinds, 200 each) | 1,000 | 10.0% | Green #5ccf5c |
| Rare item (4 kinds, 150 each) | 600 | 6.0% | Blue #4aa3ff |
| **Total** | **10,000** | **100%** | |

Expected silk per chest from the deck = (2000x5 + 1200x10 + 400x25) / 10000 = **3.20 silk**. Chest drop rule (existing, unchanged): the first kill always drops a chest, then 36% per kill; box tier 80/17/3 (common/rare/legendary box) is cosmetic only.

**Rarity palette (tokens in 3.3):** common grey `#b8b8b8`, uncommon green `#5ccf5c`, rare blue `#4aa3ff`, epic purple `#b06cff` (used by titles and the wheel only), legendary orange `#ff9a2e`, mythic pink `#ff5c8a` (the wheel grand prize). Rarity is never colour only: the rarity name is always written next to it (R12).

**Drop rules (existing numbers kept):** first kill always drops a chest, then 36% per kill, `chests.rollDrop`. New in this sprint: the **spare-part pity rule** (supports quest `q_part`): on the 5th stone-spider kill, if the player owns no spare part and `q_part` is not completed, that kill also drops one `part_gear` (common), once per account, flagged `source: 'pity'`. Resource drops follow the existing resource tables.

**Loot beam and pickup (`market/loot-fx.js`, flag `lootFx`):**

| Rarity | Beam height | Beam radius | Colour | Ring on the ground | Sound cue |
|---|---|---|---|---|---|
| common | none (a 0.5 m sparkle) | | grey | none | `loot_soft` |
| uncommon | 3 m | 0.18 m | `#5ccf5c` | 0.9 m, static | `loot_up` |
| rare | 5 m | 0.20 m | `#4aa3ff` | 1.0 m, pulses 1.6 s | `loot_rare` |
| epic | 7 m | 0.22 m | `#b06cff` | 1.1 m, pulses 1.4 s | `loot_rare` |
| legendary | 10 m | 0.26 m | `#ff9a2e` | 1.3 m, pulses 1.2 s, embers | `loot_legend` |
| mythic | 12 m | 0.30 m | `#ff5c8a` | 1.5 m, pulses 1.0 s | `loot_legend` |

Beam: one open cylinder, additive blending, vertical alpha gradient from 0.55 at the base to 0 at the top, slow sway ±2°, no shadows; drops outside 40 m are culled; at most 12 beams at once (oldest fades). A chest drop appears as the chest model (`game/public/assets/models/*chest*.glb` `[VERIFY]`; else a procedural box in the box-tier colour) that pops out of the mob in a 0.6 s arc; **auto-pickup within 2.0 m** (magnet flight 0.35 s to Iris, a "ding", the toast "Chest picked up. Press I to open your bag."); an uncollected chest is added to the bag automatically after 30 s so nothing is ever lost. The minimap dot uses the rarity colour. Reduced motion: no sway, no pulse, no arc (it just appears).

**Chest open animation (extends `chest-open.js`; 2.2 s, skippable by click; instant cut under reduced motion):**

| Time | Beat |
|---|---|
| 0.0 to 0.6 s | the sealed chest (240 × 240 px sprite or 3D) shakes ±4 px at 12 Hz, a low rumble cue |
| 0.6 to 1.0 s | the lid swings open (rotate 70°, ease-out), light spills (white to the rarity colour) |
| 1.0 to 1.5 s | beam bursts upward (the outcome's rarity colour), particles |
| 1.5 to 2.2 s | the reward card rises and flips (silk, XP, item or loot NFT), name 20 px and rarity word, the "Verified ✓" line linking to the transaction |
| after | buttons **Claim** (primary) and **Open another** |

While the chest service is still answering, the shake loops and the caption reads "Opening on NEAR. This takes about 10 seconds." (never a fake result). Batch: the existing flip grid (0.4 s per card, rarest first in the summary) stays; the card rim colours come from the palette above.

### 6.6 The chest service failure (screenshot C3): investigation and fix

**What the screen said:** "Opening 8 chests. The chest service failed: try again. Your chest stays sealed." for **Open all (8)** and **Open 5**.

**What I verified in code and on the live service ([V]):**
1. The sentence is `chest.err.bad`. It is shown when `REASON[...]` in `net/chest-client.js` has no entry for the relayer's `error` code, or when the answer has no usable openings. The map knows only `need_guest`, `not_your_key`, `not_configured`, `season_not_ready`, `daily_cap`, `rate_limited`, `sold_out`, `network`. The relayer also answers `tx_failed` (502), `no_opening`, `deck_mismatch`, `stale`, `replayed`, `bad_request_id`, `rpc`, `bad_count`, and `bad_signature`. **All of those display the same unhelpful sentence**, which hides the real cause.
2. The relayer at `https://159-195-130-113.sslip.io` is up and CORS preflight from `https://spacexceo.github.io` succeeds (`access-control-allow-origin` echoed). `/api/health` shows the chest contract configured and **0 transactions, 0 openings, 0 batches** since it started, so no batch has ever reached the chain from this relayer process (the counters rise on every attempt that reaches the network).
3. The chest contract is ready: `season_info` on `chests.ftf-coordinator.testnet` has the committed root and a fixed seed.
4. The batch path sends one transaction with N `open_chest` actions, each with **28 Tgas** (`BATCH_ACTION_GAS`); `docs/chests.md` says "the real use must be measured with the test script" and no measurement is recorded. A single opening uses **100 Tgas**. If one action needs more than 28 Tgas (the draw does a sparse Fisher-Yates step and may mint a loot NFT), the **whole** transaction fails, and one retry fails the same way, which matches "5 and 8 fail". **This is the leading hypothesis and A3 must confirm or refute it in the first 30 minutes.**
5. Other candidates the agent must rule out in that window: the per-IP bucket (`capacity: 5` per minute, one token per request, so a fallback loop to `one()` on `bad_count`/`batch_off` spends it quickly); client clock skew (`stale`, 5-minute window); the shared coordinator key's nonce queue; the `replay` guard rejecting a retried signature (409 `replayed`) while the journal for the `request_id` is not consulted first; a guest key that is not an access key (`not_your_key`, maps correctly).

**Investigation steps (A3, 0:00 to 0:30, results written to `BOARD.md`):** (1) run `node relayer/scripts/chest-batch-test.mjs <guest account> 2 --send`, then 5, then 8, against the live relayer with a **test guest account only**, and paste the raw JSON answers (error code, `failure`, gas burnt) into `docs/chests.md`; (2) read `/api/health` before and after; (3) compute the gas per action from the outcome and set `BATCH_ACTION_GAS = ceil(measured × 1.3)` and `BATCH_MAX = floor(290 Tgas / BATCH_ACTION_GAS)` (so a batch never exceeds the 300 Tgas limit); (4) record which hypothesis was true in the summary of the PR. I will do myself: redeploy the relayer with the new constants, and set its env.

**Fix list:**

| # | Fix | Where |
|---|---|---|
| F1 | Map **every** relayer code to a plain cause (table below); log the real code to the console and to a "Details" fold; add `errorCause` to `chest.opened` telemetry | `net/chest-client.js`, `play/chest-open.js`, `play/chest-batch.js`, `en-market.js` |
| F2 | Measured gas and batch size (see steps) | `relayer/lib/chest.js` |
| F3 | Client retry: on `tx_failed`, `rpc`, `network`, `no_opening` retry once after 1.5 s, then **split the batch in halves** (8 → 4 + 4 → 2 + 2 → 1 + 1) so a partial success is possible; the summary says "Opened 5 of 8. 3 are still sealed. Try again." and settles exactly the opened ones (the existing per-opening `onSettled`) | `net/chest.js` `openChests` |
| F4 | Idempotent retries: a retry reuses the same `request_id`; the relayer answers from its `journal` before applying the replay guard, so a lost response does not burn the batch | `relayer/api/chest/open.js`, `lib/chest.js` |
| F5 | Rate limit: capacity 20 per minute per IP and the cost of a batch is 1 token; the `one()` fallback after `bad_count` or `batch_off` is limited to 3 sequential single opens per press, with a visible progress "Opening 2 of 5…" | `relayer/api/chest/open.js`, `net/chest.js` |
| F6 | Health shows error counters by code: `chests.errors = {tx_failed, rate_limited, …}` so I can see failures without logs | `relayer/api/health` `[VERIFY path]` |
| F7 | **Flagged local fallback:** if the service cannot be reached after the retries, offer **"Preview an opening (demo)"**: a seeded local animation of a random outcome with the banner "Demo preview: nothing is added to your account." The chest stays sealed; no silk, XP or item is ever granted from a preview; the telemetry kind is `chest.preview` | `play/chest-open.js` |
| F8 | The panel keeps the chest sealed and says so in one clear line (existing `chest.stillSealed`), with **Try again** and **Details** | `play/chest-open.js` |

**Error text catalogue (what / why / next; key `chest.err.<code>`; the old `chest.err.bad` becomes the last resort):**

| Code | Exact player text |
|---|---|
| `network`, `rpc`, timeout | "The chest service is not answering. Your chests are safe and still sealed. Check your connection and try again." |
| `tx_failed` | "The network did not accept that opening. Your chests are still sealed. We will try fewer at a time." |
| `no_opening` | "The network accepted the request but sent no result. Your chests are still sealed. Try again in a moment." |
| `rate_limited` | "You are opening chests very fast. Wait {n} seconds and try again. Your chests are still sealed." |
| `daily_cap` | "You have opened the most chests allowed today ({n}). Come back after 00:00 UTC. Your other chests are safe." |
| `sold_out` | "All Season 1 chests have been opened. Your sealed chests keep for the next season." |
| `season_not_ready`, `not_configured` | "Chests open once this season's random seed is set. That has not happened yet. Try again soon." |
| `need_guest`, `not_your_key` | "This browser has no player account yet. Reload the page; it is created for you." |
| `stale` | "Your device clock looks wrong. Turn on automatic time, then try again." |
| `replayed` | "That request was already sent. Look in your bag: the chest may already be open." |
| `deck_mismatch` | "A safety check on the chest list failed, so openings are paused. Nothing was lost." |
| `bad_count`, `bad_request_id`, `bad_signature` | "Something went wrong with that request. Your chests are still sealed. Reload the page and try again." |
| unknown | "The chest service had a problem. Your chests are still sealed. Try again." |

**Tests:** relayer unit (extend `relayer/tests/chest-batch.test.mjs`): batch of 1, 5, 8, 10 with a fake client (success; whole-tx failure then retry success; permanent failure; partial `daily_cap` cut), `request_id` replay answered from the journal, count above `BATCH_MAX`, health counters by code. Client unit: every relayer code maps to its catalogue text (**a test fails if a code has no key**), split retry reaches single opens, partial results settle exactly the opened chests, the preview never grants anything. E2E (mock relayer on a local port): **open 1, open 5, open all (8)** each in three modes: success, `tx_failed` that recovers via split, offline (preview offered, chest stays sealed). Optional live smoke script `relayer/scripts/chest-live-smoke.mjs <guest>` that opens 1, then 2, then 5 and prints results (run by me or A5 with a test guest; not in CI).

### 6.7 Plain labels: on this device versus on NEAR (screenshot C4)

**What the screen said:** a bag/inventory line "Local: kept in this browser only", and the daily wheel. A first-time player cannot tell whether items are real or lost when they clear the browser.

**Rules:** every item row, chest row and silk number carries a **scope badge**: pill 20 px high, 12 px 700, radius 10 px:
- `chain`: border and text `--ftf-info`, text **"On NEAR"**, tooltip "Recorded on NEAR, a public blockchain. Anyone can check it. It stays even if you clear your browser."
- `device`: border and text `--ftf-muted`, text **"This device"**, tooltip "Saved in this browser only. Clearing your browser data removes it. It is not on the blockchain."
- `pending`: `--ftf-warn`, text **"Syncing"**, tooltip "Being recorded on NEAR. It will say 'On NEAR' soon."

Scope of each thing: sealed chests = `device` (until opened; the opening result is `chain`); items from an opened chest that are loot NFTs = `chain`; resource items minted by stalls = `chain`; locally earned resources not yet minted = `device`; wheel and dice silk = `device` (play silk); verified silk = `chain` after sync, `pending` before.
Bag footer (14 px, muted): "Items marked 'This device' are saved in this browser only. Clear your browser data and they are gone. Items marked 'On NEAR' are yours on the blockchain." Replace the old string "Local: kept in this browser only" everywhere (`grep` test).
The wheel's header shows "Free daily spin · Prizes are play money and stay on this device".

### 6.8 Play-money games: wheel and dice (framed legally)

**Legal frame (exact copy and rules):** these are games of chance for entertainment on a practice network. **No real money** is used, silk has no cash value, **cannot be bought, sold for money or withdrawn**, and play silk **cannot open the Gate-Loom or be traded**. First-open modal (once, 480 × 320 px): title "Play-money games"; body "These games use play silk. It has no real value, cannot be bought, and cannot be cashed out or used to open the Gate-Loom. The odds are shown on every game. If you are under 18, please skip this tab."; buttons **I understand** (primary) and **Back** (secondary). Footer on the tab (12 px muted): "Practice network. No real money. Entertainment only."

**Play silk supply (so the games work without touching real progress):** every profile gets a one-time **"Play allowance" of 20 play silk** (label on the first open: "A small allowance of play silk to try the games"), plus wheel silk prizes. Stakes are taken from **play silk only**; if play silk is 0 the Roll button is disabled with the tooltip "You have no play silk. Spin the wheel or open chests to win some."

**Wheel (existing, `game/src/game/wheel.js`; restyled and labelled):** one free spin per day, plus one per level gained and one per verified trial. Never bought. Odds from the existing segments (generated from `SEGMENTS`, so the table cannot drift):

| Segment id | Prize | Weight | Probability |
|---|---|---|---|
| silk5 | Silk +5 | 20 | 20.0% |
| part_common | Part (common) | 18 | 18.0% |
| shard_common | Shard (common) | 14 | 14.0% |
| xp25 | XP +25 | 14 | 14.0% |
| part_uncommon | Part (uncommon) | 10 | 10.0% |
| chest | Chest (common box) | 9 | 9.0% |
| silk15 | Silk +15 | 6 | 6.0% |
| part_rare | Part (rare) | 3.5 | 3.5% |
| shard_rare | Shard (rare) | 3 | 3.0% |
| title | Cosmetic title | 1.5 | 1.5% |
| part_legendary | Part (legendary) | 0.5 | 0.5% |
| skin_sheriffchenko | Grand prize skin NFT | 0.5 | 0.5% |
| **Total** | | **100.0** | **100%** |

Expected silk per spin = 0.20x5 + 0.06x15 = **1.90 silk** (plus items and XP). The wheel is free (one spin per day + one per level + one per verified trial), so it is a faucet with a small, capped value, not a bet.

Wheel UI: left card 540 × 560 px: the wheel 360 px with 12 segment sectors coloured by rarity and labelled with an icon plus a short word, a **Spin** button (primary, 44 px; disabled with "No spins left. The next free spin is in 03:12:08." and the count "Spins: 2"), the odds link "See the odds" opening the table above, a result banner after the spin (prize and rarity word) with **Claim** (the existing pending-result flow; a result survives a reload). Silk prizes are credited as **play silk**. The grand prize skin NFT keeps its cap of 100 and its testnet mint through the relayer; its sector reads "Skin NFT (very rare)".

**Loom Dice (new, `market/dice.js`):** "Roll under N". The game rolls a number from 1 to 100; you win if it is **less than or equal to N**. House edge 4% on every bet.

| Bet (roll under) | Win chance p | Payout multiplier = 96 / N | Return to player (EV) | House edge | Max stake allowed (payout cap 50 silk) |
|---|---|---|---|---|---|
| Under 50 | 50% | x1.92 | 0.96 x stake = 96% | 4% | 10 silk |
| Under 25 | 25% | x3.84 | 0.96 x stake = 96% | 4% | 10 silk |
| Under 10 | 10% | x9.60 | 0.96 x stake = 96% | 4% | 5 silk |

Rules (exact):
- Stakes: 1, 2, 5 or 10 play silk; a stake is disabled when `stake × multiplier > 50` ("Maximum payout is 50 silk").
- Payout = stake × multiplier on a win (your stake is included); on a loss the stake is gone.
- Per-day limits (UTC), per profile: **net win cap 40 silk** (once the day's net winnings reach it, "You reached today's winning limit. The games reopen after 00:00 UTC."), **net loss cap 60 silk** ("You reached today's loss limit. Take a break. The games reopen after 00:00 UTC."). Cooldown between rolls 1.5 s. Maximum 200 rolls a day.
- Randomness: deterministic and checkable. `roll = 1 + floor(100 × seededRandom('dice:' + seed)())` with `seed = sha256(wheelId + '|' + rollNumber)` (existing `seededRandom` and `sha256`); the game shows the seed and roll number after every roll and a **Verify** button that recomputes it. The odds table and the edge are shown on the card. `[VERIFY]` the exact `seededRandom` export in `town-economy.js`.
- Accounting: wins and losses change **play silk only**; never `onChainC`; nothing is written to chain; the verified log never sees dice silk (unit test: a dice win does not change `creditableC`).
- UI (card 560 × 560, right of the wheel): bet chips (three radio chips "Under 50 · ×1.92", "Under 25 · ×3.84", "Under 10 · ×9.60", 44 px high), stake chips (1, 2, 5, 10), a summary line "Win {payout} silk with a {p}% chance", **Roll** primary 44 px, a result area 120 px: the number animates 0.9 s (instant under reduced motion), green "You win +{x} silk" or red "You lose −{x} silk", a fairness line (seed and **Verify**), today's counters "Net today: +{x} / limit 40, −{y} / limit 60", a "Rolls today" count.
- States: default, hover, pressed, **rolling** (button disabled, "Rolling…"), win, lose, limit reached, no play silk, cooldown (button shows "Wait 1s").

### 6.9 On-chain wiring (every action, its call and what the player sees)

| Player action | Browser call | Relayer endpoint | Contract call (testnet) | What the player sees |
|---|---|---|---|---|
| Open a chest or a batch | `net/chest.js` `openChest(s)` | `POST /api/chest/open` (single or `count` 1 to `BATCH_MAX`) | `chests.ftf-coordinator.testnet` `open_chest(account_id)` (one tx, N actions) | animation, "Verified ✓ ↗" tx link to `https://testnet.nearblocks.io/txns/<hash>` |
| Sell a resource to a stall | `net/market.js` | `POST /api/market/resource` (side `sell`) | the stall pays silk and takes the item transfer **[V exists]** | toast "Sold for {x} silk" with tx link |
| Buy a resource from a stall | same, side `buy` | same | stall mints to the buyer (NEP-245 `mint` on `items.ftf-town.testnet`) | toast and tx link |
| List, cancel (player trade) | `market/market-client.js` | `POST /api/market/p2p/list`, `/cancel` | none (book is off-chain) | "Listed" / "Cancelled" |
| Buy a listing | same | `POST /api/market/p2p/buy` | `ftf-town.trade_for` then `items.coordinator_transfer` (Path A) or the demo store (Path B) | toast "Bought 4 spider silk thread" with **two** tx links (chain) or the **Demo** chip |
| Sync silk | `silk-balance.js` | `POST /api/town/gate` `credit_only` | `ftf-town.register`, `credit_silk` (coordinator) | chip shows the new on-chain number; `silk.sync` |
| Pay the Gate-Loom (A1 UI) | `net/town-gate.js` `payGate` | `POST /api/town/gate` | `ftf-town.pay_gate_for` (burns the price) | A1's confirm, then the tx link and the NearBlocks button |
| Enter the tournament (A4 UI) | `net/town-act.js` | `POST /api/town/act` `enter_tournament` | `ftf-town.enter_tournament_for` | A4's toast and tx link |
| Wheel skin NFT | existing | `POST /api/wheel/claim` | `skins.ftf-coordinator.testnet` mint | existing claim flow |

All explorer links use `https://testnet.nearblocks.io/txns/<hash>` (existing `txUrl` in `net/market.js`, which validates the hash format). A transaction toast: 4 s, "Recorded on NEAR. View on NearBlocks ↗", the link opens in a new tab with `rel="noopener"`. Players never see the words "relayer", "coordinator", "NEP-245" (R4); the **For the curious** fold in the tooltip may name the contract.

### 6.10 Events

`silk.changed`, `silk.sync`, `wallet.open`, `chest.dropped`, `chest.picked`, `chest.opened` (with `errorCause`), `chest.preview`, `loot.item`, `market.*`, `games.opened`, `gamble.rolled`, `gamble.limit_hit`, `wheel.spun`, all per 3.7.

### 6.11 Tests (summary; each bullet is a file)

Unit: `silk-balance.test.mjs` (6.2), `market-rules.test.mjs` (fees: 2% rounded up, band 50% to 200%, min total, listing and daily caps, self-trade, partial fill maths, expiry), `p2p-relayer.test.mjs` (list, buy, cancel, double-buy race → one winner, settlement failure → compensation, replay), `contract tests` (`cargo test` in `contracts/town` and `contracts/town-items`, if `cargo` is available; otherwise written and marked untested on the board), `dice.test.mjs` (the odds table: for each bet the empirical win rate over 200,000 seeded rolls is within ±0.5% of N, return to player within 96% ± 1%; limits; accounting does not touch on-chain silk), `wheel.test.mjs` (existing plus odds table equals `SEGMENTS`), `loot-fx.test.mjs` (rarity table, culling, max beams), `chest-pity.test.mjs` (5th spider kill gives one part, once), `scope-badges.test.mjs` (every row has a scope; no string "Local: kept in this browser only"), plus the chest tests of 6.6.
E2E (mock relayer): (E1) kill → chest drop → beam → pickup → bag shows "This device" → open → animation → result; (E2) open 1, 5, 8 in three modes; (E3) two browser contexts: A lists 10 spider silk thread, B buys 4, both balances change and the ticker shows the trade with the **Demo** chip or the tx link; (E4) price outside the band shows the exact error text; (E5) dice: 20 rolls, the counters and limits behave, the Verify button reproduces the roll; the first-open modal shows once; (E6) the wheel: spin, claim, silk goes to play silk, the chip's line 1 does not change; (E7) the wallet card numbers equal `silkView()`; (E8) with `marketplace` off, the old market and stall panel still open.

### 6.12 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line |
|---|---|---|
| 0:00 | Read `town-gate.js`, `town-quests.js`, `chest*.js`, `relayer/lib/chest.js`; **run the chest investigation (6.6) and write the silk root-cause test**; write `docs/silk-sources.md` | |
| 0:30 | `silk-balance.js` + unit tests; error catalogue F1 | |
| 1:00 | Publish `silkView()` to A1 and A2 (BOARD note); chest F2 to F5 (relayer constants, retry/split, idempotent retry, limits) | |
| 1:30 | **PR wave 1:** silk model, chest fix, tests | |
| 2:00 | Market rules, relayer p2p (demo settlement) and tests; contract changes and Rust tests | contracts as written + untested if `cargo` is missing |
| 2:30 | Market UI (Buy, Sell, My listings) | no bids |
| 3:00 | **PR wave 2:** market end to end with the Demo chip; Stalls tab restyle; ticker | |
| 3:30 | Loot FX, chest world object, pity rule, open animation, scope badges | |
| 4:00 | Games tab: wheel restyle, dice, first-open modal, limits | |
| 4:30 | E2E E1 to E8, wallet card, fixes from usability | |
| 5:00 | **Final PR**, `docs/sprint/HANDOFF-A3.md` (include "what I must deploy" list for me) | |

### 6.13 Acceptance criteria

1. HUD, tracker, portal, journal and market show the same silk number; the chip tooltip and wallet card show on-chain, pending, play and total; Sync works; offline never shows 0.
2. The root cause of the 38 vs 128.64 gap is written in the PR and `docs/silk-sources.md` lists which sources are creditable.
3. Open 1, Open 5 and Open all work against the mock in the three modes; every relayer error code has a plain text; the live smoke script results and the confirmed gas per action are recorded in `docs/chests.md`.
4. Two players trade a resource for silk; the fee and the price band work; the Demo chip or the tx links are shown correctly; the contract code and Rust tests exist.
5. Chest drops have beams in the right colours, pickup and the open animation work, the odds table equals the deck.
6. Wheel and dice are play money, limits and disclaimers are in place, odds and house edge visible, accounting never touches on-chain silk.
7. No "Local: kept in this browser only" string remains; every item and silk row has a scope badge.
8. `scripts/verify-sprint.sh` is green; flags `marketplace`, `lootFx`, `playGames`, `silkView` each have a working off state.

### 6.14 What A3 must NOT touch

Quest, journal, tracker, portal-copy files (A1: you give `silkView()`, they render it); HUD, hotbar, keybinds, `player-hud.js` formatting except importing `formatSilkC` (A2 does that edit; you export it); dialogue, onboarding, tournament UI (A4); `boot-world.js`, `main.js`, `features.js`, README (A5); 3D, art, rigs (A6); the committed deck, `DROP`, `TIER_WEIGHTS`, chest contract. **No deploys, no mainnet, no keys.**

### 6.15 Hand-off

To A1 and A2 at 0:30: the `silkView()` signature (frozen) and `formatSilkC`. To A5: mock relayer fixture (`game/tests/fixtures/mock-relayer.mjs`) for e2e, plus the list of what I must deploy (relayer env and constants, contracts). To A4: tournament entry reuses `town-act`; tell A4 about the error mapping style. To A6: the chest model name and the beam colours (A6 may supply a better chest model later).

### 6.16 Ready-to-paste prompt for A3

```
You are Agent A3 on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee, branch sprint/5h-a3, PRs into sprint/5h; never push to main, never deploy, never touch mainnet, no secrets; use only test guest accounts on testnet).
Read first: /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3 and 6; docs/chests.md; relayer/lib/chest.js; game/src/net/town-gate.js; game/src/scenes/town-quests.js (balanceC); relayer/lib/town-gate.js (syncCredit).
Mission: (1) one silk model silkView() with breakdown, Sync, formatSilkC, used by every surface (root cause of 38 vs 128.64 is in 6.2); (2) player-to-player market with fee, band, order book, demo settlement now and contract code (trade_for, coordinator_transfer) with Rust tests for later; (3) loot beams, chest world object, chest open animation, the chest-service fix (investigate FIRST with chest-batch-test.mjs on a test guest, measure gas, map every error code, retry and split the batch, flagged demo preview that grants nothing); (4) plain scope labels (On NEAR / This device); (5) play-money wheel and Loom Dice with odds, 4% edge, limits and the legal framing in 6.8, never touching on-chain silk.
Follow the exact numbers, layouts and strings in section 6. English only, silk only, portal fee never a literal. Do not change the committed chest deck or its odds. Flags marketplace/lootFx/playGames/silkView. Respect the ownership matrix (3.8).
Work in 30-minute blocks per 6.12, rebase on sprint/5h each block, PRs at 1:30, 3:00, 4:30, final 5:00. Write the unit and e2e tests in 6.11. Requests go under "## A3" in docs/sprint/BOARD.md. Finish with docs/sprint/HANDOFF-A3.md including what the owner must deploy. If late, use the minimum polished line in 6.12.
```

---

## 7. Agent A4 (Opus 5.5): new-player experience, lore dialogue, tooltips, glossary, voice, agent tournament

### 7.1 Mission

I want the first five minutes to **hook a stranger and explain the world**. A skippable cinematic (built by A6) shows Iris, a doctor-linguist from the year 2048, return from a run, touch the wrong device, say "Oh no...", and fall through a vortex of time. She opens her eyes in the hill town surrounded by townsfolk who explain what happened: **Guests arrived with a gift and nobody speaks their language; the elders gathered at the Shell to solve the mystery and will reward her generously; to wake the Gate-Loom and go home she needs 200 silk; kill monsters, gather resources, do quests.** Then a **"What waits for you" card** tells her what is ahead: quests, tournaments, chests, trade, the leaderboard, the NFT, the end of Season 1 and the way home. Plus first-open tooltips, an in-game glossary, a female voice line ("Oh no...") with subtitles, and **an AI agent can enter the tournament without a human** (with an Agent badge).

Canon note: the story I wrote says Iris **returns home by teleport at 200 silk**; the twist (the Gate-Loom throws her onward, and the whitelist NFT cliffhanger) remains and is **not spoken in this intro**.

### 7.2 Scope in and out; file-by-file change list

In: the intro flow state machine, dialogue box and script, subtitles, voice integration, roadmap card, first-seen tips (the A4-owned ones), glossary, quest-giver dialogue copy, tournament agent entry (UI, API action, example client, docs). Out: the 3D lab, vortex, wake-up shot (A6; you call its API), quest logic (A1), HUD (A2), market and chests (A3), the passes and the NFT modal (existing).

| File | Action | Detail |
|---|---|---|
| `game/src/npe/index.js` | create | `mount(ctx)`: flow state machine (7.4) |
| `game/src/npe/dialogue-ui.js` + `dialogue.css` | create | dialogue box, choices, skip (7.5) |
| `game/src/npe/dialogue-script.js` | create | the script as data (7.3), pure |
| `game/src/npe/subtitles.js` + css | create | subtitle bar (7.5) |
| `game/src/npe/voice.js` | create | voice player with fallback chain (7.6) |
| `game/src/npe/roadmap-card.js` + css | create | the card (1.3) |
| `game/src/npe/glossary.js` + css | create | glossary window and `attach(root)` for underlined terms (1.4) |
| `game/src/npe/tips.js` | create | registers the A4 tips of 1.5 with `first-seen.js` |
| `game/src/ui/onboarding.js`, `premise.js`, `play/narrator.js`, `narration.js`, `townsfolk.js`, `townsfolk-plan.js`, `hints.js` | modify | route the old premise to the new flow behind `newPlayerIntro`; barks (7.3); keep old path when the flag is off |
| `game/src/ui/tournament.js`, `tournament-card.js` | modify | entrants with `kind`, the Agent badge, "Add an agent", exhibition (7.9) |
| `game/src/play/agents.js` | modify | export the scripted agent policies for the exhibition |
| `server/src/**` | modify | action `enter_tournament`, `GET /v1/tournament` (7.9) `[VERIFY the action registry file]` |
| `docs/api/openapi.yaml` | modify | the new path and schemas |
| `server/examples/agent-tournament.mjs` | create | example client (7.9) |
| `game/public/assets/audio/voice/iris_oh_no.ogg` (+ optional `iris_gasp.ogg`, `iris_hmm.ogg`), `docs/audio/voice.md` | create | 7.6 |
| `game/src/play/locales/en-npe.js`, `en-tips.js` | create | strings of this section |
| `game/tests/npe/*.test.mjs`, `server/tests/tournament-agent.test.mjs` | create | 7.11 |

### 7.3 The script (exact text; `dialogue-script.js` is this table as data; every spoken line is at most 25 words and 140 characters; `{fee}` is the portal price from config, written as a number of silk; `{stipend}` is 10 from `EXPEDITION.stipendC`)

**Speakers:** Townsfolk (crowd, grey), Weaver (a townswoman, rose), Child (small, teal), Guard (steel blue), Lamplighter (amber), Elder (gold), Iris (cream, **italic**, subtitle only except where the voice file exists). Portraits are the existing townsfolk and Iris card art `[VERIFY game/public/assets/cards/*]`.

**Wake-up dialogue (19 lines; the A6 wake-up shot plays first and ends with Iris sitting up):**

| # | Speaker | Line (exact) | Beat |
|---|---|---|---|
| W1 | Townsfolk | "She is awake! Stand back, give her air." | crowd steps back |
| W2 | Child | "Her clothes are strange. Is she one of the Guests?" | |
| W3 | Guard | "No. The Guests came by the Shell. She fell out of a ring of light, right beside the Loom." | camera shows the Gate-Loom |
| W4 | Lamplighter | "Look at her badge. It says Doctor of Languages. Languages!" | camera on the badge |
| W5 | Weaver | "Then the glass has sent us a translator." | |
| W6 | Elder | "Welcome, stranger. I am the Elder of this hill town. You are a long way from wherever you were." | Elder steps forward |
| W7 | Iris | *"Where... where am I? The lab, the device... it all just..."* | Iris looks around |
| W8 | Elder | "Three days ago, Guests arrived and left us a gift. A beautiful one. But none of us speaks their tongue." | |
| W9 | Elder | "The elders have gathered at the Shell to solve the mystery. We cannot read a single one of their signs." | camera to the Shell |
| W10 | Elder | "You can, we are sure of it. Help us, and the town will reward you generously." | |
| W11 | Iris | *"I read languages for a living. But first, I need to get home."* | |
| W12 | Elder | "Home. Yes. The Gate-Loom that brought you here is tired. It sleeps until it is fed." | camera to the Gate-Loom (dormant) |
| W13 | Elder | "To subdue its power and send you back, it needs {fee} silk. Paid once, and the silk is burned." | |
| W14 | Guard | "Stone spiders block the north road. Their thread is worth silk. Bring me ten and I will pay you." | |
| W15 | Lamplighter | "And find me a spare part for my lamp-loom. I will pay for that too." | |
| W16 | Weaver | "Sell what you find. Spider thread, plates, shards. Anyone in town will trade you silk for them." | |
| W17 | Elder | "Take {stipend} silk to begin. It is the town's welcome. Then go: hunt, gather, trade, help us." | award stipend once; toast "+{stipend} silk" |
| W18 | Elder | "When you hold {fee} silk, come back to the Gate-Loom. It will be waiting." | |
| W19 | Iris | *"{fee} silk. All right. One thing at a time."* | ends; the card opens |

Rules: lines are advanced with E, Enter, Space or a click; each line has `ms` (typing at 40 characters per second, then wait for input); the camera cues are `npe.camera {target}` events handled by A6's shot API `[VERIFY]` (if there is no camera API, A4 uses `camera-rig` look-at for 1.2 s).

**Crowd barks** (townsfolk idle lines, `townsfolk.js` after the intro; a random one every 20 to 40 s within 8 m, as a 3-second bubble above the head, 14 px):

| # | Line |
|---|---|
| B1 | "The Elder says the Guests' gift hums at night." |
| B2 | "Mind the north road. Stone spiders again." |
| B3 | "Silk is silk. Spider thread, mostly." |
| B4 | "I heard a Doctor of Languages walks among us." |
| B5 | "Press B at the market. The stalls are open." |
| B6 | "The Shell wall shows who is leading the Cup." |
| B7 | "Agents are entering the Cup now. Even the clever ones." |
| B8 | "A chest is worth opening. You never know." |
| B9 | "The Gate-Loom glows when it is fed." |
| B10 | "Lamplight keeps the spiders shy. Mostly." |

**Quest-giver lines** (keys `npc.talk.<questId>.<stage>` in `en-npe.js`; A1's `talkFor` reads them; stage = `offer`, `progress`, `ready`, `done`; each at most 25 words):

| Quest | Stage | Line |
|---|---|---|
| `q_welcome` | offer | "Walk to the lantern post and back. See how the town feels underfoot, then speak to me." |
| `q_welcome` | progress | "The lantern post is just by the road. Take your time." |
| `q_welcome` | ready | "You walk like someone who has always walked here. Take this for your trouble." |
| `q_welcome` | done | "Speak to the Guard when you are ready. The road north needs help." |
| `q_spiders` | offer | "Ten stone spiders and five strands of their thread. The north road is yours if you clear it." |
| `q_spiders` | progress | "Still some spiders on the road. I can hear them from here." |
| `q_spiders` | ready | "Ten down, and the thread besides. The town owes you." |
| `q_spiders` | done | "The Lamplighter was asking after you. Something about a part." |
| `q_part` | offer | "My lamp-loom lost a spare part. Spiders sometimes carry one. Bring it, and two chitin plates." |
| `q_part` | progress | "No part yet? The fifth spider tends to carry one." |
| `q_part` | ready | "That is the one. The lamp will burn through the night again." |
| `q_part` | done | "The Shardkeeper wants a word. Something big on the ridge." |
| `q_boss` | offer | "The Crownrift sleeps on the ridge. Take one crown shard from it, and the town is safe." |
| `q_boss` | progress | "Learn a few skills first. Press N. The Crownrift is no spider." |
| `q_boss` | ready | "You did it. Take this chest, you have earned it." |
| `q_boss` | done | "The Gate-Loom stirs at the sound of your name." |
| side, daily, tournament | offer | one line each in `en-npe.js`, written from the quest `summary` in 4.5 prefixed by the giver's greeting ("Do me a favour." / "Another day, another job." / "The Cup is open.") |
| side, daily, tournament | done | "Thank you. The town remembers." |

**The "What waits for you" card:** exact copy in 1.3; the buttons **Start** and **Show me later**.

### 7.4 The intro flow (state machine)

States: `idle → prologue → wakeup → dialogue → card → handoff → done` (plus `skipped`).

| From | Condition or event | To | Notes |
|---|---|---|---|
| idle | `newPlayerIntro` on and `ftf.npe.v1.dialogueSeen` is false, or `?intro=1` | prologue | `?intro=0` forces done; `?intro=1` ignores the saved state |
| prologue | A6 `playLabPrologue()` resolves | wakeup | emits `npe.step {step: 'prologue'}`; `labPrologue` off or the module failed to load (retry exhausted) → skip to wakeup with a black fade and a title card "Year 2048" for 2.5 s |
| prologue | Esc or **Skip** | wakeup | `prologue.skipped`; the vortex still takes 1.2 s so the cut is not jarring |
| wakeup | A6 `playWakeUp()` resolves | dialogue | |
| dialogue | line W19 done | card | stipend is awarded exactly once (idempotent by `ftf.npe.v1.stipend`) |
| dialogue | **Skip all** | card | the stipend is still awarded; toast "Intro skipped. Replay it any time in Settings." |
| card | Start | handoff | save `dialogueSeen = true`, `cardSeen = true` |
| card | Show me later | handoff | `cardSeen = false` (reopen from the menu "What's next") |
| handoff | | done | emit `npe.completed`; release controls; HUD fades in 400 ms; A1 starter guide step 1 shows; the first quest `q_welcome` becomes available (the Elder is already adjacent) |

Rules: total intro time without skipping at most **2 minutes 30 seconds** (prologue ≤ 45 s, wake-up ≤ 10 s, dialogue about 90 s, card up to the player). Controls are locked during `prologue`, `wakeup`, `dialogue`, `card`; the game clock keeps running only for ambient animation; mobs and the world are frozen. Persisted at `ftf.npe.v1 = {v: 1, prologueSeen, dialogueSeen, cardSeen, stipend}`; Settings → "Replay intro" clears it and reloads with `?intro=1`; Settings → "Reset tips" calls `resetTips()`.

### 7.5 Dialogue UI and subtitles (1920 × 1080 reference)

**Dialogue box:** x = 360, y = 820, 1200 × 220 px, bottom margin 40 px; background `rgba(14,16,24,.94)`, border 1 px `--ftf-border`, radius 14 px, `--z-dialogue`. Inside: portrait 144 × 144 at (24, 38) with a 2 px ring in the speaker's colour; **name plate** at (190, 24), 22 px 700 in the speaker's colour; **text area** at (190, 64), 980 × 110 px, 22 px / 1.45, colour `--ftf-text` (Iris lines in italic, cream); typewriter 40 characters per second, instant under reduced motion; **advance indicator** "▼" 20 px at the bottom-right (1160, 176), bobbing 1 s; footer line at (190, 188), 14 px muted: "E or click: next · Esc: skip all"; counter "3 / 19" at the right of the footer. A dim layer at 25% black sits behind the box; the speaker gets a gold ring above the head (world marker) and the camera eases to a three-quarter view of the speaker (1.2 s, skipped under reduced motion).

States: **typing** (a click completes the line), **waiting** (indicator visible; E, Enter, Space or a click advances), **choice** (two to three buttons 44 px high, 560 px wide, gap 8 px; keys 1 to 3; used by a short "Do you want the story again?" prompt if I add one, none in the 19 lines), **finished** (box fades out 200 ms), **skipped**.

**Skip button:** top right at (1776, 24), 120 × 40 px, label "Skip ›", appears 0.5 s after the scene starts, `Esc` is the key; in the prologue it skips at once (no confirm because it is replayable); in the dialogue the **Skip all** confirm is *not* shown either (rule R10: replayable).

**Subtitle bar** (prologue, voice lines, camera narration): centred, bottom at y = 960 (top of the bar at about 900), width up to 1200 px, background `rgba(0,0,0,.72)`, padding 12 px 20 px, radius 10 px, text 20 px / 1.35 (`--font-ui`, readable), max two lines, speaker label in colour before the text ("Iris: "), fade 120 ms; hidden while the dialogue box is open. The subtitle track is data: `[{atMs, durMs, speaker?, text}]`; for the prologue the text comes from A6's cue events `prologue.cue {id, text, durMs}` (A6's captions table 9.4). Subtitles are **always on** in the intro (accessibility) and there is a Settings toggle "Subtitles" for later lines.

### 7.6 Voice and its fallback chain (`voice.js`)

Required asset: `iris_oh_no.ogg`, a female voice saying **"Oh no..."** (about 1.2 s, soft, worried, trailing). Optional: `iris_gasp.ogg` (0.6 s, in the vortex), `iris_hmm.ogg` (0.7 s, at the computer). Played through the existing `cue()` in `audio/town-audio.js` `[V]` with a new cue name `voice_iris_oh_no` and the voice volume following the master volume (a separate "Voice" slider is optional).

**How to produce the placeholder (A4, within 30 minutes):** (1) in a Python virtualenv try `pip install piper-tts` and a free English female model (for example `en_US-amy-medium`; **check the model licence in its model card and record it in `docs/audio/voice.md`**); synthesise "Oh no..." (add an ellipsis and a comma for the trailing pause, length scale 1.15); (2) if Piper is not available use `espeak-ng -v en-us+f3 -s 135 -p 62 "Oh no..."` and label it **robotic placeholder**; (3) with `ffmpeg` trim silence, normalise to -16 LUFS, mono, 44.1 kHz, encode Ogg Vorbis q4; (4) commit with `docs/audio/voice.md`: tool, model, licence, command lines, "AI-generated placeholder voice; replace by recording a real take with the same filename". **Fallback chain at runtime:** file present → play it; file missing or decode error → `speechSynthesis` with a female English voice picked by `/female|zira|samantha|aria|jenny|libby|sonia|google uk english female/i` (pitch 1.15, rate 0.9); no voices → silent, subtitle only. The voice never blocks the cinematic.

### 7.7 First-seen tips owned by A4, and the glossary

The tips in table 1.5 owned by A4 (`tip.silk`, `tip.hp`, `tip.mana`, `tip.xp`, `tip.hotbar`, `tip.minimap`, `tip.chat`, `tip.tournament`) are registered in `npe/tips.js` through `first-seen.js`. Coach mark layout (one component, A5): bubble max width 280 px, 14 px text, padding 12 px 14 px, background `--ftf-gold`, text `#1b1608`, 10 px arrow towards the anchor, pulsing 2 px ring around the anchor (1 s, none under reduced motion), buttons **Got it** (primary, 32 px) and **Skip tips** (text button). **Only one tip at a time; a tip never shows during a cinematic, a dialogue or a modal; a queue shows the next one 1.5 s after the previous is dismissed; after the third tip in one minute the rest wait until the next minute** (so a stranger is never buried).

**Glossary window** (`F1` opens the cheat sheet with a Glossary tab; the menu has "Glossary"): modal 640 × 560 px; search field 40 px; list of the 15 entries in 1.4 (term 16 px 700, text 15 px); entries with first-use underline `abbr[data-glossary]` dotted 1 px in `--ftf-info` that opens the window at that term; the "For the curious" fold at the bottom of an entry may mention the technical name (never as the first line).

### 7.8 Tooltips for UI panels (R5)

Every panel has a first-open coach mark (table 1.5): Journal (A1), Skills (A2), Bag (A3), Market (A3), Games (A3), Tournament (A4), plus the "?" re-show handle in each panel header (24 × 24 px, tooltip "Show the tip again"). A4 adds a **test** that opens every panel registered in `window.__ftfTest.panels` on a fresh profile and asserts the tip appears once.

### 7.9 Agent tournament: an agent can play, a human is not required

**What I want:** an AI agent, or a scripted agent, **enters the tournament through the agent API** and appears on the board with an **Agent** badge; the tournament can run and seal results with **only agents** in it; a human can also add an agent from the card with one button.

**Entrant record:** `{"id": "ent_01", "account": "scribe-7.guests.ftf-coordinator.testnet" | null, "name": "Scribe-7", "kind": "agent", "driver": "scripted" | "llm", "model": "Qwen/Qwen3-VL-30B-A3B-Instruct" | null, "owner": "<account or null>", "enteredAt": 1790000000000, "score": null}`; `kind` is `human` or `agent`; `driver` is `scripted` (a fixed policy, no model) or `llm` (labelled with the model). **Honest labels:** the badge tooltip says "Scripted agent: a program with fixed rules, no AI model." or "AI agent: driven by {model}."

**API (versioned `/v1`, as in `docs/api/openapi.yaml`; `[VERIFY]` the exact command envelope of `POST /v1/sessions/{sessionId}/commands` and the action registry):**

| Method and path | Body | Answer |
|---|---|---|
| `GET /v1/actions` | | now lists `enter_tournament` with its argument schema |
| `POST /v1/sessions/{sessionId}/commands` | `{"type": "enter_tournament", "args": {"season_id": "s1", "name": "Scribe-7", "driver": "scripted", "model": null}, "idempotencyKey": "<uuid>", "observedVersion": 12}` | `{ok: true, version: 13, events: [{type: "tournament_entered", entrant: {…}}]}`; 409 `version_conflict` (re-read and retry), 409 `already_entered`, 400 `bad_name` (1 to 20 characters, letters, digits, space, dash), 400 `bad_driver`, 404 `no_open_season`, 429 `entry_limit` (at most 4 agent entries per session) |
| `GET /v1/tournament` | optional `?season_id=` | `{season: {id, status: 'enrolling'\|'running'\|'sealed', opensAt, closesAt}, entrants: [...], leaderboard: [{rank, name, kind, score}], sealedAt}` |

The same idempotency key returns the same answer (unit tested). On-chain: when the agent has a guest account the server may call `ftf-town.enter_tournament_for(account, season_id, request_hash)` (existing, coordinator) and returns the tx hash in the event; if no account or the chain is off, the entry is recorded in the simulation only and the answer says `"settlement": "simulation"`.

**Example client `server/examples/agent-tournament.mjs`:** `node server/examples/agent-tournament.mjs --url http://127.0.0.1:8787 --agents 3 --time-scale 500`. It creates N sessions (using the existing `playSeason` flow), enters each as an agent with a distinct policy (anchors 1, 3, 5), runs the accelerated season, calls `GET /v1/tournament` and prints a leaderboard table. Exit code 0 only if every agent is on the leaderboard with a score. It uses only public endpoints (no imports from the game), like the existing example.

**UI (tournament card, `ui/tournament-card.js`; modal 880 × 600 px):** header "Season Cup · Season 1" with a status chip (Enrolling, Running, Sealed) and a countdown; left, the entrants list (rows 44 px: rank 16 px, name 16 px, badge, score 16 px 700 tabular-nums); the badge is a pill 20 px high, 12 px 700: **Agent** (background `#1f2c52`, text `#cfe1ff`, robot glyph 12 px) or **Player** (background `rgba(255,255,255,.08)`); right column: **Enter the tournament** (primary; shows the cost "Entry: {entry} silk. Part is removed forever." from the contract params `[VERIFY params().entry]`; always a confirm), **Add an agent** (secondary; opens a dialog 420 × 300: name field, policy select "Scripted explorer" / "Cautious" / "Greedy" with a one-line description each, **Enter agent**), **Run an agents-only exhibition** (secondary; enrols four scripted agents and plays the accelerated season; results in under 10 s with the leaderboard animating; "Exhibition results are not recorded on chain" line). Empty state "No one has entered yet. Be the first, or add an agent." Error state: the API error text from the catalogue (what / why / next), never a code. States for the badge: default, hover (tooltip), and a "Sealed" winner crown icon.

### 7.10 Events

`npe.started`, `npe.step`, `npe.skipped`, `npe.completed`, `prologue.*` (A6 emits cues, A4 starts and ends), `tip.shown`, `tip.dismissed`, `tournament.opened`, `tournament.entered`, `tournament.agent_entered`, `npc.talked`, per 3.7.

### 7.11 Tests

Unit (`game/tests/npe/`): (1) every script line is at most 25 words and 140 characters, uses no banned jargon of 1.6, contains `{fee}` only through the placeholder (no literal 200, 20000, 10,000); (2) the flow state machine: all transitions in 7.4 including skip at each state, replay, `?intro=0`, flag off, A6 module failure → fallback; stipend awarded exactly once; (3) typewriter timing at 40 cps and instant under reduced motion; (4) voice fallback chain with fakes (file ok, file 404, no speech voices); (5) tips queue rules (one at a time, never in a modal, three per minute); (6) glossary: every term in 1.4 exists, every `data-glossary` key resolves; (7) roadmap card has exactly 7 rows with the copy of 1.3; (8) persistence round trip and reset. Server unit (`server/tests/tournament-agent.test.mjs`): `enter_tournament` happy path, idempotency (same key, same answer), `already_entered`, `bad_name`, `bad_driver`, `entry_limit`, `no_open_season`, `version_conflict`, OpenAPI schema validation of every response, an agents-only tournament seals with scores, `GET /v1/tournament` shape. Example client test: runs against an in-process server with `--agents 3` and exits 0.
E2E: (E1) `?intro=1` fresh profile: prologue (or the title-card fallback when A6 has not merged), wake-up, 19 dialogue lines in order with the right speaker names, the stipend toast once, the card, Start, the HUD and the guide step 1 appear; (E2) Esc during the prologue and during the dialogue both reach the card; (E3) second load shows no intro; (E4) reduced motion: no typewriter, no camera ease; (E5) open the tournament card: Add an agent, enter, the **Agent** badge appears, the tooltip says "Scripted agent…"; (E6) the exhibition runs and shows four Agent rows with scores; (E7) fresh-profile tip queue never overlaps a dialogue.

### 7.12 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line |
|---|---|---|
| 0:00 | Read `onboarding.js`, `premise.js`, `narrator.js`, `tournament.js`, `agents.js`, the OpenAPI file; write `dialogue-script.js` and `en-npe.js` (all strings); the script tests | |
| 0:30 | Dialogue UI, typewriter, states, skip; subtitle bar | |
| 1:00 | Flow state machine with a stub for A6's API; persistence; roadmap card | |
| 1:30 | **PR wave 1:** dialogue + card + flow with the title-card fallback | |
| 2:00 | Glossary window, tips registration, tip queue rules | |
| 2:30 | Voice assets (Piper or espeak path), `voice.js`, `docs/audio/voice.md`; barks | |
| 3:00 | **PR wave 2:** server action `enter_tournament`, `GET /v1/tournament`, OpenAPI, tests | |
| 3:30 | Tournament card UI: badge, Add an agent, exhibition; example client | exhibition with a fixed seed |
| 4:00 | Glue to A6's prologue and wake-up (real cue names), E2E E1 to E7 | |
| 4:30 | Fix wave from usability results (script clarity); reduced motion check | |
| 5:00 | **Final PR**, `docs/sprint/HANDOFF-A4.md` | |

### 7.13 Acceptance criteria

1. A first-time visitor sees: prologue (skippable), "Oh no..." in a female voice with subtitles, the vortex, the wake-up, the 19 lines, the card, and then control, in under 2.5 minutes with a clear next step (rule R1).
2. The script says exactly what 7.1 requires: Guests and the gift, nobody knows their language, elders at the Shell, a generous reward, {fee} silk to go home, kill, gather, quests; no jargon (test 1).
3. The card lists the seven things in 1.3 and is reopenable.
4. Every A4 tip and the glossary work; panels each show a first-open tip once.
5. An agent enters through `POST /v1/sessions/{id}/commands`, shows with the Agent badge, and an agents-only tournament seals; the example client exits 0; OpenAPI is updated and valid.
6. The voice file or its fallback works; nothing blocks if audio is unavailable.
7. All tests green; flags `newPlayerIntro` and `agentTournament` have a working off state.

### 7.14 What A4 must NOT touch

Quest data, tracker, journal, portal copy (A1; you only provide strings under `npc.talk.*`); HUD, keybinds, skills (A2); market, chests, wheel, silk model (A3); `boot-world.js`, `main.js`, `features.js`, README (A5); 3D scenes, cinematic internals, art (A6: call its API only). In `server/src/**` change only the tournament action and route.

### 7.15 Hand-off

To A6 (minute 30): the cue names you listen to and the subtitle format (7.5 and the cue table 9.5). To A1: `npc.talk.*` keys, and the fact that the Elder's first dialogue ends by `quests.accept('q_welcome')`. To A5: panels registry for the tips test, the example client command for the README and the judge page. To A3: nothing blocking.

### 7.16 Ready-to-paste prompt for A4

```
You are Agent A4 on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee, branch sprint/5h-a4, PRs into sprint/5h; never push to main, never deploy, no secrets, no mainnet).
Read first: /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3 and 7 (and 9.5 for A6's cue names); FTF-Story-Quests-Leaderboard-TZ.md for Iris canon (doctor-linguist from another planet, year 2048, not an AI).
Mission: the new-player experience: intro flow state machine (prologue -> wake-up -> 19-line townsfolk dialogue -> "What waits for you" card -> control), dialogue box and subtitle bar, female voice line "Oh no..." (Piper or espeak placeholder + speechSynthesis fallback, documented in docs/audio/voice.md), first-seen tips and the in-game glossary, quest-giver dialogue strings (npc.talk.*), and agent entry in the tournament (API action enter_tournament, GET /v1/tournament, OpenAPI, example client, Agent badge, agents-only exhibition).
Every line of script, layout, state, number, endpoint and test is in section 7: follow it exactly. English only, no jargon (see 1.6), {fee} always from config (never a literal 200 or 10,000), flags newPlayerIntro/agentTournament, ownership matrix 3.8. A6 builds the 3D prologue; call playLabPrologue()/playWakeUp() and listen to prologue.cue events; build a title-card fallback so you are never blocked.
Work in 30-minute blocks per 7.12, rebase on sprint/5h each block, PRs at 1:30, 3:00, 4:30, final 5:00. Write the tests in 7.11. Requests go under "## A4" in docs/sprint/BOARD.md. Finish with docs/sprint/HANDOFF-A4.md. If late, use the minimum polished line in 7.12.
```

---

## 8. Agent A5 (Opus 5.5): integration captain (seam, tests, performance, flags, README, demo page, demo seed, video package)

### 8.1 Mission

I want one agent who keeps six streams of work from colliding and who makes the result **safe, fast, documented and recordable**: the shared seam that the other five code against (bus, markers, tooltip, first-seen tips, tokens, locale seams, flags), one command that proves the sprint (`scripts/verify-sprint.sh`), a dynamic-import retry so a deploy never shows "Something went wrong while loading", performance budgets, feature flags turned on at the right time, an accurate README and a judge page, a demo seed so the video can be recorded in one take, the first-ten-minutes end-to-end test, the usability kit, and the **demo video package** (shot list, voice-over, captions, recording runbook, and clips if the box can render WebGL).

### 8.2 File-by-file change list

| File | Action | Detail |
|---|---|---|
| `game/src/sprint/**` (index, registry, bus, markers, tooltip, first-seen, retry-import, demo-seed, tokens.css, stubs) | create | contracts in 3.2 |
| `game/src/features.js`, `game/public/features.json` | modify | add the sprint flags (3.6), defaults off; on at 4:00 |
| `game/src/boot-world.js` | modify | **one import and one `mountSprint(ctx)` call** |
| `game/src/main.js` | modify | `retryImport` around the dynamic imports, `vite:preloadError` handler, reload guard |
| `game/src/play/mobs.js` | modify | one commit at minute 30: `bus.emit('mob.hit' / 'mob.killed', …)` at the existing hit and death events; no other change |
| `game/src/play/locales/en.js` | modify | import lines for the six `en-*.js` files, a fallback to English for the other locales |
| `scripts/verify-sprint.sh`, `scripts/lint-sprint.mjs`, `scripts/bundle-budget.mjs`, `scripts/stats.mjs` | create/modify | 8.4; `stats.mjs` parses both `# pass N` and `ℹ pass N` (Node 24) |
| `tools/e2e/sprint/*.mjs` and `game/tests/fixtures/*` | create | 8.6, mock relayer comes from A3 |
| `README.md`, `docs/judge-path.md`, `docs/STATS.md`, `docs/sprint/*` | modify/create | 8.8 |
| `docs/submission/video/*` | create | section 11 |
| `docs/sprint/usability-kit.md`, `usability-results.csv` | create | 8.9 |

### 8.3 Seam details

**Registry sketch (exact behaviour):**

```js
// game/src/sprint/registry.js
export const MODULES = [
  { id: 'firstSeenTips', flag: 'firstSeenTips', load: () => retryImport(() => import('./first-seen.js')) },
  { id: 'rpgHud',        flag: 'rpgHud',        load: () => retryImport(() => import('../rpg/index.js')) },
  { id: 'quests',        flag: 'questJournal',  load: () => retryImport(() => import('../quests/index.js')) },
  { id: 'market',        flag: 'marketplace',   load: () => retryImport(() => import('../market/index.js')) },
  { id: 'npe',           flag: 'newPlayerIntro',load: () => retryImport(() => import('../npe/index.js')) },
  { id: 'lab',           flag: 'labPrologue',   load: () => retryImport(() => import('../scenes/lab/index.js')) },
];
// mountSprint(ctx): for each module whose flag is on, load, then mount(ctx); a module that throws is logged, reported
// with bus.emit('error.shown', {area: id, cause: 'mount'}), and skipped. Never blocks the game.
```

Mount order: first-seen, rpg, quests, market, lab, npe (npe last, because it starts the flow when everything it needs exists).

**`retryImport(fn, {retries = 3, delaysMs = [300, 900, 2000]})`:** try `fn()`; on a rejection whose message matches `/dynamically imported module|Failed to fetch|Loading chunk|Importing a module script failed/i`, wait the delay and try again; **a failed dynamic import may be cached by the browser for the same URL**, so the helper's last resort is a **single guarded page reload with a cache-busting query** (`?v=<timestamp>`), guarded by `sessionStorage['ftf.reload.v1']` (at most one reload per 5 minutes, so a real outage cannot loop); before the reload a banner "A new version is available. Reloading…" shows 1.2 s. `window.addEventListener('vite:preloadError', e => { e.preventDefault(); … same guarded reload })`. If the reload was already used, show the non-blocking banner "Some parts could not load. Check your connection and **Reload**" (button) and keep the game running without that module. Unit tests with a fake `fn`; e2e blocks the chunk with a route abort for the first two requests and checks that the game loads.

**Bus:** exactly the API in 3.2; `state` is a keyed store with `sub`; telemetry ring of 500 at `window.__ftfTelemetry`; with `?debug=1` each emit also prints. **No network sink.**

**Tooltip:** one element `#ftf-tooltip` appended to `body`, `--z-tooltip`, `role="tooltip"`, `aria-describedby` on the anchor; 250 ms hover delay, immediate on keyboard focus, hides on blur, Esc, scroll or pointerleave; max width 320 px; content `{title, rarity?, lines[], footer?}` rendered as text (never `innerHTML`); flips to stay inside the viewport with an 8 px margin; touch: first tap shows, second tap activates.

**First-seen:** one registry and one queue (7.7 rules), persisted `ftf.tips.v1 = {seen: {id: true}, off: false}`; "Skip tips" sets `off`; `resetTips()` clears both; `showTip(id, {force})` for the "?" handles; never shows during `npe` states or while `#ftf-modal-open` is set.

### 8.4 `scripts/verify-sprint.sh` (one command; fails on the first red step and prints a table at the end)

| Step | What it runs | Fails when |
|---|---|---|
| 1 Unit | `node --test` over `game/tests`, `relayer/tests`, `server/tests` (sprint folders included); prints counts | any test fails |
| 2 Lint | `scripts/lint-sprint.mjs` | banned jargon in a player string outside `curious.*` (list 1.6); any `wool` (case-insensitive) outside a short allow-list file; a literal `10,000`, `10_000`, `20000` or `20_000` or a standalone `200` next to "silk" in sprint-owned UI and locale files; non-ASCII Cyrillic or CJK letters outside the `ru`, `uk`, `zh` locale files; a player string over 140 characters in `en-npe.js`; an element with `text-overflow: ellipsis` and no `title` or expand handler (R7); `toFixed(2)` or `Math.floor(…/100)` used for silk outside `silk-balance.js`; the string "Local: kept in this browser only" |
| 3 Build | `npm run build` in `game` | build error |
| 4 Budget | `scripts/bundle-budget.mjs` | new first-load JS above 40 KB gzipped; lazy chunks of the sprint above 250 KB gzipped in total; any single new chunk above 120 KB gzipped |
| 5 Smoke | serve `game/dist`, headless Chrome loads `/`, waits for the game, asserts no `console.error`, no failed requests, the title is the canon title, the meta description matches the canon text (master plan 1.2) | any |
| 6 E2E | `tools/e2e/sprint/run.mjs` (all e2e of sections 4 to 9 plus the first-10-minutes script) | any |
| 7 Clipping | A6's `game/tests/clipping` penetration check (no WebGL needed) | any penetration beyond tolerance |
| 8 Stats | `scripts/stats.mjs` regenerates `docs/STATS.md` and checks it equals the committed file | stale |

Node 24 fix inside step 8: `stats.mjs` accepts both `# pass N` and `ℹ pass N` (TAP and spec reporters) or runs `node --test --test-reporter=tap`. The script must also pass on Node 20 and 22 `[VERIFY]` the CI version in `.github/workflows`.

### 8.5 Demo seed (`?demo=video`, `?demo=quests`, `?demo=market`; never active without the query)

A visible chip "Demo data" (top left, 12 px, `--ftf-warn`, always on screen) shows whenever a seed is active (honest label; rule 6). `?demo=video` sets, in the browser only:

| State | Value |
|---|---|
| Intro | `?intro=1` is implied for the first recording, `?intro=0` for retakes (`&intro=0`) |
| Level / XP | level 6 (1,500 XP), 5 skill points unspent, learned: `ling_diction`, `ling_echo` |
| Quests | `q_welcome` completed, `q_spiders` active at 7 / 10 (pinned), `q_part` available, `s_chest` and `s_trade` available |
| Bag | 8 sealed chests (mixed tiers), 12 spider silk thread, 4 chitin plates, 2 shards, 1 spare part (device scope) |
| Play silk | 20 (the allowance) |
| Silk on chain | **real**, from the chain: the demo guest account must be topped up first (below); the seed never fakes `onChainC` |
| Market | with `?demo=market`: a second seeded seller "Tobias" with 3 listings (settlement `demo` unless chain is on) |
| Tournament | 3 scripted agents already entered ("Scribe-1", "Scribe-2", "Scribe-3") |

**Preparing the real on-chain silk for the video (steps for me; no secrets in the repo):** (1) open the game once on the recording browser so the guest account is created; copy its account id from Settings; (2) **I will do myself:** with the coordinator key, call `ftf-town.credit_silk(account_id, <220 silk in micro-silk>, "demo")` (and `register` first if the account is new); (3) reload: the HUD chip shows 220 silk on chain, enough for the Gate price; (4) after the recording the silk is simply spent by the portal payment. A5 writes this as `docs/submission/video/prepare-account.md` with the exact `near` CLI lines using placeholders (no key material).

### 8.6 The first-ten-minutes end-to-end test (`tools/e2e/sprint/first-ten.mjs`)

It plays the table in 1.2 with a scripted player (hooks in `window.__ftfTest`, enabled by `?test=1`). Steps and assertions:

| Step | Action | Assertion |
|---|---|---|
| 1 | open `/?test=1&intro=1` with a fresh profile | no console error; the loading ritual shows |
| 2 | wait for `prologue.started` (or the fallback title card) | subtitle bar shows "Year 2048." within 6 s |
| 3 | wait for `prologue.cue {id:'oh_no'}` | the voice cue fired (or the speech fallback), subtitle "Iris: Oh no..." |
| 4 | wait for `npe.step {step:'dialogue'}`; advance 19 lines | speaker names and texts equal the script table 7.3; the stipend toast once |
| 5 | the roadmap card | seven rows; click **Start** |
| 6 | `npe.completed`; HUD present | every rectangle of 5.4 within ±2 px; the guide step 1 text is visible; `Road home` shows `0 / {fee}` (fee read from config in the test, not literal) |
| 7 | move; call `autoWalkTo` via the journal row | `autowalk.started`, then `arrived` near the Elder |
| 8 | talk to the Elder; accept `q_welcome`; turn in | silk +8, XP +30, the tracker moves to `q_spiders` |
| 9 | kill spiders with the hook until the first level-up | `level.up`; tip.skills shows once; learn one node; slot 5 assigned |
| 10 | first chest drops; pick up; open one | bag shows the **This device** badge; the open animation; result card; tx link format valid on the mock |
| 11 | open Market; list a resource; second context buys | fee 2%; the ticker shows the trade; the **Demo** chip or the tx links |
| 12 | read silk everywhere | HUD chip line 1, tracker, portal prompt, journal header, market header: identical text |
| 13 | tournament card | Add an agent: the **Agent** badge visible |
| 14 | end | zero `error.shown` events; total time budget under 6 minutes of headless time; telemetry saved to `docs/sprint/last-run-telemetry.json` |

The test also runs the **time-to-first-quest** metric: from `npe.completed` to `quest.accepted` must be under 60 s of scripted time (the human version is in 1.7).

### 8.7 Performance budgets (measured in headless Chrome; software GL numbers are only for regressions)

| Budget | Limit |
|---|---|
| New first-load JavaScript (all sprint code that is not lazy) | ≤ 40 KB gzipped |
| Sprint lazy chunks, total | ≤ 250 KB gzipped; each ≤ 120 KB |
| Long tasks during module mount | none above 80 ms (PerformanceObserver `longtask` in the smoke test) |
| DOM nodes added by HUD, tracker, hotbar | ≤ 1,500 |
| Loot beams | ≤ 12 at once, ≤ 24 extra draw calls |
| Floating numbers | pool of 24, no allocation per frame |
| Lab scene (A6) | ≤ 60,000 triangles, ≤ 25 draw calls, textures ≤ 6 MB total; loads lazily only for the prologue |
| Memory growth after 5 minutes of the scripted run | ≤ 60 MB (headless heap snapshot comparison) |
| Frame time | on the GPU machine: p95 ≤ 20 ms at 1080p in town (the owner's check at the end); headless: no regression of more than 15% against the baseline file `docs/sprint/perf-baseline.json` |

### 8.8 README, judge page, STATS

**README** (keep the current structure; edit only these parts; every claim must be true on the day, rule from MP 15.3): (1) top: title, one-sentence canon tagline, **Play now** link and **Watch the demo** link (placeholder until the video exists, then the real link); (2) a 5-line "What a stranger sees in the first minute" block; (3) **Sprint features** table: quest journal and auto-walk, RPG HUD and skills, market and trade, chests and loot, play-money games, new-player intro, agents in the tournament, each with one screenshot path under `docs/screens/` (A5 captures if WebGL works, else placeholders marked "screenshot pending"); (4) **Controls** table copied from 3.5 (generated by a script from `keybinds.js`, so it cannot drift); (5) **How silk works**: the three silk kinds in two sentences each, the Gate price from config; (6) **Contracts and proofs** table (names from `src/net/day1-deployment.js` and `near-deployment.js`, generated), tx-link examples; (7) **Agent API** example: the `curl` calls from 7.9 and the example-client command; (8) **Run the tests**: `scripts/verify-sprint.sh` and the test counts from `docs/STATS.md` (generated); (9) **Honest labels**: testnet, play money, AI voice placeholder, demo data; (10) **AI disclosure** as the hackathon requires `[VERIFY]` the wording in `docs/submission`.
**`docs/judge-path.md`:** the 90-second path: (1) open the live URL; (2) watch or skip the prologue; (3) press J; (4) press B and open the Games tab; (5) open the tournament card and add an agent; (6) the Gate-Loom prompt and the Road Home bar; (7) the explorer links. Each step has the expected result and a screenshot path.
**`docs/STATS.md`:** regenerated by `scripts/stats.mjs`; the CI check compares it with a fresh run.

### 8.9 Usability test kit (`docs/sprint/usability-kit.md`)

Contains: the consent line ("We record your screen and voice to improve the game. No personal data is stored. You can stop any time."), the facilitator script (verbatim tasks T1 to T11 of 1.7, with the rule "do not explain anything"), a stopwatch sheet for the metrics, a CSV template `usability-results.csv` (`tester,T1_premise,T2_first_quest_s,T3_silk_ok,T4_portal_goal_s,T4_numbers_ok,T5_s,T6_s,T7_ok,T8_ok,T9_ok,T10_ok,T11_ok,confusions`), and the confusion log format (screen, word, what they thought). **A5 cannot recruit people. I will do myself (or ask five friends):** run the five sessions with the kit and send the CSV; A5 computes the pass/fail table and files the results in `docs/sprint/usability-results.md`. While waiting, A5 runs the automated proxy (8.6) and a **text walkthrough audit**: reads every player string in `en-*.js` in order of first appearance and lists any word that fails rules R4 and R11.

### 8.10 The video package (full spec in section 11)

A5 produces under `docs/submission/video/`: `shotlist.md` (11.3), `voiceover.md` (11.4), `captions.srt` (11.5), `record-runbook.md` (11.6), `prepare-account.md` (8.5), `music.md` (licence record), `vo-draft.wav` (TTS draft of the voice-over if a TTS tool is available), and, **only if the box can render WebGL**, raw clips captured with the existing `tools/capture/capture.mjs` and Playwright (frame-stepped, 60 fps). If the box cannot render WebGL, A5 says so on `BOARD.md` and the runbook is for me to record on my machine; A5 never claims clips it did not produce. A5 also drafts the X post text and the video description (drafts only; I post, I will do myself).

### 8.11 Tests owned by A5

Unit: `retry-import.test.mjs` (retries, backoff, reload guard, banner), `bus.test.mjs`, `markers.test.mjs`, `tooltip.test.mjs` (flip, delay, escape), `first-seen.test.mjs` (queue rules, persistence, reset), `registry.test.mjs` (flag off = module not loaded; a throwing module does not break the others), `lint-sprint.test.mjs` (each lint rule fails on a bad fixture and passes on a good one), `stats.test.mjs` (both reporter formats), `demo-seed.test.mjs` (seed applied only with the query; the chip is present; it never fakes `onChainC`). E2E: `first-ten.mjs` (8.6), `chunk-retry.mjs` (route abort), `flags-off.mjs` (every sprint flag off: the game boots and plays like `main`), `flags-on.mjs` (all on: no console errors, no overlaps between HUD rectangles).

### 8.12 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line |
|---|---|---|
| 0:00 | Cut `sprint/5h`; seam stubs with the exact signatures; flags; locale seams; **push stubs by 0:20** and tell everyone on `BOARD.md`; mob bus emit | |
| 0:30 | Real `bus`, `markers`, `tooltip`, `first-seen`, `tokens.css`; `docs/sprint/CTX.md` with the real `ctx` field names | |
| 1:00 | `retry-import`, `main.js` handler; `verify-sprint.sh` and `lint-sprint.mjs` skeleton | |
| 1:30 | **Wave 1 merge** (order in 10.1); fix ctx mismatches; `stats.mjs` Node 24 fix | |
| 2:00 | Bundle budget script, smoke test, CI wiring (add the script to the workflow) | |
| 2:30 | E2E harness, `__ftfTest` hooks table, `first-ten.mjs` skeleton with the finished steps | |
| 3:00 | **Wave 2 merge**; run the whole suite; open issues on `BOARD.md` for failures | |
| 3:30 | README, judge page, demo seed, usability kit, video shot list and voice-over | |
| 4:00 | **Turn all flags on** in `features.json`; `flags-on` and `flags-off` e2e; `first-ten.mjs` complete | |
| 4:30 | Run the proxy usability check; text audit; video clips if WebGL works; fix wave | |
| 5:00 | **Final merge**; final suite; report to me: pass/fail table, open items, what I must do myself | |

### 8.13 Acceptance criteria

1. `scripts/verify-sprint.sh` is green on `sprint/5h` and on Node 24 (the `stats.mjs` bug fixed).
2. With every sprint flag off the game behaves like `main`; with all on, no console errors and no overlapping HUD rectangles.
3. A blocked chunk does not leave the "Something went wrong while loading" screen (retry then one guarded reload, or the banner).
4. The bundle and performance budgets in 8.7 hold.
5. README, judge page and STATS match reality (generated parts are generated).
6. The first-ten-minutes e2e passes including the silk equality step (12) and time-to-first-quest under 60 s.
7. The video package files exist, the voice-over and shot list match section 11, and the "I will do myself" steps are listed.

### 8.14 What A5 must NOT touch

Feature code inside `game/src/quests`, `rpg`, `market`, `npe`, `scenes/lab`, art, contracts, relayer (if a test fails there, file it under that agent's heading and wait). The only edits to shared gameplay files are the one-line seams: `boot-world.js` (import and mount), `mobs.js` (bus emit), `locales/en.js` (imports).

### 8.15 Hand-off

To me at 5:00: the pass/fail table, the telemetry of the last run, the list of "I will do myself" items (merge to `main`, contract deploys, relayer redeploy with the new chest constants and the `P2P_SETTLEMENT` switch, coordinator top-up of the demo guest, Season 1 end date confirmation, recording and posting the video).

### 8.16 Ready-to-paste prompt for A5

```
You are Agent A5, the integration captain on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee; you cut and own branch sprint/5h; other agents open PRs into it; never push to main, never deploy, no secrets, no mainnet).
Read first: /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3, 8, 10 and 11.
Mission: (1) within 20 minutes push the seam stubs with the EXACT signatures in 3.2 (bus, markers, tooltip, first-seen, silk-view and auto-walk stubs, tokens.css, locale seams, flags) so five agents can code against them; (2) scripts/verify-sprint.sh with lint, budget, smoke and e2e steps (8.4) and the Node 24 stats.mjs fix; (3) retryImport + guarded reload + vite:preloadError; (4) merge PRs in the order of 10.1 after verify-sprint is green; (5) turn the flags on at 4:00; (6) README, judge page, STATS, demo seed (?demo=video), usability kit, first-ten-minutes e2e; (7) the demo video package (shot list, word-by-word voice-over, SRT captions, runbook, music licence, clips only if WebGL works - never claim clips you did not make).
Follow exact numbers, files and tests in section 8 and 11. English only, silk only, portal fee from config, honest labels (Demo data chip). Only one-line seam edits in shared gameplay files. Requests go under "## A5" in docs/sprint/BOARD.md; the "Decisions" section is yours. 30-minute blocks per 8.12. Final report at 5:00 as in 8.15.
```

---

## 9. Agent A6 (Fable 5.2): 3D lab prologue, Iris run-and-return, device, time vortex, wake-up shot, skirt and leg clipping fix

### 9.1 Mission

I want the game to open with a **cinematic that sells the premise in 40 seconds**: Iris, a doctor-linguist from the year 2048 (not an AI), returns from a run to her laboratory, checks something on her computer, **accidentally activates the device**, walks up to it, says **"Oh no..."** in a female voice, and is **sucked into a vortex of time** (a time-tunnel). She opens her eyes in the hill town, **surrounded by townsfolk**. The prologue is skippable, has subtitles, and hands control to A4's dialogue. In parallel I want the **skirt and leg clipping fixed** on Iris in every animation, without changing her face, hair, materials or silhouette.

### 9.2 Scope in and out

In: the lab scene (built procedurally in Three.js, like the existing Gate-Loom, so there is no big asset download), the prologue timeline, camera paths, Iris poses and procedural layers on top of the existing clips, the device and its activation, the vortex and tunnel effects, the wake-up shot in town with the townsfolk ring, new cinematic audio cues (synthesised), the camera-focus API for A4's dialogue, the capture shot script for the video, the clipping fix, its regression test and the before/after sheets. Out: dialogue box, subtitles renderer, voice file (A4); HUD (A2); the intro state machine (A4 calls your API).

### 9.3 File-by-file change list

| File | Action | Detail |
|---|---|---|
| `game/src/scenes/lab/index.js` | create | `buildLab(ctx)` returns `{root, dispose, lights, props}` (procedural) |
| `game/src/scenes/lab/lab-build.js`, `lab-props.js`, `lab-materials.js` | create | geometry, canvas textures (floor tile, board scribbles, monitor graph), materials |
| `game/src/scenes/lab/device.js` | create | the Glass Resonator: plinth, ring, glyph band, glass pane shader, states `dormant → armed → humming → open` |
| `game/src/cinematic/prologue/index.js` | create | `playLabPrologue`, `playWakeUp`, `focusOn` (9.5) |
| `game/src/cinematic/prologue/timeline.js` | create | small timeline runner (time → camera, pose, vfx, cue), deterministic, skippable, supports the virtual clock |
| `game/src/cinematic/prologue/shots.js` | create | the shot table of 9.4 as data |
| `game/src/cinematic/prologue/iris-poses.js` | create | procedural layers (reach, startle, pull, lie and sit-up) over existing clips |
| `game/src/cinematic/prologue/vortex.js` | create | vortex disk, tunnel, particles, post effects (9.10) |
| `game/src/cinematic/prologue/lab-audio.js` | create | synthesised cues via `audio/town-audio.js` |
| `game/src/cinematic/prologue/captions.en.js` | create | the caption texts of 9.4 |
| `game/src/cinematic/prologue/townsfolk-ring.js` | create | the wake-up crowd |
| `tools/capture/shots/prologue.json`, `wakeup.json` | create | frame-stepped capture scripts (the existing `?cinematic=` pattern, `[V] tools/capture/capture.mjs`) |
| `art/agents/iris_hero/*`, `art/agents/agent_rig.py`, `agent_anim.py`, `art/anim/**` | modify | clipping fix (9.11) |
| `art/anim/tools/check_clipping.py`, `art/agents/iris_hero/qa_silhouette.py` | create | tests and sheets |
| `game/public/assets/models/agent_iris.glb`, `game/public/assets/anim/iris.glb` | replace (rebuilt) | same names, same triangle budget or lower |
| `docs/art/iris/clipping/**`, `docs/art/animation-pipeline.md` | create/modify | report, constants, sheets |
| `game/tests/clipping/*` | create | 9.13 |
| `game/tests/prologue/*.test.mjs` | create | 9.13 |

### 9.4 Shot-by-shot breakdown (prologue, 38.0 s; wake-up 9.0 s)

The lab room is 10 m (x) × 8 m (z) × 3.4 m high, origin at the room centre, +x east, +z south, +y up; the door is in the south wall at x = −3; the computer desk is against the north wall at x = 2.2, z = −3.4; the **Glass Resonator** (the device) stands at x = 3.2, z = 0.4 facing west; a window with a night-blue 2048 city skyline fills the east wall left of the device. Times are seconds from `prologue.started`. Camera format: position `(x, y, z)` → look-at `(x, y, z)`, FOV in degrees, linear unless "ease" is written.

| Shot | Time (s) | Duration | Camera | Iris and animation | VFX and lighting | Audio cue | Caption or subtitle |
|---|---|---|---|---|---|---|---|
| **P1** Title | 0.0 to 3.0 | 3.0 | black, then fade-in 1.0 s on a locked frame `(−4.8, 1.9, 5.2)` → `(−3, 1.3, 3.6)`, FOV 40 | none yet | title card overlay "FORGET TO FORESEE" gold, `--font-title` 56 px, centre, fades in 0.6 s, holds, fades out by 2.8 s; under it "2048" 28 px | room tone low (60 Hz hum + faint city), `cue_title` soft swell | title text only |
| **P2** Return | 3.0 to 7.0 | 4.0 | ease dolly `(−4.8, 1.9, 5.2)` → `(−3.9, 1.6, 3.2)`, look `(−3, 1.2, 3.8)`, FOV 40 → 36 | the door opens (0.6 s); Iris jogs in using the existing **`run`** clip (loop) from `(−3, 0, 5.5)` to `(−3, 0, 2.6)`, sweat towel in hand not needed; breath rises | cool daylight from the window, warm desk lamp, dust motes in the light shaft | door slide, footsteps on tile (existing step cue at the run cadence), breathing | "2048. Dr. Iris's laboratory." (caption, no speaker) |
| **P3** Cool-down | 7.0 to 10.0 | 3.0 | tracking profile at `x_cam = x_iris − 0.3`, `y = 1.45`, `z = −1.4 → −1.0`, look at her chest, FOV 34 | blends `run` → `walk_town` over 0.6 s at t = 7.4, path to `(0.6, 0, −2.4)`, ends with **`idle_shift`** (catching her breath) | soft rim light from the window | footsteps slow, breath settling | none |
| **P4** The check | 10.0 to 13.5 | 3.5 | over-the-shoulder from behind-left `(0.1, 1.55, −1.6)` → `(0.9, 1.5, −2.2)`, look at the monitor `(2.2, 1.3, −3.4)`, FOV 32 | she steps to the desk, leans in (procedural spine lean 8°), right hand to the keyboard (two-bone IK to the key area), left hand on the desk edge | the monitor shows a pulsing waveform (the Guests' signal) in teal, a red warning triangle blinks once at 12.6 s | keyboard typing (3 taps), soft beep | *Iris:* "One more check on the signal..." (subtitle only, no voice) |
| **P5** The key | 13.5 to 15.5 | 2.0 | insert macro `(2.0, 1.35, −2.85)` look `(2.2, 1.12, −3.15)`, FOV 24, slight handheld ±0.004 m | her sleeve / elbow brushes a **red glass key** on the console; the key presses down (0.15 s) | the key lights red then white; the monitor flashes "RESONATOR ARMED" | sharp click, then a rising sine 80 → 160 Hz | none |
| **P6** It wakes | 15.5 to 19.5 | 4.0 | wide, slow dolly `(−1.2, 1.7, 2.8)` → `(0.4, 1.6, 1.6)`, look `(3.2, 1.5, 0.4)`, FOV 38 → 34; Iris in the foreground (back to camera) | she turns (**`turn_r`**, 0.9 s) and looks at the device; hands come down slowly | the ring's glyph band spins up (0 → 1.5 turns/s), the glass pane fills with pale light, the lamp and ceiling lights flicker twice, papers on the bench tremble | device hum rising with a harmonic choir pad, light flicker "tick tick" | none |
| **P7** She approaches | 19.5 to 23.5 | 4.0 | low tracking from behind-left `(0.3, 0.9, 1.8)` → `(1.3, 1.0, 1.4)`, look `(3.2, 1.4, 0.4)`, FOV 34 | she walks (**`walk`**) toward the device from `(−0.3, 0, 0.6)` to `(2.2, 0, 0.5)`, stops 1.0 m from the ring with the right hand half raised (procedural arm raise 35°) | glow lights her silhouette; a wind starts from the ring (cloth and hair respond: this is where the skirt must not clip, 9.11) | hum rising, footsteps slow, fabric rustle | none |
| **P8** "Oh no..." | 23.5 to 26.5 | 3.0 | close three-quarter on her face `(1.75, 1.62, 0.95)` → `(1.85, 1.62, 0.75)`, look `(2.4, 1.6, 0.5)`, FOV 28 | **expression: curiosity → alarm** using the existing face layers and head/brow cues `[VERIFY]` (no redraw); if none reads clearly, cut to a back-of-head shot over the shoulder; at 24.3 s her mouth opens (existing `talk` viseme pass) | the pane's light turns white-gold on her face, sudden bright pulse at 25.8 s | **voice "Oh no..." at 24.3 s** (1.2 s, A4's `iris_oh_no.ogg`), hum peak, heartbeat begins | *Iris:* "Oh no..." (subtitle, at 24.3 s) |
| **P9** The pull | 26.5 to 31.0 | 4.5 | dolly-zoom: camera `(0.6, 1.55, 1.1)` → `(1.2, 1.5, 0.7)`, FOV 45 → 72 over 3.0 s, shake amplitude 0.12 m at 14 Hz ramping up, roll ±4° | the pane bursts into a **vortex disk**; Iris is pulled: root moves along a curved path toward the disk (distance 1.0 m → 0.0), rotates 160° about the vertical axis, body leans back 25°, arms up, a startle gasp (optional `iris_gasp.ogg`) | vortex disk radius 1.2 → 3.2 m, papers, cups and a lab coat on the hook fly toward it, light streaks, chromatic aberration 0 → 0.6, radial blur, vignette | whoosh, reversed clock ticks, bass swell | none |
| **P10** Time tunnel | 31.0 to 35.5 | 4.5 | falling POV behind Iris, camera on the tunnel axis, speed 18 m/s, FOV 80, slight roll spin 25°/s | Iris is a small silhouette ahead, tumbling slowly (procedural), hair and cloth trailing | tunnel rings of light every 3 m scrolling toward the camera, sprites of **clock faces and calendar pages with years counting backwards 2048 → 1, then glyphs** (ten sprites, no text legal issue), teal to gold gradient, whiteout ramp from 34.6 s | crescendo, tonal rise, everything cuts to silence at 35.4 s | none |
| **P11** Whiteout | 35.5 to 38.0 | 2.5 | static, then a hard cut to black at 37.0 s | none | white flash 0.3 s then fade to black over 1.0 s, black hold 1.0 s | silence then a single heartbeat at 36.8 s, a breath-in at 37.5 s | none; **`prologue.completed` at 38.0 s** |
| **W1** Eyes open | 0.0 to 3.0 (wake-up clock) | 3.0 | first-person level on the cobbles: `(1.4, 0.35, 23.0)` looking up and along `(1.4, 2.0, 22.0)`, FOV 55; depth of field from blurred to sharp over 2.0 s | Iris lies on her back, root at `(1.4, 0.1, 23.2)`, head toward −x | eyelid overlay: two soft black shapes opening 1.2 s (screen-space, no face change), bloom, a bright sky with the Gate-Loom glow far behind | crowd murmur ("Is she alive?" as sound only), distant bells, wind | none |
| **W2** The circle | 3.0 to 6.0 | 3.0 | camera tilts up and back from `(1.4, 0.4, 23.0)` to `(1.4, 1.0, 22.6)`, look sweeps across the ring of faces, FOV 55 → 50 | the townsfolk ring (9.6) leans in, heads tilt, one child points | the dormant Gate-Loom glows indigo behind the Weaver | murmur resolves, a gasp, **A4 line W1 starts at 5.5 s** | none (A4's dialogue box takes over) |
| **W3** Sit up | 6.0 to 9.0 | 3.0 | rises and pulls back to the town camera framing `(1.4, 3.2, 17.8)` → `(1.4, 1.0, 23.2)`, FOV 50 → 42 (the gameplay camera's start pose), ease-out | Iris sits up over 1.5 s (procedural root rotation 80° → 0° into `idle`), glances left and right | the light settles to the normal town daylight | murmur fades under | none; **`wakeup.completed` at 9.0 s** |

Total prologue time 38.0 s; wake-up 9.0 s; dialogue by A4 follows. Hard limits: the prologue never exceeds 45 s even at a slow frame rate (the timeline uses wall-clock time, with the virtual clock in capture mode); frame drops skip effects (the whiteout and cuts always land on time).

**Reduced motion:** no camera shake, no dolly-zoom (FOV fixed 50), no strobing flicker (lights dim smoothly), no roll; the vortex is a slow fade of the disk; total shortened to 28 s (P2 to P3 merged, P10 shortened to 2 s). **Phone:** the lab uses 50% particle counts, no radial blur, and the same timings.

### 9.5 API and cue table (the contract with A4; all event names also go to the bus)

```js
// game/src/cinematic/prologue/index.js
export async function playLabPrologue({ ctx, signal, onCue }) -> Promise<{ skipped: boolean, ms: number }>
export async function playWakeUp({ ctx, signal, onCue })     -> Promise<{ ms: number }>
export function focusOn(key, ms = 1200)  // keys: 'iris' 'elder' 'guard' 'lamplighter' 'weaver' 'child' 'gate' 'shell' 'badge'
export function releaseCamera()          // hands the camera back to the gameplay rig with an ease
```

`signal.abort()` (A4 on Esc or Skip) makes the prologue **snap to its end within 1.2 s**: the vortex plays a 1.2 s compressed version, the whiteout lands, `prologue.skipped` then `prologue.completed` fire; the lab is disposed and the town is shown. `onCue(cue)` is called with the cue objects below and the same objects are emitted on the bus as `prologue.cue` or `wakeup.cue`.

| Cue id | Time (s) | Payload | A4 reaction |
|---|---|---|---|
| `title` | 0.0 | `{text: 'FORGET TO FORESEE', durMs: 2800}` | none (A6 draws the title card) |
| `year` | 3.0 | `{text: '2048. Dr. Iris\'s laboratory.', durMs: 3800}` | show a subtitle |
| `check` | 10.4 | `{speaker: 'Iris', text: 'One more check on the signal...', durMs: 2800}` | show a subtitle (no voice) |
| `key_press` | 14.0 | `{}` | none |
| `device_on` | 15.8 | `{}` | none |
| `oh_no` | 24.3 | `{speaker: 'Iris', text: 'Oh no...', durMs: 1400, voice: 'voice_iris_oh_no'}` | **play the voice cue**, subtitle |
| `vortex_start` | 26.5 | `{}` | optional gasp cue `voice_iris_gasp` at 27.4 s |
| `tunnel` | 31.0 | `{}` | none |
| `whiteout` | 34.6 | `{}` | none |
| `prologue.completed` | 38.0 | `{ms}` | A4 starts `playWakeUp` |
| `eyes_open` | W 0.0 | `{}` | none |
| `crowd` | W 3.0 | `{}` | none |
| `sit_up` | W 6.0 | `{}` | none |
| `wakeup.completed` | W 9.0 | `{ms}` | A4 starts the dialogue (camera cues via `focusOn`) |

### 9.6 The wake-up crowd (`townsfolk-ring.js`)

The town spawn is `(0, 0, 25)` and the Gate-Loom stands at `(4.4, 0, 24.8)` (`town-portal.js`, `[V]`). Iris lies at `c = (1.4, 0.1, 23.2)`. The ring has 9 townsfolk at radius 2.4 m: position `i` at `c + 2.4 × (cos θᵢ, sin θᵢ)` with `θᵢ = 20° + 40° × i` for `i = 0..8`, leaving a gap around θ = 270° (the camera side) free by shifting `i = 6` to θ = 300°. Identities and positions: Elder at θ = 60°, Child (scale 0.72, existing child rig `[VERIFY]`) at 100°, Guard at 140°, Lamplighter at 200°, Weaver at 330°, three generic townsfolk at the rest. Each uses the existing townsfolk model and clips (`idle_look`, `talk`, `nod`, `wave`), faces Iris with a head look-at that eases to the speaker during the dialogue (`focusOn`), and has a 0 to 0.4 s random offset in its idle phase so they do not move in unison. Mobs and the world are frozen during the shot. The Elder steps forward 0.8 m during W3.

### 9.7 Lab scene layout (procedural; budgets: ≤ 60,000 triangles, ≤ 25 draw calls, textures ≤ 6 MB)

| Prop | Position (x, z), size | Notes |
|---|---|---|
| Room shell | 10 × 8 × 3.4 m | floor: light grey tile (canvas texture 512², grout lines), walls off-white, a dark accent wall to the north |
| Door (sliding) | x = −3, z = +4 | 1.1 × 2.2 m, opens in 0.6 s |
| Window and skyline | east wall, z from −3 to +1 | emissive night-blue skyline strip (one texture) |
| Computer desk | x = 2.2, z = −3.4, 1.8 × 0.8 m | two monitors (canvas texture: waveform and a language-pattern chart), keyboard, **red glass key** console on the desk's right edge |
| Workbench with papers | x = −2.0, z = −2.4, 2.2 × 0.9 m | loose paper sheets (cheap quads) that react to the vortex |
| Language board | north wall, x from −4.5 to −1, 2 m high | canvas texture with scribbles and glyphs, a faint pale-blue grid |
| Shelves and books | west wall | instanced books |
| **Glass Resonator** | x = 3.2, z = 0.4, ring outer diameter 2.2 m, tube 0.12 m | stone-and-brass plinth 0.3 m, a glyph band (same data-texture technique as the Gate-Loom), the glass pane (shader), a subtle echo of the town's Gate-Loom so the audience links the two |
| Lights | window area light (cool, intensity 1.0), desk lamp point (warm 2700 K), ring emissive; ceiling strip lights (flicker targets) | no real-time shadows except the key light, 1024 map |
| Lab coat on a hook | x = −4.6, z = 3.2 | flies toward the vortex in P9 |
| Props (mug, tablet, running shoes box, a towel) | on the workbench | dressing |

### 9.8 Asset list

| Asset | Kind | Source | Budget |
|---|---|---|---|
| Lab room, props, desk, device | procedural geometry | `lab-build.js` (no download) | ≤ 60k triangles total |
| Canvas textures (tile, board, monitor, skyline, glyph band) | generated at load | canvas / data textures | ≤ 6 MB GPU memory total |
| Vortex disk and tunnel shader | one shader material each (layered noise, indigo → teal → gold) | `vortex.js` | 2 draw calls plus particles |
| Particles (papers, motes, light streaks) | instanced quads | `vortex.js` | ≤ 600 instances |
| Iris | existing `agent_iris.glb` (rebuilt with the clipping fix) | `art/agents/iris_hero` | triangle count not higher than today (67,926 per the audit `[V]`, or lower) |
| Townsfolk | existing models and clips | existing | |
| Cinematic audio cues (room tone, door, typing, click, device hum, choir pad, whoosh, reversed ticks, heartbeat, murmur, bells) | synthesised with WebAudio oscillators and noise | `lab-audio.js` through `town-audio.js` `cue()` | no files; or reuse existing cues where they exist `[VERIFY the list in game/public/assets/audio]` |
| Voice "Oh no..." | audio file | A4 (`iris_oh_no.ogg`) | |
| Capture scripts | JSON | `tools/capture/shots/prologue.json`, `wakeup.json` | |

### 9.9 Iris poses over the existing clips (nothing redrawn)

Existing clips `[V] art/anim/clips.json`: walk, run, idle, idle_calm, idle_shift, idle_look, walk_town, carry, talk_b, wave, sit, sweep, play, counter, salute, nod, register, talk, elder_walk, child_run, stairs_up, stairs_down, turn_l, turn_r. The prologue uses `run`, `walk_town`, `walk`, `idle_shift`, `turn_r`, `talk`, `idle`. New poses are **procedural layers** in `iris-poses.js` (quaternion offsets on the spine, shoulders and neck, and two-bone IK for the hands), blended over the base clip with weights: **reach** (right hand to the keyboard and to the key, IK targets in 9.4), **startle** (lean back 25°, arms up 40°, 0.25 s attack), **arm raise** (right arm 35° forward, 0.6 s), **pull** (root along a spline into the disk with yaw 160° and a shrinking scale 1.0 → 0.85 only during P9 to P10; this is a vortex effect on the whole character and is allowed), **tumble** (slow rotation in the tunnel), **lie** (root pitched 80° on the cobbles) and **sit-up** (1.5 s from lie to `idle`). Footsteps stay locked to the clip cadence (the existing gait layer in `play/agents.js` and `physics/motion.js` is not used here; the cinematic drives the root directly and uses the clip rate = speed / stride). Cloth and hair keep running their normal simulation so wind from the device moves them: **this is where clipping would show.**

### 9.10 Vortex and tunnel effect spec

| Part | Spec |
|---|---|
| Disk (P9) | a circle mesh of radius 1.2 m growing to 3.2 m, a shader with three noise layers swirling at 1.4 rad/s (inner faster), colours deep indigo `#140a3a`, teal `#2fb8b0`, gold `#ffc861` rim, additive blend, soft edge, depth-write off |
| Pull | a radial force on papers, mug, towel, coat, motes and Iris's hair (hair and cloth wind vector toward the disk, strength ramps 0 → 1 over 2 s) |
| Post | chromatic aberration 0 → 0.6 (screen-space offset), radial blur 0 → 0.5, vignette 0.2 → 0.7, bloom up; all via one full-screen pass shared with the existing renderer `[VERIFY the post chain in render/]`; skipped on phone and under reduced motion |
| Tunnel (P10) | an inside-out cylinder radius 4 m, 90 m long, UV scrolling 18 m/s, rings every 3 m (emissive torus instances), ten sprite planes with clock faces and calendar pages scrolling toward the camera, years counting down as a numeric sprite atlas (digits only) |
| Whiteout | additive white overlay 0 → 1 from 34.6 s to 35.4 s, then 1 → 0 into black |
| Performance | disk and tunnel are never on screen together; total extra draw calls ≤ 8; particles ≤ 600 |

### 9.11 The Iris skirt and leg clipping fix (my text, A6 follows it exactly)

**What I see:** in several animations Iris's legs come through her skirt and the hem lifts too high. It is the most visible character flaw in the first 30 seconds, in the README screenshots, the video and the photo mode. The same class of problem was already solved for Elise (`art/anim/ftfanim/skirt.py`, `art/agents/elise/b_build.py`, `cloth_rig.npz`), which proves the approach.

**What I want (the instruction, numbers are mine):**
1. **Investigate the rig first.** Open `agent_iris.glb` (22 meshes, 61 bones, 9 clips, audit of 10 Nov `[V] docs/art/iris/audit/README.md`) and the sources `art/agents/iris_hero/build_iris_hero.py`, `hero_costume.py`, `art/agents/agent_rig.py`, `agent_anim.py`. List the skirt mesh and its skin weights; dump, for each skirt vertex, the share of weight on leg bones (thigh, shin, foot) versus pelvis and skirt bones; find the skirt bones (secondary chain) if any, their rest lengths and how the baked or runtime cloth treats them `[VERIFY: whether the skirt moves by a baked cloth clip, by bones, or by skin only]`. Write the findings in `docs/art/iris/clipping/REPORT.md` before changing anything, with the penetration numbers per clip.
2. **Reweight the leg influence on the skirt to 30 to 40%.** For every skirt vertex cap the sum of leg-bone weights at 0.35 (allowed band 0.30 to 0.40), falling smoothly with height (at the hem 0.40, at the waist 0.0), and move the remainder to the pelvis, hip and skirt bones; renormalise. No vertex may snap to the nearest leg bone.
3. **Skirt bones: stiffness, damping, colliders, clamp.** Set the secondary-motion constants to stiffness 0.55 to 0.70 and damping 0.35 to 0.50 (tune inside the bands and record the final numbers), **clamp every skirt bone to 20 to 25° from rest relative to its parent**, and add **colliders**: a capsule on each thigh and each shin (radius = the measured limb radius + 1.5 cm margin) and a sphere on the pelvis, used by the cloth bake (or a per-frame push-out) so the hem and panels stay outside the legs.
4. **Hem lift cap: at most 15 to 20 cm.** The hem may rise at most **18 cm** above its rest height (hard stop at 20 cm, target at most 15 cm in walk and run), enforced by a smooth soft clamp (no hard snap); a high kick lifts the cloth but never exposes the thigh. I approve the final cap after I see the contact sheet.
5. **Reduce stride and knee lift** only in the clips that still penetrate after steps 2 to 4: walk stride −10%, run knee lift −15% (scale the hip-flexion curve), keeping the clip duration, names and foot contacts (re-run the foot lock so feet do not slide). Record the factors per clip.
6. **Hide the covered leg mesh:** remove or hide the leg and shoe geometry that lies entirely under the skirt in the rest pose (a "covered_leg" vertex group above the knee line; the same technique that hid the hollow body shell), so nothing can poke through. Leggings below the hem stay visible. The triangle count must go **down or stay**, never up.
7. **Check every clip and camera:** walk, run, idle (all idle variants), turn_l, turn_r, attack (strike), cast (lance, snare), dash, jump if present, stairs_up, stairs_down, wave, sit, the photo-mode poses, the chapter films, and **the new prologue poses (9.9)**, each from front, side, back and a low camera.
8. **Do not change** Iris's face, hair, materials, textures, outfit colours, bone names, clip names or durations, or her **silhouette at rest** (the standing outline from front, side and back). Only rig weights, skirt simulation constants and the clip curves in step 5 change. **My standing decision: no redraw.**
9. **Before and after, with proof.** A contact sheet per clip (6 frames × 4 views, before and after) in `docs/art/iris/clipping/`, a table of maximum penetration depth per clip before and after in `REPORT.md`, and the final constants written into `docs/art/animation-pipeline.md`.

**Tests (A6 builds, A5 runs in `verify-sprint.sh` step 7):**
- `art/anim/tools/check_clipping.py --model game/public/assets/anim/iris.glb --clips all --tolerance 0.005` samples the leg capsule surface (thigh and shin) against the skirt surface for **every frame of every clip** and reports the maximum penetration depth in metres; **pass = every clip at most 5 mm**. The same tool reports hem lift per frame (pass = at most 20 cm).
- `art/agents/iris_hero/qa_silhouette.py` renders orthographic masks at rest (front, side, back) before and after and requires **IoU at least 0.995**; it compares hashes of the face mesh, hair meshes, materials and textures (must be identical).
- `game/tests/clipping/run.mjs` wraps the Python check (needs `python3` and numpy; if missing it prints `SKIPPED (no python3/numpy)` in yellow and verify-sprint reports it as **not run**, never green) and has a **negative test**: a fixture clip with the knee flexed 60° beyond the safe range must make the check fail.
- A triangle-count test: `agent_iris.glb` triangles ≤ the audited 67,926.
- The same check runs for the second heroine (Elise) so a later animation change cannot reintroduce clipping on either.

**Minimum polished line:** steps 2, 3, 4 and the check for walk, run, idle and turn (the clips visible in the first minute) plus the before/after sheet for those; the rest follow.

### 9.12 Events

`prologue.started`, `prologue.cue`, `prologue.skipped`, `prologue.completed`, `wakeup.started`, `wakeup.cue`, `wakeup.completed` (3.7).

### 9.13 Tests

Unit (`game/tests/prologue/`): (1) the shot table: the times are contiguous, total 38.0 s, every cue id is in the cue table; (2) the timeline is deterministic with a fake clock (same camera pose at the same time on two runs); (3) abort at several times snaps to the end within 1.2 s and fires `prologue.skipped` then `prologue.completed` once; (4) reduced-motion variant has no shake and no FOV change; (5) the lab builder stays under 60k triangles and 25 draw calls (count from the built scene); (6) the crowd ring positions match the formula in 9.6 and none is within 1.0 m of Iris; (7) `focusOn` returns a promise that resolves and clamps unknown keys; (8) the cue payloads' texts are at most 140 characters. E2E (headless Chrome with WebGL if available, else the logic-only variant with a stub renderer): (E1) `?intro=1` plays the prologue to its end in 38 ± 2 s of timeline time, emits the cues in order including `oh_no`; (E2) Esc skips and ends in the town; (E3) the wake-up runs and `wakeup.completed` fires; (E4) frame-stepped capture mode: `tools/capture/capture.mjs` renders `prologue.json` to frames when WebGL exists.

### 9.14 Hour-by-hour (30-minute blocks)

| Block | Work | Minimum polished line |
|---|---|---|
| 0:00 | Read the audit, `skirt.py`, `hero_costume.py`, `clips.json`; **clipping investigation** (9.11 step 1) and the penetration tool skeleton; write the baseline report | |
| 0:30 | Lab geometry blockout, materials and canvas textures, device model; `shots.js` and `timeline.js` | |
| 1:00 | P1 to P3 (title, return, cool-down), camera paths; Iris placement and run/walk blends | |
| 1:30 | **PR wave 1:** lab blockout, timeline running P1 to P4, clipping **before** report and the penetration tool | |
| 2:00 | P5 to P7 (key, device wakes, approach); device states and glow; reach and arm-raise layers | |
| 2:30 | P8 to P11 (face shot, vortex, tunnel, whiteout); `vortex.js`, `lab-audio.js`; cue API to A4 | |
| 3:00 | **PR wave 2:** prologue playable end to end and skippable; wake-up shot W1 to W3 with the crowd ring; `focusOn` | |
| 3:30 | Skirt fix pass 1: reweight, colliders, clamp, hem cap, covered-leg hide (9.11 steps 2 to 4 and 6) | |
| 4:00 | Skirt fix pass 2: stride and knee tweaks where needed, all clips, tests, negative test | |
| 4:30 | Before/after sheets, silhouette check, performance pass, phone and reduced-motion variants, capture scripts | |
| 5:00 | **Final PR**, `docs/sprint/HANDOFF-A6.md` (final constants for my approval, known gaps) | |

### 9.15 Acceptance criteria

1. The prologue plays in 38 s with the beats of 9.4, the lab looks like a lab, the device activates by accident, "Oh no..." lands with its subtitle, the vortex and tunnel read as time travel, and Esc skips cleanly in under 1.2 s.
2. The wake-up shows her eyes opening, the ring of townsfolk and the sit-up, and hands over to A4's dialogue with working `focusOn` cues.
3. At least 60 fps equivalent on the owner's GPU machine in the lab (A5 measures), triangle and draw-call budgets of 9.7 hold.
4. Penetration at most 5 mm for every clip of Iris, hem lift at most 20 cm, silhouette IoU at least 0.995, face, hair, material and texture hashes unchanged, triangles not higher than 67,926.
5. The before/after sheets and the report exist and I can approve the hem cap from them.
6. Reduced-motion and phone variants work; the prologue never blocks the game if WebGL fails (A4's fallback title card).

### 9.16 What A6 must NOT touch

HUD, quest, market, chest, wheel, tournament, dialogue and onboarding code (A1 to A4); `boot-world.js`, `main.js`, `features.js` (A5); the voice file (A4); contracts and relayer. Do not change Iris's face, hair, materials, textures or silhouette; do not rename bones, clips or files.

### 9.17 Hand-off

To A4 at minute 30: the exact API and cue table of 9.5 as a stub that resolves after 1 s so A4 can integrate immediately; at wave 1 the real timeline. To A5: the check command, the capture scripts, the performance numbers. To me: the contact sheets and the constants for the hem cap approval.

### 9.18 Ready-to-paste prompt for A6

```
You are Agent A6 (Fable 5.2, 3D, art, animation, scene and cinematic) on the Forget to Foresee 5-hour sprint (repo SpacexCeo/forget-to-foresee, branch sprint/5h-a6, PRs into sprint/5h; never push to main, never deploy, no secrets).
Read first: /workspace/exports/FTF-5h-Six-Agent-Sprint.md sections 1, 2, 3 and 9; docs/art/iris/audit/README.md; art/anim/ftfanim/skirt.py; art/agents/iris_hero/hero_costume.py; game/src/scenes/town-portal.js (procedural precedent); game/src/cinematic/*.
Mission, part 1: the cinematic prologue. Iris (doctor-linguist from another planet, year 2048, not an AI) returns from a run to her lab, checks her computer, accidentally activates the device, walks to it, says "Oh no..." (A4 plays the voice; you fire the cue at 24.3 s), is pulled into a time vortex and tunnel, whiteout, then the wake-up shot in town with a ring of townsfolk. Follow the shot table 9.4 second by second, the cue API 9.5 (playLabPrologue, playWakeUp, focusOn, releaseCamera, abort snaps to the end in 1.2 s), the lab layout 9.7, the budgets (60k triangles, 25 draw calls), reduced-motion and phone variants. Build the lab procedurally; synthesise audio cues; create tools/capture/shots/prologue.json and wakeup.json for deterministic capture.
Mission, part 2: the Iris skirt and leg clipping fix exactly as 9.11 (investigate the rig first; reweight leg influence to 30-40%; skirt bone stiffness/damping, colliders and a 20-25 degree clamp; hem lift at most 15-20 cm; reduce stride and knee lift only where needed; hide covered leg mesh; check walk/run/idle/turn/attack/cast/dash/stairs and the new prologue poses; do NOT change face, hair, materials, textures or silhouette; before/after sheets and a penetration report; check_clipping.py with a negative test).
English only. Work in 30-minute blocks per 9.14, rebase on sprint/5h each block, PRs at 1:30, 3:00, 4:30, final 5:00. Requests go under "## A6" in docs/sprint/BOARD.md. Finish with docs/sprint/HANDOFF-A6.md including the final hem-cap constant for the owner's approval. If late, use the minimum polished line.
```

---

## 10. Integration: merge order, cross-agent contracts, conflicts, risks, tests, owner-only steps

### 10.1 Merge order (A5 merges into `sprint/5h` after `scripts/verify-sprint.sh` is green on the PR)

| Wave | Order | Why |
|---|---|---|
| Wave 0 (minute 20) | A5 seam stubs | everyone codes against the stubs |
| Wave 1 (T+1:30) | **A5 → A3 → A2 → A1 → A6 → A4** | A3 publishes `silkView()` and the mock relayer that A1 and A2 render; A2 owns keybinds and the tray that A1 and A3 hook into; A1 consumes both; A6 only adds new folders; A4 integrates last because it calls A6, A1 and A2 |
| Wave 2 (T+3:00) | A5 → A3 → A2 → A1 → A6 → A4 | same |
| Wave 3 (T+4:30) | A5 → A3 → A2 → A1 → A4 → A6 | A6 last: its assets are the heaviest and its prologue is already callable through the stub |
| Final (T+5:00) | all | flags are on since 4:00; the last merges are fixes only |

If a PR is red, A5 does not fix it: it writes the failure under the owner's heading on `BOARD.md`, merges the next green PR, and returns to the red one when it is fixed.

### 10.2 Cross-agent contracts (who gives what to whom, and when)

| Provider | Consumer | What | Due |
|---|---|---|---|
| A5 | all | seam stubs with exact signatures (3.2), flags, locale seams | T+0:20 |
| A5 | all | real `bus`, `markers`, `tooltip`, `first-seen`, `docs/sprint/CTX.md` | T+0:45 |
| A3 | A1, A2 | `silkView()` signature frozen, `formatSilkC` | T+0:30 |
| A3 | A5 | mock relayer fixture for e2e | T+1:30 |
| A2 | A1, A3 | tray button ids, tracker slot rectangle, keybinding actions (3.5) | T+0:45 |
| A1 | A2 | `setMarkers` payloads for the minimap | T+2:30 |
| A1 | A4 | `quests.accept`, `quests.state`, `npc.talk.*` key contract | T+0:45 |
| A4 | A1 | the text for `npc.talk.*` | T+1:00 |
| A6 | A4 | stub `playLabPrologue`, `playWakeUp`, `focusOn` (resolve after 1 s) | T+0:30 |
| A6 | A4 | real timeline and cues | T+3:00 |
| A4 | A5 | `window.__ftfTest.panels` registry, example client command | T+3:00 |
| A5 | owner | the "I will do myself" list | T+5:00 |

### 10.3 Conflict register (files that more than one agent needs; the rule that prevents the collision)

| File | Who needs it | Rule |
|---|---|---|
| `game/src/boot-world.js` | all | A5 only, one import and one mount call |
| `game/src/main.js` | A5 (retry) | A5 only |
| `game/src/play/mobs.js` | A3 (drop hooks), A5 (bus emit) | A5's emit at minute 30 in its own commit; A3 adds hooks afterwards in separate lines; nobody else |
| `game/src/play/locales/en.js` | everyone | A5 adds imports; each agent writes only its own `en-*.js` file; duplicate keys across files fail a lint rule |
| `game/public/features.json`, `features.js` | all | A5 only; requests on the board |
| `game/src/ui/keybinds.js` | A2 (owner), A1, A3, A4 want keys | A2 only, keys of 3.5 already allocated |
| `game/src/scenes/town-quests.js` | A1 (owner), A3 (silk) | A1 edits; A3 provides `silkView()` and does not touch it |
| `game/src/scenes/player-hud.js` | A2 (owner), A3 (silk format) | A2 imports `formatSilkC` from A3's module |
| `game/src/game/town-economy.js` | A2 (owner), A1 and A3 read | A2 only; others call exported functions; requests on the board |
| `docs/api/openapi.yaml`, `server/src/**` | A4 | A4 only |
| `README.md`, `docs/STATS.md` | A5 | A5 only; other agents write their notes in `docs/sprint/HANDOFF-An.md` |
| `art/**`, `game/public/assets/anim/**` | A6 | A6 only |

### 10.4 Integration test matrix (feature, owner, file, where it runs)

| Feature | Owner | Tests | Runs in |
|---|---|---|---|
| Quest data, rules, tracker, journal, auto-walk, guide, portal copy | A1 | `game/tests/quests/*`, `tools/e2e/sprint/quests.mjs` | verify-sprint steps 1, 6 |
| XP, skills, hotbar, HUD, keybinds, chip | A2 | `game/tests/rpg/*`, `tools/e2e/sprint/rpg.mjs` | steps 1, 6 |
| Silk model, market, loot, chests, games | A3 | `game/tests/silk/*`, `game/tests/market/*`, `relayer/tests/*`, `tools/e2e/sprint/market.mjs`, cargo tests | steps 1, 6 |
| Intro, dialogue, tips, glossary, tournament agent | A4 | `game/tests/npe/*`, `server/tests/tournament-agent.test.mjs`, `tools/e2e/sprint/npe.mjs` | steps 1, 6 |
| Prologue, wake-up, clipping | A6 | `game/tests/prologue/*`, `game/tests/clipping/*`, `tools/e2e/sprint/prologue.mjs` | steps 1, 6, 7 |
| Seam, flags, retry, budgets, README, first ten minutes | A5 | `game/tests/sprint/*`, `tools/e2e/sprint/first-ten.mjs`, `chunk-retry.mjs`, `flags-*.mjs` | steps 1 to 8 |
| Clarity rules R1 to R12 | all | `scripts/lint-sprint.mjs` and `first-ten.mjs` | steps 2, 6 |
| Usability (five humans) | owner and A5 kit | `docs/sprint/usability-kit.md` | hour 4:30, manual |

### 10.5 Risk register

| Risk | Likelihood | Effect | Mitigation and fallback |
|---|---|---|---|
| The chest batch gas hypothesis is wrong | medium | Open 5 / all still fails | A3's investigation in the first 30 minutes reads the real answer; fall back to splitting to single openings (F3) and shipping the plain error text (F1) so even a failure is understandable |
| Contract change (`trade_for`, `coordinator_transfer`) cannot be tested (no `cargo`) | medium | no on-chain trade today | Path B demo settlement with the visible **Demo** chip; contract code ships untested and is flagged on the board |
| WebGL not available on the box | high | A6 cannot see the scene, A5 cannot capture clips | A6 builds against the logic tests, the numeric budgets and the deterministic timeline; I (owner) review on my GPU machine at 3:00 and 4:30; A5 says plainly that no clips were produced |
| A6 prologue late | medium | intro without cinematic | A4's title-card fallback, flag `labPrologue` off, the intro still explains the premise in text |
| Voice synthesis tools unavailable | low | no "Oh no..." file | `speechSynthesis` fallback and subtitle; I can record the real line myself and drop it in with the same filename |
| Merge conflicts | medium | lost time | strict ownership (3.8), seam files only by A5, rebase every block |
| Silk numbers still differ somewhere | medium | the C2 bug survives | one function, a grep lint, an e2e that compares five surfaces (E-silk-1) |
| Bundle too large | low | slow load | lazy modules, budget script fails the PR |
| Usability test finds confusion late | high | rework | the 4:30 fix wave exists for exactly this; the confusion log goes to the "Later" list if time runs out |
| Gambling framing questioned | low | reputational | play-money only, no on-chain effect, disclaimers, limits, odds shown (6.8); I can switch `playGames` off in `features.json` in seconds |

### 10.6 Owner-only steps (**I will do myself**; agents list them in their hand-offs, never do them)

1. Review `sprint/5h`, merge to `main`, tag, deploy the Pages site.
2. Deploy the updated `ftf-town` and `items.ftf-town` contracts to testnet with my deploy key, then flip the relayer env `P2P_SETTLEMENT=chain`.
3. Redeploy the relayer with the new chest constants (`BATCH_ACTION_GAS`, `BATCH_MAX`) and the new routes; check `/api/health`.
4. Top up the demo guest account with `credit_silk` from the coordinator key (8.5) before recording.
5. Confirm the Season 1 end date used in the "What waits for you" card.
6. Approve the Iris hem-cap constant from the contact sheet; replace the placeholder voice with a real recording if I want.
7. Run the five-person usability sessions (or ask five friends) with the kit.
8. Record or approve the demo video, choose the music track, post on X and fill the submission form.
9. Anything on mainnet (the whitelist pass and its keys) stays exactly as it is in the master plan: nothing in this sprint touches it.

### 10.7 Definition of done at T+5:00 (A5 reports each line as pass or fail)

- [ ] `scripts/verify-sprint.sh` green (step 7 may say "not run" only with a written reason)
- [ ] Flags on in `features.json`; flags-off e2e green
- [ ] First-ten-minutes e2e green including the silk equality step and time-to-first-quest under 60 s
- [ ] The four screenshot bugs closed (C1 to C4), each with its test named in the PR
- [ ] Clarity lint green (no jargon, no truncation, no wool, no literal 10,000, scope badges)
- [ ] README, judge page, STATS accurate
- [ ] Video package complete (11), or the exact missing parts listed
- [ ] The "I will do myself" list delivered to me

---

## 11. The demo video (owner: A5 for the package; I record, approve and post)

### 11.1 The length rule I checked

**The hackathon sets no video length limit.** I read the live rules file `https://nearhackathon.com/HACKATHON.md` on 13 Nov 2026 at about 02:10 Kyiv time and searched it for length, seconds, minutes, duration and maximum: nothing sets one. The rules require a public post on X with "video or screenshots" attached (Q-012 says screenshots are not enough when judges cannot open the demo, so I want a video). My own target is therefore **2 to 3 minutes**: a **master cut of 2:42** for the repo, README and a video host, and an **X cut of 2:04** (the limit for a normal X account is about 2:20; **[VERIFY at posting time]**, that limit is X's, not the hackathon's). The two cuts below are built from the same shots.

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

### 11.4 Voice-over script, word by word, with timestamps

Voice: one speaker, calm and warm, about 150 words per minute (2.0 to 2.7 words per second in the table); read each line exactly; leave the gaps for the in-game "Oh no..." voice and the effects. Timestamps are from the start of the video. The number "two hundred" is spoken (the price comes from config on the recording day; if the fee changes, re-record those lines).

**Master cut (2:42; total 307 words; fastest line 2.73 words per second):**

| Line | Shot | Start | End | Words | Words per second | Text (read exactly, word by word) |
|---|---|---|---|---|---|---|
| M1 | V1 | 0:00.8 | 0:05.2 | 11 | 2.50 | Meet Iris, a doctor of languages from the year twenty forty-eight. |
| M2 | V1 | 0:08.4 | 0:11.6 | 8 | 2.50 | One wrong button, and the world falls away. |
| M3 | V2 | 0:12.2 | 0:18.0 | 15 | 2.59 | She wakes in a hill town. The elders need her to read the Guests' gift. |
| M4 | V2 | 0:18.4 | 0:23.6 | 14 | 2.69 | To go home, the Gate-Loom wants two hundred silk. So she sets to work. |
| M5 | V3 | 0:24.3 | 0:30.1 | 15 | 2.59 | Her journal lists every quest like the best RPGs: progress, who asked, and the reward. |
| M6 | V3 | 0:30.6 | 0:37.6 | 18 | 2.57 | Click a quest and Iris runs to the person who gave it. Touch a key, and she stops. |
| M7 | V4 | 0:38.4 | 0:45.0 | 18 | 2.73 | Stone spiders block the road. Nine skills on the bar, cooldowns you can read, damage you can see. |
| M8 | V4 | 0:46.0 | 0:52.8 | 11 | 1.62 | Every level earns points. Choose a path: Linguist, Scholar, or Warden. |
| M9 | V5 | 0:56.4 | 1:03.4 | 18 | 2.57 | Monsters drop chests. Rarer ones glow brighter. Each opening is drawn on NEAR, where anyone can check it. |
| M10 | V5 | 1:03.8 | 1:09.8 | 16 | 2.67 | Odds are shown. Every item says if it is on NEAR or only on your device. |
| M11 | V6 | 1:10.4 | 1:16.4 | 14 | 2.33 | Feeling lucky? The wheel and dice use play money only, with the odds shown. |
| M12 | V6 | 1:17.0 | 1:21.4 | 9 | 2.05 | No real value, no cash out, just for fun. |
| M13 | V7 | 1:22.4 | 1:29.4 | 17 | 2.43 | Players trade resources for silk. One lists spider thread, another buys it. A small fee is burned. |
| M14 | V7 | 1:30.0 | 1:36.4 | 16 | 2.50 | Both balances update, and the trade is recorded on NEAR with a link anyone can open. |
| M15 | V8 | 1:42.4 | 1:49.4 | 19 | 2.71 | AI agents can play too. This one enters the tournament through the public API, with no human at all. |
| M16 | V8 | 1:50.0 | 1:55.4 | 10 | 1.85 | Agents wear a badge, so everyone knows who is who. |
| M17 | V9 | 1:56.4 | 2:03.6 | 16 | 2.22 | Two hundred silk. Iris reaches the Gate-Loom and pays, once, on chain. The silk is burned. |
| M18 | V9 | 2:04.2 | 2:11.0 | 15 | 2.21 | Here is the real transaction on the NEAR testnet explorer. You can verify every step. |
| M19 | V9 | 2:12.0 | 2:19.4 | 16 | 2.16 | But the Gate-Loom throws her onward. Her journey is not over. A free whitelist spot waits. |
| M20 | V10 | 2:20.4 | 2:27.4 | 12 | 1.71 | The Shell wall shows who leads: players and agents side by side. |
| M21 | V10 | 2:27.8 | 2:31.6 | 4 | 1.05 | Where will you rank? |
| M22 | V11 | 2:32.4 | 2:41.0 | 15 | 1.74 | Forget to Foresee. Built at the NEAR Hackathon. Free to play on testnet. Link below. |

**Variant lines.** M14d (use when trade settles in the demo store, same slot 1:30.0 to 1:36.4): "Both balances update. Settlement is a demo today; the contract upgrade makes it on chain." M19b (when the pass is not live, slot 2:12.0 to 2:19.4): "But the Gate-Loom has other plans. To be continued."

**X cut (2:04; total 196 words; fastest line 2.68 words per second):**

| Line | Shot | Start | End | Words | Words per second | Text (read exactly, word by word) |
|---|---|---|---|---|---|---|
| X1 | V1 | 0:00.5 | 0:04.5 | 8 | 2.00 | Meet Iris, a doctor of languages from 2048. |
| X2 | V1 | 0:07.0 | 0:09.8 | 3 | 1.07 | One wrong button... |
| X3 | V2 | 0:10.2 | 0:15.8 | 15 | 2.68 | She wakes in a hill town. The elders need her to read the Guests' gift. |
| X4 | V2 | 0:16.2 | 0:21.8 | 14 | 2.50 | To go home, the Gate-Loom wants two hundred silk. So she gets to work. |
| X5 | V3 | 0:22.3 | 0:28.3 | 13 | 2.17 | A journal lists every quest. Click one, and Iris runs to the giver. |
| X6 | V4 | 0:32.5 | 0:39.5 | 15 | 2.14 | Spiders, skills, cooldowns, damage numbers. Level up and pick a path: Linguist, Scholar, or Warden. |
| X7 | V5 | 0:46.4 | 0:53.4 | 14 | 2.00 | Monsters drop chests. Each opening is drawn on NEAR, where anyone can check it. |
| X8 | V6 | 0:56.4 | 1:01.6 | 9 | 1.73 | Wheel and dice use play money only. Odds shown. |
| X9 | V7 | 1:02.4 | 1:09.4 | 17 | 2.43 | Players trade resources for silk. One lists spider thread, another buys it. A small fee is burned. |
| X10 | V7 | 1:09.8 | 1:17.0 | 16 | 2.22 | Both balances update, and the trade is recorded on NEAR with a link anyone can open. |
| X11 | V8 | 1:18.4 | 1:25.4 | 16 | 2.29 | AI agents can play too. This one enters the tournament through the API, no human needed. |
| X12 | V9 | 1:28.4 | 1:35.4 | 14 | 2.00 | Two hundred silk. Iris pays the Gate-Loom once, on chain. The silk is burned. |
| X13 | V9 | 1:35.9 | 1:42.9 | 14 | 2.00 | Here is the real transaction on the NEAR testnet explorer. Anyone can verify it. |
| X14 | V9 | 1:44.0 | 1:47.8 | 3 | 0.79 | To be continued. |
| X15 | V10 | 1:48.4 | 1:55.4 | 12 | 1.71 | The Shell wall shows who leads: players and agents side by side. |
| X16 | V11 | 1:56.4 | 2:03.4 | 13 | 1.86 | Forget to Foresee. Built at the NEAR Hackathon. Free to play on testnet. |

X-cut variant for the demo settlement: X10d "Both balances update. Settlement is a demo today; the upgrade makes it on chain." X-cut line X14 becomes "To be continued." in the not-live case (it already is).

### 11.5 Captions (A5 writes `captions.srt` and `captions-x.srt` from the tables above; burned-in for the X cut because X autoplays muted)

Rules: at most two lines of at most 38 characters, 20 to 24 px at 1080p, white text on a 70% black box, bottom centre, the same timestamps as the voice lines; the in-game "Oh no..." subtitle is part of the footage. The generated SRT for the master cut starts as follows (A5 produces the full file with the same rule):

```
1
00:00:00,800 --> 00:00:05,200
Meet Iris, a doctor of languages from
the year twenty forty-eight.

2
00:00:08,400 --> 00:00:11,600
One wrong button, and the world falls
away.

3
00:00:12,200 --> 00:00:18,000
She wakes in a hill town. The elders
need her to read the Guests' gift.

4
00:00:18,400 --> 00:00:23,600
To go home, the Gate-Loom wants two
hundred silk. So she sets to work.
```

### 11.6 Recording instructions (for me on my GPU machine; A5 writes them as `record-runbook.md`)

**Before recording**
1. Use a clean Chrome profile at 100% zoom, a 1920 × 1080 display at 100% scaling, bookmarks bar hidden, notifications off (Focus assist on), the browser in **F11 fullscreen**, the tab title and address bar not visible. Quit chat apps. Plug in the power. Close every other tab except the NearBlocks tab.
2. Prepare the demo guest account (8.5), reload, and confirm the chip shows 200 or more silk on chain.
3. Settings: graphics high, reduced motion **off**, subtitles on, UI scale 100%, master volume 70%, effects 80%, music 40%.
4. Do one dry run of every shot; write down the take numbers in `docs/submission/video/takes.md`.

**OBS Studio settings**
- Canvas and output resolution **1920 × 1080**, **60 fps** (30 fps is acceptable for the X cut if the file is too large).
- Source: **Window Capture** of the browser (or Display Capture), cursor captured; **Game Capture** is not needed.
- Video encoder: NVENC H.264 (or x264 "veryfast" on CPU), **CQP 18** (or CBR 20,000 Kbps), keyframe interval 2 s, profile High, B-frames 2.
- Recording format **MKV** (remux to MP4 after, so a crash loses nothing). Audio 48 kHz, 320 kbps.
- Audio tracks: track 1 game and system audio (desktop capture), track 2 microphone (the voice-over recorded separately later is also fine). Meter the game at about −18 dBFS peaks so the voice sits above it.

**Cursor**
- Show the cursor, enlarge it to 150% (OS setting) and use OBS "cursor highlight" or a click-ripple tool; move it slowly in straight lines; pause 0.5 s on a button before clicking; never wiggle. Hide the cursor during pure gameplay moments (WASD) in the edit if it distracts.

**Voice-over**
- Record in a quiet room with a USB microphone, 48 kHz, 24-bit, peaks around −12 dBFS, pop filter, mouth 10 cm from the capsule; read the table in 11.4 line by line, two takes per line; normalise to **−16 LUFS integrated, true peak −1 dBTP**.
- If I use a text-to-speech draft first (A5 provides `vo-draft.wav` when a TTS tool exists on the box), the final should still be my voice or a clearly labelled synthetic voice (state it in the description).

**Music**
- Choose a track whose licence allows use in a public video: **CC0**, my own, or a licence that permits it (for example the Pixabay Content License, YouTube Audio Library, or a Creative Commons track with the required credit). **Avoid any copyrighted commercial music.** Record the title, author, URL, licence and the exact credit line in `docs/submission/video/music.md`, and put the credit in the video description.
- Level −26 LUFS under the voice (duck 8 dB while I speak), fade out over the last 3 seconds.

**Editing and export**
- Cuts on action, no transitions longer than 0.3 s, no zooms beyond 120%; lower-thirds in `--font-title` 28 px gold on a dark bar; hold each on-chain page for at least 3 seconds so a viewer can read the hash.
- Export **H.264 High, yuv420p, 1920 × 1080, 60 fps (or 30 fps for X), 16 to 20 Mbps, AAC 192 kbps stereo**, `faststart`. Check the X upload size limit at posting time **[VERIFY]**. Produce: `ftf-demo-master-2m42.mp4`, `ftf-demo-x-2m04.mp4` (burned-in captions), `captions.srt`, a 1280 × 720 thumbnail (Iris at the Gate-Loom with the title).
- Final checks: every shot of 11.3 visible, every pass check met, no secret or personal data on screen, no real-money wording, the "Demo data" chip only where a seed is intentionally on, the voice and the subtitle "Oh no..." in sync, loudness −16 LUFS.

**What I will do myself:** record, choose the music, approve the cut, upload, and post on X with the required text (built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`); A5 only drafts the post and the description.

---

## 12. Notes on evidence and what I could not confirm

- **Verified [V]:** the live `HACKATHON.md` has no video length limit (13 Nov 2026, about 02:10 Kyiv); the code facts quoted in sections 1.8, 4.3, 5.3, 6.2 and 6.6 were read from `origin/main` 5b4ad54c; the live relayer answers on `https://159-195-130-113.sslip.io/api/health` with chests configured and zero chest transactions since its start, and its CORS preflight from `https://spacexceo.github.io` succeeds; `chests.ftf-coordinator.testnet` `season_info` shows the committed root and a fixed seed.
- **Not confirmed:** the four screenshots from the live game were not readable from this work area (the copies named in the request were not found on the box), so the four bugs are described from the owner's captions plus the code that produces those exact strings (`story.goal.silk`, `story.portal.wants`, `chest.err.bad`, the quest pill style, the wheel and inventory labels); the code anchors the quest pill at the top centre (`left:50%`) while I saw it at the top left, probably another viewport or layout, so A1's fix and test cover every width; the **root cause of the chest failure is a ranked hypothesis**, not a proven fact, until A3 runs the live test with a test guest in the first 30 minutes; whether the box can render WebGL (so whether A5 and A6 can produce clips and sheets); the exact names of some helpers (`[VERIFY]` marks); the owner's skirt instruction was relayed as a list of numbers and steps, so section 9.11 states those steps in full and fixes the numbers inside the bands I was given (leg influence 30 to 40%, clamp 20 to 25°, hem lift at most 15 to 20 cm, stiffness and damping bands are my starting values to be tuned and recorded).
- **Sources:** `FTF-Owner-Master-Plan.md` (sections 1.3, 3, 7, 11, 12, 14), `FTF-City-Economy.md`, `FTF-Story-Quests-Leaderboard-TZ.md`, `FTF-a reference game-Teardown-TZ.md`, `FTF-Jury-Review-2026-11-13.md`, `FTF-Submission-Checklist.md`, the repository files named in each section, `docs/chests.md`, `docs/art/iris/audit/README.md`, `relayer/lib/*`, `contracts/town`, `contracts/town-items`.
