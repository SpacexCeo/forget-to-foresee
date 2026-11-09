# Task: release polish pass (one small fix per run)

A self-contained brief for a scheduled cloud agent. Each run makes **exactly one** small, safe improvement to
Forget to Foresee, ships it to `main` and records it in `docs/handoff/night-polish-log.md`. Suggested schedule:
every 20 minutes until the owner stops it (or a fixed end time, e.g. 08:00 Kyiv).

Repository: https://github.com/SpacexCeo/forget-to-foresee (branch `main`). Live build:
https://spacexceo.github.io/forget-to-foresee/?demo=judge (Pages redeploys on every push that touches `game/`).

## Before the first change of a run

1. `git pull --rebase origin main`. Other sessions push to `main` too; always rebase before pushing.
2. Read `CLAUDE.md` (rules), the last 15 rows of section 4 in `docs/decisions.md` (latest decisions) and
   `docs/handoff/night-polish-log.md` (what earlier runs already fixed: never redo or undo those).
3. `cd game && npm ci` (first run of a container), then `npm test`. It must be green before you start (about 560 tests).
   If it is red and the cause is not yours, fix only that if it is small, otherwise log it and stop the run.

## How to find the one issue

Pick **one** of these per run, in this order of value:

- **A real logic hole in the play layer** (`game/src/play/`, `game/src/ui/`, `game/src/net/`): a goal or hint that
  contradicts the game state, a button that sends a command the room refuses, a panel that shows stale data, a
  state that can soft-lock the hub, a wrong count. Prove it with a Node test first (see `game/tests/client/*.test.mjs`
  for how to start a local season: `createLocalTransport` + `PlaySession`, seed `?demo=judge` =
  `cc161d308faa67539af44205b56b6d4f`).
- **A console error or warning** on the judge path.
- **Layout**: overflow, overlap, clipped text, misaligned spacing, a tap target under 44 px on phones, horizontal
  scroll at 375 px.
- **Copy**: an English typo, unclear wording, a label that claims more than the code does, a string missing in a
  locale. English is the primary version; translate the same change into ru, uk, it and zh (tests enforce key and
  placeholder parity and that uk/it/zh are real translations; zh uses 伊里斯 for Iris).

To look at the game: `npm run dev` in `game/` and drive it with headless Chromium (Playwright; see
`game/tests/e2e/README.md` and `game/tests/e2e/lib/env.mjs`). Use `?demo=judge&play=direct` (English by default),
check 1280×760 and 375×812, read the console. `window.__ftf.play` exposes `session`, `ui`, `hub`, `worldHud`.
Useful steps: click the Shell I button in the hub dock, stake with the "Stake 10 silk" button, then
`session.send('end_tick', {})` three times to reach the first reveal (the "What changed" card and the Signs panel).
One `npm run e2e` file can also serve as a quick check (`node --test tests/e2e/smoke.e2e.mjs`).

## Hard limits

- Never change game rules: `game/src/game/engine.js` and `prototype-2d/` stay as they are; `baseline-2d-1` parity
  must stay bit-exact. Ash's phrases (`PEPEL_PHRASES`) are hash preimages committed on NEAR testnet: never touch them.
- No big redesigns, no new features, no dependency changes, no art or model files, no contract changes.
- Never claim in the README what does not run. No secrets. Everything in the repository is English (Russian only
  inside the ru/uk locale files and in tests that check those locales).
- Keep the diff small (one concern). If a fix turns out large or risky, log it as a proposal instead and stop.

## Ship it

1. Fix; add or adjust a test when it is logic; `npm test` in `game/` must be green.
2. Commit with a short English message ending with the line
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. `git pull --rebase origin main`, then `git push origin main`.
4. Append one line to `docs/handoff/night-polish-log.md`:
   `- <date time Kyiv> <what was fixed> (<file>) — <short commit hash>`, commit and push it with the fix (same commit
   is fine).
5. At the end time: append a 5-line summary of the whole night to the log, push, and stop.
