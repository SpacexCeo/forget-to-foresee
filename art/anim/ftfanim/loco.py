"""Locomotion cycles from a retargeted take: pick one stride, turn it to face +Z, close the loop, time-warp it to the
game's speed, plant the feet (no sliding against the ground moving at exactly that speed) and solve the legs.

The clips are in place (the game moves the character): a planted foot travels backwards at the clip's speed.
"""
import numpy as np

from .quat import (continuous, gauss_filter, qfilter, qinv, qmul, qnorm, qpow, qrot, qslerp, smoothstep, swing, yaw_quat, axis_angle)
from .retarget import assemble, pelvis_from_hips, two_bone_ik

Y = np.array([0.0, 1.0, 0.0])


def stride_events(rt):
    """Frames where the left foot is furthest ahead of the right along the direction of travel (one per stride)."""
    hip = gauss_filter(rt.hip_mid, 12)
    vel = np.gradient(hip, axis=0); vel[:, 1] = 0
    d = vel / np.maximum(np.linalg.norm(vel, axis=-1, keepdims=True), 1e-9)
    sep = gauss_filter(np.sum((rt.ankles['L'] - rt.ankles['R']) * d, -1), 4)
    return [i for i in range(2, len(sep) - 2) if sep[i] > sep[i - 1] and sep[i] >= sep[i + 1] and sep[i] > 0.5 * sep.max()], sep


def take_stats(rt):
    """Speed, stride time and length of each stride in a take (target scale)."""
    ev, _ = stride_events(rt)
    out = []
    for a, b in zip(ev[:-1], ev[1:]):
        if a < 2:
            continue
        d = rt.hip_mid[b] - rt.hip_mid[a]; d[1] = 0
        L = float(np.linalg.norm(d)); T = (b - a) * rt.dt
        # straightness: heading change of the pelvis over the stride
        f = lambda i: qrot(rt.wr['pelvis'][i], np.array([0, 0, 1.0]))
        turn = float(np.degrees(np.arccos(np.clip(np.dot(f(a), f(b)), -1, 1))))
        # loop error: mean rotation difference of the mapped bones between the two ends
        err = float(np.mean([np.degrees(2 * np.arccos(np.clip(abs(np.sum(rt.wr[k][a] * rt.wr[k][b])), 0, 1))) for k in rt.mapped]))
        out.append({'f0': a, 'f1': b, 'T': round(T, 3), 'L': round(L, 3), 'v': round(L / T, 3), 'turn': round(turn, 1), 'err': round(err, 1)})
    return out


def _resample_pos(x, n):
    """Periodic resample of [F+1, ...] (last sample = first of the next cycle) to n samples."""
    F = len(x) - 1
    u = np.arange(n) * F / n
    i = np.floor(u).astype(int); t = (u - i).reshape((-1,) + (1,) * (x.ndim - 1))
    return x[i] * (1 - t) + x[i + 1] * t


def _resample_rot(q, n):
    F = len(q) - 1
    u = np.arange(n) * F / n
    i = np.floor(u).astype(int)
    return qslerp(q[i], q[i + 1], u - i)


def _circ_intervals(mask):
    """Contiguous True runs of a circular boolean array as (start, length)."""
    n = len(mask)
    if mask.all():
        return [(0, n)]
    out = []
    start = next(i for i in range(n) if mask[i] and not mask[i - 1]) if mask.any() else None
    if start is None:
        return out
    i = start
    while True:
        if mask[i % n] and not mask[(i - 1) % n]:
            j = i
            while mask[j % n]:
                j += 1
            out.append((i % n, j - i)); i = j
        else:
            i += 1
        if i - start >= n:
            break
    return out


DEFAULT_STYLE = {
    'track': None,          # lateral distance of the planted ankle from the midline (m); None keeps the take's
    'arm_swing': 1.0,       # scale of the arms' motion about their mean pose
    'arm_out': 0.0,         # degrees the upper arms are held away from the body (clearance for costumes)
    'bounce': 1.0,          # scale of the pelvis' vertical travel
    'sway': 1.0,            # scale of the pelvis' lateral travel
    'pelvis_rot': 1.0,      # scale of the pelvis' rotation about its mean
    'chest_rot': 1.0,       # scale of the chest's counter-rotation about its mean
    'head_level': 0.5,      # 0 = the take's head motion, 1 = head held to its mean orientation
    'lean': 0.0,            # extra forward lean of the spine and chest, degrees
    'posture': {'head': 0.0, 'neck': 0.0, 'chest': 0.35, 'spine': 0.5},   # how much of the take's mean posture is kept (0 = our rest posture)
    'head_pitch': 0.0,      # degrees the head looks down (+) from the rest posture
    'hip_drop': 0.0,        # lowers (+) the hips, m
    'foot_out': None,       # toe-out angle of the planted foot, degrees; None keeps the take's
}


def recenter(rig, wr, st):
    """Moves the mean orientation of the spine, neck and head toward the rig's own rest posture (the take's T-pose is
    only a guess, so its mean posture carries a constant error), keeping the motion about the mean."""
    for b, keep in st['posture'].items():
        if b not in wr:
            continue
        q = continuous(wr[b]); mean = qnorm(q.mean(0))
        want = rig.rest_wr[rig.index[b]]
        if b == 'head' and st.get('head_pitch'):
            want = qmul(axis_angle(np.array([1.0, 0, 0]), np.radians(st['head_pitch'])), want)
        wr[b] = qnorm(qmul(qmul(qslerp(want, mean, keep), qinv(mean)), q))


def _scale_about_mean(q, s, wrap=True):
    """Scales a rotation track's deviation from its mean by s."""
    if s == 1.0:
        return q
    qc = continuous(q)
    mean = qnorm(qc.mean(0))
    return qnorm(qmul(mean, qpow(qmul(qinv(mean), qc), s)))


def build_cycle(rt, f0, f1, frames, speed, style=None, fps=30, sigma=1.6, log=print):
    """One in-place locomotion cycle of `frames` frames at `speed` m/s from source frames [f0, f1] of a retarget.
    Returns {'local': [frames + 1, B, 4], 'pelvis': [frames + 1, 3] world, 'contacts': {...}, 'stats': {...}}."""
    st = dict(DEFAULT_STYLE); st.update(style or {})
    rig = rig_ = rt.rig
    n = frames
    T = n / fps
    sl = slice(f0, f1 + 1)
    # --- heading: travel along +Z
    trav = rt.hip_mid[f1] - rt.hip_mid[f0]; trav[1] = 0
    L_src = float(np.linalg.norm(trav))
    qy = yaw_quat(-np.arctan2(trav[0], trav[2]))
    u_src = np.linspace(0, 1, f1 - f0 + 1)[:, None]

    def place(p):  # world → travelling frame (origin moves with the mean velocity), facing +Z
        q = qrot(qy, p[sl] - rt.hip_mid[f0])
        q[:, 2] -= u_src[:, 0] * L_src
        return q
    hip = place(rt.hip_mid); hip[:, 1] = rt.hip_mid[sl, 1]
    feet = {}
    for s in 'LR':
        a = place(rt.ankles[s]); a[:, 1] = rt.ankles[s][sl, 1]
        feet[s] = a
    wr = {k: qmul(qy, v[sl]) for k, v in rt.wr.items()}
    # --- close the loop: spread the end-to-start difference over the cycle (half at each end)
    w = (u_src - 0.5)
    for arr in [hip] + [feet[s] for s in 'LR']:
        arr -= (arr[-1] - arr[0]) * w
    for k in wr:
        q = continuous(wr[k])
        d = qmul(q[0], qinv(q[-1]))                     # takes the last frame onto the first
        wr[k] = qnorm(qmul(qpow(d[None], w[:, 0] + 0.5), q))
        wr[k] = qnorm(qmul(qpow(qinv(d)[None], 0.5 * np.ones(len(q))), wr[k]))
    # --- resample to the clip's frame count (periodic) and low-pass
    hip = gauss_filter(_resample_pos(hip, n), sigma * 0.6, True)
    feet = {s: gauss_filter(_resample_pos(feet[s], n), sigma * 0.5, True) for s in 'LR'}
    wr = {k: qfilter(_resample_rot(wr[k], n), sigma * 0.6, True) for k in wr}
    hip[:, 0] -= hip[:, 0].mean(); mid_x = 0.5 * (feet['L'][:, 0].mean() + feet['R'][:, 0].mean())
    # --- stride scale: the stride must cover speed * T
    k_stride = speed * T / L_src
    hip_z_mean = hip[:, 2].mean()
    hip[:, 2] = (hip[:, 2] - hip_z_mean) * min(k_stride, 1.0)
    for s in 'LR':
        feet[s][:, 2] = (feet[s][:, 2] - hip_z_mean) * k_stride
        feet[s][:, 0] -= mid_x
    # --- style on the upper body
    recenter(rig, wr, st)
    yawless = lambda q: q
    wr['pelvis'] = _scale_about_mean(wr['pelvis'], st['pelvis_rot'])
    for b in ('spine', 'chest'):
        wr[b] = _scale_about_mean(wr[b], st['chest_rot'])
    for b in ('neck', 'head'):
        wr[b] = _scale_about_mean(wr[b], 1.0 - st['head_level'] * (1.0 if b == 'head' else 0.5))
    for s in 'LR':
        for b in (f'shoulder_{s}', f'upperarm_{s}', f'forearm_{s}', f'hand_{s}'):
            wr[b] = _scale_about_mean(wr[b], st['arm_swing'])
        if st['arm_out']:
            r = axis_angle(np.array([0, 0, 1.0]), np.radians(st['arm_out']) * (1 if s == 'L' else -1))
            for b in (f'upperarm_{s}', f'forearm_{s}', f'hand_{s}'):
                wr[b] = qmul(r, wr[b])
    if st['lean']:
        r = axis_angle(np.array([1.0, 0, 0]), np.radians(st['lean']))
        for b, f in (('spine', 0.5), ('chest', 1.0), ('neck', 0.6), ('head', 0.3)):
            wr[b] = qmul(qpow(r, f), wr[b])
        for s in 'LR':
            for b in (f'shoulder_{s}', f'upperarm_{s}', f'forearm_{s}', f'hand_{s}'):
                wr[b] = qmul(r, wr[b])
    hip[:, 1] = hip[:, 1].mean() + (hip[:, 1] - hip[:, 1].mean()) * st['bounce'] - st['hip_drop']
    hip[:, 0] *= st['sway']
    contacts = detect_contacts(rig, wr, feet, speed, fps, True, single=True)
    hip, ank_target, drop = plant_and_solve(rig, wr, hip, feet, contacts, speed, fps, True, st)
    fingers(rig, wr, n, st.get('hands', 'relaxed'), True)
    local, world = assemble(rig, wr, n)
    pel = pelvis_from_hips(rig, wr['pelvis'], hip)
    slip, low = check_slip(rig, local, pel, contacts, speed, fps, True)
    # repeat the first frame at the end so the clip's last key equals its first
    local = np.concatenate([local, local[:1]]); pel = np.concatenate([pel, pel[:1]])
    contacts = {s: contacts[s][0] for s in 'LR'}
    stats = {'slip_mean_m_s': round(float(np.mean(slip)), 4), 'slip_max_m_s': round(float(np.max(slip)), 4), 'ball_min_y': round(low, 4), 'src_stride_m': round(L_src, 3), 'src_T_s': round((f1 - f0) * rt.dt, 3), 'src_speed': round(L_src / ((f1 - f0) * rt.dt), 3),
             'stride_scale': round(k_stride, 3), 'time_scale': round((f1 - f0) * rt.dt / T, 3), 'hip_drop_max_m': round(float(drop.max()), 4),
             'contact': {s: [int(contacts[s][0]), int(contacts[s][1])] for s in 'LR'}}
    log('cycle', stats)
    return {'local': local, 'pelvis': pel, 'contacts': contacts, 'stats': stats, 'ankles': ank_target, 'hip': hip}


def pts_x_offset(rig, s):
    """Lateral offset of the ball of the foot from the ankle at rest (so `track` is measured at the ankle)."""
    return abs(rig.rest_wp[rig.index[f'toe_{s}'], 0]) - abs(rig.rest_wp[rig.index[f'foot_{s}'], 0])


def foot_points(rig, s):
    """Sole contact points (heel, ball, toe tip) in the foot bone's local space."""
    i_f, i_t = rig.index[f'foot_{s}'], rig.index[f'toe_{s}']
    ank_rest, ball_rest = rig.rest_wp[i_f], rig.rest_wp[i_t]
    inv = qinv(rig.rest_wr[i_f])
    loc = lambda p: qrot(inv, p - ank_rest)
    heel_back = 0.3 * float(np.linalg.norm((ball_rest - ank_rest)[[0, 2]]))
    return {'heel': loc(np.array([ank_rest[0], 0.0, ank_rest[2] - heel_back])),
            'ball': loc(np.array([ball_rest[0], 0.0, ball_rest[2]])),
            'tip': loc(np.array([ball_rest[0], 0.0, ball_rest[2] + 0.07]))}


def _runs(mask, cyclic):
    if cyclic:
        return _circ_intervals(mask)
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            out.append((i, j - i)); i = j
        else:
            i += 1
    return out


def detect_contacts(rig, wr, feet, speed, fps, cyclic, single=False, v_thr=None, h_thr=0.05, min_len=3):
    """Per foot, the intervals (start, length) in which the heel or the ball is low and moves with the ground
    (the ground runs backwards at `speed` for in-place locomotion; 0 for actions)."""
    n = len(feet['L'])
    v_thr = v_thr if v_thr is not None else (0.4 * speed if speed else 0.18)
    out = {}
    for s in 'LR':
        pts = foot_points(rig, s)
        wf = wr[f'foot_{s}']
        mask = np.zeros(n, bool)
        for key in ('heel', 'ball'):
            p = feet[s] + qrot(wf, pts[key])
            if cyclic:
                d = (np.roll(p, -1, 0) - np.roll(p, 1, 0)) * fps / 2
            else:
                d = np.gradient(p, axis=0) * fps
            mask |= (np.hypot(d[:, 2] + speed, d[:, 0]) < v_thr) & (p[:, 1] - np.percentile(p[:, 1], 2) < h_thr)
        runs = _runs(mask, cyclic)
        if not cyclic:
            # close short gaps, drop short runs
            merged = []
            for r in runs:
                if merged and r[0] - (merged[-1][0] + merged[-1][1]) <= 3:
                    merged[-1] = (merged[-1][0], r[0] + r[1] - merged[-1][0])
                else:
                    merged.append(r)
            runs = [r for r in merged if r[1] >= min_len]
        if single:
            if not runs:
                raise RuntimeError('no contact found for foot ' + s)
            runs = [max(runs, key=lambda r: r[1])]
        out[s] = runs
    return out


def plant_and_solve(rig, wr, hip, feet, contacts, speed, fps, cyclic, st):
    """Locks the planted feet to the ground, keeps every sole above it, lowers the hips where a leg would
    over-extend, solves both legs and lays the toes on the ground. Mutates `wr`; returns (hip, ankles, drop)."""
    n = len(hip)
    wrap = (lambda i: i % n) if cyclic else (lambda i: i)
    ank_target = {}
    for s in 'LR':
        a = feet[s].copy()
        pts = foot_points(rig, s)
        wf = wr[f'foot_{s}']
        if st.get('foot_out') is not None:
            fwd = qrot(wf, pts['ball'] - pts['heel']); yaw = np.arctan2(fwd[:, 0], fwd[:, 2])
            want = np.radians(st['foot_out']) * (1 if s == 'L' else -1)
            wf = qmul(yaw_quat((want - yaw) * 0.8), wf)
            wr[f'foot_{s}'] = wf
        off = {k: qrot(wf, v) for k, v in pts.items()}                 # contact points relative to the ankle
        # pivot: the heel while the toes are still up, the ball once the foot is flat or the heel peels off
        wb = smoothstep((off['heel'][:, 1] - off['ball'][:, 1] + 0.012) / 0.024)
        flat_len = float(np.linalg.norm(pts['ball'] - pts['heel']))
        R = max(2, int(round(0.07 * fps)))
        wgt = np.zeros(n); lock = np.zeros((n, 3))
        for start, length in contacts[s]:
            idx = np.array([wrap(start + j) for j in range(length)])
            tt = np.arange(length) / fps
            piv = a[idx] + off['ball'][idx]
            # lock position: best fit of the planted point to the ground (moving at -speed for locomotion)
            z0 = float(np.mean(piv[:, 2] + speed * tt)); x0 = float(np.mean(piv[:, 0]))
            if st.get('track') is not None:
                x0 = (st['track'] + pts_x_offset(rig, s)) * (1 if s == 'L' else -1)
            for j in range(-R, length + R):
                i = wrap(start + j)
                if i < 0 or i >= n:
                    continue
                w_j = 1.0 if 0 <= j < length else float(smoothstep((R + 1 + min(j, length - 1 - j)) / (R + 1)))
                if w_j < wgt[i]:
                    continue
                wgt[i] = w_j
                zb = z0 - speed * (j / fps)
                low_pt = min(off['heel'][i, 1], off['ball'][i, 1])
                fwd = off['ball'][i] - off['heel'][i]; fwd[1] = 0; fwd /= np.linalg.norm(fwd)
                via_ball = np.array([x0, 0, zb]) - off['ball'][i]
                via_heel = np.array([x0, 0, zb]) - fwd * flat_len - off['heel'][i]
                xz = via_ball * wb[i] + via_heel * (1 - wb[i])
                lock[i] = [xz[0], -low_pt, xz[2]]
        if st.get('track') is not None and speed:
            # the swing foot passes on the same narrow track instead of swinging wide
            a[:, 0] = st['track'] * (1 if s == 'L' else -1) + (a[:, 0] - a[:, 0].mean()) * 0.5
        a = a * (1 - wgt[:, None]) + lock * wgt[:, None]
        lowest = np.minimum(np.minimum(off['heel'][:, 1], off['ball'][:, 1]), off['tip'][:, 1])
        a[:, 1] = np.maximum(a[:, 1], -lowest + 0.002)
        ank_target[s] = a
    wp_pel = wr['pelvis']
    i_p = rig.index['pelvis']
    mid = 0.5 * (rig.rest_wp[rig.index['thigh_L']] + rig.rest_wp[rig.index['thigh_R']])
    hip_local = {s: qrot(qinv(rig.rest_wr[i_p]), rig.rest_wp[rig.index[f'thigh_{s}']] - mid) for s in 'LR'}
    l1 = {s: rig.length(f'thigh_{s}', f'shin_{s}') for s in 'LR'}; l2 = {s: rig.length(f'shin_{s}', f'foot_{s}') for s in 'LR'}
    drop = np.zeros(n)
    for s in 'LR':
        hj = hip + qrot(wp_pel, hip_local[s])
        d = ank_target[s] - hj
        horiz = np.hypot(d[:, 0], d[:, 2]); reach = (l1[s] + l2[s]) * 0.992
        max_y = ank_target[s][:, 1] + np.sqrt(np.maximum(reach ** 2 - horiz ** 2, 0.0))
        drop = np.maximum(drop, hj[:, 1] - max_y)
    drop = np.maximum(gauss_filter(np.maximum(drop, 0), 1.2, cyclic), 0)
    hip = hip.copy(); hip[:, 1] -= drop
    for s in 'LR':
        hj = hip + qrot(wp_pel, hip_local[s])
        knee_fk = hj + qrot(wr[f'thigh_{s}'], Y) * l1[s]
        knee, tgt = two_bone_ik(hj, ank_target[s], l1[s], l2[s], knee_fk)
        s1 = swing(qrot(wr[f'thigh_{s}'], Y), knee - hj)
        wr[f'thigh_{s}'] = qnorm(qmul(s1, wr[f'thigh_{s}']))
        shin = qmul(s1, wr[f'shin_{s}'])
        s2 = swing(qrot(shin, Y), tgt - knee)
        wr[f'shin_{s}'] = qnorm(qmul(s2, shin))
        ank_target[s] = tgt
    # toes: stay on the ground while the heel peels off
    for s in 'LR':
        pts = foot_points(rig, s)
        i_t = rig.index[f'toe_{s}']
        rel = qmul(qinv(rig.rest_wr[rig.index[f'foot_{s}']]), rig.rest_wr[i_t])
        wt = qmul(wr[f'foot_{s}'], rel)
        d = qrot(wt, Y)
        rest_y = rig.dir(f'toe_{s}')[1]
        flat = d.copy(); flat[:, 1] = np.maximum(d[:, 1], rest_y)
        ball_y = ank_target[s][:, 1] + qrot(wr[f'foot_{s}'], pts['ball'])[:, 1]
        near = smoothstep(1 - ball_y / 0.05)[:, None]
        wr[f'toe_{s}'] = qnorm(qmul(swing(d, d * (1 - near) + flat * near), wt))
    return hip, ank_target, drop


def check_slip(rig, local, pel, contacts, speed, fps, cyclic):
    """Speed of the sole's planted point against the ground over the contact intervals, and the lowest ball height."""
    n = len(local)
    wr_f, wp_f = rig.fk(local, pel)
    slip = []
    for s in 'LR':
        i_f = rig.index[f'foot_{s}']
        pts = foot_points(rig, s)
        hp = wp_f[:, i_f] + qrot(wr_f[:, i_f], pts['heel']); bp = wp_f[:, i_f] + qrot(wr_f[:, i_f], pts['ball'])
        for start, length in contacts[s]:
            for j in range(length - 1):
                i, i2 = start + j, start + j + 1
                if cyclic:
                    i, i2 = i % n, i2 % n
                p = bp if bp[i, 1] <= hp[i, 1] + 0.004 else hp
                slip.append(float(np.hypot(p[i2, 0] - p[i, 0], p[i2, 2] - p[i, 2] + speed / fps) * fps))
    low = min(float(np.min(wp_f[:, rig.index[f'toe_{s}'], 1])) for s in 'LR')
    return (slip or [0.0]), low


HAND_POSES = {            # degrees of curl: (fingers, index, thumb)
    'relaxed': (26, 18, 10), 'loose_fist': (58, 50, 26), 'open': (8, 4, 0), 'grip': (64, 58, 30), 'flat': (2, 0, -6),
}


def fingers(rig, wr_or_local, n, pose='relaxed', cyclic=True, swing_amp=5.0, local_out=None):
    """Finger bones: a held curl (HAND_POSES name or per-side dict) with a small breathing motion. Returns
    {bone: [n, 4] local rotations} for assemble() via `wr_or_local['__local']`."""
    loc = wr_or_local.setdefault('__local', {})
    u = np.arange(n) / n
    for s, side in (('L', 1), ('R', -1)):
        p = pose[s] if isinstance(pose, dict) else pose
        cf, ci, ct = HAND_POSES[p] if isinstance(p, str) else p
        w = np.sin(2 * np.pi * (u + (0.25 if side > 0 else 0.75))) * (swing_amp if cyclic else 0.0)
        i_h = rig.index[f'hand_{s}']
        for bone, axis, ang in ((f'fingers_{s}', (0, 0, -1.0), side * (cf + w)), (f'index_{s}', (0, 0, -1.0), side * (ci + 0.7 * w)),
                                (f'thumb_{s}', (0, 1.0, 0), -side * (ct + 0.4 * w))):
            if bone not in rig.index:
                continue
            r = axis_angle(np.array(axis), np.radians(ang))
            loc[bone] = qnorm(qmul(qinv(rig.rest_wr[i_h]), qmul(r, rig.rest_wr[rig.index[bone]])))


def build_action(rt, f0, f1, style=None, fps=30, loop=0, feet_mode='auto', sigma=1.2, keep_root=True, log=print):
    """An in-place action (idle, gesture, work loop) from source frames [f0, f1]: resampled to `fps`, turned to face
    +Z at its start, feet planted wherever they stand still. `loop` > 0 cross-fades that many frames of the end into
    the start for a seamless loop. feet_mode 'planted' keeps both feet locked for the whole clip (idles)."""
    st = dict(DEFAULT_STYLE); st.update(style or {})
    rig = rt.rig
    step = int(round(1.0 / (fps * rt.dt)))
    src = np.arange(f0, f1 + 1, step)
    n_all = len(src)
    pre = max(1.0, step * 0.5)
    filt_q = lambda q: qfilter(q[f0:f1 + 1], pre)[::step][:n_all]
    filt_p = lambda p: gauss_filter(p[f0:f1 + 1], pre)[::step][:n_all]
    wr = {k: filt_q(v) for k, v in rt.wr.items()}
    hip = filt_p(rt.hip_mid); feet = {s: filt_p(rt.ankles[s]) for s in 'LR'}
    # face +Z: by the mean heading of the pelvis over the clip, origin under the mean of the feet
    fw = qrot(wr['pelvis'], np.array([0, 0, 1.0])).mean(0)
    qy = yaw_quat(-np.arctan2(fw[0], fw[2]))
    origin = 0.5 * (feet['L'] + feet['R'])[: max(2, n_all // 8)].mean(0) if keep_root else 0.5 * (feet['L'] + feet['R']).mean(0)
    origin[1] = 0

    def place(p):
        q = qrot(qy, p - origin); return q
    hip = place(hip); feet = {s: place(feet[s]) for s in 'LR'}
    wr = {k: qmul(qy, v) for k, v in wr.items()}
    n = n_all - loop
    if loop:
        w = smoothstep(np.arange(loop) / loop)
        def xf_p(p):
            out = p[:n].copy(); out[:loop] = p[n:n + loop] * (1 - w[:, None]) + p[:loop] * w[:, None]; return out
        def xf_q(q):
            out = q[:n].copy(); out[:loop] = qslerp(q[n:n + loop], q[:loop], w); return out
        hip = xf_p(hip); feet = {s: xf_p(feet[s]) for s in 'LR'}; wr = {k: xf_q(v) for k, v in wr.items()}
    cyc = bool(loop)
    recenter(rig, wr, st)
    for b in ('neck', 'head'):
        if st['head_level'] and cyc:
            wr[b] = _scale_about_mean(wr[b], 1.0 - 0.5 * st['head_level'] * (1.0 if b == 'head' else 0.5))
    for s in 'LR':
        if st['arm_out']:
            r = axis_angle(np.array([0, 0, 1.0]), np.radians(st['arm_out']) * (1 if s == 'L' else -1))
            for b in (f'upperarm_{s}', f'forearm_{s}', f'hand_{s}'):
                wr[b] = qmul(r, wr[b])
    hip[:, 1] -= st['hip_drop']
    if feet_mode == 'planted':
        contacts = {s: [(0, n)] for s in 'LR'}
        for s in 'LR':   # a planted idle foot is flat: keep only its mean heading
            wf = wr[f'foot_{s}']; pts = foot_points(rig, s)
            fwd = qrot(wf, pts['ball'] - pts['heel']).mean(0)
            wr[f'foot_{s}'] = np.broadcast_to(qmul(yaw_quat(np.arctan2(fwd[0], fwd[2])), rig.rest_wr[rig.index[f'foot_{s}']]), (n, 4)).copy()
    else:
        contacts = detect_contacts(rig, wr, feet, 0.0, fps, cyc)
    hip, ank, drop = plant_and_solve(rig, wr, hip, feet, contacts, 0.0, fps, cyc, st)
    fingers(rig, wr, n, st.get('hands', 'relaxed'), False)
    local, world = assemble(rig, wr, n)
    pel = pelvis_from_hips(rig, wr['pelvis'], hip)
    slip, low = check_slip(rig, local, pel, contacts, 0.0, fps, cyc)
    if loop:
        local = np.concatenate([local, local[:1]]); pel = np.concatenate([pel, pel[:1]])
    stats = {'frames': int(n), 'seconds': round(n / fps, 2), 'slip_mean_m_s': round(float(np.mean(slip)), 4), 'slip_max_m_s': round(float(np.max(slip)), 4),
             'hip_drop_max_m': round(float(drop.max()), 4), 'contacts': {s: [[int(a), int(b)] for a, b in contacts[s]] for s in 'LR'}}
    log('action', stats)
    return {'local': local, 'pelvis': pel, 'stats': stats}

