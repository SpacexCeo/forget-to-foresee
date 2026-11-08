# guests-stage: report (Task O, branch `claude/guests-stage`)

Wrapped up on the lead's order at 18:05 UTC 08.11 (token budget). `cd game && npm test` 370/370, `npm run build` green,
`claude/loving-curie-ihasft` merged (the ink Guest round 3 is the staged model).

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
  decisions row, collab requests 18–21.

## Not done / not verified
- Stills at 1920×1080 and 390×844, low tier and reduced motion; nothing seen in motion on a GPU (SwiftShader only, 4 fps).
- The ink thread is thin in the stills; a bleed flipbook is requested from the art session.
- "The white fade / uncover never waits on assets": `game/src/play/game.js` is outside Task O's paths and was not changed;
  `fly()` already uncovers 160 ms after the hub's flight regardless of streaming. If the lead meant the Shell's own loading,
  the Guests load lazily on `activate` and never block the fade.
- The camera hint uses `window.__ftf.rig` until `rig` is passed into `attachPresentation` (request 18).

## How it was checked
Node tests (the scheduler end to end, a real hub season to the vote, walking in), headless Chromium stills of each moment
(`docs/guests-stage/`), console clean of errors in the states captured.
