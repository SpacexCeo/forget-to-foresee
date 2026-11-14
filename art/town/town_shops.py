"""Walkable shop interiors (S-001..S-003) built to the GPT sheets (docs/art/town/board/refs/S-00x_02..04):
rooms, counters, furniture and dressed props from the town kit, lit by baked lamps. Each interior is its own piece, centred on its origin
with the floor at y = 0 and the door in the +Z wall; the client places it far from the town and
streams it when Iris enters. Empties: `shop_spawn`, `shop_exit`, `shop_counter`, `shopkeeper_stand`,
`socket_lamp_*` (warm lights), `npc_seat_*` (inn seats for the townsfolk).

    town_shop_exchange   S-001 Shard Exchange: shard cases, the auction pedestal, the ledger
    town_shop_scribe     S-002 Scribe of Signs: drawing desks, chart racks, the wall of round signs
    town_shop_inn        S-003 Inn: hearth, long tables, the bar, the six clan banners
"""

import math
import random

import town_plan as P
import town_houses as H
from town_altar import _glyph
from town_geo import RX, RY, RZ, T, tint

# The rooms' own palette (14.11): walnut-dark frames and oiled oak tops, warmer and deeper than the street's timber,
# so the lamp light has something to glow against.
TIMBER = (0.27, 0.165, 0.10)
TIMBER_LIGHT = (0.50, 0.33, 0.20)
STONE = (0.80, 0.76, 0.70)
STONE_DARK = (0.50, 0.48, 0.45)
FLOOR = (0.52, 0.35, 0.22)
SHELL = (0.05, 0.04, 0.035)          # the dark closing shell behind every wall, the ceiling and the floor
MIST_LOW, MIST_HIGH = (0.44, 0.53, 0.60), (0.80, 0.86, 0.90)   # the hill mist behind the window panes
GROTTO_ARCH = (-2.1, -1.15, 2.15)    # the Exchange's rear wall: the arch to the hidden grotto (x0, x1, top), wall space
BRONZE = (1.0, 1.0, 1.0)
CLANS = [("iris", (0.25, 0.16, 0.55)), ("sol", (0.78, 0.80, 0.76)), ("pepel", (0.045, 0.043, 0.041)),
         ("moh", (0.16, 0.27, 0.09)), ("yantar", (0.66, 0.32, 0.04)), ("iney", (0.35, 0.55, 0.68))]


def _walls(w, d):
    """Interior wall frames: local X along the wall, +Z into the room."""
    return {"north": (T(0, 0, -d / 2), w), "south": (T(0, 0, d / 2) @ RY(180), w),
            "west": (T(-w / 2, 0, 0) @ RY(90), d), "east": (T(w / 2, 0, 0) @ RY(-90), d)}


def room(tb, w, d, h, plaster, rr, windows=("west", "east"), door_w=1.5, floor=True, openings=None):
    """Floor planks (unless floor=False), plastered walls with a timber dado and posts, beamed ceiling, the door and
    lit windows. `openings`: wall name -> (x0, x1, top) in wall space, a doorway cut through that wall (plaster,
    dado, shell and collider all leave it free)."""
    openings = openings or {}
    n = int(w / 0.5) if floor else 0
    for i in range(n):
        x0, x1 = -w / 2 + w * i / n, -w / 2 + w * (i + 1) / n
        # each plank row is cut into boards of uneven length, every board its own tone
        z = -d / 2
        while z < d / 2 - 1e-6:
            z1 = min(d / 2, z + rr.uniform(1.6, 3.4))
            tb.quad("timber", (x0, 0, z1), (x1, 0, z1), (x1, 0, z), (x0, 0, z), tint(FLOOR, rr.uniform(0.70, 1.08)), uv_dir=(0, 0, 1), uv_off=(rr.random(), rr.random()))
            z = z1
    tb.col_poly([(-w / 2, 0, d / 2), (w / 2, 0, d / 2), (w / 2, 0, -d / 2), (-w / 2, 0, -d / 2)])
    # the ceiling: dark boards laid across the joists (no bare plaster overhead)
    nb = int(d / 0.42)
    for i in range(nb):
        z0, z1 = -d / 2 + d * i / nb, -d / 2 + d * (i + 1) / nb
        tb.quad("timber", (-w / 2, h, z0), (w / 2, h, z0), (w / 2, h, z1), (-w / 2, h, z1), tint(TIMBER, rr.uniform(0.78, 1.0)), uv_dir=(1, 0, 0), uv_off=(rr.random(), rr.random()))
    # the closing shell: one dark box 6 cm outside the room, facing in, so no seam ever shows the void
    e = 0.06
    X, Z = w / 2 + e, d / 2 + e
    north = [((-X, -e, -Z), (X, -e, -Z), (X, h + e, -Z), (-X, h + e, -Z))]
    if "north" in openings:   # the shell leaves the doorway free too
        ox0, ox1, otop = openings["north"]
        north = [((-X, -e, -Z), (ox0, -e, -Z), (ox0, h + e, -Z), (-X, h + e, -Z)), ((ox1, -e, -Z), (X, -e, -Z), (X, h + e, -Z), (ox1, h + e, -Z)),
                 ((ox0, otop + 0.3, -Z), (ox1, otop + 0.3, -Z), (ox1, h + e, -Z), (ox0, h + e, -Z))]
    for a, b, c, dd in [((-X, -e, Z), (X, -e, Z), (X, -e, -Z), (-X, -e, -Z)), ((-X, h + e, -Z), (X, h + e, -Z), (X, h + e, Z), (-X, h + e, Z)),
                        ((X, -e, Z), (-X, -e, Z), (-X, h + e, Z), (X, h + e, Z)),
                        ((-X, -e, Z), (-X, -e, -Z), (-X, h + e, -Z), (-X, h + e, Z)), ((X, -e, -Z), (X, -e, Z), (X, h + e, Z), (X, h + e, -Z))] + north:
        tb.quad("stone", a, b, c, dd, SHELL)
    for i in range(int(d / 1.6) + 1):
        z = -d / 2 + 0.3 + i * (d - 0.6) / int(d / 1.6)
        tb.box("timber", (0, h - 0.13, z), (w, 0.26, 0.22), tint(TIMBER, 0.9), skip="Y", uv_dir=(1, 0, 0))
    tb.box("timber", (0, h - 0.36, 0), (0.3, 0.2, d), tint(TIMBER, 0.8), skip="Y", uv_dir=(0, 0, 1))
    for name, (m, ww) in _walls(w, d).items():
        with tb.at(m):
            lo = tint(plaster, 0.8)
            op = openings.get(name)
            spans = [(-ww / 2, ww / 2)] if not op else [(-ww / 2, op[0]), (op[1], ww / 2)]
            for xa, xb in spans:
                tb.quad("plaster", (xa, 0, 0), (xb, 0, 0), (xb, h, 0), (xa, h, 0), [lo, lo, plaster, plaster])
                tb.box("timber", ((xa + xb) / 2, 0.5, 0.03), (xb - xa, 1.0, 0.06), tint(TIMBER_LIGHT, 0.8), skip="zy", uv_dir=(0, 1, 0))
                tb.box("timber", ((xa + xb) / 2, 1.03, 0.05), (xb - xa, 0.08, 0.1), TIMBER, skip="z", uv_dir=(1, 0, 0))
                tb.col_poly([(xa, 0, 0), (xb, 0, 0), (xb, h, 0), (xa, h, 0)])
            if op:
                tb.quad("plaster", (op[0], op[2], 0), (op[1], op[2], 0), (op[1], h, 0), (op[0], h, 0), plaster)
                tb.col_poly([(op[0], op[2], 0), (op[1], op[2], 0), (op[1], h, 0), (op[0], h, 0)])
            tb.box("timber", (0, h - 0.1, 0.05), (ww, 0.2, 0.1), TIMBER, skip="z", uv_dir=(1, 0, 0))
            npost = max(2, round(ww / 2.4))
            for i in range(npost + 1):
                px = -ww / 2 + ww * i / npost
                if op and op[0] - 0.05 < px < op[1] + 0.05:
                    continue
                tb.box("timber", (px, h / 2, 0.06), (0.18, h, 0.12), TIMBER, skip="zy", uv_dir=(0, 1, 0))
            if name == "south":
                # the door: a plank leaf, a frame, a ring on the lintel, daylight in the gap above
                tb.box("timber", (0, 1.1, 0.07), (door_w - 0.3, 2.2, 0.08), tint(TIMBER, 0.85), skip="zy", uv_dir=(0, 1, 0))
                for sx in (-1, 1):
                    tb.box("timber", (sx * (door_w / 2 - 0.08), 1.15, 0.12), (0.16, 2.3, 0.18), TIMBER, skip="zy", uv_dir=(0, 1, 0))
                tb.box("timber", (0, 2.38, 0.12), (door_w + 0.2, 0.18, 0.2), TIMBER, skip="z", uv_dir=(1, 0, 0))
                tb.ring("stone", (0, 2.38, 0.24), 0.13, 0.08, 0.04, 14, (0.92, 0.66, 0.24))
                tb.quad("window_day", (-0.45, 2.56, 0.07), (0.45, 2.56, 0.07), (0.45, 2.9, 0.07), (-0.45, 2.9, 0.07), [MIST_LOW, MIST_LOW, MIST_HIGH, MIST_HIGH])
            if name in windows:
                nwin = max(1, int(ww / 3.6))
                for i in range(nwin):
                    cx = -ww / 2 + ww * (i + 0.5) / nwin
                    tb.quad("window_day", (cx - 0.55, 1.35, 0.05), (cx + 0.55, 1.35, 0.05), (cx + 0.55, 2.75, 0.05), (cx - 0.55, 2.75, 0.05), [MIST_LOW, MIST_LOW, MIST_HIGH, MIST_HIGH])
                    for (bx, by, sx, sy) in ((cx, 2.8, 1.3, 0.1), (cx, 1.3, 1.3, 0.1), (cx - 0.6, 2.05, 0.1, 1.5), (cx + 0.6, 2.05, 0.1, 1.5), (cx, 2.05, 0.05, 1.4), (cx, 2.15, 1.1, 0.05)):
                        tb.box("timber", (bx, by, 0.09), (sx, sy, 0.1 if sx > sy else 0.076), TIMBER_LIGHT, skip="z", uv_dir=(1, 0, 0) if sx > sy else (0, 1, 0))
                    tb.box("timber", (cx, 1.22, 0.16), (1.5, 0.06, 0.26), TIMBER_LIGHT, uv_dir=(1, 0, 0))
    tb.socket("shop_spawn", (0, 0, d / 2 - 1.2), 180.0)
    tb.socket("shop_exit", (0, 0, d / 2 - 0.5))


def counter(tb, x, z, length, rot=0.0, top_col=TIMBER_LIGHT):
    """A shop counter; the keeper stands on its local -Z side."""
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, 0.5, 0), (length, 1.0, 0.7), tint(TIMBER, 1.1), skip="y", uv_dir=(1, 0, 0))
        tb.box("timber", (0, 1.04, 0.03), (length + 0.14, 0.08, 0.86), top_col, uv_dir=(1, 0, 0))
        n = max(2, int(length / 0.9))
        for i in range(n):
            px = -length / 2 + length * (i + 0.5) / n
            tb.box("timber", (px, 0.5, 0.36), (length / n - 0.14, 0.76, 0.03), tint(TIMBER_LIGHT, 0.75), skip="z", uv_dir=(0, 1, 0))
        tb.col_box((0, 0.55, 0), (length, 1.1, 0.75))


def shelf(tb, x, z, w, rot=0.0, h=2.3, goods="jars", seed=0):
    rr = random.Random(seed)
    with tb.at(T(x, 0, z), RY(rot)):
        for sx in (-1, 1):
            tb.box("timber", (sx * w / 2, h / 2, 0), (0.07, h, 0.38), TIMBER, skip="y", uv_dir=(0, 1, 0))
        tb.box("timber", (0, h / 2, -0.17), (w, h, 0.03), tint(TIMBER, 0.7), skip="yz", uv_dir=(0, 1, 0))
        for k in range(5):
            yy = 0.12 + k * (h - 0.2) / 4
            tb.box("timber", (0, yy, 0), (w, 0.05, 0.38), TIMBER_LIGHT, uv_dir=(1, 0, 0))
            if k == 4:
                continue
            nx = int(w / 0.28)
            for i in range(nx):
                if rr.random() < 0.22:
                    continue
                gx = -w / 2 + 0.16 + i * (w - 0.3) / max(1, nx - 1)
                if goods == "jars":
                    c = rr.choice([(0.5, 0.36, 0.22), (0.42, 0.5, 0.42), (0.6, 0.5, 0.3), (0.3, 0.34, 0.44)])
                    tb.cyl("plaster", (gx, yy + 0.03, 0.02), 0.085, 0.07, rr.uniform(0.16, 0.3), 8, c, cap_top=True)
                elif goods == "scrolls":
                    with tb.at(T(gx, yy + 0.1, 0.0), RX(90)):
                        tb.cyl("cloth", (0, -0.17, 0), 0.06, 0.06, 0.34, 7, tint((1, 0.95, 0.82), rr.uniform(0.8, 1.0)), cap_top=True, cap_bot=True)
                else:   # books and boxes
                    hh = rr.uniform(0.2, 0.32)
                    c = rr.choice([(0.45, 0.2, 0.16), (0.2, 0.3, 0.36), (0.5, 0.4, 0.22), (0.24, 0.32, 0.2)])
                    tb.box("cloth", (gx, yy + 0.03 + hh / 2, 0.0), (0.09, hh, 0.26), c, skip="y")
        tb.col_box((0, h / 2, 0), (w, h, 0.4))


def table(tb, x, z, w, d, rot=0.0, h=0.78):
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, h, 0), (w, 0.07, d), TIMBER_LIGHT, uv_dir=(1, 0, 0))
        for sx in (-1, 1):
            for sz in (-1, 1):
                tb.box("timber", (sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)), (0.09, h, 0.09), TIMBER, skip="yY", uv_dir=(0, 1, 0))
        tb.col_box((0, h / 2, 0), (w, h, d))


def stool(tb, x, z, name=None, rot=0.0):
    tb.cyl("timber", (x, 0.42, z), 0.19, 0.19, 0.05, 10, TIMBER_LIGHT, cap_top=True, cap_bot=True)
    for k in range(3):
        a = math.tau * k / 3
        tb.beam("timber", (x + math.cos(a) * 0.15, 0, z + math.sin(a) * 0.15), (x + math.cos(a) * 0.08, 0.42, z + math.sin(a) * 0.08), 0.045, 0.045, TIMBER)
    if name:
        tb.socket(name, (x, 0.0, z), rot, sit=True, seat_height=0.46)


def chandelier(tb, x, z, h, r=0.7, name="socket_lamp_ceiling"):
    tb.cyl("stone", (x, h - 1.0, z), 0.015, 0.015, 1.0, 4, (0.15, 0.14, 0.14), cap_top=False)
    tb.ring("altar_metal", (x, h - 1.05, z), r, r - 0.07, 0.06, 20, BRONZE, axis="y")
    for k in range(6):
        a = math.tau * k / 6
        cx, cz = x + math.cos(a) * (r - 0.035), z + math.sin(a) * (r - 0.035)
        tb.cyl("plaster", (cx, h - 1.02, cz), 0.03, 0.03, 0.12, 6, (1, 0.96, 0.86), cap_top=True)
        tb.cyl("lamp", (cx, h - 0.9, cz), 0.028, 0.0, 0.08, 5, cap_top=False)
    tb.socket(name, (x, h - 1.2, z))


def rug(tb, x, z, w, d, col, rot=0.0):
    with tb.at(T(x, 0.012, z), RY(rot)):
        tb.quad("cloth", (-w / 2, 0, d / 2), (w / 2, 0, d / 2), (w / 2, 0, -d / 2), (-w / 2, 0, -d / 2), col)
        tb.quad("cloth", (-w / 2 + 0.2, 0.004, d / 2 - 0.2), (w / 2 - 0.2, 0.004, d / 2 - 0.2), (w / 2 - 0.2, 0.004, -d / 2 + 0.2), (-w / 2 + 0.2, 0.004, -d / 2 + 0.2), tint(col, 0.7))


def wall_lamp(tb, name):
    """In wall space: a small bracket lantern."""
    tb.beam("stone", (0, 0, 0.0), (0, 0, 0.3), 0.04, 0.04, (0.16, 0.15, 0.15))
    tb.box("lamp", (0, -0.14, 0.3), (0.14, 0.24, 0.14), (1, 1, 1))
    tb.box("stone", (0, 0.0, 0.3), (0.18, 0.04, 0.18), (0.16, 0.15, 0.15))
    tb.socket(name, (0, -0.14, 0.34))


def shard(tb, x, y, z, s=0.2, seed=0, mat="shard"):
    """A memory shard: a small irregular crystal with a soft glow (material M_Shop_Shard)."""
    rr = random.Random(seed)
    with tb.at(T(x, y, z), RY(rr.uniform(0, 360)), RZ(rr.uniform(-14, 14))):
        n = 5
        for k in range(n):
            a0, a1 = math.tau * k / n, math.tau * (k + 1) / n
            p0, p1 = (math.cos(a0) * s * 0.42, s * 0.55, -math.sin(a0) * s * 0.42), (math.cos(a1) * s * 0.42, s * 0.55, -math.sin(a1) * s * 0.42)
            tb.poly(mat, [p0, p1, (0.02 * s, s * 1.5, 0)])
            tb.poly(mat, [p1, p0, (0, 0, 0)])


# ------------------------------------------------------------------ shared dressing (sheet pass, 11.11)

def stone_floor(tb, w, d, rr, col=(0.80, 0.76, 0.70)):
    """Large limestone flags in running bond (Exchange, Scribe): one tile per 0.9 x 0.6 m, tint per flag."""
    nz = int(d / 0.6)
    for j in range(nz):
        z0, z1 = -d / 2 + d * j / nz, -d / 2 + d * (j + 1) / nz
        off = 0.45 if j % 2 else 0.0
        xs = [-w / 2] + [x for x in [(-w / 2 + off + 0.9 * k) for k in range(1, 12)] if -w / 2 < x < w / 2] + [w / 2]
        for x0, x1 in zip(xs, xs[1:]):
            tb.quad("stone", (x0, 0, z1), (x1, 0, z1), (x1, 0, z0), (x0, 0, z0), tint(col, rr.uniform(0.84, 1.04)))


def runner(tb, z0, z1, w, col, x=0.0):
    """A long woven runner with a darker border and a bronze-gold edge line."""
    tb.quad("cloth", (x - w / 2, 0.014, z1), (x + w / 2, 0.014, z1), (x + w / 2, 0.014, z0), (x - w / 2, 0.014, z0), tint(col, 0.62))
    tb.quad("cloth", (x - w / 2 + 0.12, 0.017, z1 - 0.12), (x + w / 2 - 0.12, 0.017, z1 - 0.12), (x + w / 2 - 0.12, 0.017, z0 + 0.12), (x - w / 2 + 0.12, 0.017, z0 + 0.12), col)
    for sx in (-1, 1):
        xx = x + sx * (w / 2 - 0.17)
        tb.quad("cloth", (xx - 0.02, 0.019, z1 - 0.14), (xx + 0.02, 0.019, z1 - 0.14), (xx + 0.02, 0.019, z0 + 0.14), (xx - 0.02, 0.019, z0 + 0.14), (0.78, 0.58, 0.30))


def blind(tb, cx, top, w, cols):
    """Inside a window wall frame: a bronze rod, a short pelmet and two gathered curtains tied back to the sides."""
    main, trim = cols[0], cols[1]
    tb.beam("bronze", (cx - w / 2 - 0.22, top + 0.04, 0.17), (cx + w / 2 + 0.22, top + 0.04, 0.17), 0.035, 0.035)
    for sx in (-1, 1):
        tb.cyl("bronze", (cx + sx * (w / 2 + 0.24), top + 0.0, 0.17), 0.05, 0.03, 0.08, 6)
    n = 9
    for i in range(n):   # the pelmet: shallow scallops
        x0, x1 = cx - w / 2 - 0.12 + (w + 0.24) * i / n, cx - w / 2 - 0.12 + (w + 0.24) * (i + 1) / n
        zf = 0.20 if i % 2 else 0.16
        tb.quad("cloth", (x0, top - 0.26, zf), (x1, top - 0.26, zf), (x1, top + 0.02, 0.17), (x0, top + 0.02, 0.17), tint(main, 0.9 if i % 2 else 1.05))
        tb.poly("cloth", [(x0, top - 0.26, zf), ((x0 + x1) / 2, top - 0.33, zf), (x1, top - 0.26, zf)], trim)
    for sx in (-1, 1):   # the drapes: folded strips, wide at the rod, gathered at the tie, loose below
        folds = 5
        for i in range(folds):
            u0, u1 = i / folds, (i + 1) / folds
            rows = [(top, 0.46, 0.0), (1.72, 0.20, 0.0), (1.02, 0.34, 0.03)]   # (height, drape width, sag toward the room)
            for (ya, wa, sa), (yb, wb, sb) in zip(rows, rows[1:]):
                def px(wd, u):
                    return cx + sx * (w / 2 + 0.18 - wd * u)
                za0, za1 = 0.13 + (0.05 if i % 2 else 0.0) + sa, 0.13 + (0.0 if i % 2 else 0.05) + sa
                zb0, zb1 = 0.13 + (0.05 if i % 2 else 0.0) + sb, 0.13 + (0.0 if i % 2 else 0.05) + sb
                a, b, c, dd = (px(wb, u0), yb, zb0), (px(wb, u1), yb, zb1), (px(wa, u1), ya, za1), (px(wa, u0), ya, za0)
                col = tint(main, 0.82 if i % 2 else 1.0)
                if sx > 0:
                    tb.quad("cloth", b, a, dd, c, col)
                else:
                    tb.quad("cloth", a, b, c, dd, col)
        tb.box("cloth", (cx + sx * (w / 2 + 0.08), 1.72, 0.17), (0.23, 0.05, 0.11), tint(main, 0.55))


def window_blinds(tb, w, d, cols, walls=("west", "east")):
    for name, (m, ww) in _walls(w, d).items():
        if name not in walls:
            continue
        nwin = max(1, int(ww / 3.6))
        with tb.at(m):
            for i in range(nwin):
                blind(tb, -ww / 2 + ww * (i + 0.5) / nwin, 2.95, 1.35, cols)


def door_surround(tb, w, d):
    """A dressed stone surround around the door on the inner face of the +Z wall (the sheets' view from the counter)."""
    with tb.at(_walls(w, d)["south"][0]):
        for sx in (-1, 1):
            tb.box("stone", (sx * 0.86, 1.2, 0.08), (0.32, 2.4, 0.16), STONE, skip="z")
        tb.box("stone", (0, 2.52, 0.09), (2.04, 0.3, 0.18), tint(STONE, 1.06), skip="z")
        tb.box("stone", (0, 2.52, 0.19), (0.34, 0.34, 0.04), tint(STONE, 1.15), skip="z")
        tb.ring("bronze", (0, 1.15, 0.13), 0.09, 0.07, 0.025, 12)


def hanging_ring_lamp(tb, name, x, z, h, r=0.8, candles=8):
    """The sheets' bronze ring chandelier on four chains, candles on the ring; a swing node off the ceiling hook."""
    with tb.swing(name.replace("socket_", ""), (x, h - 0.02, z), length=0.72):
        tb.cyl("iron", (x, h - 0.25, z), 0.02, 0.02, 0.25, 5, cap_top=False)
        for k in range(4):
            a = math.tau * k / 4 + 0.4
            tb.beam("iron", (x, h - 0.25, z), (x + math.cos(a) * r, h - 0.72, z + math.sin(a) * r), 0.012, 0.012)
        tb.ring("bronze", (x, h - 0.72, z), r + 0.04, r - 0.04, 0.07, 28, axis="y")
        tb.ring("bronze", (x, h - 0.79, z), r * 0.35, r * 0.3, 0.04, 14, axis="y")
        for k in range(candles):
            a = math.tau * (k + 0.5) / candles
            cx, cz = x + math.cos(a) * r, z + math.sin(a) * r
            tb.cyl("bronze", (cx, h - 0.68, cz), 0.05, 0.04, 0.02, 6)
            tb.cyl("wax", (cx, h - 0.66, cz), 0.022, 0.022, 0.14, 6)
            tb.cyl("lamp", (cx, h - 0.52, cz), 0.018, 0.0, 0.06, 5, cap_top=False)
    tb.socket(name, (x, h - 0.62, z))
    tb.light((x, h - 0.55, z), (1.0, 0.70, 0.40), 260.0, 0.5)


def sconce(tb, name, wall_m, off, y=2.25):
    """A wall lantern on a bracket (wall space), its head a swing node; a bake light inside."""
    with tb.at(wall_m, T(off, y, 0)):
        tb.box("iron", (0, 0, 0.02), (0.16, 0.24, 0.04))
        tb.beam("iron", (0, 0.08, 0.02), (0, 0.08, 0.32), 0.035, 0.035)
        with tb.swing(name.replace("socket_", ""), (0, 0.06, 0.3), length=0.2):
            tb.box("iron", (0, 0.03, 0.3), (0.2, 0.04, 0.2))
            tb.box("lamp", (0, -0.12, 0.3), (0.15, 0.26, 0.15))
            for sx in (-1, 1):
                for sz in (-1, 1):
                    tb.box("iron", (sx * 0.08, -0.12, 0.3 + sz * 0.08), (0.02, 0.28, 0.02))
            tb.box("iron", (0, -0.26, 0.3), (0.18, 0.03, 0.18))
        tb.socket(name, (0, -0.12, 0.36))
        tb.light((0, -0.12, 0.42), (1.0, 0.66, 0.34), 55.0, 0.08)


def window_lights(tb, w, d, walls=("west", "east"), power=34.0):
    """Daylight spilling in through the painted windows (bake only)."""
    for name, (m, ww) in _walls(w, d).items():
        if name not in walls:
            continue
        nwin = max(1, int(ww / 3.6))
        with tb.at(m):
            for i in range(nwin):
                tb.light((-ww / 2 + ww * (i + 0.5) / nwin, 2.1, 0.6), (0.62, 0.76, 0.95), power, 0.6)


def potted_plant(tb, x, y, z, seed=0, r=0.22):
    tb.cyl("ceramic", (x, y, z), r * 0.6, r * 0.8, r * 1.1, 10, (0.66, 0.36, 0.22), cap_top=True)
    tb.blob("foliage", (x, y + r * 1.5, z), r * 1.05, (0.30, 0.46, 0.18), seed=seed, squash=0.9, sub=1)


def book_stack(tb, x, y, z, n=3, rr=None, rot=0.0):
    rr = rr or random.Random(0)
    with tb.at(T(x, y, z), RY(rot)):
        yy = 0.0
        for i in range(n):
            hh = rr.uniform(0.04, 0.07)
            c = rr.choice([(0.45, 0.2, 0.16), (0.2, 0.3, 0.36), (0.5, 0.4, 0.22), (0.24, 0.32, 0.2)])
            with tb.at(RY(rr.uniform(-15, 15))):
                tb.box("cloth", (0, yy + hh / 2, 0), (0.24, hh, 0.32), c)
                tb.box("paper", (0.006, yy + hh / 2, 0), (0.23, hh * 0.8, 0.31), skip="xy")
            yy += hh


def scales(tb, x, y, z, s=1.0):
    with tb.at(T(x, y, z)):
        tb.cyl("bronze", (0, 0, 0), 0.12 * s, 0.06 * s, 0.04 * s, 10, cap_top=True)
        tb.cyl("bronze", (0, 0.04 * s, 0), 0.016 * s, 0.016 * s, 0.5 * s, 6)
        tb.beam("bronze", (-0.36 * s, 0.52 * s, 0), (0.36 * s, 0.52 * s, 0), 0.025 * s, 0.025 * s)
        for sx in (-1, 1):
            tb.lathe("bronze", (sx * 0.36 * s, 0.26 * s, 0), [(0.0, 0.0), (0.1 * s, 0.015 * s), (0.13 * s, 0.04 * s)], 10)
            for k in range(3):
                a = math.tau * k / 3
                tb.beam("iron", (sx * 0.36 * s, 0.52 * s, 0), (sx * 0.36 * s + math.cos(a) * 0.12 * s, 0.3 * s, math.sin(a) * 0.12 * s), 0.006, 0.006)


def open_book(tb, x, y, z, rot=0.0, s=1.0):
    with tb.at(T(x, y, z), RY(rot)):
        tb.box("cloth", (0, 0.015, 0), (0.62 * s, 0.03, 0.42 * s), (0.36, 0.16, 0.12))
        for sx in (-1, 1):
            with tb.at(T(sx * 0.15 * s, 0.035, 0), RZ(-sx * 6)):
                tb.box("paper", (0, 0.012, 0), (0.29 * s, 0.025, 0.4 * s))


def glass_case(tb, x, z, rot, seed, length=1.6, depth=0.7):
    """S-001 low display case: timber base, bronze-framed glass box, shards on velvet."""
    rr = random.Random(seed)
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, 0.36, 0), (length, 0.72, depth), tint(TIMBER, 1.05), skip="y", uv_dir=(1, 0, 0))
        tb.box("timber", (0, 0.06, 0), (length + 0.06, 0.12, depth + 0.06), tint(TIMBER, 0.7), skip="y", uv_dir=(1, 0, 0))
        for i in range(3):
            tb.box("timber", (-length / 3 + i * length / 3, 0.38, depth / 2 + 0.005), (length / 3 - 0.12, 0.44, 0.02), tint(TIMBER_LIGHT, 0.8), uv_dir=(1, 0, 0))
        tb.box("cloth", (0, 0.735, 0), (length - 0.06, 0.03, depth - 0.06), (0.22, 0.16, 0.34))
        for px in (-1, 1):
            for pz in (-1, 1):
                tb.box("bronze", (px * (length / 2 - 0.02), 0.82, pz * (depth / 2 - 0.02)), (0.03, 0.2, 0.03))
        for pz in (-1, 1):
            tb.box("bronze", (0, 0.92, pz * (depth / 2 - 0.02)), (length, 0.025, 0.025))
        for px in (-1, 1):
            tb.box("bronze", (px * (length / 2 - 0.02), 0.92, 0), (0.025, 0.025, depth))
        tb.box("case_glass", (0, 0.83, 0), (length - 0.04, 0.18, depth - 0.04), skip="y")
        for i in range(5):
            mat = "shard_amber" if rr.random() < 0.3 else "shard"
            shard(tb, -length / 2 + 0.2 + i * (length - 0.4) / 4, 0.75, rr.uniform(-0.12, 0.12), rr.uniform(0.07, 0.11), seed * 10 + i, mat)
        tb.col_box((0, 0.47, 0), (length, 0.94, depth))


def build_exchange(tb):
    """S-001 Shard Exchange (sheet S-001_02): counter on the right of the rear wall with shelves behind, the
    memory-shard pedestal left of the centre line, six low glass cases, a purple runner from the door."""
    sp = next(s for s in P.SHOPS if s["id"] == "exchange")
    w, d = sp["interior"]
    h = 3.6
    rr = random.Random(101)
    room(tb, w, d, h, (0.88, 0.84, 0.76), rr, floor=False, openings={"north": GROTTO_ARCH})
    grotto(tb, d, *GROTTO_ARCH, random.Random(707))
    stone_floor(tb, w, d, rr)
    door_surround(tb, w, d)
    window_blinds(tb, w, d, [(0.25, 0.27, 0.44), (0.90, 0.86, 0.76)])
    runner(tb, -d / 2 + 3.0, d / 2 - 0.2, 1.5, (0.36, 0.28, 0.48))
    # the counter (3 m, right of centre) with the keeper's stand behind it, unchanged in place
    counter(tb, 0.6, -d / 2 + 2.5, 3.0)
    tb.box("cloth", (0.6, 0.7, -d / 2 + 2.88), (0.5, 0.62, 0.012), (0.30, 0.24, 0.44))
    tb.poly("cloth", [(0.35, 0.39, -d / 2 + 2.888), (0.6, 0.22, -d / 2 + 2.888), (0.85, 0.39, -d / 2 + 2.888)], (0.30, 0.24, 0.44))
    tb.ring("bronze", (0.6, 0.74, -d / 2 + 2.89), 0.12, 0.09, 0.01, 14)
    tb.socket("shopkeeper_stand", (0, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (0, 0, -d / 2 + 3.5), 180.0)
    scales(tb, 1.75, 1.08, -d / 2 + 2.5, 0.9)
    open_book(tb, -0.2, 1.08, -d / 2 + 2.55, -8)
    with tb.at(T(0.75, 1.08, -d / 2 + 2.45), RY(10)):   # a tray of loose shards
        tb.box("timber", (0, 0.025, 0), (0.42, 0.05, 0.28), TIMBER_LIGHT)
        tb.box("cloth", (0, 0.052, 0), (0.38, 0.006, 0.24), (0.22, 0.16, 0.34), skip="y")
        for i in range(6):
            shard(tb, -0.14 + (i % 3) * 0.14, 0.055, -0.06 + (i // 3) * 0.12, 0.05, 300 + i, "shard" if i % 2 else "shard_amber")
    book_stack(tb, 1.95, 1.08, -d / 2 + 2.35, 3, rr, 20)
    # rear wall: two shelf units behind the counter (the drawer wall on the left comes with dress_exchange)
    shelf(tb, 0.0, -d / 2 + 0.3, 2.0, goods="boxes", seed=1)
    shelf(tb, 2.4, -d / 2 + 0.3, 2.2, goods="jars", seed=2)
    # six glass cases, three per side wall
    k = 0
    for sx in (-1, 1):
        for cz in (-2.2, 0.4, 3.0):
            cx = sx * (w / 2 - 0.62)
            glass_case(tb, cx, cz, 90 * sx, 40 + k)
            tb.socket(f"socket_lamp_case_{k}", (cx, 1.2, cz))
            k += 1
    # the memory-shard pedestal: three round stone steps, a dark bronze ring 1.6 m, violet over amber
    px, pz = -1.55, -0.6
    with tb.at(T(px, 0, pz)):
        for i, (r, hh) in enumerate(((1.25, 0.16), (1.0, 0.16), (0.75, 0.16))):
            tb.cyl("stone", (0, i * 0.16, 0), r, r - 0.02, hh, 28, tint(STONE, 1.0 + 0.05 * i), cap_top=True)
        tb.ring("bronze", (0, 0.165, 0), 1.22, 1.15, 0.012, 28, axis="y")
        tb.cyl("stone", (0, 0.48, 0), 0.32, 0.26, 0.5, 12, STONE_DARK, cap_top=True)
        for k3 in range(3):                                   # three curved bronze supports (S-004_01)
            a3 = math.tau * k3 / 3 + math.pi / 2
            ca3, sa3 = math.cos(a3), math.sin(a3)
            pts3 = [(ca3 * (0.30 + 0.30 * u), 0.98 + 0.55 * u * u, sa3 * 0.30 * (1 - u) * 0.6) for u in (0.0, 0.33, 0.66, 1.0)]
            for (p0, p1) in zip(pts3, pts3[1:]):
                tb.beam("bronze", p0, p1, 0.06, 0.06)
        tb.ring("bronze", (0, 1.78, 0), 0.82, 0.72, 0.1, 36, (0.62, 0.48, 0.34))
        tb.ring("bronze", (0, 1.78, 0), 0.7, 0.68, 0.12, 36)
        for k2 in range(8):
            a = math.tau * k2 / 8
            tb.cyl("shard_amber", (math.cos(a) * 0.77, 1.78 + math.sin(a) * 0.77, 0.06), 0.035, 0.03, 0.02, 6)
        tb.cyl("bronze", (0, 0.98, 0), 0.2, 0.12, 0.08, 12, cap_top=True)
        with tb.at(T(0, 1.06, 0)):
            # a long double-pointed crystal: amber lower half, violet upper half
            n = 6
            for kk in range(n):
                a0, a1 = math.tau * kk / n, math.tau * (kk + 1) / n
                p0 = (math.cos(a0) * 0.24, 0.7, -math.sin(a0) * 0.24)
                p1 = (math.cos(a1) * 0.24, 0.7, -math.sin(a1) * 0.24)
                q0 = (math.cos(a0) * 0.2, 0.42, -math.sin(a0) * 0.2)
                q1 = (math.cos(a1) * 0.2, 0.42, -math.sin(a1) * 0.2)
                tb.poly("shard", [p0, p1, (0, 1.42, 0)])
                tb.quad("shard_amber", q1, q0, (q0[0] * 1.2, 0.7, q0[2] * 1.2), (q1[0] * 1.2, 0.7, q1[2] * 1.2))
                tb.poly("shard_amber", [q1, q0, (0, 0.0, 0)])
        tb.col_cyl((0, 0, 0), 1.25, 0.48, 12)
        tb.col_cyl((0, 0, 0), 0.4, 2.6, 8)
        tb.socket("socket_lamp_pedestal", (0, 1.9, 0.4))
        tb.socket("shop_pedestal", (0, 0, 1.6), 180.0)
        tb.light((0, 1.9, 0.0), (0.72, 0.5, 1.0), 120.0, 0.2)
    potted_plant(tb, 3.6, 0, d / 2 - 0.6, 7)
    dress_exchange(tb, w, d, h, rr)
    hanging_ring_lamp(tb, "socket_lamp_ceiling", 0, 0.6, h, 0.85)
    walls = _walls(w, d)
    for wn in ("west", "east"):
        for off in (-3.6, 3.6):
            sconce(tb, f"socket_lamp_wall_{wn}_{'a' if off < 0 else 'b'}", walls[wn][0], off)
    sconce(tb, "socket_lamp_door_l", walls["south"][0], -1.5)
    sconce(tb, "socket_lamp_door_r", walls["south"][0], 1.5)
    window_lights(tb, w, d)


def desk(tb, cx, cz, rot, k, rr, lamp_side=1):
    """S-002 slanted drawing desk 1.6 x 0.8 m with an arm lamp, a pinned chart, ink and quills; a stool."""
    with tb.at(T(cx, 0, cz), RY(rot)):
        for lx in (-0.72, 0.72):
            tb.box("timber", (lx, 0.45, 0), (0.08, 0.9, 0.7), TIMBER, skip="y", uv_dir=(0, 1, 0))
        tb.box("timber", (0, 0.2, 0), (1.44, 0.06, 0.06), TIMBER, uv_dir=(1, 0, 0))
        tb.box("timber", (0, 0.88, -0.32), (1.6, 0.06, 0.2), TIMBER_LIGHT, uv_dir=(1, 0, 0))
        with tb.at(T(0, 0.98, 0.08), RX(-18)):
            tb.box("timber", (0, 0, 0), (1.6, 0.05, 0.64), TIMBER_LIGHT, uv_dir=(1, 0, 0))
            tb.box("timber", (0, 0.04, 0.31), (1.5, 0.04, 0.03), TIMBER)
            with tb.at(RY(rr.uniform(-6, 6))):
                tb.box("paper", (0, 0.03, 0), (0.9, 0.006, 0.56), skip="y")
                with tb.at(T(rr.uniform(-0.15, 0.15), 0.035, 0), RX(-90)):
                    tb.ring("ink", (0, 0, 0), 0.18, 0.165, 0.004, 20)
                    tb.ring("ink", (0.04, 0.02, 0), 0.08, 0.07, 0.004, 12)
            with tb.at(T(-0.62, 0.05, -0.05), RX(90)):
                tb.cyl("paper", (0, -0.25, 0), 0.04, 0.04, 0.5, 7, cap_top=True, cap_bot=True)
        tb.cyl("ceramic", (0.5, 0.91, -0.32), 0.035, 0.03, 0.06, 8, (0.12, 0.12, 0.16), cap_top=True)
        tb.beam("paper", (0.52, 0.93, -0.32), (0.58, 1.18, -0.36), 0.008, 0.02)
        # the arm lamp: base, two arms, a bronze shade
        ax = lamp_side * 0.64
        tb.cyl("bronze", (ax, 0.91, -0.34), 0.07, 0.06, 0.025, 10, cap_top=True)
        tb.beam("bronze", (ax, 0.93, -0.34), (ax, 1.45, -0.3), 0.022, 0.022)
        tb.beam("bronze", (ax, 1.45, -0.3), (ax * 0.55, 1.5, 0.0), 0.02, 0.02)
        tb.lathe("bronze", (ax * 0.55, 1.32, 0.02), [(0.13, 0.0), (0.09, 0.08), (0.04, 0.16)], 10)
        tb.disc("lamp", (ax * 0.55, 1.325, 0.02), 0.09, 10)
        tb.light((ax * 0.55, 1.28, 0.02), (1.0, 0.72, 0.42), 45.0, 0.06)
        tb.socket(f"socket_lamp_desk_{k}", (ax * 0.55, 1.28, 0.02))
        tb.col_box((0, 0.5, 0), (1.6, 1.0, 0.8))
    sx, sz = cx + math.sin(math.radians(rot)) * 0.75, cz + math.cos(math.radians(rot)) * 0.75
    stool(tb, sx, sz, f"npc_seat_scribe_{k}", rot + 180)


def chart_rack(tb, x, z, rot, rr):
    """S-002 chart rack 1.2 x 0.6 x 1.6 m: a slanted board with pinned sheets and a basket of rolled charts."""
    with tb.at(T(x, 0, z), RY(rot)):
        for lx in (-0.56, 0.56):
            tb.beam("timber", (lx, 0, 0.25), (lx, 1.6, -0.1), 0.07, 0.07, TIMBER)
            tb.beam("timber", (lx, 0, -0.28), (lx, 1.2, -0.12), 0.06, 0.06, TIMBER)
        with tb.at(T(0, 0.95, 0.1), RX(-14)):
            tb.box("timber", (0, 0, 0), (1.12, 1.1, 0.04), TIMBER_LIGHT, uv_dir=(1, 0, 0))
            for i in range(3):
                with tb.at(T(-0.33 + i * 0.33, rr.uniform(-0.15, 0.2), 0.025), RZ(rr.uniform(-5, 5))):
                    tb.box("paper", (0, 0, 0), (0.3, 0.42, 0.006), skip="z")
                    tb.ring("ink", (0, 0.03, 0.006), 0.1, 0.09, 0.003, 12)
        tb.box("timber", (0, 0.32, -0.15), (1.1, 0.04, 0.3), TIMBER)
        for i in range(6):
            with tb.at(T(-0.45 + i * 0.18, 0.36, -0.15), RZ(90), RX(rr.uniform(-8, 8))):
                tb.cyl("paper", (0, -0.3, 0), 0.045, 0.045, 0.6, 7, tint((1, 0.95, 0.85), rr.uniform(0.85, 1.0)), cap_top=True, cap_bot=True)
        tb.col_box((0, 0.8, 0), (1.2, 1.6, 0.6))


def build_scribe(tb):
    """S-002 Scribe of Signs (sheet S-002_02): counter offset right on the rear wall, ten bronze-rimmed round
    signs above it, four slanted desks in two pairs either side of a terracotta runner, chart racks in the
    rear-left corner, timber wainscot, plants on the sills."""
    sp = next(s for s in P.SHOPS if s["id"] == "scribe")
    w, d = sp["interior"]
    h = 3.6
    rr = random.Random(202)
    room(tb, w, d, h, (0.92, 0.88, 0.76), rr, floor=False)
    stone_floor(tb, w, d, rr, (0.74, 0.70, 0.64))
    door_surround(tb, w, d)
    window_blinds(tb, w, d, [(0.38, 0.45, 0.30), (0.92, 0.88, 0.76)])
    runner(tb, -d / 2 + 3.0, d / 2 - 0.2, 1.5, (0.62, 0.30, 0.20))
    counter(tb, 0.7, -d / 2 + 2.5, 3.6)
    tb.socket("shopkeeper_stand", (0, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (0, 0, -d / 2 + 3.5), 180.0)
    open_book(tb, 0.1, 1.08, -d / 2 + 2.5, 6)
    book_stack(tb, 1.9, 1.08, -d / 2 + 2.4, 4, rr, -12)
    tb.cyl("ceramic", (1.3, 1.08, -d / 2 + 2.3), 0.04, 0.035, 0.07, 8, (0.12, 0.12, 0.16), cap_top=True)
    tb.beam("paper", (1.3, 1.12, -d / 2 + 2.3), (1.36, 1.38, -d / 2 + 2.26), 0.008, 0.024)
    with tb.at(T(-0.65, 1.08, -d / 2 + 2.45), RY(80)):
        for i in range(3):
            with tb.at(T(0, 0.05 + i * 0.08, 0), RX(90)):
                tb.cyl("paper", (0, -0.3, 0), 0.04, 0.04, 0.6, 7, tint((1, 0.95, 0.85), 0.9 + 0.05 * i), cap_top=True, cap_bot=True)
    # the wall of ten round signs (0.6 m each), two rows of five, timber backboard behind
    kinds = ["arc", "spike", "loop", "drop"]
    with tb.at(T(0.5, 0, -d / 2 + 0.08)):
        tb.box("timber", (0, 2.32, 0.02), (4.6, 1.7, 0.05), tint(TIMBER, 0.6), skip="zy", uv_dir=(1, 0, 0))
        for row in range(2):
            for col in range(5):
                cx, cy = -1.8 + col * 0.9, 1.9 + row * 0.82
                tb.ring("bronze", (cx, cy, 0.07), 0.3, 0.26, 0.04, 24)
                tb.poly("timber", [(cx + math.cos(math.tau * i / 20) * 0.26, cy + math.sin(math.tau * i / 20) * 0.26, 0.06) for i in range(20)], tint(TIMBER, 0.45))
                kind = kinds[(row * 5 + col) % 4]
                with tb.at(T(cx, 0, 0)):
                    _glyph(tb, kind, 0.0, math.pi / 2, cy - 0.02, 0.075, s=0.16, m="bronze", t=0.014, wline=0.03)
    # four desks: two pairs either side of the 1.5 m route, the front-left one turned toward the window
    k = 0
    for sx, cz, rot in ((-1, -1.4, 180), (-1, 1.6, 160), (1, -1.4, 180), (1, 1.6, 180)):
        desk(tb, sx * 2.35, cz, rot, k, rr, lamp_side=-sx)
        k += 1
    chart_rack(tb, -w / 2 + 0.75, -d / 2 + 1.2, 60, rr)
    chart_rack(tb, -w / 2 + 0.55, -d / 2 + 2.7, 90, rr)
    shelf(tb, w / 2 - 0.3, -d / 2 + 1.6, 2.0, rot=-90, goods="books", seed=4)
    shelf(tb, w / 2 - 0.3, d / 2 - 1.6, 1.8, rot=-90, goods="scrolls", seed=5)
    with tb.at(T(-w / 2 + 0.6, 0, d / 2 - 1.2)):   # a basket of tall rolled charts by the door
        tb.cyl("timber", (0, 0, 0), 0.32, 0.28, 0.62, 10, TIMBER, cap_top=False)
        for i in range(7):
            a = math.tau * i / 7
            tb.cyl("paper", (math.cos(a) * 0.15, 0.1, math.sin(a) * 0.15), 0.045, 0.045, rr.uniform(0.9, 1.4), 7, tint((1, 0.95, 0.8), rr.uniform(0.82, 1.0)), cap_top=True)
        tb.col_cyl((0, 0, 0), 0.32, 1.2, 8)
    # plants on the window sills
    for name, (m, ww) in _walls(w, d).items():
        if name in ("west", "east"):
            with tb.at(m):
                nwin = max(1, int(ww / 3.6))
                for i in range(nwin):
                    potted_plant(tb, -ww / 2 + ww * (i + 0.5) / nwin + 0.42, 1.25, 0.2, 60 + i + (5 if name == "east" else 0), 0.12)
    potted_plant(tb, 2.0, 0, d / 2 - 0.6, 71, 0.24)
    dress_scribe(tb, w, d, h, rr)
    hanging_ring_lamp(tb, "socket_lamp_ceiling", 0, 0.4, h, 0.8)
    walls = _walls(w, d)
    for wn in ("west", "east"):
        sconce(tb, f"socket_lamp_wall_{wn}", walls[wn][0], 0.0)
    sconce(tb, "socket_lamp_door_l", walls["south"][0], -1.5)
    sconce(tb, "socket_lamp_door_r", walls["south"][0], 1.5)
    window_lights(tb, w, d)


def bench_seat(tb, x, z, length, rot=0.0, back=False):
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, 0.44, 0), (length, 0.06, 0.38), TIMBER_LIGHT, uv_dir=(1, 0, 0))
        for lx in (-length / 2 + 0.12, length / 2 - 0.12):
            tb.box("timber", (lx, 0.21, 0), (0.08, 0.42, 0.32), TIMBER, skip="y", uv_dir=(0, 1, 0))
        if back:
            tb.box("timber", (0, 0.8, -0.18), (length, 0.6, 0.06), TIMBER, uv_dir=(1, 0, 0))
        tb.col_box((0, 0.24, 0), (length, 0.48, 0.38))


def build_inn(tb):
    """S-003 Inn (sheet S-003_02): bar across the rear with shelves and barrels behind, a stone hearth on the
    left wall with a bench nook and a rug, two communal tables (right-front, middle off-axis), six clan
    banners, windows on the right wall, plank floor."""
    sp = next(s for s in P.SHOPS if s["id"] == "inn")
    w, d = sp["interior"]
    h = 3.8
    rr = random.Random(303)
    room(tb, w, d, h, (0.94, 0.86, 0.68), rr, windows=("east",))
    door_surround(tb, w, d)
    window_blinds(tb, w, d, [(0.66, 0.30, 0.20), (0.92, 0.86, 0.72)], walls=("east",))
    counter(tb, 0.0, -d / 2 + 2.5, 6.4)
    tb.socket("shopkeeper_stand", (1.2, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (1.2, 0, -d / 2 + 3.5), 180.0)
    # on the bar: a bread basket, mugs, a jug, a bell
    with tb.at(T(-0.6, 1.08, -d / 2 + 2.55)):
        tb.lathe("timber", (0, 0, 0), [(0.14, 0.0), (0.22, 0.1), (0.24, 0.12)], 12, TIMBER_LIGHT, cap_bot=True)
        for i in range(4):
            tb.blob("plaster", (math.cos(i * 1.6) * 0.1, 0.12, math.sin(i * 1.6) * 0.1), 0.085, (0.78, 0.50, 0.24), seed=i, squash=0.7, sub=1, col_var=0.06)
    for i in range(4):
        mx = 0.6 + i * 0.24
        tb.cyl("ceramic", (mx, 1.08, -d / 2 + 2.6), 0.045, 0.04, 0.12, 8, (0.86, 0.80, 0.70), cap_top=True)
    tb.lathe("ceramic", (1.8, 1.08, -d / 2 + 2.55), [(0.07, 0.0), (0.1, 0.1), (0.06, 0.22), (0.07, 0.27)], 10, (0.72, 0.50, 0.32), cap_bot=True)
    tb.lathe("bronze", (-1.9, 1.08, -d / 2 + 2.6), [(0.06, 0.0), (0.06, 0.03), (0.035, 0.08), (0.0, 0.1)], 10, cap_bot=True)
    # behind the bar: shelves of crockery and bottles, a rack of barrels
    shelf(tb, -2.4, -d / 2 + 0.3, 2.2, goods="jars", seed=11)
    shelf(tb, 2.6, -d / 2 + 0.3, 2.2, goods="jars", seed=12)
    with tb.at(T(0.1, 0, -d / 2 + 0.55)):
        tb.box("timber", (0, 0.35, 0), (2.4, 0.08, 0.6), TIMBER)
        tb.box("timber", (0, 1.1, 0), (2.4, 0.08, 0.6), TIMBER)
        for i in range(3):
            for row, yy in enumerate((0.39, 1.14)):
                with tb.at(T(-0.8 + i * 0.8, yy + 0.3, 0), RX(90)):
                    H.barrel(tb, 0, 0, -0.3, 0.3, 0.6, rr)
                tb.cyl("bronze", (-0.8 + i * 0.8, yy + 0.22, 0.30), 0.025, 0.025, 0.09, 6)          # spigot (S-004_03)
                tb.box("bronze", (-0.8 + i * 0.8, yy + 0.30, 0.37), (0.06, 0.03, 0.03))
        tb.col_box((0, 0.9, 0), (2.4, 1.8, 0.6))
    # the hearth on the left wall: stone surround, a kettle on a hook, logs, a bench nook beside it
    with tb.at(T(-w / 2, 0, -0.6), RY(90)):
        tb.box("stone", (0, 0.2, 0.55), (2.6, 0.4, 1.1), STONE_DARK, skip="yz")
        for sx in (-1, 1):
            tb.box("stone", (sx * 1.05, 1.0, 0.35), (0.5, 2.0, 0.7), STONE, skip="yz")
        tb.box("stone", (0, 1.75, 0.4), (2.9, 0.4, 0.8), tint(STONE, 1.08), skip="z")
        tb.box("timber", (0, 2.0, 0.45), (3.0, 0.12, 0.9), TIMBER, skip="z")
        tb.box("stone", (0, 2.95, 0.3), (1.8, 1.9, 0.6), STONE, skip="zY")
        tb.box("stone", (0, 1.0, 0.04), (1.6, 1.3, 0.04), (0.06, 0.05, 0.05), skip="z")
        for i in range(3):
            tb.beam("timber", (-0.4 + i * 0.3, 0.46, 0.3), (0.3 - i * 0.25, 0.52 + i * 0.05, 0.6), 0.12, 0.12, tint(TIMBER, 0.5))
        # the fire: a bed of embers under the logs and tongues of flame, each a bright core inside an orange sheath
        tb.box("fire", (0, 0.43, 0.42), (0.95, 0.05, 0.42))
        for i, (fx, fz, fh, fr) in enumerate(((-0.34, 0.40, 0.30, 0.09), (-0.16, 0.50, 0.46, 0.12), (0.02, 0.38, 0.58, 0.13),
                                             (0.2, 0.52, 0.42, 0.11), (0.36, 0.42, 0.28, 0.08), (-0.02, 0.56, 0.32, 0.09))):
            lean = 0.05 * (1 if i % 2 else -1)
            tb.lathe("fire", (fx, 0.46, fz), [(0.0, 0.0), (fr, fh * 0.2), (fr * 0.78, fh * 0.5), (fr * 0.3, fh * 0.82), (0.0, fh)], 7)
            tb.lathe("lamp", (fx + lean * 0.3, 0.47, fz), [(0.0, 0.0), (fr * 0.5, fh * 0.16), (fr * 0.36, fh * 0.4), (0.0, fh * 0.66)], 6)
        tb.beam("iron", (0, 1.55, 0.15), (0, 1.55, 0.5), 0.03, 0.03)
        tb.beam("iron", (0, 1.55, 0.5), (0, 1.15, 0.5), 0.015, 0.015)
        tb.lathe("iron", (0, 0.86, 0.5), [(0.0, 0.0), (0.14, 0.04), (0.17, 0.16), (0.12, 0.28)], 10)
        tb.ring("bronze", (0, 2.9, 0.62), 0.38, 0.3, 0.06, 20)
        for i in range(5):   # log stack in a niche beside the hearth
            with tb.at(T(1.55, 0.12 + (i // 3) * 0.2, 0.3 + (i % 3) * 0.0), RZ(90)):
                tb.cyl("timber", (0, -0.25 + (i % 3) * 0.0, -0.18 + (i % 3) * 0.18), 0.09, 0.09, 0.5, 7, tint(TIMBER_LIGHT, 0.8), cap_top=True, cap_bot=True)
        tb.socket("socket_lamp_hearth", (0, 0.8, 1.0))
        tb.light((0, 0.75, 0.75), (1.0, 0.46, 0.14), 420.0, 0.35)
        tb.col_box((0, 1.0, 0.45), (2.9, 2.0, 0.9))
    rug(tb, -2.9, -0.6, 2.6, 2.0, (0.52, 0.18, 0.12), rot=90)
    # bench nook in the front-left corner with cushions
    bench_seat(tb, -w / 2 + 0.3, 3.4, 2.2, rot=90, back=True)
    for i in range(3):
        tb.blob("cloth", (-w / 2 + 0.35, 0.56, 2.7 + i * 0.7), 0.17, (0.62, 0.22, 0.16), seed=50 + i, squash=0.55, sub=1, col_var=0.05)
    table(tb, -w / 2 + 1.15, 3.4, 0.8, 1.4)
    tb.socket("npc_seat_inn_nook_0", (-w / 2 + 0.4, 0.0, 3.0), 90.0, sit=True, seat_height=0.46)
    tb.socket("npc_seat_inn_nook_1", (-w / 2 + 0.4, 0.0, 3.8), 90.0, sit=True, seat_height=0.46)
    # communal tables: one in the middle off the axis, one right-front, with benches and stools
    k = 0
    for tx, tz in ((1.4, -0.4), (2.0, 3.4)):
        table(tb, tx, tz, 3.0, 1.0)
        for side in (-1, 1):
            bench_seat(tb, tx, tz + side * 0.85, 2.6, rot=0)
            for i in range(3):
                tb.socket(f"npc_seat_inn_{k}", (tx - 0.9 + i * 0.9, 0.0, tz + side * 0.85), 0.0 if side < 0 else 180.0, sit=True, seat_height=0.46)
                k += 1
        for i in range(3):
            tb.cyl("ceramic", (tx - 0.9 + i * 0.85, 0.815, tz + (0.18 if i % 2 else -0.16)), 0.045, 0.04, 0.12, 8, (0.86, 0.80, 0.70), cap_top=True)
        with tb.at(T(tx + 0.3, 0.815, tz)):
            tb.lathe("timber", (0, 0, 0), [(0.12, 0.0), (0.18, 0.07), (0.2, 0.09)], 12, TIMBER_LIGHT, cap_bot=True)
            for i in range(3):
                tb.blob("foliage", (math.cos(i * 2.1) * 0.07, 0.08, math.sin(i * 2.1) * 0.07), 0.055, (0.80, 0.42, 0.12), seed=80 + i, squash=0.9, sub=1, col_var=0.05)
        # a table lantern (swing-free) with a bake light
        tb.cyl("bronze", (tx - 0.5, 0.815, tz), 0.06, 0.05, 0.03, 8, cap_top=True)
        tb.box("lamp", (tx - 0.5, 0.92, tz), (0.1, 0.16, 0.1))
        tb.cyl("bronze", (tx - 0.5, 1.0, tz), 0.07, 0.01, 0.06, 8)
        tb.light((tx - 0.5, 0.95, tz), (1.0, 0.66, 0.34), 35.0, 0.05)
    stool(tb, -1.5, 4.9, "npc_seat_inn_stool_0", 0.0)
    potted_plant(tb, w / 2 - 0.5, 0, d / 2 - 0.6, 91, 0.26)
    potted_plant(tb, -1.6, 0, -d / 2 + 3.2, 92, 0.22)
    # the six clan banners, distributed around the walls
    walls = _walls(w, d)
    spots = [("east", -6.05), ("south", 3.3), ("east", 6.05), ("west", -4.0), ("west", 2.4), ("north", -4.2)]   # clear of the windows
    for (clan, col), (wall, off) in zip(CLANS, spots):
        m, _ww = walls[wall]
        with tb.at(m, T(off, 0, 0.1)):
            tb.beam("bronze", (-0.42, 3.3, 0.04), (0.42, 3.3, 0.04), 0.035, 0.035)
            tb.box("cloth", (0, 2.6, 0.0), (0.68, 1.36, 0.02), col, skip="z")
            tb.poly("cloth", [(-0.34, 1.92, 0.01), (0.0, 1.66, 0.01), (0.34, 1.92, 0.01)], col)
            tb.box("cloth", (0, 3.18, 0.012), (0.68, 0.08, 0.02), tint(col, 0.6), skip="z")
            tb.ring("bronze", (0, 2.68, 0.02), 0.2, 0.15, 0.012, 16)
    dress_inn(tb, w, d, h, rr)
    hanging_ring_lamp(tb, "socket_lamp_ceiling", 0.8, 0.6, h, 1.0, 10)
    hanging_ring_lamp(tb, "socket_lamp_ceiling_bar", 0.2, -d / 2 + 3.6, h, 0.7, 6)
    sconce(tb, "socket_lamp_wall_east_a", walls["east"][0], -2.2)
    sconce(tb, "socket_lamp_wall_east_b", walls["east"][0], 2.2)
    sconce(tb, "socket_lamp_wall_west", walls["west"][0], 4.4)
    sconce(tb, "socket_lamp_door_l", walls["south"][0], -1.5)
    sconce(tb, "socket_lamp_door_r", walls["south"][0], 1.5)
    window_lights(tb, w, d, walls=("east",))


# ------------------------------------------------------------------ dressing pass (14.11): what makes each room its own

def hanging_lantern(tb, name, x, z, h, drop=1.3, power=38.0, col=(1.0, 0.68, 0.36)):
    """A small bronze lantern on a chain over a table or a case: a swing node, a lamp socket and a bake light,
    so the surface below sits in its own warm pool."""
    with tb.swing(name.replace("socket_", ""), (x, h - 0.02, z), length=drop):
        tb.cyl("iron", (x, h - drop + 0.2, z), 0.012, 0.012, drop - 0.2, 4, cap_top=False)
        tb.lathe("bronze", (x, h - drop + 0.08, z), [(0.02, 0.12), (0.13, 0.04), (0.15, 0.0)], 8)
        tb.box("lamp", (x, h - drop - 0.02, z), (0.13, 0.2, 0.13))
        for sx in (-1, 1):
            for sz in (-1, 1):
                tb.box("iron", (x + sx * 0.07, h - drop - 0.02, z + sz * 0.07), (0.018, 0.22, 0.018))
        tb.cyl("bronze", (x, h - drop - 0.15, z), 0.1, 0.07, 0.03, 8, cap_bot=True)
    tb.socket(name, (x, h - drop - 0.02, z))
    tb.light((x, h - drop - 0.2, z), col, power, 0.07)


def herb_bundle(tb, x, y, z, seed, kind="herb"):
    """Dried herbs, garlic or onions hung from a beam on a cord."""
    rr = random.Random(seed)
    tb.beam("cloth", (x, y, z), (x, y - 0.16, z), 0.012, 0.012, (0.55, 0.45, 0.30))
    if kind == "herb":
        c = rr.choice([(0.30, 0.36, 0.16), (0.42, 0.40, 0.20), (0.36, 0.28, 0.34)])
        tb.cyl("foliage", (x, y - 0.5, z), 0.12, 0.03, 0.36, 6, c, cap_top=False)
        tb.blob("foliage", (x, y - 0.52, z), 0.12, c, seed=seed, squash=0.8, sub=1)
    else:
        c = (0.86, 0.80, 0.66) if kind == "garlic" else (0.72, 0.42, 0.18)
        for i in range(5):
            a = i * 2.4
            tb.blob("plaster", (x + math.cos(a) * 0.045, y - 0.2 - i * 0.075, z + math.sin(a) * 0.045), 0.05, c, seed=seed + i, squash=0.9, sub=1, col_var=0.05)


def copper_pot(tb, x, y, z, r=0.14, seed=0):
    """A copper pan hung from a rail by the ring of its long handle, its round face to the room."""
    col = (0.86, 0.50, 0.30)
    tb.ring("iron", (x, y - 0.035, z), 0.03, 0.02, 0.008, 8)
    tb.beam("bronze", (x, y - 0.06, z), (x, y - 0.06 - r * 1.5, z), 0.022, 0.012, tint(col, 0.8))
    with tb.at(T(x, y - 0.06 - r * 2.4, z - 0.03), RX(90)):
        tb.lathe("bronze", (0, 0, 0), [(r * 0.86, 0.0), (r, 0.012), (r * 1.03, 0.06), (r * 0.96, 0.062), (r * 0.9, 0.02)], 12, col, cap_bot=True)
        tb.disc("bronze", (0, 0.021, 0), r * 0.9, 12, tint(col, 0.7))


def sack(tb, x, z, seed, r=0.3, col=(0.62, 0.52, 0.36)):
    tb.blob("cloth", (x, r * 0.8, z), r, col, seed=seed, squash=1.25, sub=2, col_var=0.05, jitter=0.1)
    tb.blob("cloth", (x, r * 1.75, z), r * 0.28, tint(col, 0.85), seed=seed + 1, squash=0.8, sub=1)


def crate(tb, x, y, z, s, rot, rr):
    with tb.at(T(x, y, z), RY(rot)):
        tb.box("timber", (0, s / 2, 0), (s, s, s), tint(TIMBER_LIGHT, rr.uniform(0.7, 0.95)), uv_dir=(1, 0, 0))
        for sy in (0.12, s - 0.12):
            tb.box("timber", (0, sy, 0), (s + 0.03, 0.08, s + 0.03), TIMBER, skip="y", uv_dir=(1, 0, 0))


def wall_chart(tb, x, y, w, h, rr, kind="rings"):
    """In wall space: a pinned parchment chart with ink circles, a timber batten above and below."""
    with tb.at(T(x, y, 0.07), RZ(rr.uniform(-2.5, 2.5))):
        tb.box("paper", (0, 0, 0), (w, h, 0.008), tint((1.0, 0.94, 0.80), rr.uniform(0.86, 1.0)), skip="z")
        for sy in (-1, 1):
            tb.box("timber", (0, sy * (h / 2), 0.008), (w + 0.06, 0.035, 0.03), TIMBER)
        n = rr.randint(2, 4)
        for i in range(n):
            cx, cy, r = rr.uniform(-w * 0.28, w * 0.28), rr.uniform(-h * 0.28, h * 0.28), rr.uniform(0.07, min(w, h) * 0.26)
            tb.ring("ink", (cx, cy, 0.008), r, r - 0.012, 0.003, 18)
        tb.box("ink", (0, -h * 0.38, 0.008), (w * 0.6, 0.01, 0.003))


def drying_line(tb, x0, z0, x1, z1, y, rr, n=7):
    """A cord across the room with freshly inked sheets pegged to it (the Scribe's own ceiling)."""
    sag = 0.14
    pts = []
    for i in range(n * 2 + 1):
        u = i / (n * 2)
        pts.append((x0 + (x1 - x0) * u, y - sag * 4 * u * (1 - u), z0 + (z1 - z0) * u))
    for a, b in zip(pts, pts[1:]):
        tb.beam("cloth", a, b, 0.012, 0.012, (0.50, 0.40, 0.28))
    ang = math.degrees(math.atan2(-(z1 - z0), x1 - x0))
    for i in range(n):
        px, py, pz = pts[i * 2 + 1]
        hh = rr.uniform(0.34, 0.46)
        with tb.at(T(px, py, pz), RY(ang), RX(rr.uniform(-7, 7))):
            tb.box("paper", (0, -hh / 2 - 0.01, 0), (0.3, hh, 0.006), tint((1.0, 0.95, 0.82), rr.uniform(0.85, 1.0)), skip="y")
            r = rr.uniform(0.06, 0.1)
            for sz in (-1, 1):
                tb.ring("ink", (0, -hh / 2, sz * 0.005), r, r - 0.012, 0.002, 14)
            tb.box("timber", (0, 0.0, 0), (0.03, 0.06, 0.02), TIMBER_LIGHT)


def drawer_wall(tb, x, z, w, hgt, cols, rows, rot=0.0):
    """The Exchange's wall of small deposit drawers: a tall cabinet, a grid of fronts each with a bronze pull,
    a few standing open with a shard glowing inside."""
    rr = random.Random(int(w * 100) + cols)
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, hgt / 2 + 0.1, 0), (w, hgt, 0.5), tint(TIMBER, 0.9), skip="y", uv_dir=(0, 1, 0))
        tb.box("timber", (0, 0.05, 0.02), (w + 0.08, 0.1, 0.58), tint(TIMBER, 0.7), uv_dir=(1, 0, 0))
        tb.box("timber", (0, hgt + 0.14, 0.02), (w + 0.12, 0.08, 0.6), TIMBER, uv_dir=(1, 0, 0))
        cw, ch = (w - 0.1) / cols, (hgt - 0.1) / rows
        for i in range(cols):
            for j in range(rows):
                cx, cy = -w / 2 + 0.05 + cw * (i + 0.5), 0.15 + ch * (j + 0.5)
                opened = rr.random() < 0.08 and 0 < j < rows - 1
                zf = 0.26 + (0.16 if opened else 0.0)
                tb.box("timber", (cx, cy, zf), (cw - 0.035, ch - 0.035, 0.03), tint(TIMBER_LIGHT, rr.uniform(0.72, 0.98)), uv_dir=(1, 0, 0))
                tb.cyl("bronze", (cx, cy - 0.012, zf + 0.015), 0.022, 0.016, 0.03, 6)
                if opened:
                    tb.box("timber", (cx, cy - ch / 2 + 0.03, 0.33), (cw - 0.06, 0.02, 0.16), TIMBER)
                    shard(tb, cx, cy - ch / 2 + 0.04, 0.34, 0.07, i * 31 + j, "shard" if (i + j) % 2 else "shard_amber")
        tb.col_box((0, hgt / 2 + 0.1, 0), (w, hgt, 0.5))


def strongbox(tb, x, z, rot, s=0.7):
    with tb.at(T(x, 0, z), RY(rot)):
        tb.box("timber", (0, s * 0.3, 0), (s, s * 0.6, s * 0.62), tint(TIMBER, 0.8), uv_dir=(1, 0, 0))
        with tb.at(T(-s / 2, s * 0.6, 0), RZ(-90)):
            tb.cyl("timber", (0, 0, 0), s * 0.31, s * 0.31, s, 10, tint(TIMBER, 0.9), cap_top=True, cap_bot=True)
        for bx in (-s * 0.34, 0.0, s * 0.34):
            tb.box("bronze", (bx, s * 0.31, 0), (0.05, s * 0.64, s * 0.66))
        tb.box("bronze", (0, s * 0.5, s * 0.33), (0.12, 0.14, 0.03))
        tb.col_box((0, s * 0.45, 0), (s, s * 0.9, s * 0.62))


def dress_inn(tb, w, d, h, rr):
    # over the bar: a rail of copper pots, bundles of herbs, garlic and onions on the joist above the keeper
    zb = -d / 2 + 2.5
    tb.beam("iron", (-2.9, h - 0.62, zb), (2.9, h - 0.62, zb), 0.025, 0.025)
    for sx in (-2.9, 0.0, 2.9):
        tb.beam("iron", (sx, h - 0.62, zb), (sx, h - 0.26, zb), 0.02, 0.02)
    for i, px in enumerate((-2.5, -2.05, -1.6, 1.5, 1.95, 2.45)):
        copper_pot(tb, px, h - 0.62, zb, 0.11 + 0.03 * (i % 3), i)
    for i, px in enumerate((-1.0, -0.55, -0.1, 0.35, 0.8)):
        herb_bundle(tb, px, h - 0.62, zb, 500 + i, ("herb", "garlic", "herb", "onion", "herb")[i])
    # a warm lantern low over each communal table and over the bench nook
    hanging_lantern(tb, "socket_lamp_table_a", 1.4, -0.4, h, 1.55, 46.0)
    hanging_lantern(tb, "socket_lamp_table_b", 2.0, 3.4, h, 1.55, 46.0)
    hanging_lantern(tb, "socket_lamp_nook", -w / 2 + 1.0, 3.4, h, 1.5, 30.0)
    # stores by the bar's end and the door: sacks, crates, a small keg
    sack(tb, w / 2 - 0.6, -d / 2 + 1.2, 601, 0.3)
    sack(tb, w / 2 - 0.95, -d / 2 + 0.8, 603, 0.26, (0.56, 0.50, 0.40))
    crate(tb, -w / 2 + 0.55, 0, -d / 2 + 0.6, 0.62, 8, rr)
    crate(tb, -w / 2 + 0.5, 0.62, -d / 2 + 0.62, 0.46, -14, rr)
    crate(tb, w / 2 - 0.55, 0, d / 2 - 1.7, 0.56, 20, rr)
    with tb.at(T(w / 2 - 0.55, 0.56, d / 2 - 1.7)):
        H.barrel(tb, 0, 0, 0, 0.22, 0.46, rr)
    # the hearth side: a basket of logs, a poker stand, a second rug layer under the bench
    with tb.at(T(-w / 2 + 0.55, 0, 1.25)):
        tb.cyl("timber", (0, 0, 0), 0.3, 0.36, 0.4, 10, tint(TIMBER_LIGHT, 0.8), cap_top=False, cap_bot=True)
        for i in range(5):
            with tb.at(T(-0.12 + (i % 3) * 0.12, 0.3 + (i // 3) * 0.14, 0), RX(90), RY(rr.uniform(-12, 12))):
                tb.cyl("timber", (0, -0.26, 0), 0.07, 0.07, 0.52, 7, tint(TIMBER_LIGHT, rr.uniform(0.6, 0.9)), cap_top=True, cap_bot=True)
    walls = _walls(w, d)
    # by the door: a peg board with the regulars' mugs; on the hearth wall: a striped woven hanging
    with tb.at(walls["south"][0], T(-3.3, 1.75, 0.0)):
        tb.box("timber", (0, 0, 0.05), (1.5, 0.16, 0.04), TIMBER, uv_dir=(1, 0, 0))
        tb.box("timber", (0, 0.11, 0.09), (1.56, 0.04, 0.14), TIMBER_LIGHT, uv_dir=(1, 0, 0))
        for i in range(6):
            px = -0.6 + i * 0.24
            tb.beam("timber", (px, -0.02, 0.06), (px, 0.0, 0.16), 0.022, 0.022, TIMBER_LIGHT)
            c = [(0.86, 0.80, 0.70), (0.52, 0.62, 0.62), (0.74, 0.50, 0.34)][i % 3]
            tb.cyl("ceramic", (px, -0.17, 0.15), 0.05, 0.045, 0.12, 8, c, cap_top=False, cap_bot=True)
            tb.ring("ceramic", (px, -0.11, 0.15), 0.035, 0.022, 0.012, 8, c, axis="x")
    with tb.at(walls["west"][0], T(5.2, 0, 0.0)):
        tb.beam("timber", (-0.62, 2.95, 0.07), (0.62, 2.95, 0.07), 0.05, 0.05, TIMBER)
        stripes = [(0.50, 0.17, 0.12), (0.86, 0.76, 0.56), (0.20, 0.28, 0.32), (0.86, 0.76, 0.56), (0.62, 0.38, 0.14), (0.86, 0.76, 0.56), (0.20, 0.28, 0.32), (0.50, 0.17, 0.12)]
        y1 = 2.93
        for i, c in enumerate(stripes):
            y0 = y1 - (0.26 if i in (0, 7) else 0.16)
            tb.quad("cloth", (-0.55, y0, 0.06), (0.55, y0, 0.06), (0.55, y1, 0.06), (-0.55, y1, 0.06), c)
            y1 = y0
        for i in range(11):
            tb.poly("cloth", [(-0.55 + i * 0.1, y1, 0.06), (-0.5 + i * 0.1, y1 - 0.12, 0.06), (-0.45 + i * 0.1, y1, 0.06)], (0.50, 0.17, 0.12))
    rug(tb, 1.4, -0.4, 4.2, 2.9, (0.40, 0.17, 0.12))
    rug(tb, 2.0, 3.4, 4.0, 2.8, (0.22, 0.26, 0.32))
    # plates and a wheel of cheese on the bar, a row of plates on a wall rail left of the shelves
    for i in range(3):
        tb.cyl("ceramic", (-1.4 + i * 0.02, 1.08 + i * 0.018, -d / 2 + 2.42), 0.14, 0.1, 0.016, 12, (0.90, 0.86, 0.78), cap_top=True)
    tb.cyl("plaster", (2.5, 1.08, -d / 2 + 2.5), 0.17, 0.17, 0.1, 12, (0.86, 0.66, 0.24), cap_top=True)


def dress_exchange(tb, w, d, h, rr):
    # the wall of deposit drawers on the west side of the rear wall, where the plain cabinet stood
    drawer_wall(tb, -3.25, -d / 2 + 0.34, 2.1, 2.5, 6, 9)
    # a small lantern low over every glass case: six pools of light along the walls
    k = 0
    for sx in (-1, 1):
        for cz in (-2.2, 0.4, 3.0):
            hanging_lantern(tb, f"socket_lamp_caselight_{k}", sx * (w / 2 - 0.62), cz, h, 1.75, 22.0, (1.0, 0.74, 0.46))
            k += 1
    # strongboxes and a ledger stand by the counter; velvet drapes framing the shelves
    strongbox(tb, 2.9, -d / 2 + 2.3, -20, 0.72)
    strongbox(tb, 3.55, -d / 2 + 1.55, 12, 0.56)
    walls = _walls(w, d)
    with tb.at(walls["north"][0]):
        # the left drape is drawn aside in the arch to the grotto (a rod, a lintel, a jamb and a shard over it); the right one frames the shelves
        ax0, ax1, atop = GROTTO_ARCH
        for dx, top_y, nf in ((ax0, atop - 0.02, 3), (3.62, 3.1, 4)):
            for i in range(nf):
                x0, x1 = dx + i * 0.13, dx + (i + 1) * 0.13
                zf0, zf1 = (0.12, 0.2) if i % 2 else (0.2, 0.12)
                tb.quad("cloth", (x0, 0.05, zf0), (x1, 0.05, zf1), (x1, top_y, zf1), (x0, top_y, zf0), tint((0.20, 0.14, 0.36), 1.0 if i % 2 else 0.8))
        tb.box("timber", ((ax0 + ax1) / 2 - 0.02, atop + 0.1, 0.07), (ax1 - ax0 + 0.34, 0.2, 0.14), TIMBER, uv_dir=(1, 0, 0))
        tb.box("timber", (ax1 + 0.07, atop / 2, 0.06), (0.14, atop, 0.12), TIMBER, skip="y", uv_dir=(0, 1, 0))
        tb.beam("bronze", (ax0 - 0.05, atop - 0.06, 0.16), (ax1 + 0.05, atop - 0.06, 0.16), 0.025, 0.025)
        shard(tb, (ax0 + ax1) / 2, atop + 0.2, 0.12, 0.09, 77, "shard")
    # the keeper's ledger stand between the counter and the pedestal
    with tb.at(T(-2.95, 0, -d / 2 + 1.75), RY(40)):
        tb.box("timber", (0, 0.55, 0), (0.12, 1.1, 0.12), TIMBER, skip="y", uv_dir=(0, 1, 0))
        tb.box("timber", (0, 0.03, 0), (0.5, 0.06, 0.4), TIMBER)
        with tb.at(T(0, 1.14, 0), RX(-20)):
            tb.box("timber", (0, 0, 0), (0.62, 0.04, 0.46), TIMBER_LIGHT, uv_dir=(1, 0, 0))
            open_book(tb, 0, 0.02, 0, 0, 0.85)
        tb.col_box((0, 0.6, 0), (0.5, 1.2, 0.4))
    # two floor candelabra beside the pedestal steps, clear of the aisle
    for cx, cz in ((-2.85, 0.25), (-2.95, -1.5)):
        tb.col_cyl((cx, 0, cz), 0.14, 1.4, 6)
        tb.cyl("bronze", (cx, 0, cz), 0.16, 0.05, 0.05, 10, cap_top=True)
        tb.cyl("bronze", (cx, 0.05, cz), 0.025, 0.025, 1.25, 6)
        tb.lathe("bronze", (cx, 1.3, cz), [(0.03, 0.0), (0.11, 0.05), (0.12, 0.07)], 8)
        tb.cyl("wax", (cx, 1.37, cz), 0.035, 0.035, 0.16, 6)
        tb.cyl("lamp", (cx, 1.53, cz), 0.022, 0.0, 0.07, 5, cap_top=False)
        tb.light((cx, 1.62, cz), (1.0, 0.70, 0.40), 14.0, 0.04)


def dress_scribe(tb, w, d, h, rr):
    # two cords of drying sheets across the room, under the joists
    drying_line(tb, -w / 2 + 0.15, -0.2, w / 2 - 0.15, 0.5, h - 0.75, rr, 8)
    drying_line(tb, -w / 2 + 0.15, 3.3, w / 2 - 0.15, 2.7, h - 0.8, rr, 7)
    # charts pinned between the wall posts
    walls = _walls(w, d)
    for wn, offs in (("west", (-1.83, 1.83)), ("east", (-1.83, 1.83)), ("south", (-3.2, 3.2))):
        with tb.at(walls[wn][0]):
            for off in offs:
                wall_chart(tb, off, 2.0, rr.uniform(0.62, 0.8), rr.uniform(0.8, 1.0), rr)
    # an armillary of bronze rings on the counter, a ladder against the bookshelf, a low reading lantern over the counter
    with tb.at(T(2.15, 1.08, -d / 2 + 2.62)):
        tb.cyl("bronze", (0, 0, 0), 0.1, 0.06, 0.04, 10, cap_top=True)
        tb.cyl("bronze", (0, 0.04, 0), 0.014, 0.014, 0.16, 6)
        for i, (ra, rb) in enumerate(((0, 0), (62, 20), (-48, 70))):
            with tb.at(T(0, 0.4, 0), RY(rb), RX(ra)):
                tb.ring("bronze", (0, 0, 0), 0.2 - i * 0.015, 0.185 - i * 0.015, 0.014, 20)
        tb.blob("ceramic", (0, 0.4, 0), 0.07, (0.30, 0.42, 0.52), seed=3, squash=1.0, sub=2, col_var=0.03, jitter=0.0)
    with tb.at(T(w / 2 - 0.62, 0, -d / 2 + 2.9), RY(-90), RX(-13)):
        for sx in (-0.2, 0.2):
            tb.box("timber", (sx, 1.25, 0), (0.05, 2.5, 0.07), TIMBER_LIGHT, uv_dir=(0, 1, 0))
        for i in range(7):
            tb.box("timber", (0, 0.3 + i * 0.32, 0), (0.4, 0.04, 0.05), TIMBER, uv_dir=(1, 0, 0))
    hanging_lantern(tb, "socket_lamp_counter", 0.7, -d / 2 + 2.6, h, 1.5, 40.0)
    # ink-work corner by the door: a tall jar of quills, stacked paper reams, a crate of scroll tubes
    with tb.at(T(w / 2 - 0.6, 0, d / 2 - 0.7)):
        crate(tb, 0, 0, 0, 0.6, 12, rr)
        for i in range(5):
            tb.box("paper", (rr.uniform(-0.05, 0.05), 0.62 + i * 0.05, rr.uniform(-0.04, 0.04)), (0.42, 0.045, 0.32), tint((1.0, 0.95, 0.84), rr.uniform(0.85, 1.0)))
    rug(tb, -2.35, 0.1, 2.6, 4.6, (0.24, 0.30, 0.24))
    rug(tb, 2.35, 0.1, 2.6, 4.6, (0.24, 0.30, 0.24))



# ------------------------------------------------------------------ the hidden grotto behind the Exchange (14.11)

def _facing(tb, mat, pts, toward, col=(1.0, 1.0, 1.0), **kw):
    """A polygon wound so that its front looks at the point `toward` (cave walls face the cave)."""
    a, b, c = pts[0], pts[1], pts[2]
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    cen = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
    if n[0] * (toward[0] - cen[0]) + n[1] * (toward[1] - cen[1]) + n[2] * (toward[2] - cen[2]) < 0:
        pts = list(reversed(pts))
        if isinstance(col[0], (tuple, list)):
            col = list(reversed(col))
    tb.poly(mat, pts, col, **kw)


def shard_cluster(tb, cx, cy, cz, n, smax, seed, amber=0.25, hang=False):
    """Memory shards grown together: the tallest in the middle, the others leaning out around it."""
    rr = random.Random(seed)
    for t in range(n):
        a = rr.uniform(0, math.tau)
        u = 0.0 if t == 0 else rr.uniform(0.35, 1.0)
        s = smax * (1.0 - 0.55 * u) * rr.uniform(0.75, 1.0)
        px, pz = cx + math.cos(a) * u * smax * 0.42, cz + math.sin(a) * u * smax * 0.42
        mat = "shard_amber" if rr.random() < amber else "shard"
        with tb.at(T(px, cy, pz), RY(-math.degrees(a)), RZ((180.0 if hang else 0.0) - 24.0 * u)):
            shard(tb, 0, -0.04 * s, 0, s, seed * 31 + t, mat)


def grotto(tb, d, x0, x1, top, rr):
    """Behind the Exchange's rear wall: a short rock passage from the curtained arch (x0..x1, `top` high) into a small
    cave where raw memory shards grow around a still pool. Walls face in, a dark shell closes it, colliders all round.
    The keeper's own corner (a stool, a book, a lantern) says whose quiet place this is."""
    zs = -d / 2                      # the room's rear wall plane
    z1 = zs - 1.8                    # where the passage meets the cave
    xm = (x0 + x1) / 2
    R = 3.1
    C = (xm, 0.0, z1 - R)
    rock, rock_d = (0.92, 0.90, 1.0), (0.62, 0.62, 0.74)   # tints over the rock set: cool, a little violet
    eye = (C[0], 1.4, C[2])
    # ---- the passage: floor, two walls, a low gable of rock
    pm = (xm, 1.0, (zs + z1) / 2)
    _facing(tb, "rock", [(x0, 0, zs), (x1, 0, zs), (x1, 0, z1), (x0, 0, z1)], (xm, 5, zs), tint(rock_d, 1.1))
    for xa in (x0, x1):
        _facing(tb, "rock", [(xa, 0, zs), (xa, 0, z1), (xa, top, z1), (xa, top, zs)], pm, [rock_d, rock_d, rock, rock])
        _facing(tb, "rock", [(xa, top, zs), (xa, top, z1), (xm, top + 0.22, z1), (xm, top + 0.22, zs)], pm, tint(rock, 0.8))
        tb.col_poly([(xa, 0, zs), (xa, 0, z1), (xa, 3.0, z1), (xa, 3.0, zs)])
    _facing(tb, "rock", [(x0, top, zs), (xm, top + 0.22, zs), (x1, top, zs)], pm, tint(rock, 0.7))
    tb.col_poly([(x0, 0, zs + 0.05), (x1, 0, zs + 0.05), (x1, 0, z1 - 0.05), (x0, 0, z1 - 0.05)])
    # ---- the cave: a twelve-sided dome of rock, uneven, two bands open where the passage comes in
    N = 12
    rows = [(0.0, 1.0), (1.2, 1.07), (2.2, 0.92), (3.0, 0.6), (3.5, 0.26)]
    jit = [[(rr.uniform(-0.12, 0.12), rr.uniform(-0.2, 0.2)) for _ in rows] for _ in range(N)]
    jit[1] = jit[N - 2] = [(0.0, 0.0)] * len(rows)   # calm rock either side of the passage mouth

    def P(i, k):
        y, f = rows[k]
        if i in (0, N - 1) and k <= 2:
            return (x1 if i == 0 else x0, y, z1)
        th = math.radians((i + 0.5) * 360.0 / N)
        jr, jy = jit[i][k]
        r = R * f * (1.0 + jr)
        return (C[0] + r * math.sin(th), y + (jy if k else 0.0), C[2] + r * math.cos(th))

    for k in range(len(rows) - 1):
        for i in range(N):
            j = (i + 1) % N
            if i == N - 1 and k < 2:
                continue
            c0, c1 = tint(rock if k else rock_d, rr.uniform(0.85, 1.05) - 0.1 * k), tint(rock, rr.uniform(0.85, 1.05) - 0.1 * (k + 1))
            # two triangles, each wound on its own: a twisted band never turns one half away from the cave
            _facing(tb, "rock", [P(i, k), P(j, k), P(j, k + 1)], eye, [c0, c0, c1])
            _facing(tb, "rock", [P(i, k), P(j, k + 1), P(i, k + 1)], eye, [c0, c1, c1])
    apex = (C[0], 3.78, C[2])
    for i in range(N):
        _facing(tb, "rock", [P(i, len(rows) - 1), P((i + 1) % N, len(rows) - 1), apex], eye, tint(rock, 0.55))
        _facing(tb, "rock", [P(i, 0), P((i + 1) % N, 0), (C[0], 0, C[2])], (C[0], 5, C[2]), tint(rock_d, rr.uniform(0.95, 1.2)))
        tb.col_poly([P(i, 0), P((i + 1) % N, 0), (C[0], 0, C[2])])
        if i != N - 1:
            a, b = P(i, 0), P((i + 1) % N, 0)
            tb.col_poly([a, b, (b[0], 3.2, b[2]), (a[0], 3.2, a[2])])
    tb.blob("rock", (xm, top + 0.28, z1 - 0.05), 0.5, tint(rock, 0.8), seed=901, squash=0.55, sub=1, col_var=0.06)   # the lintel boulder over the joint
    # ---- the dark shell around the passage and the cave (the south face keeps the arch open)
    e = 0.06
    xa, xb, za, zb, ya, yb = C[0] - R - 1.2, C[0] + R + 1.2, C[2] - R - 1.2, zs - e, -e, 4.3
    inside = (C[0], 1.5, C[2])
    for q in ([(xa, ya, za), (xb, ya, za), (xb, ya, zb), (xa, ya, zb)], [(xa, yb, za), (xb, yb, za), (xb, yb, zb), (xa, yb, zb)],
              [(xa, ya, za), (xb, ya, za), (xb, yb, za), (xa, yb, za)], [(xa, ya, za), (xa, ya, zb), (xa, yb, zb), (xa, yb, za)],
              [(xb, ya, za), (xb, ya, zb), (xb, yb, zb), (xb, yb, za)],
              [(xa, ya, zb), (x0, ya, zb), (x0, yb, zb), (xa, yb, zb)], [(x1, ya, zb), (xb, ya, zb), (xb, yb, zb), (x1, yb, zb)],
              [(x0, top + 0.3, zb), (x1, top + 0.3, zb), (x1, yb, zb), (x0, yb, zb)]):
        _facing(tb, "rock", q, inside, SHELL)
    # ---- the pool, its rim of stones and moss
    px, pz = C[0] + 0.55, C[2] - 0.45
    tb.disc("rock", (px, 0.012, pz), 1.27, 18, (0.07, 0.12, 0.15))   # the dark bed under the water
    tb.disc("case_glass", (px, 0.05, pz), 1.25, 18)                 # the still surface: the islet's shards glow through it
    for i in range(11):
        a = math.tau * i / 11 + 0.3
        if 1.0 < a < 2.0:
            continue
        tb.blob("rock", (px + math.cos(a) * 1.3, 0.05, pz + math.sin(a) * 1.3), rr.uniform(0.16, 0.3), tint(rock, rr.uniform(0.8, 1.1)), seed=910 + i, squash=0.6, sub=1, col_var=0.05)
        if i % 3 == 0:
            tb.blob("foliage", (px + math.cos(a) * 1.42, 0.1, pz + math.sin(a) * 1.42), 0.17, (0.16, 0.27, 0.15), seed=930 + i, squash=0.5, sub=1)
    # boulders along the foot of the walls break the dome's outline
    for i in range(N):
        if i in (0, N - 1) or rr.random() < 0.25:
            continue
        th = math.radians((i + rr.uniform(0.2, 0.8)) * 360.0 / N)
        br = rr.uniform(0.3, 0.62)
        tb.blob("rock", (C[0] + (R - 0.25) * math.sin(th), br * 0.35, C[2] + (R - 0.25) * math.cos(th)), br, tint(rock, rr.uniform(0.75, 1.0)), seed=960 + i, squash=rr.uniform(0.6, 0.95), sub=2, col_var=0.05, jitter=0.14)
    # ---- the shards: the heart at the back, growths by the walls, a small islet in the water, a few from the roof
    shard_cluster(tb, C[0] - 0.1, 0.0, C[2] - 2.25, 8, 1.05, 41, amber=0.4)
    shard_cluster(tb, C[0] - 2.15, 0.0, C[2] - 0.5, 5, 0.62, 42)
    shard_cluster(tb, C[0] + 2.3, 0.0, C[2] - 1.5, 5, 0.66, 43, amber=0.15)
    shard_cluster(tb, C[0] - 1.6, 0.0, C[2] + 1.7, 4, 0.4, 44)
    shard_cluster(tb, C[0] + 1.85, 0.0, C[2] + 1.55, 4, 0.46, 45, amber=0.5)
    shard_cluster(tb, px + 0.1, 0.02, pz - 0.1, 3, 0.3, 46, amber=0.0)
    shard_cluster(tb, x0 + 0.13, 0.0, zs - 0.95, 3, 0.17, 47)
    shard_cluster(tb, x1 - 0.12, 0.0, zs - 1.45, 3, 0.15, 48, amber=0.6)
    for i, (hx, hz) in enumerate(((-0.9, 0.5), (0.8, -0.9), (-0.3, -1.3), (1.1, 0.7))):
        hy = 3.5 - (math.hypot(hx, hz) - 0.81) * 0.476 + 0.1   # the roof's height there, a little into the rock
        shard_cluster(tb, C[0] + hx, hy, C[2] + hz, 3, 0.36, 60 + i, amber=0.2, hang=True)
    tb.col_cyl((C[0] - 0.1, 0, C[2] - 2.25), 0.55, 1.3, 8)
    tb.col_cyl((C[0] - 2.15, 0, C[2] - 0.5), 0.36, 1.0, 6)
    tb.col_cyl((C[0] + 2.3, 0, C[2] - 1.5), 0.38, 1.0, 6)
    tb.light((C[0] - 0.1, 0.95, C[2] - 1.95), (0.70, 0.48, 1.0), 46.0, 0.2)
    tb.light((C[0] - 0.1, 0.45, C[2] - 2.1), (1.0, 0.60, 0.24), 18.0, 0.12)
    tb.light((C[0] - 1.9, 0.6, C[2] - 0.45), (0.62, 0.46, 1.0), 20.0, 0.12)
    tb.light((C[0] + 2.05, 0.6, C[2] - 1.4), (0.62, 0.46, 1.0), 22.0, 0.12)
    tb.light((C[0] - 1.45, 0.4, C[2] + 1.5), (0.66, 0.50, 1.0), 8.0, 0.08)
    tb.light((C[0] + 1.7, 0.45, C[2] + 1.4), (1.0, 0.62, 0.30), 8.0, 0.08)
    tb.light((xm, 1.1, zs - 1.0), (0.66, 0.50, 1.0), 6.0, 0.08)
    tb.socket("socket_lamp_grotto", (C[0] - 0.1, 1.2, C[2] - 1.9))
    # ---- the keeper's corner: a flat stone for a table, her stool, an open book, a lantern left burning
    kx, kz = C[0] - 1.25, C[2] - 1.75
    tb.blob("rock", (kx, 0.12, kz), 0.5, tint(rock, 1.05), seed=950, squash=0.42, sub=2, col_var=0.04, jitter=0.08)
    open_book(tb, kx + 0.05, 0.33, kz + 0.02, 35, 0.7)
    stool(tb, kx + 0.75, kz + 0.45)
    tb.cyl("bronze", (kx - 0.28, 0.31, kz - 0.1), 0.06, 0.05, 0.03, 8, cap_top=True)
    tb.box("lamp", (kx - 0.28, 0.42, kz - 0.1), (0.1, 0.16, 0.1))
    tb.cyl("bronze", (kx - 0.28, 0.5, kz - 0.1), 0.07, 0.01, 0.06, 8)
    tb.light((kx - 0.28, 0.62, kz - 0.1), (1.0, 0.68, 0.36), 10.0, 0.05)
    tb.col_cyl((kx, 0, kz), 0.45, 0.4, 8)
    tb.socket("grotto_center", (C[0], 0, C[2] + 0.9), 180.0)


BUILDERS = {"exchange": build_exchange, "scribe": build_scribe, "inn": build_inn}
