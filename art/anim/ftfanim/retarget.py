"""Retargets a BVH take (CMU skeleton, cgspeed naming) onto our rig: world-space rotation deltas from the take's
T-pose frame, with the limbs' rest directions aligned to the source T-pose, so every limb bone points exactly
where the actor's did; positions are scaled by the leg-length ratio (proportion-aware root motion).
"""
import numpy as np

from .quat import qinv, qmul, qnorm, qpow, qrot, swing

# target bone: (source bone, source child that defines the limb direction or None, damping parent or None, factor)
CMU_MAP = {
    'pelvis': ('Hips', None, None, 1.0),
    'spine': ('Spine', None, None, 1.0),
    'chest': ('Spine1', None, None, 1.0),
    'neck': ('Neck1', None, None, 1.0),
    'head': ('Head', None, None, 1.0),
}
for _s, _S in (('L', 'Left'), ('R', 'Right')):
    CMU_MAP.update({
        f'shoulder_{_s}': (f'{_S}Shoulder', None, 'Spine1', 0.7),
        f'upperarm_{_s}': (f'{_S}Arm', f'{_S}ForeArm', None, 1.0),
        f'forearm_{_s}': (f'{_S}ForeArm', f'{_S}Hand', None, 1.0),
        f'hand_{_s}': (f'{_S}Hand', 'parent', f'{_S}ForeArm', 0.7),
        f'thigh_{_s}': (f'{_S}UpLeg', f'{_S}Leg', None, 1.0),
        f'shin_{_s}': (f'{_S}Leg', f'{_S}Foot', None, 1.0),
        f'foot_{_s}': (f'{_S}Foot', None, None, 1.0),
    })


class Retargeted:
    """World-space result of a retarget, still at the source frame rate."""

    def __init__(self, rig, wr, mapped, hip_mid, ankles, toes, scale, dt):
        self.rig, self.wr, self.mapped = rig, wr, mapped   # wr: {bone: [F, 4]} desired world rotations
        self.hip_mid = hip_mid                             # [F, 3] midpoint of the hip joints, target scale
        self.ankles, self.toes = ankles, toes              # {'L': [F, 3], 'R': ...} source joints, target scale
        self.scale, self.dt = scale, dt


def retarget(bvh, rig, mapping=CMU_MAP, tpose_frame=0):
    F = bvh.frames
    src_leg = np.mean([np.linalg.norm(bvh.offset[bvh.index[f'{S}Leg']]) + np.linalg.norm(bvh.offset[bvh.index[f'{S}Foot']]) for S in ('Left', 'Right')])
    tgt_leg = np.mean([rig.length(f'thigh_{s}', f'shin_{s}') + rig.length(f'shin_{s}', f'foot_{s}') for s in 'LR'])
    scale = tgt_leg / src_leg
    delta = lambda name: qmul(bvh.rot(name), qinv(bvh.rot(name)[tpose_frame]))
    sdir = lambda a, b: bvh.pos(b)[tpose_frame] - bvh.pos(a)[tpose_frame]
    wr, align = {}, {}
    for bone in rig.names:               # parents first
        if bone not in mapping:
            continue
        src, child, damp_parent, factor = mapping[bone]
        i = rig.index[bone]
        if child == 'parent':
            a = align[rig.names[rig.parent[i]]]
        elif child:
            a = swing(rig.dir(bone), sdir(src, child))
        else:
            a = np.array([0, 0, 0, 1.0])
        align[bone] = a
        base = qmul(a, rig.rest_wr[i])
        d = delta(src)
        if damp_parent:
            dp = delta(damp_parent)
            d = qmul(dp, qpow(qmul(qinv(dp), d), factor))
        wr[bone] = qnorm(qmul(d, base))
    # positions in target scale; heights are re-based so a planted joint sits at the target's own rest height
    floor = lambda y: np.percentile(y, 3)
    ankles, toes = {}, {}
    for s, S in (('L', 'Left'), ('R', 'Right')):
        a = bvh.pos(f'{S}Foot') * scale; t = bvh.pos(f'{S}ToeBase') * scale
        a[:, 1] += rig.rest_wp[rig.index[f'foot_{s}'], 1] - floor(a[1:, 1])
        t[:, 1] += rig.rest_wp[rig.index[f'toe_{s}'], 1] - floor(t[1:, 1])
        ankles[s], toes[s] = a, t
    src_floor = np.mean([floor(bvh.pos(f'{S}Foot')[1:, 1]) for S in ('Left', 'Right')])
    hip_src = 0.5 * (bvh.pos('LeftUpLeg') + bvh.pos('RightUpLeg'))
    hip_mid = hip_src * scale
    tgt_ankle_y = np.mean([rig.rest_wp[rig.index[f'foot_{s}'], 1] for s in 'LR'])
    # standing with straight legs maps to the target standing with straight legs
    hip_mid[:, 1] = tgt_ankle_y + tgt_leg + scale * (hip_src[:, 1] - src_floor - src_leg)
    return Retargeted(rig, wr, list(wr), hip_mid, ankles, toes, scale, bvh.dt)


def assemble(rig, wr, F):
    """Local rotations [F, B, 4] from desired world rotations of some bones; the others keep their rest local."""
    B = len(rig.names)
    local = np.zeros((F, B, 4)); world = np.zeros((F, B, 4))
    for i, name in enumerate(rig.names):
        p = rig.parent[i]
        pr = world[:, p] if p >= 0 else np.broadcast_to(rig.base_r, (F, 4))
        if name in wr:
            world[:, i] = wr[name]; local[:, i] = qmul(qinv(pr), wr[name])
        elif name in wr.get('__local', {}):
            local[:, i] = wr['__local'][name]; world[:, i] = qmul(pr, local[:, i])
        else:
            local[:, i] = rig.rest_r[i]; world[:, i] = qmul(pr, local[:, i])
    return qnorm(local), world


def pelvis_from_hips(rig, w_pelvis, hip_mid):
    """Pelvis joint position that puts the middle of the hip joints at `hip_mid`."""
    ip = rig.index['pelvis']
    off = 0.5 * (rig.rest_wp[rig.index['thigh_L']] + rig.rest_wp[rig.index['thigh_R']]) - rig.rest_wp[ip]
    local = qrot(qinv(rig.rest_wr[ip]), off)
    return hip_mid - qrot(w_pelvis, local)


def two_bone_ik(hip, target, l1, l2, knee_hint, stretch=0.999):
    """Knee position for a leg from `hip` to `target` [F, 3], bending toward `knee_hint` (a point, e.g. the FK knee).
    Returns (knee, clamped target)."""
    d = target - hip
    dist = np.linalg.norm(d, axis=-1, keepdims=True)
    reach = (l1 + l2) * stretch
    dist_c = np.clip(dist, abs(l1 - l2) + 1e-4, reach)
    n = d / np.maximum(dist, 1e-9)
    target = hip + n * dist_c
    a = (l1 * l1 - l2 * l2 + dist_c * dist_c) / (2 * dist_c)
    h = np.sqrt(np.maximum(l1 * l1 - a * a, 0.0))
    k = knee_hint - hip
    perp = k - n * np.sum(k * n, -1, keepdims=True)
    pn = np.linalg.norm(perp, axis=-1, keepdims=True)
    perp = np.where(pn < 1e-5, np.array([0, 0, 1.0]) - n * n[..., 2:3], perp)
    perp = perp / np.maximum(np.linalg.norm(perp, axis=-1, keepdims=True), 1e-9)
    return hip + n * a + perp * h, target
