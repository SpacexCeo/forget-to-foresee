#!/bin/bash
# Elise v2: full rebuild on the server, from the fitted body to the compressed game files and the baked clips.
#   all.sh [outline mm]     env: FROM=a|b|c|d|clips (start stage, default a), BAKE=1 simulate the cloth again
# Work dir /root/w/elise4 (scripts in s/), a checkout of the repo's art/ in /root/w/elise4/repo with the motion-capture
# takes (art/anim/fetch_mocap.py). The clip build FAILS if a leg capsule cuts the gown.
W=/root/w/elise4; R=$W/repo; cd $W; MM=${1:-2.5}; F=${FROM:-a}; set -o pipefail; Q='^(Blender|Read|Saved|Fra|$|\[INFO|Time|.*mpfb|.*Append|Info)'
st() { case "$F" in a) return 0;; b) [ "$1" != a ];; c) [ "$1" != a ] && [ "$1" != b ];; d) [ "$1" = d ] || [ "$1" = clips ];; clips) [ "$1" = clips ];; esac; }
if st a; then python3 s/a1_prep.py /root/w/elise3/work src.npz tgt.npz > a.log 2>&1; blender -b -P s/a1_body.py -- $W 2>&1 | grep -v -E "$Q" >> a.log; fi
if st b; then blender -b body.blend -P s/b1_layers.py -- $W 2>&1 | grep -v -E "$Q" > b.log; fi
if st c; then blender -b layers.blend -P s/c1_tex.py -- $W 2>&1 | grep -v -E "$Q" > c.log; fi
if st d; then
  blender -b elise_v2.blend -P s/d1_export.py -- $W agent_elise $MM 1 2>&1 | grep -v -E "$Q" > d.log
  blender -b elise_v2.blend -P s/d1_export.py -- $W agent_elise_m $MM 0.5 2>&1 | grep -v -E "$Q" >> d.log
  python3 s/glb_face.py agent_elise_raw.glb agent_elise_f.glb >> d.log 2>&1
  python3 s/glb_face.py agent_elise_m_raw.glb agent_elise_m_f.glb >> d.log 2>&1
  gltf-transform resize agent_elise_m_f.glb agent_elise_m_1k.glb --width 1024 --height 1024 >> d.log 2>&1
  bash s/compress-glb.sh agent_elise_f.glb agent_elise.glb agent_elise >> d.log 2>&1
  bash s/compress-glb.sh agent_elise_m_1k.glb agent_elise_m.glb agent_elise >> d.log 2>&1
fi
mkdir -p $R/game/public/assets/models $R/art/anim/out $R/art/agents/elise
cp agent_elise_f.glb $R/game/public/assets/models/agent_elise.glb; cp cloth_rig.npz $R/art/agents/elise/cloth_rig.npz
( cd $R && FTF_DUMP=$W/clips_dump.npz python3 art/anim/build_clips.py --char elise ${BAKE:+--bake} --out $W/clips_elise.glb ) > clips.log 2>&1 || { echo GOWN_CHECK_FAIL >> clips.log; echo DONE >> clips.log; exit 1; }
bash s/compress-glb.sh clips_elise.glb clips_elise_c.glb elise >> clips.log 2>&1
ls -la agent_elise*.glb clips_elise*.glb >> clips.log; echo DONE >> clips.log
