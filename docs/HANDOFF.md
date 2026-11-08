# Handoff: state on 08.11.2026 (evening)

Branch: `claude/laughing-thompson-dc7r09` (on top of `main` at `bf89d82`): Shell hub, full uk/it/zh translations, phone running, README refresh. **Not on `main` yet**: GitHub Pages publishes only `main`, so the live site shows the hub after the owner merges.
Tests: `cd game && npm test` passes 266/266, `cd server && npm test` passes 28/28, and `npm run build` succeeds.
Deadlines: models 11.11, freeze 13.11 20:00 Kyiv, submission 15.11 01:59 Kyiv.
Read first: `CLAUDE.md`, `docs/decisions.md`, `docs/spec.md`, `docs/hackathon-rules.md`, `docs/collab.md`.

## What exists and runs

| Area | State | Where |
|---|---|---|
| Rules engine (baseline / v2 / v3) | works; parity with `prototype-2d/` | `game/src/game/engine.js` |
| Agent-playable HTTP API | works: OpenAPI 3.1 spec, idempotent version-checked commands, per-viewer observations, SSE, Merkle proofs, an example agent that plays a full season, 28 tests | `server/`, `game/src/net/`, `docs/api/` |
| Shell hub | default play mode (owner design 08.11): Shell dock, flight, reading card with Iris's pre-filled slots, stake from inside, leaving ends the trial, automatic trials, decision cards (offer, fragment, Key, vote, Heir); `?mode=walk` keeps the walking play | `game/src/play/hub.js`, `game/src/play/hub-ui.js`, `tests/client/hub.test.mjs` |
| 3D client | archipelago with the play layer (goals, ticks, chronicle, Memories/Signs panels) running the same room code as the API; 360° camera; Shift to run; smooth acceleration and stopping; touch controls (tap to walk, drag to orbit, pinch to zoom); miniature HUD on phones; phones and `#play` skip the lobby | `game/index.html`, `game/src/main.js`, `game/src/play/` |
| Lobby | matches the owner reference one to one (owner-supplied background art) | `game/src/ui/lobby.js`, `docs/ui/lobby-reference.jpg` |
| Languages | EN, UA, RU, IT, 中文, all five fully translated (game and play strings; parity test `tests/ui-i18n-locales.test.mjs`). Open: CJK fallback in the HUD/UI font stacks (request 3 in `docs/collab-requests.md`); native-speaker proofreading of UA/IT/ZH | `game/src/locales/`, `game/src/play/locales/` |
| NEAR contract `season-commit` | builds and passes tests; **not deployed** (one script: `contracts/season-commit/scripts/deploy-judge-season.sh`, `docs/near.md`). The game side is ready: reproducible judge commitment, read-only testnet client and badge model (`game/src/net/near*.js`), HUD rendering pending (request 7) | `contracts/season-commit/`, `game/src/net/near*.js`, `docs/near.md` |
| NEAR NFT contract `memory-shard` (shards as NEP-171 tokens tied to the committed season, on-chain ink-ring image) | builds and passes tests (21); **not deployed**, no shard minted (`contracts/memory-shard/scripts/deploy-judge-shards.sh`, same permission path). Game: shard history in the observation, read-only client and badge model (`game/src/net/shard-nft.js`), HUD rendering pending (request 9) | `contracts/memory-shard/`, `docs/shard-nft.md` |
| Audio | 60 procedurally synthesized sounds and a WebAudio runtime, **wired into the play layer** (branch `claude/audio-vfx-wiring`): music by tension, zone beds, one hum per Shell, footsteps by surface for Iris and the agents, event cues, UI sounds, volume sliders in the scene settings; not yet listened to by a human | `game/src/audio/`, `game/src/play/presentation.js`, `docs/audio.md` |
| VFX | GPU particle system and 4 flipbooks, **wired into the play layer**: composer attach across tier changes, mist under every Shell, Shell IV crack pulse, tension by season tension with a sky tint, the Guest's sign as ink on the glass, event cues, the finale beams from the camps | `game/src/vfx/`, `game/src/play/presentation.js`, `docs/vfx.md` |

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
2. ~~Wire audio and VFX into the gameplay.~~ Done on 08.11 on `claude/audio-vfx-wiring` (report: `docs/handoff/agent-reports/audio-vfx-wiring.md`). Left: a human listening pass on the mix; the volume sliders' proper home in Settings (request to Codex in `docs/collab-requests.md`).
3. ~~Merge Codex.~~ Done on 08.11 (only `game/src/ui/input.js` conflicted: Codex pointer/gamepad handling plus the touch controls).
4. **Assets to fix** (needs Blender and ideally a GPU; the 08.11 evening cloud session had neither, so items 1 and 4 were not touched): Shell round 2 (nacre/iridescence, real wall pieces instead of slivers), `shell_interior` coordinates, the Guest's core glow, and pitch renders from the uncompressed sources.
5. ~~Full UA, IT and ZH translation.~~ Done 08.11 (AI translation; a native-speaker pass is welcome).
6. **Mobile:** run button and double-tap-to-run, phone quality profile (1.5x sharp `high`, `low`, 30 fps governor with resolution steps) done on `claude/mobile-play` (`docs/mobile.md`); still owed: a run on a physical iPhone/Pixel (the container has no GPU), VFX capped at `low` on phones (request to task A), lighter textures beyond the `_m` variants. Running also via the play layer: a far tap runs there and G routes run on touch (Shell hub session).
7. **Shell hub follow-ups (not built):** a camera fly path instead of the fade; showing each sign only in the Shell it is about (Fable's "where is free" amendment; it changes what the player learns, so it needs an owner OK before the freeze); the 16-cell glossary on the glass; ghost strokes for visions; the testnet agent NFT (needs the owner's account; cut if not deployed by 11.11 noon).
8. **Owner-only steps for the submission:** merge this branch into `main` (Pages republishes), deploy `season-commit` to testnet, the X post with the video, the application form, the `hackathon-submission` tag.
9. **Owner decisions still open:** make v3 the default rules; P9; the shard-market lever (see `docs/decisions.md`).

## GPU workflow (for when servers are rented again)
- From a cloud session, SSH is blocked; the Clore Jupyter can be reached over HTTPS when its host is allowed in the cloud environment (environment `forget-to-foresee-gpu`). The Jupyter password works as a token: send it in the `Authorization: token …` header.
- Helper scripts (jr, jr2, jget, jput: run a command on a server, download, upload) and the team brief: `docs/handoff/team-brief.md`. The scripts themselves lived in the session's scratchpad: recreate them from the descriptions there.
- Blender 4.5.3 headless, KTX2 compression with `art/tools/compress-glb.sh` (needs toktx and gltf-transform).
- **Security:** Jupyter passwords were pasted into the chat; change them in the Clore panel. There are no secrets in the repository.

## Reports from the team agents
`docs/handoff/agent-reports/`: each agent's report on what it did and what it did not finish.
