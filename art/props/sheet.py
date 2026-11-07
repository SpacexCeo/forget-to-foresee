"""Contact sheet from QA tiles (run with Blender's Python, which has Pillow):
blender -b --python-exit-code 1 -P art/props/sheet.py -- <group> <out.jpg> <name> [name ...]"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:]
group, out, names = argv[0], argv[1], argv[2:]
T = 400
cols = 4
rows = (len(names) + cols - 1) // cols
sheet = Image.new("RGB", (cols * T, rows * (T + 34)), (24, 25, 26))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    tile = os.path.join(HERE, "build", "tiles", f"{n}.jpg")
    if not os.path.exists(tile):
        continue
    x, y = (i % cols) * T, (i // cols) * (T + 34)
    sheet.paste(Image.open(tile).resize((T, T)), (x, y))
    st = json.load(open(os.path.join(HERE, "build", "stats", f"prop_{n}.json")))
    sz = "x".join(f"{v:.2f}" for v in st["size_m"])
    d.text((x + 8, y + T + 4), f"prop_{n}", fill=(230, 225, 210))
    d.text((x + 8, y + T + 18), f"{st['runtime_triangles']} tris  {sz} m", fill=(170, 170, 160))
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out, quality=85, optimize=True)
print("sheet", out, group, len(names))
