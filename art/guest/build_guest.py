"""Procedural source for guest.glb (Forget to Foresee: one Guest).

Run with Blender 4.5 LTS:

    blender -b -P art/guest/build_guest.py -- geo      # geometry + preview renders
    blender -b -P art/guest/build_guest.py -- build    # + GPU bakes, export
    blender -b -P art/guest/build_guest.py -- render   # QA renders of the exported .glb
    blender -b -P art/guest/build_guest.py -- all

Design (original, owner concept 07.11). The Guest is our own creature, nothing
from the film Arrival: no seven-limbed radial body, no squid silhouette, no ink.
It is tall (about 6.4 m) and bilateral: a spindle torso of overlapping
nacre-crystal plates (the same growth language as the Shells), a faceless
crest hood that coils back like a shell whorl, eight long thin jointed legs,
a skirt of hanging filaments, two thin forelimbs (the right one ends in a
crystal stylus that "draws" the logogram) and fin-like sail membranes with
radiating spines: two great shoulder sails, a dorsal sail and two hip fins.

Separable parts for code: `guest_body`, `guest_arm_draw` (pivot at the
shoulder, with `socket_draw_tip` as a child), `guest_core` (emissive crystals),
membranes `guest_sail_l`, `guest_sail_r`, `guest_sail_dorsal`, `guest_fin_l`,
`guest_fin_r` (each pivoted at its root). No animation is baked.

Blender Z-up, front -Y (glTF: Y-up, front +Z). Pivot at the ground between the feet.
"""

import json
import math
import os
import random
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import blender_kit as K  # noqa: E402
from blender_kit import log  # noqa: E402

K.set_tag("guest")

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "guest")
TEX_DIR = os.path.join(HERE, "textures")
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", "guest.glb")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")
BLEND_PATH = os.path.join(HERE, "guest.blend")

SEED = 4417
TRI_BUDGET = 40000
BAKE = 4096
TEX = 2048
MEMBRANE_TEX = 2048
MASTER_EDGE = 0.02

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ------------------------------------------------------------------ curves

def catmull(points, n):
    """Centripetal-ish Catmull-Rom through points, n samples."""
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


def tube(bm, pts, radius, sides, cap=True, side_axis=None, squash=1.0, uv=None, rmod=None):
    """Swept ring along a polyline (parallel transport or fixed side axis)."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    rings, u, prev_t = [], None, None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        if side_axis is not None:
            u = (side_axis - t * side_axis.dot(t)).normalized()
        elif u is None:
            ref = Z if abs(t.z) < 0.9 else X
            u = t.cross(ref).normalized()
        else:
            u = prev_t.rotation_difference(t) @ u
            u = (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        s = i / (m - 1)
        r = radius(s) if callable(radius) else radius
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (rmod(s, a) if rmod else 1.0)
            ring.append(bm.verts.new(p + rr * (math.cos(a) * u * squash + math.sin(a) * v)))
        rings.append(ring)
        prev_t = t
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((a[k], a[l], b[l], b[k]))
    if cap:
        tip0 = bm.verts.new(pts[0] - (pts[1] - pts[0]).normalized() * 0.3 * (radius(0) if callable(radius) else radius))
        tip1 = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.3 * (radius(1) if callable(radius) else radius))
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((rings[0][l], rings[0][k], tip0))
            bm.faces.new((rings[-1][k], rings[-1][l], tip1))
    return rings


def crystal(bm, base, axis, length, width, sides=4, twist=0.0):
    """Elongated bipyramid crystal (closed)."""
    axis = axis.normalized()
    ref = Z if abs(axis.z) < 0.9 else X
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    mid = base + axis * length * 0.32
    ring = []
    for k in range(sides):
        a = 2 * math.pi * k / sides + twist
        ring.append(bm.verts.new(mid + width * (math.cos(a) * u + math.sin(a) * v)))
    top = bm.verts.new(base + axis * length)
    bot = bm.verts.new(base - axis * length * 0.12)
    for k in range(sides):
        l = (k + 1) % sides
        bm.faces.new((ring[k], ring[l], top))
        bm.faces.new((ring[l], ring[k], bot))


# ------------------------------------------------------------------ parts

def torso(bm, rng):
    """Spindle of overlapping plates; lips overhang downward like shingles."""
    sides = 48
    tk = [0.0, 0.08, 0.30, 0.55, 0.75, 0.90, 1.0]
    rk = [0.06, 0.24, 0.40, 0.56, 0.62, 0.42, 0.26]

    def radius(t):
        for i in range(len(tk) - 1):
            if t <= tk[i + 1]:
                u = (t - tk[i]) / (tk[i + 1] - tk[i])
                u = u * u * (3 - 2 * u)
                return rk[i] + (rk[i + 1] - rk[i]) * u
        return rk[-1]

    def centre(t):
        return Vector((0.0, 0.12 * math.sin(math.pi * t) - 0.20 * t, 1.85 + 3.05 * t))

    # rows: (t, dr) with plates between t=0.08 and 0.94
    rows = [(0.0, 0.0), (0.04, 0.0)]
    nplate = 9
    t0, t1 = 0.08, 0.94
    p = (t1 - t0) / nplate
    prof = []
    for i in range(4):
        s = i / 4
        prof.append((0.70 * s, s ** 0.9))
    for i in range(5):
        a = math.radians(90 - 45 * i)
        prof.append((0.70 + 0.24 * math.cos(a) * 0.5, 1 - 0.24 + 0.24 * math.sin(a)))
    prof.append((0.86, 0.25))
    hs = [rng.uniform(0.055, 0.085) for _ in range(nplate)]
    for k in range(nplate):
        for da, f in reversed(prof):
            rows.append((t0 + k * p + (1 - da) * p, f * hs[k]))
    rows.sort(key=lambda r: r[0])
    rows += [(0.97, 0.0), (1.0, 0.0)]
    rings = []
    for t, dr in rows:
        c = centre(t)
        r = radius(t)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            wob = 1 + 0.04 * math.sin(3 * a + 7 * t)
            rr = (r * wob + dr * (1.6 if r > 0.2 else 0.5))
            tilt = 0.075 * math.cos(a - 2 * math.pi * 1.4 * t) * min(1.0, t / 0.12, (1 - t) / 0.08)
            ring.append(bm.verts.new(c + Vector((rr * math.cos(a), 0.78 * rr * math.sin(a), tilt))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((a[k], a[l], b[l], b[k]))
    bot = bm.verts.new(centre(0) - Vector((0, 0, 0.06)))
    top = bm.verts.new(centre(1) + Vector((0, 0, 0.02)))
    for k in range(sides):
        l = (k + 1) % sides
        bm.faces.new((rings[0][l], rings[0][k], bot))
        bm.faces.new((rings[-1][k], rings[-1][l], top))
    return centre, radius


def hood(bm):
    """Faceless head: a tall, laterally flattened blade crest sweeping up and
    back, with sharp front and back edges and growth ridges like a shell lip."""
    pts = catmull([(0, -0.05, 4.70), (0, -0.12, 5.20), (0, -0.05, 5.70), (0, 0.18, 6.15),
                   (0, 0.55, 6.50), (0, 0.95, 6.70)], 48)
    rk = [0.36, 0.44, 0.46, 0.38, 0.22, 0.03]

    def radius(s):
        x = s * (len(rk) - 1)
        i = min(int(x), len(rk) - 2)
        u = x - i
        return rk[i] + (rk[i + 1] - rk[i]) * u

    def edges(s, a):
        ridge = 1.0 + 0.06 * ((s * 9.0) % 1.0) ** 2
        return (1.0 + 0.22 * abs(math.sin(a)) ** 8) * ridge
    tube(bm, pts, radius, 28, side_axis=X, squash=0.30, rmod=edges)
    return pts


LEG_AZ = (-60, -25, 15, 50, 240, 205, 165, 130)


def legs(bm, centre, radius, rng):
    feet = []
    for i, az in enumerate(LEG_AZ):
        a = math.radians(az)
        rad = Vector((math.cos(a), math.sin(a), 0))
        back = max(0.0, math.sin(a))          # legs toward +Y (back) a bit longer
        zh = 2.35 + 0.06 * (i % 4)
        c = centre((zh - 1.85) / 3.05)
        r = radius((zh - 1.85) / 3.05)
        H = c + Vector((rad.x * r * 0.85, rad.y * r * 0.66, 0))
        Kn = H + rad * (0.85 + 0.20 * back) + Vector((0, 0, 1.05 + 0.15 * rng.random()))
        A = H + rad * (1.45 + 0.25 * back) + Vector((0, 0, -H.z + 0.60))
        F = H + rad * (1.60 + 0.30 * back) + Vector((0, 0, -H.z + 0.0))
        pts = catmull([H, H + rad * 0.35 + Vector((0, 0, 0.60)), Kn, A, F], 38)

        def rfn(s):
            return (0.062 * (1 - s) ** 0.6 + 0.010 + 0.020 * math.exp(-((s - 0.40) / 0.035) ** 2)
                    + 0.012 * math.exp(-((s - 0.78) / 0.03) ** 2))
        tube(bm, pts, rfn, 8)
        feet.append(F)
    return feet


def tendrils(bm, centre, radius, rng):
    out = []
    n = 14
    for i in range(n):
        a = 2 * math.pi * (i + rng.uniform(-0.3, 0.3)) / n
        t = rng.uniform(0.03, 0.13)
        c, r = centre(t), radius(t)
        root = c + Vector((math.cos(a) * r * 0.8, math.sin(a) * r * 0.62, 0))
        L = rng.uniform(0.9, 1.5)
        outv = Vector((math.cos(a), math.sin(a), 0))
        sway = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * 0.12
        pts = [root + outv * (0.18 * s) + sway * math.sin(math.pi * s) + Vector((0, 0, -L * s))
               for s in (i / 17 for i in range(18))]
        tube(bm, pts, lambda s: 0.026 * (1 - s) ** 0.8 + 0.004, 6)
        out.append(pts[-1])
    return out


def hanging_limbs(bm, centre, radius, rng, n=12):
    """Thin jointed limbs hanging from the chest and shoulders (folded, at rest)."""
    for i in range(n):
        side = -1 if i % 2 else 1
        t = rng.uniform(0.55, 0.88)
        c, r = centre(t), radius(t)
        a = math.radians(rng.uniform(-150, -30)) if i < n - 4 else math.radians(rng.uniform(20, 160))
        root = c + Vector((math.cos(a) * r * 0.9, math.sin(a) * r * 0.7, 0))
        outv = Vector((math.cos(a), math.sin(a), 0))
        L = rng.uniform(1.6, 2.6)
        j1 = root + outv * rng.uniform(0.25, 0.45) + Vector((0, 0, -L * 0.30))
        j2 = j1 + outv * rng.uniform(-0.1, 0.25) + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.2, 0.1), -L * 0.40))
        tip = j2 + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.25, 0.05), -L * 0.30))
        pts = catmull([root, j1, j2, tip], 26)
        tube(bm, pts, lambda s: 0.030 * (1 - s) ** 0.7 + 0.005 + 0.010 * math.exp(-((s - 0.42) / 0.04) ** 2), 6)


def arm(bm, pts_ctrl, n=50, r0=0.08):
    pts = catmull(pts_ctrl, n)

    def rfn(s):
        return (r0 * (1 - s) ** 0.7 + 0.006 + 0.018 * math.exp(-((s - 0.36) / 0.04) ** 2)
                + 0.010 * math.exp(-((s - 0.70) / 0.035) ** 2))
    tube(bm, pts, rfn, 8)
    return pts


DRAW_ARM = [(0.36, -0.30, 4.35), (0.82, -0.62, 4.62), (1.06, -1.20, 4.42), (0.82, -1.98, 4.55),
            (0.52, -2.66, 4.92), (0.42, -2.88, 5.06)]
REST_ARM = [(-0.36, -0.30, 4.35), (-0.70, -0.60, 3.95), (-0.86, -0.78, 3.50), (-0.72, -1.00, 2.70),
            (-0.58, -1.22, 2.10), (-0.52, -1.30, 1.92)]


# ------------------------------------------------------------------ sails

def spine_path(root, d, L, sweep, n=16):
    return [root + d * L * s + sweep * L * s * s for s in (i / (n - 1) for i in range(n))]


def sail_spines(kind, side=1):
    """List of spine polylines (each n points from root outward)."""
    sp = []
    if kind == "great":
        root = Vector((0.32 * side, 0.30, 4.55))
        out = X * side
        n = 9
        for k in range(n):
            th = math.radians(-35 + 115 * k / (n - 1))
            d = (out * math.cos(th) + Z * math.sin(th) + Y * (0.35 + 0.2 * math.sin(th))).normalized()
            L = 2.4 + 1.5 * math.sin(math.pi * (k + 0.5) / n)
            sweep = (Y * 0.40 - Z * 0.18 + out * 0.05) * 0.35
            sp.append(spine_path(root, d, L, sweep))
        return root, sp
    if kind == "dorsal":
        n = 7
        root = Vector((0.0, 0.40, 3.30))
        for k in range(n):
            r = Vector((0.0, 0.40 + 0.03 * k, 3.25 + 0.24 * k))
            d = (Y * 0.85 + Z * (0.25 + 0.16 * k)).normalized()
            L = 1.4 + 1.1 * math.sin(math.pi * (k + 0.5) / n)
            sp.append(spine_path(r, d, L, (Y * 0.25 - Z * 0.12) * 0.4))
        return root, sp
    # hip fin
    root = Vector((0.40 * side, 0.20, 2.55))
    out = X * side
    n = 5
    for k in range(n):
        th = math.radians(-65 + 70 * k / (n - 1))
        d = (out * math.cos(th) + Z * math.sin(th) + Y * 0.45).normalized()
        L = 0.85 + 0.45 * math.sin(math.pi * (k + 0.5) / n)
        sp.append(spine_path(root, d, L, (Y * 0.3 - Z * 0.2) * 0.3))
    return root, sp


def membrane(spines, M=5, ns=14, s0=0.05, scallop=0.10, billow=0.05):
    """Grid surface across the fan between spines; scalloped outer edge."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    nsp = len(spines)
    ncol = (nsp - 1) * M + 1
    n = len(spines[0])

    def at(sp, s):
        x = s * (n - 1)
        i = min(int(x), n - 2)
        u = x - i
        return sp[i].lerp(sp[i + 1], u)

    grid = []
    for r in range(ns):
        s = s0 + (1 - s0) * r / (ns - 1)
        row = []
        for c in range(ncol):
            k, m = min(c // M, nsp - 2), (c - min(c // M, nsp - 2) * M)
            f = m / M
            sc = s * (1 - scallop * math.sin(math.pi * f) * (s ** 3))
            a, b = at(spines[k], sc), at(spines[k + 1], sc)
            p = a.lerp(b, f)
            ds = (at(spines[k], min(sc + 0.02, 1)) - at(spines[k], max(sc - 0.02, 0)))
            nrm = (b - a).cross(ds)
            if nrm.length > 1e-9:
                p += nrm.normalized() * billow * math.sin(math.pi * f) * math.sin(math.pi * s)
            row.append((bm.verts.new(p), (c / (ncol - 1), (s - s0) / (1 - s0))))
        grid.append(row)
    for r in range(ns - 1):
        for c in range(ncol - 1):
            q = (grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c])
            f = bm.faces.new([x[0] for x in q])
            for loop, (_, uv) in zip(f.loops, q):
                loop[uvl].uv = uv
    return bm


def set_origin(obj, pivot):
    obj.data.transform(Matrix.Translation(-Vector(pivot)))
    obj.location = pivot


# ------------------------------------------------------------------ materials

def body_master_material():
    bmat = K.BakeMaterial("H_GuestBody")
    k = bmat.k
    co = k.coord("Object")
    sep = k.sepxyz(co)
    bands = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z")
    k.link(co, bands.inputs["Vector"])
    bands.inputs["Scale"].default_value = 3.0
    bands.inputs["Distortion"].default_value = 3.0
    bands.inputs["Detail"].default_value = 3.0
    hue_n = k.noise(co, 1.6, 3.0, 0.5)
    cell = k.voronoi(co, 18.0, feature="F1", out="Color")
    cell_v = k.sepxyz(cell)[0]
    # iridescent pastel drift: three phase-shifted cosines of one hue field
    hue = k.math("ADD", k.math("MULTIPLY", hue_n, 6.0), k.math("MULTIPLY", bands.outputs["Fac"], 2.5))
    comb = k.new("ShaderNodeCombineColor")
    for i, ph in enumerate((0.0, 2.094, 4.189)):
        c_ = k.math("COSINE", k.math("ADD", hue, ph))
        k.link(k.math("ADD", 1.0, k.math("MULTIPLY", c_, 0.15)), comb.inputs[i])
    base = k.mix(k.maprange(cell_v, 0.0, 1.0, 0.0, 0.25), (0.66, 0.67, 0.70), (0.84, 0.85, 0.87))
    col = k.mix(1.0, base, comb.outputs["Color"], blend="MULTIPLY")
    crev = k.maprange(k.ao(0.06), 0.35, 0.95, 0.70, 0.0)
    col = k.mix(crev, col, (0.20, 0.21, 0.25))
    low = k.maprange(sep[2], 0.0, 1.2, 1.0, 0.0)
    col = k.mix(k.math("MULTIPLY", low, 0.4), col, (0.32, 0.33, 0.36))
    rough = k.math("ADD", k.maprange(cell_v, 0.0, 1.0, 0.16, 0.30), k.math("MULTIPLY", crev, 0.25), clamp=True)
    bmat.set(col, rough, 0.0)
    return bmat


def membrane_texture(n, seed):
    """Fin membrane: elongated cells (wing venation), pearly iridescent tint,
    sparkle points; alpha low in the cells, high on the veins. RGBA, Blender
    pixel order (bottom-up)."""
    import numpy as np
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n] / n          # yy = v (radial), xx = u (across fan)
    # jittered grid of seeds, denser toward the outer edge
    gx, gy = 34, 22
    best1 = np.full((n, n), 9.0)
    best2 = np.full((n, n), 9.0)
    sx, sy = 1.0, 1.6                         # anisotropy: cells elongated radially
    jit = rng.uniform(0, 1, (gy, gx, 2))
    for j in range(gy):
        for i in range(gx):
            px, py = (i + jit[j, i, 0]) / gx, (j + jit[j, i, 1]) / gy
            d = np.sqrt(((xx - px) * sx * gx) ** 2 + ((yy - py) * sy * gy / 1.6) ** 2)
            closer = d < best1
            best2 = np.where(closer, best1, np.minimum(best2, d))
            best1 = np.where(closer, d, best1)
    edge = best2 - best1
    vein = np.clip(1.0 - edge / 0.085, 0, 1) ** 2
    rim = np.clip((yy - 0.93) / 0.07, 0, 1)
    root = np.clip(1 - yy / 0.08, 0, 1)
    alpha = 0.16 + 0.10 * yy + 0.62 * vein + 0.45 * rim + 0.5 * root
    hue = 2 * np.pi * (xx * 1.3 + yy * 0.8)
    lum = 0.78 + 0.12 * vein
    tint = 0.10
    rgb = np.stack([lum * (1 + tint * np.cos(hue)), lum * (1 + tint * np.cos(hue - 2.094)),
                    lum * (1 + tint * np.cos(hue + 2.094))], -1)
    sp = rng.uniform(0, 1, (n, n)) > 0.9985
    rgb[sp] = 1.0
    alpha = np.where(sp, 1.0, alpha)
    return np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], -1)


# ------------------------------------------------------------------ build

def build_geometry(stats, clock):
    rng = random.Random(SEED)
    sc = K.reset_scene()
    work = K.new_collection("Work")
    m_body = body_master_material()
    m_core = K.mat_simple("M_Guest_Core", (0.86, 0.93, 1.0), rough=0.08,
                          emit=(0.62, 0.82, 1.0), emit_strength=2.5)
    m_core.use_backface_culling = True
    m_memb = K.mat_simple("tmp_membrane", (0.85, 0.88, 0.95), rough=0.2, alpha=0.35)
    m_memb.use_backface_culling = False

    clock.start("model")
    bm = bmesh.new()
    centre, radius = torso(bm, rng)
    hood_pts = hood(bm)
    feet = legs(bm, centre, radius, rng)
    tends = tendrils(bm, centre, radius, rng)
    hanging_limbs(bm, centre, radius, rng)
    arm(bm, REST_ARM, r0=0.075)
    spines_all = {}
    for name, kind, side in (("sail_l", "great", -1), ("sail_r", "great", 1), ("sail_dorsal", "dorsal", 1),
                             ("fin_l", "fin", -1), ("fin_r", "fin", 1)):
        root, sp = sail_spines(kind, side)
        spines_all[name] = (root, sp)
        for s in sp:
            n = len(s)
            tube(bm, s, lambda u, big=(kind != "fin"): (0.040 if big else 0.026) * (1 - u) ** 0.7 + 0.007, 5)
    body = K.bm_object("guest_body", bm, m_body.mat, work)

    bm = bmesh.new()
    draw_pts = arm(bm, DRAW_ARM, r0=0.08)
    arm_obj = K.bm_object("guest_arm_draw", bm, m_body.mat, work)
    tip = draw_pts[-1]
    tip_dir = (draw_pts[-1] - draw_pts[-4]).normalized()

    bm = bmesh.new()
    crystal(bm, tip - tip_dir * 0.02, tip_dir, 0.22, 0.022, 4)
    tipc = K.bm_object("guest_tip_crystal", bm, m_core, work)

    # Emissive crystals: along plate lips, on knees, along spines, a crest at the hood.
    bm = bmesh.new()
    for i in range(70):
        t = rng.uniform(0.12, 0.92)
        a = rng.uniform(0, 2 * math.pi)
        c, r = centre(t), radius(t)
        p = c + Vector((math.cos(a) * r * 1.06, math.sin(a) * r * 0.82, 0))
        nrm = Vector((math.cos(a), math.sin(a) * 1.2, rng.uniform(-0.3, 0.6))).normalized()
        crystal(bm, p, nrm, rng.uniform(0.05, 0.14), rng.uniform(0.012, 0.03), 4, rng.uniform(0, 1))
    for (root, sp) in spines_all.values():
        for s in sp:
            i = int(0.72 * (len(s) - 1))
            p = s[i]
            d = (s[i + 1] - s[i]).normalized()
            crystal(bm, p, d, 0.06, 0.016, 4)
    for i in range(8, 40, 3):
        s_ = hood_pts[i]
        t_ = (hood_pts[i + 1] - hood_pts[i - 1]).normalized()
        back = t_.cross(X).normalized()
        if back.y < 0:
            back = -back
        d = (back + Vector((rng.uniform(-0.25, 0.25), 0, 0.3))).normalized()
        crystal(bm, s_ + back * 0.30, d, rng.uniform(0.14, 0.34), rng.uniform(0.025, 0.05), 5,
                rng.uniform(0, 1))
    for az in LEG_AZ:
        pass
    core = K.bm_object("guest_core", bm, m_core, work)

    membranes = {}
    for name, (root, sp) in spines_all.items():
        big = name.startswith("sail")
        mb = membrane(sp, M=5 if big else 4, ns=14 if big else 10)
        o = K.bm_object(f"guest_{name}", mb, m_memb, work)
        set_origin(o, root)
        membranes[name] = o

    for o in (body, arm_obj):
        K.triangulate_ngons(o)
        K.finish_shading(o, angle=60)
    for o in (core, tipc):
        K.finish_shading(o, flat=True)
    for o in membranes.values():
        K.finish_shading(o, angle=80)
    stats["feet_reach_m"] = round(max(Vector((f.x, f.y, 0)).length for f in feet), 2)
    return {"sc": sc, "work": work, "body": body, "arm": arm_obj, "tipc": tipc, "core": core,
            "membranes": membranes, "m_body": m_body, "m_core": m_core, "m_memb": m_memb,
            "tip": tip, "tip_dir": tip_dir, "hood_top": max(hood_pts, key=lambda p: p.z)}


def studio(sc, col, dark=True):
    K.set_world(sc, (0.10, 0.12, 0.14) if dark else (0.34, 0.38, 0.37), 0.6)
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 3.0
    key.angle = math.radians(5)
    key.color = (1.0, 0.95, 0.88)
    o = K.link(bpy.data.objects.new("Key", key), col)
    o.rotation_euler = (math.radians(50), 0, math.radians(-35))
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = 3.5
    rim.color = (0.75, 0.88, 1.0)
    o = K.link(bpy.data.objects.new("Rim", rim), col)
    o.rotation_euler = (math.radians(65), 0, math.radians(160))
    gm = K.mat_simple("Ground", (0.05, 0.055, 0.06), 0.9)
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=9.0, fill_type="NGON")
    g = bpy.context.object
    g.data.materials.append(gm)
    for c in g.users_collection:
        c.objects.unlink(g)
    col.objects.link(g)
    K.human_proxy(col, (2.9, -1.6, 0.0))


GUEST_VIEWS = {
    "front": ((0, -17.0, 3.3), (0, 0, 3.3), 50),
    "side": ((17.0, 0, 3.3), (0, 0, 3.3), 50),
    "three_quarter": ((10.5, -12.5, 5.0), (0, 0, 3.2), 50),
    "back_three_quarter": ((-10.0, 12.0, 6.0), (0, 0, 3.4), 50),
    "close_head": ((1.6, -3.4, 5.9), (0, -0.2, 5.5), 50),
    "close_sail": ((3.6, -2.2, 4.8), (1.6, 0.9, 5.2), 40),
    "close_tip": ((1.4, -4.6, 4.9), (0.45, -2.9, 4.7), 60),
}


def stage_geo():
    clock = K.StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    objs = build_geometry(stats, clock)
    meshes = [objs["body"], objs["arm"], objs["tipc"], objs["core"]] + list(objs["membranes"].values())
    stats["triangles_by_object"] = {o.name: K.mesh_tris(o) for o in meshes}
    stats["triangles_total"] = sum(stats["triangles_by_object"].values())
    log("tris", json.dumps(stats["triangles_by_object"]), stats["triangles_total"])
    lo, hi = K.world_bounds(meshes)
    stats["bounds"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    clock.start("preview")
    sc = objs["sc"]
    K.use_gpu(sc)
    K.setup_render(sc, 1280, 1280, samples=64)
    env = K.new_collection("Review")
    studio(sc, env)
    out = os.path.join(QA_DIR, "geo")
    os.makedirs(out, exist_ok=True)
    for name in ("front", "side", "three_quarter"):
        loc, tgt, lens = GUEST_VIEWS[name]
        K.render_to(sc, K.add_camera(name, loc, tgt, lens=lens), os.path.join(out, f"guest_geo_{name}.jpg"))
    clock.stop()
    K.write_json(os.path.join(out, "geo-stats.json"), stats)


def stage_build():
    import numpy as np
    clock = K.StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    os.makedirs(TEX_DIR, exist_ok=True)
    objs = build_geometry(stats, clock)
    sc = objs["sc"]
    stats["cycles_device"] = K.use_gpu(sc)
    sc.render.engine = "CYCLES"
    body, arm_obj, work = objs["body"], objs["arm"], objs["work"]
    m_body = objs["m_body"]

    clock.start("uv_unwrap")
    K.smart_uv(body, margin=0.003, angle=66)
    K.smart_uv(arm_obj, margin=0.003, angle=66)
    K.pack_uvs_multi([body, arm_obj], margin=0.003)

    clock.start("master_highpoly")
    masters = []
    for src in (body, arm_obj):
        m = K.duplicate(src, src.name + "_master", work)
        s1 = m.modifiers.new("smooth", "SUBSURF")
        s1.levels = s1.render_levels = 1
        K.apply_modifiers(m)
        b2 = bmesh.new()
        b2.from_mesh(m.data)
        for _ in range(6):
            long_edges = [e for e in b2.edges if e.calc_length() > MASTER_EDGE]
            if not long_edges:
                break
            bmesh.ops.subdivide_edges(b2, edges=long_edges, cuts=1, use_grid_fill=True)
        b2.to_mesh(m.data)
        b2.free()
        s2 = m.modifiers.new("dense", "SUBSURF")
        s2.subdivision_type = "SIMPLE"
        s2.levels = s2.render_levels = 2
        for nm, tt, scale, strength, extra in (
                ("facets", "VORONOI", 0.014, 0.0016, {}),
                ("growth", "CLOUDS", 0.020, 0.0014, {"noise_depth": 2}),
                ("pits", "DISTORTED_NOISE", 0.004, 0.0005, {"distortion": 2.0})):
            tex = bpy.data.textures.new(f"{nm}_{src.name}", tt)
            tex.noise_scale = scale
            for k_, v in extra.items():
                setattr(tex, k_, v)
            d = m.modifiers.new(nm, "DISPLACE")
            d.texture, d.texture_coords, d.strength, d.mid_level = tex, "LOCAL", strength, 0.5
        m.data.materials.clear()
        m.data.materials.append(m_body.mat)
        masters.append(m)
    dg = bpy.context.evaluated_depsgraph_get()
    mt = 0
    for m in masters:
        em = m.evaluated_get(dg).to_mesh()
        em.calc_loop_triangles()
        mt += len(em.loop_triangles)
        m.evaluated_get(dg).to_mesh_clear()
    stats["master_triangles"] = mt
    log("master tris", mt)

    clock.start("bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    world = K.set_world(sc, (0, 0, 0), 0.0)
    world.light_settings.distance = 0.25
    target = K.BakeMaterial("bake_guest_target")
    target.set((0.5, 0.5, 0.5), 0.5)
    for o in (body, arm_obj):
        o.data.materials.clear()
        o.data.materials.append(target.mat)
    for o in [objs["core"], objs["tipc"]] + list(objs["membranes"].values()):
        o.hide_render = True
    imgs = {}
    times = {}
    for key, kind, spp, channel in (("normal", "NORMAL", 16, "bsdf"), ("color", "EMIT", 32, "color"),
                                    ("rough", "EMIT", 16, "rough"), ("ao", "AO", 384, "bsdf")):
        img = K.new_float_image(f"bake_guest_{key}", BAKE, data=(key != "color"))
        imgs[key] = img
        m_body.route(channel)
        target.aim(img, "UVMap")
        t = 0.0
        for i, (tgt, mst) in enumerate(zip((body, arm_obj), masters)):
            sc.render.bake.use_clear = (i == 0)
            if kind == "AO":
                for m in masters:
                    m.hide_render = True
                t += K.bake(sc, "AO", [tgt], tgt, spp)
                for m in masters:
                    m.hide_render = False
            else:
                extra = {"normal_space": "TANGENT"} if kind == "NORMAL" else {}
                t += K.bake(sc, kind, [mst, tgt], tgt, spp, selected_to_active=True,
                            cage_extrusion=0.012, max_ray_distance=0.03, **extra)
        times[key] = {"seconds": round(t, 2), "samples": spp, "size": BAKE}
    m_body.route("bsdf")
    stats["bakes"] = times

    clock.start("textures")
    f = BAKE // TEX
    P = {k_: K.downsample(K.pixels(v), f)[..., :3] for k_, v in imgs.items()}
    paths = {
        "base": K.save_img(K.to_srgb(P["color"]), os.path.join(TEX_DIR, "guest_basecolor.jpg"), 92),
        "orm": K.save_img(np.stack([P["ao"][..., 0], P["rough"][..., 0], np.zeros_like(P["ao"][..., 0])], -1),
                          os.path.join(TEX_DIR, "guest_orm.jpg"), 92),
        "normal": K.save_img(K.normal_to_rgb(P["normal"]), os.path.join(TEX_DIR, "guest_normal.png")),
    }
    mt_ = membrane_texture(MEMBRANE_TEX, SEED + 3)
    mt_[..., :3] = K.to_srgb(mt_[..., :3])
    paths["membrane"] = K.save_img(mt_, os.path.join(TEX_DIR, "guest_membrane.png"))
    stats["texture_files"] = {k_: {"file": os.path.relpath(v, REPO).replace("\\", "/"),
                                   "bytes": os.path.getsize(v)} for k_, v in paths.items()}

    clock.start("materials")
    L = {k_: K.load_image(v, data=k_ in ("orm", "normal")) for k_, v in paths.items()}
    m_final = K.pbr_material("M_Guest_Body", base=L["base"], orm=L["orm"], normal=L["normal"])
    m_memb = K.pbr_material("M_Guest_Membrane", base=L["membrane"], base_alpha=True, rough=0.22, metal=0.0,
                            emissive=L["membrane"], emissive_strength=0.12)
    K.set_blended(m_memb)
    m_memb.use_backface_culling = False
    m_final.use_backface_culling = True
    for o in (body, arm_obj):
        o.data.materials.clear()
        o.data.materials.append(m_final)
    for o in objs["membranes"].values():
        o.data.materials.clear()
        o.data.materials.append(m_memb)
        o.hide_render = False
    for o in (objs["core"], objs["tipc"]):
        o.hide_render = False
    for m in masters:
        bpy.data.objects.remove(m)

    clock.start("assemble_export")
    out = K.new_collection("Export")
    root = K.link(bpy.data.objects.new("guest", None), out)
    shoulder = Vector(DRAW_ARM[0])
    arm_full = K.join([arm_obj, objs["tipc"]], "guest_arm_draw")
    set_origin(arm_full, shoulder)
    parts = [objs["body"], arm_full, objs["core"]] + list(objs["membranes"].values())
    for o in parts:
        for c in o.users_collection:
            c.objects.unlink(o)
        out.objects.link(o)
        o.parent = root
    tip = objs["tip"] + objs["tip_dir"] * 0.20
    s_tip = K.socket("socket_draw_tip", tip, out, note="tip of the drawing stylus; child of guest_arm_draw",
                     tip_dir_gltf=K.blender_to_gltf(objs["tip_dir"]))
    s_tip.parent = arm_full
    s_tip.matrix_parent_inverse = arm_full.matrix_world.inverted()
    s_head = K.socket("socket_head", objs["hood_top"], out, note="top of the crest hood")
    s_core = K.socket("socket_core", (0.0, -0.15, 3.6), out, note="chest centre (glow/VFX anchor)")
    for s in (s_head, s_core):
        s.parent = root
    stats["triangles_by_object"] = {o.name: K.mesh_tris(o) for o in parts}
    stats["triangles_total"] = sum(stats["triangles_by_object"].values())
    stats["materials"] = sorted({s.material.name for o in parts for s in o.material_slots})
    lo, hi = K.world_bounds(parts)
    stats["bounds_blender_zup"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    stats["height_m"] = round(hi.z - lo.z, 3)
    stats["sockets_gltf"] = {"socket_draw_tip": K.blender_to_gltf(tip),
                             "socket_head": K.blender_to_gltf(objs["hood_top"]),
                             "socket_core": K.blender_to_gltf((0.0, -0.15, 3.6))}
    K.select_only([root] + parts + [s_tip, s_head, s_core], root)
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_tangents=True,
                              export_extras=True, export_image_format="AUTO",
                              export_animations=False, export_cameras=False, export_lights=False)
    irid = {"iridescenceFactor": 1.0, "iridescenceIor": 1.35,
            "iridescenceThicknessMinimum": 220, "iridescenceThicknessMaximum": 460}
    stats["glb_patched_extensions"] = K.patch_materials(GLB_PATH, {
        "M_Guest_Body": {"KHR_materials_iridescence": dict(irid, iridescenceFactor=0.7)},
        "M_Guest_Membrane": {"KHR_materials_iridescence": irid},
    })
    stats["glb_bytes"] = os.path.getsize(GLB_PATH)
    stats["glb_summary"] = K.glb_summary(GLB_PATH)
    clock.stop()
    stats["budget_ok"] = {"triangles": stats["triangles_total"] <= TRI_BUDGET,
                          "materials": len(stats["materials"]) <= 3,
                          "height_5_to_7_m": 5.0 <= stats["height_m"] <= 7.0,
                          "no_animations": stats["glb_summary"]["animations"] == 0}
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)
    K.write_json(STATS_PATH, stats)
    log("stats", json.dumps({k_: v for k_, v in stats.items() if k_ != "glb_summary"}))


def stage_render(samples=512):
    clock = K.StageClock()
    clock.start("qa_renders")
    sc = K.reset_scene()
    K.setup_render(sc, 1600, 1600, samples=samples)
    device = K.use_gpu(sc)
    env = K.new_collection("Review")
    studio(sc, env)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    out = os.path.join(QA_DIR, "final")
    os.makedirs(out, exist_ok=True)
    timings = {}
    for name, (loc, tgt, lens) in GUEST_VIEWS.items():
        timings[name] = K.render_to(sc, K.add_camera(name, loc, tgt, lens=lens),
                                    os.path.join(out, f"guest_{name}.jpg"))
    # Parts overlay: membranes tinted per part, to show separable primitives.
    objs = {o.name: o for o in bpy.context.scene.objects}
    tints = {"guest_sail_l": (0.9, 0.2, 0.2), "guest_sail_r": (0.2, 0.5, 0.95), "guest_sail_dorsal": (0.2, 0.85, 0.3),
             "guest_fin_l": (0.95, 0.75, 0.1), "guest_fin_r": (0.8, 0.2, 0.9), "guest_arm_draw": (1.0, 0.45, 0.1)}
    for n, c in tints.items():
        if n in objs:
            m = K.mat_simple(f"tint_{n}", c, 0.5, alpha=0.75 if "arm" not in n else 1.0)
            objs[n].data.materials.clear()
            objs[n].data.materials.append(m)
    loc, tgt, lens = GUEST_VIEWS["three_quarter"]
    timings["parts_overlay"] = K.render_to(sc, K.add_camera("parts", loc, tgt, lens=lens),
                                           os.path.join(out, "guest_parts_overlay.jpg"))
    clock.stop()
    K.write_json(os.path.join(out, "render-stats.json"),
                 {"device": device, "resolution": [1600, 1600], "samples": samples,
                  "seconds_per_render": timings, "stages": clock.stages,
                  "note": "Studio lights, ground disc and 1.75 m human proxy are review-only."})


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"geo": stage_geo, "build": stage_build, "render": stage_render,
     "all": lambda: (stage_build(), stage_render())}[stage]()
