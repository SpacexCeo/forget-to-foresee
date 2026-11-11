# Real-time checks in the game on a GPU browser (11.11.2026)

`art/anim/ingame-gpu.mjs` against the real game (town start, `?play=direct&town=1`), headless Chromium on an
RTX 5090 (ANGLE on Vulkan), 60 frames a second, keyboard input. Numbers: `report.json`. No console errors in any run.

| File | What |
|---|---|
| `iris_start_stop_turn.jpg` | side camera, a still every 50–67 ms, two rows each: start of a walk; stop from a walk; stop from a run; turn on the spot; quarter turn from a tap; a 90° corner at a run |
| `wink_register_walkers_look.jpg` | the wink at its peak in the real 2.6 s window; `register` 0.47 / 0.92 / 1.42 s after the key; courier, lamplighter and child mid-stride; shrinekeeper and innkeeper looking at Iris from two sides; idle and idle2 |

## Feet (speed of the ball of the foot against the ground)

| | Speed | Stance speed (slowest 30 % of frames) | Travel while on the ground |
|---|---|---|---|
| Iris walk | 1.70 m/s | 0.036 m/s | 6 mm in 2.2 s |
| Iris run | 3.30 m/s | 0.19 m/s (the toe joint rolls over the ball; the stance is a quarter of the stride) | 54 mm in 2.0 s |
| Iris stop from a walk | – | 0 | 73 mm in all, during the settling step |
| Iris stop from a run | – | 0 | 39 mm |
| Iris turn on the spot | body 410°/s at most | 0 | 9 mm |
| courier walk | 1.14 m/s | 0.033 m/s | 18 mm in 3.6 s |
| lamplighter walk | 1.44 m/s | 0.037 m/s | 35 mm in 3.6 s |
| child_a run | 1.40 m/s | 0.082 m/s | 0 |

The sweeper and child_b were not on a walk when sampled; the elder sat.

## Start, stop, turns (looked at frame by frame)

- Stop from a walk: the rear foot steps in beside the front one within 0.35 s, legs straight at the end. Reads well.
- Stop from a run: the game takes her from 3.3 m/s to 0 in 0.25 s; she lands in a wide stance, then the rear foot
  steps in. Abrupt but not skating. A softer stop needs the motion model (deceleration), not the animation.
- Turn on the spot: the body turns in about a third of a second while the feet step; no crossed or twisted legs.
- A corner at a run is a sharp cut (the body follows at up to 380°/s); no lean into the turn.
- Fixed here (`gait.js: FootPlant`): after a stop one foot slid about 10 cm while the stride's weight faded out,
  and a tap that barely moved her let the body snap round; the feet now hold fully as soon as the body's real speed
  is zero, and the fast turn rate needs real speed.

## Face, idle, register

- Wink: weight 1.0, the lid's peak at 1.38 s on the wall clock, the clip plays to its end (2.5 s) inside the window.
- idle → idle2: the hand-over happens on the loop boundary; the largest hand speed in 21 s is 0.19 m/s (no pop).
- `register`: cued by the flow, weight 0.99; the arm is out by 0.9 s, the cover comes at 1.7 s.

## Look-at

Iris 3 m to one side, then the other: shrinekeeper's head turns +35° / −48° from the chest, innkeeper +39° / −37°,
and returns when she is 12 m away. The baker did not turn to a point behind him (146°), as intended by the limit.

## Frame cost

13 loaded; never more than 9 are in view from one spot (the town is three terraces).

| Run | Spot | Frame, vsync | Frame, uncapped | Draw calls | Triangles | Skinned meshes / bones in view | Mixer updates per frame |
|---|---|---|---|---|---|---|---|
| desktop 1920×1080, tier ultra, full files | town start, 9 people in view | 16.6 ms, p95 19.6 | 4.1 ms, p95 5.7, worst 27 | 538 | 2.02 M | 41 / 1894 | 6.25 |
| | market square, 5 | 16.6 | 3.0 ms | 500 | 1.75 M | 33 / 1534 | 5.5 |
| | shrine, 4 | 16.6 | 2.4 ms | 400 | 1.56 M | 31 / 1448 | 5.0 |
| phone viewport 390×844 at 1.5×, tier high, `_m` files | town start, 6 | 16.6 | 1.3 ms | 220 | 0.55 M | 35 / 1636 | 3.0 |
| | market square, 2 | 16.6 | 1.05 ms | 180 | 0.43 M | 27 / 1276 | 2.5 |

The animation LOD engages: with 9 people and Iris in view only 6.25 mixers update per frame (every second or
fourth frame beyond 22 m and 45 m, none off screen), 3 on the phone profile. These frame times say nothing about a
phone's GPU; what carries over is the load: about 4 skinned meshes per person, so 9 people cost some 36 skinned
draws per pass and 1900 bones. Merging each person's skinned meshes into one is the model-side saving.

## After this pass: the run's keys (review page, deterministic)

The run's planted foot wandered between keys (30 keys a second, linear interpolation of joint angles). The cycles
are now keyed at 120 (runs) and 60 (walks) a second: sole speed near the ground 0.136 -> 0.080 m/s, and inside the
clip's own planted intervals 0.000 m/s for the run, 0.008 m/s for the walk (`planted_slip_mean_m_s` in
`game/anim-review.html`). Not re-measured in the game on the GPU at 60 frames a second.
