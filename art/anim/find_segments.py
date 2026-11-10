#!/usr/bin/env python3
"""Finds calm standing windows in takes (idle candidates): feet still, low motion, end pose close to the start.

    python3 art/anim/find_segments.py --mocap <dir> --model game/public/assets/models/agent_iris.glb --seconds 5 40_10 77_02
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftfanim.bvh import Bvh                 # noqa: E402
from ftfanim.retarget import retarget       # noqa: E402
from ftfanim.rig import Rig                 # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--mocap', required=True); ap.add_argument('--model', required=True)
ap.add_argument('--seconds', type=float, default=5.0); ap.add_argument('takes', nargs='+')
a = ap.parse_args()
rig = Rig(a.model)
for take in a.takes:
    rt = retarget(Bvh(os.path.join(a.mocap, 'data', take.split('_')[0].zfill(3), take + '.bvh')), rig)
    F = len(rt.hip_mid); fps = 1 / rt.dt; W = int(a.seconds * fps)
    from ftfanim.quat import gauss_filter
    foot_v = np.maximum(*[np.linalg.norm(np.gradient(gauss_filter(rt.ankles[s], 8), axis=0), axis=1) * fps for s in 'LR'])
    ang = np.mean([2 * np.arccos(np.clip(np.abs(np.sum(rt.wr[k][1:] * rt.wr[k][:-1], -1)), 0, 1)) * fps for k in rt.mapped], 0)
    rows = []
    for f0 in range(5, F - W - 1, int(fps / 4)):
        f1 = f0 + W
        if foot_v[f0:f1].max() > 0.12:
            continue
        err = np.mean([np.degrees(2 * np.arccos(np.clip(abs(np.sum(rt.wr[k][f0] * rt.wr[k][f1])), 0, 1))) for k in rt.mapped])
        hip = np.linalg.norm(rt.hip_mid[f1] - rt.hip_mid[f0])
        rows.append((err + hip * 100, f0, f1, err, hip, float(np.degrees(ang[f0:f1].mean())), float(np.degrees(ang[f0:f1].max()))))
    rows.sort()
    print(take, 'frames', F, 'calm windows', len(rows))
    for r in rows[:4]:
        print('   f0 %5d f1 %5d  loop err %.1f deg  hip %.3f m  mean %.1f deg/s  peak %.0f deg/s' % r[1:])
