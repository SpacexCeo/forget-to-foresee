# Visuals and smoothness log (branch `claude/game-visual-performance-9umizm`)

Owner brief of 10.11.2026: the game is hard to read, there are too few visual hints, loading causes hitches; load a
light version first and bring the rest in gradually. One task about every two hours, on this branch only (no pushes
to `main`; the owner merges).

**Lanes.** The release polish worker (`night-polish-task.md`) owns logic holes in `src/play`, `src/ui`, `src/net`,
console errors, layout defects and copy, and ships to `main`. This branch owns: loading order and streaming
(`src/render/assets.js`, `streaming.js`, `warmup.js`, `boot-world.js`), frame pacing, and in-world visual guidance
(3D cues in `src/scenes`, `src/render`, `src/vfx`). It does not edit locale strings, HUD layout or play logic; when a
visual cue needs a new string or a logic change, it is logged here as a request instead. Before each task:
`git fetch origin main` and rebase this branch on it.

## Done

- 10.11 03:10 Kyiv. **GPU warm-up before a streamed model is shown**: textures upload within a per-frame byte budget,
  shader programs compile in parallel, then the greybox is swapped; props, agents, Iris and the Guests. Measurements
  and method in `docs/smoothness.md`. Tests: `game/tests/client/warmup.test.mjs` (8).

- 10.11 05:20 Kyiv. **Goal cues in the world** (`docs/visual-guidance.md`): gold chevrons on the ground ahead of Iris
  toward the Shell or anchor zone the goal names, and a gold column, ring and diamond on Shells with an open sign
  (strongest on the goal's Shell). Finding on the way: from the start balcony no Shell is ever on screen, so the
  chevrons are the cue that matters; checked in the browser at the start view. The column was only seen faintly in a
  dev camera angle (fog, software renderer): it needs an owner look on a real GPU. Tests:
  `game/tests/client/beacons.test.mjs` (9).

- 10.11 09:10 Kyiv. **Light-first loading on desktop**: the `_m` (2048) files first (39 MB instead of 73 MB for the
  first view of the judge path), then the full files one at a time when idle, swapped in without a greybox frame.
  Skipped on Save-Data and 2G/3G links; `?lite=off` / `?lite=only`. `docs/smoothness.md`. Tests:
  `game/tests/client/lite-first.test.mjs` (4).

## Night summary (10.11, 03:00 to 10:00 Kyiv; the schedule is now off)

Three tasks, all on this branch, nothing pushed to `main`, 578 tests green (21 new):
1. GPU warm-up before a streamed model is shown (staged texture uploads, parallel shader compile).
2. Goal cues in the world (ground chevrons toward the goal, gold beacons on Shells with an open sign).
3. Light-first loading on desktop with idle upgrades to the full files.
Not verified here: anything that needs a real GPU (the container renders in software, without parallel shader
compile): the actual frame-time gain of the warm-up, the look of the Shell column with bloom, the texture swap on
upgrade. `?warm=off`, `?lite=off` compare old and new on the owner's machine. The other worker's lane (play logic,
copy, HUD layout) was not touched; `main` did not move during the night.

## Backlog (in order of value)

1. Owner look on a real GPU: warm-up gain, the Shell column at the high tier, the light-to-full swap; tune or drop.
2. The light set complete before the first compile (a 13th light joins when the play layer starts and recompiles
   every lit material once).
3. Warm the programs when the quality governor changes tier; warm the post chain's passes and shadow variants.
4. Camp and Scroll table highlights when a goal or an offer refers to them; an opening camera glance toward the
   goal Shell (the Shells are off screen at the start).
5. `_m` files for the island and the agents (art task).
