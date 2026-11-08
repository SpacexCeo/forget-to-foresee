# Task K report: QA, the adversarial playtester (branch `claude/qa`)

Base: `claude/loving-curie-ihasft` `7f65be6` for the first pass (= `main` `07ddd60` + docs), then `2004418` (Tasks G, H,
I, M, N and the QA-001/002 fixes) merged into `claude/qa` for the retest. Owned paths only: `game/tests/e2e/**`,
the `e2e` script in `game/package.json`, `docs/qa/**`, this report. No product code was changed.

## Done

- **Defect list**: `docs/qa/defects.md`, 25 items with severity, exact repro, expected vs actual, screenshots
  (`docs/qa/shots/`), suggested owner and status. Blocker/High found: QA-001 (the Guests' line said "The reveal does not
  match the root." on every verified reveal, all five locales) and QA-002 (hub keys live during the flight fade: a
  flight could run inside the automatic trials) — both fixed by the lead and **verified fixed on 2004418**; QA-019
  (mixed languages after a mid-season language switch) and QA-022 (rules-v3 log lines render as "Something happened
  that this build cannot describe yet.") are open. Every blocker was sent to the lead the moment it was confirmed.
- **e2e harness**: `cd game && npm run e2e` (not part of `npm test`). Playwright + `node --test`, a Vite dev server per
  file (or `FTF_E2E_URL` for a deployed build), SwiftShader-safe input through `window.__ftf.play.handleKey` and
  `element.click()`, console/page-error capture, a teleport helper that replaces software-rendered walks. Files:
  `proof-line` (QA-001), `hub-input` (QA-002, QA-008), `hub-season` (QA-003, QA-007, QA-012, zero rejections and
  errors over a whole hub season), `walk-panels` (QA-004, 005, 006, 010, 013, 019, 020, 021), `layout` (QA-009,
  QA-011, greybox labels), `smoke` (both modes, five locales, reduced motion + low tier, old HUD, Pixel 7, walk and
  run speeds), `engine-text` (QA-022, node only). Each check is named after its defect and fails while it is open.
- **What was played**: a whole 17-trial hub season to the vote and the Heir (92 commands, 0 rejected, 0 console
  errors), the README judge table in walk mode step by step (first and second version), the new five-beat tutorial
  end to end (wrong taps, dot cycling, stake and seal, forget, Novice, look picker, first contact, returning player),
  the lobby flow, the island map (open/close, routes, exclusivity with Memories, phone), every play panel, settings,
  help, language cycling, the live GitHub Pages build, iPhone 13 / Pixel 7 emulation, 1280×800 / 1920×1080 / 390×844,
  uk / ru / it / zh, reduced motion, low tier, `?hud=old`; the README commands exactly as written (`npm test` 292 → 361,
  server 28, `cargo test --lib` 56, `npm run build`, the agent example with `"rejected": 0, "firstProofVerified": true`).

## Not done / not verifiable here

- No GPU: frame-time spikes during asset streaming, the feel of movement and camera, audio mix and VFX exposure
  (the finale beams look blown out under SwiftShader) could not be judged; the in-game speeds (1.70 / 3.51 m/s) and
  zero console errors were checked instead.
- Gamepad was not emulated beyond the input unit tests (no virtual pad in headless Chromium); touch was emulated
  (tap/drag through Playwright devices), not felt on a phone.
- Native-speaker review of uk / it / zh copy: only mechanical checks (no raw keys, no placeholders, no mixed scripts).
- `smoke.e2e.mjs` was written after the other checks and not yet run end to end in this session (every other file
  ran at least once; results in `docs/qa/defects.md`).

## How it was checked

Headless Chromium 1243 / Playwright 1.63 on SwiftShader (4 cores, no GPU; 5–15 fps, 0.5 fps while models stream).
Scratch scripts for exploration, then the reproducible version of each finding as an e2e check. Screenshots in
`docs/qa/shots/` are JPEG q6 copies of the PNGs the probes took.

## Retest log

| Commit | Result |
|---|---|
| 7f65be6 | first pass: 21 defects filed |
| 2004418 | QA-001, QA-002, QA-016, QA-017, QA-009c fixed; QA-003/004/005/006/007/008/009ab/011/012 reproduced; new QA-022/023/024/025 |
