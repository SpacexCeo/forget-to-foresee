# Hand-off: A5 (integration seam, checks, flags, docs, video package)

Branch `claude/jury-ready` (the lead merges into `sprint/5h`, the owner merges to `main`).

## Done

| Piece | Where | Proof |
|---|---|---|
| Seam: bus (telemetry ring 500), markers, tooltip, first-seen tips, retryImport + guarded reload, demo seed + "Demo data" chip, tokens.css, registry, `mountSprint` (own frame loop) | `game/src/sprint/` | `game/tests/sprint/seam.test.mjs` |
| Stubs with final signatures: `silk-view.js` (A3), `auto-walk.js` (A1); module stubs replaced by the real ones as they land (market still a stub) | `game/src/sprint/`, `game/src/market/index.js` | |
| One mount line in `boot-world.js` (ctx: see `docs/sprint/CTX.md`, plus `active, mobs, base, floatNumber, openSettings, skin` for A2) and A1's run line | `game/src/boot-world.js` | e2e flags-on |
| 15 sprint flags, off; `?ff=all` / `?ff=a,b` page override for tests and previews | `game/src/features.js`, `game/public/features.json` | seam test |
| Locale seams `en-*.js` merged by `en.js`; other locales fall back to English; parity tests skip those keys | `game/src/play/locales/`, `sprint-keys.js` | unit |
| `mob.hit` / `mob.killed` on the bus | `game/src/play/mobs.js` (one line) | |
| retryImport around the entry's dynamic imports, `vite:preloadError` guard | `game/src/main.js` | e2e chunk-retry |
| `scripts/verify-sprint.sh` (unit, lint, build, budget, smoke, e2e, clipping, stats; `--quick`), `lint-sprint.mjs`, `bundle-budget.mjs` (baseline = sprint start), `stats.mjs` reads the Node 24 reporter | `scripts/` | `game/tests/sprint/*.test.mjs` |
| e2e: flags-off, flags-on (overlap probe), chunk-retry, first-ten skeleton | `tools/e2e/sprint/` | last run: 3 of 3 OK (first-ten not run in full) |
| Video package (shot list, voice-over, master and X captions, runbook, account prep, music record, post drafts) | `docs/submission/video/` | |
| How to see it in 90 seconds (status column) | `docs/how-to-see.md` | |

## Open (for the lead / the next seat)

1. **Flags on** when the owner says go: `git apply docs/sprint/flags-on.patch` (sets the 15 sprint flags to `true` in
   `game/public/features.json`, nothing else), commit, run `bash scripts/verify-sprint.sh`, then flip the Status column
   in `docs/how-to-see.md` and the README sprint table to "live" only for what the flags-on run shows working.
2. `first-ten.mjs` asserts steps 1-6, 9, 11, 12 and 14 against the real intro. Steps 7-8 (auto-walk, first quest), 10
   (chest) and 13 (tournament) report "skip" until `window.__ftfTest.quests` / chest / tournament hooks exist. Headless
   SwiftShader time is about 470 s (budget 6 min is for hardware GL). Step 3 sees `oh_no` only when the prologue gets far
   enough before the timeout; otherwise it accepts the earlier cues.
3. Lint findings still open (owners A2/A4, BOARD): `rpg/hud-style.js:137` ellipsis without title,
   `npe/dialogue-script.js:37` `toFixed`, `en-npe.js` `cup.add` 166 and `cup.policy.explorer` 220 characters.
   `verify-sprint.sh` is red on lint only for these.
4. `ftf:open-window` is routed by `sprint/window-router.js`: journal and quests -> `ftf:journal-toggle`
   (town-quests), market -> `ftf:market-open`, help -> settings controls. `map`, `bag`, `wallet` have no window:
   bus `window.missing` only.
5. Overlap probe: a townsfolk bark bubble sits over the E prompt (informational).
6. `docs/STATS.md` regenerated 13.11 (game 1131); run `node scripts/stats.mjs --write` again before the final merge.
7. No video clips: this box renders WebGL only in software; the owner records with `record-runbook.md`.
8. Phone rule: on touch nothing auto-shows (`tests/sprint/touch-rule.test.mjs`).

## Owner only

Merge to `main`, contract deploys, relayer redeploy, the coordinator top-up of the recording account
(`docs/submission/video/prepare-account.md`), recording, music, posting.
