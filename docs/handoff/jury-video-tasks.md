# Jury video: remaining tasks (09.11.2026)

State: everything from `claude/jury-video` (the 18.5 s cinematic test, layers, HDR guard `262cd3a`, capture tools) and
the rebuilt athletic Iris (`2fdc01a`) is on `main` (`5b34f77`). The "wait for the new Iris" gate in `docs/HANDOFF.md` is
met. Plates round 4 was never run. Full background: `docs/handoff/agent-reports/jury-video.md`, storyboard
`docs/submission/jury-video.md`.

Freeze 13.11 20:00 Kyiv. Target: V1–V4 by 10.11, owner review of A–F on 11.11, the 60 s cut on 12.11.

| # | Task | Who | Depends on |
|---|---|---|---|
| V1 | Plates round 4 on the RTX 4090 from `main` `5b34f77` (prompt below) | GPU session (owner's desktop; the only one with server access) | — |
| V2 | Check the round-4 proxies: black-block detector on all 7 shots, light shafts present, glare on fly-in, Iris in frame (open: a dark band at the front of the waist above the leggings' band) | any agent | V1 |
| V3 | Iterate on the 1080p proxies locally: `layers-pass.mjs` → `capture.mjs --resume` → contact sheet; check the "Iris · Memory" rail contrast (bb70814) | any agent | V2 |
| V4 | 4K master on the server: `jury-composite.sh` → `jury-test.mp4` (4K, keep < 100 MB for git, else server-only) and `jury-test-1080p.mp4` | GPU session | V3 |
| V5 | Deliverables A–F for the owner: A the 18.5 s test, B clean plates, C UI components as files, D transition specs, E authenticity table (real / newly rendered / generated reference), F mobile readability in the X app | any agent + owner review | V4 |
| V6 | Art in parallel: the six-step shard fracture (today only cracks over `shard.glb`); the owner's clan card art (Moss missing) and badges as files (procedural stand-ins now) | art session + owner | — |
| V7 | The full 60 s on the same system, only after the owner approves the 18.5 s test: port the two pillars and support beats of storyboard v2 to in-engine shots with layers | any agent + GPU session | V5 approved |
| V8 | Attach the video to the X post; its URL goes into the application (`docs/submission/apply-form.md`) | owner | V7 |

Closed: "Iris silk 63 at trial 1" is not a bug. Everyone starts with 60 and tick 1 starts at once with the +3 income
(`docs/rules-baseline.md` §2 item 10, §4 step 1). The guest/emerge GPU hang does not block the video (no Guests in the test).

## V1 prompt for the GPU session

Paste into the owner's desktop session that holds the 4090 Jupyter access:

```text
Run jury plates round 4 for Forget to Foresee on the owner's RTX 4090 (Clore order 2419013), through its Jupyter terminal
as in docs/handoff/agent-reports/gpu-art-session.md. Do not stop or reconfigure the server, do not disturb jobs already
running there, never touch order 2419123.

1. On the server:
   FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1 bash tools/capture/gpu-job.sh 5b34f77 /root/ftf-media/jury-test-4 jury-test
   (5b34f77 = main: HDR guard 262cd3a in the post chain, the black-block gate, the rebuilt athletic Iris).
   If an older job already used /root/ftf-media/jury-test-4, use /root/ftf-media/jury-test-5 instead and say so.
2. When it finishes, collect exactly what rounds 1-3 committed (see docs/media/plates/jury-test-8e35537/): per shot
   (fly-in, clans-back, clans-front, conflict, shard-macro, token, proof) <shot>.json (camera log with layerLog),
   <shot>_1080p.mp4 (H.264 proxy, crf 21), <shot>_mid.jpg; plus job.log, jury-test.report.json, masters.sha256 for the
   4K masters, and a README.md with the commit, RUN_EXIT, runner errors and retries per shot, luma jumps.
3. Commit them to docs/media/plates/jury-test-5b34f77/ on branch claude/jury-plates (rebase it on main first) and push.
   The 4K masters stay on the server; add them to docs/art/server-inventory.md.
4. Report: RUN_EXIT, any shot that failed, and whether the black-block gate re-rendered frames (how many).
Everything written to the repository is English. Do not touch other branches.
```
