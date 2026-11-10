#!/usr/bin/env bash
# Build the townsfolk on the GPU server: body + costume + bake + clips + glb, QA renders, the compressed game
# file and its phone variant. Run from the repository root (a clone with art/agents and art/tools):
#   bash art/townsfolk/run_all.sh <work_dir> [key ...]        (no keys = the whole cast, seven at a time)
# Output: <work_dir>/build/<key>/ (glb, blend, textures, build.json, qa_*.jpg), <work_dir>/pub/townsfolk_<key>.glb
# and townsfolk_<key>_m.glb (copy both to game/public/assets/models/), <work_dir>/logs/.
# Needs Blender 4.5 with the MPFB add-on (MakeHuman), gltf-transform 4 and toktx (tools/gpu-server/setup.sh).
set -u
WORK=$(realpath "$1"); shift
ROOT=$(pwd)
mkdir -p "$WORK/build" "$WORK/logs" "$WORK/pub"
KEYS="${*:-shardkeeper scribe innkeeper baker sweeper lamplighter guard elder child_a child_b musician courier shrinekeeper}"
one() {
  k=$1; n=townsfolk_$k
  rm -f "$WORK/build/$k/DONE"
  blender -b -P "$ROOT/art/townsfolk/build_townsfolk.py" -- "$k" "$WORK/build" > "$WORK/logs/build_$k.log" 2>&1
  blender -b -P "$ROOT/art/townsfolk/qa_glb.py" -- "$WORK/build/$k/$n.glb" "$WORK/build/$k/qa" walk idle > "$WORK/logs/qa_$k.log" 2>&1
  bash "$ROOT/art/tools/compress-glb.sh" "$WORK/build/$k/$n.glb" "$WORK/pub/$n.glb" "$n" > "$WORK/logs/pub_$k.log" 2>&1
  python3 "$ROOT/art/tools/glb_mobile.py" "$WORK/pub/$n.glb" "$WORK/pub/${n}_m.glb" 1024 >> "$WORK/logs/pub_$k.log" 2>&1
  touch "$WORK/build/$k/DONE"
}
export -f one
export WORK ROOT
echo $KEYS | tr ' ' '\n' | xargs -P 7 -I{} bash -c 'one {}'
ls -la "$WORK/pub"
