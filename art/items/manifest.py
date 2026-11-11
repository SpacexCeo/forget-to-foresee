"""Icons (512 -> 256/128 px, transparent PNG) and manifest.json for game/public/assets/items/.

Manifest paths are relative to the manifest's own folder (/assets/items/). nameKey points at the locale
key `item.<id>` (game/src/locales). Props carry rarity null; glbMobile is the phone variant when present.
"""
import glob
import json
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalogue.json")))
stats = {}
for f in glob.glob(os.path.join(src, "stats_*.json")):
    stats.update(json.load(open(f)))
items = []
for it in CAT:
    i = it["id"]
    im = Image.open(os.path.join(src, "icons", i + ".png")).convert("RGBA")
    for px in (256, 128):
        im.resize((px, px), Image.LANCZOS).save(os.path.join(dst, "icons", "%s_%d.png" % (i, px)), optimize=True)
    e = dict(id=i, nameKey="item." + i, kind=it["kind"], rarity=it["rarity"],
             icon="icons/%s_256.png" % i, icon128="icons/%s_128.png" % i, glb=i + ".glb", tris=stats.get(i))
    if os.path.exists(os.path.join(dst, i + "_m.glb")):
        e["glbMobile"] = i + "_m.glb"
        e["trisMobile"] = stats.get(i + "_m")
    items.append(e)
json.dump(dict(version=1, items=items), open(os.path.join(dst, "manifest.json"), "w"), indent=1)
print(len(items), "items")
