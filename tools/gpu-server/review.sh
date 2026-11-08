k=$1; cd /root/ftf/art/agents
blender -b -P review_anim.py -- /root/ftf/art/agents/_raw/agent_$k.glb /root/ftf/docs/art/qa/agents/$k/anim $k > /root/logs/review_$k.log 2>&1
echo "REVIEW_DONE $k" >> /root/logs/review_$k.log
