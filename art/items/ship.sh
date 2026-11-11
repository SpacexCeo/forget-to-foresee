#!/usr/bin/env bash
# Ships the items built by build_items.py: compress every raw glb (art/tools/compress-glb.sh: meshopt; the
# items carry no textures), downsize the 512 px icon renders to 256/128 px, write manifest.json.
# Usage: ship.sh <build_dir> <dest_dir>   (dest: game/public/assets/items)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=$1; dst=$2
compress=${COMPRESS:-$here/../tools/compress-glb.sh}
mkdir -p "$dst/icons"
for f in "$src"/raw/*.glb; do
  n=$(basename "$f" .glb)
  bash "$compress" "$f" "$dst/$n.glb" "$n" > /dev/null
done
python3 "$here/manifest.py" "$src" "$dst"
