#!/usr/bin/env bash
# Clips -> export -> compressed files, in one go (run from the work root's parent, scripts in ./scripts):
#   bash scripts/dragon/run_from_clips.sh dragon
set -euo pipefail
root=$1
blender -b -t 10 --python scripts/dragon/s08_clips.py -- --root "$root"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/08_clips.blend --name shoal_dragon --objects dragon,dragon_rig
bash scripts/ship.sh "$root/out/shoal_dragon_raw.glb" "$root/out" shoal_dragon
