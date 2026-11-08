# Task K report: QA, the adversarial playtester (branch `claude/qa`)

Base (latest retest: `claude/loving-curie-ihasft` `c6bb3b0`, see the retest log): `claude/loving-curie-ihasft` `7f65be6` for the first pass (= `main` `07ddd60` + docs), then `2004418` (Tasks G, H,
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
  errors), a whole walk-mode season by T alone with the vote at the Scroll and the Heir panel (0 rejected, 0 errors), the README judge table in walk mode step by step (first and second version), the new five-beat tutorial
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
- Every e2e file ran at least once on 2004418; the red ones are the open defects (`docs/qa/defects.md`).

## How it was checked

Headless Chromium 1243 / Playwright 1.63 on SwiftShader (4 cores, no GPU; 5–15 fps, 0.5 fps while models stream).
Scratch scripts for exploration, then the reproducible version of each finding as an e2e check. Screenshots in
`docs/qa/shots/` are JPEG q6 copies of the PNGs the probes took.

## Retest log

| Commit | Result |
|---|---|
| 7f65be6 | first pass: 21 defects filed |
| 2004418 | QA-001, QA-002, QA-016, QA-017, QA-009c fixed; QA-003/004/005/006/007/008/009ab/011/012 reproduced; new QA-022/023/024/025 |
| 6f2f288 (= main 1a17673) | QA-003, QA-004, QA-009, QA-020 fixed; QA-027/028 closed as renderer timing; QA-005 half (nothing opens now, README stale); QA-011, QA-012, QA-021 reproduced; new QA-029 preload warning, QA-030 Iris capsule at first, QA-031 top-left button over the trial card, QA-032 frame-stepped fades; films on a phone, loading path, agents, verifiers and motion input all clean |
| 5f94cbb | QA-007, QA-008, QA-013, QA-019, QA-022 fixed; QA-006, QA-010 not reproduced; QA-003, QA-004, QA-005, QA-012, QA-020, QA-021 reproduced; new `verify.e2e.mjs` (node and python verifiers OK on real exports, tampered root and salt FAIL) and `motion.e2e.mjs` (lobby/onboarding input and reduced motion green; the world part found QA-027 and QA-028) |
| c6bb3b0 (integration, F2 + G2 + first-seconds) | QA-005, QA-012, QA-021, QA-029, QA-030, QA-031 fixed; QA-032 re-assessed as not a defect (WAAPI fades are wall-clock, agreed with G); QA-011 layout still open (dock over the quest card on iPhone 13); QA-015 still open; new QA-033 (truncated "Words known" / it trial values), QA-034 (uk/ru Cyrillic font 404 in the production build), QA-035 (phone: Chronicle and "?" buttons over the journal tiles and the map button). `npm test` 489/489, build + boot smoke green, README judge table and hub path match, phone film clean. e2e against `vite preview`: 43/53 (reds: QA-011, QA-034, and the `src/`-importing motion/verify files, which pass or show only SwiftShader timing on the dev server) |
