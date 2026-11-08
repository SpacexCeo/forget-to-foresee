# Player movement (Task G: "AAA feel")

State on 08.11.2026, branch `claude/movement-feel`. Owner files: `game/src/physics/**` (new `motion.js`),
`game/src/render/camera-rig.js`, the movement block of `game/src/main.js`, the animation code of
`game/src/play/agents.js`, tests `game/tests/client/movement.test.mjs`, `smooth.test.mjs`, `collision.test.mjs`
and the measurement script `game/tests/client/movement-measure.mjs`.

Owner feedback (08.11): "the player's movement does not match normal AAA physics". Target: the feel of a modern
third-person action game. This note records what the controller did before, what it does now, the numbers, and
what still has to be judged by a human on a GPU (the container renders through SwiftShader at a few frames per
second, so nothing here was felt in real time).

## Method

Everything is measured with `node game/tests/client/movement-measure.mjs` (`--legacy` for the old controller):
the same fixed 30 Hz loop `main.js` runs, on synthetic colliders (a floor, boxes, ramps, a 2.4 m bridge
slab), with one row per physics step (time, position, speed, heading, grounded, wall contact). The camera
numbers come from the real `CameraRig` driven at 60 fps over the 30 Hz steps, exactly as in the client. The
walk speed stays `WALK_SPEED = 1.7 m/s` (30–45 s walks, `docs/decisions.md` 07.11) and the run 2.1× = 3.57 m/s.

## Before (what read as floaty, robotic or sliding)

- **Heading snapped**: the facing jumped to the input direction in one physics step (5400°/s). A 180° reversal
  was an instant flip; a 90° key change turned the body in 33 ms. Robotic.
- **Exponential velocity smoothing** (`accel = 8`, one first-order filter for start and stop): a quick-ish start
  but a long braking tail, 0.57 s to settle from a walk (0.67 s from a run), with the last 20 % of the speed
  fading over most of that time. Floaty, "ice" on release.
- **Turn rate did not depend on speed**: no pivot, no arc; running and standing turned the same way.
- **Steps blocked**: any rim higher than about 0.1 m (the capsule's rounded bottom) was a wall. Even a 0.15 m
  step stopped the player dead.
- **Running on the spot**: against a wall or a parapet the commanded velocity stayed at full speed, so the walk
  clip kept playing at full stride while the body stood still (foot sliding), and releasing the key after
  sliding along a wall kept the residual velocity.
- **Animation switched instead of blending**: idle / walk / run were chosen by a threshold on the commanded speed
  and cross-faded; the clip rate followed the commanded speed, not the ground speed.
- **Camera**: the focus trailed the avatar by 0.16 m at a walk with no look-ahead; vertical follow had the same
  rate as horizontal, so every bump moved the view; a teleport (fly into a Shell, relocate) was eased from the
  old spot.
- **NPC agents glided**: an exponential lerp toward their spot (fast start, long creep), with the facing smoothed
  separately.
- Fine already and kept: swept capsule, no tunneling at any frame time, render interpolation between physics
  steps (0 % per-frame jitter at 60 fps over 30 Hz), ground stick on slopes, the camera sphere sweep.

## The model (`game/src/physics/motion.js`, `DEFAULT_MOTION`)

| knob | value | effect |
|---|---|---|
| `accel` / `accelTaper` | 11 m/s², −55 % at top speed | quick start (90 % of walk speed in 0.23 s), eased finish; a run takes 0.43 s to 90 % |
| `brake` | 13 m/s² | short controlled stop: 0.13 s / 0.08 m from a walk, 0.30 s / 0.43 m from a run, then exact rest (no creeping tail: below `stopSpeed` 0.05 m/s the velocity is zero) |
| `turnStand` → `turnRun` | 12 → 4.5 rad/s (690 → 260°/s), linear in speed up to `turnRef` 3.6 m/s | pivot in place when standing (180° in 0.3 s), a wide arc at a run (about 0.8 m radius) |
| `slowAngle` / `stopAngle` | 45° / 120° | the target speed is full when the input is within 45° of the facing and zero beyond 120°: a reversal brakes first (a short hook), pivots, then accelerates; a 45° diagonal change barely slows |
| `airControl` | 0.25 | momentum is kept while airborne (small bumps, a step down) |
| velocity follows the facing | – | the body moves where it faces; no instant 180° flips, no strafing slides |

Controller (`character.js`, `smooth = true`; the exact legacy path stays for the collision tests):

- **Ground snap**: while grounded the capsule probes a full step height (0.35 m) down every step, so steps down
  and slopes never leave the feet floating (0 airborne steps on 12°, 20° and 30° ramps and over a 0.3 m step down).
- **Step climbing**: when a move is blocked and the ground just ahead is at most a step height up, the capsule
  is swept up, across (at least 0.4 r onto the step) and down; rims up to about 0.3 m are also ridden over by the
  rounded bottom itself. Rims above 0.37 m stay walls (0.45 m: blocked).
- **Ledge support** (`moveCapsule` option `ledgeGrip` = 0.7 r = 0.245 m): a rim contact within the grip counts as
  ground and lifts straight up (standing or walking 0.05 m from a bridge edge: zero drift, zero wall contacts);
  beyond the grip the capsule is simply unsupported and falls (walking straight off still falls). The old solver
  shoved the capsule outward at such contacts ("sliding off") and the deeper probe would have made the bridge
  slab's own rim an invisible wall.
- **Velocity bleed against walls**: the intended velocity is replaced by the actual displacement when a wall was
  hit, so pushing into a parapet is standing still (idle animation, no running on the spot) and nothing lunges
  when the wall ends. Sliding along a wall at an angle keeps the tangential motion as before.
- **Teleports**: an outside position write (the hub's fly-in, relocate) is detected and arrives at rest (no leftover
  momentum); `teleport(pos, heading)` does the same explicitly.
- **Reported state** for the renderer: `speed` (actual ground speed after collisions), `turnRate`, `lastHitWall`,
  `renderHeading(alpha)` (interpolated like the position), `stepped`.

## Before / after

| measure | before (08.11, `accel = 8`) | after (`smooth = true`) |
|---|---|---|
| walk: time / distance to 90 % speed; top speed | 0.30 s / 0.34 m; 1.70 m/s | 0.23 s / 0.23 m; 1.70 m/s |
| run: time / distance to 90 % speed; top speed | 0.30 s / 0.72 m; 3.57 m/s | 0.43 s / 0.81 m; 3.57 m/s |
| stop from walk: time / distance | 0.57 s / 0.18 m | 0.13 s / 0.08 m |
| stop from run: time / distance | 0.67 s / 0.39 m | 0.30 s / 0.43 m |
| 180° flip at walk: min speed / recover / overshoot / peak heading rate | 0.17 m/s / 0.40 s / 0.04 m / 5400 °/s | 0.18 m/s / 0.30 s / 0.07 m / 667 °/s |
| 180° flip at run: min speed / recover / overshoot / peak heading rate | 0.36 m/s / 0.40 s / 0.08 m / 5400 °/s | 0.97 m/s / 0.50 s / 0.33 m / 572 °/s |
| 90° turn at walk: settle / forward travel in the arc / min speed | 0.03 s / 0.04 m / 1.21 m/s | 0.20 s / 0.14 m / 1.27 m/s |
| 90° turn at run: settle / forward travel in the arc / min speed | 0.03 s / 0.09 m / 2.54 m/s | 0.30 s / 0.52 m / 2.70 m/s |
| pivot 180° from rest: time / drift before facing | 0.03 s / 0.01 m | 0.30 s / 0.20 m |
| step 0.15 m | blocked (x = 1.71) | climbed at 1.30 s, airborne steps 0 |
| step 0.3 m | blocked (x = 1.65) | climbed at 1.23 s, airborne steps 0 |
| step 0.45 m | blocked (x = 1.65) | blocked (x = 1.65) |
| down a 12° ramp: airborne steps / y jitter / speed range | 0 of 131 / 0.0001 m / 1.70–1.70 m/s | 0 of 130 / 0.0017 m / 1.70–1.70 m/s |
| down a 20° ramp: airborne steps / y jitter / speed range | 0 of 131 / 0.0003 m / 1.70–1.70 m/s | 0 of 130 / 0.0040 m / 1.70–1.70 m/s |
| down a 30° ramp: airborne steps / y jitter / speed range | 0 of 131 / 0.0002 m / 1.70–1.70 m/s | 0 of 130 / 0.0057 m / 1.70–1.70 m/s |
| bridge edge, idle 0.1 m inside: drift / fell | 0.000 m / false | 0.000 m / false |
| bridge edge, walking along it: drift / fell / wall-contact steps | 0.000 m / false / 0 | 0.000 m / false / 0 |
| walk straight off the edge | falls at x = 1.86 (edge at 1.2) | falls at x = 1.76 (edge at 1.2) |
| click 6 m away: arrival / overshoot / final error | 4.00 s / -0.058 m / 0.058 m | 3.87 s / -0.130 m / 0.130 m |
| route with a 90° corner at run: done / time / final error | true / 3.90 s / 0.091 m | true / 3.67 s / 0.153 m |
| camera: focus lead at walk (lag + look-ahead) / look-ahead / frame jitter / settle after stop | -0.156 m / 0.00 m / 0.0 % / 0.75 s | 0.330 m / 0.49 m / 0.0 % / 1.72 s |

Notes on the table: the click-to-move "final error" is where the player rests inside the 0.15 m arrival radius
(the old controller crept to the center on its exponential tail; the new one brakes and stops). The ramp
"y jitter" is the second difference of the height per step; it comes from the ramp entry, the resting height
above the slope is identical in both modes (3.6 cm, the rounded capsule bottom). The camera "settle" is longer
because the look-ahead eases back over about 1.5 s after a stop; see the feel-test list.

## Frame by frame (30 Hz, walk = 1.7 m/s)

- **Start**: step 1 the body turns toward the input at up to 23° per step and moves 1.2 cm; step 4 the speed is
  1.2 m/s; step 7 (0.23 s) 1.53 m/s; the walk clip's weight has reached 1 by 0.6 m/s (step 3) and its rate follows
  the speed, so the first strides are slow and short.
- **Stop**: release → 0.43 m/s per step off the speed: 1.70, 1.27, 0.83, 0.40, 0 (4 steps, 0.13 s, 8 cm). The gait
  weight eases out over about 0.1 s; the camera's look-ahead eases back over 1.5 s.
- **180° at a run**: steps 1–9 brake (3.57 → 0) while the facing turns at 260°/s, so the body hooks round by about
  70° while skidding 0.33 m; steps 10–13 finish the pivot at up to 690°/s; from step 14 the run accelerates back,
  full speed 0.5 s after the key change. The lean (below) tips the body into the hook.
- **90° at a run**: the target speed drops to about 1.3 m/s for the first steps, the facing turns in 0.3 s along an
  arc 0.52 m long, speed is back to 3.57 m/s a few steps later. At a walk the same turn takes 0.2 s and 0.14 m.
- **Step up 0.3 m**: the capsule meets the rim, is lifted 0.3 m within one or two steps (the render interpolation
  spreads it over 33 ms), the camera's vertical follow (rate 5/s) smooths the rest; no airborne step.
- **Bridge mouth / rim**: walking along a rim 5 cm inside the edge: no drift, no contact; the camp parapets and
  bridge rails are still the real walls (collide and slide, tangential motion kept).

## Camera (`camera-rig.js`)

- Follows the render-interpolated focus with a slight lag (rate 10/s horizontally, 5/s vertically, so steps and
  slopes do not bob the view) and **looks ahead** in the move direction (0.3 s of travel, at most 1 m, 40 % of it
  at the far zoom): at a walk the view leads the avatar by 0.33 m instead of trailing by 0.16 m.
- A focus jump beyond 6 m is a teleport (fly into a Shell, relocate): the follow snaps instead of easing.
- 0 % per-frame speed jitter at 60 fps over the 30 Hz physics (interpolated focus), unchanged.
- Collision with scenery: the existing sphere sweep (pulls in fast, eases out slowly). Not changed.

## Animation (`agents.js`: `GaitLayer`)

- Iris and every NPC agent: the walk and run actions always play, their **weights follow the actual ground speed**
  (idle → walk by 0.6 m/s; walk → run from 1.7 to 3.57 m/s) with a 0.1 s easing; their **playback rate follows the
  speed** (walk authored at 1.7 m/s, run at 3.57 m/s; the walk rate is floored at 0.55 so slow steps stay strides).
  The run clip is phase-synced from the walk cycle when it starts to show, so the feet stay planted through the blend.
- The idle (Iris) or the behaviour cue clip (NPCs: idle, talk, think, gesture_offer, celebrate, defeat, with the
  existing cross-fades and fallback chain) owns `1 − move` of the pose. Clip names are unchanged.
- **Lean into turns** (Iris, `main.js`): roll about the forward axis by turn rate × speed (about 8° in a
  full-speed arc, capped at 10°), eased at 8/s, off under reduced motion.
- **Facing**: the controller's rate-limited heading, interpolated between physics steps; the second exponential
  smoothing in `main.js` is gone (it lagged behind an already-smooth heading).
- NPC agents walk to their spot with `NPC_MOTION` (1.1 m/s, 4 m/s² accel, 6 m/s² brake, 290 → 170°/s) and brake
  into it (`steerTo` with `decel` 2) instead of an exponential glide; their facing is the model's heading while
  walking and the cue's facing at rest.

## Click / tap to move and G routes

Both still steer through `steerTo` into the same controller. Its arrival profile is now a braking profile,
v(d) = √(2 · 6 · d) against the run speed, so a running arrival slows in time and a walking one brakes at the
radius; there is no exponential tail. The click order is cancelled only when the player is pressed against a
wall without progress for 0.6 s (a reversal brakes and pivots without progress too, so it must not cancel
itself). A route corner at a run completes without orbiting the waypoint because the turn slows the body.
Keyboard, gamepad and touch bindings are untouched (`input.js` not changed).

## QA on a desktop

- `/?demo=judge&mode=walk`: WASD walk, Shift run, a 180° reversal, a wall push (parapet), click-to-move far away.
- `/?play=direct`: the Shell hub; the fly-in / relocate snaps the camera.
- F3 dev HUD: physics steps, substeps, grounded. Console: `__ftf.player.speed`, `.turnRate`, `.stepped`,
  `__ftf.rig.lookAhead`.
- Headless check in this session (SwiftShader, 1280×720): both paths start, a scripted walk / turn / run reversal
  runs with no console errors; see `docs/handoff/agent-reports/movement-feel.md`.

## What a human must still feel-test on a GPU

None of this was felt at 60 fps. Candidates for re-tuning, each one number in `DEFAULT_MOTION` or the rig:

1. **Reversal hook at a run** (0.33 m skid, 70° of hook): too much drama for a walking sim? Lower `turnRun`
   makes the hook wider, higher `brake` shortens it.
2. **90° at a run slows to 1.3 m/s** (`slowAngle` / `stopAngle`): if WASD feels sticky on diagonals, raise
   `slowAngle` toward 60°.
3. **Standing pivot 0.3 s** with 0.2 m of drift before facing: fine for a third-person game; tighten
   `stopAngle` toward 100° if the drift reads as a slide.
4. **Camera look-ahead** 0.33 m lead and a 1.7 s settle after a stop: if the view feels slow to come home,
   raise the look-ahead ease rate (3/s in `update`) or shorten `lookAheadTime`.
5. **Lean** 8° at a full-speed arc: an Iris model with a stiff spine may want 5°.
6. **Step pop** of up to 0.3 m within one physics step: hidden by the vertical camera follow in the sim; check a
   real step (there are few on the island: the pedestal, the Shell interior threshold).
7. The gait blend on the real `agent_iris.glb` clips: the walk-to-run phase sync assumes both clips start on the
   same foot.
8. Footstep audio (`presentation.js`) is driven by the same `speed`, which is now the actual ground speed: steps
   should stop against a wall; listen.

## Not done / open

- No pathfinding for click-to-move (unchanged): an unreachable click still cancels after 0.6 s against a wall.
- The camera's yaw does not auto-realign behind the character while running (the owner's 360° orbit, Dark
  Souls-style camera, stays as is).
- `game/src/play/game.js` (Task A) still calls `steerTo(pos, target, radius)` for routes; the new braking profile
  applies through `steerTo`'s defaults, no change there was needed.
