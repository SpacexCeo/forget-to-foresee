#!/usr/bin/env bash
# Builds, post-processes, compresses, verifies and renders the fauna glbs.
# Usage (repository root): art/fauna/run_all.sh [name ...]
# Needs Blender 4.5 (`blender`), Node 20+, @gltf-transform/cli 4.x and toktx 4.x (art/tools/compress-glb.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."
names=${*:-"skyray driftjelly glyphmote cloudwhale moss_critter"}
python3 art/fauna/formation.py
blender -b -P art/fauna/build_fauna.py -- build $names
for n in $names; do
  node art/fauna/post_fauna.mjs post "$n"
  bash art/tools/compress-glb.sh "art/fauna/out/fauna_${n}_ext.glb" "game/public/assets/models/fauna_${n}.glb" "fauna_${n}"
  node art/fauna/post_fauna.mjs check "$n"
done
blender -b -P art/fauna/build_fauna.py -- render $names
