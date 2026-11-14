#!/usr/bin/env bash
# Saddle: build on the dragon -> export -> compressed files (run from the work roots' parent, scripts in ./scripts):
#   bash scripts/saddle/run.sh saddle dragon
set -euo pipefail
root=$1; dragon=$2
blender -b -t 10 --python scripts/saddle/build_saddle.py -- --root "$root" --dragon "$dragon"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/saddle.blend --name dragon_saddle --objects dragon_saddle
bash scripts/ship.sh "$root/out/dragon_saddle_raw.glb" "$root/out" dragon_saddle 0.64 0.004 512
