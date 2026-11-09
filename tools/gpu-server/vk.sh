export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright
SRC=/root/ftf-capture-src; cd $SRC; R=/root/logs/vk.txt; : > $R
cat > tools/capture/.gpu-args.json <<'J'
{"args": ["--use-angle=vulkan", "--use-vulkan=native", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-gpu-watchdog"], "renderer": "vulkan", "name": "angle-vulkan"}
J
pgrep -f 'vite preview --port 5179' >/dev/null || (cd game && nohup npx vite preview --port 5179 --strictPort > /root/logs/prev5179.log 2>&1 &); sleep 4
rm -rf /root/ftf-media/bisect-vk
DEBUG=pw:browser* timeout 900 node tools/capture/capture.mjs trailer --shots rise --gpu --tier ultra --width 1920 --height 1080 --base http://localhost:5179 --out /root/ftf-media --work /root/ftf-media/bisect-vk > /root/logs/bisect_vk.log 2>&1
echo "== vulkan ultra: exit $?" >> $R
grep -E "GUILTY|context lost|done:" /root/logs/bisect_vk.log | sed 's/.*\]\[err\] //' | cut -c1-220 | head -4 >> $R
echo VK_DONE >> $R
