# Smoothness: no frozen frames while the island streams in

Started 10.11.2026 on branch `claude/game-visual-performance-9umizm` (owner: "it lags because of loading; load light
first, then bring the rest in gradually"). This file records what is measured, what changed and what is still open.
The work log of the branch is `docs/handoff/visual-perf-log.md`.

## Where the freezes came from (measured)

A CPU profile of the first minute on the judge URL (`?demo=judge&play=direct`, headless Chromium, SwiftShader, so the
absolute numbers are a software renderer's; the split is what matters) showed 27 s of main-thread work, and nearly all
of it was two calls:

| main-thread time | call | what it is |
|---|---|---|
| 17.1 s | `WebGLProgram.onFirstUse` | shader programs compiled and linked synchronously inside the frame that first draws a material |
| 5.6 s | `compressedTexSubImage2D` | every texture of a model uploaded inside the frame that first draws it |
| 0.5 s | glTF parsing, clone, collision meshes | everything else |

So a model that streamed in froze the frame twice over: its textures (up to 150 MB per camp on desktop) and its
programs both landed in one frame. The download itself was never the problem; greyboxes already stand in for it.

## What changed

1. **GPU warm-up before the swap** (`game/src/render/warmup.js`). Between "downloaded" and "shown" a streamed model
   now passes through a queue: its textures are uploaded a few per frame within a byte budget (24 MB per frame on
   desktop, 8 MB on phones), then its programs are compiled through `renderer.compileAsync` for the render target the
   scene is actually drawn into (programs are keyed by the target's colour space and tone mapping). With
   `KHR_parallel_shader_compile` the driver compiles off the main thread; without the extension the compile step is
   skipped (it would block wherever it runs). The greybox stands in a little longer and the frame keeps moving.
2. **The streamer has a `warming` state** (`assets.js`, `streaming.js`): downloaded, not yet shown, holding no download
   slot. The loading screen's byte gate counts it as arrived.
3. **Agents, Iris and the Guests** go through the same queue before they replace their stand-ins (`play/agents.js`,
   `scenes/shell.js`).
4. **The island's own programs** (sky, clouds, grass, greyboxes) compile in parallel while the loading screen or the
   lobby is up; rendering starts when they are ready (or after 5 s).

`?warm=off` restores the old one-frame swap for comparison. `window.__ftf.warmup.stats` shows what the queue did.

## Check

Program cache keys were compared before and after every frame: with the warm-up, a prop or Iris appearing adds no new
material program in that frame (before: five to ten). Time to the playable frame on the software renderer did not get
worse (15.6 s with, 21.9 s without, one run each). A real GPU measurement is still owed: the container has no GPU.

## Light first (10.11, third round)

Desktop used to fetch the full 4096-texture files straight away. Now the first pass fetches the `_m` files (the same
models with 2048 textures, already built for phones) and shows them; when everything wanted is in, the streamer
fetches the full file of each model on screen, one at a time, warms it and swaps it in without a greybox frame
(`planUpgrade` in `streaming.js`, `AssetStreamer.startUpgrade`, `PropInstance.swapReal`). The light template is freed
after the swap.

| first view of the judge path (build-time file sizes) | before | light first |
|---|---|---|
| four camps, Scroll table, anchor, island | 73 MB | 39 MB |
| after the idle upgrades (total downloaded) | 73 MB | 105 MB |

The price is the second download, so it is skipped when the browser reports Save-Data or a 2G/3G-class link
(`liteFirstPolicy`); phones and the low tier load only the light set, as before. `?lite=off` restores the old order,
`?lite=only` never upgrades. Checked in headless Chromium (`?tier=low&tex=full`): the requests are `camp_*_m`,
`scroll_table_m`, `anchor_m` first, then the full files in turn; console clean; 578 tests green. Tests:
`game/tests/client/lite-first.test.mjs`. Models without an `_m` file (the island, agents, props) load as before.

## Open (next rounds)

- A light joining the scene after the first frame (12 → 13 lights when the play layer starts) recompiles every lit
  material once. The light set should be complete before the first compile.
- Shadow depth variants and the post chain's passes still compile on first use (small programs).
- A quality tier change to or from `low` switches the output target, so every program is rebuilt in one frame.
- The island (6.7 MB) and the agents (about 5 MB each) have no `_m` file; building them is an art task.
- An asset evicted from the cache and looked at again starts light and upgrades again (the HTTP cache holds both).
