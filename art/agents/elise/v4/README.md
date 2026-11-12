# Elise v4 — the owner's generated model on her existing skeleton

Status: **save point, not in the game yet** (`game/public/assets/models/agent_elise*.glb` are still v3).

- `s08_clean.py` — the source shell (1.95 M triangles) turned to the game's axes, 1.741 m, doubled vertices merged,
  hero copy 60k with new UVs, colour 4096 and normal map 2048 baked from the original, crowd copy 3k.
- `s10_rig.py` — parts by colour and place, her 90 bones (`../v3/skeleton.json`), rule weights, the shell's welded
  leg and shoes replaced by the full left leg, stocking and shoes of the v3 build, outline hull, export.
- `out/agent_elise.glb` (60 000 triangles with the hull, 2048 texture) and `out/agent_elise_m.glb` (23 798, 1024).
- Sheets: `docs/art/elise/v4/` (`s08_clean.jpg`, `ingame_frames.jpg`, `ingame_closeups.jpg`).

Every clip of hers (magic step, boxing, casts, dash) plays on it unchanged: same bone names and rest pose.

Open before the swap: the slit edge of the skirt is ragged when the leg steps out, the stocking's lace band is
coarse, no blink morph on the new face, the shoulder is angular in a full raise, the standalone FBX/crowd files
of the original brief are not exported.
