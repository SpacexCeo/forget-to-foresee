"""Companion dragons (docs/companion-nft-plan.md, sheets docs/art/board-refs/DRG-001_01..03): Nacre (pearl wind),
Rill (teal tide), Cinder (amber ember). Second build: modelled to the sheets, rigged and animated in one Blender pass.

    blender -b --factory-startup -P art/dragons/build_dragons.py -- <out_dir> [nacre rill cinder] [--lite]

Per dragon: dragon_<id>.glb (and dragon_<id>_m.glb with --lite): one skinned mesh `dragon_<id>` with vertex colours
(materials M_Dragon_Body, M_Dragon_Membrane double-sided, M_Dragon_Accent emissive, M_Dragon_Eye, M_Dragon_Outline:
an inverted hull, full build only), an armature `rig` (root, spine_0..2, neck, head, tail_0..4, wing_<L|R>_0..2,
leg_<FL|FR|BL|BR> and leg_.._1), clips at 30 fps: idle (hover), follow, fly, glide, perch (loops) and flip (the
happy flip), cheer (a small flourish), land (hover to perch), one-shots. Pivot: the body's centre, the head looks -Y
(glTF +Z). Length snout to tail and wingspan from the sheets. Every part carries its own bone weights: nothing is
skinned by distance. Original designs (the sheets are ours); no third-party assets.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

TAU = math.tau
FPS = 30


def srgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def mix(a, b, k):
    k = max(0.0, min(1.0, k))
    return tuple(a[i] * (1 - k) + b[i] * k for i in range(3))


def hash2(i, j):
    return (math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1.0


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


SPECIES = {
    # length and span in metres; fractions of the unit body (snout y=-0.5, tail tip y=+0.5)
    "nacre": dict(length=0.58, span=0.96, body="#E6DDCA", belly="#B9C9C5", membrane="#F1DCE8", edge="#D79CCB", accent="#B77FB4",
                  eye="#7A4E78", hr=0.054, head_len=0.135, neck=(-0.365, 0.085), ys=-0.235, yp=0.03, girth=0.052, yt=0.42,
                  legs=0.95, wing="leaf", tail="split", extra="frills", flat=False),
    "rill": dict(length=0.64, span=0.84, body="#287D83", belly="#9ACAC0", membrane="#9ACAC0", edge="#E6DDCA", accent="#E6DDCA",
                 eye="#E9A21F", hr=0.070, head_len=0.165, neck=(-0.335, 0.075), ys=-0.215, yp=0.07, girth=0.070, yt=0.38,
                 legs=1.0, wing="fin", tail="fan", extra="fins", flat=False),
    "cinder": dict(length=0.46, span=0.72, body="#704733", belly="#E6CE9E", membrane="#E6CE9E", edge="#B57A4E", accent="#E0932F",
                   eye="#C9781E", hr=0.098, head_len=0.25, neck=(-0.255, 0.06), ys=-0.165, yp=0.15, girth=0.122, yt=0.40,
                   legs=1.15, wing="bat", tail="bud", extra="horns", flat=True),
}
MATS = ("body", "membrane", "accent", "eye")


class Build:
    """Vertices with a colour and bone weights, faces with a material."""

    def __init__(self):
        self.v, self.c, self.w, self.f, self.m = [], [], [], [], []

    def vert(self, p, col, w):
        self.v.append(tuple(p)); self.c.append(tuple(col)); self.w.append(w)
        return len(self.v) - 1

    def face(self, ids, mat):
        self.f.append(tuple(ids)); self.m.append(MATS.index(mat))


def catmull(pts, sub):
    """Catmull-Rom through tuples of floats, `sub` steps per span."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for s in range(sub):
            t = s / sub
            out.append(tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(pts[-1]))
    return out


def lerp_w(wa, wb, t):
    keys = set(wa) | set(wb)
    return {k: wa.get(k, 0) * (1 - t) + wb.get(k, 0) * t for k in keys}


def loft(B, rings, seg, col, mat="body", sub=1, caps=(True, True)):
    """A tube through rings (x, y, z, rx, rz, weights). `col(i, n, a, p)` gives a vertex colour for ring i of n at
    the angle a (90 degrees is the ring's up)."""
    if sub > 1:
        num = catmull([r[:5] for r in rings], sub)
        ws = []
        for i in range(len(rings) - 1):
            for s in range(sub):
                ws.append(lerp_w(rings[i][5], rings[i + 1][5], s / sub))
        ws.append(rings[-1][5])
        rings = [tuple(n_) + (w_,) for n_, w_ in zip(num, ws)]
    n = len(rings)
    idx = []
    for i, (x, y, z, rx, rz, w) in enumerate(rings):
        c = Vector((x, y, z))
        a_ = Vector(rings[max(i - 1, 0)][:3]); b_ = Vector(rings[min(i + 1, n - 1)][:3])
        t = (b_ - a_).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, -1, 0))
        s = t.cross(up).normalized(); u = s.cross(t).normalized()
        row = []
        for j in range(seg):
            a = TAU * j / seg
            p = c + s * (rx * math.cos(a)) + u * (rz * math.sin(a))
            row.append(B.vert(p, col(i, n, a, p), w))
        idx.append(row)
    for i in range(n - 1):
        for j in range(seg):
            k = (j + 1) % seg
            B.face((idx[i][j], idx[i][k], idx[i + 1][k], idx[i + 1][j]), mat)
    for end, on in ((0, caps[0]), (n - 1, caps[1])):
        if not on:
            continue
        x, y, z, rx, rz, w = rings[end]
        o = rings[1 if end == 0 else n - 2]
        d = (Vector((x, y, z)) - Vector(o[:3])).normalized()
        p = Vector((x, y, z)) + d * min(rx, rz) * 0.55
        cv = B.vert(p, col(end, n, math.pi / 2, p), w)
        for j in range(seg):
            k = (j + 1) % seg
            B.face((idx[end][j], idx[end][k], cv), mat)
    return idx


def ball(B, c, r, col, w, mat="body", u=8, v=6):
    """An ellipsoid; `col(p, d)` with d the unit direction from the centre."""
    c = Vector(c); r = (r, r, r) if isinstance(r, (int, float)) else r
    rows = []
    for i in range(1, v):
        th = math.pi * i / v
        row = []
        for j in range(u):
            ph = TAU * j / u
            d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            p = c + Vector((d.x * r[0], d.y * r[1], d.z * r[2]))
            row.append(B.vert(p, col(p, d), w))
        rows.append(row)
    top = B.vert(c + Vector((0, 0, r[2])), col(c + Vector((0, 0, r[2])), Vector((0, 0, 1))), w)
    bot = B.vert(c - Vector((0, 0, r[2])), col(c - Vector((0, 0, r[2])), Vector((0, 0, -1))), w)
    for j in range(u):
        k = (j + 1) % u
        B.face((top, rows[0][j], rows[0][k]), mat); B.face((bot, rows[-1][k], rows[-1][j]), mat)
        for i in range(len(rows) - 1):
            B.face((rows[i][j], rows[i + 1][j], rows[i + 1][k], rows[i][k]), mat)


def cone(B, a, b, r, col, w, mat="body", seg=5):
    a, b = Vector(a), Vector(b)
    t = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, -1, 0))
    s = t.cross(up).normalized(); u = s.cross(t).normalized()
    ring = [B.vert(a + s * (r * math.cos(TAU * j / seg)) + u * (r * math.sin(TAU * j / seg)), col, w) for j in range(seg)]
    tip = B.vert(b, col, w); base = B.vert(a, col, w)
    for j in range(seg):
        k = (j + 1) % seg
        B.face((ring[j], ring[k], tip), mat); B.face((ring[k], ring[j], base), mat)


def blade(B, base, tip, side, width, c0, c1, w, mat="membrane", n=5, bow=0.0, wt=None):
    """A flat leaf from base to tip, widest before the middle; `side` is the direction of its width; `wt` are the
    weights of its tip half (a fin that trails its bone chain)."""
    base, tip, side = Vector(base), Vector(tip), Vector(side).normalized()
    nrm = (tip - base).normalized().cross(side)
    prof = [0.0, 0.72, 1.0, 0.8, 0.45, 0.0][:n + 1] if n == 5 else [math.sin(math.pi * (i / n) ** 0.8) for i in range(n + 1)]
    rows = []
    for i in range(n + 1):
        t = i / n
        c = base.lerp(tip, t) + nrm * (bow * math.sin(math.pi * t))
        ww = w if wt is None or t < 0.5 else wt
        col = mix(c0, c1, t)
        hw = width * 0.5 * prof[i]
        if hw < 1e-6:
            rows.append((B.vert(c, col, ww),))
        else:
            rows.append((B.vert(c - side * hw, mix(col, c1, 0.5), ww), B.vert(c, col, ww), B.vert(c + side * hw, mix(col, c1, 0.5), ww)))
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        if len(a) == 1 and len(b) == 3:
            B.face((a[0], b[0], b[1]), mat); B.face((a[0], b[1], b[2]), mat)
        elif len(a) == 3 and len(b) == 1:
            B.face((a[0], b[0], a[1]), mat); B.face((a[1], b[0], a[2]), mat)
        elif len(a) == 3:
            B.face((a[0], b[0], b[1], a[1]), mat); B.face((a[1], b[1], b[2], a[2]), mat)


def resample(poly, n):
    """n+1 points along a polyline, even in arc length."""
    poly = [Vector(p) for p in poly]
    seg = [(poly[i + 1] - poly[i]).length for i in range(len(poly) - 1)]
    tot = sum(seg)
    out = []
    for k in range(n + 1):
        d = tot * k / n
        i = 0
        while i < len(seg) - 1 and d > seg[i]:
            d -= seg[i]; i += 1
        out.append(poly[i].lerp(poly[i + 1], min(1.0, d / max(seg[i], 1e-9))))
    return out


def smooth_poly(poly, sub=4):
    return [Vector(p) for p in catmull([tuple(p) for p in poly], sub)]


# ---------------------------------------------------------------- the body
def spine_points(S):
    yh = -0.5 + S["head_len"]; (yn, zn) = S["neck"]; ys, yp, g, yt = S["ys"], S["yp"], S["girth"], S["yt"]
    rn = S["hr"] * 0.60
    P = [(yn, zn, rn, rn), ((yn + ys) / 2 - 0.012, zn * 0.60, rn * 1.08, rn * 1.1), (ys - 0.015, zn * 0.20 + 0.008, g * 0.84, g * 0.88),
         (ys + 0.05, 0.006, g * 1.0, g * 1.06), ((ys + yp) / 2 + 0.01, 0.0, g * 1.04, g * 1.0), (yp, 0.0, g * 0.84, g * 0.82)]
    for k in range(1, 6):
        t = k / 5
        r = g * 0.66 * (1 - t) ** 1.25 + 0.007
        if S["tail"] == "bud":
            r = g * 0.42 * (1 - t) ** 0.8 + 0.012
        P.append((yp + (yt - yp) * t, -0.004 * math.sin(math.pi * t), r, r))
    return P, yh


def body_colour(S, flecks=True):
    top, bel, acc = srgb(S["body"]), srgb(S["belly"]), srgb(S["accent"])

    def col(i, n, a, p):
        down = smooth(0.25, 0.85, -math.sin(a))
        c = mix(top, bel, down)
        h = hash2(i * 3 + int(a * 2.3), int(a * 2.3) + i)
        k = 0.90 + 0.14 * h                                        # scales: a little light and dark
        c = tuple(min(1.0, x * k) for x in c)
        if flecks and S["wing"] == "leaf" and h > 0.80 and down < 0.3:
            c = mix(c, acc, 0.35)
        if S["wing"] == "fin" and down < 0.2 and h > 0.7:
            c = mix(c, (0.03, 0.2, 0.22), 0.4)
        return c
    return col


def build_body(B, S, seg):
    P, yh = spine_points(S)
    Wt = [{"head": 0.6, "neck": 0.4}, {"neck": 1.0}, {"neck": 0.45, "spine_1": 0.55}, {"spine_1": 0.6, "spine_0": 0.4},
          {"spine_0": 0.5, "spine_2": 0.5}, {"spine_2": 0.55, "tail_0": 0.45}]
    for k in range(1, 6):
        Wt.append({f"tail_{k - 1}": 0.5, f"tail_{min(k, 4)}": 0.5} if k < 5 else {"tail_4": 1.0})
    rings = [(0.0, y, z, rx, rz, w) for (y, z, rx, rz), w in zip(P, Wt)]
    loft(B, rings, seg, body_colour(S), sub=3)
    if S["tail"] == "bud":                                         # a beaded tail
        top = srgb(S["body"])
        for k in range(1, 5):
            y, z, rx, rz = P[5 + k]
            ball(B, (0, y, z), (rx * 1.55, rx * 1.35, rx * 1.5), lambda p, d: mix(top, (0.2, 0.1, 0.06), 0.25 + 0.3 * hash2(p.y * 90, d.z * 7)), {f"tail_{k - 1}": 1.0}, u=7, v=5)
    return P, yh


def build_head(B, S, P, yh, seg):
    hr = S["hr"]; yn, zn = S["neck"]
    top, bel = srgb(S["body"]), srgb(S["belly"])
    wide = 1.28 if S["extra"] == "horns" else 1.0
    U = [0.0, 0.12, 0.30, 0.50, 0.68, 0.84, 0.95, 1.0]
    F = [0.45, 0.86, 1.0, 0.97, 0.68 * wide, 0.56 * wide, 0.46 * wide, 0.22]
    G = [0.40, 0.80, 0.95, 0.90, 0.58, 0.45, 0.37, 0.18]
    Z = [0.0, 0.0, 0.05, 0.05, -0.12, -0.20, -0.24, -0.26]
    y0 = yn + hr * 0.75; y1 = -0.5
    rings = [(0.0, y0 + (y1 - y0) * u, zn + hr * 0.12 + Z[k] * hr, hr * F[k], hr * G[k], {"head": 1.0}) for k, u in enumerate(U)]

    def col(i, n, a, p):
        down = smooth(0.2, 0.8, -math.sin(a))
        c = mix(top, bel, down)
        if i >= n * 0.55 and -0.62 < math.sin(a) < -0.18:
            c = mix(c, (0.05, 0.03, 0.03), 0.55)                   # the mouth line: a small smile
        return c
    loft(B, rings, seg, col, sub=2)
    # eyes: a big iris, a pupil, a highlight
    iris = srgb(S["eye"])
    ey = y0 + (y1 - y0) * 0.44; ez = zn + hr * 0.34; er = hr * (0.34 if S["extra"] == "horns" else 0.40)
    for sx in (-1, 1):
        ax = Vector((sx * 0.80, -0.55, 0.22)).normalized(); hl = Vector((sx * 0.50, -0.60, 0.62)).normalized()

        def ecol(p, d, ax=ax, hl=hl):
            k = d.dot(ax)
            if d.dot(hl) > 0.93:
                return (1, 1, 1)
            if k > 0.84:
                return (0.01, 0.01, 0.015)
            if k > 0.18:
                return mix(iris, (0.02, 0.02, 0.02), smooth(0.55, 0.30, k) * 0.6)
            return (0.03, 0.025, 0.03)
        ball(B, (sx * hr * 0.62, ey, ez), er, ecol, {"head": 1.0}, mat="eye", u=12, v=9)
    # nostrils
    for sx in (-1, 1):
        ball(B, (sx * hr * 0.16 * wide, y1 + hr * 0.14, zn - hr * 0.05), hr * 0.045, lambda p, d: (0.04, 0.03, 0.03), {"head": 1.0}, u=5, v=4)
    mem, edge, acc = srgb(S["membrane"]), srgb(S["edge"]), srgb(S["accent"])
    hw = {"head": 1.0}
    if S["extra"] == "frills":                                     # Nacre: petals fanning back from the cheeks, a small crown
        for sx in (-1, 1):
            for k, (up, out, ln) in enumerate(((0.75, 0.35, 1.9), (0.45, 0.75, 2.3), (0.10, 0.95, 2.4), (-0.25, 0.85, 2.0), (-0.5, 0.55, 1.5))):
                b0 = Vector((sx * hr * 0.72, y0 - hr * 0.55, zn + hr * (0.12 + up * 0.55)))
                d = Vector((sx * out, 1.15, up * 0.8)).normalized()
                blade(B, b0, b0 + d * hr * ln, Vector((sx * 0.3, 0.0, 1.0)).cross(d), hr * 0.62, mix(top, mem, 0.5), edge, hw)
        for k in range(3):
            b0 = Vector((0, y0 - hr * (0.9 - 0.45 * k), zn + hr * 0.95))
            blade(B, b0, b0 + Vector((0, 0.9, 0.8)).normalized() * hr * (1.1 + 0.2 * k), (1, 0, 0), hr * 0.42, mix(top, mem, 0.5), edge, hw)
    elif S["extra"] == "fins":                                     # Rill: webbed ear fans, a crest
        tealdark = mix(srgb(S["body"]), (0, 0, 0), 0.15)
        for sx in (-1, 1):
            b0 = Vector((sx * hr * 0.80, y0 - hr * 0.35, zn + hr * 0.25))
            rays = [b0 + Vector((sx * math.cos(a) * 0.9, 0.75 + 0.2 * math.sin(a), math.sin(a))).normalized() * hr * (1.55 - 0.1 * abs(k - 2))
                    for k, a in enumerate((1.05, 0.55, 0.05, -0.45, -0.9))]
            c = B.vert(b0, tealdark, hw)
            ids = []
            for k, r in enumerate(rays):
                ids.append(B.vert(r, edge, hw))
                if k < len(rays) - 1:
                    mid = b0 + ((r + rays[k + 1]) / 2 - b0) * 0.80          # scalloped webbing
                    ids.append(B.vert(mid, mem, hw))
            for k in range(len(ids) - 1):
                B.face((c, ids[k], ids[k + 1]), "membrane")
        for k in range(4):
            b0 = Vector((0, y0 - hr * (1.0 - 0.5 * k), zn + hr * 0.9))
            blade(B, b0, b0 + Vector((0, 0.75, 1.0)).normalized() * hr * (0.9 - 0.1 * k), (1, 0, 0), hr * 0.5, tealdark, edge, hw)
    else:                                                          # Cinder: amber crests, cream cheek spikes
        for sx in (-1, 1):
            cone(B, (sx * hr * 0.42, y0 - hr * 0.5, zn + hr * 0.86), (sx * hr * 0.66, y0 + hr * 0.15, zn + hr * 1.45), hr * 0.2, acc, hw, mat="accent", seg=5)
            cone(B, (sx * hr * 0.70, y0 - hr * 0.15, zn + hr * 0.62), (sx * hr * 1.12, y0 + hr * 0.4, zn + hr * 0.95), hr * 0.15, acc, hw, mat="accent", seg=5)
            cone(B, (sx * hr * 0.86, y0 - hr * 0.5, zn - hr * 0.1), (sx * hr * 1.3, y0 + hr * 0.1, zn - hr * 0.22), hr * 0.16, bel, hw, seg=5)
        for k in range(3):
            cone(B, (0, y0 - hr * (0.8 - 0.5 * k), zn + hr * 0.88), (0, y0 - hr * (0.5 - 0.5 * k), zn + hr * 1.22), hr * 0.17, mix(top, (0, 0, 0), 0.25), hw, seg=4)


def build_legs(B, S, P, seg):
    g = S["girth"]; ll = 0.115 * S["legs"]
    top, bel = srgb(S["body"]), srgb(S["belly"])
    out = {}
    for name, sx, k in (("leg_FL", -1, 3), ("leg_FR", 1, 3), ("leg_BL", -1, 5), ("leg_BR", 1, 5)):
        y = P[k][0] + (0.0 if k == 3 else -0.03)
        x = sx * g * 0.62
        hip = Vector((x, y, -g * 0.35)); knee = Vector((x * 1.3, y + (0.012 if k == 3 else -0.02), -g * 0.35 - ll * 0.5))
        ank = Vector((x * 1.25, y - (0.012 if k == 3 else -0.012), -g * 0.35 - ll))
        par = "spine_1" if k == 3 else "spine_2"
        col = lambda i, n, a, p: mix(top, bel, 0.25 + 0.5 * i / n)
        rings = [(hip.x * 0.8, hip.y, hip.z + g * 0.3, g * 0.50, g * 0.50, {par: 0.6, name: 0.4}), (*hip, g * 0.46, g * 0.48, {name: 1.0}),
                 (*knee, g * 0.33, g * 0.33, {name: 0.5, name + "_1": 0.5}), (*ank, g * 0.25, g * 0.25, {name + "_1": 1.0})]
        loft(B, rings, max(6, seg - 6), col, sub=2, caps=(False, True))
        paw = ank + Vector((0, -g * 0.22, -g * 0.10))
        ball(B, paw, (g * 0.32, g * 0.44, g * 0.2), lambda p, d: mix(top, bel, 0.55), {name + "_1": 1.0}, u=7, v=5)
        for t in (-1, 0, 1):
            cone(B, paw + Vector((t * g * 0.17, -g * 0.34, -g * 0.02)), paw + Vector((t * g * 0.22, -g * 0.56, -g * 0.10)), g * 0.06, mix(bel, (1, 1, 1), 0.4), {name + "_1": 1.0}, seg=4)
        out[name] = (hip, knee, ank)
    return out


def build_wing(B, S, sgn, side, ns, nt):
    g = S["girth"]; half = S["span"] / S["length"] / 2.0; ys = S["ys"]
    sh = Vector((sgn * g * 0.55, ys + 0.045, g * 0.78))
    X = lambda fx, dy, dz: Vector((sgn * half * fx, sh.y + dy, sh.z + dz))
    kind = S["wing"]
    if kind == "leaf":
        el, wr, tip = X(0.34, -0.07, 0.05), X(0.68, -0.10, 0.06), X(0.98, 0.03, 0.03)
        lead = [sh, el, wr, tip, X(1.0, 0.11, 0.02)]
        trail = [Vector((sgn * g * 0.5, sh.y + 0.22, 0.02)), X(0.26, 0.30, 0.0), X(0.52, 0.33, 0.0), X(0.76, 0.27, 0.0), X(0.93, 0.17, 0.01), X(1.0, 0.11, 0.02)]
    elif kind == "fin":
        el, wr, tip = X(0.36, -0.06, 0.06), X(0.70, -0.08, 0.07), X(0.98, 0.04, 0.03)
        lead = [sh, el, wr, tip, X(1.0, 0.12, 0.02)]
        trail = [Vector((sgn * g * 0.5, sh.y + 0.24, 0.02)), X(0.20, 0.33, 0.0), X(0.34, 0.31, 0.0), X(0.50, 0.37, 0.0), X(0.66, 0.31, 0.0), X(0.80, 0.30, 0.0), X(0.94, 0.19, 0.01), X(1.0, 0.12, 0.02)]
    else:
        el, wr, tip = X(0.38, -0.04, 0.09), X(0.70, -0.08, 0.08), X(1.0, 0.07, 0.03)
        f2, f3 = X(0.80, 0.30, 0.0), X(0.50, 0.34, 0.0)
        rb = Vector((sgn * g * 0.55, sh.y + 0.20, 0.02))
        lead = [sh, el, wr, tip]
        trail = [rb, (rb + f3) / 2 + Vector((0, -0.06, 0)), f3, (f3 + f2) / 2 + Vector((0, -0.07, 0)), f2, (f2 + tip) / 2 + Vector((-sgn * 0.03, -0.05, 0)), tip]
    Ls = resample(smooth_poly(lead) if kind != "bat" else lead, ns)
    Ts = resample(smooth_poly(trail) if kind != "bat" else trail, ns)
    arm_len = [(el - sh).length, (wr - el).length, (tip - wr).length]
    tot = sum(arm_len); se, sw = arm_len[0] / tot, (arm_len[0] + arm_len[1]) / tot
    if kind != "bat":
        se *= 0.92; sw *= 0.92
    b0, b1, b2 = f"wing_{side}_0", f"wing_{side}_1", f"wing_{side}_2"
    mem, edge, body = srgb(S["membrane"]), srgb(S["edge"]), srgb(S["body"])

    def weights(s, t):
        k1 = smooth(se - 0.07, se + 0.07, s); k2 = smooth(sw - 0.07, sw + 0.07, s)
        w = {b0: (1 - k1), b1: k1 * (1 - k2), b2: k1 * k2}
        hold = max(0.0, 1 - s / 0.22) * t * 0.85                    # the inner trailing edge stays on the flank
        if hold > 0:
            w = {k: v * (1 - hold) for k, v in w.items()}; w["spine_0"] = hold
        return w

    def colour(s, t, i):
        if kind == "leaf":
            k = 0.5 + 0.5 * math.sin(s * 11.0 + t * 6.0 + sgn)
            c = mix(mem, (1, 1, 1), 0.55 * k)
            c = mix(c, edge, 0.75 * smooth(0.55, 1.0, max(t, s * 0.9)))
            c = mix(c, (0.75, 0.9, 1.0), 0.25 * (0.5 + 0.5 * math.sin(s * 23.0 - t * 9.0)))
        elif kind == "fin":
            c = mix(mix(body, mem, 0.55 + 0.45 * t), (1, 1, 1), 0.25 * t)
            if t > 0.93:
                c = edge
        else:
            c = mix(mem, edge, 0.35 * (1 - t))
        if i % 4 == 0 and kind != "leaf":
            c = mix(c, body if kind == "bat" else edge, 0.45)          # veins
        if i % 3 == 0 and kind == "leaf":
            c = mix(c, (1, 1, 1), 0.35)
        return c
    grid = []
    for i in range(ns + 1):
        s = i / ns
        row = []
        for j in range(nt + 1):
            t = j / nt
            p = Ls[i].lerp(Ts[i], t)
            p.z -= 0.022 * math.sin(math.pi * t) * (1 - 0.6 * s) + 0.03 * s * s * t
            row.append(B.vert(p, colour(s, t, i), weights(s, t)))
        grid.append(row)
    for i in range(ns):
        for j in range(nt):
            q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
            B.face(q if sgn > 0 else q[::-1], "membrane")
    # the arm along the leading edge, fingers on a bat wing
    r0 = 0.020 if kind == "bat" else 0.012
    armc = srgb(S["body"]) if kind != "leaf" else mix(srgb(S["body"]), (1, 0.85, 0.7), 0.3)
    na = ns if kind != "bat" else ns
    rings = []
    for i in range(na + 1):
        s = i / na
        p = Ls[i]
        r = r0 * (1 - 0.72 * s) + 0.002
        rings.append((p.x, p.y, p.z + r * 0.4, r, r, weights(s, 0.0)))
    loft(B, rings[::2] if ns >= 12 else rings, 5, lambda i, n, a, p: armc, caps=(True, True))
    if kind == "bat":
        for ft in (f2, f3):
            rr = [(*(wr.lerp(ft, k / 4) + Vector((0, 0, 0.004 - 0.022 * math.sin(math.pi * k / 4) * 0.4))), 0.009 * (1 - 0.6 * k / 4) + 0.002, 0.009 * (1 - 0.6 * k / 4) + 0.002, {b1: 0.5, b2: 0.5} if k == 0 else {b2: 1.0}) for k in range(5)]
            loft(B, rr, 4, lambda i, n, a, p: armc)
        for q in (sh, el, wr):
            ball(B, q + Vector((0, 0, 0.006)), 0.022, lambda p, d: armc, weights(0.0 if q is sh else se if q is el else sw, 0.0), u=6, v=4)
    else:
        ball(B, sh + Vector((0, 0, 0.004)), 0.016, lambda p, d: armc, {b0: 0.5, "spine_1": 0.5}, u=6, v=4)
    return (sh, el, wr, tip)


def build_tail_end(B, S, P):
    y, z = P[-1][0], P[-1][1]
    mem, edge, acc, body = srgb(S["membrane"]), srgb(S["edge"]), srgb(S["accent"]), srgb(S["body"])
    w = {"tail_4": 1.0}
    if S["tail"] == "split":                                        # Nacre: two long leaf fins
        for sx in (-1, 1):
            d = Vector((sx * 0.42, 1.0, 0.12 * sx)).normalized()
            blade(B, (0, y - 0.03, z), Vector((0, y - 0.03, z)) + d * 0.20, Vector((0, 0, 1)).cross(d), 0.075, mix(body, mem, 0.6), edge, w, bow=0.012 * sx)
    elif S["tail"] == "fan":                                        # Rill: a broad scalloped fan and a dorsal fin row
        c = B.vert((0, y - 0.07, z), mix(body, mem, 0.3), {"tail_3": 1.0})
        ids = []
        n = 6
        for k in range(n + 1):
            a = -1.05 + 2.1 * k / n
            ids.append(B.vert((math.sin(a) * 0.115, y + 0.005 + math.cos(a) * 0.105, z + 0.012 * math.cos(a * 2)), edge, w))
            if k < n:
                a2 = a + 1.05 / n
                ids.append(B.vert((math.sin(a2) * 0.092, y + math.cos(a2) * 0.085, z), mem, w))
        for k in range(len(ids) - 1):
            B.face((c, ids[k], ids[k + 1]), "membrane")
        for k in range(1, 5):
            yy, zz, rr, _ = P[5 + k]
            blade(B, (0, yy - 0.03, zz + rr * 0.8), (0, yy + 0.035, zz + rr + 0.035), (1, 0, 0), 0.03, mix(body, mem, 0.4), edge, {f"tail_{k - 1}": 1.0})
    else:                                                           # Cinder: an amber crystal
        c = Vector((0, y + 0.035, z))
        r = 0.042
        top = B.vert(c + Vector((0, 0.075, 0)), mix(acc, (1, 0.9, 0.5), 0.5), w); bot = B.vert(c - Vector((0, 0.05, 0)), mix(acc, (0.4, 0.15, 0.02), 0.5), w)
        ring = [B.vert(c + Vector((math.cos(TAU * k / 6) * r, 0.0, math.sin(TAU * k / 6) * r)), acc, w) for k in range(6)]
        for k in range(6):
            B.face((ring[k], ring[(k + 1) % 6], top), "accent"); B.face((ring[(k + 1) % 6], ring[k], bot), "accent")


def build_sigil(B, S, P):
    """The round sign on each shoulder: an arc and five rays, a hair above the skin."""
    g = S["girth"]; y0 = P[3][0] - 0.005; acc = srgb(S["accent"]) if S["wing"] != "leaf" else (0.55, 0.3, 0.6)
    R = g * 0.36
    w = {"spine_1": 0.6, "spine_0": 0.4}
    for sx in (-1, 1):
        def at(u, v):                                               # a point on the flank near the shoulder
            a = 0.10 + v / (g * 1.02)
            return Vector((sx * g * 1.045 * math.cos(a), y0 + u, 0.006 + g * 1.09 * math.sin(a)))
        n = 10
        for k in range(n):
            a0, a1 = math.pi * (0.08 + 0.84 * k / n), math.pi * (0.08 + 0.84 * (k + 1) / n)
            q = [at(math.cos(a) * r_, math.sin(a) * r_ - R * 0.3) for a, r_ in ((a0, R), (a1, R), (a1, R * 0.72), (a0, R * 0.72))]
            ids = [B.vert(p, acc, w) for p in q]
            B.face(ids if sx > 0 else ids[::-1], "accent")
        for k in range(5):
            a = math.pi * (0.14 + 0.72 * k / 4)
            d = Vector((math.cos(a), math.sin(a)))
            n_ = Vector((-d.y, d.x)) * R * 0.07
            q = [at(d.x * R * 1.22 + n_.x, d.y * R * 1.22 + n_.y - R * 0.3), at(d.x * R * 1.6, d.y * R * 1.6 - R * 0.3), at(d.x * R * 1.22 - n_.x, d.y * R * 1.22 - n_.y - R * 0.3)]
            ids = [B.vert(p, acc, w) for p in q]
            B.face(ids if sx > 0 else ids[::-1], "accent")


def build_back(B, S, P):
    """A row along the back: petals (Nacre), small fins (Rill), plates (Cinder)."""
    mem, edge, body = srgb(S["membrane"]), srgb(S["edge"]), srgb(S["body"])
    for k, (i, t) in enumerate(((1, 0.5), (2, 0.2), (2, 0.8), (3, 0.5), (4, 0.2), (4, 0.8))):
        a, b = P[i], P[i + 1]
        y = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t; r = a[3] + (b[3] - a[3]) * t
        w = {("neck" if i < 2 else "spine_1" if i < 3 else "spine_0" if i < 4 else "spine_2"): 1.0}
        if S["extra"] == "horns":
            cone(B, (0, y - 0.012, z + r * 0.9), (0, y + 0.02, z + r * 1.32), r * 0.3, mix(body, (0, 0, 0), 0.28), w, seg=4)
        else:
            blade(B, (0, y - 0.015, z + r * 0.92), (0, y + 0.03, z + r * 1.0 + 0.03), (1, 0, 0), 0.026 if S["extra"] == "frills" else 0.02,
                  mix(body, mem, 0.5), edge, w)


# ---------------------------------------------------------------- the rig
def build_rig(S, P, yh, wings, legs):
    arm = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    Q = lambda k: Vector((0, P[k][0], P[k][1]))

    def bone(name, h, t, parent=None, up=(0, 0, 1)):
        b = eb.new(name)
        b.head, b.tail = h, t
        b.align_roll(Vector(up))
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        return b
    bone("root", Q(4), Q(4) + Vector((0, 0.06, 0)))
    bone("spine_0", Q(4), Q(3), "root")
    bone("spine_1", Q(3), Q(2), "spine_0")
    bone("neck", Q(2), Q(0), "spine_1")
    bone("head", Q(0), Vector((0, -0.5, P[0][1] - S["hr"] * 0.15)), "neck")
    bone("spine_2", Q(4), Q(5), "root")
    prev = "spine_2"
    for k in range(5):
        bone(f"tail_{k}", Q(5 + k), Q(6 + k), prev)
        prev = f"tail_{k}"
    for side, (sh, el, wr, tip) in wings.items():
        bone(f"wing_{side}_0", sh, el, "spine_1")
        bone(f"wing_{side}_1", el, wr, f"wing_{side}_0")
        bone(f"wing_{side}_2", wr, tip, f"wing_{side}_1")
    for name, (hip, knee, ank) in legs.items():
        bone(name, hip, knee, "spine_1" if name[4] == "F" else "spine_2", up=(0, -1, 0))
        bone(name + "_1", knee, ank + Vector((0, 0, -0.01)), name, up=(0, -1, 0))
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ---------------------------------------------------------------- the clips
CLIPS = {"idle": 60, "follow": 36, "fly": 24, "glide": 60, "perch": 90, "flip": 36, "cheer": 24, "land": 30}


def pose(name, u, S):
    """Bone angles of clip `name` at phase u in 0..1. Signs: wings +x up, +z sweep (R back, L forward: use sgn);
    root +x nose down; neck and head +x nose up; tail +x tip up, z yaw; legs +x forward."""
    ph = TAU * u
    R = {}
    hover = dict(pitch=-0.62, neck=-0.30, head=-0.24, amp=0.62, mean=0.12, beats=4, bob=0.016, tail=-0.11, fl=(-0.15, 0.55), hl=(0.35, 0.5))
    table = {
        "idle": hover,
        "follow": dict(pitch=-0.20, neck=-0.10, head=-0.06, amp=0.60, mean=0.10, beats=2, bob=0.012, tail=-0.03, fl=(-0.55, 0.9), hl=(-0.75, 0.7)),
        "fly": dict(pitch=-0.06, neck=0.04, head=0.0, amp=0.82, mean=0.06, beats=2, bob=0.012, tail=0.0, fl=(-0.7, 1.0), hl=(-0.95, 0.6)),
        "glide": dict(pitch=0.04, neck=0.02, head=-0.04, amp=0.0, mean=0.20, beats=1, bob=0.005, tail=0.01, fl=(-0.8, 1.1), hl=(-1.05, 0.55)),
    }
    perch = dict(pitch=-0.52, neck=-0.26, head=-0.20)
    if name in table or name in ("flip", "cheer"):
        T = table.get(name, table["follow"])
        beat = ph * T["beats"]
        st = math.sin(beat + 0.35 * math.sin(beat))                  # a quicker down-stroke
        flap = T["mean"] + T["amp"] * st
        fold = T["amp"] * max(0.0, math.cos(beat)) * 0.5             # the wing folds a little on the way up
        for side, sgn in (("L", -1), ("R", 1)):
            R[f"wing_{side}_0"] = (flap, 0, sgn * 0.10 * T["amp"] * math.cos(beat))
            R[f"wing_{side}_1"] = (0.40 * T["amp"] * math.sin(beat - 0.7) - 0.10, 0, sgn * fold * 0.6)
            R[f"wing_{side}_2"] = (0.34 * T["amp"] * math.sin(beat - 1.3) + (0.05 * math.sin(ph * 3 + sgn) if name == "glide" else 0), 0, sgn * fold * 0.5)
        R["root"] = (T["pitch"] + 0.03 * math.sin(beat + 1.0) * (T["amp"] > 0), 0.05 * math.sin(ph) if name == "glide" else 0, 0)
        R["root_loc"] = (0, 0, -T["bob"] * math.sin(beat + 0.5))
        R["neck"] = (T["neck"] + 0.04 * math.sin(ph + 2.0), 0, 0)
        R["head"] = (T["head"] - 0.04 * math.sin(beat + 0.9) * (T["amp"] > 0), 0, 0.22 * math.sin(ph) if name == "follow" else 0.10 * math.sin(ph) if name == "idle" else 0)
        amp = 0.20 if name != "glide" else 0.09
        for k in range(5):
            R[f"tail_{k}"] = (T["tail"] + 0.05 * math.sin(beat - 0.5 - k * 0.6) * (T["amp"] > 0), 0, amp * math.sin(ph - k * 0.85) * (0.5 + 0.13 * k))
        for leg, (a, b) in (("leg_FL", T["fl"]), ("leg_FR", T["fl"]), ("leg_BL", T["hl"]), ("leg_BR", T["hl"])):
            sw = 0.06 * math.sin(ph + (0.0 if leg.endswith("L") else 1.3))
            R[leg] = (a + sw, 0, 0); R[leg + "_1"] = (b - sw, 0, 0)
    if name == "flip":                                              # a backward somersault with the wings tucked, then a flare
        e = smooth(0.08, 0.92, u)
        tuck = math.sin(math.pi * u) ** 0.7
        R["root"] = (-0.2 - TAU * e, 0, 0)
        R["root_loc"] = (0, 0, 0.10 * math.sin(math.pi * u))
        for side, sgn in (("L", -1), ("R", 1)):
            R[f"wing_{side}_0"] = (0.25 - 0.55 * tuck + 0.5 * smooth(0.8, 1.0, u), 0, sgn * 0.75 * tuck)
            R[f"wing_{side}_1"] = (-0.2 * tuck, 0, sgn * 0.8 * tuck)
            R[f"wing_{side}_2"] = (0, 0, sgn * 0.6 * tuck)
        for k in range(5):
            R[f"tail_{k}"] = (0.28 * tuck, 0, 0.1 * math.sin(ph * 2 - k))
        R["neck"] = (0.1 + 0.3 * tuck, 0, 0); R["head"] = (0.25 * tuck, 0, 0)
        for leg in ("leg_FL", "leg_FR", "leg_BL", "leg_BR"):
            R[leg] = (0.5 * tuck - 0.3, 0, 0); R[leg + "_1"] = (0.9, 0, 0)
    if name == "cheer":                                             # a quick spin with the wings flared
        e = smooth(0.05, 0.95, u); up = math.sin(math.pi * u)
        R["root"] = (-0.25 - 0.25 * up, 0, TAU * e)
        R["root_loc"] = (0, 0, 0.07 * up)
        for side, sgn in (("L", -1), ("R", 1)):
            R[f"wing_{side}_0"] = (0.15 + 0.65 * up + 0.2 * math.sin(ph * 3), 0, -sgn * 0.15 * up)
            R[f"wing_{side}_1"] = (0.15 * up, 0, 0); R[f"wing_{side}_2"] = (0.2 * up, 0, 0)
        R["head"] = (0.2 * up, 0, 0)
    if name in ("perch", "land"):
        k_ = 1.0 if name == "perch" else smooth(0.25, 1.0, u)        # land: from the hover into the sit
        H = pose("idle", u * 0.5, S) if name == "land" else None
        look = math.sin(ph) if name == "perch" else 0.0
        br = 0.02 * math.sin(ph * 2) if name == "perch" else 0.0
        Pp = {"root": (perch["pitch"] + br, 0, 0), "root_loc": (0, 0, 0.004 * math.sin(ph * 2) if name == "perch" else 0),
              "neck": (perch["neck"] + 0.05 * math.sin(ph * 2 + 1), 0, 0.18 * look), "head": (perch["head"] + 0.06 * math.sin(ph * 3), 0.10 * math.sin(ph * 2), 0.38 * look)}
        for side, sgn in (("L", -1), ("R", 1)):
            Pp[f"wing_{side}_0"] = (0.55 + br, 0, sgn * 0.95)
            Pp[f"wing_{side}_1"] = (-0.25, 0, sgn * 1.25)
            Pp[f"wing_{side}_2"] = (-0.1, 0, sgn * 0.7)
        for k in range(5):
            Pp[f"tail_{k}"] = (-0.10 + (0.16 if k > 2 else 0), 0, 0.26 + 0.07 * math.sin(ph - k * 0.7) * (name == "perch"))
        for leg in ("leg_FL", "leg_FR"):
            Pp[leg] = (0.50, 0, 0); Pp[leg + "_1"] = (0.0, 0, 0)
        for leg in ("leg_BL", "leg_BR"):
            Pp[leg] = (1.25, 0, 0); Pp[leg + "_1"] = (-1.5, 0, 0)
        if H is None:
            R = Pp
        else:
            for key in Pp:
                a = H.get(key, (0, 0, 0)); b = Pp[key]
                R[key] = tuple(a[i] * (1 - k_) + b[i] * k_ for i in range(3))
            flare = math.sin(math.pi * min(1.0, u / 0.6)) * (1 - k_)
            for side, sgn in (("L", -1), ("R", 1)):
                x, y, z = R[f"wing_{side}_0"]; R[f"wing_{side}_0"] = (x + 0.5 * flare, y, z - sgn * 0.2 * flare)
    return R


def animate(rig, S):
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"
    rig.animation_data_create()
    for name, n in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        for f in range(n + 1):
            R = pose(name, f / n, S)
            for b in pb:
                b.rotation_euler = R.get(b.name, (0, 0, 0))
                b.location = R.get("root_loc", (0, 0, 0)) if b.name == "root" else (0, 0, 0)
                b.keyframe_insert("rotation_euler", frame=f)
                if b.name == "root":
                    b.keyframe_insert("location", frame=f)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    rig.animation_data.action = bpy.data.actions["idle"]
    for name in CLIPS:                                      # one muted NLA track per clip keeps every action exported
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, bpy.data.actions[name])
        track.mute = True


def mat(name, color=(1, 1, 1), rough=0.5, emit=None, strength=0.0, vcol=True, double=False, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
    if vcol:
        a = m.node_tree.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        m.node_tree.links.new(a.outputs["Color"], p.inputs["Base Color"])
        if emit:
            m.node_tree.links.new(a.outputs["Color"], p.inputs["Emission Color"])
    if emit:
        p.inputs["Emission Strength"].default_value = strength
    m.use_backface_culling = not double
    return m


def build(did, lite=False):
    S = SPECIES[did]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    seg = 10 if lite else 14
    B = Build()
    P, yh = build_body(B, S, seg)
    build_head(B, S, P, yh, seg)
    legs = build_legs(B, S, P, seg)
    wings = {}
    for side, sgn in (("L", -1), ("R", 1)):
        wings[side] = build_wing(B, S, sgn, side, 10 if lite else 16, 4 if lite else 6)
    build_tail_end(B, S, P)
    build_sigil(B, S, P)
    build_back(B, S, P)
    me = bpy.data.meshes.new(f"dragon_{did}")
    me.from_pydata(B.v, [], B.f)
    me.update()
    ob = bpy.data.objects.new(f"dragon_{did}", me)
    bpy.context.scene.collection.objects.link(ob)
    mats = [mat("M_Dragon_Body", rough=0.55 if S["flat"] else 0.42, sheen=0.3), mat("M_Dragon_Membrane", rough=0.5, double=True, sheen=0.4),
            mat("M_Dragon_Accent", rough=0.3, emit=True, strength=0.45), mat("M_Dragon_Eye", rough=0.08)]
    for m in mats:
        me.materials.append(m)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i, c in enumerate(B.c):
        ca.data[i].color = (*c, 1.0)
    for p, mi in zip(me.polygons, B.m):
        p.material_index = mi
        p.use_smooth = not (S["flat"] and mi == 0)
    names = sorted({k for w in B.w for k in w})
    groups = {n: ob.vertex_groups.new(name=n) for n in names}
    for i, w in enumerate(B.w):
        tot = sum(w.values()) or 1.0
        for k, v in w.items():
            if v > 1e-4:
                groups[k].add([i], v / tot, "REPLACE")
    # normals out on every closed part; an inverted hull outline around the solid parts (not the membranes)
    bm = bmesh.new(); bm.from_mesh(me)
    solid = [f for f in bm.faces if f.material_index != 1]
    bmesh.ops.recalc_face_normals(bm, faces=solid)
    base = len(bm.faces)
    if not lite:
        me_out = mat("M_Dragon_Outline", color=tuple(x * 0.16 for x in srgb(S["body"])), rough=1.0, vcol=False)
        me.materials.append(me_out)
        bm.normal_update()
        src = [f for f in bm.faces if f.material_index in (0, 3)]
        geom = bmesh.ops.duplicate(bm, geom=list({v for f in src for v in f.verts}) + list({e for f in src for e in f.edges}) + src)
        vm = geom["vert_map"]
        for v in [v for v in vm if isinstance(v, bmesh.types.BMVert)]:
            if vm[v] is not v and v.is_valid:
                vm[v].co = v.co + v.normal * 0.0042
        nf = [g_ for g_ in geom["geom"] if isinstance(g_, bmesh.types.BMFace)]
        for f in nf:
            f.material_index = 4
        bmesh.ops.reverse_faces(bm, faces=nf)
    bm.to_mesh(me); bm.free(); me.update()
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    rig = build_rig(S, P, yh, wings, legs)
    ob.parent = rig
    md = ob.modifiers.new("rig", "ARMATURE"); md.object = rig
    animate(rig, S)
    rig.scale = (S["length"],) * 3                                  # the unit model is 1 m snout to tail
    bpy.context.view_layer.update()
    return ob, rig, tris


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                              export_skins=True, export_yup=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = argv[0]
    lite_too = "--lite" in argv
    ids = [a for a in argv[1:] if a in SPECIES] or list(SPECIES)
    os.makedirs(out, exist_ok=True)
    for did in ids:
        for lite in ([False, True] if lite_too else [False]):
            body, rig, tris = build(did, lite)
            name = f"dragon_{did}" + ("_m" if lite else "")
            export(os.path.join(out, name + ".glb"))
            print("DRAGON", name, "tris", tris, "bones", len(rig.data.bones), flush=True)


if __name__ == "__main__":
    main()
