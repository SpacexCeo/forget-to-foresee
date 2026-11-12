# Entering and leaving a Shell without rebuilding the world (12.11)

Owner: "moving into a Shell and back must not reload the world; there is a moment of extra load". The Shell hall
already lived in the same scene as the archipelago (`scenes/shell.js`, one scene, a visibility swap), so nothing was
re-fetched or disposed on the way. The load came from the GPU side:

1. **Shader recompiles on the first visit.** The hall's five point lights live under its hidden root, so every warm-up
   compiled programs for a scene *without* them. Entering changes the scene's light count, and three keys programs by
   the number of lights: 34 programs were compiled at the moment of the swap, for the hall, the Guests and also for the
   archipelago materials still drawn behind the hall's walls (moss, terrain).
2. **First-draw uploads.** The hall's and Guests' geometry and the transmission target for the Guests' skin were
   created on the first frame inside.
3. **Risk on longer visits.** After 8 s off screen the streamer may release island assets to greybox; leaving then
   re-attaches them.

## What changed

- `render/warmup.js` `prewarmHidden(root, {wholeScene})`: shows the hall for the duration of one compile call, so the
  whole scene's programs are built with the hall's lights counted (parallel compile when the browser has
  `KHR_parallel_shader_compile`, else once, synchronously, outside a visit), and uploads the hall's textures.
- `render/warmup.js` `renderHiddenOnce(root, eye, target)`: one offscreen 1×1 frame from the arrival point toward the
  glass, with the game camera moved for that frame and put back: geometry buffers, the transmission target and the
  exact programs exist before the first visit.
- `scenes/shell.js` `preload()`: waits for the real hall and the Guests, builds the mist and the Guests' clones, then
  runs both of the above once (`shell.prewarmed` turns true). `boot-world.js` already calls it 2.5 s after the season
  starts.
- `render/assets.js` `hold(on)` and `play/game.js`: while Iris is inside a Shell, loaded assets never count as
  unwanted, so nothing on the archipelago is released or rebuilt; leaving resets the clocks.

## Measured (built page, `node game/scripts/measure-shell.mjs`, two visits, 15 s inside each)

Software WebGL (this container has no GPU, so frame times are the software renderer's ~2 fps and say nothing about
a 50 ms budget). The GPU-independent work per transition is what a seamless swap must avoid:

| Transition | New programs | New textures | New geometries | .glb fetched for it | Streamer release / attach |
|---|---|---|---|---|---|
| First enter, before | 34 | 9 | 11 | 0 | 0 |
| First enter, after | **1** | **1** | **1** | 0 | 0 |
| First enter, after the VFX pools are warmed too | **0** | **0** | **0** | 0 | 0 |
| First exit, before / after | 0 / 0 | 0 / 0 | 3 / 3 | 0 / 0 | 0 / 0 |
| Second enter, before / after | 0 / 0 | 1 / 1 | 1 / 1 | 0 / 0 | 0 / 0 |
| Second exit, before / after | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

`?tier=low&tex=m` after the change: first enter 1 program, 8 textures and 10 geometries (the low tier keeps the
Guests on plain alpha, so part of the set differs), every later transition 0 programs and 0 fetches. The one program,
texture and geometry that were left on the first enter were the glass logogram VFX, created by its pool on first use;
`vfx/index.js` now creates one of each pooled mesh up front and `scenes/shell.js` compiles them with the hall
(`shell.warmAlso`, set by `play/game.js`), which brings the first enter to zero.
(`camp_iris_m.glb` was fetched during one run's first enter: island streaming that happened to finish then, not the
Shell.)

## Not measured here

Frame times on a real GPU. On the GPU server or the owner's PC run, with the built page served:
`node game/scripts/measure-shell.mjs '?play=direct&mode=walk&day1=0&quest=0&skip=intro' desktop --gpu` and the same
with `&tier=low&tex=m`. The target is no frame over 50 ms on the second and later transitions; the first visit should
now show at most the logogram's one program.
