# Judge simulation — Forget to Foresee

Build under test: live https://spacexceo.github.io/forget-to-foresee/ and repo `main` @ `83465f6` (11 Nov 2026, 18:35 Kyiv).
Method: Part A is an AI screener (Claude Code / Codex style) that has only a shell, the repo and public network; it follows `README.md` literally, in order, and scores. Part B is a human judge with 5 minutes and a normal laptop. Where a browser was needed I drove headless Chrome on software GL (~5 fps) through the game's own debug handle, so keyboard timing was simulated by calling `window.__ftf.play.handleKey(code)` — the same function `main.js` uses for real keys. Screenshots: `/workspace/ftf-audit/shots/`.

Judging context from `HACKATHON.md`: Claude Code and Codex screen first (reproducibility, feature verification, structured report, preliminary score); humans decide; a low AI score alone cannot reject. Games track: "judged on the game loop, not the token — bonus if players never notice the chain". NFTs track: "NFTs as accounts … ownership with behavior".

---

## Part A — Simulated AI screener report

### A.0 Summary

| | |
|---|---|
| Project | Forget to Foresee, strategy game with AI clan agents; seasons sealed on NEAR testnet; memory shards as NEP-171 |
| Tracks claimed | games (primary), nfts |
| Repo public / LICENSE | yes / MIT, `LICENSE` present |
| Reproducible from README | **yes, with 3 caveats** (stale counts, Rust prerequisites, one number mismatch) |
| Features verified | 9 of 11 (2 partially, see A.3) |
| Preliminary score (screener) | **7.4 / 10** |
| Recommendation to humans | **Advance. Review the Day 1 free mint claim (not live) and the NFT track depth.** |

### A.1 Steps executed literally

| # | README instruction | Result | Verdict |
|---|---|---|---|
| 1 | `git clone` repo | Works; **2.3 GiB** download, 66 s here on a datacenter link (not documented; `--depth 1` would be ~0.43 GB) | PASS (slow) |
| 2 | `cd game && npm ci` (`README.md:132-141`) | 2.1 s, 0 vulnerabilities | PASS |
| 3 | `npm test` → "`pass 668`, `fail 0`" (`README.md:73,138,142`) | `tests 728`, `pass 728`, `fail 0`, 14 s | **PASS with stale number** (the claim "tests 667 / pass 668" at `:142` is also self-contradictory) |
| 4 | `npm run build` → "game/dist (~295 MB)" (`:140`) | `✓ built in 4.87s`, **431 MB** | PASS, stale size |
| 5 | `cd server && npm test` → "pass 28" (`:73,155`) | `pass 31` | PASS, stale number |
| 6 | `cd server && npm start`; `node examples/agent.mjs --time-scale 1000` (`:65-71`) | Full season in **1.2 s**; JSON has `"rejected": 0`, `"firstProofVerified": true`, `"outcome":"gift"`, `"voted":true` | **PASS** (best path in the repo) |
| 7 | `cd contracts/season-commit && cargo test --lib` → "56 passed" (`:73,164`) | On a bare machine: **FAIL** (rustc 1.85 too old; after `rustup` stable 1.99: **FAIL** at `openssl-sys` until `pkg-config` or `OPENSSL_DIR` is set). With that fixed: **56 passed**. `memory-shard`: **21 passed**. `agent-card`: **21 passed**. `guests`: **9 passed** | **PARTIAL** (README omits prerequisites) |
| 8 | Open live judge link `?demo=judge&mode=walk` | HTTP 200, no 4xx, no console errors. Town visible in 7–10 s. HUD chip "Walk to the Tournament altar" | PASS |
| 9 | Walk to altar, press E (`:41`) | `town.walkRoute()` reached the altar at 4.7–5 fps in ~90 s, `register()` then carried Iris to the archipelago. HUD: "Trial 1 of 17", "Silk 63", "Step 1 of 7" | PASS |
| 10 | G; at pad E (`:42-43`): "Silk drops to **53**" | `anchor:3` is the default option (`defaultIndex 0`); after E silk **53**, goal "End trial 1" | **PASS** |
| 11 | T twice (`:44`): "Trial 2 of 17, silk **56**" | Trial 2, silk **56** | **PASS** |
| 12 | T twice more, twice → "Trial 4 of 17, silk **72**" (`:45`) | Trial 4, silk **82**, goal "The Price of Memory" (two runs, same result) | **FAIL (number)**, behaviour matches |
| 13 | M → "Forget it for a vision" on any memory; confirm (`:46`) | Panel lists three memories (weights 4, 2, 1). Confirm dialog "Forget 'The Shells' Call on the night of arrival' forever?" with "What changes / What Iris gains / Cost 1 attention" | **PASS** |
| 14 | T until trial-6 auction closes: toast "Minted on NEAR testnet · Shard #7 · call → Frost for 13 silk" (`:47`) | **If forgotten at trial 4:** at trial 6 the Memories panel shows "Memory shards on NEAR — NFT · NEP-171 · ftf-shards.testnet — Shard #7 · call — Token `793f6c05e89839f2-7` — Owner lambada_eth.testnet — Bound to the sealed season · leaf #3 — View on nearblocks"; "Minted on NEAR testnet" text found in the page. **If forgotten at trial 5:** "Unminted shard preview … On-chain mint is for the published judge season only. No token, no transaction." (`sh-09-shard-card.png`) | **PASS, but timing-dependent** |

Screener note on step 14: the README says "(as in the recorded judge playthrough)" and spells out the 'call' memory, but the table does not say *at which trial* the player must forget. A screener replaying steps 1–13 literally, then picking the first memory, gets the preview card and may conclude "NFT not minted on testnet".

### A.2 Criterion scoring

| Criterion | Score | Notes |
|---|---:|---|
| Reproducibility (JS) | 9 | One-command install, tests, build; numbers stale |
| Reproducibility (contracts) | 6 | Toolchain and system prerequisites missing from README |
| README structure for machines | 6 | All needed facts are there; poor density; 4 table cells are 1.6–2.6 k chars; no single "how to verify in 60 s" block |
| Feature verification (claims vs behaviour) | 8.5 | 9 of 11 claims verified end to end; 2 verified at contract/RPC level only (see below) |
| Honesty of real/mock | 9.5 | Explicit "not built", "UI simulation", "mock AI, real rules", "Unminted preview" labels |
| Claim overreach | 8.5 | Only the GitHub description overclaims ("NFT agents") |
| NEAR integration depth | 7 | Three deployed contracts verified over RPC; read-only from game; coordinator-minted |
| Games track fit | 7 | Strong loop and agents, closed in-game economy; no NPC wallets on chain, no NEP-245, no social login |
| NFT track fit | 5 | Static commemorative shards; "NFT as account" code exists but dormant (see A.4) |
| Tests and CI evidence | 8.5 | 728 + 31 + 7 + 107 Rust tests; CI green; no coverage; e2e not in CI |
| Licence and baseline disclosure | 9 | MIT, third-party table, AI disclosure; `hackathon-submission` tag pending |
| Code health | 7 | Tested, deterministic; dense lines; no linter |
| **Preliminary score** | **7.4** | |

### A.3 Features claimed vs verified

| Claim (README) | How verified | Status |
|---|---|---|
| Full 17-trial season runs in the browser | Agent API ran a full season in 1.2 s; browser run through trial 7 | Verified |
| Season root committed before play, verified on reveal | `get_season` RPC: `leaf_count 15`, `revealed_count 15`, `ash_key_committed true`; local "Verified" step not re-clicked (V panel) | Verified (chain), partially (UI) |
| `ftf-seasons.testnet` live | View call OK | Verified |
| `ftf-shards.testnet` NEP-171, 3 judge shards | `nft_total_supply` = 3; game card shows token `…-7` with leaf #3 | Verified |
| Judge shards owned by `lambada_eth.testnet` | Card shows that owner | Verified |
| Agent card minted | `agents.ftf-coordinator.testnet` supply 1, token `793f6c05e89839f2-agent-iris` | Verified (chain), not seen in UI |
| Agent HTTP API, 0 rejected, proof verified | Run | Verified |
| Unminted shard preview for other playthroughs | Reproduced | Verified |
| Day 1 free mint (player-owned guest account) | Contracts deployed (`guests` stats 3/200). **Live page has no relayer URL**; UI would say "not connected" | **Not live** (honestly disclosed as "built; real once the owner deploys") |
| Weekly tournament is a simulation | Labelled in README and UI per README | Verified as disclosed |
| Hired townsfolk agents, Foresight Exchange | Not driven in this audit | Not verified |

### A.4 Findings a screener would write down

1. **Stale numbers** in README (668/28/295 MB) and `docs/submission/owner-steps.md:38-39` (516). Severity: low, but the screener's rubric includes "claims match reality".
2. **Silk 72 vs 82** at trial 4 (`README.md:45`). Severity: low.
3. **NFT track depth.** The NFT is a receipt (shard) minted by the coordinator to the owner's account, and the Iris card is also owner-held. "NFTs as accounts with behaviour" is explained in `docs/`, but only `season-commit` and `memory-shard` run for judges; `guests`, `token-account`, `character-nft` are deployed or written but not exercised (no activated token account, no player mint). Severity: medium-high for the NFT track.
4. **Rust build prerequisites** not documented; unpinned toolchain. Severity: medium.
5. **Clone is 2.3 GiB** and `dist` is 431 MB (55 MB dev-only). Severity: low-medium.
6. **No WebGL2 message**; software rendering works but is slow. Severity: low-medium.
7. **GitHub description** says "NFT agents" while README says Iris is not a token. Severity: low, easily fixed.
8. **Positive:** the agent-API path and the independent verifiers (`tools/verify/verify.mjs|py`) are exactly what a machine screener rewards.

---

## Part B — Human judge, 5-minute pass

Persona: crypto-literate judge on a MacBook with a normal GPU, looking at 40 projects. I used the live link plus the headless run for visuals.

### B.1 Timeline

| Time | What the judge sees | Reaction |
|---|---|---|
| 0:00–0:10 | Dark sci-fi loading screen: teal Iris silhouette, logogram glyphs, the title "Forget to Foresee · LOADING", a log ("Warming the town…", "Reading the Guests' signs…") and a real progress bar (`walk-10s.png`). Town loaded in ~7–10 s on a fast link (a slow link means ~123 MB in the first two minutes) | Fine on fast links. On hotel wifi: patience test. The title is visible here, but it vanishes before gameplay |
| 0:10 | Sunlit cobbled street, banners, a courier NPC with "E Talk to the Courier", a grand staircase to a temple with a glowing altar. Top-left chip: "Walk to the Tournament altar". Top-right: Controls, "Profile · Lv 1". Pill: "Next Tournament round · Open now". (`lit-01-town.png`) | **Strong first frame**, but a **tonal jump**: dark alien loading screen and dark video, then a bright half-timbered medieval town. What *is* this game? No title, no premise |
| 0:10–1:00 | Walks up the stairs (works with mouse or WASD; the old stair bug is fixed by the `fixedSteps` carry) | "OK, a nice third-person adventure." The word "Tournament" suggests a competition, not an AI-prophecy game |
| 1:00 | E at the altar. A short cover then the floating archipelago: "Trial 1 of 17 · Silk 63", quest "Test Iris's guess at Shell I's pad", Iris's line "The plaza is below us. The Shells hang beyond the camps. Walk with me." (`lit-03-island.png`) | **Wow moment** for visuals; a lot of UI; "Step 1 of 7" helps |
| 1:00–3:00 | G walks to the pad; E anchors; T, T passes trials; "Watch trial 3 come true" | The loop clicks if the judge follows the quest chain. Jargon: silk, anchor, trial, Shell, Guests |
| 3:00 | After trial 4: "The Price of Memory — Press M. Forget a memory: Iris sees the next signs early." Memories panel with three memories and a confirm dialog that states what is lost and gained | **The best idea in the game.** Clear and emotional |
| 3:30–4:30 | T, T … trial 6: Frost buys the shard; toast "Minted on NEAR testnet"; card "Shard #7 · call", token id, owner, "Bound to the sealed season · leaf #3", View on nearblocks (`mint-09-shard-card.png`) | This is where the NEAR use becomes tangible. But the owner is `lambada_eth.testnet`, not me. "So… the developer minted it?" |
| 4:30–5:00 | Tries the NFT card; clicks nearblocks; sees a real token | Satisfying but no "does something" payoff |

### B.2 Notes by question

- **First impression:** 8/10. Visual quality is far above the typical hackathon entry. The town is coherent, the stairs and altar frame the objective. Missing: a title and one premise sentence in the first five seconds.
- **Clarity:** 7.5/10. The goal chip and "Step N of 7" carry a first-time player through. Terms are introduced just in time, but "Silk", "Anchor", "Tick/Trial", "Guests", "Shell" arrive together.
- **Does NEAR matter?** For the judge's mental model: yes, *in one place*. The verifiable season is a clever idea ("every prophecy is fixed before play begins and can be checked afterwards") and the on-chain check is real. But the game's rules are local and the player never owns anything on the chain in the judge path. The README says this itself, which earns trust, but it also tells the judge the NEAR role is a receipt and a notary.
- **Does the NFT "do something"?** Not yet. It proves the season, carries a biography, and renders an on-chain SVG. It does not hold money, grant access, earn, or change the game. The NFT-as-account design (`token-account`, `act_as_token`, guest sub-accounts) is exactly what the track asks for, and it is built — but invisible on the live build. This is the single largest scoring lever (QW-2, QW-6).
- **Fun:** 7/10 as a single run. The decision "forget a memory for a vision" is compelling; the 17-trial season is long for a judge, and the judge path ends the interesting part by trial 6. Hired townsfolk agents and the Foresight Exchange drill are bonus depth that a 5-minute judge will not reach.
- **Honesty:** 9/10. "Unminted shard preview" and the real/mock table are best-in-class. One slip: the GitHub description.
- **Overclaims vs reality:** none in the app. In the GitHub description ("NFT agents"). The video (Shell interior, dark) does not show what the judge opens first (bright town).
- **Competitor lens** (`FTF-COMPETITOR-MAP.md`): a rival entry wins on social login and a live economy; Lunearcy on the "merchant is a contract" literalism; Afterlight on a dynamic NFT. FTF wins on visual polish, verifiability and agent API. To be "unbeatable" it needs one **NFT that visibly does something** and one **invisible-chain moment for a new player** (free mint).

### B.3 What would move the score most, in order

1. Day 1 free mint live (QW-2): "I got an NFT without a wallet."
2. Holder access with a visible effect (QW-6): "the NFT does something."
3. One-click on-chain shard (QW-3): never miss the proof.
4. Title and premise in 5 seconds (QW-11) and a video that matches the first frame (QW-10).
5. README for the machine (QW-1) so the preliminary score does not undersell the work.

---

## Appendix — raw observations

- Agent API run output: `"outcome":"gift"`, `"tick":17`, `"silk":171`, `"commands":26`, `"rejected":0`, `"voted":true`, `"firstProofVerified":true`.
- Browser run on SwiftShader: `fps≈4.7–5.1`, `drawCalls 110–116`, `triangles 283–346 k`, tier `low`; first town frame at 7–10 s, altar reached in ~90 s via `town.walkRoute()`.
- Console: no `error`/`warning`, no failed or 4xx responses in three full judge runs (listed in `/workspace/ftf-audit/pp/judge-*.log`).
- Network on the judge path over 120 s: 225 requests, ~123 MB (largest: `town_terrain_m.glb` 2.9 MB, `anchor_m.glb` 8.7 MB, `scroll_table_m.glb` 8.6 MB, `shard.glb` 7.9 MB, `island.glb` 6.9 MB, `shell_interior.glb` 8.3 MB, camp models 3.4–4.2 MB each).
- On-chain reads (public RPC, view only): `ftf-seasons.testnet get_season` → revealed 15 of 15; `ftf-shards.testnet nft_total_supply` → 3; `agents.ftf-coordinator.testnet nft_total_supply` → 1; `heroine.ftf-coordinator.testnet` → 3 owner test tokens; `guests.ftf-coordinator.testnet stats` → 3 guests, cap 200.
