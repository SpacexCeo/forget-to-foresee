# Task J report: trailer, demo video and clips (paused 08.11 18:00 UTC on the lead's order)

## What exists
- **Pipeline (done, pushed, `npm test` 371 green, `npm run build` green):** `?cinematic=<name>` puts the game on a
  frame-stepped virtual clock (`game/src/cinematic/`: clock, eases and splines, camera moves, DOM overlays in the game's
  typography, the shot runner; one guarded line in `game/src/main.js`). `tools/capture/` renders shot scripts in headless
  Chromium one fresh page per shot, mixes the game's own music and SFX to picture from the logged cues, writes SRT and
  burned-in captions (bundled Source Sans 3 converted from woff) and assembles H.264 60 fps; `--check` validates scripts;
  `gpu-probe.mjs` finds hardware WebGL flags; `gpu-job.sh` is the self-contained GPU job (clone at a ref, `npm ci`,
  build, `vite preview`, probe, render 1080p ultra then 4K masters, resumable, `FTF_TEST=1` for a short test).
  Docs: `docs/submission/trailer.md` (how it works, measured speeds, GPU commands, quality checks),
  `docs/submission/video-shot-list.md` (the 75 s demo beat by beat), `tools/capture/README.md`, collab notes 18 (Task G)
  and 19 (Task P), a decisions row.
- **Scripts (done, `--check` green):** `tools/capture/shots/demo.mjs` (75 s, cut to the juror's notes: cold open on the
  verified reveal, the README judge table recorded from `?demo=judge&mode=walk` in real time, the Shell hub as a labelled
  segment, "fixed before trial 1 and checked against that seal"), `trailer.mjs` (29 s, beauty shots with chapter words and
  the title card), `clip-shell.mjs` (14 s), `clip-memory.mjs` (12 s), `clip-verified.mjs` (14 s). All follow the current
  judge path (Delay pre-read to trial 3, E at the pad, T twice per trial, reveal at trial 4 with silk 72).
- **GPU render:** the GPU art session runs `gpu-job.sh` on the owner's RTX 4090 (renderer "ANGLE (NVIDIA GeForce RTX
  4090, OpenGL ES 3.2)" via `--use-angle=gl-egl --use-gl=angle`, 0.25 s of wall time per 1080p ultra frame). Its test shot
  rendered correctly; the full job (trailer, three clips, then the demo re-run from the branch head) was running at 17:50
  UTC and that session copies the files into `docs/media/` on `claude/trailer` after checking every report's renderer.
  Known there: an ultra-tier WebGL context loss at 2.9 s in the archipelago shot (frames white afterwards); the capture now
  fails such a shot loudly and GPU runs add `--disable-gpu-watchdog`; the Amber camp blows out to near white on ultra
  (look-dev, Task L; evidence frame kept on the box as `amber_blowout_evidence.png`).

## What does not exist yet
- **No draft video in `docs/media/`.** The local 720p SwiftShader drafts were started twice and stopped: once for the
  juror's rewrite of the demo, once for the lead's wrap-up order. The GPU job is the path to the first full files.
- **Open defect in the walk-mode shots (`cold-open`, `pad`):** after the runner's `teleport` action the 3D view renders
  as flat grey for about 20 s while the HUD, the game state and the camera are correct (renderer reports 80+ draw calls,
  camera at (3.5, 8.3, 17.3) over the plaza, player grounded, no respawn). Shots without a teleport (`run`, the hub flights
  under their fade, every scripted-camera shot) render. Hypothesis to test next: something position-dependent in the
  look-dev (fog/shadow fit) or the streamer right after a 40 m jump; workaround if it persists: replace the teleports with
  a real G-run from the balcony in the setup (costs about 15 s of virtual time with rendering off, which is cheap).
  The demo's hub, archipelago, run and closing shots are unaffected.
- The trailer and clip scripts were scouted only by their first frames (camera scout images), not watched end to end.

## Measured here (cloud container, 4 CPU cores, SwiftShader)
720p low tier 1.75 s per frame alone, about 1.1 s effective with two shots in parallel; 1080p low 2.7 s; 720p high 7 s.
Drafts belong at 720p low here; finals at 1080p/4K ultra on the GPU (0.25 s per frame measured on the 4090).

## How to continue
1. Fix the teleport grey view (see above), re-scout `cold-open` and `pad` at 10 fps
   (`node tools/capture/capture.mjs demo --shots cold-open,pad --fps 10 --width 960 --height 540 --tier low --sample 10
   --base http://localhost:5173 --work /tmp/scout`), look at the sample PNGs.
2. `node tools/capture/render-all.mjs --draft --parallel 2 --base <vite preview url>` for the 720p drafts, or wait for the
   GPU session's files; check each `<video>.report.json` (renderer, errors), watch every second, then commit the files
   (each under 90 MB).
3. Log the Amber blow-out for Task L in `docs/collab-requests.md`.
