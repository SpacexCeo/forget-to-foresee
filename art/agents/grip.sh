#!/usr/bin/env bash
# Finger joints for a heroine's right hand and the pose that closes it on a sword grip (art/agents/grip_rig.mjs).
# Usage: art/agents/grip.sh <model.glb> [more.glb ...]   rewrites each file in place and writes <model>.grip.json
# next to this script's work folder ($GRIP_WORK, default /tmp/grip). The first file's JSON is the one the client
# uses (game/src/play/grip-pose.js is generated from it by art/agents/grip_pose_js.mjs).
# Requires Node 20+, @gltf-transform/cli 4.x (global) and, beside grip_rig.mjs or in $GRIP_WORK,
# node_modules with @gltf-transform/core, @gltf-transform/extensions and gl-matrix.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${GRIP_WORK:-/tmp/grip}
mkdir -p "$work"
cp "$here/grip_rig.mjs" "$work/grip_rig.mjs"
for f in "$@"; do
  name=$(basename "$f" .glb)
  gltf-transform dequantize "$f" "$work/$name.dq.glb" > /dev/null
  (cd "$work" && node grip_rig.mjs "$name.dq.glb" "$name.rig.glb" "$name.grip.json" ${GRIP_SWORD:+--sword "$GRIP_SWORD" --obj "$name.check.obj"})
  gltf-transform meshopt "$work/$name.rig.glb" "$f" > /dev/null
  ls -l "$f" | awk '{print $5, $9}'
done
