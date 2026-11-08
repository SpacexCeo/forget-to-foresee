# Handoff: state on 08.11.2026

Branch: `integration/slice-frkc4d`, merged on 08.11 into `claude/happy-clarke-139pi1` with `codex/premium-ui` and the world HUD branch.
Tests (after the 08.11 merge): `cd game && npm test` passes 239/239, `cd server && npm test` passes 28/28, and `npm run build` succeeds.
Deadlines: models 11.11, freeze 13.11 20:00 Kyiv, submission 15.11 01:59 Kyiv.
Read first: `CLAUDE.md`, `docs/decisions.md`, `docs/spec.md`, `docs/hackathon-rules.md`, `docs/collab.md`.

## What exists and runs

| Area | State | Where |
|---|---|---|
| Rules engine (baseline / v2 / v3) | works; parity with `prototype-2d/` | `game/src/game/engine.js` |
| Agent-playable HTTP API | works: OpenAPI 3.1 spec, idempotent version-checked commands, per-viewer observations, SSE, Merkle proofs, an example agent that plays a full season, 28 tests | `server/`, `game/src/net/`, `docs/api/` |
| 3D client | archipelago with the play layer (goals, ticks, chronicle, Memories/Signs panels) running the same room code as the API; 360° camera; Shift to run; smooth acceleration and stopping; touch controls (tap to walk, drag to orbit, pinch to zoom); miniature HUD on phones; phones and `#play` skip the lobby | `game/index.html`, `game/src/main.js`, `game/src/play/` |
| Lobby | matches the owner reference one to one (owner-supplied background art) | `game/src/ui/lobby.js`, `docs/ui/lobby-reference.jpg` |
| Languages | EN, UA, RU, IT, 中文. `uk`, `it` and `zh` cover only the lobby and core labels; every other key falls back to English | `game/src/locales/` |
| NEAR contract `season-commit` | builds and passes tests; **not deployed** (the owner deploys) | `contracts/season-commit/` |
| Audio | 60 procedurally synthesized sounds and a WebAudio runtime; **not wired into main.js**; not yet listened to by a human | `game/src/audio/`, `game/public/assets/audio/`, `docs/audio.md` |
| VFX | GPU particle system and 4 flipbooks; integration into gameplay is partial | `game/src/vfx/`, `docs/vfx.md` |

## Art (glb, KTX2 + meshopt; procedural sources in `art/`)

| Asset | State |
|---|---|
| `camp_*.glb` (6) | good, matches the concept |
| `island.glb` | built on the `layout.js` layout; not reviewed by a human |
| `agent_<clan>.glb` (6) | rigged, 8 clips (idle, walk, run, talk, think, gesture_offer, celebrate, defeat), faces with face bones and fingers. **Faces look crooked up close**, see open item 1. `agent_suit` is static |
| `guest.glb` | new: hovering nacre creature, idle/draw/react clips. Known problem: the core glows through the chest |
| `prop_*.glb` (23) | props and clan relics; not reviewed |
| `fauna_*.glb` (5) | built; not reviewed |
| `shell_*_r2.glb` | Shell round 2: plain white, slivers for fragments; **not used**, `shell_1..4.glb` (round 1) stay in the game |
| `shell_interior.glb` | its coordinates do not match gameplay (entrance should be at z +4.5, glass at z −4.5) |
| HDR sky, flipbooks | `game/public/assets/env/`, `game/public/assets/vfx/` |
| Pitch renders | `docs/art/pitch/` (987 full-resolution frames under `full/`). Some frames are plain white: their materials were lost when the compressed glbs were unpacked |

## Links (private, owner's Claude account)
- 3D on the phone: https://claude.ai/artifact/FoNZrZze9BYSjQKdJRTQdm#play (lightweight build: island, camps, agents, Guest; models published as `.glb.wasm` because the host does not serve `.glb`, using build flag `VITE_MODEL_EXT=.glb.wasm`)
- Lobby: https://claude.ai/artifact/3PATPnSi7PNpCmVm7cuWM7

## Open items, in priority order
1. **Faces.** The rework in `art/agents/` is committed as WIP and is **not built into the glbs yet**: the CPU rebuild was stopped when the work wound down. Next: finish the build (on a GPU it takes about 15 minutes; on this container's CPU, hours), check the close-ups in `docs/art/qa/agents/<clan>/anim/`, and ship. The owner's goal: smooth, symmetric faces that hold up in close third person.
2. **Wire audio and VFX into the gameplay.** Follow the integration lines in `docs/audio.md` and `docs/vfx.md`.
3. ~~Merge Codex.~~ Done on 08.11 (only `game/src/ui/input.js` conflicted: Codex pointer/gamepad handling plus the touch controls).
4. **Assets to fix:** Shell round 2 (nacre/iridescence, real wall pieces instead of slivers), `shell_interior` coordinates, the Guest's core glow, and pitch renders from the uncompressed sources.
5. **Full UA, IT and ZH translation** of the rest of the UI.
6. **Mobile:** a run button, quality tiers tuned for phones, lighter textures.
7. **Owner decisions still open:** make v3 the default rules; P9; the shard-market lever (see `docs/decisions.md`).

## GPU workflow (for when servers are rented again)
- From a cloud session, SSH is blocked; the Clore Jupyter can be reached over HTTPS when its host is allowed in the cloud environment (environment `forget-to-foresee-gpu`). The Jupyter password works as a token: send it in the `Authorization: token …` header.
- Helper scripts (jr, jr2, jget, jput: run a command on a server, download, upload) and the team brief: `docs/handoff/team-brief.md`. The scripts themselves lived in the session's scratchpad: recreate them from the descriptions there.
- Blender 4.5.3 headless, KTX2 compression with `art/tools/compress-glb.sh` (needs toktx and gltf-transform).
- **Security:** Jupyter passwords were pasted into the chat; change them in the Clore panel. There are no secrets in the repository.

## Reports from the team agents
`docs/handoff/agent-reports/`: each agent's report on what it did and what it did not finish.
