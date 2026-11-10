"""Modular houses of the town: eight recipes (A..H) built from the same kit of parts: stone base,
plastered floors with a dark timber frame, jettied upper floors, tiled gable roofs, doors with a
carved ring on the lintel, windows with shutters, chimneys, balconies, awnings and wall lanterns.
Local frame of a house: origin at the footprint centre on the ground, width along X, the front
(the door) faces +Z. Our own designs; nothing is copied from any game or film."""

import math
import random

from town_geo import RX, RY, T, tint

TIMBER = (0.40, 0.29, 0.20)
TIMBER_LIGHT = (0.62, 0.48, 0.34)
STONE = (0.90, 0.88, 0.84)
STONE_DARK = (0.62, 0.61, 0.58)
GLASS = "glass"
PLASTERS = {
    "cream": (0.98, 0.93, 0.80), "white": (1.0, 0.98, 0.94), "ochre": (0.96, 0.82, 0.58),
    "rose": (0.96, 0.82, 0.74), "sand": (0.92, 0.86, 0.72), "grey": (0.86, 0.87, 0.84),
}
ROOFS = {
    "terracotta": (1.0, 0.86, 0.76), "amber": (1.0, 0.90, 0.62), "rust": (0.86, 0.66, 0.58),
    "brown": (0.74, 0.62, 0.54), "honey": (1.0, 0.96, 0.72),
}
SHUTTERS = {
    "teal": (0.30, 0.52, 0.50), "green": (0.34, 0.48, 0.28), "red": (0.58, 0.24, 0.18),
    "blue": (0.30, 0.40, 0.58), "wood": (0.55, 0.40, 0.26), "ochre": (0.75, 0.55, 0.22),
}

RECIPES = {
    #       floors ground     jetty  ridge pitch  frame     extras
    "A": dict(floors=2, ground="plaster", jetty=0.40, ridge="x", pitch=50, frame="studs", extras=("chimney", "lantern")),
    "B": dict(floors=3, ground="stone", jetty=0.35, ridge="z", pitch=54, frame="cross", extras=("chimney", "ringwindow")),
    "C": dict(floors=2, ground="stone", jetty=0.0, ridge="x", pitch=46, frame="diag", extras=("awning", "chimney")),
    "D": dict(floors=2, ground="plaster", jetty=0.45, ridge="z", pitch=52, frame="diag", extras=("balcony", "ringwindow", "lantern")),
    "E": dict(floors=3, ground="plaster", jetty=0.35, ridge="x", pitch=52, frame="cross", extras=("chimney", "dormer")),
    "F": dict(floors=2, ground="stone", jetty=0.40, ridge="z", pitch=48, frame="studs", extras=("awning", "ringwindow")),
    "G": dict(floors=2, ground="plaster", jetty=0.0, ridge="x", pitch=44, frame="cross", extras=("chimney", "dormer", "lantern")),
    "H": dict(floors=3, ground="stone", jetty=0.40, ridge="z", pitch=56, frame="studs", extras=("balcony", "chimney", "ringwindow")),
}
FLOOR_H = (3.0, 2.7, 2.5)


def _sides(w, d, zc=0.0):
    """Wall frames of a w x d box centred at (0, zc): (name, transform, wall width)."""
    return [
        ("front", T(0, 0, zc + d / 2), w),
        ("right", T(w / 2, 0, zc) @ RY(90), d),
        ("back", T(0, 0, zc - d / 2) @ RY(180), w),
        ("left", T(-w / 2, 0, zc) @ RY(-90), d),
    ]


def _frame(tb, width, h, pattern, col, rr, openings=()):
    """Timber frame on a wall (wall space: X along the wall, Y up, +Z out)."""
    z, dp = 0.02, 0.14
    def bx(cx, cy, sx, sy, grain):
        # horizontals stand a little prouder than verticals: crossing members never share a plane
        d = dp if grain[0] else dp - 0.024
        tb.box("timber", (cx, cy, z), (sx, sy, d), tint(col, rr.uniform(0.86, 1.08)), skip="z", uv_dir=grain)
    bx(0, 0.11, width + 0.1, 0.22, (1, 0, 0))
    bx(0, h - 0.10, width + 0.1, 0.20, (1, 0, 0))
    bx(-width / 2 + 0.11, h / 2, 0.22, h, (0, 1, 0))
    bx(width / 2 - 0.11, h / 2, 0.22, h, (0, 1, 0))
    n = max(2, round(width / 1.25))
    xs = [-width / 2 + width * i / n for i in range(1, n)]
    for x in xs:
        if any(abs(x - ox) < ow / 2 + 0.05 for ox, ow in openings):
            # stud above and below the opening only
            bx(x, 0.5, 0.14, 0.78, (0, 1, 0))
            continue
        bx(x, h / 2, 0.14, h, (0, 1, 0))
    if pattern in ("cross", "diag"):
        bx(0, h * 0.42, width, 0.13, (1, 0, 0))
    if pattern in ("diag", "cross"):
        for sx in (-1, 1):
            a = (sx * (width / 2 - 0.2), 0.2, z)
            b = (sx * (width / 2 - 0.2 - min(1.1, width / n)), h - 0.2, z)
            if pattern == "cross" and h > 2.4:
                b = (b[0], h * 0.42, z)
            tb.beam("timber", a, b, 0.13, dp - 0.05, tint(col, 0.95), up=(0, 0, 1), skip="y")


def _window(tb, cx, sill, w, h, rr, shutter=None, lit=False, flowers=False, glass_dark=1.0):
    z = 0.05
    tb.quad("glass_lit" if lit else GLASS, (cx - w / 2, sill, z), (cx + w / 2, sill, z), (cx + w / 2, sill + h, z), (cx - w / 2, sill + h, z),
            tint((1, 1, 1), glass_dark))
    f = 0.10
    for (bx_, by_, sx, sy, g) in ((cx, sill + h + f / 2, w + 2 * f, f, (1, 0, 0)), (cx, sill - f / 2, w + 2 * f, f, (1, 0, 0)),
                                  (cx - w / 2 - f / 2, sill + h / 2, f, h, (0, 1, 0)), (cx + w / 2 + f / 2, sill + h / 2, f, h, (0, 1, 0))):
        tb.box("timber", (bx_, by_, 0.09), (sx, sy, 0.16), TIMBER_LIGHT, skip="z", uv_dir=g)
    tb.box("timber", (cx, sill + h / 2, 0.075), (0.05, h, 0.05), TIMBER_LIGHT, skip="zyY", uv_dir=(0, 1, 0))
    tb.box("timber", (cx, sill + h * 0.58, 0.075), (w, 0.05, 0.05), TIMBER_LIGHT, skip="zxX", uv_dir=(1, 0, 0))
    tb.box("stone", (cx, sill - f - 0.05, 0.12), (w + 0.36, 0.10, 0.26), STONE, skip="z")
    if shutter:
        sw = w / 2 + 0.02
        for sx in (-1, 1):
            ang = rr.uniform(4, 24) * -sx
            with tb.at(T(cx + sx * (w / 2 + f), sill + h / 2, 0.16), RY(ang)):
                tb.box("timber", (sx * sw / 2, 0, 0), (sw, h + 0.06, 0.05), tint(shutter, rr.uniform(0.85, 1.05)), uv_dir=(0, 1, 0))
                for yy in (-h * 0.3, h * 0.3):
                    tb.box("timber", (sx * sw / 2, yy, 0.035), (sw - 0.06, 0.07, 0.02), tint(shutter, 0.7), skip="z", uv_dir=(1, 0, 0))
    if flowers:
        tb.box("timber", (cx, sill - 0.32, 0.26), (w + 0.2, 0.22, 0.26), TIMBER, skip="")
        for i in range(4):
            fx = cx - w / 2 + (i + 0.5) * w / 4
            colr = rr.choice([(0.55, 0.85, 0.40), (0.50, 0.80, 0.42), (0.9, 0.5, 0.5), (0.95, 0.8, 0.45)])
            tb.blob("foliage", (fx, sill - 0.14, 0.27), 0.17, colr, seed=rr.randrange(1 << 30), sub=1)


def _door(tb, cx, w, h, rr, col=TIMBER, arch=False):
    z = 0.04
    tb.box("timber", (cx, h / 2, z), (w, h, 0.08), tint(col, 0.8), skip="zy", uv_dir=(0, 1, 0))
    for i in range(1, 4):   # plank joints
        tb.box("timber", (cx - w / 2 + i * w / 4, h / 2, z + 0.045), (0.025, h - 0.1, 0.012), tint(col, 0.45), skip="z", uv_dir=(0, 1, 0))
    for yy in (0.45, h - 0.5):  # iron straps
        tb.box("stone", (cx, yy, z + 0.05), (w - 0.1, 0.09, 0.02), (0.17, 0.16, 0.16), skip="z")
    tb.ring("stone", (cx + w * 0.28, h * 0.48, z + 0.07), 0.10, 0.065, 0.03, 10, (0.6, 0.45, 0.2))
    f = 0.16
    tb.box("timber", (cx - w / 2 - f / 2, h / 2, 0.10), (f, h + f, 0.2), TIMBER, skip="z", uv_dir=(0, 1, 0))
    tb.box("timber", (cx + w / 2 + f / 2, h / 2, 0.10), (f, h + f, 0.2), TIMBER, skip="z", uv_dir=(0, 1, 0))
    tb.box("timber", (cx, h + f / 2 + 0.06, 0.12), (w + 2 * f + 0.2, f + 0.12, 0.24), TIMBER, skip="z", uv_dir=(1, 0, 0))
    # the carved ring on the lintel: the round sign of the world
    tb.ring("stone", (cx, h + f / 2 + 0.06, 0.25), 0.15, 0.09, 0.04, 14, (0.92, 0.66, 0.24))
    tb.box("stone", (cx, 0.09, 0.42), (w + 0.7, 0.18, 0.84), STONE, skip="yz")
    _ = arch


def _lantern(tb, x, y, name):
    tb.beam("timber", (x, y, 0.0), (x, y, 0.62), 0.07, 0.07, TIMBER)
    tb.beam("timber", (x, y - 0.42, 0.06), (x, y - 0.02, 0.5), 0.05, 0.05, TIMBER)
    tb.box("stone", (x, y - 0.12, 0.55), (0.26, 0.05, 0.26), (0.2, 0.19, 0.18))
    tb.box("lamp", (x, y - 0.33, 0.55), (0.2, 0.34, 0.2), (1, 1, 1))
    tb.box("stone", (x, y - 0.52, 0.55), (0.24, 0.05, 0.24), (0.2, 0.19, 0.18))
    tb.socket(name, (x, y - 0.33, 0.55))


def _roof(tb, length, span, pitch, col, plaster, rr, ring_window=False, frame_col=TIMBER, dormer=False, over_e=0.55, over_g=0.42):
    """Gable roof; frame: ridge along X, eaves at y = 0, centred. Returns the ridge height."""
    tp = math.tan(math.radians(pitch))
    rise = tp * span / 2
    L = length / 2 + over_g
    ez, ey = span / 2 + over_e, -over_e * tp
    th = 0.17
    for sz in (1, -1):
        a, b, c, d = (-L, ey, sz * ez), (L, ey, sz * ez), (L, rise, 0.0), (-L, rise, 0.0)
        cols = [tint(col, 0.86), tint(col, 0.86), col, col]
        top = [a, b, c, d] if sz > 0 else [b, a, d, c]
        tb.poly("roof", top, cols if sz > 0 else [cols[1], cols[0], cols[3], cols[2]], uv_dir=(1, 0, 0))
        und = [(p[0], p[1] - th, p[2]) for p in reversed(top)]
        tb.poly("timber", und, tint(frame_col, 0.55), uv_dir=(1, 0, 0))
        # eave fascia
        fa = [(-L, ey - th, sz * ez), (L, ey - th, sz * ez), (L, ey, sz * ez), (-L, ey, sz * ez)]
        tb.poly("timber", fa if sz > 0 else list(reversed(fa)), tint(frame_col, 0.8), uv_dir=(1, 0, 0))
        # barge boards on both gables
        for sx in (-1, 1):
            tb.beam("timber", (sx * (L - 0.04), ey - 0.06, sz * ez), (sx * (L - 0.04), rise - 0.06, 0.0), 0.08, 0.30, frame_col, up=(0, 1, 0))
        # rafter tails under the eave
        nr = max(3, int(length / 1.1))
        for i in range(nr + 1):
            x = -length / 2 + length * i / nr
            tb.beam("timber", (x, -0.02 - th, sz * (span / 2 - 0.05)), (x, ey - th + 0.02, sz * (ez - 0.06)), 0.10, 0.12, tint(frame_col, 0.7))
    tb.beam("roof", (-L - 0.03, rise + 0.02, 0), (L + 0.03, rise + 0.02, 0), 0.36, 0.17, tint(col, 0.72))
    # gable walls with their timbers
    for sx in (-1, 1):
        with tb.at(T(sx * length / 2, 0, 0), RY(90 * sx)):
            w = span
            tb.poly("plaster", [(-w / 2, 0, 0), (w / 2, 0, 0), (0, rise, 0)], plaster)
            z, dp = 0.02, 0.14
            tb.box("timber", (0, 0.1, z), (w, 0.2, dp), frame_col, skip="z", uv_dir=(1, 0, 0))
            for s2 in (-1, 1):
                tb.beam("timber", (s2 * (w / 2 - 0.12), 0.12, z), (s2 * 0.08, rise - 0.2, z), 0.16, dp - 0.05, frame_col, up=(0, 0, 1), skip="y")
            ky = rise * 0.56
            tb.box("timber", (0, ky, z), (w * (1 - ky / rise) - 0.1, 0.14, dp + 0.02), frame_col, skip="z", uv_dir=(1, 0, 0))
            if ring_window and rise > 2.3:
                cy = ky * 0.52 + 0.1
                tb.ring("timber", (0, cy, 0.06), 0.46, 0.33, 0.16, 16, TIMBER_LIGHT)
                tb.poly(GLASS, [(math.cos(math.tau * i / 16) * 0.33, cy + math.sin(math.tau * i / 16) * 0.33, 0.05) for i in range(16)])
                for s2 in (-1, 1):
                    tb.box("timber", (s2 * (w * 0.25 + 0.2), ky / 2, z), (0.13, ky, dp - 0.024), frame_col, skip="z", uv_dir=(0, 1, 0))
            else:
                tb.box("timber", (0, rise / 2, z), (0.14, rise - 0.2, dp - 0.024), frame_col, skip="z", uv_dir=(0, 1, 0))
                for s2 in (-1, 1):
                    tb.box("timber", (s2 * w * 0.24, ky / 2, z), (0.13, ky, dp - 0.024), frame_col, skip="z", uv_dir=(0, 1, 0))
    if dormer:
        dz = span * 0.27
        dy = (span / 2 - dz) * tp
        with tb.at(T(rr.choice([-1, 1]) * length * 0.18, dy, dz)):
            dw, dh, dd = 1.5, 1.25, 1.6
            tb.box("plaster", (0, dh / 2 - 0.2, 0), (dw, dh, dd), plaster, skip="yz")
            with tb.at(T(0, 0, dd / 2)):
                _frame(tb, dw, dh - 0.2, "studs", frame_col, rr, openings=((0, 2.0),))
                _window(tb, 0, 0.12, 0.72, 0.72, rr, lit=rr.random() < 0.4)
            with tb.at(T(0, dh - 0.2, 0), RY(90)):
                _roof(tb, dd + 0.3, dw, 48, col, plaster, rr, over_e=0.22, over_g=0.2)
    return rise


def house(tb, w, d, kind, seed, lamp_name=None):
    """One house in the current transform (origin on the ground at the footprint centre, front +Z)."""
    rr = random.Random(seed)
    rc = RECIPES[kind]
    plaster = PLASTERS[rr.choice(list(PLASTERS))]
    roofc = ROOFS[rr.choice(list(ROOFS))]
    shut = SHUTTERS[rr.choice(list(SHUTTERS))]
    frame_col = tint(TIMBER, rr.uniform(0.8, 1.15))
    floors = rc["floors"]
    y = 0.0
    zc = 0.0
    dd = d
    door_x = rr.choice([-1, 1]) * w * rr.uniform(0.12, 0.26)
    for fl in range(floors):
        h = FLOOR_H[min(fl, 2)]
        if fl > 0 and rc["jetty"]:
            j = rc["jetty"]
            dd += j
            zc += j / 2
            # jetty underside and brackets
            fz = zc + dd / 2
            tb.quad("timber", (-w / 2, y, fz - j - 0.02), (w / 2, y, fz - j - 0.02), (w / 2, y, fz), (-w / 2, y, fz), tint(frame_col, 0.6), uv_dir=(1, 0, 0))
            nb = max(3, int(w / 1.3))
            for i in range(nb + 1):
                bx = -w / 2 + 0.12 + (w - 0.24) * i / nb
                tb.beam("timber", (bx, y - 0.13, fz - j - 0.1), (bx, y - 0.13, fz + 0.04), 0.16, 0.2, frame_col)
                tb.beam("timber", (bx, y - 0.62, fz - j + 0.02), (bx, y - 0.2, fz - 0.06), 0.11, 0.12, tint(frame_col, 0.9))
        stone_floor = fl == 0 and rc["ground"] == "stone"
        for name, m, ww in _sides(w, dd, zc):
            with tb.at(T(0, y, 0), m):
                if stone_floor:
                    tb.quad("stone", (-ww / 2, 0, 0), (ww / 2, 0, 0), (ww / 2, h, 0), (-ww / 2, h, 0),
                            [tint(STONE, 0.66), tint(STONE, 0.66), STONE, STONE])
                    for sx in (-1, 1):   # quoins
                        for k in range(int(h / 0.5)):
                            tb.box("stone", (sx * (ww / 2 - 0.2 - 0.08 * (k % 2)), 0.25 + k * 0.5, 0.03), (0.4 + 0.16 * (k % 2), 0.46, 0.08), tint(STONE_DARK, rr.uniform(0.9, 1.1)), skip="z")
                else:
                    lo = tint(plaster, 0.74 if fl == 0 else 0.93)
                    tb.quad("plaster", (-ww / 2, 0, 0), (ww / 2, 0, 0), (ww / 2, h, 0), (-ww / 2, h, 0), [lo, lo, plaster, plaster])
                    if fl == 0:
                        tb.box("stone", (0, 0.36, 0.05), (ww + 0.12, 0.72, 0.12), tint(STONE, 0.8), skip="yz")
                # openings
                opens = []
                if fl == 0 and name == "front":
                    opens.append((door_x, 1.7))
                    _door(tb, door_x, 1.15, 2.2, rr)
                    if "awning" in rc["extras"]:
                        sx = -1 if door_x > 0 else 1
                        cxw = sx * w * 0.24
                        opens.append((cxw, 2.6))
                        _window(tb, cxw, 0.95, 2.2, 1.25, rr, lit=True)
                        tb.box("timber", (cxw, 0.86, 0.3), (2.5, 0.08, 0.5), TIMBER_LIGHT, uv_dir=(1, 0, 0))
                        with tb.at(T(cxw, 2.62, 0.02), RX(24)):
                            cc = rr.choice([(0.62, 0.22, 0.16), (0.75, 0.6, 0.28), (0.28, 0.4, 0.42)])
                            tb.box("cloth", (0, 0, 0.7), (2.9, 0.04, 1.4), cc)
                            for i in range(5):
                                tb.box("cloth", (-1.16 + i * 0.58, 0, 0.7), (0.29, 0.045, 1.41), tint((1, 0.95, 0.85), 0.9))
                        for px in (-1.35, 1.35):
                            tb.beam("timber", (cxw + px, 0, 1.3), (cxw + px, 2.05, 1.3), 0.07, 0.07, TIMBER)
                    else:
                        sx = -1 if door_x > 0 else 1
                        cxw = sx * w * 0.25
                        opens.append((cxw, 1.3))
                        _window(tb, cxw, 1.0, 1.0, 1.25, rr, shutter=shut, lit=rr.random() < 0.3, flowers=rr.random() < 0.5)
                    if "lantern" in rc["extras"] and lamp_name:
                        _lantern(tb, door_x + (1.1 if door_x < 0 else -1.1), 2.75, lamp_name)
                else:
                    n = max(1, int(ww / (2.7 if name in ("front", "back") else 3.3)))
                    if name == "back" and fl == 0:
                        n = 0
                    for i in range(n):
                        cxw = -ww / 2 + ww * (i + 0.5) / n
                        if fl == 1 and name == "front" and "balcony" in rc["extras"] and i == n // 2:
                            opens.append((cxw, 1.2))
                            _door(tb, cxw, 0.9, 2.05, rr, col=TIMBER_LIGHT)
                            continue
                        if rr.random() < 0.14 and name != "front":
                            continue
                        opens.append((cxw, 1.2))
                        _window(tb, cxw, 0.95, 0.95, 1.2, rr, shutter=shut if rr.random() < 0.75 else None,
                                lit=rr.random() < 0.22, flowers=(name == "front" and rr.random() < 0.35))
                if not stone_floor:
                    _frame(tb, ww, h, rc["frame"] if fl > 0 else "studs", frame_col, rr, openings=opens)
                if fl == 1 and name == "front" and "balcony" in rc["extras"]:
                    bw, bd = min(3.2, ww * 0.42), 1.0
                    bxc = -ww / 2 + ww * (n // 2 + 0.5) / n if n else 0
                    tb.box("timber", (bxc, -0.08, bd / 2), (bw, 0.14, bd), frame_col, uv_dir=(1, 0, 0))
                    for i in range(3):
                        px = bxc - bw / 2 + 0.1 + (bw - 0.2) * i / 2
                        tb.beam("timber", (px, -0.6, 0.02), (px, -0.12, bd - 0.1), 0.1, 0.1, frame_col)
                    for i in range(7):
                        px = bxc - bw / 2 + 0.06 + (bw - 0.12) * i / 6
                        tb.box("timber", (px, 0.48, bd - 0.05), (0.07, 0.96, 0.07), frame_col, uv_dir=(0, 1, 0))
                    tb.box("timber", (bxc, 0.98, bd - 0.05), (bw + 0.1, 0.09, 0.12), TIMBER_LIGHT, uv_dir=(1, 0, 0))
                    for sx in (-1, 1):
                        tb.box("timber", (bxc + sx * (bw / 2 - 0.05), 0.98, bd / 2), (0.09, 0.09, bd), TIMBER_LIGHT, uv_dir=(0, 0, 1))
                        tb.box("timber", (bxc + sx * (bw / 2 - 0.05), 0.48, bd * 0.45), (0.07, 0.96, 0.07), frame_col, uv_dir=(0, 1, 0))
        y += h
    # roof
    ridge_x = rc["ridge"] == "x"
    with tb.at(T(0, y, zc), RY(0 if ridge_x else 90)):
        length, span = (w, dd) if ridge_x else (dd, w)
        rise = _roof(tb, length, span, rc["pitch"], roofc, plaster, rr, ring_window="ringwindow" in rc["extras"],
                     frame_col=frame_col, dormer="dormer" in rc["extras"])
        if "chimney" in rc["extras"]:
            cx = rr.choice([-1, 1]) * length * 0.28
            cz = rr.choice([-1, 1]) * span * 0.16
            base = rise - abs(cz) * math.tan(math.radians(rc["pitch"])) - 0.5
            top = rise + 0.9
            tb.box("stone", (cx, (base + top) / 2, cz), (0.85, top - base, 0.85), tint(STONE, 0.85), skip="y")
            tb.box("stone", (cx, top + 0.07, cz), (1.05, 0.14, 1.05), STONE_DARK)
            for px in (-0.2, 0.2):
                tb.cyl("roof", (cx + px, top + 0.14, cz), 0.13, 0.10, 0.34, 8, (0.9, 0.7, 0.6), cap_top=True)
    total = y + rise
    tb.col_box((0, total / 2 - 0.5, zc * 0.0), (w, total + 1.0, d))
    return total


# ---------------------------------------------------------------- props

def barrel(tb, x, z, y=0.0, r=0.36, h=0.95, rr=None):
    rr = rr or random.Random(int(x * 13 + z * 7))
    c = tint(TIMBER_LIGHT, rr.uniform(0.75, 1.0))
    tb.cyl("timber", (x, y, z), r * 0.84, r, h * 0.5, 10, c, cap_top=False)
    tb.cyl("timber", (x, y + h * 0.5, z), r, r * 0.84, h * 0.5, 10, c, cap_top=True, col_top=tint(c, 0.8))
    for yy in (0.16, 0.5, 0.84):
        rb = r * (0.9 + 0.11 * (1 - abs(yy - 0.5) * 2))
        tb.cyl("stone", (x, y + h * yy - 0.025, z), rb + 0.012, rb + 0.012, 0.05, 10, (0.2, 0.19, 0.18), cap_top=False)
    tb.col_cyl((x, y, z), r, h, 8)


def crate(tb, x, z, y=0.0, s=0.7, rot=0.0, col_on=True):
    with tb.at(T(x, y, z), RY(rot)):
        tb.box("timber", (0, s / 2, 0), (s, s, s), tint(TIMBER_LIGHT, 0.9), skip="y", uv_dir=(1, 0, 0))
        e = 0.07
        for sx in (-1, 1):
            for sz in (-1, 1):
                tb.box("timber", (sx * (s / 2 - e / 2), s / 2, sz * (s / 2 + 0.01)), (e, s, 0.03), tint(TIMBER, 1.1), uv_dir=(0, 1, 0))
                tb.box("timber", (sx * (s / 2 + 0.01), s / 2, sz * (s / 2 - e / 2)), (0.03, s, e), tint(TIMBER, 1.1), uv_dir=(0, 1, 0))
        if col_on:
            tb.col_box((0, s / 2, 0), (s, s, s))


def lamp_post(tb, x, z, y, name, h=3.3):
    tb.cyl("stone", (x, y, z), 0.22, 0.16, 0.5, 8, STONE_DARK)
    tb.cyl("timber", (x, y + 0.5, z), 0.075, 0.06, h - 0.5, 6, tint(TIMBER, 0.8), cap_top=False)
    tb.beam("timber", (x, y + h - 0.08, z), (x + 0.6, y + h - 0.08, z), 0.07, 0.07, TIMBER)
    tb.beam("timber", (x + 0.08, y + h - 0.5, z), (x + 0.45, y + h - 0.1, z), 0.05, 0.05, TIMBER)
    lx = x + 0.55
    tb.box("stone", (lx, y + h - 0.2, z), (0.28, 0.05, 0.28), (0.2, 0.19, 0.18))
    tb.box("lamp", (lx, y + h - 0.42, z), (0.22, 0.38, 0.22), (1, 1, 1))
    tb.box("stone", (lx, y + h - 0.63, z), (0.26, 0.05, 0.26), (0.2, 0.19, 0.18))
    tb.col_cyl((x, y, z), 0.2, 2.2, 6)
    tb.socket(name, (lx, y + h - 0.42, z))


def banner(tb, x, z, y, rot=0.0, col=(0.45, 0.16, 0.12), h=5.2):
    with tb.at(T(x, y, z), RY(rot)):
        tb.cyl("stone", (0, 0, 0), 0.26, 0.18, 0.5, 8, STONE_DARK)
        tb.cyl("timber", (0, 0.5, 0), 0.07, 0.05, h - 0.5, 6, tint(TIMBER, 0.85), cap_top=True)
        tb.beam("timber", (-0.05, h - 0.25, 0), (1.05, h - 0.25, 0), 0.06, 0.06, TIMBER)
        tb.box("cloth", (0.55, h - 1.55, 0), (0.9, 2.5, 0.03), col)
        tb.poly("cloth", [(0.1, h - 2.8, 0.015), (0.55, h - 3.25, 0.015), (1.0, h - 2.8, 0.015)], col)
        tb.poly("cloth", [(1.0, h - 2.8, -0.015), (0.55, h - 3.25, -0.015), (0.1, h - 2.8, -0.015)], col)
        for zz in (0.022, -0.022):
            tb.ring("stone", (0.55, h - 1.3, zz), 0.3, 0.21, 0.012, 18, (0.96, 0.66, 0.2))
        tb.col_cyl((0, 0, 0), 0.22, 2.2, 6)


def tree(tb, x, z, y, seed=0, h=5.5, r=2.2):
    rr = random.Random(seed)
    tb.cyl("timber", (x, y, z), 0.32, 0.2, h * 0.5, 8, tint(TIMBER, 0.8), cap_top=False)
    tb.cyl("timber", (x, y + h * 0.5, z), 0.2, 0.1, h * 0.3, 6, tint(TIMBER, 0.8), cap_top=False)
    base = rr.choice([(0.62, 0.82, 0.42), (0.55, 0.78, 0.40), (0.78, 0.82, 0.38), (0.88, 0.74, 0.34)])
    for i in range(5):
        a = rr.uniform(0, math.tau)
        rad = rr.uniform(0.0, r * 0.55) if i else 0.0
        tb.blob("foliage", (x + math.cos(a) * rad, y + h * rr.uniform(0.62, 0.92), z + math.sin(a) * rad), r * rr.uniform(0.55, 0.8),
                tint(base, rr.uniform(0.85, 1.1)), seed=rr.randrange(1 << 30), sub=2)
    tb.col_cyl((x, y, z), 0.35, 3.0, 6)


def planter(tb, x, z, y, w=1.6, d=0.6, rot=0.0, seed=0):
    rr = random.Random(seed)
    with tb.at(T(x, y, z), RY(rot)):
        tb.box("stone", (0, 0.25, 0), (w, 0.5, d), STONE, skip="y")
        tb.box("ground", (0, 0.46, 0), (w - 0.16, 0.02, d - 0.16), (0.5, 0.4, 0.3), skip="yxXzZ")
        for i in range(int(w / 0.4)):
            c = rr.choice([(0.55, 0.85, 0.40), (0.6, 0.8, 0.35), (0.95, 0.6, 0.5), (0.98, 0.85, 0.45), (0.8, 0.6, 0.9)])
            tb.blob("foliage", (-w / 2 + 0.25 + i * 0.4, 0.62 + rr.uniform(0, 0.12), rr.uniform(-0.08, 0.08)), rr.uniform(0.2, 0.3), c, seed=rr.randrange(1 << 30), sub=1)
        tb.col_box((0, 0.3, 0), (w, 0.6, d))


def stall(tb, x, z, y, rot=0.0, seed=0):
    rr = random.Random(seed)
    cc = rr.choice([(0.62, 0.22, 0.16), (0.78, 0.6, 0.26), (0.26, 0.42, 0.44), (0.5, 0.3, 0.5)])
    with tb.at(T(x, y, z), RY(rot)):
        w, d = 2.8, 1.5
        tb.box("timber", (0, 0.86, 0), (w, 0.08, d), TIMBER_LIGHT, uv_dir=(1, 0, 0))
        for sx in (-1, 1):
            for sz in (-1, 1):
                tb.beam("timber", (sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)), (sx * (w / 2 - 0.08), 2.3 if sz < 0 else 2.0, sz * (d / 2 - 0.08)), 0.08, 0.08, TIMBER)
        tb.box("timber", (0, 0.42, -d / 2 + 0.08), (w - 0.1, 0.84, 0.04), tint(TIMBER_LIGHT, 0.8), uv_dir=(1, 0, 0))
        with tb.at(T(0, 2.34, -d / 2 - 0.1), RX(11)):
            tb.box("cloth", (0, 0, (d + 0.5) / 2), (w + 0.4, 0.04, d + 0.5), cc)
            for i in range(4):
                tb.box("cloth", (-w / 2 + 0.2 + i * (w / 3.5), 0, (d + 0.5) / 2), (0.3, 0.046, d + 0.52), (0.95, 0.9, 0.8))
        # goods: baskets of produce and jars
        for i in range(4):
            gx = -w / 2 + 0.45 + i * 0.64
            tb.cyl("timber", (gx, 0.9, 0.1), 0.2, 0.26, 0.2, 8, tint(TIMBER_LIGHT, 1.2), cap_top=False)
            gc = rr.choice([(0.95, 0.5, 0.2), (0.75, 0.2, 0.2), (0.6, 0.8, 0.3), (0.95, 0.85, 0.4)])
            tb.blob("foliage", (gx, 1.1, 0.1), 0.22, gc, seed=rr.randrange(1 << 30), squash=0.55, sub=1)
        tb.col_box((0, 1.1, 0), (w, 2.2, d))


def well(tb, x, z, y):
    with tb.at(T(x, y, z)):
        tb.cyl("stone", (0, 0, 0), 1.25, 1.2, 0.28, 16, STONE_DARK, cap_top=True)
        n = 14
        tb.ring("stone", (0, 0.68, 0), 1.0, 0.72, 0.8, n, STONE, axis="y")
        tb.ring("stone", (0, 1.12, 0), 1.06, 0.68, 0.1, n, (1, 0.98, 0.94), axis="y")
        tb.cyl("glass", (0, 0.5, 0), 0.72, 0.72, 0.01, n, (0.5, 0.6, 0.6), cap_top=True)
        for sx in (-1, 1):
            tb.beam("timber", (sx * 0.92, 1.1, 0), (sx * 0.92, 2.6, 0), 0.13, 0.13, TIMBER)
        tb.beam("timber", (-1.05, 2.25, 0), (1.05, 2.25, 0), 0.1, 0.1, TIMBER_LIGHT)
        with tb.at(T(0, 2.6, 0)):
            for sz in (1, -1):
                pts = [(-1.25, 0, sz * 0.75), (1.25, 0, sz * 0.75), (1.25, 0.6, 0), (-1.25, 0.6, 0)]
                tb.poly("roof", pts if sz > 0 else list(reversed(pts)), (1.0, 0.88, 0.7), uv_dir=(1, 0, 0))
                tb.poly("timber", [(p[0], p[1] - 0.06, p[2]) for p in (reversed(pts) if sz > 0 else pts)], tint(TIMBER, 0.6))
        tb.cyl("timber", (0, 1.25, 0), 0.16, 0.19, 0.3, 8, TIMBER_LIGHT)
        tb.col_cyl((0, 0, 0), 1.1, 2.4, 10)


def cart(tb, x, z, y, rot=0.0):
    with tb.at(T(x, y, z), RY(rot)):
        tb.box("timber", (0, 0.75, 0), (1.3, 0.1, 2.2), TIMBER_LIGHT, uv_dir=(0, 0, 1))
        for sx in (-1, 1):
            tb.box("timber", (sx * 0.62, 1.0, 0), (0.06, 0.45, 2.2), tint(TIMBER_LIGHT, 0.85), uv_dir=(0, 0, 1))
            with tb.at(T(sx * 0.74, 0.55, -0.2), RZ_90()):
                tb.ring("timber", (0, 0, 0), 0.55, 0.45, 0.08, 14, TIMBER, axis="y")
                for k in range(4):
                    a = k * math.pi / 4
                    tb.beam("timber", (-math.cos(a) * 0.45, 0, -math.sin(a) * 0.45), (math.cos(a) * 0.45, 0, math.sin(a) * 0.45), 0.05, 0.05, TIMBER)
            tb.beam("timber", (sx * 0.45, 0.72, 1.1), (sx * 0.45, 0.5, 2.5), 0.06, 0.06, TIMBER)
        tb.blob("foliage", (0, 1.05, 0.2), 0.6, (0.9, 0.8, 0.45), seed=5, squash=0.5, sub=1)
        tb.col_box((0, 0.7, 0.2), (1.5, 1.4, 2.6))


def RZ_90():
    from town_geo import RZ
    return RZ(90)
