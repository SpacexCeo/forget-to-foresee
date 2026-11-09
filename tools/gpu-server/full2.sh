export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright FTF_SKIP_SHOTS=guest,emerge FTF_SKIP_4K=1
for p in $(pgrep -f 'vite preview --port 5179'); do kill $p; done; sleep 2
bash /root/skip-shots.sh > /root/logs/full2.log 2>&1
for v in demo trailer clip-shell clip-memory clip-verified; do
  bash /root/gpu-job-full.sh e104cab /root/ftf-media-v2 $v >> /root/logs/full2.log 2>&1
  echo "VIDEO_END $v $?" >> /root/logs/full2.log
  for p in $(pgrep -f 'vite preview --port 5179'); do kill $p; done; sleep 2
done
echo FULL2_DONE >> /root/logs/full2.log
