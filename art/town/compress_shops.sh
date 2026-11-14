#!/usr/bin/env bash
# Compress the raw shop interiors (art/town/out/town_shop_*.glb) for the web client into
# game/public/assets/models/town/. Same recipe as compress_town.sh for the tiling sets (1024 colour/ORM as KTX2
# ETC1S, 512 normals as UASTC; 512 / 256 for the light variant <name>_m.glb), plus the room's lightmap
# (image `lm_<piece>`, the occlusion slot on TEXCOORD_1): baked at 2048, shipped at 1536 (1024 for `_m`) as UASTC, because ETC1S
# blocks show on its smooth gradients. Geometry -> meshopt.
# Requires Node 20+, @gltf-transform/cli 4.x, toktx 4.x.
# Usage: art/town/compress_shops.sh [piece ...]   (default: the three shops)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
out="${TOWN_SHIP_DIR:-$repo/game/public/assets/models/town}"
mkdir -p "$out"
pieces=("$@")
[ ${#pieces[@]} -eq 0 ] && pieces=(town_shop_exchange town_shop_scribe town_shop_inn)
one() {
  local name=$1 in="$here/out/$1.glb" tmp
  tmp=$(mktemp -d)
  for variant in full m; do
    local size=1024 nsize=512 lsize=1536 dst="$out/$name.glb"
    if [ "$variant" = m ]; then size=512; nsize=256; lsize=1024; dst="$out/${name}_m.glb"; fi
    gltf-transform uastc "$in" "$tmp/l.glb" --pattern "lm_*" --slots "occlusionTexture" --resize "$lsize" --level 2 --rdo --rdo-lambda 2 --zstd 19 --jobs 16 >/dev/null
    gltf-transform etc1s "$tmp/l.glb" "$tmp/a.glb" --pattern "town_*" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture,emissiveTexture}" --quality 255 --resize "$size" >/dev/null
    gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --pattern "town_*" --slots "normalTexture" --resize "$nsize" --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16 >/dev/null
    gltf-transform meshopt "$tmp/b.glb" "$dst" >/dev/null
  done
  rm -rf "$tmp"
  ls -l "$out/$name"*.glb | awk '{print $5, $9}'
}
for p in "${pieces[@]}"; do one "$p" & done
wait
