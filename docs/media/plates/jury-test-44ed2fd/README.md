# Jury test plates (J3, commit 44ed2fd)

Seven clean in-engine plates rendered on the RTX 4090 (ANGLE Vulkan) by
`FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1 gpu-job.sh 44ed2fd /root/ftf-media/jury-test jury-test`:
fly-in, clans-back, clans-front, conflict, shard-macro, token, proof (555 frames, ultra tier, no UI).

- `<shot>.json`: the camera/head log of each shot; `job.log`: the job; `jury-test.report.json`.
- `<shot>_1080p.mp4`: H.264 proxies (crf 21) for review; `<shot>_mid.jpg`: a frame at 1.4 s.
- The 4K masters (98-234 MB each, 1.5 GB) stay on the render server: paths, sizes and sha256 in
  `docs/art/server-inventory.md` and `masters.sha256`.

Result: 0 runner errors in every shot; flicker-check retries 0-7 per shot; luma jumps 1 in fly-in and
clans-front (camera passes light and dark areas). Iris is not visible in the mid frames.
