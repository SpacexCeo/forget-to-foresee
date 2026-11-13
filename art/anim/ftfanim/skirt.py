"""A gown on its own bone grid (Elise): fitting the grid's bones to simulated cloth, the leg-against-gown build check,
and a stair-climbing variant of a walk cycle that the check uses as its hardest case.

The cloth rig file (written by art/agents/elise/b_build.py, glTF axes) holds the gown's rest grid [rows, cols, 3], the
weight of every grid vertex to every gown bone, the columns and rows the bone chains sit on, and capsules: the bone
that carries each one, two rest points, two radii, and a set (0: the legs, checked against the gown; 1: body shapes
that only the ribbons and hair strands collide with). Numpy only.
"""
import numpy as np

from . import cloth
from .quat import axis_angle, gauss_filter, qinv, qmul, qnorm, qrot, swing
from .retarget import two_bone_ik

Y = np.array([0.0, 1.0, 0.0])


def qmat(q):
    x, y, z, w = np.moveaxis(q, -1, 0)
    return np.stack([np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1),
                     np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1),
                     np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1)], -2)


def mat_q(m):
    """Quaternions (x, y, z, w) of rotation matrices [..., 3, 3]."""
    t = m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2]
    q = np.stack([m[..., 2, 1] - m[..., 1, 2], m[..., 0, 2] - m[..., 2, 0], m[..., 1, 0] - m[..., 0, 1], 1 + t], -1)
    for i, (j, k) in enumerate(((1, 2), (2, 0), (0, 1))):       # the largest diagonal element picks the stable form
        alt = [None] * 4
        alt[i] = 1 + m[..., i, i] - m[..., j, j] - m[..., k, k]
        alt[j] = m[..., j, i] + m[..., i, j]; alt[k] = m[..., k, i] + m[..., i, k]; alt[3] = m[..., k, j] - m[..., j, k]
        use = (m[..., i, i] >= m[..., j, j]) & (m[..., i, i] >= m[..., k, k]) & (t < 0)
        q = np.where(use[..., None], np.stack(alt, -1), q)
    return qnorm(q)


# Per-character gown tuning (clips.json: characters.<id>.cloth.tune). Defaults are the v3 gown's.
#   drag, hold, margin: the simulation's air drag, pull back to the gown's own shape, and clearance from the legs;
#   keep: the share of each node's swing away from the hips-carried rest shape that is kept (a narrow dress: under 1);
#   max_deg: the largest angle a chain segment may leave its hips-carried rest direction; resolve_margin: the
#   clearance the skinned gown keeps from the leg capsules after that (the legs always win over the limits).
TUNE = dict(drag=1.2, hold=0.04, margin=0.02, keep=1.0, max_deg=None, resolve_margin=0.008)


def use_character(char_spec):
    TUNE.update(dict(drag=1.2, hold=0.04, margin=0.02, keep=1.0, max_deg=None, resolve_margin=0.008))
    TUNE.update(((char_spec or {}).get('cloth') or {}).get('tune', {}))


def tame(N, N0, keep, max_deg):
    """Limits simulated chain nodes N [F, chains, nodes, 3] against the hips-carried rest nodes N0: every segment keeps
    `keep` of its swing and stays within `max_deg` of its rest direction; segment lengths are the rest's."""
    out = N0.copy()
    for k in range(1, N.shape[2]):
        r = N0[:, :, k] - N0[:, :, k - 1]; L = np.linalg.norm(r, axis=-1, keepdims=True); r = r / np.maximum(L, 1e-9)
        d = N[:, :, k] - N[:, :, k - 1]; d = d / np.maximum(np.linalg.norm(d, axis=-1, keepdims=True), 1e-9)
        c = np.clip(np.sum(r * d, -1, keepdims=True), -1, 1); ang = np.arccos(c)
        want = ang * keep
        if max_deg is not None:
            want = np.minimum(want, np.radians(max_deg))
        perp = d - c * r; perp = perp / np.maximum(np.linalg.norm(perp, axis=-1, keepdims=True), 1e-9)
        out[:, :, k] = out[:, :, k - 1] + (np.cos(want) * r + np.sin(want) * perp) * L
    return out


class ClothRig:
    def __init__(self, path, rig):
        d = np.load(path)
        self.rig = rig
        self.grid = d['grid'].astype(float)                               # [R, C, 3] rest positions
        self.names = [str(x) for x in d['gw_names']]
        self.cols = [int(x) for x in d['ch_cols']]; self.rows = [int(x) for x in d['ch_rows']]
        nc, nk = len(self.cols), len(self.rows) - 1
        self.chain = np.array([[rig.index['skirt_%02d_%d' % (c, k)] for k in range(nk)] for c in range(nc)])   # [chains, bones]
        self.rest_nodes = self.grid[self.rows][:, self.cols].transpose(1, 0, 2)                              # [chains, nodes, 3]
        gw = d['gw'].reshape(-1, len(self.names)); top = np.argsort(-gw, 1)[:, :4]
        self.w = np.take_along_axis(gw, top, 1); self.w /= self.w.sum(1, keepdims=True)
        self.wb = np.array([rig.index[n] for n in self.names])[top]                                           # [V, 4] rig bone indices
        R, C = self.grid.shape[:2]
        # how a push on a grid vertex is shared between the chain nodes around it (bilinear in grid steps)
        ri = np.interp(np.arange(R), self.rows, np.arange(len(self.rows))); ci = np.interp(np.arange(C), self.cols, np.arange(nc))
        NW = np.zeros((R, C, nc, len(self.rows)))
        for r in range(R):
            r0 = min(int(ri[r]), len(self.rows) - 2); fr = ri[r] - r0
            for c in range(C):
                c0 = min(int(ci[c]), nc - 2); fc = ci[c] - c0
                NW[r, c, c0, r0] = (1 - fc) * (1 - fr); NW[r, c, c0 + 1, r0] = fc * (1 - fr); NW[r, c, c0, r0 + 1] = (1 - fc) * fr; NW[r, c, c0 + 1, r0 + 1] = fc * fr
        self.node_w = NW.reshape(R * C, nc, len(self.rows))
        self.caps = [(rig.index[str(b)], p0.astype(float), p1.astype(float), float(r[0]), float(r[1]), int(s), str(b))
                     for b, p0, p1, r, s in zip(d['cap_bone'], d['cap_p0'], d['cap_p1'], d['cap_r'], d['cap_set'])]
        self.tails = {str(n): p.astype(float) for n, p in zip(d['tail_names'], d['tail_pos'])}

    # ---- pose
    def bone_xf(self, wr, wp, bones):
        """Skinning rotation matrices and offsets of rig bones: world = M x_rest + t."""
        rig = self.rig
        M = qmat(qmul(wr[:, bones], qinv(rig.rest_wr[bones])[None]))
        return M, wp[:, bones] - np.einsum('fbij,bj->fbi', M, rig.rest_wp[bones])

    def skin(self, wr, wp):
        """The gown grid under linear blend skinning [F, R, C, 3]."""
        ub, inv = np.unique(self.wb, return_inverse=True); inv = inv.reshape(self.wb.shape)
        M, t = self.bone_xf(wr, wp, ub)
        rest = self.grid.reshape(-1, 3); out = np.zeros((len(wr), len(rest), 3))
        for k in range(4):
            out += self.w[None, :, k, None] * (np.einsum('fvij,vj->fvi', M[:, inv[:, k]], rest) + t[:, inv[:, k]])
        return out.reshape(len(wr), *self.grid.shape)

    def capsules(self, wr, wp, cset=0):
        """[(name, a [F, 3], b [F, 3], r0, r1)] in the pose."""
        out = []
        for b, p0, p1, r0, r1, s, name in self.caps:
            if s != cset:
                continue
            M, t = self.bone_xf(wr, wp, np.array([b]))
            out.append((name, M[:, 0] @ p0 + t[:, 0], M[:, 0] @ p1 + t[:, 0], r0, r1))
        return out

    def nodes(self, wr, wp):
        """Chain node positions of a pose [F, chains, nodes, 3] (the bones are rigid: heads, then the last tail)."""
        rig = self.rig; last = self.chain[:, -1]
        tail = np.stack([self.tails[rig.names[b]] for b in last])
        M, t = self.bone_xf(wr, wp, last)
        return np.concatenate([wp[:, self.chain], (np.einsum('fbij,bj->fbi', M, tail) + t)[:, :, None]], 2)

    # ---- fit
    def frames(self, N):
        """An orthonormal frame per bone [.., chains, bones, 3, 3] from node positions: Y along the bone, X along the
        hem direction (towards the next chain)."""
        y = N[..., 1:, :] - N[..., :-1, :]
        mid = 0.5 * (N[..., 1:, :] + N[..., :-1, :])
        tan = np.empty_like(mid)
        tan[..., 1:-1, :, :] = mid[..., 2:, :, :] - mid[..., :-2, :, :]
        tan[..., 0, :, :] = mid[..., 1, :, :] - mid[..., 0, :, :]; tan[..., -1, :, :] = mid[..., -1, :, :] - mid[..., -2, :, :]
        y = y / np.maximum(np.linalg.norm(y, axis=-1, keepdims=True), 1e-9)
        x = tan - y * np.sum(tan * y, -1, keepdims=True); x = x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-9)
        return np.stack([x, y, np.cross(x, y)], -1)

    def fit(self, local, pelvis, N):
        """Writes into `local` the gown bones' rotations that lay the chains along node positions N [F, chains, nodes, 3]."""
        rig = self.rig
        Rw = self.frames(N) @ np.swapaxes(self.frames(self.rest_nodes), -1, -2)       # world rotation from rest, per bone
        world = qmul(mat_q(Rw), rig.rest_wr[self.chain][None])                         # [F, chains, bones, 4]
        wr, _ = rig.fk(local, pelvis)
        par = wr[:, rig.parent[self.chain[0, 0]]]
        for k in range(self.chain.shape[1]):
            p = par[:, None] if k == 0 else world[:, :, k - 1]
            local[:, self.chain[:, k]] = qnorm(qmul(qinv(p), world[:, :, k]))
        return local

    # ---- distance
    def samples(self, P):
        """Points on the skinned surface [F, S, 3]: vertices, edge midpoints and cell centres."""
        a = P[:, :-1, :-1]; b = P[:, :-1, 1:]; c = P[:, 1:, :-1]; d = P[:, 1:, 1:]; F = len(P)
        return np.concatenate([x.reshape(F, -1, 3) for x in (P, (a + b) / 2, (c + d) / 2, (a + c) / 2, (b + d) / 2, (a + d) / 2, (b + c) / 2)], 1)

    def distance(self, local, pelvis, margin=0.0, push=False):
        """Per frame, the smallest signed distance from a leg capsule to the gown surface [F] and the capsule's name;
        with `push`, also the displacement that would clear every grid vertex by `margin` [F, V, 3]."""
        rig = self.rig; F = len(local)
        dmin = np.full(F, 9.0); who = np.zeros(F, int); disp = np.zeros((F,) + self.grid.reshape(-1, 3).shape) if push else None
        V = disp.shape[1] if push else 0
        for f0 in range(0, F, 32):
            sl = slice(f0, min(F, f0 + 32))
            wr, wp = rig.fk(local[sl], pelvis[sl]); P = self.skin(wr, wp); S = self.samples(P)
            for ci, (name, a, b, r0, r1) in enumerate(self.capsules(wr, wp)):
                ab = (b - a)[:, None]; t = np.clip(np.sum((S - a[:, None]) * ab, -1) / np.sum(ab * ab, -1), 0, 1)
                v = S - (a[:, None] + t[..., None] * ab); dist = np.linalg.norm(v, axis=-1); sd = dist - (r0 + (r1 - r0) * t)
                m = sd.min(1); better = m < dmin[sl]; dmin[sl] = np.where(better, m, dmin[sl]); who[sl] = np.where(better, ci, who[sl])
                if push:
                    pen = np.maximum(margin - sd, 0)[..., None] * v / np.maximum(dist, 1e-9)[..., None]       # [f, S, 3]
                    R, C = self.grid.shape[:2]; g = lambda x, r_, c_: x.reshape(len(x), r_, c_, 3)
                    acc = g(pen[:, :V], R, C).copy(); o = V
                    for (r_, c_), parts in (((R - 1, C - 1), ((0, 0), (0, 1))), ((R - 1, C - 1), ((1, 0), (1, 1))), ((R - 1, C - 1), ((0, 0), (1, 0))),
                                            ((R - 1, C - 1), ((0, 1), (1, 1))), ((R - 1, C - 1), ((0, 0), (1, 1))), ((R - 1, C - 1), ((0, 1), (1, 0)))):
                        e = g(pen[:, o:o + r_ * c_], r_, c_); o += r_ * c_
                        for dr, dc in parts:
                            sub = acc[:, dr:dr + r_, dc:dc + c_]; big = np.linalg.norm(e, axis=-1) > np.linalg.norm(sub, axis=-1)
                            acc[:, dr:dr + r_, dc:dc + c_] = np.where(big[..., None], e, sub)
                    acc = acc.reshape(len(acc), V, 3); big = np.linalg.norm(acc, axis=-1) > np.linalg.norm(disp[sl], axis=-1)
                    disp[sl] = np.where(big[..., None], acc, disp[sl])
        names = [c[0] for c in self.capsules(*rig.fk(local[:1], pelvis[:1]))]
        return (dmin, [names[i] for i in who], disp) if push else (dmin, [names[i] for i in who])

    def resolve(self, local, pelvis, N, margin=0.008, iters=40, loop=False, log=None):
        """Fits the gown bones to node positions N, then moves the nodes until the skinned gown clears every leg
        capsule by `margin` (linear skinning between chains cuts corners that the simulated cloth did not)."""
        import os
        N = N.copy(); best = (-9.0, None)
        for it in range(0 if os.environ.get('FTF_NORESOLVE') else iters):
            self.fit(local, pelvis, N)
            dmin, _, disp = self.distance(local, pelvis, margin, push=True)
            if log:
                log('  resolve %2d: min %.4f, frames under margin %d' % (it, dmin.min(), int((dmin < margin * 0.75).sum())))
            if dmin.min() > best[0]:
                best = (float(dmin.min()), N.copy())
            if dmin.min() >= margin * 0.75:
                break
            dl = np.linalg.norm(disp, axis=-1, keepdims=True); disp = disp * np.minimum(1.0, 0.03 / np.maximum(dl, 1e-9))      # no more than 3 cm a pass
            w = np.linalg.norm(disp, axis=-1)                                                # [F, V]
            num = np.einsum('fv,fvi,vcn->fcni', w, disp, self.node_w); den = np.einsum('fv,vcn->fcn', w, self.node_w)
            d = num / np.maximum(den, 1e-9)[..., None]
            d = gauss_filter(d, 0.7, loop) * 0.5 + d * 0.5            # a push is shared with the neighbouring frames: no popping
            N = self.nodes(*self.rig.fk(local, pelvis)) + 1.3 * d
            N[:, :, 0] = self.nodes(*self.rig.fk(local, pelvis))[:, :, 0]
        else:
            if best[1] is not None:
                N = best[1]
        self.fit(local, pelvis, N)
        return local

    def inside(self, local, pelvis, side='R'):
        """Per frame, for the knee of the leg the gown encloses, against the gown's cross section at the knee's height
        (closed across the slit): (inside, through). `inside` is False when the knee stands outside that outline;
        `through` is True when it got there through the cloth and not through the open slit: a leg that passed
        through the cloth would clear every capsule and still be wrong."""
        rig = self.rig; wr, wp = rig.fk(local, pelvis); P = self.skin(wr, wp); ok = np.ones(len(local), bool)
        j = wp[:, rig.index['shin_' + side]]
        # the cross section at the knee's height: every grid column cut where it passes that height (its lowest point
        # if it is lifted above it)
        below = P[..., 1] <= j[:, None, None, 1]; r1 = np.where(below.any(1), below.argmax(1), P.shape[1] - 1); r0 = np.maximum(r1 - 1, 0)       # [F, C]
        fi = np.arange(len(P))[:, None]; ci = np.arange(P.shape[2])[None]
        p0, p1 = P[fi, r0, ci], P[fi, r1, ci]; t = np.clip((p0[..., 1] - j[:, None, 1]) / np.maximum(p0[..., 1] - p1[..., 1], 1e-9), 0, 1)[..., None]
        poly = (p0 + (p1 - p0) * t)[:, :, [0, 2]]; q = j[:, [0, 2]]
        a = poly - q[:, None]; b = np.roll(a, -1, 1)
        ang = np.arctan2(a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0], np.sum(a * b, -1)).sum(1)
        inside = abs(ang) > np.pi

        def seg_dist(p0_, p1_):
            ab = p1_ - p0_; t_ = np.clip(np.sum((q[:, None] - p0_) * ab, -1) / np.maximum(np.sum(ab * ab, -1), 1e-12), 0, 1)
            return np.linalg.norm(q[:, None] - (p0_ + t_[..., None] * ab), axis=-1)
        d_cloth = seg_dist(poly[:, :-1], poly[:, 1:]).min(1); d_slit = seg_dist(poly[:, -1:], poly[:, :1])[:, 0]
        return inside, ~inside & (d_cloth < d_slit)


def fit_chain(rig, local, pelvis, bones, pts):
    """A plain chain (ribbon, hair strand): bones swing from their rest direction onto the segments of pts [F, n + 1, 3]."""
    wr, _ = rig.fk(local, pelvis)
    par = wr[:, rig.parent[bones[0]]]
    for k, b in enumerate(bones):
        held = qmul(par, rig.rest_r[b][None])                     # where the parent would hold this bone
        w = qnorm(qmul(swing(qrot(held, Y), pts[:, k + 1] - pts[:, k]), held))
        local[:, b] = qnorm(qmul(qinv(par), w)); par = w
    return local


def stairs(rig, local, pelvis, slope, lift=0.04):
    """A walk cycle in place turned into climbing in place: each ankle rises with its forward offset (slope = rise
    over run, negative to descend), the swinging foot is lifted clear of the step edge, the legs are solved again.
    local [F + 1, B, 4] and pelvis [F + 1, 3] with the first frame repeated at the end."""
    wr, wp = rig.fk(local, pelvis); n = len(local) - 1
    zs = np.concatenate([wp[:n, rig.index[f'foot_{s}'], 2] for s in 'LR']); zref = zs.min() if slope > 0 else zs.max()
    for s in 'LR':
        it, ish, ifo = (rig.index[f'{b}_{s}'] for b in ('thigh', 'shin', 'foot'))
        l1 = rig.length(f'thigh_{s}', f'shin_{s}'); l2 = rig.length(f'shin_{s}', f'foot_{s}')
        ank = wp[:, ifo].copy(); vz = np.roll(ank[:n, 2], -1) - np.roll(ank[:n, 2], 1); sw = np.clip(vz / max(vz.max(), 1e-9), 0, 1)
        ank[:n, 1] += slope * (ank[:n, 2] - zref) + lift * gauss_filter(sw, 1.5, True); ank[n] = ank[0]
        knee, tgt = two_bone_ik(wp[:, it], ank, l1, l2, wp[:, ish] + np.array([0, 0, 0.6]))      # the knee always bends forward
        s1 = swing(qrot(wr[:, it], Y), knee - wp[:, it]); foot = wr[:, ifo].copy()
        wr[:, it] = qnorm(qmul(s1, wr[:, it])); shin = qmul(s1, wr[:, ish])
        wr[:, ish] = qnorm(qmul(swing(qrot(shin, Y), tgt - knee), shin)); wr[:, ifo] = foot
        for c in rig.children[ifo]:                                # the toe keeps its angle to the foot
            wr[:, c] = qmul(foot, rig.rest_r[c][None])
    return rig.to_local(wr)


# per chain kind: bending stiffness, pull back to the rest shape, air drag (1/s), collision margin. The face strands
# are held firmly (the root half pinned, the tips at a quarter of the hold): softer, they swung across her face in the walk
STRIPS = {'ribbon': dict(bend=0.03, hold=0.0, drag=0.9, margin=0.006), 'hair': dict(bend=0.9, hold=1.5, drag=0.8, margin=0.004)}


def bake(cr, local, pelvis, fps, loop, speed=0.0, yaw=None, log=None):
    """Simulates the gown, the ribbon tails and the face strands over a clip's body motion and returns the clip's local
    rotations with every chain bone baked [F (+1 for a loop), B, 4]. Loops run several cycles and keep the last one,
    closed; one-shots settle first; the body eases in from the rest pose, where the cloth has its own shape. The
    simulation runs in the character's frame: the air she walks through is a head wind; `yaw` [[seconds, degrees]]
    turns the root during a one-shot (a turn on the spot) and is taken out again."""
    rig = cr.rig; F = len(local) - (1 if loop else 0); ramp = int(0.6 * fps)
    if loop:
        cycles = max(2, int(np.ceil(2.4 * fps / F)) + 1); idx = np.concatenate([np.zeros(ramp, int), np.arange(cycles * F + 1) % F]); start = ramp + (cycles - 1) * F
    else:
        idx = np.concatenate([np.zeros(ramp + int(0.5 * fps), int), np.arange(F)]); start = len(idx) - F
    n = len(idx); e = np.clip(np.arange(n) / ramp, 0, 1); e = (e * e * (3 - 2 * e))[:, None, None]
    tsec = np.maximum(np.arange(n) - start, 0) / fps
    ang = np.radians(np.interp(tsec, yaw[:, 0], yaw[:, 1])) if (yaw is not None and not loop) else np.zeros(n); qy = axis_angle(np.array([0, 1.0, 0]), ang)
    wr, wp = rig.fk(local[:F], pelvis[:F])

    def carried(bone, pts):
        """Rest points carried by a bone over the simulated frames [n, P, 3], eased in from rest, root yaw applied."""
        M, t = cr.bone_xf(wr, wp, np.array([bone])); x = np.einsum('fij,pj->fpi', M[:, 0], pts) + t[:, 0][:, None]
        x = pts[None] * (1 - e) + x[idx] * e
        return qrot(qy[:, None], x)
    def colliders(cset, grow=0.0):
        cs = [c for c in cr.caps if c[5] == cset]
        a = np.stack([carried(c[0], c[1][None])[:, 0] for c in cs], 1); b = np.stack([carried(c[0], c[2][None])[:, 0] for c in cs], 1)
        return a, b, np.array([c[3] for c in cs]) + grow, np.array([c[4] for c in cs]) + grow
    wind = np.zeros((n, 3)); wind[:, 2] = -speed
    out = local[:F].copy()
    # ---- gown: every row, every second column of the grid
    step = 2; X0 = cr.grid[:, ::step]; R, C = X0.shape[:2]; rest = X0.reshape(-1, 3)
    # pinned along the hips; the rest is drawn back to the gown's own shape, softly (it settles, sheet 09), and more
    # firmly along the two slit edges (a bound edge: it must not slide off the left thigh and uncover the right knee)
    edge = np.minimum(np.arange(C), C - 1 - np.arange(C)) / 4.0; hold = (TUNE['hold'] + 0.2 * np.clip(1 - edge, 0, 1) ** 2)[None, :] * np.ones((R, 1)); hold = hold.ravel(); hold[:C] = 1.0
    ca, cb, r0, r1 = colliders(0); nm = [c[6] for c in cr.caps if c[5] == 0]
    # the feet keep 1.5 cm more air than the legs: at the legs' 2 cm the heel of the longer v2 foot, lifted behind on
    # the way down the stairs, ends in the back panel (a wider margin on the thighs drags the front slit edge off them)
    foot = np.array([n_.startswith('foot_') for n_ in nm]); r0 = r0 + 0.015 * foot; r1 = r1 + 0.015 * foot
    x = cloth.simulate(rest, cloth.grid_constraints(X0), carried(rig.index['pelvis'], rest), hold, (ca, cb, r0, r1), fps, wind=wind, drag=TUNE['drag'], margin=TUNE['margin'])
    x = qrot(qinv(qy)[:, None], x)

    def clip_frames(x):
        y = x[start:start + F].copy()
        if loop:
            diff = x[start + F] - x[start]; y -= diff[None] * (np.arange(F) / F - 0.5)[:, None, None]
        return y
    g = clip_frames(x).reshape(F, R, C, 3)[:, cr.rows]
    ci = np.array(cr.cols) / step; c0 = np.minimum(np.floor(ci).astype(int), C - 2); fc = (ci - c0)[None, None, :, None]
    N = (g[:, :, c0] * (1 - fc) + g[:, :, c0 + 1] * fc).transpose(0, 2, 1, 3)                    # [F, chains, nodes, 3]
    N[:, :, 0] = cr.nodes(wr, wp)[:, :, 0]
    if TUNE['keep'] < 1.0 or TUNE['max_deg'] is not None:
        Mp, tp = cr.bone_xf(wr, wp, np.array([rig.index['pelvis']])); N0 = np.einsum('fij,cnj->fcni', Mp[:, 0], cr.rest_nodes) + tp[:, 0][:, None, None]
        N0[:, :, 0] = N[:, :, 0]; N = tame(N, N0, TUNE['keep'], TUNE['max_deg'])
    cr.resolve(out, pelvis[:F], N, margin=TUNE['resolve_margin'], loop=loop, log=log)
    # ---- ribbon tails and face strands: one particle chain per bone chain, colliding with the body shapes
    body = colliders(1)
    for name, bones in chains_of(rig):
        kind = name.split('_')[0]
        if kind not in STRIPS:
            continue
        o = STRIPS[kind]; seg = 4; pts = [rig.rest_wp[b] for b in bones] + [cr.tails[rig.names[bones[-1]]]]
        P = np.array([pts[k] + (pts[k + 1] - pts[k]) * s / seg for k in range(len(bones)) for s in range(seg)] + [pts[-1]])
        hold = np.full(len(P), o['hold']) * np.linspace(1, 0.6 if kind == 'hair' else 0.15, len(P)) ** 2; hold[0] = 1.0
        x = cloth.simulate(P, cloth.chain_constraints(P, o['bend']), carried(rig.parent[bones[0]], P), hold, body, fps, wind=wind, drag=o['drag'], margin=o['margin'], iters=8)
        y = clip_frames(qrot(qinv(qy)[:, None], x)); y[:, 0] = wp[:, bones[0]]
        fit_chain(rig, out, pelvis[:F], bones, y[:, ::seg])
    return np.concatenate([out, out[:1]]) if loop else out


def chains_of(rig):
    from .chains import chain_bones
    return chain_bones(rig)
