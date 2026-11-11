# In-game check of the characters (11.11.2026)

The real game from the town start (`?play=direct&town=1`), driven by `art/anim/ingame.mjs`: keyboard input, the
game's own scene and renderer, stills taken by a spy camera. Software WebGL (SwiftShader, 640×400, 4–6 frames a
second), because the GPU server was down; `--gpu` runs the same script on a GPU browser. Numbers: `report.json`.

| File | What |
|---|---|
| `iris_ingame.jpg` | top: idle from the front, three-quarter, side, back; walking 1.7 m/s. Bottom: running 3.3 m/s, 0.35 s into a stop, the `understand` wink at its peak (close-up and with the body), `register` at the altar |
| `townsfolk_ingame.jpg` | the 13, two views each, Iris placed 2 m away: guard, shardkeeper, scribe, innkeeper, baker, shrinekeeper / elder, musician, sweeper, lamplighter, courier, child_a / child_b (ran out of the frame in this pass) |
| `phone_iris.jpg` | phone viewport (iPhone 13 profile): `agent_iris_m.glb` and the 13 `townsfolk_*_m.glb` are the files requested |

Seen:
- No console errors in the desktop, altar and phone runs.
- Iris stands upright with the arms along the body, hands beside the thighs, straight legs, feet at hip width.
  Before this pass the idle carried the actor's stance: hips 13 cm ahead of the ankles (legs slanted, seat pushed
  back); `clips.json` now has `stance` for the standing clips.
- The wink plays over the motion-capture idle (left eye closed, smile, head tilt, the model's own body for that clip).
- `register` reaches forward to the ring; the town flow cues it (`flowCuesRegister: true`).
- All 13 townsfolk are loaded, visible when Iris is near and on the ground (`y` = `ground`); the elder sits on the
  bench at seat height. Fixed here: a greeting used to make the seated elder stand up inside the bench.

Limits of a software run: a frame takes longer than the game's 0.25 s step, so wall-clock timers outrun the clips
(the wink and the reach were held with a far-off end time to be photographed); foot sliding cannot be measured at
4 frames a second (the review page numbers stand: 0.03–0.06 m/s); the turn on the spot was not judged here.

Model-side, not fixed here: the scribe's coat hem shows spikes while he waves; the musician stands tight against a
post; Iris's jacket shoulders look boxy from the front.
