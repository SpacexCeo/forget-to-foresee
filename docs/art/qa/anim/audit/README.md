# Animation audit before R-001 (10.11.2026)

What the shipped clips look like in the game's own runtime, captured frame by frame with
`game/anim-review.html` + `art/anim/capture.mjs` (the game's motion model and gait layer on a checker ground, 30 fps,
1920×1080, software WebGL). Characters: Iris (`agent_iris.glb`) and the Salt agent (`agent_sol.glb`). Files here:
`before_<who>_<scenario>.mp4`, `_sheet.jpg` (contact sheet), `.json` (foot-slip numbers), `*_keyframes*.jpg`.
Scenarios: `loco` = stand → walk 1.7 m/s → run 3.3 m/s → walk → stop; `turn` = pivot on the spot, walk, a 90°
corner, a reversal at a run; `idle`.

## Defects, worst first

1. **The walk is not a human walk.** Both knees stay bent through the whole stance (a crouched, "sitting" gait),
   the foot lands flat and stays flat (no heel strike, no roll, no toe-off), the pelvis neither drops nor turns and the
   upper body is one rigid plank leaning from the ankles (`before_iris_keyframes_side.jpg`, frames 2–5).
2. **Cadence.** One stride takes 0.8 s at 1.7 m/s (150 steps a minute): she scurries. A person covers 1.7 m/s
   with a stride of about 1.0 s.
3. **Feet slide.** Iris's planted foot travels over the ground at 0.12 m/s on average in the steady walk and
   0.09–0.24 m/s in the run (`iris-m2/ab_iris_walk.json`, `ab_iris_run.json`, row A).
4. **The run.** Forearms held out in front with open, splayed hands (as if carrying a tray), the torso leans back
   while the pelvis leads, the knees collapse at the landing (`before_iris_keyframes_side.jpg`, frames 6–8).
5. **Turning on the spot.** The game pivots the body at up to 690°/s while the idle clip plays: the feet spin on the
   ground like a turntable (up to 3.6 m/s under the sole in `before_iris_turn.json`). There are no turn-in-place,
   start or stop clips; a start is a 0.1 s cross-fade from the idle into mid-stride.
6. **Walk ↔ run blend.** The two clips have different lengths (0.8 s / 0.7 s) and were only phase-matched at the
   moment the run began to show, so the legs drifted out of step during a long blend. (Fixed on this branch: one
   shared stride phase in `GaitLayer`.)
7. **Hands.** Stiff open fingers in every locomotion frame.
8. **Hair and cloth are baked into each clip.** Iris's ponytail sticks out behind at a fixed angle; nothing reacts
   to a turn, a stop or a blend between clips.
9. **Salt agent's robe.** In the run the thighs and knees come through the front and the back of the tiered robe
   (`before_sol_keyframes.jpg`, frames 3–6); in the walk the robe hides the legs and moves as one stiff bell.
10. **Idle.** Sine-wave breathing and sway: correct but mechanical, the loop is easy to read.
11. **Rig (to be measured in step 4, deformation):** no twist bones in the upper arm, forearm and thigh, one
    block bone for three fingers, no corrective shapes at the shoulders, elbows, hips and knees.

Method notes: the slip number is the horizontal speed of the ball of the foot (the toe bone's head) while it is
within 1 cm of its lowest height; `before_iris_loco.json` and `before_iris_turn.json` were measured with a 2.5 cm
band (an earlier version of the page), so compare them only with each other.
