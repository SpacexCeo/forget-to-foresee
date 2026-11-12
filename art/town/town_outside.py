"""The hillside outside the lower gate (docs/town.md, "Outside the walls"): a meadow shoulder below the
south wall with a winding cobbled road, a footpath to the casting field, flat clearings, trees, shrubs,
grass tufts, wildflowers and boulders; its far edge falls away into the cloud sea.

Everything is emitted into the piece `town_terrain` in game space (Y up, +Z south, gate at z 34):
ground and footpath -> "ground", road -> "cobble" (both are the walkable floor beyond the walls, see
game/src/scenes/town-outside.js), plants -> "foliage" / "flower" (M_Town_Foliage*, so the client's wind
moves them), trunks -> "timber", boulders -> "rock". Trunks and big boulders get simple colliders.

The module has no Blender dependency besides the builder it is handed: `python3 town_outside.py` prints
the slope report (road, footpath and clearings must stay under 30 degrees)."""

import bisect
import math
import random

Z0 = 35.6            # outer face of the south wall (P.Z_SOUTH + P.WALL_T): the seam with the old skirt
XO = 53.6            # outer face of the east / west walls
Z_END = 152.0
X_END = 118.0

GRASS = (0.85, 0.95, 0.75)
GRASS_DRY = (1.0, 0.96, 0.66)
EARTH = (0.80, 0.70, 0.55)
ROCK = (0.80, 0.80, 0.78)
COBBLE = (0.95, 0.93, 0.90)
TIMBER = (0.52, 0.40, 0.30)
MIST = (1.25, 1.3, 1.38)
# the town's tree crowns (town_houses.tree) plus one deeper green for the conifers
CROWNS = [(0.62, 0.82, 0.42), (0.55, 0.78, 0.40), (0.78, 0.82, 0.38), (0.88, 0.74, 0.34)]
PINE = (0.42, 0.62, 0.36)
PETALS = [(0.95, 0.93, 0.86), (0.98, 0.80, 0.22), (0.86, 0.22, 0.16), (0.66, 0.50, 0.90), (0.95, 0.56, 0.66), (0.40, 0.56, 0.95)]

# Flat places: (name, x, z, radius of the level floor, blend width)
CLEARINGS = [
    ("casting_field", -27.0, 62.0, 13.0, 9.0),
    ("bend_terrace", 36.0, 66.0, 7.5, 7.0),
    ("lookout", 13.0, 103.0, 7.0, 7.0),
]
# The cobbled road from the gate: two switchbacks down to the lookout. (x, z) control points.
ROAD = [(0.0, 35.6), (0.0, 39.5), (1.0, 43.5), (6.0, 48.5), (15.0, 53.5), (25.0, 57.5), (33.0, 61.0), (37.5, 66.0),
        (35.0, 71.5), (26.0, 75.0), (13.0, 77.5), (0.0, 79.0), (-12.0, 81.5), (-20.0, 85.5), (-22.5, 91.0),
        (-18.0, 96.0), (-8.0, 99.0), (3.0, 101.0), (12.0, 103.0)]
# The footpath (trodden earth) from the road to the casting field.
PATH = [(0.5, 42.5), (-6.0, 45.0), (-13.0, 47.5), (-19.0, 51.0), (-22.5, 56.0)]
ROAD_HALF = 2.3
PATH_HALF = 0.9
ROAD_GRADE = 0.16     # rise over run along the road (about 9 degrees)
FLOOR_Y = -110.0      # the foot of the hill, deep in the cloud sea (the client's kill height is -118)


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


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def tint(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)


def mix(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


# ---------------------------------------------------------------- the seam with the old skirt

_OLD_XS = [-118, -104, -90, -78, -68, -60, -XO, -44, -33, -22, -12, -2.6, 2.6, 12, 22, 33, 44, XO, 60, 68, 78, 90, 104, 118]


def _old_h(x):
    """Height of the side slopes (town_terrain.skirt) on the line z = Z0, at one of its grid columns."""
    dx = max(0.0, abs(x) - XO)
    if dx <= 0:
        return 0.0
    base = -3.0 + (60.0 - Z0) / 26.0 * 2.0      # town_terrain._edge_y(Z0)
    n = (vnoise(x, Z0, 26.0, 51) - 0.5) * min(dx, 30.0) * 0.5
    return base - dx * 0.62 - dx * dx * 0.004 + n


def seam(x):
    """The old skirt's edge at z = Z0: linear between its columns, so the two meshes meet without a gap."""
    x = max(-X_END, min(X_END, x))
    i = max(1, min(len(_OLD_XS) - 1, bisect.bisect_left(_OLD_XS, x)))
    a, b = _OLD_XS[i - 1], _OLD_XS[i]
    t = (x - a) / (b - a)
    return _old_h(a) * (1 - t) + _old_h(b) * t


# ---------------------------------------------------------------- the hill

def raw_h(x, z):
    """The meadow shoulder without roads and clearings: gentle below the wall, steeper further out, then the
    edge; it also falls away to both sides."""
    dz = max(0.0, z - Z0)
    y = -(0.15 * dz + 0.00214 * dz * dz)
    if dz > 72.0:
        y -= 0.02 * (dz - 72.0) ** 2
    dx = max(0.0, abs(x) - 62.0)
    y -= 0.55 * dx + 0.006 * dx * dx
    amp = smooth(2.0, 26.0, dz)
    y += amp * ((vnoise(x, z, 34.0, 61) - 0.5) * 3.6 + (vnoise(x, z, 13.0, 62) - 0.5) * 1.1)
    return max(y, FLOOR_Y)


def _catmull(pts, step=1.0):
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int(math.dist(p1, p2) / step))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def _clearing_y():
    # the casting field is banked up a little: a shelf on the slope, an easy walk from the road; the lookout a
    # little too, so the road (held to ROAD_GRADE) arrives level with its paving instead of 0.4 m above it
    lift = {"casting_field": 2.2, "lookout": 0.6}
    return {name: raw_h(cx, cz) + lift.get(name, 0.0) for name, cx, cz, _r, _b in CLEARINGS}


def _with_clearings(x, z, cy):
    y = raw_h(x, z)
    for name, cx, cz, r, blend in CLEARINGS:
        w = 1.0 - smooth(r, r + blend, math.hypot(x - cx, z - cz))
        if w > 0:
            y += (cy[name] - y) * w
    return y


def _profile(line, cy, flat_start, y_start=None):
    """Heights along a path: it follows the hill but never climbs and never drops faster than ROAD_GRADE."""
    ys = []
    for i, (x, z) in enumerate(line):
        f = _with_clearings(x, z, cy)
        if i == 0:
            ys.append(f if y_start is None else y_start)
            continue
        ds = math.dist(line[i - 1], line[i])
        prev = ys[-1]
        ys.append(prev if i < flat_start else min(prev, max(f, prev - ROAD_GRADE * ds)))
    for _ in range(3):      # soften the kinks; the ends stay put
        ys = [ys[0]] + [(ys[i - 1] + 2 * ys[i] + ys[i + 1]) / 4 if i >= flat_start else ys[i] for i in range(1, len(ys) - 1)] + [ys[-1]]
    return ys


class Hill:
    def __init__(self):
        self.cy = _clearing_y()
        self.road = _catmull(ROAD)
        self.path = _catmull(PATH)
        for _ in range(3):      # the terraces on the road take the road's height, the road is level across them
            self.road_y = _profile(self.road, self.cy, 5, 0.0)
            for name, cx, cz, _r, _b in CLEARINGS[1:]:
                self.cy[name] = self.road_y[self._nearest(self.road, cx, cz)[1]]
        # the footpath leaves the road and comes down evenly to the floor of the casting field
        name, cx, cz, r, _b = CLEARINGS[0]
        y0 = self.road_y[self._nearest(self.road, PATH[0][0], PATH[0][1])[1]]
        run = [0.0]
        for a, b in zip(self.path, self.path[1:]):
            run.append(run[-1] + math.dist(a, b))
        rim = next((run[i] for i, (x, z) in enumerate(self.path) if math.hypot(x - cx, z - cz) < r), run[-1])
        self.path_y = [y0 + (self.cy[name] - y0) * smooth(5.0, rim, s) for s in run]
        xs = [-X_END, -108.0, -98.0, -90.0, -83.0, -77.0, -72.0]
        x = -68.0
        while x < 68.01:
            xs.append(round(x, 3))
            x += 1.6
        self.xs = xs + [72.0, 77.0, 83.0, 90.0, 98.0, 108.0, X_END]
        zs, z = [], Z0
        while z < 112.0:
            zs.append(round(z, 3))
            z += 1.6
        self.zs = zs + [115.0, 119.0, 124.0, 130.0, 137.0, 144.0, Z_END]
        self.Y = [[self.h(x, z) for z in self.zs] for x in self.xs]

    @staticmethod
    def _nearest(line, x, z):
        best, bi, bt = 1e18, 0, 0.0
        for i in range(len(line) - 1):
            (ax, az), (bx, bz) = line[i], line[i + 1]
            vx, vz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz + 1e-12)))
            d = (x - ax - vx * t) ** 2 + (z - az - vz * t) ** 2
            if d < best:
                best, bi, bt = d, i, t
        return math.sqrt(best), bi, bt

    def road_dist(self, x, z):
        return self._nearest(self.road, x, z)[0]

    def path_dist(self, x, z):
        return self._nearest(self.path, x, z)[0]

    def h(self, x, z):
        """The analytic hill (the mesh samples it on a grid; plants stand on the mesh, see `ground`)."""
        y = _with_clearings(x, z, self.cy)
        d, i, t = self._nearest(self.path, x, z)
        w = 1.0 - smooth(PATH_HALF + 1.3, PATH_HALF + 7.0, d)
        if w > 0:
            y += (self.path_y[i] * (1 - t) + self.path_y[i + 1] * t - y) * w
        d, i, t = self._nearest(self.road, x, z)
        w = 1.0 - smooth(ROAD_HALF + 0.9, ROAD_HALF + 7.5, d)
        if w > 0:
            y += (self.road_y[i] * (1 - t) + self.road_y[i + 1] * t - y) * w
        w = smooth(0.0, 10.0, z - Z0)
        return seam(x) * (1 - w) + y * w

    def ground(self, x, z):
        """Height of the triangulated ground under (x, z)."""
        i = max(1, min(len(self.xs) - 1, bisect.bisect_right(self.xs, x))) - 1
        j = max(1, min(len(self.zs) - 1, bisect.bisect_right(self.zs, z))) - 1
        u = max(0.0, min(1.0, (x - self.xs[i]) / (self.xs[i + 1] - self.xs[i])))
        v = max(0.0, min(1.0, (z - self.zs[j]) / (self.zs[j + 1] - self.zs[j])))
        ya, yb, yc, yd = self.Y[i][j + 1], self.Y[i + 1][j + 1], self.Y[i + 1][j], self.Y[i][j]
        if u + v >= 1.0:
            return yb + (ya - yb) * (1 - u) + (yc - yb) * (1 - v)
        return yd + (yc - yd) * u + (ya - yd) * v

    def slope(self, x, z, e=0.8):
        gx = (self.ground(x + e, z) - self.ground(x - e, z)) / (2 * e)
        gz = (self.ground(x, z + e) - self.ground(x, z - e)) / (2 * e)
        return math.hypot(gx, gz)

    def in_clearing(self, x, z, margin=0.0):
        return any(math.hypot(x - cx, z - cz) < r + margin for _n, cx, cz, r, _b in CLEARINGS)


_HILL = None   # set by build(): fade() keeps the road, the clearings and what stands on them in full colour


def floor_keep(x, z):
    """1 on the road and the clearings (and a few metres around), 0 out on the open slope."""
    if _HILL is None or x is None:
        return 0.0
    k = 1.0 - smooth(ROAD_HALF + 1.0, ROAD_HALF + 7.0, _HILL.road_dist(x, z))
    for _n, cx, cz, r, b in CLEARINGS:
        k = max(k, 1.0 - smooth(r + 1.0, r + b + 5.0, math.hypot(x - cx, z - cz)))
    return k


def fade(c, y, z, x=None):
    """Vertex colour sinking into the cloud sea (the old skirt's fade near the seam, later further out). The road
    and the clearings never fade: the lookout at -20 m read as a flat white disc (monster play-test 12.11)."""
    f0 = 4.0 + 8.0 * smooth(0.0, 10.0, z - Z0)
    f = max(0.0, min(1.0, (-y - f0) / 26.0)) * (1.0 - floor_keep(x, z))
    return mix(c, MIST, f)


# ---------------------------------------------------------------- geometry

def _ground(tb, hill):
    xs, zs, Y = hill.xs, hill.zs, hill.Y
    cols = []
    for i, x in enumerate(xs):
        row = []
        for j, z in enumerate(zs):
            y = Y[i][j]
            s = hill.slope(x, z)
            k = 0.78 + 0.3 * vnoise(x, z, 11.0, 53)
            c = mix(GRASS, GRASS_DRY, smooth(0.45, 0.8, vnoise(x, z, 19.0, 64)) * 0.55)
            c = mix(c, EARTH, smooth(0.66, 0.8, vnoise(x, z, 6.0, 65)) * 0.7)
            c = mix(c, ROCK, smooth(0.62, 0.95, s))
            dr, dp = hill.road_dist(x, z), hill.path_dist(x, z)
            c = mix(c, EARTH, 0.75 * (1.0 - smooth(ROAD_HALF - 0.4, ROAD_HALF + 1.6, dr)))
            c = mix(c, tint(EARTH, 1.08), 0.9 * (1.0 - smooth(PATH_HALF - 0.2, PATH_HALF + 1.2, dp)))
            row.append(fade(tint(c, k), y, z, x))
        cols.append(row)
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            a, b, c, d = (i, j + 1), (i + 1, j + 1), (i + 1, j), (i, j)
            def P(q):
                return (xs[q[0]], Y[q[0]][q[1]], zs[q[1]])
            def U(q):
                return (xs[q[0]], -zs[q[1]])
            def C(q):
                return cols[q[0]][q[1]]
            for tri in ((a, b, c), (a, c, d)):
                tb.poly("ground", [P(q) for q in tri], [C(q) for q in tri], uv=[U(q) for q in tri])


def _road(tb, hill):
    line, ys = hill.road, hill.road_y
    rows, s = [], 0.0
    for i, (x, z) in enumerate(line):
        a, b = line[max(0, i - 1)], line[min(len(line) - 1, i + 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1.0
        nx, nz = tz / ln, -tx / ln            # to the right of the direction of travel
        if i:
            s += math.dist(line[i - 1], line[i])
        half = 2.4 if s < 6.0 else ROAD_HALF * (0.94 + 0.1 * vnoise(s, 0.0, 9.0, 71))
        lift = 0.02 + 0.04 * smooth(0.0, 3.0, s)
        row = []
        for t in (-1.0, -0.4, 0.4, 1.0):
            px, pz = x + nx * half * t, z + nz * half * t
            crown = 0.03 * (1.0 - abs(t))
            k = (0.8 if abs(t) > 0.9 else 0.94) + 0.14 * vnoise(px, pz, 5.0, 72)
            row.append(((px, ys[i] + lift + crown, pz), fade(tint(COBBLE, k), ys[i], pz, px)))
        rows.append(row)
    for (r0, r1), (p0, p1) in zip(zip(rows, rows[1:]), zip(line, line[1:])):
        if math.dist(p0, LOOKOUT) < 4.9 and math.dist(p1, LOOKOUT) < 4.9:
            continue    # the road ends at the lookout's kerb: the paving takes over
        for k in range(3):
            # counter-clockwise from above: travel runs r0 -> r1, k grows to the right
            quad = [r0[k + 1], r0[k], r1[k], r1[k + 1]]
            for tri in ((0, 1, 2), (0, 2, 3)):
                pts = [quad[q][0] for q in tri]
                tb.poly("cobble", pts, [quad[q][1] for q in tri], uv=[(p[0], -p[2]) for p in pts])


def _tree(tb, hill, x, z, rr, kind):
    y = hill.ground(x, z) - 0.15
    if kind == "pine":
        h = rr.uniform(6.5, 9.5)
        r = h * 0.22
        tb.cyl("timber", (x, y, z), 0.26, 0.12, h * 0.45, 7, fade(tint(TIMBER, 0.7), y, z, x), cap_top=False)
        base = tint(PINE, rr.uniform(0.9, 1.1))
        for k in range(4):
            t = k / 3.0
            tb.blob("foliage", (x + rr.uniform(-0.15, 0.15), y + h * (0.36 + 0.5 * t), z + rr.uniform(-0.15, 0.15)), r * (1.0 - 0.62 * t),
                    fade(tint(base, 0.92 + 0.12 * t), y, z, x), seed=rr.randrange(1 << 30), squash=1.25, sub=2)
    else:
        h = rr.uniform(4.8, 7.2)
        r = h * rr.uniform(0.36, 0.44)
        lean = rr.uniform(-0.3, 0.3)
        tb.cyl("timber", (x, y, z), 0.34, 0.2, h * 0.5, 8, fade(tint(TIMBER, 0.8), y, z, x), cap_top=False)
        tb.cyl("timber", (x, y + h * 0.5, z), 0.2, 0.1, h * 0.3, 6, fade(tint(TIMBER, 0.8), y, z, x), cap_top=False)
        base = rr.choice(CROWNS)
        for i in range(5):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0.0, r * 0.55) if i else 0.0
            tb.blob("foliage", (x + lean + math.cos(a) * rad, y + h * rr.uniform(0.62, 0.92), z + math.sin(a) * rad), r * rr.uniform(0.55, 0.8),
                    fade(tint(base, rr.uniform(0.85, 1.1)), y, z, x), seed=rr.randrange(1 << 30), sub=2)
    tb.col_cyl((x, y, z), 0.38, 3.0, 6)


def _shrub(tb, hill, x, z, rr):
    y = hill.ground(x, z)
    r = rr.uniform(0.55, 1.15)
    base = rr.choice(CROWNS + [PINE])
    for _i in range(rr.choice((2, 3))):
        ox, oz = rr.uniform(-0.6, 0.6) * r, rr.uniform(-0.6, 0.6) * r
        rb = r * rr.uniform(0.6, 1.0)
        tb.blob("foliage", (x + ox, hill.ground(x + ox, z + oz) + rb * 0.45, z + oz), rb, fade(tint(base, rr.uniform(0.8, 1.05)), y, z, x),
                seed=rr.randrange(1 << 30), squash=0.72, sub=1)


def _rock(tb, hill, x, z, rr, r):
    y = hill.ground(x, z)
    c = fade(tint(ROCK, rr.uniform(0.62, 0.9)), y, z, x)
    sub = 2 if r > 1.2 else 1
    tb.blob("rock", (x, y + r * 0.22, z), r, c, seed=rr.randrange(1 << 30), squash=rr.uniform(0.55, 0.8), sub=sub, col_var=0.07, jitter=0.24)
    if r > 0.9:
        tb.col_cyl((x, y - 0.3, z), r * 0.8, r * 0.75 + 0.3, 6)
        for _i in range(rr.choice((1, 2))):   # a chip or two beside it
            a = rr.uniform(0, math.tau)
            px, pz = x + math.cos(a) * r * 1.25, z + math.sin(a) * r * 1.25
            tb.blob("rock", (px, hill.ground(px, pz) + r * 0.08, pz), r * rr.uniform(0.25, 0.4), c, seed=rr.randrange(1 << 30), squash=0.6, sub=1, col_var=0.07, jitter=0.24)


def _blade(tb, mat, base, tip, half, c0, c1, a):
    """A tapered blade standing from `base` to `tip`, turned by `a` around Y (one triangle, double-sided)."""
    dx, dz = math.cos(a) * half, math.sin(a) * half
    pts = [(base[0] - dx, base[1], base[2] - dz), (base[0] + dx, base[1], base[2] + dz), tip]
    hgt = tip[1] - base[1]
    tb.poly(mat, pts, [c0, c0, c1], uv=[(base[0] - half, base[1]), (base[0] + half, base[1]), (base[0], base[1] + hgt)])


def _tuft(tb, hill, x, z, rr, tall):
    y = hill.ground(x, z) - 0.03
    base = mix((0.60, 0.80, 0.40), (0.86, 0.84, 0.42), rr.random() * (0.8 if tall else 0.45))
    c0, c1 = fade(tint(base, 0.62), y, z, x), fade(tint(base, 1.12), y, z, x)
    for _i in range(rr.choice((5, 6, 7))):
        a = rr.uniform(0, math.tau)
        hgt = rr.uniform(0.32, 0.6) * (1.6 if tall else 1.0)
        out = rr.uniform(0.05, 0.3) * hgt
        bx, bz = x + rr.uniform(-0.16, 0.16), z + rr.uniform(-0.16, 0.16)
        la = rr.uniform(0, math.tau)
        _blade(tb, "foliage", (bx, y, bz), (bx + math.cos(la) * out, y + hgt, bz + math.sin(la) * out), rr.uniform(0.05, 0.085), c0, c1, a)


def _flower(tb, hill, x, z, rr, petal):
    y = hill.ground(x, z) - 0.02
    hgt = rr.uniform(0.28, 0.55)
    lx, lz = rr.uniform(-0.06, 0.06), rr.uniform(-0.06, 0.06)
    stem = fade((0.36, 0.52, 0.22), y, z, x)
    _blade(tb, "foliage", (x, y, z), (x + lx, y + hgt, z + lz), 0.022, stem, stem, rr.uniform(0, math.tau))
    # the head: a small flat-topped diamond of six petals around a warm heart
    r = rr.uniform(0.055, 0.09)
    top = (x + lx, y + hgt + 0.02, z + lz)
    c = fade(tint(petal, rr.uniform(0.9, 1.08)), y, z, x)
    heart = fade((0.98, 0.78, 0.2), y, z, x)
    a0 = rr.uniform(0, math.tau)
    ring = [(top[0] + math.cos(a0 + math.tau * k / 6) * r, top[1] + 0.035 + rr.uniform(-0.01, 0.01), top[2] - math.sin(a0 + math.tau * k / 6) * r) for k in range(6)]
    for k in range(6):
        p, q = ring[k], ring[(k + 1) % 6]
        tb.poly("flower", [top, p, q], [heart, c, c], uv=[(0.5, 0.5), (0.0, 0.0), (1.0, 0.0)])


def _flora(tb, hill):
    rr = random.Random(20261111)

    def free(x, z, road=4.5, clearing=None):
        if z < Z0 + 1.2 or abs(x) > 96 or z > 122:
            return False
        if hill.road_dist(x, z) < road or hill.path_dist(x, z) < min(road, 2.2):
            return False
        return clearing is None or not hill.in_clearing(x, z, clearing)

    # --- trees: groves on the rim of the casting field, outside the road's bends, and below the walls
    groves = [(-44.0, 56.0, 4, "round"), (-36.0, 79.0, 4, "round"), (-12.0, 66.0, 3, "round"), (20.0, 44.0, 3, "round"),
              (49.0, 56.0, 4, "pine"), (20.0, 66.0, 2, "round"), (-34.0, 44.0, 2, "round"), (48.0, 80.0, 3, "pine"),
              (2.0, 88.0, 2, "round"), (-40.0, 98.0, 2, "pine")]
    trees = []
    for gx, gz, count, kind in groves:
        placed = tries = 0
        while placed < count and tries < 200:
            tries += 1
            x, z = gx + rr.uniform(-7.5, 7.5), gz + rr.uniform(-6.0, 6.0)
            if not free(x, z, 5.5, 2.0) or hill.slope(x, z) > 0.75 or any(math.hypot(x - tx, z - tz) < 4.2 for tx, tz in trees):
                continue
            k = kind if rr.random() < 0.8 else ("pine" if kind == "round" else "round")
            _tree(tb, hill, x, z, rr, k)
            trees.append((x, z))
            placed += 1
    # --- boulders and rocks
    big = [(-12.5, 57.5, 1.9), (-41.0, 67.0, 1.5), (9.0, 49.5, 1.3), (42.0, 73.0, 2.1), (-6.0, 72.0, 1.4), (22.0, 88.0, 1.8),
           (-30.0, 92.0, 2.2), (30.0, 49.0, 1.2), (-52.0, 48.0, 1.7), (58.0, 60.0, 2.0), (3.0, 108.0, 1.6)]
    rocks = 0
    for x, z, r in big:
        if free(x, z, ROAD_HALF + r + 0.8, 0.5 + r):
            _rock(tb, hill, x, z, rr, r)
            rocks += 1
    for _i in range(600):
        if rocks >= 46:
            break
        x, z = rr.uniform(-80, 80), rr.uniform(Z0 + 2, 116)
        if free(x, z, 3.4, 0.5) and (hill.slope(x, z) > 0.4 or rr.random() < 0.25):
            _rock(tb, hill, x, z, rr, rr.uniform(0.3, 0.8))
            rocks += 1
    # --- shrubs: around the groves, along the walls and on the steeper banks
    shrubs = 0
    for _i in range(3000):
        if shrubs >= 70:
            break
        x, z = rr.uniform(-84, 84), rr.uniform(Z0 + 1.5, 112)
        near_tree = any(math.hypot(x - tx, z - tz) < 6.0 for tx, tz in trees)
        if free(x, z, 4.0, 1.0) and (near_tree or z < Z0 + 5 or vnoise(x, z, 16.0, 81) > 0.66):
            _shrub(tb, hill, x, z, rr)
            shrubs += 1
    # --- grass tufts: dense along the road and around the clearings, thinner in the open meadow
    tufts = 0
    for _i in range(60000):
        if tufts >= 4200:
            break
        x, z = rr.uniform(-74, 74), rr.uniform(Z0 + 0.6, 112)
        if hill.road_dist(x, z) < ROAD_HALF + 0.35 or hill.path_dist(x, z) < PATH_HALF + 0.2 or hill.slope(x, z) > 0.8:
            continue
        near = max(1.0 - smooth(3.0, 14.0, hill.road_dist(x, z)), 1.0 - smooth(3.0, 16.0, math.hypot(x, z - Z0)))
        dens = 0.16 + 0.5 * near + 0.5 * smooth(0.45, 0.7, vnoise(x, z, 9.0, 82))
        if on_lookout(x, z):
            continue
        if hill.in_clearing(x, z, -2.0):
            dens *= 0.35
        if rr.random() < dens * (1.0 - 0.6 * smooth(70.0, 110.0, z)):
            _tuft(tb, hill, x, z, rr, tall=vnoise(x, z, 7.0, 83) > 0.62)
            tufts += 1
    # --- wildflowers in drifts of one colour
    flowers = 0
    for _i in range(400):
        if flowers >= 620:
            break
        gx, gz = rr.uniform(-66, 66), rr.uniform(Z0 + 1.5, 104)
        petal = rr.choice(PETALS)
        for _k in range(rr.randint(5, 14)):
            x, z = gx + rr.gauss(0, 2.0), gz + rr.gauss(0, 2.0)
            if hill.road_dist(x, z) < ROAD_HALF + 0.5 or hill.path_dist(x, z) < PATH_HALF + 0.3 or z < Z0 + 0.8 or hill.slope(x, z) > 0.7 or on_lookout(x, z):
                continue
            _flower(tb, hill, x, z, rr, petal)
            flowers += 1
    return {"trees": len(trees), "rocks": rocks, "shrubs": shrubs, "tufts": tufts, "flowers": flowers}


# ---------------------------------------------------------------- the lookout

LOOKOUT = (13.0, 103.0)
FLAG = (0.74, 0.71, 0.66)        # the paving: the town's warm grey limestone, a shade darker than the wall caps
WALL = (0.66, 0.63, 0.58)        # town_terrain.WALL_STONE
CAP = (0.88, 0.86, 0.82)         # town_terrain.STONE_CAP
PARAPET_ARC = (-5.0, 170.0)      # degrees, x = cos, z = sin: the cloud side; the road and the uphill side stay open


def _face(tb, mat, pts, col, out=None):
    """A polygon wound so its normal points `out` (default up)."""
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = pts[0], pts[1], pts[2]
    n = ((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
         (bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
    o = out or (0.0, 1.0, 0.0)
    if n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0:
        pts = list(reversed(pts))
    tb.poly(mat, pts, col, uv=[(p[0], -p[2]) if abs(o[1]) > 0.5 else (p[0] + p[2], p[1]) for p in pts])


def _prism(tb, mat, ring, y0, y1, col, col_side=None):
    """A slab: the closed outline `ring` [(x, z)] from y0 to y1 (top and sides; it sits on the ground)."""
    mx = sum(p[0] for p in ring) / len(ring)
    mz = sum(p[1] for p in ring) / len(ring)
    _face(tb, mat, [(x, y1, z) for x, z in ring], col)
    for (xa, za), (xb, zb) in zip(ring, ring[1:] + ring[:1]):
        ox, oz = (xa + xb) / 2 - mx, (za + zb) / 2 - mz
        _face(tb, mat, [(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], col_side or tint(col, 0.82), (ox, 0.0, oz))


def _sector(tb, cx, cz, r0, r1, a0, a1, y0, y1, col):
    """An annular flagstone (an arc slab) as a strip of quads: the builder fans a polygon from its first corner, which
    folds over on a concave outline."""
    steps = max(2, int((a1 - a0) * r1 / 0.45))
    angs = [a0 + (a1 - a0) * t / steps for t in range(steps + 1)]
    side = tint(col, 0.82)
    for b0, b1 in zip(angs, angs[1:]):
        q = [(cx + math.cos(b) * r, cz + math.sin(b) * r) for b, r in ((b0, r0), (b1, r0), (b1, r1), (b0, r1))]
        _face(tb, "stone", [(x, y1, z) for x, z in q], col)
        for (xa, za), (xb, zb), (ox, oz) in (((q[2][0], q[2][1]), (q[3][0], q[3][1]), (math.cos((b0 + b1) / 2), math.sin((b0 + b1) / 2))),
                                             ((q[0][0], q[0][1]), (q[1][0], q[1][1]), (-math.cos((b0 + b1) / 2), -math.sin((b0 + b1) / 2)))):
            _face(tb, "stone", [(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], side, (ox, 0.0, oz))
    for b, sgn in ((a0, -1.0), (a1, 1.0)):
        tx, tz = -math.sin(b) * sgn, math.cos(b) * sgn
        pa, pb = (cx + math.cos(b) * r0, cz + math.sin(b) * r0), (cx + math.cos(b) * r1, cz + math.sin(b) * r1)
        _face(tb, "stone", [(pa[0], y0, pa[1]), (pb[0], y0, pb[1]), (pb[0], y1, pb[1]), (pa[0], y1, pa[1])], side, (tx, 0.0, tz))


def _block(tb, mat, cx, cz, y0, a, w, d, h, col, solid=True, tilt=0.0):
    """A dressed block standing on y0, its width along the tangent of angle `a` (radians)."""
    tx, tz = -math.sin(a), math.cos(a)   # tangent
    nx, nz = math.cos(a), math.sin(a)    # outward
    ring = []
    for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        ring.append((cx + tx * w / 2 * u + nx * d / 2 * v, cz + tz * w / 2 * u + nz * d / 2 * v))
    _prism(tb, mat, ring, y0, y0 + h + tilt, col)
    if solid:
        tb.col_cyl((cx, y0 - 0.2, cz), max(w, d) * 0.55, h + 0.2, 6)


def _lookout(tb, hill):
    """The paved lookout where the road ends above the cloud sea: flagstones in three rings around a round
    centre stone with the round sign, a kerb, a low parapet on the cloud side (two blocks fallen out of it), a
    stone bench against the slope and a weathered waymarker. Walkable: the slabs stand 3 cm proud of the level
    clearing (the client walks on the ground mesh); the parapet, bench and marker carry colliders."""
    cx, cz = LOOKOUT
    y = hill.h(cx, cz)
    rr = random.Random(103)
    top = y + 0.035

    def stone(base, lo=0.88, hi=1.1):
        return tint(base, rr.uniform(lo, hi))
    # the centre stone with the round sign (a ring and four short strokes set in darker stone)
    n = 14
    _prism(tb, "stone", [(cx + math.cos(math.tau * i / n) * 1.05, cz + math.sin(math.tau * i / n) * 1.05) for i in range(n)],
           y - 0.08, top + 0.01, stone(FLAG, 1.0, 1.06))
    for i in range(20):
        a0, a1 = math.tau * i / 20, math.tau * (i + 1) / 20
        ring = [(cx + math.cos(a) * r, cz + math.sin(a) * r) for a, r in ((a0, 0.55), (a1, 0.55), (a1, 0.68), (a0, 0.68))]
        _prism(tb, "stone", ring, top, top + 0.016, tint(WALL, 0.62))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        tx, tz = -math.sin(a), math.cos(a)
        px, pz = cx + math.cos(a) * 0.86, cz + math.sin(a) * 0.86
        ring = [(px + tx * u * 0.05 + math.cos(a) * v * 0.1, pz + tz * u * 0.05 + math.sin(a) * v * 0.1) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        _prism(tb, "stone", ring, top, top + 0.016, tint(WALL, 0.62))
    # three rings of flagstones with joints between them
    for r0, r1, count in ((1.12, 2.45, 9), (2.5, 3.75, 14), (3.8, 4.95, 19)):
        off = rr.uniform(0, math.tau)
        cuts = sorted(off + math.tau * (i + rr.uniform(-0.18, 0.18)) / count for i in range(count))
        for i in range(count):
            a0, a1 = cuts[i], cuts[(i + 1) % count] + (math.tau if i == count - 1 else 0.0)
            g = 0.035 / r0
            # never under the ground: where the road comes in the floor still rises a few centimetres
            hmax = max(hill.h(cx + math.cos(a) * r, cz + math.sin(a) * r) for a in (a0, (a0 + a1) / 2, a1) for r in (r0, r1))
            _sector(tb, cx, cz, r0 + 0.025, r1 - 0.025, a0 + g, a1 - g, y - 0.08, max(top, hmax + 0.03) + rr.uniform(-0.008, 0.01), stone(FLAG))
    # the kerb, open where the road comes in
    entry = min(hill.road, key=lambda q: abs(math.dist(q, LOOKOUT) - 5.2))
    a_in = math.atan2(entry[1] - cz, entry[0] - cx)
    for i in range(28):
        a = math.tau * (i + 0.5) / 28
        if abs((a - a_in + math.pi) % math.tau - math.pi) < math.radians(17):
            continue
        _block(tb, "stone", cx + math.cos(a) * 5.17, cz + math.sin(a) * 5.17, y - 0.1, a, 1.1, 0.36, 0.26, stone(WALL, 0.85, 1.0), solid=False)
    # the parapet on the cloud side: blocks with cap stones, two gaps where blocks have fallen out
    a_lo, a_hi = (math.radians(d) for d in PARAPET_ARC)
    r_p = 5.62
    count = int((a_hi - a_lo) * r_p / 0.95)
    gaps = {count // 3, count // 3 + 1, (2 * count) // 3 + 2}
    for i in range(count):
        a = a_lo + (a_hi - a_lo) * (i + 0.5) / count
        px, pz = cx + math.cos(a) * r_p, cz + math.sin(a) * r_p
        gy = min(hill.h(px, pz), y) - 0.25
        if i in gaps:
            _block(tb, "stone", px, pz, gy, a, 0.9, 0.46, y - gy + 0.22, stone(WALL, 0.75, 0.9))   # the broken stump
            continue
        h = y - gy + 0.62 + rr.uniform(-0.03, 0.03)
        _block(tb, "stone", px, pz, gy, a, 0.92, 0.46, h, stone(WALL, 0.82, 1.02))
        _block(tb, "stone", px, pz, gy + h, a, 0.97, 0.56, 0.11, stone(CAP, 0.9, 1.0), solid=False)
    # the fallen blocks, tipped on the grass beyond the parapet
    for i in sorted(gaps)[::2]:
        a = a_lo + (a_hi - a_lo) * (i + 0.5) / count + 0.04
        px, pz = cx + math.cos(a) * (r_p + 1.2), cz + math.sin(a) * (r_p + 1.2)
        _block(tb, "stone", px, pz, hill.h(px, pz) - 0.1, a + 0.7, 0.9, 0.5, 0.42, stone(WALL, 0.72, 0.85), solid=False)
    # a stone bench against the slope, facing the clouds
    ab = math.radians(248)
    bx, bz = cx + math.cos(ab) * 4.35, cz + math.sin(ab) * 4.35
    for u in (-0.62, 0.62):
        px, pz = bx - math.sin(ab) * u, bz + math.cos(ab) * u
        _block(tb, "stone", px, pz, top, ab, 0.24, 0.42, 0.4, stone(WALL, 0.8, 0.9), solid=False)
    _block(tb, "stone", bx, bz, top + 0.4, ab, 1.7, 0.5, 0.09, stone(CAP, 0.92, 1.0))
    # a weathered waymarker beside the road's end, the round sign worn into its face
    am = math.radians(205)
    mx, mz = cx + math.cos(am) * 4.45, cz + math.sin(am) * 4.45
    _block(tb, "stone", mx, mz, top, am, 0.42, 0.34, 1.25, stone(WALL, 0.78, 0.86))
    _block(tb, "stone", mx, mz, top + 1.25, am, 0.34, 0.27, 0.12, stone(WALL, 0.72, 0.8), solid=False)
    fx, fz = mx - math.cos(am) * 0.172, mz - math.sin(am) * 0.172   # inner face, toward the paving
    for i in range(12):
        a0, a1 = math.tau * i / 12, math.tau * (i + 1) / 12
        tx, tz = -math.sin(am), math.cos(am)
        def P(a, r):
            return (fx + tx * math.cos(a) * r, top + 0.9 + math.sin(a) * r, fz + tz * math.cos(a) * r)
        _face(tb, "stone", [P(a0, 0.1), P(a1, 0.1), P(a1, 0.14), P(a0, 0.14)], tint(WALL, 0.55), (-math.cos(am), 0.0, -math.sin(am)))
    return {"lookout_y": round(y, 2), "parapet_blocks": count - len(gaps)}


def on_lookout(x, z, margin=0.0):
    return math.hypot(x - LOOKOUT[0], z - LOOKOUT[1]) < 6.2 + margin


def report(hill):
    """Steepest slope (degrees) on the road, the footpath and the clearing floors, measured on the mesh."""
    out = {}
    for name, line, half in (("road", hill.road, ROAD_HALF), ("footpath", hill.path, PATH_HALF)):
        worst = 0.0
        for i, (x, z) in enumerate(line):
            a, b = line[max(0, i - 1)], line[min(len(line) - 1, i + 1)]
            ln = math.dist(a, b) or 1.0
            nx, nz = (b[1] - a[1]) / ln, -(b[0] - a[0]) / ln
            for t in (-1.0, 0.0, 1.0):
                worst = max(worst, hill.slope(x + nx * half * t, z + nz * half * t, 0.5))
        out[name] = round(math.degrees(math.atan(worst)), 1)
    ys = hill.road_y
    out["road_grade"] = round(math.degrees(math.atan(max(abs(ys[i + 1] - ys[i]) / math.dist(hill.road[i], hill.road[i + 1]) for i in range(len(ys) - 1)))), 1)
    out["road_length_m"] = round(sum(math.dist(a, b) for a, b in zip(hill.road, hill.road[1:])), 1)
    out["road_end_y"] = round(ys[-1], 2)
    for name, cx, cz, r, _b in CLEARINGS:
        worst = max(hill.slope(cx + math.cos(a) * r * k, cz + math.sin(a) * r * k) for k in (0.0, 0.5, 0.95) for a in [i * math.tau / 12 for i in range(12)])
        out[name] = {"y": round(hill.ground(cx, cz), 2), "slope_deg": round(math.degrees(math.atan(worst)), 1), "diameter_m": 2 * r,
                     "from_gate_m": round(math.hypot(cx, cz - Z0), 1)}
    out["min_y"] = round(min(min(r) for r in hill.Y), 1)
    return out


def build(tb):
    """Emits the hillside into the builder's current piece and returns counts and the slope report."""
    global _HILL
    hill = Hill()
    _HILL = hill
    _ground(tb, hill)
    _road(tb, hill)
    info = _flora(tb, hill)
    info.update(_lookout(tb, hill))
    info["slopes"] = report(hill)
    return info


if __name__ == "__main__":
    import json
    print(json.dumps(report(Hill()), indent=1))
