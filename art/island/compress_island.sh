#!/usr/bin/env bash
# Compress the island export for the web client. Same steps as /root/tools/compress-glb.sh
# (base colour + ORM -> KTX2 ETC1S, normals -> KTX2 UASTC + RDO + Zstandard, geometry -> meshopt)
# with two island-specific changes:
#   - the island uses tiling texture sets named island_<set>_<channel>, so the normal-map pattern
#     is island_*_normal*;
#   - the tiling normal maps ship at 1024 (UASTC of the 2048 noise normals is ~4 MB each, and
#     RDO barely shrinks it); base colour and ORM stay 2048.
# Usage: compress_island.sh <in.glb> <out.glb>
set -euo pipefail
in=$1; out=$2
tmp=$(mktemp -d)
gltf-transform etc1s "$in" "$tmp/a.glb" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture}" --quality 255
gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --pattern "island_*_normal*" --slots "normalTexture" \
  --resize 1024 --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16
gltf-transform meshopt "$tmp/b.glb" "$out"
rm -rf "$tmp"
gltf-transform inspect "$out" | grep -E "image/" || true
