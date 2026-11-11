# Handoff: hackathon spec (`docs/hackathon-tz.md`)

Branch `claude/hackathon-tz`, draft PR #34 to `main` (the owner merges; never push or tag `main`). State: 11.11.2026.

## Done (tests green: `cd game && npm test`, 649)
- **P0-B** first-contact copy for the town start; **P0-C** terms taught in context; **P0-D** slot names are buttons
  with a one-line hint (`flow.js` `tapLabel`, `hintSlot`); **P0-E** one Begin, preview paints at once. Five locales,
  tests in `game/tests/tutorial.test.mjs`, notes in `docs/tutorial.md` §2.1.
- Signs panel test fixed after the subtitle removal.

## In progress: P0-A (Shell interior + streaming order)
- Finding (real WebGL, RTX 5090): the real hall is **not** mixed up (entrance at +Z, glass at -Z, Guests behind it).
  The defect was order: the flight entered before `shell_interior.glb` had streamed, so the first frame was the
  greybox and Iris stood at the greybox spawn.
- Code in place: `scenes/shell-layout.js` (pure layout + `layoutProblems`), streamer pins (`streaming.js`
  `JUDGE_PINS`, `heroLast`; `assets.js` `pin()`), pins set in `boot-world.js` `startSeason`, the flight cover waits
  on `shell.whenReady()` (`play/game.js`), late-swap respawn (`shell.onRealLayout`). Tests:
  `tests/client/shell-layout.test.mjs`.
- **Not yet verified on a GPU:** the new real spawn `[0, 1.2, 9.6]` (landing at the head of the stairs; it was
  `[0, 1.2, 11.3]` in the vestibule) and that the first frame after the flight is the real hall. If the camera clips
  in the vestibule, try the hall floor at the foot of the stairs (`[0, 0, 5]`).
- Still to do for P0-A: README row 86 (interior note) and the judge table, `docs/smoothness.md` note on the pins,
  a decisions row, walk `/?demo=judge` and `&mode=walk` on the GPU.

## Next
- **P0-F**: a real play-path readback exists: "GPU stall due to ReadPixels" was logged on the RTX 5090 on
  `?demo=judge&play=direct` without `?cinematic=`. Find it (lookdev / hdr-guard / warmup / post), remove or defer;
  make `scene-controls.js` `open()` show the dialog first; static test that `boot-world.js` and `play/game.js`
  never reach `grabCanvas`.
- Then P1-C, P1-A, P1-B in that order (spec sections). Update the PR checklist as tasks land.

## How to resume
- GPU server (real WebGL): `tools/gpu-server/jx.py` with the host and token in an uncommitted directory. On the
  server: `/root/w/tz/ftf` (clone of this branch), `bash /root/w/tzbuild.sh` rebuilds and serves port 4311,
  `. /root/w/tz/env.sh && node /root/w/tz/shellcap.cjs shots/<name>` flies into Shell I and takes frames.
- Local: `cd game && npm run dev`, headless Chromium works for the onboarding screens (SwiftShader).
