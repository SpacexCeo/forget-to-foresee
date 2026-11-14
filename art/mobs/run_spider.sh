#!/usr/bin/env bash
# The skitter from the Tripo spider: rig + clips -> export -> compressed game files (run from the work roots' parent, scripts in ./scripts, ./mobs):
#   bash mobs/run_spider.sh <spider_futuristic.glb> skitter
set -euo pipefail
src=$1; root=$2; mkdir -p "$root"
blender -b -t 10 --python mobs/tripo_spider.py -- --src "$src" --root "$root"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/spider.blend --name mob_skitter --objects mob_skitter,skitter_rig
gltf-transform resize "$root/out/mob_skitter_raw.glb" "$root/out/mob_skitter_1k.glb" --width 1024 --height 1024 > /dev/null   # the Tripo maps are 4k
bash scripts/ship.sh "$root/out/mob_skitter_1k.glb" "$root/out" mob_skitter 0.5 0.004 512
