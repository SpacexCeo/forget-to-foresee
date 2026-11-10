#!/usr/bin/env python3
"""Finds the best loop window in a take of a repeated action (sweeping, playing, kneading): the pair of frames whose
poses, hip positions and motion directions match best, for a loop between --min and --max seconds.

    python3 art/anim/find_loop.py 13_23 [--mocap art/anim/src --min 3 --max 7 --from 0 --to -1]
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim.bvh import Bvh   # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('takes', nargs='+'); ap.add_argument('--mocap', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))
ap.add_argument('--min', type=float, default=3.0); ap.add_argument('--max', type=float, default=7.0)
ap.add_argument('--from', dest='f0', type=int, default=30); ap.add_argument('--to', dest='f1', type=int, default=-1)
a = ap.parse_args()
for take in a.takes:
    b = Bvh(os.path.join(a.mocap, 'data', take.split('_')[0].zfill(3), take + '.bvh'))
    step = 6
    P = np.stack([b.pos(n) for n in b.names], 1)[::step]          # [F, J, 3]
    u = float(P[0, :, 1].max() - P[0, :, 1].min())
    V = np.gradient(P, axis=0)
    F = len(P) if a.f1 < 0 else min(len(P), a.f1 // step)
    lo, hi = int(a.min / (b.dt * step)), int(a.max / (b.dt * step))
    rows = []
    for i in range(a.f0 // step, F - lo):
        j = np.arange(i + lo, min(F, i + hi + 1))
        if not len(j):
            continue
        e = np.sqrt(((P[j] - P[i]) ** 2).sum(-1)).mean(-1) / u + 4 * np.sqrt(((V[j] - V[i]) ** 2).sum(-1)).mean(-1) / u
        k = int(np.argmin(e))
        rows.append((float(e[k]), i * step, int(j[k]) * step))
    rows.sort()
    print(take, b.frames, 'frames; best loops (error, f0, f1, seconds):')
    seen = []
    for e, f0, f1 in rows:
        if any(abs(f0 - s) < 120 for s in seen):
            continue
        seen.append(f0)
        print(f'   {e:.4f}  {f0:5d} {f1:5d}  {(f1 - f0) * b.dt:.1f}s')
        if len(seen) >= 3:
            break
