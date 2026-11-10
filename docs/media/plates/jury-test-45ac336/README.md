# Jury test plates, round 4 (commit 45ac336): rendered clean, then lost with the server

`FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1 gpu-job.sh 45ac336` into `/root/ftf-media/jury-test-4/` on an RTX 4090
(Clore order 2423705, driver 615.71, Ubuntu 24.04): 4K30, ultra, no UI, no data layers; the HDR guard (262cd3a) in the
post chain, the black-block gate in the frame check, Iris v7 (PR #32). `45ac336` was the head of `main` at launch.

**What is here is not the usual set.** The order ended at 20:32 UTC on 09.11 (the Clore API: `order_end`, 2 h 53 min
after creation, not the 24 h term; not ended by this session), 48 minutes after the job finished and before the
proxies were pulled. The 4K masters, the `<shot>.json` camera logs, the proxies and `jury-test.report.json` are gone
with it. What survived:

- `job-log-excerpt.txt`: the job log as the monitor streamed it (the GPU probe, every shot's progress and `done`
  line, the retries, the final luma check);
- `fly-in_f00000.jpg`, `fly-in_f00089.jpg`: 1280 px previews of the first and last fly-in frame, pulled during the
  render.

## Result (from the log)

RUN_EXIT 0 (`== 2026-11-09T19:44:32Z done`). Renderer: hardware WebGL, ANGLE gl-egl, "ANGLE (NVIDIA Corporation,
NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL ES 3.2)". The probe listed gl-egl first and it rendered every shot without a
context loss (on 08.11 gl-egl lost its context in every shot; the HDR guard removes the Inf/NaN that preceded it, so the
earlier loss was probably the same defect). ANGLE Vulkan was also available ("Vulkan 1.4.351").

| Shot | Frames | s/frame | Runner errors | Retries | Luma jumps (max) | Mean luma | Black-block re-renders |
|---|---|---|---|---|---|---|---|
| fly-in | 90 | 1.40 | 0 | 0 | 0 (7.5) | 123..184 | 0 |
| clans-back | 45 | 1.46 | 0 | 0 | 0 (10.7) | 105..162 | 0 |
| clans-front | 45 | 1.58 | 0 | 0 | 0 (7.5) | 96..135 | 0 |
| conflict | 90 | 1.46 | 0 | 0 | 0 (0.9) | 111..123 | 0 |
| shard-macro | 90 | 1.29 | 0 | 0 | 0 (0.7) | 111..131 | 0 |
| token | 90 | 1.35 | 0 | 0 | 0 (0.8) | 44..54 | 0 |
| proof | 105 | 1.32 | 0 | 3 | 1 (27.0) | 32..143 | 0 |

Final luma over the 555 frames: ok, 1 jump (73.1) at frame 360, the token → proof cut (round 3 had the same cut plus
one at 107). Round 3 for comparison: retries 22 on clans-back, 4 on shard-macro, 6 on proof, 1 on fly-in; black squares
in five shots. Round 4: no shot was flagged for a black block, so the HDR guard holds at 4K; the only retries were
proof frame 17 (flagged three times for a luma step at the panel's appearance, luma 87, then kept).

## What the two stills show

- `fly-in_f00089.jpg` (last frame, the high look down on the island): clean, no black squares, the lantern spill
  and the glints on the shell are there. The hard horizon line across the frame is the cloud layer's edge, present in
  round 3 as well.
- `fly-in_f00000.jpg` (first frame, into the low sun): the glare is heavy, the island is a pale blob (mean luma 184).
  Intended (the fly-in rises into the sun for the silhouettes), but the owner should judge the amount.

Not checked (no proxies): light shafts through the shots, Iris in frame (the open dark band at the front of her waist),
the "Iris · Memory" rail contrast, the per-frame black-block detector over the proxies.

## To render it again

The job itself is 20 minutes of render plus 5 minutes of setup. On a fresh Clore Jupyter image (ubuntu24.04-v2):

1. `apt-get install -y ffmpeg curl` (the image has neither; `gpu-job.sh` needs both).
2. Playwright where `require('playwright')` finds it: `mkdir /root/pw && cd /root/pw && npm init -y && npm i
   playwright@1.49.1 && npx playwright install --with-deps chromium`. A global `npm i -g playwright` is not found by
   the capture scripts (the first start here failed on that); `/root/pw` is the path `gpu-job.sh` looks for.
3. `git clone https://github.com/SpacexCeo/forget-to-foresee.git /root/ftf-jury-tools` (2.8 GB; pass it as
   `FTF_SRC=/root/ftf-jury-tools` so the script does not clone a second copy), then
   `FTF_SRC=/root/ftf-jury-tools FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1 nohup setsid bash tools/capture/gpu-job.sh
   <commit> /root/ftf-media/jury-test-5 jury-test &` with `GIT_PAGER=cat`.
4. **Pull each shot's `<shot>.mp4`, `<shot>.json` and a proxy as soon as its `done` line appears**, not at the end.
