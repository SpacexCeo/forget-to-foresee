#!/usr/bin/env bash
# Tideling: build -> export -> compressed files (run from the work root's parent, scripts in ./scripts):
#   bash scripts/tideling/run.sh tideling
set -euo pipefail
root=$1
blender -b -t 10 --python scripts/tideling/build_tideling.py -- --root "$root"
blender -b -t 10 --python scripts/export_glb.py -- --root "$root" --blend work/tideling.blend --name shoal_tideling --objects shoal_tideling,tideling_rig
bash scripts/ship.sh "$root/out/shoal_tideling_raw.glb" "$root/out" shoal_tideling 0.7 0.004 512
