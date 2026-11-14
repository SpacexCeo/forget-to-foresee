#!/bin/bash
# Cuts the owner's control-mode infographics (one per language: docs/art/requests/in/ui/control_modes/<lang>.png, title
# on top, "Aim mode" panel left, "Classic" panel right, the CTRL / ESC footer below) into the two card pictures the
# Settings -> Controls cards show: game/public/assets/ui/control-modes/<lang>-aim.webp and <lang>-classic.webp, 600 px
# wide. Then add the language to CONTROL_ART in game/src/ui/control-mode-cards.js (Italian shows English).
# The panel box is a fraction of the image: TOP / BOTTOM (rows kept) and GAP (the gutter between the panels, centred);
# defaults fit a two-panel sheet with a title band; check one output and adjust before cutting all.
# Usage: art/ui/control_modes.sh [lang ...]   (needs ffmpeg with libwebp)
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=docs/art/requests/in/ui/control_modes
OUT=game/public/assets/ui/control-modes
TOP=${TOP:-0.16} BOTTOM=${BOTTOM:-0.88} SIDE=${SIDE:-0.03} GAP=${GAP:-0.02}
mkdir -p "$OUT"
for lang in ${@:-ru en uk zh}; do
  in="$SRC/$lang.png"; [ -f "$in" ] || { echo "skip $lang: no $in"; continue; }
  # left panel: from SIDE to (0.5 - GAP/2); right panel: from (0.5 + GAP/2) to (1 - SIDE)
  ffmpeg -y -loglevel error -i "$in" -vf "crop=iw*(0.5-$GAP/2-$SIDE):ih*($BOTTOM-$TOP):iw*$SIDE:ih*$TOP,scale=600:-2:flags=lanczos" -c:v libwebp -quality 86 "$OUT/$lang-aim.webp"
  ffmpeg -y -loglevel error -i "$in" -vf "crop=iw*(0.5-$GAP/2-$SIDE):ih*($BOTTOM-$TOP):iw*(0.5+$GAP/2):ih*$TOP,scale=600:-2:flags=lanczos" -c:v libwebp -quality 86 "$OUT/$lang-classic.webp"
  echo "$lang: $OUT/$lang-aim.webp $OUT/$lang-classic.webp"
done
