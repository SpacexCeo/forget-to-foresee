#!/bin/bash
# Elise: full rebuild from the cut parts to the two compressed game files. Usage: all.sh <outline mm> [parts]
cd /root/w/elise/work; MM=${1:-2.5}
if [ "$2" = parts ]; then python3 s/a3_parts.py > a3.log 2>&1; fi
blender -b -P s/b_build.py -- /root/w/elise/work 1 > b.log 2>&1
python3 s/c_bake.py 2048 > c.log 2>&1
blender -b elise_build.blend -P s/d_final.py -- /root/w/elise/work agent_elise $MM 1 >> c.log 2>&1
blender -b elise_build.blend -P s/d_final.py -- /root/w/elise/work agent_elise_m $MM 0.5 >> c.log 2>&1
gltf-transform resize agent_elise_m_raw.glb agent_elise_m_1k.glb --width 1024 --height 1024 >> c.log 2>&1
bash s/compress-glb.sh agent_elise_raw.glb agent_elise.glb agent_elise >> c.log 2>&1
bash s/compress-glb.sh agent_elise_m_1k.glb agent_elise_m.glb agent_elise >> c.log 2>&1
rm -f r/s_*; blender -b agent_elise.blend -P s/shots.py -- r/s 1000:tex:flat:cull '[[0,0,0.9,1.85,0,0,0.5],[0,0,0.9,1.85,180,0,0.5],[0,0,0.9,1.85,90,0,0.4],[0,0,0.9,1.85,270,0,0.4],[0,0,0.9,1.85,35,5,0.5],[0,0.02,1.61,0.34,0,0,1],[0,0.05,1.62,0.38,180,10,1],[-0.05,0.03,1.66,0.26,290,10,1],[0.13,-0.05,0.86,0.36,25,0,1]]' >> c.log 2>&1
python3 s/montage.py r/s.jpg r/s 5 90; ls -la agent_elise*.glb agent_elise*.blend >> c.log; echo DONE >> c.log
