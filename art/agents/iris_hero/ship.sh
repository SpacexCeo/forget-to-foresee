#!/usr/bin/env bash
# Iris: the two shipped files from the raw Blender export.
#   art/agents/iris_hero/ship.sh [raw.glb] [out dir]
# agent_iris.glb    full: 2048 colour/ORM, 2048 skin normal, 1024 garment normal (KTX2: ETC1S colour/ORM,
#                   UASTC normals), meshopt geometry
# agent_iris_m.glb  phones and the low tier: 1024 textures, meshes simplified (meshoptimizer, error bound
#                   0.1 % of the model's size; morph targets and skin weights are kept)
# Requires Node 20+, @gltf-transform/cli 4.x, KTX-Software (toktx): the same tools as art/tools/compress-glb.sh.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
raw=${1:-$root/art/agents/_raw/iris_hero/agent_iris.glb}
out=${2:-$root/game/public/assets/models}
tmp=$(mktemp -d)
# full: the garment and hair normal maps go in at half their baked size (2.8 MB less; the knit courses and the
# strand relief are far below a texel at any distance the game shows her from)
gltf-transform resize "$raw" "$tmp/f1.glb" --pattern "*normal_garment*" --width 1024 --height 1024
gltf-transform resize "$tmp/f1.glb" "$tmp/full.glb" --pattern "*normal_hair*" --width 512 --height 512
bash "$root/art/tools/compress-glb.sh" "$tmp/full.glb" "$out/agent_iris.glb" agent_iris
gltf-transform resize "$tmp/full.glb" "$tmp/r.glb" --width 1024 --height 1024
gltf-transform weld "$tmp/r.glb" "$tmp/w.glb"
gltf-transform simplify "$tmp/w.glb" "$tmp/lite.glb" --ratio "${IRIS_LITE_RATIO:-0.55}" --error "${IRIS_LITE_ERROR:-0.001}"
bash "$root/art/tools/compress-glb.sh" "$tmp/lite.glb" "$out/agent_iris_m.glb" agent_iris
rm -rf "$tmp"
for f in agent_iris agent_iris_m; do
  echo "$f: $(stat -c %s "$out/$f.glb") bytes, $(gltf-transform inspect "$out/$f.glb" --format md 2>/dev/null | awk -F'|' '/TRIANGLES/ {gsub(/,/, "", $7); n += $7} END {print n}') triangles (render upper bound)"
done
