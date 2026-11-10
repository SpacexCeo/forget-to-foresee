#!/usr/bin/env python3
"""Prints a coarse time line of a raw take, to pick segments numerically: every `--step` seconds the hip height,
the hip's horizontal speed, the heights of the hands above the hips and the feet's speed (all in source units
scaled so the actor's hip height at the T-pose is 1).

    python3 art/anim/take_info.py 141_16 [--mocap art/anim/src --step 0.5]
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim.bvh import Bvh   # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('takes', nargs='+'); ap.add_argument('--mocap', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))
ap.add_argument('--step', type=float, default=0.5)
a = ap.parse_args()
for take in a.takes:
    b = Bvh(os.path.join(a.mocap, 'data', take.split('_')[0].zfill(3), take + '.bvh'))
    hip = b.pos('Hips'); floor = min(np.percentile(b.pos(f'{S}Foot')[1:, 1], 3) for S in ('Left', 'Right'))
    u = hip[0, 1] - floor
    k = max(1, int(round(a.step / b.dt)))
    sp = lambda p: np.linalg.norm(np.gradient(p[:, [0, 2]], axis=0), axis=1) / b.dt / u
    hs, lf, rf = sp(hip), sp(b.pos('LeftFoot')), sp(b.pos('RightFoot'))
    print(f'{take}: {b.frames} frames, {b.frames * b.dt:.1f} s   (frame: hipY hipV | handL handR | footV L R)')
    for f in range(1, b.frames, k):
        e = min(b.frames, f + k)
        m = lambda x: float(np.mean(x[f:e]))
        print(f'  {f:5d} {f * b.dt:5.1f}s  {m((hip[:, 1] - floor) / u):.2f} {m(hs):.2f} | {m((b.pos("LeftHand")[:, 1] - hip[:, 1]) / u):+.2f} {m((b.pos("RightHand")[:, 1] - hip[:, 1]) / u):+.2f} | {m(lf):.2f} {m(rf):.2f}')
