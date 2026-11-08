# Trailer, demo video and clips: how they are made (Task J)

The videos are rendered from the game itself, frame by frame, by a deterministic pipeline: no screen recorder,
no hand-held timing, no third-party music. The same scripts render a draft on a laptop CPU and the final on a GPU,
and two renders of one script give the same frames.

## What is rendered

| Video | Script | Length | Shows |
|---|---|---|---|
| Demo (the X post) | `tools/capture/shots/demo.mjs` | 75 s | Opens on the Guest coming out of the mist and drawing the ring sign on the glass, Iris small in front (4 s, the hub URL labelled); then the payoff (trial 4, Resolved: **Verified ✓**), the archipelago, then the README judge table recorded from its own URL (`?demo=judge&mode=walk`) in real time: G with Shift from the balcony, the pad's **E · Anchor here for trial 3** (silk 53), T T three times to trial 4 (silk 72, *Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓*), V → Resolved, M → forget a memory → the vision; the Shell hub as a labelled second segment (fly in, the Guest draws, F stakes); end card. Every segment carries the URL a judge opens to see the same thing |
| Trailer | `tools/capture/shots/trailer.mjs` | 41 s | Cut on whole seconds of the game's 60 bpm music: the Guest emerging and drawing (Iris small in front) → the ink ring close → the reading card and the stake → card *I · Sealed* → Resolved: Verified ✓ → card *II · The price of memory* → forget, the vision, the shard to auction → four one-beat face close-ups of the clan agents → the clans meeting after a trial → *Trial 13 · The crisis* (the Guests' crisis moment) → the vote moment → the title |
| Clip: read the sign | `tools/capture/shots/clip-shell.mjs` | 12 s | The Guest emerging and drawing, the ink ring close, the reading card, the stake |
| Clip: the Price of Memory | `tools/capture/shots/clip-memory.mjs` | 10 s | Opens on the act: forget at 0.6 s, the vision, two future signs, the shard to auction; the chapter card |
| Clip: Verified ✓ | `tools/capture/shots/clip-verified.mjs` | 12 s | Card *Sealed*, then the walking judge path: T ends trial 3, the Gift lands, Resolved: Verified ✓ held 4 s |

Outputs go to `docs/media/`: `<video>.mp4` (clean), `<video>-captions.mp4` (captions burned in), `<video>.srt`,
`<video>.report.json` (frames, seconds per frame, console messages, runner errors, file sizes). Each file stays under
90 MB; raw frames never enter git (they live in the work directory and are deleted with it).

## How it works

1. **Virtual clock.** `?cinematic=<name>` (one guarded line in `game/src/main.js`) loads `game/src/cinematic/`. It
   replaces `performance.now`, `Date.now`, `requestAnimationFrame`, timers and the Web Animations behind CSS
   transitions with a queue that advances only when the harness asks for a frame, and seeds `Math.random`. The game
   never sees wall time: a frame costs whatever the renderer needs (1.7 s under SwiftShader, 4 ms on a GPU) and the
   result is an exact 60 fps.
2. **Shot runner** (`runner.js`). A shot is plain data: a camera (dolly, crane, orbit, push, static, keyframes, or the
   game's own follow camera), actions fired at shot seconds or when a predicate first holds (keys through the game's
   input, clicks on its buttons, `fly`, `slot`, `card`, `forget`, `walk`, `teleport`, `rig`, `ui`, `hide`, `cue`,
   `music`), overlays (fades, letterbox, vignette, title and end cards, chapter words) and a `setup` list that replays
   game state before capture with rendering switched off. Every `audio.play()` the game asks for is logged with gain,
   rate and its pan and distance from the camera, with the zone and tension changes.
3. **Capture** (`tools/capture/lib/browser.mjs`). One headless Chromium page per shot (parallel across shots): load,
   pre-stream every model (`waitLoaded`), run the setup, render one off-camera frame to compile shaders, then step →
   wait for the GPU (`readPixels`) → CDP screenshot → PNG into an ffmpeg pipe (H.264 4:4:4, crf 6). Chromium's
   `optimizeForSpeed` screenshot flag must stay off: it drops the WebGL canvas from every later capture.
4. **Mix** (`lib/mix.mjs`). The cue logs are laid on the final timeline: the three music stems loop in sync and follow
   the tension curve (script `music` cues override it), the wind and zone beds crossfade as in the game, the four Shell
   hums are spatialised from the per-frame camera log, one-shots are placed sample-exactly with pan, distance and rate,
   the Guest voice follows `guestPlan`, voice and stingers duck music and ambience. Output: a float WAV, then
   `loudnorm` to −16 LUFS / −1.5 dBTP at the mux.
5. **Captions** (`lib/subtitles.mjs`). SRT for players and X; ASS (Source Sans 3, converted from the bundled woff by
   `lib/fonts.mjs`) burned in by libass for the `-captions` file.
6. **Assembly** (`lib/ffmpeg.mjs`). Cuts by concat, dissolves by `xfade`, final H.264 High 4:2:0 60 fps, bt709,
   `+faststart`, AAC 256k.

## Commands

```bash
cd game && npm ci                                   # once; Playwright with Chromium must be installed (`npx playwright install chromium`)
node tools/capture/capture.mjs --list               # the videos and their shots
node tools/capture/capture.mjs demo --check         # static checks: cameras above ground, no jumps, caption pacing, shot starts
node tools/capture/capture.mjs demo --draft         # 1280x720, low tier (what a CPU-only machine can do), docs/media/demo*.mp4
node tools/capture/capture.mjs demo --final --gpu   # 1920x1080, ultra tier, on a machine with a GPU
node tools/capture/capture.mjs demo --final --gpu --width 3840 --height 2160   # 4K master
node tools/capture/capture.mjs demo --shots first-shell --sample 30 --work /tmp/scout   # one shot, sample frames every 30
node tools/capture/capture.mjs demo --smoke --out /tmp/smoke  # every shot for 1.5 s, full assembly, to test the chain
node tools/capture/render-all.mjs --draft           # all five videos
```
Options: `--base <url>` uses a running dev server (the tool starts `vite` on port 5179 otherwise), `--parallel n`
(default 2), `--resume` reuses finished shots in the work directory, `--fps`, `--tier`, `--width/--height`.

### Measured here (cloud container, 4 cores, no GPU: SwiftShader)

| Setting | Wall time per frame | A 72 s demo |
|---|---|---|
| 1280×720, low tier, one shot at a time | 1.75 s | 2.1 h |
| 1280×720, low tier, two shots in parallel | ≈ 1.1 s effective | 1.3 h |
| 1920×1080, low tier | 2.7 s | 3.2 h |
| 1280×720, high tier | 7 s | 8.4 h |
| 1920×1080, ultra tier | not measured (first frame > 1 min) | days |

The drafts in `docs/media/` are therefore 720p60 on the **low** tier: no post stack (no bloom, AO, god rays, colour
grade), 1k shadows, sparse grass, no cloud layers, the plain sky. Timing, staging, captions and the mix are final-quality;
the picture is not. The finals need a GPU.

### Final render on the owner's GPU server (RTX 5090, Ubuntu)

Nothing here rents or touches a server; these are the commands to run there. Chromium needs a GPU-capable ANGLE
backend; on a headless Linux box with the NVIDIA driver, Vulkan through ANGLE works without an X server.

```bash
# once
git clone https://github.com/SpacexCeo/forget-to-foresee.git && cd forget-to-foresee
git checkout <the frozen commit>            # the same commit that is tagged / deployed
cd game && npm ci && cd ..
npm i -g playwright && npx playwright install --with-deps chromium
nvidia-smi                                   # the driver must be visible; Vulkan ICD: /usr/share/vulkan/icd.d/nvidia_icd.json
# check that WebGL runs on the GPU, not SwiftShader (prints the UNMASKED_RENDERER):
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=vulkan','--ignore-gpu-blocklist','--enable-unsafe-webgpu']});const p=await b.newPage();await p.goto('about:blank');console.log(await p.evaluate(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(e.UNMASKED_RENDERER_WEBGL);}));await b.close();})()"
# masters (4K, ultra) and the 1080p deliverables; about 10 min per video at 4K on a 5090
for v in demo trailer clip-shell clip-memory clip-verified; do
  node tools/capture/capture.mjs $v --gpu --tier ultra --width 3840 --height 2160 --fps 60 --parallel 1 --out docs/media/4k --work /tmp/ftf-capture
  node tools/capture/capture.mjs $v --gpu --tier ultra --width 1920 --height 1080 --fps 60 --parallel 2 --out docs/media --work /tmp/ftf-capture
done
```
If `--use-angle=vulkan` falls back to SwiftShader (the renderer string says so), try `--use-angle=gl` with
`xvfb-run -s "-screen 0 1920x1080x24"` in front of `node`, or `--use-angle=default` (`GPU_ARGS` in
`tools/capture/lib/browser.mjs`); `--gpu` passes those flags. Assets: the repository already holds everything the
render needs (models, sounds, fonts); no extra files travel to the server. Each 4K master must stay under 90 MB
for git: the encoder settings give about 40–60 MB per minute at 4K60 crf 17; if one exceeds the limit, keep it out of
git and link it from the report.

### GPU diagnosis

`--probe a-b` renders a shot up to frame b and, for frames a..b, re-renders each frame with every post pass switched off
in turn (and with no post stack), writes a PNG per variant and `<shot>.probe.json` with the sizes of the canvas, the
drawing buffer and every composer target; the frame checks only log. On the GPU box: `FTF_PROBE=<video>:<shot>:<a>-<b>
bash tools/capture/gpu-job.sh <ref> <out>`.

### Shot vocabulary added 08.11

`camera: { type: 'track', target: '<clan>' | 'iris', local: true, at, off0, off1, lookOffset }` follows a live head
(close-ups that keep the face in frame while the agent moves); action `{ do: 'guests', seed, cue, action, warp, freeze }`
drives the Guests behind the glass (`docs/guests-stage.md`).

## Quality checks before a video is called done

- `--check` passes; the report lists 0 runner errors and no console errors other than the ReadPixels performance
  warning that the GPU wait causes on purpose.
- The first and last frame hashes match between two renders of the same shot (determinism).
- Watch every second: no greybox pop-in (every model is pre-streamed), no UI in beauty shots, the HUD readable in
  gameplay shots, captions on screen long enough (the checker enforces ≥ 4.2 words per second), the proof line held
  for at least 3 s, no "on-chain" wording (the game says "checked against the root").
- Audio: no clipping (the mixer caps at −1 dBFS before loudnorm), music under the stingers, footsteps and UI clicks
  where the picture shows them.
- File: H.264 High, yuv420p, 60 fps, ≤ 90 MB, ≤ 2 min, `+faststart`.

## For Task P (chapter films) and other users of the cinematic module

`game/src/cinematic/` is a library: `installVirtualClock` (clock.js), `compileCamera` (camera.js), `createOverlay`
(overlay.js), `ShotRunner` (runner.js) and `boot()` (index.js) keep their signatures; new camera types and actions
are added, never renamed. Films that run inside the game (not captured) can use `compileCamera` and `createOverlay`
without the virtual clock. Requests go through `docs/collab-requests.md`.
