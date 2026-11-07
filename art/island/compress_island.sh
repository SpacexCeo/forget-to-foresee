#!/usr/bin/env bash
# Compress the island export for the web client. Same steps as /root/tools/compress-glb.sh
# (base colour + ORM -> KTX2 ETC1S, normals -> KTX2 UASTC + RDO + Zstandard, geometry -> meshopt)
# with two island-specific changes:
#   - the island uses tiling texture sets named island_<set>_<channel>, so the normal-map pattern
#     is island_*_normal*;
#   - meshopt quantizes positions per mesh (--quantization-volume mesh): the walk collision's top
#     (height 0) is then its bound and stays exactly 0 instead of moving by a grid step (~2 mm).
# Usage: compress_island.sh <in.glb> <out.glb>
set -euo pipefail
in=$1; out=$2
tmp=$(mktemp -d)
gltf-transform etc1s "$in" "$tmp/a.glb" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture}" --quality 255
gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --pattern "island_*_normal*" --slots "normalTexture" \
  --resize 2048 --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16
gltf-transform meshopt "$tmp/b.glb" "$out" --quantization-volume mesh
rm -rf "$tmp"
gltf-transform inspect "$out" | grep -E "image/" || true
