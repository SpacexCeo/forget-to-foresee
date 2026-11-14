#!/usr/bin/env bash
# Compress an exported creature for the game: full file (2048² KTX2 + meshopt) and the `_m` phone file
# (meshes simplified with meshoptimizer, textures 1024²). Needs Node 20+, @gltf-transform/cli 4.x, KTX-Software.
# Usage: ship.sh <raw.glb> <out dir> <name> [m_ratio=0.27] [m_error=0.004] [m_texture=1024]
set -euo pipefail
raw=$1; out=$2; name=$3; ratio=${4:-0.27}; err=${5:-0.004}; mtex=${6:-1024}
tmp=$(mktemp -d); mkdir -p "$out"
pack() { # <in> <out>
  gltf-transform etc1s "$1" "$tmp/a.glb" --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture,emissiveTexture}" --quality 255 > /dev/null
  gltf-transform uastc "$tmp/a.glb" "$tmp/b.glb" --slots "normalTexture" --level 2 --rdo --rdo-lambda 4 --zstd 19 --jobs 10 > /dev/null
  gltf-transform meshopt "$tmp/b.glb" "$2" > /dev/null
}
gltf-transform resample "$raw" "$tmp/r.glb" > /dev/null
pack "$tmp/r.glb" "$out/$name.glb"
gltf-transform simplify "$tmp/r.glb" "$tmp/s.glb" --ratio "$ratio" --error "$err" > /dev/null
gltf-transform resize "$tmp/s.glb" "$tmp/s2.glb" --width "$mtex" --height "$mtex" > /dev/null
pack "$tmp/s2.glb" "$out/${name}_m.glb"
rm -rf "$tmp"
for f in "$out/$name.glb" "$out/${name}_m.glb"; do
  echo "== $f $(stat -c %s "$f") bytes"; gltf-transform inspect "$f" 2>/dev/null | grep -E "│ (0|1|2|3) |image/|glPrimitives|renderVertexCount|TRIANGLES" | cut -c1-200 | head -20
done
