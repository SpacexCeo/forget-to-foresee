# tools/capture: deterministic video capture

Renders the demo video, the trailer and the social clips from the game itself, frame by frame, on a virtual clock.
The full description, the shot vocabulary, the measured speeds and the GPU commands are in
[`docs/submission/trailer.md`](../../docs/submission/trailer.md); the demo's beat sheet is
[`docs/submission/video-shot-list.md`](../../docs/submission/video-shot-list.md).

```bash
node tools/capture/capture.mjs --list                # videos and shots
node tools/capture/capture.mjs demo --check          # static checks only
node tools/capture/capture.mjs demo --draft          # 720p60 low tier (CPU), into docs/media/
node tools/capture/render-all.mjs --draft            # every video
node tools/capture/gpu-probe.mjs                     # which Chromium flags give hardware WebGL here
bash tools/capture/gpu-job.sh claude/trailer /root/ftf-media   # the whole job on a GPU machine
```

| File | Role |
|---|---|
| `capture.mjs` | CLI: dev server or `--base`, one browser per shot (parallel), timeline, mix, captions, assembly, report |
| `render-all.mjs` | runs `capture.mjs` for every script in `shots/` |
| `gpu-probe.mjs`, `gpu-job.sh` | hardware WebGL detection and the self-contained GPU job |
| `lib/browser.mjs` | Playwright: load `?cinematic=<shot>`, pre-stream models, replay setup, step/screenshot/pipe |
| `lib/ffmpeg.mjs` | frame pipe, decode, WAV, timeline, xfade/concat assembly, final encode |
| `lib/mix.mjs` | offline mix of the game's own sounds from the cue logs |
| `lib/subtitles.mjs`, `lib/fonts.mjs` | SRT/ASS writers and the woff → ttf conversion for libass |
| `shots/*.mjs` | the video scripts (plain data); `shots/common.mjs` holds world coordinates and the judge-season setups |

The in-page side lives in `game/src/cinematic/` (clock, eases, cameras, overlay, runner) and is loaded only with
`?cinematic=<name>`.
