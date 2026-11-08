"""Procedural source for guest.glb (Forget to Foresee: one Guest), rigged and animated.

Run with Blender 4.5 LTS:

    blender -b -P art/guest/build_guest.py -- build    # model, UV, GPU bakes, rig, clips, export
    blender -b -P art/guest/build_guest.py -- render   # QA renders + animation contact sheet of the .glb
    blender -b -P art/guest/build_guest.py -- all

Design (original, owner concept 07.11 + style addendum; nothing from Arrival, nothing from
FromSoftware). The Guest is an ancient, unknowable creature that never touches the ground:
it hovers. A faceted, slightly flattened spindle of overlapping nacre-crystal growth plates
(the Shells' own growth language) rises out of a tapering tail spine and ends in a faceless
crown that coils forward like an ammonite whorl. Two great fan sails (radiating crystal spines
with a thin iridescent film between them) open from the shoulders, a low dorsal crest runs
down the back, six ribbon tendrils drift beneath it, and a single long jointed stylus limb
grows from the chest; it draws the round logograms. Old crazing cracks in the plates leak the
warm gold light of an inner core. No legs, no face, no radial seven-limb body.

Runtime parts (one skin, one armature `guest_rig`):
  guest_body       M_Guest_Nacre     nacre plates, crown, spines, tendrils, stylus limb
  guest_membranes  M_Guest_Membrane  sail and crest films (alpha blend, double sided)
  guest_core       M_Guest_Core      emissive core crystal inside the chest
Clips (glTF animations): `idle` (8 s loop), `draw` (4 s loop, the stylus traces a circle),
`react` (1.8 s one-shot startle, starts and ends at the rest pose).
Sockets: socket_draw_tip (child of the stylus tip joint), socket_core, socket_head.

Blender Z-up, front -Y (glTF: Y-up, front +Z). Pivot on the ground under the body.
"""

import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import blender_kit as K  # noqa: E402
from blender_kit import log  # noqa: E402

K.set_tag("guest")

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "guest")
TEX_DIR = os.path.join(HERE, "textures")
GLB_RAW = os.path.join(HERE, "guest_raw.glb")          # uncompressed export (not shipped)
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", "guest.glb")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")

SEED = 5119
S = 1.08                      # global scale: crown top ~6.4 m
TRI_BUDGET = 16000
BAKE = 4096
TEX = 2048
MEM_TEX = 1024
FPS = 30
CLIPS = {"idle": 8.0, "draw": 4.0, "react": 1.8}

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAU = 2 * math.pi


def V(x, y, z):
    return Vector((x * S, y * S, z * S))


def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def catmull(points, n):
    P = [Vector(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    segs = len(P) - 3
    out = []
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out


def arclen(pts):
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    return s


def frames_along(pts, up=Z):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline."""
    T = []
    for i in range(len(pts)):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        T.append((b - a).normalized())
    n = up.cross(T[0])
    if n.length < 1e-4:
        n = X.cross(T[0])
    n.normalize()
    N = [n]
    for i in range(1, len(pts)):
        n = N[-1] - T[i] * N[-1].dot(T[i])
        if n.length < 1e-6:
            n = N[-1]
        N.append(n.normalized())
    B = [t.cross(n) for t, n in zip(T, N)]
    return T, N, B


# ------------------------------------------------------------------ rig layout

class Chain:
    """A named run of bones along a polyline; joints at arc-length marks."""

    def __init__(self, name, pts, marks, parent, deform=True):
        self.name, self.pts, self.parent = name, pts, parent
        self.s = arclen(pts)
        self.marks = marks                       # arc-length positions of the joints (len = nbones+1)
        self.bones = [f"{name}_{i + 1}" for i in range(len(marks) - 1)]
        self.deform = deform

    def point(self, s):
        s = min(max(s, 0.0), self.s[-1])
        for i in range(len(self.s) - 1):
            if self.s[i + 1] >= s:
                f = (s - self.s[i]) / max(self.s[i + 1] - self.s[i], 1e-9)
                return self.pts[i].lerp(self.pts[i + 1], f)
        return self.pts[-1].copy()

    def weights(self, s, blend=0.18):
        """Linear-blend weights of the chain's bones at arc length s."""
        m = self.marks
        n = len(self.bones)
        w = {}
        i = 0
        while i < n - 1 and s > m[i + 1]:
            i += 1
        w[self.bones[i]] = 1.0
        h = blend * (m[i + 1] - m[i])
        if i < n - 1 and s > m[i + 1] - h:
            a = smooth(m[i + 1] - h, m[i + 1] + h, s)
            w = {self.bones[i]: 1 - a * 0.5, self.bones[i + 1]: a * 0.5}
        elif i > 0 and s < m[i] + h:
            a = smooth(m[i] - h, m[i] + h, s)
            w = {self.bones[i - 1]: 0.5 - a * 0.5, self.bones[i]: 0.5 + a * 0.5}
        return w


def mixw(*pairs):
    out = {}
    for f, w in pairs:
        for k, v in w.items():
            out[k] = out.get(k, 0.0) + f * v
    return out


def top4(w):
    items = sorted(((k, v) for k, v in w.items() if v > 1e-4), key=lambda kv: -kv[1])[:4]
    tot = sum(v for _, v in items) or 1.0
    return {k: v / tot for k, v in items}


class Layout:
    def __init__(self):
        rng = random.Random(SEED)
        # Axial centre line, tail tip -> chest -> crown whorl (coils forward, -Y).
        ctrl = [V(0, 0.30, 0.95), V(0, 0.16, 1.55), V(0, 0.02, 2.25), V(0, -0.06, 2.95), V(0, -0.02, 3.6),
                V(0, 0.08, 4.25), V(0, 0.06, 4.85), V(0, -0.05, 5.45), V(0, -0.30, 5.92), V(0, -0.70, 6.08),
                V(0, -1.02, 5.88), V(0, -1.10, 5.52), V(0, -0.93, 5.28), V(0, -0.74, 5.36), V(0, -0.70, 5.52)]
        self.axis_pts = catmull(ctrl, 150)
        sa = arclen(self.axis_pts)
        L = sa[-1]

        def s_at_z(z):
            for i, p in enumerate(self.axis_pts):
                if p.z >= z * S:
                    return sa[i]
            return L
        # joints: tail (3 bones), chest, upper, neck, crown (4 bones)
        self.s_chest0, self.s_chest1 = s_at_z(2.55), s_at_z(3.85)
        marks = [0.0, s_at_z(1.45), s_at_z(2.0), self.s_chest0, self.s_chest1, s_at_z(4.5), s_at_z(5.1)]
        rest = L - marks[-1]
        marks += [marks[-1] + rest * f for f in (0.28, 0.52, 0.76, 1.0)]
        self.axis = Chain("ax", self.axis_pts, marks, None)
        # Readable names for the axial bones.
        self.axis.bones = ["tail_3", "tail_2", "tail_1", "chest", "spine", "neck",
                           "crown_1", "crown_2", "crown_3", "crown_4"]
        self.L = L

        # Sails: fans of 6 curved spines from each shoulder.
        self.sails = []
        for side in (-1, 1):
            root = V(side * 0.52, 0.12, 4.02)
            spines = []
            elevs = [78, 56, 34, 12, -12, -36]
            lens = [2.55, 3.15, 3.35, 3.1, 2.6, 2.0]
            for k, (el, ln) in enumerate(zip(elevs, lens)):
                e = math.radians(el)
                sweep = math.radians(22 + 6 * k)
                d = Vector((side * math.cos(e) * math.cos(sweep), math.cos(e) * math.sin(sweep) + 0.15,
                            math.sin(e))).normalized()
                back = Vector((0, 1, -0.25)).normalized()
                ln *= S
                pts = catmull([root, root + d * ln * 0.34 + back * 0.04 * ln,
                               root + d * ln * 0.68 + back * 0.12 * ln, root + d * ln + back * 0.24 * ln], 24)
                sl = arclen(pts)[-1]
                spines.append(Chain(f"sail_{'l' if side < 0 else 'r'}{k}", pts,
                                    [0.0, sl * 0.30, sl * 0.62, sl], "spine"))
            self.sails.append((side, spines))

        # Dorsal crest: 5 short spines down the back.
        self.dorsal = []
        for k in range(5):
            z = 2.75 + k * 0.42
            s0 = s_at_z(z)
            base = self.axis.point(s0)
            r = self.radius(s0)
            root = base + Vector((0, r * 0.78, 0))
            ln = (0.95 + 0.35 * math.sin(math.pi * (k + 0.5) / 5)) * S
            d = Vector((0, 0.85, 0.55 - 0.08 * k)).normalized()
            pts = catmull([root, root + d * ln * 0.5 + Vector((0, 0, 0.06)), root + d * ln + Vector((0, 0.1, 0.12))], 12)
            sl = arclen(pts)[-1]
            parent = self.axis.bones[self.axis_bone_index(s0)]
            self.dorsal.append(Chain(f"crest{k}", pts, [0.0, sl * 0.5, sl], parent))

        # Tendrils: six ribbons from the belly ring.
        self.tendrils = []
        for k in range(6):
            a = TAU * (k + 0.5) / 6 + rng.uniform(-0.12, 0.12)
            z0 = 2.05
            s0 = s_at_z(z0)
            c = self.axis.point(s0)
            r = self.radius(s0) * 0.82
            root = c + Vector((math.cos(a) * r, math.sin(a) * r, 0))
            ln = rng.uniform(1.55, 2.0) * S
            out = Vector((math.cos(a), math.sin(a), 0))
            pts = catmull([root, root + out * 0.25 + Vector((0, 0.05, -ln * 0.3)),
                           root + out * 0.42 + Vector((0, 0.15, -ln * 0.62)),
                           root + out * 0.5 + Vector((0, 0.28, -ln))], 30)
            sl = arclen(pts)[-1]
            self.tendrils.append(Chain(f"tendril{k}", pts, [sl * f for f in (0, 0.18, 0.38, 0.6, 0.8, 1.0)], "tail_1"))

        # Stylus limb from the chest front; rests folded down and forward.
        root = V(0.30, -0.62, 3.70)
        arm_pts = catmull([root, V(0.52, -1.05, 3.55), V(0.70, -1.45, 3.05), V(0.62, -1.62, 2.45),
                           V(0.45, -1.70, 1.95), V(0.36, -1.74, 1.62)], 40)
        sl = arclen(arm_pts)[-1]
        self.arm = Chain("arm", arm_pts, [0.0, sl * 0.30, sl * 0.58, sl * 0.82, sl], "chest")
        self.tip = arm_pts[-1].copy()

    def axis_bone_index(self, s):
        m = self.axis.marks
        for i in range(len(m) - 1):
            if s <= m[i + 1]:
                return i
        return len(m) - 2

    def radius(self, s):
        """Body radius along the axis (m)."""
        p = self.axis.point(s)
        z = p.z / S
        t = s / self.L
        if t < 0.62:
            prof = [(0.95, 0.03), (1.4, 0.16), (2.1, 0.42), (2.7, 0.78), (3.25, 0.98), (3.8, 0.86),
                    (4.3, 0.62), (4.85, 0.40), (5.3, 0.44)]
            r = prof[-1][1]
            for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
                if z0 <= z <= z1:
                    f = smooth(0, 1, (z - z0) / (z1 - z0))
                    r = r0 + (r1 - r0) * f
                    break
            if z < prof[0][0]:
                r = prof[0][1]
            return r * S
        # crown whorl: taper to a point along the coil
        s_c = self.axis.marks[6]
        f = (s - s_c) / (self.L - s_c)
        return (0.44 * (1 - f) ** 1.25 + 0.025) * S


# ------------------------------------------------------------------ mesh building

class Part:
    """bmesh + per-vertex weights + UV, one material."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.w = []

    def vert(self, co, w):
        v = self.bm.verts.new(co)
        self.w.append(top4(w))
        return v

    def face(self, vs, uvs=None):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        if uvs:
            for lp, c in zip(f.loops, uvs):
                lp[self.uv].uv = c
        return f

    def grid(self, rows, closed=True, uv_rows=None):
        nr, nc = len(rows), len(rows[0])
        ncu = nc if closed else nc - 1
        for i in range(nr - 1):
            for j in range(ncu):
                j2 = (j + 1) % nc
                vs = [rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j]]
                uvs = None
                if uv_rows:
                    uvs = [uv_rows[i][j], uv_rows[i][j + 1 if closed else j2],
                           uv_rows[i + 1][j + 1 if closed else j2], uv_rows[i + 1][j]]
                self.face(vs, uvs)

    def cap(self, ring, tip_co, w):
        t = self.vert(tip_co, w)
        n = len(ring)
        for j in range(n):
            self.face([ring[j], ring[(j + 1) % n], t])


def build_body(P, lay, rng):
    """Axial spindle of overlapping growth plates + crown whorl."""
    ax = lay.axis
    sides = 14
    pts = lay.axis_pts
    T, N, B = frames_along(pts, up=X)
    sa = ax.s
    rows = []
    twist = 0.0
    plate = 0.0
    nrows = len(pts)
    for i in range(nrows):
        s = sa[i]
        r = lay.radius(s)
        # growth plates: sawtooth on the radius (each plate's lower rim overlaps the next)
        z = pts[i].z / S
        if s < lay.axis.marks[6]:
            per = 0.30 + 0.06 * math.sin(z * 1.7)
            plate = (z / per) % 1.0
            r *= 0.93 + 0.10 * plate ** 1.6
        twist += 0.035
        w_ax = ax.weights(s)
        ring = []
        for j in range(sides):
            a = TAU * j / sides + twist
            facet = 1.0 + 0.045 * math.cos(3 * a + 0.4 * i)        # irregular crystal faceting
            flat = 0.84                                            # bilateral: flatter front-back
            off = N[i] * (math.cos(a) * r * facet) + B[i] * (math.sin(a) * r * facet * flat)
            ring.append(P.vert(pts[i] + off, w_ax))
        rows.append(ring)
    P.grid(rows, closed=True)
    P.cap(list(reversed(rows[0])), pts[0] - T[0] * 0.04, ax.weights(0.0))
    P.cap(rows[-1], pts[-1] + T[-1] * 0.03, ax.weights(sa[-1]))

    # Crystal shards on the shoulders, along the back and around the crown base.
    def shard(base, d, ln, wid, w, sides=5):
        d = d.normalized()
        t1 = d.cross(Z if abs(d.z) < 0.9 else X).normalized()
        t2 = d.cross(t1)
        a0 = rng.uniform(0, TAU)
        r0 = [P.vert(base + (t1 * math.cos(a0 + TAU * k / sides) + t2 * math.sin(a0 + TAU * k / sides)) * wid, w)
              for k in range(sides)]
        r1 = [P.vert(base + d * ln * 0.78 + (t1 * math.cos(a0 + TAU * k / sides) + t2 * math.sin(a0 + TAU * k / sides))
                     * wid * 0.72, w) for k in range(sides)]
        P.grid([r0, r1], closed=True)
        P.cap(r1, base + d * ln, w)
        P.cap(list(reversed(r0)), base - d * wid * 0.5, w)

    for side in (-1, 1):
        for k in range(5):
            s0 = ax.marks[4] - 0.05 * S - k * 0.09 * S
            c = ax.point(s0)
            r = lay.radius(s0)
            a = math.radians(rng.uniform(60, 120)) if side > 0 else math.radians(rng.uniform(60, 120))
            base = c + Vector((side * r * 0.8, r * 0.35 + rng.uniform(-0.1, 0.15), rng.uniform(-0.15, 0.15)))
            d = Vector((side * 0.55, 0.45 + rng.uniform(0, 0.3), 0.8))
            shard(base, d, rng.uniform(0.35, 0.75) * S, rng.uniform(0.05, 0.09) * S, ax.weights(s0))
    for k in range(7):
        s0 = ax.marks[2] + k * 0.38 * S
        c = ax.point(s0)
        r = lay.radius(s0)
        side = -1 if k % 2 else 1
        base = c + Vector((side * r * 0.42, r * 0.72, 0))
        d = Vector((side * 0.35, 0.9, 0.45))
        shard(base, d, rng.uniform(0.28, 0.5) * S, rng.uniform(0.04, 0.07) * S, ax.weights(s0))
    s_c = ax.marks[6]
    for k in range(6):
        s0 = s_c + 0.08 * S
        c = ax.point(s0)
        r = lay.radius(s0)
        a = TAU * k / 6 + 0.3
        base = c + Vector((math.cos(a) * r * 0.85, math.sin(a) * r * 0.85 + 0.1, -0.05))
        d = Vector((math.cos(a) * 0.6, math.sin(a) * 0.6 + 0.4, 0.75))
        shard(base, d, rng.uniform(0.3, 0.55) * S, 0.05 * S, ax.weights(s0))


def tube_along(P, chain, rfun, sides, squash=1.0, up=None, twist=0.0, closed_tip=True):
    pts = chain.pts
    T, N, B = frames_along(pts, up=up or Z)
    sa = chain.s
    rows = []
    for i, p in enumerate(pts):
        r = rfun(sa[i] / sa[-1])
        w = chain.weights(sa[i])
        ring = []
        for j in range(sides):
            a = TAU * j / sides + twist * i
            ring.append(P.vert(p + N[i] * (math.cos(a) * r) + B[i] * (math.sin(a) * r * squash), w))
        rows.append(ring)
    P.grid(rows, closed=True)
    P.cap(list(reversed(rows[0])), pts[0] - T[0] * 0.02, chain.weights(0.0))
    if closed_tip:
        P.cap(rows[-1], pts[-1] + T[-1] * 0.02, chain.weights(sa[-1]))


def build_spines_tendrils_arm(P, lay):
    for side, spines in lay.sails:
        for ch in spines:
            tube_along(P, ch, lambda t: (0.055 * (1 - t) + 0.012) * S, 5)
    for ch in lay.dorsal:
        tube_along(P, ch, lambda t: (0.045 * (1 - t) + 0.01) * S, 5)
    for ch in lay.tendrils:
        tube_along(P, ch, lambda t: (0.075 * (1 - t) ** 0.8 + 0.008) * S, 6, squash=0.45, twist=0.12)

    # Stylus limb: segmented crystal tube with knuckles, ends in a bipyramid stylus.
    def r_arm(t):
        knuckle = sum(math.exp(-((t - m) / 0.025) ** 2) for m in (0.30, 0.58, 0.82)) * 0.022
        return (0.085 * (1 - t) + 0.028 + knuckle) * S
    tube_along(P, lay.arm, r_arm, 7, closed_tip=False)
    ch = lay.arm
    T, N, B = frames_along(ch.pts, up=Z)
    tip, d = ch.pts[-1], T[-1]
    w = ch.weights(ch.s[-1])
    ring = [P.vert(tip + d * 0.10 * S + (N[-1] * math.cos(TAU * k / 6) + B[-1] * math.sin(TAU * k / 6)) * 0.06 * S, w)
            for k in range(6)]
    # bridge from the last tube ring is skipped (tiny gap hidden inside the stylus collar)
    P.cap(ring, tip + d * 0.48 * S, w)
    P.cap(list(reversed(ring)), tip - d * 0.06 * S, w)
    lay.tip = tip + d * 0.48 * S


def build_membranes(P, lay):
    """Films between neighbouring spines (sails) and crest spines."""
    def film(spines, cols, rows_n, scallop, billow, u0, u_span, root_w=None):
        n = len(spines)
        for k in range(n - 1):
            a, b = spines[k], spines[k + 1]
            na = (a.pts[-1] - a.pts[0]).normalized()
            nb = (b.pts[-1] - b.pts[0]).normalized()
            nrm = na.cross(nb)
            if nrm.length < 1e-6:
                nrm = Z.copy()
            nrm.normalize()
            grid, uvg = [], []
            for i in range(rows_n + 1):
                s = i / rows_n
                row, uvr = [], []
                for j in range(cols + 1):
                    g = j / cols
                    smax = 1.0 - scallop * math.sin(math.pi * g)
                    ss = s * smax
                    pa = a.point(ss * a.s[-1])
                    pb = b.point(ss * b.s[-1])
                    p = pa.lerp(pb, g) + nrm * (billow * math.sin(math.pi * g) * math.sin(math.pi * s) * S)
                    w = mixw((1 - g, a.weights(ss * a.s[-1])), (g, b.weights(ss * b.s[-1])))
                    row.append(P.vert(p, w))
                    uvr.append((u0 + (k + g) / (n - 1) * u_span, ss))
                grid.append(row)
                uvg.append(uvr)
            P.grid(grid, closed=False, uv_rows=uvg)
    for side, spines in lay.sails:
        film(spines, 5, 12, 0.16, 0.10, 0.0 if side < 0 else 0.5, 0.5)
    film(lay.dorsal, 4, 6, 0.22, 0.05, 0.0, 1.0)


def build_core(P, lay):
    c = lay.axis.point((lay.s_chest0 + lay.s_chest1) / 2)
    w = {"chest": 1.0}
    h, r = 0.55 * S, 0.30 * S
    ring = [P.vert(c + Vector((math.cos(TAU * k / 7) * r, math.sin(TAU * k / 7) * r * 0.8, 0)), w) for k in range(7)]
    P.cap(ring, c + Vector((0, 0, h)), w)
    P.cap(list(reversed(ring)), c - Vector((0, 0, h * 0.8)), w)
    lay.core = c


def part_object(P, col, mat, group_names):
    me = bpy.data.meshes.new(P.name)
    dl = P.bm.verts.layers.deform.verify()
    idx = {n: i for i, n in enumerate(group_names)}
    for v, w in zip(P.bm.verts, P.w):
        for k, val in w.items():
            v[dl][idx[k]] = val
    bmesh.ops.recalc_face_normals(P.bm, faces=P.bm.faces[:])
    P.bm.normal_update()
    P.bm.to_mesh(me)
    P.bm.free()
    me.materials.append(mat)
    o = K.link(bpy.data.objects.new(P.name, me), col)
    for n in group_names:
        o.vertex_groups.new(name=n)
    return o


# ------------------------------------------------------------------ materials

def nacre_bake_material():
    bm = K.BakeMaterial("H_GuestNacre")
    k = bm.k
    co = k.coord("Object")
    sep = k.sepxyz(co)
    warp = k.noise(co, 1.1, 3.0, 0.5, color=True)
    wco = k.vmath("ADD", co, k.vscale(warp, 0.25))
    bands = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z", wave_profile="SAW")
    k.link(wco, bands.inputs["Vector"])
    bands.inputs["Scale"].default_value = 5.5
    bands.inputs["Distortion"].default_value = 1.5
    bands.inputs["Detail"].default_value = 2.0
    growth = bands.outputs["Fac"]
    fine = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z")
    k.link(wco, fine.inputs["Vector"])
    fine.inputs["Scale"].default_value = 60.0
    fine.inputs["Distortion"].default_value = 4.0
    fine_l = fine.outputs["Fac"]
    # ancient crazing: a crack network that leaks the core's gold light
    cco = k.vmath("ADD", co, k.vscale(k.noise(co, 3.0, 3.0, 0.6, color=True), 0.12))
    crack = k.maprange(k.voronoi(cco, 4.2, feature="DISTANCE_TO_EDGE"), 0.0, 0.012, 1.0, 0.0)
    crack2 = k.maprange(k.voronoi(cco, 11.0, feature="DISTANCE_TO_EDGE"), 0.0, 0.006, 1.0, 0.0)
    crack2 = k.math("MULTIPLY", crack2, k.maprange(k.noise(co, 1.5, 2.0, 0.5), 0.45, 0.62))
    cracks = k.math("MAXIMUM", crack, crack2)
    cell = k.sepxyz(k.voronoi(co, 9.0, feature="F1", out="Color"))[0]
    mott = k.noise(co, 2.4, 5.0, 0.6)
    crev = k.maprange(k.ao(0.08 * S, 16), 0.3, 0.95, 1.0, 0.0)
    # pearl: ivory -> blue-grey, faint rose/teal drift (iridescence does the rest at runtime)
    base = k.ramp(mott, [(0.25, (0.50, 0.50, 0.50)), (0.5, (0.66, 0.63, 0.58)), (0.8, (0.74, 0.71, 0.66))])
    hue = k.ramp(k.math("ADD", k.math("MULTIPLY", growth, 0.6), k.math("MULTIPLY", mott, 0.8)),
                 [(0.15, (1.0, 0.95, 0.92)), (0.45, (0.92, 0.97, 1.0)), (0.75, (1.0, 0.98, 0.90)),
                  (1.0, (0.95, 0.93, 1.0))])
    col = k.mix(1.0, base, hue, blend="MULTIPLY")
    col = k.mix(k.math("MULTIPLY", growth, 0.25), col, (0.86, 0.84, 0.80))
    # weathering: umber staining in crevices and low on the tail
    low = k.maprange(sep[2], 0.6 * S, 2.2 * S, 0.55, 0.0)
    col = k.mix(k.math("MAXIMUM", k.math("MULTIPLY", crev, 0.85), low), col, (0.16, 0.14, 0.12))
    gold_fleck = k.math("MULTIPLY", k.maprange(cell, 0.90, 0.93), k.maprange(growth, 0.6, 0.9))
    gold = k.math("MAXIMUM", gold_fleck, k.math("MULTIPLY", cracks, 0.9))
    col = k.mix(gold, col, (0.78, 0.56, 0.24))
    rough = k.math("ADD", k.maprange(mott, 0.2, 0.8, 0.16, 0.30),
                   k.math("ADD", k.math("MULTIPLY", crev, 0.30), k.math("MULTIPLY", fine_l, 0.05)), clamp=True)
    rough = k.mix(gold, rough, 0.22)
    metal = k.math("MULTIPLY", gold, 0.95)
    # emission: crack light, strongest around the chest core, a faint seam glow on the crown
    core_c = (0, -0.04 * S, 3.2 * S)
    d = k.new("ShaderNodeVectorMath", operation="DISTANCE")
    k.link(co, d.inputs[0])
    d.inputs[1].default_value = core_c
    near = k.maprange(d.outputs["Value"], 0.6 * S, 1.6 * S, 1.0, 0.12)
    emis = k.mix(k.math("MULTIPLY", cracks, near), (0, 0, 0), (1.0, 0.56, 0.20))
    height = k.math("SUBTRACT", k.math("ADD", k.math("MULTIPLY", growth, 0.5), k.math("MULTIPLY", fine_l, 0.08)),
                    k.math("MULTIPLY", cracks, 0.6))
    bm.set(col, rough, metal, normal=K.bump_normal(k, height, 0.45, 0.012), emission=emis)
    return bm


def membrane_texture(n, seed):
    """Sail film in UV space (u across the fan, v radial): venation cells, pearly tint,
    gold rim. Returns RGBA (bottom-up) and an emissive RGB."""
    import numpy as np
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n] / n
    gx, gy = 40, 18
    best1 = np.full((n, n), 9.0)
    best2 = np.full((n, n), 9.0)
    jit = rng.uniform(0.1, 0.9, (gy, gx, 2))
    for j in range(gy):
        for i in range(gx):
            px, py = (i + jit[j, i, 0]) / gx, (j + jit[j, i, 1]) / gy
            dx = (xx - px)
            dx = np.minimum(np.abs(dx), 1 - np.abs(dx)) * gx
            d = np.sqrt(dx ** 2 + ((yy - py) * gy * 0.75) ** 2)
            closer = d < best1
            best2 = np.where(closer, best1, np.minimum(best2, d))
            best1 = np.where(closer, d, best1)
    edge = best2 - best1
    vein = np.clip(1.0 - edge / 0.09, 0, 1) ** 2
    # radial ribs every spine gap (u in 5 + 5 gaps for the sails, 4 for the crest share the space)
    rib = np.clip(1 - np.abs(((xx * 10) % 1.0) - 0.5) * 2 / 0.05, 0, 1) * 0.0
    rim = np.clip((yy - 0.90) / 0.10, 0, 1)
    root = np.clip(1 - yy / 0.10, 0, 1)
    frayed = (rng.uniform(0, 1, (n, n)) > 0.5) * 0.0
    alpha = 0.20 + 0.12 * yy + 0.55 * vein + 0.55 * rim + 0.5 * root + rib + frayed
    hue = 2 * np.pi * (xx * 2.0 + yy * 1.2)
    lum = 0.72 + 0.14 * vein
    tint = 0.07
    rgb = np.stack([lum * (1 + tint * np.cos(hue)), lum * (1 + tint * np.cos(hue - 2.094)),
                    lum * (0.97 + tint * np.cos(hue + 2.094))], -1)
    gold = np.array([0.80, 0.58, 0.26])
    g = np.clip(rim * 0.9 + vein * 0.25, 0, 1)[..., None]
    rgb = rgb * (1 - g) + gold * g
    emis = (np.clip(vein * 0.35 + rim * 0.6, 0, 1)[..., None] * np.array([1.0, 0.62, 0.25])) * \
        (0.35 + 0.65 * yy)[..., None]
    return np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], -1), emis


def final_nacre(paths):
    m = K.pbr_material("M_Guest_Nacre", base=K.load_image(paths["base"]),
                       orm=K.load_image(paths["orm"], data=True), normal=K.load_image(paths["normal"], data=True),
                       emissive=K.load_image(paths["emissive"]), emissive_strength=3.0)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Transmission Weight"].default_value = 0.08   # 0.25 let the core shine through the chest
    b.inputs["IOR"].default_value = 1.53
    for nm, v in (("Thin Film Thickness", 380.0), ("Thin Film IOR", 1.36)):
        if nm in b.inputs:
            b.inputs[nm].default_value = v
    return m


def final_membrane(paths):
    m = K.pbr_material("M_Guest_Membrane", base=K.load_image(paths["mem_base"]), base_alpha=True,
                       emissive=K.load_image(paths["mem_emissive"]), emissive_strength=1.5, rough=0.22)
    b = m.node_tree.nodes["Principled BSDF"]
    for nm, v in (("Thin Film Thickness", 520.0), ("Thin Film IOR", 1.33)):
        if nm in b.inputs:
            b.inputs[nm].default_value = v
    K.set_blended(m)
    m.use_backface_culling = False
    return m


def final_core():
    m = K.mat_simple("M_Guest_Core", (1.0, 0.86, 0.62), rough=0.1, emit=(1.0, 0.70, 0.36), emit_strength=2.5)  # 8.0 shone through the chest as an oval
    return m


# ------------------------------------------------------------------ armature

def build_armature(lay, col):
    arm = bpy.data.armatures.new("guest_rig")
    obj = K.link(bpy.data.objects.new("guest_rig", arm), col)
    K.select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones

    def bone(name, head, tail, parent=None, deform=True):
        b = eb.new(name)
        b.head, b.tail = head, tail
        b.roll = 0.0
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        return b

    bone("root", Vector((0, 0, 0)), Vector((0, 0.6 * S, 0)))
    ax = lay.axis
    c0, c1 = ax.point(ax.marks[3]), ax.point(ax.marks[4])
    bone("hover", c0 - Vector((0, 0, 0.3)), c0, "root")
    bone("chest", c0, c1, "hover")
    # tail chain hangs down from the chest
    prev = "chest"
    for i in (2, 1, 0):
        nm = ax.bones[i]
        bone(nm, ax.point(ax.marks[i + 1]), ax.point(ax.marks[i]), prev)
        prev = nm
    prev = "chest"
    for i in range(4, len(ax.bones)):
        nm = ax.bones[i]
        bone(nm, ax.point(ax.marks[i]), ax.point(ax.marks[i + 1]), prev)
        prev = nm
    for chains in [sp for _, sp in lay.sails] + [lay.dorsal, lay.tendrils, [lay.arm]]:
        for ch in chains:
            prev = ch.parent
            for i, nm in enumerate(ch.bones):
                bone(nm, ch.point(ch.marks[i]), ch.point(ch.marks[i + 1]), prev)
                prev = nm
    # IK helper (non-deform, not exported)
    t = lay.tip
    bone("ik_draw_target", t, t + Vector((0, -0.25, 0)), "hover", deform=False)
    bone("ik_draw_pole", V(1.9, -0.8, 3.4), V(1.9, -0.8, 3.65), "hover", deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return obj


def deform_bone_names(lay):
    names = ["chest"] + [lay.axis.bones[i] for i in range(len(lay.axis.bones)) if lay.axis.bones[i] != "chest"]
    for chains in [sp for _, sp in lay.sails] + [lay.dorsal, lay.tendrils, [lay.arm]]:
        for ch in chains:
            names += ch.bones
    return names


# ------------------------------------------------------------------ animation

class Animator:
    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}

    def local_axis(self, bone, world_axis):
        return (self.rest[bone].to_3x3().inverted() @ Vector(world_axis)).normalized()

    def rot(self, bone, axis, ang):
        return Quaternion(self.local_axis(bone, axis), ang)

    def loc(self, bone, world_off):
        return self.rest[bone].to_3x3().inverted() @ Vector(world_off)

    def new_action(self, name, seconds):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        if self.rig.animation_data is None:
            self.rig.animation_data_create()
        self.rig.animation_data.action = act
        n = int(round(seconds * FPS))
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, n
        return act, n

    def key_pose(self, f, pose):
        """pose: {bone: (Quaternion or None, loc or None, scale or None)}"""
        for pb in self.rig.pose.bones:
            q, l, s = pose.get(pb.name, (None, None, None))
            pb.rotation_quaternion = q if q is not None else Quaternion()
            pb.location = l if l is not None else Vector()
            pb.scale = (s, s, s) if s is not None else (1, 1, 1)
            if pb.name.startswith("ik_"):
                continue
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)
            if pb.name == "chest":
                pb.keyframe_insert("scale", frame=f)


def side_of(name):
    return -1 if "_l" in name[:6] else 1


def sail_axes(lay):
    """Per sail bone: (flap axis, fold axis) in world rest space."""
    out = {}
    for side, spines in lay.sails:
        for k, ch in enumerate(spines):
            d = (ch.pts[-1] - ch.pts[0]).normalized()
            nrm = Vector((0, 1, 0)).cross(d) if False else None
            # membrane normal ~ the fan plane normal: fan spans up/out, so normal ~ +/-Y-ish
            a = spines[max(k - 1, 0)].pts[-1] - spines[0].pts[0]
            b = spines[min(k + 1, len(spines) - 1)].pts[-1] - spines[0].pts[0]
            n = a.cross(b)
            if n.length < 1e-6:
                n = Y.copy()
            n.normalize()
            flap = d.cross(n).normalized()           # rotating about this moves the tip along n
            fold = Vector((0, 0, 1)) if False else n  # rotating about n sweeps within the fan
            for nm in ch.bones:
                out[nm] = (flap, fold, d)
    return out


def pose_idle(an, lay, t, T, amp=1.0, period=None):
    """Idle at time t (seconds) for loop length T. All frequencies are integer multiples of 1/T."""
    P = {}
    w = TAU / T
    per = period or T
    w2 = TAU / per
    # hover drift: bob, sway, slow yaw (gentle, monumental)
    bob = 0.13 * math.sin(w * t) + 0.04 * math.sin(2 * w * t + 1.1)
    sway = 0.06 * math.sin(w * t + 0.7)
    P["hover"] = (Quaternion(Z, 0.035 * math.sin(w * t + 0.3)) @ Quaternion(X, 0.02 * math.sin(w * t + 2.0)),
                  an.loc("hover", (sway, 0.04 * math.sin(2 * w * t), bob)), None)
    # breathing: the chest swells on a 4 s cycle
    br = math.sin(2 * w * t) if T >= 8 else math.sin(w * t)
    P["chest"] = (an.rot("chest", X, 0.02 * br), None, 1.0 + 0.028 * br * amp)
    # axial undulation travelling up the spine and down the tail
    up = ["spine", "neck", "crown_1", "crown_2", "crown_3", "crown_4"]
    for i, nm in enumerate(up):
        a = 0.035 * math.sin(2 * w * t - 0.7 * (i + 1)) + 0.02 * math.sin(w * t - 0.5 * i)
        P[nm] = (an.rot(nm, X, a * amp) @ an.rot(nm, Y, 0.015 * math.sin(w * t + i)), None, None)
    for i, nm in enumerate(["tail_1", "tail_2", "tail_3"]):
        a = 0.07 * math.sin(2 * w * t - 0.9 * (i + 1))
        P[nm] = (an.rot(nm, X, a * amp) @ an.rot(nm, Y, 0.06 * math.sin(w * t - 0.8 * i)), None, None)
    # sails: slow open/close breath + ripple waves running out along each spine and across the fan
    ax = sail_axes(lay)
    for side, spines in lay.sails:
        for k, ch in enumerate(spines):
            for j, nm in enumerate(ch.bones):
                flap, fold, d = ax[nm]
                ripple = (0.06 + 0.035 * j) * math.sin(2 * w * t - 0.55 * k - 0.9 * j)
                breath = (0.07 * br if j == 0 else 0.0)
                q = an.rot(nm, flap, (ripple + breath) * amp)
                if j == 0:
                    q = an.rot(nm, fold, side * 0.03 * math.sin(w * t + 0.4 * k) * amp) @ q
                P[nm] = (q, None, None)
    for k, ch in enumerate(lay.dorsal):
        for j, nm in enumerate(ch.bones):
            P[nm] = (an.rot(nm, X, 0.10 * math.sin(3 * w * t - 0.8 * k - 0.6 * j) * amp
                            if T >= 8 else 0.10 * math.sin(2 * w * t - 0.8 * k - 0.6 * j) * amp), None, None)
    # tendrils: lagging figure-eight drift, growing toward the tips
    for k, ch in enumerate(lay.tendrils):
        ph = k * 1.05
        for j, nm in enumerate(ch.bones):
            a1 = (0.05 + 0.03 * j) * math.sin(w * t - 0.6 * j + ph)
            a2 = (0.04 + 0.025 * j) * math.sin(2 * w * t - 0.7 * j + ph * 0.5)
            P[nm] = (an.rot(nm, X, a1) @ an.rot(nm, Y, a2), None, None)
    # stylus limb: hangs and sways slightly
    for j, nm in enumerate(lay.arm.bones):
        P[nm] = (an.rot(nm, X, 0.03 * math.sin(w * t - 0.5 * j)) @ an.rot(nm, Z, 0.025 * math.sin(2 * w * t - j)),
                 None, None)
    return P


def make_idle(an, lay):
    act, n = an.new_action("idle", CLIPS["idle"])
    T = CLIPS["idle"]
    for f in range(0, n + 1, 2):
        an.key_pose(f, pose_idle(an, lay, f / FPS, T))
    return act


def make_draw(an, lay, rig):
    """The stylus traces a circular logogram stroke in front of the body (4 s loop): an IK
    target bone runs the circle; the IK result is baked to plain rotations."""
    act, n = an.new_action("draw", CLIPS["draw"])
    T = CLIPS["draw"]
    centre = V(0.10, -2.05, 3.65)
    R = 0.80 * S
    tgt_rest = an.rest["ik_draw_target"].translation
    pb_t = rig.pose.bones["ik_draw_target"]
    circle = []
    for f in range(0, n + 1):
        t = f / FPS
        th = TAU * t / T
        r = R * (1 + 0.06 * math.sin(3 * th) + 0.03 * math.sin(5 * th + 1.0))
        # vertical circle facing -Y (toward the glass), drawn clockwise as seen by the viewer, from the top
        p = centre + Vector((r * math.sin(th), -0.12 * S * math.sin(2 * th), r * math.cos(th)))
        circle.append(p)
        pose = pose_idle(an, lay, t, T, amp=0.6)
        # lean into the stroke; crown follows the stylus
        lean = Quaternion(Z, 0.06 * math.sin(th)) @ Quaternion(X, 0.05)
        q, l, s = pose["hover"]
        pose["hover"] = (lean @ q, l, s)
        for i, nm in enumerate(("neck", "crown_1")):
            q, _, _ = pose[nm]
            pose[nm] = (an.rot(nm, Z, -0.08 * math.sin(th)) @ an.rot(nm, X, 0.05 * math.cos(th)) @ q, None, None)
        for nm in lay.arm.bones:
            pose[nm] = (None, None, None)
        an.key_pose(f, pose)
        pb_t.location = an.loc("ik_draw_target", p - tgt_rest)
        pb_t.keyframe_insert("location", frame=f)
    ik = rig.pose.bones[lay.arm.bones[-1]].constraints.new("IK")
    ik.target, ik.subtarget = rig, "ik_draw_target"
    ik.pole_target, ik.pole_subtarget = rig, "ik_draw_pole"
    ik.pole_angle = math.radians(-90)
    ik.chain_count = len(lay.arm.bones)
    ik.use_tail = True
    ik.use_stretch = False
    K.select_only([rig], rig)
    bpy.ops.object.mode_set(mode="POSE")
    for b in rig.data.bones:
        b.select = b.name in lay.arm.bones
    bpy.ops.nla.bake(frame_start=0, frame_end=n, step=1, only_selected=True, visual_keying=True,
                     clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    # measured stylus tip path (rest-relative, evaluated after the bake)
    tips = []
    tip_bone = lay.arm.bones[-1]
    for f in range(0, n + 1, 3):
        bpy.context.scene.frame_set(f)
        pbm = rig.pose.bones[tip_bone]
        tips.append((rig.matrix_world @ pbm.tail).copy())
    err = [min((tp - c).length for c in circle) for tp in tips]
    return act, {"circle_centre_m": [round(v, 3) for v in centre], "radius_m": round(R, 3),
                 "tip_to_circle_err_m_max": round(max(err), 3), "tip_to_circle_err_m_mean": round(sum(err) / len(err), 3)}


def make_react(an, lay):
    """Startle: recoil back and up, sails flare and shiver, tendrils curl, stylus snaps in.
    Starts and ends at the rest pose so it blends from either loop."""
    act, n = an.new_action("react", CLIPS["react"])
    ax = sail_axes(lay)
    for f in range(0, n + 1):
        t = f / FPS
        e = smooth(0.0, 0.16, t) * (1 - smooth(0.55, 1.75, t))            # envelope
        shiver = math.sin(TAU * 7.5 * t) * math.exp(-3.2 * t) * smooth(0.0, 0.1, t)
        settle = math.sin(TAU * 1.4 * (t - 0.5)) * smooth(0.5, 0.8, t) * (1 - smooth(1.0, 1.75, t)) * 0.3
        P = {}
        P["hover"] = (Quaternion(X, -0.16 * e), an.loc("hover", (0, 0.55 * e * S, 0.30 * e * S + 0.08 * settle)), None)
        P["chest"] = (an.rot("chest", X, -0.08 * e), None, 1.0 + 0.06 * e)
        for i, nm in enumerate(["spine", "neck", "crown_1", "crown_2", "crown_3", "crown_4"]):
            P[nm] = (an.rot(nm, X, (-0.10 + 0.03 * i) * e + 0.04 * shiver), None, None)
        for i, nm in enumerate(["tail_1", "tail_2", "tail_3"]):
            P[nm] = (an.rot(nm, X, 0.22 * e * (1 + 0.3 * i)), None, None)
        for side, spines in lay.sails:
            for k, ch in enumerate(spines):
                for j, nm in enumerate(ch.bones):
                    flap, fold, d = ax[nm]
                    a = (-0.30 * e if j == 0 else -0.08 * e) + (0.10 + 0.04 * j) * shiver
                    q = an.rot(nm, flap, a)
                    if j == 0:
                        q = an.rot(nm, fold, side * 0.12 * e * (k - 2.5) / 2.5) @ q
                    P[nm] = (q, None, None)
        for k, ch in enumerate(lay.dorsal):
            for j, nm in enumerate(ch.bones):
                P[nm] = (an.rot(nm, X, -0.35 * e + 0.12 * shiver), None, None)
        for k, ch in enumerate(lay.tendrils):
            root = ch.pts[0]
            out = Vector((root.x, root.y, 0)).normalized()
            curl = out.cross(Z)
            for j, nm in enumerate(ch.bones):
                P[nm] = (an.rot(nm, curl, -0.28 * e * (0.6 + 0.2 * j) + 0.05 * shiver), None, None)
        for j, nm in enumerate(lay.arm.bones):
            P[nm] = (an.rot(nm, X, 0.30 * e * (1 + 0.25 * j)) @ an.rot(nm, Z, -0.15 * e), None, None)
        an.key_pose(f, P)
    return act


# ------------------------------------------------------------------ build stage

def stage_build():
    import numpy as np
    clock = K.StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    os.makedirs(TEX_DIR, exist_ok=True)
    rng = random.Random(SEED)
    sc = K.reset_scene()
    sc.render.fps = FPS
    col = K.new_collection("Guest")

    clock.start("model")
    lay = Layout()
    names = deform_bone_names(lay)
    m_bake = nacre_bake_material()
    m_core = final_core()
    m_mem_tmp = K.mat_simple("tmp_membrane", (0.8, 0.8, 0.8))
    Pb = Part("guest_body")
    build_body(Pb, lay, rng)
    build_spines_tendrils_arm(Pb, lay)
    Pm = Part("guest_membranes")
    build_membranes(Pm, lay)
    Pc = Part("guest_core")
    build_core(Pc, lay)
    body = part_object(Pb, col, m_bake.mat, names)
    mem = part_object(Pm, col, m_mem_tmp, names)
    core = part_object(Pc, col, m_core, names)
    for o in (body, mem, core):
        K.triangulate_ngons(o)
    K.finish_shading(body, angle=38)
    K.finish_shading(mem, angle=80)
    K.finish_shading(core, flat=True)
    tris = {o.name: K.mesh_tris(o) for o in (body, mem, core)}
    stats["triangles_by_object"] = tris
    stats["triangles_total"] = sum(tris.values())
    log("tris", tris, stats["triangles_total"])

    clock.start("uv_unwrap")
    K.smart_uv(body, margin=0.003, angle=50)
    K.select_only([body], body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    clock.start("bake_gpu")
    stats["cycles_device"] = K.use_gpu(sc)
    sc.render.engine = "CYCLES"
    sc.cycles.use_denoising = False
    sc.render.bake.use_clear = True
    w = K.set_world(sc, (0, 0, 0), 0.0)
    w.light_settings.distance = 0.5 * S
    mem.hide_render = True
    core.hide_render = True
    imgs, bt = {}, {}
    for key, kind, spp, channel in (("color", "EMIT", 16, "color"), ("rough", "EMIT", 8, "rough"),
                                    ("metal", "EMIT", 4, "metal"), ("emission", "EMIT", 8, "emission"),
                                    ("normal", "NORMAL", 16, "bsdf"), ("ao", "AO", 256, "bsdf")):
        img = K.new_float_image(f"bake_{key}", BAKE, data=(key not in ("color", "emission")))
        m_bake.route(channel)
        m_bake.aim(img, "UVMap")
        extra = {"normal_space": "TANGENT"} if kind == "NORMAL" else {}
        bt[key] = K.bake(sc, kind, [body], body, spp, **extra)
        imgs[key] = img
    m_bake.route("bsdf")
    stats["bakes"] = bt

    clock.start("textures")
    f = BAKE // TEX
    Pp = {k_: K.downsample(K.pixels(v), f)[..., :3] for k_, v in imgs.items()}
    paths = {}
    ao = np.clip(Pp["ao"][..., 0] * 0.8 + 0.2, 0, 1)
    paths["base"] = K.save_img(K.to_srgb(Pp["color"]), os.path.join(TEX_DIR, "guest_basecolor.jpg"), 92)
    paths["orm"] = K.save_img(np.stack([ao, Pp["rough"][..., 0], Pp["metal"][..., 0]], -1),
                              os.path.join(TEX_DIR, "guest_orm.jpg"), 92)
    paths["normal"] = K.save_img(K.normal_to_rgb(Pp["normal"]), os.path.join(TEX_DIR, "guest_normal.png"))
    em = K.downsample(Pp["emission"], 2)
    paths["emissive"] = K.save_img(K.to_srgb(em), os.path.join(TEX_DIR, "guest_emissive.jpg"), 90)
    mrgba, memis = membrane_texture(MEM_TEX * 2, SEED + 3)
    mrgba = K.downsample(mrgba, 2)
    memis = K.downsample(memis, 4)
    mb = mrgba.copy()
    mb[..., :3] = K.to_srgb(mb[..., :3])
    paths["mem_base"] = K.save_img(mb, os.path.join(TEX_DIR, "guest_membrane_basecolor.png"))
    paths["mem_emissive"] = K.save_img(K.to_srgb(memis), os.path.join(TEX_DIR, "guest_membrane_emissive.jpg"), 90)
    stats["texture_files"] = {k_: {"file": os.path.relpath(v, REPO).replace("\\", "/"), "bytes": os.path.getsize(v)}
                              for k_, v in paths.items()}

    clock.start("materials")
    m_nacre = final_nacre(paths)
    m_mem = final_membrane(paths)
    body.data.materials.clear()
    body.data.materials.append(m_nacre)
    mem.data.materials.clear()
    mem.data.materials.append(m_mem)
    mem.hide_render = False
    core.hide_render = False

    clock.start("rig_skin")
    rig = build_armature(lay, col)
    for o in (body, mem, core):
        o.parent = rig
        md = o.modifiers.new("Armature", "ARMATURE")
        md.object = rig
    # sockets
    sockets = []
    tip = K.socket("socket_draw_tip", lay.tip, col, note="stylus tip; follows the draw clip")
    tip.parent = rig
    tip.parent_type = "BONE"
    tip.parent_bone = lay.arm.bones[-1]
    tip.matrix_world = Matrix.Translation(lay.tip)
    sockets.append(tip)
    for nm, loc, bn in (("socket_core", lay.core, "chest"),
                        ("socket_head", lay.axis.point(lay.axis.marks[7]), "crown_1")):
        s = K.socket(nm, loc, col)
        s.parent = rig
        s.parent_type = "BONE"
        s.parent_bone = bn
        s.matrix_world = Matrix.Translation(loc)
        sockets.append(s)
    bpy.context.view_layer.update()

    clock.start("animation")
    an = Animator(rig)
    make_idle(an, lay)
    _, draw_info = make_draw(an, lay, rig)
    stats["draw_stroke"] = draw_info
    make_react(an, lay)
    rig.animation_data.action = bpy.data.actions["idle"]
    # weight sanity
    zero = 0
    for o in (body, mem, core):
        for v in o.data.vertices:
            if not v.groups or sum(g.weight for g in v.groups) < 0.99:
                zero += 1
    stats["unweighted_vertices"] = zero
    stats["max_influences"] = max(len(v.groups) for o in (body, mem, core) for v in o.data.vertices)
    stats["deform_bones"] = len(names)

    clock.start("export")
    sc.frame_set(0)
    K.select_only([rig, body, mem, core] + sockets, rig)
    bpy.ops.export_scene.gltf(filepath=GLB_RAW, export_format="GLB", use_selection=True,
                              export_yup=True, export_tangents=True, export_extras=True,
                              export_image_format="AUTO", export_cameras=False, export_lights=False,
                              export_animations=True, export_animation_mode="ACTIONS",
                              export_force_sampling=True, export_frame_step=1,
                              export_def_bones=True, export_skins=True, export_influence_nb=4,
                              export_all_influences=False, export_optimize_animation_size=True,
                              export_anim_single_armature=True, export_reset_pose_bones=True,
                              export_apply=False)
    irid = {"iridescenceFactor": 1.0, "iridescenceIor": 1.36,
            "iridescenceThicknessMinimum": 240, "iridescenceThicknessMaximum": 520}
    stats["glb_patched_extensions"] = K.patch_materials(GLB_RAW, {
        "M_Guest_Nacre": {"KHR_materials_iridescence": dict(irid, iridescenceFactor=0.85),
                          "KHR_materials_transmission": {"transmissionFactor": 0.08},
                          "KHR_materials_volume": {"thicknessFactor": 0.35, "attenuationDistance": 0.6,
                                                   "attenuationColor": [0.96, 0.86, 0.72]},
                          "KHR_materials_ior": {"ior": 1.53}},
        "M_Guest_Membrane": {"KHR_materials_iridescence": irid,
                             "_set": {"alphaMode": "BLEND", "doubleSided": True}},
        "M_Guest_Core": {"KHR_materials_emissive_strength": {"emissiveStrength": 2.5}},
    })
    stats["glb_raw_bytes"] = os.path.getsize(GLB_RAW)
    stats["glb_raw_summary"] = K.glb_summary(GLB_RAW)
    lo, hi = K.world_bounds([body, mem])
    stats["bounds_blender_zup_rest"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    stats["sockets_gltf_rest"] = {s.name: K.blender_to_gltf(s.matrix_world.translation) for s in sockets}
    clock.stop()
    stats["budget_ok"] = {"triangles": stats["triangles_total"] <= TRI_BUDGET,
                          "materials": len(stats["glb_raw_summary"]["materials"]) <= 3,
                          "animations_3": stats["glb_raw_summary"]["animations"] == 3,
                          "all_weighted": zero == 0}
    K.write_json(STATS_PATH, stats)
    log("stats", json.dumps({k_: v for k_, v in stats.items() if not k_.startswith("glb_raw_summary")}))


# ------------------------------------------------------------------ render stage

def studio(sc, col):
    """Review scene: cool blue-grey shadow fill, warm golden key and haze (style addendum)."""
    w = K.set_world(sc, (0.045, 0.055, 0.07), 1.0)
    key = bpy.data.lights.new("Key", "SUN")
    key.energy, key.angle, key.color = 3.2, math.radians(4), (1.0, 0.80, 0.55)
    o = K.link(bpy.data.objects.new("Key", key), col)
    o.rotation_euler = (math.radians(58), 0, math.radians(-40))
    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy, rim.size, rim.color = 2200, 6.0, (0.62, 0.74, 1.0)
    o = K.link(bpy.data.objects.new("Rim", rim), col)
    o.location = (-4.0, 9.0, 8.0)
    o.rotation_euler = (Vector((4.0, -9.0, -5.0))).to_track_quat("-Z", "Y").to_euler()
    gm = K.mat_simple("Ground", (0.035, 0.037, 0.04), 0.75)
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=14.0, fill_type="NGON")
    g = bpy.context.object
    g.data.materials.append(gm)
    for c in g.users_collection:
        c.objects.unlink(g)
    col.objects.link(g)
    # thin golden haze
    m = bpy.data.materials.new("Haze")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.012
    vol.inputs["Color"].default_value = (1.0, 0.86, 0.66, 1)
    nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 6))
    h = bpy.context.object
    h.scale = (40, 40, 12)
    h.data.materials.append(m)
    for c in h.users_collection:
        c.objects.unlink(h)
    col.objects.link(h)
    K.human_proxy(col, (2.6, -2.2, 0.0))
    return w


VIEWS = {
    "front": ((0, -17.5, 3.6), (0, 0, 3.4), 45),
    "three_quarter": ((11.0, -13.0, 5.4), (0, 0, 3.4), 45),
    "back_three_quarter": ((-10.5, 12.0, 6.5), (0, 0, 3.6), 45),
}


def assign_action(rig, name):
    act = bpy.data.actions.get(name)
    if act is None:
        for a in bpy.data.actions:
            if a.name.startswith(name):
                act = a
                break
    ad = rig.animation_data or rig.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    ad.action = act
    if hasattr(ad, "action_slot") and act is not None and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    return act


def stage_render(samples=96):
    from PIL import Image
    clock = K.StageClock()
    clock.start("qa_renders")
    sc = K.reset_scene()
    K.setup_render(sc, 1200, 1200, samples=samples)
    device = K.use_gpu(sc)
    sc.render.fps = FPS
    env = K.new_collection("Review")
    studio(sc, env)
    # Blender's importer cannot decode EXT_meshopt_compression: render the uncompressed export
    # (identical geometry, skin and clips; textures before KTX2 encoding).
    bpy.ops.import_scene.gltf(filepath=GLB_RAW if os.path.exists(GLB_RAW) else GLB_PATH)
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    out = os.path.join(QA_DIR, "final")
    os.makedirs(out, exist_ok=True)
    for f_ in os.listdir(out):
        if f_.endswith(".jpg"):
            os.remove(os.path.join(out, f_))
    timings = {}
    assign_action(rig, "idle")
    sc.frame_set(0)
    for name, (loc, tgt, lens) in VIEWS.items():
        cam = K.add_camera(f"Cam_{name}", loc, tgt, lens=lens)
        timings[name] = K.render_to(sc, cam, os.path.join(out, f"guest_{name}.jpg"))
    # contact sheet: 4 frames per clip, three rows
    tiles = []
    cam = K.add_camera("Cam_sheet", (9.0, -12.5, 5.0), (0, -0.6, 3.6), lens=40)
    sc.render.resolution_x = sc.render.resolution_y = 520
    sc.cycles.samples = 48
    tmp = os.path.join(out, "_tile.jpg")
    rows = []
    for clip, frames in (("idle", (0, 60, 120, 180)), ("draw", (0, 30, 60, 90)), ("react", (0, 6, 14, 40))):
        assign_action(rig, clip)
        row = []
        for fr in frames:
            sc.frame_set(fr)
            K.render_to(sc, cam, tmp)
            row.append(Image.open(tmp).convert("RGB").copy())
        rows.append((clip, frames, row))
    W = 520
    sheet = Image.new("RGB", (W * 4, W * 3), (10, 10, 12))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for r, (clip, frames, row) in enumerate(rows):
        for c, im in enumerate(row):
            sheet.paste(im, (c * W, r * W))
            dr.text((c * W + 10, r * W + 8), f"{clip}  t={frames[c] / FPS:.2f}s", fill=(235, 220, 190))
    sheet.save(os.path.join(out, "guest_anim_contact_sheet.jpg"), quality=86, optimize=True)
    os.remove(tmp)
    clock.stop()
    K.write_json(os.path.join(out, "render-stats.json"),
                 {"device": device, "samples": samples, "seconds_per_render": timings, "stages": clock.stages,
                  "note": "Review lighting (golden key, blue rim, thin haze, 1.75 m proxy) is render-only."})


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"build": stage_build, "render": stage_render, "all": lambda: (stage_build(), stage_render())}[stage]()
