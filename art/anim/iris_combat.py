"""Iris's combat clips for the field outside the walls, keyed by hand on her own rig and added to her side-car file.

    python3 art/anim/iris_combat.py            # reads and rewrites game/public/assets/anim/iris.glb
    python3 art/anim/iris_combat.py --model game/public/assets/models/agent_elise.glb --in <uncompressed elise clips>
        --out <file> --legs 0.4                # Elise: her gown hides the legs, so the leg keys are scaled down
                                               # (the compressed game file is made from --out by compress-glb.sh)

Clips (30 fps, in place, one-shots that start and end in her idle pose so a combo chains cleanly):
  strike1  light: right palm strike, the body turns into it, the left hand guards        0.50 s, impact at 0.20 s
  strike2  light: the mirror, left palm                                                  0.50 s, impact at 0.20 s
  strike3  heavy finisher: both arms gather high, a crouching lunge, two-handed push     0.80 s, impact at 0.38 s
  dash     a low forward lean, arms swept back, then up again                            0.36 s
Motion style (docs/art/animation-pipeline.md): calm, weighty, precise - short anticipation, a firm impact pose held
for two frames, an unhurried settle. Each key is a set of rotations in world axes (Y up, Z her front, X her left)
applied to a bone and everything below it, on top of her idle pose; keys are eased (smoothstep).
The other clips of iris.glb are kept exactly as they are.
"""
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ftfanim.rig import Rig  # noqa: E402
from ftfanim.quat import qmul, qinv, qnorm, axis_angle  # noqa: E402
from ftfanim.gltfio import write_clips_glb  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
MODEL = os.path.join(REPO, 'game/public/assets/models/agent_iris.glb')
SIDECAR = os.path.join(REPO, 'game/public/assets/anim/iris.glb')
FPS = 30
AX = {'x': np.array([1.0, 0, 0]), 'y': np.array([0, 1.0, 0]), 'z': np.array([0, 0, 1.0])}


def read_clips(path, rig):
    """The animations of an uncompressed clip file as {name: {local [F, B, 4], pelvis [F, 3] | None, bones, fps, extras}}."""
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + n]); binoff = 20 + n + 8
    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        k = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        return np.frombuffer(b, '<f4', a['count'] * k, binoff + v.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], k).astype(float)
    names = [nd['name'] for nd in j['nodes']]
    out = {}
    for an in j['animations']:
        t = None; local = None; pelvis = None; bones = []
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]; t = acc(s['input'])[:, 0]; val = acc(s['output'])
            if local is None:
                local = np.repeat(rig.rest_r[None], len(t), 0).copy()
            bn = names[ch['target']['node']]
            if ch['target']['path'] == 'rotation':
                local[:, rig.index[bn]] = val; bones.append(bn)
            elif ch['target']['path'] == 'translation' and bn == 'pelvis':
                pelvis = val
        fps = round((len(t) - 1) / max(t[-1], 1e-6)) if len(t) > 1 else FPS
        out[an['name']] = {'name': an['name'], 'local': local, 'pelvis': pelvis, 'bones': bones, 'fps': fps, 'extras': an.get('extras')}
    return out


def smooth(u):
    u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)


def sample(keys, t):
    """keys: [(time, pose)], pose = {bone: [(axis, deg), ...], '_move': [dx, dy, dz] (pelvis offset)}. Eased blend of the two keys around t."""
    if t <= keys[0][0]:
        return keys[0][1], keys[0][1], 0.0
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return a, b, smooth((t - t0) / max(t1 - t0, 1e-6))
    return keys[-1][1], keys[-1][1], 0.0


def pose_quat(rots):
    q = np.array([0, 0, 0, 1.0])
    for ax, deg in rots:
        q = qmul(axis_angle(AX[ax], math.radians(deg)), q)
    return q


def slerp(a, b, u):
    d = float(np.dot(a, b))
    if d < 0:
        b = -b; d = -d
    if d > 0.9995:
        return qnorm(a + (b - a) * u)
    th = math.acos(d)
    return (math.sin((1 - u) * th) * a + math.sin(u * th) * b) / math.sin(th)


def build(rig, base_local, base_pelvis, keys, seconds):
    """Frames of a keyed clip on top of the base pose (local rotations [F, B, 4], pelvis local translations [F, 3])."""
    F = int(round(seconds * FPS)) + 1
    wr_base, _ = rig.fk(base_local[None])
    wr_base = wr_base[0]
    local = np.zeros((F, len(rig.names), 4)); pel = np.zeros((F, 3))
    for f in range(F):
        a, b, u = sample(keys, f / FPS)
        wr = np.zeros_like(wr_base)
        for i in range(len(rig.names)):
            p = rig.parent[i]
            rel = qmul(qinv(wr_base[p]), wr_base[i]) if p >= 0 else qmul(qinv(rig.base_r), wr_base[i])
            parent_new = wr[p] if p >= 0 else rig.base_r
            q = qmul(parent_new, rel)
            n = rig.names[i]
            if n in a or n in b:
                d = slerp(pose_quat(a.get(n, [])), pose_quat(b.get(n, [])), u)
                q = qmul(d, q)
            wr[i] = q
        local[f] = rig.to_local(wr[None])[0]
        off = np.array(a.get('_move', [0, 0, 0])) * (1 - u) + np.array(b.get('_move', [0, 0, 0])) * u
        pel[f] = base_pelvis + off
    return local, pel


IDLE = {}
GUARD_L = {'upperarm_L': [('x', -30), ('z', 10)], 'forearm_L': [('x', -85)]}
GUARD_R = {'upperarm_R': [('x', -30), ('z', -10)], 'forearm_R': [('x', -85)]}


def strike(side):
    """A light palm strike with the `side` hand ('R' or 'L'); the other hand guards."""
    s = 1 if side == 'R' else -1                 # +: the right shoulder comes forward with a turn to her left... see below
    o = 'L' if side == 'R' else 'R'
    guard = GUARD_L if side == 'R' else GUARD_R
    ab = -1 if side == 'R' else 1                # abduction sign of this arm (outward)
    wind = {**guard, 'spine': [('y', -8 * s)], 'chest': [('y', -14 * s)],
            f'upperarm_{side}': [('x', -25), ('z', 25 * ab)], f'forearm_{side}': [('x', -110)], f'hand_{side}': [('x', 25)],
            '_move': [0, -0.02, -0.02]}
    hit = {**guard, 'spine': [('y', 10 * s)], 'chest': [('y', 20 * s), ('x', 6)], 'neck': [('y', -10 * s)],
           f'upperarm_{side}': [('x', -82), ('z', 8 * ab)], f'forearm_{side}': [('x', -8)], f'hand_{side}': [('x', -55)],
           f'thigh_{o}': [('x', -12)], f'shin_{o}': [('x', 10)], '_move': [0, -0.035, 0.07]}
    return [(0.0, IDLE), (0.12, wind), (0.20, hit), (0.27, hit), (0.50, IDLE)], 0.50


def finisher():
    up = {'spine': [('x', -6)], 'chest': [('x', -10), ('y', -12)], 'neck': [('x', 8)],
          'upperarm_R': [('x', -150), ('z', -15)], 'forearm_R': [('x', -40)], 'upperarm_L': [('x', -150), ('z', 15)], 'forearm_L': [('x', -40)],
          'thigh_L': [('x', -10)], 'thigh_R': [('x', 6)], '_move': [0, -0.05, -0.04]}
    hit = {'spine': [('x', 14)], 'chest': [('x', 20), ('y', 8)], 'neck': [('x', -14)],
           'upperarm_R': [('x', -72), ('z', 6)], 'forearm_R': [('x', -6)], 'hand_R': [('x', -60)],
           'upperarm_L': [('x', -72), ('z', -6)], 'forearm_L': [('x', -6)], 'hand_L': [('x', -60)],
           'thigh_L': [('x', -38)], 'shin_L': [('x', 42)], 'foot_L': [('x', -8)], 'thigh_R': [('x', 22)], 'shin_R': [('x', 24)],
           '_move': [0, -0.13, 0.2]}
    return [(0.0, IDLE), (0.26, up), (0.38, hit), (0.48, hit), (0.80, IDLE)], 0.80


def dash():
    low = {'spine': [('x', 14)], 'chest': [('x', 22)], 'neck': [('x', -16)],
           'upperarm_R': [('x', 40), ('z', -12)], 'forearm_R': [('x', -20)], 'upperarm_L': [('x', 40), ('z', 12)], 'forearm_L': [('x', -20)],
           'thigh_L': [('x', -30)], 'shin_L': [('x', 30)], 'thigh_R': [('x', 25)], 'shin_R': [('x', 35)],
           '_move': [0, -0.1, 0.05]}
    return [(0.0, IDLE), (0.07, low), (0.24, low), (0.36, IDLE)], 0.36


def scaled(keys, legs):
    """The keys with every leg rotation (thigh, shin, foot) and the pelvis drop scaled by `legs`."""
    out = []
    for t, pose in keys:
        q = {}
        for b, v in pose.items():
            if b.split('_')[0] in ('thigh', 'shin', 'foot'):
                q[b] = [(ax, deg * legs) for ax, deg in v]
            elif b == '_move':
                q[b] = [v[0], v[1] * legs, v[2] * (0.5 + 0.5 * legs)]
            else:
                q[b] = v
        out.append((t, q))
    return out


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default=MODEL); ap.add_argument('--in', dest='src', default=SIDECAR); ap.add_argument('--out', default=SIDECAR)
    ap.add_argument('--legs', type=float, default=1.0)
    ap.add_argument('--cloth', default='', help='a cloth rig (.npz): bake the gown, ribbons and strands over the new clips and check the legs against it')
    a = ap.parse_args()
    rig = Rig(a.model)
    clips = read_clips(a.src, rig)
    idle = clips['idle']
    base_local = idle['local'][0]
    base_pelvis = idle['pelvis'][0] if idle['pelvis'] is not None else rig.rest_t[rig.index['pelvis']]
    bones = [n for n in rig.names if n in ('pelvis', 'spine', 'chest', 'neck', 'head') or n.split('_')[0] in ('thigh', 'shin', 'foot', 'upperarm', 'forearm', 'hand', 'shoulder')]
    if a.cloth:
        bones += [n for n in rig.names if n.split('_')[0] in ('skirt', 'hair', 'ribbon')]
    new = {}
    for name, (keys, secs) in {'strike1': strike('R'), 'strike2': strike('L'), 'strike3': finisher(), 'dash': dash()}.items():
        local, pel = build(rig, base_local, base_pelvis, scaled(keys, a.legs) if a.legs != 1.0 else keys, secs)
        if a.cloth:
            from ftfanim import skirt
            cfg_ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clips.json')))['characters']
            skirt.use_character(next((v for v in cfg_.values() if os.path.basename(v.get('model', '')) == os.path.basename(a.model)), None))
            cr = skirt.ClothRig(a.cloth, rig)
            lpos = np.repeat(rig.rest_t[None], len(local), 0); lpos[:, rig.index['pelvis']] = pel
            pw = rig.fk(local, None, lpos)[1][:, rig.index['pelvis']]
            local = skirt.bake(cr, local, pw, FPS, False, 0.0)
            d, who = cr.distance(local, pw); ins, thr = cr.inside(local, pw)
            print(name, 'gown min %.4f' % d.min(), who[int(d.argmin())], 'through', int(thr.sum()))
            if d.min() < 0 or thr.any():
                raise SystemExit(f'{name}: a leg cuts the gown')
        new[name] = {'name': name, 'local': local, 'pelvis': pel, 'bones': bones, 'fps': FPS,
                     'extras': {'loop': False, 'source': 'keyed by hand (art/anim/iris_combat.py)', 'impact_s': {'strike1': 0.2, 'strike2': 0.2, 'strike3': 0.38}.get(name)}}
        print(name, local.shape[0], 'frames')
    keep = [c for n, c in clips.items() if n not in new]
    b = open(a.src, 'rb').read(); root_extras = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]]).get('extras')
    write_clips_glb(a.out, rig, keep + list(new.values()), fps=FPS, extras=root_extras)
    print('wrote', a.out, [c['name'] for c in keep + list(new.values())])


if __name__ == '__main__':
    main()
