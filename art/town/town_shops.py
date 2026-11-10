"""Walkable shop interiors (S-001..S-003), first pass built before the GPT sheets: rooms, counters,
furniture and dressed props from the town kit. Each interior is its own piece, centred on its origin
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


def room(tb, w, d, h, plaster, rr, windows=("west", "east"), door_w=1.5):
    """Floor planks, plastered walls with a timber dado and posts, beamed ceiling, the door and lit windows."""
    n = int(w / 0.5)
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


def shard(tb, x, y, z, s=0.2, seed=0):
    """A memory shard: a small irregular crystal with a soft glow (material M_Shop_Shard)."""
    rr = random.Random(seed)
    with tb.at(T(x, y, z), RY(rr.uniform(0, 360)), RZ(rr.uniform(-14, 14))):
        n = 5
        for k in range(n):
            a0, a1 = math.tau * k / n, math.tau * (k + 1) / n
            p0, p1 = (math.cos(a0) * s * 0.42, s * 0.55, -math.sin(a0) * s * 0.42), (math.cos(a1) * s * 0.42, s * 0.55, -math.sin(a1) * s * 0.42)
            tb.poly("shard", [p0, p1, (0.02 * s, s * 1.5, 0)])
            tb.poly("shard", [p1, p0, (0, 0, 0)])


def build_exchange(tb):
    """S-001 Shard Exchange: shard cases along the walls, the auction pedestal in the middle, the ledger."""
    sp = next(s for s in P.SHOPS if s["id"] == "exchange")
    w, d = sp["interior"]
    h = 3.6
    rr = random.Random(101)
    room(tb, w, d, h, (0.86, 0.84, 0.80), rr)
    rug(tb, 0, 0.6, 4.4, 5.6, (0.20, 0.16, 0.34))
    counter(tb, 0, -d / 2 + 2.5, 5.2)
    tb.socket("shopkeeper_stand", (0, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (0, 0, -d / 2 + 3.5), 180.0)
    shelf(tb, -2.6, -d / 2 + 0.3, 2.6, goods="boxes", seed=1)
    shelf(tb, 2.6, -d / 2 + 0.3, 2.6, goods="jars", seed=2)
    # scales and a ledger on the counter
    with tb.at(T(-1.5, 1.08, -d / 2 + 2.5)):
        tb.cyl("altar_metal", (0, 0, 0), 0.12, 0.04, 0.04, 10, BRONZE, cap_top=True)
        tb.cyl("altar_metal", (0, 0.04, 0), 0.02, 0.02, 0.5, 6, BRONZE)
        tb.beam("altar_metal", (-0.36, 0.52, 0), (0.36, 0.52, 0), 0.03, 0.03, BRONZE)
        for sx in (-1, 1):
            tb.cyl("altar_metal", (sx * 0.36, 0.28, 0), 0.13, 0.1, 0.03, 10, BRONZE, cap_top=True)
            tb.beam("altar_metal", (sx * 0.36, 0.52, 0), (sx * 0.36, 0.31, 0), 0.012, 0.012, BRONZE)
        shard(tb, -0.36, 0.31, 0, 0.14, 7)
    with tb.at(T(1.4, 1.08, -d / 2 + 2.56), RY(-12)):
        tb.box("cloth", (0, 0.035, 0), (0.62, 0.07, 0.44), (0.36, 0.16, 0.12))
        tb.box("cloth", (0, 0.074, 0), (0.56, 0.008, 0.4), (0.96, 0.92, 0.8), skip="y")
    # six shard cases: a stone plinth, a shard on a bronze stand, a slim timber frame
    k = 0
    for sx in (-1, 1):
        for cz in (-1.6, 0.6, 2.8):
            cx = sx * (w / 2 - 0.75)
            with tb.at(T(cx, 0, cz)):
                tb.box("stone", (0, 0.45, 0), (0.8, 0.9, 0.8), STONE, skip="y")
                tb.box("stone", (0, 0.93, 0), (0.9, 0.06, 0.9), tint(STONE, 1.1))
                for px in (-1, 1):
                    for pz in (-1, 1):
                        tb.box("timber", (px * 0.38, 1.36, pz * 0.38), (0.04, 0.8, 0.04), TIMBER, skip="yY", uv_dir=(0, 1, 0))
                tb.box("timber", (0, 1.78, 0), (0.84, 0.05, 0.84), TIMBER, uv_dir=(1, 0, 0))
                tb.cyl("altar_metal", (0, 0.96, 0), 0.1, 0.05, 0.1, 8, BRONZE, cap_top=True)
                shard(tb, 0, 1.06, 0, 0.26, 20 + k)
                tb.col_box((0, 0.9, 0), (0.86, 1.8, 0.86))
            tb.socket(f"socket_lamp_case_{k}", (cx, 1.3, cz))
            k += 1
    # the auction pedestal: a low round dais, a drum, a large shard in a bronze ring
    with tb.at(T(0, 0, 1.0)):
        tb.cyl("stone", (0, 0, 0), 1.25, 1.2, 0.14, 24, STONE_DARK, cap_top=True)
        tb.cyl("stone", (0, 0.14, 0), 0.42, 0.36, 0.9, 12, STONE, cap_top=True)
        tb.ring("altar_metal", (0, 0.158, 0), 1.05, 0.98, 0.012, 24, BRONZE, axis="y")
        tb.ring("altar_metal", (0, 1.5, 0), 0.42, 0.36, 0.05, 20, BRONZE)
        shard(tb, 0, 1.12, 0, 0.5, 99)
        tb.col_cyl((0, 0, 0), 0.5, 1.2, 8)
        tb.socket("socket_lamp_pedestal", (0, 1.5, 0.3))
        tb.socket("shop_pedestal", (0, 0, 1.4), 180.0)
    chandelier(tb, 0, 1.0, h, 0.8)
    for name, (m, ww) in _walls(w, d).items():
        if name in ("west", "east"):
            with tb.at(m, T(0, 2.3, 0)):
                wall_lamp(tb, f"socket_lamp_wall_{name}")


def build_scribe(tb):
    """S-002 Scribe of Signs: slanted drawing desks, chart racks, the great wall of round signs."""
    sp = next(s for s in P.SHOPS if s["id"] == "scribe")
    w, d = sp["interior"]
    h = 3.6
    rr = random.Random(202)
    room(tb, w, d, h, (0.92, 0.88, 0.76), rr)
    rug(tb, 0, 1.2, 3.0, 5.0, (0.34, 0.14, 0.10))
    counter(tb, 0, -d / 2 + 2.5, 4.4)
    tb.socket("shopkeeper_stand", (0, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (0, 0, -d / 2 + 3.5), 180.0)
    # the wall of round signs behind the counter: three rows of rings, each with its four strokes
    kinds = ["arc", "spike", "loop", "drop"]
    with tb.at(T(0, 0, -d / 2 + 0.08)):
        tb.box("timber", (0, 2.2, 0.02), (6.6, 2.5, 0.05), tint(TIMBER, 0.6), skip="zy", uv_dir=(1, 0, 0))
        for row in range(2):
            for col in range(5):
                cx, cy = -2.6 + col * 1.3, 1.62 + row * 1.16
                tb.ring("altar_metal", (cx, cy, 0.07), 0.44, 0.39, 0.03, 24, BRONZE)
                tb.poly("cloth", [(cx + math.cos(math.tau * i / 20) * 0.39, cy + math.sin(math.tau * i / 20) * 0.39, 0.06) for i in range(20)], (0.95, 0.9, 0.76))
                for k in range(4):
                    dots = (row * 5 + col) % 4
                    a = math.pi / 2 - math.tau * ((k + dots) % 4 + 0.5) / 4
                    with tb.at(T(cx, 0, 0)):
                        _glyph(tb, kinds[(k + row + col * 3) % 4], 0.24, a, cy, 0.075, s=0.09, m="ink", t=0.012, wline=0.026)
    # desks with slanted tops, a sheet and a ring-sign in progress, a stool each
    k = 0
    for sx in (-1, 1):
        for cz in (-0.6, 2.0):
            cx = sx * (w / 2 - 1.3)
            with tb.at(T(cx, 0, cz), RY(90 * sx)):
                for lx in (-0.5, 0.5):
                    tb.box("timber", (lx, 0.45, 0), (0.07, 0.9, 0.6), TIMBER, skip="y", uv_dir=(0, 1, 0))
                with tb.at(T(0, 0.98, 0), RX(-16)):
                    tb.box("timber", (0, 0, 0), (1.3, 0.05, 0.8), TIMBER_LIGHT, uv_dir=(1, 0, 0))
                    tb.box("cloth", (0, 0.03, 0), (0.8, 0.006, 0.56), (0.96, 0.92, 0.78), skip="y")
                    with tb.at(T(0, 0.036, 0), RX(-90)):
                        tb.ring("ink", (0, 0, 0), 0.2, 0.17, 0.004, 20)
                tb.col_box((0, 0.5, 0), (1.3, 1.0, 0.8))
            stool(tb, cx - sx * 0.85, cz, f"npc_seat_scribe_{k}", 90 * sx)
            tb.socket(f"socket_lamp_desk_{k}", (cx, 1.7, cz))
            tb.cyl("altar_metal", (cx + sx * 0.5, 1.02, cz - 0.3), 0.05, 0.04, 0.03, 8, BRONZE, cap_top=True)
            tb.cyl("plaster", (cx + sx * 0.5, 1.05, cz - 0.3), 0.022, 0.022, 0.16, 6, (1, 0.96, 0.86), cap_top=True)
            tb.cyl("lamp", (cx + sx * 0.5, 1.21, cz - 0.3), 0.02, 0.0, 0.06, 5, cap_top=False)
            k += 1
    shelf(tb, -w / 2 + 0.3, -3.4, 2.2, rot=90, goods="scrolls", seed=3)
    shelf(tb, w / 2 - 0.3, -3.4, 2.2, rot=-90, goods="books", seed=4)
    shelf(tb, w / 2 - 0.3, 4.2, 1.8, rot=-90, goods="scrolls", seed=5)
    # a rack of tall rolled charts by the door
    with tb.at(T(-w / 2 + 0.6, 0, 4.2)):
        tb.cyl("timber", (0, 0, 0), 0.34, 0.3, 0.7, 10, TIMBER, cap_top=False)
        for i in range(7):
            a = math.tau * i / 7
            tb.cyl("cloth", (math.cos(a) * 0.16, 0.1, math.sin(a) * 0.16), 0.05, 0.05, rr.uniform(1.0, 1.5), 7, tint((1, 0.95, 0.8), rr.uniform(0.8, 1.0)), cap_top=True)
        tb.col_cyl((0, 0, 0), 0.34, 1.2, 8)
    chandelier(tb, 0, 1.0, h, 0.7)
    for name, (m, ww) in _walls(w, d).items():
        if name in ("west", "east"):
            with tb.at(m, T(1.6, 2.3, 0)):
                wall_lamp(tb, f"socket_lamp_wall_{name}")


def build_inn(tb):
    """S-003 Inn: the hearth, two long tables with stools, the bar with barrels, six clan banners."""
    sp = next(s for s in P.SHOPS if s["id"] == "inn")
    w, d = sp["interior"]
    h = 3.8
    rr = random.Random(303)
    room(tb, w, d, h, (0.94, 0.86, 0.68), rr, windows=("east",))
    counter(tb, 1.2, -d / 2 + 2.5, 5.6)
    tb.socket("shopkeeper_stand", (1.2, 0, -d / 2 + 1.5), 0.0)
    tb.socket("shop_counter", (1.2, 0, -d / 2 + 3.5), 180.0)
    for i in range(3):   # barrels behind the bar, mugs on it
        with tb.at(T(-0.8 + i * 1.5, 0, -d / 2 + 0.6)):
            H.barrel(tb, 0, 0, 0.0, 0.42, 1.05, rr)
    for i in range(5):
        mx = -1.0 + i * 1.05
        tb.cyl("timber", (mx, 1.08, -d / 2 + 2.6 + (0.1 if i % 2 else -0.08)), 0.06, 0.055, 0.14, 8, TIMBER_LIGHT, cap_top=True)
    # the hearth on the west wall
    with tb.at(T(-w / 2, 0, -0.8), RY(90)):
        tb.box("stone", (0, 0.2, 0.55), (2.6, 0.4, 1.1), STONE_DARK, skip="yz")
        for sx in (-1, 1):
            tb.box("stone", (sx * 1.05, 1.0, 0.35), (0.5, 2.0, 0.7), STONE, skip="yz")
        tb.box("stone", (0, 1.75, 0.4), (2.9, 0.4, 0.8), tint(STONE, 1.08), skip="z")
        tb.box("stone", (0, 2.75, 0.3), (1.8, 1.7, 0.6), STONE, skip="zY")
        tb.box("stone", (0, 1.0, 0.04), (1.6, 1.3, 0.04), (0.06, 0.05, 0.05), skip="z")
        for i in range(3):
            tb.beam("timber", (-0.4 + i * 0.3, 0.46, 0.3), (0.3 - i * 0.25, 0.52 + i * 0.05, 0.6), 0.12, 0.12, tint(TIMBER, 0.5))
        for i in range(4):
            tb.cyl("fire", (-0.3 + i * 0.2, 0.5, 0.42 + (i % 2) * 0.1), 0.11, 0.0, 0.34 + 0.1 * (i % 3), 5, cap_top=False)
        tb.ring("stone", (0, 2.7, 0.62), 0.42, 0.3, 0.06, 20, (0.92, 0.66, 0.24))
        tb.socket("socket_lamp_hearth", (0, 0.8, 1.0))
        tb.col_box((0, 1.0, 0.45), (2.9, 2.0, 0.9))
    # two long tables with stools
    k = 0
    for tz in (0.9, 3.7):
        table(tb, 1.6, tz, 4.2, 0.95)
        for i in range(4):
            sxp = 0.0 + i * 1.06
            stool(tb, sxp, tz - 0.8, f"npc_seat_inn_{k}", 0.0)
            stool(tb, sxp, tz + 0.8, f"npc_seat_inn_{k + 1}", 180.0)
            k += 2
        for i in range(3):
            tb.cyl("timber", (0.4 + i * 1.2, 0.82, tz + (0.1 if i % 2 else -0.1)), 0.06, 0.055, 0.14, 8, TIMBER_LIGHT, cap_top=True)
        tb.cyl("plaster", (1.6, 0.82, tz), 0.03, 0.03, 0.14, 6, (1, 0.96, 0.86), cap_top=True)
        tb.cyl("lamp", (1.6, 0.96, tz), 0.026, 0.0, 0.07, 5, cap_top=False)
    table(tb, -2.6, 3.9, 1.1, 1.1)
    stool(tb, -2.6, 3.05, f"npc_seat_inn_{k}", 0.0)
    stool(tb, -3.45, 3.9, f"npc_seat_inn_{k + 1}", 90.0)
    rug(tb, -2.4, -0.8, 2.4, 3.0, (0.42, 0.16, 0.10), rot=90)
    # the six clan banners: between the east windows, by the hearth, and three above the bar
    walls = _walls(w, d)
    spots = [("east", -2.17), ("east", 2.17), ("west", -4.2), ("north", -3.4), ("north", 0.0), ("north", 3.4)]
    for (clan, col), (wall, off) in zip(CLANS, spots):
        m, _ww = walls[wall]
        with tb.at(m, T(off, 0, 0.1)):
            tb.beam("timber", (-0.48, 3.25, 0.03), (0.48, 3.25, 0.03), 0.05, 0.05, TIMBER)
            tb.box("cloth", (0, 2.5, 0.0), (0.8, 1.5, 0.02), col, skip="z")
            tb.poly("cloth", [(-0.4, 1.75, 0.01), (0.0, 1.45, 0.01), (0.4, 1.75, 0.01)], col)
            tb.ring("altar_metal", (0, 2.6, 0.02), 0.22, 0.16, 0.012, 16, BRONZE)
    chandelier(tb, 1.6, 2.3, h, 0.9)
    with tb.at(walls["east"][0], T(-1.8, 2.3, 0)):
        wall_lamp(tb, "socket_lamp_wall_east")
    with tb.at(walls["west"][0], T(-3.4, 2.3, 0)):
        wall_lamp(tb, "socket_lamp_wall_west")


BUILDERS = {"exchange": build_exchange, "scribe": build_scribe, "inn": build_inn}
