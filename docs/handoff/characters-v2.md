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
- Open after the GPU pass: the stop from a run is abrupt because the game decelerates in 0.25 s (motion model, not
  animation); a corner at a run has no lean; each townsperson is about 4 skinned meshes (model-side merge would cut
  the skinned draws); the sweeper, child_b and the elder were not measured walking.
- New GPU server (RTX 5090, driver 615.78.08): browser capture lives in `/root/w/chars/anim` (Playwright +
  `tools/gpu-server/egl.sh` with the version changed to 615.78.08); nothing else lives only there.
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

State 11.11.2026 about 09:15 UTC (stopped by the lead in the middle of quality round 2). Full record of round 1:
`docs/townsfolk.md` (not yet updated for round 2).

**In the game (main and this branch): round 1, unchanged**
- The 13 from the GPT sheets, `game/public/assets/models/townsfolk_<key>.glb` + `_m` (15,990 triangles, one 2048²
  set, two skinned meshes per person: face and body). **No glb of round 2 is in the repository**: the set is whole
  and consistent, all thirteen are round-1 files.
- Client: `game/src/play/townsfolk-plan.js`, `townsfolk.js`, hook in `scenes/town.js`, tests in
  `game/tests/client/townsfolk.test.mjs`.

**Round 2 (quality pass): sources only, on this branch, NOT on main, not built as a full batch**
- Surfaces (`tf_shading.py`): woven cloth (crossed thread bands) in colour and bump, darker seams at trims, wear
  toward the lower edge of each piece (`hemz` attribute), scuffed leather, flour on the baker's apron (`dust`), a
  blurred AO multiplied into the base colour; palette in `cast.py` muted toward the sheets.
- Construction (`tf_costume.py`, `tf_wardrobe.py`, `cast.py`): mid-calf boots with a cuff, full trousers gathered
  onto the boot top, shard keeper's robe open over a linen underskirt, sash with more clearance, cuirass with plate
  rows, larger bracers, longer shawl with a lower band, necklace cords on the cloth, `strip_layers` no longer lets
  boots, socks, bracers or pauldrons remove what is under them (floating trouser rings on the scribe).
- Weights (`build_townsfolk.py`): hems of tunics, coats and scarf tails no longer read the arm bones (the scribe's
  hem spikes while waving); brows 0.62 × lighter; hair shells keep up to 1,800 triangles and are smoothed more.
- One skinned mesh per person (the face takes the rest in a join; lead's finding: too many draw calls) and more
  room between a tunic and its under-shirt (lamplighter's white patch): **written, never built**.
- Placement (`townsfolk-plan.js`): square keepers stand 2.3 m in front of their doors (not beside them), the
  musician 1 m off the post. Tests pass; **not looked at in the game**.
- Seen so far (local CPU builds, before the last fixes): guard, shard keeper, scribe, innkeeper
  (`docs/art/townsfolk/qa/round2_wip_shopkeepers.jpg`): clearly less flat (fabric, boots, muted colours, clean
  innkeeper hem). Not seen: the other nine, the single-mesh export, anything in the game.

**Not done from the lead's round-2 list**
- Hair silhouettes and strand shading beyond smoothing; distinct faces and age cues; belts with rings; rolled
  cuffs; the elder's real fringe; hem motifs; refreshed `<key>_vs_sheet.jpg`, lineup and in-game stills; frame
  times; the TRELLIS hybrid retry.

**Next**
1. Build all 13 from this branch, look at every `qa_turn.jpg`, fix, then replace the 26 game files in one commit.
2. Check the single-mesh glb in the game (morphs and blink still play, file size, draw calls), then the in-game
   stills and frame times with `art/anim/ingame-gpu.mjs` (the animation worker's capture setup, `/root/w/chars/anim`).
3. `npm test` + build, merge main, push branch and main; update `docs/townsfolk.md` and the QA images.

**How to resume**
- New GPU server (RTX 5090, 32 threads): Blender was missing after the lead's setup (the download had failed);
  installed by `wget` of `blender-4.5.3-linux-x64.tar.xz` into `/opt` with a link in `/usr/local/bin`, plus
  Playwright in `/root/pw`. MPFB 2.0.18: the zip was uploaded to `/root/w/chars/townsfolk/mpfb.zip` and is installed
  with `blender -b --command extension install-file -r user_default -e mpfb.zip`. Work dir
  `/root/w/chars/townsfolk/` (`ftf` clone of this branch). One command builds everything:
  `bash art/townsfolk/run_all.sh /root/w/chars/townsfolk` → `build/<key>/qa_turn.jpg`, `pub/*.glb`. A batch was
  started at 09:08 UTC from commit e9511a3 (one commit before the single-mesh change); the server had rebooted
  once at about 09:01 and killed the batch before it. Nothing there is needed.
- Local CPU fallback (works, about 4 min a person alone, 10 min three at a time on 4 cores): Blender 4.5.3 with
  MPFB already installed in the lead's container (scratchpad `iris-cpu/`), `TF_CPU=1`, then the same three steps
  as `run_all.sh` (build, `qa_glb.py`, `compress-glb.sh` + `glb_mobile.py`).
- TRELLIS: the old server and its venv are gone; scripts and notes in `art/townsfolk/trellis/` and
  `docs/townsfolk.md`.
