#!/bin/bash
# Elise: the in-game check video on the GPU server. Usage: vid.sh <branch>   (output /root/w/elise4/elise_ingame.mp4)
# Needs the server's own checkout in /root/ftf (it can fetch) and Playwright in /root/pw.
B=${1:-claude/elise-v2}; W=/root/w/elise4; L=$W/vid.log
cd /root/ftf && git fetch -q origin $B 2> $L || { echo FETCH_FAIL >> $L; echo DONE >> $L; exit 1; }
rm -rf $W/ftf; git worktree prune; git worktree add -f --detach $W/ftf FETCH_HEAD >> $L 2>&1
cd $W/ftf/game && npm ci --silent >> $L 2>&1
(setsid nohup npx vite --port 5199 --strictPort --host 127.0.0.1 > $W/vite.log 2>&1 &)
sleep 8; rm -rf $W/v1
cd $W/ftf && NODE_PATH=/root/pw/node_modules timeout 600 node art/agents/elise/ingame_check.mjs $W/v1 http://127.0.0.1:5199 --video --gpu 720x900 >> $L 2>&1
pkill -f "vite --port 5199"
cd $W/v1 && N=$(ls f_*.jpg | wc -l) && FPS=$(python3 -c "print(round($N/18.2,2))") && ffmpeg -y -loglevel error -framerate $FPS -i f_%04d.jpg -vf "fps=30" -c:v libx264 -pix_fmt yuv420p -crf 27 ../elise_ingame.mp4 >> $L 2>&1
echo "frames $N fps $FPS" >> $L; echo DONE >> $L
