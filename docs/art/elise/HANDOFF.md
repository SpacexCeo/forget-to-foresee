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

## Pass 3: gown and legs rework (11.11.2026, branch `claude/elise-skirt`) — stopped by the owner, to be rebuilt from scratch

The owner stopped this pass and wants **a new executor to rebuild the model from scratch**; the work counts as finished
only after that rebuild. Everything below is what was done, how to reproduce it, what was learned, and what is missing.
State in git: models, clips, bake, sheet and scripts are consistent with each other and load in the game.

### Stage log (one line each)

- gown mesh: `b_build.py` + `ezones.py`; 60 x 30 grid, open slit 6..114 degrees at the hem narrowing into the laced opening, turned-in 4 mm lip on hem and slit edges, 3 cm ease, flare (hem radius 0.25..0.31 m), built no closer than 1.4 cm to any leg capsule; left: no folds in the rest shape, the hem ends 4.5 cm above the floor.
- legs: every open rim of the generated legs filled, both thighs continued up to 0.835 and capped; left: the fills are plain fans, the right leg's texture mirrors the left (it wears a stocking too).
- bone grid: 13 chains x 4 bones `skirt_CC_K` (CC 00..12, K 0..3), parented to `pelvis`; gown vertices weighted only to them (at most 2 chains x 2 bones); 90 bones in all; the old `skirt_FL_0` .. `skirt_BR_0` are gone.
- gait: `clips.json` `elise`: walk 1.4 m/s, stride 1.26 m, `step_lift` 0.75; `run` is a fast walk (2.4 m/s, stride 1.44 m) because sheets 08 / 09 show a modest step and a floor-length gown at all times; `turn_l` / `turn_r` are upper-body and cloth one-shots of a 70 degree turn; `stairs_up` / `stairs_down` are the walk with sheared ankles (`skirt.stairs`).
- cloth bake: **not Blender's cloth** (see below); `art/anim/ftfanim/cloth.py` (position-based dynamics, numpy) run by `build_clips.py --char elise --bake`, stored in `art/anim/out/elise_cloth.npz`; gown, both ribbon chains and both face strands.
- build check: `ClothRig.distance` / `inside` in `art/anim/ftfanim/skirt.py`, called for every clip by `build_clips.py`; **passes on all 11 clips**, numbers below.
- export: `agent_elise.glb` 47 204 triangles (23 737 base, hull, 1 280 patch), 1 286 328 bytes; `agent_elise_m.glb` 24 212 triangles, 668 836 bytes; `anim/elise.glb` 556 936 bytes (meshopt through `compress-glb.sh`; 1 749 816 raw), 11 clips.
- sheet: `elise_sheet.jpg` has a row of four walk and four run frames (the baked clips posed on the rig).
- game: loads with no console errors, 90 bones, 11 clips (`ingame_check.mjs`); `cd game && npm test`: 703 pass, 0 fail (run at abcb657; later changes touched only the clip file).
- video: `elise_ingame.mp4` was captured at abcb657, **before** the ribbon air drag was lowered: the ribbons fly out sideways in it. Not captured again.

### Leg-against-gown check (the build fails below zero)

Per frame: the smallest signed distance from each leg capsule to the skinned gown surface (vertices, edge midpoints, cell
centres of the 61 x 31 outer grid under linear blend skinning). Also: the right knee must not leave the gown through the
cloth (leaving through the open slit is counted, not failed).

| clip | min distance, m | frames with the right knee in the slit |
|---|---|---|
| idle, idle2, idle_look | 0.0072, 0.0061, 0.0071 | 0 |
| walk | 0.0061 | 12 of 54 |
| run | 0.0061 | 9 of 72 |
| register, greet | 0.0070, 0.0062 | 0 |
| turn_l, turn_r | 0.0071, 0.0070 | 0 |
| stairs_up, stairs_down | 0.0039, 0.0055 | 6 and 14 of 66 |

What the check does **not** cover: the phone model (its gown is decimated), the engine's blends (idle to walk, walk to run),
the feet moved by FootPlant at run time, and the thigh above 0.66 m (see "Capsules").

### How to rebuild (server, `/root/w/elise3/`)

1. `work/` is a copy of the pass 2 work directory (cut parts, `parts.json`, `body_dec.npz`, dense source points); the
   untouched sources are in `/root/w/elise/backup/`. Scripts from `art/agents/elise/` go to `work/s/`, plus `art/tools/compress-glb.sh`.
2. `repo/` holds `art/` in the repository's layout and the motion-capture takes (`python3 art/anim/fetch_mocap.py`).
3. `bash s/all.sh 2.5` runs `b_build.py` (mesh, rig, weights, `cloth_rig.npz`), `c_bake.py` (texture), `d_final.py` twice
   (outline hull, morphs, export), `glb_face.py`, compression, then `build_clips.py` and the sheet. `BAKE=1` simulates the
   cloth again (about 9 minutes, single core); without it the stored bake is used and the build stops if the bake does
   not belong to the body motion, skeleton and gown it finds. `SKIP_B=1`, `SKIP_MODEL=1` skip stages.
4. Copy back: the two models, `clips_elise_c.glb` as `game/public/assets/anim/elise.glb`, `agent_elise.blend` as
   `elise.blend`, `cloth_rig.npz`, `art/anim/out/elise_cloth.npz` and `elise.json`, `r/sheet.jpg`.
5. Video: push, then `bash s/vid.sh <branch>` (the server's own checkout in `/root/ftf` fetches the branch).

### What was learned (read before starting again)

- **Blender's cloth was tried first and dropped.** Its step is a fixed 0.03173 s per frame whatever the scene's frame
  rate (measured by free fall); its speed multiplier breaks collisions with moving colliders; with the two leg
  capsules crossing every step the gown was thrown or crumpled in every setting tried (native step, inelastic
  response, clamped impulses, a web collider between the legs, the body eased in from the rest pose). Standing clips
  were fine. The owner asked for a Blender cloth bake: this is a deviation, and the rebuild should either make
  Blender's solver work (start from the eased-in pose and native step) or keep the numpy solver knowingly.
- A leg capsule that reaches the gown's pinned top row cannot be cleared by any pose of the bones. The thigh
  capsules therefore start at 0.66 m; above that the hips are skin-tight and skinned (pelvis, a little thigh).
- Linear skinning between chains cuts corners the simulated cloth did not, so the bones are fitted to the cloth and
  then the chain nodes are pushed until the skinned surface clears every capsule by 8 mm (`ClothRig.resolve`).
- A collider web between the legs pushes the front slit edge sideways past the right knee; it was removed. The slit
  edges are instead drawn back to their rest place more firmly than the rest of the gown.
- A hem that reaches the floor pools and is kicked sideways by the feet; it now ends 4.5 cm above the floor.
- The bake must be made against the exported model that the clip build reads (a stale skeleton gave a failing check).

### Known defects of this pass

- With the left leg outside the gown and a slit this wide, the right leg shows through the opening from her left, and
  the right knee comes out of the slit on long steps; in motion the gown reads as hanging behind the legs.
- `turn_l` / `turn_r` are in the clip file but the game does not play them (it turns the root and steps the feet).
  Starts and stops are the engine's blend. Nothing in the game plays the stair clips either.
- The gown's rest flare is mostly lost in motion (the cloth hangs straight); folds are not modelled.
- The capsules bound the 98th percentile of the leg vertices; the shin capsule is wide at the knee (0.082 / 0.092).
- Ribbons and strands collide with body capsules, not with the gown itself.
- Pass 2's open items (face, texture smears, phone model unchecked) are unchanged.

### For a runtime spring-bone solver

- Gown: chains `skirt_00` .. `skirt_12`, root bone `skirt_CC_0` (child of `pelvis`), then `_1`, `_2`, `_3`. Chain 00 is
  the rear slit edge (at 114 degrees at the hem, her left-back), the chains run around the back and her right side,
  chain 12 is the front slit edge. Chains 00 and 12 are **not** neighbours: the grid is open there. Bone heads at
  heights 0.815, 0.609, 0.428, 0.248, tips at 0.042 (grid rows 0, 8, 15, 22, 30; columns every 5 of 60).
- Other chains: `ribbon_L_0/1`, `ribbon_R_0/1` (children of the forearms), `hair_L_0/1`, `hair_R_0/1` (children of `head`).
- Colliders: `art/agents/elise/cloth_rig.npz` (`cap_bone`, `cap_p0`, `cap_p1` rest points in glTF axes, `cap_r` two
  radii, `cap_set`). Set 0, for the gown, per leg L / R: thigh (0.66 to the knee, radii 0.083 / 0.076 and 0.081 /
  0.073), shin (knee to ankle, 0.082 / 0.054 and 0.092 / 0.056), foot (ankle to toe, 0.050 / 0.074 and 0.050 / 0.066),
  heel (0.065 / 0.058 and 0.066 / 0.053). Set 1, for ribbons and strands: fat thighs and shins (the gown's volume),
  upper arms, forearms, pelvis, spine, chest, neck, head.
- Run it after FootPlant (it moves the legs). Keep the gown's top row fixed to the pelvis; a soft pull to the rest
  shape (stronger on the two slit edges) keeps the open gown from sliding off the legs.

## Pass 4: one whole character (11.11.2026, branch `claude/elise-v2`), stage log

- body: `art/agents/elise/v2/a1_body.py`; one closed mesh from head to toes (CC0 MakeHuman base mesh posed on her skeleton and fitted to the generated torso, hips, seat and legs, mean residual 0.6 mm), with the first version's own face surface grafted in and sewn (the owner chose the first version's face as it is): 13 493 vertices, 10 686 quads + 5 582 triangles (face graft and seam), 0 open edges; left: 3 non-manifold edges at the seam, the forehead under the fringe is the base mesh's, hands and feet keep the base mesh's shape.
- layers: `v2/b1_layers.py`; each its own mesh over the body: gown as ONE 61 x 60 quad grid from the collar to the hem (halter front, open back V, laced opening, slit, turned-in lip on every free edge; skirt rows and bone grid as in pass 3), stockings (the legs' surface lifted 1.2 mm), lofted closed-toe pumps with 5 cm heels, wrist wraps with two tails each, lacing cords with a bow, and the first version's hair cut into back (bun and braids), fringe, two face strands and the pin; 90 bones (names and hierarchy of pass 3; feet and hands re-seated on the new body); left: bun and braids are one piece, the hair is decimated triangles (not quads), the bodice has no folds.
