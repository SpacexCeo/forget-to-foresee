"""Procedural source for island.glb (Forget to Foresee): the floating archipelago.

Run headless with Blender 4.5 LTS:

    blender -b -P art/island/build_island.py -- textures   # bake the tiling texture sets (GPU)
    blender -b -P art/island/build_island.py -- build      # geometry, collision, sockets, export
    blender -b -P art/island/build_island.py -- render     # QA renders of the exported .glb
    blender -b -P art/island/build_island.py -- all        # textures + build + render

Layout (Blender Z-up, -Y faces the default game camera; glTF converts to Y-up):
a round plaza plateau with the Scroll in the centre, six camp plateaus on a ring,
arched bridges with parapets (plaza -> waypoint islet -> camp, and camp -> ring islet
-> camp), four anchor islets beyond the ring where the Shells hover, and a viewing
balcony behind the Iris camp where the player spawns. Distances follow the brief's
30-45 s walk between neighbouring points at 4 m/s (see walk table in build-stats).

Materials (three, tiling + vertex colour, no unique atlas):
  M_Island_Rock     cliffs, pillars, menhirs, tree trunks      (tile 8 m)
  M_Island_Stone    paving, walls, parapets, bridges, medallion (tile 4 m)
  M_Island_Foliage  grass, bushes, vines, tree crowns, flowers  (tile 3 m, double sided)
Vertex colour (COLOR_0) multiplies the base colour: moss on ledges, fade toward
the cloud sea, inlays of the Scroll medallion, per-bush tints.
"""

import json
import math
import os
import random
import sys
import time
import zlib

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import ftf  # noqa: E402
from ftf import TAU, Geo  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "island")
TEX_DIR = os.path.join(HERE, "textures")
MODELS = os.path.join(REPO, "game", "public", "assets", "models")
GLB_PATH = os.path.join(MODELS, "island.glb")
BLEND_PATH = os.path.join(HERE, "island.blend")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")


def log(*a):
    ftf.log("island", *a)


# ------------------------------------------------------------------ layout

WALK_SPEED = 4.0            # m/s used for the 30-45 s rule (task brief)
TRI_BUDGET = 120000         # owner 07.11: brief x2
R_CAMP = 128.0              # plaza centre -> camp centre (= camp -> neighbour camp)
PLAZA_R = 18.0
CAMP_R = 11.0
SPOKE_AT = 66.0             # waypoint islet on each plaza -> camp spoke
ISLET_R = 6.0
ANCHOR_AT = 170.0           # anchor islet centre (beyond the ring islets)
ANCHOR_R = 12.0
ANCHOR_ZONE_OFFSET = 4.0    # zone centre sits this far outward of the islet centre
ANCHOR_ZONE_R = 3.5
SHELL_FLOAT = 7.0
BALCONY_AT = 154.0
BALCONY_R = 7.5
DECK_HALF = 1.8             # walkable deck half width (3.6 m between parapets)
BRIDGE_HALF = 2.3           # outer half width incl. coping
PARAPET_H = 0.95
PARAPET_T = 0.45

# stem, label, client angle (deg; game/src/scenes/layout.js: 0 = +X, 90 = +Z toward
# the default camera), plateau height (m). Engine order = ring order.
CAMPS = [
    ("iris", "Iris", 90, -1.5),
    ("sol", "Salt", 150, 1.0),
    ("pepel", "Ash", 210, -1.0),
    ("moh", "Moss", 270, 2.0),
    ("yantar", "Amber", 330, 0.5),
    ("iney", "Frost", 30, 1.5),
]
# Shell number by the client angle of its ring islet (layout.js zones on the
# diagonals 45/135/225/315 move to 60/120/240/300 so they sit between two camps).
ANCHOR_BY_CLIENT_ANGLE = {60: 1, 120: 2, 240: 3, 300: 4}

TILE = {"rock": 10.0, "stone": 4.0, "foliage": 3.0}
TEX_SIZE = 2048


def client_to_blender_angle(deg):
    return -math.radians(deg)


def blender_to_client_deg(phi):
    return round(-math.degrees(phi)) % 360


def make_layout():
    nodes, edges = {}, []

    def node(name, xy, z, r, kind, **kw):
        nodes[name] = dict(name=name, x=xy[0], y=xy[1], z=z, r=r, kind=kind, entries=[], **kw)
        return nodes[name]

    node("plaza", (0.0, 0.0), 0.0, PLAZA_R, "plaza")
    for stem, label, a, z in CAMPS:
        phi = client_to_blender_angle(a)
        c, s = math.cos(phi), math.sin(phi)
        node(f"camp_{stem}", (R_CAMP * c, R_CAMP * s), z, CAMP_R, "camp", stem=stem,
             label=label, phi=phi)
        node(f"spoke_{stem}", (SPOKE_AT * c, SPOKE_AT * s), round(z * SPOKE_AT / R_CAMP + 0.6, 2),
             ISLET_R, "islet")
        edges += [("plaza", f"spoke_{stem}"), (f"spoke_{stem}", f"camp_{stem}")]
    for i in range(len(CAMPS)):
        a, b = CAMPS[i], CAMPS[(i + 1) % len(CAMPS)]
        na, nb = nodes[f"camp_{a[0]}"], nodes[f"camp_{b[0]}"]
        mx, my = (na["x"] + nb["x"]) / 2, (na["y"] + nb["y"]) / 2
        rn = node(f"ring_{a[0]}_{b[0]}", (mx, my), round((a[3] + b[3]) / 2 + 0.5, 2),
                  ISLET_R, "islet")
        edges += [(na["name"], rn["name"]), (rn["name"], nb["name"])]
        phi = math.atan2(my, mx)
        num = ANCHOR_BY_CLIENT_ANGLE.get(blender_to_client_deg(phi))
        if num:
            c, s = math.cos(phi), math.sin(phi)
            an = node(f"anchor_{num}", (ANCHOR_AT * c, ANCHOR_AT * s), rn["z"] - 1.5, ANCHOR_R,
                      "anchor", shell=num, phi=phi,
                      zone=((ANCHOR_AT + ANCHOR_ZONE_OFFSET) * c, (ANCHOR_AT + ANCHOR_ZONE_OFFSET) * s))
            edges.append((rn["name"], an["name"]))
    iris = nodes["camp_iris"]
    c, s = math.cos(iris["phi"]), math.sin(iris["phi"])
    node("balcony", (BALCONY_AT * c, BALCONY_AT * s), -2.0, BALCONY_R, "balcony", phi=iris["phi"])
    edges.append(("camp_iris", "balcony"))
    for a, b in edges:
        A, B = nodes[a], nodes[b]
        ang = math.atan2(B["y"] - A["y"], B["x"] - A["x"])
        A["entries"].append(ang)
        B["entries"].append(ang + math.pi)
    return nodes, edges


def axial_start(n):
    """Distance from a plateau centre where a bridge deck begins (just inside the
    rim, so the deck corners never leave a gap against the round plateau)."""
    return math.sqrt(max(n["r"] ** 2 - BRIDGE_HALF ** 2, 1.0)) - 0.08


def bridge_curve(A, B):
    """Deck centre line stations (x, y, z_top) and the span length."""
    ax, ay, bx, by = A["x"], A["y"], B["x"], B["y"]
    d = Vector((bx - ax, by - ay, 0))
    L_cc = d.length
    d.normalize()
    sa, sb = axial_start(A), axial_start(B)
    p0 = Vector((ax, ay, 0)) + d * sa
    p1 = Vector((bx, by, 0)) - d * sb
    span = (p1 - p0).length
    camber = 0.012 * span
    n = max(12, int(span / 3.0))
    st = []
    for i in range(n + 1):
        s = 0.5 - 0.5 * math.cos(math.pi * i / n)
        p = p0.lerp(p1, s)
        z = A["z"] + (B["z"] - A["z"]) * s + camber * math.sin(math.pi * s) + 0.015
        st.append((s, Vector((p.x, p.y, z))))
    return st, span, d, L_cc


def angle_diff(a, b):
    return abs((a - b + math.pi) % TAU - math.pi)


def free_angle(node, th, clearance):
    """True if direction th (from the node centre) is clear of every bridge entry."""
    for e in node["entries"]:
        lim = math.asin(min(0.99, clearance / max(node["r"] * 0.75, 1.0)))
        if angle_diff(th, e) < lim:
            return False
    return True


# ------------------------------------------------------------------ noise

class RockNoise:
    """Smooth 2-D noise on (theta, z) from random harmonics: columnar ridges and
    lumps for the pillar cliffs. Deterministic per seed."""

    def __init__(self, seed):
        r = random.Random(seed)
        self.h = []
        for k in (2, 3, 4, 6, 8, 11, 15, 19, 26):
            self.h.append((k, r.uniform(0, TAU), r.uniform(-0.10, 0.10), r.uniform(0.6, 1.0) / k ** 0.75,
                           r.uniform(0.15, 0.45), r.uniform(0, TAU)))
        self.norm = sum(a for _, _, _, a, _, _ in self.h)

    def __call__(self, th, z):
        v = 0.0
        for k, ph, tw, a, fz, pz in self.h:
            v += a * math.sin(k * th + ph + tw * z) * (0.75 + 0.25 * math.sin(fz * z + pz))
        return v / self.norm


def sid(s):
    """Stable string hash (Python's hash() is salted per process)."""
    return zlib.crc32(s.encode())


def hash01(*xs):
    h = 0
    for x in xs:
        h = (h * 1000003) ^ int(x * 1000.0 + 7919)
        h &= 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return (h & 0xFFFFFF) / float(0xFFFFFF)


# ------------------------------------------------------------------ builders

class Builder:
    """Geometry accumulated per (group, material) plus collision bmeshes."""

    def __init__(self):
        self.geos = {}
        self.col_walk = bmesh.new()
        self.col_wall = bmesh.new()
        self.ico = {}
        for sub in (1, 2):
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
            self.ico[sub] = ([v.co.copy() for v in bm.verts],
                             [[v.index for v in f.verts] for f in bm.faces])
            bm.free()

    def g(self, group, mat):
        key = (group, mat)
        if key not in self.geos:
            self.geos[key] = Geo()
        return self.geos[key]


def group_of(x, y):
    """Sector grouping for frustum culling: plaza core plus one sector per camp."""
    if math.hypot(x, y) < 40.0:
        return "plaza"
    phi = math.atan2(y, x) + 1e-4
    best, bd = None, 1e9
    for stem, _l, a, _z in CAMPS:
        d = angle_diff(phi, client_to_blender_angle(a))
        if d < bd:
            best, bd = stem, d
    return best


def planar_uv(p):
    return (p[0], p[1])


def box_uv(p, n):
    ax = max(range(3), key=lambda i: abs(n[i]))
    if ax == 0:
        return (p[1], p[2])
    if ax == 1:
        return (p[0], p[2])
    return (p[0], p[1])


def add_box(geo, center, size, rot_z=0.0, col=(1, 1, 1), skip_bottom=True):
    """Box with box-projected UVs in metres."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    c, s = math.cos(rot_z), math.sin(rot_z)

    def P(x, y, z):
        return (cx + x * c - y * s, cy + x * s + y * c, cz + z)
    faces = [((-sx, -sy, -sz), (sx, -sy, -sz), (sx, -sy, sz), (-sx, -sy, sz), (0, -1, 0)),
             ((sx, -sy, -sz), (sx, sy, -sz), (sx, sy, sz), (sx, -sy, sz), (1, 0, 0)),
             ((sx, sy, -sz), (-sx, sy, -sz), (-sx, sy, sz), (sx, sy, sz), (0, 1, 0)),
             ((-sx, sy, -sz), (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz), (-1, 0, 0)),
             ((-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz), (0, 0, 1)),
             ((-sx, sy, -sz), (sx, sy, -sz), (sx, -sy, -sz), (-sx, -sy, -sz), (0, 0, -1))]
    for f in faces[:5] if skip_bottom else faces:
        pts = [P(*v) for v in f[:4]]
        ln = f[4]
        n = (ln[0] * c - ln[1] * s, ln[0] * s + ln[1] * c, ln[2])
        geo.poly(pts, [box_uv(p, n) for p in pts], col)


def add_disc(geo, cx, cy, z, r, n, col=(1, 1, 1), a0=0.0):
    c = geo.vert((cx, cy, z))
    ring = [geo.vert((cx + r * math.cos(a0 + TAU * i / n), cy + r * math.sin(a0 + TAU * i / n), z))
            for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        pts = [geo.v[c], geo.v[ring[i]], geo.v[ring[j]]]
        geo.face([c, ring[i], ring[j]], [planar_uv(p) for p in pts], col)


def add_annulus(geo, cx, cy, z, r0, r1, n, col=(1, 1, 1), a0=0.0, a1=TAU, cols=None):
    full = abs(a1 - a0 - TAU) < 1e-6
    m = n if full else max(2, n)
    inner, outer = [], []
    cnt = m if full else m + 1
    for i in range(cnt):
        a = a0 + (a1 - a0) * i / m
        inner.append((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z))
        outer.append((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z))
    for i in range(m):
        j = (i + 1) % cnt
        pts = [inner[i], outer[i], outer[j], inner[j]]
        cc = cols[i] if cols else col
        geo.poly(pts, [planar_uv(p) for p in pts], cc)


def add_strip(geo, a, b, half_w, z, col=(1, 1, 1)):
    """Flat rectangle from a to b (xy), raised path strips."""
    d = Vector((b[0] - a[0], b[1] - a[1], 0)).normalized()
    l = Vector((-d.y, d.x, 0)) * half_w
    A = Vector((a[0], a[1], z)); B = Vector((b[0], b[1], z))
    pts = [A - l, B - l, B + l, A + l]
    geo.poly(pts, [planar_uv(p) for p in pts], col)


def oriented_poly(geo, pts, uvs, want, col=(1, 1, 1)):
    """Adds a polygon, flipping it so its normal points along `want`."""
    v = [Vector(p) for p in pts]
    n = Vector()
    for i in range(len(v)):
        n += v[i].cross(v[(i + 1) % len(v)])
    if n.dot(Vector(want)) < 0:
        pts = list(reversed(pts))
        uvs = list(reversed(uvs))
    geo.poly(pts, uvs, col)


# -------- pillars

def pillar(B, node, seed):
    kind = node["kind"]
    cx, cy, z0, Rt = node["x"], node["y"], node["z"], node["r"]
    rng = random.Random(seed)
    noise = RockNoise(seed)
    grp = group_of(cx, cy)
    if kind == "plaza":
        n, wall, ter, depth, second = 72, 2.4, 2.6, 78.0, (3.2, 2.4)
    elif kind == "camp":
        n, wall, ter, depth, second = 44, 2.2, 2.2, rng.uniform(55, 68), None
    elif kind == "anchor":
        n, wall, ter, depth, second = 44, 1.8, 1.8, rng.uniform(50, 60), None
    elif kind == "balcony":
        n, wall, ter, depth, second = 30, 1.5, 1.2, 50.0, None
    else:
        n, wall, ter, depth, second = 24, 1.6, 1.2, rng.uniform(48, 56), None
    prof = [(Rt, z0, 0.0, None)]
    prof.append((Rt, z0 - wall, 0.0, "stone"))
    prof.append((Rt + ter, z0 - wall, 0.0, "foliage"))
    prof.append((Rt + ter + 0.25, z0 - wall - 0.35, 0.04, "rock"))
    z = z0 - wall - 0.35
    r_lip = Rt + ter + 0.25
    terraces = [(Rt + ter, z0 - wall)]
    if second:
        w2, t2 = second
        prof.append((r_lip - 0.15, z - w2, 0.0, "stone"))
        prof.append((r_lip - 0.15 + t2, z - w2, 0.0, "foliage"))
        prof.append((r_lip + t2 + 0.1, z - w2 - 0.35, 0.04, "rock"))
        terraces.append((r_lip - 0.15 + t2, z - w2))
        z = z - w2 - 0.35
        r_lip = r_lip + t2 + 0.1
    rest = depth - (z0 - z)
    base = r_lip
    for f, rf, amp in ((0.025, 1.04, 0.35), (0.07, 1.02, 0.75), (0.14, 0.95, 1.0),
                       (0.23, 0.86, 1.2), (0.34, 0.74, 1.3), (0.47, 0.60, 1.25), (0.62, 0.45, 1.1),
                       (0.78, 0.30, 0.9), (0.92, 0.14, 0.5)):
        prof.append((base * rf * rng.uniform(0.93, 1.07), z - f * rest, amp * 0.11 * base, "rock"))
    tip_z = z - rest
    # ring vertices
    rings = []
    for j, (r, zz, amp, _m) in enumerate(prof):
        ring = []
        dz_lim = 0.0
        if amp and 0 < j < len(prof) - 1:
            dz_lim = 0.28 * min(abs(prof[j - 1][1] - zz), abs(prof[j + 1][1] - zz))
        for i in range(n):
            th = TAU * i / n + (0.35 * TAU / n * math.sin(i * 2.7 + j * 1.3) if amp > 0.2 else 0.0)
            rr = r + (amp * noise(th, zz) if amp else 0.0)
            z_ = zz + dz_lim * math.sin(i * 1.9 + j * 3.1 + seed)
            ring.append((cx + rr * math.cos(th), cy + rr * math.sin(th), z_))
        rings.append(ring)
    # v coordinate: cumulative slant length down the nominal profile
    vcum = [0.0]
    for (r0, z0_, _, _), (r1, z1_, _, _) in zip(prof, prof[1:]):
        vcum.append(vcum[-1] + math.hypot(r1 - r0, z1_ - z0_))
    for j in range(1, len(prof)):
        mat = prof[j][3]
        geo = B.g(grp, mat)
        A_, Bv = rings[j - 1], rings[j]
        flat = abs(prof[j][1] - prof[j - 1][1]) < 0.05
        rmean = (prof[j][0] + prof[j - 1][0]) / 2
        reps = max(1, round(TAU * rmean / TILE[mat]))
        ulen = reps * TILE[mat]
        ia = [geo.vert(p) for p in A_]
        ib = [geo.vert(p) for p in Bv]
        for i in range(n):
            k = (i + 1) % n
            idx = [ia[i], ib[i], ib[k], ia[k]]
            if flat:
                uvs = [planar_uv(geo.v[q]) for q in idx]
            else:
                u0, u1 = ulen * i / n, ulen * (i + 1) / n
                uvs = [(u0, -vcum[j - 1]), (u0, -vcum[j]), (u1, -vcum[j]), (u1, -vcum[j - 1])]
            geo.face(idx, uvs)
    # tip fan
    geo = B.g(grp, "rock")
    last = [geo.vert(p) for p in rings[-1]]
    tip = geo.vert((cx + rng.uniform(-1, 1), cy + rng.uniform(-1, 1), tip_z - 3.0))
    reps = max(1, round(TAU * prof[-1][0] / TILE["rock"]))
    for i in range(n):
        k = (i + 1) % n
        u0, u1 = reps * TILE["rock"] * i / n, reps * TILE["rock"] * (i + 1) / n
        geo.face([last[i], tip, last[k]], [(u0, -vcum[-1]), ((u0 + u1) / 2, -vcum[-1] - 4), (u1, -vcum[-1])])
    return terraces, (prof[3][0], prof[3][1]), grp


# -------- parapets

def parapet_runs(node, r_mid, half_w=DECK_HALF):
    if not node["entries"]:
        return [(0.0, TAU, True)]
    gaps = sorted(((e % TAU), math.asin(min(0.99, half_w / r_mid))) for e in node["entries"])
    runs = []
    for i, (a, g) in enumerate(gaps):
        b, gb = gaps[(i + 1) % len(gaps)]
        start = a + g
        end = b - gb if i + 1 < len(gaps) else b - gb + TAU
        if end - start > 0.05:
            runs.append((start, end, False))
    return runs


def ring_wall(B, grp, cx, cy, z0, r_in, r_out, h, runs, post=True, cap_col=(1, 1, 1),
              col_bm=None):
    geo = B.g(grp, "stone")
    prof = [(r_in, z0), (r_in, z0 + h - 0.14), (r_in - 0.07, z0 + h - 0.12), (r_in - 0.07, z0 + h),
            (r_out + 0.07, z0 + h), (r_out + 0.07, z0 + h - 0.12), (r_out, z0 + h - 0.14), (r_out, z0)]
    vper = [0.0]
    for (a, b), (c, d) in zip(prof, prof[1:]):
        vper.append(vper[-1] + math.hypot(c - a, d - b))
    r_mid = (r_in + r_out) / 2
    for a0, a1, closed in runs:
        m = max(2, int(math.ceil((a1 - a0) * r_out / 1.8)))
        rings = []
        cnt = m if closed else m + 1
        for i in range(cnt):
            a = a0 + (a1 - a0) * i / m
            rings.append([geo.vert((cx + r * math.cos(a), cy + r * math.sin(a), z)) for r, z in prof])
        for i in range(m):
            k = (i + 1) % cnt
            u0, u1 = (a0 + (a1 - a0) * i / m) * r_mid, (a0 + (a1 - a0) * (i + 1) / m) * r_mid
            for j in range(len(prof) - 1):
                idx = [rings[i][j], rings[i][j + 1], rings[k][j + 1], rings[k][j]]
                geo.face(idx, [(u0, vper[j]), (u0, vper[j + 1]), (u1, vper[j + 1]), (u1, vper[j])])
        if not closed:
            for a, sign in ((a0, -1), (a1, 1)):
                t = Vector((-math.sin(a), math.cos(a), 0)) * sign
                pts = [(cx + r * math.cos(a), cy + r * math.sin(a), z) for r, z in prof]
                uvs = [(r, z) for r, z in prof]
                oriented_poly(geo, pts, uvs, t)
                if post:
                    pa = a - sign * 0.32 / r_mid
                    add_box(geo, (cx + r_mid * math.cos(pa), cy + r_mid * math.sin(pa), z0 + (h + 0.3) / 2),
                            (0.62, 0.62, h + 0.3), pa, cap_col)
                    add_box(geo, (cx + r_mid * math.cos(pa), cy + r_mid * math.sin(pa), z0 + h + 0.36),
                            (0.72, 0.72, 0.12), pa, cap_col)
                    add_box(geo, (cx + r_mid * math.cos(pa), cy + r_mid * math.sin(pa), z0 + h + 0.52),
                            (0.34, 0.34, 0.22), pa + 0.785, cap_col)
        # collision: chord boxes
        cb = col_bm if col_bm is not None else B.col_wall
        mc = max(1, int(math.ceil((a1 - a0) * r_mid / 2.5)))
        for i in range(mc):
            aa = a0 + (a1 - a0) * i / mc
            ab = a0 + (a1 - a0) * (i + 1) / mc
            pa = Vector((cx + r_mid * math.cos(aa), cy + r_mid * math.sin(aa), z0 - 0.1))
            pb = Vector((cx + r_mid * math.cos(ab), cy + r_mid * math.sin(ab), z0 - 0.1))
            ftf.beam(cb, pa + Vector((0, 0, 0.7)), pb + Vector((0, 0, 0.7)), r_out - r_in + 0.12, 1.4)


# -------- bridges

def bridge(B, A, Bn, seed):
    st, span, d, _ = bridge_curve(A, Bn)
    lat = Vector((-d.y, d.x, 0))
    grp = group_of((A["x"] + Bn["x"]) / 2, (A["y"] + Bn["y"]) / 2)
    geo = B.g(grp, "stone")
    D = min(8.5, max(3.5, 0.16 * span))
    tc = 1.15
    sec_uw = lambda wb: [(-1.80, 0.0), (-1.80, 0.80), (-1.87, 0.88), (-2.30, 0.88), (-2.30, 0.74),
                         (-2.20, 0.68), (-2.20, -0.28), (-2.29, -0.33), (-2.29, -0.52), (-2.20, -0.57),
                         (-2.20, wb), (2.20, wb), (2.20, -0.57), (2.29, -0.52), (2.29, -0.33),
                         (2.20, -0.28), (2.20, 0.68), (2.30, 0.74), (2.30, 0.88), (1.87, 0.88),
                         (1.80, 0.80), (1.80, 0.0)]
    sections = []
    for s, p in st:
        e = 2 * s - 1
        wb = -(tc + (D - tc) * (1 - math.sqrt(max(0.0, 1 - e * e))))
        sections.append([p + lat * u + Vector((0, 0, w)) for u, w in sec_uw(wb)])
    # orientation: first face normal must point away from the section centre
    sec0, sec1 = sections[0], sections[1]
    c0 = sum((Vector(p) for p in sec0), Vector()) / len(sec0)
    q = [Vector(sec0[10]), Vector(sec1[10]), Vector(sec1[11]), Vector(sec0[11])]  # underside face
    nrm = (q[1] - q[0]).cross(q[3] - q[0])
    mid = (q[0] + q[3]) / 2
    flip = nrm.dot(mid - c0) < 0
    ftf.loft(geo, sections, closed_section=True, flip=flip)
    mid = st[len(st) // 2][1]
    ang = math.atan2(d.y, d.x)
    for side in (-1, 1):
        c = mid + lat * side * 2.05
        add_box(geo, (c.x, c.y, c.z + 0.88 + 0.32), (0.66, 0.66, 0.64), ang)
        add_box(geo, (c.x, c.y, c.z + 0.88 + 0.70), (0.78, 0.78, 0.12), ang)
        add_box(geo, (c.x, c.y, c.z + 0.88 + 0.88), (0.36, 0.36, 0.26), ang + 0.785)
    # collision: deck slabs and parapet walls per pair of stations
    step = max(1, len(st) // 9)
    idx = list(range(0, len(st), step))
    if idx[-1] != len(st) - 1:
        idx.append(len(st) - 1)
    for i0, i1 in zip(idx, idx[1:]):
        pa, pb = st[i0][1], st[i1][1]
        ftf.beam(B.col_walk, pa - Vector((0, 0, 0.25)), pb - Vector((0, 0, 0.25)), 2 * BRIDGE_HALF, 0.5)
        for side in (-1, 1):
            o = lat * side * 2.02 + Vector((0, 0, 0.6))
            ftf.beam(B.col_wall, pa + o, pb + o, 0.56, 1.4)
    return span, st


# -------- vegetation and props

def bush(B, grp, p, r, rng, tint=(1, 1, 1), squash=0.75, sub=None, mat="foliage"):
    if sub is None:
        sub = 2 if r >= 0.7 else 1
    verts, faces = B.ico[sub]
    geo = B.g(grp, mat)
    seed = rng.random() * 100
    pts = []
    for v in verts:
        k = 1.0 + 0.22 * (hash01(v.x * 3 + seed, v.y * 3, v.z * 3) - 0.5) * 2
        q = Vector((v.x * r * k, v.y * r * k, v.z * r * k * squash))
        q.z = max(q.z, -0.25 * r)
        pts.append(Vector(p) + q + Vector((0, 0, 0.25 * r * squash)))
    idx = [geo.vert(q) for q in pts]
    for f in faces:
        fp = [pts[i] for i in f]
        n = (fp[1] - fp[0]).cross(fp[2] - fp[0])
        cols = []
        for i in f:
            h = (pts[i].z - p[2]) / max(r, 0.01)
            sh = 0.55 + 0.45 * min(1.0, max(0.0, h))
            cols.append((tint[0] * sh, tint[1] * sh, tint[2] * sh))
        geo.face([idx[i] for i in f], [box_uv(q, n) for q in fp], cols)


FLOWER_TINTS = [(0.62, 0.42, 1.0), (0.80, 0.60, 1.0), (1.0, 1.0, 0.95), (1.0, 0.86, 0.45)]


def flowers(B, grp, p, rng, count=6, spread=0.8, palette=None):
    pal = palette or FLOWER_TINTS
    for _ in range(count):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0, spread)
        q = (p[0] + d * math.cos(a), p[1] + d * math.sin(a), p[2] + 0.12)
        c = rng.choice(pal)
        bush(B, grp, q, rng.uniform(0.10, 0.17), rng, tint=c, squash=0.8, sub=1, mat="stone")


def tree(B, grp, p, rng, h=None):
    h = h or rng.uniform(3.2, 5.0)
    geo = B.g(grp, "rock")
    bend = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0))
    pts = [Vector(p) + bend * (t * t) + Vector((0, 0, h * t)) for t in (0.0, 0.35, 0.7, 1.0)]
    rad = [0.26, 0.19, 0.14, 0.09]
    secs = []
    for q, r in zip(pts, rad):
        secs.append([q + Vector((r * math.cos(TAU * k / 6), r * math.sin(TAU * k / 6), 0)) for k in range(6)])
    bark = (0.72, 0.56, 0.42)
    ftf.loft(geo, secs, closed_section=True, cols=[[bark] * 6 for _ in secs],
             flip=False)
    top = pts[-1]
    for _ in range(rng.randint(3, 5)):
        o = Vector((rng.uniform(-1.1, 1.1), rng.uniform(-1.1, 1.1), rng.uniform(-0.6, 0.6)))
        tint = (rng.uniform(0.85, 1.1), rng.uniform(0.9, 1.15), rng.uniform(0.8, 1.0))
        bush(B, grp, top + o, rng.uniform(1.1, 1.7), rng, tint=tint, squash=0.8, sub=2)
    ftf.prism_ngon(B.col_wall, 6, 0.35, 0.3, p[2], p[2] + h, center=(p[0], p[1]))


def vine(B, grp, top, outward, length, width, rng):
    """Ivy curtain: a few flattened leaf clumps draping down a wall."""
    o = Vector((outward[0], outward[1], 0)).normalized()
    k = max(2, int(length / 1.6))
    for i in range(k):
        t = (i + 0.5) / k
        c = Vector(top) + o * (0.15 + 0.05 * i) + Vector((0, 0, -length * t))
        r = width * (0.75 - 0.35 * t)
        sh = 1.0 - 0.3 * t
        bush(B, grp, c, r, rng, tint=(0.9 * sh, 1.0 * sh, 0.85 * sh), squash=1.6, sub=1)


def menhir(B, grp, p, h, r, rng):
    geo = B.g(grp, "rock")
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))
    secs = []
    for t, rf in ((0.0, 1.0), (0.35, 0.95), (0.7, 0.82), (0.9, 0.55)):
        c = Vector(p) + lean * t * h * 0.3 + Vector((0, 0, h * t - 0.3))
        secs.append([c + Vector((r * rf * (1 + 0.15 * math.sin(k * 2.3 + t * 3)) * math.cos(TAU * k / 5 + 0.3),
                                 r * rf * 0.75 * math.sin(TAU * k / 5 + 0.3), 0)) for k in range(5)])
    col = (1.15, 1.15, 1.1)
    ftf.loft(geo, secs, closed_section=True, cols=[[col] * 5 for _ in secs])
    tip = Vector(p) + lean * h * 0.3 + Vector((0, 0, h - 0.3 + 0.25))
    last = secs[-1]
    for k in range(5):
        a, b = last[k], last[(k + 1) % 5]
        oriented_poly(geo, [a, b, tip], [(0, 0), (1, 0), (0.5, 0.6)],
                      ((a + b) / 2 - Vector(p) - lean * h * 0.3).normalized() + Vector((0, 0, 0.6)), col)
    ftf.prism_ngon(B.col_wall, 5, r * 0.9, r * 0.6, p[2] - 0.3, p[2] + h, center=(p[0], p[1]))


GOLD = (1.0, 0.80, 0.52)
PALE = (0.98, 0.96, 0.90)


def glyph(B, grp, cx, cy, z, size, seed, col=GOLD):
    """A round sign of the Guests' language: a ring of four slots (one stroke form
    each: arc, spike, loop or drop) and reading dots in the core. Raised inlay."""
    rng = random.Random(seed)
    geo = B.g(grp, "stone")
    zz = z + 0.008
    rot = rng.uniform(0, TAU)
    for k in range(4):
        a0 = rot + k * TAU / 4 + 0.16
        a1 = rot + (k + 1) * TAU / 4 - 0.16
        add_annulus(geo, cx, cy, zz, 0.40 * size, 0.50 * size, 5, col, a0=a0, a1=a1)
        am = (a0 + a1) / 2
        form = rng.choice(("arc", "spike", "loop", "drop"))
        ca, sa = math.cos(am), math.sin(am)
        if form == "arc":
            add_annulus(geo, cx, cy, zz, 0.58 * size, 0.64 * size, 3, col, a0=am - 0.35, a1=am + 0.35)
        elif form == "spike":
            ta = Vector((-sa, ca, 0))
            base = Vector((cx + 0.5 * size * ca, cy + 0.5 * size * sa, zz))
            tipp = Vector((cx + 0.82 * size * ca, cy + 0.82 * size * sa, zz))
            pts = [base - ta * 0.07 * size, tipp, base + ta * 0.07 * size]
            oriented_poly(geo, pts, [planar_uv(p) for p in pts], (0, 0, 1), col)
        elif form == "loop":
            px, py = cx + 0.70 * size * ca, cy + 0.70 * size * sa
            add_annulus(geo, px, py, zz, 0.06 * size, 0.11 * size, 6, col)
        else:
            px, py = cx + 0.68 * size * ca, cy + 0.68 * size * sa
            add_disc(geo, px, py, zz, 0.09 * size, 6, col)
    for i in range(rng.randint(1, 3)):
        a = rot + i * 0.9
        add_disc(geo, cx + 0.16 * size * math.cos(a), cy + 0.16 * size * math.sin(a), zz, 0.05 * size, 6, col)


# -------- plateaus

def plateau_top(B, node, rng):
    cx, cy, z, R = node["x"], node["y"], node["z"], node["r"]
    grp = group_of(cx, cy)
    kind = node["kind"]
    stone, fol = B.g(grp, "stone"), B.g(grp, "foliage")
    n = 72 if kind == "plaza" else (44 if R > 9 else 28)
    r_par_in = R - PARAPET_T
    if kind == "plaza":
        add_disc(stone, cx, cy, z, 2.2, 24, PALE)
        add_annulus(stone, cx, cy, z, 2.2, 2.45, 48, GOLD)
        add_annulus(stone, cx, cy, z, 2.45, 5.2, 48, (0.86, 0.88, 0.86))
        add_annulus(stone, cx, cy, z, 5.2, 5.42, 48, GOLD)
        band = [(0.74, 0.77, 0.75) if i % 2 else (0.90, 0.91, 0.88) for i in range(48)]
        add_annulus(stone, cx, cy, z, 5.42, 8.2, 48, cols=band)
        add_annulus(stone, cx, cy, z, 8.2, 8.45, 64, GOLD)
        add_annulus(stone, cx, cy, z, 8.45, R, n, (0.88, 0.90, 0.88))
        for stem, _l, a, _z in CAMPS:
            phi = client_to_blender_angle(a)
            add_strip(stone, (2.5 * math.cos(phi), 2.5 * math.sin(phi)),
                      (8.15 * math.cos(phi), 8.15 * math.sin(phi)), 0.07, z + 0.006, GOLD)
            for off in (-0.26, 0.26):
                gph = phi + off
                glyph(B, grp, 6.8 * math.cos(gph), 6.8 * math.sin(gph), z, 1.05, sid(stem) % 9973 + int(off * 100))
        # planters between the spokes
        for i, (stem, _l, a, _z) in enumerate(CAMPS):
            mid = client_to_blender_angle(a) - math.radians(30)
            a0, a1 = mid - math.radians(15), mid + math.radians(15)
            ring_wall(B, grp, cx, cy, z, 13.9, 14.25, 0.5, [(a0, a1, False)], post=False)
            ring_wall(B, grp, cx, cy, z, 16.35, 16.7, 0.5, [(a0, a1, False)], post=False)
            for aa in (a0, a1):
                add_box(stone, (15.3 * math.cos(aa), 15.3 * math.sin(aa), z + 0.25), (2.2, 0.35, 0.5), aa)
                ftf.beam(B.col_wall, Vector((13.9 * math.cos(aa), 13.9 * math.sin(aa), z + 0.3)),
                         Vector((16.7 * math.cos(aa), 16.7 * math.sin(aa), z + 0.3)), 0.4, 0.9)
            add_annulus(fol, cx, cy, z + 0.40, 14.25, 16.35, 10, (0.95, 1.0, 0.9), a0=a0, a1=a1)
            for t in (0.25, 0.75):
                aa = a0 + (a1 - a0) * t
                tree(B, grp, (15.3 * math.cos(aa), 15.3 * math.sin(aa), z + 0.40), rng, h=rng.uniform(3.5, 4.6))
            for _ in range(6):
                aa = rng.uniform(a0 + 0.03, a1 - 0.03)
                rr = rng.uniform(14.6, 16.0)
                bush(B, grp, (rr * math.cos(aa), rr * math.sin(aa), z + 0.40), rng.uniform(0.5, 0.8), rng)
            for _ in range(3):
                aa = rng.uniform(a0 + 0.03, a1 - 0.03)
                rr = rng.uniform(14.6, 16.0)
                flowers(B, grp, (rr * math.cos(aa), rr * math.sin(aa), z + 0.40), rng, 5, 0.5)
    elif kind == "camp":
        add_disc(stone, cx, cy, z, 5.9, n, (0.90, 0.92, 0.90))
        add_annulus(fol, cx, cy, z, 5.9, R, n, (1.0, 1.0, 0.95))
        for e in node["entries"]:
            add_strip(stone, (cx + 5.6 * math.cos(e), cy + 5.6 * math.sin(e)),
                      (cx + (R - 0.12) * math.cos(e), cy + (R - 0.12) * math.sin(e)), 1.4, z + 0.02,
                      (0.82, 0.84, 0.80))
        for _ in range(26):
            th = rng.uniform(0, TAU)
            if not free_angle(node, th, 2.4):
                continue
            rr = rng.uniform(7.0, 9.9)
            p = (cx + rr * math.cos(th), cy + rr * math.sin(th), z)
            if rng.random() < 0.55:
                bush(B, grp, p, rng.uniform(0.45, 0.95), rng,
                     tint=(rng.uniform(0.85, 1.1), rng.uniform(0.9, 1.15), rng.uniform(0.8, 1.0)))
            else:
                flowers(B, grp, p, rng, rng.randint(3, 5), 0.6)
        placed = 0
        for _ in range(30):
            if placed >= 2:
                break
            th = rng.uniform(0, TAU)
            if free_angle(node, th, 3.4):
                tree(B, grp, (cx + 8.9 * math.cos(th), cy + 8.9 * math.sin(th), z), rng)
                placed += 1
    elif kind == "anchor":
        zx, zy = node["zone"]
        add_disc(stone, cx, cy, z, R, n, (0.84, 0.86, 0.84))
        add_annulus(stone, zx, zy, z + 0.01, ANCHOR_ZONE_R, ANCHOR_ZONE_R + 0.22, 40, GOLD)
        add_annulus(stone, zx, zy, z + 0.01, ANCHOR_ZONE_R + 0.5, ANCHOR_ZONE_R + 0.6, 40, GOLD)
        glyph(B, grp, zx, zy, z + 0.002, 1.6, node["shell"] * 31, col=GOLD)
        phi = node["phi"]
        for k, da in enumerate((-1.0, 0.0, 1.0)):
            a = phi + da * 0.95
            menhir(B, grp, (zx + 5.0 * math.cos(a), zy + 5.0 * math.sin(a), z),
                   rng.uniform(2.6, 3.6), rng.uniform(0.45, 0.6), rng)
        for _ in range(8):
            th = rng.uniform(0, TAU)
            if not free_angle(node, th, 2.6):
                continue
            rr = rng.uniform(8.5, 10.6)
            bush(B, grp, (cx + rr * math.cos(th), cy + rr * math.sin(th), z), rng.uniform(0.5, 0.9), rng)
    else:  # islet or balcony
        add_disc(stone, cx, cy, z, R, n, (0.86, 0.88, 0.86))
        if kind == "balcony":
            # flagstone ring and planters with Iris flowers along the balustrade
            add_annulus(stone, cx, cy, z + 0.004, 2.0, 2.2, 36, GOLD)
            for _ in range(12):
                th = rng.uniform(0, TAU)
                if not free_angle(node, th, 2.6):
                    continue
                rr = R - 0.9
                flowers(B, grp, (cx + rr * math.cos(th), cy + rr * math.sin(th), z), rng, 6, 0.45,
                        palette=[(0.55, 0.35, 1.0), (0.75, 0.55, 1.0), (1.0, 1.0, 0.95)])
                bush(B, grp, (cx + rr * math.cos(th + 0.1), cy + rr * math.sin(th + 0.1), z), 0.45, rng)
        else:
            placed = False
            for _ in range(16):
                th = rng.uniform(0, TAU)
                if free_angle(node, th, 2.8):
                    if not placed:
                        tree(B, grp, (cx + 3.9 * math.cos(th), cy + 3.9 * math.sin(th), z), rng)
                        placed = True
                    else:
                        bush(B, grp, (cx + 4.3 * math.cos(th), cy + 4.3 * math.sin(th), z),
                             rng.uniform(0.4, 0.75), rng)
    h = PARAPET_H + (0.1 if kind == "balcony" else 0.0)
    ring_wall(B, grp, cx, cy, z, r_par_in, R, h, parapet_runs(node, R - PARAPET_T / 2))
    ftf.prism_ngon(B.col_walk, 32 if R > 9 else 20, R, R, z - 1.0, z, center=(cx, cy))


def greenery_on_pillar(B, node, terraces, rng):
    cx, cy = node["x"], node["y"]
    grp = group_of(cx, cy)
    for r_t, z_t in terraces:
        nb = int(r_t * 0.9)
        for _ in range(nb):
            th = rng.uniform(0, TAU)
            rr = r_t - rng.uniform(0.4, 1.0)
            p = (cx + rr * math.cos(th), cy + rr * math.sin(th), z_t)
            if rng.random() < 0.8:
                bush(B, grp, p, rng.uniform(0.5, 1.0), rng,
                     tint=(rng.uniform(0.8, 1.05), rng.uniform(0.9, 1.15), rng.uniform(0.75, 0.95)))
            else:
                flowers(B, grp, p, rng, 5, 0.5)
        nv = int(r_t * 0.55)
        for _ in range(nv):
            th = rng.uniform(0, TAU)
            top = (cx + (r_t + 0.2) * math.cos(th), cy + (r_t + 0.2) * math.sin(th), z_t + 0.1)
            vine(B, grp, top, (math.cos(th), math.sin(th)), rng.uniform(2.5, 6.5), rng.uniform(0.6, 1.0), rng)
    if node["kind"] in ("camp", "plaza", "anchor") and rng.random() < 0.9:
        r_t, z_t = terraces[0]
        th = rng.uniform(0, TAU)
        tree(B, grp, (cx + (r_t - 0.9) * math.cos(th), cy + (r_t - 0.9) * math.sin(th), z_t), rng, h=rng.uniform(3, 4))


# ------------------------------------------------------------------ colours

def lowfreq(p, k=1.0):
    """Smooth large-scale variation in 0..1 (no per-vertex noise: on fans and long
    triangles per-vertex randomness would show as radial streaks)."""
    x, y, z = p[0] * k, p[1] * k, p[2] * k
    v = (math.sin(x * 0.131 + 1.3) * math.sin(y * 0.117 + 0.4) + 0.6 * math.sin(x * 0.047 - y * 0.061 + z * 0.09)
         + 0.4 * math.sin(z * 0.21 + x * 0.05))
    return 0.5 + 0.25 * v


def color_fn_for(mat):
    def rock(p, n, c):
        r, g, b = c
        z = p[2]
        moss = max(0.0, min(1.0, (n[2] - 0.35) / 0.4))
        v = 0.78 + 0.45 * lowfreq(p, 1.6)
        rr, gg, bb = r * v, g * v, b * v
        rr, gg, bb = (rr * (1 - moss) + 0.62 * moss * rr, gg * (1 - moss) + 0.80 * moss * gg,
                      bb * (1 - moss) + 0.42 * moss * bb)
        fade = max(0.0, min(1.0, (-10.0 - z) / 26.0))
        return (rr * (1 - fade) + 1.15 * fade, gg * (1 - fade) + 1.30 * fade, bb * (1 - fade) + 1.42 * fade)

    def stone(p, n, c):
        v = 0.90 + 0.16 * lowfreq(p, 2.0)
        under = 1.0 if n[2] > -0.3 else 0.78
        z = p[2]
        fade = max(0.0, min(1.0, (-6.0 - z) / 10.0))
        r, g, b = c[0] * v * under, c[1] * v * under, c[2] * v * under
        return (r * (1 - fade) + 0.9 * fade * r + 0.1 * fade, g * (1 - fade) + fade * (0.9 * g + 0.12),
                b * (1 - fade) + fade * (0.9 * b + 0.14))

    def foliage(p, n, c):
        return c
    return {"rock": rock, "stone": stone, "foliage": foliage}[mat]


# ------------------------------------------------------------------ textures

def tex_rock(k):
    """Weathered cliff without cell outlines (those read as masonry): layered strata,
    sparse ridged fractures, vertical rain streaks and lichen."""
    vec, w = ftf.torus_coords(k, 1, 1)
    vs, ws = ftf.torus_coords(k, 0.35, 2.4)       # strata: varies mostly with height
    vr, wr = ftf.torus_coords(k, 5.0, 0.35)       # streaks: vary mostly across
    vf, wf = ftf.torus_coords(k, 1.6, 0.8)        # fractures: mostly vertical
    n1 = k.noise(vec, 5.0, 8.0, 0.62, w=w, distortion=0.5)
    big = k.noise(vec, 1.6, 4.0, 0.55, w=w)
    strata = k.noise(vs, 3.0, 6.0, 0.6, w=ws, distortion=0.3)
    streak = k.noise(vr, 3.0, 4.0, 0.55, w=wr)
    fr = k.noise(vf, 3.5, 6.0, 0.55, w=wf, distortion=0.6)
    ridge = k.math("SUBTRACT", 1.0, k.math("ABSOLUTE", k.math("SUBTRACT", k.math("MULTIPLY", fr, 2.0), 1.0)))
    crack = k.math("MULTIPLY", k.maprange(ridge, 0.93, 0.99), k.maprange(big, 0.35, 0.6))
    fine = k.noise(vec, 44.0, 4.0, 0.6, w=w)
    h = k.math("ADD", k.math("MULTIPLY", strata, 0.45), k.math("MULTIPLY", n1, 0.35))
    h = k.math("ADD", h, k.math("MULTIPLY", big, 0.30))
    h = k.math("SUBTRACT", h, k.math("MULTIPLY", crack, 0.14))
    h = k.math("ADD", h, k.math("MULTIPLY", fine, 0.08))
    tone = k.math("ADD", k.math("MULTIPLY", n1, 0.5), k.math("MULTIPLY", strata, 0.5))
    base = k.ramp(tone, [(0.25, (0.07, 0.077, 0.075)), (0.50, (0.155, 0.168, 0.16)),
                         (0.78, (0.28, 0.29, 0.27))])
    base = k.mix(k.maprange(big, 0.3, 0.7, 0.0, 0.3), base, (0.22, 0.215, 0.19))
    base = k.mix(k.maprange(streak, 0.55, 0.72, 0.0, 0.4), base, (0.05, 0.055, 0.055))
    lich = k.maprange(k.noise(vec, 11.0, 5.0, 0.65, w=w), 0.58, 0.66)
    c = k.mix(k.math("MULTIPLY", lich, 0.6), base, (0.26, 0.28, 0.16))
    c = k.mix(k.math("MULTIPLY", crack, 0.75), c, (0.03, 0.032, 0.032))
    c = k.mix(0.35, c, k.maprange(fine, 0.3, 0.7, 0.82, 1.14), blend="MULTIPLY")
    rough = k.math("ADD", 0.80, k.math("MULTIPLY", fine, 0.14))
    rough = k.math("SUBTRACT", rough, k.math("MULTIPLY", k.maprange(streak, 0.55, 0.72), 0.12))
    return {"color": c, "rough": rough, "height": h}


def tex_stone(k):
    """Noise channels only; the flagstone pattern is a tiling numpy Voronoi."""
    vec, w = ftf.torus_coords(k, 1, 1)
    return {"n": k.noise(vec, 22.0, 6.0, 0.55, w=w), "m": k.noise(vec, 90.0, 3.0, 0.5, w=w),
            "wear": k.noise(vec, 6.0, 3.0, 0.5, w=w), "moss": k.noise(vec, 12.0, 4.0, 0.6, w=w),
            "warp": k.noise(vec, 9.0, 2.0, 0.5, w=w)}


def compose_stone(res, size):
    import numpy as np
    edge, cid = ftf.periodic_voronoi(size, 5, 4242, jitter=0.95)
    rnd = np.random.default_rng(7).random(int(cid.max()) + 1).astype(np.float32)
    cell = rnd[cid]
    n, m, wear, moss = res["n"], res["m"], res["wear"], res["moss"]
    e = edge + (res["warp"] - 0.5) * 0.03
    joint = ftf.smoothstep(0.012, 0.035, e)
    bev = np.sqrt(np.clip(e / 0.10, 0, 1))
    h = bev * 0.6 + n * 0.22 + m * 0.07 + cell * 0.12
    # weathered warm limestone (style addendum: ancient, eroded, desaturated)
    lo, mid, hi = np.array([0.21, 0.205, 0.19]), np.array([0.31, 0.30, 0.275]), np.array([0.41, 0.395, 0.355])
    t = cell[..., None]
    tint = np.where(t < 0.5, lo + (mid - lo) * (t / 0.5), mid + (hi - mid) * ((t - 0.5) / 0.5))
    c = tint * (0.78 + 0.40 * np.clip((n[..., None] - 0.3) / 0.4, 0, 1))
    wr = ftf.smoothstep(0.55, 0.7, wear)[..., None] * 0.35
    c = c * (1 - wr) + np.array([0.42, 0.42, 0.39]) * wr
    ms = ftf.smoothstep(0.38, 0.55, moss)[..., None]
    jc = np.array([0.05, 0.05, 0.045]) * (1 - ms) + np.array([0.06, 0.095, 0.03]) * ms
    j = joint[..., None]
    c = c * j + jc * (1 - j)
    # moss creeping out of the joints onto the stone edges
    creep = (ftf.smoothstep(0.035, 0.0, e - 0.035) * ftf.smoothstep(0.5, 0.65, moss))[..., None] * 0.55
    c = c * (1 - creep) + np.array([0.075, 0.105, 0.04]) * creep
    # hairline cracks (worn, ancient paving)
    cr = ftf.smoothstep(0.62, 0.66, res["warp"]) * ftf.smoothstep(0.70, 0.66, res["warp"])
    c = c * (1 - 0.45 * cr[..., None])
    h = h - 0.05 * cr
    rough = 0.92 - 0.2 * joint - 0.12 * ftf.smoothstep(0.55, 0.7, wear)
    return c, rough, h


def tex_foliage(k):
    vec, w = ftf.torus_coords(k, 1, 1)
    vg, wg = ftf.torus_coords(k, 1.0, 0.18)
    clump = k.noise(vec, 7.0, 6.0, 0.62, w=w)
    blades = k.noise(vg, 55.0, 3.0, 0.5, w=wg)
    leaf = k.noise(vec, 24.0, 4.0, 0.55, w=w, distortion=0.6)
    h = k.math("ADD", k.math("MULTIPLY", clump, 0.55), k.math("MULTIPLY", blades, 0.3))
    h = k.math("ADD", h, k.math("MULTIPLY", leaf, 0.2))
    c = k.ramp(k.math("ADD", k.math("MULTIPLY", clump, 0.6), k.math("MULTIPLY", blades, 0.4)),
               [(0.30, (0.020, 0.040, 0.014)), (0.48, (0.050, 0.095, 0.028)),
                (0.62, (0.11, 0.17, 0.045)), (0.78, (0.22, 0.25, 0.085))])
    fl = k.voronoi(vec, 34.0, "F1", w=w)
    flc = k.bw(k.voronoi(vec, 34.0, "F1", w=w, out="Color"))
    dot = k.math("MULTIPLY", k.maprange(fl, 0.10, 0.06), k.maprange(flc, 0.86, 0.88))
    flower = k.mix(k.maprange(flc, 0.93, 0.95), (0.33, 0.20, 0.55), (0.80, 0.80, 0.74))
    c = k.mix(dot, c, flower)
    rough = k.math("ADD", 0.82, k.math("MULTIPLY", blades, 0.12))
    return {"color": c, "rough": rough, "height": h}


TEX_SPECS = {
    # name: (bake builder, numpy compose or None, normal strength, ao radius px, ao strength)
    "rock": (tex_rock, None, 30.0, 10, 2.6),
    "stone": (tex_stone, compose_stone, 16.0, 6, 3.2),
    "foliage": (tex_foliage, None, 30.0, 6, 2.2),
}


def stage_textures():
    import numpy as np
    clock = ftf.StageClock("island")
    clock.start("textures_bake")
    sc = ftf.reset_scene()
    dev = ftf.use_gpu(sc, "island")
    os.makedirs(TEX_DIR, exist_ok=True)
    out = {"device": dev, "files": {}}
    for name, (fn, compose, nstr, aor, aos) in TEX_SPECS.items():
        res = ftf.bake_tiling_texture(sc, name, TEX_SIZE * 2, fn, samples=8, tag="island")
        res = {k_: ftf.downsample(v, 2) for k_, v in res.items()}
        if compose:
            col, rough, h = compose(res, TEX_SIZE)
        else:
            col, rough, h = res["color"], res["rough"], res["height"]
        nrm = ftf.normal_from_height(h, nstr)
        ao = ftf.cavity_ao(h, aor, aos)
        files = {
            "basecolor": ftf.save_rgb(ftf.to_srgb(col), os.path.join(TEX_DIR, f"island_{name}_basecolor.jpg"), 92),
            "orm": ftf.save_rgb(np.stack([ao, np.clip(rough, 0, 1), np.zeros_like(ao)], -1),
                                os.path.join(TEX_DIR, f"island_{name}_orm.jpg"), 92),
            "normal": ftf.save_rgb(nrm, os.path.join(TEX_DIR, f"island_{name}_normal.jpg"), 95),
        }
        out["files"][name] = {k: {"file": os.path.relpath(v, REPO).replace("\\", "/"),
                                  "bytes": os.path.getsize(v), "size": TEX_SIZE} for k, v in files.items()}
    clock.stop()
    out["stages"] = clock.stages
    os.makedirs(QA_DIR, exist_ok=True)
    with open(os.path.join(QA_DIR, "texture-stats.json"), "w") as fh:
        json.dump(out, fh, indent=2)


# ------------------------------------------------------------------ walk table

def walk_table(nodes, edges, spans):
    """Path lengths between neighbouring gameplay points along the walkable route."""
    def edge_len(a, b):
        st = spans[(a, b)] if (a, b) in spans else list(reversed(spans[(b, a)]))
        A, B = nodes[a], nodes[b]
        pts = [Vector((A["x"], A["y"], A["z"]))] + [p for _s, p in st] + [Vector((B["x"], B["y"], B["z"]))]
        return sum((q - p).length for p, q in zip(pts, pts[1:]))

    rows = []

    def row(name, path, extra=0.0):
        L = sum(edge_len(a, b) for a, b in zip(path, path[1:])) + extra
        rows.append({"pair": name, "path": path, "metres": round(L, 1),
                     "seconds_at_4mps": round(L / WALK_SPEED, 1),
                     "seconds_at_2_2mps": round(L / 2.2, 1)})
    for stem, *_ in CAMPS:
        row(f"scroll-camp_{stem}", ["plaza", f"spoke_{stem}", f"camp_{stem}"])
    for i in range(len(CAMPS)):
        a, b = CAMPS[i][0], CAMPS[(i + 1) % len(CAMPS)][0]
        row(f"camp_{a}-camp_{b}", [f"camp_{a}", f"ring_{a}_{b}", f"camp_{b}"])
    for name, n in nodes.items():
        if n["kind"] != "anchor":
            continue
        ring = [a for a, b in edges if b == name][0]
        camps = [x for x, y in edges if y == ring] + [y for x, y in edges if x == ring and y.startswith("camp")]
        for c in camps:
            row(f"{c}-{name}_zone", [c, ring, name], ANCHOR_ZONE_OFFSET)
    row("spawn-camp_iris", ["balcony", "camp_iris"])
    return rows


# ------------------------------------------------------------------ build

def stage_build():
    clock = ftf.StageClock("island")
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    clock.start("layout_geometry")
    sc = ftf.reset_scene()
    nodes, edges = make_layout()
    B = Builder()
    rng = random.Random(1107)
    terr = {}
    for i, (name, n) in enumerate(sorted(nodes.items())):
        terraces, _lip, _g = pillar(B, n, 100 + i)
        terr[name] = terraces
    for name, n in sorted(nodes.items()):
        plateau_top(B, n, random.Random(sid(name) % 100000))
        greenery_on_pillar(B, n, terr[name], random.Random(sid(name) % 100000 + 7))
    spans = {}
    span_len = {}
    for i, (a, b) in enumerate(edges):
        span, st = bridge(B, nodes[a], nodes[b], 500 + i)
        spans[(a, b)] = st
        span_len[f"{a}->{b}"] = round(span, 1)
    stats["bridge_spans_m"] = span_len

    clock.start("materials_objects")
    imgs = {}
    for mat in ("rock", "stone", "foliage"):
        for ch in ("basecolor", "orm", "normal"):
            p = os.path.join(TEX_DIR, f"island_{mat}_{ch}.jpg")
            im = bpy.data.images.load(p)
            if ch != "basecolor":
                im.colorspace_settings.name = "Non-Color"
            imgs[(mat, ch)] = im
    mats = {m: ftf.pbr_material(f"M_Island_{m.capitalize()}", imgs[(m, "basecolor")], imgs[(m, "orm")],
                                imgs[(m, "normal")], vertex_color=True, double_sided=(m == "foliage"))
            for m in ("rock", "stone", "foliage")}
    out = ftf.new_collection("Export")
    work = ftf.new_collection("Work")
    groups = {}
    for (grp, mat), geo in sorted(B.geos.items()):
        if not geo.f:
            continue
        o = geo.to_object(f"tmp_{grp}_{mat}", mats[mat], work, uv_tile=TILE[mat], color_fn=color_fn_for(mat))
        ftf.triangulate_ngons(o)
        if mat == "rock":
            ftf.finish_shading(o, angle=24)
        elif mat == "foliage":
            ftf.finish_shading(o, angle=85)
        else:
            ftf.finish_shading(o, angle=32)
        groups.setdefault(grp, []).append(o)
    sectors = []
    for grp, objs in sorted(groups.items()):
        o = ftf.join(objs, f"island_{grp}")
        work.objects.unlink(o)
        out.objects.link(o)
        sectors.append(o)
    cols = []
    for name, bm in (("island_walk_col", B.col_walk), ("island_wall_col", B.col_wall)):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        o = ftf.bm_object(name, bm, None, out)
        ftf.triangulate_ngons(o)
        cols.append(o)

    clock.start("sockets_export")
    sockets = []
    sockets.append(ftf.add_empty("socket_scroll", (0, 0, 0), out, 0.0,
                                 {"socket": "scroll_table", "clear_radius_m": 2.2}))
    for stem, label, a, z in CAMPS:
        n = nodes[f"camp_{stem}"]
        sockets.append(ftf.add_empty(f"socket_camp_{stem}", (n["x"], n["y"], n["z"]), out,
                                     n["phi"] - math.pi / 2,
                                     {"socket": "camp", "clan": stem, "label": label,
                                      "build_area_m": [8, 8], "front": "local +Z (glTF) faces the plaza"}))
    for name, n in sorted(nodes.items()):
        if n["kind"] == "anchor":
            zx, zy = n["zone"]
            sockets.append(ftf.add_empty(f"socket_anchor_{n['shell']}", (zx, zy, n["z"]), out,
                                         n["phi"] - math.pi / 2,
                                         {"socket": "anchor_zone", "shell": n["shell"],
                                          "zone_radius_m": ANCHOR_ZONE_R,
                                          "shell_float_height_m": SHELL_FLOAT}))
    bal = nodes["balcony"]
    iris = nodes["camp_iris"]
    d = Vector((iris["x"] - bal["x"], iris["y"] - bal["y"], 0)).normalized()
    sp = Vector((bal["x"], bal["y"], bal["z"])) - d * 1.5
    sockets.append(ftf.add_empty("socket_spawn", tuple(sp), out, math.atan2(d.y, d.x) + math.pi / 2,
                                 {"socket": "spawn", "facing": "local +Z (glTF) looks toward the Iris camp"}))
    stats["materials"] = sorted(m.name for m in mats.values())
    stats["objects"] = {o.name: ftf.mesh_tris(o) for o in sectors}
    stats["runtime_triangles_blender"] = sum(stats["objects"].values())
    stats["collision_triangles_blender"] = {o.name: ftf.mesh_tris(o) for o in cols}
    lo, hi = ftf.world_bounds(sectors)
    stats["bounds_blender_zup"] = {"min": [round(v, 2) for v in lo], "max": [round(v, 2) for v in hi]}
    stats["layout"] = {
        "walk_speed_mps": WALK_SPEED, "ring_radius_m": R_CAMP, "plaza_radius_m": PLAZA_R,
        "camp_plateau_radius_m": CAMP_R, "anchor_islet_centre_radius_m": ANCHOR_AT,
        "nodes": {k: {"kind": v["kind"], "centre_blender": [round(v["x"], 2), round(v["y"], 2), v["z"]],
                      "radius_m": v["r"]} for k, v in sorted(nodes.items())},
        "edges": edges,
    }
    stats["walk_table"] = walk_table(nodes, edges, spans)
    sec = [r["seconds_at_4mps"] for r in stats["walk_table"] if not r["pair"].startswith("spawn")]
    stats["walk_seconds_range_at_4mps"] = [min(sec), max(sec)]
    size = ftf.export_glb(GLB_PATH, sectors + cols + sockets)
    stats["glb_bytes"] = size
    stats["glb"] = ftf.inspect_glb(GLB_PATH)
    stats["runtime_triangles"] = stats["glb"]["triangles_render"]
    stats["budget_ok"] = {"triangles": stats["runtime_triangles"] <= TRI_BUDGET,
                          "materials": len(mats) <= 3,
                          "walk_30_45s": 30.0 <= min(sec) and max(sec) <= 45.0}
    clock.stop()
    tex_stats = os.path.join(QA_DIR, "texture-stats.json")
    if os.path.exists(tex_stats):
        with open(tex_stats) as fh:
            ts = json.load(fh)
        stats["textures"] = ts["files"]
        stats["stages"] = ts["stages"] + stats["stages"]
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    os.makedirs(QA_DIR, exist_ok=True)
    with open(STATS_PATH, "w") as fh:
        json.dump(stats, fh, indent=2)
    log("runtime tris", stats["runtime_triangles"], "glb", size, "walk", stats["walk_seconds_range_at_4mps"])


# ------------------------------------------------------------------ render

def cloud_sea(col):
    """Render-only cloud sea: stacked noise-alpha layers and an opaque floor.
    Not exported; the game draws its own fog/cloud layer."""
    S = 1400.0
    for i, (z, scale, lo, hi) in enumerate(((-9.0, 0.014, 0.60, 0.78), (-13.0, 0.011, 0.52, 0.72),
                                            (-17.0, 0.016, 0.46, 0.66), (-22.0, 0.010, 0.40, 0.60),
                                            (-27.0, 0.013, 0.34, 0.54), (-32.0, 0.009, 0.28, 0.48))):
        m = bpy.data.materials.new(f"Cloud{i}")
        m.use_nodes = True
        k = ftf.NodeKit(m)
        b = k.n["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.48, 0.55, 0.60, 1)
        b.inputs["Roughness"].default_value = 1.0
        co = k.coord("Object")
        n = k.noise(k.vmath("SCALE", co, scale=scale), 1.0, 6.0, 0.6, w=float(i * 3.7), distortion=0.3)
        k.link(k.maprange(n, lo, hi, 0.0, 0.85), b.inputs["Alpha"])
        b.inputs["Emission Color"].default_value = (0.40, 0.48, 0.54, 1)
        b.inputs["Emission Strength"].default_value = 0.12
        me = bpy.data.meshes.new(f"cloud{i}")
        me.from_pydata([(-S, -S, z), (S, -S, z), (S, S, z), (-S, S, z)], [], [(0, 1, 2, 3)])
        me.materials.append(m)
        ftf.link(bpy.data.objects.new(f"cloud{i}", me), col)
    m = ftf.simple_material("CloudFloor", (0.40, 0.47, 0.52), 1.0, emit=(0.34, 0.42, 0.48), emit_strength=0.3)
    me = bpy.data.meshes.new("cloud_floor")
    S = 3000.0
    me.from_pydata([(-S, -S, -36), (S, -S, -36), (S, S, -36), (-S, S, -36)], [], [(0, 1, 2, 3)])
    me.materials.append(m)
    ftf.link(bpy.data.objects.new("cloud_floor", me), col)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def place_asset(path, loc, rot_z, col):
    objs = import_glb(path)
    root = ftf.link(bpy.data.objects.new(os.path.basename(path) + "_root", None), col)
    for o in objs:
        if o.parent is None:
            o.parent = root
        if o.name.endswith("_col") or o.name.startswith("socket_"):
            o.hide_render = True
        if o.name.endswith("_inspect"):
            o.hide_render = True
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    return objs


def human_proxy(col, loc, rot_z=0.0):
    """1.75 m figure with a violet scarf (scale reference, render only)."""
    cloak = ftf.simple_material("ProxyCloak", (0.05, 0.05, 0.055), 0.85)
    scarf = ftf.simple_material("ProxyScarf", (0.16, 0.07, 0.30), 0.8)
    bm = bmesh.new()
    ftf.revolve(bm, [(0.30, 0.0), (0.27, 0.6), (0.22, 1.2), (0.20, 1.42), (0.08, 1.50)], 20, cap_top=True)
    body = ftf.bm_object("proxy_body", bm, cloak, col)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.12)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 1.62))
    head = ftf.bm_object("proxy_head", bm, cloak, col)
    bm = bmesh.new()
    ftf.revolve(bm, [(0.17, 1.36), (0.21, 1.42), (0.16, 1.52)], 20)
    sc_ = ftf.bm_object("proxy_scarf", bm, scarf, col)
    for o in (body, head, sc_):
        o.location = loc
        o.rotation_euler = (0, 0, rot_z)
        ftf.finish_shading(o, 60)


def shell_proxy(col, loc):
    """Pale stand-in for a Shell (render only; the Shells are separate assets)."""
    m = ftf.simple_material("ShellProxy", (0.75, 0.74, 0.72), 0.35)
    bm = bmesh.new()
    prof = []
    for i in range(25):
        t = i / 24
        prof.append((max(0.05, 6.5 * math.sin(math.pi * t) ** 0.8 * (1 + 0.04 * math.sin(t * 60))), 18 * t))
    ftf.revolve(bm, prof, 40, cap_bottom=True, cap_top=True)
    o = ftf.bm_object("shell_proxy", bm, m, col)
    o.location = loc
    ftf.finish_shading(o, 60)


def stage_render(samples=160, res=(1600, 900)):
    clock = ftf.StageClock("island")
    clock.start("qa_renders")
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, res[0], res[1], samples)
    dev = ftf.use_gpu(sc, "island")
    env = ftf.new_collection("Env")
    sc.world = ftf.sky_world(zenith=(0.10, 0.15, 0.18), horizon=(0.42, 0.48, 0.50),
                             ground=(0.34, 0.40, 0.43), strength=1.0)
    ftf.add_sun(env, energy=3.6, color=(1.0, 0.88, 0.72), elev=24, azim=-140)
    cloud_sea(env)
    island = import_glb(GLB_PATH)
    objs = {o.name: o for o in island}
    cols = [o for o in island if o.name.endswith("_col")]
    for c in cols:
        c.hide_render = True
    socks = {o.name: o for o in island if o.name.startswith("socket_")}
    placed = {}
    props = ftf.new_collection("Placed")
    for stem, *_ in CAMPS:
        p = os.path.join(MODELS, f"camp_{stem}.glb")
        s = socks.get(f"socket_camp_{stem}")
        if s and os.path.exists(p):
            place_asset(p, s.matrix_world.translation.copy(), s.matrix_world.to_euler().z, props)
            placed[f"camp_{stem}"] = True
    for n in range(1, 5):
        s = socks.get(f"socket_anchor_{n}")
        if not s:
            continue
        loc = s.matrix_world.translation.copy()
        shell_proxy(props, loc + Vector((0, 0, SHELL_FLOAT)))
        ap = os.path.join(MODELS, "anchor.glb")
        if os.path.exists(ap):
            place_asset(ap, loc + Vector((1.2, 0.0, 0)), 0.0, props)
            placed["anchor"] = True
    st = os.path.join(MODELS, "scroll_table.glb")
    if os.path.exists(st):
        place_asset(st, (0, 0, 0), 0.0, props)
        placed["scroll_table"] = True
    else:
        m = ftf.simple_material("ScrollProxy", (0.25, 0.27, 0.26), 0.6)
        bm = bmesh.new()
        ftf.revolve(bm, [(1.5, 0.0), (1.5, 0.9), (1.2, 1.0)], 48, cap_top=True)
        ftf.bm_object("scroll_proxy", bm, m, props)
    spawn = socks["socket_spawn"].matrix_world.translation.copy()
    human_proxy(props, spawn + Vector((0.0, 0.0, 0.0)), 0.0)

    out = os.path.join(QA_DIR, "final")
    timings = {}

    def shot(name, loc, tgt, lens=None, fov=None):
        cam = ftf.add_camera(f"cam_{name}", loc, tgt, lens=lens or 35, fov_v_deg=fov, col=env)
        timings[name] = ftf.render_to(sc, cam, os.path.join(out, f"island_{name}.jpg"))
        log("render", name, timings[name])

    def iso(name, focus, dist):
        t = min(1, max(0, (dist - 4.5) / (70 - 4.5)))
        pitch = math.radians(14 + 48 * t ** 0.6)
        fov = 50 - 18 * t ** 0.5
        f = Vector(focus) + Vector((0, 0, 1.55 - 0.45 * t))
        loc = f + Vector((0, -math.cos(pitch) * dist, math.sin(pitch) * dist))
        shot(name, loc, f, fov=fov)

    iris = socks["socket_camp_iris"].matrix_world.translation.copy()
    a2 = socks["socket_anchor_2"].matrix_world.translation.copy()
    shot("concept_balcony", spawn + Vector((3.0, -7.5, 6.5)), Vector((0, -30, -10)), lens=22)
    shot("overview_high", Vector((-120, -330, 170)), Vector((0, -10, -12)), lens=30)
    shot("overview_top", Vector((0, -1, 620)), Vector((0, 0, 0)), lens=35)
    iso("iso_far_iris", iris, 70)
    iso("iso_far_plaza", (0, 0, 0), 70)
    iso("iso_mid_iris_bridge", iris + Vector((0, 22, 0)), 30)
    iso("iso_far_anchor2", a2, 70)
    shot("close_medallion", Vector((5.5, -10.5, 4.2)), Vector((0, 0, 0)), lens=28)
    ib = socks["socket_camp_iris"].matrix_world.translation
    shot("close_bridge_arch", Vector((ib.x + 26, ib.y + 40, ib.z - 9)), Vector((ib.x, ib.y + 35, ib.z - 2)), lens=30)
    sal = socks["socket_camp_sol"].matrix_world.translation
    shot("close_pillar_terraces", Vector((sal.x - 18, sal.y - 26, sal.z - 3)), Vector((sal.x, sal.y, sal.z - 6)), lens=32)
    shot("close_balcony", spawn + Vector((-5.5, 9.0, 2.0)), spawn + Vector((0, -2, 0.3)), lens=28)
    # collision overlay
    cm = ftf.collision_overlay_material()
    for c in cols:
        c.hide_render = False
        c.data.materials.clear()
        c.data.materials.append(cm)
    shot("collision_overlay", Vector((iris.x + 40, iris.y - 45, iris.z + 55)), Vector((iris.x, iris.y + 25, iris.z)), lens=32)
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": dev, "resolution": list(res), "samples": samples, "placed_assets": placed,
                   "render_only_proxies": ["cloud sea layers", "Shell stand-ins", "1.75 m figure",
                                           "scroll table stand-in if scroll_table.glb is missing"],
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"textures": stage_textures,
     "build": stage_build,
     "render": stage_render,
     "all": lambda: (stage_textures(), stage_build(), stage_render())}[stage]()
