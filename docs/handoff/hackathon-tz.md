# Handoff: hackathon spec (`docs/hackathon-tz.md`)

Branch `claude/hackathon-tz`, draft PR #34 to `main` (the owner merges; never push or tag `main`). State: 11.11.2026.

## Done (tests green: `cd game && npm test`, 653)
- **P0-B** first-contact copy for the town start; **P0-C** terms taught in context; **P0-D** slot names are buttons
  with a one-line hint (`flow.js` `tapLabel`, `hintSlot`); **P0-E** one Begin, preview paints at once. Five locales,
  tests in `game/tests/tutorial.test.mjs`, notes in `docs/tutorial.md` §2.1.
- Signs panel test fixed after the subtitle removal.

- **P0-A** Shell hall: the model was never mixed up; the flight entered before it streamed. Pins (`JUDGE_PINS`),
  the flight cover waits for the hall, arrival on the hall floor at the foot of the stairs (`scenes/shell-layout.js`,
  `tests/client/shell-layout.test.mjs`). Checked on real WebGL.
- **P0-F** the only play-path read-back was the sky LUT: cached per atmosphere; Controls shows first
  (`tests/client/readback.test.mjs`, `docs/smoothness.md`).

## Next
- Walk `/?demo=judge` and `&mode=walk` end to end on the GPU once more before calling P0 done (README judge table).
- **P1-C** honest shard card for every player, **P1-A** hitch-proof stairs + `KeyW`/`ц` test, **P1-B** town quest
  (spec sections). Update the PR #34 checklist as tasks land; report to the lead when P0 and P1 are done.

## How to resume
- GPU server (real WebGL): `tools/gpu-server/jx.py` with the host and token in an uncommitted directory. On the
  server: `/root/w/tz/ftf` (clone of this branch), `bash /root/w/tzbuild.sh` rebuilds and serves port 4311,
  `. /root/w/tz/env.sh && node /root/w/tz/shellcap.cjs shots/<name>` flies into Shell I and takes frames.
- Local: `cd game && npm run dev`, headless Chromium works for the onboarding screens (SwiftShader).
