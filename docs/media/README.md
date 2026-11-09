# Media

Real-GPU renders (RTX 4090, Chromium on ANGLE/Vulkan, 1080p60, tier ultra) from Task J's capture pipeline
on `claude/trailer` e104cab, with the per-frame flicker check (black edge regions, luma jumps; flagged
frames re-rendered). **The Guest opening shot is excluded on GPU pending a fix** (it stalls on this GPU:
`docs/handoff/agent-reports/trailer-retries/`), via the local `FTF_SKIP_SHOTS` override in
`tools/gpu-server/skip-shots.sh`.

Every shot's renderer: ANGLE (NVIDIA, Vulkan 1.4.329, RTX 4090); all passed the flicker check.

| File | Status |
|---|---|
| `demo.mp4` (71 s, 82 MB) + `.srt` + `.report.json` | shots cold-open, archipelago, run, pad, hub, closing; 0 runner errors |
| `trailer.mp4` (35 s, 38 MB) | 14 shots (emerge excluded); **1 runner error**: shot `forget`, "action forget: no memory button" (the memory press does not happen on screen) |
| `clip-shell.mp4` (8 s, 9 MB) | ink, read (emerge excluded); 0 runner errors |
| `clip-memory.mp4` (10 s, 6 MB) | memory, card; **1 runner error**: shot `memory`, same "no memory button" (its key moment is missing) |
| `clip-verified.mp4` (12 s, 8 MB) | card, verified; 0 runner errors |

The burned-caption versions stay on the render server (`docs/art/server-inventory.md`). The earlier
1080p drafts (b7e310b) flickered and were replaced.
