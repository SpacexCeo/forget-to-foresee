"""Procedural source for island.glb (Forget to Foresee): the floating archipelago.

Run headless with Blender 4.5 LTS:

    blender -b -P art/island/build_island.py -- textures   # bake the tiling texture sets (GPU)
    blender -b -P art/island/build_island.py -- build      # geometry, collision, sockets, export
    blender -b -P art/island/build_island.py -- render     # QA renders of the exported .glb
    blender -b -P art/island/build_island.py -- all        # textures + build + render

The geometry follows game/src/scenes/layout.js exactly (the gameplay and collision truth):
a round plaza (r 9) with the Scroll medallion in the centre and four gold-inlaid anchor zones
(r 1.5) on its diagonals at ring radius 6.6; six camp plateaus (r 6.5) on a 30 m ring at the
clan angles; straight railed bridges (deck 2.4 m, rails 1.0 m) from the plaza to every camp,
three neighbour links and the balcony bridge (balcony at 120 deg / 46 m, r 5); rock pillars
that sink ~42 m toward the cloud sea at -28 m. Every walkable top is at height 0.

Coordinates: Blender is Z-up and the glTF export converts to Y-up with
(x, y, z)_blender -> (x, z, -y)_gltf. A client ground point at angle a (layout.js: 0 = +X,
90 = +Z toward the default camera) is therefore Blender (r cos a, -r sin a); a client
rotation about +Y by t is a Blender rotation about +Z by the same t.

Materials: three tiling PBR sets with vertex colour (no unique atlas) plus two untextured ones.
  M_Island_Rock     cliffs, pillars, menhirs, tree trunks, ruins   (tile 10 m)
  M_Island_Stone    paving, walls, parapets, bridges, flowers       (tile 4 m)
  M_Island_Foliage  grass, bushes, vines, tree crowns               (tile 3 m, double sided)
  M_Island_Gold     inlays of the medallion, anchor zones, glyphs   (metallic, no texture)
  M_Island_Lantern  lantern glass (emissive, no texture)
Vertex colour multiplies the base colour: moss on ledges, the fade toward the cloud sea,
per-bush tints. Style (owner addendum 07.11): monumental weathered stone, moss in crevices,
ruined grandeur (broken columns, toppled drums), restrained palette with gold accents.
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
RAW_GLB = os.environ.get("ISLAND_RAW_GLB", GLB_PATH)   # uncompressed export (renders read it)
PLAIN_DIR = os.environ.get("ISLAND_PLAIN_DIR", MODELS)  # decompressed camps etc. for renders
BLEND_PATH = os.path.join(HERE, "island.blend")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")


def log(*a):
    ftf.log("island", *a)


# ------------------------------------------------------------------ layout (= layout.js)

WALK_SPEED = 1.7
PLAZA_R = 9.0
RING_R = 30.0
PLATEAU_R = 6.5
BRIDGE_W = 2.4
RAIL_H = 1.0
ANCHOR_RING_R = 6.6
ANCHOR_ZONE_R = 1.5
BALCONY_ANGLE, BALCONY_RADIUS, BALCONY_SIZE = 120.0, 46.0, 5.0
PILLAR_DEPTH = 42.0
CLOUD_LEVEL = -28.0
INSET = 0.4                 # bridge decks overlap the plateau edges (layout.js bridges())
TRI_BUDGET = 120000

# (stem, label, client angle) in engine order (layout.js CLANS)
CAMPS = [("iris", "Iris", 270), ("sol", "Salt", 210), ("pepel", "Ash", 150),
         ("moh", "Moss", 90), ("yantar", "Amber", 30), ("iney", "Frost", 330)]
NEIGHBOR_LINKS = [("moh", "yantar"), ("iris", "iney"), ("sol", "pepel")]
ANCHOR_ZONES = [(i + 1, a) for i, a in enumerate((45, 135, 225, 315))]   # (shell, angle)

HALF_W = BRIDGE_W / 2       # 1.2: outer edge of the deck
RAIL_IN = 1.0               # inner face of the rails (greybox: 0.2 m rail centred at 1.1)
PARAPET_T = 0.35
PARAPET_H = 0.95
DECK_Z = 0.008              # visual deck lift against z-fighting with the plateau tops

TILE = {"rock": 10.0, "stone": 4.0, "foliage": 3.0, "gold": 2.0, "lantern": 1.0}
TEX_SIZE = 2048


def client_to_blender_angle(deg):
    return -math.radians(deg)


def ring_xy(r, deg):
    """Blender ground point of layout.js onRing(r, deg)."""
    return (r * math.cos(math.radians(deg)), -r * math.sin(math.radians(deg)))


def face_plaza(deg):
    """layout.js facePlaza(): rotation about +Y (client) = about +Z (Blender)."""
    return -math.radians(deg) - math.pi / 2


def make_layout():
    nodes = {}

    def node(name, xy, r, kind, **kw):
        nodes[name] = dict(name=name, x=xy[0], y=xy[1], z=0.0, r=r, kind=kind, entries=[], **kw)
        return nodes[name]

    node("plaza", (0.0, 0.0), PLAZA_R, "plaza")
    for stem, label, a in CAMPS:
        node(f"camp_{stem}", ring_xy(RING_R, a), PLATEAU_R, "camp", stem=stem, label=label, angle=a)
    node("balcony", ring_xy(BALCONY_RADIUS, BALCONY_ANGLE), BALCONY_SIZE, "balcony", angle=BALCONY_ANGLE)

    bridges = []
    for stem, _l, a in CAMPS:
        bridges.append(dict(id=f"bridge_{stem}", a="plaza", b=f"camp_{stem}",
                            p0=ring_xy(PLAZA_R - INSET, a), p1=ring_xy(RING_R - PLATEAU_R + INSET, a)))
    for sa, sb in NEIGHBOR_LINKS:
        A, Bn = nodes[f"camp_{sa}"], nodes[f"camp_{sb}"]
        dx, dy = Bn["x"] - A["x"], Bn["y"] - A["y"]
        L = math.hypot(dx, dy)
        e = PLATEAU_R - INSET
        bridges.append(dict(id=f"link_{sa}_{sb}", a=A["name"], b=Bn["name"],
                            p0=(A["x"] + dx / L * e, A["y"] + dy / L * e),
                            p1=(Bn["x"] - dx / L * e, Bn["y"] - dy / L * e)))
    bridges.append(dict(id="bridge_balcony", a="plaza", b="balcony",
                        p0=ring_xy(PLAZA_R - INSET, BALCONY_ANGLE),
                        p1=ring_xy(BALCONY_RADIUS - BALCONY_SIZE + INSET, BALCONY_ANGLE)))
    for br in bridges:
        A, Bn = nodes[br["a"]], nodes[br["b"]]
        ang = math.atan2(Bn["y"] - A["y"], Bn["x"] - A["x"])
        A["entries"].append(ang)
        Bn["entries"].append(ang + math.pi)
    return nodes, bridges


def angle_diff(a, b):
    return abs((a - b + math.pi) % TAU - math.pi)


def free_angle(node, th, clearance, r_at=None):
    """True if direction th (from the node centre) is clear of every bridge by `clearance` m
    laterally, measured at radius r_at (default 0.75 r)."""
    ra = max(r_at or node["r"] * 0.75, 1.0)
    for e in node["entries"]:
        if angle_diff(th, e) < math.asin(min(0.99, clearance / ra)):
            return False
    return True


def group_of(x, y):
    """Sector grouping for frustum culling: plaza core, balcony, one sector per camp."""
    if math.hypot(x, y) < 15.0:
        return "plaza"
    bx, by = ring_xy(BALCONY_RADIUS, BALCONY_ANGLE)
    if math.hypot(x - bx, y - by) < 14.0:
        return "balcony"
    phi = math.atan2(y, x) + 1e-4
    best, bd = None, 1e9
    for stem, _l, a in CAMPS:
        d = angle_diff(phi, client_to_blender_angle(a))
        if d < bd:
            best, bd = stem, d
    return best


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
    """Rock pillar under a plateau: a dressed retaining wall, a planted terrace (two on the
    plaza), then eroded columnar rock tapering down into the cloud sea."""
    kind = node["kind"]
    cx, cy, z0, Rt = node["x"], node["y"], node["z"], node["r"]
    rng = random.Random(seed)
    noise = RockNoise(seed)
    grp = group_of(cx, cy)
    if kind == "plaza":
        n, wall, ter, depth, second = 84, 2.6, 2.8, PILLAR_DEPTH + 4.0, (3.4, 2.4)
    elif kind == "camp":
        n, wall, ter, depth = 56, 2.2, 2.0, PILLAR_DEPTH + rng.uniform(-2.0, 2.0)
        second = (2.8, 1.3) if rng.random() < 0.5 else None
    elif kind == "balcony":
        n, wall, ter, depth, second = 40, 1.6, 1.1, 30.0, None
    else:  # bridge pier
        n, wall, ter, depth, second = 20, 0.7, 0.25, 24.0, None
    prof = [(Rt, z0, 0.0, None)]
    prof.append((Rt, z0 - wall, 0.0, "stone"))
    t_amp = 0.0 if kind == "pier" else min(0.9, ter * 0.4)
    prof.append((Rt + ter, z0 - wall, t_amp, "foliage"))
    prof.append((Rt + ter + 0.25, z0 - wall - 0.35, t_amp, "rock"))
    z = z0 - wall - 0.35
    r_lip = Rt + ter + 0.25
    terraces = [(Rt + ter, z0 - wall)]
    if second:
        w2, t2 = second
        prof.append((r_lip - 0.15, z - w2, 0.0, "rock"))
        prof.append((r_lip - 0.15 + t2, z - w2, 0.0, "foliage"))
        prof.append((r_lip + t2 + 0.1, z - w2 - 0.35, 0.04, "rock"))
        terraces.append((r_lip - 0.15 + t2, z - w2))
        z = z - w2 - 0.35
        r_lip = r_lip + t2 + 0.1
    rest = depth - (z0 - z)
    base = r_lip
    # eroded body: bulges under the lip, then a long leaning spire into the clouds
    for f, rf, amp in ((0.02, 1.03, 0.4), (0.05, 0.99, 0.8), (0.09, 0.91, 1.1), (0.14, 0.81, 1.3),
                       (0.20, 0.71, 1.4), (0.27, 0.62, 1.45), (0.35, 0.54, 1.4), (0.44, 0.46, 1.3),
                       (0.54, 0.38, 1.15), (0.65, 0.30, 1.0), (0.76, 0.22, 0.85), (0.87, 0.14, 0.6),
                       (0.95, 0.08, 0.35)):
        prof.append((base * rf * rng.uniform(0.93, 1.07), z - f * rest, amp * 0.12 * base, "rock"))
    lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * (0.22 * base)
    z_body = z
    tip_z = z - rest
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
            f_ = max(0.0, (z_body - zz) / rest)
            ox, oy = lean.x * f_ ** 1.6, lean.y * f_ ** 1.6
            ring.append((cx + ox + rr * math.cos(th), cy + oy + rr * math.sin(th), z_))
        rings.append(ring)
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
    geo = B.g(grp, "rock")
    last = [geo.vert(p) for p in rings[-1]]
    tip = geo.vert((cx + lean.x + rng.uniform(-1, 1), cy + lean.y + rng.uniform(-1, 1), tip_z - 3.0))
    reps = max(1, round(TAU * prof[-1][0] / TILE["rock"]))
    for i in range(n):
        k = (i + 1) % n
        u0, u1 = reps * TILE["rock"] * i / n, reps * TILE["rock"] * (i + 1) / n
        geo.face([last[i], tip, last[k]], [(u0, -vcum[-1]), ((u0 + u1) / 2, -vcum[-1] - 4), (u1, -vcum[-1])])
    if kind == "pier":
        add_disc(B.g(grp, "stone"), cx, cy, z0, Rt, n, (0.8, 0.8, 0.78))
    else:
        nsp = {"plaza": 4, "camp": 2, "balcony": 1}[kind]
        for k in range(nsp):
            a = rng.uniform(0, TAU)
            zt = z - rest * rng.uniform(0.08, 0.2)
            rad = base * rng.uniform(0.18, 0.28)
            off = base * 0.62
            hanging_spire(B, grp, (cx + off * math.cos(a), cy + off * math.sin(a), zt), rad,
                          rest * rng.uniform(0.3, 0.5), rng)
    return terraces, tip_z - 3.0, grp


def hanging_spire(B, grp, top, rad, length, rng):
    """A secondary stalactite of rock hanging beside the main pillar body."""
    geo = B.g(grp, "rock")
    n = 12
    noise = RockNoise(int(rng.random() * 1e6))
    secs = []
    for t, rf in ((0.0, 0.8), (0.12, 1.0), (0.35, 0.8), (0.6, 0.5), (0.85, 0.22)):
        zz = top[2] - length * t
        secs.append([Vector((top[0] + rad * rf * (1 + 0.5 * noise(TAU * k / n, zz)) * math.cos(TAU * k / n),
                             top[1] + rad * rf * (1 + 0.5 * noise(TAU * k / n, zz)) * math.sin(TAU * k / n), zz))
                     for k in range(n)])
    ftf.loft(geo, secs, closed_section=True, flip=False)  # descending sections: normals face out
    tipv = Vector((top[0], top[1], top[2] - length))
    for k in range(n):
        a_, b_ = secs[-1][k], secs[-1][(k + 1) % n]
        oriented_poly(geo, [a_, b_, tipv], [(0, 0), (0.5, 0), (0.25, 1)],
                      ((a_ + b_) / 2 - Vector((top[0], top[1], a_.z))).normalized() + Vector((0, 0, -0.5)))


# -------- parapets

def parapet_runs(node, r_in):
    """Arcs of the parapet ring between bridge openings. An opening ends where the wall's
    inner face is 1.0 m from the bridge axis, so it meets the rail inner face exactly."""
    if not node["entries"]:
        return [(0.0, TAU, True)]
    g = math.asin(min(0.99, RAIL_IN / (r_in - 0.06)))
    gaps = sorted(e % TAU for e in node["entries"])
    runs = []
    for i, a in enumerate(gaps):
        b = gaps[(i + 1) % len(gaps)]
        start = a + g
        end = b - g if i + 1 < len(gaps) else b - g + TAU
        if end - start > 0.05:
            runs.append((start, end, False))
    return runs


def lantern(B, grp, p, rng=None, scale=1.0):
    """Iron-framed lantern with a warm emissive glass (stands on a post top at p)."""
    geo, glass = B.g(grp, "stone"), B.g(grp, "lantern")
    iron = (0.22, 0.20, 0.18)
    x, y, z = p
    s = scale
    add_box(geo, (x, y, z + 0.03 * s), (0.30 * s, 0.30 * s, 0.06 * s), 0.0, iron)
    bm_secs = []
    for zz, r in ((z + 0.06 * s, 0.13 * s), (z + 0.42 * s, 0.13 * s)):
        bm_secs.append([Vector((x + r * math.cos(TAU * k / 6), y + r * math.sin(TAU * k / 6), zz)) for k in range(6)])
    ftf.loft(glass, bm_secs, closed_section=True, cols=[[(1, 1, 1)] * 6, [(1, 1, 1)] * 6], flip=True)
    for k in range(6):  # corner bars
        a = TAU * k / 6
        add_box(geo, (x + 0.14 * s * math.cos(a), y + 0.14 * s * math.sin(a), z + 0.24 * s),
                (0.035 * s, 0.035 * s, 0.38 * s), a, iron, skip_bottom=True)
    top = [Vector((x + 0.2 * s * math.cos(TAU * k / 6), y + 0.2 * s * math.sin(TAU * k / 6), z + 0.44 * s)) for k in range(6)]
    tipv = Vector((x, y, z + 0.66 * s))
    for k in range(6):
        a_, b_ = top[k], top[(k + 1) % 6]
        oriented_poly(geo, [a_, b_, tipv], [(0, 0), (0.2, 0), (0.1, 0.2)],
                      ((a_ + b_) / 2 - Vector((x, y, z))).normalized() + Vector((0, 0, 1)), iron)
    B.lanterns.append((x, y, z + 0.24 * s))


def ring_wall(B, grp, cx, cy, z0, r_in, r_out, h, runs, post=True, cap_col=(1, 1, 1),
              col_bm=None, lanterns=False):
    geo = B.g(grp, "stone")
    prof = [(r_in, z0), (r_in, z0 + h - 0.14), (r_in - 0.07, z0 + h - 0.12), (r_in - 0.07, z0 + h),
            (r_out + 0.07, z0 + h), (r_out + 0.07, z0 + h - 0.12), (r_out, z0 + h - 0.14), (r_out, z0)]
    vper = [0.0]
    for (a, b), (c, d) in zip(prof, prof[1:]):
        vper.append(vper[-1] + math.hypot(c - a, d - b))
    r_mid = (r_in + r_out) / 2
    for a0, a1, closed in runs:
        m = max(2, int(math.ceil((a1 - a0) * r_out / 1.5)))
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
                    pa = a - sign * 0.27 / r_mid
                    pc = (cx + r_mid * math.cos(pa), cy + r_mid * math.sin(pa))
                    add_box(geo, (pc[0], pc[1], z0 + (h + 0.3) / 2), (0.5, 0.5, h + 0.3), pa, cap_col)
                    add_box(geo, (pc[0], pc[1], z0 + h + 0.36), (0.62, 0.62, 0.12), pa, cap_col)
                    if lanterns:
                        lantern(B, grp, (pc[0], pc[1], z0 + h + 0.42))
                    else:
                        add_box(geo, (pc[0], pc[1], z0 + h + 0.52), (0.30, 0.30, 0.22), pa + 0.785, cap_col)
        cb = col_bm if col_bm is not None else B.col_wall
        mc = max(1, int(math.ceil((a1 - a0) * r_mid / 2.0)))
        for i in range(mc):
            aa = a0 + (a1 - a0) * i / mc
            ab = a0 + (a1 - a0) * (i + 1) / mc
            pa_ = Vector((cx + r_mid * math.cos(aa), cy + r_mid * math.sin(aa), z0 + 0.45))
            pb_ = Vector((cx + r_mid * math.cos(ab), cy + r_mid * math.sin(ab), z0 + 0.45))
            ftf.beam(cb, pa_, pb_, r_out - r_in + 0.1, 1.1)


# -------- bridges

def bridge(B, nodes, br, seed):
    """Straight deck from layout.js `from` to `to` (top at 0), arched underside (two arches
    and a rock pier on long spans), stone balustrades of rail height 1.0 on both sides."""
    rng = random.Random(seed)
    p0 = Vector((br["p0"][0], br["p0"][1], 0.0))
    p1 = Vector((br["p1"][0], br["p1"][1], 0.0))
    d = (p1 - p0)
    span = d.length
    d.normalize()
    lat = Vector((-d.y, d.x, 0))
    ang = math.atan2(d.y, d.x)
    grp = group_of((p0.x + p1.x) / 2, (p0.y + p1.y) / 2)
    geo = B.g(grp, "stone")
    n_arch = 2 if span > 24 else 1
    seg = span / n_arch
    D = min(5.5, max(3.0, 0.24 * seg))
    tc = 0.8
    sts = []
    for k in range(n_arch):
        m = max(10, int(seg / 1.6))
        for i in range(0 if k == 0 else 1, m + 1):
            s = 0.5 - 0.5 * math.cos(math.pi * i / m)
            e = 2 * s - 1
            wb = -(tc + (D - tc) * (1 - math.sqrt(max(0.0, 1 - e * e))))
            sts.append(((k + s) / n_arch, wb))
    sec_uw = lambda wb: [(-1.24, DECK_Z), (1.24, DECK_Z), (1.24, -0.10), (1.32, -0.14), (1.32, -0.30),
                         (1.22, -0.34), (1.22, wb), (-1.22, wb), (-1.22, -0.34), (-1.32, -0.30),
                         (-1.32, -0.14), (-1.24, -0.10)]
    sections = []
    for t, wb in sts:
        c = p0 + d * (span * t)
        sections.append([c + lat * u + Vector((0, 0, w)) for u, w in sec_uw(wb)])
    sec0, sec1 = sections[0], sections[1]
    c0 = sum((Vector(p) for p in sec0), Vector()) / len(sec0)
    q = [Vector(sec0[6]), Vector(sec1[6]), Vector(sec1[7]), Vector(sec0[7])]
    nrm = (q[1] - q[0]).cross(q[3] - q[0])
    flip = nrm.dot((q[0] + q[3]) / 2 - c0) < 0
    ftf.loft(geo, sections, closed_section=True, flip=flip)
    # balustrades: plinth, balusters, handrail, posts every ~4.5 m
    for side in (-1, 1):
        off = lat * side * (RAIL_IN + 0.115)
        mid = p0 + d * (span / 2) + off
        add_box(geo, (mid.x, mid.y, DECK_Z + 0.10), (span, 0.25, 0.2), ang)
        add_box(geo, (mid.x, mid.y, RAIL_H - 0.065), (span, 0.29, 0.13), ang, skip_bottom=False)
        npost = max(2, int(round(span / 4.5)))
        posts = [span * i / npost for i in range(npost + 1)]
        for t in posts:
            c = p0 + d * t + off
            add_box(geo, (c.x, c.y, (RAIL_H + 0.12) / 2), (0.34, 0.34, RAIL_H + 0.12), ang)
            add_box(geo, (c.x, c.y, RAIL_H + 0.17), (0.42, 0.42, 0.1), ang)
        for a_, b_ in zip(posts, posts[1:]):
            nb = max(2, int((b_ - a_ - 0.34) / 0.42))
            for i in range(nb):
                t = a_ + 0.17 + (b_ - a_ - 0.34) * (i + 0.5) / nb
                if rng.random() < 0.04:   # a lost baluster: old, not neglected
                    continue
                c = p0 + d * t + off
                add_box(geo, (c.x, c.y, 0.2 + (RAIL_H - 0.33) / 2), (0.10, 0.10, RAIL_H - 0.33), ang + 0.785)
        # collision: one rail box per side (inner face 1.0 m from the axis, top at 1.0)
        ftf.beam(B.col_wall, p0 + lat * side * 1.1 + Vector((0, 0, RAIL_H / 2)),
                 p1 + lat * side * 1.1 + Vector((0, 0, RAIL_H / 2)), 0.2, RAIL_H)
    # collision: deck slab, top exactly at 0
    ftf.beam(B.col_walk, p0 - Vector((0, 0, 0.25)), p1 - Vector((0, 0, 0.25)), BRIDGE_W, 0.5)
    piers = []
    if n_arch == 2:
        c = p0 + d * (span / 2)
        piers.append(dict(name=br["id"] + "_pier", x=c.x, y=c.y, z=-D + 0.05, r=1.15, kind="pier", entries=[]))
    # moss and hanging roots under the arch crowns
    for k in range(n_arch):
        c = p0 + d * (seg * (k + 0.5))
        for side in (-1, 1):
            if rng.random() < 0.7:
                top = c + lat * side * 1.3 + Vector((0, 0, -0.3))
                vine(B, grp, top, (lat * side).xy, rng.uniform(1.2, 2.6), rng.uniform(0.35, 0.55), rng)
    return span, piers


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
             flip=True)  # rising sections with CCW rings: flip so the normals face out
    top = pts[-1]
    for _ in range(rng.randint(3, 5)):
        o = Vector((rng.uniform(-1.1, 1.1), rng.uniform(-1.1, 1.1), rng.uniform(-0.6, 0.6)))
        tint = (rng.uniform(0.85, 1.1), rng.uniform(0.9, 1.15), rng.uniform(0.8, 1.0))
        bush(B, grp, top + o, rng.uniform(1.1, 1.7), rng, tint=tint, squash=0.8, sub=2)


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
    ftf.loft(geo, secs, closed_section=True, cols=[[col] * 5 for _ in secs], flip=True)
    tip = Vector(p) + lean * h * 0.3 + Vector((0, 0, h - 0.3 + 0.25))
    last = secs[-1]
    for k in range(5):
        a, b = last[k], last[(k + 1) % 5]
        oriented_poly(geo, [a, b, tip], [(0, 0), (1, 0), (0.5, 0.6)],
                      ((a + b) / 2 - Vector(p) - lean * h * 0.3).normalized() + Vector((0, 0, 0.6)), col)


GOLD = (1.0, 0.80, 0.52)
PALE = (0.98, 0.96, 0.90)


def glyph(B, grp, cx, cy, z, size, seed, col=GOLD):
    """A round sign of the Guests' language: a ring of four slots (one stroke form
    each: arc, spike, loop or drop) and reading dots in the core. Raised inlay."""
    rng = random.Random(seed)
    geo = B.g(grp, "gold")
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



def column_ruin(B, grp, p, rng, r=0.42, h=None, lying=False, axis=0.0):
    """Fluted (16-sided) column: a broken standing stump or a toppled drum."""
    geo = B.g(grp, "rock")
    n = 16
    col = (1.18, 1.16, 1.08)
    if lying:
        L = h or rng.uniform(1.2, 2.2)
        dv = Vector((math.cos(axis), math.sin(axis), 0))
        up = Vector((0, 0, 1))
        side = dv.cross(up)
        secs = []
        for t in (0.0, 1.0):
            c = Vector(p) + dv * (L * (t - 0.5)) + Vector((0, 0, r * 0.9))
            secs.append([c + (side * math.cos(TAU * k / n) + up * math.sin(TAU * k / n)) *
                         (r * (0.93 if k % 2 else 1.0)) for k in range(n)])
        ftf.loft(geo, secs, closed_section=True, cols=[[col] * n, [col] * n])
        for i, sgn in ((0, -1), (1, 1)):
            cen = sum(secs[i], Vector()) / n
            for k in range(n):
                oriented_poly(geo, [secs[i][k], secs[i][(k + 1) % n], cen], [(0, 0), (0.3, 0), (0.15, 0.3)],
                              dv * sgn, col)
        return
    h = h or rng.uniform(0.8, 2.2)
    secs = []
    for zt in (0.0, h * 0.5, h):
        secs.append([Vector((p[0] + r * (0.93 if k % 2 else 1.0) * math.cos(TAU * k / n),
                             p[1] + r * (0.93 if k % 2 else 1.0) * math.sin(TAU * k / n), p[2] + zt))
                     for k in range(n)])
    # broken top: tilt the last ring
    tilt = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized() * 0.35
    secs[-1] = [v + Vector((0, 0, (v - Vector((p[0], p[1], v.z))).dot(tilt))) for v in secs[-1]]
    ftf.loft(geo, secs, closed_section=True, cols=[[col] * n for _ in secs], flip=True)
    cen = sum(secs[-1], Vector()) / n + Vector((0, 0, -0.08))
    for k in range(n):
        oriented_poly(geo, [secs[-1][k], secs[-1][(k + 1) % n], cen], [(0, 0), (0.3, 0), (0.15, 0.3)],
                      (0, 0, 1), col)
    # base plinth
    add_box(B.g(grp, "stone"), (p[0], p[1], p[2] + 0.12), (r * 2.6, r * 2.6, 0.24), rng.uniform(0, 1), (0.85, 0.84, 0.8))


def floating_rock(B, p, size, rng):
    verts, faces = B.ico[2]
    grp = group_of(p[0], p[1])
    geo = B.g(grp, "rock")
    seed = rng.random() * 100
    pts = []
    for v in verts:
        k = 1.0 + 0.35 * (hash01(v.x * 2 + seed, v.y * 2, v.z * 2) - 0.5) * 2
        q = Vector((v.x * k, v.y * k, v.z * k * (0.55 if v.z > 0 else 1.25)))
        pts.append(Vector(p) + q * size)
    idx = [geo.vert(q) for q in pts]
    for f in faces:
        fp = [pts[i] for i in f]
        n = (fp[1] - fp[0]).cross(fp[2] - fp[0])
        geo.face([idx[i] for i in f], [box_uv(q, n) for q in fp])
    if size > 1.2:
        bush(B, grp, Vector(p) + Vector((0, 0, size * 0.5)), size * 0.55, rng, squash=0.5, sub=1)


# -------- plateau tops

def plaza_top(B, node, rng):
    z = 0.0
    grp = "plaza"
    stone, gold = B.g(grp, "stone"), B.g(grp, "gold")
    R = node["r"]
    r_in = R - PARAPET_T
    # Scroll medallion area: scroll_table.glb (3.4 m across) sits on the plain centre disc
    add_disc(stone, 0, 0, z, 2.0, 32, (0.96, 0.95, 0.91))
    add_annulus(gold, 0, 0, z, 2.0, 2.14, 64)
    add_annulus(stone, 0, 0, z, 2.14, 3.0, 64, (0.84, 0.85, 0.82))
    add_annulus(gold, 0, 0, z, 3.0, 3.08, 64)
    band = [(0.74, 0.75, 0.72) if i % 2 else (0.92, 0.91, 0.87) for i in range(36)]
    add_annulus(stone, 0, 0, z, 3.08, 5.0, 36, cols=band)
    add_annulus(gold, 0, 0, z, 5.0, 5.12, 72)
    add_annulus(stone, 0, 0, z, 5.12, 8.3, 72, (0.88, 0.88, 0.85))
    add_annulus(gold, 0, 0, z, 8.3, 8.4, 84)
    add_annulus(stone, 0, 0, z, 8.4, R, 84, (0.80, 0.80, 0.77))
    for k in range(6):  # six round signs between the bridge axes
        a = math.radians(60 * k)
        glyph(B, grp, 4.04 * math.cos(a), 4.04 * math.sin(a), z + 0.004, 0.95, 4001 + k * 37)
    for e in node["entries"]:  # gold rays toward every bridge
        add_strip(gold, (5.12 * math.cos(e), 5.12 * math.sin(e)), (8.3 * math.cos(e), 8.3 * math.sin(e)),
                  0.06, z + 0.006)
    # anchor zones: gold-inlaid circles r 1.5 on the diagonals (ring radius 6.6)
    for shell, a in ANCHOR_ZONES:
        zx, zy = ring_xy(ANCHOR_RING_R, a)
        add_disc(stone, zx, zy, z + 0.012, ANCHOR_ZONE_R - 0.12, 40, (0.97, 0.95, 0.90))
        add_annulus(gold, zx, zy, z + 0.014, ANCHOR_ZONE_R - 0.12, ANCHOR_ZONE_R, 48)
        add_annulus(gold, zx, zy, z + 0.014, 0.98, 1.04, 40)
        for k in range(4):  # four short ticks toward the Shell's quarter
            ta = client_to_blender_angle(a) + math.radians(90 * k)
            add_strip(gold, (zx + 1.08 * math.cos(ta), zy + 1.08 * math.sin(ta)),
                      (zx + 1.32 * math.cos(ta), zy + 1.32 * math.sin(ta)), 0.035, z + 0.016)
    ring_wall(B, grp, 0, 0, z, r_in, R, PARAPET_H, parapet_runs(node, r_in), lanterns=True)
    ftf.prism_ngon(B.col_walk, 48, R, R, z - 3.0, z)


def camp_top(B, node, rng):
    cx, cy, z, R = node["x"], node["y"], 0.0, node["r"]
    grp = group_of(cx, cy)
    stone, fol = B.g(grp, "stone"), B.g(grp, "foliage")
    r_in = R - PARAPET_T
    add_disc(stone, cx, cy, z, 5.0, 48, (0.90, 0.89, 0.85))
    add_annulus(fol, cx, cy, z, 5.0, R, 56, (1.0, 1.0, 0.95))
    for e in node["entries"]:
        add_strip(stone, (cx + 4.7 * math.cos(e), cy + 4.7 * math.sin(e)),
                  (cx + (R - 0.05) * math.cos(e), cy + (R - 0.05) * math.sin(e)), 1.0, z + 0.012,
                  (0.84, 0.83, 0.79))
    for _ in range(22):  # flowers and tufts at the parapet foot (no collision, below knee)
        th = rng.uniform(0, TAU)
        if not free_angle(node, th, 1.9, r_at=5.8):
            continue
        p = (cx + 5.75 * math.cos(th), cy + 5.75 * math.sin(th), z)
        if rng.random() < 0.5:
            bush(B, grp, p, rng.uniform(0.22, 0.32), rng, tint=(0.9, 1.05, 0.85), squash=0.7, sub=1)
        else:
            flowers(B, grp, p, rng, rng.randint(3, 5), 0.35)
    ring_wall(B, grp, cx, cy, z, r_in, R, PARAPET_H, parapet_runs(node, r_in), lanterns=True)
    ftf.prism_ngon(B.col_walk, 32, R, R, z - 3.0, z, center=(cx, cy))


def balcony_top(B, node, rng):
    cx, cy, z, R = node["x"], node["y"], 0.0, node["r"]
    grp = "balcony"
    stone, gold = B.g(grp, "stone"), B.g(grp, "gold")
    r_in = R - PARAPET_T
    add_disc(stone, cx, cy, z, 1.9, 24, (0.95, 0.94, 0.90))
    add_annulus(gold, cx, cy, z, 1.9, 2.0, 40)
    add_annulus(stone, cx, cy, z, 2.0, R, 40, (0.86, 0.86, 0.83))
    glyph(B, grp, cx, cy, z + 0.004, 1.5, 120)
    for _ in range(14):
        th = rng.uniform(0, TAU)
        if not free_angle(node, th, 2.2, r_at=4.2):
            continue
        p = (cx + 4.25 * math.cos(th), cy + 4.25 * math.sin(th), z)
        flowers(B, grp, p, rng, 5, 0.35, palette=[(0.55, 0.35, 1.0), (0.75, 0.55, 1.0), (1.0, 1.0, 0.95)])
        bush(B, grp, (p[0] * 1.0, p[1], z), 0.3, rng, sub=1)
    ring_wall(B, grp, cx, cy, z, r_in, R, PARAPET_H + 0.05, parapet_runs(node, r_in), lanterns=True)
    ftf.prism_ngon(B.col_walk, 32, R, R, z - 3.0, z, center=(cx, cy))


def terrace_dressing(B, node, terraces, rng):
    """Greenery, vines, trees, menhirs and ruins on the pillar terraces (below the walkable
    top, outside the parapets: decoration only, no collision needed)."""
    cx, cy = node["x"], node["y"]
    grp = group_of(cx, cy)
    kind = node["kind"]
    for ti, (r_t, z_t) in enumerate(terraces):
        nb = int(r_t * (1.0 if kind != "plaza" else 1.3))
        for _ in range(nb):
            th = rng.uniform(0, TAU)
            if not free_angle(node, th, 1.7, r_at=r_t):
                continue
            rr = r_t - rng.uniform(0.4, 1.0)
            p = (cx + rr * math.cos(th), cy + rr * math.sin(th), z_t)
            if rng.random() < 0.8:
                bush(B, grp, p, rng.uniform(0.45, 0.95), rng,
                     tint=(rng.uniform(0.8, 1.05), rng.uniform(0.9, 1.15), rng.uniform(0.75, 0.95)))
            else:
                flowers(B, grp, p, rng, 5, 0.5)
        nv = int(r_t * 0.6)
        for _ in range(nv):
            th = rng.uniform(0, TAU)
            if not free_angle(node, th, 1.7, r_at=r_t):
                continue
            top = (cx + (r_t + 0.2) * math.cos(th), cy + (r_t + 0.2) * math.sin(th), z_t + 0.1)
            vine(B, grp, top, (math.cos(th), math.sin(th)), rng.uniform(2.5, 7.0), rng.uniform(0.6, 1.0), rng)
    if kind == "pier":
        return
    r_t, z_t = terraces[0]
    # trees only on the far side (+Y in Blender = away from the default camera) so the
    # isometric view keeps the camps readable
    ntree = {"plaza": 5, "camp": 2, "balcony": 1}[kind]
    placed, tries = 0, 0
    while placed < ntree and tries < 60:
        tries += 1
        th = rng.uniform(0, TAU)
        if math.sin(th) < 0.25 or not free_angle(node, th, 2.8, r_at=r_t):
            continue
        rr = r_t - 0.9
        tree(B, grp, (cx + rr * math.cos(th), cy + rr * math.sin(th), z_t), rng, h=rng.uniform(3.4, 5.2))
        placed += 1
    if kind == "camp":
        for _ in range(2):
            for _t in range(20):
                th = rng.uniform(0, TAU)
                if free_angle(node, th, 2.4, r_at=r_t):
                    rr = r_t - 0.8
                    menhir(B, grp, (cx + rr * math.cos(th), cy + rr * math.sin(th), z_t),
                           rng.uniform(2.0, 3.0), rng.uniform(0.35, 0.5), rng)
                    break
    if kind == "plaza":
        # ruined colonnade on the upper terrace: broken stumps and toppled drums
        for k in range(16):
            th = TAU * k / 16 + 0.1
            if not free_angle(node, th, 2.2, r_at=r_t):
                continue
            rr = r_t - 1.1
            p = (rr * math.cos(th), rr * math.sin(th), z_t)
            if k % 3 == 2:
                column_ruin(B, grp, (p[0], p[1], z_t), rng, lying=True, axis=th + math.pi / 2 + rng.uniform(-0.4, 0.4))
            else:
                column_ruin(B, grp, p, rng, h=rng.uniform(0.7, 2.1))
        r2, z2 = terraces[1]
        for k in range(6):
            th = TAU * k / 6 + 0.45
            if free_angle(node, th, 2.6, r_at=r2):
                menhir(B, grp, ((r2 - 0.9) * math.cos(th), (r2 - 0.9) * math.sin(th), z2),
                       rng.uniform(2.6, 3.8), rng.uniform(0.45, 0.6), rng)


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
        fade = max(0.0, min(1.0, (-14.0 - z) / 22.0))
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



# ------------------------------------------------------------------ stats

def layout_report(nodes, bridges, spans):
    """Centres and bridge endpoints in client coordinates (x, z) for the build stats."""
    def cl(x, y):
        return [round(x, 3), round(-y, 3)]
    out = {"platforms": {k: {"center_client_xz": cl(v["x"], v["y"]), "radius_m": v["r"]}
                         for k, v in sorted(nodes.items())},
           "bridges": {br["id"]: {"from_client_xz": cl(*br["p0"]), "to_client_xz": cl(*br["p1"]),
                                  "length_m": round(spans[br["id"]], 2), "width_m": BRIDGE_W}
                       for br in bridges},
           "anchor_zones": {f"socket_anchor_zone_{s}": {"center_client_xz": cl(*ring_xy(ANCHOR_RING_R, a)),
                                                        "angle_deg": a, "radius_m": ANCHOR_ZONE_R}
                            for s, a in ANCHOR_ZONES}}
    # walk distances along the centre lines (WALK_SPEED 1.7 m/s)
    walks = {"plaza_center-camp_center_m": RING_R,
             "camp-neighbour_via_plaza_m": 2 * RING_R,
             "camp-neighbour_via_link_m": RING_R,
             "balcony_center-plaza_center_m": BALCONY_RADIUS}
    out["walks_s_at_1_7"] = {k.replace("_m", "_s"): round(v / WALK_SPEED, 1) for k, v in walks.items()}
    return out


# ------------------------------------------------------------------ build

def stage_build():
    clock = ftf.StageClock("island")
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    clock.start("layout_geometry")
    ftf.reset_scene()
    nodes, bridges = make_layout()
    B = Builder()
    B.lanterns = []
    spans, piers = {}, []
    for i, br in enumerate(bridges):
        span, pr = bridge(B, nodes, br, 500 + i)
        spans[br["id"]] = span
        piers += pr
    terr = {}
    for i, (name, n) in enumerate(sorted(nodes.items())):
        terr[name], _tip, _g = pillar(B, n, 100 + i)
    for j, pn in enumerate(piers):
        t, _tip, _g = pillar(B, pn, 300 + j)
        terrace_dressing(B, pn, t, random.Random(77 + j))
    for name, n in sorted(nodes.items()):
        rng = random.Random(sid(name) % 100000)
        {"plaza": plaza_top, "camp": camp_top, "balcony": balcony_top}[n["kind"]](B, n, rng)
        terrace_dressing(B, n, terr[name], random.Random(sid(name) % 100000 + 7))
    # floating rocks drifting below the archipelago
    rr = random.Random(2026)
    placed = 0
    for _ in range(400):
        if placed >= 16:
            break
        a = rr.uniform(0, TAU)
        r = rr.uniform(12, 52)
        p = (r * math.cos(a), r * math.sin(a), rr.uniform(-20.0, -4.0))
        size = rr.uniform(0.6, 2.2)
        ok = all(math.hypot(p[0] - n["x"], p[1] - n["y"]) > n["r"] + 5.0 + size for n in nodes.values())
        for br in bridges:
            a0, b0 = Vector((*br["p0"], 0)), Vector((*br["p1"], 0))
            t = max(0.0, min(1.0, (Vector((p[0], p[1], 0)) - a0).dot(b0 - a0) / (b0 - a0).length_squared))
            if (a0.lerp(b0, t) - Vector((p[0], p[1], 0))).length < 4.0 + size and p[2] > -9:
                ok = False
        if ok:
            floating_rock(B, p, size, rr)
            placed += 1
    stats["bridge_spans_m"] = {k: round(v, 2) for k, v in spans.items()}

    clock.start("materials_objects")
    imgs = {}
    for mat in ("rock", "stone", "foliage"):
        for ch in ("basecolor", "orm", "normal"):
            im = bpy.data.images.load(os.path.join(TEX_DIR, f"island_{mat}_{ch}.jpg"))
            if ch != "basecolor":
                im.colorspace_settings.name = "Non-Color"
            imgs[(mat, ch)] = im
    mats = {m: ftf.pbr_material(f"M_Island_{m.capitalize()}", imgs[(m, "basecolor")], imgs[(m, "orm")],
                                imgs[(m, "normal")], vertex_color=True, double_sided=(m == "foliage"))
            for m in ("rock", "stone", "foliage")}
    mats["gold"] = ftf.simple_material("M_Island_Gold", (0.80, 0.58, 0.26), 0.32, metal=1.0)
    mats["lantern"] = ftf.simple_material("M_Island_Lantern", (1.0, 0.72, 0.38), 0.4,
                                          emit=(1.0, 0.62, 0.26), emit_strength=6.0)
    out = ftf.new_collection("Export")
    work = ftf.new_collection("Work")
    groups = {}
    shade = {"rock": 24, "foliage": 85, "stone": 32, "gold": 40, "lantern": 20}
    for (grp, mat), geo in sorted(B.geos.items()):
        if not geo.f:
            continue
        cf = color_fn_for(mat) if mat in ("rock", "stone", "foliage") else None
        o = geo.to_object(f"tmp_{grp}_{mat}", mats[mat], work, uv_tile=TILE[mat], color_fn=cf)
        ftf.triangulate_ngons(o)
        ftf.finish_shading(o, angle=shade[mat])
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
    sockets = [ftf.add_empty("socket_scroll", (0, 0, 0), out, 0.0,
                             {"socket": "scroll_table", "clear_radius_m": 2.0})]
    for stem, label, a in CAMPS:
        n = nodes[f"camp_{stem}"]
        sockets.append(ftf.add_empty(f"socket_camp_{stem}", (n["x"], n["y"], 0.0), out, face_plaza(a),
                                     {"socket": "camp", "clan": stem, "label": label, "angle_deg": a,
                                      "plateau_radius_m": PLATEAU_R,
                                      "front": "local +Z (glTF) faces the plaza"}))
    for shell, a in ANCHOR_ZONES:
        sockets.append(ftf.add_empty(f"socket_anchor_zone_{shell}", (*ring_xy(ANCHOR_RING_R, a), 0.0), out,
                                     face_plaza(a), {"socket": "anchor_zone", "shell": shell, "index": shell - 1,
                                                     "angle_deg": a, "zone_radius_m": ANCHOR_ZONE_R}))
    bx, by = ring_xy(BALCONY_RADIUS, BALCONY_ANGLE)
    sockets.append(ftf.add_empty("socket_spawn", (bx * 0.97, by * 0.97, 0.0), out, face_plaza(BALCONY_ANGLE),
                                 {"socket": "spawn", "facing": "local +Z (glTF) looks toward the plaza"}))
    for i, p in enumerate(B.lanterns):
        sockets.append(ftf.add_empty(f"socket_lantern_{i:02d}", p, out, 0.0, {"socket": "lantern"}, 0.15))
    stats["materials"] = sorted(m.name for m in mats.values())
    stats["objects"] = {o.name: ftf.mesh_tris(o) for o in sectors}
    stats["runtime_triangles_blender"] = sum(stats["objects"].values())
    stats["collision_triangles_blender"] = {o.name: ftf.mesh_tris(o) for o in cols}
    stats["lanterns"] = len(B.lanterns)
    lo, hi = ftf.world_bounds(sectors)
    stats["bounds_blender_zup"] = {"min": [round(v, 2) for v in lo], "max": [round(v, 2) for v in hi]}
    stats["layout"] = layout_report(nodes, bridges, spans)
    size = ftf.export_glb(RAW_GLB, sectors + cols + sockets)
    stats["glb_raw_bytes"] = size
    stats["glb"] = ftf.inspect_glb(RAW_GLB)
    stats["runtime_triangles"] = stats["glb"]["triangles_render"]
    stats["budget_ok"] = {"triangles": stats["runtime_triangles"] <= TRI_BUDGET}
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
    log("runtime tris", stats["runtime_triangles"], "raw glb", size)


# ------------------------------------------------------------------ render

def cloud_sea(col):
    """Render-only cloud sea: stacked noise-alpha layers and an opaque floor.
    Not exported; the game draws its own fog/cloud layer."""
    S = 1400.0
    layers = [(CLOUD_LEVEL + 7.0, 0.014, 0.62, 0.80), (CLOUD_LEVEL + 4.5, 0.011, 0.56, 0.76),
              (CLOUD_LEVEL + 2.0, 0.016, 0.50, 0.70), (CLOUD_LEVEL, 0.010, 0.44, 0.64),
              (CLOUD_LEVEL - 2.5, 0.013, 0.38, 0.58), (CLOUD_LEVEL - 5.0, 0.009, 0.32, 0.52),
              (CLOUD_LEVEL - 8.0, 0.012, 0.26, 0.46), (CLOUD_LEVEL - 11.0, 0.010, 0.20, 0.40)]
    for i, (z, scale, lo, hi) in enumerate(layers):
        m = bpy.data.materials.new(f"Cloud{i}")
        m.use_nodes = True
        k = ftf.NodeKit(m)
        b = k.n["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.62, 0.62, 0.62, 1)
        b.inputs["Roughness"].default_value = 1.0
        co = k.coord("Object")
        n = k.noise(k.vmath("SCALE", co, scale=scale), 1.0, 6.0, 0.6, w=float(i * 3.7), distortion=0.3)
        k.link(k.maprange(n, lo, hi, 0.0, 0.6), b.inputs["Alpha"])
        b.inputs["Emission Color"].default_value = (0.50, 0.50, 0.52, 1)
        b.inputs["Emission Strength"].default_value = 0.12
        me = bpy.data.meshes.new(f"cloud{i}")
        me.from_pydata([(-S, -S, z), (S, -S, z), (S, S, z), (-S, S, z)], [], [(0, 1, 2, 3)])
        me.materials.append(m)
        ftf.link(bpy.data.objects.new(f"cloud{i}", me), col)
    m = ftf.simple_material("CloudFloor", (0.50, 0.52, 0.55), 1.0, emit=(0.46, 0.48, 0.52), emit_strength=0.3)
    me = bpy.data.meshes.new("cloud_floor")
    S = 3000.0
    zf = CLOUD_LEVEL - 16.0
    me.from_pydata([(-S, -S, zf), (S, -S, zf), (S, S, zf), (-S, S, zf)], [], [(0, 1, 2, 3)])
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



def stage_render(samples=128, res=(1600, 900)):
    clock = ftf.StageClock("island")
    clock.start("qa_renders")
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, res[0], res[1], samples)
    sc.render.image_settings.quality = 84
    dev = ftf.use_gpu(sc, "island")
    env = ftf.new_collection("Env")
    # golden hour (style addendum): warm low sun from the game's sun azimuth, cool shadows
    sc.world = ftf.sky_world(zenith=(0.11, 0.16, 0.22), horizon=(0.60, 0.50, 0.38),
                             ground=(0.40, 0.40, 0.40), strength=0.9)
    ftf.add_sun(env, energy=4.2, color=(1.0, 0.80, 0.58), elev=24, azim=-132, angle=2)
    cloud_sea(env)
    island = import_glb(RAW_GLB)
    cols = [o for o in island if o.name.endswith("_col")]
    for c in cols:
        c.hide_render = True
    socks = {o.name: o for o in island if o.name.startswith("socket_")}
    placed = {}
    props = ftf.new_collection("Placed")

    def plain(name):
        p = os.path.join(PLAIN_DIR, name + ".glb")
        return p if os.path.exists(p) else None

    for stem, *_ in CAMPS:
        p, s = plain(f"camp_{stem}"), socks.get(f"socket_camp_{stem}")
        if p and s:
            place_asset(p, s.matrix_world.translation.copy(), s.matrix_world.to_euler().z, props)
            placed[f"camp_{stem}"] = True
    shells = {1: (52, 14), 2: (50, 22), 3: (54, 17), 4: (50, 25)}   # layout.js SHELL_PLACES
    for shell, a in ANCHOR_ZONES:
        s = socks[f"socket_anchor_zone_{shell}"]
        ap = plain("anchor")
        if ap:
            place_asset(ap, s.matrix_world.translation.copy(), s.matrix_world.to_euler().z, props)
            placed["anchor"] = True
        sp = plain(f"shell_{shell}")
        r, h = shells[shell]
        x, y = ring_xy(r, a)
        if sp:
            place_asset(sp, (x, y, h), face_plaza(a), props)
            placed[f"shell_{shell}"] = True
    st = plain("scroll_table")
    if st:
        place_asset(st, (0, 0, 0), 0.0, props)
        placed["scroll_table"] = True
    spawn = socks["socket_spawn"].matrix_world.translation.copy()
    human_proxy(props, spawn, face_plaza(BALCONY_ANGLE))
    nb = ring_xy(17.0, 90)  # a second figure on the Moss bridge
    human_proxy(props, (nb[0] + 0.4, nb[1], 0.0), 0.3)

    out = os.path.join(QA_DIR, "final")
    timings = {}

    def shot(name, loc, tgt, lens=None, fov=None, ortho=None):
        cam = ftf.add_camera(f"cam_{name}", loc, tgt, lens=lens or 35, fov_v_deg=fov, ortho=ortho, col=env)
        timings[name] = ftf.render_to(sc, cam, os.path.join(out, f"island_{name}.jpg"))
        log("render", name, timings[name])

    def iso(name, focus, dist, yaw_deg=0.0):
        """Game camera (camera-rig.js): pitch, fov and focus height follow the zoom."""
        t = min(1, max(0, (dist - 4.5) / (90 - 4.5)))
        pitch = math.radians(14 + 48 * t ** 0.6)
        fov = 50 - 18 * t ** 0.5
        f = Vector(focus) + Vector((0, 0, 1.55 - 0.45 * t))
        yw = math.radians(yaw_deg)
        loc = f + Vector((math.sin(yw) * math.cos(pitch) * dist, -math.cos(yw) * math.cos(pitch) * dist,
                          math.sin(pitch) * dist))
        shot(name, loc, f, fov=fov)

    which = os.environ.get("ISLAND_SHOTS", "")
    want = lambda n: not which or n in which.split(",")
    if want("game_iso_overview"):
        iso("game_iso_overview", (0, -6, 0), 90)
    if want("overview_wide"):
        shot("overview_wide", Vector((-62, -118, 52)), Vector((0, -2, -9)), lens=28)
    if want("iso_mid_plaza"):
        iso("iso_mid_plaza", (0, 0, 0), 30)
    if want("iso_camp_moss_bridge"):
        iso("iso_camp_moss_bridge", ring_xy(19, 90) + (0,), 16, yaw_deg=-30)
    if want("pillars_side"):
        shot("pillars_side", Vector((58, -70, -12)), Vector((0, 0, -16)), lens=24)
    if want("balcony_start"):
        bx, by = spawn.x, spawn.y
        dvec = Vector((-bx, -by, 0)).normalized()
        shot("balcony_start", spawn - dvec * 4.6 + Vector((0, 0, 2.6)), spawn + dvec * 20 + Vector((0, 0, -1.0)), fov=48)
    if want("top_layout"):
        shot("top_layout", Vector((0, -4, 300)), Vector((0, -4, 0)), ortho=104)
    if "backface_check" in which.split(","):   # debug only: back faces in red
        bf = bpy.data.materials.new("BackfaceCheck")
        bf.use_nodes = True
        k = ftf.NodeKit(bf)
        geo_n = k.new("ShaderNodeNewGeometry")
        mixc = k.mix(geo_n.outputs["Backfacing"], (0.6, 0.6, 0.6), (1.0, 0.0, 0.0))
        k.link(mixc, k.n["Principled BSDF"].inputs["Base Color"])
        for o in island:
            if o.type == "MESH" and not o.name.endswith("_col"):
                for i in range(len(o.data.materials)):
                    o.data.materials[i] = bf
        iso("backface_check", (0, -6, 0), 60, yaw_deg=25)
    if want("collision_overlay"):
        cm = ftf.collision_overlay_material()
        for c in cols:
            c.hide_render = False
            c.data.materials.clear()
            c.data.materials.append(cm)
        iso("collision_overlay", (0, -10, 0), 70, yaw_deg=20)
        for c in cols:
            c.hide_render = True
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": dev, "resolution": list(res), "samples": samples, "placed_assets": placed,
                   "render_only": ["cloud sea layers", "1.75 m figures (balcony spawn, Moss bridge)",
                                   "placed camps / anchors / Shells / scroll table (decompressed copies)"],
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"textures": stage_textures,
     "build": stage_build,
     "render": stage_render,
     "all": lambda: (stage_textures(), stage_build(), stage_render())}[stage]()
