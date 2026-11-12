"""Keyed one-shot clips on a character's own rig, pose to pose, with the things a hand animator adds on top:
per-key easing (slow build, snap, spring settle), overlapping action (each bone down a chain runs a little late),
feet that are placed on the ground and solved with IK (no stiff legs, no sliding), and the hair chains simulated
over the result.

A clip is a list of keys `(time_s, pose)` on top of a base pose (the idle's first frame). A pose is a dict:

  'hips'            [dx, dy, dz]      the hip centre's offset from the base pose, metres (X her left, Y up, Z her front)
  '<bone>'          [(axis, deg), …]  world-axis rotations applied to the bone and everything below it, in order
                                      (pelvis, spine, chest, neck, head, shoulder_*)
  'arm_L'/'arm_R'   {'at': [x, y, z], 'elbow': [x, y, z], 'fingers': [x, y, z], 'palm': [x, y, z]}
                                      the wrist's place relative to the shoulder joint, in the chest's frame (so a
                                      turn of the chest carries the arm), solved with IK; `elbow` is the direction
                                      the elbow points, `fingers` and `palm` where the fingers and the palm face
                                      (all optional: the base pose's own values otherwise). Between keys the wrist
                                      travels on an arc about the shoulder, not on a straight line through it.
  'foot_L'/'foot_R' {'at': [dx, dy, dz], 'pitch': deg, 'yaw': deg, 'roll': deg, 'pivot': 'ball' | 'ankle'}
                                      where the foot is: the offset of its pivot point from the base pose, the heel
                                      raised by `pitch` (toes stay flat on the ground while the ball is down),
                                      turned out by `yaw`; a missing foot key keeps the foot planted where it stood
  'knee_L'/'knee_R' deg               the knee opens outward (+) from the foot's heading
  'fingers_L'/'_R'  name | (fingers, index, thumb) curl in degrees (loco.HAND_POSES)
  'ease'            how this key is approached from the previous one:
                    'smooth' (default) | 'linear' | 'in' (slow start, arrives fast) | 'out' (leaves fast, settles) |
                    'snap' (most of the way in the first third) | 'hold' (stays on the previous key, then cuts) |
                    ('spring', overshoot 0..1, cycles) a damped overshoot around the key | ('pow', k)
"""
import math

import numpy as np

from .loco import HAND_POSES, foot_heading, foot_points
from .quat import axis_angle, qinv, qmul, qnorm, qrot, swing
from .retarget import two_bone_ik

Y = np.array([0.0, 1.0, 0.0])
AX = {'x': np.array([1.0, 0, 0]), 'y': Y, 'z': np.array([0, 0, 1.0])}
# seconds each bone runs behind its key (overlapping action: the hips lead, the hands and the head arrive last)
OVERLAP = {'pelvis': 0.0, 'spine': 0.012, 'chest': 0.024, 'neck': 0.045, 'head': 0.06, 'shoulder': 0.03, 'upperarm': 0.036, 'forearm': 0.055, 'hand': 0.075}
FK_BONES = ('pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder_L', 'shoulder_R')


def ease(kind, u):
    u = min(1.0, max(0.0, u))
    if kind in (None, 'smooth'):
        return u * u * (3 - 2 * u)
    if kind == 'linear':
        return u
    if kind == 'in':
        return u ** 2.6
    if kind == 'out':
        return 1 - (1 - u) ** 2.6
    if kind == 'snap':
        return 1 - (1 - u) ** 4
    if kind == 'hold':
        return 0.0 if u < 1 else 1.0
    if isinstance(kind, (tuple, list)) and kind[0] == 'pow':
        return u ** kind[1] if kind[1] >= 1 else 1 - (1 - u) ** (1 / kind[1])
    if isinstance(kind, (tuple, list)) and kind[0] == 'spring':
        over, cycles = kind[1], kind[2]
        # reaches the key fast, swings past it by `over` and rings down to it by u = 1
        k = 5.0
        e = math.exp(-k * u)
        s = 1 - e * math.cos(2 * math.pi * cycles * u) + over * 2.2 * e * math.sin(2 * math.pi * cycles * u)
        end = 1 - math.exp(-k) * math.cos(2 * math.pi * cycles) + over * 2.2 * math.exp(-k) * math.sin(2 * math.pi * cycles)
        return s + (1 - end) * u
    raise ValueError(kind)


def _segment(keys, t):
    if t <= keys[0][0]:
        return keys[0][1], keys[0][1], 0.0
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return a, b, ease(b.get('ease'), (t - t0) / max(t1 - t0, 1e-6))
    return keys[-1][1], keys[-1][1], 0.0


def _rot(rots):
    q = np.array([0, 0, 0, 1.0])
    for ax, deg in rots or []:
        q = qmul(axis_angle(AX[ax], math.radians(deg)), q)
    return q


def _nlerp(a, b, u):
    """Blend of two rotations that may overshoot (u outside 0..1): along the shortest arc."""
    if float(np.dot(a, b)) < 0:
        b = -b
    d = qmul(b, qinv(a))
    ang = 2 * math.atan2(float(np.linalg.norm(d[:3])), float(d[3]))
    if ang < 1e-9:
        return a
    return qnorm(qmul(axis_angle(d[:3] / np.linalg.norm(d[:3]), ang * u), a))


def _vec(pose, key, n=3):
    return np.array(pose.get(key, [0.0] * n), float)


def _foot(pose, s):
    f = pose.get(f'foot_{s}', {})
    return np.array(list(f.get('at', [0, 0, 0])) + [f.get('pitch', 0.0), f.get('yaw', 0.0), f.get('roll', 0.0)], float), f.get('pivot', 'ball')


def _curl(pose, s):
    p = pose.get(f'fingers_{s}', 'relaxed')
    return np.array(HAND_POSES[p] if isinstance(p, str) else p, float)


def build(rig, base_local, base_pelvis, keys, seconds, fps=30, overlap=OVERLAP, knee_out=4.0):
    """Frames of a keyed clip: (local rotations [F, B, 4], pelvis world positions [F, 3]).
    base_local [B, 4]: the pose the clip starts from; base_pelvis [3]: the pelvis joint's world position in it."""
    F = int(round(seconds * fps)) + 1
    B = len(rig.names)
    wr_b, wp_b = rig.fk(base_local[None], np.asarray(base_pelvis, float)[None]); wr_b, wp_b = wr_b[0], wp_b[0]
    idx = rig.index
    hip_mid_b = 0.5 * (wp_b[idx['thigh_L']] + wp_b[idx['thigh_R']])
    hip_off_local = qrot(qinv(wr_b[idx['pelvis']]), hip_mid_b - wp_b[idx['pelvis']])
    pts = {s: foot_points(rig, s) for s in 'LR'}
    piv_b = {s: {k: wp_b[idx[f'foot_{s}']] + qrot(wr_b[idx[f'foot_{s}']], pts[s][k]) for k in ('ball',)} for s in 'LR'}
    l1 = {s: rig.length(f'thigh_{s}', f'shin_{s}') for s in 'LR'}; l2 = {s: rig.length(f'shin_{s}', f'foot_{s}') for s in 'LR'}
    # the arms in the base pose, in the chest's frame: wrist offset from the shoulder, elbow direction, hand directions
    arm_len, arm_b, palm_loc = {}, {}, {}
    for s, sg in (('L', 1.0), ('R', -1.0)):
        i_u, i_fa, i_h = idx[f'upperarm_{s}'], idx[f'forearm_{s}'], idx[f'hand_{s}']
        arm_len[s] = (rig.length(f'upperarm_{s}', f'forearm_{s}'), rig.length(f'forearm_{s}', f'hand_{s}'))
        # the palm's normal in the hand bone's space: at rest the arms hang and the palms face the body
        pl = qrot(qinv(rig.rest_wr[i_h]), np.array([-sg, 0, 0])); pl[1] = 0; palm_loc[s] = pl / np.linalg.norm(pl)
        mid = wp_b[i_u] + 0.5 * (wp_b[i_h] - wp_b[i_u])
        arm_b[s] = {'at': wp_b[i_h] - wp_b[i_u], 'elbow': wp_b[i_fa] - mid, 'fingers': qrot(wr_b[i_h], Y), 'palm': qrot(wr_b[i_h], palm_loc[s])}
    local = np.zeros((F, B, 4)); pel = np.zeros((F, 3))
    leg = {f'{b}_{s}' for b in ('thigh', 'shin', 'foot', 'toe') for s in 'LR'}
    for f in range(F):
        t = f / fps
        wr = np.zeros((B, 4)); wp = np.zeros((B, 3))
        # --- the upper body and the pelvis: world-axis deltas on top of the base pose, each bone a little late
        a, b, u = _segment(keys, t)
        hips = hip_mid_b + _vec(a, 'hips') * (1 - u) + _vec(b, 'hips') * u
        for i, n in enumerate(rig.names):
            p = rig.parent[i]
            pr = wr[p] if p >= 0 else rig.base_r
            rel = qmul(qinv(wr_b[p]), wr_b[i]) if p >= 0 else qmul(qinv(rig.base_r), wr_b[i])
            q = qmul(pr, rel)
            if n in FK_BONES:
                a2, b2, u2 = _segment(keys, t - overlap.get(n.split('_')[0], 0.0))
                if n in a2 or n in b2:
                    q = qmul(_nlerp(_rot(a2.get(n)), _rot(b2.get(n)), u2), q)
            wr[i] = qnorm(q)
        pelvis_pos = hips - qrot(wr[idx['pelvis']], hip_off_local)
        # --- the legs: each foot placed, the leg solved onto it
        for s, sg in (('L', 1.0), ('R', -1.0)):
            (fa, piv_a), (fb, _) = _foot(a, s), _foot(b, s)
            fk = fa * (1 - u) + fb * u
            i_f, i_t, i_th, i_sh = idx[f'foot_{s}'], idx[f'toe_{s}'], idx[f'thigh_{s}'], idx[f'shin_{s}']
            base_yaw = float(foot_heading(rig, s, wr_b[i_f]))
            yaw = base_yaw + math.radians(fk[4]) * sg
            side = np.array([math.cos(yaw), 0, -math.sin(yaw)]); fwd = np.array([math.sin(yaw), 0, math.cos(yaw)])
            wf = qmul(axis_angle(fwd, math.radians(fk[5]) * sg), qmul(axis_angle(side, math.radians(fk[3])), qmul(axis_angle(Y, yaw - base_yaw), wr_b[i_f])))
            ball = piv_b[s]['ball'] + fk[:3]
            ball[1] = max(ball[1], piv_b[s]['ball'][1])
            ankle = ball - qrot(wf, pts[s]['ball'])
            low = min(float((ankle + qrot(wf, pts[s][k]))[1]) for k in ('heel', 'ball', 'tip'))
            if low < 0:
                ankle[1] -= low
            hj = pelvis_pos + qrot(wr[idx['pelvis']], qrot(qinv(wr_b[idx['pelvis']]), wp_b[i_th] - wp_b[idx['pelvis']]))
            ko = math.radians(knee_out + (a.get(f'knee_{s}', 0.0) * (1 - u) + b.get(f'knee_{s}', 0.0) * u)) * sg
            hint_dir = np.array([math.sin(yaw + ko), 0, math.cos(yaw + ko)])
            knee, tgt = two_bone_ik(hj[None], ankle[None], l1[s], l2[s], (hj + 0.5 * (ankle - hj) + hint_dir)[None])
            knee, tgt = knee[0], tgt[0]
            bend = knee - (hj + (tgt - hj) * float(np.dot(knee - hj, tgt - hj) / max(np.dot(tgt - hj, tgt - hj), 1e-9)))
            bend = bend / np.linalg.norm(bend) if np.linalg.norm(bend) > 1e-5 else hint_dir
            for b_i, head, tail in ((i_th, hj, knee), (i_sh, knee, tgt)):
                q = qmul(qmul(wr[rig.parent[b_i]], qinv(wr_b[rig.parent[b_i]])), wr_b[b_i])
                q = qmul(swing(qrot(q, Y), tail - head), q)
                axis = qrot(q, Y)
                f_loc = qrot(qinv(rig.rest_wr[b_i]), np.array([0, 0, 1.0]))
                cur = qrot(q, f_loc); cur = cur - axis * np.dot(cur, axis); want = bend - axis * np.dot(bend, axis)
                if np.linalg.norm(cur) > 1e-6 and np.linalg.norm(want) > 1e-6:
                    cur /= np.linalg.norm(cur); want /= np.linalg.norm(want)
                    q = qmul(axis_angle(axis, math.atan2(float(np.dot(np.cross(cur, want), axis)), float(np.dot(cur, want)))), q)
                wr[b_i] = qnorm(q)
            wr[i_f] = qnorm(wf)
            # toes: flat on the ground while the ball is down, with the foot once it is in the air
            wt = qmul(wf, qmul(qinv(rig.rest_wr[i_f]), rig.rest_wr[i_t]))
            down = 1.0 - min(1.0, max(0.0, (ball[1] - piv_b[s]['ball'][1]) / 0.04))
            if fk[3] > 0 and down > 0:
                wt = qmul(axis_angle(side, -math.radians(fk[3]) * down), wt)
            wr[i_t] = qnorm(wt)
        # --- the arms: the wrist placed in the chest's frame, the arm solved onto it
        def joint(i):
            pth = []
            while i != idx['pelvis']:
                pth.append(i); i = rig.parent[i]
            pos = pelvis_pos
            for k in reversed(pth):
                pos = pos + qrot(wr[rig.parent[k]], rig.rest_t[k])
            return pos
        for s, sg in (('L', 1.0), ('R', -1.0)):
            i_u, i_fa, i_h = idx[f'upperarm_{s}'], idx[f'forearm_{s}'], idx[f'hand_{s}']
            la, lb = arm_len[s]
            a4, b4, u4 = _segment(keys, t - overlap.get('forearm', 0.0))
            a5, b5, u5 = _segment(keys, t - overlap.get('hand', 0.0))
            D = qmul(wr[idx['chest']], qinv(wr_b[idx['chest']]))
            sh = joint(i_u)
            def arm(pose, key):
                return np.array(pose.get(f'arm_{s}', {}).get(key, arm_b[s][key]), float)
            # the wrist's direction and distance from the shoulder are blended apart: an arc
            pa, pb = arm(a4, 'at'), arm(b4, 'at')
            ra, rb = np.linalg.norm(pa), np.linalg.norm(pb)
            dirn = qrot(_nlerp(np.array([0, 0, 0, 1.0]), swing(pa, pb), u4), pa / ra)
            reach = min((ra * (1 - u4) + rb * u4), (la + lb) * 0.985)
            wrist = sh + qrot(D, dirn * reach)
            eh = arm(a4, 'elbow') * (1 - u4) + arm(b4, 'elbow') * u4
            elbow, wrist = two_bone_ik(sh[None], wrist[None], la, lb, (sh + 0.5 * (wrist - sh) + qrot(D, eh / max(np.linalg.norm(eh), 1e-9)))[None])
            elbow, wrist = elbow[0], wrist[0]
            q = qmul(qmul(wr[rig.parent[i_u]], qinv(wr_b[rig.parent[i_u]])), wr_b[i_u])
            wr[i_u] = qnorm(qmul(swing(qrot(q, Y), elbow - sh), q))
            q = qmul(qmul(wr[i_u], qinv(wr_b[i_u])), wr_b[i_fa])
            wr[i_fa] = qnorm(qmul(swing(qrot(q, Y), wrist - elbow), q))
            # the hand: fingers and palm directions (chest frame), blended as rotations
            def hand_q(pose):
                fd = qrot(D, arm(pose, 'fingers')); pd = qrot(D, arm(pose, 'palm'))
                fd = fd / np.linalg.norm(fd); pd = pd - fd * np.dot(pd, fd); pd = pd / max(np.linalg.norm(pd), 1e-9)
                q1 = swing(Y, fd)
                cur = qrot(q1, palm_loc[s]); cur = cur - fd * np.dot(cur, fd); cur /= max(np.linalg.norm(cur), 1e-9)
                return qmul(axis_angle(fd, math.atan2(float(np.dot(np.cross(cur, pd), fd)), float(np.dot(cur, pd)))), q1)
            wr[i_h] = qnorm(_nlerp(hand_q(a5), hand_q(b5), u5))
        # --- fingers
        for s, sg in (('L', 1), ('R', -1)):
            a3, b3, u3 = _segment(keys, t - overlap.get('hand', 0.0) - 0.02)
            cf, ci, ct = _curl(a3, s) * (1 - u3) + _curl(b3, s) * u3
            i_h = idx[f'hand_{s}']
            for bone, axis, ang in ((f'fingers_{s}', (0, 0, -1.0), sg * cf), (f'index_{s}', (0, 0, -1.0), sg * ci), (f'thumb_{s}', (0, 1.0, 0), -sg * ct)):
                if bone in idx:
                    r = axis_angle(np.array(axis), math.radians(ang))
                    wr[idx[bone]] = qnorm(qmul(wr[i_h], qmul(qinv(rig.rest_wr[i_h]), qmul(r, rig.rest_wr[idx[bone]]))))
        # children of re-posed bones that were computed before their parent changed (prop bones, hair roots) follow now
        for i, n in enumerate(rig.names):
            p = rig.parent[i]
            if p >= 0 and n not in leg and n not in FK_BONES and not n.startswith(('fingers_', 'index_', 'thumb_', 'upperarm_', 'forearm_', 'hand_')):
                wr[i] = qnorm(qmul(wr[p], qmul(qinv(wr_b[p]), wr_b[i])))
        local[f] = rig.to_local(wr[None])[0]
        pel[f] = pelvis_pos
    return local, pel


def planted_slip(rig, local, pel, fps, keys):
    """Largest speed (m/s) of a ball of the foot over the ground between frames in which its key does not move it."""
    wr, wp = rig.fk(local, pel)
    worst = 0.0
    for s in 'LR':
        i_f = rig.index[f'foot_{s}']
        ball = wp[:, i_f] + qrot(wr[:, i_f], foot_points(rig, s)['ball'])
        for f in range(1, len(local)):
            a, b, _ = _segment(keys, f / fps); a0, b0, _ = _segment(keys, (f - 1) / fps)
            if all(np.allclose(_foot(k, s)[0][:3], 0) for k in (a, b, a0, b0)):
                worst = max(worst, float(np.hypot(*(ball[f] - ball[f - 1])[[0, 2]]) * fps))
    return worst
