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

## Backlog (in order of value)

1. Look at the Shell column on a real GPU and at the high tier (bloom); tune or drop it.
2. Light-first loading on desktop: show the `_m` (2048) files first, upgrade to the full set while idle.
3. The light set complete before the first compile (no full recompile when the play layer starts).
4. Warm the programs when the quality governor changes tier; warm the post chain's passes.
5. Camp and Scroll table highlights when a goal or an offer refers to them; an opening camera glance toward the
   goal Shell (the Shells are off screen at the start).
