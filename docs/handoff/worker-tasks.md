# Worker tasks (08.11.2026)

Paste-ready tasks for extra workers (Claude Code cloud tasks or a local `claude --worktree <name>` window).
Each task owns disjoint paths, so workers can run in parallel. Base every branch on `main` (or on the branch
that holds this file, which is `main` plus docs).
The local window on `art/faces-wink` owns the faces (HANDOFF item 1): nobody else touches `art/agents/`
or `game/public/assets/models/agent_*.glb`.

Rules every worker follows (from `CLAUDE.md` and `docs/collab.md`): English-only repository text; small
commits pushed right away; `cd game && npm test` and `npm run build` stay green; never edit
`game/src/game/engine.js` or `prototype-2d/`; record decisions in `docs/decisions.md`; write a short report
to `docs/handoff/agent-reports/<task>.md` (what was done, what was not, how it was checked).
Shared files: add new rows only at the end of the `docs/decisions.md` §4 table, and edit only your own rows of
`docs/HANDOFF.md`, so the lead's merges stay trivial. Do not open pull requests; the lead merges the branches.

---

## Task A: audio and VFX in the gameplay (HANDOFF item 2)

**Branch:** `claude/audio-vfx-wiring` · **Owns:** `game/src/audio/**`, `game/src/vfx/**`, `game/src/play/hooks.js`,
`game/src/play/game.js`, `game/src/main.js`, new files under `game/src/play/`, `game/tests/client/audio*.mjs`,
`game/tests/client/vfx*.mjs`, `docs/audio.md`, `docs/vfx.md`.

Context: the wiring is partial, not absent. `game/src/play/game.js` already lazy-loads `createVfx` and
`createAudio`, unlocks audio on the first key or pointer, sets tension, speaks the Guest strokes and sets the
zone; `game/src/play/hooks.js` maps room events to cues (`CUE_NAMES`, `VFX_MAP`, `AUDIO_MAP`, `cuesForEvent`).

Steps:
1. Audit the gap against the integration sections of `docs/audio.md` and `docs/vfx.md`; list it in your report first.
2. Audio: `audio.setListener(camera, player.position)` every frame; one positional `amb_shell_hum` per Shell;
   footsteps for Iris (non-positional) and NPC agents (positional) by surface (`step_stone`, `step_wood` on bridges,
   `step_grass`, `step_glass` inside a Shell); `ui_click`/`ui_confirm`/`ui_error` on play-layer actions;
   music/sfx/master volume in the scene settings menu if it fits without editing Codex-owned `game/src/ui/**`
   (otherwise write the request in `docs/collab-requests.md`).
3. VFX: `vfx.attachToComposer(lookdev.post.composer)` and `vfx.setQuality(lookdev.tier)` after every quality
   change (null composer on the low tier); `vfx.update(dt)` before `lookdev.render()`; reduced motion follows
   `lookdev.reducedMotion`; `shell_mist` following each Shell; `shell_crack_pulse` on Shell IV; the `tension`
   singleton driven by the season tension (`level` 0..1) with `hooks.skyTint`; the `logogram` effect on the
   Shell glass when a sign is shown (forms and dots from the visible sign); `vote_finale` with camp points from
   `game/src/scenes/layout.js`.
4. Fill the cue table: every name in `CUE_NAMES` either maps to an effect and/or sound or is listed as
   intentionally silent in a comment. Keep cues presentation-only (they never change state).
5. Tests: extend `tests/client/audio.test.mjs` / `vfx.test.mjs` for the cue mapping (every mapped name exists in
   `AUDIO_MANIFEST` / the VFX preset names). Check in a browser (`npm run dev`, `/?play=direct` and
   `/?demo=judge`): no console errors, a Shell visit plays the mist and the hum, the low tier still renders.
6. Update `docs/audio.md`, `docs/vfx.md` and the HANDOFF Audio/VFX rows to the real state.

---

## Task B: full UA, IT and 中文 translation (HANDOFF item 5)

**Branch:** `claude/i18n-uk-it-zh` · **Owns:** `game/src/locales/uk.js`, `it.js`, `zh.js`, the matching files
under `game/src/play/locales/` (create `uk.js`, `it.js`, `zh.js` there if the play context loads per-locale
files; read `game/src/play/i18n.js` first), and a new `game/tests/ui-i18n-locales.test.mjs`.

Context: `uk`, `it`, `zh` today cover only the lobby and core labels (`...en` plus about 30 keys); everything
else falls back to English. Sources: `game/src/locales/en.js` (~620 lines, largest groups `wh.*`, `log.*`,
`ctor.*`, `tour.*`, `settings.*`, `reason.*`, `line.*`) and `game/src/play/locales/en.js`. Russian (`ru.js`)
is a useful second reference for tone and plural handling.

Steps:
1. Translate every key of both `en.js` files into Ukrainian, Italian and Simplified Chinese. Keep the `...en`
   spread as a safety fallback.
2. Keep every ICU placeholder name and argument type exactly (`{name}`, `{n, plural, ...}`, `{x, select, ...}`).
   Use the right plural categories (uk: one/few/many/other; it: one/other; zh: other only); check that the
   project's own ICU subset (`game/src/ui/i18n/`) supports them before relying on them.
3. Never translate hashes, proof bytes or secret phrases (spec §9). Keep the title "Forget to Foresee".
   Pick one clan-name rendering per language and use it everywhere (the existing `uk` lobby strings set the tone).
4. HUD strings (`wh.*`) sit in fixed mockup widths: keep them as short as English; prefer a shorter synonym
   over overflow.
5. Add `tests/ui-i18n-locales.test.mjs` (and list it in the `test` script of `game/package.json`): every `en` key
   exists in `uk`, `it`, `zh` as an own property, and the placeholder set of each message matches `en`.
6. Check rendering: Chinese glyphs need a CJK fallback in the font stacks (Libre Caslon / Old Standard TT /
   Source Sans 3 have none); Ukrainian needs і ї є ґ in the Cyrillic face. Fix the font stacks only through a
   request in `docs/collab-requests.md` if they live in Codex-owned UI files. Look at the lobby, tutorial, world
   HUD and play panels in each language at 1280 px and 390 px wide.
7. Update the HANDOFF Languages row.

---

## Task C: repair the decision table in `docs/decisions.md`

**Branch:** `claude/decisions-table` · **Owns:** `docs/decisions.md` only. Small; any worker can take it after A or B.

Defects:
- §4 row "P2 and P8 approved" ends with `||` and has the next row ("Strict rule: the repository and the game are
  English-only") glued onto the same line; split them into two rows.
- Every table row after the bullet list in §7 "Environment notes" (27 rows, from "Art workflow: GitHub is the
  single source of truth" to the end of the file) has no header row there, so GitHub renders it as plain text.
  Move all of them into the §4 table.
- 07.11 and 08.11 rows are interleaved (e.g. "Codex integration handoff", 07.11, sits among 08.11 rows). Put every
  row of the §4 table in date order (keep the relative order of rows with the same date).

Change no wording. Check that the file renders as one table on GitHub (preview the Markdown).

---

## Task D: submission readiness (README, judge path, checklist)

**Branch:** `claude/submission-readiness` · **Owns:** `README.md`, `docs/hackathon-rules.md`, new files under
`docs/submission/`, `docs/handoff/agent-reports/submission.md`.

Context: the first judging layer is AI screening (Claude Code and Codex) that checks that the project runs and
that every claimed feature exists (`docs/hackathon-rules.md`). The README is partly stale: for example the
"3D game" section still says "No game rules run in the 3D client yet", while the play layer, the world HUD,
`/?play=direct`, `/?demo=judge` and the GitHub Pages build now exist (`docs/HANDOFF.md`, last rows of
`docs/decisions.md`).

Steps:
1. Re-read https://nearhackathon.com/HACKATHON.md (if the host is blocked, say so in the report and work from
   `docs/hackathon-rules.md`); update the checklist in `docs/hackathon-rules.md` if the rules changed.
2. From a fresh clone run every command the README gives (`game`: `npm ci`, `npm test`, `npm run build`,
   `npm run dev` + the judge path in a headless browser; `server`: `npm ci`, `npm test`, the example agent;
   `contracts/season-commit`: the tests if `cargo` is available, otherwise say so). Record the exact output.
3. Rewrite the README so that every claim matches what runs now: one "Judge in 5 minutes" block at the top
   (live Pages link, `/?demo=judge`, the exact "do X, see Y" steps), current controls, current real/mock table,
   test counts as measured. Remove or fix every stale line. Never claim anything that does not run.
4. Fill the Q-001–005 section: libraries with licences as found in the `package.json` / `Cargo.toml` files,
   AI tools used, and the baseline tags (`pre-hackathon` exists; `hackathon-submission` is created by the owner
   at freeze, write the exact commands and the diff link format).
5. Draft in `docs/submission/`: the apply-form answers (description 20–2000 characters, tracks with reasons),
   the X post text (with the required "built at NEAR HACKATHON", @NEARProtocol, #NEARHackathon) and a 60–90 s
   demo video shot list that follows the judge path. Leave the owner's personal data as `TODO(owner)`.
6. Report: every README command with pass/fail, every checklist item with done / owner action / blocked.

---

## Task E: mobile play (HANDOFF item 6)

**Branch:** `claude/mobile-play` · **Owns:** `game/src/ui/input.js`, `game/src/render/quality.js`,
`game/src/render/lookdev.js`, `game/src/render/post.js`, new `game/tests/client/mobile*.mjs` /
`quality*.mjs`, `docs/mobile.md` (new).

Context: touch controls exist (tap to walk, drag to orbit, pinch to zoom) and phones get the miniature HUD and the
`_m` texture variants (last row of `docs/decisions.md`). Missing: a way to run on touch, and quality tiers tuned
for phones. Task A owns `game/src/main.js` and `game/src/play/**`; if you need a hook there, write it in
`docs/collab-requests.md` instead of editing those files.

Steps:
1. Measure first: in headless Chromium with phone emulation (`devices['iPhone 13']`, `devices['Pixel 7']`) load
   `/?play=direct`, record frame time, draw calls, triangles, texture memory and the chosen tier (F3 dev HUD or
   `renderer.info`). Put the numbers in `docs/mobile.md`.
2. Run on touch: a run toggle button (thumb-reachable, bottom right, at least 48 px, does not cover the
   miniature HUD) and/or double-tap-to-run, feeding the same run flag Shift sets in `input.js`. Keyboard and
   gamepad behaviour stays exactly as is.
3. Phone tier: pick the tier from device signals (touch + screen size + `deviceMemory` / `hardwareConcurrency`
   where available), cap the pixel ratio, drop or cheapen the post passes that cost most, lower shadow-map size
   and foliage density through the existing quality knobs. Keep the desktop tiers unchanged. Add a dynamic
   step-down when frame time stays above budget for a few seconds.
4. Tests for the tier choice and the run toggle (pure functions; no WebGL needed).
5. Re-measure after the change; record before/after in `docs/mobile.md` and the HANDOFF Mobile item. Check that
   desktop `/?play=direct` and the low tier still render with no console errors.


---

## Task F: UI polish, the "cheap" look (owner feedback 08.11, with screenshots)

**Branch:** `claude/ui-polish` · **Owns:** `game/src/play/ui.js`, `game/src/play/hub-ui.js`, `game/src/play/world-hud.js`,
`game/src/play/hints.js`, the label/nameplate code in `game/src/play/agents.js` (not its animation code: Task G),
`game/src/ui/world-hud/**`, `game/src/ui/styles.css`, `game/src/ui/hud.js`, new `game/tests/ui-polish*.test.mjs`,
`docs/ui-polish.md` (new). Owner override of the Codex ownership of `game/src/ui/**` for this polish (same as the lobby
rebuild); record it in `docs/decisions.md` and leave a note in `docs/collab-requests.md` for Codex.

Owner's words: "this looks cheap: too little padding on the buttons, things stack on top of each other". What the
screenshots show (live build, desktop):
- The Memories panel opens on top of Signs & Visions and both stay visible: the sign cards' text ("Sign #3 · Published",
  "Anchor: Shell III, Trial 4") shows through the memory cards. Only one modal panel may be open at a time, or the one
  underneath must be fully hidden; panel backgrounds must be opaque enough that nothing reads through.
- The Shell hub dock ("Fly into a Shell", I–IV, "Let trial 5 pass") overlaps the open panel. The dock must hide while
  a panel is open (or the panels must leave its area free).
- Buttons ("Forget it for a vision", the quest pill "MAIN QUEST", the dock buttons) have cramped padding and tiny
  type; the gold pill text touches its border. Use one spacing scale (e.g. 4/8/12/16/24), min 40 px touch targets on
  desktop and 48 px on phones, consistent radii, clear hover/focus/pressed states.
- The world nameplate ("Frost · fragment giver") floats in the scene as a translucent box behind scenery edges and over
  a wooden board, with a large faint circle icon; it reads as a debug label. Make it a small, legible, screen-space
  plate that fades with distance, never clips into geometry, and does not cover the character's head.
Steps: audit every play-layer panel, card, button and label at 1280×800, 1920×1080 and 390×844 (headless Chromium
screenshots in `docs/ui-polish.md`, before and after); fix stacking/z-order and panel exclusivity; apply the spacing
and type scale; keep the owner's world HUD mockups (`docs/ui-world-hud.md`) as the visual reference, only polish
spacing/stacking/legibility, no redesign. Keep all five locales fitting (longest strings: uk, it). Tests for panel
exclusivity (pure logic). `npm test` and `npm run build` green.

---

## Task G: player movement that feels AAA (owner feedback 08.11)

**Branch:** `claude/movement-feel` · **Owns:** `game/src/physics/**`, `game/src/render/camera-rig.js`, the movement and
avatar-update parts of `game/src/main.js` (`frame()`, `wishVector`, the avatar heading/position block), the animation
code in `game/src/play/agents.js` (clip blending, Iris's model; not the nameplates: Task F), `game/src/ui/input.js`,
`game/tests/client/collision*.mjs`, `smooth*.mjs`, new `game/tests/client/movement*.mjs`, `docs/movement.md` (new).

Owner's words: "the player's movement does not match normal AAA physics". Target: the feel of a modern third-person
action game. Concretely:
1. Measure the current controller first (`docs/movement.md`): acceleration/deceleration curves, turn rate, walk/run
   speeds, stopping distance, slope and step behaviour, camera lag; note what reads as floaty, robotic or sliding.
2. Movement: speed-dependent acceleration and braking (quick start, short controlled stop), turn rate limited by speed
   (pivot in place when standing, wide arc at a run), no instant 180° flips; momentum preserved over small bumps;
   ground snapping on slopes and steps without jitter; edge handling on bridges (no sliding off, no invisible walls
   feel). Keep the swept capsule and the no-tunneling guarantees (existing tests stay green, add new ones).
3. Animation: blend idle/walk/run by actual ground speed and sync the clip playback rate to it (no foot sliding);
   start/stop and turn transitions with short cross-fades; lean slightly into turns; Iris faces the move direction
   smoothly. Same for NPC agents walking routes.
4. Camera: smooth follow with slight lag and look-ahead in the move direction, no jitter at 30 Hz physics (interpolate
   between physics steps for rendering), collision with scenery so it never clips into walls.
5. Click/tap-to-move and G routes use the same controller (they must not glide). Keyboard, gamepad and touch keep
   their bindings. Walk speeds stay in the range the design needs (walks of 30-45 s camp to camp, `docs/decisions.md`).
6. Before/after numbers and a short frame-by-frame description in `docs/movement.md`. `npm test` and `npm run build`
   green; check `/?demo=judge&mode=walk` and the hub mode still work with no console errors.

---

## Task H: island map; no floating labels in the world (owner feedback 08.11)

**Branch:** `claude/island-map` · **Owns:** `game/src/render/greybox.js` (labels only), new `game/src/play/map.js` and
`game/src/play/map-ui.js` (self-contained panel with its own styles), the map wiring in `game/src/play/game.js`, the
`KeyN` entry of `PLAY_KEYS` in `game/src/main.js` (one-line change; the rest of `main.js` belongs to Task G), the map
strings in `game/src/play/locales/*.js` (all five locales; translate uk/it/zh yourself, keep the parity test green),
new `game/tests/client/map*.mjs`, `docs/map.md` (new). Task F wires the world HUD hotbar "map" button to the API
you export; agree on it through `docs/collab-requests.md`.

Owner's words, with a screenshot of the overview camera ("Camp: Iris · not final art", "Memory shard · not final art"
floating over the island): "the labels cheapen it; make a map and show them there".
1. No text floats in the 3D world during play. The greybox "· not final art" labels show only in dev (`?dev=1`, the F3
   dev HUD, or the asset review page); in play the greybox stand-ins stay unlabeled (they are replaced by the models as
   they stream in). Update the README lines that describe the labels.
2. A map panel (key **N**, the hotbar map button, a tap target on phones): a stylized top-down view of the
   archipelago drawn from `game/src/scenes/layout.js` (island, bridges, plaza, the Scroll, the six camps with clan
   names, the four Shells with their state from the hub: quiet / signs waiting, the anchor zones), Iris's position and
   heading, the current goal marker, other agents' positions. Clicking a place routes there (the existing `walkTo` /
   G route) and in the hub mode clicking a Shell flies there. Style: matches the world HUD (parchment/ink and gold
   from `docs/ui-world-hud.md`), legible at 390 px wide, closes with N/Esc, only one panel open at a time.
3. Tests for the map model (places from the layout, coordinates, state per Shell, route targets). `npm test` and
   `npm run build` green; headless check of both modes with the map open and closed, no console errors.

---

## Quality bar for every task (owner, 08.11): "the best humanity has seen, no errors, no misses; money is no problem"

- Ship nothing you have not looked at: every visual change gets before/after screenshots at 1280×800, 1920×1080 and
  390×844 in your doc, every behaviour change gets a test. Zero console errors and warnings in the states you touch.
- Self-review before each push: re-read the diff as a hostile reviewer (edge cases, all five locales, phone, low
  tier, reduced motion, keyboard/gamepad/touch). Fix what you find; list what you could not verify and why.
- Polish is part of the task, not extra: spacing, timing, easing, sound, readability, copy. If a detail looks
  cheap, it is a defect.
- Never trade correctness for looks: `baseline-2d-1` parity, the proofs and the agent API stay exact.

---

## Task I: a world-class first-time experience (tutorial and onboarding)

**Branch:** `claude/tutorial` · **Owns:** `game/src/ui/onboarding.js`, `game/src/ui/flow.js`, `game/src/ui/hologram/**`,
`game/src/play/objectives.js`, the `tut.*`, `onb.*` and `goal.*` strings in all locale files (translate uk/it/zh
yourself, parity test green), new `game/tests/tutorial*.test.mjs`, `docs/tutorial.md` (new). Task F owns the world HUD
and `play/hints.js`: agree hint changes with F through `docs/collab-requests.md`.

Goal: a new player (and a hackathon judge with 5 minutes) understands the core loop Read → Anchor → Reveal → Verified
and the Price of Memory without reading anything long, in both play modes (Shell hub default, `?mode=walk`).
1. Play the current first 5 minutes as a stranger (headless, both modes, all five locales); write every confusion,
   dead end, wall of text and unclear button into `docs/tutorial.md` first.
2. Redesign the flow as show-don't-tell: one idea per step, the player does it right away, immediate feedback
   (sound, VFX cue, a short line from Iris), never more than ~12 words on screen per beat, skippable, resumable,
   never blocks a returning player. The judge path (`?demo=judge`) must reach "Verified ✓" in under 3 minutes.
3. Copy: short, concrete, in the game's voice; the same terms everywhere (Shell, sign, anchor, silk, trial, vision).
4. Tests for the flow state machine (step order, skip, resume, both modes). `npm test` and `npm run build` green.
   Update the README judge table if the steps change, verified step by step.

---

## Task J: trailer, demo video and clips (best-in-class capture)

**Branch:** `claude/trailer` · **Owns:** new `game/src/cinematic/**` (scripted camera paths, a deterministic clock /
frame-stepping hook enabled only by `?cinematic=<name>`), new `tools/capture/**`, `docs/submission/video-shot-list.md`,
`docs/submission/trailer.md` (new), `docs/media/` (final encoded videos, each file under 90 MB; no raw frames in git).
May add one guarded hook line in `game/src/main.js` for the cinematic clock (coordinate with Task G in
`docs/collab-requests.md`).

Goal: a 60–90 s hackathon demo video (the one the owner posts on X; it must show one complete loop: read a sign,
anchor silk, the reveal with "Verified ✓", the Price of Memory) and a 30 s trailer, plus three 10–15 s clips for social
posts, at a quality above the best indie trailers: 1080p60 minimum, 4K masters if feasible.
1. Deterministic capture: render frame by frame with a fixed timestep (the game clock advanced per captured frame, not
   wall time), so a slow software renderer still yields perfectly smooth 60 fps; encode with ffmpeg (installed:
   ffmpeg 6.1). If the result needs a GPU for quality (soft shadows, post), say so and prepare the exact commands for
   the owner's GPU server; do not rent servers yourself.
2. Cinematography: scripted dolly/crane/orbit shots with eased motion, no UI in pure beauty shots, UI shown deliberately
   in gameplay shots; title cards in the game's typography; captions in English (subtitle file, plus burned-in versions).
3. Sound: mix the game's own synthesized music and SFX (game/public/assets/audio) to picture; no third-party music.
4. Build the pipeline now on the current build; the final render waits for the lead's signal after Tasks F, G, H and the
   new character models land. Report what each video shows, its duration, resolution, file size and where it is.

---

## Task K: QA, the adversarial playtester

**Branch:** `claude/qa` · **Owns:** new `game/tests/e2e/**` (headless Chromium end-to-end checks, run by a separate
`npm run e2e` script you add to `game/package.json`; not part of `npm test`), `docs/qa/**`.
Does not fix product code: files every defect with exact repro steps, expected vs actual, screenshot and severity in
`docs/qa/defects.md`, and messages the lead for each blocker.
1. Play `main` end to end, both modes, all five locales, desktop and phone viewports, low tier, reduced motion,
   keyboard / gamepad (emulated) / touch: lobby, onboarding, every panel, every decision card, a full 17-trial season
   to the vote and the Heir, the agent API example, the README commands exactly as written.
2. Look for: console errors, overlaps and clipping, untranslated or overflowing strings, stuck states, soft-locks,
   wrong numbers (silk, attention, trial), proofs that do not verify, sounds that do not play or never stop, frame-time
   spikes, anything a judge would call a bug.
3. Turn every reproducible defect into a failing e2e check where possible, so the fixing worker can prove the fix.
4. Re-run on each merge the lead announces; keep `docs/qa/defects.md` current (open / fixed / won't fix).
