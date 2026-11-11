# Elise: handoff (11.11.2026)

Elise is a **new playable character**, not an Iris skin (owner, 11.11). Anime / cartoon style, her own mesh
and her own skeleton. Design authority: the owner's storyboard sheets in `docs/art/elise/refs/` (01 master
turnaround .. 09 cloth and secondary motion). A thin ink outline is mandatory.

## What was rejected (do not repeat)

A procedural Blender build on Iris's body and skeleton (MPFB realistic body + scripted gown, hair and props).
The owner rejected it: a realistic mannequin, not the storyboard character. The scripts were removed.

## What works now

Image-to-3D with **Hunyuan3D-2mv** (owner's choice; Tencent Hunyuan 3D Community License: not for EU / UK /
South Korea) on the GPU server, working directory `/root/w/elise/`:

| Item | Where | State |
|---|---|---|
| Hunyuan3D-2 checkout | `/root/w/elise/Hunyuan3D-2` | installed into the system Python 3.12: torch 2.11 cu128, `diffusers==0.32.2`, `transformers==4.48.3`, `huggingface-hub==0.28.1` (newer versions fail to load the weights) |
| Head shape | `/root/w/elise/head1/elise_head.glb` | from sheet 02 (front, left profile, back); 1.08 M vertices, untextured; preview `docs/art/elise/elise_head_shape_wip.jpg` |
| Body shape | `/root/w/elise/body1/elise_body.glb` | from sheet 01 (front, left, back); 374 k vertices, untextured; gown, slit, open back and A-pose arms are there; preview `docs/art/elise/elise_body_shape_wip.jpg` |
| Cut-out input views | `head1/in_*.png`, `body1/in_*.png` | 1024 px, background removed |

Scripts (in the repository): `art/agents/elise/gen_shape.py` (crop boxes per sheet, background removal,
generation; run from the Hunyuan3D-2 folder with `PYTHONPATH=.`) and `art/agents/elise/preview.py`
(clay turnaround of a glb in Blender 4.5, `/usr/local/bin/blender`).

Both meshes are Y-up, normalised to about [-1, 1], single fused surfaces (gown, body and hair are one shell;
there are no legs inside the skirt).

## What remains

1. **Merge**: scale and place the head mesh on the body mesh (match the collar and the bun), cut the body's
   low-detail head off at the collar, join. Scale to 1.75 m, feet on the floor, facing the game's forward.
2. **Retopology / decimation** to a game budget (Iris ships about 48 k triangles; a phone variant `_m` at
   about half). Keep the face, fringe and hands denser.
3. **Colour**: no texture yet. Either Hunyuan3D-Paint (needs its `custom_rasterizer` and
   `differentiable_renderer` built; the server has no CUDA toolkit / `nvcc` yet) or a projection of the
   sheet views (front / back / left / right of sheets 01 and 02) with flat toon colours from the palette on
   sheet 06. Hair: charcoal with cobalt undersides and blue tips on the face-framing locks; burgundy eyes;
   burgundy wrist ribbons; lace-top stockings; black closed-toe heels.
4. **Outline**: inverted hull (the surface pushed about 1.5 mm along its normals, faces flipped, a
   single-sided black material), stored in the glb itself so it needs no game code.
5. **Skeleton**: a new armature fitted to her proportions. Keep Iris's bone names and hierarchy
   (`game/src/play/iris-avatar.js`, the joint list of `agent_iris.glb`) so that `art/anim/build_clips.py`
   can build her clips (add an `elise` character to `art/anim/clips.json`); add control bones for the skirt
   hem, the ribbon tails and the two face-framing locks. Check: head turn, arms up, a walking step.
6. **Export**: `game/public/assets/models/agent_elise.glb` and `agent_elise_m.glb` through
   `art/tools/compress-glb.sh`; add her to `game/src/render/asset-catalog.js`.
7. **Deliverables**: contact sheet `docs/art/elise/elise_sheet.jpg` (front, back, both sides, three-quarter,
   close-ups of the face, the bun from behind, the butterfly, the lacing knot), the editable `.blend`,
   `cd game && npm test`, a short note on self-designed details and limits.
8. Report to the lead session `session_01Ei1AYrfX3EBJYj4zTL5N1c`: commit hash and contact-sheet path. The
   lead still expects Iris's skeleton; the owner asked for a new one, so tell the lead.

## Known limits to state honestly

- The generated surface is one fused shell: separate objects (hair, dress, accessories) come only from
  cutting it by region, not from true layered geometry.
- Heels: the skeleton decides the foot pose; a raised heel needs its own rest pose and clips.
- Expressions (sheet 07) need face morphs, which a generated mesh does not have.

Branch: `claude/heroine2`. Server access: `tools/gpu-server/jx.py` with the host and token kept outside the
repository (ask the owner; never commit them).
