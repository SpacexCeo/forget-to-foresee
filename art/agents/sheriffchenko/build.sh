#!/bin/bash
# The Sheriffchenko skin (the wheel's rarest prize): the owner's generated, pre-rigged model on the shared agent rig,
# cel shaded in the game (an ink outline hull in the file), the heroine's clips retargeted onto it at load.
#   build.sh [work dir] [repo checkout]     -> <work dir>/out/agent_sheriffchenko.glb and _m.glb
W=${1:-/root/w/sheriffchenko}; R=${2:-/root/w/iris-anim/ftf}; S=$R/art/agents/sheriffchenko/src/sheriffchenko.glb; cd $W; mkdir -p out raw; : > build.log
for v in "" _m; do
  if [ -z "$v" ]; then tris=19000; px=2048; else tris=9000; px=1024; fi
  blender -b -P $R/art/townsfolk/npc_build.py -- $S raw/agent_sheriffchenko$v.glb 1.80 $tris 2.2 2>&1 | grep -E "^(source|welded|NPC|Traceback|  File|[A-Za-z]*Error)" >> build.log
  gltf-transform resize raw/agent_sheriffchenko$v.glb raw/t.glb --width $px --height $px >> gt.log 2>&1
  bash $R/art/tools/compress-glb.sh raw/t.glb out/agent_sheriffchenko$v.glb agent_sheriffchenko >> gt.log 2>&1
done
rm -f raw/t.glb; ls -la out >> build.log; echo SKIN_DONE >> build.log
