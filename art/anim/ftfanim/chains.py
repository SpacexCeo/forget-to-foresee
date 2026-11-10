"""Secondary motion for the rig's chain bones (hair, tail, scarf, cloak, skirt: bones named <chain>_<n>): each bone
is a damped spring that lags its parent, simulated over the baked body motion with warm-up passes so loops close."""
import re

import numpy as np

from .quat import qinv, qmul, qnorm, qrot, swing

Y = np.array([0.0, 1.0, 0.0])

# chain prefix: (natural frequency rad/s, damping ratio, air coupling, gravity sag gain)
PARAMS = {
    'hair': (16.0, 0.55, 0.05, 0.0), 'tail': (9.5, 0.32, 0.10, 0.0), 'scarf': (8.0, 0.35, 0.16, 0.0),
    'cloak': (7.0, 0.5, 0.14, 0.0), 'skirt': (9.0, 0.5, 0.10, 0.0), 'hood': (14.0, 0.6, 0.03, 0.0), 'default': (10.0, 0.5, 0.08, 0.0),
}


def chain_bones(rig):
    """[(chain name, [bone indices root→tip])] for bones named <chain>_<n>."""
    groups = {}
    for i, n in enumerate(rig.names):
        m = re.match(r'^(.*)_(\d+)$', n)
        if m:
            groups.setdefault(m.group(1), []).append((int(m.group(2)), i))
    return [(k, [i for _, i in sorted(v)]) for k, v in groups.items()]


def simulate(rig, local, pelvis, fps=30, loop=True, air_speed=0.0, sub=4, warm=3, scale=1.0):
    """Returns `local` with the chain bones replaced by simulated rotations. local: [F, B, 4] (for a loop, F excludes
    the repeated last frame); pelvis: [F, 3] world positions."""
    F = len(local)
    out = local.copy()
    wr, wp = rig.fk(local, pelvis)
    dt = 1.0 / (fps * sub)
    air = np.array([0.0, 0.0, -air_speed])
    for name, bones in chain_bones(rig):
        om, zeta, air_k, _ = PARAMS.get(re.sub(r'_[A-Z]$', '', name), PARAMS.get(name.split('_')[0], PARAMS['default']))
        om *= scale
        par = rig.parent[bones[0]]
        # tail length of each bone: distance to the next bone's head, the last one reuses the previous length
        lens = []
        for k, b in enumerate(bones):
            lens.append(float(np.linalg.norm(rig.rest_t[bones[k + 1]])) if k + 1 < len(bones) else (lens[-1] if lens else 0.1))
        p = None; v = None
        res = np.zeros((F, len(bones), 4))
        passes = (warm if loop else 0) + 1
        for ps in range(passes):
            for f in range(F):
                f_prev = (f - 1) % F if (loop or f > 0) else 0
                for st in range(sub):
                    a = (st + 1) / sub
                    # parent transform interpolated inside the frame
                    pr = qnorm(wr[f_prev, par] * (1 - a) + wr[f, par] * a * np.sign(np.sum(wr[f_prev, par] * wr[f, par]) or 1.0))
                    pp = wp[f_prev, par] * (1 - a) + wp[f, par] * a
                    if p is None:
                        p = np.zeros((len(bones), 3)); v = np.zeros((len(bones), 3))
                        r, h = pr, pp
                        for k, b in enumerate(bones):
                            h = h + qrot(r, rest_t(rig, b)); r = qmul(r, rig.rest_r[b])
                            p[k] = h + qrot(r, Y) * lens[k]
                    r, h = pr, pp
                    for k, b in enumerate(bones):
                        head = h + qrot(r, rest_t(rig, b))
                        r_t = qmul(r, rig.rest_r[b])                     # where the parent would hold this bone
                        target = head + qrot(r_t, Y) * lens[k]
                        acc = om * om * (target - p[k]) - 2 * zeta * om * (v[k] - air * air_k)
                        v[k] = v[k] + acc * dt
                        q = p[k] + v[k] * dt
                        d = q - head
                        q = head + d / max(np.linalg.norm(d), 1e-9) * lens[k]
                        v[k] = (q - p[k]) / dt * 0.999 if st or f or ps else v[k]
                        p[k] = q
                        s = swing(qrot(r_t, Y), p[k] - head)
                        r_w = qnorm(qmul(s, r_t))
                        if st == sub - 1 and ps == passes - 1:
                            res[f, k] = qmul(qinv(r), r_w)
                        # the next bone hangs from this one's simulated transform; its rest_t is relative to this bone's head
                        r, h = r_w, head
        for k, b in enumerate(bones):
            out[:, b] = qnorm(res[:, k])
    return out


def rest_t(rig, b):
    return rig.rest_t[b]
