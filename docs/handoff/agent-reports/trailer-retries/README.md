# Full render job 43d672f on the RTX 4090 (09.11): stopped on a hang

Job: `FTF_SKIP_4K=1 gpu-job.sh 43d672f /root/ftf-media-v2 demo trailer clip-shell clip-memory clip-verified`,
ANGLE Vulkan (renderer "ANGLE (NVIDIA, Vulkan 1.4.329 (NVIDIA NVIDIA GeForce RTX 4090 ...))").

- Demo shots cold-open, archipelago, run, pad, hub, closing finished: 0 runner errors, edge-black 0%,
  jumps 0 except hub (2, max 64.9). Many frames were flagged and re-rendered successfully (the GPU black
  edge / luma glitch is frequent but transient: e.g. closing 88 retries, 107 retry PNGs in total, kept on
  the server in `/root/ftf-media-v2/work/demo-1920x1080-ultra/`). Per-shot reports here.
- The **guest** shot (the new opening) hangs, twice: first run stuck from 22:29 with no frame logged;
  rerun at 00:32 logged frames 1 and 29 (flagged, re-rendered) and then stalled for 30+ min. In both
  cases the shot's ffmpeg composite (two image pipes) had used 0 s of CPU, so no layer frames reached it;
  the capture has no timeout. A plain page load of the same URL also sat on the loading screen at 4% for
  25 s while the first hung run was alive.
- Not rendered: guest, so no demo.mp4 (assembly needs every shot), trailer, three clips. The job was
  killed; the GPU is idle. Sample retry frames (960 px JPEG) and the job log are in this folder.
