#!/bin/bash
# The Tripo townsfolk pack onto the town's own models: retarget, keep the town set, compress (index: pack_index.json).
#   art/townsfolk/pack_ship.sh <pack.glb> <models dir (plain .glb, art/tools/glb_plain.mjs)> <work dir>
# Writes <work dir>/ship/<model>.glb: the clip files for game/public/assets/anim/ (the game binds them by bone name,
# play/anim-library.js BAKED_CLIPS). ~3 min of Blender per model; ~1.1-1.3 MB per file after meshopt.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); art=$(dirname "$here")
pack=$1; models=$2; work=$3
TOWN_SET=idle,idle_shift,idle_look,walk,wave,greet_04,nod,talk,talk_b,laugh_01,angry_01,haggle,think,take_photo,scratch
mkdir -p "$work/out" "$work/trim" "$work/ship"
blender -b -t 6 --python "$art/heroes/retarget_pack.py" -- --pack "$pack" --targets_dir "$models" --out "$work/out" --names "$here/pack_names.json"
for f in "$work"/out/*_clips.glb; do
  b=$(basename "$f" _clips.glb)
  node "$art/tools/glb_keep_clips.mjs" "$f" "$work/trim/$b.glb" "$work/out/hero_clips.json" none "$TOWN_SET" --no-fingers > /dev/null
  gltf-transform resample "$work/trim/$b.glb" "$work/trim/${b}_r.glb" > /dev/null
  gltf-transform meshopt "$work/trim/${b}_r.glb" "$work/ship/$b.glb" --level medium > /dev/null
done
ls -la "$work/ship"
