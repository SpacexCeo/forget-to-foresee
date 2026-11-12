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
     joints (the file's knee sits 8 cm too high); the hidden right leg is removed above the shoe.
   - `out/agent_elise.glb`: 59 998 triangles with the outline hull, 2048 texture; `out/agent_elise_m.glb`: 23 800, 1024.

Every clip of hers (magic step, boxing, casts, dash) plays on it unchanged: same bone names and rest pose.
Sheets: `docs/art/elise/v4/` (`owner_file_source.jpg`, `owner_file_ingame_frames.jpg`, `owner_file_ingame_closeups.jpg`).

Open: no blink morph on the new face; the ribbon tails are stiff in a cast; the skirt's cloth bake was made for the
wider v3 gown (no cut seen in the review film, not measured); the standalone FBX/crowd files of the first brief are
not exported.
