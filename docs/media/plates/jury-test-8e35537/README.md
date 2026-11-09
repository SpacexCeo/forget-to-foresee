# Jury test plates, round 3 (J3, commit 8e35537)

`gpu-job.sh 8e35537` into a new folder (nothing reused from 962c906, which never ran): 4K30, ultra, no UI,
RTX 4090, ANGLE Vulkan; dusk look, lantern spill 0.6, the shard against wall and sky, the raised token
orbit. `<shot>.json` camera/head logs, `job.log`, 1080p H.264 proxies (crf 21), mid stills,
`masters.sha256`; the 4K masters stay on the render server (`docs/art/server-inventory.md`).

Result: RUN_EXIT 0, 0 runner errors in every shot; retries up to 22 (clans-back); luma jumps 1 in
clans-back (max 49.0) and 2 in proof (max 28.7), below the failure threshold.
