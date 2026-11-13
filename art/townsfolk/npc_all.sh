#!/bin/bash
# The five quest givers (columns: source, giver, height m, triangles, phone triangles; the two with fine hair and
# glasses keep more: their UV seams open when decimated harder): source models (work dir $1, default /root/w/npcs) -> game files in $1/out.
#   npc_all.sh [work dir] [repo checkout]
W=${1:-/root/w/npcs}; R=${2:-/root/w/iris-anim/ftf}; cd $W; mkdir -p out raw; : > build.log
while read src key h full lite; do
  for v in "" _m; do
    if [ -z "$v" ]; then tris=$full; px=1024; else tris=$lite; px=512; fi
    blender -b -P $R/art/townsfolk/npc_build.py -- $W/$src raw/npc_$key$v.glb $h $tris 2>&1 | grep -E "^(source|welded|GPU|NPC|Traceback|  File|[A-Za-z]*Error)" >> build.log
    gltf-transform resize raw/npc_$key$v.glb raw/t.glb --width $px --height $px >> gt.log 2>&1
    bash $R/art/tools/compress-glb.sh raw/t.glb out/npc_$key$v.glb npc_$key >> gt.log 2>&1
  done
done <<L
npc_d_knight.glb guard 1.80 14000 5000
npc_c_plum_coat.glb innkeeper 1.65 24000 9000
npc_b_white_coat.glb elder 1.70 14000 5000
npc_a_purple_coat.glb lamplighter 1.70 20000 8000
npc_e_adventurer.glb shardkeeper 1.70 14000 5000
L
rm -f raw/t.glb; ls -la out >> build.log; echo NPC_DONE >> build.log
