# Forget to Foresee: Story, Quests, Leaderboard, Endgame Pass. Design and implementation spec for Opus agents

| | |
|---|---|
| **Repo** | `SpacexCeo/forget-to-foresee`, inspected read-only at `origin/main` = `4be67a75ab57e09a863ac26912da47a665ac132b` (12 Nov 2026 14:37 UTC = 16:37 Kyiv, fresh `git fetch` at 16:44 Kyiv). Local sparse worktree for reading: `/workspace/ftf-main`. Nothing was pushed, deployed, signed or posted. |
| **Written** | Thu 12 Nov 2026, 16:44 to 17:30 Kyiv |
| **Clock** | **Feature freeze Fri 13 Nov 16:00 Kyiv**, hard freeze 20:00, **deadline Sun 15 Nov 01:59 Kyiv** (= 14 Nov 23:59 UTC). About 23 h to the feature freeze from the time of writing. |
| **Siblings** | `/workspace/exports/FTF-Competitive-TZ.md` (the 11 competitive moves; section numbers below refer to it as "CTZ §n"), `docs/plans/npc-economy-spec.md` in the repo (the owner's NPC-economy spec, adopted 12 Nov), `/workspace/exports/FTF-Max-Sprint-Plan.md`. `/workspace/exports/FTF-City-Economy.md` ("CE": **silk is the town's one currency**; read in full for revision 4 of this file, alignment in §2.3). |
| **Owner source** | owner message `pt294u` (story, portal, guide, citizen quests, leaderboard formed by "the Shell", distribution after Season 3), the follow-up (endgame cliffhanger and mainnet whitelist NFT) and the **final owner decisions of 12 Nov (owner message relayed by the parent)** (revision 2, below). |
| **Revision** | **Rev 4, Thu 12 Nov 2026 (late evening) Kyiv:** the owner decided that **the portal is paid on chain, in town silk, through `ftf-town` (`pay_gate`), with no separate story book**, and that the price is **lowered**: recommended **200 silk** (CE §2.13.4), every reward scaled by P/10,000. The rev-3 "firewall" and "Expedition book" are withdrawn. Rev 3 (evening): *one currency = silk* applied everywhere. Rev 2 (17:15 Kyiv) fixed "spider" for "skitter", a transferable pass and a linear Season 3; rev 1 (a second currency as the portal fee, soulbound pass, proportional payout recommendation) is superseded. Where this file and the older text disagree, this file wins. |

**Owner decisions applied in revisions 2 and 3 (final; the markers they resolved are removed):**
1. **One currency: silk, and the portal is paid on chain in it.** The Gate costs **P silk, recommended 200** (the owner first said 10,000; CE §2.13.1 shows why that is not an honest on-chain number; an optional display multiplier is described in §3.1 and not recommended). It is paid by the contract call `pay_gate` on `ftf-town` and **burned**; story rewards are credited on chain by the relayer after a replay-verified log (§3). The tournament entry and prizes, pledges to the four town works, deed NFTs, leaderboard points and the Season 3 distribution are all in silk; there is no second token, no separate book and no firewall. **The cliffhanger and the whitelist eligibility are exactly one thing: `gate_paid_of(account)` on `ftf-town`, read by the relayer** (§3, §5, §11).
2. **"Skitter" is displayed as "spider"** (names, quest text, manifest labels). Technical ids and file names are unchanged; an alias map is added (item R1, §6.8).
3. **The whitelist pass NFT is transferable** (§11.2 rewritten; approvals off, no royalties; threat model §11.6; utility rights follow the current holder).
4. **Season 3 treasury distribution = linear by rank (Option B)** (§9 rewritten; sybil-dilution risk and mitigations documented; still roadmap, testnet, legal review first).

**How to read this.** Everything an Opus agent may do is marked **SAFE** (code, tests, docs; no keys, no network writes), **CONDITIONAL** (needs an earlier item or a verification first) or **OWNER-GATED** (signing, funding, deploying, mainnet, posting, repository settings, money). Agents never run an OWNER-GATED step; they write the exact command, cost and risk for the owner. Unknowns are **[VERIFY]**; places where the owner's words are still ambiguous are **[OWNER CONFIRM]** (only the Shell reading and the pass utility list remain). Nothing in this file invents a transaction count, price, balance or date: those come from the chain or the repo at the time of use.

---

## 0. Priority order against the freeze

The sprint already has a P0 headline (about 20,000 real testnet transactions in a day; CTZ §0, `docs/plans/npc-economy-spec.md`). **This workstream must not slow it down.** Everything here is behind feature flags that default OFF for the judge link (`?demo=judge`, which is also the default link: no parameters = the judge path, `docs/town.md`). A judge sees this workstream only through `?story=1` (and, after the owner's decision at the freeze, possibly as the default for non-judge links). That also means the work is worth most as **evidence in the pitch and video**, so the gate at the freeze is "does the golden path run end to end, flag on".

| Pri | Item (ID) | What | Label | Est (agent-hours) |
|---|---|---|---|---|
| **P0** | **Q0** | Pure story state machine + silk ledger + config (the shared rules module) | SAFE | 4 |
| **P0** | **Q1** | The three citizen quests + the starter guide as data and pure rules (kill 10 spiders, bring a spare part, kill the boss) | SAFE | 5 |
| **P0** | **Q2** | Salvage drops (the "spare part" source, with a guarantee) | SAFE | 2 |
| **P0** | **P1** | The visible portal object where Iris arrived, with the gate interaction | SAFE | 4 |
| **P0** | **P2** | Starter guide: the elder's tutorial, objective line, waypoints | SAFE | 5 |
| **P0** | **P3** | Citizen quest dialogue wiring in the town (talk panel reuse), English lines in the five locale files | SAFE | 6 |
| **P0** | **R1** | Display rename skitter → spider with an alias map (ids and files unchanged) | SAFE | 1 |
| **P0** | **E1** | `contracts/whitelist-pass` (transferable NEP-171, caps and one mint per wallet on chain, no approvals, no royalties) | SAFE to write; deploy OWNER-GATED | 6 |
| **P0** | **E2** | Relayer claim endpoint (eligibility replay, idempotency, queue, kill switch), dry-run by default | SAFE to write; mainnet send OWNER-GATED | 8 |
| **P0** | **E3** | Endgame sequence + cliffhanger cut + wallet modal + states, testnet mode by default | SAFE | 6 |
| **P0** | **P5** | The twist: pay the Gate (200 silk, on chain, burned) at the portal, it sends her onward (the archipelago), not home | SAFE | 3 |
| P1 | **Q3** | Quest actions through the room command bus and the agent API (bots can do them) | CONDITIONAL on Q0, Q1 | 6 |
| P1 | **Q4** | Server-checked kill tickets (plausibility), shared by E2 | CONDITIONAL on Q0 | 4 |
| P1 | **K1, K2** | Leaderboard scoring library and the in-world board | SAFE | 8 |
| P1 | **K3, K4** | Verifiable snapshot (Merkle root, optional on-chain record) and anti-wash tests | CONDITIONAL (arena, CTZ Move 2) | 6 |
| P1 | **D1, D2, D3** | Season 3 roadmap (linear by rank), legal and gambling note, pitch changes (CTZ Moves 1, 9, 11) | SAFE | 5 |
| P1 | **E4** | Owner runbook: mainnet rehearsal on testnet, funding, key custody, deploy, post-deploy checks | docs SAFE; execution OWNER-GATED | 3 |
| P2 | **P4** | The prologue "laboratory" as a short scripted scene (text cards + VFX in the chapter-film player); a modelled lab level is P2-after-deadline | SAFE | 5 |
| P2 | **K5** | Hourly on-chain leaderboard snapshot from the arena (the arena must exist first) | OWNER-GATED run | 3 |
| P2 | Eight-leg model for the spider (art; the model has six legs today) | optional, after the deadline | SAFE | 4 |

**Cut line.** If at Thu 22:00 Kyiv the P0 items are not all in review, cut in this order: P4, K3 to K5, Q3, P2 extras (keep the elder's talk and the objective line), then ship P0 behind the flag. Never cut the flag, the honest labels or the tests. Mainnet (E) is the most schedule-sensitive part because it needs the owner (§14): if the owner has not funded and deployed by Fri 20:00 Kyiv, the build ships in testnet-pass mode, with copy that says so (§11.7), and the mainnet pass moves to "built, dormant".

---

## 1. What exists in the code today (read-only inspection of `origin/main` `4be67a75`)

### 1.1 Summary table

| Topic | Exists? | Where (real paths) | Notes |
|---|---|---|---|
| **Combat** | **Yes, client only, local.** | `game/src/play/mobs.js` (709 lines: `MobBrain` pure state machine + `createMobs` view), `game/src/play/kill-xp.js`, `game/src/scenes/town-casting.js`, `game/src/scenes/town-casting-fx.js`, `game/src/render/mob-fx.js`, Iris combat clips from `art/anim/iris_combat.py`, `art/anim/iris_actions.py`. Tests: `game/tests/client/mobs.test.mjs`, `mob-fx.test.mjs`. Docs: `docs/decisions.md` rows 12.11 "Monsters outside the walls", "Hold to super strike", "Combat feel pass". | **Branch/PRs:** built on `claude/intelligent-thompson-zgpep3` (the "Elise worker") and merged to `main` through PRs #85 to #115 on 12 Nov (combat feel #107, HUD #101 to #105). `main` already contains it. Iris outside the walls: strike combo (F/3: 14, 14, 26 damage), hold-to-super (34 to 80, cone), dash (Space/4, 0.35 s i-frames), Frost Lance 40 and Snare 25 casts, 100 HP, regen after 4 s, soft lock, telegraphs of at least 0.4 s. **Not part of the engine:** `engine.js`, the room and the agent API know nothing about monsters (`docs/town.md`: "No rule changes"). |
| **Enemies** | Yes, four types, six packs. | `MOB_TYPES` and `PACKS` in `game/src/play/mobs.js`: **skitter** (swarm, hp 55, damage 3, 0.42 m, **six** clawed legs per `art/mobs/build_mobs.py`), **hulker** (brute, hp 380, damage 18), **veilbell** (ranged caster, hp 120, damage 10), **crownrift** (elite with four stilt legs, hp 900, damage 26, respawn 120 s). Packs (town-local metres x, z): skitters at (-12, 52), (-30, 66), (-16, 87); veilbells (36, 66); hulker (16, 79); **crownrift at (12, 102) on the lookout**. Models `game/public/assets/models/mob_*.glb`. | **Owner decision: the skitter is shown as a "spider"** (display name only: ids, `mob_skitter*.glb`, audio ids and `MOB_TYPES.skitter` are unchanged; the model has six legs, an eight-leg model is optional P2 art; alias map in §6.8). **A "boss" exists in practice:** the `crownrift` (`elite: true`), plus the hulker as a mini-boss. Both are flagged in code (`elite`, `heavy`). Event `ftf:mob-killed {type, pos, elite}` is the only outward signal. Mobs are off with `?mobs=0` (then 4 moss critters from `scenes/town-monsters.js` roam instead). The only player-visible "skitter" text today is the guard's bark `bark.role.guard` (en, it), shown as "spider" after R1. |
| **XP and levels** | Yes, local, cosmetic. | `game/src/game/town-economy.js` (`MOB_XP`: skitter 20, veilbell 40, hulker 90, crownrift 250; `FIRST_KILL_XP` 40; `levelOf`: level n needs 50·n·(n+1) XP; `TITLES` only), `game/src/play/kill-xp.js`, `game/src/scenes/player-hud.js`. | Levels give **titles only**, no combat stats. So quest gating by level would not make a fight easier: gate by quest chain instead (§5). Ledger key `ftf.town.v1` in `localStorage`. |
| **Inventory / items** | Yes, local. | `game/src/game/inventory.js` (key `ftf.inventory.v1`, `add(id, n, source)`; comment says source may be `"quest"`), items manifest `game/public/assets/items/manifest.json` (20 entries: 8 shards, **10 parts** `part_gear`, `part_spring_coil`, `part_chain_link`, `part_rivet_plate` (common), `part_spindle`, `part_crank`, `part_valve` (uncommon), `part_gauge`, `part_brass_lens` (rare), `part_glyph_cogring` (legendary), 2 props), art in `art/items/`. UI: `game/src/play/profile.js`, `profile-view.js`. | Parts are today obtained from the **wheel** (`game/src/game/wheel.js`: `part_common` 18 %, `part_uncommon` 10 %, `part_rare` 3.5 %, `part_legendary` 0.5 %, one free spin per day plus spins earned) and from **loot chests** (`docs/chests.md`: deck of 10,000, "silk, XP, shards and mechanical parts"). No deterministic, fast source exists: Q2 adds one. |
| **Loot chests** | Yes, local bag + on-chain deck. | `game/src/game/chests.js` (drop 36 %, first kill always), `game/src/scenes/town-monsters.js` (`drop`, pickup), `game/src/net/chest-client.js`, `contracts/loot-chest`, `relayer/api/chest/*`, `relayer/lib/chest*.js`, `docs/chests.md`. | Opening is TEE-seeded and verifiable via the relayer; chests are **sealed** until opened by the service. |
| **NPC / citizen dialogue** | Yes, one scripted quest + a hire card. | `game/src/scenes/town-quest.js` (130 lines: `QUEST_STEPS`, `QUEST_NPC`, `TALKS` trees of at most 8 short lines, `createTownQuest`, `talkTarget`; played once per device, flag `ftf.townquest.v1`), the talk panel in `game/src/scenes/town-flow.js` (~600 lines; one panel `ftf-quest-talk`, choices as buttons, `openKey`/pills), locale keys `quest.*` in `game/src/play/locales/{en,uk,ru,it,zh}.js` (e.g. `quest.inn.ask`), hire talks via `game/src/game/town-economy.js`. 13 townsfolk with routines: `game/src/play/townsfolk-plan.js` (`TOWNSFOLK`: guard, shardkeeper, scribe, innkeeper, baker, shrinekeeper, elder, musician, sweeper, lamplighter, courier, child_a, child_b), `townsfolk.js`, docs `docs/townsfolk.md`. Owner 12 Nov: "I like the townsfolk we have now": **do not restyle them**. | The existing teaching quest (innkeeper → baker → shrinekeeper, a 5-silk "purse") has **no rewards, no persistence of progress per quest, one linear chain**. New quests need their own module so this one is untouched (§6). Names of NPCs are not shown in the lore as characters; this spec gives roles, not names. |
| **Onboarding / tutorial** | Yes, but for the season loop, not the town or combat. | `game/src/ui/onboarding.js` (guest/testnet entry, 5 beats, `docs/tutorial.md`), `game/src/ui/flow.js`, `game/src/play/objectives.js` (single goal on screen; `ONBOARDING = ['anchor','end_tick','verified','forget','fragment','talk','ask']`), `game/src/play/guide.js` (the Read, Choose, See guide of the Shell hub), `game/src/ui/premise.js` (title lower-third once per browser, then behind a "?" HUD button), `game/src/play/hints.js`, town objective line in `town-flow.js` ("Walk to the Tournament altar"). | **No combat or controls tutorial exists** (F, Space, hold, lock are only in the Controls panel and tips). The judge link skips lobby and quest. |
| **Portal / teleport object** | **No visible portal.** | `player.teleport(...)` is only a function (`game/src/boot-world.js`, `scenes/town-shops.js`, `play/game.js`); the **altar** (`TOWN_DATA.altar`: position (0, 4.5, -11), radius 5; `scenes/town.js`, `town-flow.js`) is the registration object that "carries Iris up to the archipelago" with a cover and flare (`docs/town.md` §Flow 5). Spawn: `TOWN_DATA.spawn` (0, 0, 25), heading π; she starts 4.5 m ahead of it (`TOWN_SPAWN` in `scenes/town-layout.js`, `SPAWN_ADVANCE`). | The portal object is new work (P1). The altar flow is the existing "onward" transition that P5 reuses. |
| **Leaderboard** | **No leaderboard in the product.** | Only: a local weekly tournament **simulation** with results table (`game/src/ui/tournament.js`, `tournament-card.js`), the Judge Echo board of the Foresight Exchange ("You vs Salt, Amber, Frost", local, `game/src/ui/exchange-terminal.js`, `game/src/game/exchange.js`), agent track records on chain (`game/src/game/track-record.js`, `contracts/agent-ledger`). `docs/hackathon-tz.md` plans a local "predict three events" board. | Nothing is global, shared, or tied to a sealed season. K1 to K4 define it. |
| **Silk** | Yes, **four** different things. (1) **Engine silk** `S.silk` (`game/src/game/engine.js`): the sealed season rules, 60 per clan, +3 per tick, honest play about 76 to 95 silk per season, passive about 138 (CE §2.11 citing `docs/math/economy-report.md` §2.1); "never debited by town code". (2) **Town silk**, local: `game/src/game/town-economy.js`, key `ftf.town.v1`, `START_SILK` 100, hundredths, hire prices 10 to 20, wheel prizes, the HUD wallet and the `silk_coin` icon (`scenes/player-hud.js`). (3) Silk as a **chest or wheel prize** (×5, ×10, ×25; a prize that lands in ledger 2, not a ledger). (4) **Town silk on chain**: `ftf-town.testnet` (`contracts/town` on `main`, CE §7.2; built with 43 unit tests, **not deployed**): the same word and unit; since rev 4 **it is the Gate's and the story's ledger** (§3.1); the owner deploys it, or not, by the Fri 14:00 cut line. | **Decision (rev 4): the portal fee (200 silk) is paid on chain from ledger (4) by `pay_gate`; ledger (2) is the local demo fallback and the home of hires, the wheel and XP** (§3.1 gives the reasons and why not engine silk). |
| **Lore: Iris** | Partly. | Chapter films `game/src/play/chapters.js`, `docs/chapters.md` (Arrival, The Language, Trust, The Crisis, The Vote, The ending); town "Tournament altar" premise `docs/town.md`; the Shells' Call "on the night of arrival" (README judge path row 5). **No text in the repo says she is a doctor-linguist from another planet, year 2048** (my earlier grep found none; CTZ Move 7 L1 adds the canon). | Story work here must wait for or merge with CTZ L1 (lore canon): **Iris is a doctor-linguist from another planet, year 2048; the five other clans are scripted, not an LLM.** |
| **Agent API** | Yes, for the season only. | `docs/api/README.md`, `game/src/net/room.js` (the single command processor; e.g. `start_exchange` at line ~396, `place_order` ~407), `game/src/net/catalog.js` (the action catalog, e.g. lines ~194 to 199), `server/src/server.js`, `game/src/net/api.js`. Idempotent commands `{actionId, expectedVersion, type, args}`. | The **Foresight Exchange** is the model to copy: a separate local ledger, its commands in the same bus as the agent API, "the browser and an HTTP agent play by identical rules". |
| **Chain (testnet)** | Yes. | `contracts/{season-commit, memory-shard, agent-ledger, guests, character-nft, token-account, loot-chest, skin-nft, agent-card}`; deployments in `contracts/deployments/`, `docs/near.md`. **`agent-ledger.record_track`** (`contracts/agent-ledger/src/lib.rs` line ~130) takes `npc` (1 to 32 chars of a-z, 0-9, _), `epoch`, `seed`, `policy_version`, `params` (≤ 512), `params_hash`, `snapshot_sha256`, `bar_from < bar_to`, `trades_compact` (1 to 50 tuples of **five integers**, ≤ 1200 chars), `pnl_bp`; it is keyed `(caller, npc, epoch)` so it is naturally idempotent. **`skin-nft`** (112 lines) is a minimal NEP-171 with a cap, a minters list, one token per account (`owners` map) and contract-paid storage (`internal_mint_with_refund(..., None)`). | Used in §7 (quest receipts: no new contract needed) and §11 (the pass contract is a fork of `skin-nft`). Guest accounts hold only 0.05 NEAR (`game/src/net/agent-ledger.js`: 0.01 NEAR deposit per record, 20 Tgas), so a human can afford only a handful of receipts. |
| **Relayer** | Yes. | `relayer/server.js`, `relayer/api/{create-guest,health}.js`, `relayer/api/wheel/claim.js`, `relayer/api/chest/*`, `relayer/lib/{core,wheel,chest,near-tx,...}.js`, tests `relayer/tests/*.test.mjs` (glob). `relayer/lib/wheel.js` already implements a **signed, re-derived claim before a mint** (checks the request is signed by a key of the guest account, re-rolls the seed, caps, then mints a skin). Per-IP token bucket, JSON-lines log, idempotency per key. | Template for E2. `relayer/lib/near-tx.js` is a byte-identical copy of `game/src/net/near-tx.js` (a test enforces it): the same trick is used for the shared rules (§4.4). |
| **"The Shell"** | Yes, several meanings. | The archipelago's Shells (floating structures with signs; `game/src/scenes/shell.js`, `shell-layout.js`, interior `shell_interior.glb`), the "Shell hub" play mode (`game/src/play/hub.js`, `hub-ui.js`). | Owner: "our Shell would form the leaderboard". **[OWNER CONFIRM]** I read this as: **a Shell-shaped monument (an in-world object) shows the leaderboard**, once in the town square and once inside Shell I's interior (the hub). If the owner meant something else (for example the NEAR shell tool or an agent called Shell), K2 changes only where the board is drawn, not the data. |

### 1.2 Things that matter for design

1. **Combat is real but outside the rules.** Kill events are produced by `MobBrain` in the browser from real-time input. Nothing server-side can replay a human's fight. Therefore **anything that pays out (the mainnet pass, a Season 3 distribution) cannot trust raw kill counts**; §3.7 and §9 define trust levels and what counts.
2. **Everything story-like must not touch the engine.** Rule from `docs/town.md` and `town-economy.js`: "never imports or touches `engine.js` or `S.silk`". The new rules module follows the same boundary (the Foresight Exchange is the precedent).
3. **The town is the default link.** A story that starts with a lab and a paid gate must be off for `?demo=judge`.
4. **Mob and player constants live in `play/mobs.js`, which imports three-dependent scenes** (`town-casting-fx.js`). A server or relayer cannot import it without `three`. Q0 extracts the pure numbers into `game/src/game/mob-data.js` and has `mobs.js` re-export them (a tiny edit to a file owned by the combat worker; flagged in the PR).
5. **Test plumbing:** `game/package.json` lists test files explicitly in the `test` script (merge hot spot: append, tell the merge captain); `relayer` and `server` tests use globs for `relayer`, explicit list for `server` (see `docs/plans/npc-economy-spec.md` rule 6). The locale tests (`game/tests/client/play.test.mjs`: `PLAY_MESSAGES` in `game/src/play/locales/{en,uk,ru,it,zh}.js` must have identical keys and every message must format; `town-quest.test.mjs`: quest lines at most 140 characters) mean **every new string key needs all five locales** (English is the source; copy English into the other four as a placeholder only if an item says so, and mark them `[needs translation]` in the PR). Touch variants end in `.touch` (`game/src/ui/touch-copy.js`).
6. **Docs say "scripted", not AI.** Clans, citizens, quest givers: scripted. Never "AI NPC" (CTZ rule 7).


---

## 2. Canon, global rules and alignment

### 2.1 Lore canon for every string in this spec

- **Iris is a doctor-linguist (a researcher) from another planet, year 2048.** Not an "AI clan agent". The other five clans, all citizens, quest givers and monsters are **scripted** (rules and seeds), not an LLM.
- Tone of every line: **quiet, misty, a little mysterious.** Short sentences, concrete nouns, no jokes, no game jargon in the story voice ("quest", "XP", "mob" appear only in UI chrome, never in a character's mouth). English is the source language; keep each line at most 140 characters (existing test) and at most 25 words.
- The game's words: *silk* (the town's one currency and the Gate-Loom's price), *Shell*, *trial*, *anchor*, *the Guests*. Do not use *silk* for the engine's season resource in the same sentence as the town's silk.
- What the story tells the player and what the build actually does must match: town silk is an **in-game testnet balance held in the `ftf-town` contract**, with a server-replayed log behind the credits and the on-chain `gate_paid_of` behind the pass (§11); it is not a token, cannot be bought or sold for NEAR or anything else, and is never shown as money.

### 2.2 Global rules (these extend CTZ §2 and `docs/plans/npc-economy-spec.md` §2; the numbered rules there still apply)

1. **English only** in code, comments, docs, UI source strings, PR text. Other locales: keys must exist and format (tests); the English text is copied as a placeholder where an item says so and listed in the PR.
2. **No push to `main`, no tags, no repo settings, no force-push.** Branches `claude/<item-id>-<slug>`, one PR per item, PRs to the branch the merge captain names (the lean adaptation in `docs/plans/npc-economy-spec.md`: PRs to `main` through the lead; CTZ's `integration/sprint` where the captain uses it). Keep PRs under about 400 changed lines of code.
3. **No signing, no spending, no deploying, no posting, no mainnet execution by agents.** Code that can send a transaction defaults to **dry-run**, refuses to send without `--yes` plus an owner-supplied environment, and **agents never run the send path**. This includes the mainnet pass minter (§11). Test keys are generated in memory; no key, seed phrase or token in repo, logs, tests, screenshots or PR text; no relayer or minter key in CI.
4. **Feature flags default OFF.** `?story=1` turns the Expedition on; without it, `?demo=judge`, the default link and every existing test behave exactly as before. Add a test that proves flag-off behaviour is unchanged (the existing teaching quest, the altar flow, the judge path, `?mobs=0`).
5. **The story layer never imports or changes `engine.js`, `S.silk`, season Merkle leaves or the room's season state.** Same boundary as `town-economy.js`.
6. **One rules module.** Silk, quests, scoring and eligibility are computed by the same pure code in the browser, the Node runner (arena), the relayer and the verifier tool (byte-identical copy test, §4.4).
7. **Every claim has a `Proof:`.** README vocabulary only: "Real on testnet", "Built, dormant", "Local", "Not built". The mainnet pass is **"Real on mainnet" only after** `view_account` `code_hash` matches the build, the minted token is read back from a mainnet RPC at final finality, and the owner has confirmed (§11.7 step 4). Until then "Built, dormant" (or "Real on testnet" for the testnet rehearsal).
8. **Never fake a transaction hash, a balance, a count or a rank.** UI shows a hash only after the server has seen the transaction **final** (`send_tx` with `wait_until: FINAL`, then a read-back). Placeholder or mock hashes are forbidden in code paths reachable from production (a test greps for hash-like literals).
9. **Honest bot/human split everywhere.** Scripted accounts are labelled "scripted NPC activity, owner-run, testnet, public seeds"; their silk lives in the arena namespace and never mixes into the human board (§8).
10. **Test commands before each PR** (paste real output): `cd game && npm test`, `cd server && npm test`, `cd relayer && npm test`, `cd presence && npm test`, and `cd contracts/<name> && cargo test --lib` for any contract touched. Append new game tests to the explicit list in `game/package.json` (one line, at the end; tell the captain).

### 2.3 Alignment with the sibling documents

**`FTF-City-Economy.md` ("CE"; read in full for revision 4, with `docs/town-economy.md` and `contracts/town` on `main`).** CE's design is **single-currency**: **silk** is the town's one fungible resource (trade, tournament entry and payouts, pledges to the four works, deeds as NFT positions); **Attention** is a meter, not a token; ownership is NFTs. The story follows it exactly:

| Interface | CE says | This spec |
|---|---|---|
| Silk is the Gate-Loom's price | silk = the town's one currency, never the engine's `S.silk` | **P = 200 town silk** (§3.1), paid on chain by `pay_gate`. Engine silk is never read or debited |
| Silk faucet | on-chain sources are bounded: genesis, season mint, entry credit, coordinator wages (daily ceiling) | **adds a story faucet on chain** for humans: quest and bounty rewards, spider and boss kills, a small arrival stipend, all scaled by P/10,000, rule-computed, replay-verified and capped per account and per day (§3.3, §3.5; `story_day_cap`). CE measured it at P = 200: supply ×1.14 / ×1.28 / ×1.38 the no-story town at 50 / 200 / 1,000 players (CE §2.13.4). At the old P = 10,000 it was ×6.5 |
| Silk sink | 20% entry burn, tithe burn, deed fee | **adds the portal gate** (200 silk, 100% burned once per account, `gate_burned`): it removes the finishers' faucet silk (CE §2.13.3: burn is better than treasury) |
| Contract | `ftf-town.testnet` with `Balance{silk, credit}`; built, not deployed; cut line Fri 14:00 | **Default:** the story credits and the gate are on chain: new contract pieces `pay_gate`, `gate_paid_of`, `gate_burned`, `story_locked`, `story_day_cap` and per-account caps (CE §2.13.2). **Fallback if not deployed by Fri 13 Nov 14:00:** a labelled local demo, pass claim closed (§3.1) |
| `town-economy.js` | CE §7.3 edits it | keeps the local things (hires, wheel, XP) and, in the demo fallback, the local copy of the story balance; the story needs one **additive** method `spend({silkC, reason})` for the demo and offline path only; coordinate with the CE builder (hot file, tell the merge captain) |
| Tournament and its scoring | `OUTCOME_SCORE`; owner decision (CE §11.7) is open ("a score that rewards honest play before silk is paid for rank") | the leaderboard's purse term (§8.2) consumes whatever the CE tournament scoring becomes; **no purse term scores until the tournament pays silk on chain** |
| Legal and language (CE §2.12) | say *pledge*, *reward share*, *rate (variable, can be zero)*, *town works*; never *invest, APY, yield farming, profit, dividend, returns*; no silk-for-NEAR, no real-money prize, no token launch before legal review | adopted in §10; D2's banned-word test uses CE's list (adds `apy`, `dividend`, `returns`) |
| Honest labels | "scripted NPC activity, owner-run, testnet, public seeds" | same string everywhere |

**`FTF-Competitive-TZ.md` and the NPC-economy spec.**
- **Moves 2, 3, 5 (arena, 20k tx).** Quest receipts (§7.4) and the Leaderboard snapshot (K3) are *additional* arena action types, not new volume: with a 30-minute per-account bounty cooldown the quest path adds roughly 480 receipts per 24 h across 10 accounts (about 2 % of 20,000). **Do not describe it as a way to reach 20k.** Its value is diversity (new action types, chain-verifiable story beats) and the leaderboard. The arena's rules still hold: scripted accounts only, every tx the record of a real rules event, dry-run default, budget cap, kill switch.
- **Move 7 (honest texts, lore L1).** The story strings use the L1 canon (§2.1). The About, README and pitch must say what is built (flag-gated) and not claim the whole expedition for the judge link.
- **Move 10 (mainnet, default NO).** The owner has now asked for a mainnet pass. §11 **replaces CM10's target contracts** with a new `whitelist-pass` contract (smaller than `season-commit` plus `memory-shard`, no Merkle-binding trust gap) and keeps CM10's discipline: testnet rehearsal first, owner executes, keys minimised, nothing claimed until verified. CM10's `docs/mainnet-plan.md` is extended, not duplicated.
- **Moves 9 and 11 (video, pitch).** §12 lists the exact changes to the pitch canon and the video beat sheet; the mainnet pass is a **differentiator against a rival entry and a rival entry** (CTZ §11.1: "4 of the top 20 have mainnet contracts") only after it is actually deployed and verified.
- **Streams and ownership.** Existing streams A to H plus N, S, J, R (CTZ §3.3). New here: **Q** (quest and silk rules, room commands), **P** (portal, guide, prologue, endgame scenes and copy), **K** (leaderboard), **E** (endgame pass: contract, relayer claim, modal), docs under stream **H**. Shared hot files, edit with a minimal diff and say so in the PR: `game/src/boot-world.js`, `game/src/scenes/town-flow.js`, `game/src/net/room.js`, `game/src/net/catalog.js`, `game/package.json`, the five `game/src/play/locales/*.js`, `relayer/server.js`.

---

## 3. The silk goal and the on-chain gate (Q0)

### 3.1 Which silk is authoritative: on-chain town silk (decision, rev 4)

**Owner decision (12 Nov, final): the portal is paid ON CHAIN, in town silk, through the `ftf-town` contract. There is no separate story book, no firewall, and no off-chain ledger for the Gate.** The price is **lowered** from the 10,000 the owner first said, because 10,000 cannot be an honest on-chain number (the whole supply is ~22k-30k silk at 200 players; CE §2.13.1). The recommended price is **P = 200 silk** (CE §2.13.4; `gate_price` is a bounded contract parameter, 20-5,000, so the owner can move it before the freeze). Every reward in this document is **scaled by P/10,000 = 0.02**, which keeps the focused-play time to reach the price at a **median of 102 minutes (p10 68, p90 159)**; with the old unscaled rewards, 200 silk would be reached in 5 minutes.

The repo has four things called silk (§1.1). The Gate's ledger must be (a) able to reach P, (b) spendable by the contract's `pay_gate`, (c) verifiable by anyone.

| Candidate | Reaches P = 200? | Spendable at the Gate? | Verifiable? | Verdict |
|---|---|---|---|---|
| **Engine silk `S.silk`** | Per season about 76 to 95 (passive about 138): 200 is two to three seasons | **No.** Sealed rules; "never debited by town code"; parity tests must stay unchanged; resets every season | Yes | **Rejected** (unchanged) |
| **Town silk, local** (`town-economy.js`, `ftf.town.v1`) | yes | yes, but only locally | no (a browser file) | **Demo fallback only** (below): never the ledger of the pass |
| **Silk prizes** (wheel, chests) | n/a | n/a | their own proofs | not a ledger; local prizes stay local |
| **Town silk on chain** (`ftf-town.testnet`, CE) | **Yes** with story credits (`credit_silk`, reference `story:…`) | **Yes:** `pay_gate` burns it | **Yes, natively** (`gate_paid` event, `gate_paid_of` view) | **Chosen. The only ledger of the Gate and of the pass** |

**How it works.** The browser plays (like every town feature) and appends events to the hash-chained **expedition log** (§4.3). The **relayer replays the log** with the shared rules and, for every quest turn-in, bounty and plausible kill batch, calls **`credit_silk(account, amount, "story:<kind>:<seq>")`** on `ftf-town` (subject to the caps of §3.5). The HUD silk coin shows the **on-chain `balance_of`**; a reward appears as "pending" and becomes "credited" when the relayer's batch lands (target ≤ 60 s). At the Gate the player calls **`pay_gate`** (CE §2.13.2): the contract burns exactly `gate_price` from the account's **own silk** and records `gate_paid_of(account)`. **The relayer reads `gate_paid_of` for the whitelist-pass mint and for the cliffhanger** (§5, §11): nothing off chain decides eligibility.

**Arrival.** After `gate_paid` the relayer credits `credit_entry(account, 40)` (the first tournament entry) and the stipend **`credit_silk(account, 10, "story:stipend")`** (5% of P), once.

**Demo fallback.** If `ftf-town.testnet` is **not deployed with passing tests by Fri 13 Nov 14:00 Kyiv**, the story runs as a **labelled local demo**: the same amounts in `town-economy.js`, the same twist, the banner "Demo: silk is local, nothing is on chain", and **the pass claim stays closed** (no `gate_paid_of`, so no eligibility). The portal narrative is unchanged. There is no second mode in which the pass is claimed from a local ledger.

**What the relayer proves.** `pay_gate` and the burn are exact on chain. The income side (the credits that let the player afford it) is only as honest as the relayer's replay of the log, so every credit carries its `reference`, is capped per account and per day (§3.5) and is logged; silk obtained by trading with others cannot qualify anyone, because **eligibility is the paid gate, not the balance**, and story credits are protected until the gate is paid (§3.4). Say so in `docs/whitelist-pass.md`.

**Display multiplier (option, not recommended).** The owner's original number was 10,000. If the owner wants the story to *show* it, the UI could print "10,000 threads" for 200 silk (1 silk = 50 threads, shown with the same factor everywhere, including the HUD and the explorer-facing text). It adds a second displayed unit next to "one currency" and the explorer would still show 200, so the default is **honest units: 200 silk**. If the owner chooses it, it is a pure display constant `DISPLAY_FACTOR` in `expedition-config.js`; no contract or sim change.

### 3.2 One currency, one book (summary)

| | **Town silk on chain** (`ftf-town.testnet`) |
|---|---|
| Sources | genesis, season mint (bounded), entry credit, coordinator wages (CE §2.2) **and story credits** (quests, bounties, kills, stipend; rule-computed, replay-verified, capped, CE §2.13.4) |
| Sinks | tournament entry burn, tithe burn, deed fee, **the portal gate: 100% of P, once per account** |
| Where a player spends it | the Gate (`pay_gate`, 200), tournament entry (40, entry credit first), pledges, `trade` (after the gate; story credits are protected until then) |
| Leaderboard | the verified-play terms plus the **paid gate** (`Pp`, §8.2); the purse term counts silk earned from the tournament purse (§8.2) |
| Season 3 distribution | the **testnet** distribution is paid in silk from a treasury balance (§9; the gate burns, it does not feed the treasury) |
| Local only (`town-economy.js`) | hires, local stalls, wheel prizes, XP; not part of the Gate and not credited on chain |

### 3.3 Config (single file `game/src/game/expedition-config.js`, `Object.freeze`d; amounts in **hundredths of a silk**; all story rewards are the old values × P/10,000 = × 0.02)

```js
export const EXPEDITION = Object.freeze({
  currency: 'silk',                        // town silk; story credits go through the relayer to ftf-town (credit_silk, reference 'story:...')
  PORTAL_FEE_C: 20_000,                    // 200 silk = ftf-town param gate_price. At boot, read params().gate_price and use it; this value is only the default. QA override ?portalFee=N shows a visible "demo fee" label and never counts for the pass
  DISPLAY_FACTOR: 1,                       // option: 50 shows "10,000 threads"; default honest units
  kill: { skitter: 20, veilbell: 50, hulker: 120, crownrift: 400 },   // 0.2, 0.5, 1.2, 4 silk per plausible kill ('skitter' is displayed as "spider"); was 10, 25, 60, 200
  killDaySoftC: 12_000,                    // 120 silk/day from kills at full rate; beyond it 25 %
  // quest rewards live in QUESTS (quests-data.js, whole silk: 8, 20, 16, 60, one-time); quest-rules converts to silkC = silk * 100
  bounty: { perDayFull: 3, afterFullFactor: 0.1, cooldownMin: 30 },   // 6 silk each, then 0.6
  stipendC: 1_000,                         // 10 silk once, on arrival at the archipelago (5% of P)
  killVerifyCapC: 10_000,                  // silk from T1 kills that counts as verified income: 100
  acctDayCapC: 10_000,                     // per-account story credit per UTC day: 100 silk = 0.5 x P
  acctLifetimeCapC: 23_000,                // per-account story credit in total: 230 silk = 1.1 x P + stipend
});
```
All numbers are **starting values for the pacing test (§3.6), not facts**; they were derived from the CE simulation (CE §2.13.4, `run_gate.py`) and must be re-run if P changes: **rewards always scale with P/10,000**, otherwise the time to the Gate collapses (200 silk in 5 minutes with the old amounts). The contract's silk precision [VERIFY: `contracts/town` stores integer units? `credit_silk` amounts of 0.2 silk may need hundredths or batching]: if the contract counts whole silk only, the relayer **batches kill rewards** (credit once the account's pending kill silk reaches 1) and the config amounts stay as they are in the log.

### 3.4 Authoritative mechanics

1. **Credits.** The client logs the event; `expedition-ledger.js` (client) shows the pending reward and the on-chain balance; the relayer, after replay, calls `credit_silk(account, amount, "story:<kind>:<seq>")`, idempotent by `seq` (the relayer keeps a ledger of credited `seq`; the contract also panics on a repeated reference [VERIFY: contract rule]).
2. **Protected until paid.** Silk from `story:` credits is held as **`story_locked`**: it counts toward `pay_gate` but cannot `trade`, `stake`, `enter_tournament` or be given away until the gate is paid (CE §2.13.2). After the gate, whatever is left of it (the stipend, nothing else) is normal silk. This is a simulation assumption and a contract field to add; without it a player can dump story silk into the market before paying.
3. **Paying the Gate** is one atomic call: `pay_gate(gate_id)` burns `gate_price` from the caller's **own silk balance** (story-locked silk first, then normal silk), once per account, refused for scripted accounts. The client sends it through the same relayer path as a guest's `enter_tournament` [VERIFY: guest key path in `relayer/`]; on success the log gets `portal_paid` (T2, `silkC: -20_000`, `data.tx` = the receipt hash) and the state action `PAY_GATE` fires. A reload mid-step cannot double-pay: the contract refuses a second `pay_gate`, and the log entry is written once `gate_paid` is seen on chain.
4. **Server verification and eligibility.** The relayer asks the chain: `gate_paid_of(account)`. **The pass, the cliffhanger and the leaderboard's `Pp` all use that one view.** The log replay only decides which credits to issue and detects forged income.
5. **No cross-ledger leaks:** nothing in the story reads or writes `S.silk`; a source-scan test enforces it (as in `town-quest.test.mjs`).

### 3.5 Caps and abuse limits for story credits (required; CE §2.13.4-2.13.5)

The story is now a real faucet on chain: at P = 200, 200 players with 30% finishing make **19,375 silk of credits in 30 days and burn 11,350 at the gate**; the rest sits with players who stopped early. CE's numbers at P = 200: supply ×1.14 / ×1.28 / ×1.38 against the same town without the story at 50 / 200 / 1,000 players (10% / 30% / 60% finishing), Gini within ±0.04, staker rate unchanged. The limits that keep it that way:
- **Rule S1 (daily ceiling):** story credits have their own daily ceiling **`story_day_cap` 6,000** (or the shared `credit_day_cap` raised to 6,000). The old advice "lower the ceiling to ~200" is **withdrawn**: at 200 players only 14% of finishers would get through the gate in 30 days. For 1,000 players the ceiling must be ~35,000 (CE §2.13.4).
- **Rule S2 (per account):** at most **100 silk per UTC day** (0.5 × P: at least two calendar days from the first credit to the gate) and **230 silk in total** (1.1 × P + stipend). A farm of fake accounts therefore gets at most the pass, not silk.
- **Rule S3 (no purchase route):** story-locked silk cannot be traded; silk bought or traded from others cannot pay the Gate for anyone else (`pay_gate` burns the caller's own silk, and a transfer between players does not exist).
- **Rule S4 (relayer test):** the relayer credits only `story:` references derived from a replay-verified log entry; a test fails if `credit_silk` is called with any other story-derived amount or beyond S1/S2.
- **Rule S5 (queue):** when the ceiling binds, rewards queue FIFO and the HUD says "pending"; never fake a credit.
- **Rule S6 (kill switch):** `set_paused` or `story_day_cap = 0` stops the faucet without touching wages and entry credit.
- Say nowhere that the economy is balanced for any audience beyond the simulated ones, and never describe the silk as money.

### 3.6 Pacing test (acceptance, part of Q0)

`game/tests/client/silk-pacing.test.mjs` simulates an idealised player: kills per minute from `docs/decisions.md` (about 4 per minute for the first 15 minutes, mostly spiders; **[VERIFY by a real play-test, record the real figure in the PR]**), the quest rewards (8 / 20 / 16 / 60) and the soft cap. Assert and print: minutes to 100 silk, to P = 200, and the share of P that comes from quests. Targets (measured with the CE model, `run_gate.py`, 4,000 simulated players): **P reachable in 90 to 150 minutes of focused play (simulated median 102, p10 68, p90 159)**, quests about 52% of the total, **no single source above 60%**. If the measured number is outside the band, change `EXPEDITION`, not the test. The same test must also assert the scaling law: doubling P with all rewards doubled leaves the minutes unchanged.

### 3.7 Trust levels (the key honesty device, used by K and E)

Every log event carries a `trust` field. The server and the leaderboard weigh them differently.

| Level | Meaning | Examples | Counts for score | Credited on chain as story silk | Counts for any future distribution |
|---|---|---|---|---|---|
| **T2 replayable** | Anyone can re-run the pure rules over the log and get the same result | quest turn-ins, deterministic bounties (`resolveHunt`, §7), chest openings (on-chain deck), hire results (`verifyTrack`), wheel prizes (seeded) | 100 % | yes, fully | yes |
| **T1 plausible** | Client-reported real-time kill that passed the **server's plausibility checks** (kill windows, §7.5 Q4); not a proof | real-time combat kills | 25 % of its face value, capped per day | yes, up to `killVerifyCapC` | **no** |
| **T0 local** | Never leaves the browser | everything when the player is offline or never syncs | 0 | no | no |

---

## 4. Architecture (shared by Q, P, K, E)

### 4.1 Modules (all new files; owners in parentheses)

| File | Role | Pure? |
|---|---|---|
| `game/src/game/mob-names.js` (Q, item R1) | `MOB_DISPLAY`, `MOB_ALIAS`, `mobDisplayName(id, n)`, `resolveMobId(name)` (§6.8) | yes |
| `game/src/game/mob-data.js` (Q) | `MOB_TYPES`, `PACKS`, `MOB_XP`, `CAST_DAMAGE`, `IRIS_HP`, `ACTIONS` numbers moved out of `play/mobs.js`; `mobs.js` re-exports them | yes |
| `game/src/game/expedition-config.js` (Q) | the `EXPEDITION` table above | yes |
| `game/src/game/expedition-ledger.js` (Q) | `createExpeditionLedger({storage, now, town, chain})`: the façade over the event log and the silk balance: `balanceC` (reads on-chain `balance_of` through the relayer; the local town ledger in the demo fallback), `earnedC`, `earnedVerifiedC`, `grant`, `spend`, `log`, `subscribe`; never reads `S.silk` | yes apart from storage |
| `game/src/game/expedition.js` (Q) | the **story state machine** `reduce(state, action, ctx)` and `initialState()` (§5.2) | yes |
| `game/src/game/quests-data.js` (Q) | quest definitions (§6.2), dialogue keys, waypoints | yes |
| `game/src/game/quest-rules.js` (Q) | `applyQuest(state, action, ctx)`, `resolveHunt`, `salvageRoll` (§6, §7) | yes |
| `game/src/game/expedition-log.js` (Q) | canonical JSON, hash chain `ftf-expedition-log/1`, `verifyLog(log)` | yes |
| `game/src/scenes/town-quests.js` (P) | the town view of quests: talk targets, prompts, panel content, beacons | DOM/three |
| `game/src/scenes/town-portal.js` (P) | the portal mesh, VFX, interaction, twist sequence | three |
| `game/src/ui/endgame-pass.js` (E) | the cut-to-black, the wallet modal and its states | DOM |
| `game/src/net/pass-client.js` (E) | `claimPass(...)`, polling, never fabricates a hash | net |
| `relayer/lib/expedition-rules/` (Q, copy) | **byte-identical copy** of the pure modules above (a test fails on any difference, like `near-tx.js`) | yes |
| `relayer/lib/pass.js`, `relayer/api/pass/{claim,status}.js`, `relayer/api/expedition/sync.js` (E) | server side (§11) | no |
| `contracts/whitelist-pass/` (E) | the NEP-171 pass (§11.2) | contract |
| `tools/leaderboard/*.mjs` (K) | `score.mjs`, `snapshot.mjs`, `verify.mjs` | yes + fs |

### 4.2 Flow of one action (browser)

`input or event → town-quests.js → quest-rules.applyQuest(state, action) → {state', events[]} → expedition-ledger.append(event) (+ town silk grant or spend) → localStorage + (if online and signed in) sync batch → UI`. The browser is authoritative **for play** (like every other town feature), but every event is appended to a hash-chained log so the server and anyone else can replay it. The relayer turns replay-verified events into `credit_silk` calls and the player's Gate payment is the contract's `pay_gate` (§3); nothing else is sent to a chain unless an item below says so.

### 4.3 The event log `ftf-expedition-log/1`

```js
// one entry; canonical JSON (keys sorted, no spaces) is what is hashed
{ v: 1, seq: 17, t: 1762957200000,            // ms, monotonic non-decreasing (checked)
  kind: 'quest_turned_in',                    // see list below
  data: { questId: 'q_spiders', attempt: 1 },
  silkC: +6000,                               // signed integer delta in HUNDREDTHS of town silk (+60 silk, the boss reward at P = 200), exactly what the rules compute
  trust: 'T2',                                // 'T2' | 'T1'
  prev: '<sha256 hex of previous entry hash>',// all-zero for seq 0
  hash: '<sha256 hex of prev + canonical(entry without hash)>' }
```
Kinds: `story_started`, `guide_step`, `quest_accepted`, `quest_progress`, `quest_ready`, `quest_turned_in`, `quest_abandoned`, `kill_ticketed` (T1, carries `ticket`), `bounty_resolved` (T2), `salvage_dropped`, `stipend_granted` (T2, +10 silk once), `portal_paid` (carries the `pay_gate` receipt), `pass_claimed`. (The log is the relayer's input for `credit_silk`; the burn itself is the on-chain `pay_gate`, and its receipt hash is stored in `portal_paid`.) The reducer is total: unknown kinds are rejected, `silkC` deltas must equal what the rules compute for the entry's data, `seq` has no gaps, the chain verifies. `verifyLog(log)` returns `{ok, reason, at, earned, earnedVerified, byKind}`.

### 4.4 Shared code, no drift

`relayer/lib/expedition-rules/*` are copies of `game/src/game/{mob-data,expedition-config,expedition,quests-data,quest-rules,expedition-log}.js` with no edits. `relayer/tests/rules-copy.test.mjs` reads both trees and asserts equality (pattern: the existing `near-tx.js` copy test in `relayer/tests/core.test.mjs`). `tools/leaderboard/*` and the arena runner import from `game/src/game/` directly (Node ESM, no `three`).

### 4.5 Chain versus off-chain at a glance

| Action | Where it lives | On-chain tx? | By whom | Why |
|---|---|---|---|---|
| Moving, talking, striking, kills, quest progress | browser + hash-chained log | **no** | | latency and cost; guest accounts hold 0.05 NEAR |
| Story silk credits and the portal gate | relayer (`credit_silk`, caps) and the player's `pay_gate` call on `ftf-town` | **yes** (when `ftf-town` is deployed) | `story:` credits batched per account; one `pay_gate` per account | the on-chain gate is the proof of the pass; batching keeps tx and gas small |
| **Quest turn-in receipt** (`q_spiders`, `q_part`, `q_boss`, `portal_paid`) | `agent-ledger.record_track` | **optional, 1 tx each** | the player's guest account (human: at most a few, cost 0.01 NEAR deposit each, mostly refunded [VERIFY]); arena accounts (scripted) | the cheap, verifiable story beat; no new contract |
| Deterministic bounty receipt | same | optional, 1 tx | arena accounts | diversity for the 20k arena |
| Leaderboard snapshot root | `agent-ledger.record_track` (npc `leaderboard`) from the arena coordinator | 1 tx per snapshot | owner-run runner | ties the board to a root (K3) |
| Pass mint (mainnet) | `whitelist-pass.mint_pass` | **1 mainnet tx per player** | relayer minter, server-side | §11 |
| Wheel, chests, hires, shards, skins | existing flows | as today | | unchanged |


---

## 5. The story: Expedition flow and its state machine

### 5.1 The beats (owner vision, adapted to what exists)

1. **Prologue (optional, P2):** the laboratory in 2048. Iris, a doctor-linguist, studies a sign that will not stop speaking. A pane of glass turns to light. She is pulled through.
2. **Arrival:** she steps out of a **portal** standing where she arrived in the hill town (town spawn, `TOWN_DATA.spawn` (0, 0, 25)). The mist is thin; the town is quiet.
3. **The elder (starter guide)** tells her the rule of this place: the Gate-Loom (the portal) opens only for **200 silk**, paid on chain. That sets the first goal and opens everything else: quests, hunting, the wheel, the chests, the Tournament altar, the shard auction, the agents, NEAR.
4. **Gathering:** citizens' quests (kill 10 spiders, bring a spare part, the boss), bounties, hunting. A visible silk count and a leaderboard monument.
5. **The twist:** she pays **200 silk** (burned on chain); the Loom does not take her home. It sends her **onward** to the next mission (the archipelago and its Tournament, which already exists), with a small stipend (10 silk). The Tournament is played for in silk (CE's 40-silk entry credit covers the first entry), and the leaderboard's purse term starts to count.
6. **The cliffhanger (E):** at the most exciting moment of the arrival, the screen cuts and a modal offers a **free mainnet whitelist pass** (§11).
7. **Roadmap (D1):** at the end of Season 3, a distribution from the project treasury, **linear by leaderboard rank** (§9). Testnet framing now, real value only after legal and security review.

### 5.2 State machine `expedition.js`

```js
export const PHASES = ['off', 'prologue', 'arrival', 'guide', 'gathering', 'gate_open', 'twist', 'onward'];
// state: { v:1, phase, guide: { talked, moved, struck, dashed }, flags: {...}, paidAt: null|ms, passShown: bool }
// reduce(state, action, ctx) -> { state, events[], rejected?: 'reason' }
// actions: START{skipPrologue?}, ARRIVED, GUIDE_STEP{id}, SILK{balanceC}, PAY_GATE{}, TWIST_DONE{}, PASS_SHOWN{}, PASS_RESULT{status}
```

| From | Action | To | Guard and effect |
|---|---|---|---|
| `off` | `START` | `prologue` (or `arrival` if `skipPrologue` or already seen) | only when the flag is on; sets `ftf.story.v1` |
| `prologue` | `ARRIVED` | `arrival` | the lab scene ended or was skipped (a Skip button always works) |
| `arrival` | `GUIDE_STEP talked` | `guide` | the elder's first talk opened |
| `guide` | all four `GUIDE_STEP`s (`talked`, `moved`, `struck`, `dashed`) | `gathering` | `struck` and `dashed` come from the first-fight hints; **none is mandatory**: after the elder's second talk the phase moves to `gathering` anyway (the tutorial never blocks play) |
| `gathering` | `SILK{balanceC >= PORTAL_FEE_C}` (on-chain `balance_of` through the relayer; local ledger in the demo fallback) | `gate_open` | the portal prompt changes from "needs N more silk" to "Pay 200 silk" |
| `gate_open` | `PAY_GATE` | `twist` | the client calls `pay_gate` through the relayer path; the contract burns 200 silk; log `portal_paid` (T2, `silkC: -20000`, `data.tx`); on `gate_paid_of` returning a record the twist starts; in the demo fallback the local ledger spends it and the pass stays closed (§3.1) |
| `twist` | `TWIST_DONE` | `onward` | the transfer to the archipelago finished (P5) |
| any | `PASS_SHOWN`, `PASS_RESULT` | unchanged | recorded for analytics and to avoid showing the modal twice |

The reducer is pure and has no clock: `ctx.now` is passed in. Illegal transitions return `rejected` and change nothing. Persisted at `ftf.story.v1`. A `?story=reset` URL parameter clears the story state in QA only.

### 5.3 The honest limits the UI must state

- Silk is the town's in-game balance; the leaderboard and the pass use a **replayed log** of story-earned silk (§3.4). The portal object says "Gate-Loom: 200 silk". **No new HUD chip**: the existing silk coin in the HUD wallet (`scenes/player-hud.js`) shows the balance (on chain when `ftf-town` is live) and floating deltas; add only a one-line tooltip: "Silk is counted in this game only. It is not money and cannot be sold."
- The price is the owner's decision (rev 4: lowered from 10,000; recommended 200, read from the contract's `gate_price`). A visible **demo fee** (`?portalFee=50`) exists for judges and QA and **never** counts toward the pass or the leaderboard.

---

## 6. Citizen quests and the starter guide

### 6.1 Cast (existing townsfolk, no restyle; roles only)

| Role key | Gives | Why this person |
|---|---|---|
| `elder` | the starter guide, the Gate-Loom explanation | slowest walker, always near the square (route in `townsfolk-plan.js`) |
| `guard` | `q_spiders` and the repeatable bounty | stands at the lower gate (point `npc_gate_guard` (3.9, 31)), the road to the field starts there |
| `lamplighter` | `q_part` (bring a spare part) | tends the lanterns |
| `shardkeeper` | `q_boss` | keeps the memory shards; the crown on the lookout "took the night road" |

All four already exist in `TOWNSFOLK` and can be talked to through `npcAt(key)` from `town-flow.js` (the existing quest uses it).

### 6.2 Quest definitions (data shape, `quests-data.js`)

```js
export const QUESTS = Object.freeze({
  q_welcome: { id: 'q_welcome', giver: 'elder', title: 'quest.welcome.title', requires: [], 
    objective: { type: 'guide', steps: ['talked', 'moved'] }, reward: { silk: 8, xp: 30 }, repeat: null },
  q_spiders: { id: 'q_spiders', giver: 'guard', title: 'quest.spiders.title', requires: ['q_welcome'],
    objective: { type: 'kill', mob: 'skitter', count: 10 },     // id stays 'skitter'; the player reads "stone spiders" (§6.8)
    waypoint: { kind: 'field', town: [-12, 52], radius: 14, label: 'quest.spiders.way' },
    reward: { silk: 20, xp: 80 }, repeat: null },
  q_part: { id: 'q_part', giver: 'lamplighter', title: 'quest.part.title', requires: ['q_welcome'],
    objective: { type: 'fetch', accept: { kind: 'part' }, count: 1, deliverTo: 'lamplighter' },
    waypoint: { kind: 'field', town: [-12, 52], radius: 14, label: 'quest.part.way' },
    steps: ['quest.part.step1', 'quest.part.step2', 'quest.part.step3'],      // shown in the talk and the tracker
    reward: { silk: 16, xp: 60, item: null }, repeat: null },
  q_boss: { id: 'q_boss', giver: 'shardkeeper', title: 'quest.boss.title', requires: ['q_spiders'],
    objective: { type: 'kill', mob: 'crownrift', count: 1 },
    waypoint: { kind: 'field', town: [12, 102], radius: 10, label: 'quest.boss.way' },
    reward: { silk: 60, xp: 250, chest: 'rare' }, repeat: null },
  b_spiders: { id: 'b_spiders', giver: 'guard', title: 'quest.bounty.title', requires: ['q_spiders'],
    objective: { type: 'kill', mob: 'skitter', count: 10 }, waypoint: { kind: 'field', town: [-30, 66], radius: 14, label: 'quest.bounty.way' },
    reward: { silk: 6, xp: 40 }, repeat: { mode: 'cooldown', minutes: 30, fullPerDay: 3, afterFullFactor: 0.1 } },
});
```

`reward.silk` is **whole town silk** (a log entry stores `silkC = silk × 100`; the config keeps only the caps). Rewards are scaled by P/10,000 (rev 4) and credited on chain through the relayer once the log is replayed. Rewards are minted **by the rules only** (`quest-rules.js`), once per `(questId, attempt)`. `chest: 'rare'` adds a sealed chest to the existing bag (`game/src/game/chests.js` `add({tier, source: 'quest'})`); it changes only the box, not the odds. `q_boss` is gated on `q_spiders` (practice), **not on level**, because level changes no combat number today (§1.1).

### 6.3 Per-quest state machine

States: `locked` (requires unmet) → `available` → `active` → `ready` → `done`; `active → available` on abandon; a repeatable (`b_spiders`) goes `done → available` after the cooldown and bumps `attempt`.

| Action | Guard | Effect and events |
|---|---|---|
| `ACCEPT{questId}` | state `available`; not another quest of the same giver active (one at a time per giver) | `active`, `acceptedSeq = seq`; log `quest_accepted` |
| `KILL{mob, ticket?, source}` | quest `active` and `type: kill` and `mob` matches and the kill's `seq > acceptedSeq`; a kill is counted at most once by `killId` | `progress += 1`; log `quest_progress`; at `count` the quest becomes `ready` and logs `quest_ready` |
| `SALVAGE{partId}` | any time | the rules-owned `parts[]` grows (also mirrored to `inventory.add(partId, 1, 'salvage')` by the view); log `salvage_dropped` (T2) |
| `TURN_IN{questId, partId?}` | state `ready` (for `fetch`: a `part` is available: `source 'salvage'` is T2; `source 'inventory'` from the wheel or a chest is accepted at T1) | pays `reward.silk`, xp and chest **once**; state `done`; log `quest_turned_in` |
| `ABANDON{questId}` | state `active` | back to `available`, progress cleared |

Idempotent: replaying the same action returns the stored result (the same discipline as the room's `actionId`). A kill while dead (between `ftf:iris-down` and the carry back) is not special-cased: the brain's kill events are the input.

### 6.4 Dialogue (English, quiet misty tone, at most 140 chars per line)

The talk panel is the existing one in `town-flow.js` (choices as buttons, a talk closes at `TALK_LEAVE` 4.5 m, `TALK_RADIUS` 2.4 m). New trees live in `scenes/town-quests.js` and use the same node shape `{line, choices: [{key, to?, act?}]}` so the panel needs only a small hook. Keys below are `en`; the other four locales get the English as a placeholder (listed in the PR).

**The elder: starter guide (`story.guide.*`)**

| Key | Line |
|---|---|
| `story.guide.hello` | "You came through the glass, child. The mist remembers where you came from, not how to go back." |
| `story.guide.fee` | "The Gate-Loom weighs a debt in silk. Ten thousand silk, paid in full, and it will open for you." |
| `story.guide.how` | "Help the town. Hunt on the grey slope. Silk comes to those who finish what they begin." |
| `story.guide.go` | "Start with the guard at the lower gate. He knows what crawls up the hill at dusk." |
| `story.guide.again` | "Ten thousand. Count it as you walk. The Loom does not hurry, and neither should you." (repeat visit) |
| choices | "Where am I?" (to `fee`), "How do I earn silk?" (to `how`), "I understand." (close, `GUIDE_STEP talked`) |

**The guard: `q_spiders`**

| Key | Line |
|---|---|
| `quest.spiders.offer` | "Stone spiders crawl up from the mist at dusk. Ten of them, and the road is quiet again." |
| `quest.spiders.accept` | "Below the lower gate, on the grey slope. They nest where the lantern line ends." |
| `quest.spiders.progress` | "{n} of 10. They hide where the grass thins out." |
| `quest.spiders.ready` | "Ten. The road can breathe. Take this silk, and my thanks." |
| `quest.spiders.way` | "The grey slope, south of the gate" |
| choices | "I will clear them." / "Not yet." / "Here is my report." (turn in) |

**The lamplighter: `q_part` (explains where the part comes from)**

| Key | Line |
|---|---|
| `quest.part.offer` | "The south lantern has gone dark. A valve cracked in the cold, and I have no spare." |
| `quest.part.step1` | "1. Go down through the lower gate to the grey slope." |
| `quest.part.step2` | "2. Strike the stone spiders there. Some carry a brass part in their shells." |
| `quest.part.step3` | "3. Bring me any part: a gear will do. The wheel in the square gives parts too." |
| `quest.part.accept` | "Brass sleeps in their shells. I will wait by the south lantern." |
| `quest.part.ready` | "A gear. Small thing, large light. Look: the lantern wakes." |
| `quest.part.way` | "The grey slope, then back to the south lantern" |
| choices | "I will find one." / "Show me the way again." (repeats the three steps) / "I have a part." |

The tracker shows the **current step** only (one goal on screen, as `objectives.js` demands), e.g. "Find a part on the slope" with a hint "Strike the spiders; some drop brass." The waypoint (§6.5) points to the pack; after pickup it points back to the lamplighter.

**The shardkeeper: `q_boss`**

| Key | Line |
|---|---|
| `quest.boss.offer` | "A crowned shadow stands on the lookout. It took the night road, and no lamp reaches past it." |
| `quest.boss.warn` | "It strikes slowly and hard. When the ring on the ground fills, step away." |
| `quest.boss.accept` | "Go when you are ready. The lookout is above the last bend." |
| `quest.boss.ready` | "The road is open. The lamps will reach the top by dawn." |
| `quest.boss.way` | "The lookout, above the last bend" |
| choices | "I will face it." / "Not yet." / "It is done." |

Locked quests answer with one short line: `quest.locked.spiders` = "Speak with the elder first. The town is waiting for you."; `quest.locked.boss` = "Clear the road of spiders, and then we will talk of the crown." Touch variants (`*.touch`) shorten any line that names a key.

### 6.5 Waypoints and "how to obtain" visibility

`waypoint {kind, town: [x, z], radius, label}` is town-local metres (`townToWorld`). Rendering (P3): (1) the objective line gets distance and bearing ("About 40 m south"); (2) a **ground beacon**: a soft ring and a thin light column at the point, reusing the altar-core glow and the door-glow code pattern (`scenes/door-glow.js`) **[VERIFY the reusable helper]**; (3) NPC targets use `npcAt(key)` at runtime because townsfolk walk. Reduced motion: no pulsing, static ring. The beacon hides within `radius` and while a talk is open.

### 6.6 Items and prompts

#### Q0: story state machine, silk ledger, config, log (P0, SAFE, 4 h)

**Files (stream Q):** `game/src/game/{mob-data,expedition-config,expedition-ledger,expedition,expedition-log}.js`; the one-line re-export edit in `game/src/play/mobs.js`; the **additive** `spend({silkC, reason})` in `game/src/game/town-economy.js` (the only edit to that file; its existing tests must pass unchanged; coordinate with the City-Economy builder, CE §7.3); tests `game/tests/client/{expedition,expedition-ledger,expedition-log,silk-pacing}.test.mjs`; `relayer/lib/expedition-rules/*` copy + `relayer/tests/rules-copy.test.mjs`.
**Steps:** (1) Extract constants to `mob-data.js`, re-export from `mobs.js`; `game/tests/client/mobs.test.mjs` must pass unchanged. (2) Write `expedition-log.js`: canonicalise, chain, `verifyLog`. (3) `expedition-ledger.js` over the log with `storage`/`now` injection and the additive `spend` in `town-economy.js` (§3.4). (4) `expedition.js` per §5.2. (5) Pacing test per §3.6. (6) Copy to the relayer tree and the equality test.
**Tests and acceptance:** reducer: every legal transition, every illegal one rejected without change; log: tamper any byte, any delta, any `seq` gap and `verifyLog` fails with the right `reason`; silk: `spend` below zero is rejected; the balance equals the start plus the sum of the log's `silkC` deltas; the fee equals the contract's `gate_price` (default 20,000 hundredths = 200 silk) and is paid once; story credits only through the relayer after replay and within the caps of §3.5; no import of `engine.js`, `room.js`, `net/*` or `three` (a source-scan test like `town-quest.test.mjs` last test); flag-off: the page without `?story=1` has no `ftf.story.v1` or `ftf.expedition.v1` writes. `cd game && npm test` green with real output pasted.
**Definition of done:** the pure core runs in Node with no browser; the relayer copy is identical; the pacing report is in the PR.

```
Item Q0 (stream Q). Read /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md sections 2, 3, 4 and 5.2 first. Implement the pure story core: game/src/game/{mob-data,expedition-config,expedition-ledger,expedition,expedition-log}.js, move the constants out of game/src/play/mobs.js into mob-data.js and re-export them (smallest possible diff in mobs.js, say so in the PR), add the tests listed in section 6.6 Q0 and append them to the explicit test list in game/package.json (one line at the end; tell the merge captain). The modules must be pure ESM with no imports of three, engine.js, room.js or net/*. Implement the hash-chained log ftf-expedition-log/1 exactly as in section 4.3 and verifyLog. Implement the pacing test of section 3.6 and print minutes-to-200 (target median about 102, band 90 to 150). Silk is TOWN silk in hundredths (section 3.1): all story rewards are the old values times 0.02; add only the additive spend({silkC, reason}) to game/src/game/town-economy.js for the demo fallback (existing tests unchanged; tell the merge captain), never read or write S.silk; story silk is credited on chain only by the relayer after replay and within the caps of section 3.5, and the Gate is paid on chain by pay_gate (a mocked ftf-town client in the tests), and the portal fee is PORTAL_FEE_C = 20,000 (200 silk; read gate_price from the contract's params() at boot). Copy the modules byte-for-byte into relayer/lib/expedition-rules/ with an equality test. All story features default OFF (the flag is ?story=1); do not change anything a judge sees on ?demo=judge. English only; no keys, no network writes, no push to main. Paste real npm test output.
```

#### Q1: the quests and the guide as rules and data (P0, SAFE, 5 h)

**Files (stream Q):** `game/src/game/quests-data.js`, `game/src/game/quest-rules.js`, tests `game/tests/client/quest-rules.test.mjs`.
**Steps:** implement `QUESTS` (§6.2) and `applyQuest` (§6.3), including prerequisites, one-per-giver, kill counting after acceptance, `killId` dedupe, exactly-once rewards, the repeatable cooldown with the daily full-rate counter, `ABANDON`, `TURN_IN` with part sources. Emit log entries through `expedition-log.js`.
**Tests and acceptance:** table-driven tests for every row of §6.3; a full-run test: welcome → spiders → part → boss → portal gate from a seeded script reaches `earnedVerifiedC` exactly equal to the sum of the quest rewards plus the kills in the script; replay the log through `verifyLog` and `applyQuest` and get the same state; double turn-in pays once; a kill before `ACCEPT` does not count; boss locked before spiders. No DOM, no `three`.
**Definition of done:** the three owner quests plus the guide and bounty are data, fully tested, replayable.

```
Item Q1 (stream Q), depends on Q0. Read section 6 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Implement game/src/game/quests-data.js and game/src/game/quest-rules.js exactly as in sections 6.2 and 6.3 (quests q_welcome, q_spiders, q_part, q_boss, repeatable b_spiders; per-quest state machine locked/available/active/ready/done; rewards paid once per (questId, attempt); kills count only after acceptance and once per killId; the part quest takes a salvage part at trust T2 or an inventory part at T1). Every state change appends an entry to the ftf-expedition-log/1 log from Q0. Write the table-driven tests and the full-run replay test described in 6.6 Q1 and append the test file to game/package.json. Pure modules only. Do not touch the existing game/src/scenes/town-quest.js (the old teaching quest stays as it is). English only; no push to main; paste real test output.
```

#### Q2: salvage drops: the source of the spare part (P0, SAFE, 2 h)

**Rule (in `quest-rules.js`, `salvageRoll`):** every spider kill (id `skitter`) rolls with `seededRandom('salvage:' + killId)` (the same `mulberry32` as `town-economy.js`; copied to `relayer/lib/wheel.js` already): **30 %** to drop a part; of drops, 85 % common (`part_gear`, `part_spring_coil`, `part_chain_link`, `part_rivet_plate`) and 15 % uncommon (`part_spindle`, `part_crank`, `part_valve`); **pity: after 6 kills without a drop the 7th drops one**; veilbell and hulker drop uncommon or rare; the crownrift always drops one `part_gauge` or `part_brass_lens` or `part_glyph_cogring` (legendary 5 %). Cap: 12 salvage parts per UTC day (then no more, to keep the inventory and wheel meaningful). The drop is shown as a small brass spark and the toast "A brass part" (`story.salvage.found`), and appears in the profile inventory (`inventory.add(id, 1, 'salvage')`).
**Tests:** the pity counter guarantees at most 6 misses in a row for 10,000 seeded kills; day cap; determinism (same `killId` same result); distribution within tolerance over 10,000 rolls.
**Acceptance:** on a fresh profile the first part appears within 7 spider kills, always.

```
Item Q2 (stream Q), depends on Q1. Add salvageRoll to game/src/game/quest-rules.js per section 6.6 Q2 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md (30% drop on a spider, mob id skitter, pity after 6 misses, tables by mob type, 12 per UTC day cap, deterministic from seededRandom('salvage:'+killId)), the unit tests (pity bound over 10,000 kills, determinism, distribution, day cap) and wire the view side minimally: on a drop, inventory.add(partId, 1, 'salvage') and a toast key story.salvage.found in all five locales. Do not change the loot chest rules (game/src/game/chests.js). English only; paste real test output.
```

### 6.7 Scene and UI items (stream P)

#### P1: the portal object where Iris arrived (P0, SAFE, 4 h)

**What:** a visible portal standing at the arrival point, usable as the Gate-Loom. No new art file is required for the first version: a procedural ring (torus of nacre stone with teal seams), an inner shimmer disc (additive, depthWrite off, the style of the altar core and `scenes/door-glow.js` **[VERIFY]**), slow motes, a soft light, and a low hum cue (`cueAt` from `game/src/audio/town-audio.js`; an existing quiet cue is acceptable until an owner-approved one exists). Where: town-local about (4, 0, 22.5) facing the spawn, so it is in the first frame to the right of Iris (the spawn is (0, 0, 25), she starts at z about 20.5 facing -z toward the altar; the camera sits behind her; **[VERIFY with `groundAt` and a screenshot that it is visible, not inside a wall, and not on the road]**). In QA, `?town=portal` spawns her facing it.
**States (`town-portal.js`):** `dormant` (flag on, fee not met: faint violet, prompt "The Gate-Loom wants 200 silk. You hold {n}."), `ready` (fee met: gold, prompt "Pay 200 silk"), `spent` (after the twist: dark ring, prompt "The Loom is quiet."), `off` (flag off: the object is not created at all).
**Interaction:** within `radius` 3 m the existing prompt component of `town-flow.js` shows the line; key `E` / interact button / tap (same as the altar). In `ready`, a confirmation panel states what happens ("The Loom takes 200 silk. It will not take you home.") with **Pay** and **Not yet**; this is honest foreshadowing, not a spoiler of where she goes.
**Files:** `game/src/scenes/town-portal.js` (new), minimal hook in `game/src/scenes/town-flow.js` and `game/src/boot-world.js` (mount, update, dispose; shared hot files), locale keys `story.portal.*` in five locales, test `game/tests/client/town-portal.test.mjs` (pure part: state from `(flag, balance, spent)`, prompt keys, placement inside the walkable spawn area via `town-layout.js`).
**Acceptance:** with `?story=1` the portal is in the first frame (screenshot via the existing capture tools in `art/combat/*.mjs` pattern, attached to the PR); without the flag nothing is created (test); 60 fps budget unchanged on the phone profile (the object is at most 2 draw calls and 1 light, measure with `docs/smoothness.md` method); `prefers-reduced-motion`: no motes, static shimmer.

```
Item P1 (stream P). Read sections 5 and 6.7 P1 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Add game/src/scenes/town-portal.js: a procedural portal (ring, shimmer disc, motes, one light) near the town spawn with the four states dormant/ready/spent/off, an E-key / tap interaction through the existing prompt component of town-flow.js, and a confirmation panel for paying the 200 silk fee (it calls the Q0 reducer action PAY_GATE; until Q0 is merged use a stub behind the same interface). Everything behind ?story=1; with the flag off nothing is created. Make the smallest possible edits to boot-world.js and town-flow.js and list them in the PR. Verify placement with groundAt and attach a screenshot of the first frame. Add locale keys story.portal.* to all five locale files and the pure-logic test. English only; no push to main; paste real test output.
```

#### P2: the starter guide: elder talk, objective line, first-fight hints (P0, SAFE, 5 h)

**What:** (1) The elder's talk tree (§6.4) via the existing talk panel. (2) The objective line for the story: one goal at a time, at most 7 words with a hint of at most 13 words (`game/tests/tutorial.test.mjs` enforces this style for the island goals; copy the constraint): `story.step.talk` "Speak with the elder", `story.step.gate` "Find the guard at the gate", `story.step.hunt` "Gather silk", `story.step.portal` "Return to the Gate-Loom". (3) **Contextual combat hints**, shown once when first relevant: on first crossing the lower gate "Hold F to charge a strong blow" and "Press Space to dash away" (`story.hint.strike`, `story.hint.dash`, touch variants without key names), on first damage taken "The ring on the ground warns of a blow" (`story.hint.telegraph`). They set `GUIDE_STEP struck/dashed` when the player actually does it (events from `play/mobs.js` view: `attackDown`, `dash`). (4) A "Story" item in the HUD "?" menu that replays the premise and shows the current goal. Existing behaviour: the premise lower-third (`ui/premise.js`) is shown once per browser; in story mode it is replaced by the elder's greeting; the old teaching quest (`town-quest.js`) is **offered by the elder as "Lessons"** (the three townsfolk) and keeps its own flag.
**Files:** `game/src/scenes/town-quests.js` (new; shared with P3), small hooks in `town-flow.js`, `game/src/play/locales/*.js`, tests `game/tests/client/story-guide.test.mjs` (objective keys and lengths, hint triggers are pure functions of (position, events)).
**Acceptance:** a first-time player with `?story=1` reaches "Gather silk" without any text wall: at most 2 panels and 3 hints before free play; every line at most 140 characters; touch and keyboard variants exist; no step blocks the altar or the judge flow; QA script (`?story=1&quest=0`) completes with keys through `play.handleKey`-style helpers like the existing tests.

```
Item P2 (stream P), builds on Q0 and P1. Read section 6.4 and 6.7 P2 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Implement the starter guide under ?story=1: the elder's talk tree (keys story.guide.*), the story objective line (one goal, at most 7 words, hint at most 13 words), contextual first-fight hints (strike, dash, telegraph ring) that set GUIDE_STEP events when the player does the thing, a Story entry behind the HUD ? button, and the offer of the old teaching quest as Lessons. Reuse the talk panel and prompt of game/src/scenes/town-flow.js; create game/src/scenes/town-quests.js for the new trees. Tone: quiet, misty, a little mysterious; use the exact English lines from the TZ. Add all keys to the five locale files (English copied as placeholder, list them in the PR). Flag off must change nothing. English only; no push to main; paste real test output.
```

#### P3: citizen quest wiring in the town (P0, SAFE, 6 h)

**What:** the three citizens' talk trees, prompts and tracker, driven by `applyQuest` (Q1); kills come from the existing `ftf:mob-killed` window event (`play/mobs.js` line ~502; the same event feeds `play/kill-xp.js`, chests and now quests); the salvage spark and part toast from Q2; waypoint beacons (§6.5); the quest log panel (one list: active, ready, done) opened from the HUD; rewards shown with the existing floating-delta HUD (`scenes/player-hud.js`): "+1000 silk". No new chip: the existing silk coin in the HUD wallet already shows the town silk balance (the portal prompt shows progress to 10,000); add only a short tooltip line (§5.3).
**Hooks:** on `ftf:mob-killed {type, pos, elite}` build `killId = packIndex:spawnNo:mobIndex` **[VERIFY: `MobBrain.spawn` ids are `${type}${packIndex}_${k}` and respawns reuse them, so add a per-id respawn counter in the event detail; this is a small additive change in `play/mobs.js`, owned by the combat worker; if it cannot be added, derive `killId` from `(mobId, respawnCount)` kept in the view]**.
**Files:** `game/src/scenes/town-quests.js`, hooks in `town-flow.js` and `boot-world.js`, `game/src/ui/quest-log.js` (new), locale keys `quest.*`, tests `game/tests/client/town-quests.test.mjs`.
**Tests and acceptance:** pure: `talkTarget`-style selection for four givers, tracker keys per state, waypoint target switching (slope → lamplighter after a pickup); integration with a fake window event stream: ten kill events with id `skitter` (shown as spiders) complete `q_spiders` and pay 1,000 silk exactly once; reload preserves state; `?mobs=0` (critters) never progresses quests (critters are not `skitter`s); in QA, the full chain welcome → spiders → part → boss completes in the headless scenario with forced kills and the HUD shows 5,200 silk earned from the four quests (plus kills) (with `?portalFee=` visible demo label, not the real fee). Screenshots of each panel on desktop and a 390 px phone; the locale tests pass.

```
Item P3 (stream P), depends on Q1, Q2, P2. Read sections 6.1 to 6.6 and 6.7 P3 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. In game/src/scenes/town-quests.js wire the three citizen quests (guard: ten spiders and the repeatable bounty, lamplighter: spare part, shardkeeper: boss) to the Q1 rules: talk trees with the exact English lines, prompts, a one-goal tracker, waypoint beacons and distance/bearing in the objective line, a quest log panel, reward feedback through the existing floating-delta HUD, and the existing silk coin as the balance (no new chip). Kill input is the window event ftf:mob-killed; build a stable killId per respawn (see the [VERIFY] note) with the smallest additive change in game/src/play/mobs.js and say so in the PR. The lamplighter's talk must explain the three steps of how to get a part (source, steps, waypoint). Flag off changes nothing; ?mobs=0 never progresses quests. Add keys to the five locale files, the pure and integration tests, desktop and 390px screenshots. English only; no push to main; paste real test output.
```

#### P4: the prologue laboratory (P2, SAFE, 5 h; a modelled lab level is after the deadline)

**What (version 1, no new 3D art):** a 20 to 30 s skippable scene played by the existing chapter-film player (`game/src/cinematic/chapters/`, `runner.js`, `overlay.js`; film scripts are plain data as in `play/chapters.js`): 5 shots of 4 to 6 s over procedural backdrops and the town's sky: a glass pane with a looping glyph (a sign that will not stop), a line of Iris's field notes, the glass turning to light, the fall, the portal ring forming at the arrival point, with calm narrator lines and a final card "What matters now: silk". Captions (each at most 3 words per second, no voice-over): "2048. A laboratory." "A sign that will not stop speaking." "The glass turns to light." "She falls." "A ring of stone. Mist." Opening only for first-time `?story=1` visitors; `Skip` always visible; never on the judge link.
**Version 2 (P2, after the freeze):** a short walkable lab level (`art/` Blender, procedural like `art/town/*`), needs art tooling and the GPU server; **not** part of the freeze scope.
**Files:** `game/src/cinematic/chapters/story-prologue.js` (script data + registration), keys `story.prologue.*`, test `game/tests/client/story-prologue.test.mjs` (script shape, caption rate, skip, never plays with `demo=judge` or without the flag).
**Acceptance:** plays once, skip works at every beat, ends exactly at the arrival state `arrival`; no text longer than the caption rate; no new binary assets.

```
Item P4 (stream P), optional, depends on Q0 and P1. Read section 6.7 P4 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Add a skippable 20 to 30 second prologue using the existing chapter-film player (game/src/cinematic/chapters/, play/chapters.js style: plain-data film scripts), five shots on procedural backdrops, captions at most 3 words per second, no voice-over, no new binary assets. Lore canon: Iris is a doctor-linguist from another planet, year 2048; the glass pane shows a sign that will not stop speaking. It plays once for first-time ?story=1 visitors only, never on ?demo=judge, and ends in the arrival phase of the Q0 state machine. English only; no push to main; paste real test output.
```

#### P5: the twist: pay 200 silk on chain, the portal sends her onward (P0, SAFE, 3 h; the cliffhanger belongs to E3)

**What:** `PAY_GATE` pays the fee (200 town silk, burned on chain by `pay_gate`, §3.4), plays a 6 to 8 s transition (portal flare, camera lifts like the altar's `TOWN_TRANSITION`, the cover fades in with "The Loom does not open toward home."), then **under the cover** the game uses the **existing altar transition** to move Iris to the archipelago (`startPlay`, island `SPAWN`; `docs/town.md` Flow 5), i.e. no new level is needed. Rewards on arrival: the title **"Gate-Walker"** (add to the wheel's cosmetic title list in `game/src/game/wheel.js` `TITLES`: coordinate with the wheel owner or keep a separate story title list), +10 silk "mission stipend" (`stipend_granted`, T2, once, credited by the relayer) and the entry credit of 40, one sealed common chest, and the leaderboard becomes visible. The archipelago season itself is the unchanged Tournament; **the story layer must not change any season rule**.
**Interplay with E3:** the transition has a hook point `onPeak` at the moment the first Shell's sign wakes (about 2 s after the island world opens, the same moment the Arrival chapter film uses); E3 uses it to cut to black.
**Files:** `game/src/scenes/town-portal.js` (twist sequence), tiny edit in `boot-world.js` to call the existing registration transition with a `reason: 'portal'`, keys `story.twist.*`, test `game/tests/client/story-twist.test.mjs` (state machine ends in `onward`, the payment is exactly the fee (20,000 hundredths at the default), no second payment, no engine import).
**Acceptance:** from `gate_open` one confirmation leads to the island world with one cover; the silk balance drops by exactly the fee; reload during the transition resumes in `twist` or `onward`, never double-spends (log `portal_paid` once).

```
Item P5 (stream P), depends on Q0 and P1. Read section 6.7 P5 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Implement the twist sequence in game/src/scenes/town-portal.js: after the PAY_GATE action, a short transition (flare, camera lift, cover with the line "The Loom does not open toward home."), then reuse the existing altar registration transition in boot-world.js to move Iris to the archipelago (no new level), grant the story title, the +10 silk stipend (credited by the relayer) and one sealed common chest, and expose an onPeak(cb) hook that fires when the first Shell sign wakes on the island (for the endgame modal, item E3). The payment must be exactly the fee (the contract's gate_price, 200 silk by default) and exactly once, including across reloads; it is the on-chain pay_gate call (section 3.4; a mocked client in tests, the local ledger only in the demo fallback), never S.silk. Do not change any engine or season rule. Flag off changes nothing. English only; no push to main; paste real test output.
```

### 6.8 R1: "skitter" is displayed as "spider" (owner decision; P0, SAFE, 1 h, stream Q)

**Rule (owner): display names and copy change, technical file names and ids do not.** Facts from the inspection: the only player-visible "skitter" text in `main` is the guard's bark `bark.role.guard` (`game/src/play/locales/en.js` line ~1155 and `it.js` line ~1154; uk, ru, zh to be checked [VERIFY]); everything else is an id, a file, an audio id or a history row.

**Display name.** "stone spider" (singular), "stone spiders" (plural), short form "spider" in the objective line ("Strike the spiders; some drop brass."). One source of truth, `game/src/game/mob-names.js` (pure):
```js
export const MOB_DISPLAY = Object.freeze({ skitter: { key: 'mob.skitter', one: 'stone spider', many: 'stone spiders' }, /* hulker, veilbell, crownrift unchanged */ });
export const MOB_ALIAS = Object.freeze({ spider: 'skitter', spiders: 'skitter', stone_spider: 'skitter', 'stone-spider': 'skitter', skitter: 'skitter', skitters: 'skitter' });
export function resolveMobId(name)            // case-insensitive, trims, returns a canonical id or null
export function mobDisplayName(id, n = 1)     // 'stone spider' / 'stone spiders'
```
**Where it applies:** (1) the quest and bounty text (already written as "spiders" in §6.4); (2) `bark.role.guard` in all five locales (`en`, `uk`, `ru`, `it`, `zh`): replace "skitter" by the localised word for "spider" (copy the English where unsure and list it in the PR); (3) a new `display` field in `art/mobs/mobs.json` per mob (`{"skitter": {"display": "stone spider", ...}}`, additive; `build_mobs.py` is not touched); (4) the tracker, toasts and the kill feed through `mobDisplayName`; (5) docs and the README line about enemies.
**Where it must NOT apply (unchanged):** `MOB_TYPES.skitter`, `PACKS`, `MOB_XP` keys, the event `ftf:mob-killed {type: 'skitter'}`, file names `mob_skitter*.glb` and `art/mobs/*skitter*`, audio ids, `town-economy.js` history rows and any saved profile, test fixtures and the expedition log (`mob: 'skitter'`), the agent API's canonical value.
**Alias mapping in the API:** every argument that names a mob accepts any alias and is normalised with `resolveMobId` **before** hashing or logging (so `hunt {mob:'spider'}` and `hunt {mob:'skitter'}` produce identical log entries and receipts); an unknown mob returns `unknown_mob`.
**The model has six legs.** "Spider" is the owner's name for it; an eight-leg model is optional P2 art (`art/mobs/build_mobs.py`, regenerate `mob_skitter.glb` under the same file name) and not needed for the deadline.
**Tests:** `game/tests/client/mob-names.test.mjs`: every alias resolves to `skitter`, unknown to null, display strings, **a guard that fails if the string "skitter" appears in any `play/locales/*.js` value** (keys and ids excluded), `art/mobs/mobs.json` `display` present for all four, `mobs.test.mjs` unchanged and green.
```
Item R1 (stream Q). Read section 6.8 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Add game/src/game/mob-names.js (MOB_DISPLAY, MOB_ALIAS, resolveMobId, mobDisplayName), add a display field to art/mobs/mobs.json, change the word "skitter" to "spider" in the player-visible string bark.role.guard in all five locale files (en, uk, ru, it, zh), and make quest text, tracker and kill feed use mobDisplayName. Do NOT rename any id, file, audio id, MOB_TYPES key, event type or saved-profile field. Argument names for mobs in the agent API are normalised with resolveMobId before logging. Add game/tests/client/mob-names.test.mjs as described; append it to the list in game/package.json. Flag-independent (it is a display change) but keep ?demo=judge behaviour identical apart from that word. English only; no push to main; paste real test output.
```

---

## 7. Quests through the same rules and the agent API (so bots can play them)

### 7.1 Principle

The Foresight Exchange is the precedent: its ledger is separate from the season, and "the browser and an HTTP agent play by identical rules" because both send the same commands through `room.js`. Quests follow the same pattern: **one rules module (`quest-rules.js`), two front ends** (the town view for humans, the command bus for agents). No second implementation, no special bot paths in the rules.

### 7.2 Commands (added to `game/src/net/catalog.js` and `room.js`, modelled on `start_exchange` / `place_order`)

| Command | Args | Who | Result |
|---|---|---|---|
| `expedition_start` | `{}` | controller | state `arrival`, log `story_started`; refused if the room is not in expedition mode |
| `quest_accept` | `{questId}` | controller | `applyQuest ACCEPT` |
| `quest_turn_in` | `{questId, partId?}` | controller | `applyQuest TURN_IN`, reward minted by the rules |
| `hunt` | `{questId or bountyId, packId, mob?}` (`mob` accepts any alias, `spider` or `skitter`, normalised by `resolveMobId` before logging, §6.8) | **scripted actors only** (registry-checked) | `resolveHunt` (below); emits `bounty_resolved` (T2) and the kill progress it implies |
| `pay_gate` | `{}` | controller | `PAY_GATE` |

Commands carry `actionId` (idempotency), `expectedVersion`, as in `docs/api/README.md`. Rejections (422) name the failed guard. They are listed in `GET /v1/actions` so an agent discovers them. **The room never re-implements a rule**: it calls `quest-rules.js`. The engine, `S.silk` and the season state are untouched; the expedition ledger sits beside `this.exchange` in the room.

### 7.3 Scripted hunts: how a headless agent "kills ten spiders"

A headless agent cannot play real-time combat. The rules therefore define, once, an **abstract hunt**: `resolveHunt({seed, packType, count, irisHp})` over `MOB_TYPES` in `mob-data.js`: time to kill per creature = `hp / dps` with `dps = 18` and a seeded factor in 0.85 to 1.15; damage taken = `sum(damage × hitRate × secondsAlive)` with `hitRate = 0.35` (the telegraph lets a human avoid most hits); failure when damage ≥ `irisHp`. All constants in `mob-data.js`, **documented as an abstraction of the real combat, not a simulation of it** (**[VERIFY] by comparing against `MobBrain` in a node test over 1,000 seeds: the abstract result must be within a stated band of the brain driven by a simple pursue-and-strike controller; record the band, do not claim equivalence**). A hunt yields the same quest progress as real kills but at trust **T2**, and is available only to accounts in the public **scripted registry** (the arena's ten accounts, `docs/plans/npc-economy-spec.md` §4.1), never to humans, so a human cannot shortcut combat and a bot cannot pose as a human.

### 7.4 Which quest actions are on chain (and how it helps the arena)

- **Receipt = one `agent-ledger.record_track`** with: `npc` = quest id (`q_spiders`, `q_part`, `q_boss`, `b_spiders`, `portal_paid`; all valid per `valid_npc`), `epoch` = attempt number (the contract rejects a repeated `(account, npc, epoch)` with `ERR_EXISTS`: **natural idempotency**), `seed` = the hunt or quest seed, `policy_version` = `quest-1`, `params` = canonical JSON of `{questId, attempt, silkC, logHead}` (≤ 512), `params_hash` and `snapshot_sha256` = sha256 of the rules module bundle (so a verifier knows which rules), `bar_from < bar_to` = the first and last log `seq`, `trades_compact` = up to 50 tuples of five integers `kind,seq,mobTypeIndex,silkC,0` (what happened), `pnl_bp` = 0. The contract is deployed already (`ledger.ftf-coordinator.testnet`; arena instance under `ftf-arena.testnet` per the NPC spec), **no new contract and no contract change**.
- **Humans:** optional "Record this quest on NEAR testnet" button on a completed quest (guest account, 0.01 NEAR deposit, 20 Tgas as in `net/agent-ledger.js`); at most a few per account because the guest holds 0.05 NEAR. Off by default; it is a flourish, not a requirement.
- **Scripted arena accounts:** every completed bounty and quest is one receipt. With a 30-minute per-account bounty cooldown that is about 20 receipts a day per account at most, **about 480 per 24 h across the ten arena accounts: roughly 2 % of the 20,000 target.** State this number whenever the feature is described. Its role is diversity (a new action type with a replayable meaning), not volume. **Do not shorten the cooldown to inflate counts**: judges may discount wash activity (CTZ §6.1).
- **Never on chain:** kills, movement, silk balance, dialogue, anything T1 or T0.

### 7.5 Items

#### Q3: quest commands, scripted hunts, receipts (P1, CONDITIONAL on Q0 and Q1, 6 h)

**Files (stream Q):** `game/src/net/catalog.js`, `game/src/net/room.js` (additive branches, the same style as `start_exchange`; `availableActions` entries), `game/src/game/quest-rules.js` (`resolveHunt`), `server/tests/quests.test.mjs`, `game/tests/client/hunt-band.test.mjs`, `tools/quest-receipt/args.mjs` (prints `record_track` argument files for a log entry; **dry-run only, signs nothing**), docs `docs/api/README.md` (new commands) and `docs/api/openapi.yaml`.
**Tests and acceptance:** HTTP vs in-process equivalence for a seeded run of the quest chain (the existing `server` equivalence-test pattern, `docs/api/README.md`); a human-controller `hunt` is rejected; replaying `actionId` returns the stored result; `quest_turn_in` twice pays once; the receipt argument builder produces arguments that pass a local re-implementation of the contract's validation (`valid_npc`, hashes 64 hex, `count_trades`) and that `verifyTrack`-style tooling can re-derive; the hunt band test prints its measured band. `cd server && npm test` and `cd game && npm test` green.

```
Item Q3 (stream Q), depends on Q0 and Q1. Read section 7 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Add the commands expedition_start, quest_accept, quest_turn_in, hunt, pay_gate to game/src/net/catalog.js and game/src/net/room.js, modelled exactly on start_exchange/place_order (separate ledger, no engine or season change, actionId idempotency, 422 on guard failure, listed in availableActions). Implement resolveHunt (abstract hunt, constants in mob-data.js, documented as an abstraction) and restrict hunt to scripted actors from a registry. Add tools/quest-receipt/args.mjs that prints agent-ledger record_track arguments for a log entry (npc = quest id, epoch = attempt, trades_compact as five-integer tuples) and never signs or sends. Tests: HTTP/in-process equivalence for a seeded chain, human hunt rejected, replay of actionId, double turn-in pays once, hunt-vs-MobBrain band measured over 1,000 seeds and printed. Update docs/api/README.md and openapi.yaml. Do not run any send path; no keys; no push to main; English only; paste real test output.
```

#### Q4: server-checked kill windows for the pass and the board (P1, CONDITIONAL on Q0, 4 h)

**Protocol (shared by E2 and K):** `POST /api/expedition/window` with `{guest, seq}` returns a short-lived signed window `{windowId, from, to, mac}` (HMAC with a server secret; 5-minute windows). Kills reported in the sync batch (`POST /api/expedition/sync`) name their `windowId`. The server accepts a kill as **T1** only if: the window is valid and not reused beyond its caps; the kill time lies inside the window; time since the previous kill of that guest is at least `minTtk` (derived: `hp / maxDps`, with `maxDps` from `ACTIONS`: the super strike 80 per 1.2 s and the combo (14, 14, 26) per three 0.32 s presses give about 56 to 67; **[VERIFY cast cooldowns for the Lance and Snare]**; for a skitter (hp 55) about 0.8 s); kills per window at most 40; kills per UTC day at most 1,200; the type exists in `PACKS`; the `killId` was not seen. It is **plausibility, not proof**, and every surface says so ("server-checked, not provable"). Offline play stays T0.
**Files:** `relayer/lib/expedition.js` (verifier, shared limits from `mob-data.js`), `relayer/api/expedition/{window,sync}.js`, `relayer/tests/expedition-sync.test.mjs`.
**Acceptance:** fixtures: a legitimate 15-minute session passes; 100 kills in 10 s fail; reuse of a window beyond caps fails; a forged MAC fails; the log hash chain is verified on every batch; storage append-only JSONL under a configured directory (`FTF_EXPEDITION_DIR`, **[VERIFY host disk and backups]**); per-guest and per-IP rate limits.

```
Item Q4 (stream Q/E), depends on Q0. Read section 7.5 Q4 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. In relayer/ add relayer/lib/expedition.js, relayer/api/expedition/window.js and sync.js, and tests: an HMAC-signed 5-minute window, a sync endpoint that verifies the guest's ed25519 signature over each batch (key lookup via view_access_key on the guest account, as relayer/lib/wheel.js does), replays the batch through the shared rules in relayer/lib/expedition-rules, verifies the hash chain, applies the plausibility limits of the TZ (min time to kill from hp and max dps, kills per window and per day, killId uniqueness) and stores append-only JSONL. Kill acceptance is T1 and the API says so in every response. No mainnet, no keys in tests (generate in memory), default dry-run for anything that could send. English only; no push to main; paste real relayer test output.
```

---

## 8. The leaderboard (formed by the Shell)

### 8.1 What it is, honestly

A **board season** ("Board Season 1" is now; the owner's roadmap pays out after Board Season 3; this is *not* an engine season with 17 trials, so every surface says "board season") ranks accounts by a score computed from the **expedition log** (§4.3). The score is a pure function of public rules; the rows, the rules and a verifier are public; a Merkle root of each snapshot is optionally committed on NEAR testnet **before** the rows are published. **[OWNER CONFIRM]** "the Shell forms the leaderboard" is implemented as a Shell-shaped monument in the town square (and later inside Shell I) that displays the latest snapshot; the data pipeline does not depend on where it is drawn.

### 8.2 Scoring formula (`tools/leaderboard/score.mjs`, shared with `game/src/game/board-score.js`; starting values, tune in K4)

```
classes(a)   = number of distinct classes with at least one scored event in the board season,
               among { quest, hunt, trade, verify }   (0..4)
               quest  = a turned-in quest or bounty;  hunt = a scripted hunt or a T1 kill;
               trade  = a collected hire (verifyTrack ok), an exchange drill result, or a pledge to a town work (CE, when built);
               verify = a quest receipt, a shard mint or a chest opening that exists on chain
M(a)         = 0.6 + 0.1 * classes(a)                       // 0.6 .. 1.0
Q(a)         = sum of one-time quest points (turned in, T2):  q_welcome 40, q_spiders 100, q_part 80, q_boss 300
             + 30 per bounty turn-in, at most 3 per UTC day at full value, 3 each after that
Sk(a)        = hunting income only (quests and bounties are scored by Q, so nothing is counted twice):
               1 point per 10 silk of kill income; T2 (scripted hunt) at full value, T1 (server-checked kill) at 0.25, T1 capped at 200 points per UTC day.
               Only story-minted silk counts, never a balance, never silk received from another account
Pp(a)        = 1 point per silk EARNED from the tournament purse (a `settle_season` payout, T2, read from the CE town contract's events),
               at most PP_CAP (starting value 1,000) per board season. Entry credit, received silk, tithe or fee shares, stall shares, and silk pledged in or earned by a deed NEVER count
               (CE: deeds are tradable, a bought deed must not buy rank; story credits never enter this term; the paid gate does, through `Pp`). 0 for everyone until a tournament pays silk on chain [VERIFY CE status]
V(a)         = 10 per distinct on-chain quest receipt, at most 50
P(a)         = 200 points once for gate_paid_of (the 200-silk Gate paid on chain, §3.4); points are not silk
score(a)     = round( M(a) * ( Q + Sk + Pp + V + P ) )
tie-break    = earliest time the final score was reached, then account id
```

Properties and the reasons for them: **T0 never scores** (it cannot be verified); **T1 is quarter-weight and day-capped** (real-time kills are the hardest thing to prove, §3.7); **every repeatable source has a day cap**; **the diversity multiplier** rewards doing different things and shrinks a pure-farming score by up to 40 %; **no term depends on another account** (no transfer, no gift, no trade between accounts), so there is nothing to wash between two accounts you own (silk can be traded in the town market, so **no term reads a silk balance or a trade proceed**; only rule-minted income events count), and splitting effort over `k` accounts never increases the total (no per-account bonus or threshold in Board Season 1 other than the one-time P and quests, which are the same rewards again for the same effort, so a sybil farm gains only parallelism, bounded by the caps).

### 8.3 Anti-sybil and anti-wash (what is and is not defended)

| Threat | Defence | Residual risk, stated plainly |
|---|---|---|
| Wash between own accounts | scoring counts only rule-minted income events (quests, kills, bounties) and silk earned from the purse; no term reads a balance, a received transfer or a trade proceed, so moving silk between accounts adds no points | none by design |
| Farming with many guest accounts | per-IP and daily caps in the relayer (`create-guest`: 3 at once then 1 per 10 min, `daily_cap`), day caps on every source, Merkle snapshot and public verifier, cluster flags | **a determined person can still create many free testnet guests**. Free testnet identities are not scarce. Therefore Board Season 1 carries **no money and no promise**; any future payout needs a stronger identity step (§9.4) |
| Fabricated kills | T1 only, server window plausibility, 25 % weight, day cap | plausible-looking scripted clients can pass; documented in the page |
| Fabricated quests or silk | the log is hash-chained and replayed by the same rules; rewards are rule-computed; any mismatch rejects the whole log | a client that obeys the rules but plays by automation is a bot: allowed, but labelled by the cluster flags and excluded from payouts pending review |
| Bots posing as humans | the scripted registry is public; arena accounts appear in a **separate "Scripted NPC" tab** and can never be ranked in the human tab | an unregistered bot is indistinguishable from a human on testnet; same limit as above |
| Retroactive rule changes | the rules bundle hash and the payout formula hash are committed on chain at the start of the board season (K3) | the owner can still start a new board season |

**Cluster flags** (computed by `tools/leaderboard/flags.mjs`, shown as a small badge, excluded from any payout list until reviewed): identical action-sequence hash across accounts, inter-event timing with near-zero variance (a fixed-interval script), more than `N` accounts created from the same IP bucket within an hour (needs relayer logs; **[VERIFY]** what the relayer stores and for how long, and privacy: store only a salted hash of the IP bucket), accounts that only ever do one class.

### 8.4 Data shapes

```js
// row
{ rank: 12, account: 'ann.guests.ftf-coordinator.testnet', actor: 'human' | 'scripted',
  score: 1840, parts: { Q: 520, Sk: 110, Pp: 0, V: 20, P: 200, M: 0.9 }, quests: 4, killsT1: 130, receipts: 2,
  lastSeq: 412, logHead: '<sha256>', flags: [] }
// snapshot (json file) and its root
{ v: 1, boardSeason: 1, epoch: 7, createdAt: 1762960000000,
  rules: '<sha256 of the board-score + expedition-config + quests-data bundle>',
  sealRef: { engineSeasonId: '793f6c05e89839f2', engineRoot: '03dbd458…5075769a' },  // read from chain at snapshot time, never typed
  rows: [ ... ], root: '<merkle root hex>' }
// leaf = sha256('ftf-lb-1|' + boardSeason + '|' + epoch + '|' + rank + '|' + account + '|' + score + '|' + logHead); parent = sha256(left || right); an odd last node moves up (the same rule as relayer/lib/chest-deck.js)
```
`sealRef` ties a snapshot to a **sealed season commit** that exists on chain (the judge season at `ftf-seasons.testnet`, or an arena season): it shows that the board was published against a committed, publicly verifiable season and gives the leaderboard the same "committed first" story. It does **not** mean the score is derived from the engine's events; say so in the UI ("Rules and snapshot are committed on NEAR testnet; the score comes from the play log").

### 8.5 Items

#### K1: scoring library, snapshot builder, verifier (P1, SAFE, 4 h)

**Files (stream K):** `game/src/game/board-score.js`, `tools/leaderboard/{score,snapshot,verify,flags}.mjs`, tests `game/tests/client/board-score.test.mjs` and `tools/leaderboard/tests/*.test.mjs`, doc `docs/leaderboard.md`. **Inputs:** a directory of verified logs (`relayer` JSONL, or exported files) and the scripted registry. **Outputs:** `snapshot.json`, `rows.csv`, root, per-row Merkle proofs, and a `verify.mjs` that re-derives everything from the logs and the rules bundle.
**Tests and acceptance:** golden fixtures (three humans, two scripted, one cheater) produce fixed ranks and a fixed root; verifier flags any edited row, any wrong root, any rule mismatch; scores equal the formula for hand-computed examples (include a table in the PR); a property test: splitting one account's events across two accounts never increases the sum of scores (with day caps and M at most 1.0); T0 events never score; a scripted account never appears in the human list. No network, no keys.

```
Item K1 (stream K). Read section 8 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Implement game/src/game/board-score.js (the exact formula of 8.2: M, Q, Sk, Pp, V, P, caps, tie-break), tools/leaderboard/{score,snapshot,verify,flags}.mjs (verified logs in, snapshot.json with Merkle root and proofs out; verify recomputes from the logs), tests with golden fixtures, the split-accounts property test and the scripted/human separation, and docs/leaderboard.md describing the rules in plain English with a worked example table. No network access, no keys, no chain writes. Use only the shared rules modules from Q0. English only; no push to main; paste real test output.
```

#### K2: the Shell monument in the town square (P1, SAFE, 4 h)

**What:** a Shell-shaped stone monument (procedural: two fused nacre shells, a glowing seam; no new asset required) at a free spot in the square (town-local near (0, 4.5, -2): **[VERIFY] a clear spot with `town-spot-props.js` and `town-spots.test.mjs`; reuse the existing "spot" mechanism: `spotNear` / `spotPanel` in `town-flow.js`**). Prompt "Read the Shell" opens a panel: tabs **Humans | Scripted NPC**, top 10, "You: rank n of N, score s" with the parts breakdown, snapshot time, root (first 8 characters, copy), a "Verify" link to `docs/leaderboard.md`, and a plain footer "Rules and snapshot are committed on NEAR testnet. The score comes from the play log. No prizes." If no snapshot is available (offline or none published) it shows the local board of the player alone, labelled "Local preview, not ranked".
**Data source:** `game/public/board/latest.json` (published by the owner through the normal Pages deploy; **agents never push**) with a fallback fetch from the relayer `GET /api/board/latest`. Never trusts the file for the player's own row: the client recomputes the player's score from the local log and shows both when they differ.
**Files:** `game/src/scenes/town-board.js`, `game/src/ui/board-panel.js`, keys `board.*`, tests `game/tests/client/town-board.test.mjs` (tabs, no scripted row in the human tab, empty state, root display, phone layout).
**Acceptance:** screenshots (desktop, 390 px); keyboard and touch reachable; flag off creates nothing; the panel never shows a number that is not in the snapshot or the local log; "Scripted NPC" tab carries the exact label "scripted NPC activity, owner-run, testnet, public seeds".

```
Item K2 (stream K), depends on K1. Read sections 8.1, 8.4 and 8.5 K2 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Add a Shell-shaped monument (procedural mesh) at a free spot in the town square using the existing spot mechanism of town-flow.js, and a panel with two tabs (Humans, Scripted NPC), the top ten, the player's own row (recomputed from the local log with game/src/game/board-score.js), snapshot time and root, and the footer text from the TZ. Load game/public/board/latest.json, falling back to the relayer endpoint; when neither exists show a clearly labelled local preview. Everything behind ?story=1. Add keys to the five locales, tests and desktop plus 390px screenshots. English only; no push to main; paste real test output.
```

#### K3 and K4: the verifiable commitment and the anti-wash simulation (P1, CONDITIONAL, 6 h together)

**K3 (stream K, SAFE to write, run OWNER-GATED):** `tools/leaderboard/commit-args.mjs` prints `record_track` argument files for (a) `npc lb_rules`, epoch = board season: `snapshot_sha256` = the rules bundle hash, `params` = the payout formula id and parameters; written **once at the start of a board season**; (b) `npc leaderboard`, epoch = snapshot number: `snapshot_sha256` = the snapshot root, `trades_compact` = the top 10 as `rank,score,quests,killsT1,receipts` tuples. The tool defaults to dry-run; signing is the owner's, with the arena coordinator key **on the runner host** (never in the repo). `docs/leaderboard.md` documents the read-back commands (`get_track`, public RPC) and how to verify a row against the committed root.
**K4 (stream K, SAFE):** `tools/leaderboard/simulate.mjs` runs seeded populations (honest players, a farmer, a 20-account sybil farm, a fixed-interval bot, scripted accounts) through K1 and prints the resulting ranks and payouts under the chosen formula B (and A as reference), plus the §9.3 sybil cases; the PR tables show the sybil's gain **under the actual caps** and the flags that fire. Acceptance: the sybil farm's total never exceeds the sum of caps; the bot is flagged; a report `docs/leaderboard-simulation.md` is generated by the tool (numbers from the run, not typed).

```
Items K3 and K4 (stream K), depend on K1. Read sections 8.3, 8.4, 8.5 and 9 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. K3: tools/leaderboard/commit-args.mjs prints agent-ledger record_track argument files for the board-season rules commitment (npc lb_rules) and for each snapshot root (npc leaderboard); dry-run only, never signs, never sends, no keys; document the read-only verification commands in docs/leaderboard.md. K4: tools/leaderboard/simulate.mjs with seeded populations (honest, farmer, 20-account sybil farm, fixed-interval bot, scripted accounts) that prints ranks and payouts under both distribution formulas of section 9 and generates docs/leaderboard-simulation.md from the run. Assert that the sybil farm never exceeds the sum of the caps and that the bot is flagged. English only; no push to main; paste real test output.
```

#### K5: hourly on-chain snapshots from the arena (P2, OWNER-GATED run)

Add to the arena runner (stream N, CTZ §6.10) a scheduled job that every hour builds a snapshot (K1), writes the root with `record_track` from the arena coordinator (K3) and writes `latest.json` to a path the owner publishes. That is about 24 transactions a day: negligible for the 20k target, valuable as a visible commit-then-publish loop. Agents write the job (dry-run default, behind the same kill switch as the arena); the owner runs it. Skipped if the arena does not run.

---

## 9. ROADMAP: Season 3 distribution, linear by rank (Option B; OWNER DECISION, final; documentation only now)

**Status.** Nothing in this section is built or promised in the hackathon build. Today: **testnet, no value, no treasury**. Any real-value distribution happens **only after legal and security review** and an explicit owner decision. Use "roadmap" and "may", never "will pay". Never describe it as an investment, return, yield, profit or share of anything; silk is a game resource, not a security (D2 explains the wording; CE §2.12 forbids *invest, APY, yield farming, profit, dividend, returns*). The owner's wording to preserve: *at the end of the third season, the project distributes rewards from its treasury linearly by leaderboard position.* **Decision (owner, final): linear by rank, "Option B".** Option A (proportional to score) is kept only as a reference column in the table.

### 9.1 The formula (B, linear by rank)

Let `T` be the treasury amount set aside for the season (abstract units until a legal review says otherwise; in the testnet demonstration the unit is **silk from a treasury balance set aside by rule, not minted**: CE §2.13 names it, the station bucket plus unspent Reserve and purse carry-over, about 250 silk after 30 days in CE's base case, so a symbolic amount), `E` the set of **eligible** accounts (§9.4), ranked 1 (best) to `|E|` by the payout score (§8.2 computed from T2 events only, ties broken as in §8.2), and

```
K       = min( |E|, K_MAX )          K_MAX = 100 (owner-tunable, committed on chain before the season)
weight  w_r = K - r + 1              for ranks r = 1..K, zero for r > K
payout_r = T * w_r / ( K(K+1)/2 )    sum over r of payout_r = T exactly (integer arithmetic, remainder to rank 1)
```
**Distribution runs only if `|E| >= K_MIN`** (starting value **40**; below it the season's pool is carried to the next one). Reason: rank 1 receives `2/(K+1)` of `T`: 1.98 % at K = 100, 3.92 % at 50, **4.88 % at 40** and 9.52 % at 20, so K_MIN = 40 keeps any single account under 5 % of `T` and stops a handful of accounts from sharing a whole pool. Payouts fall by the same step from each rank to the next ("linear"). Ranks are computed among eligible accounts only, **one rank per wallet** (§9.4).

### 9.2 Worked example: 100 eligible players, `T = 10,000` abstract units, `K = 100`

| Rank | Weight | **B payout** (chosen) | Share of T | Reference only: A proportional on an illustrative skewed score curve (no cap / 5 % cap) |
|---|---|---|---|---|
| 1 | 100 | **198.0** | 1.98 % | 951.3 / 500.0 |
| 2 | 99 | **196.0** | 1.96 % | 585.6 / 500.0 |
| 3 | 98 | **194.1** | 1.94 % | 440.9 / 468.9 |
| 5 | 96 | **190.1** | 1.90 % | 308.3 / 327.9 |
| 10 | 91 | **180.2** | 1.80 % | 189.8 / 201.8 |
| 25 | 76 | **150.5** | 1.50 % | 100.0 / 106.3 |
| 50 | 51 | **101.0** | 1.01 % | 61.6 / 65.5 |
| 75 | 26 | **51.5** | 0.51 % | 46.3 / 49.3 |
| 100 | 1 | **2.0** | 0.02 % | 37.9 / 40.3 |
| Top 10 share | | **18.9 %** | | 37.8 % |
| Bottom 50 share | | **25.2 %** | | 23.6 % |

(Computed by script; the B column sums to 10,000. The A column uses the illustrative curve `s_r = round(10,000 · r^−0.7)`, an assumption, not data. The score only decides the **rank**; under B a rank-1 player gets twice rank 50's payout and ≈99 times rank 100's, whatever the score gap.) `tools/leaderboard/simulate.mjs` generates the full 100-row table; the doc must include it generated, not typed.

### 9.3 The documented risk: sybil dilution and slot capture (B is split-positive)

B pays a **fixed slot per rank**, so identities, not effort, are what B rewards at the margin. Both effects are real and must stay in the doc and in D2:
1. **Dilution without a cap on `K`.** If every eligible account is paid and `K = |E|`, rank 1 gets `2/(N+1)` of `T`: **1.98 % at N = 100, 0.995 % at N = 200, 0.2 % at N = 1,000**. Free identities shrink everyone's payout. Mitigation: `K_MAX` (a fixed number of paid ranks).
2. **Slot capture with a fixed `K`.** A person with `m` accounts that all clear eligibility can hold `m` slots. The cheapest slots are at the bottom: `m` accounts in the **bottom** `m` slots take `m(m+1)/2 ÷ 5,050` of `T` (K = 100): **m = 10: 1.09 %, m = 30: 9.2 %, m = 50: 25.2 %**; `m = 10` accounts in the **top** 10 slots (needs real effort each) take **18.9 %**. Bottom slots are cheap to reach (just clear the floor); the per-account cost is the 10,000-silk portal (about 90 to 150 minutes of focused play, §3.6, **[VERIFY by a play-test]**) plus the activity rules. **Unlike A, splitting effort over `k` accounts raises the total received.**
3. **Why the owner's choice is still defensible:** B is simple, flat (rewards participation as well as the top), and rank-1 capture is small; with the §9.4 controls the attack costs real time per identity. **It must not be paid in anything of real value until an identity step stronger than a free guest key exists.**

### 9.4 Mitigations and preconditions (eligibility rules; none of this exists today)

| # | Control | Rule |
|---|---|---|
| 1 | **Eligibility threshold** | `E` = accounts with `gate_paid_of` set (the gate price burned on chain), a payout score above `FLOOR` (starting 100 points), at least **3 of 4** score classes and at least **3 distinct UTC days** with scored events, all measured from T2 events only (not T1, not T0) |
| 2 | **Human-verified** | only accounts carrying a `human_verified` flag set **before the snapshot freeze**. Now: the captcha on guest creation and on the pass claim. Roadmap: a proof-of-personhood provider (**[VERIFY]** provider, cost, privacy; reviewed with the legal review). **No KYC unless the legal review requires it** |
| 3 | **One rank per wallet** | accounts bound to the same payout wallet, or in one cluster (§8.3 flags), collapse to the single best rank; the payout wallet is bound **at the start of Board Season 3** and cannot change afterwards. **The whitelist pass is transferable (§11), so a pass holder is not an identity: payouts follow the bound play wallet, never the pass holder** |
| 4 | **Cap on ranked accounts** | `K_MAX = 100`, `K_MIN = 40`, committed on chain before the season (K3) together with `FLOOR` and the activity rules |
| 5 | **Scripted accounts excluded** | the owner-run registry is never in `E`; the arena tab is separate; unregistered bots found by cluster flags are held out pending review |
| 6 | **Cluster flags and dispute window** | identical action sequences, fixed-interval timing, same-IP-bucket creation bursts hold an account out until reviewed; a public dispute window before any payout |
| 7 | **Public and committed** | rules bundle hash, formula, `T`, `K_MAX`, `K_MIN` and the snapshot root committed on NEAR testnet before and after the season; the verifier is public |
| 8 | **Review gates** | legal review of the jurisdictions involved (sweepstakes, gambling, securities, tax, sanctions), an independent security review of the distribution mechanism and the snapshot pipeline, a plain-language statement that `T` may be zero |

**Residual risk, stated plainly:** with free testnet identities and only a captcha, a determined person can still hold several slots. The honest answer is the framing: **no value, testnet, roadmap**; real value waits for control 2 at proof-of-personhood strength and for the reviews in control 8.

### 9.5 Item D1 (P1, SAFE, 2 h, stream H)

**Files:** `docs/roadmap-board-seasons.md` (this section's content, the formula, the 100-row table generated by `tools/leaderboard/simulate.mjs`, the sybil section, the mitigations, the plain-language disclaimer), README roadmap row ("Board Season 3 treasury distribution, linear by rank: Roadmap, not built, no value today"), one sentence in `docs/submission/pitch.md`. **Acceptance:** the table is generated (re-run gives identical numbers and the B column sums to `T`); `simulate.mjs` also prints the sybil cases of §9.3 (m = 10, 30, 50, top and bottom) and the dilution numbers; `scripts/check-copy.mjs` passes; `rg -i "guarantee|earn money|investment|invest|apy|yield|profit|dividend|returns" docs/roadmap-board-seasons.md` finds only negations.

```
Item D1 (stream H). Read section 9 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Write docs/roadmap-board-seasons.md for the owner's final decision: Season 3 distribution is linear by rank (Option B): K = min(eligible, 100), weights K-r+1, payout_r = T*(K-r+1)/(K(K+1)/2), runs only if at least 40 accounts are eligible. Include the 100-player table generated by tools/leaderboard/simulate.mjs (B column sums to T; keep the proportional column as reference only), the sybil-dilution and slot-capture section with the exact numbers (rank-1 share 1.98%/0.995%/0.2% at N=100/200/1000; bottom-slot capture 1.09%/9.2%/25.2% for m=10/30/50), the mitigations table (eligibility threshold, human-verified, one rank per wallet and per cluster, cap on ranked accounts, scripted accounts excluded, T2-only payout score, dispute window, committed rules) and the preconditions (legal and security review). Disclaimer in plain words: roadmap only, testnet, no value today, not an investment or a promise, silk is a game resource, the whitelist pass is transferable but payouts follow the bound play wallet. No claims that a payout exists or will happen. English only; no push to main; run scripts/check-copy.mjs and paste real output.
```

---

## 10. "Gambling" mechanics, legal caution and what the hackathon build does

Not legal advice; the owner must get counsel before any real-value mechanic. The build rules:

1. **No wagering of anything that can be converted to value.** Silk cannot be bought or sold for NEAR or any currency and cannot be cashed out (it moves only inside the in-game market and the town contract, with no transfer between players except a whole deed, CE §2.12); there is no entry fee; no mainnet token is staked on a chance outcome; the free wheel (one spin a day, never bought, odds shown; `game/src/game/wheel.js`) and the chest decks (public Merkle deck, verifiable openings) remain the only chance mechanics. They are **free to play and skill-neutral**; their prizes are in-game items, practice silk, titles and testnet NFTs.
2. **Skill and chance, openly:** combat and quests are skill and effort; wheel and chests are chance with the odds visible and the draw verifiable. A new "chance" mechanic may be added only if it has (a) no stake, (b) shown odds, (c) a daily cap, (d) a rule-computed outcome from a shown seed.
3. **The mainnet pass (§11) is free, with no purchase and no stake.** It is not a prize in a game of chance: eligibility is skill and effort (about 100 minutes of play to earn the gate price in silk, paid and burned on chain at the portal). Say so. **The pass is transferable by owner decision (§11.2):** the pass itself is free and we never list, price or promote resale, but a secondary market may price it, which changes the legal questions (see D2). Copy never mentions price, resale or value.
4. **A future silk-staked mini-game or a treasury payout that depends on chance is out of scope (the Season 3 payout of §9 depends on rank, not chance, and stays roadmap)** and flagged as legal risk (D2 lists the questions: jurisdictional gambling and lottery rules, securities-style language, consumer protection, minors: the game says "from 12 to 95", `docs/chapters.md`, so age-gating and parental-consent questions apply to any real-value step).
5. **Vocabulary:** say "reward", "pass", "whitelist spot", "badge". Never "bet", "stake your silk on", "win money", "earn money", "invest", "APY", "dividend", "guaranteed", "resale", "flip". Prefer CE's words: pledge, reward share, rate (variable, can be zero), town works. Existing English "stake" in the game means anchoring silk on a sign (a sealed rule of the season); it stays, but never next to silk or any mainnet token.
6. **Item D2 (P1, SAFE, 1.5 h, stream H):** `docs/legal-notes.md`: the list above, the list of questions for counsel, the banned words, the exact disclaimer strings (`legal.free.pass`, `legal.testnet.only`, `legal.no.value`) and where each must appear (modal, board footer, roadmap doc, pitch). **Acceptance:** a unit test (`game/tests/client/legal-copy.test.mjs`) greps the story, board and pass locale strings for the banned words and fails on a hit.

```
Item D2 (stream H). Read section 10 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Write docs/legal-notes.md (not legal advice): the build rules, the open questions for counsel, the banned and the preferred vocabulary, and the exact disclaimer strings with where they must appear. Add game/tests/client/legal-copy.test.mjs that scans the en locale strings of the story (story.*), board (board.*), quest (quest.*) and pass (pass.*) keys for the banned words (bet, wager, gamble, invest, investment, apy, dividend, yield, profit, guaranteed, earn money, win money, resale, flip) and fails on a hit; append it to game/package.json. English only; no push to main; paste real test output.
```

---

## 11. ENDGAME CLIFFHANGER and MAINNET WHITELIST PASS (stream E; the mainnet differentiator)

### 11.1 The experience and its honesty rules

When a player has earned the gate price (**200 silk**) through play (all quests, or heavy farming within the caps) and **paid it at the Gate-Loom** (§3.4: `pay_gate` burns it on chain; the relayer reads `gate_paid_of`), they are carried to the archipelago (P5). **Eligibility for the pass is exactly: the Gate paid on chain (`gate_paid_of(account)` is set).** Nothing else counts. At the most exciting moment of that arrival (the first Shell's sign waking: the `onPeak` hook) **the screen cuts to black** and a modal appears:

> **You earned a free whitelist spot.**
> Enter your NEAR wallet account (mainnet). It is free: no purchase, no seed phrase, no signature.
> `[ yourname.near, or a 64-character account id ]`  `[ Claim my spot ]`
> *We never ask for a seed phrase or a private key. Never share them.*

After submit: a **loading state** ("Checking your Gate payment, then writing to NEAR mainnet. About half a minute. Keep this page open."), then **success**: *"Done. The pass is already in your wallet."* with the **real mainnet transaction hash** (copy button), the token id, and a button **"View on NearBlocks"** to `https://nearblocks.io/txns/<hash>` **[VERIFY the mainnet URL format]**. The hash is shown **only after the server has seen the transaction final and read the token back with the player's account as owner**; it is never invented, cached from a previous run, or shown while pending. If anything stops the mint, the modal says so plainly (§11.4 table) and **keeps the claim**.

Honesty rules (tests enforce them): no hash-like literal reachable from the production path; no text that promises value; the utility of the whitelist is **defined** (below) and the claim "Real on mainnet" is allowed only after the owner has deployed and §11.9's post-deploy checks pass.

**Whitelist utility (define before launch; [OWNER CONFIRM] the exact list):** the pass reserves a place on the Forget to Foresee allowlist for (1) early access to the next testnet season and board season, and (2) the project's next announcement of a mint or access list, **if and when** one exists. No monetary value, resale value, airdrop, token or return is promised.

**The pass is transferable (owner decision, final).** Consequences, stated once and used everywhere:
- **The rights follow the token holder.** The allowlist and any pass perk (early access, a "Pass holder" badge on the Shell board, and the like) belong to whoever **holds the token at the time they are evaluated**, read from the chain (`nft_token(...).owner_id`, `is_whitelisted(account)`), at a **published snapshot block** for the allowlist (the owner announces the snapshot time in advance). **One allowlist spot per holder wallet, however many passes it holds.** A board badge shows for a play account whose **bound wallet** (§11.3) currently holds a pass; a buyer who wants the badge binds their own wallet (roadmap: sign-in with NEAR, **[VERIFY]**).
- **Rank and Season 3 do not follow the token.** Board rank, the score and the Season 3 distribution (§9) belong to the **play account and its bound payout wallet**, never to a pass holder: the pass is not an identity.
- **We never list, price, promote or facilitate resale**, and no copy mentions price, resale or value (legal, §10). A secondary market may still form; that is a legal question for counsel (D2) and a farming incentive (§11.6).

### 11.2 The contract: `contracts/whitelist-pass` (a fork of `contracts/skin-nft`, which is 112 lines, NEP-171, one token per account, contract-paid storage via `internal_mint_with_refund(..., None)`; **transferable**)

Why not reuse an existing contract: `memory-shard` mints are coordinator-only and carry a Merkle-binding trust gap (CTZ Move 6); `skin-nft` is the right shape but is a testnet prize contract with a wheel-specific claim; a **new small contract** keeps the mainnet surface minimal and reviewable.

```text
State:  owner_id (cold account), minter_id (one account), cap (default 1000), daily_cap (default 100),
        minted, day_index, day_count, paused,
        minted_to: set<AccountId>   // every receiver at MINT time, never removed: a wallet that sold or sent its pass can never be minted another
        claim_ids: set<String>
        + the standard NEP-171/NEP-181 token map and per-owner indexes (these change on transfer)
Init:   new(owner_id, minter_id, cap, daily_cap)    // cap <= 10_000, daily_cap <= cap
Owner:  set_minter(AccountId), pause(), unpause(), set_media(Option<String>)   // owner CANNOT mint, CANNOT move funds, CANNOT upgrade, CANNOT freeze or seize a token
Minter: mint_pass(receiver_id, claim_id) -> Token   // the only mint path; zero deposit
Holder: nft_transfer, nft_transfer_call (+ nft_resolve_transfer)   // standard NEP-171, ENABLED; 1 yoctoNEAR; only the token's owner
Views:  pass_info(), has_minted(account), is_whitelisted(account) -> bool (holds at least one pass), is_claimed(claim_id), minter(), owner(), paused(),
        + NEP-171/177/181 views (nft_token, nft_total_supply, nft_tokens, nft_supply_for_owner, nft_tokens_for_owner)
Absent: approvals (no NEP-178, any call that passes an approval_id panics ERR_NO_APPROVALS); no royalties (no NEP-199); no burn; no owner override on transfers
```
**Decisions recorded (final unless the owner overrides them before deploy, because the contract is immutable after the keys are deleted):**
- **Approvals (NEP-178): OFF at launch.** Direct transfers (a wallet's "send", `nft_transfer`) work. Marketplaces that need an approval to list cannot list the pass; that is intended (we do not facilitate resale) and removes the approval-phishing surface. If the owner wants marketplace listing, NEP-178 must be added **before** deploy (more code, more tests, a real review): **[OWNER CONFIRM only if marketplace listing is wanted]**.
- **Royalties: none** (no NEP-199, no royalty fields in `extra`) unless the owner says otherwise before deploy. Without approvals there is no marketplace to enforce them anyway.
- **Pause stops minting only.** Holders can always transfer; the owner cannot freeze or seize a token.
- **A transfer does not reset "already minted".** `minted_to` keeps every first receiver, so one wallet can never be minted two passes by selling and re-claiming; a holder may still **receive** more passes by transfer, and the utility stays one spot per wallet (§11.1).
`mint_pass` requires: `predecessor == minter_id`; not paused; `minted < cap`; the UTC-day counter `< daily_cap` (`block_timestamp / 86_400e9`); `receiver_id` not in `minted_to` (**one mint per wallet on chain, even after the pass moved**); `claim_id` is 64 lowercase hex and not in `claim_ids` (**idempotency on chain**: a server that lost its state cannot double-mint); and the contract's **available balance** (`account_balance − storage_usage × byte_cost`) stays at least a reserve of 0.05 NEAR after the mint **[VERIFY exact `env` calls]**. **Transfers** need only the standard 1 yoctoNEAR and must leave the contract's available balance above the same reserve (the index entries moving between owners are also paid by the contract: **[VERIFY by measurement in a test; the net change is expected to be small]**). Storage is paid from the contract balance (no deposit needed), which is what lets the minter be a **function-call access key** (function-call keys cannot attach a deposit; payable calls need a full-access key). Token metadata (NEP-177): title `FTF Whitelist Pass #n`, short description with the utility line, shared `media` (one URL, set by the owner), `issued_at`, `extra` = `{"board_season":1,"claim":"<claim_id>"}` (**no guest account, no PII**). Events: NEP-297 `nft_mint` through the standards crate.
**Keys after deployment (OWNER-GATED, §11.7):** all access keys of the contract account are **deleted**, so the code is immutable and the owner's only powers are `set_minter`, `pause`, `unpause`, `set_media`. This is the Move 10 trade-off in practice: a bug cannot be patched, so **test on testnet first, review, then deploy**.
**Files:** `contracts/whitelist-pass/{Cargo.toml,rust-toolchain.toml,src/lib.rs,README.md}`, `contracts/whitelist-pass/scripts/{build.sh,deploy-args.mjs}` (deploy-args prints the commands, signs nothing), `docs/whitelist-pass.md`.
**Tests (`cargo test --lib`):** non-minter rejected; owner cannot mint; cap; daily cap with the mocked block timestamp crossing midnight; second mint to the same wallet rejected; **second mint to a wallet that has already transferred its pass away rejected**; same `claim_id` for another wallet rejected; **transfer works** (owner and indexes change, `is_whitelisted` flips for sender and receiver, `has_minted` of the sender stays true), transfer by a non-owner rejected, 0 yocto rejected, self-transfer rejected, `nft_transfer_call` with a mock receiver that returns true (token goes back) and false (token stays), a passed `approval_id` panics `ERR_NO_APPROVALS`, transfer while paused works, a receiver holding two passes is `is_whitelisted` once and `nft_supply_for_owner` is 2; pause blocks mint, unpause allows; mint with zero deposit succeeds and `storage_usage` grows by a measured amount (the test prints it: input to §11.5); low-balance guard; `has_minted`, `is_whitelisted`, `is_claimed`, enumeration views; metadata fields; the wasm exports exactly the intended methods (a script lists `wasm-objdump`/`near` ABI output **[VERIFY tool]**).
**Acceptance:** all tests green with output pasted; wasm size and SHA-256 printed by `build.sh`; `docs/whitelist-pass.md` states what the contract can and cannot do in plain language; nothing deployed.

```
Item E1 (stream E). Read section 11.1 and 11.2 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md and contracts/skin-nft/src/lib.rs. Create contracts/whitelist-pass as a minimal TRANSFERABLE NEP-171 (+177, +181) whitelist pass contract exactly as specified: owner_id, minter_id, cap, daily_cap, one mint per wallet via a minted_to set that is never pruned (also after a transfer), on-chain claim_id idempotency, contract-paid storage (internal_mint_with_refund with None), low-balance guard on mint and transfer, standard nft_transfer and nft_transfer_call enabled (1 yoctoNEAR), pause stops minting only, NO approvals (NEP-178 absent, approval_id panics), NO royalties, no burn, views has_minted and is_whitelisted, owner cannot mint, move funds, freeze or seize a token. Write the cargo tests listed in the TZ (transfer tests included, and the measured storage_usage delta of a mint and of a transfer printed by a test), build.sh printing wasm size and SHA-256, deploy-args.mjs that only prints commands (never signs), README and docs/whitelist-pass.md in plain language. Nothing may be deployed, signed or funded by you; no keys anywhere. Paste real `cargo test --lib` output. English only; no push to main.
```

### 11.3 Eligibility and the claim endpoint (relayer, `relayer/lib/pass.js`, `relayer/api/pass/{claim,status}.js`)

**Identity chain.** The player already has a **Day 1 guest account** (testnet, `guests.ftf-coordinator.testnet`, minted once per browser key, per-IP bucket and a daily cap; `relayer/README.md`). The claim binds three things: the **guest account** (testnet identity, proves "this is the browser that played"), the **expedition log** (what it earned), and the **mainnet wallet** (where the pass goes).

**Eligibility = the Gate paid on chain, read by the relayer.** The relayer calls the view `gate_paid_of(account)` on `ftf-town.testnet` (NEAR RPC) and requires a record with `price >= gate_price` (the price in force when it was paid), once per account. It also replays the guest's stored expedition log (Q4) through the shared rules and refuses the claim when the log fails `verifyLog` or when the account's story credits exceed the caps of §3.5 (a forged-log flag), but **the paid gate is the only eligibility input**: a balance, a trade or a log alone never qualifies anyone. The client cannot supply a number: it can only ask. The `?portalFee` demo fee never counts. **If `ftf-town` is not deployed (demo fallback, §3.1) the claim endpoint answers `closed`.**

**Request.** `POST /api/pass/claim`
```json
{ "guest_account": "ann.guests.ftf-coordinator.testnet", "wallet": "ann.near",
  "claim": { "v": 1, "board_season": 1, "claim_id": "<sha256('ftf-pass-1|' + board_season + '|' + guest_account)>", "log_head": "<hash>", "log_len": 412, "issued_at": 1762960000000 },
  "signature": "ed25519:<sig over canonical(claim + wallet) by a key of guest_account>", "captcha": "<optional token>" }
```
Header `Idempotency-Key: <claim_id>`. **Validation order (each step is a separate, tested function):**

1. **Wallet id syntax:** 2 to 64 characters; named accounts match `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$` (the same pattern the hackathon form uses, `docs/hackathon-rules.md`), or an **implicit account** `^[0-9a-f]{64}$`. Lowercase only (no trimming of case: uppercase is rejected, not silently lowercased, because the player must see what will be used). Reject the contract, owner and minter accounts and anything ending `.testnet` when the network is mainnet.
2. **Existence on mainnet:** RPC `view_account` for named accounts; `UNKNOWN_ACCOUNT` gives the clear error `account_missing`. **Implicit accounts are allowed even before they are funded** (an NFT owner entry does not need the account to exist **[VERIFY: wallets list an NFT for an unfunded implicit account; if not, say so in the modal]**). Use at least two RPC endpoints (`https://rpc.mainnet.near.org` and a fallback; **[VERIFY current public RPC limits and any sunset notices]**), 5 s timeout, circuit breaker.
3. **Guest signature:** `view_access_key` on the testnet RPC proves the public key belongs to the guest account; verify the ed25519 signature over the canonical claim.
4. **One per guest and per wallet:** server index plus on-chain `is_claimed(claim_id)` and `has_minted(wallet)` before any send (`has_minted` stays true after the pass is transferred away). A repeated request returns the original result with `"replay": true` (and the same hash), never a second mint.
5. **Eligibility:** replay the stored log; reject with `not_eligible` and what is missing (`needed`: the gate price (200 silk), `paid`: bool from `gate_paid_of`, `earned`: story silk credited so far), never a bare "no".
6. **Rate limits and abuse:** per-IP token bucket (reuse `createBucket` in `relayer/lib/core.js`: for example 3 claims at once, then 1 per 10 minutes), per-guest one claim per 10 minutes, a global per-day cap that is **at most the contract's `daily_cap`**, request body limit, `Origin` allowlist (same as the existing endpoints). **Optional captcha** (Cloudflare Turnstile or hCaptcha) enabled only when `FTF_CAPTCHA_SECRET` is set; **[OWNER DECISION]** it adds a third-party and a privacy cost, off by default.
7. **Budget guard:** before each send read (a) the minter key's remaining **allowance** (`view_access_key`), (b) the pass contract's available balance (`view_account`), (c) `pass_info` (minted, caps, paused). If any is below its threshold: **do not send; queue** (below) and raise an owner alert (a log line at ERROR and an optional webhook URL from the environment; no secret in the message).
8. **Send:** build `mint_pass(receiver_id = wallet, claim_id)` with zero deposit, signed by the **minter function-call key** (`relayer/lib/near-tx.js` signer; the tx client already supports a key per account; **[VERIFY function-call key support in `near-tx.js`]**), `send_tx` with `wait_until: FINAL`, then read `nft_token(token_id)` and require `owner_id == wallet`. Only then return `minted`.
9. **Ambiguity:** on a timeout, a dropped connection or an unknown outcome, **never re-send blindly**: first read `is_claimed(claim_id)` and look the tx up by hash; the contract's own `claim_id` set makes a duplicate send harmless but wasteful.

**Responses and failure states (the client maps each to plain text; the server never returns a hash unless the status is `minted`):**

| Status | HTTP | Meaning | Client message (English) | Queue? |
|---|---|---|---|---|
| `minted` | 200 | final and read back | "Done. The pass is already in your wallet." + hash + link | no |
| `already_claimed` | 200 | replay | same as above plus "You already claimed this spot." | no |
| `queued` | 202 | accepted but not yet sent or not yet final | "The mint queue is busy. Your claim is saved and will be sent automatically. Keep this page, or come back." | yes |
| `invalid_account` | 400 | syntax | "That does not look like a NEAR account id." | no |
| `account_missing` | 422 | named account not on mainnet | "That account does not exist on NEAR mainnet yet. Create it in your wallet, then try again." | no |
| `not_eligible` | 403 | the Gate is not paid or the income is not verified | "Pay the Gate-Loom (200 silk) first. You have earned {earned} so far." | no |
| `wallet_taken` | 409 | a pass was already minted to that wallet (it may since have been transferred) | "A pass was already claimed for that wallet." | no |
| `signature_invalid` | 401 | claim not signed by the guest | "We could not verify this browser's account." | no |
| `rate_limited` | 429 | bucket or per-guest limit | "Too many tries. Please wait {n} minutes." | no |
| `captcha_required` | 428 | captcha enabled and missing | "Please confirm you are not a robot." | no |
| `paused` | 202 | contract or server paused | "Claims are paused for now. Your claim is saved." | yes |
| `budget_exhausted` | 202 | allowance, balance or day cap | "Today's passes are all claimed. Your claim is saved and will be sent when the queue reopens." (honest: may not be sent if the cap is the total cap: then `sold_out`) | yes |
| `sold_out` | 410 | total cap reached | "All passes have been claimed." | no |
| `rpc_unavailable` | 202 | no healthy RPC | "NEAR is not answering right now. Your claim is saved." | yes |
| `tx_failed` | 502 | the contract rejected | "The mint failed ({code}). Nothing was spent. Please try again later." | no |

**Queue:** append-only JSONL (`FTF_PASS_DIR`, **[VERIFY host disk and backups]**), a worker with exponential backoff (30 s, 2 min, 10 min, 1 h; give up after 24 h with `expired`, kept visible), one in flight at a time (the key's nonce lane), `GET /api/pass/status?claim_id=` for polling, and the **kill switch**: `FTF_PASS_ENABLED=0` or a `STOP` file halts sending within 10 s (claims keep queueing). The minter key lives only in `FTF_PASS_KEY` on the relayer host (a **function-call key**, `receiver_id` = the pass contract, `method_names` = `["mint_pass"]`, allowance = the hard gas budget); never in the repo, CI, logs or tests (tests generate keys in memory and use a mock RPC).

**Why the "hard budget cap" is real:** three independent layers: the **access key allowance** (gas only; it cannot send NEAR), the **contract's own balance** (storage; it cannot be exceeded), and the **on-chain caps** (`cap`, `daily_cap`). A stolen minter key can mint at most up to those limits and nothing else.

**Files (stream E):** `relayer/lib/pass.js` (validators, eligibility, budget guard, send, queue), `relayer/api/pass/claim.js`, `relayer/api/pass/status.js`, `relayer/server.js` (route hook), `relayer/README.md` section, `relayer/tests/pass-*.test.mjs`, docs `docs/pass-claim-api.md`. **Dry-run by default:** with no `FTF_PASS_KEY` the endpoint answers `503 not_configured` after validation and eligibility (a safe rehearsal), and the code path that signs refuses without `FTF_PASS_ENABLED=1`.
**Tests and acceptance (`cd relayer && npm test`, all with mock RPC and in-memory keys):** every row of the table above reproduced by a fixture; account-id vectors (valid named, valid implicit, uppercase, too short, too long, trailing dot, `.testnet` on mainnet, the contract's own id); **no hash before final** (a mock that returns a tx id but never final yields `queued`, not `minted`); idempotency under 20 concurrent identical requests mints once; a lost-state restart reads `is_claimed` and returns the existing result; budget thresholds queue instead of sending; the daily cap and total cap; the kill switch; a captcha-enabled run; the signer is never invoked in dry-run (spy); a source scan finds no `ed25519:` secret literals and no hash literals; rate-limit fixtures.

```
Item E2 (stream E), depends on Q0 and Q4 and E1's ABI. Read section 11.3 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. In relayer/ implement the pass claim: lib/pass.js, api/pass/claim.js, api/pass/status.js and the server route, with the exact validation order of the TZ (wallet syntax incl. implicit 64-hex, mainnet existence via view_account with a fallback RPC, guest ed25519 signature checked against view_access_key, one per guest and per wallet incl. on-chain is_claimed and has_minted (true even after the pass was transferred away), eligibility = gate_paid_of(account) set on ftf-town (read through NEAR RPC; the one eligibility input; closed if ftf-town is not deployed), plus a replay of the stored expedition log with the shared rules that must pass verifyLog and the per-account credit caps of section 3.5 (a balance or a log alone never qualifies), per-IP and per-guest rate limits, a global daily cap, optional captcha when FTF_CAPTCHA_SECRET is set, budget guard reading the minter allowance and the contract balance, idempotency by claim_id, send with a FUNCTION-CALL key restricted to mint_pass and wait for FINAL then read the token back). Implement the status table, the append-only queue with exponential backoff and expiry, and the kill switch (FTF_PASS_ENABLED=0 or a STOP file). Never return a transaction hash unless the status is minted. Default is dry-run: without FTF_PASS_KEY answer 503 not_configured after validating; the signing path must refuse without FTF_PASS_ENABLED=1. Tests use a mock RPC and in-memory keys only, and include every case listed in the TZ. You never run the send path against any real network, never handle a real key, and never touch mainnet. English only; no push to main; paste real `npm test` output.
```

### 11.4 The client: cut, modal, states (`game/src/ui/endgame-pass.js`, `game/src/net/pass-client.js`)

**Sequence.** `PASS_ELIGIBLE` is computed by asking the relayer (`GET /api/pass/eligibility?guest=...`, which returns `{eligible, paid, earned, needed}`: `paid` from `gate_paid_of`, `earned` from the replayed log); locally the HUD wallet shows the silk balance and the portal prompt shows progress to 200, but nothing **ever** pretends the pass is earned. When the story reaches `onward` and the server says eligible, at `onPeak` (P5): hard cut to black (reuse the cover component of the town transition), hold 1.2 s with a low sting, then the modal. The modal appears **once per account** (flag in the story state and the server's `claim_id`), can be reopened from the HUD ("Whitelist pass") and from the "?" menu, and **never blocks the game**: closing it returns to play with a line "To be continued." If the player is offline or the relayer is down, the modal says so and offers "Try again", it does not fall back to a fake success.
**UI states:** `idle` → `validating` (client-side syntax check as they type, calm inline error) → `submitting` (spinner and the loading line) → `minted` | `queued` | `error{code}`. The `minted` view shows: the hash (monospace, copy button), token id, the NearBlocks link (`https://nearblocks.io/txns/{hash}`; testnet rehearsal uses the testnet explorer and a visible **"TESTNET REHEARSAL, not mainnet"** banner), and "The pass is already in your wallet. It is yours to keep or send; whoever holds it holds the spot. Open your wallet's collectibles to see it. If it is not there yet, refresh: wallets index new tokens after a short delay." `queued` stores `claim_id` locally and polls `status` every 15 s while the page is open; on return the modal reopens in `queued` or `minted`.
**Accessibility and safety:** `role="dialog"`, `aria-modal`, focus trap, Esc closes the modal only, reduced motion (no sting animation, plain fade), touch layout at 390 px, one text field, no wallet connect, no signature request, no seed phrase field, a line "We never ask for a seed phrase or a private key." No third-party scripts except the optional captcha widget when the server asks for it.
**Config:** `game/src/net/pass-deployment.js` (like `near-deployment.js`): `{network: 'mainnet'|'testnet'|null, contract, relayerBase, explorerBase}`. `null` hides the modal and the HUD item entirely (the build says "Built, dormant" in the README). **A visible demo path** `?story=1&passDemo=1` shows the cut and the modal with a **clearly labelled simulation and no hash** ("Demo only. A real claim shows a transaction hash here.") so a judge can see the experience without mainnet; it calls nothing.
**Files:** `game/src/ui/endgame-pass.js`, `game/src/net/pass-client.js`, `game/src/net/pass-deployment.js`, keys `pass.*` (five locales), hooks in `scenes/town-portal.js` (the `onPeak` use) and the HUD, tests `game/tests/client/endgame-pass.test.mjs`.
**Tests and acceptance:** pure state machine of the modal for every status in the §11.3 table (a fake `pass-client`); account-id syntax matches the server's vectors (the same fixture file, `tests/fixtures/account-ids.json`, read by both); **a `minted` view cannot render without a hash from the client and a hash can only come from a response with status `minted`** (type-level test of the view model); no hash-like literal in the source (scan); the demo path shows no hash; flag off or `network: null` creates nothing; legal-copy test (§10) on `pass.*`; screenshots of every state on desktop and 390 px attached to the PR.

```
Item E3 (stream E), depends on P5 (the onPeak hook), E2's response shapes and the pass copy of D2. Read section 11.1 and 11.4 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Implement game/src/ui/endgame-pass.js, game/src/net/pass-client.js, game/src/net/pass-deployment.js: the cut to black at the onPeak moment, the wallet modal with states idle/validating/submitting/minted/queued/error, copy exactly as in the TZ (free, no purchase, no seed phrase, hash shown only for status minted, NearBlocks link from explorerBase, queued claims saved and polled), client-side account-id syntax that uses the same fixture file as the relayer tests, a labelled demo path ?story=1&passDemo=1 that shows no hash and calls nothing, and a null network that hides everything. Never fabricate or cache a transaction hash; a source-scan test must find no hash-like literals. Add keys pass.* to the five locales, the tests listed in the TZ, and desktop plus 390px screenshots. Flag off changes nothing. English only; no push to main; paste real test output.
```

### 11.5 Cost estimate per mint and budget for N players (mainnet; **[VERIFY by measurement]**)

Method (no invented figures): `cost per mint ≈ bytes_added × 1e19 yoctoNEAR + gas_burnt × gas_price`. NEAR charges **storage by the byte at 1e19 yoctoNEAR per byte (0.00001 NEAR) [VERIFY the current parameter on mainnet]**; the byte count is **measured** by E1's test (`storage_usage` delta of one `mint_pass`) and again on the testnet rehearsal; gas comes from the receipt's `gas_burnt` in the rehearsal (the prepaid 20 to 30 Tgas is only an upper bound, and unused gas is not charged; at the 1e8 yocto per gas floor price, 1 Tgas = 0.0001 NEAR **[VERIFY]**).

Illustrative arithmetic **from stated assumptions, not a quote**: assume 800 to 1,200 bytes per mint (token, owner indexes, metadata, the two sets) = **0.008 to 0.012 NEAR** storage, plus about 0.001 to 0.003 NEAR gas, so **about 0.01 to 0.015 NEAR per player**. The `minted_to` and `claim_ids` sets add bytes per mint, and a transfer also moves index entries (contract-paid): **E1's tests print both the mint and the transfer `storage_usage` deltas**. Fixed: the contract's own locked storage (wasm size in bytes × 1e19; for example a 150 to 250 KB wasm locks about 1.5 to 2.5 NEAR) plus the three accounts' minimum balances and the 0.05 NEAR reserve. Budget = `fixed + N × per_mint`, plus a 25 % buffer:

| Players claiming (N) | Per-mint part | With fixed (about 2 to 3 NEAR) and +25 % |
|---|---|---|
| 100 | 1.0 to 1.5 NEAR | about 3.8 to 5.6 NEAR |
| 1,000 | 10 to 15 NEAR | about 15 to 22.5 NEAR |
| 5,000 | 50 to 75 NEAR | about 66 to 97.5 NEAR |

The recommended launch settings **cap = 1,000, daily_cap = 100** bound the loss at the 1,000 row. Convert to fiat only at the time of funding from a price the owner checks. **Funding is OWNER-GATED; storage locked is not burned** (it is returned only if the data is deleted, and this contract cannot delete tokens, so treat it as spent).

### 11.6 Threat model for a transferable pass: claim farming, then selling (what it does, what it cannot)

**The new fact:** because the pass can be transferred, a claim can be **farmed and sold**. A pass holder is not a verified person, and a secondary market, if one forms, rewards whoever produces claims cheapest. The controls below cap the loss and raise the cost per claim; none of them makes it zero.

| Threat | Control | Residual risk, stated plainly |
|---|---|---|
| One player claims many passes with many guest accounts | **One claim per guest** (server index and `claim_id` on chain) and **one mint per wallet on chain, even after the pass moved** (`minted_to`): selling a pass and re-claiming to the same wallet fails | free implicit wallets and free guests exist: a farmer needs a fresh guest **and** a fresh wallet per claim |
| Cheap claims | **Effort cost:** a claim requires **the Gate paid on chain**: 200 silk earned through play (about 90 to 150 minutes of focused play per account, simulated median 102, §3.6, **[VERIFY by a play-test]**), with story credits only, T1 kills capped, per-account day and lifetime caps (§3.5), and story-locked silk that cannot be traded; the free-credit tournament route needs 7 seasons even for the best bots (CE §2.13.5) | a script that plays the game by the rules at scale; labelled bot activity and cluster flags help, they do not prove |
| Guest-creation floods | per-IP bucket and daily cap on guest creation (`relayer/README.md`); **optional captcha** on creation and on the claim (off by default, **[OWNER DECISION]**: a third party and a privacy cost) | a patient attacker with many IPs |
| Claim-rate abuse | per-IP token bucket and per-guest limit on `POST /api/pass/claim` (§11.3 step 6); cluster flags can put a claim on `hold` for review | same as above |
| Flooding the mint with fresh unfunded wallets | optional dial `FTF_PASS_REQUIRE_FUNDED_IMPLICIT` (default off): implicit accounts must already exist on chain; costs real newcomers some friction | farmers can fund wallets cheaply; use only if farming is seen |
| Draining the relayer budget | **four independent budget layers:** the minter function-call key's **hard allowance** (gas only, one method), the contract's own **balance and reserve** (the contract stops minting below it), the on-chain `cap` (1,000) and `daily_cap` (100), and a server daily cap at most the contract's; a **kill switch** (`FTF_PASS_ENABLED=0`, `STOP`, contract `pause`) | a stolen minter key can mint at most up to these limits, nothing else |
| Bulk buyers turn passes into outsized influence | **no extra utility for bulk holders:** one allowlist spot per holder wallet however many passes it holds; the utility list is fixed in advance | none by design |
| A holder who is not the player collects perks | by design: perks follow the token holder (§11.1); **rank and the Season 3 distribution stay with the play account and its bound wallet**, so buying a pass buys no leaderboard position and no payout | a buyer enjoys the allowlist spot the seller earned: that is the owner's transferability decision |
| Marketplace phishing and approval scams | **approvals off (no NEP-178)**: no standing approval to steal; no listing support from us | users can still be tricked into sending the token by hand; docs warn |
| Secondary-market price becomes an expectation | no price, resale or value in any copy; we never list or promote resale; the legal question is flagged for counsel (§10, D2) | a market can form regardless of what we say; real-value steps need review first |

Say all of this in `docs/whitelist-pass.md`. **Honest limit:** free guest identities and free wallets are not scarce; the caps and the budget bound the damage, and the pass promises no monetary value. A future version that gates real value needs a stronger identity step (§9.4, control 2).

### 11.7 Funding, key custody, deploy: OWNER-GATED runbook (E4, P1 docs, 3 h; agents write the document and print commands, never run them)

`docs/mainnet-pass-runbook.md` (extends CM10's `docs/mainnet-plan.md`; **rehearse everything on testnet first with the same code and `network: 'testnet'`**):

1. Decide and record: contract name (a subaccount of the owner's own account, e.g. `pass.<owner>.near`; **[VERIFY availability and naming rules]**), the cold `owner_id`, the `minter` account, `cap`, `daily_cap`, **the approvals decision (default OFF) and royalties (default none), both final once the keys are deleted**, the utility text, the allowlist snapshot rule (§11.1), the media URL.
2. **Testnet rehearsal** with throwaway accounts: build (`build.sh`, record the wasm SHA-256), deploy, `new`, add the function-call key (receiver = contract, method `mint_pass`, an allowance), mint two test passes through the relayer in `testnet` mode, check every failure state by hand (§11.3 table), measure `storage_usage` and gas (§11.5).
3. **Mainnet, in order (each step prints the exact command, cost and risk for the owner):** create the three accounts in the owner's wallet; fund the contract account (fixed + `cap × per_mint` from the rehearsal measurement, plus buffer) and the minter account (at least the allowance); deploy the wasm; call `new`; add the **function-call** key to the minter account with the receiver and method restriction and the hard allowance; mint one pass to the owner's own wallet through the relayer (the real end-to-end test) and confirm it in the wallet and on NearBlocks; **then delete every access key of the contract account**.
4. **Post-deploy checks (all read-only, copied into the PR and the README `Proof:`):** `view_account` `code_hash` equals the recorded SHA-256 (base58 vs hex conversion documented); the contract's `view_access_key_list` is **empty**; the minter's key list is exactly one function-call key with the right `receiver_id`, `method_names` and `allowance`; `pass_info` shows the intended caps and `paused: false`; `nft_total_supply` equals 1 after the owner test; `is_whitelisted(<owner wallet>)` is true; the contract ABI exposes **no** approval or burn method and **does** expose `nft_transfer` (read from the rehearsed ABI list); the relayer's `/api/health` reports `pass: {network: 'mainnet', contract, enabled}` and never the key.
5. **Key custody:** `FTF_PASS_KEY` (the function-call private key) only in the relayer host environment (the owner's server, **not** the repository, CI, chat or screenshots); the owner's cold key stays offline; rotation: `set_minter` to a new account plus deleting the old key; compromise response: `pause` (owner), delete the key, keep the caps.
6. **Kill and cap controls on the day:** `FTF_PASS_ENABLED=0`, `STOP` file, contract `pause`, and the caps. Owner watches `/api/health`, the minter allowance and the contract balance (a read-only script `tools/pass/watch.mjs`, polls public RPC, no keys).
7. **Only then** update README, About, post and form copy to "Real on mainnet" (CTZ Move 7 vocabulary), with the transaction hash of the contract deployment and the first pass as `Proof:`.
8. **If the owner cannot complete funding and deployment by Fri 20:00 Kyiv:** ship `pass-deployment.js` with `network: null` (hidden) or `testnet` with the rehearsal banner, and label the feature "Built, dormant" or "Real on testnet". Never present a rehearsal as mainnet.

```
Item E4 (stream H docs + tools/pass). Read section 11.5 to 11.7 (and the threat model of 11.6) of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md. Write docs/mainnet-pass-runbook.md and docs/whitelist-pass.md (plain language: what the contract can and cannot do, the utility definition and that rights follow the token holder, the transferability and no-approvals decision, the farm-then-sell threat model of 11.6 and its honest limits) and tools/pass/watch.mjs (read-only polling of public RPC for the minter key allowance, contract balance and pass_info; no keys). The runbook lists every owner step in order with the exact command, the cost estimate method of 11.5 (no invented numbers; examples labelled illustrative), the risk, and the read-only post-deploy checks. Mark every command read-only or SIGNS (and with which key). You execute nothing, create no account, fund nothing, delete no key, and change no README or form text about mainnet. This item is OWNER-GATED to execute; say so at the top. English only; no push to main.
```

### 11.8 Why this is a mainnet differentiator, and what may be claimed when

Rivals a rival entry and a rival entry (CTZ §11.1, the scorecard) have a mainnet contract, keys deleted and a security review. This build adds: **a free mainnet mint triggered by playing the game** (the contract is minted to by the game's own relayer from a replayed play log), **a contract with no upgrade keys, caps and one mint per wallet enforced on chain, transferable and with no approvals**, **a minter key that can call exactly one method with a hard gas allowance**, an idempotent claim with an honest queue, a **public self-review** (`docs/security-review.md`, CTZ CM10; never "audited") and a published verifier for the log. Claimable **only after §11.7 step 4 passes and the owner confirms**: "Real on mainnet: a free whitelist pass minted to your wallet by the game, from an immutable contract, with every cap on chain." (Never claim it is valuable or tradable for value.) Before that: "Built, dormant" (README vocabulary). The pitch (§12) states exactly this and adds nothing the owner has not verified.

### 11.9 Definition of done for the whole of §11

E1 to E3 merged behind the flag with green tests; the testnet rehearsal done by the owner with the real hash read back in the modal (testnet banner); the owner has decided the mainnet launch settings; if mainnet is live: the post-deploy checks pasted as `Proof:` and the first real pass visible on NearBlocks and in the owner's wallet. If not live: `network: null` and "Built, dormant", with the video and post using the labelled demo path only.

---

## 12. Changes to the pitch, video, README and form (item D3, P1, SAFE, 2 h, stream H; owner posts and submits)

| Surface | Change | Condition |
|---|---|---|
| **Pitch canon (`docs/submission/pitch.md`, CTZ Move 11)** | Games first: add "Story: Iris, a doctor-linguist from another planet, year 2048, must earn and pay 200 silk, on chain, to open the Gate-Loom; the Loom does not take her home" and "a leaderboard whose rules and snapshot are committed on NEAR testnet before they are published" and "scripted citizens' quests that an agent can complete through the same commands (the agent API)". NFTs second: add the pass **only** per the condition. | Story lines only if the flag build runs end to end; the pass line per §11.8; the Season 3 line only as "roadmap: linear by rank, testnet, no value" |
| **Mainnet line (pitch, apply form `idea`, README Tracks, video beat 7b)** | "A free whitelist pass is minted to your NEAR mainnet wallet by the game: the contract has no upgrade keys, caps are enforced on chain, the minter key can call one method." + the contract address and a real mint hash as `Proof:` | **Only after §11.7 step 4 and the owner's yes.** Otherwise "Built, dormant" |
| **Video (CTZ Move 9)** | Optional beat 7b (about 8 s): the cut to black and the modal, then the success view with a **real** hash, captioned "Free. Mainnet. Real hash." If only the testnet rehearsal exists, caption "Testnet rehearsal" and show the banner | the owner records it; agents never post |
| **README status table** | rows: "Expedition story and citizen quests: Local (flag `?story=1`)", "Leaderboard (board season): Built, rules committed on testnet when K3 runs", "Season 3 treasury distribution: Roadmap, not built, no value today", "Mainnet whitelist pass: Built, dormant" until verified; then "Real on mainnet" with the hash | vocabulary per CTZ rule 7 |
| **Apply form `idea` (CTZ Move 1)** | at most 1,950 characters; recount; no "AI NPC", no "earn", no value promise | after the facts above are settled |
| **Judge FAQ** | "Is silk a token?" "No. It is an in-game balance (silk is the town's one currency), with a replayed log behind the pass and the board." "Is the pass worth money?" "No value is promised. It is free, and it can be transferred; we do not list or price it." | |

```
Item D3 (stream H). Read sections 8, 9, 10, 11.8 and 12 of /workspace/exports/FTF-Story-Quests-Leaderboard-TZ.md and docs/submission/pitch.md. Update the pitch canon, the README status rows, the judge FAQ and the video beat sheet text as in the table of section 12, keeping the lore canon (Iris is a doctor-linguist from another planet, year 2048; clans and citizens are scripted, not an LLM), the README vocabulary, and a Proof: line for every claim. Mainnet statements must be conditional exactly as written (only after the owner's post-deploy checks); otherwise use Built, dormant. The story is silk (200 silk paid on chain at the portal; the owner first said 10,000), silk is the one currency of the tournament and the town works too, the pass is transferable, Season 3 is roadmap linear by rank; none of it may sound like a return or a promise. Do not post, schedule or submit anything. Run scripts/check-copy.mjs and paste real output. English only; no push to main.
```

---

## 13. Order of work, allocation and the critical path

Parallel from the start (all P0 are independent until Q0 lands, so give Q0 and E1 to agents first):

| Wave | Time (Kyiv) | Agents | Work |
|---|---|---|---|
| 1 | Thu 17:30 to 21:30 | Q0, Q1 (starts on the data), R1, E1, P1 (stub reducer), D2 | pure core, contract, portal object, legal notes |
| 2 | Thu 21:30 to Fri 03:00 (agents run overnight) | Q2, R1 (if not already merged), P2, P3, E2, Q4, K1 | salvage, guide, citizen wiring, relayer claim, kill windows, score library |
| 3 | Fri 03:00 to 12:00 | P5, E3, K2, Q3, D1, E4, K3, K4 | twist, modal, monument, commands, roadmap, runbook |
| 4 | Fri 12:00 to 16:00 | integration, golden-path QA, screenshots, D3, P4 if time | one end-to-end scripted run, `?story=1` full chain, fixes only |
| Freeze | **Fri 16:00** | merge captain | feature freeze: only fixes |
| Owner | Fri 12:00 to 20:00 | owner | testnet rehearsal of the pass; mainnet decision, funding, deploy, checks (§11.7); K3 run if the arena exists |
| Hard freeze | Fri 20:00 | | numbers script `scripts/verify-all.sh --write`, tag (owner) |

**Critical path:** Q0 → Q1 → P3 → P5 → E3, and Q0 → Q4 → E2 → (owner) deploy. If Wave 2 slips past Fri 06:00, drop P4, K3 to K5, Q3 and keep the rest.
**Golden-path acceptance (Wave 4, a scripted headless run under `?story=1&passDemo=1&portalFee=500`, plus a second run at the real 200-silk fee against a mocked or sandboxed ftf-town with a fast-forwarded seeded log):** arrival → elder → spiders (forced kills) → part (forced salvage) → boss → silk above the fee (credited on chain) → pay 200 silk with pay_gate → archipelago → cut → modal in demo mode (no hash) → reload keeps state; and the same run with the flag off equals today's behaviour. Attach the run output and screenshots.

---

## 14. Owner checklist: decisions and gated actions

**Decided by the owner (12 Nov, applied in this revision; no action):** one currency **silk**; **the portal is paid on chain in silk by `ftf-town` (`pay_gate`), the price is lowered** (recommended 200, CE §2.13), no separate book or firewall; tournament, pledges, Season 3, leaderboard in silk; no second token; "skitter" shown as **spider**; the pass is **transferable**; Season 3 is **linear by rank (B)**.

**Defaults this spec chose for you (they stand unless you say otherwise; the first two matter before deploy because the contract is immutable)**
- [ ] **Approvals off, royalties none** for the transferable pass (§11.2). Say so **before** the deploy if you want marketplace listing (NEP-178) or royalties.
- [ ] **Which silk:** this spec uses **on-chain town silk** (`ftf-town`), not the season's `S.silk` (§3.1). Tell me if you meant something else.
- [ ] **Portal price** (§3.1): **200 silk** recommended (CE §2.13.4: ×1.14-1.38 supply, median 102 min); 250 and 300 are the alternatives. Optional display multiplier "10,000 threads" (§3.1): default no. Confirm the contract additions (`pay_gate`, `gate_paid_of`, `gate_burned`, `story_locked`, `story_day_cap` 6,000, per-account caps) before the Fri 13 Nov 14:00 cut line.
- [ ] **Season 3 parameters:** `K_MAX` 100, `K_MIN` 40, `FLOOR` 100 points, 3 of 4 classes, 3 distinct days (§9.4); payout in testnet silk from a treasury balance set aside by rule (CE §2.13).

**Still to confirm**
- [ ] **[OWNER CONFIRM] "Shell"** = a Shell-shaped monument that displays the leaderboard (§8.1).
- [ ] **[OWNER CONFIRM] the whitelist utility list** (§11.1): early access plus the next announced list "if and when" one exists.
- [ ] Confirm the **quest and kill rewards** (scaled by P/10,000: 8 / 20 / 16 / 60, bounty 6, kills 0.2 / 0.5 / 1.2 / 4, stipend 10) and that **kills count toward story credits up to `killVerifyCapC` = 100 silk** (§3.3): the more it counts, the easier to farm.
- [ ] Confirm **Act II = the archipelago and its Tournament** as the "next mission" (§5.1), and the rewards (title, 10 silk stipend plus the 40-silk entry credit, a common chest).
- [ ] Decide whether the **default link** stays judge-only (recommended) or the Expedition becomes the default for non-judge links at the freeze.
- [ ] Decide `cap` 1,000, `daily_cap` 100, and the optional captcha (default off); the allowlist snapshot time (§11.1).

**Owner-gated actions (agents prepare commands and documents; you run them)**
- [ ] Testnet **rehearsal** of the pass: create throwaway accounts, deploy, mint two through the relayer in `testnet` mode (§11.7 step 2).
- [ ] **Mainnet**: create the three accounts; **fund** the contract and the minter (amounts from the rehearsal measurement, §11.5); **deploy**; `new`; add the **function-call** key with the hard allowance; test mint to your own wallet; **delete the contract's keys**; run the post-deploy checks; set `FTF_PASS_KEY` only on the relayer host; flip `pass-deployment.js` to `mainnet`. **None of this is done by an agent.**
- [ ] Relayer host: persistent directory for logs and the queue (`FTF_EXPEDITION_DIR`, `FTF_PASS_DIR`), `FTF_PASS_ENABLED`, optional webhook and captcha secret; redeploy the relayer.
- [ ] Publish `game/public/board/latest.json` through the normal Pages deploy; run K3 (rules commitment and snapshot roots) and K5 only if the arena exists, with the arena key on the runner host.
- [ ] Record and **post** the video and the X post; submit the form once (CTZ Move 1, 9): you only. Update README and form wording to "Real on mainnet" **only after** the post-deploy checks.
- [ ] Legal and security review before any real-value distribution (§9.4) and a legal look at a transferable pass that may be resold (§10): not a hackathon task.

---

## 15. [VERIFY] list and read-only commands

**[VERIFY] items (not confirmed by reading the repo; resolve before relying on them):** whether the CE contract `ftf-town.testnet` ships with `pay_gate` by its Fri 14:00 cut line (decides on-chain gate or labelled demo, §3.1); the contract's silk precision and duplicate-reference rule (§3.3, §3.4); the guest key path for `pay_gate` (§3.4); the CE tournament scoring and when silk is first paid on chain for rank (the `Pp` term, §8.2); the additive `spend` in `town-economy.js` (demo path) and who edits that file; the simulation's story model (completion probability, abandoner shares) is an assumption, not measured; the real daily maximum of town silk without the Expedition; `bark.role.guard` in the uk, ru and zh locales (R1); NEP-171 transfer handling with contract-paid storage; whether the arena exists and when; the exact reusable helper for ground beacons (`scenes/door-glow.js`); the wheel entry point the lamplighter's line refers to; the HUD wallet tooltip slot for silk (no new chip); the Lance and Snare cooldowns for `maxDps`; real kills per minute (play-test); the hunt-vs-`MobBrain` band; whether `play/mobs.js` events carry a respawn counter for `killId`; whether `near-tx.js` supports function-call keys; contract details (`account_balance` vs locked storage, NEP-171 enumeration crate behaviour with contract-paid storage); mainnet storage price and gas price; mainnet RPC limits and fallbacks; the NearBlocks mainnet URL format; wallet display of NFTs on unfunded implicit accounts; account names available under the owner's `.near`; host disk and backup for the relayer; whether guest `record_track` receipts refund the unused deposit; privacy handling of IP buckets.

**Read-only commands used while writing this spec (repeatable):**
```bash
cd /workspace/ftf-audit/repo && git fetch origin main --prune && git log -1 --format='%H %ad' --date=iso origin/main
git ls-tree -r --name-only origin/main | rg -i 'combat|mobs|quest|portal|leaderboard|silk'
rg -n 'MOB_TYPES|PACKS|ftf:mob-killed' game/src/play/mobs.js
rg -n 'questKeys|QUEST_NPC|TALKS' game/src/scenes/town-quest.js
rg -n -i 'silk|leaderboard' --glob '!art/**' .       # silk: the four kinds of §1.1; leaderboard: docs and a local tournament sim only
git show origin/main:game/public/assets/items/manifest.json | python3 -m json.tool | head -80
```
Public-RPC read-only checks for the pass, after deployment (replace `<contract>`): `view_account` (code hash), `view_access_key_list` (must be empty for the contract), `call_function pass_info`, `call_function is_claimed`, `call_function is_whitelisted`, via `curl https://rpc.mainnet.near.org` with the standard JSON-RPC body (templates in CTZ §13.1).

*End of spec.*
