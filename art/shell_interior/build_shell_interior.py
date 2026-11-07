"""Procedural source for shell_interior.glb (Forget to Foresee: inside one Shell).

Run with Blender 4.5 LTS:

    blender -b -P art/shell_interior/build_shell_interior.py -- geo     # geometry + closure checks + previews
    blender -b -P art/shell_interior/build_shell_interior.py -- build   # + GPU bakes, export, validation
    blender -b -P art/shell_interior/build_shell_interior.py -- render  # QA renders of the exported .glb
    blender -b -P art/shell_interior/build_shell_interior.py -- all     # build + render

Design (original, owner concept 07.11; nothing from the film Arrival):
a spiralling nacre hall. The walls and vault are one surface of layered growth
ribs: each rib has a broad face turned to the entrance and a rolled lip that
overhangs toward the glass; the ribs lean along a gentle helix, so the hall reads
as the inside of a seashell chamber. Dark cracked stone floor with small amber
floor-light inserts. The far end wall holds the 12 x 7 m `logogram_glass` panel;
behind it a closed fog chamber where three Guests stand. The entrance is a
raised portal with a vestibule (sealed iris door) and stairs down to the floor.

Closed volume: hall + vestibule + Guest chamber form ONE closed 2-manifold
boundary surface (normals inward). The glass is an interior partition inside the
window reveal. Closure is checked programmatically (non-manifold edges, inward
orientation, ray escape tests from inside) on the generated mesh and again on
the exported .glb after re-import.

Blender is Z-up, entrance at -Y, glass at +Y. glTF: Y-up, entrance toward +Z.
Pivot: hall floor centre (floor at z = 0). Units: metres.
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
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import blender_kit as K  # noqa: E402
from blender_kit import log  # noqa: E402

K.set_tag("interior")

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "shell_interior")
TEX_DIR = os.path.join(HERE, "textures")
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", "shell_interior.glb")
GUEST_GLB = os.path.join(REPO, "game", "public", "assets", "models", "guest.glb")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")
BLEND_PATH = os.path.join(HERE, "shell_interior.blend")

SEED = 7011
TRI_BUDGET = 160000          # brief x2 (owner decision 07.11, min spec RTX 2060 Super)

# Hall
Y0, Y1 = -10.0, 10.0          # entrance wall plane, glass wall plane
SEC_A, SEC_B, SEC_ZC, SEC_EXP = 7.6, 8.5, 4.0, 2.6   # superellipse cross-section
NCOL = 160                    # columns across the wall arch
NFLOOR = 28                   # floor columns
WIDEN = (0.93, 1.0)           # x scale of the section at entrance / glass
RIB_MARGIN = 0.8              # flat wall before the first and after the last rib
RIB_KMAX = 1.6                # helical lean of the ribs (m of y shift per unit of arc param)
TILE = 2.4                    # nacre tiling texture size in metres

# End wall openings (x, z in the wall plane)
GLASS_HW, GLASS_Z0, GLASS_Z1, GLASS_R = 6.0, 0.45, 7.45, 0.5
GLASS_C = (0.0, 3.95)
FRAME_Y = Y1 + 0.45           # recessed stone frame face
WIN_Y0, WIN_Y1 = Y1 + 0.55, Y1 + 1.15   # window reveal
GLASS_Y = Y1 + 0.75
CHAMBER_Y = WIN_Y1
PORTAL_HW, PORTAL_Z0, PORTAL_ZS = 2.15, 1.2, 3.85     # tombstone arch, top z = ZS + HW
PORTAL_C = (0.0, 3.3)
VEST_DEPTH = 3.4
CHAMBER_HW, CHAMBER_Z0, CHAMBER_Z1, CHAMBER_R, CHAMBER_DEPTH = 9.0, -0.3, 13.7, 2.5, 14.0
LANDING_Z = PORTAL_Z0
STAIR_W = 2.3                 # half width
STEP_RISE, STEP_RUN, N_STEPS = 0.15, 0.40, 8
LANDING_Y1 = Y0 + 1.2

BAKE_STONE = 8192             # baked at 8k, box-downsampled to 4k
TEX_STONE = 4096
AO_NACRE = 4096
TILE_RES = 2048

NACRE, STONE = 0, 1


# ------------------------------------------------------------------ helpers

def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def section_points():
    """Arch from the right floor edge over the vault to the left floor edge,
    resampled to NCOL+1 points by arc length. Returns (pts, normals, arc, total)."""
    import numpy as np
    e = 2.0 / SEC_EXP
    t0 = math.asin(-(SEC_ZC / SEC_B) ** (SEC_EXP / 2))
    ts = np.linspace(t0, math.pi - t0, 20001)
    c, s = np.cos(ts), np.sin(ts)
    x = SEC_A * np.sign(c) * np.abs(c) ** e
    z = SEC_ZC + SEC_B * np.sign(s) * np.abs(s) ** e
    z[0] = z[-1] = 0.0
    cum = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(x), np.diff(z)))])
    tgt = np.linspace(0, cum[-1], NCOL + 1)
    xs, zs = np.interp(tgt, cum, x), np.interp(tgt, cum, z)
    pts = [Vector((float(a), float(b))) for a, b in zip(xs, zs)]
    nrm = []
    total = float(cum[-1])
    for j in range(NCOL + 1):
        p0, p1 = pts[max(j - 1, 0)], pts[min(j + 1, NCOL)]
        d = (p1 - p0).normalized()
        n = Vector((-d.y, d.x))                       # left of travel = inward
        dist = min(tgt[j], total - tgt[j])
        n.y *= smoothstep(0.0, 0.6, dist)             # horizontal at the floor edge
        nrm.append(n.normalized())
    return pts, nrm, [float(v) for v in tgt], total


def rrect(hw, z0, z1, r, n=10):
    """Rounded rectangle outline (x, z), counter-clockwise."""
    out = []
    for cx, cz, a0 in ((hw - r, z0 + r, -90), (hw - r, z1 - r, 0), (-hw + r, z1 - r, 90),
                       (-hw + r, z0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            out.append(Vector((cx + r * math.cos(a), cz + r * math.sin(a))))
    return out


def tombstone(hw, z0, zs, n=48, corner=0.12):
    out = [Vector((-hw + corner, z0)), Vector((hw - corner, z0)), Vector((hw, z0 + corner))]
    for i in range(n + 1):
        a = math.pi * i / n
        out.append(Vector((hw * math.cos(a), zs + hw * math.sin(a))))
    out.append(Vector((-hw, z0 + corner)))
    return out


def ray_poly(c, phi, poly):
    d = Vector((math.cos(phi), math.sin(phi)))
    best = None
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        e = q - p
        den = d.x * (-e.y) - d.y * (-e.x)
        if abs(den) < 1e-12:
            continue
        w = p - c
        t = (w.x * (-e.y) - w.y * (-e.x)) / den
        s = (d.x * w.y - d.y * w.x) / den
        if t > 1e-9 and -1e-9 <= s <= 1 + 1e-9 and (best is None or t < best):
            best = t
    return c + d * best


class Builder:
    """Boundary surface in one bmesh, with a per-face part tag and metre UVs."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.uv_ao = self.bm.loops.layers.uv.new("UV_AO")
        self.tag = self.bm.faces.layers.int.new("part")
        self.zone = self.bm.faces.layers.int.new("zone")

    def verts(self, pts):
        return [self.bm.verts.new(p) for p in pts]

    def grid(self, rows, tag, closed=False, uv_fn=None, zone=0):
        """Quads between consecutive rows of BMVerts. UVs in metres: u = distance
        along the row, v = distance across rows (or uv_fn(vert) -> (u, v))."""
        nr, nc = len(rows), len(rows[0])
        ncu = nc + 1 if closed else nc
        U, V = [], []
        for row in rows:
            u = [0.0]
            for j in range(1, ncu):
                u.append(u[-1] + (row[j % nc].co - row[j - 1].co).length)
            U.append(u)
        V = [[0.0] * ncu]
        for i in range(1, nr):
            V.append([V[-1][j] + (rows[i][j % nc].co - rows[i - 1][j % nc].co).length
                      for j in range(ncu)])
        faces = []
        for i in range(nr - 1):
            for j in range(ncu - 1):
                j2 = j + 1
                idx = ((i, j), (i, j2), (i + 1, j2), (i + 1, j))
                vs, uvs = [], []
                for (a, b) in idx:
                    v = rows[a][b % nc]
                    if v in vs:
                        continue
                    vs.append(v)
                    uvs.append(uv_fn(v) if uv_fn else (U[a][b], V[a][b]))
                if len(vs) < 3:
                    continue
                f = self.bm.faces.new(vs)
                f[self.tag] = tag if not callable(tag) else tag(f)
                f[self.zone] = zone
                for loop, c in zip(f.loops, uvs):
                    loop[self.uv].uv = c
                    loop[self.uv_ao].uv = c
                faces.append(f)
        return faces


# ------------------------------------------------------------------ geometry

RIB_ROWS = 15


def rib_profile(idx, p, h):
    """One growth rib in (along, inward) coordinates: a plump elliptical face
    turned to the entrance, a thick rolled lip, and
    an underside running back to the next groove at `p`. No undercut hook:
    an offline test showed a hook folds when the profile flattens near the floor."""
    top = 0.72 * p
    rho = min(0.33 * h, 0.2 * p)
    if idx < 6:                                   # broad face, phi 180 -> 105 deg
        phi = math.radians(180 - 15 * idx)
        return top + top * math.cos(phi), h * math.sin(phi)
    if idx < 13:                                  # lip roll, 90 -> -90 deg
        ang = math.radians(90 - 30 * (idx - 6))
        return top + rho * math.cos(ang), h - rho + rho * math.sin(ang)
    bot = (top, h - 2 * rho)                      # underside back to the next groove
    f = (idx - 12) / 3.0
    return bot[0] + (p - bot[0]) * f, bot[1] * (1 - f) ** 1.15


def build_hall(B, rng):
    """Walls/vault (nacre) and floor (stone) of the hall. Returns end loops."""
    pts, nrm, arc, total = section_points()
    # Rib rows along the hall: (a_base, pitch, height, index in rib or -1 for flat).
    span = (Y1 - RIB_MARGIN) - (Y0 + RIB_MARGIN)
    nrib = 14
    w = [rng.uniform(0.75, 1.25) for _ in range(nrib)]
    pitches = [span * x / sum(w) for x in w]
    rows = [(Y0, 0, 0, -1), (Y0 + RIB_MARGIN * 0.5, 0, 0, -1)]
    a = Y0 + RIB_MARGIN
    ribs = []
    for p in pitches:
        h = rng.uniform(0.50, 0.95)
        ph = (rng.uniform(0, 6.283), rng.uniform(0, 6.283))
        ribs.append((h, ph))
        for idx in range(RIB_ROWS):
            rows.append((a, p, len(ribs) - 1, idx))
        a += p
    rows += [(Y1 - RIB_MARGIN, 0, 0, -1), (Y1 - RIB_MARGIN * 0.5, 0, 0, -1), (Y1, 0, 0, -1)]

    def K_shear(y):
        return RIB_KMAX * smoothstep(Y0, Y0 + 4.0, y) * smoothstep(Y1, Y1 - 4.0, y)

    cols = []
    for j in range(NCOL + 1):
        q = arc[j] / total
        dist = min(arc[j], total - arc[j])
        cols.append({
            "qs": (2 * q - 1) + 0.18 * math.sin(2 * math.pi * q),
            "amp": 0.45 + 0.55 * smoothstep(0.0, 1.6, dist),
            "c": smoothstep(0.05, 0.9, dist),
            "q": q,
        })

    W = []
    max_in = [0.0] * (NCOL + 1)
    cm = [0.0] * (NCOL + 1)
    for (a_base, p, k, idx) in rows:
        row = []
        for j in range(NCOL + 1):
            cj = cols[j]
            da, dr = 0.0, 0.0
            if idx == 0:
                cm[j] = -1e9
            if idx >= 0:
                h0, (p1, p2) = ribs[k]
                h = h0 * cj["amp"] * (1 + 0.20 * math.sin(2 * math.pi * 1.5 * cj["q"] + p1)
                                      + 0.10 * math.sin(2 * math.pi * 3.7 * cj["q"] + p2))
                da, dr = rib_profile(idx, p, h)
                # near the floor: first drop the lip overhang (running max keeps rows
                # monotonic), then flatten toward an even spacing so the floor edge
                # never folds
                cm[j] = max(cm[j], da)
                o = smoothstep(0.6, 0.95, cj["c"])
                da = o * da + (1 - o) * cm[j]
                da = cj["c"] * da + (1 - cj["c"]) * (p * idx / RIB_ROWS)
            y = a_base + da
            y += K_shear(y) * cj["qs"]
            u = min(max((y - Y0) / (Y1 - Y0), 0), 1)
            sx = WIDEN[0] + (WIDEN[1] - WIDEN[0]) * u
            base = Vector((pts[j].x * sx, pts[j].y))
            pos = base + nrm[j] * dr
            if j in (0, NCOL):
                pos.y = 0.0
            row.append(Vector((pos.x, y, pos.y)))
            max_in[j] = max(max_in[j], dr)
        W.append(row)

    Wv = [B.verts(r) for r in W]
    walls = B.grid(Wv, NACRE, zone=1)
    # Floor rows: from the left edge (j=NCOL) to the right edge (j=0).
    Fv = []
    for i, row in enumerate(Wv):
        L, R = row[NCOL].co, row[0].co
        mids = [B.bm.verts.new(L.lerp(R, m / NFLOOR)) for m in range(1, NFLOOR)]
        Fv.append([row[NCOL]] + mids + [row[0]])
    floor = B.grid(Fv, STONE, uv_fn=lambda v: (v.co.x, v.co.y), zone=2)
    loop0 = Wv[0] + Fv[0][1:-1]
    loop1 = Wv[-1] + Fv[-1][1:-1]
    import statistics
    mid = NCOL // 4
    info_dbg = {"dr_max_by_col_quarter": round(max_in[mid], 3), "dr_max_top": round(max_in[NCOL // 2], 3),
                "sample_col_quarter": [[round(W[i][mid].x, 3), round(W[i][mid].y, 3), round(W[i][mid].z, 3)]
                                       for i in range(2, 2 + RIB_ROWS + 1)]}
    log("rib debug", json.dumps(info_dbg))
    info = {"rows": len(rows), "ribs": nrib, "pitches": [round(p, 3) for p in pitches],
            "rib_heights": [round(r[0], 3) for r in ribs], "wall_faces": len(walls),
            "floor_faces": len(floor)}
    return loop0, loop1, info, (pts, nrm, W)


def angles_of(loop, c):
    return [math.atan2(v.co.z - c[1], v.co.x - c[0]) for v in loop]


def ring(B, xz_a, xz_b, f, y):
    """New ring of verts: lerp between two matched xz lists (Vector2) at depth y
    (a number, or a function of the xz point)."""
    xz = [a.lerp(b, f) for a, b in zip(xz_a, xz_b)]
    return B.verts([Vector((p.x, y(p) if callable(y) else y, p.y)) for p in xz]), xz


def sample_shape(phis, c, poly):
    cc = Vector(c)
    return [ray_poly(cc, phi, poly) for phi in phis]


def end_wall(B, loop, c, outer_shape, y_wall, direction, ridges):
    """Concentric-ridged nacre end wall from the hall loop to `outer_shape`.
    direction +1: wall recedes toward +y (glass end), -1 toward -y (entrance)."""
    phis = angles_of(loop, c)
    xz0 = [Vector((v.co.x, v.co.z)) for v in loop]
    shp = sample_shape(phis, c, outer_shape)
    rows = [loop]
    fs = [0.06, 0.14, 0.20, 0.32, 0.40, 0.52, 0.62, 0.74, 0.84, 1.0]
    for f in fs:
        bump = sum(r[1] for r in ridges if abs(f - r[0]) < 1e-6)
        # ridges fade out toward the floor so no lip overhangs the floor line
        y = (lambda p, f=f, bump=bump: y_wall + direction * (0.35 * f - bump * smoothstep(0.1, 0.9, p.y)))
        vs, _ = ring(B, xz0, shp, f, y)
        rows.append(vs)

    def tag(f):
        cen = f.calc_center_median()
        f.normal_update()
        return STONE if (cen.z < 0.2 and abs(f.normal.z) > 0.5) else NACRE
    B.grid(rows, tag, closed=True, zone=3)
    return rows[-1], phis, shp


def tunnel(B, start_rows_last, phis, c, xz_list, ys, tag, zone, closed=True):
    rows = [start_rows_last]
    for xz, y in zip(xz_list, ys):
        rows.append(B.verts([Vector((p.x, y, p.y)) for p in xz]))
    B.grid(rows, tag, closed=closed, zone=zone)
    return rows[-1]


def build_glass_end(B, loop1):
    c = GLASS_C
    frame_outer = rrect(GLASS_HW + 0.55, 0.12, GLASS_Z1 + 0.55, GLASS_R + 0.4)
    window = rrect(GLASS_HW, GLASS_Z0, GLASS_Z1, GLASS_R)
    window_lip = rrect(GLASS_HW + 0.14, GLASS_Z0 - 0.12, GLASS_Z1 + 0.14, GLASS_R + 0.1)
    last, phis, shp_outer = end_wall(B, loop1, c, frame_outer, Y1, +1,
                                     ridges=[(0.14, 0.16), (0.40, 0.13), (0.62, 0.10), (0.84, 0.06)])
    s_lip = sample_shape(phis, c, window_lip)
    s_win = sample_shape(phis, c, window)
    # Stone frame: recessed behind the nacre end wall, stepped lip, window reveal.
    last = tunnel(B, last, phis, c, [shp_outer, s_lip, s_lip, s_win, s_win],
                  [FRAME_Y, FRAME_Y, WIN_Y0, WIN_Y0, WIN_Y1], STONE, zone=4)
    # Guest chamber (nacre): flat front wall, deep room, domed far cap.
    ch = rrect(CHAMBER_HW, CHAMBER_Z0, CHAMBER_Z1, CHAMBER_R)
    s_ch = sample_shape(phis, c, ch)
    yb = CHAMBER_Y
    xz_a = s_win
    rings_xz = [[a.lerp(b, f) for a, b in zip(xz_a, s_ch)] for f in (0.3, 0.65, 1.0)]
    ys = [yb, yb, yb]
    depths = [2.0, 4.5, 7.0, 9.5, 12.0, CHAMBER_DEPTH]
    rings_xz += [s_ch] * len(depths)
    ys += [yb + d for d in depths]
    cc = Vector(c)
    for f, dy in ((0.30, 0.6), (0.6, 1.0), (0.85, 1.2)):
        rings_xz.append([cc.lerp(p, 1 - f) for p in s_ch])
        ys.append(yb + CHAMBER_DEPTH + dy)
    last = tunnel(B, last, phis, c, rings_xz, ys, NACRE, zone=5)
    centre = B.bm.verts.new((c[0], yb + CHAMBER_DEPTH + 1.25, c[1]))
    B.grid([last, [centre] * len(last)], NACRE, closed=True, zone=5)
    return {"window_shape": [list(p) for p in window[:1]]}


def build_entrance(B, loop0):
    c = PORTAL_C
    portal_outer = tombstone(PORTAL_HW + 0.6, PORTAL_Z0 - 0.2, PORTAL_ZS)
    portal = tombstone(PORTAL_HW, PORTAL_Z0, PORTAL_ZS)
    lip = tombstone(PORTAL_HW + 0.14, PORTAL_Z0 - 0.02, PORTAL_ZS)
    last, phis, shp_outer = end_wall(B, loop0, c, portal_outer, Y0, -1,
                                     ridges=[(0.14, 0.14), (0.40, 0.12), (0.62, 0.09), (0.84, 0.05)])
    s_lip = sample_shape(phis, c, lip)
    s_por = sample_shape(phis, c, portal)
    yo = Y0 - 0.35
    last = tunnel(B, last, phis, c, [shp_outer, shp_outer, s_lip, s_lip, s_por, s_por],
                  [yo + 0.10, Y0 + 0.05, Y0 + 0.05, Y0 - 0.02, Y0 - 0.02, Y0 - 0.6],
                  STONE, zone=6)
    # Vestibule: small growth ribs, then a sealed iris door.
    cc = Vector(c)
    xzs, ys = [], []
    y = Y0 - 0.6
    nseg = 8
    for i in range(1, nseg + 1):
        y = Y0 - 0.6 - VEST_DEPTH * i / nseg
        s = 1.0 + (0.035 if i % 2 == 1 and i < nseg else 0.0)
        xzs.append([cc + (p - cc) * s if p.y > PORTAL_Z0 + 0.05 else
                    Vector((cc.x + (p.x - cc.x) * s, p.y)) for p in s_por])
        ys.append(y)

    def vtag(f):
        cen = f.calc_center_median()
        f.normal_update()
        return STONE if (cen.z < PORTAL_Z0 + 0.1 and abs(f.normal.z) > 0.8) else NACRE
    rows = [last]
    for xz, yy in zip(xzs, ys):
        rows.append(B.verts([Vector((p.x, yy, p.y)) for p in xz]))
    B.grid(rows, vtag, closed=True, zone=7)
    last = rows[-1]
    yd = ys[-1]
    door = []
    for i, f in enumerate((0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82, 0.92)):
        tw = 0.55 * f
        ridge = 0.05 if i % 2 else 0.0
        pts = []
        for p in s_por:
            d = (p - cc) * (1 - f)
            d = Vector((d.x * math.cos(tw) - d.y * math.sin(tw), d.x * math.sin(tw) + d.y * math.cos(tw)))
            pts.append(cc + d)
        door.append((pts, yd - 0.30 * math.sin(f * math.pi / 2) - ridge))
    for pts, yy in door:
        nv = B.verts([Vector((p.x, yy, p.y)) for p in pts])
        B.grid([last, nv], NACRE, closed=True, zone=8)
        last = nv
    centre = B.bm.verts.new((cc.x, yd - 0.34, cc.y))
    B.grid([last, [centre] * len(last)], NACRE, closed=True, zone=8)


# --------------------------------------------------------------- props

def prism_x(bm, poly_yz, x0, x1, uv=None):
    left = [bm.verts.new((x0, y, z)) for y, z in poly_yz]
    right = [bm.verts.new((x1, y, z)) for y, z in poly_yz]
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    n = len(poly_yz)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))


def stairs_profile():
    pts = [(Y0 - 0.45, 0.0), (Y0 - 0.45, LANDING_Z), (LANDING_Y1, LANDING_Z)]
    z = LANDING_Z
    y = LANDING_Y1
    for k in range(1, N_STEPS):
        z -= STEP_RISE
        pts.append((y, z))
        y += STEP_RUN
        pts.append((y, z))
    pts.append((y, 0.0))
    return list(reversed(pts))   # counter-clockwise seen from +x


def cheek_profile():
    foot = LANDING_Y1 + STEP_RUN * (N_STEPS - 1)
    return [(Y0 - 0.45, 0.0), (foot + 0.30, 0.0), (foot + 0.30, 0.28), (LANDING_Y1, LANDING_Z + 0.36),
            (Y0 - 0.45, LANDING_Z + 0.36)]


def floor_light_spots():
    spots = []
    for side in (-1, 1):
        for i in range(8):
            spots.append((side * 5.7, -7.6 + i * 2.25, 0.0))
    for x in (-4.0, -2.0, 0.0, 2.0, 4.0):
        spots.append((x, Y1 - 1.25, math.pi / 2))
    foot = LANDING_Y1 + STEP_RUN * (N_STEPS - 1)
    for side in (-1, 1):
        spots.append((side * 1.55, foot + 0.75, math.pi / 2))
    return spots


def build_props(col, mats):
    """Stairs + cheeks, floor-light bezels (stone), lenses (floor_lights), pillars."""
    bm = bmesh.new()
    prism_x(bm, stairs_profile(), -STAIR_W, STAIR_W)
    for side in (-1, 1):
        x0, x1 = (STAIR_W, STAIR_W + 0.32) if side > 0 else (-STAIR_W - 0.32, -STAIR_W)
        prism_x(bm, list(reversed(cheek_profile())), x0, x1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    stairs = K.bm_object("shell_interior_stairs", bm, mats["floor"], col)
    bev = stairs.modifiers.new("Bevel", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.012, 2, "ANGLE"
    bev.angle_limit = math.radians(40)
    K.apply_modifiers(stairs)

    bm = bmesh.new()
    lens = bmesh.new()
    for (x, y, rot) in floor_light_spots():
        R = Matrix.Rotation(rot, 3, "Z")
        K.box_bm(bm, Vector((x, y, 0.007)), (0.20, 0.38, 0.014), R)
        hw, hl = 0.07, 0.15
        vs = [lens.verts.new(Vector((x, y, 0.0145)) + R @ Vector(p)) for p in
              ((-hw, -hl, 0), (hw, -hl, 0), (hw, hl, 0), (-hw, hl, 0))]
        lens.faces.new(vs)
    bez = K.bm_object("floor_light_bezels", bm, mats["bezel"], col)
    b2 = bez.modifiers.new("Bevel", "BEVEL")
    b2.width, b2.segments = 0.004, 1
    K.apply_modifiers(bez)
    lights = K.bm_object("floor_lights", lens, mats["lens"], col)

    # Chamber pillars: slender twisted nacre columns seen through the fog.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rng = random.Random(SEED + 5)
    yb = CHAMBER_Y
    for (x, y) in ((-7.2, yb + 8.5), (-4.0, yb + 12.0), (0.8, yb + 13.0), (4.6, yb + 11.2), (7.3, yb + 7.0)):
        r0 = rng.uniform(0.34, 0.46)
        nring, nseg = 44, 28
        rows = []
        for i in range(nring + 1):
            t = i / nring
            z = CHAMBER_Z0 - 0.1 + t * (CHAMBER_Z1 + 0.5 - CHAMBER_Z0)
            rr = r0 * (1.25 - 0.45 * t + 0.35 * max(0, (t - 0.85) / 0.15) ** 2)
            row = []
            for k in range(nseg):
                a = 2 * math.pi * k / nseg + 2.2 * t
                lobe = 1 + 0.12 * math.cos(5 * (2 * math.pi * k / nseg))
                row.append(bm.verts.new((x + rr * lobe * math.cos(a), y + rr * lobe * math.sin(a), z)))
            rows.append(row)
        for i in range(nring):
            for k in range(nseg):
                k2 = (k + 1) % nseg
                f = bm.faces.new((rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]))
                for loop, (uu, vv) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                    loop[uv].uv = (uu * 2 * math.pi * r0 / nseg / TILE, vv * 14.5 / nring / TILE)
        for row in (rows[0], rows[-1]):
            f = bm.faces.new(row)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    pillars = K.bm_object("chamber_pillars", bm, mats["nacre"], col)
    for o in (stairs, bez, lights, pillars):
        K.finish_shading(o, angle=35)
    K.finish_shading(lights, flat=True)
    return stairs, bez, lights, pillars


def box_project_uv(obj):
    """Metre-scale box projection into the active UV layer (for atlas packing)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers.active.data
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                uvl[li].uv = (co.x, co.y)
            elif ax == 1:
                uvl[li].uv = (co.x, co.z)
            else:
                uvl[li].uv = (co.y, co.z)


# --------------------------------------------------------------- collision

def build_collision(col, section, W):
    pts, nrm, _ = section
    objs = []
    th = 0.8
    segs = [(Y0 - 0.3, -4.9), (-5.1, 0.1), (-0.1, 5.1), (4.9, Y1 + 0.3)]
    step = 12
    for si, (ya, yb) in enumerate(segs):
        env = []
        for j in range(NCOL + 1):
            best = -1e9
            for row in W:
                p = row[j]
                if ya - 0.5 <= p.y <= yb + 0.5:
                    d = (Vector((p.x, p.z)) - pts[j]).dot(nrm[j])
                    best = max(best, d)
            env.append(pts[j] + nrm[j] * best)
        idx = list(range(0, NCOL + 1, step))
        if idx[-1] != NCOL:
            idx.append(NCOL)
        for a, b in zip(idx, idx[1:]):
            P, Q = env[a], env[b]
            # keep the chord inside every envelope point it spans (convex section)
            d = (Q - P)
            L = d.length
            d.normalize()
            out = Vector((d.y, -d.x))         # outward = right of travel
            push = max(0.0, max(-(env[m] - P).dot(out) for m in range(a, b + 1)))
            P2, Q2 = P - out * push, Q - out * push
            mid = (P2 + Q2) / 2 + out * (th / 2)
            alpha = math.atan2(d.y, d.x)
            rot = Matrix.Rotation(-alpha, 3, "Y")
            kind = "ceiling" if (P.y + Q.y) / 2 > 8.0 else "wall"
            objs.append(K.box_col(f"{kind}_s{si}_{a:03d}_col", (mid.x, (ya + yb) / 2, mid.y),
                                  (L + 0.5, yb - ya, th), col, rot))
    objs.append(K.box_col("floor_col", (0, (Y0 + Y1) / 2, -0.25), (15.6, Y1 - Y0 + 1.6, 0.5), col))
    objs.append(K.box_col("glass_col", (0, GLASS_Y - 0.2, 4.0), (12.4, 0.5, 8.2), col))
    objs.append(K.box_col("endwall_glass_col", (0, Y1 + 0.75, 6.5), (16.0, 0.9, 13.6), col))
    for side in (-1, 1):
        objs.append(K.box_col(f"endwall_entrance_{'l' if side < 0 else 'r'}_col",
                              (side * 5.05, Y0 - 0.25, 6.5), (5.9, 0.7, 13.6), col))
    objs.append(K.box_col("endwall_entrance_top_col", (0, Y0 - 0.25, 9.6), (4.4, 0.7, 7.4), col))
    objs.append(K.box_col("landing_col", (0, (Y0 - 0.6 + LANDING_Y1) / 2, LANDING_Z / 2),
                          (2 * STAIR_W, LANDING_Y1 - Y0 + 0.6, LANDING_Z), col))
    foot = LANDING_Y1 + STEP_RUN * (N_STEPS - 1)
    ramp = []
    for x in (-STAIR_W, STAIR_W):
        ramp += [(x, LANDING_Y1, LANDING_Z), (x, foot + 0.15, 0.0), (x, LANDING_Y1, -0.05), (x, foot + 0.15, -0.05)]
    objs.append(K.convex_object("stairs_col", [Vector(p) for p in ramp], col))
    for side in (-1, 1):
        x0, x1 = (STAIR_W, STAIR_W + 0.32) if side > 0 else (-STAIR_W - 0.32, -STAIR_W)
        pts3 = [Vector((x, y, z)) for x in (x0, x1) for y, z in cheek_profile()]
        objs.append(K.convex_object(f"stairs_cheek_{'l' if side < 0 else 'r'}_col", pts3, col))
    vy0, vy1 = Y0 - 0.6 - VEST_DEPTH - 0.4, Y0 + 0.1
    vc = (vy0 + vy1) / 2
    objs.append(K.box_col("vestibule_floor_col", (0, vc, LANDING_Z - 0.25), (5.4, vy1 - vy0, 0.5), col))
    for side in (-1, 1):
        objs.append(K.box_col(f"vestibule_wall_{'l' if side < 0 else 'r'}_col",
                              (side * (PORTAL_HW - 0.1 + 0.3), vc, 3.9), (0.6, vy1 - vy0, 5.6), col))
    objs.append(K.box_col("vestibule_ceiling_col", (0, vc, PORTAL_ZS + 1.4), (5.4, vy1 - vy0, 1.6), col))
    objs.append(K.box_col("vestibule_door_col", (0, Y0 - 0.6 - VEST_DEPTH - 0.2, 3.9), (5.4, 0.6, 5.6), col))
    return objs


def build_sockets(col):
    yb = CHAMBER_Y
    s = []
    s.append(K.socket("socket_spawn", (0.0, Y0 - 1.3, LANDING_Z), col,
                      look_dir_gltf=[0, 0, -1], note="vestibule mouth, on the landing level; face the glass"))
    s.append(K.socket("socket_logogram_center", (0.0, GLASS_Y - 0.002, GLASS_C[1]), col,
                      glass_size_m=[2 * GLASS_HW + 0.1, GLASS_Z1 - GLASS_Z0 + 0.1],
                      normal_gltf=[0, 0, 1],
                      uv_note="logogram_glass UV: u 0..1 left to right as seen from the hall, v 0..1 bottom to top in Blender (glTF stores 1-v)"))
    for i, (x, dy, yaw) in enumerate(((-4.4, 4.6, 0.25), (0.4, 6.8, 0.0), (4.6, 4.2, -0.3)), start=1):
        e = K.socket(f"socket_guest_{i}", (x, yb + dy, CHAMBER_Z0), col,
                     look_dir_gltf=[round(math.sin(yaw), 3), 0, round(math.cos(yaw), 3)],
                     note="Guest pivot on the chamber floor, facing the glass")
        e.rotation_euler = (0, 0, yaw)
        s.append(e)
    return s


def build_glass(col, mat):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    hw, z0, z1 = GLASS_HW + 0.05, GLASS_Z0 - 0.05, GLASS_Z1 + 0.05
    vs = [bm.verts.new(p) for p in ((-hw, GLASS_Y, z0), (hw, GLASS_Y, z0), (hw, GLASS_Y, z1), (-hw, GLASS_Y, z1))]
    f = bm.faces.new(vs)
    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = c
    o = K.bm_object("logogram_glass", bm, mat, col)
    K.finish_shading(o, flat=True)
    return o


# ------------------------------------------------------------- validation

def closure_checks(bm):
    nonman = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    boundary = sum(1 for e in bm.edges if len(e.link_faces) < 2)
    loose_v = sum(1 for v in bm.verts if not v.link_faces)
    vol = 0.0
    for f in bm.faces:
        if len(f.verts) < 3:
            continue
        v0 = f.verts[0].co
        for a, b in zip(f.verts[1:-1], f.verts[2:]):
            vol += v0.dot(a.co.cross(b.co)) / 6.0
    chi = len(bm.verts) - len(bm.edges) + len(bm.faces)
    bm.faces.index_update()
    seen, comps = set(), 0
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        comps += 1
        stack = [f0]
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
    return {"connected_shells": comps,"non_manifold_edges": nonman, "boundary_edges": boundary, "loose_verts": loose_v,
            "signed_volume_m3": round(vol, 2), "normals": "inward" if vol < 0 else "outward",
            "euler_characteristic": chi, "faces": len(bm.faces)}


def interior_probe_points():
    pts = []
    for x in (-5.0, -2.5, 0.0, 2.5, 5.0):
        for y in (-8.0, -4.0, 0.0, 4.0, 8.5):
            for z in (0.3, 1.7, 5.0, 9.5):
                if abs(x) > 4 and z > 8:
                    continue
                pts.append(Vector((x, y, z)))
    pts += [Vector((0, Y0 - 1.5, 1.6)), Vector((0, Y0 - 3.0, 3.5)), Vector((1.2, Y0 - 2.2, 2.2)),
            Vector((0, Y1 + 4, 2.0)), Vector((-6, Y1 + 9, 6.0)), Vector((6, Y1 + 3, 11.0)),
            Vector((0, Y1 + 13, 12.0)), Vector((0, GLASS_Y + 0.15, 3.0))]
    return pts


def ray_escape_test(bvh, points, ndirs=2562, maxd=150.0):
    dirs = K.fibonacci_dirs(ndirs)
    miss = back = 0
    worst = []
    back_ex = []
    for p in points:
        m = 0
        for d in dirs:
            hit = bvh.ray_cast(p, d, maxd)
            if hit[0] is None:
                miss += 1
                m += 1
            elif hit[1].dot(d) > 0:
                back += 1
                if len(back_ex) < 8:
                    back_ex.append([round(c, 2) for c in hit[0]])
        if m:
            worst.append({"point": [round(c, 2) for c in p], "escapes": m})
    return {"points": len(points), "directions": ndirs, "rays": len(points) * ndirs,
            "escaped": miss, "back_face_hits": back, "back_face_hit_examples": back_ex,
            "escaping_points": worst[:10]}


def col_probe_points():
    pts = []
    for x in (-5.5, -3.3, -1.1, 1.1, 3.3, 5.5):
        for y in (-5.2, -3.0, -0.5, 2.0, 4.5, 7.0, 9.2):
            for z in (0.5, 1.0, 1.7):
                pts.append(Vector((x, y, z)))
    pts += [Vector((0, Y0 + 0.6, LANDING_Z + 0.9)), Vector((0, Y0 - 1.5, LANDING_Z + 0.9)),
            Vector((0, Y0 - 3.2, LANDING_Z + 1.7)), Vector((-1.5, Y0 + 2.6, 1.6)), Vector((1.5, Y0 + 2.6, 1.6))]
    return pts


def bvh_from_objects(objs):
    bm = bmesh.new()
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        me = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    bvh = BVHTree.FromBMesh(bm)
    return bvh, bm


def validate_shipped(stats):
    """Re-import the .glb in a clean scene and repeat the closure checks on what ships."""
    K.reset_scene()
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    objs = {o.name: o for o in bpy.context.scene.objects}
    bnd = [objs["shell_interior_walls"], objs["shell_interior_floor"]]
    bpy.context.view_layer.update()
    bvh, bm = bvh_from_objects(bnd)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-4)
    c = closure_checks(bm)
    bvh = BVHTree.FromBMesh(bm)
    r = ray_escape_test(bvh, interior_probe_points(), ndirs=1442)
    bm.free()
    cols = [o for n, o in objs.items() if n.endswith("_col")]
    cbvh, cbm = bvh_from_objects(cols)
    cr = ray_escape_test(cbvh, col_probe_points(), ndirs=1442)
    cr.pop("back_face_hits", None)
    cbm.free()
    # Floor coverage: every walkable 0.5 m cell has collision under it.
    holes = 0
    total = 0
    x = -5.5
    while x <= 5.5:
        y = Y0 + 0.2
        while y <= Y1 - 0.4:
            total += 1
            if cbvh.ray_cast(Vector((x, y, 3.0)), Vector((0, 0, -1)), 6.0)[0] is None:
                holes += 1
            y += 0.5
        x += 0.5
    tris = {}
    for o in objs.values():
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris[o.name] = len(o.data.loop_triangles)
    stats["shipped_glb_checks"] = {
        "boundary_after_reimport": c, "ray_escape_visual": r, "ray_escape_collision": cr,
        "collision_floor_probe": {"cells": total, "holes": holes},
        "collision_objects": len(cols),
        "triangles_by_object": tris,
    }


# ------------------------------------------------------------- materials

def nacre_tile_fields(n, seed):
    """Periodic (tileable) nacre fields on an n x n grid: height (m), colour, roughness."""
    import numpy as np
    rng = np.random.default_rng(seed)

    def fnoise(beta, kmin=1, kmax=None, ax=1.0, ay=1.0):
        w = rng.standard_normal((n, n))
        k1 = np.fft.fftfreq(n) * n
        kx, ky = np.meshgrid(k1, k1)
        k = np.sqrt((kx * ax) ** 2 + (ky * ay) ** 2)
        filt = np.where(k >= kmin, np.power(np.maximum(k, 1e-6), -beta / 2), 0.0)
        if kmax:
            filt *= np.exp(-(k / kmax) ** 2)
        f = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
        return (f - f.mean()) / (f.std() + 1e-9)

    i = np.arange(n) / n
    u, v = np.meshgrid(i, i)               # rows = v (y), columns = u (x)
    warp = fnoise(3.0, 1, 10, ax=0.5) * 0.010 + fnoise(2.0, 6, 50, ax=0.6) * 0.0018
    vw = v + warp
    amp = np.clip(0.7 + 0.3 * fnoise(3.0, 1, 8), 0.2, 1.2)
    f1 = np.mod(vw * 150 + 0.5 * fnoise(2.5, 2, 24, ax=0.4), 1.0)
    h1 = f1 ** 2.5
    f2 = np.mod(vw * 32 + 0.30 * fnoise(3.0, 1, 12), 1.0)
    h2 = (f2 * f2 * (3 - 2 * f2)) ** 1.5
    h3 = 0.5 + 0.5 * np.sin(2 * np.pi * 5 * vw)
    micro = fnoise(1.6, 48, None)
    h = 0.00045 * h1 * amp + 0.0016 * h2 + 0.0030 * h3 + 0.00012 * micro
    lum = 0.58 + 0.035 * fnoise(3.0, 1, 8) + 0.03 * h2 - 0.035 * (1 - h1) * amp * 0.5
    hue = 2 * np.pi * (vw * 3 + 0.22 * fnoise(3.0, 1, 6) + 0.5 * h3)
    tint = 0.075 * (0.7 + 0.3 * h2)
    col = np.stack([lum * (1.0 + tint * np.cos(hue)),
                    lum * (0.99 + tint * np.cos(hue - 2.094)),
                    lum * (0.985 + tint * np.cos(hue + 2.094))], -1)
    rough = np.clip(0.24 + 0.10 * (1 - h2) + 0.05 * (1 - h1) + 0.02 * micro, 0.12, 0.6)
    return h, col, rough


def floor_bake_material():
    bmat = K.BakeMaterial("bake_floor")
    k = bmat.k
    co = k.coord("Object")
    vm = k.vmath
    warp = k.noise(co, 0.35, 2.0, 0.5, color=True)
    wco = vm("SUBTRACT", vm("ADD", co, warp), 0.5)
    slab_edge = k.voronoi(wco, 0.55, feature="DISTANCE_TO_EDGE")
    slab_cell = k.voronoi(wco, 0.55, feature="F1", out="Color")
    grout = k.maprange(slab_edge, 0.0, 0.016, 1.0, 0.0)
    w2 = k.noise(co, 1.4, 3.0, 0.6, color=True)
    cco = vm("ADD", co, w2)
    crack = k.math("MULTIPLY", k.maprange(k.voronoi(cco, 1.6, feature="DISTANCE_TO_EDGE"), 0.0, 0.0065, 1.0, 0.0),
                   k.maprange(k.noise(co, 0.8, 2.0, 0.5), 0.47, 0.60))
    fine = k.math("MULTIPLY", k.maprange(k.voronoi(cco, 4.8, feature="DISTANCE_TO_EDGE"), 0.0, 0.004, 1.0, 0.0),
                  k.maprange(k.noise(co, 1.7, 2.0, 0.5), 0.55, 0.66))
    groove = k.math("MAXIMUM", k.math("MAXIMUM", grout, crack), fine)
    grain = k.noise(co, 42.0, 6.0, 0.62)
    mott = k.noise(co, 3.2, 5.0, 0.58)
    wet = k.maprange(k.noise(co, 0.42, 3.0, 0.5), 0.50, 0.66)
    tone = k.maprange(k.sepxyz(slab_cell)[0], 0.0, 1.0, 0.72, 1.28)
    base = k.ramp(mott, [(0.25, (0.020, 0.022, 0.024)), (0.55, (0.040, 0.043, 0.045)),
                         (0.85, (0.072, 0.075, 0.074))])
    c = k.mix(1.0, base, k.math("MULTIPLY", tone, 1.0), blend="MULTIPLY")
    c = k.mix(k.maprange(grain, 0.3, 0.7, 0.0, 0.35), c, (0.09, 0.093, 0.09))
    c = k.mix(k.math("MULTIPLY", wet, 0.35), c, (0.012, 0.013, 0.014))
    c = k.mix(groove, c, (0.006, 0.006, 0.007))
    rough = k.math("ADD", k.math("SUBTRACT", 0.64, k.math("MULTIPLY", wet, 0.44)),
                   k.math("ADD", k.math("MULTIPLY", groove, 0.25), k.math("MULTIPLY", grain, 0.08)), clamp=True)
    height = k.math("SUBTRACT", k.math("ADD", k.math("MULTIPLY", grain, 0.18), k.math("MULTIPLY", mott, 0.25)),
                    k.math("MULTIPLY", groove, 1.3))
    bmat.set(c, rough, 0.0, normal=K.bump_normal(k, height, 0.6, 0.006))
    return bmat


def frame_bake_material():
    bmat = K.BakeMaterial("bake_frame")
    k = bmat.k
    co = k.coord("Object")
    n = k.noise(co, 9.0, 6.0, 0.6)
    brushed = k.noise(k.vscale(co, 1.0), 160.0, 3.0, 0.5)
    geo = k.geometry()
    wear = k.maprange(geo.outputs["Pointiness"], 0.51, 0.58)
    c = k.mix(k.maprange(n, 0.3, 0.7), (0.020, 0.022, 0.025), (0.045, 0.047, 0.05))
    c = k.mix(wear, c, (0.16, 0.15, 0.13))
    rough = k.math("ADD", 0.30, k.math("MULTIPLY", n, 0.18), clamp=True)
    rough = k.math("SUBTRACT", rough, k.math("MULTIPLY", wear, 0.12), clamp=True)
    bmat.set(c, rough, 0.75, normal=K.bump_normal(k, k.math("ADD", n, k.math("MULTIPLY", brushed, 0.3)), 0.12, 0.003))
    return bmat


def bezel_bake_material():
    bmat = K.BakeMaterial("bake_bezel")
    k = bmat.k
    n = k.noise(k.coord("Object"), 30.0, 4.0, 0.5)
    c = k.mix(k.maprange(n, 0.3, 0.7), (0.20, 0.13, 0.065), (0.32, 0.22, 0.11))
    bmat.set(c, k.maprange(n, 0.2, 0.8, 0.28, 0.42), 1.0)
    return bmat


def lens_bake_material():
    bmat = K.BakeMaterial("bake_lens")
    bmat.set((1.0, 0.80, 0.55), 0.18, 0.0, emission=(1.0, 0.50, 0.14))
    return bmat


def nacre_preview_material():
    bmat = K.BakeMaterial("bake_nacre")
    bmat.set((0.62, 0.62, 0.64), 0.3, 0.0)
    return bmat


def glass_material():
    m = K.mat_simple("logogram_glass", (0.80, 0.88, 0.92), rough=0.04,
                     emit=(0.55, 0.68, 0.76), emit_strength=0.35, alpha=0.30)
    m.use_backface_culling = False
    return m


# ------------------------------------------------------------- build stages

def build_geometry(stats, clock):
    """Everything except textures. Returns dict of objects."""
    rng = random.Random(SEED)
    sc = K.reset_scene()
    work = K.new_collection("Work")
    mats = {"floor": floor_bake_material(), "frame": frame_bake_material(), "bezel": bezel_bake_material(),
            "lens": lens_bake_material(), "nacre": nacre_preview_material()}
    clock.start("model_boundary")
    B = Builder()
    loop0, loop1, hall_info, section = build_hall(B, rng)
    stats["hall"] = hall_info
    build_glass_end(B, loop1)
    build_entrance(B, loop0)
    bm = B.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    stats["closure_generated"] = closure_checks(bm)
    log("closure (generated)", json.dumps(stats["closure_generated"]))
    me = bpy.data.meshes.new("boundary")
    bm.normal_update()
    bm.to_mesh(me)
    boundary = K.link(bpy.data.objects.new("boundary", me), work)
    # ray escape test on the generated boundary
    bvh = BVHTree.FromBMesh(bm)
    stats["ray_escape_generated"] = ray_escape_test(bvh, interior_probe_points())
    log("ray escape (generated)", json.dumps(stats["ray_escape_generated"]))
    bm.free()

    clock.start("split_parts")
    walls = K.duplicate(boundary, "shell_interior_walls", work)
    floor = K.duplicate(boundary, "shell_interior_floor", work)
    for obj, keep in ((walls, NACRE), (floor, STONE)):
        b2 = bmesh.new()
        b2.from_mesh(obj.data)
        tl = b2.faces.layers.int["part"]
        zl = b2.faces.layers.int["zone"]
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f[tl] != keep], context="FACES")
        if keep == STONE:
            # slot 0 floor stone, slot 1 frame stone (portal + window frames)
            for f in b2.faces:
                f.material_index = 1 if f[zl] in (4, 6) else 0
        b2.to_mesh(obj.data)
        b2.free()
        obj.data.materials.clear()
    floor.data.uv_layers.remove(floor.data.uv_layers["UV_AO"])
    walls.data.materials.append(mats["nacre"].mat)
    floor.data.materials.append(mats["floor"].mat)
    floor.data.materials.append(mats["frame"].mat)
    bpy.data.objects.remove(boundary)
    for o in (walls, floor):
        K.triangulate_ngons(o)
        K.finish_shading(o, angle=50)
    stairs, bez, lights, pillars = build_props(work, {"floor": mats["floor"].mat, "bezel": mats["bezel"].mat,
                                                      "lens": mats["lens"].mat, "nacre": mats["nacre"].mat})
    K.triangulate_ngons(stairs)
    glass = build_glass(work, glass_material())
    clock.start("collision_sockets")
    cols = build_collision(work, section, section[2])
    for c in cols:
        c.hide_render = True
    sockets = build_sockets(work)
    return {"sc": sc, "work": work, "mats": mats, "walls": walls, "floor": floor, "stairs": stairs,
            "bezels": bez, "lights": lights, "pillars": pillars, "glass": glass, "cols": cols,
            "sockets": sockets}


def preview_lights(col, strength=1.0):
    """Review lighting for a closed interior: glow from the glass, fog light in the
    Guest chamber, soft fill under the vault. Not part of the asset."""
    def area(name, loc, rot, size, energy, color, sx=None, cam=False):
        L = bpy.data.lights.new(name, "AREA")
        L.energy = energy * strength
        L.color = color
        if sx:
            L.shape = "RECTANGLE"
            L.size, L.size_y = size, sx
        else:
            L.size = size
        o = K.link(bpy.data.objects.new(name, L), col)
        o.location = loc
        o.rotation_euler = rot
        o.visible_camera = cam
        return o
    area("GlassGlow", (0, GLASS_Y + 0.15, 3.95), (math.radians(-90), 0, 0), 11.5, 1500, (0.82, 0.90, 1.0), sx=6.6)
    area("ChamberTop", (0, Y1 + 7.5, 13.0), (0, 0, 0), 14.0, 3500, (0.80, 0.88, 1.0), sx=11.0)
    area("ChamberBack", (0, Y1 + 14.0, 6.0), (math.radians(-90), 0, 0), 14.0, 4000, (0.85, 0.92, 1.0), sx=10.0)
    area("VaultFill", (0, 0, 10.8), (0, 0, 0), 6.0, 120, (0.92, 0.95, 1.0), sx=14.0)
    area("EntranceFill", (0, Y0 + 3, 7.0), (math.radians(-35), 0, 0), 5.0, 80, (1.0, 0.92, 0.82))


def chamber_fog(col, density=0.035):
    m = bpy.data.materials.new("ChamberFog")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = density
    vol.inputs["Color"].default_value = (0.82, 0.88, 0.94, 1)
    nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, CHAMBER_Y + CHAMBER_DEPTH / 2 + 0.3, 6.6))
    o = bpy.context.object
    o.scale = (2 * CHAMBER_HW - 0.2, CHAMBER_DEPTH + 0.9, 13.8)
    o.data.materials.append(m)
    for c in o.users_collection:
        c.objects.unlink(o)
    col.objects.link(o)
    o.name = "ChamberFogVolume"
    return o


def stage_geo():
    clock = K.StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    objs = build_geometry(stats, clock)
    tris = {objs[n].name: K.mesh_tris(objs[n]) for n in
            ("walls", "floor", "stairs", "bezels", "lights", "pillars", "glass")}
    stats["triangles_by_object"] = tris
    stats["triangles_runtime"] = sum(v for n, v in tris.items())
    log("tris", json.dumps(tris), "total", stats["triangles_runtime"])
    clock.start("preview_renders")
    sc = objs["sc"]
    K.use_gpu(sc)
    K.setup_render(sc, 1280, 720, samples=48)
    K.set_world(sc, (0, 0, 0), 0.0)
    env = K.new_collection("Review")
    preview_lights(env)
    out = os.path.join(QA_DIR, "geo")
    os.makedirs(out, exist_ok=True)
    for name, (loc, tgt, lens) in VIEWS.items():
        if name.startswith("top") or name.startswith("section"):
            continue
        render_view(sc, name, out, "geo")
    render_view(sc, "top_cutaway", out, "geo")
    render_view(sc, "side_cutaway", out, "geo")
    render_view(sc, "section", out, "geo")
    clock.stop()
    K.write_json(os.path.join(out, "geo-stats.json"), stats)


VIEWS = {
    # name: (location, target, lens)
    "concept": ((-1.6, -3.2, 2.5), (1.0, 10.0, 3.3), 22),
    "entrance": ((0.0, Y0 - 0.9, LANDING_Z + 1.65), (0.0, Y1, 3.4), 18),
    "close_ribs": ((3.6, -2.4, 2.2), (7.0, 1.6, 3.9), 30),
    "close_floor": ((4.2, 0.4, 1.05), (5.7, 2.9, 0.0), 30),
    "game_camera": ((-4.5, -6.5, 7.5), (0.5, 0.5, 0.0), 24),
    "from_glass": ((2.0, Y1 - 1.0, 2.0), (-1.0, Y0, 4.0), 20),
}


def render_view(sc, name, out, prefix, w=None, h=None):
    if name == "top_cutaway":
        cam = K.add_camera("Cam_top", (0, 5.5, 60.0), (0, 5.5, 0), ortho=44.0, clip_start=60.0 - 7.6)
        cam.rotation_euler = (0, 0, math.radians(90))
    elif name == "side_cutaway":
        cam = K.add_camera("Cam_side", (-40.0, 1.5, 6.0), (0, 1.5, 6.0), ortho=26.0, clip_start=40.0 - 0.5)
    elif name == "section":
        cam = K.add_camera("Cam_section", (0, -40.0, 6.4), (0, 0, 6.4), ortho=17.0, clip_start=40.0 - 2.0)
    else:
        loc, tgt, lens = VIEWS[name]
        cam = K.add_camera(f"Cam_{name}", loc, tgt, lens=lens)
    return K.render_to(sc, cam, os.path.join(out, f"{prefix}_{name}.jpg"), w, h)


def stage_build():
    clock = K.StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    os.makedirs(TEX_DIR, exist_ok=True)
    objs = build_geometry(stats, clock)
    sc = objs["sc"]
    stats["cycles_device"] = K.use_gpu(sc)
    sc.render.engine = "CYCLES"
    walls, floor, stairs, bez, lights, pillars = (objs[k] for k in
                                                  ("walls", "floor", "stairs", "bezels", "lights", "pillars"))
    mats = objs["mats"]
    import numpy as np

    clock.start("uv_unwrap")
    # UVMap: walls carry metre UVs, pillars are already in tile units -> rescale walls.
    uvl = walls.data.uv_layers["UVMap"].data
    arr = np.empty(len(uvl) * 2, dtype=np.float32)
    uvl.foreach_get("uv", arr)
    uvl.foreach_set("uv", arr / TILE)
    pillars.data.uv_layers.new(name="UV_AO")
    nacre = K.join([walls, pillars], "shell_interior_walls")
    # UV_AO (unique, for the baked AO): the hall walls keep their metre grid UVs
    # (one rectangular island); every other nacre face gets a smart projection.
    zone_of = attr_values(nacre, "zone")
    unwrap_unique(nacre, "UV_AO", [z != 1 for z in zone_of])
    nacre.data.uv_layers.active = nacre.data.uv_layers["UVMap"]
    # Stone atlas: hall floor planar metres, props box-projected metres, the
    # frames/strips smart-projected; then one shared, area-proportional packing.
    for o in (stairs, bez, lights):
        box_project_uv(o)
    zone_f = attr_values(floor, "zone")
    unwrap_unique(floor, "UVMap", [z != 2 for z in zone_f], pack=False)
    pack_shared([floor, stairs, bez, lights], "UVMap")
    stats["uv_stone"] = K_uv_density([floor, stairs], TEX_STONE)
    log("uv stone", json.dumps(stats["uv_stone"]))
    stats["uv_nacre_ao"] = K_uv_density([nacre], AO_NACRE, layer="UV_AO")
    log("uv nacre ao", json.dumps(stats["uv_nacre_ao"]))

    clock.start("nacre_tile_master")
    tile = make_nacre_tile(stats)

    clock.start("bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    world = K.set_world(sc, (0.0, 0.0, 0.0), 0.0)
    world.light_settings.distance = 1.6
    bake_times = {}
    # Tile normal: dense displaced master -> flat tile, selected to active.
    tile_low, tile_master = tile
    img_tn = K.new_float_image("bake_tile_normal", 4096)
    bmt = K.BakeMaterial("bake_tile")
    bmt.set((0.5, 0.5, 0.5), 0.5)
    bmt.aim(img_tn)
    tile_low.data.materials.append(bmt.mat)
    tile_master.data.materials.append(K.mat_simple("tile_master", (0.6, 0.6, 0.6)))
    bake_times["nacre_tile_normal"] = K.bake(sc, "NORMAL", [tile_master, tile_low], tile_low, 16,
                                             selected_to_active=True, cage_extrusion=0.02,
                                             max_ray_distance=0.05, normal_space="TANGENT", margin=0)
    # Nacre AO on the unique UV_AO layer.
    img_ao = K.new_float_image("bake_nacre_ao", AO_NACRE)
    nacre.data.uv_layers.active = nacre.data.uv_layers["UV_AO"]
    for s in nacre.material_slots:
        s.material = mats["nacre"].mat
    mats["nacre"].aim(img_ao, "UV_AO")
    for o in (tile_low, tile_master):
        o.hide_render = True
    bake_times["nacre_ao"] = K.bake(sc, "AO", [nacre], nacre, 192)
    nacre.data.uv_layers.active = nacre.data.uv_layers["UVMap"]
    # Stone atlas: all channels, self bake (procedural shaders), supersampled.
    stone_objs = [floor, stairs, bez, lights]
    stone_mats = [mats["floor"], mats["frame"], mats["bezel"], mats["lens"]]
    imgs = {}
    for key, kind, spp, channel in (("color", "EMIT", 16, "color"), ("rough", "EMIT", 16, "rough"),
                                    ("metal", "EMIT", 4, "metal"), ("emission", "EMIT", 4, "emission"),
                                    ("normal", "NORMAL", 16, "bsdf"), ("ao", "AO", 256, "bsdf")):
        img = K.new_float_image(f"bake_stone_{key}", BAKE_STONE, data=(key not in ("color", "emission")))
        for bmx in stone_mats:
            bmx.route(channel)
            bmx.aim(img, "UVMap")
        extra = {"normal_space": "TANGENT"} if kind == "NORMAL" else {}
        bake_times[f"stone_{key}"] = K.bake(sc, kind, stone_objs, floor, spp, **extra)
        imgs[key] = img
    for bmx in stone_mats:
        bmx.route("bsdf")
    stats["bakes"] = bake_times

    clock.start("textures")
    f = BAKE_STONE // TEX_STONE
    P = {k_: K.downsample(K.pixels(v), f)[..., :3] for k_, v in imgs.items()}
    paths = {}
    paths["stone_base"] = K.save_img(K.to_srgb(P["color"]), os.path.join(TEX_DIR, "stone_basecolor.jpg"), 92)
    paths["stone_orm"] = K.save_img(np.stack([P["ao"][..., 0], P["rough"][..., 0], P["metal"][..., 0]], -1),
                                    os.path.join(TEX_DIR, "stone_orm.jpg"), 92)
    paths["stone_normal"] = K.save_img(K.normal_to_rgb(P["normal"]), os.path.join(TEX_DIR, "stone_normal.jpg"), 95)
    paths["stone_emissive"] = K.save_img(K.to_srgb(P["emission"]), os.path.join(TEX_DIR, "stone_emissive.jpg"), 90)
    ao = K.downsample(K.pixels(img_ao), 1)[..., 0]
    paths["nacre_ao"] = K.save_img(ao, os.path.join(TEX_DIR, "nacre_ao.jpg"), 90)
    tn = K.downsample(K.pixels(img_tn), 4096 // TILE_RES)[..., :3]
    paths["nacre_normal"] = K.save_img(K.normal_to_rgb(tn), os.path.join(TEX_DIR, "nacre_normal.jpg"), 95)
    h, col, rough = stats.pop("_tile_fields")
    paths["nacre_base"] = K.save_img(K.to_srgb(col), os.path.join(TEX_DIR, "nacre_basecolor.jpg"), 93)
    paths["nacre_orm"] = K.save_img(np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1),
                                    os.path.join(TEX_DIR, "nacre_orm.jpg"), 93)
    stats["texture_files"] = {k_: {"file": os.path.relpath(v, REPO).replace("\\", "/"),
                                   "bytes": os.path.getsize(v)} for k_, v in paths.items()}

    clock.start("materials")
    L = {k_: K.load_image(v, data=k_ not in ("stone_base", "stone_emissive", "nacre_base"))
         for k_, v in paths.items()}
    m_nacre = K.pbr_material("M_Shell_Nacre", base=L["nacre_base"], orm=L["nacre_orm"], normal=L["nacre_normal"],
                             ao=L["nacre_ao"], ao_uv="UV_AO", uv="UVMap")
    m_stone = K.pbr_material("M_Shell_Stone", base=L["stone_base"], orm=L["stone_orm"], normal=L["stone_normal"],
                             emissive=L["stone_emissive"], emissive_strength=4.0)
    nacre.data.materials.clear()
    nacre.data.materials.append(m_nacre)
    for o in (floor, stairs, bez, lights):
        o.data.materials.clear()
        o.data.materials.append(m_stone)
        for p in o.data.polygons:
            p.material_index = 0
    for o in (tile_low, tile_master):
        bpy.data.objects.remove(o)

    clock.start("assemble_export")
    out = K.new_collection("Export")
    root = K.link(bpy.data.objects.new("shell_interior", None), out)
    floor.name = floor.data.name = "shell_interior_floor"
    nacre.name = nacre.data.name = "shell_interior_walls"
    ship = [nacre, floor, stairs, bez, lights, objs["glass"]] + objs["cols"] + objs["sockets"]
    for o in ship:
        for c in o.users_collection:
            c.objects.unlink(o)
        out.objects.link(o)
        o.parent = root
    for c in objs["cols"]:
        c.data.materials.clear()
    meshes = [nacre, floor, stairs, bez, lights, objs["glass"]]
    stats["triangles_by_object"] = {o.name: K.mesh_tris(o) for o in meshes}
    stats["triangles_runtime"] = sum(stats["triangles_by_object"].values())
    stats["collision_triangles"] = sum(K.mesh_tris(o) for o in objs["cols"])
    stats["collision_objects"] = [o.name for o in objs["cols"]]
    stats["materials"] = sorted({s.material.name for o in meshes for s in o.material_slots})
    stats["sockets"] = {s.name: K.blender_to_gltf(s.location) for s in objs["sockets"]}
    lo, hi = K.world_bounds(meshes)
    stats["bounds_blender_zup"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    K.select_only([root] + ship, root)
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_tangents=True,
                              export_extras=True, export_image_format="AUTO",
                              export_animations=False, export_cameras=False, export_lights=False)
    patched = K.patch_materials(GLB_PATH, {
        "M_Shell_Nacre": {"KHR_materials_iridescence": {
            "iridescenceFactor": 0.85, "iridescenceIor": 1.32,
            "iridescenceThicknessMinimum": 260, "iridescenceThicknessMaximum": 420}},
    })
    stats["glb_patched_extensions"] = patched
    stats["glb_bytes"] = os.path.getsize(GLB_PATH)
    stats["glb_summary"] = K.glb_summary(GLB_PATH)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)

    clock.start("validate_shipped")
    validate_shipped(stats)
    clock.stop()
    stats["budget_ok"] = {
        "runtime_triangles": stats["triangles_runtime"] <= TRI_BUDGET,
        "materials": len(stats["materials"]) <= 3,
        "closed_boundary": stats["shipped_glb_checks"]["boundary_after_reimport"]["non_manifold_edges"] == 0,
        "no_ray_escape_visual": stats["shipped_glb_checks"]["ray_escape_visual"]["escaped"] == 0,
        "no_ray_escape_collision": stats["shipped_glb_checks"]["ray_escape_collision"]["escaped"] == 0,
    }
    K.write_json(STATS_PATH, stats)
    log("stats", json.dumps({k_: v for k_, v in stats.items() if k_ != "glb_summary"}))


def attr_values(obj, name):
    a = obj.data.attributes.get(name)
    if a is None:
        return [0] * len(obj.data.polygons)
    vals = [0] * len(a.data)
    a.data.foreach_get("value", vals)
    return vals


def unwrap_unique(obj, layer, select_mask, pack=True):
    """Smart-project only the masked faces into `layer`, then average island
    scale (UV area proportional to 3D area) and pack."""
    me = obj.data
    if layer not in me.uv_layers:
        me.uv_layers.new(name=layer)
    me.uv_layers.active = me.uv_layers[layer]
    K.select_only([obj], obj)
    bpy.context.scene.tool_settings.mesh_select_mode = (False, False, True)
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    for v in bm.verts:
        v.select = False
    for e in bm.edges:
        e.select = False
    for f, m in zip(bm.faces, select_mask):
        f.select = bool(m)
    bm.select_mode = {"FACE"}
    bm.select_flush_mode()
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action="SELECT")
    if pack:
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, margin=0.002, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def pack_shared(objs, layer):
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[layer]
    K.select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def K_uv_density(objs, tex, layer=None):
    import numpy as np
    dens = []
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        uvl = (me.uv_layers[layer] if layer else me.uv_layers.active).data
        for t in me.loop_triangles:
            p = [me.vertices[i].co for i in t.vertices]
            q = [uvl[li].uv for li in t.loops]
            a3 = (p[1] - p[0]).cross(p[2] - p[0]).length / 2
            a2 = abs((q[1] - q[0]).cross(q[2] - q[0])) / 2 if hasattr(q[0], "cross") else \
                abs((q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[2].x - q[0].x) * (q[1].y - q[0].y)) / 2
            if a3 > 1e-6:
                dens.append(math.sqrt(a2 / a3) * tex)
    d = np.array(dens)
    return {"texel_density_px_per_m_median": round(float(np.median(d)), 1),
            "p10": round(float(np.percentile(d, 10)), 1), "p90": round(float(np.percentile(d, 90)), 1)}


def make_nacre_tile(stats):
    """Dense displaced master tile (periodic growth layers) + flat low tile."""
    import numpy as np
    n = TILE_RES
    h, col, rough = nacre_tile_fields(n, SEED + 11)
    stats["_tile_fields"] = (h, col, rough)
    off = Vector((1000.0, 0.0, 0.0))
    work = K.new_collection("Tile")
    # Low: one quad = one tile, UV 0..1.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new(off + Vector((x * TILE, y * TILE, 0))) for x, y in ((0, 0), (1, 0), (1, 1), (0, 1))]
    f = bm.faces.new(vs)
    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = c
    low = K.bm_object("tile_low", bm, [], work)
    # Master: grid slightly larger than the tile, heights sampled with wrap-around.
    sub = 2400
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=sub, y_subdivisions=sub, size=TILE * 1.04,
                                    location=off + Vector((TILE / 2, TILE / 2, 0)))
    master = bpy.context.object
    master.name = "tile_master"
    for c in master.users_collection:
        c.objects.unlink(master)
    work.objects.link(master)
    me = master.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    wx = co[:, 0] + master.location.x - off.x
    wy = co[:, 1] + master.location.y - off.y
    fu = (wx / TILE) % 1.0 * n
    fv = (wy / TILE) % 1.0 * n
    i0, j0 = np.floor(fv).astype(int) % n, np.floor(fu).astype(int) % n
    i1, j1 = (i0 + 1) % n, (j0 + 1) % n
    tv, tu = fv - np.floor(fv), fu - np.floor(fu)
    hh = (h[i0, j0] * (1 - tu) * (1 - tv) + h[i0, j1] * tu * (1 - tv) + h[i1, j0] * (1 - tu) * tv
          + h[i1, j1] * tu * tv)
    co[:, 2] = hh - h.mean()
    me.vertices.foreach_set("co", co.reshape(-1).astype(np.float32))
    me.update()
    stats["nacre_tile_master_triangles"] = len(me.polygons) * 2
    stats["nacre_tile"] = {"size_m": TILE, "texture_px": n, "height_range_mm":
                           round(float(h.max() - h.min()) * 1000, 2)}
    return low, master


# ---------------------------------------------------------------- render

def stage_render(samples=256):
    clock = K.StageClock()
    clock.start("qa_renders")
    sc = K.reset_scene()
    K.setup_render(sc, 1920, 1080, samples=samples)
    device = K.use_gpu(sc)
    K.set_world(sc, (0.0, 0.0, 0.0), 0.0)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    objs = {o.name: o for o in bpy.context.scene.objects}
    env = K.new_collection("Review")
    preview_lights(env)
    fog = chamber_fog(env)
    guests = []
    if os.path.exists(GUEST_GLB):
        for i in (1, 2, 3):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=GUEST_GLB)
            new = [o for o in bpy.data.objects if o not in before]
            roots = [o for o in new if o.parent is None]
            s = objs[f"socket_guest_{i}"]
            for r in roots:
                r.matrix_world = s.matrix_world @ r.matrix_world
                r.scale = (1.0 + 0.06 * (i - 2),) * 3
            guests += new
    K.human_proxy(env, (-0.4, 0.6, 0.0))
    cols = [o for n, o in objs.items() if n.endswith("_col")]
    for c in cols:
        c.hide_render = True
    out = os.path.join(QA_DIR, "final")
    os.makedirs(out, exist_ok=True)
    timings = {}
    for name in ("concept", "entrance", "close_ribs", "close_floor", "game_camera", "from_glass"):
        timings[name] = render_view(sc, name, out, "shell_interior")
    fog.hide_render = True
    timings["top_cutaway"] = render_view(sc, "top_cutaway", out, "shell_interior")
    # Collision overlay.
    cm = K.mat_simple("ColOverlay", (0.95, 0.12, 0.10), 0.5, alpha=0.38)
    for c in cols:
        c.data.materials.clear()
        c.data.materials.append(cm)
        c.hide_render = False
    timings["collision_top"] = render_view(sc, "top_cutaway", out, "shell_interior_collision")
    timings["collision_section"] = render_view(sc, "section", out, "shell_interior_collision")
    for c in cols:
        c.hide_render = True
    timings["section"] = render_view(sc, "section", out, "shell_interior")
    clock.stop()
    K.write_json(os.path.join(out, "render-stats.json"),
                 {"device": device, "resolution": [1920, 1080], "samples": samples,
                  "guests_in_scene": bool(guests), "seconds_per_render": timings, "stages": clock.stages,
                  "note": "Review lighting (area lights, chamber fog volume, 1.75 m human proxy) is added "
                          "in the render scene only; it is not part of the asset."})


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"geo": stage_geo, "build": stage_build, "render": stage_render,
     "all": lambda: (stage_build(), stage_render())}[stage]()
