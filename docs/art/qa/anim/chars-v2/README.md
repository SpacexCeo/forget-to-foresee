# Characters v2: animation captures (11.11.2026)

Made with `game/anim-review.html` + `art/anim/capture.mjs` (the game's own motion model, gait layer and planted-feet
layer; deterministic, 30 fps, software WebGL), on the Iris model of commit e05407b and the 13 townsfolk files.

| File | What |
|---|---|
| `iris_idle_before_after.jpg` | top: the model's own idle (arms held out), bottom: the motion-capture idle (arms along the body, feet hip width, slow weight shift); front, side, back |
| `iris_pivot_before_after.jpg` | half turn and quarter turn on the spot: before (feet spin with the body), after (body turns at 320°/s, feet step) |
| `iris_register_greet.jpg`, `iris_register.mp4`, `iris_greet.mp4` | the new one-shots |
| `iris_walk_run_loco.jpg`, `iris_loco.mp4` | walk 1.7 m/s, run 3.3 m/s, stand → walk → run → walk → stop |
| `townsfolk_child_elder_guard.jpg` | shared clips retargeted: child (idle, walk, run), elder (walk, sit), guard (walk) |
| `townsfolk_actions.jpg` | guard salute, musician play, baker counter, sweeper sweep, innkeeper talk, courier wave |

Numbers (review page): Iris walk stance speed 0.038 m/s (ball-of-foot joint, includes the roll over the ball),
idle / register / pivot planted 0.00–0.01 m/s; townsfolk walks 0.03 m/s (child, guard), elder 0.06 m/s.
Not captured on the GPU browser in the game itself: the server went down (HTTP 522) before the in-game recording
finished; `art/anim/ingame.mjs` is the script for it.
