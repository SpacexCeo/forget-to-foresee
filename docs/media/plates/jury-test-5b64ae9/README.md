# Jury test plates, job 2 (J3, commit 5b64ae9)

Same seven shots as job 1, from J3's branch head (`gpu-job.sh 5b64ae9`, 4K30, ultra, no UI, RTX 4090,
ANGLE Vulkan). `<shot>.json` camera/head logs, `job.log`, 1080p H.264 proxies (crf 21), mid stills,
`masters.sha256`. The 4K masters (97-234 MB each) stay on the render server, listed with sha256 in
`docs/art/server-inventory.md`.

Result: 0 runner errors in every shot; flicker-check retries 0-13; luma jumps 2 in clans-back (max 30.0)
and 1 in proof (max 27.5), below the failure threshold. Iris is not visible in the mid frames.
