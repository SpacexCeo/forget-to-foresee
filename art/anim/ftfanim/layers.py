"""Animator layers on top of a motion-capture base (docs/art/animation-pipeline.md, step 7b): a held pose taken from
another take, a weight shift, an arm reach solved with two-bone IK, eased additive rotations (nod, look, lean) and
the blend of a one-shot's ends into the idle pose. Character space: +X left, +Y up, +Z forward, metres.
"""
import numpy as np

from .quat import axis_angle, continuous, qinv, qmul, qnorm, qpow, qrot, qslerp, smoothstep, swing, yaw_quat
from .retarget import two_bone_ik

X, Y, Z = np.eye(3)


def envelope(keys, n, fps):
    """Weight per frame from [[seconds, weight], ...], eased with a smoothstep between keys."""
    t = np.arange(n) / fps
    w = np.full(n, float(keys[0][1]))
    for (t0, w0), (t1, w1) in zip(keys[:-1], keys[1:]):
        m = (t >= t0) & (t <= t1) if t1 > t0 else np.zeros(n, bool)
        w[m] = w0 + (w1 - w0) * smoothstep((t[m] - t0) / (t1 - t0))
    w[t > keys[-1][0]] = keys[-1][1]
    return w


def euler(deg):
    """Pitch (forward +), yaw (to the left +), roll (to the right +) in degrees → quaternion(s); deg: [..., 3]."""
    d = np.radians(np.asarray(deg, float))
    return qmul(axis_angle(Y, d[..., 1]), qmul(axis_angle(X, d[..., 0]), axis_angle(Z, d[..., 2])))


# ---------------------------------------------------------------- layers before the feet are planted (world space)

def pose_from(rig, wr, hip, feet, rt_pose, frame, keep=0.5, hip_keep=0.3):
    """Replaces the mean pose of the whole body by the pose of `rt_pose` at `frame` (e.g. sitting), keeping `keep`
    of the base motion about its mean (breathing, small sway). The feet stand where the pose has them."""
    fw = qrot(rt_pose.wr['pelvis'][frame], Z)
    qy = yaw_quat(-np.arctan2(fw[0], fw[2]))
    origin = 0.5 * (rt_pose.ankles['L'][frame] + rt_pose.ankles['R'][frame]); origin[1] = 0
    for k in wr:
        q = continuous(wr[k]); mean = qnorm(q.mean(0))
        want = qmul(qy, rt_pose.wr[k][frame])
        wr[k] = qnorm(qmul(want, qpow(qmul(qinv(mean), q), keep)))
    hip[:] = qrot(qy, rt_pose.hip_mid[frame] - origin) + (hip - hip.mean(0)) * hip_keep
    for s in 'LR':
        feet[s][:] = qrot(qy, rt_pose.ankles[s][frame] - origin)


def weight_shift(rig, wr, hip, keys, fps, side=1, shift=0.045, drop=0.012, roll=4.0, yaw=3.0):
    """Contrapposto: the hips travel over one foot (side +1 = the left), the free hip drops, the pelvis tilts and
    turns a little; the chest, the head and the arms keep their world orientation, so the shoulders stay level and
    the spine takes up the difference. The legs follow in the IK."""
    w = envelope(keys, len(hip), fps)
    hip[:, 0] += side * shift * w
    hip[:, 1] -= drop * w
    r_pel = euler(np.stack([0 * w, side * yaw * w, side * roll * w], -1))
    wr['pelvis'] = qnorm(qmul(r_pel, wr['pelvis']))
    wr['spine'] = qnorm(qmul(qpow(r_pel, 0.45), wr['spine']))


# ---------------------------------------------------------------- layers on the finished body (local rotations)

def _fk(rig, local, pel):
    return rig.fk(local, pel)


def rotate(rig, local, pel, bones, keys, fps):
    """Additive rotations in character space: bones = {name: [pitch, yaw, roll] degrees at weight 1}; children follow."""
    n = len(local)
    w = envelope(keys, n, fps)
    for name in sorted(bones, key=lambda b: rig.index[b]):
        i = rig.index[name]
        wr, _ = _fk(rig, local, pel)
        p = rig.parent[i]
        wp = wr[:, p] if p >= 0 else np.broadcast_to(rig.base_r, (n, 4))
        r = euler(np.asarray(bones[name], float)[None] * w[:, None])
        local[:, i] = qnorm(qmul(qinv(wp), qmul(r, qmul(wp, local[:, i]))))


def reach(rig, local, pel, side, target, keys, fps, rel=None, hand_tilt=35.0, elbow=(0.10, -0.30, -0.05), arc=0.06, wrist_back=0.085, hand_pose=None):
    """One arm reaches for `target` (character space; relative to the bone `rel` when given) with the weight envelope
    `keys`: the wrist travels from where the base motion has it to the target along a slightly raised arc, the elbow
    hangs below and outside the line, the hand tilts back so the palm faces the target. Fingers follow `hand_pose`
    (local rotations at weight 1, {bone: quaternion})."""
    n = len(local)
    w = envelope(keys, n, fps)
    sg = 1.0 if side == 'L' else -1.0
    iu, ifa, ih = (rig.index[f'{b}_{side}'] for b in ('upperarm', 'forearm', 'hand'))
    wr, wp = _fk(rig, local, pel)
    sh, el, wri = wp[:, iu], wp[:, ifa], wp[:, ih]
    l1, l2 = rig.length(f'upperarm_{side}', f'forearm_{side}'), rig.length(f'forearm_{side}', f'hand_{side}')
    goal = np.broadcast_to(np.asarray(target, float), (n, 3)).copy()
    if rel:
        goal = goal + wp[:, rig.index[rel]]
    aim = goal - sh; aim /= np.linalg.norm(aim, axis=-1, keepdims=True)
    goal_w = goal - aim * wrist_back                                   # the wrist stops short: the palm reaches the target
    tgt = wri * (1 - w[:, None]) + goal_w * w[:, None]
    tgt[:, 1] += arc * np.sin(np.pi * w)                               # a raised path on the way out and back
    hint_goal = sh + 0.5 * (goal_w - sh) + np.array([sg * elbow[0], elbow[1], elbow[2]])
    hint = el * (1 - w[:, None]) + hint_goal * w[:, None]
    knee, tgt = two_bone_ik(sh, tgt, l1, l2, hint)
    s1 = swing(qrot(wr[:, iu], Y), knee - sh)
    w_up = qnorm(qmul(s1, wr[:, iu]))
    fa = qmul(s1, wr[:, ifa])
    s2 = swing(qrot(fa, Y), tgt - knee)
    w_fa = qnorm(qmul(s2, fa))
    w_h = qmul(s2, qmul(s1, wr[:, ih]))
    # the hand: align with the forearm, then tilt the fingers up so the palm faces the target
    d_fa = qrot(w_fa, Y)
    w_h_al = qmul(swing(qrot(w_h, Y), d_fa), w_h)
    ax = np.cross(d_fa, Y); ax /= np.maximum(np.linalg.norm(ax, axis=-1, keepdims=True), 1e-6)
    tilt = np.stack([np.append(a * np.sin(np.radians(hand_tilt) * k / 2), np.cos(np.radians(hand_tilt) * k / 2)) for a, k in zip(ax, w)])
    w_h = qnorm(qslerp(w_h, qmul(tilt, w_h_al), w))
    pu = rig.parent[iu]
    local[:, iu] = qnorm(qmul(qinv(wr[:, pu]), w_up))
    local[:, ifa] = qnorm(qmul(qinv(w_up), w_fa))
    local[:, ih] = qnorm(qmul(qinv(w_fa), w_h))
    for bone, q in (hand_pose or {}).items():
        i = rig.index[bone]
        local[:, i] = qnorm(qslerp(local[:, i], np.broadcast_to(q, (n, 4)), w))


def ease_ends(local, pel, ref_local, ref_pel, n_in, n_out):
    """Blends the first `n_in` and the last `n_out` frames of a one-shot from / into a reference pose (the idle's
    first frame), so the clip starts and ends exactly where the idle is."""
    n = len(local)
    for k in range(n):
        w = 1.0
        if n_in and k < n_in:
            w = min(w, float(smoothstep(k / n_in)))
        if n_out and k > n - 1 - n_out:
            w = min(w, float(smoothstep((n - 1 - k) / n_out)))
        if w < 1.0:
            local[k] = qnorm(qslerp(ref_local, local[k], np.full(len(ref_local), w)))
            pel[k] = ref_pel * (1 - w) + pel[k] * w
