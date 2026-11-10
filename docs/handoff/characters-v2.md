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

**Done (11.11, in the game):**

- Hair per the target sheet: a solid strand-textured volume with a soft fringe at the hairline, overlapping locks, a
  ponytail; shaded in the game (`iris-avatar.js` calls `tuneHairCards`, no longer `flatHair`). `art/agents/iris_hero/hero_hair2.py`.
- Face: working lashes, teeth and tongue, dark mouth cavity, corrected smile, face bake (contour, lips, scalp tone),
  eyes (larger green-grey iris, limbal ring, lid shadow, catchlight). `hero_face.py`, `hero_shading.py`.
- Outfit: sheen 0.12 in neutral dark grey (`game/src/render/fabric.js`); no vertex colours in the export (the game
  multiplied the garment by `COLOR_0`: black knit, grey trainers); leggings one colour, no moire; no skin specks at
  the waist; constructed trainers (3.5k triangles the pair) and sock tubes (`hero_shoes.py`).
- Proportions per the sheet: head +6 % (about 7.1 heads), softer seat, flank, thighs, bust.
- Files: `agent_iris.glb` and the phone variant `agent_iris_m.glb` (`art/agents/iris_hero/ship.sh`); sizes and
  triangles in `docs/art/manifest.md`. `iris-avatar.js` `irisModelFile()` and `boot-world.js` load `_m` on phones
  and the low tier (one download).
- QA: `docs/art/iris/final/` (Cycles sheets, before/after, in-game town and archipelago; 0 console errors).

**Rest pose:** the body skeleton is unchanged (`qa_restpose.py`: the 36 bones the side-car rotates and `pelvis` are
identical). Only children of `head` moved: `eye_*`, `lid_*`, `brow_*` 3 mm, `tail_0` 7 mm, `hair_*_0` 1 mm. The
side-car `game/public/assets/anim/iris.glb` has rotation tracks and one `pelvis` translation, so it does **not**
need a rebuild. The spring chains `hair_L/R/B` still exist as bones but carry no weights now (the hair is tied
back); `tail_*` drives the ponytail.

**Half-done / not done:**

- Jacket (audit item 9): the front edges still meet the collar in a stepped corner, the bust drape is softer only
  because the bust is smaller, the armpit lining is untouched. Next: plane cuts for the front edges and neckline in
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

Not started.

## 3. Townsfolk (13 people, clips, behaviour in the town)

Not started.
