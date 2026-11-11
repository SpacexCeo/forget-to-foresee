#!/bin/bash
# Elise: full rebuild from the cut parts to the two compressed game files, the baked clips and the sheet.
#   all.sh <outline mm> [parts]      env: SKIP_B=1 texture and export only; SKIP_MODEL=1 clips only; BAKE=1 simulate the cloth again (otherwise art/anim/out/elise_cloth.npz is used)
# Work dir /root/w/elise3/work (scripts in work/s/), a checkout of the repo's art/ in /root/w/elise3/repo (with the
# motion-capture takes fetched by art/anim/fetch_mocap.py). The clip build FAILS if a leg capsule cuts the gown.
W=/root/w/elise3/work; R=/root/w/elise3/repo; cd $W; MM=${1:-2.5}; set -o pipefail
if [ -z "$SKIP_MODEL" ]; then
  if [ "$2" = parts ]; then python3 s/a3_parts.py > a3.log 2>&1; fi
  [ "$SKIP_B" ] || blender -b -P s/b_build.py -- $W > b.log 2>&1
  python3 s/c_bake.py 2048 > c.log 2>&1
  blender -b elise_build.blend -P s/d_final.py -- $W agent_elise $MM 1 >> c.log 2>&1
  blender -b elise_build.blend -P s/d_final.py -- $W agent_elise_m $MM 0.5 >> c.log 2>&1
  python3 s/glb_face.py agent_elise_raw.glb agent_elise_f.glb >> c.log 2>&1
  python3 s/glb_face.py agent_elise_m_raw.glb agent_elise_m_f.glb >> c.log 2>&1
  gltf-transform resize agent_elise_m_f.glb agent_elise_m_1k.glb --width 1024 --height 1024 >> c.log 2>&1
  bash s/compress-glb.sh agent_elise_f.glb agent_elise.glb agent_elise >> c.log 2>&1
  bash s/compress-glb.sh agent_elise_m_1k.glb agent_elise_m.glb agent_elise >> c.log 2>&1
fi
# clips: the body motion, the cloth baked onto the gown / ribbon / strand bones (numpy solver, art/anim/ftfanim/cloth.py),
# then the leg-against-gown check over every clip; the build writes nothing if it fails
mkdir -p $R/game/public/assets/models $R/art/anim/out
cp agent_elise_f.glb $R/game/public/assets/models/agent_elise.glb; cp cloth_rig.npz $R/art/agents/elise/cloth_rig.npz
( cd $R && FTF_DUMP=$W/clips_dump.npz python3 art/anim/build_clips.py --char elise ${BAKE:+--bake} --out $W/clips_elise.glb ) > clips.log 2>&1 || { echo GOWN_CHECK_FAIL >> clips.log; exit 1; }
bash s/compress-glb.sh clips_elise.glb clips_elise_c.glb elise >> clips.log 2>&1      # meshopt only: the clip file has no textures
if [ -z "$SKIP_MODEL" ]; then blender -b agent_elise.blend -P s/sheet.py -- r/sheet.jpg $W/clips_dump.npz >> c.log 2>&1; fi
ls -la agent_elise*.glb clips_elise*.glb >> clips.log; echo DONE >> clips.log
