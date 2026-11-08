# Task J report: trailer, demo video and clips (work in progress, paused 08.11 16:35 UTC on the lead's order)

## Where this stopped
- Done and pushed on `claude/trailer`: the deterministic capture pipeline (`game/src/cinematic/**`, one guarded line in
  `game/src/main.js`, `tools/capture/**`), node tests (`tests/client/cinematic.test.mjs`, in `npm test`, 292 + 8 green,
  `npm run build` green), and first-pass shot scripts for all five videos (`tools/capture/shots/`: demo 76 s, trailer 29 s,
  three clips 12–14 s; `node tools/capture/capture.mjs <video> --check` passes for each). The pipeline was proven end to end
  with a smoke render (every demo shot for 1.5 s, assembled with the mixed audio and burned captions).
- Not done: no draft video exists yet in `docs/media/`; the lead's merge of `claude/loving-curie-ihasft` (2927f49: round-3
  agents, ink Guest, worker I's corrected judge path) is not merged into this branch yet, and the demo script still follows
  the old judge table (first stake at trial 2 on the Shell hub). Next steps, in order: merge 2927f49, re-trace the judge
  season (`hubflow` probe), rewrite the demo shots to the new table, scout each gameplay shot at 10 fps, render the drafts
  (720p60, low tier, about 1.2 s of wall time per frame here), write `docs/submission/trailer.md`, the GPU commands, the
  decisions row and the collab note for Task G about the `main.js` line.

## What exists (details)
- `?cinematic=<name>`: `performance.now`, `Date.now`, rAF, timers, CSS transitions and `Math.random` follow a virtual clock
  that advances one frame per harness call; `window.__ftfCinematic` exposes `load / setup / step / until / waitLoaded /
  rewind / cues / camLog / state`. Shot scripts are plain data (camera: dolly, crane, orbit, push, static, keys, or the game's
  own rig; actions: key, click, fly, slot, card, forget, open, walk, teleport, rig, ui, hide, cue, music, mark; overlays:
  black fades, letterbox, vignette, title and end cards, chapter words in the game's typography). Everything the game would
  have played through `audio.play` is logged with pan and distance and mixed offline from the game's own Ogg files.
- `tools/capture/capture.mjs <video> [--draft|--final] [--parallel n] [--shots a,b] [--smoke] [--check] [--list]`: one
  fresh page per shot, setup replayed with rendering off, frames screenshotted over CDP into a near-lossless intermediate,
  then timeline → mix (wav) → SRT + ASS (bundled Source Sans 3 converted from woff) → clean and captioned H.264 60 fps
  (loudnorm −16 LUFS). Chromium's `optimizeForSpeed` screenshot flag must stay off: it drops the WebGL canvas.
- Measured in this container (SwiftShader, 4 cores): 720p low tier ≈ 1.75 s per frame alone, ≈ 1.1 s effective with two
  shots in parallel; 1080p low ≈ 2.7 s; 720p high ≈ 7 s. The drafts therefore render at 720p60 on the low tier; the finals
  (1080p60 / 4K, ultra) need the owner's GPU server (commands to follow in `docs/submission/trailer.md`).
