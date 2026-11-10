# Iris locomotion from motion capture: before / after (milestone 2 of R-001, 10.11.2026)

Top row = the shipped procedural clips, bottom row = clips retargeted from CMU motion capture
(`game/public/assets/anim/iris.glb`, built by `art/anim/build_clips.py`; see `docs/art/animation-pipeline.md`).
Same model, same runtime, same input, frame by frame, 1920×1080.

| File | What |
|---|---|
| `ab_iris_walk.mp4` | steady walk at 1.7 m/s: side, three-quarter front, back |
| `ab_iris_run.mp4` | steady run at 3.3 m/s |
| `ab_iris_loco.mp4` | stand → walk → run → walk → stop |
| `after_*_keyframes_*.jpg` | key frames of the new walk and run |

| Clip | Take | Stride | Planted-foot slip, before → after (page metric) | After, exact (sole point, offline check) |
|---|---|---|---|---|
| walk 1.7 m/s | CMU 08_01 (actor walked 1.69 m/s) | 0.8 s → 1.0 s | 0.118 → 0.033 m/s | 0.010 m/s mean |
| run 3.3 m/s | CMU 35_20 (actor ran 3.33 m/s) | 0.70 s → 0.73 s | 0.094 → 0.148 m/s (see note) | 0.000 m/s |
| idle | CMU 82_08 "stand still", 6 s loop | – | – | feet locked |

Note on the run's page metric: it follows the toe bone's joint, 4 cm above the sole; while the foot rolls over the
ball that joint travels although the sole does not. The offline check in `build_clips.py` measures the sole's
contact point itself.

These captures were made at commit 7ec4c13 (before the shared stride phase and the calmer arm swing); the idle
clip is not in them yet.
