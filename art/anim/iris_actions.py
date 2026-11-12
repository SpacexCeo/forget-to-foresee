"""Iris's action clips, keyed pose to pose on her own rig (ftfanim/keyed.py) and added to her side-car file.

    python3 art/anim/iris_actions.py                 # reads and rewrites game/public/assets/anim/iris.glb
    python3 art/anim/iris_actions.py --only cast_lance --sheet /tmp/lance.png    # a stick-figure sheet of one clip (needs Pillow)

Clips (60 keys a second, in place; each starts and ends in her idle pose):
  strike1/2    boxing (owner 12.11): the jab (lead left fist, impact 0.10 s) and the cross (rear right, 0.12 s), from
               the guard and back to it
  strike3      boxing: the lead hook; impact 0.15 s (strike1 the jab 0.10 s, strike2 the cross 0.12 s)
  strike_charge / strike_super   the held super strike: a boxer's load that keeps sinking for a second and is held,
               then the release from that pose: the left foot drives out 0.7 m and an uppercut comes up; impact 0.10 s
  skid         0.2 s: the heel-dig stop out of a run, blended over the start of a cast that interrupts a run
  dash         low and forward at once, one leg driving and one trailing, arms swept back; the front foot catches her
               (these four replace the first versions made by iris_combat.py, which still builds Elise's)
  cast_lance   Frost Lance: she coils back onto the ball of the right foot, the left knee up and the left palm
               sighting the line; then the left foot stomps down and the right palm drives the lance out low.
  cast_snare   Storm Snare: she rises onto the ball of the left foot, the right knee up and the right hand open to
               the sky; then the right foot comes down and the arm chops down at the mark.
Timing (anime: a slow build held as a moving pose, a release of a few frames, an overshoot, a calm settle):
  0.00 - 0.38 s  anticipation     RELEASE_S = 0.42 s  the cast leaves her hand (extras.release_s; the game fires the
  cast's effect on this frame)    0.42 - 0.72 s  overshoot and held key pose     to 1.25 s  settle into the idle
The hair chains are simulated over the result (ftfanim/chains.py), so the ponytail trails the snap and swings on.
The other clips of iris.glb are kept exactly as they are.
"""
import argparse
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ftfanim import chains, keyed  # noqa: E402
from ftfanim.gltfio import write_clips_glb  # noqa: E402
from ftfanim.quat import qrot  # noqa: E402
from ftfanim.rig import Rig  # noqa: E402
from iris_combat import read_clips  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
MODEL = os.path.join(REPO, 'game/public/assets/models/agent_iris.glb')
SIDECAR = os.path.join(REPO, 'game/public/assets/anim/iris.glb')
FPS = 60
RELEASE_S = 0.42          # Iris; `--release 0.14` gives the instant cast (Elise v3)
IDLE = {}


def mix(a, b, k):
    """Pose a moved toward (k < 1) or past (k > 1) pose b: offsets, angles and directions blended linearly."""
    out = {}
    for key in set(a) | set(b):
        va, vb = a.get(key), b.get(key)
        if key == 'ease' or isinstance(va if va is not None else vb, str):
            out[key] = vb if vb is not None else va
        elif isinstance(va if va is not None else vb, dict):
            va, vb = va or {}, vb or {}
            d = {}
            for k2 in set(va) | set(vb):
                x, y = va.get(k2), vb.get(k2)
                if isinstance(x if x is not None else y, str) or x is None or y is None:
                    d[k2] = y if y is not None else x
                else:
                    d[k2] = (np.asarray(x, float) * (1 - k) + np.asarray(y, float) * k).tolist() if not np.isscalar(x) else x * (1 - k) + y * k
            out[key] = d
        elif key.startswith('knee_'):
            out[key] = (va or 0.0) * (1 - k) + (vb or 0.0) * k
        elif key == 'hips':
            out[key] = (np.asarray(va or [0, 0, 0], float) * (1 - k) + np.asarray(vb or [0, 0, 0], float) * k).tolist()
        elif key.startswith('fingers_'):
            out[key] = vb if vb is not None else va
        else:       # rotations [(axis, deg)]: the same axes in both, angles blended (a missing list is no rotation)
            ra, rb = va or [(ax, 0.0) for ax, _ in vb], vb or [(ax, 0.0) for ax, _ in va]
            out[key] = [(ax, d0 * (1 - k) + d1 * k) for (ax, d0), (_, d1) in zip(ra, rb)]
    return out


def scaled(pose, legs):
    """The pose with its steps, foot lifts and the hips' drop scaled by `legs` (a long gown: small steps under it)."""
    out = dict(pose)
    for k, v in pose.items():
        if k.startswith('foot_'):
            out[k] = {**v, 'at': [x * legs for x in v.get('at', [0, 0, 0])], 'pitch': v.get('pitch', 0.0) * legs, 'yaw': v.get('yaw', 0.0) * legs}
        elif k == 'hips':
            out[k] = [v[0] * legs, v[1] * legs, v[2] * legs]
    return out


def with_ease(pose, e):
    p = dict(pose); p['ease'] = e
    return p


def cast_lance():
    coil = {
        'hips': [-0.03, 0.03, -0.08],
        'pelvis': [('y', -16)], 'spine': [('y', -10), ('x', -3)], 'chest': [('y', -16), ('x', -4)],
        'neck': [('y', 16)], 'head': [('y', 20), ('x', 4)],
        'foot_R': {'at': [0, 0, 0], 'pitch': 26},
        'foot_L': {'at': [-0.06, 0.30, 0.04], 'pitch': 38}, 'knee_L': -6,
        'arm_R': {'at': [-0.06, -0.24, -0.14], 'elbow': [-0.5, -0.3, -1], 'fingers': [0.2, -0.2, 1], 'palm': [0.6, 0.6, 0.2]},
        'arm_L': {'at': [-0.10, -0.04, 0.42], 'elbow': [0.7, -0.7, 0], 'fingers': [0, 1, 0.25], 'palm': [0, -0.1, 1]},
        'fingers_R': 'grip', 'fingers_L': 'open',
    }
    hit = {
        'hips': [0.0, -0.17, 0.36],
        'pelvis': [('y', 8)], 'spine': [('y', 5), ('x', 10)], 'chest': [('y', 9), ('x', 12)],
        'neck': [('y', -8)], 'head': [('y', -10), ('x', -12)],
        'foot_L': {'at': [0.02, 0, 0.62], 'yaw': 5},
        'foot_R': {'at': [0, 0, -0.20], 'pitch': 42, 'yaw': 10}, 'knee_R': 4,
        'arm_R': {'at': [0.09, 0.04, 0.46], 'elbow': [-0.6, -0.5, 0], 'fingers': [0, -0.22, 1], 'palm': [0.25, -1, -0.2]},
        'arm_L': {'at': [0.16, -0.16, -0.34], 'elbow': [0.6, 0.3, -0.5], 'fingers': [0.3, -0.5, -1], 'palm': [-1, 0, 0]},
        'fingers_R': 'flat', 'fingers_L': 'loose_fist',
    }
    back = {
        'hips': [0.0, -0.05, 0.14],
        'spine': [('y', 3), ('x', 3)], 'chest': [('y', 5), ('x', 4)],
        'foot_L': {'at': [0.0, 0.07, 0.26], 'pitch': 10}, 'foot_R': {'at': [0, 0, 0], 'pitch': 8},
        'arm_R': {'at': [0.02, -0.34, 0.20], 'elbow': [-0.6, -0.2, -0.5], 'fingers': [0, -0.8, 0.6], 'palm': [0.6, -0.4, -0.6]},
        'arm_L': {'at': [0.10, -0.40, -0.10], 'elbow': [0.6, 0, -0.6], 'fingers': [0.1, -1, -0.2], 'palm': [-1, 0, 0]},
    }
    R = RELEASE_S; k = 1.0 if R > 0.3 else 0.72        # a short anticipation travels less
    return [(0.0, IDLE), (R * 0.31, with_ease(mix(IDLE, coil, 0.86 * k), 'out')), (R - 0.04, with_ease(mix(IDLE, coil, k), 'linear')),
            (R, with_ease(hit, ('pow', 1.6))), (R + 0.08, with_ease(mix(coil, hit, 1.07), 'out')), (R + 0.30, with_ease(mix(coil, hit, 0.97), 'smooth')),
            (R + 0.54, with_ease(back, 'smooth')), (R + 0.83, with_ease(IDLE, 'out'))], R + 0.83


def cast_snare():
    rise = {
        'hips': [0.03, 0.04, -0.03],
        'pelvis': [('y', -6)], 'spine': [('x', -6), ('y', -4)], 'chest': [('x', -9), ('y', -8)],
        'neck': [('x', -4), ('y', 8)], 'head': [('x', -8), ('y', 8)],
        'foot_L': {'at': [0, 0, 0], 'pitch': 30},
        'foot_R': {'at': [0.07, 0.34, 0.10], 'pitch': 42}, 'knee_R': -8,
        'arm_R': {'at': [0.03, 0.46, -0.02], 'elbow': [-1, 0, -0.4], 'fingers': [0, 1, -0.1], 'palm': [0.2, 0, 1]},
        'arm_L': {'at': [0.34, -0.16, 0.06], 'elbow': [0.3, -0.5, -0.8], 'fingers': [1, -0.5, 0.1], 'palm': [0, -1, 0]},
        'fingers_R': 'open', 'fingers_L': 'open',
    }
    hit = {
        'hips': [-0.03, -0.17, 0.22],
        'pelvis': [('y', 8)], 'spine': [('x', 12), ('y', 6)], 'chest': [('x', 16), ('y', 12)],
        'neck': [('x', -8), ('y', -8)], 'head': [('x', -12), ('y', -10)],
        'foot_R': {'at': [-0.10, 0, 0.52], 'yaw': 8},
        'foot_L': {'at': [0, 0, -0.18], 'pitch': 36, 'yaw': 12}, 'knee_L': 4,
        'arm_R': {'at': [0.10, -0.03, 0.46], 'elbow': [-0.7, -0.3, 0], 'fingers': [0, -0.4, 1], 'palm': [0.2, -1, -0.4]},
        'arm_L': {'at': [0.24, 0.02, -0.33], 'elbow': [0.7, -0.3, -0.3], 'fingers': [0.5, 0.1, -1], 'palm': [0, -1, 0]},
        'fingers_R': (62, 4, 24), 'fingers_L': 'open',
    }
    back = {
        'hips': [-0.01, -0.05, 0.09],
        'spine': [('x', 3)], 'chest': [('x', 4), ('y', 3)],
        'foot_R': {'at': [-0.04, 0.07, 0.22], 'pitch': 10}, 'foot_L': {'at': [0, 0, 0], 'pitch': 8},
        'arm_R': {'at': [0.03, -0.36, 0.16], 'elbow': [-0.6, -0.2, -0.5], 'fingers': [0, -0.9, 0.4], 'palm': [0.6, -0.3, -0.6]},
        'arm_L': {'at': [0.12, -0.40, -0.08], 'elbow': [0.6, 0, -0.6], 'fingers': [0.1, -1, -0.2], 'palm': [-1, 0, 0]},
    }
    R = RELEASE_S; k = 1.0 if R > 0.3 else 0.72
    return [(0.0, IDLE), (R * 0.36, with_ease(mix(IDLE, rise, 0.88 * k), 'out')), (R - 0.04, with_ease(mix(IDLE, rise, k), 'linear')),
            (R, with_ease(hit, ('pow', 1.6))), (R + 0.08, with_ease(mix(rise, hit, 1.06), 'out')), (R + 0.30, with_ease(mix(rise, hit, 0.97), 'smooth')),
            (R + 0.54, with_ease(back, 'smooth')), (R + 0.83, with_ease(IDLE, 'out'))], R + 0.83


def mirror(pose):
    """The pose with left and right swapped."""
    out = {}
    for key, v in pose.items():
        k2 = key[:-2] + ('_R' if key.endswith('_L') else '_L') if key.endswith(('_L', '_R')) else key
        if key == 'hips':
            v = [-v[0], v[1], v[2]]
        elif key.startswith('arm_'):
            v = {k: [-x[0], x[1], x[2]] for k, x in v.items()}
        elif key.startswith('foot_'):
            v = {k: ([-x[0], x[1], x[2]] if k == 'at' else x) for k, x in v.items()}
        elif isinstance(v, list) and v and isinstance(v[0], tuple):
            v = [(ax, -d if ax in 'yz' else d) for ax, d in v]
        out[k2] = v
    return out


FIST = (88, 86, 44)
# The boxer's guard (orthodox: left side forward): chin tucked, fists at the jaw, elbows in, rear heel raised.
GUARD = {
    'hips': [0.0, -0.05, 0.02],
    'pelvis': [('y', -12)], 'spine': [('y', -5)], 'chest': [('y', -8), ('x', 6)],
    'neck': [('y', 10)], 'head': [('y', 12), ('x', 4)],
    'foot_L': {'at': [0.01, 0, 0.18]},
    'foot_R': {'at': [-0.03, 0, -0.12], 'pitch': 14, 'yaw': 26},
    'arm_L': {'at': [-0.10, 0.06, 0.24], 'elbow': [0.3, -1, 0], 'fingers': [-0.1, 1, 0.25], 'palm': [-1, 0, 0.1]},
    'arm_R': {'at': [0.08, 0.07, 0.14], 'elbow': [-0.3, -1, -0.1], 'fingers': [0.1, 1, 0.2], 'palm': [1, 0, 0.1]},
    'fingers_L': FIST, 'fingers_R': FIST,
}


def jab():
    """Boxing, 1: the jab. From the guard the lead (left) fist goes straight out with a short step of the lead foot,
    the lead shoulder behind it, the rear fist stays at the jaw; it snaps back to the guard. Impact at 0.10 s."""
    hit = mix(GUARD, {
        'hips': [0.0, -0.06, 0.09],
        'pelvis': [('y', -16)], 'spine': [('y', -6)], 'chest': [('y', -12), ('x', 7)],
        'neck': [('y', 14)], 'head': [('y', 16), ('x', 4)],
        'foot_L': {'at': [0.01, 0, 0.30]},
        'arm_L': {'at': [-0.07, 0.04, 0.47], 'elbow': [0.4, -0.8, 0], 'fingers': [0, 0, 1], 'palm': [0, -1, 0]},
    }, 1.0)
    return [(0.0, IDLE), (0.05, with_ease(mix(IDLE, GUARD, 0.9), 'out')), (0.10, with_ease(hit, ('pow', 1.5))), (0.15, with_ease(mix(GUARD, hit, 1.05), 'out')),
            (0.26, with_ease(GUARD, 'smooth')), (0.40, with_ease(GUARD, 'linear')), (0.60, with_ease(IDLE, 'smooth'))], 0.60


def cross():
    """Boxing, 2: the cross. The rear (right) fist goes straight through as the rear foot pivots on its ball and the
    hips and shoulders turn into it; the lead fist comes back to the chin. Impact at 0.12 s."""
    hit = mix(GUARD, {
        'hips': [0.02, -0.08, 0.14],
        'pelvis': [('y', 14)], 'spine': [('y', 6)], 'chest': [('y', 14), ('x', 8)],
        'neck': [('y', -14)], 'head': [('y', -16), ('x', 4)],
        'foot_L': {'at': [0.01, 0, 0.26]},
        'foot_R': {'at': [-0.02, 0, -0.06], 'pitch': 44, 'yaw': -4},
        'arm_R': {'at': [0.10, 0.03, 0.47], 'elbow': [-0.4, -0.8, 0], 'fingers': [0, 0, 1], 'palm': [0, -1, 0]},
        'arm_L': {'at': [-0.10, 0.08, 0.13], 'elbow': [0.3, -1, -0.1], 'fingers': [-0.1, 1, 0.2], 'palm': [-1, 0, 0.1]},
    }, 1.0)
    return [(0.0, IDLE), (0.06, with_ease(mix(IDLE, GUARD, 0.95), 'out')), (0.12, with_ease(hit, ('pow', 1.5))), (0.18, with_ease(mix(GUARD, hit, 1.05), 'out')),
            (0.30, with_ease(GUARD, 'smooth')), (0.42, with_ease(GUARD, 'linear')), (0.62, with_ease(IDLE, 'smooth'))], 0.62


def hook():
    """Boxing, 3: the lead hook. A short load to her left, then the lead foot, hips and shoulders whip to the right
    and the left arm, bent square and level, comes round with them. Impact at 0.15 s; back to the guard, then down."""
    load = mix(GUARD, {
        'hips': [0.02, -0.07, 0.03],
        'pelvis': [('y', 2)], 'spine': [('y', 2)], 'chest': [('y', 4), ('x', 6)], 'neck': [('y', -4)], 'head': [('y', -4), ('x', 4)],
        'arm_L': {'at': [0.03, 0.02, 0.15], 'elbow': [1, -0.2, -0.4], 'fingers': [-0.6, 0.3, 0.7], 'palm': [-0.3, 0, -1]},
    }, 1.0)
    hit = mix(GUARD, {
        'hips': [-0.02, -0.08, 0.07],
        'pelvis': [('y', -26)], 'spine': [('y', -9)], 'chest': [('y', -15), ('x', 6)],
        'neck': [('y', 22)], 'head': [('y', 24), ('x', 4)],
        'foot_L': {'at': [0.01, 0, 0.20], 'pitch': 24, 'yaw': -26},
        'foot_R': {'at': [-0.03, 0, -0.12], 'pitch': 6, 'yaw': 26},
        'arm_L': {'at': [-0.21, 0.04, 0.24], 'elbow': [1, 0.05, 0.1], 'fingers': [-1, 0, 0.15], 'palm': [0, 0, -1]},
    }, 1.0)
    return [(0.0, IDLE), (0.05, with_ease(mix(IDLE, GUARD, 0.85), 'out')), (0.10, with_ease(load, 'out')), (0.15, with_ease(hit, ('pow', 1.6))),
            (0.22, with_ease(mix(load, hit, 1.07), 'out')), (0.36, with_ease(mix(GUARD, hit, 0.5), 'smooth')), (0.52, with_ease(GUARD, 'smooth')), (0.84, with_ease(IDLE, 'smooth'))], 0.84


def dash():
    """The dash (the game carries her 4.5 m in 0.2 s): she drops low and forward at once, one leg driving, the other
    trailing, both arms swept back; then the front foot catches her and she rises."""
    low = {
        'hips': [0.0, -0.24, 0.10],
        'pelvis': [('x', 16)], 'spine': [('x', 12)], 'chest': [('x', 14), ('y', -6)],
        'neck': [('x', -16)], 'head': [('x', -20)],
        'foot_L': {'at': [0.02, 0.05, 0.40], 'pitch': -8}, 'knee_L': 2,
        'foot_R': {'at': [0, 0.30, -0.52], 'pitch': 62},
        'arm_R': {'at': [-0.12, -0.27, -0.36], 'elbow': [-0.6, 0.3, -0.6], 'fingers': [0, -0.55, -1], 'palm': [1, 0, 0]},
        'arm_L': {'at': [0.14, -0.24, -0.38], 'elbow': [0.6, 0.3, -0.6], 'fingers': [0, -0.5, -1], 'palm': [-1, 0, 0]},
        'fingers_R': 'flat', 'fingers_L': 'flat',
    }
    glide = mix(IDLE, low, 1.05); glide['foot_R'] = {'at': [0, 0.34, -0.60], 'pitch': 68}
    land = {
        'hips': [0.0, -0.14, 0.16],
        'pelvis': [('x', 4)], 'spine': [('x', 6)], 'chest': [('x', 8)], 'head': [('x', -8)],
        'foot_L': {'at': [0.02, 0, 0.36]}, 'foot_R': {'at': [0, 0.02, -0.20], 'pitch': 34},
        'arm_R': {'at': [-0.06, -0.30, 0.10], 'elbow': [-0.7, 0, -0.6], 'fingers': [0, -0.7, 0.7], 'palm': [1, 0, 0]},
        'arm_L': {'at': [0.14, -0.26, -0.16], 'elbow': [0.7, 0, -0.6], 'fingers': [0, -0.9, -0.3], 'palm': [-1, 0, 0]},
    }
    step = {'hips': [0.0, -0.04, 0.08], 'foot_L': {'at': [0.0, 0.05, 0.16], 'pitch': 8}, 'foot_R': {'at': [0, 0, 0], 'pitch': 6}}
    return [(0.0, IDLE), (0.06, with_ease(low, 'out')), (0.20, with_ease(glide, 'linear')), (0.28, with_ease(land, 'out')),
            (0.40, with_ease(step, 'smooth')), (0.52, with_ease(IDLE, 'out'))], 0.52


# The boxer's load for the big punch: sunk on the rear leg, the body coiled to the right and bent, the rear fist low
# by the hip, the lead fist still at the chin, eyes on the target.
CHARGE = mix(GUARD, {
    'hips': [-0.02, -0.19, -0.07],
    'pelvis': [('y', -20)], 'spine': [('y', -10), ('x', 6)], 'chest': [('y', -14), ('x', 12)],
    'neck': [('y', 18), ('x', -4)], 'head': [('y', 22), ('x', -8)],
    'foot_R': {'at': [-0.03, 0, -0.13], 'yaw': 28, 'pitch': 8}, 'knee_R': 10,
    'foot_L': {'at': [0.02, 0, 0.20], 'pitch': 16},
    'arm_R': {'at': [0.04, -0.33, 0.02], 'elbow': [-0.5, 0.1, -1], 'fingers': [0, 0.25, 1], 'palm': [1, 0, 0]},
}, 1.0)


def _deep():
    deep = dict(CHARGE); deep['hips'] = [-0.025, -0.22, -0.09]; deep['chest'] = [('y', -17), ('x', 14)]
    return deep


def strike_charge():
    """The held wind-up of the super strike: a boxer loading the uppercut; the pose keeps sinking for a second and is
    then held by the game."""
    return [(0.0, IDLE), (0.20, with_ease(mix(IDLE, CHARGE, 0.92), 'out')), (1.0, with_ease(_deep(), 'linear'))], 1.0


def strike_super():
    """The release of the super strike, from the held pose: an uppercut. The lead foot drives out, the legs and hips
    come up under the rear fist, which rises through the target; impact at 0.10 s, a long follow-through, the guard,
    then down."""
    deep = _deep()
    hit = mix(GUARD, {
        'hips': [0.02, 0.0, 0.44],
        'pelvis': [('y', 16)], 'spine': [('y', 8), ('x', -3)], 'chest': [('y', 16), ('x', -7)],
        'neck': [('y', -14)], 'head': [('y', -18), ('x', 8)],
        'foot_L': {'at': [0.04, 0, 0.72], 'yaw': 6},
        'foot_R': {'at': [0, 0, -0.08], 'pitch': 50, 'yaw': 10}, 'knee_R': 4,
        'arm_R': {'at': [0.10, 0.21, 0.35], 'elbow': [-0.2, -1, 0.2], 'fingers': [0, 1, 0.15], 'palm': [0, 0, -1]},
        'arm_L': {'at': [-0.07, 0.04, 0.11], 'elbow': [0.4, -1, -0.2], 'fingers': [-0.1, 1, 0.2], 'palm': [-1, 0, 0.1]},
    }, 1.0)
    back = mix(GUARD, {'hips': [0.0, -0.06, 0.16], 'foot_L': {'at': [0.0, 0.0, 0.34]}, 'foot_R': {'at': [0, 0, 0.02], 'pitch': 14, 'yaw': 20}}, 1.0)
    return [(0.0, deep), (0.10, with_ease(hit, ('pow', 1.7))), (0.19, with_ease(mix(deep, hit, 1.06), 'out')), (0.42, with_ease(mix(deep, hit, 0.95), 'smooth')),
            (0.68, with_ease(back, 'smooth')), (1.0, with_ease(IDLE, 'smooth'))], 1.0


def skid():
    """The stop out of a run when a cast interrupts it (0.2 s, blended over the first moments of the cast): the left
    heel digs in ahead, the hips sit back and low, the body leans against the motion, the arms open for balance.
    It starts in the pose (the game fades it in from the run) and eases toward the stance."""
    dig = {
        'hips': [0.0, -0.13, -0.10],
        'pelvis': [('x', -6)], 'spine': [('x', -7)], 'chest': [('x', -6), ('y', -6)], 'neck': [('x', 6)], 'head': [('x', 8)],
        'foot_L': {'at': [0.02, 0, 0.36], 'pitch': -16, 'pivot': 'ball'}, 'foot_R': {'at': [-0.02, 0, -0.14], 'yaw': 16}, 'knee_R': 6,
        'arm_R': {'at': [-0.20, -0.26, 0.18], 'elbow': [-1, -0.2, -0.3], 'fingers': [-0.3, -0.8, 0.5], 'palm': [0, -1, 0]},
        'arm_L': {'at': [0.22, -0.22, 0.10], 'elbow': [1, -0.2, -0.4], 'fingers': [0.3, -0.8, 0.5], 'palm': [0, -1, 0]},
        'fingers_R': 'open', 'fingers_L': 'open',
    }
    return [(0.0, dig), (0.07, with_ease(mix(IDLE, dig, 1.08), 'out')), (0.20, with_ease(mix(IDLE, dig, 0.6), 'smooth'))], 0.20


CLIPS = {'skid': skid, 'strike_charge': strike_charge, 'strike_super': strike_super, 'cast_lance': cast_lance, 'cast_snare': cast_snare, 'strike1': jab, 'strike2': cross, 'strike3': hook, 'dash': dash}
# step_s / step_foot: the moment a foot comes down hard (the game sends `ftf:foot` then; the impact goes out as `ftf:iris-action`)
EXTRAS = {'cast_lance': {'release_s': RELEASE_S, 'hand': 'R', 'step_s': RELEASE_S, 'step_foot': 'L'}, 'cast_snare': {'release_s': RELEASE_S, 'hand': 'R', 'step_s': RELEASE_S, 'step_foot': 'R'},
          'strike1': {'impact_s': 0.10, 'step_s': 0.10, 'step_foot': 'L'}, 'strike2': {'impact_s': 0.12, 'step_s': 0.12, 'step_foot': 'R'},
          'strike3': {'impact_s': 0.15, 'step_s': 0.15, 'step_foot': 'L'}, 'dash': {'step_s': 0.28, 'step_foot': 'L'},
          # hold: the game keeps the last frame until the release clip (or a cancel); from: the pose the clip starts in
          'skid': {'step_s': 0.0, 'step_foot': 'L'},
          'strike_charge': {'hold': True, 'full_s': 1.0}, 'strike_super': {'impact_s': 0.10, 'step_s': 0.10, 'step_foot': 'L', 'from': 'strike_charge'}}


def sheet(rig, local, pel, path, fps, times=None, cols=5):
    """A stick-figure contact sheet (front and side) of a clip: for posing without a renderer."""
    from PIL import Image, ImageDraw
    wr, wp = rig.fk(local, pel)
    n = len(local)
    frames = [min(n - 1, int(round(t * fps))) for t in times] if times else list(np.linspace(0, n - 1, cols * 2).astype(int))
    W, H = 200, 300
    rows = (len(frames) + cols - 1) // cols
    im = Image.new('RGB', (cols * W * 2, rows * H), 'white'); dr = ImageDraw.Draw(im)
    col = lambda nme: (200, 40, 40) if nme.endswith('_R') else (40, 80, 200) if nme.endswith('_L') else (30, 30, 30)
    for k, f in enumerate(frames):
        ox, oy = (k % cols) * W * 2, (k // cols) * H
        for v, (ax, sgn) in enumerate(((0, 1), (2, 1))):      # front view (x), side view (z)
            cx = ox + v * W + W // 2
            dr.line([(ox + v * W, oy + H - 20), (ox + v * W + W, oy + H - 20)], fill=(180, 180, 180))
            for i, nme in enumerate(rig.names):
                p = rig.parent[i]
                if p < 0 or rig.parent[p] < 0 or nme.split('_')[0] in ('lid', 'brow', 'eye', 'jaw', 'prop'):
                    continue
                a, b = wp[f, p], wp[f, i]
                dr.line([(cx + sgn * a[ax] * 140, oy + H - 20 - a[1] * 140), (cx + sgn * b[ax] * 140, oy + H - 20 - b[1] * 140)], fill=col(nme), width=3)
            for s in 'LR':      # the foot down to the toe tip, and the hand's fingers
                i = rig.index[f'toe_{s}']; a = wp[f, i]; b = a + qrot(wr[f, i], np.array([0, 0.08, 0]))
                dr.line([(cx + sgn * a[ax] * 140, oy + H - 20 - a[1] * 140), (cx + sgn * b[ax] * 140, oy + H - 20 - b[1] * 140)], fill=col('x_' + s), width=3)
                i = rig.index[f'hand_{s}']; a = wp[f, i]; b = a + qrot(wr[f, i], np.array([0, 0.1, 0]))
                dr.line([(cx + sgn * a[ax] * 140, oy + H - 20 - a[1] * 140), (cx + sgn * b[ax] * 140, oy + H - 20 - b[1] * 140)], fill=col('x_' + s), width=2)
            hd = wp[f, rig.index['head']]
            dr.ellipse([cx + sgn * hd[ax] * 140 - 12, oy + H - 20 - (hd[1] + 0.1) * 140 - 12, cx + sgn * hd[ax] * 140 + 12, oy + H - 20 - (hd[1] + 0.1) * 140 + 12], outline=(30, 30, 30), width=2)
        dr.text((ox + 4, oy + 4), '%.2fs' % (f / fps), fill=(0, 0, 0))
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default=MODEL); ap.add_argument('--in', dest='src', default=SIDECAR); ap.add_argument('--out', default=SIDECAR)
    ap.add_argument('--only', default=''); ap.add_argument('--sheet', default='')
    ap.add_argument('--release', type=float, default=RELEASE_S, help='the casts\' release time, s (0.14: an instant cast)')
    ap.add_argument('--legs', type=float, default=1.0, help='scale of the steps and of the hips\' drop (Elise: her gown hides the legs and must not be cut)')
    ap.add_argument('--cloth', default='', help='a cloth rig (.npz): bake the gown, ribbons and strands over the new clips and check the legs against it')
    a = ap.parse_args()
    cfg_ = json.load(open(os.path.join(HERE, 'clips.json')))['characters']      # the character's own chain params (a firm bun)
    chains.use_character(next((v for v in cfg_.values() if os.path.basename(v.get('model', '')) == os.path.basename(a.model)), None))
    globals()['RELEASE_S'] = a.release
    for k_ in ('cast_lance', 'cast_snare'): EXTRAS[k_]['release_s'] = EXTRAS[k_]['step_s'] = a.release
    rig = Rig(a.model)
    clips = read_clips(a.src, rig)
    idle = clips['idle']
    base_local = idle['local'][0]
    ip = rig.index['pelvis']; pp = rig.parent[ip]
    base_pelvis = rig.rest_wp[pp] + qrot(rig.rest_wr[pp], idle['pelvis'][0]) if idle['pelvis'] is not None else rig.rest_wp[ip]
    chain = [rig.names[i] for _, bs in chains.chain_bones(rig) for i in bs]
    bones = chain + [n for n in rig.names if n not in chain and (n in ('pelvis', 'spine', 'chest', 'neck', 'head') or n.split('_')[0] in ('thigh', 'shin', 'foot', 'toe', 'upperarm', 'forearm', 'hand', 'shoulder', 'thumb', 'index', 'fingers'))]
    new = {}
    for name, fn in CLIPS.items():
        if a.only and name not in a.only.split(','):
            continue
        keys, secs = fn()
        if a.legs != 1.0:
            keys = [(t, scaled(pose, a.legs)) for t, pose in keys]
        local, pel = keyed.build(rig, base_local, base_pelvis, keys, secs, fps=FPS)
        if a.cloth:
            from ftfanim import skirt
            cr = skirt.ClothRig(a.cloth, rig)
            local = skirt.bake(cr, local, pel, FPS, False, 0.0)
            d, who = cr.distance(local, pel); ins, thr = cr.inside(local, pel)
            print(name, 'gown min %.4f' % d.min(), who[int(d.argmin())], 'through', int(thr.sum()))
            if d.min() < 0 or thr.any():
                raise SystemExit(f'{name}: a leg cuts the gown')
        else:
            local = chains.simulate(rig, local, pel, fps=FPS, loop=False)
            print(name, 'chain lag max (deg):', {k: round(v, 1) for k, v in chains.LAG.items()})
        slip = keyed.planted_slip(rig, local, pel, FPS, keys)
        print(name, len(local), 'frames', 'planted slip max %.4f m/s' % slip)
        if a.sheet:
            sheet(rig, local, pel, a.sheet.replace('.png', f'_{name}.png'), FPS,
                  times=[0, RELEASE_S * 0.31, RELEASE_S - 0.04, RELEASE_S - 0.02, RELEASE_S, RELEASE_S + 0.08, RELEASE_S + 0.30, RELEASE_S + 0.42, RELEASE_S + 0.54, RELEASE_S + 0.68] if name.startswith('cast_') else {'dash': [0, 0.03, 0.06, 0.13, 0.20, 0.24, 0.28, 0.34, 0.40, 0.52], 'strike3': [0, 0.09, 0.17, 0.20, 0.22, 0.30, 0.46, 0.56, 0.66, 0.88]}.get(name, [0, 0.04, 0.07, 0.10, 0.12, 0.18, 0.30, 0.40, 0.50, 0.56]))
        new[name] = {'name': name, 'local': local, 'pelvis': rig.pelvis_local(pel), 'bones': bones, 'fps': FPS,
                     'extras': {'loop': False, 'source': 'keyed by hand (art/anim/iris_actions.py)', **EXTRAS.get(name, {})}}
    if a.sheet:
        return
    keep = [c for n, c in clips.items() if n not in new]
    b = open(a.src, 'rb').read(); root_extras = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]]).get('extras')
    write_clips_glb(a.out, rig, keep + list(new.values()), fps=30, extras=root_extras)
    print('wrote', a.out, [c['name'] for c in keep + list(new.values())])


if __name__ == '__main__':
    main()
