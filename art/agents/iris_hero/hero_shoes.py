"""Iris's trainers, rebuilt (audit 10.11, defect 8; the owner's own item of 09.11).

The first pair was a shell pulled off the foot mesh: a lumpy toe box with the toes showing through,
blotchy patches and 6,300 triangles a shoe. This pair is constructed: a height field over the plan of a
shoe (a plateau round the ankle, the instep falling to a rounded toe box, boxy side walls), sliced into
level rings round the ankle's axis. The sole is its own band with a step where the upper begins, the toe
has a rubber bumper, the heel a pull tab, the collar a padded rim with a lining, the instep five lace
bars. About 1,700 triangles a shoe. The sock is a plain tube from under the leggings' hem into the collar.
"""
import math

import bmesh
import bpy
from mathutils import Vector as V

import hero_costume as C

SOLE = 0.023          # top of the sole band (metres above the ground)
PLATEAU = 0.120       # height of the field round the ankle (the collar is cut below it)
TOE_BOX = 0.054       # height of the toe box where the instep ends
N = 52                # vertices round a ring


def _measure(body, dom, co, sfx, bones):
    foot = [co[i] for i in co if dom[i] in (f"foot_{sfx}", f"toe_{sfx}")]
    a, t = bones[f"foot_{sfx}"][0], bones[f"toe_{sfx}"][1]
    fwd = V((t.x - a.x, t.y - a.y, 0.0)).normalized()
    lat = V((-fwd.y, fwd.x, 0.0))
    if lat.x * (1 if sfx == "L" else -1) < 0:                 # lateral = away from the other foot
        lat = -lat
    us = [p.dot(fwd) for p in foot]
    xs = [p.dot(lat) for p in foot]
    ank = [co[i] for i in co if dom[i] in (f"shin_{sfx}", f"foot_{sfx}") and 0.092 < co[i].z < 0.112]
    au = [p.dot(fwd) for p in ank]
    ax = [p.dot(lat) for p in ank]
    return {"fwd": fwd, "lat": lat, "u0": min(us) - 0.005, "u1": max(us) + 0.006,
            "x0": min(xs) - 0.002, "x1": max(xs) + 0.002,
            "ank_u": (min(au) + max(au)) / 2, "ank_x": (min(ax) + max(ax)) / 2,
            "ank_ru": (max(au) - min(au)) / 2, "ank_rx": (max(ax) - min(ax)) / 2}


class Shoe:
    def __init__(self, m):
        self.m = m
        self.L = m["u1"] - m["u0"]
        self.W = m["x1"] - m["x0"]
        self.xm = (m["x0"] + m["x1"]) / 2
        # the ankle's place in the shoe's own coordinates (s along the length, x across from the middle)
        self.sa = (m["ank_u"] - m["u0"]) / self.L
        self.xa = m["ank_x"] - self.xm
        self.s0 = self.sa + (m["ank_ru"] + 0.004) / self.L       # where the instep starts to fall
        self.s1 = 0.74
        self.hw_ankle = (m["ank_rx"] + 0.007) / 0.90
        self.sb = max(0.02, self.sa - (m["ank_ru"] + 0.006) / self.L)   # behind it the heel counter leans forward

    def xc(self, s):                                             # the toe leans toward the big toe
        return self.xa * (1.0 - C.smooth01(0.15, 0.55, s)) - 0.005 * C.smooth01(0.55, 1.0, s)

    def hw(self, s):
        w = self.W / 2 * (0.76 + 0.24 * C.smooth01(0.18, 0.66, s))
        w = max(w, self.hw_ankle * (1.0 - C.smooth01(self.s0, self.s0 + 0.2, s)))
        if s < 0.14:
            w *= (1.0 - (1.0 - s / 0.14) ** 2.4) ** (1 / 2.4)
        if s > 0.72:
            w *= max(0.0, 1.0 - ((s - 0.72) / 0.28) ** 2.3) ** (1 / 2.3)
        return w

    def ridge(self, s):
        if s < self.sb:                                          # the heel: full at mid height, in to the Achilles above
            return 0.048 + (PLATEAU - 0.048) * (s / self.sb) ** 0.55
        if s <= self.s0:
            return PLATEAU
        if s <= self.s1:
            t = (s - self.s0) / (self.s1 - self.s0)
            return PLATEAU + (TOE_BOX - PLATEAU) * t ** 0.92
        return SOLE + (TOE_BOX - SOLE) * max(0.0, 1.0 - ((s - self.s1) / (1.0 - self.s1)) ** 2.6) ** (1 / 2.6)

    def field(self, x, s):
        if s <= 0.0 or s >= 1.0:
            return -1.0
        w = self.hw(s)
        d = abs(x - self.xc(s))
        if w <= 1e-6 or d >= w:
            return -1.0
        p = 3.4 - 1.0 * C.smooth01(0.45, 0.85, s)
        return SOLE + (self.ridge(s) - SOLE) * (1.0 - (d / w) ** p) ** (1 / p)

    def radius(self, th, z):
        """Distance from the ankle's axis to the surface at height z, in the plan direction th (0 = toes)."""
        cs, sn = math.cos(th), math.sin(th)
        lo, hi = 0.0, self.L
        for _ in range(26):
            mid = (lo + hi) / 2
            if self.field(self.xa + mid * sn, self.sa + mid * cs / self.L) > z:
                lo = mid
            else:
                hi = mid
        return lo

    def collar(self, th):                                        # the rim: a raised tongue, low sides, a heel tab
        c = math.cos(th)
        return 0.092 + 0.025 * max(0.0, c) ** 2 + 0.016 * max(0.0, -c) ** 2

    def world(self, th, r, z):
        m = self.m
        s = self.sa + r * math.cos(th) / self.L
        x = self.xa + r * math.sin(th)
        z = z + 0.007 * C.smooth01(0.70, 1.0, s) ** 1.5          # toe spring
        return m["fwd"] * (m["u0"] + s * self.L) + m["lat"] * (self.xm + x) + V((0, 0, z)), s


def trainer(name, m):
    sh = Shoe(m)
    b = bmesh.new()
    trim_l = b.verts.layers.float.new("trim")
    acc_l = b.verts.layers.float.new("accent")
    UPPER = (0.10, 0.20, 0.29, 0.36, 0.45, 0.58, 0.72, 0.86, 1.0)
    rings = []
    ths = [math.tau * k / N for k in range(N)]
    r_sole = [sh.radius(th, SOLE + 0.0006) for th in ths]

    def ring(spec, trim, accent):
        row = []
        for k, th in enumerate(ths):
            r, z = spec(k, th)
            p, s = sh.world(th, r, z)
            v = b.verts.new(p)
            v[trim_l] = trim(k, th, s, z) if callable(trim) else trim
            v[acc_l] = accent(k, th, s, z) if callable(accent) else accent
            row.append(v)
        rings.append(row)

    ring(lambda k, th: (max(r_sole[k] - 0.0005, 0.002), 0.0), 1.0, 0.0)
    ring(lambda k, th: (r_sole[k] + 0.0022, 0.0030), 1.0, 0.0)
    ring(lambda k, th: (r_sole[k] + 0.0022, SOLE - 0.0035), 1.0, 0.0)
    ring(lambda k, th: (r_sole[k] - 0.0012, SOLE - 0.0010), 1.0, 0.0)          # the step where the upper begins
    bumper = lambda k, th, s, z: 1.0 if s > 0.84 and z < 0.046 else 0.0       # a rubber toe bumper
    tab = lambda k, th, s, z: 1.0 if abs(abs(th) - math.pi) < 0.30 and z > 0.060 else 0.0   # the heel's pull tab
    ring(lambda k, th: (sh.radius(th, SOLE + 0.0022), SOLE + 0.0022), bumper, 0.0)
    for f in UPPER:
        ring(lambda k, th, f=f: (sh.radius(th, SOLE + f * (sh.collar(th) - SOLE)), SOLE + f * (sh.collar(th) - SOLE)),
             bumper, lambda k, th, s, z: tab(k, th - math.tau if th > math.pi else th, s, z))
    rim = [sh.radius(th, sh.collar(th)) for th in ths]
    ring(lambda k, th: (rim[k] - 0.0035, sh.collar(th) + 0.0015), 0.0, 1.0)     # the padded rim rolls inward
    ring(lambda k, th: (rim[k] - 0.0065, sh.collar(th) - 0.004), 0.0, 1.0)
    ring(lambda k, th: (rim[k] - 0.0070, sh.collar(th) - 0.030), 0.0, 1.0)      # the lining, down into the shoe
    for r in range(len(rings) - 1):
        for k in range(N):
            j = (k + 1) % N
            b.faces.new((rings[r][k], rings[r][j], rings[r + 1][j], rings[r + 1][k]))
    b.faces.new(list(reversed(rings[0])))                                       # the outsole
    # lace bars across the instep
    for i in range(5):
        s = sh.s0 + 0.035 + i * 0.058
        if s > sh.s1 - 0.03:
            break
        rows = []
        for ds in (-0.0032, 0.0032):
            row = []
            for j, fx in enumerate((-1.0, -0.6, 0.0, 0.6, 1.0)):
                ss = s + ds / sh.L
                x = sh.xc(ss) + fx * 0.017
                z = sh.field(x, ss)
                lift = -0.0012 if abs(fx) == 1.0 else 0.0022
                p = m["fwd"] * (m["u0"] + ss * sh.L) + m["lat"] * (sh.xm + x) + V((0, 0, z + lift))
                v = b.verts.new(p)
                v[trim_l] = 0.0
                v[acc_l] = 0.0
                row.append(v)
            rows.append(row)
        for j in range(4):
            b.faces.new((rows[0][j], rows[0][j + 1], rows[1][j + 1], rows[1][j]))
    bmesh.ops.recalc_face_normals(b, faces=b.faces[:])
    o = C.new_obj(name, b)
    C.smooth(o, 50)
    return o


def sock(name, body, dom, co, sfx, top=0.130, bottom=0.086):
    """A plain tube round the ankle: from under the leggings' hem down into the shoe's collar."""
    rings = []
    for z in (top, top - 0.012, 0.106, 0.096, bottom):
        pts = [co[i] for i in co if dom[i] in (f"shin_{sfx}", f"foot_{sfx}") and abs(co[i].z - z) < 0.011]
        xs = [p.x for p in pts]
        ys = [p.y for p in pts]
        c = V(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, z))
        rx, ry = (max(xs) - min(xs)) / 2 + 0.0014, (max(ys) - min(ys)) / 2 + 0.0014
        if z < 0.10:                                           # inside the shoe: the ankle's own width, not the heel's
            rx, ry = min(rx, rings[-1][1]), min(ry, rings[-1][2])
            c = V((rings[-1][0].x, rings[-1][0].y, z))
        rings.append((c, rx, ry))
    o = C.loft(name, [[c + V((rx * math.cos(a), ry * math.sin(a), 0)) for a in (math.tau * k / 20 for k in range(20))]
                      for c, rx, ry in rings])
    b = bmesh.new()
    b.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(b, faces=b.faces[:])
    b.to_mesh(o.data)
    b.free()
    C.set_attr(o, "trim", lambda i, p: 0.0)
    C.set_attr(o, "accent", lambda i, p: 0.0)
    C.smooth(o, 60)
    return o
