# Wearable heroes from one animation pack

The owner rigs the three wearable heroes (Iris, Elise, Sheriffchenko) in Tripo; one of the files carries the full
animation pack. `retarget_pack.py` copies that pack onto all three skeletons and writes, per hero, a side-car clip file
on that hero's own skeleton (bound by bone name at run time, like `assets/anim/iris.glb` today) plus one shared index.

    blender -b --python art/heroes/retarget_pack.py -- --pack <file with the clips>.glb         --targets iris=<iris>.glb,elise=<elise>.glb,sheriffchenko=<sheriff>.glb --out <dir> --names art/heroes/clip_names.json

Output in `<dir>`: `<id>_clips.glb` (skeleton + every clip, no mesh), `hero_clips.json` (every clip: game name, pack
name, seconds, loop or one-shot, root motion taken out, a loop's speed; `hips_scale` per hero), `retarget_report.json`
(matched bones per hero, loop seam per clip).

- Bones match by name, then by a canonical name (Tripo/Mixamo `LeftUpLeg`, `mixamorig:Spine1`, ours `thigh_L`...).
  Unmatched bones (hair, skirts, ribbons) keep their rest pose: the game moves those itself.
- Rotations transfer in world space after the rest directions are aligned, so an A-pose pack plays on a T-pose model.
- The hips keep their height motion (scaled to the hero's hips height); the horizontal root motion is taken out of the
  clip and written to the index, because the game moves the character.
- `clip_names.json` maps the pack's names to the names the game plays (`idle`, `walk`, `run`, `strike1`...).

Tested 14.11 with Iris's current clips onto Elise (34 of 90 bones: the body; skirt and ribbons are cloth) and
Sheriffchenko (28 of 28): `art/anim/clip_video.py` renders the result.
