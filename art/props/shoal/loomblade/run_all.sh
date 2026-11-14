#!/usr/bin/env bash
# The whole Loomblade pipeline, one rerunnable script per step (see each file's header):
#   s01_build_high.py  parts.json -> high mesh + gap report      (or: SOURCE=ultra.glb takes a replacement mesh)
#   s02_build_low.py   game mesh + UVs (coded low mesh, or a decimated copy of the replacement)
#   s03_bake.py        normal, AO, base colour, roughness, metallic, emission (Cycles GPU)
#   s04_export.py      <name>.glb + <name>_m.glb with sockets
#   s05_ship.sh        KTX2 + meshopt
#   s06_qa.py          stills of the shipped look
# Usage: [SOURCE=file.glb] [LB_WORK=dir] [BLENDER=blender] [THREADS=10] run_all.sh [first-step 1..6]
# On the shared GPU box it takes one Blender slot (/root/w/locks/blender-<n>) for the bake and the stills.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
export LB_WORK=${LB_WORK:-$here/build}
B=${BLENDER:-blender}; T=${THREADS:-10}; from=${1:-1}
mkdir -p "$LB_WORK"
lock=""
take() { [ -d /root/w/locks ] || return 0; while :; do for n in 1 2 3; do if mkdir "/root/w/locks/blender-$n" 2>/dev/null; then lock="/root/w/locks/blender-$n"; echo "fable-b $$" > "$lock/owner"; return 0; fi; done; sleep 5; done; }
drop() { [ -n "$lock" ] && rm -rf "$lock"; lock=""; }
trap drop EXIT
take
[ "$from" -le 1 ] && $B -b -t "$T" --python "$here/s01_build_high.py" -- ${SOURCE:+--source "$SOURCE"} 2>&1 | grep -E "loomblade|Error|error|Traceback|assert" || true
[ "$from" -le 2 ] && $B -b -t "$T" --python "$here/s02_build_low.py" 2>&1 | grep -E "loomblade|Error|error|Traceback|assert" || true
[ "$from" -le 3 ] && $B -b -t "$T" --python "$here/s03_bake.py" 2>&1 | grep -E "loomblade|Error|error|Traceback|assert" || true
[ "$from" -le 4 ] && $B -b -t "$T" --python "$here/s04_export.py" 2>&1 | grep -E "loomblade|Error|error|Traceback|assert" || true
[ "$from" -le 5 ] && bash "$here/s05_ship.sh"
[ "$from" -le 6 ] && $B -b -t "$T" --python "$here/s06_qa.py" 2>&1 | grep -E "loomblade|Error|error|Traceback" || true
drop
echo "done: $LB_WORK"
