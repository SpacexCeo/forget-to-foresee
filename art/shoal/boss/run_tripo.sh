#!/usr/bin/env bash
# The Glass Shoal boss from the owner's Tripo ice serpent: rig on the Hollow Tide's bones -> its clips -> export -> compressed files
#   bash scripts/boss/run_tripo.sh <dragon_ice.glb> <work root>      (run from the work roots' parent, scripts in ./scripts)
set -euo pipefail
src=$1; root=$2; mkdir -p "$root/work" "$root/out"
blender -b -t 10 --python scripts/boss/b01_tripo.py -- --root "$root" --src "$src"
blender -b -t 10 --python scripts/boss/b02_clips.py -- --root "$root"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/02_clips.blend --name hollow_tide
gltf-transform resize "$root/out/hollow_tide_raw.glb" "$root/out/hollow_tide_2k.glb" --width 2048 --height 2048 > /dev/null   # the Tripo maps are 4k
bash scripts/ship.sh "$root/out/hollow_tide_2k.glb" "$root/out" hollow_tide 0.4 0.004 1024
