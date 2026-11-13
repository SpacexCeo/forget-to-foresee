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

1. **Flags on** at the agreed time: set the 15 sprint flags to `true` in `game/public/features.json`, run
   `bash scripts/verify-sprint.sh`, then flip the Status column in `docs/how-to-see.md` and the README sprint table to
   "live" only for what the flags-on run shows working.
2. `first-ten.mjs` covers boot, prologue and dialogue events only; the remaining steps of plan 8.6 need A1-A4's
   `window.__ftfTest` hooks.
3. Lint finding owned by A4: `game/src/npe/dialogue-script.js` formats silk with `toFixed(2)` (BOARD request).
4. Nothing listens to `ftf:open-window` yet (A2's tray and silk chip send it): A1 / A3 windows should.
5. Overlap probe: a townsfolk bark bubble sits over the E prompt (informational).
6. `docs/STATS.md` is stale until `node scripts/stats.mjs --write` before the final merge.
7. No video clips: this box renders WebGL only in software; the owner records with `record-runbook.md`.

## Owner only

Merge to `main`, contract deploys, relayer redeploy, the coordinator top-up of the recording account
(`docs/submission/video/prepare-account.md`), recording, music, posting.
