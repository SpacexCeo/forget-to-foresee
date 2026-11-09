#!/usr/bin/env bash
# Self-contained GPU capture job for the trailer, demo video and clips (docs/submission/trailer.md).
# Runs on a Linux box with an NVIDIA GPU (tested target: RTX 4090/5090, Ubuntu, driver with Vulkan ICD).
# Usage:  bash tools/capture/gpu-job.sh <commit-or-branch> <output-folder> [videos...]
#   e.g.  bash gpu-job.sh claude/trailer /root/ftf-media            # all five videos, 1080p60 ultra + 4K masters
#         bash gpu-job.sh 1a2b3c4d /root/ftf-media demo trailer     # only these
# Outputs land incrementally in <output-folder>: <video>.mp4, <video>-captions.mp4, <video>.srt, <video>.report.json,
# the 4K masters under <output-folder>/4k, per-shot intermediates and logs under <output-folder>/work. Re-running
# resumes finished shots (--resume). FTF_SKIP_4K=1 renders the 1080p deliverables only. A flagged frame (black edge,
# luma jump) is re-rendered up to three times before a shot fails; the reports count the retries. No secrets needed.
set -euo pipefail
REF="${1:?commit or branch}"; OUT="${2:?output folder}"; shift 2 || true
VIDEOS=("$@"); if [ ${#VIDEOS[@]} -eq 0 ]; then VIDEOS=(demo trailer clip-shell clip-memory clip-verified); fi
SRC="${FTF_SRC:-$HOME/ftf-capture-src}"; PORT="${FTF_PORT:-5179}"
mkdir -p "$OUT/work" "$OUT/4k"
exec > >(tee -a "$OUT/work/job.log") 2>&1
echo "== $(date -u +%FT%TZ) job start: ref=$REF out=$OUT videos=${VIDEOS[*]}"

# 1. Source at the exact commit.
if [ ! -d "$SRC/.git" ]; then git clone -q https://github.com/SpacexCeo/forget-to-foresee.git "$SRC"; fi
git -C "$SRC" fetch -q origin 2>/dev/null || true
git -C "$SRC" fetch -q origin "$REF" 2>/dev/null || true   # a branch name; a bare SHA is reachable after the full fetch
COMMIT="$(git -C "$SRC" rev-parse -q --verify "origin/$REF^{commit}" || git -C "$SRC" rev-parse -q --verify "$REF^{commit}")" || { echo "ref $REF not found"; exit 2; }
git -C "$SRC" checkout -q --detach "$COMMIT"
echo "== commit $(git -C "$SRC" rev-parse --short HEAD): $(git -C "$SRC" log -1 --format=%s)"

# 2. Tools: node 20+, ffmpeg with libx264/libass/libopus, Playwright's Chromium.
# An existing Playwright install (the owner's box keeps one in /root/pw) is used as is; set PLAYWRIGHT_PATH to point at it.
if [ -z "${PLAYWRIGHT_PATH:-}" ] && [ -d /root/pw/node_modules/playwright ]; then export PLAYWRIGHT_PATH=/root/pw/node_modules/playwright; fi
command -v node >/dev/null || { echo "node 20+ is required"; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required (apt-get install -y ffmpeg)"; exit 2; }
ffmpeg -hide_banner -version | head -1
(cd "$SRC/game" && npm ci --no-audit --no-fund)
if [ -n "${PLAYWRIGHT_PATH:-}" ] && node -e "require(process.env.PLAYWRIGHT_PATH)" 2>/dev/null; then echo "== playwright from $PLAYWRIGHT_PATH";
else
  if ! node -e "require('playwright')" 2>/dev/null; then npm i -g playwright@1.49.1 >/dev/null; fi
  npx --yes playwright@1.49.1 install --with-deps chromium >/dev/null 2>&1 || npx playwright install chromium
fi
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || echo "nvidia-smi not found: the probe below decides"

# 3. Build once (the capture serves the production bundle: no dev-server reloads during a long render).
(cd "$SRC/game" && npm run build >/dev/null && echo "== build ok")
(cd "$SRC/game" && nohup npx vite preview --port "$PORT" --strictPort > "$OUT/work/preview.log" 2>&1 &)
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$PORT/" >/dev/null || { echo "preview server did not start"; cat "$OUT/work/preview.log"; exit 3; }

# 4. Which Chromium flags give hardware WebGL here (Vulkan via ANGLE, EGL, GL, or SwiftShader as the last resort).
GPU_FLAG="--gpu"
if ! (cd "$SRC" && node tools/capture/gpu-probe.mjs); then echo "WARNING: no hardware WebGL; rendering on SwiftShader (slow)"; GPU_FLAG=""; fi

# 4a. FTF_PROBE=<video>:<shot>:<from>-<to>: GPU diagnosis of one shot (each post pass off in turn, target sizes), then stop.
if [ -n "${FTF_PROBE:-}" ]; then
  IFS=: read -r PV PS PR <<< "$FTF_PROBE"
  (cd "$SRC" && node tools/capture/capture.mjs "$PV" --shots "$PS" $GPU_FLAG --tier ultra --width 1920 --height 1080 --fps 60 --parallel 1 --probe "$PR" --base "http://localhost:$PORT" --out "$OUT" --work "$OUT/probe")
  echo "== probe done: $OUT/probe/$PV-1920x1080-ultra/$PS.probe.json and the PNGs per variant"; exit 0
fi

# 4b. FTF_TEST=1: a short pipeline test (one 8 s shot of the demo at 1080p, no assembly), then stop.
if [ "${FTF_TEST:-}" = "1" ]; then
  (cd "$SRC" && node tools/capture/capture.mjs demo --shots archipelago $GPU_FLAG --tier ultra --width 1920 --height 1080 --fps 60 --parallel 1 --sample 120 --base "http://localhost:$PORT" --out "$OUT" --work "$OUT/test")
  echo "== test done: see $OUT/test/demo-1920x1080-ultra/archipelago.mp4, archipelago.json (renderer, secondsPerFrame) and the sample PNGs"; exit 0
fi

# 5a. FTF_FORMAT=<W>x<H>@<fps> (e.g. 3840x2160@30): one pass in that format only, then stop. With FTF_NO_LAYERS=1 the
#     shots' depth-anchored data layers are left out (clean plates plus each frame's camera in <shot>.json) for the CPU
#     layers pass (tools/capture/layers-pass.mjs); deliver the whole $OUT/work/<video>-<W>x<H>-ultra folder.
if [ -n "${FTF_FORMAT:-}" ]; then
  FW="${FTF_FORMAT%%x*}"; REST="${FTF_FORMAT#*x}"; FH="${REST%%@*}"; FF="${REST#*@}"
  for v in "${VIDEOS[@]}"; do
    echo "== $(date -u +%FT%TZ) $v ${FW}x${FH}@${FF} (FTF_NO_LAYERS=${FTF_NO_LAYERS:-0})"
    (cd "$SRC" && node tools/capture/capture.mjs "$v" $GPU_FLAG --tier ultra --width "$FW" --height "$FH" --fps "$FF" --parallel 1 --resume --sample $((FF * 3)) --base "http://localhost:$PORT" --out "$OUT" --work "$OUT/work")
  done
  echo "== $(date -u +%FT%TZ) done"; ls -la "$OUT" "$OUT/work"/*; exit 0
fi

# 5. Render: 1080p60 ultra deliverables, then 4K60 masters (kept only if under 90 MB each).
for v in "${VIDEOS[@]}"; do
  echo "== $(date -u +%FT%TZ) $v 1080p"
  (cd "$SRC" && node tools/capture/capture.mjs "$v" $GPU_FLAG --tier ultra --width 1920 --height 1080 --fps 60 --parallel 2 --resume --base "http://localhost:$PORT" --out "$OUT" --work "$OUT/work")
  if [ "${FTF_SKIP_4K:-}" = "1" ]; then continue; fi
  echo "== $(date -u +%FT%TZ) $v 4K"
  (cd "$SRC" && node tools/capture/capture.mjs "$v" $GPU_FLAG --tier ultra --width 3840 --height 2160 --fps 60 --parallel 1 --resume --base "http://localhost:$PORT" --out "$OUT/4k" --work "$OUT/work") || echo "4K render of $v failed; the 1080p file stands"
  for f in "$OUT/4k/$v.mp4" "$OUT/4k/$v-captions.mp4"; do
    if [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt $((90 * 1024 * 1024)) ]; then echo "$f is over 90 MB: kept here, do not commit it"; fi
  done
done
echo "== $(date -u +%FT%TZ) done"; ls -la "$OUT" "$OUT/4k"
# Deliver: copy <output-folder>/*.mp4 *.srt *.report.json into docs/media/ of the repository (each under 90 MB) and commit.
