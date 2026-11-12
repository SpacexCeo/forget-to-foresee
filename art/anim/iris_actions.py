"""Iris's action clips, keyed pose to pose on her own rig (ftfanim/keyed.py) and added to her side-car file.

    python3 art/anim/iris_actions.py                 # reads and rewrites game/public/assets/anim/iris.glb
    python3 art/anim/iris_actions.py --only cast_lance --sheet /tmp/lance.png    # a stick-figure sheet of one clip (needs Pillow)

Clips (60 keys a second, in place; each starts and ends in her idle pose):
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
RELEASE_S = 0.42
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
    return [(0.0, IDLE), (0.13, with_ease(mix(IDLE, coil, 0.86), 'out')), (0.38, with_ease(coil, 'linear')),
            (RELEASE_S, with_ease(hit, ('pow', 1.6))), (0.50, with_ease(mix(coil, hit, 1.07), 'out')), (0.72, with_ease(mix(coil, hit, 0.97), 'smooth')),
            (0.96, with_ease(back, 'smooth')), (1.25, with_ease(IDLE, 'out'))], 1.25


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
    return [(0.0, IDLE), (0.15, with_ease(mix(IDLE, rise, 0.88), 'out')), (0.38, with_ease(rise, 'linear')),
            (RELEASE_S, with_ease(hit, ('pow', 1.6))), (0.50, with_ease(mix(rise, hit, 1.06), 'out')), (0.72, with_ease(mix(rise, hit, 0.97), 'smooth')),
            (0.96, with_ease(back, 'smooth')), (1.25, with_ease(IDLE, 'out'))], 1.25


CLIPS = {'cast_lance': cast_lance, 'cast_snare': cast_snare}
EXTRAS = {'cast_lance': {'release_s': RELEASE_S, 'hand': 'R'}, 'cast_snare': {'release_s': RELEASE_S, 'hand': 'R'}}


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
    a = ap.parse_args()
    rig = Rig(a.model)
    clips = read_clips(a.src, rig)
    idle = clips['idle']
    base_local = idle['local'][0]
    ip = rig.index['pelvis']; pp = rig.parent[ip]
    base_pelvis = rig.rest_wp[pp] + qrot(rig.rest_wr[pp], idle['pelvis'][0]) if idle['pelvis'] is not None else rig.rest_wp[ip]
    chain = [rig.names[i] for _, bs in chains.chain_bones(rig) for i in bs]
    bones = chain + [n for n in rig.names if n in ('pelvis', 'spine', 'chest', 'neck', 'head') or n.split('_')[0] in ('thigh', 'shin', 'foot', 'toe', 'upperarm', 'forearm', 'hand', 'shoulder', 'thumb', 'index', 'fingers')]
    new = {}
    for name, fn in CLIPS.items():
        if a.only and name not in a.only.split(','):
            continue
        keys, secs = fn()
        local, pel = keyed.build(rig, base_local, base_pelvis, keys, secs, fps=FPS)
        local = chains.simulate(rig, local, pel, fps=FPS, loop=False)
        slip = keyed.planted_slip(rig, local, pel, FPS, keys)
        print(name, len(local), 'frames', 'planted slip max %.4f m/s' % slip)
        if a.sheet:
            sheet(rig, local, pel, a.sheet if len(CLIPS) == 1 or a.only else a.sheet.replace('.png', f'_{name}.png'), FPS,
                  times=[0, 0.13, 0.38, 0.40, RELEASE_S, 0.50, 0.72, 0.84, 0.96, 1.10] if name.startswith('cast_') else None)
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
