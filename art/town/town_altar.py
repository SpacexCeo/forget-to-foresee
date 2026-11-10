"""The Tournament altar (A-001), the round shrine and the far archipelago impostor.

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


def _glyph(tb, kind, r_mid, a, cy, z, s=0.15, m="altar_core", t=0.018, wline=0.034):
    """One logogram mark on the ring face at angle a (radians), as a thin inlay proud of the stone."""
    cx, cyy = math.cos(a) * r_mid, cy + math.sin(a) * r_mid
    with tb.at(T(cx, cyy, z), RZ(math.degrees(a) - 90)):
        if kind == "arc":
            n = 6
            for i in range(n):
                b0, b1 = math.pi * (0.15 + 0.7 * i / n), math.pi * (0.15 + 0.7 * (i + 1) / n)
                tb.beam(m, (math.cos(b0) * s, math.sin(b0) * s - s * 0.5, 0), (math.cos(b1) * s, math.sin(b1) * s - s * 0.5, 0), wline, t, up=(0, 0, 1))
        elif kind == "spike":
            tb.poly(m, [(-wline, -s, t / 2), (wline, -s, t / 2), (0.0, s, t / 2)])
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


def shrine(tb):
    """The round shrine above the square (owner decision 10.11, option C): a ring colonnade of twelve
    columns around a round cella on a raised stone drum, a tiled ring roof, and a low dome with spiral
    growth ridges and a pearl sheen that echoes the Shells; an open oculus with an amber rim under a
    bronze tripod carrying the round sign. A frieze of logogram strokes runs around the entablature and
    above the entrance. Local frame: origin at the shrine centre on the terrace, the entrance faces +Z."""
    ph = 1.0                      # drum platform height
    R_PLAT, R_COL, R_CELLA = 9.6, 7.8, 5.0
    col_h, cella_h = 6.0, 8.4
    # platform drum with a cap course and the front steps
    tb.cyl("stone", (0, -0.6, 0), R_PLAT + 0.1, R_PLAT, ph + 0.6, 40, tint(STONE, 0.72), cap_top=False, col_top=STONE)
    tb.cyl("stone", (0, ph - 0.16, 0), R_PLAT + 0.22, R_PLAT + 0.22, 0.16, 40, STONE_WARM, cap_top=True, cap_bot=True)
    tb.col_cyl((0, 0, 0), R_PLAT + 0.1, ph, 20)
    zf = R_PLAT - 0.3
    ns = 6
    for i in range(ns):
        yy = ph * (ns - i) / ns
        tb.box("stone", (0, yy / 2, zf + 0.17 + i * 0.34), (8.4, yy, 0.34), tint(STONE_WARM, 0.9 + 0.03 * i), skip="yz")
    tb.col_poly([(-4.2, 0, zf + ns * 0.34 + 0.2), (4.2, 0, zf + ns * 0.34 + 0.2), (4.2, ph, zf), (-4.2, ph, zf)])
    for sx in (-1, 1):
        tb.box("stone", (sx * 4.7, ph / 2 + 0.2, zf + 0.9), (1.0, ph + 0.4, 2.4), STONE_DARK, skip="y")
        tb.col_box((sx * 4.7, ph / 2 + 0.3, zf + 0.9), (1.0, ph + 0.6, 2.4))
        tb.cyl("altar_metal", (sx * 4.7, ph + 0.4, zf + 0.9), 0.34, 0.42, 0.3, 10, BRONZE, cap_top=True)
        tb.cyl("lamp", (sx * 4.7, ph + 0.7, zf + 0.9), 0.3, 0.05, 0.5, 8, cap_top=False)
        tb.socket(f"socket_lamp_temple_{'w' if sx < 0 else 'e'}", (sx * 4.7, ph + 1.5, zf + 0.9))
    # inlaid ring in the platform floor between the columns and the cella
    tb.ring("altar_metal", (0, ph + 0.004, 0), 6.55, 6.4, 0.012, 48, BRONZE, axis="y")
    # twelve columns; the entrance bay is centred on +Z
    ncol = 12
    for k in range(ncol):
        a = math.tau * (k + 0.5) / ncol + math.pi / 2
        cx, cz = math.cos(a) * R_COL, -math.sin(a) * R_COL
        tb.cyl("stone", (cx, ph, cz), 0.62, 0.56, 0.36, 12, STONE_DARK, cap_top=True)
        tb.cyl("stone", (cx, ph + 0.36, cz), 0.44, 0.36, col_h - 0.86, 14, tint(STONE_WARM, 0.9), cap_top=False, col_top=STONE_WARM)
        tb.cyl("stone", (cx, ph + col_h - 0.5, cz), 0.38, 0.6, 0.3, 14, STONE_WARM, cap_top=False)
        tb.cyl("stone", (cx, ph + col_h - 0.2, cz), 0.66, 0.66, 0.2, 12, STONE_WARM, cap_top=True, cap_bot=True)
        tb.ring("altar_metal", (cx, ph + col_h - 0.62, cz), 0.43, 0.37, 0.08, 14, BRONZE, axis="y")
        tb.col_cyl((cx, ph, cz), 0.46, col_h, 8)
    # entablature ring with the frieze of strokes (bronze; amber is kept for the entrance and the oculus)
    ent_y = ph + col_h
    tb.ring("stone", (0, ent_y + 0.5, 0), R_COL + 0.75, R_COL - 0.7, 1.0, 48, STONE, axis="y")
    tb.ring("stone", (0, ent_y + 1.08, 0), R_COL + 1.0, R_COL - 0.8, 0.16, 48, STONE_WARM, axis="y")
    kinds = ["arc", "spike", "loop", "drop"]
    seq = [0, 2, 1, 3, 0, 1, 3, 2, 1, 0, 2, 3, 2, 0, 3, 1, 0, 3, 1, 2, 3, 1, 0, 2]
    for k, mk in enumerate(seq):
        ang = 360.0 * (k + 0.5) / len(seq)
        with tb.at(RY(ang), T(0, ent_y + 0.5, R_COL + 0.75)):
            _glyph(tb, kinds[mk], 0.0, math.pi / 2, 0.0, 0.02, s=0.27, m="altar_metal", t=0.04, wline=0.06)
    # the round cella: stone below, plaster above, lit lancets, the entrance with its ring of strokes
    y0 = ph
    n = 32
    tb.cyl("stone", (0, y0, 0), R_CELLA + 0.04, R_CELLA, 3.2, n, tint(STONE, 0.72), cap_top=False, col_top=STONE)
    tb.cyl("plaster", (0, y0 + 3.2, 0), R_CELLA, R_CELLA, cella_h - 3.2, n, (1.0, 0.96, 0.86), cap_top=False)
    tb.cyl("stone", (0, y0 + 3.1, 0), R_CELLA + 0.12, R_CELLA + 0.12, 0.26, n, STONE_WARM, cap_top=True, cap_bot=True)
    tb.cyl("stone", (0, y0 + cella_h - 0.5, 0), R_CELLA + 0.16, R_CELLA + 0.16, 0.5, n, STONE_WARM, cap_top=True, cap_bot=True)
    tb.col_cyl((0, y0, 0), R_CELLA + 0.1, cella_h, 16)
    for k in range(1, 12):
        ang = 360.0 * k / 12
        if 1 < k < 11 or k in (1, 10):
            with tb.at(RY(ang + 15.0), T(0, y0, R_CELLA)):
                tb.box("stone", (0, cella_h / 2, 0.06), (0.5, cella_h, 0.2), STONE, skip="zy")
        if k % 2 == 0:
            continue
        with tb.at(RY(ang), T(0, y0, R_CELLA - 0.03)):
            tb.quad("glass_lit", (-0.34, 3.9, 0.06), (0.34, 3.9, 0.06), (0.34, 6.3, 0.06), (-0.34, 6.3, 0.06))
            for sx in (-1, 1):
                tb.box("stone", (sx * 0.4, 5.1, 0.1), (0.12, 2.6, 0.14), STONE_WARM, skip="z")
            tb.ring("stone", (0, 6.62, 0.1), 0.4, 0.26, 0.12, 14, STONE_WARM)
    with tb.at(T(0, y0, R_CELLA - 0.02)):
        tb.box("timber", (0, 2.3, 0.08), (2.6, 4.6, 0.14), tint(TIMBER, 0.85), skip="zy", uv_dir=(0, 1, 0))
        tb.box("timber", (0, 2.3, 0.16), (0.07, 4.6, 0.03), tint(TIMBER, 0.4), skip="z")
        for sx in (-1, 1):
            tb.box("stone", (sx * 1.55, 2.4, 0.2), (0.5, 4.8, 0.4), STONE_WARM, skip="zy")
            tb.ring("altar_metal", (sx * 0.5, 2.2, 0.18), 0.22, 0.15, 0.05, 14, BRONZE)
            for yy in (0.8, 3.9):
                tb.box("altar_metal", (sx * 0.66, yy, 0.16), (1.1, 0.13, 0.03), BRONZE, skip="z")
        tb.box("stone", (0, 4.95, 0.24), (4.0, 0.5, 0.46), STONE_WARM, skip="z")
        # the entrance ring: stone ring, amber eye (weaker than the altar core), eight strokes around it
        cyr = 6.35
        tb.ring("stone", (0, cyr, 0.2), 1.0, 0.66, 0.3, 28, STONE_WARM)
        tb.poly("glass_lit", [(math.cos(math.tau * i / 24) * 0.66, cyr + math.sin(math.tau * i / 24) * 0.66, 0.12) for i in range(24)])
        for k in range(8):
            _glyph(tb, kinds[(k * 3) % 4], 0.83, math.tau * (k + 0.5) / 8, cyr, 0.36, s=0.1, m="altar_metal", t=0.03, wline=0.03)
    # ring roof over the colonnade (honey tiles), from the cella wall down to the entablature
    r_hi, y_hi = R_CELLA + 0.1, y0 + cella_h - 0.55
    r_lo, y_lo = R_COL + 1.25, ent_y + 1.12
    m = 48
    for i in range(m):
        a0, a1 = math.tau * i / m, math.tau * (i + 1) / m
        def pr(a, r, y):
            return (math.cos(a) * r, y, -math.sin(a) * r)
        tb.quad("roof", pr(a0, r_lo, y_lo), pr(a1, r_lo, y_lo), pr(a1, r_hi, y_hi), pr(a0, r_hi, y_hi),
                [tint(ROOF_HONEY, 0.84)] * 2 + [ROOF_HONEY] * 2)
        tb.quad("timber", pr(a1, r_lo, y_lo - 0.14), pr(a0, r_lo, y_lo - 0.14), pr(a0, r_hi, y_hi - 0.14), pr(a1, r_hi, y_hi - 0.14), tint(TIMBER, 0.6))
        tb.quad("timber", pr(a0, r_lo, y_lo - 0.14), pr(a1, r_lo, y_lo - 0.14), pr(a1, r_lo, y_lo), pr(a0, r_lo, y_lo), tint(TIMBER, 0.85))
    # the dome: a low shell (owner: the Shell echo, not an egg): ten raised ribs spiral from the drum to
    # the oculus, stepped growth lines run between them, warm off-white with a pearl tint
    dome_y = y0 + cella_h
    R0, H, R_OC = R_CELLA + 0.35, 3.0, 1.15
    rows, segs, nrib, twist = 14, 60, 10, 1.9
    def dome_rz(t):
        return R0 + (R_OC - R0) * (1 - math.cos(t * math.pi / 2)) ** 0.9, dome_y + H * math.sin(t * math.pi / 2)
    def pearl(t, ang, k=1.0):
        return ((1.0 + 0.07 * math.sin(ang * 2 + t * 5)) * k, (0.93 + 0.04 * math.sin(ang * 3 + 2)) * k, (0.82 + 0.10 * math.cos(ang * 2 + t * 4)) * k)
    for j in range(rows):
        t0, t1 = j / rows, (j + 1) / rows
        (ra, ya), (rb, yb) = dome_rz(t0), dome_rz(t1)
        lip = 0.07 * (1 - 0.5 * t0)          # each growth band overlaps the next one like a shell's lines
        for i in range(segs):
            a0, a1 = math.tau * i / segs, math.tau * (i + 1) / segs
            def dp(a, r, y):
                return (math.cos(a) * r, y, -math.sin(a) * r)
            tb.quad("pearl", dp(a0, ra + lip, ya), dp(a1, ra + lip, ya), dp(a1, rb, yb), dp(a0, rb, yb),
                    [pearl(t0, a0, 0.78), pearl(t0, a1, 0.78), pearl(t1, a1, 1.0), pearl(t1, a0, 1.0)])
            if j:
                tb.quad("pearl", dp(a0, ra, ya - 0.03), dp(a1, ra, ya - 0.03), dp(a1, ra + lip, ya), dp(a0, ra + lip, ya), pearl(t0, a0, 0.6))
    for k in range(nrib):
        base = math.tau * k / nrib
        n = 18
        prev = None
        for q in range(n + 1):
            t = q / n
            r, y = dome_rz(t)
            a = base + twist * t
            w = 0.34 * (1 - 0.55 * t)
            p = (math.cos(a) * (r + 0.1), y + 0.06, -math.sin(a) * (r + 0.1))
            if prev:
                tb.beam("pearl", prev[0], p, w, 0.26 * (1 - 0.4 * t), pearl(t, a, 1.12), up=(prev[0][0], 2.0, prev[0][2]))
            prev = (p, w)
        tb.cyl("pearl", (math.cos(base) * (R0 + 0.12), dome_y - 0.05, -math.sin(base) * (R0 + 0.12)), 0.26, 0.2, 0.3, 8, pearl(0, base, 1.1), cap_top=True)
    oc_y = dome_y + H
    tb.ring("glass_lit", (0, oc_y + 0.04, 0), R_OC + 0.16, R_OC - 0.02, 0.1, 32, (1, 1, 1), axis="y")
    tb.cyl("stone", (0, oc_y - 0.9, 0), R_OC, R_OC, 0.0, 24, (0.05, 0.05, 0.06), cap_top=True)
    tb.cyl("stone", (0, oc_y - 0.9, 0), R_OC + 0.02, R_OC + 0.02, 0.92, 24, (0.3, 0.29, 0.27), cap_top=False)
    # bronze tripod over the oculus carrying the round sign
    apex = oc_y + 2.3
    for k in range(3):
        a = math.tau * k / 3 + math.pi / 2
        tb.beam("altar_metal", (math.cos(a) * (R_OC + 0.08), oc_y + 0.05, -math.sin(a) * (R_OC + 0.08)), (0, apex, 0), 0.09, 0.09, BRONZE)
    tb.ring("altar_metal", (0, apex + 0.72, 0), 0.72, 0.55, 0.1, 24, BRONZE)
    tb.cyl("altar_core", (0, apex + 0.62, 0), 0.1, 0.1, 0.2, 8, cap_top=True, cap_bot=True)
    _ = (RX, RZ)


def sky_archipelago(tb, scale):
    """The archipelago far above, seen from below (visual only): five islands at different depths, each a
    grassy rim over a rocky inverted-cone underside, with the Shells standing above four of them. Vertex
    colours carry the haze, stronger with distance; the client draws it without fog."""
    import random
    sky_c = (0.60, 0.70, 0.86)

    def haze(c, k):
        return tuple(c[i] * (1 - k) + sky_c[i] * k for i in range(3))

    def island(x, y, z, r, depth, k, seed):
        rr = random.Random(seed)
        rock, rock_d, grass = haze((0.34, 0.36, 0.40), k), haze((0.22, 0.24, 0.29), k), haze((0.36, 0.52, 0.30), k)
        n = 11
        ph = rr.uniform(0, 6)
        # grass cap and its overhanging rim (lighter from below), then three ragged rock tiers to a point
        tb.cyl("sky", (x, y, z), r * 1.06, r * 0.98, r * 0.10, n, grass, cap_top=True, cap_bot=True, phase=ph, col_top=haze((0.46, 0.62, 0.36), k))
        tiers = [(1.0, 0.0), (0.80, 0.22), (0.50, 0.55), (0.22, 0.82), (0.0, 1.0)]
        for (ra, da), (rb, db) in zip(tiers, tiers[1:]):
            ox, oz = rr.uniform(-0.08, 0.08) * r, rr.uniform(-0.08, 0.08) * r
            tb.cyl("sky", (x + ox, y - depth * db, z + oz), max(rb * r, 0.001) * rr.uniform(0.9, 1.1), ra * r * rr.uniform(0.92, 1.0), depth * (db - da), n,
                   rock_d if db > 0.5 else rock, cap_top=False, phase=ph + rr.uniform(-0.3, 0.3), col_top=rock)
        for _i in range(3):   # hanging rock teeth
            a = rr.uniform(0, math.tau)
            d = rr.uniform(0.35, 0.7) * r
            tb.cyl("sky", (x + math.cos(a) * d, y - depth * rr.uniform(0.5, 0.75), z + math.sin(a) * d), 0.001, r * 0.16, depth * 0.45, 6, rock_d, cap_top=False, col_top=rock)

    def shell(x, y, z, hgt, k, i):
        pale, lit = haze((0.80, 0.78, 0.76), k), haze((0.96, 0.93, 0.88), k)
        segs = 8
        for q in range(segs):
            t0, t1 = q / segs, (q + 1) / segs
            r0 = hgt * 0.30 * (1 - t0) ** 0.8 + hgt * 0.02
            r1 = hgt * 0.30 * (1 - t1) ** 0.8 + hgt * 0.02
            ox = math.sin(t0 * 5.0 + i) * hgt * 0.035
            tb.cyl("sky", (x + ox, y + t0 * hgt, z), r0 * 1.08, r1, hgt / segs, 10, pale, cap_top=(q == segs - 1), col_top=lit)
        tb.cyl("sky", (x, y - hgt * 0.16, z), hgt * 0.04, hgt * 0.32, hgt * 0.16, 10, haze((0.6, 0.6, 0.62), k), cap_top=False, col_top=pale)

    s = scale
    # x, y, z offsets (m), radius, underside depth, haze amount
    isles = [(0, 0, 0, 26, 30, 0.24), (-62, 14, -30, 16, 20, 0.42), (58, -10, 20, 18, 22, 0.20),
             (-30, 34, -90, 14, 18, 0.60), (84, 30, -70, 12, 15, 0.56)]
    for i, (x, y, z, r, d, k) in enumerate(isles):
        island(x * s, y * s, z * s, r * s, d * s, k, 100 + i)
        if i:
            shell(x * s, (y + r * 0.9) * s, z * s, r * 1.5 * s, min(0.8, k + 0.08), i)
    # a few stones adrift between them
    rr = random.Random(9)
    for _i in range(7):
        island(rr.uniform(-80, 90) * s, rr.uniform(-18, 26) * s, rr.uniform(-80, 30) * s, rr.uniform(2.0, 4.5) * s, rr.uniform(3, 6) * s, rr.uniform(0.4, 0.7), 200 + _i)
