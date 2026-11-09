# Handoff: state on 09.11.2026, 07:10 Kyiv (lead session)

**09.11 07:35 UTC:** the owner wants ONE 60 s jury video (English, readable, credit "Made by Lambada_eth") with the new Iris and current Guests, mechanics, agents + HTTP API, tense season, rewards, NFT, and an animated backend data-flow diagram. Worker J3 `session_01QfMhgE18GEabs5bp2KW1we` (`claude/jury-video`); storyboard first in `docs/submission/jury-video.md`; GPU jobs are routed through the lead to the GPU art session. The X post waits for this video. Iris hero target: in game by 11.11 12:00 Kyiv.

**09.11 07:30 UTC:** PR #8 merged to main and live on Pages: both contracts on testnet (`ftf-seasons.testnet`, `ftf-shards.testnet`), the "Verified on NEAR testnet ✓" badge in the judge path. Worker M is done. Submission payload (owner values filled, tracks games+nfts, requestId fixed) is kept outside the repo in the lead's scratchpad; it waits for the owner's X post URL, the consent and an explicit "yes".

**09.11 morning, later:** `season-commit` is live on testnet (`ftf-seasons.testnet`, owner `ftf-coordinator.testnet`; judge season `793f6c05e89839f2` committed, 15/15 reveals, ash key; record in `contracts/season-commit/target/judge-deploy/` on worker M's machine). M (`session_01QfMhgExsbgGFqMUCWf9EVh`, `claude/near-live`) is finishing the HUD badge, `near-deployment.js` and memory-shard; the owner approved merging it to main when green. PR #7 merged to main (tap-through chapter films, submission drafts). The submission package for the owner: `docs/submission/x-post.md` and `apply-form.md` (owner fields still TODO; requestId kept outside the repo). Iris hero rework (owner reference + Blender blockout in `art/agents/reference/` on `claude/iris-hero`) went to the GPU art session (`session_01QfMhgDiqET9W6zwun44weJ`).

**Morning 09.11:** `main` = PR #6 (overnight integration, 493 tests, production-build headless checks clean), live on Pages. The hourly lead loop is off; the juror R2 keeps its :15/:45 schedule and starts scorecards at 15:00 UTC. Videos (demo, trailer, 3 clips) were sent to the owner and live on `claude/laughing-thompson-dc7r09` docs/media, not in `main`.

## Live state (read this first if the session or the usage limit ended)

**Integration branch:** `claude/loving-curie-ihasft` (lead). `main` = PR #3 + PR #4 (merged 08.11 ~20:35 Kyiv), live on
GitHub Pages: https://spacexceo.github.io/forget-to-foresee/ (`?demo=judge&mode=walk` is the README judge path).
The integration branch is ahead of `main` only by the round-5 agents (hands) and docs; merge it with a PR when convenient.
Checks at 426cc1a: `cd game && npm test` 469/469, `cd server && npm test` 28/28, `npm run build` green; headless on the
production build: `node tests/client/boot-smoke.mjs` (lobby and direct paths), the judge walk/hub paths, zero console errors.

**How the work is organised:** one Fable cloud session per task in `docs/handoff/worker-tasks.md` (A–V); each works on
its own `claude/<task>` branch, owns disjoint paths, writes `docs/handoff/agent-reports/<task>.md`, and the lead merges
into the integration branch, runs the checks and merges into `main` on the owner's word. Cross-task asks:
`docs/collab-requests.md`. Decisions: `docs/decisions.md` §4 (newest rows at the end of the table).

**Paused workers (all pushed, green):** F UI polish, G motion + first seconds, H map, I tutorial, K QA (`docs/qa/defects.md`
on `claude/qa`), L look-dev, M NEAR + shard NFT, N living NPCs, O Guests stage, P chapter films, Q accessibility,
R juror (`docs/jury/` on `claude/jury`; 24 h study until 09.11 15:00 UTC, then scorecards). Their reports list next steps.

**Active (minimal, token saving):** J fixes the video flicker (cause found: render resolution/pixel ratio changing during
frame-stepped capture → black corner rectangles and luma jumps; fix = freeze governor/autoTier/dynamic resolution in the
cinematic path + a luma/black-region check that fails the render) and sends a 10 s test + the demo to the GPU session.
The GPU art session ("Завершение работы", branch `claude/laughing-thompson-dc7r09`) runs it on the owner's RTX 4090.
The current `docs/media/` drafts on that branch flicker; do not use them.

**Servers (Clore):** order 2419013 = owner's RTX 4090, stays up; used for project GPU work (ANGLE Vulkan WebGL works,
gl-egl loses context). Order 2419123 belongs to another session: never touch. Extra rentals: cap 4 USD total, 0.44 USD
spent (order 2419219 closed 16:30 UTC). Rule: nothing server-only is lost; inventory in `docs/art/server-inventory.md`;
no server is stopped while it holds a server-only item the owner has not downloaded.

**Waiting for the owner:**
1. ~~NEAR testnet deployment~~ **done 09.11** (worker M, owner permission in the session): `ftf-seasons.testnet` and
   `ftf-shards.testnet`, ids and hashes in `docs/near.md`, branch `claude/near-live`.
2. Owner-only submission steps (`docs/submission/owner-steps.md`): mainnet payout account, X post with the final video,
   the form (or the API payload in `docs/submission/apply-form.md`, sent only after the owner confirms), the
   `hackathon-submission` tag. Deadline 15.11 01:59 Kyiv; freeze 13.11 20:00.

**Schedules (since 23:21 Kyiv):** one lead loop per hour (trig_018op6gxTUumLXJX3eyDUuzr at :09; the :29/:49 loops trig_01U3rg64KhBguBy5gwNvtbHF, trig_01AujfoKaraCGtHz4VpeNp8r stay off to save tokens) and the juror (trig_01NgxosZwdE8uJkaqxuLtuT2 :15, trig_01VwHGk8L8MnWCVzByeVDpwM :45). Active workers: F (open QA UI items), K (re-test of main 1a17673), O (shell.js frame safety, phone stills), J's capture job on the RTX 4090 via the GPU session (demo, then trailer and clips, the agent rebuild, 4K). Others paused with next steps in their reports.

**Model availability (09.11 00:10 Kyiv):** the Fable limit is exhausted until about 12.11 (seven-day window). All worker sessions created on Fable (A–V, the juror R) fail on their next turn; their pushed branches are intact. Only Opus 5.5 sessions run: this lead session and the GPU art session ("Завершение работы", running the video queue on the RTX 4090). Owner: new workers use Opus 5.5 at medium effort (`model: claude-opus-5-5` in create_session). Overnight in eco mode: the GPU queue (demo, trailer, clips with the flicker check; agent rebuild; 4K server-only) and one morning merge at 07:01 Kyiv (trig_014q6NjmK4V33rZkA98BBkHq); all other schedules are off.

**Overnight relaunch on Opus 5.5 (09.11 00:05 Kyiv):** F2 `session_01QfMhgC3bXjG8v7dRm14NjA` (claude/ui-polish: QA-031, QA-005/README, overlap at 1280 in four locales), G2 `session_01QfMhgCFUQvCkLm6XJ3XYDN` (claude/first-seconds: QA-029/030/032), J2 `session_01QfMhgFJGfUrN6eJtU2qesA` (claude/trailer: interesting video scripts, one GPU job), R2 juror `session_01QfMhgDAKdSL1ErtGNuQjaQ` (claude/jury; schedules trig_01W1fqnBUpajNw2RddU5YpMn :15, trig_01MHsAmrnNpJbVJFJwWXL1Gs :45), GPU art session on the RTX 4090. The hourly lead loop (trig_018op6gxTUumLXJX3eyDUuzr :09) merges finished branches and starts one K2 QA session on Opus once F2 and G2 are in; the 07:01 Kyiv run (trig_014q6NjmK4V33rZkA98BBkHq) merges into main.

**Videos (09.11 03:50 Kyiv):** clean 1080p60 GPU renders (ANGLE Vulkan, flicker check passed) of the demo (71 s), trailer (35 s) and three clips are on `claude/laughing-thompson-dc7r09` docs/media (b2c71ae, 2ed5956) and were sent to the owner; captioned versions are server-only (inventory). Two capture defects to fix before the final cut: the opening guest/emerge shot stalls on the GPU every run (excluded with FTF_SKIP_SHOTS), and the capture's "forget" action finds no memory button (trailer shot 'forget', clip-memory shot 'memory'). Keep the mp4s out of `main` unless the owner asks (repo size); link them instead.

**Open items after resume (priority):** final videos without flicker and with a stronger story (J + GPU); NEAR deploy;
K's open QA list; the juror's scorecards from 09.11 15:00 UTC; native-speaker pass of uk/it/zh; physical phone and GPU
feel tests (movement numbers in `docs/movement.md`, the 8 feel items).

---

## Earlier state (08.11 evening, kept for history)

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
| NEAR contract `season-commit` | **deployed on testnet** (`ftf-seasons.testnet`, 09.11): judge season committed, 15 leaves revealed on-chain; the HUD shows "Verified on NEAR testnet ✓" on revealed signs (checked headless at 1280, 1920 and 390 px) | `contracts/season-commit/`, `game/src/net/near*.js`, `docs/near.md` |
| NEAR NFT contract `memory-shard` (shards as NEP-171 tokens tied to the committed season, on-chain ink-ring image) | **deployed on testnet** (`ftf-shards.testnet`, 09.11), 3 judge shards minted. Game: shard history in the observation, read-only client and badge model (`game/src/net/shard-nft.js`); HUD rendering pending (request 9) | `contracts/memory-shard/`, `docs/shard-nft.md` |
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
