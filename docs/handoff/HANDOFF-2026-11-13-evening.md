# Handoff: Forget to Foresee, 13 Nov 2026 evening (local lead session → next lead)

Read this first, then `CLAUDE.md`, the last rows of `docs/decisions.md` and `docs/handoff/HANDOFF-2026-11-13.md`
(the full project picture: contracts, seats, merge loop). This note is the delta and the exact state at the hand-over.
Access (SSH, NEAR keys, GPU server) is NOT in the repo: the owner's private kit `F:\ftf-session-kit\` on his laptop
(`RESUME.md` inside says where everything is). Talk to the owner in Russian; everything in the repo stays English.

**Deadline: 15 Nov 01:59 Kyiv = 14 Nov 23:59 UTC.** Final tx proof after 00:00 UTC 15 Nov.

## 1. State at hand-over (13 Nov, 18:10 UTC)

| Piece | State | Check |
|---|---|---|
| `main` | the latest owner fixes, the HUD merge if it landed (section 3) | `git log --oneline -15 origin/main` |
| Live page | https://spacexceo.github.io/forget-to-foresee/ — flags ON: all 15 sprint flags, `accountLogin`; OFF: `glassShoal` (preview `?ff=glassShoal`), `damageNumbers`, `loadRitual`, `register`, `loomMeter`, `presenceChip`, `tuneOverlay`, `statusBanner` | `game/public/features.json` |
| Relayer + presence | the owner's server, systemd `ftf-relayer` / `ftf-presence`, on `8ef370f9`, both active | `curl -s https://159-195-130-113.sslip.io/api/health` |
| Town economy | 20 traders, target 24,000 tx/day, 17,700 trades today by 18:07 UTC (1,082 failures, all before the 12:08 UTC RPC fix; flat since), `low_funds` and `budget_capped` empty | `/api/market/stats` |
| Player market | live (`/api/market/p2p/book?item=spider_silk_thread` → `live: true`) | same URL |
| Gas | traders 4.71 NEAR total (0.22–0.25 each), burn ~7.3 NEAR/day → they stop around **11–12 UTC 14 Nov**; `ftf-town` 0.33; `guests` 1.16 (~23 free guests) | `node tools/count/runway.mjs` (NearBlocks may answer 429: run it on the server) |
| GPU server work | backed up: `/var/lib/ftf-backups/gpu-2026-11-13.tgz` on our server (42.16 GB, sha256 `16ab737a…cbcb45`, 148,442 entries) | `sha256sum` there |
| Tests | game: all green except 6 Windows-only path tests (see section 5); relayer 137/137 (clean tree) | `npm test` |

## 2. Done this evening (all in `main`, each verified in a real browser)

- Wallet sign-in merged and live (NEAR Connect for HOT/Meteor/Intear/MyNearWallet/OKX…, EVM, Solana, passkeys).
- Intro dialogue portraits (elder, guard, lamplighter). Bag (I) opens the Inventory tab. Quest givers hold their posts;
  at most three townsfolk trade at the Exchange door. No town-mob damage during the dragon ride / Glass Shoal.
  `lowSun` = the owner's grade. Chat bubbles over heads. Spare part 60 % + pity 2. Lower HUD anchored by `bottom`.
  The elder's normal walk. Talk picker: several people in reach → names list (click / Tab / E), nearest first.
- Server: relayer redeploy, player market live (items key as a function-call key on `ftf-coordinator.testnet`),
  RPC pair FastNear + FastNear archival. Details: the last three rows of `docs/decisions.md`.
- Docs for the owner: `docs/art/tripo-batch-1.md` (10 Tripo models, priority order, prompts; spires keep the single
  narrow blade shape), `docs/submission/video/storyboard-request.md` (paste into ChatGPT for a 12-frame storyboard).

## 3. In flight at hand-over

- **Transparent minimal HUD** (owner's refs: no panels, thin bars, plain-text quests and log, radar as a dark disc,
  5 line icons bottom-right `[I] [C] [M] [J] [O]`, silk with the old coin icon small, stamina back as a thin line).
  Built by a background agent in a worktree; if its merge is in `main`, check it once more on the live page at
  1920x1080, 1366x768, 920x904 and a phone; if not merged, the branch name is in the last commit message of this
  handoff's merge or in `docs/decisions.md`.

## 4. Next, in this order (owner-gated items marked)

1. **Gas top-up (owner's yes needed).** Proposal sent: 10 NEAR to the 20 traders (0.5 each) and 10 NEAR to
   `guests.ftf-coordinator.testnet`. Without it the traders stop ~11–12 UTC 14 Nov, i.e. before the final count day
   ends. Funds come from the owner (testnet faucet) to `ftf-coordinator.testnet`; then send with the keys from the kit.
2. **Glass Shoal to playable:** the dev jump `?shoal=arena`, Elise's kit (Ember Palms, Gale Discs, take-off and flight,
   stamina, ultimate), touch QA; then the owner decides `glassShoal` on. Plan: `docs/plans/boss/glass-shoal-boss.md`,
   `docs/plans/boss/HANDOFF-glass-shoal.md`, `docs/plans/boss/arena-tech-spec.md`.
3. **Tripo models** as the owner sends them (order in `docs/art/tripo-batch-1.md`): import pipeline (weld, decimate,
   KTX2 + meshopt, `_m` lite, colliders), replace the placeholders (the dragon is a "plane" placeholder today).
4. **VFX and 3D animation pass** for the ride and the arena, the same look for the lab prologue and the video.
5. **Story beats** the owner listed (prologue "baking nanoparticles", the hand up and tea, the elders' lore, the
   200-silk teleport, the M map with mobs as dots, the farewell + last chip + teleport ending + mainnet whitelist
   address): compare with the game, list the gaps to the owner, then build.
6. **Calm electronic ambient music (owner's reference: a "deep work / coding" ambient mix on YouTube, not licensed: never use it).** Find 3–4 tracks in that mood (soft electronic, warm pads, no drums) under CC-BY or CC0 only, make a demo file for the owner (`docs/audio/`), then after his pick: the lab prologue, the loading screen / menu, quiet night hours in town; process with `art/audio/build_music.py`, credit in the README and `docs/art/manifest.md` (same rule as the 12.11 music beds).
7. **Small HUD/UI items seen today:** the intro-flight "Skip" button sits over the bottom-right icons for a few
   seconds; the Sheriffchenko demo nameplate grows huge near the camera.
8. **Submission (owner):** catalog registration, video (`docs/submission/video/`), X post, the form, repo About; after
   00:00 UTC 15 Nov `node tools/count/count.mjs --window 2026-11-14 --write`, commit the proof, update the README number.

## 5. How to work (proven this session; do the same)

- Owner's report → find the cause in code → one-sentence cause → fix → test → verify in the real browser (Chrome headed
  via Playwright, the kit's `scripts/`) → push. Report: what changed, how verified, what is left.
- Before a push: touched tests, full `npm test` (game; relayer when touched), `FTF_BASE=/forget-to-foresee/` build
  (Git Bash needs `MSYS_NO_PATHCONV=1`), headless boot plain + `?ff=all` with no page errors.
- Another session also pushes to `main`: `git fetch`, push only if `origin/main` is an ancestor
  (`git merge-base --is-ancestor origin/main HEAD`), else merge it, recheck, push `HEAD:sprint/5h HEAD:main`. Batch
  small fixes (every push restarts the Pages deploy).
- Windows-only failing tests (paths `F:\F:\…`; ignore on this laptop, they pass on Linux): art resource icons, chunk
  plan, lint-sprint, loading v3, animation keyframe, silk formatter.
- Traps: `relayer/lib/near-tx.js` must equal `game/src/net/near-tx.js` byte for byte; no static import from
  `scenes/`/`play/` into `sprint/`/`market/` (TDZ); never commit `node_modules`; exFAT → `git -c safe.directory=…`.
- The lab prologue runs first on the live page: for town checks set `localStorage` `ftf.npe.v1` (prologue seen) first.
- Server changes: back up `.env` + data dir, note the old commit, tests, restart, check health, print no secrets.
- Big separate work → a background agent in a worktree with a precise brief; keep handling the owner's live reports.
