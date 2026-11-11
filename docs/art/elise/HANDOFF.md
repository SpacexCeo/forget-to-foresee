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
