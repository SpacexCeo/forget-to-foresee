#!/usr/bin/env bash
# Lay the narrator over an assembled video: the game's mix ducks under the voice (sidechain), the voice sits on top.
# Usage: bash tools/capture/vo-mix.sh <video.mp4> <vo.wav> <out.mp4> [voice gain dB, default 0] [bed gain dB, default -3]
set -euo pipefail
IN="${1:?video}"; VO="${2:?voice wav}"; OUT="${3:?out}"; VG="${4:-0}"; BG="${5:--3}"
ffmpeg -y -v error -i "$IN" -i "$VO" -filter_complex \
  "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${VG}dB,asplit=2[vo][sc];
   [0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${BG}dB[bed];
   [bed][sc]sidechaincompress=threshold=0.02:ratio=6:attack=12:release=420:makeup=1[ducked];
   [ducked][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "wrote $OUT"
