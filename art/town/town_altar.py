"""The Tournament altar (A-001), the temple and the far archipelago impostor.

Altar: a round stone dais with three steps; on a drum plinth stands an upright stone ring carved with
a ring of logogram marks (arc, spike, loop, drop: the four strokes of the game's signs), and in its
eye floats the amber core in a bronze claw. Core and glyph inlays share the emissive material
`M_Altar_Core`, which the client pulses as Iris approaches. Empties: `altar_focus`, `altar_stand`.
Local frame: origin at the dais centre on the ground, the front faces +Z (south, toward the street)."""

import math

import town_plan as P
from town_geo import RX, RY, RZ, T, tint

STONE = (0.95, 0.93, 0.88)
STONE_DARK = (0.60, 0.59, 0.56)
STONE_WARM = (1.0, 0.95, 0.84)
BRONZE = (1.0, 1.0, 1.0)
ROOF_HONEY = (1.0, 0.93, 0.66)
TIMBER = (0.40, 0.29, 0.20)

RING_R_OUT, RING_R_IN, RING_T = 1.38, 0.94, 0.44
PLINTH_H = 0.72


def ring_center_y():
    return P.ALTAR["step_h"] * 3 + PLINTH_H + RING_R_OUT - 0.10


def _ring_profile(tb, mat, cy, r_out, r_in, thick, n, col, chamfer=0.07):
    """Upright ring around the local Z axis with chamfered edges; u follows the angle."""
    h = thick / 2
    c = chamfer
    prof = [(r_in, -h + c), (r_in + c, -h), (r_out - c, -h), (r_out, -h + c), (r_out, h - c), (r_out - c, h), (r_in + c, h), (r_in, h - c)]
    m = len(prof)
    for i in range(n):
        a0, a1 = math.tau * i / n, math.tau * (i + 1) / n
        for k in range(m):
            (r0, z0), (r1, z1) = prof[k], prof[(k + 1) % m]
            def pt(a, r, z):
                return (math.cos(a) * r, cy + math.sin(a) * r, z)
            # winding: outward for this profile order (clockwise in the r-z plane seen along +theta)
            shade = 1.0 if k in (5, 1) else 0.86
            tb.quad(mat, pt(a0, r0, z0), pt(a1, r0, z0), pt(a1, r1, z1), pt(a0, r1, z1), tint(col, shade * (0.94 + 0.08 * ((i * 7) % 5) / 4)))


def _glyph(tb, kind, r_mid, a, cy, z, s=0.15):
    """One logogram mark on the ring face at angle a (radians), as a thin inlay proud of the stone."""
    cx, cyy = math.cos(a) * r_mid, cy + math.sin(a) * r_mid
    with tb.at(T(cx, cyy, z), RZ(math.degrees(a) - 90)):
        m = "altar_core"
        t = 0.018
        if kind == "arc":
            n = 6
            for i in range(n):
                b0, b1 = math.pi * (0.15 + 0.7 * i / n), math.pi * (0.15 + 0.7 * (i + 1) / n)
                tb.beam(m, (math.cos(b0) * s, math.sin(b0) * s - s * 0.5, 0), (math.cos(b1) * s, math.sin(b1) * s - s * 0.5, 0), 0.034, t, up=(0, 0, 1))
        elif kind == "spike":
            tb.poly(m, [(-0.035, -s, t / 2), (0.035, -s, t / 2), (0.0, s, t / 2)])
        elif kind == "loop":
            tb.ring(m, (0, 0, 0), s * 0.62, s * 0.36, t, 12)
        else:  # drop
            pts = [(0.0, s, t / 2)] + [(math.cos(b) * s * 0.5, -s * 0.4 + math.sin(b) * s * 0.5, t / 2) for b in [math.pi * (1 + k / 6) for k in range(-1, 8)]]
            tb.poly(m, pts)
        tb.box(m, (0, -s - 0.045, 0), (0.022, 0.022, t), skip="z")


def altar(tb):
    """Builds the altar into the current piece at the current transform."""
    sh = P.ALTAR["step_h"]
    radii = P.ALTAR["dais_r"]
    n = 48
    y = 0.0
    for i, r in enumerate(radii):
        tb.cyl("altar_stone", (0, y, 0), r + 0.02, r, sh, n, tint(STONE_DARK, 1.0 + 0.12 * i), cap_top=False)
        r_next = radii[i + 1] if i + 1 < len(radii) else 0.0
        if r_next:
            tb.ring("altar_stone", (0, y + sh - 0.005, 0), r, r_next - 0.02, 0.01, n, tint(STONE, 0.92 + 0.04 * i), axis="y")
        else:
            # the top floor: radial slabs in two tones around a bronze inlay ring
            for (ra, rb, shade) in ((r, 2.46, 0.98), (2.34, 1.2, 1.06)):
                tb.ring("altar_stone", (0, y + sh - 0.005, 0), ra, rb, 0.01, n, tint(STONE_WARM, shade), axis="y")
            tb.ring("altar_metal", (0, y + sh - 0.001, 0), 2.46, 2.34, 0.012, n, BRONZE, axis="y")
            tb.cyl("altar_stone", (0, y + sh - 0.01, 0), 1.2, 1.2, 0.0, 24, tint(STONE_WARM, 0.9), cap_top=True)
        tb.col_cyl((0, y - (0.3 if i == 0 else 0.0), 0), r, sh + (0.3 if i == 0 else 0.0), 20)
        y += sh
    top = y
    # twelve small amber studs around the top step (the count of a logogram ring's ticks)
    for k in range(12):
        a = math.tau * k / 12 + math.tau / 24
        tb.cyl("altar_core", (math.cos(a) * 2.72, top - 0.004, math.sin(a) * 2.72), 0.07, 0.05, 0.02, 8, cap_top=True)
    # drum plinth and cradle
    tb.cyl("altar_stone", (0, top, 0), 1.22, 1.12, 0.16, 16, STONE_DARK, cap_top=True)
    tb.cyl("altar_stone", (0, top + 0.16, 0), 1.02, 0.98, PLINTH_H - 0.30, 16, STONE, cap_top=False)
    tb.cyl("altar_stone", (0, top + PLINTH_H - 0.14, 0), 1.14, 1.14, 0.14, 16, STONE_WARM, cap_top=True, cap_bot=True)
    tb.ring("altar_metal", (0, top + 0.42, 0), 1.03, 0.9, 0.06, 16, BRONZE, axis="y")
    cy = ring_center_y()
    for sx in (-1, 1):
        with tb.at(T(sx * 0.62, top + PLINTH_H, 0), RZ(-sx * 24)):
            tb.box("altar_stone", (0, 0.2, 0), (0.5, 0.5, RING_T + 0.24), STONE_DARK, skip="y")
    # the standing ring with its logogram marks on both faces
    _ring_profile(tb, "altar_stone", cy, RING_R_OUT, RING_R_IN, RING_T, 48, STONE_WARM)
    kinds = ["arc", "spike", "loop", "drop"]
    marks = [0, 2, 1, 3, 0, 1, 3, 2, 1, 0, 2, 3, 2, 0, 3, 1]
    for face, zz in ((1, RING_T / 2 + 0.008), (-1, -RING_T / 2 - 0.008)):
        with tb.at(RY(0 if face > 0 else 180)):
            for k, mk in enumerate(marks):
                a = math.tau * (k + 0.5) / len(marks)
                _glyph(tb, kinds[mk], (RING_R_OUT + RING_R_IN) / 2, a, cy, abs(zz))
            tb.ring("altar_metal", (0, cy, abs(zz) - 0.004), RING_R_OUT - 0.075, RING_R_OUT - 0.105, 0.012, 48, BRONZE)
            tb.ring("altar_metal", (0, cy, abs(zz) - 0.004), RING_R_IN + 0.105, RING_R_IN + 0.075, 0.012, 48, BRONZE)
    # the amber core: a long faceted crystal in a bronze claw
    rc, hc = 0.30, 0.56
    tb.cyl("altar_core", (0, cy, 0), rc, 0.0, hc, 6, cap_top=False, phase=math.pi / 6)
    # lower pyramid (pointing down): mirrored by hand to keep the winding outward
    for i in range(6):
        a0, a1 = math.pi / 6 + math.tau * i / 6, math.pi / 6 + math.tau * (i + 1) / 6
        p0 = (math.cos(a0) * rc, cy, -math.sin(a0) * rc)
        p1 = (math.cos(a1) * rc, cy, -math.sin(a1) * rc)
        tb.poly("altar_core", [p1, p0, (0, cy - hc, 0)])
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        tb.beam("altar_metal", (math.cos(a) * RING_R_IN, cy + math.sin(a) * RING_R_IN, 0), (math.cos(a) * rc * 1.02, cy + math.sin(a) * rc * 1.02, 0), 0.05, 0.05, BRONZE)
        tb.box("altar_metal", (math.cos(a) * rc * 0.98, cy + math.sin(a) * rc * 0.98, 0), (0.09, 0.09, 0.09), BRONZE)
    tb.col_box((0, top + 1.9, 0), (2 * RING_R_OUT, 3.8, 0.9))
    tb.col_cyl((0, top, 0), 1.15, PLINTH_H, 10)
    # four waystones around the dais with an amber eye each
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        x, z = math.cos(a) * 5.0, math.sin(a) * 5.0
        with tb.at(T(x, 0, z), RY(-math.degrees(a) + 90)):
            tb.cyl("altar_stone", (0, 0, 0), 0.42, 0.36, 0.22, 8, STONE_DARK, cap_top=True)
            tb.cyl("altar_stone", (0, 0.22, 0), 0.28, 0.2, 1.25, 4, STONE, cap_top=True, phase=math.pi / 4)
            tb.cyl("altar_stone", (0, 1.47, 0), 0.2, 0.0, 0.3, 4, STONE_WARM, cap_top=False, phase=math.pi / 4)
            tb.ring("altar_metal", (0, 1.05, -0.185), 0.13, 0.09, 0.03, 12, BRONZE)
            tb.cyl("altar_core", (0, 1.05, -0.17), 0.085, 0.085, 0.0, 10, cap_top=False)
            tb.poly("altar_core", [(math.cos(math.tau * i / 10) * 0.085, 1.05 + math.sin(math.tau * i / 10) * 0.085, -0.186) for i in range(9, -1, -1)])
            tb.col_cyl((0, 0, 0), 0.36, 1.7, 6)
        tb.socket(f"socket_lamp_altar_{k}", (x * 0.97, 1.05, z * 0.97))
    tb.socket("altar_focus", (0, cy, 0))
    tb.socket("altar_stand", (0, top, 2.05))
    tb.socket("socket_lamp_altar_core", (0, cy, 0.6))


def temple(tb):
    """The temple above the square: a stone hall on a platform, a six-column portico whose pediment
    carries the great carved ring, a honey-tiled roof and a bell tower with a ring finial.
    Local frame: origin at the temple centre on the terrace, the front faces +Z."""
    W, D = P.TEMPLE["w"], P.TEMPLE["d"]
    ph = 1.0                                   # platform height
    hw, hd = W / 2, D / 2
    # platform and the front steps
    tb.box("stone", (0, ph / 2, 0.8), (W + 2.4, ph, D + 4.6), STONE, skip="y")
    tb.box("stone", (0, ph - 0.07, 0.8), (W + 2.7, 0.16, D + 4.9), STONE_WARM)
    tb.col_box((0, ph / 2, 0.8), (W + 2.4, ph, D + 4.6))
    zf = 0.8 + (D + 4.6) / 2
    ns = 6
    for i in range(ns):
        yy = ph * (ns - i) / (ns + 0)
        tb.box("stone", (0, yy / 2 - ph / ns / 2, zf + 0.17 + i * 0.34), (9.0, yy, 0.34), tint(STONE_WARM, 0.9 + 0.03 * i), skip="yz")
    tb.col_poly([(-4.5, 0, zf + ns * 0.34 + 0.2), (4.5, 0, zf + ns * 0.34 + 0.2), (4.5, ph, zf), (-4.5, ph, zf)])
    for sx in (-1, 1):
        tb.box("stone", (sx * 5.0, ph / 2 + 0.2, zf + 1.0), (1.0, ph + 0.4, 2.2), STONE_DARK, skip="y")
        tb.col_box((sx * 5.0, ph / 2 + 0.3, zf + 1.0), (1.0, ph + 0.6, 2.2))
        tb.socket(f"socket_lamp_temple_{'w' if sx < 0 else 'e'}", (sx * 5.0, ph + 1.6, zf + 1.0))
        tb.cyl("altar_metal", (sx * 5.0, ph + 0.4, zf + 1.0), 0.34, 0.42, 0.3, 10, BRONZE, cap_top=True)
        tb.cyl("lamp", (sx * 5.0, ph + 0.7, zf + 1.0), 0.3, 0.05, 0.5, 8, cap_top=False)
    # hall
    wall_h = 8.0
    y0 = ph
    for name, m, ww in (("front", T(0, 0, hd), W), ("right", T(hw, 0, 0) @ RY(90), D), ("back", T(0, 0, -hd) @ RY(180), W), ("left", T(-hw, 0, 0) @ RY(-90), D)):
        with tb.at(T(0, y0, 0), m):
            tb.quad("stone", (-ww / 2, 0, 0), (ww / 2, 0, 0), (ww / 2, 3.2, 0), (-ww / 2, 3.2, 0), [tint(STONE, 0.7), tint(STONE, 0.7), STONE, STONE])
            tb.quad("plaster", (-ww / 2, 3.2, 0), (ww / 2, 3.2, 0), (ww / 2, wall_h, 0), (-ww / 2, wall_h, 0), (1.0, 0.96, 0.86))
            tb.box("stone", (0, 3.2, 0.06), (ww + 0.2, 0.3, 0.14), STONE_WARM, skip="z")
            tb.box("stone", (0, wall_h - 0.25, 0.1), (ww + 0.3, 0.5, 0.22), STONE_WARM, skip="z")
            npil = 5 if ww > 14 else 4
            for i in range(npil + 1):
                px = -ww / 2 + ww * i / npil
                tb.box("stone", (px, wall_h / 2, 0.1), (0.7, wall_h, 0.22), STONE, skip="zy")
            if name != "front":
                for i in range(npil):
                    px = -ww / 2 + ww * (i + 0.5) / npil
                    # tall lancet windows glowing amber, with a ring at the head
                    tb.quad("glass_lit", (px - 0.38, 3.9, 0.03), (px + 0.38, 3.9, 0.03), (px + 0.38, 6.6, 0.03), (px - 0.38, 6.6, 0.03))
                    tb.box("stone", (px, 5.25, 0.07), (0.07, 2.7, 0.08), STONE_DARK, skip="z")
                    for sx in (-1, 1):
                        tb.box("stone", (px + sx * 0.44, 5.25, 0.08), (0.12, 2.9, 0.12), STONE_WARM, skip="z")
                    tb.ring("stone", (px, 6.95, 0.08), 0.42, 0.27, 0.12, 14, STONE_WARM)
            else:
                # the great doors
                tb.box("timber", (0, 2.5, 0.05), (3.2, 5.0, 0.12), tint(TIMBER, 0.85), skip="zy", uv_dir=(0, 1, 0))
                tb.box("timber", (0, 2.5, 0.12), (0.08, 5.0, 0.03), tint(TIMBER, 0.4), skip="z")
                for sx in (-1, 1):
                    tb.box("stone", (sx * 1.85, 2.6, 0.14), (0.5, 5.2, 0.3), STONE_WARM, skip="zy")
                    tb.ring("altar_metal", (sx * 0.55, 2.3, 0.14), 0.24, 0.16, 0.05, 14, BRONZE)
                    for yy in (0.8, 4.2):
                        tb.box("altar_metal", (sx * 0.82, yy, 0.12), (1.4, 0.14, 0.03), BRONZE, skip="z")
                tb.box("stone", (0, 5.45, 0.16), (4.6, 0.5, 0.34), STONE_WARM, skip="z")
                tb.ring("stone", (0, 6.5, 0.1), 0.62, 0.42, 0.14, 20, STONE_WARM)
                tb.poly("glass_lit", [(math.cos(math.tau * i / 20) * 0.42, 6.5 + math.sin(math.tau * i / 20) * 0.42, 0.04) for i in range(20)])
    tb.col_box((0, y0 + wall_h / 2, 0), (W, wall_h, D))
    # portico: six columns, entablature, pediment with the great ring
    pz = hd + 3.0
    cols_x = [-6.5 + i * 2.6 for i in range(6)]
    col_h = 6.6
    for cx in cols_x:
        tb.box("stone", (cx, y0 + 0.2, pz), (1.1, 0.4, 1.1), STONE_DARK, skip="y")
        tb.cyl("stone", (cx, y0 + 0.4, pz), 0.46, 0.38, col_h - 0.9, 14, tint(STONE_WARM, 0.9), cap_top=False, col_top=STONE_WARM)
        tb.cyl("stone", (cx, y0 + col_h - 0.5, pz), 0.4, 0.6, 0.3, 14, STONE_WARM, cap_top=False)
        tb.box("stone", (cx, y0 + col_h - 0.1, pz), (1.2, 0.2, 1.2), STONE_WARM)
        tb.ring("altar_metal", (cx, y0 + col_h - 0.62, pz), 0.44, 0.38, 0.08, 14, BRONZE, axis="y")
        tb.col_cyl((cx, y0, pz), 0.46, col_h, 8)
    ent_y = y0 + col_h
    tb.box("stone", (0, ent_y + 0.45, pz - 0.1), (W + 0.6, 0.9, 1.5), STONE, skip="")
    tb.box("stone", (0, ent_y + 0.98, pz - 0.05), (W + 1.0, 0.18, 1.9), STONE_WARM)
    # roof: ridge along Z, gable to the front; pediment over the portico
    eave = y0 + wall_h
    pitch = math.tan(math.radians(38))
    span = W + 1.4
    rise = pitch * span / 2
    zb, zfr = -hd - 0.7, pz + 0.9
    th = 0.22
    for sx in (-1, 1):
        a, b, c, d = (sx * span / 2, eave - 0.3, zfr), (sx * span / 2, eave - 0.3, zb), (0, eave + rise, zb), (0, eave + rise, zfr)
        pts = [a, b, c, d] if sx > 0 else [b, a, d, c]
        tb.poly("roof", pts, [tint(ROOF_HONEY, 0.85)] * 2 + [ROOF_HONEY] * 2 if sx > 0 else [tint(ROOF_HONEY, 0.85)] * 2 + [ROOF_HONEY] * 2, uv_dir=(0, 0, 1))
        tb.poly("timber", [(p[0], p[1] - th, p[2]) for p in reversed(pts)], tint(TIMBER, 0.6))
        tb.beam("timber", (sx * span / 2, eave - 0.3 - th / 2, zfr), (0, eave + rise - th / 2, zfr), 0.12, 0.36, TIMBER, up=(0, 1, 0))
        tb.beam("stone", (sx * span / 2, eave - 0.42, zb), (sx * span / 2, eave - 0.42, zfr), 0.3, 0.26, STONE_WARM)
    tb.beam("roof", (0, eave + rise + 0.04, zb - 0.05), (0, eave + rise + 0.04, zfr + 0.05), 0.5, 0.24, tint(ROOF_HONEY, 0.7))
    # pediment (front) and the back gable
    for zz, front in ((pz + 0.55, True), (zb + 0.75, False)):
        base_y = ent_y + 1.07 if front else eave
        apex = eave + rise - 0.25
        hwid = (apex - base_y) / pitch
        tri = [(-hwid, base_y, zz), (hwid, base_y, zz), (0, apex, zz)]
        tb.poly("stone" if front else "plaster", tri if front else list(reversed(tri)), STONE if front else (1.0, 0.96, 0.86))
        if front:
            cyr = base_y + (apex - base_y) * 0.40
            tb.ring("stone", (0, cyr, zz + 0.14), 1.55, 1.12, 0.28, 36, STONE_WARM)
            tb.ring("altar_metal", (0, cyr, zz + 0.285), 1.42, 1.25, 0.02, 36, BRONZE)
            for k in range(12):
                a = math.tau * k / 12
                tb.box("altar_core", (math.cos(a) * 1.335, cyr + math.sin(a) * 1.335, zz + 0.29), (0.09, 0.09, 0.03), skip="z")
            tb.poly("glass_lit", [(math.cos(math.tau * i / 24) * 1.12, cyr + math.sin(math.tau * i / 24) * 1.12, zz + 0.02) for i in range(24)])
    # side fill between entablature and roof over the portico
    for sx in (-1, 1):
        tb.box("stone", (sx * (hw + 0.1), (ent_y + 1.07 + eave) / 2, hd + 1.6), (0.5, max(0.1, eave - ent_y - 1.07), 3.2), STONE, skip="")
    # bell tower at the back-left with an open belfry and a ring finial
    tx, tz, ts, tH = -hw + 1.2, -hd - 1.6, 5.0, 19.0
    tb.box("stone", (tx, tH / 2, tz), (ts, tH, ts), STONE, skip="yY")
    tb.col_box((tx, tH / 2, tz), (ts, tH, ts))
    for yy in (6.0, 12.0, tH - 0.2):
        tb.box("stone", (tx, yy, tz), (ts + 0.4, 0.4, ts + 0.4), STONE_WARM)
    for name, m in (("f", T(tx, 0, tz + ts / 2)), ("r", T(tx + ts / 2, 0, tz) @ RY(90)), ("b", T(tx, 0, tz - ts / 2) @ RY(180)), ("l", T(tx - ts / 2, 0, tz) @ RY(-90))):
        with tb.at(m):
            tb.quad("glass_lit", (-0.3, 13.2, 0.03), (0.3, 13.2, 0.03), (0.3, 15.4, 0.03), (-0.3, 15.4, 0.03))
            tb.ring("stone", (0, 16.2, 0.07), 0.5, 0.33, 0.12, 14, STONE_WARM)
            tb.box("stone", (0, 9.0, 0.05), (0.5, 1.6, 0.08), (0.14, 0.13, 0.12), skip="z")
    by = tH
    for sx in (-1, 1):
        for sz in (-1, 1):
            tb.box("stone", (tx + sx * (ts / 2 - 0.45), by + 1.6, tz + sz * (ts / 2 - 0.45)), (0.9, 3.2, 0.9), STONE, skip="y")
    tb.box("stone", (tx, by + 3.4, tz), (ts + 0.5, 0.4, ts + 0.5), STONE_WARM)
    tb.cyl("altar_metal", (tx, by + 1.3, tz), 0.75, 0.3, 1.3, 10, BRONZE, cap_top=True)       # the bell
    tb.cyl("roof", (tx, by + 3.6, tz), (ts + 1.2) * 0.7071, 0.0, 6.2, 4, ROOF_HONEY, cap_top=False, phase=math.pi / 4, col_top=tint(ROOF_HONEY, 0.75))
    tb.cyl("altar_metal", (tx, by + 9.6, tz), 0.09, 0.06, 0.9, 6, BRONZE)
    tb.ring("altar_metal", (tx, by + 11.2, tz), 0.78, 0.6, 0.1, 24, BRONZE)
    tb.cyl("altar_core", (tx, by + 11.2 - 0.14, tz), 0.14, 0.14, 0.28, 8, cap_top=True, cap_bot=True)
    _ = RX


def sky_archipelago(tb, scale):
    """The archipelago far above, as a hazy impostor: plateaus on rock pillars, bridges and the four
    Shells, at reduced scale. Vertex colours carry the haze; the client draws it without fog."""
    haze_top, haze_low = (0.74, 0.80, 0.86), (0.90, 0.92, 0.95)
    rock = (0.52, 0.58, 0.64)
    def plateau(x, z, r, depth):
        tb.cyl("sky", (x, -0.9, z), r * 0.92, r, 0.9, 14, rock, cap_top=True, col_top=haze_top)
        tb.cyl("sky", (x, -depth * 0.45, z), r * 0.45, r * 0.9, depth * 0.45 - 0.9, 10, tint(rock, 1.12), cap_top=False, col_top=rock)
        tb.cyl("sky", (x, -depth, z), r * 0.12, r * 0.45, depth * 0.55, 8, haze_low, cap_top=False, col_top=tint(rock, 1.12))
    with tb.at(T(0, 0, 0)):
        s = scale
        plateau(0, 0, 9 * s, 42 * s)
        for ang in (270, 210, 150, 90, 30, 330):
            a = math.radians(ang)
            x, z = math.cos(a) * 30 * s, math.sin(a) * 30 * s
            plateau(x, z, 6.5 * s, 38 * s)
            tb.beam("sky", (math.cos(a) * 8.6 * s, -0.3 * s, math.sin(a) * 8.6 * s), (math.cos(a) * 23.9 * s, -0.3 * s, math.sin(a) * 23.9 * s), 2.4 * s, 0.6 * s, tint(rock, 1.05))
        a = math.radians(120)
        plateau(math.cos(a) * 46 * s, math.sin(a) * 46 * s, 5 * s, 30 * s)
        tb.beam("sky", (math.cos(a) * 8.6 * s, -0.3 * s, math.sin(a) * 8.6 * s), (math.cos(a) * 41.4 * s, -0.3 * s, math.sin(a) * 41.4 * s), 2.4 * s, 0.6 * s, tint(rock, 1.05))
        # Shells: tall tapering spirals of stacked rings (distinct heights), pale
        for i, (ang, rr, hy) in enumerate(((45, 52, 14), (135, 50, 22), (225, 54, 17), (315, 50, 25))):
            a = math.radians(ang)
            x, z = math.cos(a) * rr * s, math.sin(a) * rr * s
            segs = 7
            for k in range(segs):
                t0, t1 = k / segs, (k + 1) / segs
                r0 = (5.2 - 4.4 * t0 ** 1.3) * s * (1.0 + 0.2 * (i == 1))
                r1 = (5.2 - 4.4 * t1 ** 1.3) * s * (1.0 + 0.2 * (i == 1))
                ox = math.sin(t0 * 5.0 + i) * 0.9 * s
                tb.cyl("sky", (x + ox, (hy + t0 * 18) * s, z), r0 * 1.05, r1, 18 * s / segs, 10, (0.86, 0.87, 0.9), cap_top=(k == segs - 1), col_top=(0.95, 0.94, 0.92))
            tb.cyl("sky", (x, (hy - 3.5) * s, z), 0.5 * s, 5.4 * s, 3.5 * s, 10, haze_low, cap_top=False, col_top=(0.86, 0.87, 0.9))
