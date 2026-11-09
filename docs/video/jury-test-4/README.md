# Jury video: cinematic test, GPU run 4 (09.11, RTX 4090, commit 45ac336)

The 18.5 s cinematic test from `docs/submission/jury-video.md` (v3), rendered by `tools/capture/gpu-job.sh` with
`FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1`: clean plates with the camera recorded per frame, for the CPU layers pass
(`tools/capture/layers-pass.mjs`). All seven shots rendered with 0 runner errors and 0 console messages; `proof` needed
three frame retries (one luma jump of 27 at its frame 17). Report: `jury-test.report.json`; the job log: `job-log.txt`.

The rented server was returned right after the run, so the 4K masters (97 MB each) and the 4K per-shot plates (1.5 GB)
could not be kept. Everything here was downscaled on the server to 1920×1080 (lanczos, H.264 CRF 16/17) before it went:

| File | What |
|---|---|
| `jury-test-1080p.mp4` | the assembled test without data layers (plates + the mix), 1080p30 |
| `jury-test-captions-1080p.mp4` | the same with the SRT burnt in |
| `jury-test.srt`, `plates/jury-test.ass` | the captions |
| `plates/<shot>.mp4` + `plates/<shot>.json` | the per-shot plates (no audio) and the capture record with `layerLog` (the camera per frame): the inputs of `layers-pass.mjs` |
| `plates/jury-test.wav` | the mix (`lib/mix.mjs`) |
| `preview/` | first and last frame of `fly-in` |

The layer log was recorded at 3840×2160. Whether `layers-pass.mjs` accepts a plate smaller than the recorded size has
not been checked: if it projects in pixels, scale the projected positions by 0.5 (or render the layers at 3840×2160 and
downscale the composite). The per-frame camera and the shot timings are unchanged by the downscale.
