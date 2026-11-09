#!/usr/bin/env bash
# The jury video's server-side composite (docs/submission/jury-video.md, v3): the CPU layers pass over the GPU plates
# (FTF_NO_LAYERS=1 renders), then assembly with the game's own mix, captions and the luma check. Runs where the 4K plates
# are (the GPU server); needs node 20+, ffmpeg and Playwright's Chromium, nothing else.
# Usage: bash tools/capture/jury-composite.sh <video> <plates-folder> <out-folder> [WxH] [fps]
#   e.g. bash tools/capture/jury-composite.sh jury-test /root/ftf-media/jury-test-3/work/jury-test-3840x2160-ultra /root/ftf-media/jury-test-3/final 3840x2160 30
set -euo pipefail
VIDEO="${1:?video}"; PLATES="${2:?plates folder}"; OUT="${3:?out folder}"; SIZE="${4:-3840x2160}"; FPS="${5:-30}"
W="${SIZE%x*}"; H="${SIZE#*x}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -z "${PLAYWRIGHT_PATH:-}" ] && [ -d /root/pw/node_modules/playwright ]; then export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright; fi
[ -d "$HERE/game/node_modules" ] || (cd "$HERE/game" && npm ci --no-audit --no-fund)
WORK="$OUT/work"; LP="$WORK/$VIDEO-${W}x${H}-ultra"; mkdir -p "$LP"
echo "== $(date -u +%FT%TZ) layers pass: $PLATES -> $LP"
(cd "$HERE" && node tools/capture/layers-pass.mjs "$VIDEO" "$PLATES" "$LP" --width "$W" --height "$H")
echo "== $(date -u +%FT%TZ) assembly"
(cd "$HERE" && node tools/capture/capture.mjs "$VIDEO" --resume --width "$W" --height "$H" --fps "$FPS" --tier ultra --work "$WORK" --out "$OUT")
ls -la "$OUT"
for f in "$OUT/$VIDEO.mp4" "$OUT/$VIDEO-captions.mp4"; do
  [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt $((95 * 1024 * 1024)) ] && echo "WARNING: $f is over 95 MB (GitHub limit 100 MB): keep it server-only and send the 1080p downscale"
done
ffmpeg -v error -y -i "$OUT/$VIDEO.mp4" -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT/$VIDEO-1080p.mp4"
echo "== done: $OUT/$VIDEO.mp4 (master), $OUT/$VIDEO-1080p.mp4, $OUT/$VIDEO.srt, $OUT/$VIDEO.report.json"
