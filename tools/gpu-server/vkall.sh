export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright
SRC=/root/ftf-capture-src; cd $SRC; R=/root/logs/vkall.txt; : > $R
git log --oneline -1 >> $R
for v in demo trailer clip-shell clip-memory clip-verified; do
  timeout 3600 node tools/capture/capture.mjs $v --gpu --tier ultra --width 1920 --height 1080 --fps 60 --parallel 2 --resume --base http://localhost:5179 --out /root/ftf-media/vk1080 --work /root/ftf-media/vkwork > /root/logs/vk_$v.log 2>&1
  echo "== $v 1080p exit $?" >> $R
  grep -E "context lost|failed" /root/logs/vk_$v.log | head -2 >> $R
done
for v in demo trailer clip-shell clip-memory clip-verified; do
  timeout 5400 node tools/capture/capture.mjs $v --gpu --tier ultra --width 3840 --height 2160 --fps 60 --parallel 1 --resume --base http://localhost:5179 --out /root/ftf-media/vk4k --work /root/ftf-media/vkwork4k > /root/logs/vk4k_$v.log 2>&1
  echo "== $v 4K exit $?" >> $R
done
echo VKALL_DONE >> $R
