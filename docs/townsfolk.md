# Townsfolk of the hill town (N-001)

Brief: `docs/art/townsfolk-shops-brief.md`. Design authority: the owner-approved cast sheets in
`docs/art/townsfolk/refs/` (`N-001_01_lineup`, `N-001_02` … `N-001_13`, `N-001_13b_shrine_keeper`; the FRONT view
of each sheet governs the construction, the declared height governs the size). Cast v1 (twelve own designs) is
replaced by these thirteen. This page is the working record of the cast, the build pipeline, the clips and the
behaviour in the client.

## Status (11.11.2026)

| Step | State |
| --- | --- |
| 1. Cast of 13 from the sheets, built by the data-driven pipeline | **done**: 13 game files (`game/public/assets/models/townsfolk_<key>.glb` + `_m`) |
| 2. Clips | **done**: the shared mocap set (`game/public/assets/anim/townsfolk.glb`, retargeted per body by `townsfolkClips`) over each model's own baked clips |
| 3. Behaviour in the client on `TOWN_DATA.npc` | **done**: `game/src/play/townsfolk-plan.js` (pure) + `townsfolk.js` (three.js), hooked in `scenes/town.js` |
| 4. QA | renders next to the sheets and in-game screenshots in `docs/art/townsfolk/qa/`; see "QA and known defects" |
| 5. Image-to-3D trial (TRELLIS) | **parked**: ran on the RTX 5090, one costume generated, not rolled out (see the trial section) |

## Cast (thirteen people)

| Key | Sheet | Role | Height | Read from the game camera by |
| --- | --- | --- | --- | --- |
| `shardkeeper` | 02 | Keeper of the Shard Exchange, F 45 | 1.70 | indigo sleeveless dress over linen sleeves, knotted ochre sash, curly dark bob |
| `scribe` | 03 | Scribe of Signs, M 32 | 1.76 | long moss work coat, ochre scarf with tails, scroll tube and pouch, hair tied up |
| `innkeeper` | 04 | Innkeeper, F 50 | 1.78 | terracotta dress, leather waist apron with a towel, auburn hair pinned up |
| `baker` | 05 | Baker, M 38 | 1.72 | ochre shirt, cream bib apron, linen head wrap, full dark beard, terracotta trousers |
| `sweeper` | 06 | Street sweeper, F 27 | 1.62 | moss tunic, full ochre trousers, ochre kerchief, straw broom |
| `lamplighter` | 07 | Lamplighter, M 40 | 1.86 | indigo work coat over rolled linen sleeves, tool belt and cross strap, lantern |
| `guard` | 08 | Gate guard, F 30 | 1.92 | quilted moss coat, leather cuirass and pauldrons, terracotta sash, sheathed sidearm |
| `elder` | 09 | Elder, M 76 | 1.65 | ochre shawl over an indigo vest, cane, white hair and beard, gentle stoop |
| `child_a` | 10 | Child, F 10 | 1.32 | moss pinafore over a linen shirt, two braids |
| `child_b` | 11 | Child, M 8 | 1.22 | ochre tunic, terracotta shorts, wool socks, mop of curls |
| `musician` | 12 | Street musician, NB 25 | 1.74 | long terracotta vest, indigo trousers, lute on a strap |
| `courier` | 13 | Courier, F 22 | 1.68 | moss shirt with rolled sleeves, full indigo trousers, satchel, high ponytail |
| `shrinekeeper` | 13b | Shrine keeper, F 65 | 1.60 | indigo robe with wide sleeves over an ivory dress, amber beads, grey low bun |

Children are MakeHuman child bodies (age macro about 0.16 to 0.19: larger head, softer jaw, smaller hands), not
scaled adults. Broom, cane, lantern, sidearm, lute and satchel are separate props skinned rigidly to a socket bone
(`prop_R`, `prop_L`, `pelvis`, `chest`). Embroidery from the sheets is left out (broad shapes and clean layers
first); the generated logo and text of the sheets are not copied.

## Pipeline (`art/townsfolk/`)

`bash art/townsfolk/run_all.sh <work_dir> [key ...]` builds, renders and compresses the cast on the GPU server
(seven people at a time; about ten minutes for all thirteen).

| File | Role |
| --- | --- |
| `cast.py` | The cast as data: body macros, face details, heights, palette, costume recipe, posture and gait. |
| `tf_body.py` | MakeHuman body (MPFB 2.0.18, CC0) per entry, re-posed into the agent rest stance, the agent armature on the body's own joints (same bone names as every agent), 23 face morphs, eyes. The real height is a scale on export. |
| `tf_costume.py` | Garment library on body landmarks (shells cut from the body, tubes on the body's support function, bands, shoes, hats), removal of the body hidden under the costume, and `strip_layers`: the part of a garment that an outer garment covers is removed, with a margin round every opening and above every hem. |
| `tf_wardrobe.py` | Recipes → garments, hair, beards, props. Hair, buns, braids, the ponytail and beards are clean closed shells (overlapping primitives → voxel remesh → reduction), shaded as hair. |
| `tf_shading.py` | Procedural skin, eyes and surfaces, baked into one 2048² set (base colour, normal, ORM) per person. |
| `build_townsfolk.py` | Body → costume → reduction to 16,000 triangles (open edges such as hems, cuffs and necklines are protected from the collapse) → bake → weights and spring chains → own clips (idle, walk, talk, think, gesture_offer, understand; run for the children) → glb. |
| `qa_glb.py`, `qa_ingame.cjs` | Cycles turnaround of the exported glb; screenshots, status and frame time of the built game on real WebGL. |
| `run_all.sh` | The whole chain plus `art/tools/compress-glb.sh` (KTX2 + meshopt) and `art/tools/glb_mobile.py` (1024² `_m` variant). |
| `trellis/` | The image-to-3D trial (below). |

Game files: about 4.5 MB per person (2048² set), 1.7 MB for the `_m` variant (1024²), 15,990 triangles each
(face 5,000 with morphs). They live flat in `game/public/assets/models/` because the model list and the asset
budget tests scan that folder.

## Behaviour in the client

`game/src/play/townsfolk-plan.js` holds the cast table and one cyclic program per person on the town's exported
points (`TOWN_DATA.npc`): steps are `walk` (a polyline), `stay` (seconds and an activity clip) and `meet` (wait for
the partner, then take turns talking). It is pure and seeded (`seededRng`), tested in
`game/tests/client/townsfolk.test.mjs`. `townsfolk.js` draws it.

| Person | Program |
| --- | --- |
| guard | post at `npc_gate_guard`; salutes Iris when she comes within 5 m |
| shardkeeper, scribe | stand beside the doors of their shops on the square, then walk the square round to `npc_chat_a` / `npc_chat_b`, talk in turns, walk back |
| innkeeper | beside the inn door on the middle lane; counter loop, waves |
| baker | behind the north-east stall of the square (`npc_market_seller_square`) |
| shrinekeeper | `npc_shrine_keeper`, by the altar approach; nods |
| elder | sits on the square bench `npc_bench_0` (stands in front of it when no sit clip is available) |
| musician | plays at `npc_musician` |
| sweeper | `npc_route_sweeper`, stopping to sweep every seven metres |
| lamplighter | `npc_route_lamplighter`, stopping at every second lamp |
| courier | `npc_route_courier` to the temple and back, then a rest at `npc_courier_rest` |
| child_a, child_b | run a seeded loop inside `npc_children_play`, one behind the other, with breathers |

Shopkeepers stand outside their doors: the shop interiors are not enterable in the client yet.

- **No sliding.** A person moves at the speed its walk clip walks at (`clip.userData.speed` of the retargeted
  mocap clip, else the speed the own clip was baked for) and the walk phase advances by the distance covered.
- **Iris.** Head and eyes follow her within 6 m (`applyLookTo`); keepers wave or nod once when she comes close; a
  walker whose way she blocks waits and leans 0.45 m aside instead of walking through her.
- **Never through houses.** People only move on the exported routes and on short stubs between them; the height
  under the feet is corrected by a ray on the town's colliders.
- **Reduced motion.** Everyone holds still in the idle pose (cross-fades still finish; no walking, no head turns).
- **Loading.** Nothing is fetched until the town's first view is on screen; then one person at a time, nearest to
  Iris first, the `_m` file first; on desktop the full file replaces it once all thirteen are in.
- **Cost.** One material per person. Mixers run every frame within 22 m, every second frame to 45 m, every fourth
  to 80 m and are frozen beyond or off screen (0.6 × these distances on phones); people off screen are hidden.

## Image-to-3D trial (TRELLIS, owner request of 11.11) — parked

One character (the guard) was taken through Microsoft TRELLIS on the server's RTX 5090.

- **Licences checked.** TRELLIS code MIT; weights `microsoft/TRELLIS-image-large` MIT; the modified FlexiCubes
  copy Apache-2.0; DINOv2 (image encoder, code and weights) Apache-2.0; PyTorch BSD-3; xformers BSD-3; spconv
  Apache-2.0. The textured-GLB path of TRELLIS needs nvdiffrast and the Inria gaussian rasterizer, whose licences
  do not allow commercial use, so the trial uses the **mesh decoder only** (vertex colours, baked to a texture in
  Blender) and neither of those two is installed.
- **What works** (`art/townsfolk/trellis/`): `prep_image.py` cuts the FRONT figure out of a sheet; `run_trellis.py`
  runs the pipeline on the 5090 (Python 3.11, torch 2.7.1 cu128, spconv-cu120 with `SPCONV_ALGO=native`, PyTorch
  attention for the dense blocks and the cutlass kernel for the sparse ones) and writes a 324k-triangle mesh in
  about a minute; `to_game.py` (first version) reduced it to 15.5k triangles, baked 2048² base colour and normals
  and bound it to the shared rig with weights from the procedural body. Result:
  `docs/art/townsfolk/qa/trial_trellis_guard_vs_procedural.jpg`.
- **What the result shows.** The costume is much richer than the procedural one (plates, sash, coat folds, full
  trousers). Defects of the first pass: the head was missing (the crop cut it off), the thin coat tore after the
  reduction, nearest-surface weights pulled coat parts with the hands. The sheets are 1536 × 1024, so a figure is
  only about 310 px tall: a generated face would not hold up.
- **Where it stopped.** A hybrid `to_game.py` is written (TRELLIS costume below the neck, made watertight by a
  voxel remesh, bone-heat weights; the procedural head with its morphs, hair and hat on top) but **has not run**:
  the GPU server stopped answering (HTTP 522) before it could. No side-by-side in the game light exists, so the
  procedural thirteen are what ships. To resume: reinstall as in `run_trellis.py`'s header, run `prep_image.py`
  with a box that includes the head, `run_trellis.py`, then `to_game.py` on the person's procedural `.blend`.

## QA and known defects

- `docs/art/townsfolk/qa/<key>_vs_sheet.jpg`: the exported glb (Cycles, front, three-quarter, back, face) next to
  its sheet; `lineup_vs_sheet.jpg`: all fronts under `N-001_01_lineup`. These renders are from the build before the
  last small fixes (innkeeper's apron length, the flare of long tunics, the child's hairline); the shipped files include those fixes but were not rendered again (the server went away).
- `docs/art/townsfolk/qa/ingame_*.jpg`: the built game on the server's headless Chromium (with the mocap clips, before the two fixes below).
  That pass showed all thirteen loading, walking and standing with no console error. Frame time there was not
  representative (about 190 ms on every stop while other workers held the machine at a load of 180), so **desktop
  and phone frame times are not measured yet**.
- Fixed after that pass and not screenshotted again: the lamplighter rendered as a flat amber figure (the look
  system took the material name `…lamplighter` for a lamp); the scribe stood in a crate beside his door.
- Faces: MakeHuman faces with painted brows; they read at the game camera, close up the brows are heavy and the
  mouths slightly open. Hair shells are faceted close up. No embroidery, stitching or flour on the textures.
- The elder's shawl is a short cape without the fringe; the baker's apron halter is a wide band; the satchel and
  pouches are boxes.
- Shopkeepers use the 2048² set like everyone (the brief allows 4096² for them).
