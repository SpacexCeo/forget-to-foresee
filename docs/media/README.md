# Media

Real-GPU renders (RTX 4090, Chromium on ANGLE/Vulkan, 1080p60, tier ultra) from Task J's capture pipeline
on `claude/trailer` e104cab, with the per-frame flicker check (black edge regions, luma jumps; flagged
frames re-rendered). **The Guest opening shot is excluded on GPU pending a fix** (it stalls on this GPU:
`docs/handoff/agent-reports/trailer-retries/`), via the local `FTF_SKIP_SHOTS` override in
`tools/gpu-server/skip-shots.sh`.

| File | Status |
|---|---|
| `demo.mp4` (71 s, 82 MB) + `.srt` + `.report.json` | e104cab, shots cold-open, archipelago, run, pad, hub, closing; 0 runner errors |

The burned-caption versions stay on the render server (`docs/art/server-inventory.md`). The earlier
1080p drafts (b7e310b) flickered and were replaced.
