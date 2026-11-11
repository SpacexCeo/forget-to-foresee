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

TIMBER = H.TIMBER
TIMBER_LIGHT = H.TIMBER_LIGHT
STONE = H.STONE
STONE_DARK = H.STONE_DARK
FLOOR = (0.70, 0.56, 0.40)
BRONZE = (1.0, 1.0, 1.0)
CLANS = [("iris", (0.25, 0.16, 0.55)), ("sol", (0.78, 0.80, 0.76)), ("pepel", (0.045, 0.043, 0.041)),
         ("moh", (0.16, 0.27, 0.09)), ("yantar", (0.66, 0.32, 0.04)), ("iney", (0.35, 0.55, 0.68))]


def _walls(w, d):
    """Interior wall frames: local X along the wall, +Z into the room."""
    return {"north": (T(0, 0, -d / 2), w), "south": (T(0, 0, d / 2) @ RY(180), w),
            "west": (T(-w / 2, 0, 0) @ RY(90), d), "east": (T(w / 2, 0, 0) @ RY(-90), d)}


def room(tb, w, d, h, plaster, rr, windows=("west", "east"), door_w=1.5, floor=True):
    """Floor planks (unless floor=False), plastered walls with a timber dado and posts, beamed ceiling, the door and
    lit windows."""
    n = int(w / 0.5) if floor else 0
    for i in range(n):
        x0, x1 = -w / 2 + w * i / n, -w / 2 + w * (i + 1) / n
        tb.quad("timber", (x0, 0, d / 2), (x1, 0, d / 2), (x1, 0, -d / 2), (x0, 0, -d / 2), tint(FLOOR, rr.uniform(0.82, 1.05)), uv_dir=(0, 0, 1))
    tb.col_poly([(-w / 2, 0, d / 2), (w / 2, 0, d / 2), (w / 2, 0, -d / 2), (-w / 2, 0, -d / 2)])
    tb.quad("plaster", (-w / 2, h, -d / 2), (w / 2, h, -d / 2), (w / 2, h, d / 2), (-w / 2, h, d / 2), tint(plaster, 0.62))
    for i in range(int(d / 1.6) + 1):
        z = -d / 2 + 0.3 + i * (d - 0.6) / int(d / 1.6)
        tb.box("timber", (0, h - 0.13, z), (w, 0.26, 0.22), tint(TIMBER, 0.9), skip="Y", uv_dir=(1, 0, 0))
    tb.box("timber", (0, h - 0.36, 0), (0.3, 0.2, d), tint(TIMBER, 0.8), skip="Y", uv_dir=(0, 0, 1))
    for name, (m, ww) in _walls(w, d).items():
        with tb.at(m):
            lo = tint(plaster, 0.8)
            tb.quad("plaster", (-ww / 2, 0, 0), (ww / 2, 0, 0), (ww / 2, h, 0), (-ww / 2, h, 0), [lo, lo, plaster, plaster])
            tb.box("timber", (0, 0.5, 0.03), (ww, 1.0, 0.06), tint(TIMBER_LIGHT, 0.8), skip="zy", uv_dir=(0, 1, 0))
            tb.box("timber", (0, 1.03, 0.05), (ww, 0.08, 0.1), TIMBER, skip="z", uv_dir=(1, 0, 0))
            tb.box("timber", (0, h - 0.1, 0.05), (ww, 0.2, 0.1), TIMBER, skip="z", uv_dir=(1, 0, 0))
            npost = max(2, round(ww / 2.4))
            for i in range(npost + 1):
                px = -ww / 2 + ww * i / npost
                tb.box("timber", (px, h / 2, 0.06), (0.18, h, 0.12), TIMBER, skip="zy", uv_dir=(0, 1, 0))
            if name == "south":
                # the door: a plank leaf, a frame, a ring on the lintel, daylight in the gap above
                tb.box("timber", (0, 1.1, 0.07), (door_w - 0.3, 2.2, 0.08), tint(TIMBER, 0.85), skip="zy", uv_dir=(0, 1, 0))
                for sx in (-1, 1):
                    tb.box("timber", (sx * (door_w / 2 - 0.08), 1.15, 0.12), (0.16, 2.3, 0.18), TIMBER, skip="zy", uv_dir=(0, 1, 0))
                tb.box("timber", (0, 2.38, 0.12), (door_w + 0.2, 0.18, 0.2), TIMBER, skip="z", uv_dir=(1, 0, 0))
                tb.ring("stone", (0, 2.38, 0.24), 0.13, 0.08, 0.04, 14, (0.92, 0.66, 0.24))
                tb.quad("window_day", (-0.45, 2.56, 0.07), (0.45, 2.56, 0.07), (0.45, 2.9, 0.07), (-0.45, 2.9, 0.07))
            if name in windows:
                nwin = max(1, int(ww / 3.6))
                for i in range(nwin):
                    cx = -ww / 2 + ww * (i + 0.5) / nwin
                    tb.quad("window_day", (cx - 0.55, 1.35, 0.05), (cx + 0.55, 1.35, 0.05), (cx + 0.55, 2.75, 0.05), (cx - 0.55, 2.75, 0.05))
                    for (bx, by, sx, sy) in ((cx, 2.8, 1.3, 0.1), (cx, 1.3, 1.3, 0.1), (cx - 0.6, 2.05, 0.1, 1.5), (cx + 0.6, 2.05, 0.1, 1.5), (cx, 2.05, 0.05, 1.4), (cx, 2.15, 1.1, 0.05)):
                        tb.box("timber", (bx, by, 0.09), (sx, sy, 0.1 if sx > sy else 0.076), TIMBER_LIGHT, skip="z", uv_dir=(1, 0, 0) if sx > sy else (0, 1, 0))
                    tb.box("timber", (cx, 1.22, 0.16), (1.5, 0.06, 0.26), TIMBER_LIGHT, uv_dir=(1, 0, 0))
            tb.col_poly([(-ww / 2, 0, 0), (ww / 2, 0, 0), (ww / 2, h, 0), (-ww / 2, h, 0)])
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
    """Inside a window wall frame: a striped fabric valance (rolled blind) above the window."""
    n = 7
    for i in range(n):
        x0, x1 = cx - w / 2 + w * i / n, cx - w / 2 + w * (i + 1) / n
        c = cols[i % 2]
        tb.quad("cloth", (x0, top - 0.42, 0.2), (x1, top - 0.42, 0.2), (x1, top, 0.12), (x0, top, 0.12), c)
        tb.poly("cloth", [(x0, top - 0.42, 0.2), ((x0 + x1) / 2, top - 0.5, 0.21), (x1, top - 0.42, 0.2)], c)
    tb.cyl("bronze", (cx - w / 2 - 0.05, top + 0.02, 0.12), 0.02, 0.02, 0.0, 6, cap_top=False)
    tb.beam("bronze", (cx - w / 2 - 0.06, top + 0.03, 0.12), (cx + w / 2 + 0.06, top + 0.03, 0.12), 0.03, 0.03)


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
    with tb.swing(name.replace("socket_", ""), (x, h - 0.02, z), length=1.15):
        tb.cyl("iron", (x, h - 0.45, z), 0.02, 0.02, 0.45, 5, cap_top=False)
        for k in range(4):
            a = math.tau * k / 4 + 0.4
            tb.beam("iron", (x, h - 0.45, z), (x + math.cos(a) * r, h - 1.15, z + math.sin(a) * r), 0.012, 0.012)
        tb.ring("bronze", (x, h - 1.15, z), r + 0.04, r - 0.04, 0.07, 28, axis="y")
        tb.ring("bronze", (x, h - 1.22, z), r * 0.35, r * 0.3, 0.04, 14, axis="y")
        for k in range(candles):
            a = math.tau * (k + 0.5) / candles
            cx, cz = x + math.cos(a) * r, z + math.sin(a) * r
            tb.cyl("bronze", (cx, h - 1.11, cz), 0.05, 0.04, 0.02, 6)
            tb.cyl("wax", (cx, h - 1.09, cz), 0.022, 0.022, 0.14, 6)
            tb.cyl("lamp", (cx, h - 0.95, cz), 0.018, 0.0, 0.06, 5, cap_top=False)
    tb.socket(name, (x, h - 1.05, z))
    tb.light((x, h - 0.98, z), (1.0, 0.70, 0.40), 260.0, 0.5)


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


def window_lights(tb, w, d, walls=("west", "east"), power=90.0):
    """Daylight spilling in through the painted windows (bake only)."""
    for name, (m, ww) in _walls(w, d).items():
        if name not in walls:
            continue
        nwin = max(1, int(ww / 3.6))
        with tb.at(m):
            for i in range(nwin):
                tb.light((-ww / 2 + ww * (i + 0.5) / nwin, 2.1, 0.6), (0.95, 0.92, 0.86), power, 0.6)


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
    room(tb, w, d, h, (0.88, 0.84, 0.76), rr, floor=False)
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
    # rear wall: two shelf units behind the counter and a tall cabinet on the left
    shelf(tb, -0.2, -d / 2 + 0.3, 2.2, goods="boxes", seed=1)
    shelf(tb, 2.4, -d / 2 + 0.3, 2.2, goods="jars", seed=2)
    with tb.at(T(-3.2, 0, -d / 2 + 0.4)):
        tb.box("timber", (0, 1.15, 0), (1.3, 2.3, 0.6), tint(TIMBER, 0.95), skip="y", uv_dir=(0, 1, 0))
        for sx in (-1, 1):
            tb.box("timber", (sx * 0.31, 1.1, 0.305), (0.56, 1.9, 0.02), tint(TIMBER_LIGHT, 0.75), uv_dir=(0, 1, 0))
            tb.cyl("bronze", (sx * 0.06, 1.1, 0.32), 0.02, 0.02, 0.02, 6)
        tb.box("timber", (0, 2.34, 0.02), (1.4, 0.08, 0.66), TIMBER)
        book_stack(tb, -0.3, 2.38, 0.0, 2, rr)
        tb.col_box((0, 1.15, 0), (1.3, 2.3, 0.6))
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
        for sx in (-1, 1):
            tb.beam("bronze", (sx * 0.28, 0.9, 0), (sx * 0.62, 1.2, 0), 0.07, 0.07)
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
        for i in range(4):
            tb.cyl("fire", (-0.3 + i * 0.2, 0.5, 0.42 + (i % 2) * 0.1), 0.11, 0.0, 0.34 + 0.1 * (i % 3), 5, cap_top=False)
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
    spots = [("east", -4.4), ("east", 0.0), ("east", 4.4), ("west", -4.0), ("west", 2.4), ("north", -4.2)]
    for (clan, col), (wall, off) in zip(CLANS, spots):
        m, _ww = walls[wall]
        with tb.at(m, T(off, 0, 0.1)):
            tb.beam("bronze", (-0.42, 3.3, 0.04), (0.42, 3.3, 0.04), 0.035, 0.035)
            tb.box("cloth", (0, 2.6, 0.0), (0.68, 1.36, 0.02), col, skip="z")
            tb.poly("cloth", [(-0.34, 1.92, 0.01), (0.0, 1.66, 0.01), (0.34, 1.92, 0.01)], col)
            tb.box("cloth", (0, 3.18, 0.012), (0.68, 0.08, 0.02), tint(col, 0.6), skip="z")
            tb.ring("bronze", (0, 2.68, 0.02), 0.2, 0.15, 0.012, 16)
    hanging_ring_lamp(tb, "socket_lamp_ceiling", 0.8, 0.6, h, 1.0, 10)
    hanging_ring_lamp(tb, "socket_lamp_ceiling_bar", 0.2, -d / 2 + 3.6, h, 0.7, 6)
    sconce(tb, "socket_lamp_wall_east_a", walls["east"][0], -2.2)
    sconce(tb, "socket_lamp_wall_east_b", walls["east"][0], 2.2)
    sconce(tb, "socket_lamp_wall_west", walls["west"][0], 4.4)
    sconce(tb, "socket_lamp_door_l", walls["south"][0], -1.5)
    sconce(tb, "socket_lamp_door_r", walls["south"][0], 1.5)
    window_lights(tb, w, d, walls=("east",))


BUILDERS = {"exchange": build_exchange, "scribe": build_scribe, "inn": build_inn}
