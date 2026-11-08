set -e
cd /root/ftf && git fetch -q origin claude/laughing-thompson-dc7r09 && git reset -q --hard FETCH_HEAD
cd game && npm ci --silent > /root/logs/npm.log 2>&1 && npm run build > /root/logs/build.log 2>&1
(nohup npx vite preview --port 4173 --strictPort --host 127.0.0.1 > /root/logs/preview.log 2>&1 &)
sleep 4; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/ ; echo
echo GAMEBUILD_DONE
