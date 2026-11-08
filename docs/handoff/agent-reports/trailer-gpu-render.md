# Trailer: GPU render (08.11)

Real-GPU drafts of all five videos, rendered by `tools/capture/capture.mjs` from branch `claude/trailer`
(commit b7e310b) on a rented RTX 4090 (driver 595.104.02). Belongs under a "GPU render" heading in
`docs/handoff/agent-reports/trailer.md` when `claude/trailer` is merged.

## Bisect: which Chromium GPU path survives

| Path | Result |
|---|---|
| ANGLE on OpenGL ES via EGL (`--use-angle=gl-egl`), tiers low and high, `tex=m`, `motion=reduce` | fails: context lost (`GL_GUILTY_CONTEXT_RESET_KHR`) partway into every shot |
| ANGLE on Vulkan | works: every shot of every video, 0 runner errors |

Vulkan flags (`tools/capture/.gpu-args.json`, local, not committed):

```json
["--use-angle=vulkan", "--use-vulkan=native", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan",
 "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--autoplay-policy=no-user-gesture-required",
 "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
 "--disable-gpu-watchdog"]
```

The container has no display; the NVIDIA user-space GL/EGL/Vulkan libraries were extracted from the
driver installer matching the host kernel module.

## Results (tier ultra, 1920x1080, 60 fps)

| Video | Shots | Frames | Errors | File |
|---|---|---|---|---|
| demo | 6 | 4500 | 0 | `docs/media/demo.mp4` (64 MB) |
| trailer | 6 | 1920 | 0 | `docs/media/trailer.mp4` (24 MB) |
| clip-shell | 1 | 840 | 0 | `docs/media/clip-shell.mp4` (12 MB) |
| clip-memory | 1 | 720 | 0 | `docs/media/clip-memory.mp4` (13 MB) |
| clip-verified | 1 | 840 | 0 | `docs/media/clip-verified.mp4` (14 MB) |

About 0.25-0.27 s per frame. The only console messages are NVIDIA driver notes ("GPU stall due to
ReadPixels"), which also show that the frames came from the GPU, not SwiftShader. Each video has its
`.report.json` (per-shot frame hashes) and `.srt` next to it; the burned-in caption versions stay on the
render server. These are drafts: the game build is b7e310b, so the agents are older than round 5.
4K masters are rendering next.
