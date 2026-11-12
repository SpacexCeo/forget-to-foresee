#!/bin/bash
# Elise v3: the full rebuild on the GPU server, from the base mesh to the compressed game files and the baked clips.
#   all.sh [outline mm]     env: FROM=a|b|c|d|clips (start stage, default a), R=<repo checkout> (default /root/w/iris-anim/ftf)
# Work dir /root/w/elise6. The repo checkout needs the motion-capture takes (art/anim/fetch_mocap.py fetches them).
# The results are collected in $W/out (copied by hand to art/agents/elise/v3/out and, once approved, into the game).
# The clip build FAILS if a leg capsule cuts the gown.
W=/root/w/elise6; R=${R:-/root/w/iris-anim/ftf}; S=$R/art/agents/elise/v3; MM=${1:-2.5}; F=${FROM:-a}; cd $W; mkdir -p out r; set -o pipefail
Q='^(Blender|Read|Saved|Fra|$|\[INFO|Time|.*mpfb|.*Append|Info|EGL)'
st() { case "$F" in a) return 0;; b) [ "$1" != a ];; c) [ "$1" != a ] && [ "$1" != b ];; d) [ "$1" = d ] || [ "$1" = clips ];; clips) [ "$1" = clips ];; esac; }
if st a; then blender -b -P $S/a1_body.py -- $W 2>&1 | grep -v -E "$Q" > a.log; fi
if st b; then blender -b body.blend -P $S/b1_hair.py -- $W 2>&1 | grep -v -E "$Q" > b.log; fi
if st c; then blender -b head.blend -P $S/c1_outfit.py -- $W 2>&1 | grep -v -E "$Q" > c.log; fi
if st d; then
  blender -b dressed.blend -P $S/d1_export.py -- $W agent_elise $MM 1 2>&1 | grep -v -E "$Q" > d.log
  blender -b dressed.blend -P $S/d1_export.py -- $W agent_elise_m $MM 0.46 2>&1 | grep -v -E "$Q" >> d.log
  python3 $R/art/agents/elise/v2/glb_face.py agent_elise_raw.glb agent_elise_f.glb >> d.log 2>&1      # the model's own idle: a blink track
  python3 $R/art/agents/elise/v2/glb_face.py agent_elise_m_raw.glb agent_elise_m_f.glb >> d.log 2>&1
  gltf-transform resize agent_elise_m_f.glb agent_elise_m_1k.glb --width 1024 --height 1024 >> d.log 2>&1
  bash $R/art/tools/compress-glb.sh agent_elise_f.glb out/agent_elise.glb agent_elise >> d.log 2>&1
  bash $R/art/tools/compress-glb.sh agent_elise_m_1k.glb out/agent_elise_m.glb agent_elise >> d.log 2>&1
  cp cloth_rig.npz out/cloth_rig.npz
fi
# the clips are built against the new model in the checkout (her model, cloth rig and bake are replaced THERE only)
cp out/agent_elise.glb $R/game/public/assets/models/agent_elise.glb; cp out/agent_elise_m.glb $R/game/public/assets/models/agent_elise_m.glb; cp out/cloth_rig.npz $R/art/agents/elise/cloth_rig.npz
( cd $R && { [ -d art/anim/src/data ] || python3 art/anim/fetch_mocap.py; } &&
  python3 art/anim/build_clips.py --char elise --bake --out $W/clips1.glb &&
  python3 art/anim/iris_combat.py --model game/public/assets/models/agent_elise.glb --in $W/clips1.glb --out $W/clips2.glb --legs 0.4 --cloth art/agents/elise/cloth_rig.npz &&
  python3 art/anim/iris_actions.py --model game/public/assets/models/agent_elise.glb --in $W/clips2.glb --out $W/clips3.glb --only strike_charge,strike_super --legs 0.2 --cloth art/agents/elise/cloth_rig.npz ) > clips.log 2>&1 || { echo CLIPS_FAIL >> clips.log; echo DONE >> clips.log; exit 1; }
gltf-transform meshopt clips3.glb out/elise.glb >> clips.log 2>&1
cp out/elise.glb $R/game/public/assets/anim/elise.glb; cp $R/art/anim/out/elise_cloth.npz out/elise_cloth.npz; cp $R/art/anim/out/elise.json out/elise.json
ls -la out >> clips.log; echo DONE >> clips.log
