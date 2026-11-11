"""A long skirt as an envelope of the two legs (opt-in per character: "skirt": true in clips.json).

Bones skirt_F_0 / skirt_F_1 (front panel: thigh and shin level) and skirt_B_0 / skirt_B_1 (back panel) pivot on the
hip line and the knee line. The front panel takes the motion of whichever thigh and shin swing further forward, the
back panel of whichever swing further back, with a soft hand-over when the legs pass each other. The cloth next to
each leg is weighted to that leg itself, so no leg can come out through the skirt."""
import numpy as np

from .quat import qinv, qmul, qnorm, qrot

Y = np.array([0.0, 1.0, 0.0])


def _blend(qa, qb, w):
    s = np.sign(np.sum(qa * qb, -1, keepdims=True)); s[s == 0] = 1.0
    return qnorm(qa * w[:, None] + qb * s * (1 - w[:, None]))


def envelope(rig, local, soft_deg=6.0):
    """Returns `local` [F, B, 4] with the skirt bones set from the legs."""
    if 'skirt_F_0' not in rig.index:
        return local
    wr, _ = rig.fk(local)
    out = local.copy(); world = {}; soft = np.radians(soft_deg)

    def delta(name):
        i = rig.index[name]
        return qmul(wr[:, i], np.broadcast_to(qinv(rig.rest_wr[i]), wr[:, i].shape))

    def tilt(name):     # forward lean of a leg bone: its lower end ahead of its upper end
        d = qrot(wr[:, rig.index[name]], Y)
        return np.arctan2(d[:, 2], -d[:, 1])

    for seg, leg in ((0, 'thigh'), (1, 'shin')):
        tl, tr = tilt(leg + '_L'), tilt(leg + '_R'); dl, dr = delta(leg + '_L'), delta(leg + '_R')
        for nm, sg in (('F', 1.0), ('B', -1.0)):
            name = f'skirt_{nm}_{seg}'
            if name not in rig.index:
                continue
            w = 1.0 / (1.0 + np.exp(-sg * (tl - tr) / soft))          # share of the left leg
            i = rig.index[name]
            world[name] = qmul(_blend(dl, dr, w), np.broadcast_to(rig.rest_wr[i], dl.shape))
    for name in sorted(world, key=lambda n: rig.index[n]):
        i = rig.index[name]; p = rig.parent[i]; pn = rig.names[p]
        pw = world[pn] if pn in world else wr[:, p]
        out[:, i] = qnorm(qmul(qinv(pw), world[name]))
    return out
