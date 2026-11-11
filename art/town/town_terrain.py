"""Terrain of the town: terraces, retaining walls with parapets, stairs, side ramps, the town wall
with towers and the gatehouse, the cliff behind the temple and the slopes outside the walls.
Everything is emitted into the piece `town_terrain` in game space (see town_geo.py)."""

import math

import town_outside
import town_plan as P
from town_geo import RY, T, tint

STONE = (0.92, 0.90, 0.86)
STONE_DARK = (0.66, 0.65, 0.62)
STONE_CAP = (1.0, 0.98, 0.94)
WALL_STONE = (0.66, 0.63, 0.58)     # town wall and gatehouse: the old STONE tint blew out to white in full sun (owner 11.11)
COBBLE = (0.95, 0.93, 0.90)
GRASS = (0.85, 0.95, 0.75)
EARTH = (0.80, 0.70, 0.55)
ROCK = (0.80, 0.80, 0.78)
TIMBER_DARK = (0.42, 0.31, 0.22)
ROOF = (1.0, 0.92, 0.84)


def _hash(ix, iz, seed=0):
    h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, z, scale=8.0, seed=0):
    x, z = x / scale, z / scale
    ix, iz = math.floor(x), math.floor(z)
    fx, fz = x - ix, z - iz
    fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b = _hash(ix, iz, seed), _hash(ix + 1, iz, seed)
    c, d = _hash(ix, iz + 1, seed), _hash(ix + 1, iz + 1, seed)
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz


def paved(tname, x, z):
    return any(x0 <= x <= x1 and z0 <= z <= z1 for x0, x1, z0, z1 in P.PAVED[tname])


def near_house(x, z, margin):
    for h in P.HOUSES:
        x0, x1, z0, z1 = P.house_rect(h)
        if x0 - margin <= x <= x1 + margin and z0 - margin <= z <= z1 + margin:
            return True
    return False


def terraces(tb):
    """Terrace tops as 2 m cells: cobbles on the streets, grass and earth in the yards."""
    step = 2.0
    for tname, y, zn, zs in P.TERRACES:
        nx = int(2 * P.X_IN / step)
        nz = int((zs - zn) / step)
        for i in range(nx):
            for j in range(nz):
                x0, z0 = -P.X_IN + i * step, zn + j * step
                x1, z1 = x0 + step, z0 + step
                cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
                inside = any(r[0] + 0.4 <= x0 and x1 <= r[1] - 0.4 and r[2] + 0.4 <= z0 and z1 <= r[3] - 0.4
                             for r in (P.house_rect(h) for h in P.HOUSES))
                if inside:
                    continue
                is_paved = paved(tname, cx, cz)
                cols = []
                for (px, pz) in ((x0, z1), (x1, z1), (x1, z0), (x0, z0)):
                    n = 0.82 + 0.3 * vnoise(px, pz, 9.0, 3)
                    if near_house(px, pz, 0.7):
                        n *= 0.72
                    if is_paved:
                        cols.append(tint(COBBLE, n))
                    else:
                        e = vnoise(px, pz, 5.0, 11)
                        base = EARTH if e > 0.62 else GRASS
                        cols.append(tint(base, n))
                tb.quad("cobble" if is_paved else "ground", (x0, y, z1), (x1, y, z1), (x1, y, z0), (x0, y, z0), cols)
        tb.col_poly([(-P.X_IN - 1, y, zs), (P.X_IN + 1, y, zs), (P.X_IN + 1, y, zn), (-P.X_IN - 1, y, zn)])


def _openings(z_edge):
    """X intervals where the parapet on the edge at z_edge is open (stairs and ramp landings)."""
    out = []
    for s in P.STAIRS:
        if abs(s["z_top"] - z_edge) < 0.01:
            out.append((s["x0"], s["x1"]))
    for r in P.RAMPS:
        if abs(r["z0"] - z_edge) < 0.01:
            out.append(tuple(sorted((r["x_top"], r["x_land"]))))
    return sorted(out)


def retaining_walls(tb):
    """South faces of the upper terraces, with pilasters, a cap course and a parapet with openings."""
    for (_n0, y_lo, _a, _b), (_n1, y_hi, _c, z_edge) in zip(P.TERRACES, P.TERRACES[1:]):
        x0, x1 = -P.X_IN, P.X_IN
        seg = 4.0
        n = int((x1 - x0) / seg)
        for i in range(n):
            a, b = x0 + i * seg, x0 + (i + 1) * seg
            ca = tint(STONE, 0.86 + 0.22 * vnoise(a, y_lo, 6.0, 5))
            cb = tint(STONE, 0.86 + 0.22 * vnoise(b, y_lo, 6.0, 5))
            # sunk 0.4 m below the lower terrace so no light line shows at the foot (owner 11.11)
            tb.quad("stone", (a, y_lo - 0.4, z_edge), (b, y_lo - 0.4, z_edge), (b, y_hi, z_edge), (a, y_hi, z_edge),
                    [tint(ca, 0.55), tint(cb, 0.55), cb, ca])
        tb.col_poly([(x0, y_lo - 0.5, z_edge), (x1, y_lo - 0.5, z_edge), (x1, y_hi, z_edge), (x0, y_hi, z_edge)])
        # pilasters every 8 m (skipping the stairs) and a cap course
        opens = _openings(z_edge)
        for k in range(int((x1 - x0) / 8.0) + 1):
            px = x0 + 2.0 + k * 8.0
            if px > x1 - 1 or any(o0 - 1.2 <= px <= o1 + 1.2 for o0, o1 in opens):
                continue
            # pilaster with its own top (it stands proud of the wall), on a plinth aligned with it, both sunk into the
            # ground and set 2 cm into the wall face so no seam or offset shows (owner 11.11, town-v2 item 7)
            tb.box("stone", (px, (y_lo - 0.4 + y_hi) / 2, z_edge + 0.19), (0.9, y_hi - y_lo + 0.4, 0.42), STONE_DARK, skip="yz")
            tb.box("stone", (px, y_lo + 0.1, z_edge + 0.24), (1.1, 1.0, 0.52), STONE_DARK, skip="yz")
        # parapet with openings
        cuts = [x0] + [v for o in opens for v in o] + [x1]
        for a, b in zip(cuts[0::2], cuts[1::2]):
            if b - a < 0.2:
                continue
            tb.box("stone", ((a + b) / 2, y_hi + 0.42, z_edge - 0.22), (b - a, 0.84, 0.44), STONE, skip="y")
            tb.box("stone", ((a + b) / 2, y_hi + 0.90, z_edge - 0.22), (b - a + 0.12, 0.14, 0.60), STONE_CAP, skip="")
            tb.col_box(((a + b) / 2, y_hi + 0.5, z_edge - 0.22), (b - a, 1.0, 0.44))
            # end posts beside the openings
            for px in (a, b):
                if abs(px - x0) > 0.1 and abs(px - x1) > 0.1:
                    tb.box("stone", (px + (0.3 if px == a else -0.3), y_hi + 0.65, z_edge - 0.22), (0.7, 1.3, 0.72), STONE_DARK, skip="y")
                    tb.cyl("stone", (px + (0.3 if px == a else -0.3), y_hi + 1.3, z_edge - 0.22), 0.34, 0.0, 0.36, 4, STONE_CAP, cap_top=False, phase=math.pi / 4)


def _solid(tb, mat, verts, faces, col=STONE):
    """A closed convex solid from local vertices and faces (index lists in any order): every face is wound to point
    away from the solid's centroid, so nothing is one-sided or back-facing from any camera."""
    from mathutils import Vector as _V
    c = sum((_V(v) for v in verts), _V()) / len(verts)
    for f in faces:
        pts = [_V(verts[k]) for k in f]
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        fc = sum(pts, _V()) / len(pts)
        if n.dot(fc - c) < 0:
            f = list(reversed(f))
        cc = col[f[0]] if isinstance(col, dict) else col
        tb.poly(mat, [tuple(verts[k]) for k in f], cc)


def _slab(tb, mat, x0, x1, z_front, z_back, y_lo_f, y_hi_f, y_lo_b, y_hi_b, col=STONE, top_col=None):
    """A closed block between x0..x1 whose front (z_front) and back (z_back) heights may differ (a sloped wall)."""
    v = [(x0, y_lo_f, z_front), (x1, y_lo_f, z_front), (x1, y_hi_f, z_front), (x0, y_hi_f, z_front),
         (x0, y_lo_b, z_back), (x1, y_lo_b, z_back), (x1, y_hi_b, z_back), (x0, y_hi_b, z_back)]
    faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0]]
    _solid(tb, mat, v, faces, col)
    _solid(tb, mat, v, [[3, 2, 6, 7]], top_col or col)      # the sloped top (the centroid still comes from all 8 points)


def stairs(tb):
    """The main-axis stairs as one closed mass (owner 11.11: no floating slabs, no gaps, no see-through): every
    step is a solid block down into the ground, flanked by solid stone cheek walls that follow the slope."""
    for s in P.STAIRS:
        rise = s["y_top"] - s["y_bot"]
        run = s["z_bot"] - s["z_top"]
        n = max(2, round(rise / 0.165))
        r, t = rise / n, run / n
        x0, x1 = s["x0"], s["x1"]
        ybase = s["y_bot"] - 0.3
        for i in range(n):
            zf = s["z_bot"] - i * t          # front (south) edge of this step
            yt = s["y_bot"] + (i + 1) * r
            k = 0.9 + 0.14 * _hash(i, int(x0 * 7), 21)
            # one block per step, reaching back under the next one (overlap 2 cm) and down below the ground
            zb = zf - t - (0.02 if i < n - 1 else 0.0)
            tb.quad("stone", (x0, ybase, zf), (x1, ybase, zf), (x1, yt, zf), (x0, yt, zf), tint(STONE_DARK, k))           # riser (down to the base)
            tb.quad("stone", (x0, yt, zf), (x1, yt, zf), (x1, yt, zb), (x0, yt, zb), tint(STONE_CAP, k))                 # tread
        # the underside / back is closed by the terrace wall behind; the sides by the cheek walls below
        tb.col_poly([(x0, s["y_bot"], s["z_bot"]), (x1, s["y_bot"], s["z_bot"]), (x1, s["y_top"], s["z_top"]), (x0, s["y_top"], s["z_top"])])
        # cheek walls: solid sloped stone blocks 0.55 m wide, 0.55 m above the nosing line, down into the ground
        for side, xa in ((-1, x0), (1, x1)):
            xi, xo = xa, xa + side * 0.55
            lo, hi = sorted((xi, xo))
            zb, zt = s["z_bot"] + 0.3, s["z_top"]
            yb, ytp = s["y_bot"], s["y_top"]
            h = 0.55
            _slab(tb, "stone", lo, hi, zb, zt, ybase, yb + h, ybase, ytp + h, STONE, STONE_CAP)
            tb.col_poly([(xi, yb, zb), (xi, yb + 1.2, zb), (xi, ytp + 1.2, zt), (xi, ytp, zt)])
            # a low pier at the foot with a cap (closed, sunk into the ground)
            tb.box("stone", ((xi + xo) / 2, yb + 0.45, zb + 0.35), (0.8, 1.5, 0.8), STONE_DARK, skip="y")
            tb.box("stone", ((xi + xo) / 2, yb + 1.27, zb + 0.35), (0.96, 0.14, 0.96), STONE_CAP)
            tb.col_box(((xi + xo) / 2, yb + 0.7, zb + 0.35), (0.8, 1.4, 0.8))
            tb.socket(f"socket_lamp_{s['id']}_{'w' if side < 0 else 'e'}", ((xi + xo) / 2, yb + 2.3, zb + 0.35))


def ramps(tb):
    for r in P.RAMPS:
        z0, z1 = r["z0"], r["z1"]
        xb, xt, xl = r["x_bot"], r["x_top"], r["x_land"]
        yb, yt = r["y_bot"], r["y_top"]
        d = 1 if xt > xb else -1
        # slope deck and the landing (cobbles), counter-clockwise from above
        def top(xa, ya, xb_, yb_):
            pts = [(xa, ya, z1), (xb_, yb_, z1), (xb_, yb_, z0), (xa, ya, z0)]
            if xb_ < xa:
                pts = list(reversed(pts))
            return pts
        tb.poly("cobble", top(xb, yb, xt, yt), COBBLE, uv_dir=(1, 0, 0))
        tb.poly("cobble", top(xt, yt, xl, yt), COBBLE)
        tb.col_poly(top(xb, yb, xt, yt))
        tb.col_poly(top(xt, yt, xl, yt))
        # open (south) side wall under the slope and the landing, and the end wall
        pts = [(xb, yb, z1), (xl, yb, z1), (xl, yt, z1), (xt, yt, z1)]
        if d < 0:
            pts = list(reversed(pts))
        tb.poly("stone", pts, STONE)
        endp = [(xl, yb, z1), (xl, yb, z0), (xl, yt, z0), (xl, yt, z1)]
        if d < 0:
            endp = list(reversed(endp))
        tb.poly("stone", endp, STONE_DARK)
        tb.col_poly(pts)
        tb.col_poly(endp)
        # parapet along the open side (slope part and landing) and across the landing end
        def rail(pa, pb):
            tb.beam("stone", (pa[0], pa[1] + 0.4, z1 - 0.2), (pb[0], pb[1] + 0.4, z1 - 0.2), 0.4, 0.8, STONE)
            tb.beam("stone", (pa[0], pa[1] + 0.86, z1 - 0.2), (pb[0], pb[1] + 0.86, z1 - 0.2), 0.54, 0.12, STONE_CAP)
            tb.col_poly([(pa[0], pa[1], z1 - 0.4), (pb[0], pb[1], z1 - 0.4), (pb[0], pb[1] + 1.1, z1 - 0.4), (pa[0], pa[1] + 1.1, z1 - 0.4)])
            tb.col_poly([(pb[0], pb[1], z1 - 0.4), (pa[0], pa[1], z1 - 0.4), (pa[0], pa[1] + 1.1, z1 - 0.4), (pb[0], pb[1] + 1.1, z1 - 0.4)])
        rail((xb, yb), (xt, yt))
        rail((xt, yt), (xl, yt))
        tb.box("stone", (xl - d * 0.2, yt + 0.42, (z0 + z1) / 2), (0.4, 0.84, z1 - z0), STONE, skip="y")
        tb.col_box((xl - d * 0.2, yt + 0.5, (z0 + z1) / 2), (0.4, 1.0, z1 - z0))


def _merlons(tb, x0, z0, x1, z1, y, thick):
    """Crenellations along a wall top from (x0, z0) to (x1, z1)."""
    ln = math.hypot(x1 - x0, z1 - z0)
    n = max(1, int(ln / 2.2))
    for i in range(n):
        t = (i + 0.5) / n
        cx, cz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        along_x = abs(x1 - x0) > abs(z1 - z0)
        size = (1.1, 0.9, thick) if along_x else (thick, 0.9, 1.1)
        tb.box("stone", (cx, y + 0.45, cz), size, tint(STONE, 0.9 + 0.15 * _hash(i, int(cx + cz), 4)), skip="y")


def _tower_square(tb, cx, cz, y0, h, size=5.2, roof=True):
    tb.box("stone", (cx, y0 + h / 2 - 1.5, cz), (size, h + 3.0, size), STONE, skip="yY")
    tb.col_box((cx, y0 + h / 2, cz), (size, h + 2, size))
    # corbelled top band and a pyramid roof
    tb.box("stone", (cx, y0 + h + 0.35, cz), (size + 0.7, 0.7, size + 0.7), STONE_DARK)
    for sx in (-1, 1):
        for sz in (-1, 1):
            tb.box("stone", (cx + sx * size * 0.3, y0 + h - 2.0, cz + sz * (size / 2 + 0.03)), (0.5, 1.3, 0.06), (0.12, 0.11, 0.10), skip="y")
    if roof:
        tb.cyl("roof", (cx, y0 + h + 0.7, cz), (size + 1.3) * 0.7071, 0.0, size * 0.75, 4, ROOF, cap_top=False, phase=math.pi / 4, col_top=tint(ROOF, 0.8))
        tb.cyl("stone", (cx, y0 + h + 0.7 + size * 0.75 - 0.15, cz), 0.16, 0.05, 1.3, 6, (0.5, 0.42, 0.25), cap_top=True)


def _tower_round(tb, cx, cz, y0, h, r=3.4):
    tb.cyl("stone", (cx, y0 - 3.0, cz), r * 1.06, r, h + 3.0, 16, tint(STONE, 0.75), cap_top=False, col_top=STONE)
    tb.col_cyl((cx, y0 - 1.0, cz), r, h + 1.0, 10)
    tb.cyl("stone", (cx, y0 + h, cz), r + 0.35, r + 0.35, 0.7, 16, STONE_DARK, cap_top=True, cap_bot=True)
    tb.cyl("roof", (cx, y0 + h + 0.7, cz), r + 0.75, 0.0, r * 1.7, 16, ROOF, cap_top=False, col_top=tint(ROOF, 0.78))
    tb.cyl("stone", (cx, y0 + h + 0.7 + r * 1.7 - 0.2, cz), 0.16, 0.05, 1.5, 6, (0.5, 0.42, 0.25))


def town_walls(tb):
    """East, west and south walls with crenellations, towers where the terraces step, round corner towers."""
    xw = P.X_IN + P.WALL_T / 2
    for sx in (-1, 1):
        for tname, y, zn, zs in P.TERRACES:
            top = y + P.WALL_H
            tb.box("stone", (sx * xw, (top + y - 4.0) / 2, (zn + zs) / 2), (P.WALL_T, top - (y - 4.0), zs - zn), WALL_STONE, skip="y")
            tb.box("stone", (sx * (P.X_IN - 0.12), top - 0.25, (zn + zs) / 2), (0.24, 0.3, zs - zn), STONE_DARK, skip="")
            tb.col_poly([(sx * P.X_IN, y - 1, zs), (sx * P.X_IN, y - 1, zn), (sx * P.X_IN, top + 3, zn), (sx * P.X_IN, top + 3, zs)][::(1 if sx > 0 else -1)])
            _merlons(tb, sx * (xw + 0.45), zn, sx * (xw + 0.45), zs, top, 0.5)
        for (_n0, y_lo, _a, _b), (_n1, y_hi, _c, z_edge) in zip(P.TERRACES, P.TERRACES[1:]):
            _tower_square(tb, sx * (xw + 0.6), z_edge, y_lo, y_hi - y_lo + P.WALL_H + 3.0)
        _tower_round(tb, sx * (xw + 0.4), P.Z_SOUTH + P.WALL_T / 2 + 0.4, 0.0, P.WALL_H + 3.5)
    # south wall, both sides of the gatehouse
    zc = P.Z_SOUTH + P.WALL_T / 2
    for a, b in ((-P.X_IN, -5.6), (5.6, P.X_IN)):
        tb.box("stone", ((a + b) / 2, (P.WALL_H - 4.0) / 2, zc), (b - a, P.WALL_H + 4.0, P.WALL_T), WALL_STONE, skip="y")
        tb.box("stone", ((a + b) / 2, P.WALL_H - 0.25, P.Z_SOUTH + 0.12), (b - a, 0.3, 0.24), STONE_DARK)
        _merlons(tb, a, zc + 0.5, b, zc + 0.5, P.WALL_H, 0.5)
    tb.col_poly([(P.X_IN, -1, P.Z_SOUTH), (-P.X_IN, -1, P.Z_SOUTH), (-P.X_IN, P.WALL_H + 6, P.Z_SOUTH), (P.X_IN, P.WALL_H + 6, P.Z_SOUTH)])


def gatehouse(tb):
    """The lower gate: two piers, a round arch with voussoirs, open timber doors under a raised portcullis, a carved ring above."""
    z0, z1 = P.Z_SOUTH - 1.2, P.Z_SOUTH + 4.2     # north and south faces
    half, pier = 2.4, 3.3                          # half opening, pier width
    spring, top = 3.3, 10.6
    arch_top = spring + half
    for sx in (-1, 1):
        cx = sx * (half + pier / 2)
        tb.box("stone", (cx, top / 2 - 1.0, (z0 + z1) / 2), (pier, top + 2.0, z1 - z0), WALL_STONE, skip="yY")
        tb.box("stone", (cx, 0.5, (z0 + z1) / 2), (pier + 0.3, 1.0, z1 - z0 + 0.3), STONE_DARK, skip="y")
    # wall above the arch: the two faces as fans around the semicircle, and the intrados
    n = 12
    arc = [(math.cos(math.pi * i / n) * half, spring + math.sin(math.pi * i / n) * half) for i in range(n + 1)]
    for zf, front in ((z0, False), (z1, True)):
        for i in range(n):
            (xa, ya), (xb, yb) = arc[i], arc[i + 1]
            # voussoir band (darker) then the wall up to the top
            ra, rb = 1.0 + 0.55 / half, 1.0 + 0.55 / half
            va = (xa * ra, spring + (ya - spring) * ra)
            vb = (xb * rb, spring + (yb - spring) * rb)
            k = 0.82 + 0.2 * (i % 2)
            q = [(xa, ya, zf), (va[0], va[1], zf), (vb[0], vb[1], zf), (xb, yb, zf)]
            w = [(va[0], va[1], zf), (va[0], top, zf), (vb[0], top, zf), (vb[0], vb[1], zf)]
            if not front:
                q, w = list(reversed(q)), list(reversed(w))
            off = 0.06 if front else -0.06
            # the voussoir band stands 6 cm proud as a closed band (its outer and inner edges reach back to the wall
            # face): the loose offset polygons read as a ghost arc floating in front of the gate (owner 11.11)
            band = tint(tint(STONE_CAP, k), 0.70)
            tb.poly("stone", [(p[0], p[1], p[2] + off) for p in q], band)
            ia, ib, oa, ob = (xa, ya), (xb, yb), va, vb
            for (pa, pb) in ((ia, ib), (ob, oa)):
                e = [(pa[0], pa[1], zf), (pb[0], pb[1], zf), (pb[0], pb[1], zf + off), (pa[0], pa[1], zf + off)]
                cen = ((xa + xb) / 2 * 1.13, spring + ((ya + yb) / 2 - spring) * 1.13)   # a point mid-band
                mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
                dx, dy = pb[0] - pa[0], pb[1] - pa[1]
                if (dy * off) * (mid[0] - cen[0]) + (-dx * off) * (mid[1] - cen[1]) < 0:   # face away from the band
                    e = list(reversed(e))
                tb.poly("stone", e, tint(band, 0.8))
            tb.poly("stone", w, WALL_STONE)
    for i in range(n):
        (xa, ya), (xb, yb) = arc[i], arc[i + 1]
        tb.quad("stone", (xa, ya, z1), (xb, yb, z1), (xb, yb, z0), (xa, ya, z0), STONE_DARK)
    for sx in (-1, 1):   # jambs
        pts = [(sx * half, 0, z0), (sx * half, 0, z1), (sx * half, spring, z1), (sx * half, spring, z0)]
        tb.poly("stone", pts if sx < 0 else list(reversed(pts)), STONE_DARK)
    # open doors: two thick timber leaves swung in against the jambs (a little off the wall so they read
    # as doors), iron bands and a ring pull on the face that looks into the passage
    zd = z0 + 2.2
    IRON = (0.16, 0.15, 0.15)
    # the passage floor: cobbles from the town ground (z 34) under the arch to the outside road (z 35.6), which
    # had left a bare strip (owner 11.11, seen from above)
    tb.quad("cobble", (-half, 0.0, P.Z_SOUTH + 1.7), (half, 0.0, P.Z_SOUTH + 1.7), (half, 0.0, z0 - 0.1), (-half, 0.0, z0 - 0.1), COBBLE)
    tb.col_poly([(-half, 0.0, P.Z_SOUTH + 1.7), (half, 0.0, P.Z_SOUTH + 1.7), (half, 0.0, z0 - 0.1), (-half, 0.0, z0 - 0.1)])
    leaf, zh = half - 0.25, z0 + 2.5          # leaves 0.15 m shorter: the free end stays inside the passage
    for sx in (-1, 1):
        with tb.at(T(sx * (half - 0.05), 0, zh), RY(sx * 8)):
            xc = -sx * 0.13                                   # leaf centre: 0.22 thick, hinged on the jamb
            tb.box("timber", (xc, spring / 2 + 0.03, -leaf / 2), (0.22, spring - 0.06, leaf), TIMBER_DARK, uv_dir=(0, 1, 0))
            xf = xc - sx * 0.11                               # the face toward the passage
            for i in range(1, 5):                             # plank joints
                tb.box("timber", (xf - sx * 0.006, spring / 2 + 0.03, -i * leaf / 5), (0.012, spring - 0.2, 0.03), tint(TIMBER_DARK, 0.5), uv_dir=(0, 1, 0))
            for yy in (0.7, 1.9, 3.0):                        # iron bands, wrapped over the free edge
                tb.box("stone", (xc, yy, -leaf / 2 - 0.02), (0.30, 0.14, leaf + 0.06), IRON)
            for yy in (0.7, 1.9, 3.0):                        # hinge pins
                tb.cyl("stone", (xc, yy - 0.16, 0.04), 0.06, 0.06, 0.32, 8, IRON, cap_bot=True)
            with tb.at(T(xf - sx * 0.05, 1.5, -leaf + 0.5), RY(90)):
                tb.ring("stone", (0, 0, 0), 0.2, 0.13, 0.05, 12, (0.55, 0.42, 0.2))
    # the raised portcullis: an iron grille drawn up into the arch, its spiked feet hanging below the springing
    zp = z0 + 2.9
    for i in range(-4, 5):
        x = i * 0.5
        tb.box("stone", (x, (spring + 0.2 + spring + math.sqrt(half * half - x * x)) / 2, zp), (0.09, math.sqrt(half * half - x * x) - 0.2, 0.09), IRON, skip="Y")
        tb.cyl("stone", (x, spring + 0.02, zp), 0.005, 0.065, 0.18, 4, IRON, cap_top=False)
    for yy in (0.55, 1.45):
        cw = math.sqrt(half * half - yy * yy)
        tb.box("stone", (0, spring + yy, zp), (2 * cw, 0.1, 0.07), IRON, skip="xX")
    tb.col_box((0, spring / 2 + 1, zd), (2 * half, spring + 2 + half, 0.4))
    tb.col_box((0, top / 2, (z0 + z1) / 2 + 2.0), (2 * half + 2 * pier, top, 1.0))
    for sx in (-1, 1):
        tb.col_box((sx * (half + pier / 2), top / 2, (z0 + z1) / 2), (pier, top, z1 - z0))
    # carved ring above the arch (the round sign), a cap band and a hipped roof
    # the emblem stands well proud of the wall on a dark round field, so it reads as carved stone
    ey = arch_top + 2.1
    tb.ring("stone", (0, ey, z0 - 0.03), 1.32, 0.001, 0.06, 28, tint(STONE_DARK, 0.62))           # sunk field
    tb.ring("stone", (0, ey, z0 - 0.09), 1.44, 1.26, 0.18, 28, STONE_CAP)                         # moulded rim
    tb.ring("stone", (0, ey, z0 - 0.16), 1.02, 0.66, 0.32, 28, (1.0, 0.86, 0.60))                 # the ring
    tb.ring("stone", (0, ey, z0 - 0.34), 0.93, 0.75, 0.05, 28, (0.80, 0.62, 0.36))                # chiselled band
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        tb.box("stone", (math.cos(a) * 0.84, ey + math.sin(a) * 0.84, z0 - 0.35), (0.2, 0.2, 0.1), (0.78, 0.52, 0.2))
    w = 2 * (half + pier)
    tb.box("stone", (0, top + 0.3, (z0 + z1) / 2), (w + 0.6, 0.6, z1 - z0 + 0.6), STONE_DARK)
    ridge = top + 0.6 + 2.6
    ex, ez = w / 2 + 0.7, (z1 - z0) / 2 + 0.7
    zc = (z0 + z1) / 2
    rl = w / 2 - 2.2
    R = tint(ROOF, 0.95)
    tb.quad("roof", (-ex, top + 0.6, zc + ez), (ex, top + 0.6, zc + ez), (rl, ridge, zc), (-rl, ridge, zc), R, uv_dir=(1, 0, 0))
    tb.quad("roof", (ex, top + 0.6, zc - ez), (-ex, top + 0.6, zc - ez), (-rl, ridge, zc), (rl, ridge, zc), R, uv_dir=(1, 0, 0))
    tb.poly("roof", [(ex, top + 0.6, zc + ez), (ex, top + 0.6, zc - ez), (rl, ridge, zc)], tint(R, 0.9), uv_dir=(0, 0, 1))
    tb.poly("roof", [(-ex, top + 0.6, zc - ez), (-ex, top + 0.6, zc + ez), (-rl, ridge, zc)], tint(R, 0.9), uv_dir=(0, 0, 1))
    # banners on the piers (cloth with an amber ring), inside face
    for sx in (-1, 1):
        cx = sx * (half + pier / 2)
        tb.box("cloth", (cx, 6.2, z0 - 0.05), (1.3, 3.6, 0.04), (0.42, 0.16, 0.12), skip="z")
        tb.ring("stone", (cx, 6.7, z0 - 0.09), 0.42, 0.3, 0.03, 16, (0.95, 0.62, 0.18))
        tb.beam("timber", (cx - 0.8, 8.05, z0 - 0.1), (cx + 0.8, 8.05, z0 - 0.1), 0.08, 0.08, TIMBER_DARK)
        tb.socket(f"socket_lamp_gate_{'w' if sx < 0 else 'e'}", (cx, 3.4, z0 - 0.5))


def cliff(tb):
    """The rock face behind the temple and its grassy top."""
    y0 = P.TERRACE_Y["t3"]
    rows = [(0.0, 0.0), (2.5, -1.0), (5.5, -2.0), (9.0, -4.0), (12.0, -6.0), (14.5, -9.5)]
    xs = [-66 + i * 4.0 for i in range(34)]
    def pt(ix, ir):
        x = xs[ix]
        h, back = rows[ir]
        n = vnoise(x, ir * 7.0, 9.0, 31) - 0.5
        n2 = vnoise(x, ir * 3.0, 3.5, 32) - 0.5
        edge = 1.0 if ir > 0 else 0.0
        # three broad ledges break the skyline (GPT review): a shoulder in the west, a saddle behind the
        # shrine, a higher mass in the east
        ledge = 0.72 if x < -34 else (0.56 if x < 8 else (1.0 if x < 40 else 0.8))
        ledge += 0.10 * (vnoise(x, 5.0, 18.0, 35) - 0.5)
        hh = h * ledge if ir >= 3 else h * (1.0 + (ledge - 1.0) * ir / 3.0)
        return (x + n2 * 1.2 * edge, y0 + hh + n2 * 0.8 * edge, P.Z_NORTH + back + n * 3.2 * edge - (2.0 if abs(x) > 54 else 0.0) * 0)
    for ix in range(len(xs) - 1):
        for ir in range(len(rows) - 1):
            a, b, c, d = pt(ix, ir), pt(ix + 1, ir), pt(ix + 1, ir + 1), pt(ix, ir + 1)
            k0 = 0.62 + 0.25 * vnoise(a[0], a[1], 5.0, 34) + 0.05 * ir
            k1 = 0.62 + 0.25 * vnoise(b[0], b[1], 5.0, 34) + 0.05 * ir
            tb.quad("rock", a, b, c, d, [tint(ROCK, k0), tint(ROCK, k1), tint(ROCK, k1 + 0.08), tint(ROCK, k0 + 0.08)])
        # top: grass running back and down
        a, b = pt(ix, len(rows) - 1), pt(ix + 1, len(rows) - 1)
        tb.quad("ground", a, b, (b[0], b[1] - 6.0, b[2] - 34.0), (a[0], a[1] - 6.0, a[2] - 34.0), tint(GRASS, 0.8))
    # vegetation groups on the ledges: a few broad clumps, not noise everywhere
    import random
    rr = random.Random(77)
    for (gx, gz, gy, count, rad) in ((-48.0, -66.5, y0 + 10.6, 5, 2.6), (-12.0, -66.0, y0 + 8.4, 4, 2.2), (26.0, -67.0, y0 + 14.6, 6, 2.8), (50.0, -66.0, y0 + 11.8, 3, 2.4)):
        for _i in range(count):
            px, pz = gx + rr.uniform(-6, 6), gz + rr.uniform(-1.5, 2.5)
            col = rr.choice([(0.50, 0.70, 0.34), (0.44, 0.64, 0.30), (0.62, 0.72, 0.34)])
            tb.cyl("timber", (px, gy - 0.6, pz), 0.22, 0.12, 2.6, 6, tint(TIMBER_DARK, 0.9), cap_top=False)
            tb.blob("foliage", (px, gy + 2.6, pz), rad * rr.uniform(0.7, 1.05), col, seed=rr.randrange(1 << 30), sub=2)
            tb.blob("foliage", (px + rr.uniform(-1, 1), gy + 0.5, pz + 0.8), rad * 0.5, tint(col, 0.9), seed=rr.randrange(1 << 30), sub=1)
    tb.col_poly([(P.X_IN + 8, y0 - 1, P.Z_NORTH), (-P.X_IN - 8, y0 - 1, P.Z_NORTH), (-P.X_IN - 8, y0 + 26, P.Z_NORTH - 4), (P.X_IN + 8, y0 + 26, P.Z_NORTH - 4)])


def _edge_y(z):
    """Ground height just outside the east / west wall (the terraces smoothed along z)."""
    pts = [(60.0, -3.0), (34.0, -1.0), (12.0, 0.6), (-2.0, 2.4), (-30.0, 6.0), (-56.0, 8.6), (-70.0, 16.0), (-100.0, 12.0)]
    for (za, ya), (zb, yb) in zip(pts, pts[1:]):
        if zb <= z <= za:
            t = (za - z) / (za - zb)
            return ya + (yb - ya) * t
    return pts[0][1] if z > pts[0][0] else pts[-1][1]


def skirt(tb, legacy_front=False):
    """Slopes outside the east, west and north walls falling into the mist. The hillside in front of the lower
    gate (z beyond the south wall) is town_outside.py; `legacy_front` rebuilds the bare slope with the straight
    44-degree road that stood there before (only for the before / after sheet)."""
    xo = P.X_IN + P.WALL_T
    xs = sorted(set([-118, -104, -90, -78, -68, -60, -xo, -44, -33, -22, -12, -2.6, 2.6, 12, 22, 33, 44, xo, 60, 68, 78, 90, 104, 118]))
    zs = sorted(set([-66, -56, -44, -30, -16, -2, 12, 23, P.Z_SOUTH + P.WALL_T, 42, 50, 60, 72, 86, 102, 118]))
    def h(x, z):
        dx = max(0.0, abs(x) - xo)
        dz = max(0.0, z - (P.Z_SOUTH + P.WALL_T))
        d = math.hypot(dx, dz)
        base = _edge_y(min(z, P.Z_SOUTH + P.WALL_T)) if dx > 0 or dz > 0 else 0.0
        n = (vnoise(x, z, 26.0, 51) - 0.5) * min(d, 30.0) * 0.5
        return base - d * 0.62 - (d * d) * 0.004 + n
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            if abs(cx) < xo and cz < P.Z_SOUTH + P.WALL_T:
                continue
            if cz < P.Z_NORTH - 2 and abs(cx) < 66:
                continue
            if z0 >= P.Z_SOUTH + P.WALL_T - 0.01 and not legacy_front:
                continue
            road = abs(cx) < 2.7 and cz > P.Z_SOUTH
            cols = []
            pts = []
            for (px, pz) in ((x0, z1), (x1, z1), (x1, z0), (x0, z0)):
                y = h(px, pz)
                fade = max(0.0, min(1.0, (-y - 4.0) / 26.0))
                base = COBBLE if road else (GRASS if vnoise(px, pz, 14.0, 52) > 0.4 else ROCK)
                k = 0.75 + 0.3 * vnoise(px, pz, 11.0, 53)
                c = tint(base, k)
                c = (c[0] * (1 - fade) + 1.25 * fade, c[1] * (1 - fade) + 1.3 * fade, c[2] * (1 - fade) + 1.38 * fade)
                cols.append(c)
                pts.append((px, y, pz))
            tb.quad("cobble" if road else "ground", *pts, cols)


def build(tb, legacy_front=False):
    tb.piece = "town_terrain"
    terraces(tb)
    retaining_walls(tb)
    stairs(tb)
    ramps(tb)
    town_walls(tb)
    gatehouse(tb)
    cliff(tb)
    skirt(tb, legacy_front)
    if not legacy_front:
        town_outside.build(tb)
    tb.socket("socket_spawn", (P.SPAWN["x"], P.SPAWN["y"], P.SPAWN["z"]), 180.0)
    _ = (RY, T)
