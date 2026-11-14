#!/usr/bin/env bash
# Clips -> export -> compressed files, in one go (run from the work root's parent, scripts in ./scripts):
#   bash scripts/boss/run_from_clips.sh boss
set -euo pipefail
root=$1
blender -b -t 10 --python scripts/boss/b02_clips.py -- --root "$root"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/02_clips.blend --name hollow_tide
bash scripts/ship.sh "$root/out/hollow_tide_raw.glb" "$root/out" hollow_tide 0.6
