cd /root/ftf && git stash -q -u && git stash drop -q; git fetch -q origin claude/laughing-thompson-dc7r09 && git reset -q --hard FETCH_HEAD
rm -f /root/logs/anim6.log; cd art/agents
for k in iris sol pepel moh yantar iney; do
  FTF_COMPRESS=/root/tools/compress-glb.sh blender -b -P build_agents.py -- build $k > /root/logs/agent6_$k.log 2>&1
  echo "BUILT $k" >> /root/logs/anim6.log; bash /root/review.sh $k
done
cd /root/ftf; mkdir -p docs/art/pitch/r5
for k in sol moh; do blender -b -P art/tools/pitch_turntable.py -- art/agents/_raw/agent_$k.glb docs/art/pitch/r5 agent_$k 4 1920 >> /root/logs/anim6_pitch.log 2>&1; done
git status --porcelain -uall | grep -v -e _raw -e _tmp | awk '{print $2}' | tar czf /root/r6.tgz -T -
echo ANIM6_DONE >> /root/logs/anim6.log
