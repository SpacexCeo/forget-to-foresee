cd /root/ftf && git fetch -q origin claude/laughing-thompson-dc7r09 && git reset -q --hard FETCH_HEAD
cd game && npm ci --silent > /root/logs/npm5.log 2>&1 && npm run build > /root/logs/build5.log 2>&1
(setsid nohup npx vite preview --port 4181 --strictPort --host 127.0.0.1 > /root/logs/preview5.log 2>&1 &)
sleep 5; cd /root && NODE_PATH=/root/pw/node_modules timeout 300 node /root/ingame.cjs > /root/logs/ingame5.log 2>&1
cd /root/w/ingame5 && tar czf /root/ingame5.tgz *.jpg; echo INGAME_DONE >> /root/logs/ingame5.log
