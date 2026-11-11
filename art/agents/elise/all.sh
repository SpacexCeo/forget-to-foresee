#!/bin/bash
# Elise: full rebuild from the cut parts to the two compressed game files and the sheet. Usage: all.sh <outline mm> [parts]
# Work dir: /root/w/elise2/work (a copy of the first pass's /root/w/elise/work; scripts in work/s/).
cd /root/w/elise2/work; MM=${1:-2.5}
if [ "$2" = parts ]; then python3 s/a3_parts.py > a3.log 2>&1; fi
[ "$SKIP_B" ] || blender -b -P s/b_build.py -- /root/w/elise2/work > b.log 2>&1   # SKIP_B=1: texture and export only
python3 s/c_bake.py 2048 > c.log 2>&1
blender -b elise_build.blend -P s/d_final.py -- /root/w/elise2/work agent_elise $MM 1 >> c.log 2>&1
blender -b elise_build.blend -P s/d_final.py -- /root/w/elise2/work agent_elise_m $MM 0.5 >> c.log 2>&1
python3 s/glb_face.py agent_elise_raw.glb agent_elise_f.glb >> c.log 2>&1
python3 s/glb_face.py agent_elise_m_raw.glb agent_elise_m_f.glb >> c.log 2>&1
gltf-transform resize agent_elise_m_f.glb agent_elise_m_1k.glb --width 1024 --height 1024 >> c.log 2>&1
bash s/compress-glb.sh agent_elise_f.glb agent_elise.glb agent_elise >> c.log 2>&1
bash s/compress-glb.sh agent_elise_m_1k.glb agent_elise_m.glb agent_elise >> c.log 2>&1
# the leg-through-gown check over every clip (clips_elise.glb = game/public/assets/anim/elise.glb); a failure is logged as SKIRT_CHECK_FAIL
python3 s/skirt_check.py agent_elise_f.glb clips_elise.glb agent_elise_check.npz >> c.log 2>&1 || echo SKIRT_CHECK_FAIL >> c.log
blender -b agent_elise.blend -P s/sheet.py -- r/sheet.jpg >> c.log 2>&1
ls -la agent_elise*.glb agent_elise*.blend >> c.log; echo DONE >> c.log
