"""Procedural source for the interactive props and clan relics (prop_<name>.glb).

Run headless with Blender 4.5 LTS:

    blender -b -P art/props/build_props.py -- build [name ...]    # model, GPU bake, raw glb
    blender -b -P art/props/build_props.py -- render [name ...]   # QA tiles + close-ups from the raw glb
    blender -b -P art/props/build_props.py -- list

Raw glbs land in art/props/build/ (not committed); art/props/ship.sh adds the
scroll fragment's material variants, compresses (KTX2 + meshopt) into
game/public/assets/models/ and builds the contact sheets.

Every prop uses the kind-atlas pipeline in art/common/kindbake.py (one baked
atlas + up to two unbaked special materials, <= 3 materials), a convex `_col`,
and `socket_*` empties for code-drawn VFX (socket_glow, socket_flame, ...).
Blender is Z-up with the front facing -Y (glTF: Y-up, front +Z). Pivot: on the
ground at the planted point (base centre, or the pole foot for banners).

Style: hybrid (faceted silhouettes readable from the isometric camera, detailed
baked PBR); owner addendum 07.11: weathered stone with lichen and moss in the
crevices, ornate but functional worn metalwork, frayed cloth, a restrained palette
with gold accents. Info colours (Gift, Storm, trust) stay code-drawn.
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
import ftf  # noqa: E402
import kindbake as kb  # noqa: E402
from ftf import TAU  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(HERE, "build")
TEX = os.path.join(HERE, "build", "textures")
QA = os.path.join(REPO, "docs", "art", "qa", "props")
TILES = os.path.join(BUILD, "tiles")

D = math.radians


def log(*a):
    ftf.log("props", *a)


# =================================================================== specials

GLOW_AMBER = dict(color=(0.95, 0.55, 0.20), rough=0.35, emit=(1.0, 0.52, 0.16), emit_strength=6.0)
GLOW_EMBER = dict(color=(0.30, 0.06, 0.02), rough=0.8, emit=(1.0, 0.28, 0.05), emit_strength=8.0)
GLOW_VIOLET = dict(color=(0.55, 0.40, 0.95), rough=0.3, emit=(0.62, 0.42, 1.0), emit_strength=5.0)
GLOW_GOLD = dict(color=(0.95, 0.80, 0.50), rough=0.3, emit=(1.0, 0.80, 0.48), emit_strength=4.0)
GLOW_COLD = dict(color=(0.60, 0.82, 1.0), rough=0.2, emit=(0.55, 0.82, 1.0), emit_strength=5.0)
GLOW_SPORE = dict(color=(0.45, 0.80, 0.25), rough=0.4, emit=(0.50, 0.95, 0.30), emit_strength=3.5)
GLOW_NEUTRAL = dict(color=(0.95, 0.86, 0.66), rough=0.4, emit=(1.0, 0.86, 0.62), emit_strength=3.0)
GLASS_CLEAR = dict(color=(0.92, 0.94, 0.96), rough=0.03, transmission=1.0, ior=1.5)
GLASS_LANTERN = dict(color=(0.80, 0.70, 0.52), rough=0.08, alpha=0.32, emit=(1.0, 0.62, 0.3), emit_strength=0.25,
                     double_sided=True)
GLASS_ICE = dict(color=(0.70, 0.86, 0.96), rough=0.05, transmission=1.0, ior=1.31, flat=True)
GLASS_VIOLET = dict(color=(0.62, 0.48, 0.92), rough=0.04, transmission=0.9, ior=1.52, flat=True)
QUARTZ = dict(color=(0.88, 0.89, 0.90), rough=0.08, transmission=0.7, ior=1.55, flat=True)
NACRE = dict(color=(0.86, 0.85, 0.88), rough=0.16, metal=0.25, thin_film=420.0, coat=1.0)
MEMBRANE = dict(color=(0.78, 0.86, 0.92), rough=0.2, alpha=0.42, thin_film=360.0, double_sided=True,
                emit=(0.55, 0.80, 0.95), emit_strength=0.6)

# scroll fragment variants (KHR_materials_variants, added by add_variants.mjs); emissive
# colours lifted from layout.js CLANS so they glow; Ash glows ember instead of charcoal
FRAGMENT_VARIANTS = {
    "dormant": dict(color=(0.20, 0.16, 0.10), emit=(0.0, 0.0, 0.0), emit_strength=0.0),
    "iris": dict(color=(0.54, 0.44, 0.77), emit=(0.62, 0.42, 1.0), emit_strength=4.0),
    "sol": dict(color=(0.89, 0.90, 0.89), emit=(0.95, 0.96, 1.0), emit_strength=3.0),
    "pepel": dict(color=(0.23, 0.23, 0.22), emit=(1.0, 0.30, 0.06), emit_strength=4.0),
    "moh": dict(color=(0.44, 0.56, 0.33), emit=(0.50, 0.95, 0.30), emit_strength=3.5),
    "yantar": dict(color=(0.84, 0.60, 0.23), emit=(1.0, 0.62, 0.18), emit_strength=4.0),
    "iney": dict(color=(0.62, 0.77, 0.84), emit=(0.55, 0.85, 1.0), emit_strength=4.0),
}


# =================================================================== helpers

def face_toward(K, kind, pts, nrm):
    bm = K.bm(kind)
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(nrm)) < 0:
        f.normal_flip()
    return f


class Plane2:
    """Maps 2D (x, y) in a plane to 3D: o + x*U + y*V, normal N."""

    def __init__(self, o, U, V):
        self.o, self.U, self.V = Vector(o), Vector(U), Vector(V)
        self.N = self.U.cross(self.V).normalized()

    def __call__(self, x, y, lift=0.0):
        return self.o + self.U * x + self.V * y + self.N * lift


def strip_arc(K, kind, pl, cx, cy, R, w, a0, a1, n, lift=0.0008):
    for i in range(n):
        t0 = a0 + (a1 - a0) * i / n
        t1 = a0 + (a1 - a0) * (i + 1) / n
        pts = [pl(cx + (R - w / 2) * math.cos(t0), cy + (R - w / 2) * math.sin(t0), lift),
               pl(cx + (R + w / 2) * math.cos(t0), cy + (R + w / 2) * math.sin(t0), lift),
               pl(cx + (R + w / 2) * math.cos(t1), cy + (R + w / 2) * math.sin(t1), lift),
               pl(cx + (R - w / 2) * math.cos(t1), cy + (R - w / 2) * math.sin(t1), lift)]
        face_toward(K, kind, pts, pl.N)


def disc2(K, kind, pl, cx, cy, r, n=8, lift=0.0008):
    face_toward(K, kind, [pl(cx + r * math.cos(TAU * i / n), cy + r * math.sin(TAU * i / n), lift)
                          for i in range(n)], pl.N)


def poly2(K, kind, pl, pts2, lift=0.0008):
    face_toward(K, kind, [pl(x, y, lift) for x, y in pts2], pl.N)


def seg2(K, kind, pl, p, q, w, lift=0.0008):
    p, q = Vector((p[0], p[1])), Vector((q[0], q[1]))
    d = (q - p).normalized()
    nn = Vector((-d.y, d.x)) * (w / 2)
    poly2(K, kind, pl, [p - nn, q - nn, q + nn, p + nn], lift)


def logogram(K, kind, pl, R, w, seed, slots=(0, 1, 2, 3), lift=0.0008, ring=True, dots=2):
    """A round Guest sign: an open ring with four stroke forms on its slots
    (0 = top, clockwise: arc, spike, loop, drop) and reading dots in the core."""
    rng = random.Random(seed)
    if ring:
        # open ring: a small gap at the reading start
        strip_arc(K, kind, pl, 0, 0, R, w, D(100), D(100 + 340), 40, lift)
    forms = ["arc", "spike", "loop", "drop"]
    for s in slots:
        ang = D(90) - s * D(90) + D(rng.uniform(-12, 12))
        form = forms[(s + seed) % 4]
        ca, sa = math.cos(ang), math.sin(ang)
        base = (R * ca, R * sa)
        if form == "arc":
            strip_arc(K, kind, pl, 0, 0, R * 1.22, w * 0.8, ang - D(24), ang + D(24), 8, lift)
            seg2(K, kind, pl, base, (R * 1.22 * ca, R * 1.22 * sa), w * 0.7, lift)
        elif form == "spike":
            tip = (R * 1.45 * ca, R * 1.45 * sa)
            nx, ny = -sa * w * 1.4, ca * w * 1.4
            poly2(K, kind, pl, [(base[0] + nx, base[1] + ny), tip, (base[0] - nx, base[1] - ny)], lift)
        elif form == "loop":
            c = (R * 1.28 * ca, R * 1.28 * sa)
            strip_arc(K, kind, pl, c[0], c[1], R * 0.17, w * 0.7, 0, TAU, 12, lift)
            seg2(K, kind, pl, base, (R * 1.11 * ca, R * 1.11 * sa), w * 0.7, lift)
        else:  # drop: a teardrop hanging inward
            c = (R * 0.74 * ca, R * 0.74 * sa)
            disc2(K, kind, pl, c[0], c[1], R * 0.08, 8, lift)
            seg2(K, kind, pl, base, (R * 0.8 * ca, R * 0.8 * sa), w * 0.6, lift)
    for i in range(dots):
        a = D(90) - i * D(55)
        disc2(K, kind, pl, R * 0.32 * math.cos(a), R * 0.32 * math.sin(a), w * 0.75, 6, lift)


def frayed_strip(K, kind, top, down, side, length, width, seed, nu=3, nv=8, skin=None, holes=0):
    """A hanging cloth ribbon with a ragged hem and optional moth holes."""
    rng = random.Random(seed)
    top, down, side = Vector(top), Vector(down).normalized(), Vector(side).normalized()
    nrm = side.cross(down)
    hem = [rng.uniform(-0.18, 0.05) for _ in range(nu + 1)]
    hole_set = {(rng.randrange(nu), rng.randrange(2, nv - 1)) for _ in range(holes)}

    def fn(u, v):
        j = round(v * nv)
        i = round(u * nu)
        L = length * (1.0 + (hem[i] if j == nv else 0.0))
        p = top + side * ((u - 0.5) * width) + down * (v * L)
        return p + nrm * (0.012 * math.sin(u * 5.0 + v * 4.0 + seed) * v)
    K.surface(kind, fn, nu, nv, skip=lambda i, j: (i, j) in hole_set)


def bipyramid(K, kind, c, r, h_lo, h_hi, n=6, phase=0.0, M=None):
    bm = K.bm(kind)
    M = M or Matrix.Identity(3)
    c = Vector(c)
    ring = [bm.verts.new(c + M @ Vector((r * math.cos(phase + TAU * i / n), r * math.sin(phase + TAU * i / n), 0)))
            for i in range(n)]
    lo = bm.verts.new(c + M @ Vector((0, 0, -h_lo)))
    hi = bm.verts.new(c + M @ Vector((0, 0, h_hi)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ring[i], ring[j], hi))
        bm.faces.new((ring[j], ring[i], lo))


def taper_tube(K, kind, a, b, r0, r1, sides=6, segs=1):
    a, b = Vector(a), Vector(b)
    pts = [a.lerp(b, i / segs) for i in range(segs + 1)]
    K.tube(kind, pts, lambda t: r0 + (r1 - r0) * t, sides)


def rot(axis, ang):
    return Matrix.Rotation(ang, 3, axis)


# =================================================================== props

def prop_shard_pedestal(K):
    """Memory-shard auction pedestal (Iris camp). Top at 1.0 m (layout.js SHARD)."""
    K.rev("stone_old", [(0.56, 0.0), (0.56, 0.06), (0.52, 0.085)], 8, cap_bottom=True, cap_top=True, phase=D(22.5))
    K.rev("stone_old", [(0.46, 0.085), (0.46, 0.14), (0.42, 0.165)], 8, cap_top=True, phase=D(22.5))
    # fluted, slightly swelling shaft (entasis); 16 sides alternate for faceted flutes
    prof = [(0.25, 0.165), (0.255, 0.30), (0.25, 0.55), (0.235, 0.80), (0.23, 0.82)]
    K.rev("stone_pale", prof, 16, rfunc=lambda th, z, r: r * (1.0 if int(round(th / (TAU / 16))) % 2 else 0.93),
          phase=D(11.25))
    # chipped erosion: two broken blocks at the plinth corners
    K.ico("stone_old", (0.43, -0.37, 0.05), 0.07, (1.0, 0.8, 0.6), 1, 0.3, 3)
    K.ico("stone_old", (-0.47, 0.25, 0.045), 0.06, (0.8, 1.0, 0.6), 1, 0.3, 4)
    # ornate bronze bands
    for z in (0.20, 0.78):
        K.rev("bronze_ornate", [(0.262, z - 0.025), (0.272, z - 0.01), (0.272, z + 0.01), (0.262, z + 0.025)], 16,
              cap_bottom=True, cap_top=True)
    # capital: flared octagon, top slab
    K.rev("stone_pale", [(0.23, 0.82), (0.26, 0.86), (0.34, 0.93), (0.35, 0.95)], 8, phase=D(22.5), cap_bottom=True)
    K.rev("marble", [(0.37, 0.95), (0.37, 0.985), (0.355, 1.0)], 8, phase=D(22.5), cap_bottom=True, cap_top=True)
    # violet glow inlay: ring groove on the top slab and four drops down the capital
    pl = kb_plane_top(1.0)
    strip_arc(K, "@Glow", pl, 0, 0, 0.30, 0.014, 0, TAU, 32, 0.001)
    for i in range(4):
        a = D(45) + i * D(90)
        x, y = 0.30 * math.cos(a), 0.30 * math.sin(a)
        K.box("@Glow", (x * 1.0, y * 1.0, 0.89), (0.018, 0.018, 0.07), rot=a)
    # cradle: four bronze claws rising and curling inward to hold the shard
    for i in range(4):
        a = D(45) + i * D(90)
        ca, sa = math.cos(a), math.sin(a)
        pts = [Vector((0.25 * ca, 0.25 * sa, 0.995)), Vector((0.19 * ca, 0.19 * sa, 1.05)),
               Vector((0.13 * ca, 0.13 * sa, 1.10)), Vector((0.085 * ca, 0.085 * sa, 1.13)),
               Vector((0.07 * ca, 0.07 * sa, 1.115))]
        K.tube("bronze_ornate", pts, lambda t: 0.018 * (1 - t) + 0.005, 6)
        K.box("bronze_ornate", (0.26 * ca, 0.26 * sa, 1.0), (0.06, 0.04, 0.02), rot=a, bevel=0.005)
    # seat ring for the shard
    K.ring("bronze_ornate", (0, 0, 1.006), 0.06, 0.008, 16, 6)
    # bid dial on the front: a bronze-framed recessed plaque for code-drawn bids
    K.box("bronze_ornate", (0, -0.262, 0.52), (0.22, 0.02, 0.13), bevel=0.006)
    K.box("basalt", (0, -0.273, 0.52), (0.19, 0.006, 0.10))
    K.socket("socket_bid", (0, -0.277, 0.52), (D(90), 0, 0), socket="bid_display", pad_size_m=[0.19, 0.10])
    # iris relief: three gold petals above the dial
    for ang, sc in ((90, 1.0), (210, 0.85), (330, 0.85)):
        a = D(ang)
        K.ico("gold_ornate", (0.035 * math.cos(a), -0.255, 0.66 + 0.035 * math.sin(a)), 0.03,
              (0.55 * sc, 0.25, 1.0 * sc), 1, 0.05, ang, M=rot("Y", -a + D(90)))
    # worn violet runner draped over the slab (frayed ends hang front and back)
    for sgn in (-1, 1):
        frayed_strip(K, "cloth_violet", (0.12, sgn * 0.372, 1.0), (0, sgn * 0.25, -1), (1, 0, 0), 0.32, 0.18,
                     7 + sgn, 3, 6)
    K.surface("cloth_violet", lambda u, v: Vector((0.12 + (u - 0.5) * 0.18, (v - 0.5) * 0.744, 1.003)), 2, 6)
    # moss in the plinth step
    for i in range(5):
        a = D(200 + 25 * i)
        K.ico("moss", (0.44 * math.cos(a), 0.44 * math.sin(a), 0.095), 0.045, (1.3, 1.0, 0.45), 1, 0.3, 30 + i)
    K.socket("socket_shard", (0, 0, 1.0), socket="shard")
    K.socket("socket_glow", (0, 0, 1.02), socket="glow", radius_m=0.32)
    K.col_cyl((0, 0, 0), 0.56, 0.165, 8)
    K.col_cyl((0, 0, 0.165), 0.30, 0.835, 8, 0.36)


def kb_plane_top(z):
    return Plane2((0, 0, z), (1, 0, 0), (0, 1, 0))


def prop_anchor_stake(K):
    """The stake Iris plants in an anchor zone; head built to read at 90 m."""
    for i in range(3):
        a = D(30 + 120 * i)
        K.ico("stone_old", (0.12 * math.cos(a), 0.12 * math.sin(a), 0.03), 0.08, (1.0, 0.75, 0.45), 1, 0.25, i,
              flat_bottom=0.0)
    K.cyl("iron", (0, 0, 0), 0.07, 0.12, 8, r_top=0.05)
    K.rev("wood", [(0.05, 0.12), (0.046, 1.0), (0.042, 1.95)], 8, cap_top=True)
    for z in (0.32, 0.95, 1.55, 1.9):
        K.cyl("iron_ornate", (0, 0, z - 0.02), 0.056, 0.04, 8)
    # shell number plaque
    K.box("bronze_ornate", (0, -0.055, 1.22), (0.15, 0.014, 0.15), bevel=0.006)
    K.box("basalt", (0, -0.0625, 1.22), (0.12, 0.004, 0.12))
    K.socket("socket_shell", (0, -0.066, 1.22), (D(90), 0, 0), socket="shell_number", pad_size_m=[0.12, 0.12])
    # crown: a gold cross vane with a ring, reads as a wheel from the iso camera
    zc = 2.0
    K.cyl("gold_ornate", (0, 0, 1.94), 0.065, 0.08, 8, r_top=0.09)
    for i in range(4):
        a = D(45) + i * D(90)
        ca, sa = math.cos(a), math.sin(a)
        pts = [Vector((0.06 * ca, 0.06 * sa, zc)), Vector((0.25 * ca, 0.25 * sa, zc + 0.01)),
               Vector((0.42 * ca, 0.42 * sa, zc + 0.06))]
        K.sweep("gold_ornate", pts, lambda t: [(-0.03 * (1 - 0.5 * t), 0), (0, 0.022 * (1 - 0.4 * t)),
                                                 (0.03 * (1 - 0.5 * t), 0), (0, -0.022 * (1 - 0.4 * t))])
        bipyramid(K, "gold_ornate", pts[-1] + Vector((0, 0, 0.02)), 0.03, 0.03, 0.07, 4)
        frayed_strip(K, "cloth_violet", (0.34 * ca, 0.34 * sa, zc + 0.02), (0, 0, -1), (-sa, ca, 0), 0.55, 0.09,
                     50 + i, 2, 6)
    K.ring("gold_ornate", (0, 0, zc + 0.03), 0.32, 0.016, 24, 6)
    # prongs holding the crystal
    for i in range(4):
        a = i * D(90)
        ca, sa = math.cos(a), math.sin(a)
        pts = [Vector((0.08 * ca, 0.08 * sa, zc + 0.01)), Vector((0.17 * ca, 0.17 * sa, zc + 0.15)),
               Vector((0.175 * ca, 0.175 * sa, zc + 0.24)), Vector((0.13 * ca, 0.13 * sa, zc + 0.33))]
        K.tube("bronze_ornate", pts, lambda t: 0.016 * (1 - t) + 0.005, 6)
    K.rev("@Glow", [(0.001, zc + 0.02), (0.16, zc + 0.23), (0.001, zc + 0.56)], 6, phase=D(30))
    K.socket("socket_glow", (0, 0, zc + 0.24), socket="glow", radius_m=0.5)
    K.socket("socket_beacon", (0, 0, zc + 0.58), socket="beacon")
    K.col_cyl((0, 0, 0), 0.07, 1.95, 8)
    K.col_cyl((0, 0, 1.95), 0.33, 0.62, 8, 0.18)


def prop_anchor_pad(K):
    """Anchor zone floor marker (r 1.5 m, layout.js ANCHOR_ZONE_RADIUS) with a
    recessed plaque for the code-drawn Shell number."""
    R0, R1 = 1.5, 1.28
    n = 24
    gap = 0.012
    for i in range(n):
        a0 = TAU * i / n + gap / R1
        a1 = TAU * (i + 1) / n - gap / R1
        segs = 3
        sec = []
        for kk in range(segs + 1):
            a = a0 + (a1 - a0) * kk / segs
            ca, sa = math.cos(a), math.sin(a)
            ch = 0.012 * (0.5 + 0.5 * math.sin(i * 2.7 + kk))
            sec.append([Vector((R1 * ca, R1 * sa, 0.0)), Vector((R0 * ca, R0 * sa, 0.0)),
                        Vector(((R0 - 0.015) * ca, (R0 - 0.015) * sa, 0.045 - ch)),
                        Vector(((R1 + 0.01) * ca, (R1 + 0.01) * sa, 0.05 - ch * 0.5))])
        K.loft("stone_old", sec)
    K.rev("bronze_ornate", [(R1, 0.0), (R1, 0.046), (R1 - 0.05, 0.046), (R1 - 0.05, 0.0)], 48)
    # inner basalt disc with a nacre-gold inner ring and four spokes
    K.rev("basalt", [(R1 - 0.05, 0.0), (R1 - 0.05, 0.035), (0.001, 0.035)], 48)
    pl = kb_plane_top(0.035)
    strip_arc(K, "@Glow", pl, 0, 0, 0.92, 0.035, 0, TAU, 48, 0.0015)
    strip_arc(K, "gold_ornate", pl, 0, 0, 0.30, 0.03, 0, TAU, 24, 0.002)
    for i in range(4):
        a = D(45) + i * D(90)
        seg2(K, "gold_ornate", pl, (0.33 * math.cos(a), 0.33 * math.sin(a)),
             (0.88 * math.cos(a), 0.88 * math.sin(a)), 0.02, 0.002)
    # small logogram rosette in the centre
    logogram(K, "gold_ornate", pl, 0.16, 0.014, 11, lift=0.002, dots=3)
    # plaque toward the plaza (local -Y = glTF +Z, the asset's front)
    K.box("bronze_ornate", (0, -1.08, 0.040), (0.40, 0.25, 0.012), bevel=0.004)
    K.box("basalt", (0, -1.08, 0.044), (0.34, 0.19, 0.008))
    K.socket("socket_shell", (0, -1.08, 0.049), socket="shell_number", pad_size_m=[0.34, 0.19])
    K.socket("socket_anchor", (0, 0, 0.035), socket="anchor_spot", zone_radius_m=1.5)
    K.socket("socket_glow", (0, 0, 0.04), socket="glow", radius_m=0.92)
    # moss in a few joints
    for i in range(6):
        a = TAU * (i * 4 + 1) / n
        K.ico("moss", (1.39 * math.cos(a), 1.39 * math.sin(a), 0.025), 0.05, (0.6, 1.3, 0.35), 1, 0.3, 60 + i,
              M=rot("Z", a))
    K.col_cyl((0, 0, 0), 1.5, 0.05, 16)


def prop_logogram_tablet(K):
    """Stone stele with an engraved round Guest sign (emissive groove)."""
    W, T = 0.80, 0.18
    y0 = -T / 2
    zc, Rr, dep = 0.88, 0.30, 0.016
    z_lo, z_hi = 0.16, 1.18
    # chipped top profile (x -> z), shared by front and back
    tops = [(-0.40, 1.24), (-0.30, 1.30), (-0.12, 1.33), (0.05, 1.32), (0.20, 1.29), (0.31, 1.26), (0.40, 1.21)]
    S = "stone_old"
    # front face: square region with a circular hole (polar quads), plus bands
    N = 48
    sq = []
    for i in range(N):
        a = TAU * i / N
        ca, sa = math.cos(a), math.sin(a)
        tt = min(abs(0.40 / ca) if abs(ca) > 1e-6 else 9, abs(0.30 / sa) if abs(sa) > 1e-6 else 9)
        sq.append(((tt * ca, zc + tt * sa), (Rr * ca, zc + Rr * sa)))
    for i in range(N):
        j = (i + 1) % N
        (o0, i0), (o1, i1) = sq[i], sq[j]
        face_toward(K, S, [(o0[0], y0, o0[1]), (o1[0], y0, o1[1]), (i1[0], y0, i1[1]), (i0[0], y0, i0[1])], (0, -1, 0))
    face_toward(K, S, [(-0.4, y0, z_lo), (0.4, y0, z_lo), (0.4, y0, zc - 0.30), (-0.4, y0, zc - 0.30)], (0, -1, 0))
    face_toward(K, S, [(-0.4, y0, zc + 0.30), (0.4, y0, zc + 0.30)] + [(x, y0, z) for x, z in reversed(tops)],
                (0, -1, 0))
    # recess wall and floor
    for i in range(N):
        a0, a1 = TAU * i / N, TAU * (i + 1) / N
        p = [(Rr * math.cos(a0), y0, zc + Rr * math.sin(a0)), (Rr * math.cos(a1), y0, zc + Rr * math.sin(a1)),
             (Rr * math.cos(a1), y0 + dep, zc + Rr * math.sin(a1)), (Rr * math.cos(a0), y0 + dep, zc + Rr * math.sin(a0))]
        face_toward(K, S, p, (-math.cos((a0 + a1) / 2), 0, -math.sin((a0 + a1) / 2)))
    face_toward(K, "basalt", [(Rr * math.cos(TAU * i / N), y0 + dep, zc + Rr * math.sin(TAU * i / N)) for i in range(N)],
                (0, -1, 0))
    # back face, top, sides
    yb = T / 2
    face_toward(K, S, [(-0.4, yb, z_lo), (0.4, yb, z_lo)] + [(x, yb, z) for x, z in reversed(tops)], (0, 1, 0))
    for (x0, z0), (x1, z1) in zip(tops, tops[1:]):
        face_toward(K, S, [(x0, y0, z0), (x1, y0, z1), (x1, yb, z1), (x0, yb, z0)], (0, 0, 1))
    face_toward(K, S, [(-0.4, y0, z_lo), (-0.4, yb, z_lo), (-0.4, yb, tops[0][1]), (-0.4, y0, tops[0][1])], (-1, 0, 0))
    face_toward(K, S, [(0.4, y0, z_lo), (0.4, yb, z_lo), (0.4, yb, tops[-1][1]), (0.4, y0, tops[-1][1])], (1, 0, 0))
    # engraved frame line around the face (bronze inlay, worn)
    pl = Plane2((0, y0, 0), (1, 0, 0), (0, 0, 1))
    pl.N = Vector((0, -1, 0))
    for a, b in (((-0.34, 0.24), (0.34, 0.24)), ((-0.34, 0.24), (-0.34, 1.16)), ((0.34, 0.24), (0.34, 1.10))):
        seg2(K, "bronze_ornate", pl, a, b, 0.012, 0.0012)
    # the sign on the recess floor
    pf = Plane2((0, y0 + dep, zc), (1, 0, 0), (0, 0, 1))
    pf.N = Vector((0, -1, 0))
    logogram(K, "@Glow", pf, 0.19, 0.016, 2, lift=0.0012, dots=2)
    # plinth and moss
    K.box("stone_old", (0, 0, 0.08), (1.0, 0.36, 0.16), bevel=0.02)
    K.ico("stone_old", (0.46, -0.16, 0.05), 0.08, (1.0, 0.8, 0.6), 1, 0.3, 9)
    for i, (x, y) in enumerate(((-0.42, -0.18), (-0.25, -0.19), (0.30, 0.18), (0.44, 0.10), (-0.46, 0.15))):
        K.ico("moss", (x, y, 0.15), 0.06, (1.3, 0.8, 0.5), 1, 0.3, 70 + i)
    K.ico("moss", (-0.36, -0.092, 1.27), 0.06, (1.2, 0.5, 0.45), 1, 0.3, 80)
    K.socket("socket_glow", (0, y0 + dep - 0.002, zc), (D(90), 0, 0), socket="glow", radius_m=0.3)
    K.socket("socket_logogram", (0, y0 - 0.002, zc), (D(90), 0, 0), socket="logogram", radius_m=0.3)
    K.col_box((0, 0, 0.08), (1.0, 0.36, 0.16))
    K.col_box((0, 0, 0.74), (0.8, 0.18, 1.18))


def prop_scroll_fragment(K):
    """One wedge of the Scroll. Fits scroll_table's sector sockets (r 0.56-1.20,
    half angle 26 deg): place it at socket_sector_k; the table centre lies along +Y
    (Blender), i.e. glTF -Z. The clan inlay material has KHR_materials_variants."""
    rc = 0.88
    ri, ro, half, th = 0.58, 1.18, D(25), 0.058

    def P(r, phi, z):
        return Vector((r * math.sin(phi), r * math.cos(phi) - rc, z))

    n = 12

    def outline(dr, da, z):
        pts = [P(ro - dr, -half + da / ro + (2 * half - 2 * da / ro) * i / n, z) for i in range(n + 1)]
        pts += [P(ri + dr, half - da / ri - (2 * half - 2 * da / ri) * i / n, z) for i in range(n + 1)]
        return pts
    K.loft("basalt", [outline(0, 0, 0.0), outline(0, 0, th - 0.01), outline(0.01, 0.01, th)])
    # bronze band on the outer arc and the two radial edges
    secs = []
    for i in range(n + 1):
        phi = -half + 2 * half * i / n
        secs.append([P(ro - 0.002, phi, 0.008), P(ro + 0.006, phi, 0.008), P(ro + 0.006, phi, th - 0.014),
                     P(ro - 0.002, phi, th - 0.014)])
    K.loft("bronze_ornate", secs)
    # engraved gold border on the top face
    pl = kb_plane_top(th)
    for sgn in (-1, 1):
        a = sgn * (half - D(3))
        seg2(K, "gold_ornate", pl, tuple(P(ri + 0.03, a, 0)[:2]), tuple(P(ro - 0.03, a, 0)[:2]), 0.008, 0.0008)
    # the clan inlay: a segment of the big Scroll ring, one stroke and reading dots
    for i in range(10):
        p0, p1 = -D(21) + D(42) * i / 10, -D(21) + D(42) * (i + 1) / 10
        q = [P(0.86, p0, th + 0.001), P(0.90, p0, th + 0.001), P(0.90, p1, th + 0.001), P(0.86, p1, th + 0.001)]
        face_toward(K, "@Clan", q, (0, 0, 1))
    s0 = D(7)
    face_toward(K, "@Clan", [P(0.90, s0 - D(2.2), th + 0.001), P(1.08, s0, th + 0.001),
                             P(0.90, s0 + D(2.2), th + 0.001)], (0, 0, 1))
    for i, phi in enumerate((-D(12), D(0), D(12))):
        c = P(0.70, phi, 0)
        disc2(K, "@Clan", pl, c.x, c.y, 0.013 if i != 1 else 0.018, 8, 0.001)
    K.socket("socket_glow", (0, 0, th + 0.002), socket="glow", radius_m=0.32)
    hull = []
    for z in (0.0, th):
        for r, phi in ((ri, -half), (ri, half), (ro, -half), (ro, half), (ro, 0)):
            hull.append(P(r * 1.006 if r == ro else r, phi, z))
    K.col_hull(hull)


def prop_lantern(K):
    """Small hexagonal lantern (stands, or hangs from socket_hang)."""
    K.rev("bronze_ornate", [(0.105, 0.0), (0.11, 0.012), (0.10, 0.03), (0.09, 0.035)], 6, cap_bottom=True,
          cap_top=True, phase=D(30))
    for i in range(3):
        a = D(30) + i * D(120)
        K.ico("bronze", (0.09 * math.cos(a), 0.09 * math.sin(a), -0.0), 0.016, (1, 1, 0.8), 1, 0.0, i,
              flat_bottom=0.0)
    for i in range(6):
        a = D(30) + i * D(60)
        K.beam("bronze_ornate", (0.088 * math.cos(a), 0.088 * math.sin(a), 0.03),
               (0.088 * math.cos(a), 0.088 * math.sin(a), 0.262), 0.012, 0.012)
    for z in (0.12, 0.2):
        K.rev("bronze_ornate", [(0.092, z - 0.004), (0.092, z + 0.004)], 6, phase=D(30))
    K.rev("@Glass", [(0.082, 0.035), (0.082, 0.258)], 6, phase=D(30), cap_top=True)
    K.cyl("wax", (0, 0, 0.035), 0.022, 0.07, 10)
    K.ico("@Glow", (0, 0, 0.128), 0.014, (1.0, 1.0, 2.2), 1, 0.0, 1)
    K.rev("bronze_ornate", [(0.118, 0.258), (0.12, 0.27), (0.10, 0.285), (0.045, 0.335), (0.03, 0.345),
                            (0.03, 0.36), (0.02, 0.37)], 6, phase=D(30), cap_bottom=True, cap_top=True)
    for i in range(6):   # upturned eave tips
        a = D(30) + i * D(60)
        bipyramid(K, "bronze_ornate", (0.125 * math.cos(a), 0.125 * math.sin(a), 0.275), 0.008, 0.004, 0.02, 4)
    K.ring("bronze_ornate", (0, 0, 0.395), 0.026, 0.0055, 14, 6, M=rot("X", D(90)))
    K.socket("socket_flame", (0, 0, 0.13), socket="flame", scale_m=0.05)
    K.socket("socket_glow", (0, 0, 0.15), socket="glow", radius_m=0.12)
    K.socket("socket_hang", (0, 0, 0.42), socket="hang")
    K.col_cyl((0, 0, 0), 0.12, 0.42, 6)


def prop_bridge_torch(K):
    """Rail-mounted iron brazier torch for the bridges."""
    K.box("stone_old", (0, 0, 0.11), (0.30, 0.30, 0.22), bevel=0.02)
    K.box("stone_old", (0, 0, 0.235), (0.24, 0.24, 0.03), bevel=0.008)
    prof = [(0.045, 0.25), (0.05, 0.28), (0.035, 0.31), (0.033, 0.70), (0.045, 0.73), (0.045, 0.76), (0.033, 0.79),
            (0.03, 1.25), (0.042, 1.28), (0.06, 1.33), (0.06, 1.35)]
    K.rev("iron_ornate", prof, 8, cap_top=True)
    for i in range(4):     # twisted brackets
        a = D(45) + i * D(90)
        ca, sa = math.cos(a), math.sin(a)
        K.tube("iron_ornate", [(0.03 * ca, 0.03 * sa, 1.10), (0.09 * ca, 0.09 * sa, 1.22), (0.08 * ca, 0.08 * sa, 1.36)],
               0.008, 5)
    for i in range(8):     # brazier cage
        a = i * D(45)
        ca, sa = math.cos(a), math.sin(a)
        K.tube("iron", [(0.06 * ca, 0.06 * sa, 1.35), (0.13 * ca, 0.13 * sa, 1.45), (0.175 * ca, 0.175 * sa, 1.60),
                        (0.19 * ca, 0.19 * sa, 1.64)], 0.008, 4)
    K.ring("iron_ornate", (0, 0, 1.45), 0.13, 0.009, 16, 5)
    K.ring("iron_ornate", (0, 0, 1.60), 0.175, 0.011, 20, 5)
    for i in range(3):
        a = i * D(60)
        K.beam("charred", (0.12 * math.cos(a), 0.12 * math.sin(a), 1.46), (-0.12 * math.cos(a), -0.12 * math.sin(a), 1.49),
               0.04, 0.04)
    for i in range(7):
        a = i * D(51)
        r = 0.04 + 0.05 * (i % 3) / 2
        K.ico("@Glow", (r * math.cos(a), r * math.sin(a), 1.44 + 0.02 * (i % 2)), 0.035, (1, 1, 0.7), 1, 0.3, i)
    K.socket("socket_flame", (0, 0, 1.56), socket="flame", scale_m=0.45)
    K.socket("socket_glow", (0, 0, 1.50), socket="glow", radius_m=0.2)
    K.col_box((0, 0, 0.125), (0.30, 0.30, 0.25))
    K.col_cyl((0, 0, 0.25), 0.05, 1.1, 6)
    K.col_cyl((0, 0, 1.35), 0.07, 0.3, 8, 0.19)


# ---------------------------------------------------------------- banners

BANNER_T = 2.95       # cloth top
BANNER_L = 1.70       # cloth length
BANNER_X = 0.62       # cloth centre (pole foot = pivot)
BANNER_W = 0.86

BANNERS = {
    "iris": dict(cloth="cloth_violet", thread="thread_gold"),
    "sol": dict(cloth="cloth_cream", thread="thread_gold"),
    "pepel": dict(cloth="cloth_char", thread="thread_ember"),
    "moh": dict(cloth="cloth_green", thread="thread_gold"),
    "yantar": dict(cloth="cloth_amber", thread="thread_gold"),
    "iney": dict(cloth="cloth_frost", thread="thread_silver"),
}


def banner_fold(x, d):
    amp = 0.010 + 0.022 * max(0.0, d - 0.55) / 0.45
    return amp * math.sin((x / BANNER_W) * TAU * 2.4 + d * 1.6) + 0.04 * d * d


def sigil_shapes(clan):
    """2D appliqué polygons in cloth space (x right, s down from the top)."""
    out = []   # list of ("poly", [pts]) ; pts as (x, s)
    sc = 0.55  # sigil centre, metres below the top

    def circ(cx, cs, r, n=12):
        return [(cx + r * math.cos(TAU * i / n), cs + r * math.sin(TAU * i / n)) for i in range(n)]

    def ringq(cx, cs, R, w, a0=0.0, a1=TAU, n=20):
        q = []
        for i in range(n):
            t0, t1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
            q.append([(cx + (R - w / 2) * math.cos(t0), cs + (R - w / 2) * math.sin(t0)),
                      (cx + (R + w / 2) * math.cos(t0), cs + (R + w / 2) * math.sin(t0)),
                      (cx + (R + w / 2) * math.cos(t1), cs + (R + w / 2) * math.sin(t1)),
                      (cx + (R - w / 2) * math.cos(t1), cs + (R - w / 2) * math.sin(t1))])
        return q

    def rect(cx, cs, w, h, a=0.0):
        c, s = math.cos(a), math.sin(a)
        return [(cx + x * c - y * s, cs + x * s + y * c) for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]

    def ell(cx, cs, a_, b_, ang, n=12):
        c, s = math.cos(ang), math.sin(ang)
        return [(cx + a_ * math.cos(t) * c - b_ * math.sin(t) * s, cs + a_ * math.cos(t) * s + b_ * math.sin(t) * c)
                for t in (TAU * i / n for i in range(n))]

    polys = []
    # every banner: a border ring and a hem band (worn gold/ember thread)
    polys += ringq(0, sc, 0.30, 0.025, n=28)
    polys.append(rect(0, 0.06, BANNER_W - 0.08, 0.025))
    if clan == "iris":       # three iris petals and a falling tongue
        polys.append(ell(0, sc - 0.11, 0.055, 0.12, 0.0))
        polys.append(ell(-0.12, sc + 0.02, 0.05, 0.12, D(55)))
        polys.append(ell(0.12, sc + 0.02, 0.05, 0.12, -D(55)))
        polys.append(ell(0, sc + 0.12, 0.04, 0.09, 0.0))
        polys.append(circ(0, sc, 0.035, 10))
    elif clan == "sol":      # balance with a crystal
        polys.append(rect(0, sc - 0.05, 0.40, 0.025))
        polys.append(rect(0, sc + 0.06, 0.025, 0.24))
        polys.append([(-0.20, sc - 0.04), (-0.27, sc + 0.08), (-0.13, sc + 0.08)])
        polys.append([(0.20, sc - 0.04), (0.13, sc + 0.08), (0.27, sc + 0.08)])
        polys.append([(0, sc - 0.22), (0.05, sc - 0.13), (0, sc - 0.07), (-0.05, sc - 0.13)])
        polys.append(rect(0, sc + 0.19, 0.16, 0.025))
    elif clan == "pepel":    # palisade of stakes
        for i, x in enumerate((-0.16, -0.08, 0.0, 0.08, 0.16)):
            top = sc - 0.16 - (0.04 if i == 2 else 0.0)
            polys.append(rect(x, sc + 0.04, 0.045, 0.30))
            polys.append([(x - 0.0225, top + 0.06), (x, top - 0.02), (x + 0.0225, top + 0.06)])
        polys.append(rect(0, sc + 0.02, 0.40, 0.022))
        polys.append(rect(0, sc + 0.12, 0.40, 0.022))
    elif clan == "moh":      # leaf over a cauldron
        polys.append(ell(0, sc - 0.08, 0.075, 0.15, D(20), 14))
        polys.append(rect(0.01, sc - 0.06, 0.012, 0.26, D(20)))
        polys.append([(-0.15, sc + 0.08), (0.15, sc + 0.08), (0.11, sc + 0.19), (-0.11, sc + 0.19)])
        polys.append(rect(0, sc + 0.075, 0.34, 0.025))
    elif clan == "yantar":   # key
        polys += ringq(0, sc - 0.13, 0.07, 0.03, n=14)
        polys.append(rect(0, sc + 0.04, 0.035, 0.28))
        polys.append(rect(0.045, sc + 0.12, 0.06, 0.03))
        polys.append(rect(0.035, sc + 0.165, 0.04, 0.03))
        polys.append(circ(0, sc - 0.13, 0.025, 8))
    elif clan == "iney":     # armillary rings and six rays
        polys += ringq(0, sc, 0.13, 0.022, n=20)
        q = ringq(0, 0, 0.16, 0.018, n=20)
        polys += [[(x * 1.0, sc + y * 0.38) for x, y in p] for p in q]
        for i in range(6):
            a = D(30) + i * D(60)
            polys.append(rect(0.21 * math.cos(a), sc + 0.21 * math.sin(a), 0.07, 0.016, a))
        polys.append(circ(0, sc, 0.035, 10))
    return polys


def _subdiv_tris(pts, max_edge=0.06):
    c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    tris = [(c, pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    out = []
    while tris:
        a, b, cc = tris.pop()
        e = max(math.dist(a, b), math.dist(b, cc), math.dist(cc, a))
        if e <= max_edge:
            out.append((a, b, cc))
            continue
        ab = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        bc = ((b[0] + cc[0]) / 2, (b[1] + cc[1]) / 2)
        ca = ((cc[0] + a[0]) / 2, (cc[1] + a[1]) / 2)
        tris += [(a, ab, ca), (ab, b, bc), (ca, bc, cc), (ab, bc, ca)]
    return out


def make_banner(clan):
    spec = BANNERS[clan]

    def fn(K):
        rng = random.Random(kb.sid(clan))
        # pole, base and crossbar (static, skin group 0)
        K.box("stone_old", (0, 0, 0.09), (0.38, 0.38, 0.18), bevel=0.02)
        K.ico("stone_old", (0.2, -0.17, 0.04), 0.07, (1, 0.8, 0.6), 1, 0.3, 3)
        K.cyl("iron_ornate", (0, 0, 0.18), 0.06, 0.08, 8, r_top=0.045)
        K.rev("wood", [(0.04, 0.26), (0.036, 2.0), (0.033, 3.25)], 8, cap_top=True)
        for z in (0.9, 2.2):
            K.cyl("iron_ornate", (0, 0, z), 0.044, 0.035, 8)
        bipyramid(K, "gold_ornate", (0, 0, 3.32), 0.04, 0.07, 0.20, 4)
        K.cyl("gold_ornate", (0, 0, 3.24), 0.045, 0.02, 8)
        K.beam("iron_ornate", (-0.02, 0, BANNER_T + 0.035), (BANNER_X + BANNER_W / 2 + 0.07, 0, BANNER_T + 0.035),
               0.032, 0.032)
        K.tube("iron_ornate", [(0.0, 0, BANNER_T - 0.33), (0.12, 0, BANNER_T - 0.18), (0.30, 0, BANNER_T + 0.02)],
               0.012, 5)
        bipyramid(K, "gold_ornate", (BANNER_X + BANNER_W / 2 + 0.11, 0, BANNER_T + 0.035), 0.022, 0.05, 0.05, 4,
                  M=rot("Y", D(90)))
        for i in range(5):
            x = BANNER_X - BANNER_W / 2 + 0.05 + (BANNER_W - 0.1) * i / 4
            K.ring("iron", (x, 0, BANNER_T + 0.03), 0.026, 0.005, 10, 4, M=rot("X", D(90)))
        # cloth (skin group 1): folds, swallowtail hem, frays and moth holes
        nu, nv = 12, 20
        hem = [rng.uniform(-0.05, 0.03) for _ in range(nu + 1)]
        holes = {(rng.randrange(1, nu - 1), rng.randrange(13, nv - 1)) for _ in range(3)}

        def cloth_pt(u, v):
            i, j = round(u * nu), round(v * nv)
            x = (u - 0.5) * BANNER_W
            Lc = BANNER_L * (1.0 - 0.16 * (1.0 - abs(2 * u - 1)))
            if j == nv:
                Lc += hem[i] + (0.05 if i % 2 else 0.0)   # frayed threads
            d = v * Lc / BANNER_L
            return Vector((BANNER_X + x, banner_fold(x, d), BANNER_T - v * Lc))
        with K.group(1):
            K.surface(spec["cloth"], cloth_pt, nu, nv, skip=lambda i, j: (i, j) in holes)
            for pts in sigil_shapes(clan):
                for tri in _subdiv_tris(pts):
                    for side in (-1, 1):
                        p3 = []
                        for x, s in tri:
                            d = s / BANNER_L
                            y = banner_fold(x, d)
                            p3.append(Vector((BANNER_X + x, y + side * 0.005, BANNER_T - s)))
                        face_toward(K, spec["thread"], p3, (0, side, 0))
        K.socket("socket_cloth", (BANNER_X, 0, BANNER_T - BANNER_L * 0.4), socket="cloth_center")
        K.socket("socket_top", (0, 0, 3.52), socket="finial")
        K.col_box((0, 0, 0.09), (0.38, 0.38, 0.18))
        K.col_cyl((0, 0, 0.18), 0.05, 3.2, 6)

    def weights(co, tag):
        if tag != 1:
            return {"root": 1.0}
        d = max(0.0, min(1.0, (BANNER_T - co.z) / BANNER_L))
        t = max(0.0, min(1.0, (d - 0.3) / 0.4))
        wl = t * t * (3 - 2 * t)
        return {"cloth_upper": 1.0 - wl, "cloth_lower": wl}

    frames = 96
    ph = (kb.sid(clan) % 100) / 100.0 * TAU

    def keys(f):
        w = TAU * f / frames
        a_up = 0.06 * math.sin(w + ph) + 0.015 * math.sin(2 * w + ph)
        a_lo = 0.09 * math.sin(w + ph - 0.9) + 0.02 * math.sin(3 * w + ph)
        tw = 0.05 * math.sin(2 * w + ph + 0.4)
        return {"root": Quaternion((1, 0, 0, 0)),
                "cloth_upper": Quaternion((1, 0, 0), a_up),
                "cloth_lower": Quaternion((1, 0, 0), a_lo) @ Quaternion((0, 1, 0), tw)}

    mid = BANNER_T - BANNER_L * 0.5
    rig = {"name": f"banner_{clan}_rig",
           "bones": [("root", (0, 0, 0), (0, 0, 0.5), None),
                     ("cloth_upper", (BANNER_X, 0, BANNER_T), (BANNER_X, 0, mid), "root"),
                     ("cloth_lower", (BANNER_X, 0, mid), (BANNER_X, 0, BANNER_T - BANNER_L), "cloth_upper")],
           "weights": weights,
           "action": {"name": "idle", "frames": frames, "fps": 24, "step": 4, "keys": keys}}
    return fn, rig


def prop_memory_vial(K):
    """A forgotten memory sold at auction: a glowing vial in a bronze cage."""
    K.rev("@Glass", [(0.001, 0.025), (0.030, 0.026), (0.036, 0.040), (0.036, 0.160), (0.030, 0.185), (0.016, 0.200),
                     (0.014, 0.222), (0.018, 0.226)], 16, cap_top=True)
    K.rev("@Glow", [(0.001, 0.029), (0.030, 0.030), (0.031, 0.040), (0.031, 0.148), (0.001, 0.150)], 14)
    K.rev("bronze_ornate", [(0.0165, 0.218), (0.021, 0.222), (0.021, 0.246), (0.012, 0.256), (0.006, 0.262)], 12,
          cap_bottom=True, cap_top=True)
    K.ring("bronze_ornate", (0, 0, 0.272), 0.011, 0.003, 10, 5, M=rot("X", D(90)))
    K.ico("wax", (0.016, -0.012, 0.212), 0.012, (1.0, 1.0, 0.7), 1, 0.25, 2)
    for i in range(3):
        a = D(90) + i * D(120)
        ca, sa = math.cos(a), math.sin(a)
        prof = [(0.033, 0.026), (0.039, 0.04), (0.039, 0.16), (0.033, 0.185), (0.019, 0.2), (0.021, 0.222)]
        K.tube("bronze_ornate", [(r * ca, r * sa, z) for r, z in prof], 0.0028, 4)
    for z in (0.06, 0.13):
        K.ring("bronze_ornate", (0, 0, z), 0.0385, 0.0028, 18, 4)
    K.ring("bronze_ornate", (0, 0, 0.03), 0.042, 0.005, 18, 5)
    for i in range(3):
        a = D(30) + i * D(120)
        ca, sa = math.cos(a), math.sin(a)
        K.tube("bronze_ornate", [(0.042 * ca, 0.042 * sa, 0.03), (0.06 * ca, 0.06 * sa, 0.01), (0.065 * ca, 0.065 * sa, 0.0)],
               0.004, 4)
    K.socket("socket_glow", (0, 0, 0.09), socket="glow", radius_m=0.06)
    K.col_cyl((0, 0, 0), 0.065, 0.275, 8)


def _pebble(K, kind, seed, split=False, a=0.11, b=0.085, c=0.06):
    """Faceted river stone with a flat eroded top at z_top; returns z_top."""
    bm = bmesh.new()
    res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    rr = random.Random(seed)
    ph = [rr.uniform(0, TAU) for _ in range(4)]
    ztop = 0.0
    for v in res["verts"]:
        d = v.co.copy()
        k = 1.0 + 0.06 * math.sin(3.1 * d.x + ph[0]) * math.sin(2.3 * d.y + ph[1])
        p = Vector((d.x * a, d.y * b, d.z * c)) * k
        p.z = max(min(p.z, 0.78 * c), -0.55 * c)
        v.co = p + Vector((0, 0, 0.55 * c))
    ztop = 0.78 * c + 0.55 * c
    if split:
        nrm = Vector((1.0, -0.35, 0.0)).normalized()
        halves = []
        for keep in (1, -1):
            hb = bm.copy()
            g = hb.verts[:] + hb.edges[:] + hb.faces[:]
            r = bmesh.ops.bisect_plane(hb, geom=g, plane_co=(0, 0, 0), plane_no=nrm * keep, clear_inner=True)
            edges = [e for e in r["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
            bmesh.ops.holes_fill(hb, edges=edges, sides=0)
            bmesh.ops.translate(hb, verts=hb.verts[:], vec=nrm * keep * 0.012 + Vector((0, 0, 0)))
            halves.append(hb)
        bm.free()
        parts = halves
    else:
        parts = [bm]
    for p in parts:
        tmp = bpy.data.meshes.new("peb")
        p.to_mesh(tmp)
        p.free()
        K.bm(kind).from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return ztop


def prop_vote_stone_accept(K):
    """Final vote: a whole stone with a closed engraved ring (accept)."""
    zt = _pebble(K, "stone_pale", 3)
    pl = kb_plane_top(zt)
    strip_arc(K, "@Glow", pl, 0, 0, 0.036, 0.007, 0, TAU, 24, 0.0008)
    disc2(K, "@Glow", pl, 0, 0, 0.009, 8, 0.0008)
    K.socket("socket_glow", (0, 0, zt + 0.002), socket="glow", radius_m=0.04)
    K.col_cyl((0, 0, 0), 0.10, zt, 8, 0.07)


def prop_vote_stone_refuse(K):
    """Final vote: the same stone split in two, its ring broken (refuse)."""
    zt = _pebble(K, "basalt", 3, split=True)
    nrm = Vector((1.0, -0.35, 0.0)).normalized()
    pl = kb_plane_top(zt)
    tang = math.atan2(nrm.y, nrm.x) + D(90)
    for keep in (1, -1):
        off = nrm * keep * 0.012
        plk = Plane2((off.x, off.y, zt), (1, 0, 0), (0, 1, 0))
        base = tang if keep == 1 else tang + math.pi
        strip_arc(K, "@Glow", plk, 0, 0, 0.036, 0.007, base - math.pi + D(14), base - D(14), 12, 0.0008)
    K.socket("socket_glow", (0, 0, zt + 0.002), socket="glow", radius_m=0.04)
    K.col_cyl((0, 0, 0), 0.11, zt, 8, 0.08)


# =================================================================== relics

def relic_ash_spear(K):
    """Ash: the stake spear. Fire-hardened stake head, palisade collar, ember cracks."""
    K.cyl("iron", (0, 0, 0), 0.004, 0.10, 6, r_top=0.03)
    K.rev("charred", [(0.03, 0.10), (0.028, 0.9), (0.026, 1.62)], 8, cap_top=True)
    K.cyl("leather", (0, 0, 0.84), 0.032, 0.28, 8)
    for z in (0.84, 1.12):
        K.cyl("iron_ornate", (0, 0, z - 0.01), 0.036, 0.02, 8)
    K.rev("iron_ornate", [(0.034, 1.58), (0.045, 1.60), (0.045, 1.66), (0.038, 1.68)], 8, cap_bottom=True,
          cap_top=True)
    for i in range(6):
        a = i * D(60)
        ca, sa = math.cos(a), math.sin(a)
        taper_tube(K, "charred", (0.035 * ca, 0.035 * sa, 1.62), (0.11 * ca, 0.11 * sa, 1.86), 0.014, 0.002, 5, 2)
    K.rev("charred", [(0.042, 1.66), (0.055, 1.78), (0.04, 1.95), (0.001, 2.14)], 6, cap_bottom=True)
    K.ring("iron_ornate", (0, 0, 1.73), 0.054, 0.008, 12, 5)
    # ember cracks on the stake head
    for i in range(3):
        a = D(20) + i * D(120)
        pts = []
        for kk in range(7):
            z = 1.79 + 0.05 * kk / 2.0 * 0.95
            r = (0.055 - (z - 1.78) * 0.09 / 0.17) + 0.002
            r = max(r, 0.008)
            aa = a + (0.12 if kk % 2 else -0.12)
            pts.append((r * math.cos(aa), r * math.sin(aa), z))
        K.tube("@Glow", pts, 0.0035, 4)
    for i in range(2):
        a = D(110 + 140 * i)
        frayed_strip(K, "cloth_red", (0.045 * math.cos(a), 0.045 * math.sin(a), 1.62), (0.1 * math.cos(a), 0.1 * math.sin(a), -1),
                     (-math.sin(a), math.cos(a), 0), 0.38, 0.045, 90 + i, 2, 6)
    K.socket("socket_grip", (0, 0, 0.97), socket="grip")
    K.socket("socket_glow", (0, 0, 1.88), socket="glow", radius_m=0.1)
    K.socket("socket_flame", (0, 0, 2.14), socket="flame", scale_m=0.08)
    K.col_cyl((0, 0, 0), 0.04, 1.6, 6)
    K.col_cyl((0, 0, 1.6), 0.11, 0.54, 6, 0.02)


def relic_frost_staff(K):
    """Frost: the armillary staff. Glass rings around a cold core."""
    K.rev("@Ice", [(0.001, 0.0), (0.024, 0.14)], 6, cap_top=True)
    prof = [(0.024, 0.14), (0.026, 0.16), (0.02, 0.18)]
    z = 0.18
    while z < 1.45:
        prof += [(0.02, z + 0.16), (0.026, z + 0.18), (0.02, z + 0.2)]
        z += 0.2
    prof += [(0.02, 1.5), (0.05, 1.56), (0.03, 1.58)]
    K.rev("silver_ornate", prof, 8, cap_top=True)
    K.cyl("leather", (0, 0, 0.88), 0.024, 0.26, 8)
    for i in range(3):
        a = D(90) + i * D(120)
        ca, sa = math.cos(a), math.sin(a)
        K.tube("silver_ornate", [(0.03 * ca, 0.03 * sa, 1.55), (0.12 * ca, 0.12 * sa, 1.62), (0.16 * ca, 0.16 * sa, 1.70),
                                 (0.12 * ca, 0.12 * sa, 1.79), (0.02 * ca, 0.02 * sa, 1.83)], lambda t: 0.009 * (1 - 0.5 * t), 5)
    zc = 1.69
    K.ico("@Glow", (0, 0, zc), 0.055, (1, 1, 1), 2, 0.0, 1)
    K.ring("silver_ornate", (0, 0, zc), 0.145, 0.0075, 28, 5, M=rot("X", D(66)))
    K.ring("silver_ornate", (0, 0, zc), 0.125, 0.0075, 26, 5, M=rot("Y", D(62)) @ rot("X", D(20)))
    K.ring("@Ice", (0, 0, zc), 0.105, 0.010, 24, 6)
    for i in range(3):
        a = D(40 + 120 * i)
        K.ico("silver_ornate", rot("X", D(66)) @ Vector((0.145 * math.cos(a), 0.145 * math.sin(a), 0)) + Vector((0, 0, zc)),
              0.014, (1, 1, 1), 1, 0.0, i)
    K.rev("@Ice", [(0.02, 1.83), (0.001, 1.97)], 6, cap_bottom=True)
    K.socket("socket_grip", (0, 0, 1.0), socket="grip")
    K.socket("socket_glow", (0, 0, zc), socket="glow", radius_m=0.15)
    K.col_cyl((0, 0, 0), 0.03, 1.55, 6)
    K.col_cyl((0, 0, 1.55), 0.17, 0.42, 8)


def relic_salt_scales(K):
    """Salt: the balance blade. A sword whose crossguard is a tilted balance."""
    bipyramid(K, "@Quartz", (0, 0, 0.055), 0.036, 0.055, 0.06, 6)
    K.cyl("silver_ornate", (0, 0, 0.1), 0.024, 0.025, 8, r_top=0.018)
    K.cyl("leather", (0, 0, 0.125), 0.018, 0.18, 8)
    K.cyl("silver_ornate", (0, 0, 0.30), 0.02, 0.02, 8, r_top=0.026)
    tilt = D(6)
    M = rot("Y", tilt)
    zb = 0.33
    K.box("gold_ornate", (0, 0, zb), (0.54, 0.024, 0.024), rot=M, bevel=0.005)
    K.box("gold_ornate", (0, 0, zb + 0.03), (0.04, 0.03, 0.05), bevel=0.006)
    for sgn in (-1, 1):
        end = Vector((0, 0, zb)) + M @ Vector((sgn * 0.27, 0, 0))
        K.ring("gold_ornate", end, 0.016, 0.004, 10, 4, M=rot("X", D(90)))
        drop = 0.20 + sgn * 0.03
        pan = end + Vector((0, 0, -drop))
        for i in range(3):
            a = D(90) + i * D(120)
            K.tube("bronze", [end - Vector((0, 0, 0.016)), pan + Vector((0.06 * math.cos(a), 0.06 * math.sin(a), 0.02))],
                   0.0018, 3)
        K.rev("gold_ornate", [(0.001, 0.0), (0.05, 0.004), (0.068, 0.02), (0.064, 0.022), (0.047, 0.008), (0.001, 0.006)],
              14, c=pan)
        if sgn == 1:
            for k_ in range(4):
                K.ico("salt", pan + Vector((0.02 * math.cos(k_ * 1.7), 0.02 * math.sin(k_ * 1.7), 0.018)), 0.016,
                      (1, 1, 0.8), 1, 0.3, k_)
    # blade with a fuller, rising from the balance
    n = 10
    secs = []
    for i in range(n + 1):
        t = i / n
        z = zb + 0.03 + t * 0.98
        w = 0.03 * (1 - t ** 3) + 0.001
        th = 0.007 * (1 - t) + 0.0008
        secs.append([Vector((-w, 0, z)), Vector((-w * 0.3, -th * 0.6, z)), Vector((0, -th, z)), Vector((w * 0.3, -th * 0.6, z)),
                     Vector((w, 0, z)), Vector((w * 0.3, th * 0.6, z)), Vector((0, th, z)), Vector((-w * 0.3, th * 0.6, z))])
    K.loft("silver_ornate", secs)
    K.socket("socket_grip", (0, 0, 0.21), socket="grip")
    K.socket("socket_glow", (0, 0, 0.055), socket="glow", radius_m=0.05)
    K.col_cyl((0, 0, 0), 0.035, 0.32, 6)
    K.col_box((0, 0, 0.24), (0.58, 0.14, 0.18))
    K.col_box((0, 0, 0.85), (0.07, 0.02, 1.0))


def relic_amber_keymace(K):
    """Amber: the key-mace. Flanges cut like key bits, an amber gem in the bow."""
    K.ico("bronze_ornate", (0, 0, 0.025), 0.03, (1, 1, 0.9), 1, 0.0, 1)
    K.rev("wood_warm", [(0.02, 0.04), (0.022, 0.35), (0.024, 0.62)], 8, cap_top=True)
    K.cyl("leather", (0, 0, 0.08), 0.025, 0.22, 8)
    for z in (0.07, 0.30, 0.58):
        K.cyl("bronze_ornate", (0, 0, z), 0.028, 0.025, 8)
    K.rev("bronze_ornate", [(0.03, 0.62), (0.055, 0.64), (0.055, 0.80), (0.035, 0.83)], 8, cap_bottom=True,
          cap_top=True)
    for i in range(6):
        a = i * D(60)
        R = rot("Z", a)
        for (r0, r1, z0, z1) in ((0.05, 0.10, 0.65, 0.70), (0.05, 0.085, 0.70, 0.74), (0.05, 0.11, 0.74, 0.79)):
            c = R @ Vector(((r0 + r1) / 2, 0, (z0 + z1) / 2))
            K.box("bronze_ornate", c, (r1 - r0, 0.016, z1 - z0), rot=a, bevel=0.003)
    K.cyl("bronze_ornate", (0, 0, 0.83), 0.02, 0.04, 8)
    K.ring("gold_ornate", (0, 0, 0.93), 0.065, 0.013, 20, 6, M=rot("X", D(90)))
    K.ico("@Gem", (0, 0, 0.93), 0.045, (1, 0.6, 1), 1, 0.0, 2)
    # dangling padlock on a short chain
    for k_ in range(3):
        K.ring("iron", (0.058, -0.0, 0.62 - 0.022 * k_), 0.01, 0.0025, 8, 3, M=rot("X", D(90) * (k_ % 2)) )
    K.box("iron_ornate", (0.058, 0, 0.54), (0.04, 0.02, 0.035), bevel=0.004)
    K.ring("iron", (0.058, 0, 0.565), 0.013, 0.003, 10, 3, M=rot("X", D(90)))
    K.socket("socket_grip", (0, 0, 0.19), socket="grip")
    K.socket("socket_glow", (0, 0, 0.93), socket="glow", radius_m=0.06)
    K.col_cyl((0, 0, 0), 0.03, 0.62, 6)
    K.col_cyl((0, 0, 0.62), 0.11, 0.38, 8)


def relic_moss_sickle(K):
    """Moss: the thorn sickle. Crescent bronze blade with thorns, moss and spores."""
    hpts = [Vector((0.006 * math.sin(t * 3), 0, 0.44 * t)) for t in (i / 6 for i in range(7))]
    K.tube("wood", hpts, lambda t: 0.019 - 0.004 * t, 7)
    K.cyl("bronze_ornate", (0, 0, 0.0), 0.022, 0.03, 8)
    helix = [Vector((0.021 * math.cos(t * 0.9), 0.021 * math.sin(t * 0.9), 0.05 + t * 0.012)) for t in range(28)]
    K.tube("moss", helix, 0.004, 4, cap=True)
    K.cyl("bronze_ornate", (0, 0, 0.42), 0.023, 0.05, 8)
    c = Vector((0.17, 0, 0.47))
    R = 0.17
    n = 16
    secs = []
    th0, th1 = D(180), D(-25)
    for i in range(n + 1):
        t = i / n
        th = th0 + (th1 - th0) * t
        r_hat = Vector((math.cos(th), 0, math.sin(th)))
        wb = 0.012 * (1 - t) + 0.001
        we = 0.04 * (1 - t ** 1.5) + 0.001
        tk = 0.006 * (1 - t) + 0.0008
        p = c + r_hat * R
        secs.append([p + r_hat * wb + Vector((0, tk, 0)), p - r_hat * we * 0.4 + Vector((0, tk * 0.4, 0)), p - r_hat * we,
                     p - r_hat * we * 0.4 - Vector((0, tk * 0.4, 0)), p + r_hat * wb - Vector((0, tk, 0))])
        if 1 <= i <= n - 2 and i % 2 == 0:
            base = p + r_hat * wb
            taper_tube(K, "wood", base, base + r_hat * 0.035 + Vector((0, 0, 0.0)) +
                       Vector((-math.sin(th), 0, math.cos(th))) * 0.012, 0.006, 0.0008, 4)
    K.loft("bronze_ornate", secs)
    for i in range(4):
        K.ico("moss", (0.02 * math.cos(i * 1.6), 0.02 * math.sin(i * 1.6), 0.47 + 0.01 * i), 0.024, (1, 1, 0.7), 1,
              0.35, 40 + i)
    for i, (dx, dz, s) in enumerate(((0.03, 0.49, 1.0), (-0.02, 0.485, 0.8), (0.01, 0.505, 0.65))):
        K.cyl("mushroom", (dx, 0.012, dz - 0.02), 0.004, 0.02 * s, 6)
        K.rev("@Spore", [(0.001, dz), (0.016 * s, dz + 0.003), (0.012 * s, dz + 0.01 * s), (0.001, dz + 0.012 * s)], 8,
              c=(dx, 0.012, 0))
    for i in range(2):
        a = D(40 + 200 * i)
        K.surface("leaf", lambda u, v, a=a: Vector((0.03 * math.cos(a) * (1 + 1.6 * v), 0.03 * math.sin(a) * (1 + 1.6 * v),
                                                   0.45 + 0.04 * v)) + Vector((-math.sin(a), math.cos(a), 0)) *
                  ((u - 0.5) * 0.035 * math.sin(math.pi * v)), 2, 4)
    K.socket("socket_grip", (0, 0, 0.22), socket="grip")
    K.socket("socket_glow", (0.01, 0.012, 0.5), socket="glow", radius_m=0.05)
    K.col_cyl((0, 0, 0), 0.025, 0.47, 6)
    K.col_box((0.17, 0, 0.55), (0.42, 0.03, 0.22))


def relic_iris_lens(K):
    """Iris: the fragment lens. Six violet glass wedges, like the Scroll, in a bronze ring."""
    K.ico("bronze_ornate", (0, 0, 0.02), 0.026, (1, 1, 1.0), 1, 0.0, 1)
    K.rev("wood", [(0.019, 0.03), (0.02, 0.4), (0.018, 0.66)], 8, cap_top=True)
    K.cyl("leather", (0, 0, 0.12), 0.022, 0.24, 8)
    for z in (0.11, 0.36, 0.64):
        K.cyl("bronze_ornate", (0, 0, z), 0.025, 0.022, 8)
    zc, Rf = 0.85, 0.15
    M = rot("X", D(90))
    for sgn in (-1, 1):
        K.tube("bronze_ornate", [(0, 0, 0.66), (sgn * 0.05, 0, 0.69), (sgn * 0.09, 0, zc - 0.11)], 0.009, 5)
    K.ring("bronze_ornate", (0, 0, zc), Rf, 0.014, 32, 6, M=M)
    K.ring("bronze_ornate", (0, 0, zc), Rf - 0.012, 0.005, 32, 4, M=M)
    for ang, L in ((90, 0.10), (210, 0.07), (330, 0.07), (150, 0.05), (30, 0.05), (270, 0.05)):
        a = D(ang)
        dvec = Vector((math.cos(a), 0, math.sin(a)))
        base = Vector((0, 0, zc)) + dvec * (Rf + 0.01)
        bipyramid(K, "gold_ornate", base + dvec * (L * 0.4), 0.018, L * 0.4, L * 0.6, 4,
                  M=Matrix((Vector((0, 1, 0)).cross(dvec), Vector((0, 1, 0)), dvec)).transposed())
    for i in range(6):
        a0 = D(60 * i + 2.5)
        a1 = D(60 * (i + 1) - 2.5)
        secs = []
        for kk in range(5):
            a = a0 + (a1 - a0) * kk / 4
            ca, sa = math.cos(a), math.sin(a)
            secs.append([Vector((0.03 * ca, -0.004, zc + 0.03 * sa)), Vector((0.132 * ca, -0.004, zc + 0.132 * sa)),
                         Vector((0.132 * ca, 0.004, zc + 0.132 * sa)), Vector((0.03 * ca, 0.004, zc + 0.03 * sa))])
        K.loft("@Glass", secs)
    K.ring("@Glow", (0, 0, zc), 0.024, 0.005, 16, 5, M=M)
    K.cyl("@Glow", (0, 0.0, zc - 0.0), 0.012, 0.004, 10)
    K.socket("socket_grip", (0, 0, 0.24), socket="grip")
    K.socket("socket_glow", (0, 0, zc), (D(90), 0, 0), socket="glow", radius_m=0.15)
    K.col_cyl((0, 0, 0), 0.03, 0.68, 6)
    K.col_box((0, 0, zc + 0.02), (0.42, 0.04, 0.44))


def guest_weapon(K):
    """The Shells' offered artifact (the 'weapon' outcome): a twisted nacre spine
    with sail membranes and a halo of shards that do not quite line up."""
    n = 26
    spine = []
    for i in range(n + 1):
        t = i / n
        z = 0.05 + 1.15 * t
        r = 0.06 * math.sin(t * math.pi * 1.5)
        spine.append(Vector((r * math.cos(t * 7), r * math.sin(t * 7), z)))
    secs = []
    for i, p in enumerate(spine):
        t = i / n
        rr = 0.045 * (1 - t) ** 0.7 + 0.004
        tw = t * D(540)
        secs.append([p + Vector((rr * math.cos(tw + k * TAU / 3), rr * math.sin(tw + k * TAU / 3), 0)) for k in range(3)])
    K.loft("@Nacre", secs)
    # knuckles (baked bone) along the spine, spaced irregularly
    for i, t in enumerate((0.08, 0.19, 0.34, 0.52, 0.61, 0.77)):
        p = spine[int(t * n)]
        K.ico("bone", p, 0.035 * (1.1 - t), (1, 1, 0.55), 1, 0.2, i, M=rot("Z", t * 9))
    # three sail membranes with curved nacre ribs
    for k in range(3):
        a = D(25 + 130 * k + 15 * (k == 2))
        d = Vector((math.cos(a), math.sin(a), 0))
        z0, z1 = 0.25 + 0.1 * k, 0.85 + 0.12 * k
        span = 0.22 + 0.06 * k
        rib = [Vector((0, 0, z0)) + d * (span * math.sin(math.pi * s) ** 0.8) + Vector((0, 0, (z1 - z0) * s)) +
               Vector((-d.y, d.x, 0)) * (0.05 * math.sin(TAU * s)) for s in (j / 10 for j in range(11))]
        K.tube("@Nacre", rib, lambda t: 0.009 * (1 - t) + 0.002, 4)

        def mfn(u, v, rib=rib, z0=z0, z1=z1):
            j = v * 10
            j0 = min(int(j), 9)
            p = rib[j0].lerp(rib[j0 + 1], j - j0)
            axis = Vector((0, 0, p.z))
            return axis.lerp(p, u)
        K.surface("@Membrane", mfn, 3, 10)
    # halo of shards, slightly out of true
    for i in range(7):
        a = TAU * i / 7 + 0.15 * math.sin(i * 3)
        r = 0.22 + 0.03 * math.sin(i * 2.3)
        p = Vector((r * math.cos(a), r * math.sin(a), 1.25 + 0.05 * math.sin(i * 1.9)))
        bipyramid(K, "nacre_base", p, 0.018, 0.03, 0.07, 4, phase=i, M=rot("X", 0.4 * math.sin(i)) @ rot("Y", 0.5 * math.cos(i * 1.3)))
    # inverted core: a cone opening downward where a tip should be
    K.rev("@Membrane", [(0.001, 1.18), (0.05, 1.12), (0.035, 1.08)], 7)
    K.socket("socket_glow", (0, 0, 1.15), socket="glow", radius_m=0.25)
    K.socket("socket_grip", (0, 0, 0.35), socket="grip")
    K.col_cyl((0, 0, 0), 0.32, 1.35, 8)


# =================================================================== registry
# name -> (fn, specials, atlas, budget, group, purpose, rig)

def _reg():
    R = {}

    def add(name, fn, specials=None, atlas=1024, budget=4000, group="props", rig=None, label=None):
        R[name] = dict(fn=fn, specials=specials or {}, atlas=atlas, budget=budget, group=group, rig=rig,
                       label=label or "".join(w.capitalize() for w in name.split("_")))
    add("shard_pedestal", prop_shard_pedestal, {"Glow": GLOW_VIOLET}, atlas=2048, budget=8000)
    add("anchor_stake", prop_anchor_stake, {"Glow": GLOW_AMBER})
    add("anchor_pad", prop_anchor_pad, {"Glow": GLOW_GOLD}, atlas=2048)
    add("logogram_tablet", prop_logogram_tablet, {"Glow": GLOW_GOLD})
    add("scroll_fragment", prop_scroll_fragment, {"Clan": GLOW_NEUTRAL})
    add("lantern", prop_lantern, {"Glass": GLASS_LANTERN, "Glow": GLOW_AMBER})
    add("bridge_torch", prop_bridge_torch, {"Glow": GLOW_EMBER})
    for clan in BANNERS:
        fn, rig = make_banner(clan)
        add(f"clan_banner_{clan}", fn, {}, rig=rig, label=f"Banner{clan.capitalize()}")
    add("memory_vial", prop_memory_vial, {"Glass": GLASS_CLEAR, "Glow": GLOW_GOLD})
    add("vote_stone_accept", prop_vote_stone_accept, {"Glow": GLOW_NEUTRAL})
    add("vote_stone_refuse", prop_vote_stone_refuse, {"Glow": GLOW_NEUTRAL})
    add("relic_ash_spear", relic_ash_spear, {"Glow": GLOW_EMBER}, group="relics")
    add("relic_frost_staff", relic_frost_staff, {"Ice": GLASS_ICE, "Glow": GLOW_COLD}, group="relics")
    add("relic_salt_scales", relic_salt_scales, {"Quartz": QUARTZ}, group="relics")
    add("relic_amber_keymace", relic_amber_keymace, {"Gem": dict(GLOW_AMBER, emit_strength=3.0, rough=0.1)},
        group="relics")
    add("relic_moss_sickle", relic_moss_sickle, {"Spore": GLOW_SPORE}, group="relics")
    add("relic_iris_lens", relic_iris_lens, {"Glass": GLASS_VIOLET, "Glow": GLOW_VIOLET}, group="relics")
    add("guest_weapon", guest_weapon, {"Nacre": NACRE, "Membrane": MEMBRANE}, group="relics")
    return R


REG = _reg()


def build(name):
    spec = REG[name]
    ftf.reset_scene()
    K = kb.Kit(name)
    spec["fn"](K)
    glb = os.path.join(BUILD, f"prop_{name}.glb")
    stats = kb.build_asset(K, glb, spec["label"], TEX, atlas=spec["atlas"], specials=spec["specials"],
                           rig=spec["rig"], tri_budget=spec["budget"])
    stats["group"] = spec["group"]
    stats["tri_budget"] = spec["budget"]
    os.makedirs(os.path.join(BUILD, "stats"), exist_ok=True)
    with open(os.path.join(BUILD, "stats", f"prop_{name}.json"), "w") as fh:
        json.dump(stats, fh, indent=2)
    return stats


# =================================================================== render

def studio(sc, ground=True):
    env = ftf.new_collection("Env")
    sc.world = ftf.sky_world(zenith=(0.10, 0.12, 0.15), horizon=(0.42, 0.40, 0.36), ground=(0.2, 0.2, 0.2),
                             strength=0.7)
    ftf.add_sun(env, energy=3.6, color=(1.0, 0.86, 0.66), elev=32, azim=-145)   # golden-hour key
    ftf.add_sun(env, "Rim", energy=1.4, color=(0.6, 0.72, 0.95), elev=25, azim=40)
    if ground:
        m = ftf.simple_material("Ground", (0.13, 0.135, 0.13), 0.9)
        bm = bmesh.new()
        ftf.revolve(bm, [(0.001, 0.0), (40.0, 0.0)], 64)
        ftf.bm_object("ground", bm, m, env)
    return env


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.name.endswith("_col"):
            o.hide_render = True
    meshes = [o for o in objs if o.type == "MESH" and not o.name.endswith("_col")]
    return objs, meshes


def frame_cam(env, meshes, res, lens=50, dir_=(0.62, -0.95, 0.42), fill=0.82):
    lo, hi = ftf.world_bounds(meshes)
    c = (lo + hi) / 2
    rad = max((hi - lo).length / 2, 0.05)
    d = Vector(dir_).normalized()
    fov = 2 * math.atan(18.0 / lens)
    dist = rad / math.sin(fov / 2) / fill
    return ftf.add_camera("cam", c + d * dist, c, lens=lens, col=env, clip_end=1000)


def render_tile(name, res=520, samples=96):
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, res, res, samples)
    ftf.use_gpu(sc)
    env = studio(sc)
    _, meshes = import_glb(os.path.join(BUILD, f"prop_{name}.glb"))
    d = (0.62, -0.95, 0.42)
    if name.startswith("relic") or name == "guest_weapon":
        d = (0.9, -0.75, 0.25)
    if name in ("anchor_pad",):
        d = (0.4, -0.8, 0.9)
    if name.startswith("vote") or name == "scroll_fragment":
        d = (0.5, -0.8, 0.75)
    cam = frame_cam(env, meshes, res, dir_=d)
    ftf.render_to(sc, cam, os.path.join(TILES, f"{name}.jpg"))


def render_closeups():
    """A few close-ups and the 90 m iso readability check of the anchor stake."""
    out = QA
    # 1. pedestal with the shard in place (shard.glb from the repo, if present)
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, 1100, 1100, 192)
    ftf.use_gpu(sc)
    env = studio(sc)
    _, meshes = import_glb(os.path.join(BUILD, "prop_shard_pedestal.glb"))
    shard = os.path.join(REPO, "game", "public", "assets", "models", "shard.glb")
    try:
        objs, sm = import_glb(shard)
        for o in objs:
            if o.parent is None:
                o.location.z += 1.0
        for o in objs:
            if "_inspect" in o.name:
                o.hide_render = True
    except Exception as exc:  # compressed glb (KTX2/meshopt) cannot be imported by Blender
        log("shard.glb not imported:", exc)
    cam = ftf.add_camera("cam", (1.1, -1.9, 1.6), (0, 0, 0.75), lens=50, col=env)
    ftf.render_to(sc, cam, os.path.join(out, "close_shard_pedestal.jpg"))
    # 2. banners: three in a row (rest pose)
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, 1400, 900, 160)
    ftf.use_gpu(sc)
    env = studio(sc)
    for i, clan in enumerate(("iris", "pepel", "iney", "sol", "moh", "yantar")):
        objs, _ = import_glb(os.path.join(BUILD, f"prop_clan_banner_{clan}.glb"))
        for o in objs:
            if o.parent is None:
                o.location.x += (i - 2.5) * 1.35 - 0.3
                o.location.y += (i % 2) * 0.5
    cam = ftf.add_camera("cam", (0.2, -7.6, 2.6), (0.1, 0, 1.9), lens=40, col=env)
    ftf.render_to(sc, cam, os.path.join(out, "close_banners.jpg"))
    # 3. tablet + fragment + vial + vote stones
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, 1400, 900, 160)
    ftf.use_gpu(sc)
    env = studio(sc)
    place = {"logogram_tablet": (-0.75, 0.25, 0), "scroll_fragment": (0.55, -0.15, 0), "memory_vial": (0.05, -0.55, 0),
             "vote_stone_accept": (-0.2, -0.85, 0), "vote_stone_refuse": (0.3, -0.95, 0), "lantern": (1.05, 0.55, 0)}
    for nm, p in place.items():
        objs, _ = import_glb(os.path.join(BUILD, f"prop_{nm}.glb"))
        for o in objs:
            if o.parent is None:
                o.location = Vector(p) + o.location
    cam = ftf.add_camera("cam", (0.3, -3.1, 1.55), (0.1, -0.05, 0.42), lens=42, col=env)
    ftf.render_to(sc, cam, os.path.join(out, "close_tablet_fragment_vial.jpg"))
    # 4. relics laid on a stone slab, top-down three-quarter
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, 1400, 900, 160)
    ftf.use_gpu(sc)
    env = studio(sc)
    relics = ["relic_ash_spear", "relic_frost_staff", "relic_salt_scales", "relic_amber_keymace",
              "relic_moss_sickle", "relic_iris_lens", "guest_weapon"]
    for i, nm in enumerate(relics):
        objs, _ = import_glb(os.path.join(BUILD, f"prop_{nm}.glb"))
        for o in objs:
            if o.parent is None:
                o.location.x += (i - 3) * 0.42
    cam = ftf.add_camera("cam", (0.0, -3.6, 1.9), (0, 0, 0.95), lens=45, col=env)
    ftf.render_to(sc, cam, os.path.join(out, "close_relics_lineup.jpg"))
    # 5. the stake at 90 m on an anchor pad (game camera: 62 deg pitch, 90 m)
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, 1280, 720, 128)
    ftf.use_gpu(sc)
    env = studio(sc, ground=False)
    m = ftf.simple_material("Plaza", (0.22, 0.22, 0.21), 0.9)
    bm = bmesh.new()
    ftf.revolve(bm, [(0.001, 0.0), (9.0, 0.0), (9.0, -1.0)], 64)
    ftf.bm_object("plaza", bm, m, env)
    for i, ang in enumerate((45, 135, 225, 315)):
        a = D(ang)
        p = Vector((6.6 * math.cos(a), 6.6 * math.sin(a), 0))
        objs, _ = import_glb(os.path.join(BUILD, "prop_anchor_pad.glb"))
        for o in objs:
            if o.parent is None:
                o.location = p
        if i in (0, 3):
            objs, _ = import_glb(os.path.join(BUILD, "prop_anchor_stake.glb"))
            for o in objs:
                if o.parent is None:
                    o.location = p
    pitch = D(62)
    cam = ftf.add_camera("cam", (0, -90 * math.cos(pitch), 90 * math.sin(pitch)), (0, 0, 0), fov_v_deg=45, col=env)
    ftf.render_to(sc, cam, os.path.join(out, "anchor_stake_iso_90m.jpg"))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    names = argv[1:] or list(REG)
    if stage == "list":
        print("\n".join(REG))
    for nm in names:
        if stage in ("build", "all"):
            build(nm)
        if stage in ("render", "all"):
            render_tile(nm)
    if stage == "closeups":
        render_closeups()
