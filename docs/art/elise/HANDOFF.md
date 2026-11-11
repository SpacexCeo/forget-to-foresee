# Elise: handoff (11.11.2026, build pass 1)

Elise is a **new playable character**, not an Iris skin: anime style, her own mesh and her own skeleton.
Design authority: the owner's sheets in `docs/art/elise/refs/` (01 .. 09). She is in the game behind
`?hero=elise` (a preview switch; the NFT gate itself is not wired, see `HEROES` in
`game/src/render/asset-catalog.js`).

## What is delivered

| Item | Where |
|---|---|
| Game models | `game/public/assets/models/agent_elise.glb`, `agent_elise_m.glb` |
| Clips (her skeleton) | `game/public/assets/anim/elise.glb` (idle, idle2, idle_look, walk, run, register, greet), numbers in `art/anim/out/elise.json` |
| Editable scene | `art/agents/elise/elise.blend` (8.1 MB, texture packed; force-added, `*.blend` is ignored under `art/`) |
| Contact sheet | `docs/art/elise/elise_sheet.jpg` (front, back, left, right, three-quarter, face, bun, butterfly, lacing knot) |
| In-game check video | `docs/art/elise/elise_ingame.mp4` (18 s: idle, walk, run, stop, turns; real game, town start, GPU capture) |
| Build scripts | `art/agents/elise/` (`a1_align` .. `d_final`, `views.py`, `all.sh`, `ingame_check.mjs`) |

## Numbers

| | main | phone (`_m`) |
|---|---|---|
| Triangles, total (base + outline hull) | 46 990 (23 497 + 23 493) | 23 488 (11 747 + 11 741) |
| Bones | 42 | 42 |
| Materials | 2 (`elise_toon`, `elise_outline`) | 2 |
| Texture | one base colour, 2048 x 2048, KTX2 ETC1S (668 KB) | 1024 x 1024 (251 KB) |
| File size | 1 257 632 bytes | 619 904 bytes |

Clip file 623 036 bytes. Height 1.75 m, feet on the floor, faces +Z in glTF. `cd game && npm test`: 637 pass, 0 fail.
In the game: loads with no console errors, 46 990 triangles, `MeshToonMaterial` + black outline, 7 clips.

## How it is built

1. **Assembly** (`a1_align`, `a2_views_check`, `a3_parts`): the head shell is fitted to the body's coarse head
   (scale and offset only, no rotation), the body is cut at the collar, the head's bust is removed and its neck
   tapers into the collar. The source files in `/root/w/elise/backup/` are untouched; work is in `/root/w/elise/work/`.
2. **The earlier note was wrong about the legs**: the body shell is hollow, the skirt is a thin double wall and
   both legs with heeled shoes are inside. The legs are kept as generated. The skirt's inner wall is removed
   (anything not visible from 72 outside directions) and the base material is double-sided.
3. **Rebuilt procedurally**: both hands (palm, four fingers, thumb; the generated ones were mittens) and the
   four ribbon tails. The wrist wraps, the lacing and its ties are the generated relief.
4. **Topology**: quadric decimation with weights (face x4, fringe and face strands x2 to x2.5, shoulders, elbows,
   wrists, knees x1.6 to x2.2). There are **no hand-made edge loops**; bending was checked by pose tests (arms up,
   head turn, stride, seated bend) and in the game.
5. **Colour** (`views.py`, `c_bake`): the four views of sheet 01 (body) and sheet 02 (head) are projected
   orthographically onto the mesh, each view fitted to the silhouette; hidden texels take the nearest visible
   colour (the right leg mirrors the left). Hands are flat skin, ribbon tails flat burgundy.
6. **Outline**: inverted hull inside the glb, 2.5 mm (1.5 mm on the face and the hands), second material.
   1.5 mm everywhere was under a pixel at the game camera.
7. **Skeleton**: Iris's names and hierarchy for the body (root, pelvis, spine, chest, neck, head, shoulder,
   upperarm, forearm, hand, thumb, index, fingers, prop, thigh, shin, foot, toe), her own joint positions, heel
   rest pose (ankle 0.108 m). Extra chains: `hair_L_0/1`, `hair_R_0/1` (face strands), `ribbon_L_0/1`,
   `ribbon_R_0/1`, `skirt_FL_0`, `skirt_BL_0`, `skirt_FR_0`, `skirt_BR_0` (hem, children of the shins).
   No face bones. Weights are analytic (by region and height) and smoothed; the skirt follows the thighs and shins.
8. **Clips**: `elise` in `art/anim/clips.json`, built by `art/anim/build_clips.py --char elise`. Walk slip
   0.005 m/s mean, 0.057 max; run 0.0002 mean.

Rebuild on the server: `bash s/all.sh 2.5 parts` in `/root/w/elise/work` (scripts are copied into `work/s/`).

## Not done, and known defects

- **Expressions (sheet 07): not done.** The face is a static shell with painted eyes; no morphs, no blink.
- **Hair, dress and accessories are one fused surface each** (head shell, body shell). They are separated only by
  weights and by the `part` face attribute, not as layered geometry. The butterfly, flowers and earrings are relief.
- **Run**: the skirt follows the shins, so it flares and stretches badly; the gown is not made for running.
- **Hem**: ragged in places where the inner wall was removed; visible in the walk.
- **Ribbon tails** keep their rest direction relative to the forearm (the chain solver has no gravity), so they
  stick out when the arms swing or rise.
- **Texture**: sheet resolution (the face comes from a 366 px crop), some strand lines projected onto the cheeks
  and arms, stretched texels on surfaces no view sees. No nails, no hand shading.
- **Neck**: the head's collar band is slightly wider than the body's neck; a step shows from the side.
- **Phone model**: plain collapse of the main one; not checked on a device.
- `boot-world.js` still prefetches `agent_iris.glb` when `?hero=elise` is set (one wasted download).
- The sheet renders are flat-lit Blender viewport renders; the game uses a three-step toon ramp.

Licence note: the shapes come from Hunyuan3D-2mv (Tencent Hunyuan 3D Community License: not for EU / UK / South Korea).

Branch: `claude/heroine2`. Server access: `tools/gpu-server/jx.py` with the host and token kept outside the repository.

## Stage log

All stages were finished in one pass and landed together; nothing needed exists only on the server (models, clips,
sheet, video, `.blend` and scripts are in git; the server holds only the untouched sources and rebuildable intermediates).

- assembly: fa7725b; left: the neck step seen from the side.
- retopology: fa7725b; left: hand-made edge loops (weighted decimation only), ragged hem.
- UV / paint: fa7725b; left: paint-over of projected strand lines, higher-resolution face.
- outline: fa7725b; left: nothing known (2.5 mm, 1.5 mm on face and hands).
- rig: fa7725b; left: face bones and expression morphs (sheet 07), gravity for the ribbon tails.
- animation: fa7725b; left: a skirt solution for the run, turn-in-place clips.
- export and game hook: fa7725b, video and handoff e347c01; left: the NFT gate, the Iris prefetch under `?hero=elise`, a device check of `_m`.

## Fix pass 2 (11.11.2026, branch `claude/elise-fix`)

One line per finished item. Rebuild: `bash s/all.sh 2.5` in `/root/w/elise2/work` (scripts from `art/agents/elise/` copied to `work/s/`, plus `art/tools/compress-glb.sh` and the clip file as `clips_elise.glb`).

- hem / gown: the fused shell is cut at the hips (z 0.80) and the gown below is a new lofted tube (`b_build.py`, `ezones.py`): 60 x 30 even loops on the smoothed outer envelope of the source, a real open slit edge, a turned-in lip along the hem and both slit edges (closed, 4 mm thick); the left thigh is extended up behind the lacing (the right leg was removed and put back: its shoe floated in the run); left: the gown has no slack and no folds.
- texture: per-zone unwrap and texel density (lacing x3.5, stocking top x3, face patches x5); the laced opening, the bow and its two hanging ends, the lace top (scalloped edge, flowers on a net), the sheer stocking and the gown's black are painted procedurally from texel positions (`c_bake.py`), no projection smear there; left: projected strand lines on the arms, a few black slivers under the lace top on the leg's generated surface.
- outline: hull thickness per vertex (`d_final.py`): 2.5 mm body, x0.62 hair and bun, x0.6 face and palms, x0.45 butterfly pin, x0.42 fingers, then limited by local thickness (thin tips) and by crease sharpness, smoothed; no hull on the face patches; left: inner lines on seams and folds are not drawn (the hull gives silhouette, hem, slit and garment edges only).
- face morphs: 10 targets on the head mesh, exported in both GLBs: `blink`, `blink_L`, `blink_R`, `smile`, `surprise`, `sad`, `angry`, `talk_A`, `talk_O`, `talk_M`. Each shows painted patches that rest 6 mm behind the face skin (lids, mouths); `surprise` also stretches the painted eyes. The game has no named blink/talk morphs for Iris (her face is bone-driven; it plays the face tracks of the model's own `idle` as a layer), so the GLB carries its own `idle` clip with a blink track (`glb_face.py`) and Elise blinks through the existing `faceLayerClip`; the other targets wait for a caller. Left: eyes are still painted, so `surprise` is weak; patches pop rather than slide.
- weights: torso and arms by Blender bone heat on the shell (replaces the analytic ramps at shoulders and elbows), hips and gown by one shared function (`ezones.skirt_weights`), knee blend identical for the leg and the cloth over it, a narrow split between the legs just right of the centre; skeleton, bone names and rest pose unchanged (rest transforms differ by 0), so the clips were not rebuilt.
- leg-through-gown check: `skirt_check.py` skins the exported model with every clip and measures how far leg vertices (both legs) stand outside the gown. **It fails, and it shows in the game**: idle, idle2, idle_look, register 0 frames; walk 31 of 31 sampled frames, run 45 of 45, greet 29 of 35 (5 cm or more, around the knees; the check stops measuring at 5 cm). Linear skinning to two legs with four hem bones cannot keep a tight gown clear of a striding leg; `all.sh` logs `SKIRT_CHECK_FAIL` and does not stop.
- numbers: main 46 722 triangles (22 721 base + hull, 1 280 patch), phone 23 996; 42 bones; 2 materials; 2048 / 1024 texture; 1 261 644 and 649 236 bytes. In the game (`ingame_check.mjs`, software GL): loads with no console errors, 7 clips, toon material. `npm test`: 703 pass, 0 fail.

For the later cloth rework (not done here): the gown is its own vertex set (part 6 in the `.blend`, `part` face attribute), rows every 2.6 cm from z 0.815 to the hem, columns every 5 degrees starting at the rear slit edge. A spring-bone solver would need: a bone grid on those columns (now only `skirt_FL_0`, `skirt_BL_0`, `skirt_FR_0`, `skirt_BR_0`, hem only), collider capsules thigh_L/R (radius 0.073) and shin_L/R (0.053 to 0.037) from `parts.json` leg axes plus the feet, and to run after FootPlant.
- owner follow-up (11.11): the hanging ribbon tails are removed from the mesh (the wrist wraps stay; the `ribbon_*` bones stay in the skeleton, so the clips are untouched); the gown is drawn out: cel folds toward the hem (shadow wedge, dark line, light edge), a right side seam and a back seam, a light trim on the hem and the slit edges, gown texel density x0.9. Now main 46 242 triangles, phone 23 756; 1 250 664 and 642 328 bytes. The leg-through-gown check still fails as above.
- owner follow-up 2 (11.11): edging added (a light line on the cloth side of the neckline, armholes and open back, on the edges of the laced opening, the slit and the hem); the black slivers under the lace top are gone: they were holes and tangled faces in the generated left leg, so the left leg from the ankle to the hip is now clean procedural rings on the measured axis and radius (`parts.json`), the generated shoe and ankle stay; no outline hull on the gown's turned-in lip; the thigh no longer steps over the slit edge. Now main 44 299 triangles, phone 22 789; 1 227 508 and 626 692 bytes; in the game it loads with no console errors. The leg-through-gown check still fails on walk, run and greet.
