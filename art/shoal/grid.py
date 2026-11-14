"""Metric grid and joint dots over a grid_views render (plain Python + Pillow).
  python3 grid.py <view.json> <out.jpg> [--step 0.5] [--joints joints.json]
joints.json: {"name": [x, y, z], ...} in metres."""
import json, sys
from PIL import Image, ImageDraw
a = sys.argv[1:]; meta = json.load(open(a[0])); out = a[1]
step = float(a[a.index('--step') + 1]) if '--step' in a else 0.5
joints = json.load(open(a[a.index('--joints') + 1])) if '--joints' in a else {}
im = Image.open(meta['img']).convert('RGB'); W = im.width; d = ImageDraw.Draw(im)
c, r, u, s = meta['centre'], meta['right'], meta['up'], meta['scale']
dot = lambda p, v: sum(pi * vi for pi, vi in zip(p, v))
def px(p): return (W / 2 + (dot(p, r) - dot(c, r)) / s * W, W / 2 - (dot(p, u) - dot(c, u)) / s * W)
ra = max(range(3), key=lambda i: abs(r[i])); ua = max(range(3), key=lambda i: abs(u[i]))
import math
for axis, vec, horiz in ((ra, r, False), (ua, u, True)):
    lo = dot(c, vec) - s / 2; hi = dot(c, vec) + s / 2; sg = 1 if vec[axis] > 0 else -1
    k = math.ceil(lo / step)
    while k * step < hi:
        w = k * step; t = (w - dot(c, vec)) / s * W; val = w * sg
        col = (200, 60, 60) if abs(val) < 1e-6 else ((90, 90, 110) if k % 2 == 0 else (150, 150, 165))
        if horiz: y = W / 2 - t; d.line([(0, y), (W, y)], fill=col, width=1); d.text((3, y + 1), f'{"xyz"[axis]}={val:g}', fill=(20, 20, 60))
        else: x = W / 2 + t; d.line([(x, 0), (x, W)], fill=col, width=1); d.text((x + 2, 3), f'{"xyz"[axis]}={val:g}', fill=(20, 20, 60))
        k += 1
for n, p in joints.items():
    if not isinstance(p, list) or len(p) != 3: continue
    x, y = px(p); d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 40, 40), outline=(255, 255, 255)); d.text((x + 6, y - 5), n, fill=(120, 0, 0))
im.save(out, quality=88); print('grid', out)
