# Task G report: player movement that feels AAA

Branch `claude/movement-feel` (based on `claude/loving-curie-ihasft` = `main` + worker docs). Files touched:
`game/src/physics/motion.js` (new), `game/src/physics/character.js`, `game/src/physics/collision.js` (one new
option, legacy behaviour bit-identical), `game/src/render/camera-rig.js`, the movement block of
`game/src/main.js` (one line in the render setup: `player.smooth = true`, the stuck check and the avatar block in
`frame()`), the animation code of `game/src/play/agents.js` (not the nameplates), new
`game/tests/client/movement.test.mjs` and `movement-measure.mjs`, `tests/client/smooth.test.mjs` (one line),
`game/package.json` (test script), new `docs/movement.md`, one row at the end of the `docs/decisions.md` §4 table,
`game/src/ui/input.js` was read and left unchanged (every binding stays
as is). No art file, no `game/src/play/game.js`, no `engine.js`.

## Done

1. **Measured first** (`docs/movement.md`, "Before"): heading snapped in one physics step (5400°/s), braking was an
   exponential tail (0.57 s to settle from a walk), the turn rate ignored speed, every step above 0.1 m was a wall,
   the walk clip kept playing at full stride against walls, the camera trailed by 0.16 m with no look-ahead and
   eased through teleports, NPC agents glided on an exponential lerp.
2. **Movement** (`motion.js`, `character.js` smooth mode): speed-dependent acceleration (90 % of walk speed in
   0.23 s) and braking (walk stop 0.13 s / 8 cm, run stop 0.30 s / 43 cm, then exact rest), turn rate 690°/s standing
   down to 260°/s at a run (pivot in place, wide arc), a reversal brakes, hooks and re-accelerates (peak heading rate
   667°/s instead of 5400), momentum kept while airborne, ground snap over steps and slopes (0 airborne steps on
   12–30° ramps and a 0.3 m step down), step climbing up to 0.35 m (0.45 m stays a wall), ledge support at rims
   (standing or walking 5 cm from a bridge edge: no drift, no shove, no invisible wall; walking off still falls),
   velocity bleed against walls. The swept capsule and the no-tunneling guarantee are untouched (15 m/s into a
   zero-thickness wall still stops at the wall in both modes; the legacy exact mode is bit-identical, 20 old tests).
3. **Animation** (`agents.js` `GaitLayer`): idle / walk / run blended by the actual ground speed with the clip rate
   synced to it and the run cycle phase-synced from the walk cycle; 0.1 s eased start/stop; Iris leans into turns
   (about 8°, off under reduced motion); Iris's facing is the controller's rate-limited heading interpolated between
   physics steps. NPC agents walk their camp with the same motion model (1.1 m/s, brake into the spot) and the same
   gait layer under their cue clips. Clip names unchanged (idle, walk, run, talk, think, gesture_offer, celebrate,
   defeat), so the GPU art rebuild drops in.
4. **Camera** (`camera-rig.js`): slight lag with a slower vertical follow, look-ahead of 0.3 s of travel (view leads
   by 0.33 m at a walk instead of trailing by 0.16 m), snap on a focus jump over 6 m (fly-in, relocate), the
   interpolated focus keeps 0 % per-frame jitter at 60 fps over 30 Hz, the sphere sweep against scenery as before.
5. **Click / tap / G routes** go through the same controller; `steerTo` now has a braking arrival profile (no glide,
   overshoot under 0.2 m at a run), a route corner at a run does not orbit, and the "unreachable click" cancel now
   requires a wall contact so a reversal cannot cancel its own order. Bindings for keyboard, gamepad and touch
   unchanged; walk speed stays 1.7 m/s.
6. **Tests**: 17 new (`movement.test.mjs`), 309 total, `npm test` and `npm run build` green. Before/after table and a
   frame-by-frame description in `docs/movement.md`.

## Checked

- `cd game && npm test`: 309/309. `npm run build`: ok.
- `node game/tests/client/movement-measure.mjs` (and `--legacy`) produce the two columns of the table in
  `docs/movement.md`.
- Headless Chromium (SwiftShader, 1280×720, `vite preview` of the build): BROWSER_RESULT

## Not done / for the lead and the owner

- **Nothing was felt on a GPU.** The container renders at a few frames per second, so the tuning is from
  simulations. `docs/movement.md` ends with the eight things a human must feel-test (reversal hook, 90° slow-down,
  pivot drift, camera look-ahead settle, lean amount, step pop, the gait blend on the real Iris clips, footsteps
  against walls); each is one number in `DEFAULT_MOTION` or the rig.
- `game/src/play/game.js` (`teleport()`) clears the player by hand and used to leave the velocity; the controller
  now treats any outside position write as a teleport and arrives at rest (tested), so no change there is needed.
  A `player.teleport(pos, heading)` helper exists for new code.
- No pathfinding for click-to-move (unchanged); no camera yaw auto-realign behind the runner (kept the owner's free
  360° orbit).
- `docs/HANDOFF.md` not edited (no Task G row there; the 3D client row's "smooth acceleration and stopping" is now
  described by `docs/movement.md`).
