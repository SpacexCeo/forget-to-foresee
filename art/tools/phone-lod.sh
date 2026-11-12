#!/usr/bin/env bash
# Fewer draw calls and triangles for a heroine's phone model (`*_m.glb`): dequantize, merge primitives that share a
# material (art/tools/phone_merge.mjs, skins remapped), simplify per material, meshopt-compress again. Textures
# (KTX2) pass through untouched. Requires Node 20+ and @gltf-transform/cli 4.x (global).
# Usage: phone-lod.sh <in_m.glb> <out_m.glb> [Material=ratio,...]
set -euo pipefail
in=$1; out=$2; ratio=${3:-}
tmp=$(mktemp -d)
gltf-transform dequantize "$in" "$tmp/a.glb" > /dev/null
node "$(dirname "$0")/phone_merge.mjs" "$tmp/a.glb" "$tmp/b.glb" ${ratio:+--ratio "$ratio"} | grep -E '"(meshes|prims|tris)"' | head -6
gltf-transform meshopt "$tmp/b.glb" "$out" > /dev/null
rm -rf "$tmp"
ls -la "$in" "$out"
