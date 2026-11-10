#!/usr/bin/env bash
# Compress the raw town exports (art/town/out/*.glb) for the web client into
# game/public/assets/models/town/: base colour + ORM -> KTX2 ETC1S, normals -> KTX2 UASTC (RDO +
# Zstandard), geometry -> meshopt. The tiling sets ship at 1024 (512 for the phone variant <name>_m.glb).
# The blockout (no textures) only gets meshopt. Requires Node 20+, @gltf-transform/cli 4.x, toktx 4.x.
# Usage: art/town/compress_town.sh [piece ...]   (default: every file in art/town/out)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
out="$repo/game/public/assets/models/town"
mkdir -p "$out"
pieces=("$@")
if [ ${#pieces[@]} -eq 0 ]; then
  for f in "$here"/out/*.glb; do pieces+=("$(basename "$f" .glb)"); done
fi
one() {
  local name=$1 in="$here/out/$1.glb" tmp
  tmp=$(mktemp -d)
  if gltf-transform inspect "$in" 2>/dev/null | grep -q "image/"; then
    for variant in full m; do
      local size=1024 dst="$out/$name.glb"
      if [ "$variant" = m ]; then size=512; dst="$out/${name}_m.glb"; fi
      gltf-transform etc1s "$in" "$tmp/a.glb" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture,emissiveTexture}" --quality 255 --resize "$size" >/dev/null
      gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --slots "normalTexture" --resize "$size" --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16 >/dev/null
      gltf-transform meshopt "$tmp/b.glb" "$dst" >/dev/null
    done
  else
    gltf-transform meshopt "$in" "$out/$name.glb" >/dev/null
    rm -f "$out/${name}_m.glb"
  fi
  rm -rf "$tmp"
  ls -l "$out/$name"*.glb | awk '{print $5, $9}'
}
for p in "${pieces[@]}"; do one "$p" & done
wait
