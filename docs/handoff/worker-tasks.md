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

