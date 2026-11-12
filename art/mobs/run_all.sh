#!/usr/bin/env bash
# Builds, compresses and sheets the monsters (MOB-001). Usage (repository root): art/mobs/run_all.sh [name ...]
# Needs Blender 4.5, Node 20+, @gltf-transform/cli 4.x and toktx 4.x (art/tools/compress-glb.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."
names=${*:-"skitter hulker veilbell crownrift"}
blender -b -P art/mobs/build_mobs.py -- build $names
for n in $names; do
  bash art/tools/compress-glb.sh "art/mobs/out/mob_${n}_raw.glb" "game/public/assets/models/mob_${n}.glb" "mob_${n}"
  gltf-transform resize "art/mobs/out/mob_${n}_m_raw.glb" "art/mobs/out/mob_${n}_m_256.glb" --width 256 --height 256
  bash art/tools/compress-glb.sh "art/mobs/out/mob_${n}_m_256.glb" "game/public/assets/models/mob_${n}_m.glb" "mob_${n}"
done
blender -b -P art/mobs/build_mobs.py -- sheet $names
