export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright
until grep -q ANIM4_DONE /root/logs/anim4.log 2>/dev/null; do sleep 30; done
SRC=/root/ftf-capture-src; R=/root/logs/bisect.txt; : > $R
cd $SRC && git fetch -q origin claude/trailer && git checkout -q --detach origin/claude/trailer && git log --oneline -1 >> $R
(cd game && npm ci --silent >/dev/null 2>&1 && npm run build >/dev/null 2>&1)
pkill -f 'vite preview --port 5179'; (cd game && nohup npx vite preview --port 5179 --strictPort > /root/logs/prev5179.log 2>&1 &); sleep 5
node tools/capture/gpu-probe.mjs >> $R 2>&1
B=tools/capture/lib/browser.mjs; cp $B /root/w/browser.mjs.orig
try() { # name tier
  rm -rf /root/ftf-media/bisect-$1
  DEBUG=pw:browser* timeout 900 node tools/capture/capture.mjs trailer --shots rise --gpu --tier $2 --width 1920 --height 1080 --base http://localhost:5179 --out /root/ftf-media --work /root/ftf-media/bisect-$1 > /root/logs/bisect_$1.log 2>&1
  rc=$?; echo "== $1 (tier $2): exit $rc" >> $R
  grep -E "GUILTY|context lost|done:" /root/logs/bisect_$1.log | sed 's/.*\]\[err\] //' | cut -c1-220 | head -4 >> $R
  return $rc
}
WIN=""
try low low && WIN="low|low|"
if [ -z "$WIN" ]; then sed -i "s/tex: 'full'/tex: 'm'/" $B; try texm high && WIN="texm|high|tex=m"; fi
if [ -z "$WIN" ]; then sed -i "s/tex: 'm'/tex: 'm', motion: 'reduce'/" $B; try motion high && WIN="motion|high|tex=m,motion=reduce"; fi
echo "WINNER: ${WIN:-none}" >> $R
if [ -n "$WIN" ]; then
  T=$(echo $WIN | cut -d'|' -f2)
  for v in demo trailer clip-shell clip-memory clip-verified; do
    timeout 3000 node tools/capture/capture.mjs $v --gpu --tier $T --width 1920 --height 1080 --fps 60 --parallel 2 --resume --base http://localhost:5179 --out /root/ftf-media/draft-$T --work /root/ftf-media/work-$T > /root/logs/draft_$v.log 2>&1
    echo "== draft $v exit $?" >> $R
  done
fi
cp /root/w/browser.mjs.orig $B
echo BISECT_DONE >> $R
