# Worker tasks (08.11.2026)

Paste-ready tasks for extra workers (Claude Code cloud tasks or a local `claude --worktree <name>` window).
Each task owns disjoint paths, so workers can run in parallel. Base every branch on `main`.
The local window on `art/faces-wink` owns the faces (HANDOFF item 1): nobody else touches `art/agents/`
or `game/public/assets/models/agent_*.glb`.

Rules every worker follows (from `CLAUDE.md` and `docs/collab.md`): English-only repository text; small
commits pushed right away; `cd game && npm test` and `npm run build` stay green; never edit
`game/src/game/engine.js` or `prototype-2d/`; record decisions in `docs/decisions.md`; write a short report
to `docs/handoff/agent-reports/<task>.md` (what was done, what was not, how it was checked).

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
