#!/usr/bin/env python3
"""Stick-figure contact sheet of a raw take (front and side), to pick segments without a browser.

    python3 art/anim/preview.py 141_16 --out /tmp/x.jpg [--mocap art/anim/src --from 0 --to 600 --n 16]

Each cell shows the frame number; the figure is centred on its hips (red = left, blue = right).
Needs numpy and Pillow.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim.bvh import Bvh   # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('take'); ap.add_argument('--mocap', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))
ap.add_argument('--out', required=True); ap.add_argument('--from', dest='f0', type=int, default=1); ap.add_argument('--to', dest='f1', type=int, default=-1)
ap.add_argument('--n', type=int, default=16); ap.add_argument('--cell', type=int, default=110)
a = ap.parse_args()
b = Bvh(os.path.join(a.mocap, 'data', a.take.split('_')[0].zfill(3), a.take + '.bvh'))
P = np.stack([b.pos(n) for n in b.names], 1)            # [F, J, 3]
f1 = b.frames - 1 if a.f1 < 0 else min(a.f1, b.frames - 1)
idx = np.linspace(a.f0, f1, a.n).astype(int)
h = float(P[1:, :, 1].max() - P[1:, :, 1].min()); C = a.cell; s = C * 1.7 / h
floor = float(np.percentile(P[1:, :, 1].min(1), 5))
cols = a.n // 2
img = Image.new('RGB', (C * 2 * cols, C * 4), '#f4f4f0'); d = ImageDraw.Draw(img)
for k, f in enumerate(idx):
    for v, ax in enumerate((0, 2)):                      # front (x), side (z)
        ox = (k % cols) * C * 2 + v * C + C // 2; oy = (k // cols) * C * 2 + C * 2 - 8
        hip = P[f, 0]
        for j, p in enumerate(b.parent):
            if p < 0:
                continue
            col = '#c0392b' if b.names[j].startswith('Left') else ('#2c5aa0' if b.names[j].startswith('Right') else '#222')
            x0, y0 = ox + (P[f, p, ax] - hip[ax]) * s, oy - (P[f, p, 1] - floor) * s
            x1, y1 = ox + (P[f, j, ax] - hip[ax]) * s, oy - (P[f, j, 1] - floor) * s
            d.line([x0, y0, x1, y1], fill=col, width=2)
    d.text(((k % cols) * C * 2 + 3, (k // cols) * C * 2 + 2), f'{f} ({f * b.dt:.1f}s)', fill='#000')
img.save(a.out, quality=80)
print(a.take, 'frames', b.frames, 'dt', round(b.dt, 4), 'seconds', round(b.frames * b.dt, 1))
