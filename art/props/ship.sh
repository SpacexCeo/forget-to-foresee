#!/usr/bin/env bash
# Ships the raw props from art/props/build/ to game/public/assets/models/:
# scroll fragment variants (KHR_materials_variants), then KTX2 (ETC1S colour/ORM,
# UASTC normals) + meshopt via art/tools/compress-glb.sh. Usage: ship.sh [name ...]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
compress=${COMPRESS:-$repo/art/tools/compress-glb.sh}
out=$repo/game/public/assets/models
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in "$here"/build/prop_*.glb; do b=$(basename "$f" .glb); names+=("${b#prop_}"); done
fi
for n in "${names[@]}"; do
  src=$here/build/prop_$n.glb
  if [ "$n" = scroll_fragment ]; then
    node "$here/add_variants.mjs" "$src" "$here/build/prop_${n}_var.glb" "$here/build/fragment_variants.json"
    src=$here/build/prop_${n}_var.glb
  fi
  bash "$compress" "$src" "$out/prop_$n.glb" "prop_$n" > /dev/null
  echo "prop_$n.glb $(stat -c %s "$out/prop_$n.glb")"
done
