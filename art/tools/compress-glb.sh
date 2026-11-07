#!/usr/bin/env bash
# Compress a Blender-exported hero .glb for the web client:
#   base colour + ORM -> KTX2 ETC1S (quality 255), normals -> KTX2 UASTC + RDO + Zstandard,
#   runtime normal map capped at 2048 (the _inspect normal map keeps full size), geometry -> meshopt.
# The client decodes KTX2 with three's KTX2Loader (transcoder in game/public/basis/) and meshopt with
# MeshoptDecoder. Requires: Node 20+, @gltf-transform/cli 4.x, KTX-Software (toktx) 4.x.
# Usage: compress-glb.sh <in.glb> <out.glb> <asset-name>
set -euo pipefail
in=$1; out=$2; name=$3
tmp=$(mktemp -d)
gltf-transform etc1s "$in" "$tmp/a.glb" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture}" --quality 255
gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --pattern "${name}_normal*" --slots "normalTexture" \
  --resize 2048 --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16
gltf-transform uastc "$tmp/b.glb" "$tmp/c.glb" --pattern "${name}_inspect_normal*" --slots "normalTexture" \
  --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 16
gltf-transform meshopt "$tmp/c.glb" "$out"
rm -rf "$tmp"
gltf-transform inspect "$out" | grep -E "image/" || true
