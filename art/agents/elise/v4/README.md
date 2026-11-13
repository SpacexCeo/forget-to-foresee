# Elise v4 — the owner's generated model on her existing skeleton

Status: **in the game** (`game/public/assets/models/agent_elise.glb`, `agent_elise_m.glb` are copies of `out/`). Reverting the swap commit restores v3 (`../v3/out/`).

Two source files came from the owner. The second one is the base of v4.

1. First file (one fused shell, 1.95 M triangles): `s08_clean.py` (clean, decimate, bake) and `s10_rig.py` (parts by
   colour, rule weights, the welded leg replaced). Kept as a record; its result is not used.
2. **Second file** (`src/elise_owner2.fbx` + `src/elise_owner2_base.jpg`): a quad mesh of separate pieces (body with
   both legs, dress, hair, lacing, ribbons, eyes), 48.6k triangles, one 2K texture, a standard 65-bone humanoid rig
   with weights. `s20_owner_rig.py` puts it on her 90 bones (`../v3/skeleton.json`):
   - kept from the file: mesh, UVs, texture, weights of the spine, shoulders, arms, hands, fingers, neck, head;
   - by rule: the dress below the hips on her 13 skirt chains, ribbon tails with the hand, legs and shoes on her
     joints (the file's knee sits 8 cm too high); both legs and both shoes are kept.
   - `out/agent_elise.glb`: 59 998 triangles with the outline hull, 2048 texture; `out/agent_elise_m.glb`: 23 800, 1024.

Every clip of hers (magic step, boxing, casts, dash) plays on it unchanged: same bone names and rest pose.
Sheets: `docs/art/elise/v4/` (`owner_file_source.jpg`, `owner_file_ingame_frames.jpg`, `owner_file_ingame_closeups.jpg`).

## The skirt (13.11)

How it moves: the dress below the hips is skinned to her 13 skirt chains (52 bones); their rotations are a cloth
simulation baked into every clip (`art/anim/out/elise_cloth.npz`). No leg-bone weights on the dress, no runtime spring.

The first swap reused the v3 gown's cloth grid and bake: a wider gown, so legs that cleared it cut the closer v4
dress, and the swing tuned for loose cloth threw the hem high. Now `s20_owner_rig.py`:
- re-seats the 31 x 61 cloth grid on this dress (99% of the points found; mean radius 0.200 -> 0.143 m), moves the
  13 chains onto it and gives the dress the grid's own weights;
- fits the leg capsules to the close dress (6 mm of air at rest);
- keeps both legs and shoes. The right leg, which the close dress encloses, does not shape the cloth (as a collider
  it tore the dress in a stride: 3.4 cm of shin through it in the walk); instead it is weighted to stay inside:
  85% to the hips above the ankle, the shoe 60%. Standing, it is where the file put it; in a stride its shoe takes a
  shorter step under the hem. (13.11, first version: the leg was removed, and from her left side she read as
  one-legged; `docs/art/elise/v4/second_leg_before_after.jpg`, top two rows before, bottom two after.)

`art/anim/clips.json` -> `characters.elise.cloth.tune` (read by `ftfanim/skirt.py`): drag 2.0 (was 1.2), pull back to
the rest shape 0.10 (0.04), clearance 2.5 cm (2.0), 70% of the swing kept, every chain segment within 24 degrees of
its hips-carried rest (the leg capsules still win), a shoe may show 3.5 cm through the floor-length hem. Strides:
walk glide 0.58 -> 0.46 (about 1.0 m), run 0.40 -> 0.33 (about 1.15 m); speeds and durations unchanged.

Result (`art/anim/out/elise.json`): no leg capsule through the dress in any clip (smallest clearance 5 mm, walk),
no knee through cloth. Film: `docs/art/elise/v4/skirt_before_after.mp4`, frames `skirt_after_frames.jpg`.

Open: no blink morph on the new face; the ribbon tails are stiff in a cast; the standalone FBX/crowd files of the first brief are
not exported.
