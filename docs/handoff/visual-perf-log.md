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

## Backlog (in order of value)

1. In-world guidance: a soft light beacon over the Shell the current goal points to, and a ground trail from Iris to
   it (visual only, driven by the existing goal; no new strings).
2. Light-first loading on desktop: show the `_m` (2048) files first, upgrade to the full set while idle.
3. The light set complete before the first compile (no full recompile when the play layer starts).
4. Warm the programs when the quality governor changes tier; warm the post chain's passes.
5. Camp and anchor highlights when a goal or an offer refers to them.
