#!/usr/bin/env bash
# Step 5: compress the exported files for the web client (KTX2: ETC1S colour / ORM / emissive, UASTC normal;
# meshopt geometry) with the shared art/tools/compress-glb.sh. Usage: s05_ship.sh [out-dir]
#   LB_WORK   work folder of the pipeline (default ./build)      LB_NAME   model name (default loomblade)
#   COMPRESS  path to compress-glb.sh (default: the repo's art/tools/compress-glb.sh)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${LB_WORK:-$here/build}
name=${LB_NAME:-loomblade}
compress=${COMPRESS:-$here/../../../tools/compress-glb.sh}
dst=${1:-$work/ship}
mkdir -p "$dst"
for v in "$name" "${name}_m"; do
  bash "$compress" "$work/out/$v.glb" "$dst/$v.glb" "$v" > /dev/null
  echo "$v.glb $(stat -c %s "$dst/$v.glb") bytes"
  gltf-transform inspect "$dst/$v.glb" 2>/dev/null | grep -E "renderVertexCount|│ (loomblade|$name)|image/ktx2|KHR_|EXT_" || true
done
