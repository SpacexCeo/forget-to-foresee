# Characters v2 handoff (branch `claude/characters-v2`)

Started 10.11.2026 22:15 UTC from `main` a4b70a4. Scope: Iris final look and phone variant, mocap animation as the
default, the 13 townsfolk in the town. Three parallel workers, one section each below; each keeps its own section
current (done / half-done / next / how to resume). The GPU server (Clore RTX 5090) ends about 22:00 UTC 11.11:
nothing may exist only on the server. Server work dirs: `/root/w/chars/{iris,anim,townsfolk}`. GPT references
(design authority): `docs/art/iris/refs/`, `docs/art/townsfolk/refs/` (copied from the board).

Merge rule: when a piece is stable, merge the latest `main`, run `cd game && npm test && npm run build`; if green,
push the branch and `main`. Never push red. The lighting worker (`claude/lighting-v2`) owns `game/src/render/`
(lights, shadows, fog, grade, weather, loading screen); characters touch only the sheen in `render/fabric.js`.

## 1. Iris (model, look, phone variant)

**Body restored (11.11 04:10 UTC, owner: "return Iris's normal shape and stance").** The shipped files are rebuilt
on the 09.11 athletic body: `qa_silhouette.py` against the 10.11 build gives 0.0 mm on every body row (only the
trainers and the ponytail differ), `qa_restpose.py` against the glb before 7cb3695 gives 0 joints differ. Her
standing clips hold the arms down along the body (`relax_arms()`: wrist targets for the arm IK); the rest pose is
untouched. Built on CPU in the lead's container (Blender 4.5.3, MPFB 2.0.18, `IRIS_CPU=1`, about 4 min) because the
GPU server answers HTTP 522. Three-way turnaround: `docs/art/iris/final/00_body_restored_turnaround.jpg`. All sheets
in that folder are re-rendered from this build (Cycles on CPU, 16 samples); the in-game shots of the rejected body
are removed, and no new in-game or phone shot exists for this build (no GPU browser here; the server runs before it
had 0 console errors and the phone run requested `agent_iris_m.glb` only). Standing pose, second pass: the arms
hang near vertical, wrists 23 cm from the midline, elbows pointing back, hands a few centimetres clear of the
thighs (`RELAXED_WRIST`). Lip tone checked under a warm low sun and a backlight beside the target sheet
(`06_lips_two_lights_and_target.jpg`, `qa_lips.py`): a muted rose in both, kept.

**Seat shading spot (owner, 11.11):** a small lit spot at the top of the gluteal cleft on the leggings. Found in the
exported mesh: where the level top edge crosses the cleft there is a knot of small faces whose outer vertex normals
pointed straight back (0, 0, -1) while the fabric round them faces up and back (about 0.5 up): a kink in the
normals, also the place where the UV unwrap breaks into many small islands. `smooth_cleft_normals()` in
`build_iris_hero.py` replaces the outer normals of that patch (21 vertices) with a low-pass, as custom normals; no
vertex moves (`qa_silhouette.py` 0.0 mm, `qa_restpose.py` 0 joints). Checked only in Cycles with a warm low light
from behind (`qa_seat.py`, `docs/art/iris/final/07_seat_shading_before_after.jpg`), where the difference is
subtle; **not checked in the game** (no GPU browser in the build container). If the spot is still there in the
game, the next suspects are the UV island borders in that patch (AO and normal bake seams: unwrap the top of the
leggings' back as one island) and the 1.8 mm rim of the leggings' top edge.

**Open with the owner:** the body shape. The owner may send a new reference for it; until then the 09.11 athletic
body stays and nothing takes proportions from the GPT sheet.

**Done (11.11, in the game):**

- Hair per the target sheet: a solid strand-textured volume with a soft fringe at the hairline, overlapping locks, a
  ponytail; shaded in the game (`iris-avatar.js` calls `tuneHairCards`, no longer `flatHair`). `art/agents/iris_hero/hero_hair2.py`.
- Face: working lashes, teeth and tongue, dark mouth cavity, corrected smile, face bake (contour, lips, scalp tone),
  eyes (larger green-grey iris, limbal ring, lid shadow, catchlight). `hero_face.py`, `hero_shading.py`.
- Outfit: sheen 0.12 in neutral dark grey (`game/src/render/fabric.js`); no vertex colours in the export (the game
  multiplied the garment by `COLOR_0`: black knit, grey trainers); leggings one colour, no moire; no skin specks at
  the waist; constructed trainers (3.5k triangles the pair) and sock tubes (`hero_shoes.py`).
- Proportions per the sheet (head +6 %, softer seat, flank, thighs, bust): **rejected by the owner, reverted in the sources** (see above).
- Files: `agent_iris.glb` and the phone variant `agent_iris_m.glb` (`art/agents/iris_hero/ship.sh`); sizes and
  triangles in `docs/art/manifest.md`. `iris-avatar.js` `irisModelFile()` and `boot-world.js` load `_m` on phones
  and the low tier (one download).
- QA: `docs/art/iris/final/` (Cycles sheets, before/after, in-game town and archipelago; 0 console errors).

**On `main`:** the Iris commits are cherry-picked onto `main` (7cb3695, tests and build green there). A full merge of
`main` into this branch conflicts in `game/src/scenes/town.js`, `town-flow.js`, `boot-world.js` and `docs/decisions.md`
(townsfolk here against `town-life` from the lighting branch): left for the townsfolk worker or the lead.

**Rest pose:** the body skeleton is unchanged (`qa_restpose.py`: the 36 bones the side-car rotates and `pelvis` are
identical). Only children of `head` moved: `eye_*`, `lid_*`, `brow_*` 3 mm, `tail_0` 7 mm, `hair_*_0` 1 mm. The
side-car `game/public/assets/anim/iris.glb` has rotation tracks and one `pelvis` translation, so it does **not**
need a rebuild. The spring chains `hair_L/R/B` still exist as bones but carry no weights now (the hair is tied
back); `tail_*` drives the ponytail.

**Half-done / not done:**

- Jacket (audit item 9): untouched. The front edges still meet the collar in a stepped corner, the bust drape
  shows two cones, the armpit lining is as it was. One attempt (plane cuts on the front edges through
  `shell_from_body(cuts=(point, normal, region))`, a tapered thicker collar) broke the plackets, which are cast
  onto the jacket's old edge, and hid the collar ends: reverted, the region option of `cuts` stays in the code. Next: plane cuts for the front edges and neckline in
  `athletic_costume` (`hero_costume.shell_from_body(cuts=...)`, as the leggings use).
- `game/src/review/anim-review.js` still calls `flatHair` for Iris (the review page, animation worker's file): switch
  it to `tuneHairCards` to see the shipped look there.
- Lash length and the lip tone were judged in Cycles and in the town only; a daylight close-up on the archipelago is
  worth one more look.
- Idle, walk, run polish and new clips (audit items 6, 7) belong to section 2.

**How to resume:** server tree `/root/w/chars/iris/ftf` (sources synced from this branch; raw exports of each step
in `/root/w/chars/iris/keep/`, sheets in `/root/w/chars/iris/out/`). Build: `blender -b -P
art/agents/iris_hero/build_iris_hero.py -- full` (about 4 min on the GPU), then `art/agents/iris_hero/ship.sh`
(about 2 min), sheets with `qa_audit.py <raw glb> <out dir> turn,face,detail`, in-game shots with
`. /root/w/atmo/env.sh; QA_GPU=1 node art/agents/iris_hero/qa_ingame.cjs http://127.0.0.1:<port>/ <out dir> <tag>`
against `vite preview`. Everything needed to rebuild is in git except MPFB 2.0.18 (see the README there).

## 2. Animation (mocap pipeline, Iris clips, side-cars)

State 11.11 (worker: animation). Pipeline and API: `docs/art/animation-pipeline.md`.

**Done**
- Iris side-car `game/public/assets/anim/iris.glb`: `idle` and `idle2` (6 s, weight shift, arms along the body),
  `walk` 1.7 m/s, `run` 3.3 m/s, `register` (right hand to the altar ring; cued by `town-flow.js` through
  `onRegister` in `boot-world.js`), `greet`. Default in the game; `?anim=classic` opts out. The wink (`understand`)
  still comes from the model's own clip.
- Run-time start / stop / turn: `gait.js: FootPlant` (body follows the heading at 320°/s, feet planted in the world,
  steps one foot at a time, two-bone IK) on top of `GaitLayer` (stride starts at the passing pose).
- Shared townsfolk clips `game/public/assets/anim/townsfolk.glb` (16: idle, idle_shift, idle_look, walk, elder_walk,
  child_run, carry, talk, talk_b, wave, salute, nod, sit, sweep, play, counter) and the loader
  `anim-library.js: townsfolkClips(model, { body, key })` with body types (`BODY_STYLE`: adult, elder, child, guard).
  Checked on child_a, elder, guard, baker, sweeper, musician, innkeeper, courier in the review page.
- Layers on the mocap base (`art/anim/ftfanim/layers.py`), take pickers, `capture.mjs --from/--to`, `ingame.mjs`.
- Captures: `docs/art/qa/anim/chars-v2/`.

**Half-done / open**
- In-game checks: software WebGL pass in `docs/art/qa/anim/chars-v2/ingame/` (`art/anim/ingame.mjs`) and the
  real-time pass on the new GPU server in `docs/art/qa/anim/chars-v2/ingame-gpu/` (`art/anim/ingame-gpu.mjs`): foot
  numbers for Iris and three walkers, start / stop / turn frame by frame, the wink in its 2.6 s window, idle2
  hand-over, `register`, look-at, frame cost and the animation LOD. No console errors. `FootPlant` was tightened
  there (feet hold as soon as the body's real speed is zero; a tap no longer lets the body snap round).
- Last polish round (stopped by the lead's one-agent rule, 11.11):
  - Done, on main: the cycles are keyed densely (`fps` per clip in `clips.json`: run and child_run 120, walks 60).
    The engine interpolates joint angles linearly between keys, so at 30 keys a second the run's planted foot wandered
    between keys; the review page's sole metric went 0.136 -> 0.080 m/s and inside the clip's own planted intervals
    (`planted_slip_*`, from `userData.contact`) the run is 0.000 m/s, the walk 0.008 m/s. The musician no longer bows
    an invisible violin: `play` falls back to `idle_look` (her lute is on her back; `CLIP_FALLBACK` in
    `townsfolk-plan.js`). The shared `play` clip stays in the file, unused. Neither was re-captured in the game.
  - Half-done, on `claude/characters-v2` only as a WIP commit: `gait.js: FootPlant` lean into a turn, chest lead, and
    the absorbed stop from a run (hips sink over the held feet, chest tips forward). It runs without errors, but the
    one GPU capture of it ran at 22 frames a second (the server was shared) and shows no clear gain, so it is NOT
    judged: look at `burst_runstop` / `burst_corner` from `node art/anim/ingame-gpu.mjs --only loco` at 60 fps, check
    the sign of the lean (`BANK_SIGN`), then keep or drop the commit. Not merged to main.
  - Not done: the run's arm carriage, hands, mouth and hair tail were only glanced at in one side burst (bent arms,
    loose fists, tail trailing; the mouth was not visible); the run's feet stay 4-7 mm above the ground in stance.
- Open after the GPU pass: the stop from a run is abrupt because the game decelerates in 0.25 s (motion model, not
  animation); each townsperson is about 4 skinned meshes (model-side merge would cut the skinned draws); the sweeper,
  child_b and the elder were not measured walking.
- New GPU server (RTX 5090, driver 615.78.08): browser capture lives in `/root/w/chars/anim` (Playwright +
  `tools/gpu-server/egl.sh` with the version changed to 615.78.08; vite on port 5199 from `/root/ftf/game`; run
  `NODE_PATH=/root/w/chars/anim/node_modules node ../art/anim/ingame-gpu.mjs --out <dir>` in `game/`); nothing else
  lives only there.
- Fixed in that pass: the idle stood with the hips 13 cm ahead of the ankles (`stance` in `clips.json`); a greeting
  made the seated elder stand up inside the bench (`townsfolk-plan.js`); `idle2` now takes every third idle loop
  (`iris-avatar.js`).
- Model-side findings for the model workers: spikes on the scribe's coat hem while he waves; the musician stands
  tight against a post; Iris's jacket shoulders look boxy from the front.
- `townsfolk.js` calls `townsfolkClips(model, { key, body })` and takes the walking speed from
  `clip.userData.speed` (done by the townsfolk worker); the per-body values live in `BODY_STYLE` (anim-library.js).
- `play` is violin bowing; the musician carries a lute. A plucked-instrument loop would need another take
  (CMU has no lute or guitar; 79_17 / 80_36 are violin, 80_13 drums).
- Clan agents still use their procedural clips (no side-cars); the same build makes them: add a character to
  `art/anim/clips.json` and to `SIDECAR` in `anim-library.js`.
- If `agent_iris.glb` is rebuilt with other bone names or another rest pose: `python3 art/anim/build_clips.py
  --char iris` (and `--char townsfolk`, whose reference skeleton is hers), then the captures. Rebuilt 11.11 on the model of e05407b
  (rest pose within 7 mm and 0.1° of the previous one).

**How to resume**
1. `python3 art/anim/fetch_mocap.py` (takes into `art/anim/src/`, git-ignored), `python3 art/anim/build_clips.py
   --char iris|townsfolk` (seconds, numpy only).
2. Review: `cd game && npx vite --port 5199`, then `node art/anim/capture.mjs --out <dir> --name x --query
   "a=agent_iris&aclips=/assets/anim/iris.glb&scenario=loco"`; in the game: `node art/anim/ingame.mjs --out <dir>`.
   Captures also run locally: `npm i playwright && npx playwright install chromium` (software WebGL is enough for
   the review page). On the GPU server the tree was `/root/w/chars/anim/ftf`; nothing lives only there.

## 3. Townsfolk (13 people, clips, behaviour in the town)

State 11.11.2026 about 04:00 UTC. Full record: `docs/townsfolk.md`.

**Done (in git, on `claude/characters-v2` and `main`)**
- The cast is the 13 GPT sheets (`docs/art/townsfolk/refs/`). `art/townsfolk/cast.py` holds them as data; the
  pipeline builds all 13 (`bash art/townsfolk/run_all.sh <work_dir>`): 15,990 triangles, one 2048² set, KTX2 +
  meshopt, `_m` 1024². Game files: `game/public/assets/models/townsfolk_<key>.glb` and `_m`.
- Client: `game/src/play/townsfolk-plan.js` (cast, programs on `TOWN_DATA.npc`, pure state machine),
  `townsfolk.js` (lazy loading, `_m` first, mocap clips through `townsfolkClips`, clip-speed walking, look-at,
  animation LOD), hook in `scenes/town.js` (`townsfolk`, next to the lighting branch's `life`), `camera` in
  `townFrame` (`boot-world.js`). Tests: `game/tests/client/townsfolk.test.mjs` (in `npm test`).
- QA images: `docs/art/townsfolk/qa/`.

**Half-done / not verified**
- The last in-game pass on the server ran before two fixes (lamplighter drawn amber, scribe standing in a crate)
  and before the merge with `main`; tests and the build are green after them, but there is no screenshot.
- Frame time is not measured: the server was overloaded during the pass (about 190 ms a frame everywhere).
- The elder's seat height on the bench with the mocap `sit` clip was not looked at.
- QA renders next to the sheets are one build older than the shipped files.
- TRELLIS trial: parked. Scripts in `art/townsfolk/trellis/`; the hybrid `to_game.py` has never run.

**Next**
1. `NODE_PATH=<playwright> node art/townsfolk/qa_ingame.cjs <out> <port> [phone]` on a built game: look at every
   stop, note frame times for desktop and phone, fix what shows (bench height, door positions).
2. Costume polish in `tf_wardrobe.py` / `cast.py` (shawl fringe, satchel, apron halter, faces), then rebuild.
3. If the owner wants the image-to-3D look: finish the hybrid (see the trial section of `docs/townsfolk.md`).

**How to resume**
- GPU server work dir was `/root/w/chars/townsfolk/` (`ftf` clone with the sources, `build/<key>/` with the
  `.blend` files, `pub/` with the game files, `trellis/` with the venv and the weights). The server stopped
  answering about 03:30 UTC 11.11; nothing needed for the game exists only there. A fresh machine needs
  Blender 4.5 with the MPFB add-on (`mpfb.zip` was in `/root/w/townsfolk/`), gltf-transform and toktx.
