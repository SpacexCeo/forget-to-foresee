# guests-stage: report (Task O, branch `claude/guests-stage`)

Second pass 08.11 21:30 UTC after the lead's resume: `claude/loving-curie-ihasft` (c2314d4) merged, `cd game && npm test`
480/480, `npm run build` green. The ink Guest round 3 is the staged model.

## Done
- `game/src/play/guests-stage.js` (new, pure): the moment scheduler (sign, reveal by action, crisis, vote, yes, no, seeded
  drift), priorities and interruption, eased poses, reduced-motion placement behind a fade, quality sets ultra/high/low/phone,
  clip fallback chains (idle/draw/react/approach/recede), the ink pen schedule, `warp` and `freeze` for stills and films.
- `game/src/scenes/shell.js`: the Guests are `SkeletonUtils.clone`s with an AnimationMixer each (the old `Object3D.clone`
  shared the template's skeleton and no clip ever played); placed by their eye line in a dark-grey chamber box with layered
  noise mist, a backlight glow and a depth veil; the drawing Guest's ink thread from `socket_draw_tip` to the pen point;
  tendrils spread/fold with the answers; `guests` API (`cue`, `warp`, `freeze`, `setSeed`, `setQuality`, `setInkTexture`,
  `state`).
- `game/src/play/presentation.js`, the Guest part (`createGuestsPresentation`): cues → stage through `hooks.onCue`, seed from
  the Merkle root, quality follow, `amb_shell_hum` at half rate swelling with the emergence, additive camera hint.
- `game/tests/client/guests.test.mjs` (9 tests, in `npm test`), `docs/guests-stage.md` with six 1280×800 stills,
  decisions row, collab requests 22–25.

- Second pass: `guardFrame` in `guests-stage.js` wraps the per-frame Guest block of `shell.js` and the activation path
  (an exception is logged once, the frame and the hub's fade go on; `play.shell.frameFailures()`), with a test;
  `game.js` passes `rig` into `attachPresentation` (one line, request 22); stills at 390×844 (phone profile), low tier
  and reduced motion in `docs/guests-stage.md` (`?films=off` keeps the Arrival film off the camera during capture).

## Not done / not verified
- No 1920×1080 still; nothing seen in motion on a GPU (SwiftShader only, 4 fps). The low-tier still shows the dome and
  the ink tendrils best; on high the transmissive skin reads paler (recommendation in the doc, not changed blind).
- The ink thread is thin in the stills; a bleed flipbook is requested from the art session.
- "The white fade / uncover never waits on assets": `game/src/play/game.js` is outside Task O's paths and was not changed;
  `fly()` already uncovers 160 ms after the hub's flight regardless of streaming. If the lead meant the Shell's own loading,
  the Guests load lazily on `activate` and never block the fade.

## How it was checked
Node tests (the scheduler end to end, a real hub season to the vote, walking in), headless Chromium stills of each moment
(`docs/guests-stage/`), console clean of errors in the states captured.
