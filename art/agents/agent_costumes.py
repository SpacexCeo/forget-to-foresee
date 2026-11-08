"""The six clan costumes built on the shared humanoid base.

Silhouette cues are chosen to read from the high isometric game camera:
    Iris   charcoal hooded wool cloak with a frayed hem, long violet scarf
           (owner concept 07.11), dark layers, bracers, shoulder-length hair
    Salt   tiered pale robe with scale hems, deep hood and veil, white quartz
           clusters on the shoulders, brass balance in the hand
    Ash    soot-black ragged layers, palisade collar of charred stakes, stake shield
    Moss   soft layered green cloak with moss and mushrooms, hood down, cauldron
    Amber  warm merchant coat, flat hat, strong-box on the back, padlocks, key ring
    Frost  tall pointed hood, icicle-hem mantle, armillary staff, tablet of signs
"""

import math
import random

import bmesh
from mathutils import Matrix, Vector

from agent_geometry import (
    BODY, Agent, arm, axis_tube, band, basis, box, build_body, build_grid, conform_grid,
    crystal, face_head_bm, finish_sheet, frame, garment, grid_faces, hem_jagged, hem_points, hem_scallop,
    hood, ico, leg, lerp, mantle, orient_outward, petal, placed, revolve, robe, sleeve,
    stake, surface_point, torus, tube, vloft,
)

PALETTES = {
    "iris": {
        "suit": (0.030, 0.028, 0.034), "skin": (0.42, 0.34, 0.31), "hair": (0.022, 0.017, 0.016),
        "tunic": (0.045, 0.043, 0.050), "cloth": (0.055, 0.052, 0.060),
        "cloak": (0.075, 0.074, 0.078), "cloak2": (0.085, 0.084, 0.088),
        "scarf": (0.200, 0.085, 0.380), "leather": (0.075, 0.048, 0.030),
        "boot": (0.040, 0.030, 0.024), "metal": (0.55, 0.53, 0.58), "gem": (0.30, 0.08, 0.70),
    },
    "sol": {
        "suit": (0.20, 0.19, 0.17), "skin": (0.42, 0.36, 0.32),
        "cloth": (0.640, 0.620, 0.560), "tier": (0.560, 0.540, 0.480), "hood": (0.700, 0.690, 0.640),
        "veil": (0.480, 0.470, 0.430), "crystal": (0.860, 0.870, 0.880), "crystal2": (0.700, 0.740, 0.760),
        "leather": (0.230, 0.150, 0.085), "brass": (0.700, 0.500, 0.200), "cord": (0.300, 0.250, 0.180),
    },
    "pepel": {
        "suit": (0.030, 0.028, 0.026), "skin": (0.30, 0.26, 0.24),
        "cloth": (0.040, 0.038, 0.040), "coat": (0.055, 0.050, 0.048), "wrap": (0.180, 0.170, 0.160),
        "hood": (0.050, 0.046, 0.044), "wood": (0.040, 0.030, 0.022), "wood2": (0.075, 0.055, 0.038),
        "iron": (0.070, 0.070, 0.075), "rope": (0.200, 0.160, 0.110),
    },
    "moh": {
        "suit": (0.060, 0.050, 0.030), "skin": (0.40, 0.33, 0.27), "hair": (0.060, 0.045, 0.025),
        "cloth": (0.200, 0.130, 0.065), "tunic": (0.240, 0.200, 0.110), "cloak": (0.075, 0.150, 0.045),
        "cloak2": (0.120, 0.210, 0.060), "moss": (0.110, 0.240, 0.040),
        "cap": (0.640, 0.520, 0.360), "stem": (0.700, 0.650, 0.540), "leaf": (0.150, 0.320, 0.060),
        "pot": (0.060, 0.058, 0.055), "copper": (0.450, 0.200, 0.090), "wood": (0.180, 0.110, 0.055),
        "rope": (0.300, 0.240, 0.150),
    },
    "yantar": {
        "suit": (0.080, 0.040, 0.020), "skin": (0.42, 0.32, 0.25),
        "cloth": (0.360, 0.120, 0.030), "coat": (0.300, 0.090, 0.020), "lining": (0.600, 0.330, 0.060),
        "leather": (0.140, 0.070, 0.030), "wood": (0.300, 0.120, 0.035), "brass": (0.720, 0.500, 0.190),
        "iron": (0.120, 0.110, 0.100), "amber": (0.900, 0.380, 0.030), "hat": (0.120, 0.050, 0.020),
    },
    "iney": {
        "suit": (0.120, 0.150, 0.190), "skin": (0.40, 0.38, 0.40),
        "cloth": (0.420, 0.520, 0.620), "robe": (0.300, 0.400, 0.520), "mantle": (0.680, 0.760, 0.840),
        "hood": (0.560, 0.660, 0.770), "glass": (0.550, 0.760, 0.900), "glass2": (0.780, 0.880, 0.950),
        "silver": (0.760, 0.790, 0.820), "slate": (0.060, 0.070, 0.085), "sign": (0.700, 0.820, 0.900),
        "cord": (0.150, 0.150, 0.170),
    },
}


# ============================================================ shared pieces

def hair(ag, name, color, length_back=0.18, vol=0.014, seed=1, n=22, rows=10, fringe=1.05,
         messy=0.012):
    """Faceted hair shell: fringe at the brow, falling to length_back at the nape."""
    hc = Vector(BODY["head_c"])
    rx, ry, rz = BODY["head_r"]
    rnd = random.Random(seed)
    jit = [rnd.uniform(0.0, 1.0) for _ in range(n)]
    phi_back = 2.30
    P, A = [], []
    for v in range(rows + 1):
        t = v / rows
        prow, arow = [], []
        for i in range(n):
            th = -math.pi / 2 + 2 * math.pi * i / n
            front = max(0.0, -math.sin(th))
            phi_end = lerp(phi_back, fringe, front ** 0.7)
            phi = lerp(0.05, phi_end, t)
            if phi <= math.pi / 2:
                d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th),
                            math.cos(phi)))
                p = hc + Vector((d.x * (rx + vol), d.y * (ry + vol) + 0.01, d.z * (rz + vol)))
                ax = hc.copy()
            else:
                k = (phi - math.pi / 2) / (phi_back - math.pi / 2)
                spread = 1.0 + 0.25 * k
                p = hc + Vector((math.cos(th) * (rx + vol) * spread,
                                 math.sin(th) * (ry + vol) * spread + 0.01,
                                 -k * length_back * (0.8 + 0.4 * jit[i])))
                ax = Vector((hc.x, hc.y, p.z))
            if 0 < v < rows:
                k_m = min(1.0, max(0.0, (phi - 0.6) / 0.6))
                p += (p - ax).normalized() * messy * jit[(i + v) % n] * k_m
            prow.append(p)
            arow.append(ax)
        P.append(prow)
        A.append(arow)
    P = conform_grid(P, A, ag.bvh("all"), clear=0.006, push=0.05)
    bm = build_grid(P, True, axis_fn=lambda c: hc if c.z > hc.z else Vector((hc.x, hc.y, c.z)))
    return ag.add(name, bm, "body", "felt", color, rough=0.65, solid=0.012)


def ribbon(ag, name, path, width, color, kind="wool", rough=0.9, out=0.014, thick=0.008,
           fray=0.0, seed=3, cols=3):
    """Strip lying on the current outer surface. path: list of (z, theta, width_scale)."""
    rnd = random.Random(seed)
    P = []
    prev_r = None
    for k, (z, th, ws) in enumerate(path):
        p, d = surface_point(ag, z, th, out=out)
        r = Vector((p.x, p.y, 0)).length
        if prev_r is not None and r < prev_r - 0.012:
            r = prev_r - 0.012
            p = Vector((0, 0, z)) + d * r
        prev_r = r
        side = Vector((-math.sin(th), math.cos(th), 0)).normalized()
        row = []
        for c in range(cols):
            w = -1 + 2 * c / (cols - 1)
            q = p + side * (w * width * ws * 0.5)
            if k == len(path) - 1 and fray:
                q.z -= fray * rnd.random()
            row.append(q)
        P.append(row)
    bm = build_grid(P, False)
    return ag.add(name, bm, "garment", kind, color, rough, solid=thick, collide=("all",))


def balance(ag, side, color="brass", cord="cord", beam=0.20, drop=0.20):
    """Hand-held balance: grip ring, post, beam and two pans on cords."""
    Ar = arm(side)
    top = Ar["grip"] + Vector((0.02 * side, -0.03, -0.02))
    bm = bmesh.new()
    torus(bm, top + Vector((0, 0, 0.015)), 0.02, 0.005, n=10, m=4,
          M=Matrix.Rotation(math.pi / 2, 4, "X"))
    tube(bm, [top, top + Vector((0, 0, -0.16))], 0.007, 6)
    beam_c = top + Vector((0, 0, -0.12))
    bx = Vector((0, -1, 0))
    tube(bm, [beam_c - bx * beam, beam_c + bx * beam], 0.008, 6)
    for s in (-1, 1):
        placed(bm, Matrix.Translation(beam_c + bx * beam * s), lambda b: revolve(
            b, [(0.0, -0.012), (0.012, -0.006), (0.012, 0.006), (0.0, 0.012)], 6))
    ag.add("balance", bm, "ornament", "metal", color, rough=0.3, metal=1.0, collide=())
    pans, cords = bmesh.new(), bmesh.new()
    for s in (-1, 1):
        hang = beam_c + bx * (beam - 0.01) * s
        pc = hang + Vector((0, 0, -drop + 0.03 * s))
        placed(pans, Matrix.Translation(pc), lambda b: revolve(
            b, [(0.0, -0.022), (0.05, -0.016), (0.075, 0.0), (0.072, 0.006), (0.045, -0.008),
                (0.0, -0.014)], 14))
        for k in range(3):
            a = 2 * math.pi * k / 3
            tube(cords, [hang, pc + Vector((0.07 * math.cos(a), 0.07 * math.sin(a), 0.002))],
                 0.0025, 3)
    ag.add("pans", pans, "ornament", "metal", color, rough=0.3, metal=1.0, collide=())
    ag.add("cords", cords, "ornament", "leather", cord, rough=0.8, collide=())


# ================================================================ costumes

def costume_iris(ag):
    """Iris (player clan), after the owner's concept: long charcoal hooded wool
    cloak with a frayed hem and shoulder cape, long violet scarf wrapped over the
    shoulders and hanging down the back, dark layers, leather bracers and boots,
    dark shoulder-length hair."""
    build_body(ag)
    robe(ag, "tunic", 1.49, 0.58, 0.04, 0.21, n=32, rows=10, depth=0.85, flare=1.8,
         pleats=8, pleat_amp=0.03, color="tunic", against="core", push=0.05, clear=0.013)
    sleeve(ag, "sleeve_l", 1, 0.064, 0.060, color="cloth", bell=1.0)
    sleeve(ag, "sleeve_r", -1, 0.064, 0.060, color="cloth", bell=1.0)
    for side in (-1, 1):
        L = leg(side)
        axis_tube(ag, f"boot_{side}", L["K"] + (L["A"] - L["K"]) * 0.12,
                  L["A"] + Vector((0, 0, -0.035)), 0.066, 0.058, n=10, rows=5, bell=1.0,
                  kind="leather", color="boot", rough=0.55, thick=0.008, clear=0.010)
    band(ag, "belt", 1.00, 1.05, color="leather", kind="leather")
    for side in (-1, 1):
        Ar = arm(side)
        axis_tube(ag, f"bracer_{side}", Ar["E"] + (Ar["W"] - Ar["E"]) * 0.22,
                  Ar["W"] + Ar["dir"] * 0.01, 0.052, 0.046, n=10, rows=4, bell=1.0,
                  kind="leather", color="leather", rough=0.5, thick=0.007, clear=0.010,
                  slot="ornament")
    hair(ag, "hair", "hair", length_back=0.20, seed=11)
    mantle(ag, "cloak", 1.50, 0.08, 1.20, 0.31, n=48, rows=14, depth=0.9,
           hem=hem_jagged(5, 48, 0.07), front_short=0.02, back_long=0.04,
           span=math.radians(292), th0=math.radians(-90 + 34), spread=1.6, color="cloak",
           kind="wool", rough=0.95, thick=0.012)
    mantle(ag, "cape", 1.505, 0.08, 0.40, 0.33, n=48, rows=7, depth=0.9,
           hem=hem_jagged(9, 48, 0.05), span=math.radians(300), th0=math.radians(-90 + 30),
           color="cloak2", kind="wool", rough=0.95, thick=0.012)
    # Hood down: heavy fold lying on the upper back.
    p, d = surface_point(ag, 1.43, math.pi / 2)
    bm = bmesh.new()
    placed(bm, frame(p + d * 0.02 + Vector((0, 0, 0.03)), (0, 0.75, 1.0)), lambda b: revolve(
        b, [(0.05, -0.04), (0.11, -0.02), (0.125, 0.02), (0.10, 0.05), (0.05, 0.06)], 14,
        cap_bottom=True, cap_top=True, sx=1.25))
    ag.add("hood_down", bm, "garment", "wool", "cloak", rough=0.95, collide=("all",))

    # Violet scarf: two wraps around the neck over the cloak, puffed rolls.
    def zf(t, th):
        return lerp(1.575 - 0.035 * max(0.0, -math.sin(th)), 1.415, t)

    def rf(t, th):
        return 0.06 + 0.02 * abs(math.sin(2 * math.pi * t + 0.6 * th))
    P, A = vloft(28, 5, zf, rf, 0.92)
    garment(ag, "scarf", P, A, kind="wool", color="scarf", rough=0.9, thick=0.016,
            clear=0.012, push=0.22)
    # Scarf tails: long one down the back (agent's left), short one over the chest.
    path = [(lerp(1.43, 0.52, k / 12), math.radians(lerp(62, 78, k / 12)),
             1.0 + 0.25 * k / 12) for k in range(13)]
    ribbon(ag, "scarf_tail", path, 0.15, "scarf", fray=0.05, seed=4)
    path = [(lerp(1.42, 1.06, k / 6), math.radians(lerp(-118, -108, k / 6)), 1.0)
            for k in range(7)]
    ribbon(ag, "scarf_front", path, 0.12, "scarf", fray=0.03, seed=6)
    # Iris pin: three small petals on the scarf knot (the clan's flower).
    p, d = surface_point(ag, 1.45, math.radians(-110), out=0.004)
    bm = bmesh.new()
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        off = Vector((math.cos(a) * 0.012, 0, math.sin(a) * 0.012))
        ico(bm, p + off + d * 0.006, 0.011, 1, (1.0, 0.55, 1.4))
    ag.add("pin", bm, "ornament", "resin", "gem", rough=0.2, collide=())


def costume_sol(ag):
    """Salt: tiered pale robe with scalloped 'scale' hems, deep hood and veil
    hiding the face, white quartz clusters as shoulder scales, a brass balance
    (trade), a sealed satchel and salt pouches."""
    build_body(ag)
    robe(ag, "robe", 1.48, 0.06, 0.04, 0.27, n=40, rows=14, depth=0.85, flare=1.8,
         color="cloth", against="core", push=0.05, clear=0.014)
    for k, (zt, zb, amp) in enumerate(((1.02, 0.36, 0.05), (1.18, 0.64, 0.045),
                                       (1.34, 0.92, 0.04))):
        robe(ag, f"tier_{k}", zt, zb, 0.05, 0.30 - 0.02 * k, n=40, rows=5, depth=0.86,
             flare=1.2, hem=hem_scallop(10, amp, phase=0.3 * k), color="tier", push=0.18)
    sleeve(ag, "sleeve_l", 1, 0.075, 0.11, color="cloth", end_drop=0.06)
    sleeve(ag, "sleeve_r", -1, 0.075, 0.11, color="cloth", end_drop=0.06)
    band(ag, "belt", 1.02, 1.07, color="leather", kind="leather")
    hood(ag, "hood", rad=0.140, open_w=0.42, open_top=0.70, open_bot=1.70, tip=0.55,
         tip_dir=(0, 0.35, 0.95), cowl_r=0.25, cowl_z=1.33, color="hood",
         hem=hem_scallop(8, 0.05, phase=0.2))
    # Veil across the lower face (something hidden).
    hc = Vector(BODY["head_c"])
    bm = bmesh.new()
    rows = []
    for v in range(4):
        z = lerp(1.62, 1.50, v / 3)
        row = []
        for i in range(9):
            th = math.radians(-90 - 62 + 124 * i / 8)
            r = 0.118 + 0.012 * v
            row.append(bm.verts.new((hc.x + r * math.cos(th),     # front bulge clears the nose
                                     hc.y + 0.02 + r * (0.95 + 0.17 * math.sin(th) ** 8) *
                                     math.sin(th), z)))
        rows.append(row)
    grid_faces(bm, rows, False)
    orient_outward(bm, lambda c: Vector((hc.x, hc.y, c.z)))
    ag.add("veil", bm, "garment", "cloth", "veil", rough=0.9, solid=0.004, collide=())
    # Shoulder plates the crystals grow from (scale armour).
    pl = bmesh.new()
    for side in (-1, 1):
        for k in range(3):
            c = Vector((side * (0.17 + 0.05 * k), 0.0, 1.455 - 0.035 * k))
            placed(pl, frame(c, (side * 0.45, 0, 1.0)), lambda b, k=k: revolve(
                b, [(0.11 - 0.015 * k, 0.0), (0.095 - 0.015 * k, 0.025), (0.04, 0.04)], 8,
                cap_bottom=True, cap_top=True, sy=0.9))
    ag.add("shoulder_plates", pl, "ornament", "crystal", "crystal2", rough=0.3, collide=())
    # Quartz clusters fanning up and out over each shoulder.
    rnd = random.Random(7)
    cr = bmesh.new()
    for side in (-1, 1):
        sh = Vector((side * 0.20, 0.0, 1.45))
        for k in range(7):
            a = math.radians(-55 + 110 * k / 6) + rnd.uniform(-0.12, 0.12)
            outv = Vector((side * math.cos(a) * 0.9, math.sin(a) * 0.9, 0))
            dirv = (outv * 0.5 + Vector((0, 0, 1.0))).normalized()
            L = 0.15 + 0.11 * math.cos(a) * rnd.uniform(0.7, 1.0)
            crystal(cr, sh + outv * 0.05, dirv, L, 0.034 + 0.010 * rnd.random(),
                    twist=rnd.random(), tip=0.38)
        Ar = arm(side)
        for k in range(4):
            p = Ar["S"] + Ar["dir"] * (0.08 + 0.05 * k) + Vector((0, rnd.uniform(-0.04, 0.04), 0.07))
            crystal(cr, p, Vector((side * 1.0, rnd.uniform(-0.3, 0.3), 0.8)).normalized(),
                    0.08 + 0.03 * rnd.random(), 0.018, twist=rnd.random())
    ag.add("crystals", cr, "ornament", "crystal", "crystal", rough=0.18, collide=())
    balance(ag, 1, color="brass")
    # Satchel on the right hip, sealed with a brass clasp; salt pouches on the belt.
    p, d = surface_point(ag, 0.93, math.radians(160))
    M = basis(Vector((-d.y, d.x, 0)), -d, (0, 0, 1), p + d * 0.05)
    strap = [surface_point(ag, lerp(1.40, 1.0, k / 10), math.radians(lerp(10, -200, k / 10)),
                           out=0.010)[0] for k in range(11)]
    sbm = bmesh.new()
    tube(sbm, strap, 0.012, 4, phase=math.pi / 4)
    ag.add("satchel_strap", sbm, "ornament", "leather", "leather", rough=0.6, collide=())
    bm = bmesh.new()
    box(bm, (0, 0, 0), (0.20, 0.08, 0.16), M)
    box(bm, (0, -0.042, 0.035), (0.205, 0.012, 0.10), M)
    ag.add("satchel", bm, "ornament", "leather", "leather", rough=0.6, collide=())
    bm = bmesh.new()
    box(bm, (0, -0.052, 0.01), (0.04, 0.012, 0.035), M)
    ag.add("clasp", bm, "ornament", "metal", "brass", rough=0.3, metal=1.0, collide=())
    for k, th in enumerate((math.radians(-60), math.radians(-35), math.radians(120))):
        p, d = surface_point(ag, 1.0, th)
        bm = bmesh.new()
        placed(bm, frame(p + d * 0.045, (0, 0, 1)), lambda b: revolve(
            b, [(0.0, -0.10), (0.04, -0.085), (0.05, -0.05), (0.035, -0.012), (0.018, 0.0),
                (0.024, 0.02), (0.0, 0.025)], 8))
        ag.add(f"pouch_{k}", bm, "ornament", "leather", "cord", rough=0.85, collide=())


def costume_pepel(ag):
    """Ash: soot-black layered tunic with a ragged burnt hem, wrapped arms, a
    low hood and scarf, a palisade collar of charred stakes and a stake shield."""
    build_body(ag, hair=(0.030, 0.026, 0.024))       # soot-dark crop under the low hood
    robe(ag, "tunic", 1.48, 0.20, 0.04, 0.24, n=32, rows=12, depth=0.85, flare=1.5,
         hem=hem_jagged(3, 32, 0.10), color="cloth", against="core", push=0.05, clear=0.014)
    robe(ag, "coat", 1.40, 0.42, 0.06, 0.30, n=32, rows=9, depth=0.88, flare=1.3,
         hem=hem_jagged(11, 32, 0.16), opening=0.22, color="coat", push=0.16)
    sleeve(ag, "sleeve_l", 1, 0.068, 0.062, color="wrap", rough=0.95, bell=1.0)
    sleeve(ag, "sleeve_r", -1, 0.068, 0.062, color="wrap", rough=0.95, bell=1.0)
    for side in (-1, 1):
        bm = bmesh.new()
        Ar = arm(side)
        for k in range(4):
            c = Ar["E"] + (Ar["W"] - Ar["E"]) * (0.2 + 0.2 * k)
            torus(bm, c, 0.076, 0.009, n=12, m=4, M=frame((0, 0, 0), Ar["dir"]))
        ag.add(f"wraps_{side}", bm, "garment", "cloth", "wrap", rough=0.95, collide=())
    band(ag, "belt", 1.00, 1.06, color="rope", kind="leather", rough=0.9)
    hood(ag, "hood", rad=0.132, open_w=0.70, open_top=0.40, open_bot=1.85, tip=0.0,
         cowl_r=0.23, cowl_z=1.40, color="hood")
    hc = Vector(BODY["head_c"])
    P, A = vloft(18, 3, lambda t, th: lerp(1.625, 1.50, t), lambda t, th: 0.05, 0.95)
    for arow in A:
        for a in arow:
            a.y = hc.y
    ag.add_collider_bm(("all",), face_head_bm())      # the scarf rides over the nose
    garment(ag, "scarf", P, A, color="wrap", rough=0.95, thick=0.010, clear=0.012, push=0.15)
    # Palisade collar: ring of charred stakes leaning out, taller at the back.
    rnd = random.Random(13)
    st = bmesh.new()
    count = 13
    for k in range(count):
        th = -math.pi / 2 + 2 * math.pi * (k + 0.5) / count
        back = (math.sin(th) + 1) / 2              # 0 front .. 1 back
        if back < 0.18:
            continue                               # keep the face open
        out = Vector((math.cos(th), math.sin(th) * 0.9, 0))
        dirv = (out * (0.45 + 0.1 * rnd.random()) + Vector((0, 0, 1))).normalized()
        L = 0.30 + 0.30 * back + rnd.uniform(-0.04, 0.04)
        stake(st, Vector((0, 0, 1.30)) + out * 0.25, dirv, L, 0.024 + 0.004 * rnd.random(),
              rnd=rnd)
    ag.add("palisade", st, "ornament", "wood", "wood", rough=0.9, collide=())
    bm = bmesh.new()
    pts = [Vector((0, 0, 1.40)) + Vector((math.cos(a), math.sin(a) * 0.9, 0)) * 0.295
           for a in (math.radians(lerp(-22, 202, i / 30)) for i in range(31))]
    tube(bm, pts, 0.011, 5)
    ag.add("binding", bm, "ornament", "leather", "rope", rough=0.9, collide=())
    # Palisade shield on the left forearm: five stakes lashed with two iron bars.
    Ar = arm(1)
    c = Ar["E"] + (Ar["W"] - Ar["E"]) * 0.5 + Vector((0.075, -0.02, 0))
    nrm = Vector((1, -0.35, 0.0)).normalized()
    up = Vector((0, 0, 1))
    sidev = up.cross(nrm).normalized()
    sh = bmesh.new()
    for k in range(5):
        base = c + sidev * ((k - 2) * 0.062) + up * (-0.30 + 0.02 * abs(k - 2)) + nrm * 0.01
        stake(sh, base, up, 0.66 - 0.05 * abs(k - 2), 0.030, rnd=rnd, tip=0.16)
    ag.add("shield", sh, "ornament", "wood", "wood2", rough=0.9, collide=())
    bm = bmesh.new()
    for zz in (-0.14, 0.12):
        M = basis(sidev, nrm, up, c + up * zz + nrm * 0.045)
        box(bm, (0, 0, 0), (0.34, 0.028, 0.04), M)
    ag.add("shield_bars", bm, "ornament", "metal", "iron", rough=0.55, metal=0.9, collide=())

def costume_moh(ag):
    """Moss: open, soft and alive. Earthy tunic, a two-layer cloak with a soft
    lumpy hem, moss clumps and mushrooms growing on the shoulders, the hood down,
    and a shared cauldron carried in the left hand."""
    build_body(ag)
    robe(ag, "tunic", 1.47, 0.14, 0.04, 0.25, n=32, rows=12, depth=0.85, flare=1.8,
         pleats=8, pleat_amp=0.04, color="tunic", against="core", push=0.05, clear=0.014)
    sleeve(ag, "sleeve_l", 1, 0.075, 0.12, color="cloth", end_drop=0.03)
    sleeve(ag, "sleeve_r", -1, 0.075, 0.12, color="cloth", end_drop=0.03)
    band(ag, "belt", 1.00, 1.06, color="rope", kind="leather", rough=0.9)

    def soft(amp, k, ph):
        return lambda th: -amp * (0.5 + 0.5 * math.sin(th * k + ph))
    mantle(ag, "cloak", 1.50, 0.075, 0.78, 0.34, n=36, rows=12, depth=0.92,
           hem=soft(0.08, 7, 0.4), front_short=0.30, back_long=0.38, span=math.radians(250),
           th0=math.radians(-35), color="cloak", kind="wool", rough=0.9, thick=0.010)
    mantle(ag, "capelet", 1.505, 0.075, 0.38, 0.27, n=36, rows=7, depth=0.92,
           hem=soft(0.06, 9, 1.3), front_short=0.10, spread=1.0, color="cloak2", kind="wool",
           rough=0.9, thick=0.010)
    p, d = surface_point(ag, 1.43, math.pi / 2)
    bm = bmesh.new()
    placed(bm, frame(p + d * 0.02 + Vector((0, 0, 0.02)), (0, 0.6, 1.0)), lambda b: revolve(
        b, [(0.09, -0.03), (0.13, 0.0), (0.14, 0.04), (0.11, 0.07), (0.05, 0.08)], 12,
        cap_bottom=True, cap_top=True, sx=1.25))
    ag.add("hood_down", bm, "garment", "wool", "cloak", rough=0.9, collide=("all",))
    hair(ag, "hair", "hair", length_back=0.10, seed=5, messy=0.018)
    rnd = random.Random(5)
    mo = bmesh.new()
    for k in range(22):
        th = math.radians(-60 + 300 * k / 21) + rnd.uniform(-0.1, 0.1)
        z = 1.40 + rnd.uniform(-0.06, 0.05) - 0.10 * max(0.0, math.sin(th))
        p, d = surface_point(ag, z, th)
        ico(mo, p + Vector((0, 0, 0.01)), rnd.uniform(0.030, 0.050), 1,
            (1.2, 1.2, 0.55 + 0.2 * rnd.random()))
    ag.add("moss", mo, "ornament", "moss", "moss", rough=0.95, collide=())
    mu, st = bmesh.new(), bmesh.new()
    for side, zz, s in ((1, 1.47, 1.0), (1, 1.45, 0.7), (-1, 1.46, 0.85), (-1, 1.44, 0.55)):
        p, d = surface_point(ag, zz - 0.02, math.radians(90 - 70 * side) + rnd.uniform(-0.3, 0.3))
        up = (Vector((0, 0, 1)) + d * 0.3).normalized()
        placed(st, frame(p, up), lambda b, s=s: revolve(
            b, [(0.010 * s, 0), (0.008 * s, 0.05 * s), (0.007 * s, 0.075 * s)], 6))
        placed(mu, frame(p + up * 0.075 * s, up), lambda b, s=s: revolve(
            b, [(0.008 * s, -0.004), (0.045 * s, 0.0), (0.040 * s, 0.018 * s),
                (0.020 * s, 0.032 * s), (0.0, 0.036 * s)], 10, cap_bottom=True))
    ag.add("mushroom_caps", mu, "ornament", "felt", "cap", rough=0.7, collide=())
    ag.add("mushroom_stems", st, "ornament", "felt", "stem", rough=0.7, collide=())
    lv = bmesh.new()
    for k in range(8):
        th = math.radians(60 + 60 * (k % 4) - (180 if k >= 4 else 0) + rnd.uniform(-15, 15))
        p, d = surface_point(ag, 1.42 + rnd.uniform(-0.04, 0.03), th)
        up = (Vector((0, 0, 1)) + d * 0.8).normalized()
        petal(lv, p, up, up.cross(d).normalized(), d, 0.10, 0.05, cup=0.4, curl=0.25, nl=4, nw=2)
    finish_sheet(lv)
    ag.add("leaves", lv, "ornament", "moss", "leaf", rough=0.8, solid=0.003, collide=())
    # Cauldron hanging from the left hand by its bail; ladle tucked in the belt.
    g = arm(1)["grip"]
    pot_c = g + Vector((0.03, -0.02, -0.25))
    bm = bmesh.new()
    placed(bm, Matrix.Translation(pot_c), lambda b: revolve(b, [
        (0.03, -0.10), (0.085, -0.085), (0.12, -0.035), (0.125, 0.01), (0.11, 0.05),
        (0.118, 0.065), (0.112, 0.072), (0.10, 0.06), (0.09, 0.0), (0.0, -0.06)], 16))
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        tube(bm, [pot_c + Vector((0.09 * math.cos(a), 0.09 * math.sin(a), -0.08)),
                  pot_c + Vector((0.10 * math.cos(a), 0.10 * math.sin(a), -0.14))], 0.011, 5)
    ag.add("cauldron", bm, "ornament", "metal", "pot", rough=0.7, metal=0.8, collide=())
    bm = bmesh.new()
    arc = [pot_c + Vector((0.12 * math.cos(a), 0, 0.07 + 0.19 * math.sin(a)))
           for a in (math.pi * i / 10 for i in range(11))]
    tube(bm, arc, 0.006, 5)
    torus(bm, pot_c + Vector((0, 0, 0.068)), 0.115, 0.007, n=18, m=4)
    ag.add("bail", bm, "ornament", "metal", "copper", rough=0.4, metal=1.0, collide=())
    p, d = surface_point(ag, 1.02, math.radians(-120))
    bm = bmesh.new()
    tube(bm, [p + d * 0.03 + Vector((0, 0, -0.18)), p + d * 0.035 + Vector((0, 0, 0.16))], 0.010, 6)
    placed(bm, Matrix.Translation(p + d * 0.06 + Vector((0, 0, -0.21))), lambda b: revolve(
        b, [(0.0, -0.03), (0.035, -0.02), (0.045, 0.01), (0.04, 0.02)], 10))
    ag.add("ladle", bm, "ornament", "wood", "wood", rough=0.7, collide=())


def costume_yantar(ag):
    """Amber: warm layered merchant's coat with a high collar, flat-brimmed hat,
    a strong-box chest on the back, padlocks on the belt and a ring of keys in
    the hand: everything has a price."""
    build_body(ag)
    robe(ag, "robe", 1.48, 0.07, 0.04, 0.26, n=36, rows=13, depth=0.86, flare=1.9,
         color="cloth", against="core", push=0.05, clear=0.014)
    robe(ag, "coat", 1.47, 0.30, 0.05, 0.33, n=36, rows=11, depth=0.88, flare=1.6,
         opening=0.28, pleats=10, pleat_amp=0.05, color="coat", push=0.14)
    sleeve(ag, "sleeve_l", 1, 0.078, 0.10, color="coat", end_drop=0.02)
    sleeve(ag, "sleeve_r", -1, 0.078, 0.10, color="coat", end_drop=0.02)
    for side in (-1, 1):
        bm = bmesh.new()
        Ar = arm(side)
        torus(bm, Ar["W"] - Ar["dir"] * 0.01, 0.092, 0.016, n=14, m=5, M=frame((0, 0, 0), Ar["dir"]))
        ag.add(f"cuff_{side}", bm, "garment", "cloth", "lining", rough=0.7, collide=())
    band(ag, "belt", 1.00, 1.07, color="leather", kind="leather", thick=0.014)
    P, A = vloft(28, 3, lambda t, th: lerp(1.60 - 0.03 * max(0, -math.sin(th)), 1.45, t),
                 lambda t, th: lerp(0.10, 0.075, t), 0.92, th0=-math.pi / 2 + 0.45,
                 span=2 * math.pi - 0.9, closed=False)
    garment(ag, "collar", P, A, color="lining", closed=False, thick=0.010, push=0.06, clear=0.012)
    hc = Vector(BODY["head_c"])
    bm = bmesh.new()
    placed(bm, Matrix.Translation(hc + Vector((0, 0.005, 0.045))), lambda b: revolve(
        b, [(0.0, 0.0), (0.20, 0.0), (0.205, 0.012), (0.115, 0.022), (0.108, 0.075),
            (0.095, 0.098), (0.0, 0.10)], 16))
    ag.add("hat", bm, "garment", "felt", "hat", rough=0.8, collide=("all",))
    bm = bmesh.new()
    torus(bm, hc + Vector((0, 0.005, 0.08)), 0.111, 0.010, n=16, m=4)
    ag.add("hat_band", bm, "ornament", "metal", "brass", rough=0.35, metal=1.0, collide=())
    # Strong-box chest on the back with brass bands and a padlock.
    cc = Vector((0, 0.27, 1.20))
    bm = bmesh.new()
    box(bm, cc, (0.40, 0.22, 0.28))
    placed(bm, Matrix.Translation(cc + Vector((0, 0, 0.14))) @ Matrix.Rotation(math.pi / 2, 4, "Y"),
           lambda b: revolve(b, [(0.11, -0.20), (0.11, 0.20)], 12, cap_bottom=True,
                             cap_top=True, sx=0.55))
    ag.add("chest", bm, "ornament", "wood", "wood", rough=0.7, collide=("all",))
    bm = bmesh.new()
    for x in (-0.15, 0.0, 0.15):
        box(bm, cc + Vector((x, 0, 0)), (0.03, 0.23, 0.285))
        pts = [cc + Vector((x, 0.115 * math.cos(a), 0.14 + 0.065 * math.sin(a)))
               for a in (math.pi * i / 8 for i in range(9))]
        tube(bm, pts, 0.012, 4, phase=math.pi / 4)
    for x in (-1, 1):
        for y in (-1, 1):
            box(bm, cc + Vector((0.2 * x, 0.11 * y, -0.13)), (0.05, 0.05, 0.04))
    ag.add("chest_bands", bm, "ornament", "metal", "brass", rough=0.35, metal=1.0, collide=())
    for side in (-1, 1):
        pts = []
        for k in range(9):
            t = k / 8
            th = lerp(math.radians(90 - 30 * side), math.radians(-90 + 55 * side), t)
            z = lerp(1.36, 1.15, t) + 0.12 * math.sin(math.pi * t)
            pts.append(surface_point(ag, z, th, out=0.012)[0])
        bm = bmesh.new()
        tube(bm, pts, 0.014, 4, phase=math.pi / 4)
        ag.add(f"strap_{side}", bm, "ornament", "leather", "leather", rough=0.6, collide=())

    def padlock(bm_body, bm_shackle, c, s=1.0, facing=(0, -1, 0)):
        f = Vector(facing).normalized()
        M = frame(c, (0, 0, 1), xhint=f.cross(Vector((0, 0, 1))))
        box(bm_body, (0, 0, 0), (0.06 * s, 0.03 * s, 0.05 * s), M)
        pts = [M @ Vector((0.019 * s * math.cos(a), 0, 0.025 * s + 0.03 * s * math.sin(a)))
               for a in (math.pi * i / 8 for i in range(9))]
        tube(bm_shackle, pts, 0.0055 * s, 5)
    lb, ls = bmesh.new(), bmesh.new()
    padlock(lb, ls, cc + Vector((0, 0.13, 0.02)), 1.3, (0, 1, 0))
    for k, th in enumerate((math.radians(-60), math.radians(-120), math.radians(-160),
                            math.radians(-20))):
        p, d = surface_point(ag, 0.97 - 0.02 * (k % 2), th)
        padlock(lb, ls, p + d * 0.03 + Vector((0, 0, -0.03)), 1.0, d)
        tube(ls, [p + d * 0.012 + Vector((0, 0, 0.05)), p + d * 0.03], 0.004, 4)
    ag.add("padlocks", lb, "ornament", "metal", "iron", rough=0.5, metal=1.0, collide=())
    ag.add("shackles", ls, "ornament", "metal", "brass", rough=0.3, metal=1.0, collide=())
    # Ring of three large keys in the left hand.
    g = arm(1)["grip"]
    ring_c = g + Vector((0.01, -0.02, -0.05))
    bm = bmesh.new()
    torus(bm, ring_c, 0.045, 0.006, n=16, m=4, M=Matrix.Rotation(math.pi / 2, 4, "X"))
    for k in range(3):
        a = math.radians(-90 + (k - 1) * 28)
        dirv = Vector((math.cos(a), 0, math.sin(a)))
        bow = ring_c + dirv * 0.07
        torus(bm, bow, 0.02, 0.006, n=10, m=4, M=frame((0, 0, 0), (0, 1, 0)))
        end = bow + dirv * 0.16
        tube(bm, [bow + dirv * 0.02, end], 0.006, 6)
        side = Vector((0, -1, 0)) if k % 2 else Vector((0, 1, 0))
        box(bm, (0, 0, 0), (0.012, 0.03, 0.03),
            basis(dirv.cross(side).normalized(), side, dirv, end - dirv * 0.02 + side * 0.015))
    ag.add("keys", bm, "ornament", "metal", "brass", rough=0.3, metal=1.0, collide=())
    gm = bmesh.new()
    for z, th in ((1.30, math.radians(-75)), (1.30, math.radians(-105)), (1.035, math.radians(-90))):
        p, d = surface_point(ag, z, th)
        ico(gm, p + d * 0.01, 0.022, 1, (1.0, 0.6, 1.25))
    ag.add("gems", gm, "ornament", "resin", "amber", rough=0.1, collide=())


def costume_iney(ag):
    """Frost: tall faceted hood ending in a point, crisp mantle with an icicle
    hem, long pleated robe, an armillary staff of glass rings, a lens arm in
    front of the eye and a slate tablet of signs at the hip."""
    build_body(ag, hair=(0.74, 0.77, 0.82))          # frost-white crop
    robe(ag, "robe", 1.48, 0.04, 0.04, 0.25, n=40, rows=14, depth=0.82, flare=2.0,
         pleats=14, pleat_amp=0.07, color="robe", against="core", push=0.05, clear=0.014)
    sleeve(ag, "sleeve_l", 1, 0.072, 0.13, color="cloth", end_drop=0.10, bell=2.4)
    sleeve(ag, "sleeve_r", -1, 0.072, 0.13, color="cloth", end_drop=0.10, bell=2.4)
    band(ag, "belt", 1.02, 1.065, color="silver", kind="metal", rough=0.3, metal=1.0)
    mantle(ag, "mantle", 1.50, 0.075, 0.46, 0.33, n=40, rows=9, depth=0.9,
           hem=hem_points(10, 0.14, phase=0.5), front_short=0.10, back_long=0.12,
           color="mantle", rough=0.65, thick=0.009)
    hood(ag, "hood", rad=0.138, open_w=0.66, open_top=0.42, open_bot=1.80, tip=1.55,
         tip_dir=(0, 0.42, 0.90), tip_pow=5.0, cowl_r=0.23, cowl_z=1.43, n=24, rows=16,
         color="hood", rough=0.7)
    hc = Vector(BODY["head_c"])
    bm = bmesh.new()
    lens_c = hc + Vector((0.035, -0.125, 0.012))
    torus(bm, lens_c, 0.024, 0.004, n=16, m=4, M=Matrix.Rotation(math.pi / 2, 4, "X"))
    tube(bm, [lens_c + Vector((0.024, 0, 0)), hc + Vector((0.12, -0.06, 0.02)),
              hc + Vector((0.14, 0.0, 0.02))], 0.0035, 4)
    ag.add("lens_frame", bm, "ornament", "metal", "silver", rough=0.25, metal=1.0, collide=())
    gl = bmesh.new()
    placed(gl, Matrix.Translation(lens_c) @ Matrix.Rotation(math.pi / 2, 4, "X"),
           lambda b: revolve(b, [(0.0, -0.003), (0.022, -0.002), (0.022, 0.002), (0.0, 0.003)], 16))
    g = arm(1)["grip"]
    sx, sy = g.x + 0.01, g.y - 0.01
    bm = bmesh.new()
    tube(bm, [(sx, sy, 0.0), (sx, sy, 1.70)], 0.014, 6)
    placed(bm, Matrix.Translation((sx, sy, 1.70)), lambda b: revolve(
        b, [(0.016, 0.0), (0.03, 0.02), (0.012, 0.05)], 8))
    ag.add("staff", bm, "ornament", "metal", "silver", rough=0.3, metal=1.0, collide=())
    sc = Vector((sx, sy, 1.86))
    rings = bmesh.new()
    torus(rings, sc, 0.13, 0.006, n=28, m=4)
    torus(rings, sc, 0.13, 0.006, n=28, m=4, M=Matrix.Rotation(math.radians(70), 4, "X"))
    torus(rings, sc, 0.13, 0.006, n=28, m=4,
          M=Matrix.Rotation(math.radians(60), 4, "Z") @ Matrix.Rotation(math.radians(80), 4, "X"))
    torus(rings, sc, 0.105, 0.005, n=24, m=4, M=Matrix.Rotation(math.radians(-35), 4, "Y"))
    tube(rings, [sc + Vector((0, 0, -0.16)), sc + Vector((0, 0, 0.16))], 0.005, 4)
    ag.add("armillary", rings, "ornament", "metal", "silver", rough=0.25, metal=1.0, collide=())
    ico(gl, sc, 0.055, 2)
    ag.add("glass", gl, "ornament", "glass", "glass", rough=0.06, collide=())
    # Tablet of signs hanging at the right hip.
    p, d = surface_point(ag, 0.86, math.radians(-150))
    up = Vector((0, 0, 1))
    sidev = up.cross(d).normalized()
    M = basis(sidev, d, up, p + d * 0.035)
    bm = bmesh.new()
    box(bm, (0, 0, 0), (0.20, 0.022, 0.28), M)
    ag.add("tablet", bm, "ornament", "stone", "slate", rough=0.8, collide=())
    sg = bmesh.new()
    for i in range(2):
        for j in range(3):
            c = M @ Vector((-0.05 + 0.10 * i, 0.013, 0.085 - 0.085 * j))
            torus(sg, c, 0.026, 0.0035, n=14, m=3, M=frame((0, 0, 0), d))
            for q in range(4):                     # a 4-slot sign
                a = math.pi / 2 * q + 0.4 * (i + j)
                dv = sidev * math.cos(a) + up * math.sin(a)
                tube(sg, [c + dv * 0.030, c + dv * 0.040], 0.003, 3)
    ag.add("signs", sg, "ornament", "glass", "sign", rough=0.2, collide=())
    bm = bmesh.new()
    tube(bm, [M @ Vector((-0.08, 0, 0.14)), p + Vector((0, 0, 0.14)) + d * 0.01,
              M @ Vector((0.08, 0, 0.14))], 0.004, 4)
    ag.add("tablet_cord", bm, "ornament", "leather", "cord", rough=0.8, collide=())
    vb, vc = bmesh.new(), bmesh.new()
    for th in (math.radians(-50), math.radians(-30), math.radians(-10)):
        p, d = surface_point(ag, 1.0, th)
        base = p + d * 0.022 + Vector((0, 0, -0.07))
        placed(vb, Matrix.Translation(base), lambda b: revolve(
            b, [(0.0, 0.0), (0.016, 0.004), (0.017, 0.08), (0.008, 0.095)], 8))
        placed(vc, Matrix.Translation(base + Vector((0, 0, 0.095))), lambda b: revolve(
            b, [(0.010, 0.0), (0.011, 0.02), (0.0, 0.022)], 8, cap_bottom=True))
    ag.add("vials", vb, "ornament", "glass", "glass2", rough=0.05, collide=())
    ag.add("vial_caps", vc, "ornament", "metal", "silver", rough=0.3, metal=1.0, collide=())


PALETTES["suit"] = {
    "suit": (0.040, 0.041, 0.045), "skin": (0.40, 0.34, 0.31), "armor": (0.520, 0.530, 0.530),
    "armor2": (0.400, 0.410, 0.415), "joint": (0.070, 0.072, 0.078), "visor": (0.020, 0.024, 0.030),
    "pack": (0.300, 0.310, 0.310), "strap": (0.060, 0.060, 0.065), "light": (0.550, 0.200, 1.000),
}


def costume_suit(ag):
    """Shell suit (owner addition 07.11): worn when entering a Shell. Light-grey
    segmented armour over a dark under-layer, rounded helmet with a dark visor,
    compact backpack with a thin status light strip. The strip is its own
    emissive material (M_Suit_Light) so code can recolour it per clan."""
    build_body(ag)
    ag.emissive = {"slot": "ornament", "name": "Light", "color": ag.pal["light"], "strength": 4.0}

    def plate(name, S, W, r0, r1, n=12, rows=3, color="armor", clear=0.012, thick=0.014):
        axis_tube(ag, name, S, W, r0, r1, n=n, rows=rows, bell=1.0, kind="armor",
                  color=color, rough=0.45, thick=thick, clear=clear)

    # Torso: chest and back plates, three abdomen bands with gaps between them.
    P, A = vloft(20, 4, lambda t, th: lerp(1.43, 1.13, t), lambda t, th: 0.05, 0.9,
                 th0=math.radians(-90 - 75), span=math.radians(150), closed=False)
    garment(ag, "chest_plate", P, A, kind="armor", color="armor", rough=0.45, thick=0.018,
            clear=0.014, push=0.20, closed=False)
    P, A = vloft(20, 4, lambda t, th: lerp(1.43, 1.10, t), lambda t, th: 0.05, 0.9,
                 th0=math.radians(90 - 70), span=math.radians(140), closed=False)
    garment(ag, "back_plate", P, A, kind="armor", color="armor2", rough=0.45, thick=0.018,
            clear=0.014, push=0.20, closed=False)
    for k, (z0, z1) in enumerate(((1.035, 1.085), (0.98, 1.025), (0.90, 0.965))):
        band(ag, f"abdomen_{k}", z0, z1, n=24, color="armor2" if k == 2 else "armor",
             kind="armor", rough=0.45, thick=0.014, clear=0.010, slot="garment")
    # Limbs: segmented plates with dark joints showing between them.
    for side in (-1, 1):
        Ar = arm(side)
        S, E, W = Ar["S"], Ar["E"], Ar["W"]
        plate(f"upper_arm_{side}", S + (E - S) * 0.30, S + (E - S) * 0.85, 0.060, 0.056)
        plate(f"forearm_{side}", E + (W - E) * 0.18, W + (W - E) * 0.02, 0.054, 0.048, rows=4)
        bm = bmesh.new()
        ico(bm, E + Vector((0, 0.02, 0)) + Vector((side * 0.012, 0, 0)), 0.05, 1, (1.0, 1.1, 1.0))
        ag.add(f"elbow_{side}", bm, "garment", "armor", "armor2", rough=0.45, collide=("all",))
        bm = bmesh.new()
        placed(bm, frame(S + Vector((side * 0.025, 0, 0.035)), (side * 0.55, 0, 1.0)),
               lambda b: revolve(b, [(0.088, -0.045), (0.092, -0.01), (0.084, 0.025),
                                     (0.062, 0.05), (0.03, 0.064), (0.0, 0.067)], 14,
                                 cap_bottom=True, sy=0.95))
        gb = bmesh.new()
        placed(gb, frame(Ar["palm"] + Ar["dir"] * 0.02, Ar["dir"], xhint=Ar["inward"]),
               lambda b: ico(b, (0, 0, 0), 1.0, 1, (0.028, 0.050, 0.075)))
        ag.add(f"glove_{side}", gb, "body", "leather", "joint", rough=0.6, collide=())
        ag.add(f"pauldron_{side}", bm, "garment", "armor", "armor", rough=0.45,
               collide=("all",))
        L = leg(side)
        H, K, Ak = L["H"], L["K"], L["A"]
        plate(f"thigh_{side}", H + (K - H) * 0.18, H + (K - H) * 0.82, 0.098, 0.074, rows=4)
        plate(f"shin_{side}", K + (Ak - K) * 0.12, K + (Ak - K) * 0.72, 0.074, 0.060, rows=4)
        plate(f"boot_{side}", K + (Ak - K) * 0.76, Ak + Vector((0, 0, -0.06)), 0.066, 0.072,
              rows=3, color="armor2", thick=0.016)
        bm = bmesh.new()
        box(bm, (0, 0, 0), (0.105, 0.17, 0.07),
            basis((1, 0, 0), (0, 1, 0), (0, 0, 1), Vector((side * 0.12, -0.075, 0.035))))
        ag.add(f"boot_toe_{side}", bm, "garment", "armor", "armor2", rough=0.45, collide=())
        bm = bmesh.new()
        ico(bm, K + Vector((0, -0.065, 0.0)), 0.058, 1, (1.0, 0.65, 1.15))
        ag.add(f"knee_{side}", bm, "garment", "armor", "armor2", rough=0.45, collide=("all",))
    band(ag, "belt", 0.86, 0.90, n=28, color="strap", kind="leather", rough=0.6, thick=0.016,
         slot="garment")      # the ornament slot is reserved for the light strip
    for k, th in enumerate((math.radians(-55), math.radians(-125), math.radians(-20),
                            math.radians(200))):
        p, d = surface_point(ag, 0.86, th)
        bm = bmesh.new()
        box(bm, (0, 0, 0), (0.08, 0.045, 0.085),
            basis(Vector((-d.y, d.x, 0)), d, (0, 0, 1), p + d * 0.024 + Vector((0, 0, -0.01))))
        ag.add(f"pouch_{k}", bm, "garment", "leather", "strap", rough=0.6, collide=())
    # Helmet: rounded shell, dark visor band, neck ring.
    hc = Vector(BODY["head_c"]) + Vector((0, 0.008, 0.012))
    bm = bmesh.new()
    vs = ico(bm, hc, 1.0, 3, (0.128, 0.142, 0.150))
    cut = [f for f in bm.faces if f.calc_center_median().z < hc.z - 0.085]
    bmesh.ops.delete(bm, geom=cut, context="FACES")
    ag.add("helmet", bm, "garment", "armor", "armor", rough=0.4, solid=0.012, collide=("all",))
    bm = bmesh.new()
    rows = []
    for v in range(5):
        phi = math.radians(lerp(68, 112, v / 4))
        row = []
        for i in range(13):
            th = math.radians(-90 - 62 + 124 * i / 12)
            d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
            row.append(bm.verts.new(hc + Vector((d.x * 0.134, d.y * 0.150, d.z * 0.155))))
        rows.append(row)
    grid_faces(bm, rows, False)
    orient_outward(bm, lambda c: hc)
    ag.add("visor", bm, "body", "glass", "visor", rough=0.08, solid=0.008, collide=())
    bm = bmesh.new()
    torus(bm, Vector((0, 0.004, 1.505)), 0.082, 0.018, n=20, m=6)
    ag.add("neck_ring", bm, "garment", "armor", "armor2", rough=0.45, collide=())
    # Backpack: compact rounded box, side canisters, handle, shoulder straps.
    pc = Vector((0, 0.235, 1.215))
    bm = bmesh.new()
    box(bm, pc, (0.30, 0.15, 0.36))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.022, segments=2, affect="EDGES")
    ag.add("backpack", bm, "garment", "armor", "pack", rough=0.5, collide=("all",))
    bm = bmesh.new()
    for s in (-1, 1):
        placed(bm, Matrix.Translation(pc + Vector((s * 0.172, 0.0, -0.02))), lambda b: revolve(
            b, [(0.0, -0.13), (0.032, -0.125), (0.036, -0.10), (0.036, 0.10), (0.032, 0.125),
                (0.0, 0.13)], 10))
    tube(bm, [pc + Vector((-0.07, 0.0, 0.18)), pc + Vector((-0.06, 0.0, 0.215)),
              pc + Vector((0.06, 0.0, 0.215)), pc + Vector((0.07, 0.0, 0.18))], 0.009, 6)
    box(bm, pc + Vector((0, 0.081, -0.07)), (0.20, 0.016, 0.12))
    ag.add("backpack_parts", bm, "garment", "armor", "armor2", rough=0.45, collide=())
    for side in (-1, 1):
        pts = [surface_point(ag, lerp(1.40, 1.13, k / 8),
                             math.radians(lerp(90 - 55 * side, -90 + 62 * side, k / 8)),
                             out=0.008)[0] + Vector((0, 0, 0.11 * math.sin(math.pi * k / 8)))
               for k in range(9)]
        bm = bmesh.new()
        tube(bm, pts, 0.013, 4, phase=math.pi / 4)
        ag.add(f"strap_{side}", bm, "garment", "leather", "strap", rough=0.6, collide=())
    # Status light strip: its own emissive primitive and a socket at its centre.
    lc = pc + Vector((0, 0.079, 0.085))
    bm = bmesh.new()
    box(bm, lc, (0.20, 0.010, 0.020))
    ag.add("light_strip", bm, "ornament", "glass", "light", rough=0.2, collide=())
    ag.sockets["socket_backpack_light"] = (lc + Vector((0, 0.006, 0)), {
        "socket": "backpack_light", "note": "centre of the emissive status strip",
        "material": "M_Suit_Light", "strip_size_m": [0.20, 0.02]})


CLANS = [
    # key (file stem = camp name), English name, costume builder
    ("iris", "Iris", costume_iris),
    ("sol", "Salt", costume_sol),
    ("pepel", "Ash", costume_pepel),
    ("moh", "Moss", costume_moh),
    ("yantar", "Amber", costume_yantar),
    ("iney", "Frost", costume_iney),
]


EXTRA = [
    ("suit", "Suit", costume_suit),     # Shell suit, owner addition 07.11
]
ALL = CLANS + EXTRA


def build_agent(key, col):
    title, fn = next((t, f) for k, t, f in ALL if k == key)
    ag = Agent(key, title, PALETTES[key], col)
    fn(ag)
    return ag