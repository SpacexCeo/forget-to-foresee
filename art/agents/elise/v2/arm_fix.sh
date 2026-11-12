#!/usr/bin/env bash
# Elise: rebuilds her arms and shoulders in a shipped model file (see arm_fix.py). Textures (KTX2) pass through.
# Requires Node 20+ with @gltf-transform/cli 4.x on PATH, python3 with numpy.
# Usage: arm_fix.sh <in.glb> <out.glb> [arm_fix.py options, e.g. --ring 0.05 --segs 8 for the phone model]
set -euo pipefail
in=$1; out=$2; shift 2
tmp=$(mktemp -d)
gltf-transform dequantize "$in" "$tmp/a.glb" > /dev/null
python3 "$(dirname "$0")/arm_fix.py" "$tmp/a.glb" "$tmp/b.glb" "$@"
gltf-transform meshopt "$tmp/b.glb" "$out" > /dev/null
rm -rf "$tmp"
ls -la "$in" "$out"
