"""Procedural source for the six clan camps (camp_<stem>.glb, Forget to Foresee).

Run headless with Blender 4.5 LTS:

    blender -b -P art/camps/build_camps.py -- build [stem ...]    # model, bake, export
    blender -b -P art/camps/build_camps.py -- render [stem ...]   # QA renders of the .glb
    blender -b -P art/camps/build_camps.py -- all [stem ...]

Stems: iris (Iris, the player), sol (Salt), pepel (Ash), moh (Moss), yantar (Amber),
iney (Frost). Each camp is an ~8 x 8 m authored composition on its own base, with a
free 2 m circle in the middle for the agent hologram (`socket_agent`).

Pipeline per camp: parts are generated into one bmesh per surface "kind" (wood,
charred wood, brass, violet cloth, ...), each with a procedural Cycles material.
The parts are joined, every loose part gets a grain axis (PCA) and a random value
as point attributes, the mesh is smart-UV unwrapped into one 4096 atlas, and the
GPU bakes colour / roughness / metallic (emission bakes of the procedural
channels), a tangent normal map (from the shader bump) and AO. The export uses
three materials: M_<Camp>_Atlas, M_<Camp>_AtlasDS (same textures, double sided,
for cloth, leaves and petals) and one special material (emissive glow, quartz or
glass) that is not baked.
"""

import json
import math
import os
import random
import sys
import time
import zlib

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import ftf  # noqa: E402
from ftf import TAU  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(REPO, "game", "public", "assets", "models")
TEX_ROOT = os.path.join(HERE, "textures")
QA_ROOT = os.path.join(REPO, "docs", "art", "qa")

ATLAS = 4096
TRI_BUDGET = 24000
BASE_H = 0.12          # top of the camp base above the plateau
BASE_HALF = 4.0        # superellipse half width (8 x 8 m)
AGENT_R = 1.0          # free hologram circle radius


def log(*a):
    ftf.log("camps", *a)


def sid(s):
    return zlib.crc32(s.encode())


# =================================================================== kinds
# Every kind is a procedural Cycles material used only for baking. type selects
# the node recipe; colours are linear RGB.

KINDS = {
    "wood": dict(t="grain", c=((0.085, 0.062, 0.042), (0.20, 0.155, 0.10), (0.31, 0.25, 0.17)),
                 weather=(0.28, 0.27, 0.24), rough=(0.72, 0.9)),
    "wood_dark": dict(t="charred", c=((0.018, 0.016, 0.015), (0.045, 0.040, 0.036), (0.10, 0.092, 0.085)),
                      rough=(0.7, 0.92)),
    "wood_warm": dict(t="grain", c=((0.16, 0.075, 0.025), (0.36, 0.19, 0.07), (0.56, 0.33, 0.13)),
                      weather=(0.40, 0.25, 0.12), rough=(0.42, 0.62)),
    "stone": dict(t="stone", c=((0.06, 0.07, 0.068), (0.15, 0.165, 0.158), (0.27, 0.285, 0.27)), rough=(0.78, 0.92)),
    "stone_light": dict(t="stone", c=((0.22, 0.23, 0.22), (0.36, 0.37, 0.35), (0.50, 0.50, 0.47)), rough=(0.6, 0.85)),
    "marble": dict(t="marble", c=((0.55, 0.56, 0.54), (0.74, 0.75, 0.73), (0.40, 0.42, 0.42)), rough=(0.32, 0.5)),
    "paving_grey": dict(t="paving", c=((0.16, 0.17, 0.165), (0.30, 0.31, 0.29), (0.05, 0.05, 0.045)),
                        moss=(0.06, 0.09, 0.03), scale=2.3, rough=(0.75, 0.95)),
    "paving_white": dict(t="paving", c=((0.52, 0.53, 0.51), (0.72, 0.72, 0.70), (0.20, 0.20, 0.19)),
                         moss=(0.30, 0.31, 0.28), scale=1.9, rough=(0.45, 0.8)),
    "paving_frost": dict(t="paving", c=((0.30, 0.34, 0.37), (0.48, 0.53, 0.56), (0.12, 0.14, 0.16)),
                         moss=(0.70, 0.76, 0.80), scale=2.1, rough=(0.35, 0.8)),
    "ground_ash": dict(t="ground", c=((0.025, 0.024, 0.023), (0.07, 0.066, 0.062), (0.20, 0.19, 0.18)),
                       speck=(0.30, 0.29, 0.28), rough=(0.85, 0.98)),
    "ground_moss": dict(t="ground", c=((0.03, 0.045, 0.018), (0.07, 0.11, 0.035), (0.16, 0.20, 0.07)),
                        speck=(0.20, 0.17, 0.10), rough=(0.85, 0.98)),
    "deck_warm": dict(t="planks", c=((0.12, 0.06, 0.022), (0.28, 0.15, 0.06), (0.44, 0.26, 0.11)),
                      width=0.24, rough=(0.5, 0.75)),
    "brass": dict(t="metal", c=((0.42, 0.28, 0.10), (0.62, 0.45, 0.20)), patina=(0.12, 0.20, 0.16),
                  rough=(0.25, 0.55)),
    "iron": dict(t="metal", c=((0.035, 0.035, 0.036), (0.09, 0.09, 0.09)), patina=(0.16, 0.07, 0.03),
                 rough=(0.45, 0.8)),
    "pale_metal": dict(t="metal", c=((0.55, 0.58, 0.60), (0.80, 0.83, 0.85)), patina=(0.70, 0.76, 0.80),
                       rough=(0.18, 0.4)),
    "clay": dict(t="clay", c=((0.20, 0.075, 0.03), (0.36, 0.15, 0.065), (0.05, 0.03, 0.02)), rough=(0.6, 0.85)),
    "cloth_violet": dict(t="cloth", c=((0.06, 0.022, 0.12), (0.15, 0.06, 0.29), (0.24, 0.12, 0.40)),
                         rough=(0.82, 0.95), ds=True),
    "cloth_canvas": dict(t="cloth", c=((0.20, 0.17, 0.12), (0.40, 0.35, 0.26), (0.55, 0.50, 0.40)),
                         rough=(0.85, 0.97), ds=True),
    "cloth_cream": dict(t="cloth", c=((0.40, 0.38, 0.33), (0.62, 0.60, 0.54), (0.75, 0.73, 0.68)),
                        rough=(0.85, 0.97), ds=True),
    "cloth_red": dict(t="cloth", c=((0.06, 0.010, 0.008), (0.16, 0.03, 0.02), (0.26, 0.07, 0.04)),
                      rough=(0.85, 0.97), ds=True),
    "rug": dict(t="rug", c=((0.10, 0.04, 0.20), (0.55, 0.48, 0.36), (0.30, 0.10, 0.06)), rough=(0.9, 0.98)),
    "leaf": dict(t="leaf", c=((0.018, 0.04, 0.012), (0.05, 0.10, 0.025), (0.13, 0.20, 0.05)),
                 rough=(0.5, 0.75), ds=True),
    "moss": dict(t="moss", c=((0.03, 0.05, 0.015), (0.08, 0.13, 0.03), (0.18, 0.25, 0.06)), rough=(0.9, 1.0)),
    "petal_violet": dict(t="petal", c=((0.10, 0.03, 0.30), (0.30, 0.10, 0.62), (0.75, 0.62, 0.20)),
                         rough=(0.5, 0.7), ds=True),
    "petal_mix": dict(t="petalmix", c=((0.75, 0.55, 0.08), (0.80, 0.78, 0.72), (0.55, 0.18, 0.35)),
                      rough=(0.5, 0.7), ds=True),
    "rope": dict(t="rope", c=((0.16, 0.12, 0.07), (0.34, 0.27, 0.16)), rough=(0.85, 0.95)),
    "salt": dict(t="salt", c=((0.62, 0.62, 0.60), (0.86, 0.86, 0.84)), rough=(0.45, 0.75)),
    "slate": dict(t="stone", c=((0.020, 0.024, 0.030), (0.045, 0.052, 0.062), (0.08, 0.09, 0.10)), rough=(0.45, 0.65)),
    "shingle_dark": dict(t="shingle", c=((0.012, 0.012, 0.014), (0.035, 0.035, 0.04), (0.08, 0.08, 0.085)),
                         rough=(0.55, 0.85), ds=True),
    "shingle_warm": dict(t="shingle", c=((0.09, 0.045, 0.02), (0.22, 0.12, 0.05), (0.36, 0.22, 0.10)),
                         rough=(0.6, 0.85), ds=True),
    "mushroom": dict(t="clay", c=((0.30, 0.06, 0.03), (0.55, 0.16, 0.06), (0.70, 0.62, 0.50)), rough=(0.4, 0.6)),
    "paper": dict(t="cloth", c=((0.45, 0.40, 0.30), (0.62, 0.56, 0.44), (0.70, 0.65, 0.55)), rough=(0.8, 0.9)),
}


def kind_material(name):
    spec = KINDS[name]
    m = bpy.data.materials.new(f"K_{name}")
    m.use_nodes = True
    k = ftf.NodeKit(m)
    k.n.remove(k.n["Principled BSDF"])
    out = k.n["Material Output"]
    P = k.coord("Object")
    geo = k.geometry()
    g = k.vmath("NORMALIZE", k.attr("grain"))
    prand = k.attr("prand", out="Fac")
    along = k.vmath("DOT_PRODUCT", P, g)
    perp = k.vmath("SUBTRACT", P, k.vmath("SCALE", g, scale=along))
    Q = k.vmath("ADD", perp, k.vmath("SCALE", g, scale=k.math("MULTIPLY", along, 0.07)))
    Qr = k.vmath("ADD", Q, k.combine(k.math("MULTIPLY", prand, 17.0), 0.0, 0.0))
    Pr = k.vmath("ADD", P, k.combine(k.math("MULTIPLY", prand, 13.0), k.math("MULTIPLY", prand, 7.0), 0.0))
    c0, c1 = spec["c"][0], spec["c"][1]
    c2 = spec["c"][2] if len(spec["c"]) > 2 else c1
    r0, r1 = spec["rough"]
    t = spec["t"]
    metal = 0.0
    bump_d = 0.002
    if t == "grain":
        streak = k.noise(Qr, 7.0, 6.0, 0.6)
        fine = k.noise(Qr, 40.0, 3.0, 0.5)
        knots = k.maprange(k.voronoi(Pr, 2.5), 0.06, 0.0)
        tone = k.math("ADD", k.math("MULTIPLY", streak, 0.75), k.math("MULTIPLY", fine, 0.25))
        c = k.ramp(tone, [(0.3, c0), (0.5, c1), (0.72, c2)])
        c = k.mix(k.math("MULTIPLY", knots, 0.6), c, c0)
        wthr = k.maprange(k.noise(Pr, 1.6, 3.0, 0.5), 0.45, 0.7, 0.0, 0.45)
        c = k.mix(wthr, c, spec["weather"])
        c = k.mix(k.maprange(prand, 0, 1, 0.0, 0.25), c, c0)
        rough = k.maprange(fine, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.math("MULTIPLY", streak, 0.6), k.math("MULTIPLY", fine, 0.4))
        h = k.math("SUBTRACT", h, k.math("MULTIPLY", knots, 0.3))
        bump_s = 0.35
    elif t == "charred":
        cr = k.voronoi(k.vmath("SCALE", Qr, scale=1.0), 9.0, "DISTANCE_TO_EDGE")
        crack = k.maprange(cr, 0.0, 0.06, 1.0, 0.0)
        streak = k.noise(Qr, 9.0, 5.0, 0.6)
        c = k.ramp(streak, [(0.35, c0), (0.55, c1), (0.75, c2)])
        c = k.mix(crack, c, (0.006, 0.005, 0.005))
        ember = k.math("MULTIPLY", k.maprange(k.noise(Pr, 3.0, 2.0, 0.5), 0.62, 0.7), 0.25)
        c = k.mix(ember, c, (0.20, 0.12, 0.08))
        rough = k.maprange(streak, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", k.math("MULTIPLY", streak, 0.4), k.math("MULTIPLY", crack, 0.6))
        bump_s = 0.6
    elif t == "stone":
        n1 = k.noise(Pr, 6.0, 8.0, 0.62)
        speck = k.noise(Pr, 50.0, 3.0, 0.5)
        c = k.ramp(n1, [(0.32, c0), (0.55, c1), (0.78, c2)])
        lich = k.maprange(k.noise(Pr, 11.0, 5.0, 0.6), 0.55, 0.64, 0.0, 0.5)
        c = k.mix(lich, c, (0.10, 0.12, 0.07))
        c = k.mix(0.35, c, k.maprange(speck, 0.3, 0.7, 0.8, 1.15), blend="MULTIPLY")
        rough = k.maprange(speck, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.noise(Pr, 120.0, 4.0, 0.6), k.math("MULTIPLY", speck, 0.6))
        bump_s = 0.25
    elif t == "marble":
        n = k.noise(Pr, 2.2, 6.0, 0.6, distortion=2.5)
        vein = k.math("SUBTRACT", 1.0, k.math("ABSOLUTE", k.math("SUBTRACT", k.math("MULTIPLY", n, 2.0), 1.0)))
        vein = k.maprange(vein, 0.88, 0.99)
        cloud = k.noise(Pr, 4.0, 4.0, 0.5)
        c = k.mix(k.maprange(cloud, 0.3, 0.7), c0, c1)
        c = k.mix(k.math("MULTIPLY", vein, 0.7), c, c2)
        rough = k.maprange(cloud, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.math("MULTIPLY", k.noise(Pr, 90.0, 3.0, 0.5), 0.6), k.math("MULTIPLY", vein, -0.3))
        bump_s = 0.12
    elif t == "paving":
        sep = k.separate(P)
        q = k.combine(sep[0], sep[1], 0.0)
        sc = spec["scale"]
        edge = k.voronoi(q, sc, "DISTANCE_TO_EDGE", rand=0.9)
        cell = k.bw(k.voronoi(q, sc, "F1", rand=0.9, out="Color"))
        joint = k.maprange(edge, 0.012, 0.04)
        bev = k.math("SQRT", k.maprange(edge, 0.0, 0.12))
        n = k.noise(P, 9.0, 6.0, 0.55)
        tint = k.mix(cell, c0, c1)
        c = k.mix(0.5, tint, k.maprange(n, 0.3, 0.7, 0.8, 1.15), blend="MULTIPLY")
        mossm = k.maprange(k.noise(P, 4.0, 4.0, 0.6), 0.45, 0.62)
        jc = k.mix(mossm, c2, spec["moss"])
        c = k.mix(k.math("SUBTRACT", 1.0, joint), c, jc)
        rough = k.math("ADD", k.maprange(n, 0.3, 0.7, r0, r0 + 0.1), k.math("MULTIPLY", k.math("SUBTRACT", 1.0, joint), r1 - r0))
        h = k.math("ADD", k.math("MULTIPLY", bev, 0.7), k.math("MULTIPLY", n, 0.2))
        h = k.math("ADD", h, k.math("MULTIPLY", cell, 0.1))
        bump_s = 0.6
        bump_d = 0.006
    elif t == "ground":
        n1 = k.noise(P, 3.0, 8.0, 0.62)
        n2 = k.noise(P, 18.0, 5.0, 0.6)
        pebbles = k.maprange(k.voronoi(P, 14.0), 0.18, 0.05)
        c = k.ramp(k.math("ADD", k.math("MULTIPLY", n1, 0.6), k.math("MULTIPLY", n2, 0.4)), [(0.3, c0), (0.55, c1), (0.8, c2)])
        sp = k.maprange(k.noise(P, 70.0, 2.0, 0.5), 0.62, 0.7)
        c = k.mix(k.math("MULTIPLY", sp, 0.8), c, spec["speck"])
        c = k.mix(k.math("MULTIPLY", pebbles, 0.5), c, (0.12, 0.12, 0.11))
        rough = k.maprange(n2, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.math("MULTIPLY", n2, 0.5), k.math("MULTIPLY", pebbles, 0.5))
        bump_s = 0.5
        bump_d = 0.006
    elif t == "planks":
        sep = k.separate(P)
        w = spec["width"]
        row = k.math("FLOOR", k.math("DIVIDE", sep[1], w))
        rr = k.math("FRACT", k.math("MULTIPLY", k.math("SINE", k.math("MULTIPLY", row, 12.9898)), 43758.5453))
        xs = k.math("ADD", sep[0], k.math("MULTIPLY", rr, 3.7))
        seam_y = k.math("ABSOLUTE", k.math("SUBTRACT", k.math("FRACT", k.math("DIVIDE", sep[1], w)), 0.5))
        seam_x = k.math("ABSOLUTE", k.math("SUBTRACT", k.math("FRACT", k.math("DIVIDE", xs, 1.8)), 0.5))
        gap = k.math("MAXIMUM", k.maprange(seam_y, 0.47, 0.5), k.maprange(seam_x, 0.493, 0.5))
        gq = k.combine(k.math("MULTIPLY", xs, 0.08), k.math("ADD", sep[1], k.math("MULTIPLY", rr, 5.0)), sep[2])
        streak = k.noise(gq, 14.0, 6.0, 0.6)
        c = k.ramp(streak, [(0.3, c0), (0.5, c1), (0.72, c2)])
        c = k.mix(k.maprange(rr, 0, 1, 0, 0.35), c, c0)
        c = k.mix(gap, c, (0.02, 0.012, 0.006))
        rough = k.maprange(streak, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", k.math("MULTIPLY", streak, 0.4), k.math("MULTIPLY", gap, 0.8))
        bump_s = 0.5
        bump_d = 0.004
    elif t == "metal":
        n = k.noise(Pr, 14.0, 6.0, 0.55)
        up = k.separate(geo.outputs["Normal"])[2]
        pat = k.math("ADD", k.maprange(k.ao(0.04), 0.5, 0.95, 1.0, 0.0), k.maprange(up, 0.3, 0.95, 0.0, 0.4))
        pat = k.math("MULTIPLY", pat, k.maprange(k.noise(Pr, 7.0, 4.0, 0.6), 0.38, 0.62), clamp=True)
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        c = k.mix(pat, c, spec["patina"])
        metal = k.math("SUBTRACT", 1.0, k.math("MULTIPLY", pat, 0.95), clamp=True)
        rough = k.math("ADD", k.maprange(n, 0.3, 0.7, r0, r1), k.math("MULTIPLY", pat, 0.3), clamp=True)
        h = k.noise(Pr, 160.0, 3.0, 0.5)
        bump_s = 0.10
    elif t == "clay":
        sep = k.separate(P)
        band = k.math("SINE", k.math("MULTIPLY", sep[2], 26.0))
        bandm = k.maprange(band, 0.86, 0.95)
        n = k.noise(Pr, 12.0, 5.0, 0.55)
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        c = k.mix(k.math("MULTIPLY", bandm, k.maprange(prand, 0.0, 1.0, 0.2, 0.9)), c, c2)
        rough = k.math("SUBTRACT", k.maprange(n, 0.3, 0.7, r0, r1), k.math("MULTIPLY", bandm, 0.25))
        h = k.math("ADD", k.noise(Pr, 80.0, 3.0, 0.5), k.math("MULTIPLY", bandm, 0.2))
        bump_s = 0.15
    elif t == "cloth":
        weave = k.noise(k.vmath("MULTIPLY", P, (420.0, 420.0, 30.0)), 1.0, 1.0, 0.5)
        weave2 = k.noise(k.vmath("MULTIPLY", P, (30.0, 30.0, 420.0)), 1.0, 1.0, 0.5)
        n = k.noise(Pr, 3.0, 5.0, 0.6)
        stain = k.maprange(k.noise(Pr, 1.5, 4.0, 0.6), 0.55, 0.72, 0.0, 0.5)
        c = k.ramp(n, [(0.3, c0), (0.55, c1), (0.8, c2)])
        c = k.mix(stain, c, c0)
        c = k.mix(0.3, c, k.maprange(k.math("ADD", weave, weave2), 0.6, 1.4, 0.82, 1.12), blend="MULTIPLY")
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("ADD", weave, weave2)
        bump_s = 0.15
        bump_d = 0.0008
    elif t == "rug":
        sep = k.separate(P)
        st = k.math("SINE", k.math("MULTIPLY", sep[1], 18.0))
        st2 = k.math("SINE", k.math("MULTIPLY", sep[0], 7.0))
        c = k.mix(k.maprange(st, 0.3, 0.6), c0, c1)
        c = k.mix(k.math("MULTIPLY", k.maprange(st2, 0.85, 0.95), k.maprange(st, -0.2, 0.2)), c, c2)
        weave = k.noise(k.vmath("MULTIPLY", P, (300.0, 300.0, 300.0)), 1.0, 1.0, 0.5)
        c = k.mix(0.3, c, k.maprange(weave, 0.3, 0.7, 0.8, 1.1), blend="MULTIPLY")
        rough = k.maprange(weave, 0.3, 0.7, r0, r1)
        h = weave
        bump_s = 0.2
        bump_d = 0.001
    elif t == "leaf":
        v = k.voronoi(Pr, 18.0, "DISTANCE_TO_EDGE")
        vein = k.maprange(v, 0.0, 0.04, 1.0, 0.0)
        n = k.noise(Pr, 6.0, 5.0, 0.6)
        c = k.ramp(n, [(0.3, c0), (0.55, c1), (0.8, c2)])
        c = k.mix(k.math("MULTIPLY", vein, 0.5), c, c0)
        c = k.mix(k.maprange(prand, 0, 1, 0, 0.4), c, (0.18, 0.20, 0.05))
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", n, k.math("MULTIPLY", vein, 0.5))
        bump_s = 0.3
    elif t == "moss":
        n = k.noise(Pr, 20.0, 6.0, 0.65)
        dots = k.maprange(k.voronoi(Pr, 60.0), 0.3, 0.0)
        c = k.ramp(k.math("ADD", n, k.math("MULTIPLY", dots, 0.3)), [(0.3, c0), (0.6, c1), (0.9, c2)])
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("ADD", n, k.math("MULTIPLY", dots, 0.5))
        bump_s = 0.6
    elif t in ("petal", "petalmix"):
        sep = k.separate(P)
        n = k.noise(Pr, 30.0, 3.0, 0.5)
        if t == "petal":
            c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
            # the yellow signal blaze of the iris "falls"
            blaze = k.math("MULTIPLY", k.maprange(sep[2], 0.0, 1.0, 0.0, 0.0), 0.0)
            c = k.mix(blaze, c, c2)
        else:
            sel = k.maprange(prand, 0.0, 1.0)
            c = k.mix(k.maprange(sel, 0.30, 0.36), c0, c1)
            c = k.mix(k.maprange(sel, 0.66, 0.72), c, c2)
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = n
        bump_s = 0.1
    elif t == "rope":
        tw = k.math("SINE", k.math("ADD", k.math("MULTIPLY", along, 60.0),
                                   k.math("MULTIPLY", k.math("ARCTAN2", k.separate(perp)[0], k.separate(perp)[1]), 3.0)))
        c = k.mix(k.maprange(tw, -1, 1), c0, c1)
        rough = k.maprange(tw, -1, 1, r0, r1)
        h = tw
        bump_s = 0.4
    elif t == "salt":
        sp = k.noise(Pr, 140.0, 2.0, 0.5)
        n = k.noise(Pr, 8.0, 4.0, 0.5)
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        c = k.mix(0.4, c, k.maprange(sp, 0.3, 0.7, 0.85, 1.12), blend="MULTIPLY")
        rough = k.maprange(sp, 0.3, 0.7, r0, r1)
        h = k.math("ADD", sp, k.math("MULTIPLY", n, 0.5))
        bump_s = 0.25
    elif t == "shingle":
        sep = k.separate(P)
        rowh = 0.16
        row = k.math("FLOOR", k.math("DIVIDE", sep[2], rowh))
        fr = k.math("FRACT", k.math("DIVIDE", sep[2], rowh))
        hor = k.math("ADD", sep[0], sep[1])
        offs = k.math("MULTIPLY", k.math("MODULO", row, 2.0), 0.11)
        col_ = k.math("FRACT", k.math("DIVIDE", k.math("ADD", hor, offs), 0.22))
        seam = k.maprange(k.math("ABSOLUTE", k.math("SUBTRACT", col_, 0.5)), 0.44, 0.5)
        stepv = k.maprange(fr, 0.0, 0.12, 0.0, 1.0)
        rr = k.math("FRACT", k.math("MULTIPLY", k.math("SINE", k.math("ADD", k.math("MULTIPLY", row, 7.13),
                                                                      k.math("FLOOR", k.math("DIVIDE", k.math("ADD", hor, offs), 0.22)))), 4375.85))
        n = k.noise(P, 30.0, 4.0, 0.55)
        c = k.mix(k.maprange(rr, 0, 1), c0, c2)
        c = k.mix(0.5, c, c1)
        c = k.mix(k.math("MULTIPLY", seam, 0.8), c, c0)
        c = k.mix(0.3, c, k.maprange(n, 0.3, 0.7, 0.8, 1.15), blend="MULTIPLY")
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", k.math("ADD", stepv, k.math("MULTIPLY", n, 0.2)), k.math("MULTIPLY", seam, 0.5))
        bump_s = 0.6
        bump_d = 0.006
    else:
        raise ValueError(t)
    # contact dirt from local AO, never on cloth/leaf undersides too strongly
    dirt = k.maprange(k.ao(0.12), 0.35, 0.95, 0.55, 0.0)
    c = k.mix(dirt, c, tuple(x * 0.35 for x in c0))
    bsdf = k.new("ShaderNodeBsdfPrincipled")
    k.link(c, bsdf.inputs["Base Color"])
    k.link(rough, bsdf.inputs["Roughness"])
    if isinstance(metal, float):
        bsdf.inputs["Metallic"].default_value = metal
    else:
        k.link(metal, bsdf.inputs["Metallic"])
    bump = k.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_s
    bump.inputs["Distance"].default_value = bump_d
    k.link(h, bump.inputs["Height"])
    k.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    emit = k.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    target = k.new("ShaderNodeTexImage")
    target.name = "BakeTarget"
    k.n.active = target
    return m, (k, out, bsdf, emit, {"color": c, "rough": rough, "metal": metal})


def set_bake_output(kits, channel):
    for k, out, bsdf, emit, ch in kits:
        for lk in list(out.inputs["Surface"].links):
            k.l.remove(lk)
        for lk in list(emit.inputs["Color"].links):
            k.l.remove(lk)
        if channel == "bsdf":
            k.link(bsdf.outputs["BSDF"], out.inputs["Surface"])
            continue
        v = ch[channel]
        if isinstance(v, float):
            emit.inputs["Color"].default_value = (v, v, v, 1)
        else:
            k.link(v, emit.inputs["Color"])
        k.link(emit.outputs["Emission"], out.inputs["Surface"])


# =================================================================== kit

class Kit:
    """Accumulates camp geometry: one bmesh per kind (baked), one for the special
    material, one for collision."""

    def __init__(self, stem, seed):
        self.stem = stem
        self.bms = {}
        self.special = bmesh.new()
        self.col = bmesh.new()
        self.rng = random.Random(seed)
        self.sockets = []
        self.notes = []

    def bm(self, kind):
        if kind == "special":
            return self.special
        if kind not in self.bms:
            if kind not in KINDS:
                raise KeyError(kind)
            self.bms[kind] = bmesh.new()
        return self.bms[kind]

    # ---- primitives
    def box(self, kind, c, size, rot=None, bevel=0.0, seg=1):
        bm = self.bm(kind)
        vs = ftf.box(bm, Vector(c), size, rot)
        if bevel > 0:
            es = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(bm, geom=es, offset=bevel, segments=seg, affect="EDGES",
                            profile=0.5, clamp_overlap=True)
        return vs

    def beam(self, kind, a, b, w, h, bevel=0.0, up=(0, 0, 1)):
        a, b = Vector(a), Vector(b)
        R = ftf.frame_from_x(a, b, up)
        return self.box(kind, (a + b) / 2, ((b - a).length, w, h), R, bevel)

    def rev(self, kind, profile, n, c=(0, 0, 0), rfunc=None, cap_bottom=False, cap_top=False, phase=0.0):
        return ftf.revolve(self.bm(kind), profile, n, rfunc=rfunc, cap_bottom=cap_bottom,
                           cap_top=cap_top, center=tuple(c), phase=phase)

    def cyl(self, kind, c, r, h, n=12, r_top=None, caps=True, phase=0.0):
        rt = r if r_top is None else r_top
        return self.rev(kind, [(r, 0.0), (rt, h)], n, c, cap_bottom=caps, cap_top=caps, phase=phase)

    def tube(self, kind, pts, r, sides=6, closed=False, cap=True):
        return ftf.tube(self.bm(kind), pts, r, sides, closed=closed, cap=cap)

    def ico(self, kind, c, r, scale=(1, 1, 1), sub=2, noise=0.15, seed=0, flat_bottom=None):
        bm = self.bm(kind)
        res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        vs = res["verts"]
        rr = random.Random(seed)
        ph = [rr.uniform(0, TAU) for _ in range(6)]
        for v in vs:
            d = v.co.copy()
            k = 1.0 + noise * (math.sin(3.1 * d.x + ph[0]) * math.sin(2.7 * d.y + ph[1]) +
                               0.6 * math.sin(5.3 * d.z + ph[2]) * math.sin(4.1 * d.x + ph[3]))
            p = Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2])) * r * k
            if flat_bottom is not None:
                p.z = max(p.z, flat_bottom)
            v.co = Vector(c) + p
        return vs

    def surface(self, kind, fn, nu, nv, closed_u=False):
        """Parametric grid surface fn(u, v) -> point, u,v in 0..1."""
        bm = self.bm(kind)
        cu = nu if closed_u else nu + 1
        rows = []
        for j in range(nv + 1):
            rows.append([bm.verts.new(fn(i / nu, j / nv)) for i in range(cu)])
        for j in range(nv):
            for i in range(nu):
                i2 = (i + 1) % cu
                bm.faces.new((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
        return rows

    def poly(self, kind, pts):
        bm = self.bm(kind)
        return bm.faces.new([bm.verts.new(p) for p in pts])

    # ---- collision (convex pieces)
    def col_box(self, c, size, rot=None):
        ftf.box(self.col, Vector(c), size, rot)

    def col_cyl(self, c, r, h, n=8):
        ftf.prism_ngon(self.col, n, r, r, c[2], c[2] + h, center=(c[0], c[1]))

    def col_beam(self, a, b, w, h):
        ftf.beam(self.col, a, b, w, h)


def rot_xy(x, y, a):
    c, s = math.cos(a), math.sin(a)
    return x * c - y * s, x * s + y * c


class Frame:
    """Local placement: position + yaw. p(x, y, z) maps local to camp space."""

    def __init__(self, x, y, z=0.0, yaw=0.0):
        self.o = Vector((x, y, z))
        self.yaw = yaw

    def p(self, x, y, z=0.0):
        rx, ry = rot_xy(x, y, self.yaw)
        return Vector((self.o.x + rx, self.o.y + ry, self.o.z + z))


# =================================================================== shared props

def superellipse(a, n=64, e=4.0):
    pts = []
    for i in range(n):
        t = TAU * i / n
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / e), c)
        y = a * math.copysign(abs(s) ** (2 / e), s)
        pts.append((x, y))
    return pts


def camp_base(K, kind, edge_kind=None):
    """8 x 8 m rounded-square base, 0.12 m high with a gentle ramp edge."""
    bm = K.bm(kind)
    outer = superellipse(BASE_HALF + 0.35, 64)
    top = superellipse(BASE_HALF, 64)
    c = bm.verts.new((0, 0, BASE_H))
    ring = [bm.verts.new((x, y, BASE_H)) for x, y in top]
    for i in range(len(ring)):
        bm.faces.new((c, ring[i], ring[(i + 1) % len(ring)]))
    ek = K.bm(edge_kind or kind)
    r_top = [ek.verts.new((x, y, BASE_H)) for x, y in top]
    r_mid = [ek.verts.new((x * 1.03, y * 1.03, BASE_H - 0.03)) for x, y in top]
    r_out = [ek.verts.new((x, y, -0.02)) for x, y in outer]
    for a, b in ((r_top, r_mid), (r_mid, r_out)):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            ek.faces.new((a[i], b[i], b[j], a[j]))
    K.col.verts.ensure_lookup_table()
    col_top = [K.col.verts.new((x, y, BASE_H)) for x, y in superellipse(BASE_HALF, 24)]
    col_bot = [K.col.verts.new((x, y, -0.05)) for x, y in superellipse(BASE_HALF + 0.35, 24)]
    K.col.faces.new(col_top)
    K.col.faces.new(list(reversed(col_bot)))
    for i in range(24):
        j = (i + 1) % 24
        K.col.faces.new((col_bot[i], col_bot[j], col_top[j], col_top[i]))


def agent_circle(K, disc_kind, ring_kind):
    """The free hologram circle: an inlaid disc with a ring; nothing else inside."""
    K.rev(disc_kind, [(AGENT_R - 0.04, BASE_H + 0.004), (0.001, BASE_H + 0.004)], 48)
    K.rev(ring_kind, [(AGENT_R + 0.08, BASE_H + 0.002), (AGENT_R + 0.08, BASE_H + 0.012),
                      (AGENT_R - 0.04, BASE_H + 0.012), (AGENT_R - 0.04, BASE_H + 0.002)], 64)
    K.sockets.append(("socket_agent", (0, 0, BASE_H), 0.0,
                      {"socket": "agent_hologram", "free_radius_m": AGENT_R}))


def post(K, kind, p, h, w=0.14, lean=(0, 0), sides=0, bevel=0.012):
    a = Vector((p[0], p[1], p[2] if len(p) > 2 else BASE_H))
    b = a + Vector((lean[0], lean[1], h))
    if sides:
        K.tube(kind, [a, b], w / 2, sides)
    else:
        K.beam(kind, a, b, w, w, bevel=bevel)
    return b


def lantern(K, p, frame_kind="brass", hang=0.0, scale=1.0, cap_kind=None):
    """Small cage lantern; glass core uses the special (emissive) material."""
    x, y, z = p
    s = scale
    if hang > 0:
        K.tube("iron", [(x, y, z), (x, y, z - hang)], 0.008 * s, 4)
        z -= hang
    zt = z
    zb = z - 0.34 * s
    K.rev(cap_kind or frame_kind, [(0.10 * s, -0.09 * s), (0.12 * s, -0.07 * s), (0.09 * s, -0.05 * s),
                                    (0.015 * s, 0.02 * s)], 10, (x, y, zt), cap_top=True, cap_bottom=True)
    K.tube(frame_kind, [(x, y, zt + 0.0), (x, y, zt + 0.06 * s)], 0.006 * s, 4)
    for i in range(4):
        a = TAU * i / 4 + 0.785
        K.tube(frame_kind, [(x + 0.085 * s * math.cos(a), y + 0.085 * s * math.sin(a), zt - 0.08 * s),
                            (x + 0.085 * s * math.cos(a), y + 0.085 * s * math.sin(a), zb + 0.03 * s)], 0.007 * s, 4)
    K.cyl(frame_kind, (x, y, zb), 0.10 * s, 0.035 * s, 10)
    K.cyl("special", (x, y, zb + 0.04 * s), 0.065 * s, 0.20 * s, 10)


def jar(K, p, h, r, kind="clay", n=16, lid=False, neck=0.45):
    prof = [(r * 0.55, 0.0), (r * 0.85, 0.08 * h), (r, 0.35 * h), (r * 0.92, 0.62 * h),
            (r * neck, 0.86 * h), (r * neck * 0.9, 0.93 * h), (r * neck * 1.15, h), (r * neck * 0.95, h * 1.01),
            (r * neck * 0.8, h * 0.97), (0.001, h * 0.95)]
    K.rev(kind, [(0.001, 0.0)] + prof, n, (p[0], p[1], p[2]))
    if lid:
        K.rev("wood", [(r * neck * 1.2, h), (r * neck * 1.2, h + 0.03), (r * 0.15, h + 0.06), (0.001, h + 0.08)], n,
              (p[0], p[1], p[2]))


def amphora(K, p, h, r, kind="clay", n=16):
    prof = [(0.001, 0.0), (r * 0.25, 0.02 * h), (r * 0.7, 0.18 * h), (r, 0.45 * h), (r * 0.85, 0.66 * h),
            (r * 0.35, 0.82 * h), (r * 0.3, 0.94 * h), (r * 0.42, h), (r * 0.30, h), (0.001, 0.96 * h)]
    K.rev(kind, prof, n, (p[0], p[1], p[2]))
    for side in (-1, 1):
        a = Vector((p[0] + side * r * 0.32, p[1], p[2] + 0.9 * h))
        b = Vector((p[0] + side * r * 0.75, p[1], p[2] + 0.86 * h))
        c = Vector((p[0] + side * r * 0.72, p[1], p[2] + 0.66 * h))
        K.tube(kind, [a, (a + b) / 2 + Vector((0, 0, 0.03)), b, c], 0.018, 5)


def crate(K, f, size, kind="wood", band="iron"):
    sx, sy, sz = size
    c = f.p(0, 0, sz / 2)
    K.box(kind, c, (sx, sy, sz), f.yaw, bevel=0.012)
    for z in (0.08, sz - 0.08):
        for side in (-1, 1):
            K.box(band, f.p(0, side * (sy / 2 + 0.006), z), (sx + 0.02, 0.012, 0.05), f.yaw)
            K.box(band, f.p(side * (sx / 2 + 0.006), 0, z), (0.012, sy + 0.02, 0.05), f.yaw)
    K.col_box(c, (sx, sy, sz), f.yaw)


def chest(K, f, size, wood="wood", band="iron", lock="brass", open_=False):
    sx, sy, sz = size
    K.box(wood, f.p(0, 0, sz * 0.32), (sx, sy, sz * 0.64), f.yaw, bevel=0.01)
    # rounded lid: half cylinder along local x
    ox, oy, oz = f.o
    def lid(u, v):
        a = math.pi * v
        lx = -sx / 2 + sx * u
        ly = -sy / 2 * math.cos(a)
        lz = sz * 0.64 + sy / 2 * 0.62 * math.sin(a)
        return f.p(lx, ly, lz)
    K.surface(wood, lid, 2, 8)
    for side in (-1, 1):
        pts = [f.p(side * sx / 2, -sy / 2 * math.cos(math.pi * i / 8), sz * 0.64 + sy / 2 * 0.62 * math.sin(math.pi * i / 8))
               for i in range(9)]
        if side > 0:
            pts.reverse()
        K.poly(wood, pts)
    for t in (-0.36, 0.0, 0.36):
        lx = t * sx
        pts = [f.p(lx, -(sy / 2 + 0.008) * math.cos(math.pi * i / 10),
                   sz * 0.64 + (sy / 2 * 0.62 + 0.008) * math.sin(math.pi * i / 10)) for i in range(11)]
        K.tube(band, pts, 0.012, 4)
        K.box(band, f.p(lx, 0, sz * 0.32), (0.035, sy + 0.016, sz * 0.64 + 0.01), f.yaw)
    # padlock on the front
    K.box(lock, f.p(0, -sy / 2 - 0.03, sz * 0.55), (0.07, 0.03, 0.08), f.yaw, bevel=0.006)
    sh = [f.p(0.024 * math.cos(math.pi * i / 6), -sy / 2 - 0.03, sz * 0.59 + 0.035 * math.sin(math.pi * i / 6))
          for i in range(7)]
    K.tube("iron", sh, 0.006, 4)
    K.col_box(f.p(0, 0, sz * 0.5), (sx, sy, sz), f.yaw)


def barrel(K, p, r, h, kind="wood", band="iron"):
    prof = [(0.001, 0.0), (r * 0.86, 0.0), (r * 0.97, 0.25 * h), (r, 0.5 * h), (r * 0.97, 0.75 * h),
            (r * 0.86, h), (0.001, h)]
    K.rev(kind, prof, 16, p)
    for t in (0.1, 0.3, 0.7, 0.9):
        rr = r * (0.86 + 0.14 * math.sin(math.pi * t)) + 0.006
        K.rev(band, [(rr, t * h - 0.02), (rr, t * h + 0.02)], 16, p)
    K.col_cyl(p, r, h)


def sack(K, p, r, h, kind="cloth_canvas", seed=0):
    K.ico(kind, (p[0], p[1], p[2] + h * 0.45), 1.0, scale=(r, r * 0.9, h * 0.5), sub=2, noise=0.12, seed=seed,
          flat_bottom=-h * 0.45)
    K.tube("rope", [(p[0], p[1], p[2] + h * 0.88), (p[0], p[1], p[2] + h * 1.02)], r * 0.25, 6)


def leafy(K, p, r, seed, kind="leaf", squash=0.7, sub=2):
    K.ico(kind, (p[0], p[1], p[2] + r * squash * 0.6), r, scale=(1, 1, squash), sub=sub, noise=0.22, seed=seed,
          flat_bottom=-r * squash * 0.5)


def flower_iris(K, p, h, seed):
    """Iris flower: stem, sword leaves, three upright standards and three falls."""
    rng = random.Random(seed)
    x, y, z = p
    lean = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0))
    top = Vector((x, y, z + h)) + lean
    K.tube("leaf", [(x, y, z), (x + lean.x * 0.5, y + lean.y * 0.5, z + h * 0.5), top], 0.007, 4, cap=False)
    for i in range(3):
        a = rng.uniform(0, TAU)
        lh = h * rng.uniform(0.6, 0.95)
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0)) * 0.018
        b = Vector((x, y, z))
        m = b + d * 0.05 + Vector((0, 0, lh * 0.55))
        t = b + d * 0.12 + Vector((0, 0, lh))
        K.poly("leaf", [b - s, m - s * 0.8, t, m + s * 0.8, b + s])
    rot = rng.uniform(0, TAU)
    for i in range(3):
        a = rot + TAU * i / 3
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0))
        base = top
        # standard (upright petal)
        K.poly("petal_violet", [base - s * 0.012, base + d * 0.03 + Vector((0, 0, 0.06)) - s * 0.03,
                                base + d * 0.01 + Vector((0, 0, 0.10)), base + d * 0.03 + Vector((0, 0, 0.06)) + s * 0.03,
                                base + s * 0.012])
        # fall (drooping petal)
        a2 = a + TAU / 6
        d2 = Vector((math.cos(a2), math.sin(a2), 0))
        s2 = Vector((-d2.y, d2.x, 0))
        K.poly("petal_violet", [base - s2 * 0.012, base + d2 * 0.05 + Vector((0, 0, 0.012)) - s2 * 0.032,
                                base + d2 * 0.085 - Vector((0, 0, 0.035)), base + d2 * 0.05 + Vector((0, 0, 0.012)) + s2 * 0.032,
                                base + s2 * 0.012])


def crystal(K, kind, base, axis, length, r, seed, sides=6):
    """Hexagonal quartz prism with a pyramidal termination (flat facets)."""
    rng = random.Random(seed)
    ax = Vector(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
    u = ax.cross(ref).normalized()
    v = ax.cross(u)
    rot = rng.uniform(0, TAU)
    b = Vector(base) - ax * 0.15
    body = length * rng.uniform(0.62, 0.75)
    rings = []
    for t, rf in ((0.0, 1.0), (body * 0.55, rng.uniform(0.97, 1.03)), (body, rng.uniform(0.92, 1.0))):
        c = b + ax * t
        rings.append([c + (u * math.cos(rot + TAU * k / sides) + v * math.sin(rot + TAU * k / sides)) * r * rf
                      * (1 + 0.12 * math.sin(k * 2.1 + seed)) for k in range(sides)])
    bm = K.bm(kind)
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    for a_, b_ in zip(vr, vr[1:]):
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((a_[k], a_[l], b_[l], b_[k]))
    tip = bm.verts.new(b + ax * length + u * r * rng.uniform(-0.15, 0.15))
    for k in range(sides):
        bm.faces.new((vr[-1][k], vr[-1][(k + 1) % sides], tip))
    bm.faces.new(list(reversed(vr[0])))


def crystal_cluster(K, kind, c, height, count, seed, rock_kind="stone", spread=0.45):
    rng = random.Random(seed)
    cx, cy, cz = c
    K.ico(rock_kind, (cx, cy, cz - 0.05), height * 0.18 + 0.15, scale=(1.4, 1.2, 0.55), sub=2, noise=0.25,
          seed=seed, flat_bottom=-0.05)
    crystal(K, kind, (cx, cy, cz), (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1), height,
            height * 0.12, seed)
    for i in range(count):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.1, spread) * (height * 0.35 + 0.2)
        tilt = rng.uniform(0.25, 0.75)
        ax = (math.cos(a) * tilt, math.sin(a) * tilt, 1.0)
        L = height * rng.uniform(0.3, 0.75)
        crystal(K, kind, (cx + d * math.cos(a), cy + d * math.sin(a), cz), ax, L, L * rng.uniform(0.09, 0.14),
                seed * 31 + i)
    K.col_cyl((cx, cy, cz), height * 0.22 + 0.25, height * 0.8, 8)


def balance_scale(K, p, size=1.0, base_kind="brass", pan_load=None):
    x, y, z = p
    s = size
    K.rev(base_kind, [(0.11 * s, 0.0), (0.11 * s, 0.02 * s), (0.07 * s, 0.04 * s), (0.03 * s, 0.05 * s)], 16,
          (x, y, z), cap_top=True)
    K.cyl(base_kind, (x, y, z + 0.04 * s), 0.014 * s, 0.42 * s, 8)
    K.rev(base_kind, [(0.03 * s, 0.0), (0.035 * s, 0.03 * s), (0.001, 0.06 * s)], 10, (x, y, z + 0.46 * s))
    beam_z = z + 0.44 * s
    K.beam(base_kind, (x - 0.26 * s, y, beam_z), (x + 0.26 * s, y, beam_z), 0.012 * s, 0.02 * s)
    K.rev(base_kind, [(0.001, 0.0), (0.02 * s, 0.01 * s), (0.001, 0.13 * s)], 4, (x, y, beam_z))
    for side in (-1, 1):
        hx = x + side * 0.25 * s
        pz = z + 0.16 * s
        for k in range(3):
            a = TAU * k / 3
            K.tube(base_kind, [(hx, y, beam_z - 0.01), (hx + 0.085 * s * math.cos(a), y + 0.085 * s * math.sin(a), pz + 0.02 * s)],
                   0.0025 * s, 3)
        K.rev(base_kind, [(0.001, pz), (0.06 * s, pz + 0.005 * s), (0.10 * s, pz + 0.025 * s), (0.105 * s, pz + 0.03 * s)],
              16, (hx, y, 0))
        if pan_load and side in pan_load:
            kind, kind_h = pan_load[side]
            K.rev(kind, [(0.06 * s, pz + 0.02 * s), (0.001, pz + 0.02 * s + kind_h * s)], 10, (hx, y, 0))


def ring_sign(K, kind, center, normal_dir, radius, seed, thick=0.012):
    """A round sign (ring of four slots with stroke forms) as raised strips on a
    vertical panel facing `normal_dir` (unit xy)."""
    rng = random.Random(seed)
    n = Vector((normal_dir[0], normal_dir[1], 0)).normalized()
    right = Vector((-n.y, n.x, 0)) * -1
    up = Vector((0, 0, 1))
    C = Vector(center) + n * 0.004
    rot = rng.uniform(0, TAU)

    def P(r, a, off=0.0):
        return C + (right * math.cos(a) + up * math.sin(a)) * r + n * off
    for q in range(4):
        a0 = rot + q * TAU / 4 + 0.18
        a1 = rot + (q + 1) * TAU / 4 - 0.18
        pts = [P(radius, a0 + (a1 - a0) * i / 5) for i in range(6)]
        K.tube(kind, pts, thick, 4)
        am = (a0 + a1) / 2
        form = rng.choice(("arc", "spike", "loop", "drop"))
        if form == "arc":
            K.tube(kind, [P(radius * 1.25, am - 0.35 + 0.7 * i / 3) for i in range(4)], thick * 0.8, 4)
        elif form == "spike":
            K.tube(kind, [P(radius * 1.02, am), P(radius * 1.55, am)], thick, 4)
        elif form == "loop":
            cc = P(radius * 1.38, am)
            K.tube(kind, [cc + (right * math.cos(TAU * i / 8) + up * math.sin(TAU * i / 8)) * radius * 0.16
                          for i in range(8)], thick * 0.7, 4, closed=True)
        else:
            cc = P(radius * 1.35, am)
            K.ico(kind, cc, radius * 0.11, scale=(1, 1, 1), sub=1, noise=0.0)
    for i in range(rng.randint(1, 3)):
        K.ico(kind, P(radius * 0.3, rot + i * 1.1), radius * 0.07, sub=1, noise=0.0)


def clutter(K, kind, count, seed, size=(0.05, 0.14), rmin=3.3, rmax=3.85, sub=2, squash=0.6, avoid_front=1.4):
    """Small stones (or other lumps) along the base edge, keeping the entrance clear."""
    rng = random.Random(seed)
    placed = 0
    for _ in range(count * 4):
        if placed >= count:
            break
        a = rng.uniform(0, TAU)
        r = rng.uniform(rmin, rmax)
        x, y = r * math.cos(a), r * math.sin(a)
        if y < 0 and abs(x) < avoid_front:
            continue
        sc = max(abs(x), abs(y))
        if sc > BASE_HALF - 0.12:
            continue
        rad = rng.uniform(*size)
        K.ico(kind, (x, y, BASE_H + rad * squash * 0.3), rad, scale=(1.0, rng.uniform(0.7, 1.0), squash), sub=sub,
              noise=0.25, seed=seed * 100 + placed, flat_bottom=-rad * squash * 0.35)
        placed += 1


# =================================================================== camps

def camp_iris(K):
    """Iris (the player): a neat violet canopy tent, lanterns, pottery, iris beds."""
    camp_base(K, "paving_grey", "stone")
    agent_circle(K, "stone_light", "brass")
    # tent frame
    fy, by = 1.65, 3.85
    corners = {(-1, 0): 2.35, (1, 0): 2.35, (-1, 1): 1.95, (1, 1): 1.95}
    tops = {}
    for (sx, sb), h in corners.items():
        y = by if sb else fy
        tops[(sx, sb)] = post(K, "wood", (sx * 2.6, y, BASE_H), h, 0.13)
        K.col_cyl((sx * 2.6, y, 0), 0.12, h + BASE_H)
        K.cyl("stone", (sx * 2.6, y, BASE_H - 0.01), 0.13, 0.12, 8)
    rf = post(K, "wood", (0, fy - 0.15, BASE_H), 3.02, 0.12, sides=8)
    rb = post(K, "wood", (0, by + 0.15, BASE_H), 2.66, 0.12, sides=8)
    K.col_cyl((0, fy - 0.15, 0), 0.1, 3.1)
    K.tube("wood", [rf, rb], 0.055, 8)
    K.beam("wood", tops[(-1, 0)], tops[(1, 0)], 0.10, 0.10, bevel=0.01)
    K.beam("wood", tops[(-1, 1)], tops[(1, 1)], 0.10, 0.10, bevel=0.01)
    for sx in (-1, 1):
        K.beam("wood", tops[(sx, 0)], tops[(sx, 1)], 0.09, 0.09, bevel=0.01)
        for (sb, y) in ((0, fy), (1, by)):
            K.tube("rope", [tops[(sx, sb)] - Vector((0, 0, 0.12)), tops[(sx, sb)] - Vector((0, 0, 0.02))], 0.07, 6)

    # canopy: ridge to eaves, sagging cloth with a scalloped valance
    def canopy(u, v):
        x = -2.78 + 5.56 * u
        y = (fy - 0.2) + ((by + 0.2) - (fy - 0.2)) * v
        ax = abs(x) / 2.78
        z_r = 3.16 + (2.81 - 3.16) * v
        z_e = 2.60 + (2.18 - 2.60) * v
        z = z_r + (z_e - z_r) * ax - 0.16 * math.sin(math.pi * ax) - 0.07 * math.sin(math.pi * v) * (1 - ax)
        return Vector((x, y, z))
    K.surface("cloth_violet", canopy, 16, 8)

    def valance(u, v, front=True):
        x = -2.78 + 5.56 * u
        top = canopy(u, 0.0 if front else 1.0)
        drop = 0.30 + 0.07 * abs(math.sin(u * math.pi * 8))
        return top + Vector((0, -0.01 if front else 0.01, -drop * v))
    K.surface("cloth_violet", lambda u, v: valance(u, v, True), 32, 1)
    # side valances
    for sx in (-1, 1):
        K.surface("cloth_violet", lambda u, v, sx=sx: canopy(0.0 if sx < 0 else 1.0, u) +
                  Vector((sx * 0.01, 0, -(0.26 + 0.06 * abs(math.sin(u * math.pi * 5))) * v)), 10, 1)

    # back curtain with folds and gathered side drapes
    def back(u, v):
        x = -2.62 + 5.24 * u
        ztop = canopy(u * 0.94 + 0.03, 1.0).z - 0.05
        z = BASE_H + 0.02 + (ztop - BASE_H - 0.02) * v
        y = by + 0.05 + 0.06 * math.sin(u * math.pi * 11) * (0.4 + 0.6 * (1 - v))
        return Vector((x, y, z))
    K.surface("cloth_violet", back, 30, 4)
    K.col_box((0, by + 0.08, 1.2), (5.3, 0.18, 2.4))
    for sx in (-1, 1):
        def side(u, v, sx=sx):
            y = by - 1.5 * u
            ztop = canopy(0.0 if sx < 0 else 1.0, (y - (fy - 0.2)) / ((by + 0.2) - (fy - 0.2))).z - 0.04
            gather = 0.35 + 0.65 * (1 - v)
            y2 = by - (by - y) * (0.45 + 0.55 * v ** 2)
            z = BASE_H + 0.02 + (ztop - BASE_H - 0.02) * v
            x = sx * (2.64 + 0.07 * math.sin(u * math.pi * 7) * gather)
            return Vector((x, y2, z))
        K.surface("cloth_violet", side, 14, 4)
        K.col_box((sx * 2.65, by - 0.5, 1.1), (0.2, 1.0, 2.2))
        # tie-back cord
        K.tube("rope", [(sx * 2.66, by - 0.72, 1.05), (sx * 2.72, by - 0.75, 1.0), (sx * 2.66, by - 0.80, 0.95)], 0.012, 4)
    # guy ropes and pegs from the front posts
    for sx in (-1, 1):
        peg = Vector((sx * 3.55, 0.75, BASE_H))
        K.tube("rope", [tops[(sx, 0)] - Vector((0, 0, 0.05)), peg + Vector((0, 0, 0.12))], 0.01, 4)
        K.beam("wood", peg - Vector((0, 0, 0.02)), peg + Vector((0.03 * sx, -0.03, 0.18)), 0.04, 0.04)

    # rug and interior: low writing table, book, inkwell, cushions, bedroll, crate
    def rug(u, v):
        return Vector((-1.9 + 3.8 * u, 2.0 + 1.6 * v, BASE_H + 0.006))
    K.surface("rug", rug, 2, 2)
    tf = Frame(0.0, 3.0, BASE_H, 0.0)
    K.box("wood", tf.p(0, 0, 0.40), (1.2, 0.6, 0.05), 0.0, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            K.box("wood", tf.p(sx * 0.52, sy * 0.24, 0.19), (0.05, 0.05, 0.38), 0.0, bevel=0.008)
    K.col_box(tf.p(0, 0, 0.2), (1.2, 0.6, 0.45))
    K.box("paper", tf.p(-0.2, -0.02, 0.44), (0.32, 0.24, 0.03), 0.1)
    K.box("cloth_violet", tf.p(-0.2, -0.02, 0.425), (0.34, 0.26, 0.012), 0.1)
    K.rev("slate", [(0.03, 0.0), (0.035, 0.03), (0.02, 0.05), (0.022, 0.06)], 10, tf.p(0.3, 0.05, 0.425), cap_top=True)
    K.tube("paper", [tf.p(0.32, 0.06, 0.48), tf.p(0.37, 0.12, 0.62)], 0.004, 3)
    for i, (cx, cy) in enumerate(((-0.75, 2.45), (0.75, 2.45))):
        K.ico("cloth_violet", (cx, cy, BASE_H + 0.09), 0.26, scale=(1.0, 1.0, 0.38), sub=2, noise=0.08, seed=i)
    K.tube("cloth_cream", [(1.35, 3.3, BASE_H + 0.13), (2.25, 3.3, BASE_H + 0.13)], 0.13, 12)
    crate(K, Frame(-1.85, 3.25, BASE_H, 0.15), (0.65, 0.5, 0.48))
    lantern(K, (-1.85, 3.2, BASE_H + 0.48 + 0.36), scale=1.0)

    # hanging lanterns on the front beam
    for x in (-1.3, 1.3):
        lantern(K, (x, fy, 2.30), hang=0.32, scale=1.05)
    # standing lantern on a post near the pedestal
    lp = post(K, "wood", (3.15, -0.6, BASE_H), 1.25, 0.08)
    K.beam("wood", lp, lp + Vector((0, -0.28, 0)), 0.05, 0.05)
    lantern(K, lp + Vector((0, -0.26, -0.02)), hang=0.12, scale=0.9)
    K.col_cyl((3.15, -0.6, 0), 0.1, 1.4)

    # pottery cluster on a low plank stand (left)
    pf = Frame(-3.05, 0.55, BASE_H, 0.2)
    K.box("wood", pf.p(0, 0, 0.06), (0.95, 1.35, 0.1), pf.yaw, bevel=0.01)
    amphora(K, pf.p(-0.2, 0.35, 0.11), 0.92, 0.24)
    jar(K, pf.p(0.22, 0.42, 0.11), 0.62, 0.21, lid=True)
    jar(K, pf.p(0.18, -0.12, 0.11), 0.45, 0.19)
    jar(K, pf.p(-0.22, -0.32, 0.11), 0.38, 0.16, neck=0.6)
    K.rev("clay", [(0.001, 0.0), (0.10, 0.0), (0.16, 0.06), (0.17, 0.08), (0.15, 0.08), (0.09, 0.02), (0.001, 0.02)],
          16, pf.p(0.25, -0.5, 0.11))
    jar(K, (-2.55, -0.6, BASE_H), 0.34, 0.15, neck=0.5)
    K.col_cyl(pf.p(0, 0, -BASE_H), 0.8, 1.1)

    # shard pedestal (right): the code puts the memory shard on socket_shard
    pd = Frame(2.55, 0.95, BASE_H, 0.0)
    K.rev("stone_light", [(0.34, 0.0), (0.34, 0.08), (0.28, 0.12), (0.22, 0.16), (0.19, 0.30), (0.17, 0.80),
                          (0.21, 0.86), (0.26, 0.90), (0.27, 0.96), (0.22, 0.98), (0.12, 0.99), (0.001, 0.97)],
          12, pd.p(0, 0, 0), cap_bottom=True, phase=0.26)
    K.rev("brass", [(0.255, 0.955), (0.27, 0.975), (0.255, 0.99)], 24, pd.p(0, 0, 0))
    K.col_cyl(pd.p(0, 0, 0), 0.34, 1.0)
    K.sockets.append(("socket_shard", tuple(pd.p(0, 0, 0.99)), 0.0, {"socket": "shard_rest"}))

    # iris beds: stone planters with iris flowers at the front corners
    for sx in (-1, 1):
        f = Frame(sx * 2.75, -2.75, BASE_H, sx * -0.785)
        K.box("stone", f.p(0, 0, 0.22), (1.5, 0.55, 0.44), f.yaw, bevel=0.03)
        K.box("moss", f.p(0, 0, 0.445), (1.38, 0.44, 0.02), f.yaw)
        K.col_box(f.p(0, 0, 0.25), (1.5, 0.55, 0.5), f.yaw)
        for i in range(9):
            lx = -0.58 + 1.16 * i / 8 + K.rng.uniform(-0.05, 0.05)
            ly = K.rng.uniform(-0.12, 0.12)
            flower_iris(K, tuple(f.p(lx, ly, 0.45)), K.rng.uniform(0.42, 0.62), sid("iris") + i * 7 + sx)
        for i in range(4):
            leafy(K, tuple(f.p(-0.55 + 0.37 * i, K.rng.uniform(-0.1, 0.1), 0.44)), 0.13, i + sx * 10,
                  squash=0.8, sub=2)
    clutter(K, "stone", 14, 1)
    clutter(K, "leaf", 6, 2, size=(0.12, 0.2), squash=0.7)
    K.notes += ["violet canopy tent with valance, back curtain and tied side drapes",
                "four lanterns (two hanging, one on a post, one on the crate)",
                "pottery stand: amphora, lidded jar, jars and a bowl",
                "two stone beds of iris flowers", "stone pedestal for the memory shard (socket_shard)",
                "rug, writing table with book and inkwell, cushions, bedroll"]


def camp_sol(K):
    """Salt: white crystal clusters, a small colonnade, a brass balance on a trade table,
    stacked salt and something hidden under a cloth."""
    camp_base(K, "paving_white", "marble")
    agent_circle(K, "marble", "brass")
    cy0, R = 0.45, 3.35
    angs = [math.radians(a) for a in (18, 47, 76, 104, 133, 162)]
    for a in angs:
        x, y = R * math.cos(a), cy0 + R * math.sin(a)
        K.box("marble", (x, y, BASE_H + 0.1), (0.58, 0.58, 0.2), a, bevel=0.02)
        K.rev("marble", [(0.25, 0.2), (0.26, 0.24), (0.215, 0.30), (0.205, 0.34), (0.20, 0.9), (0.195, 1.5),
                         (0.185, 2.21), (0.20, 2.27), (0.24, 2.33), (0.27, 2.41)], 24, (x, y, BASE_H),
              rfunc=lambda th, z, r: r * (1 - 0.045 * (0.5 + 0.5 * math.cos(th * 12))) if 0.33 < z < 2.22 else r)
        K.box("marble", (x, y, BASE_H + 2.49), (0.6, 0.6, 0.16), a, bevel=0.02)
        K.col_cyl((x, y, 0), 0.3, 2.7)
    # curved architrave + cornice across the column tops
    a0, a1 = angs[0] - 0.08, angs[-1] + 0.08
    bm = K.bm("marble")
    prof = [(R - 0.24, 2.57), (R - 0.24, 2.90), (R - 0.31, 2.95), (R - 0.31, 3.02), (R + 0.31, 3.02),
            (R + 0.31, 2.95), (R + 0.24, 2.90), (R + 0.24, 2.57)]
    segs = 18
    rows = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        rows.append([bm.verts.new((r * math.cos(a), cy0 + r * math.sin(a), BASE_H + z)) for r, z in prof])
    for i in range(segs):
        for j in range(len(prof) - 1):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
        bm.faces.new((rows[i][-1], rows[i][0], rows[i + 1][0], rows[i + 1][-1]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    # crystal clusters (special: quartz)
    crystal_cluster(K, "special", (-2.55, 2.55, BASE_H), 3.1, 10, 11)
    crystal_cluster(K, "special", (2.7, 2.35, BASE_H), 2.3, 8, 12)
    crystal_cluster(K, "special", (-3.05, -2.35, BASE_H), 1.3, 6, 13)
    crystal_cluster(K, "special", (3.15, -2.95, BASE_H), 0.75, 4, 14)
    crystal_cluster(K, "special", (0.9, 3.75, BASE_H), 1.0, 5, 15)
    # trade table with the brass balance
    tf = Frame(2.45, -0.75, BASE_H, 0.35)
    K.box("marble", tf.p(0, 0, 0.84), (1.35, 0.72, 0.08), tf.yaw, bevel=0.015)
    for sx in (-1, 1):
        K.box("wood", tf.p(sx * 0.5, 0, 0.40), (0.08, 0.6, 0.8), tf.yaw, bevel=0.01)
        K.box("wood", tf.p(sx * 0.5, 0, 0.05), (0.12, 0.7, 0.08), tf.yaw, bevel=0.01)
    K.box("wood", tf.p(0, 0, 0.30), (1.0, 0.06, 0.06), tf.yaw)
    K.col_box(tf.p(0, 0, 0.45), (1.35, 0.72, 0.9), tf.yaw)
    balance_scale(K, tuple(tf.p(-0.15, 0.05, 0.88)), 1.25, pan_load={-1: ("salt", 0.08), 1: ("brass", 0.03)})
    for i in range(4):
        K.cyl("brass", tf.p(0.35 + 0.06 * i, -0.18, 0.88), 0.025 - 0.003 * i, 0.03 + 0.012 * (3 - i), 10)
    K.box("paper", tf.p(0.4, 0.15, 0.89), (0.28, 0.2, 0.02), tf.yaw + 0.2)
    # salt goods: blocks, cones and sacks (left)
    gf = Frame(-2.35, -0.55, BASE_H, -0.25)
    for i, (lx, ly, lz) in enumerate(((0, 0, 0), (0.42, 0, 0), (0.21, 0.27, 0), (0.1, 0.0, 0.2), (0.32, 0.12, 0.2),
                                      (0.2, 0.1, 0.4), (-0.05, 0.3, 0.0))):
        K.box("salt", gf.p(lx, ly, lz + 0.1), (0.4, 0.26, 0.2), gf.yaw + K.rng.uniform(-0.1, 0.1), bevel=0.02)
    K.col_box(gf.p(0.2, 0.12, 0.3), (0.9, 0.7, 0.6), gf.yaw)
    for i, (x, y) in enumerate(((-2.95, 0.55), (-2.55, 0.85), (-3.1, 1.1))):
        sack(K, (x, y, BASE_H), 0.26, 0.6, "cloth_cream", seed=i)
    K.col_cyl((-2.85, 0.85, 0), 0.6, 0.7)
    K.rev("salt", [(0.001, 0.0), (0.2, 0.0), (0.001, 0.32)], 12, (-2.2, 0.35, BASE_H))
    # something hidden: a chest under a cloth, behind the colonnade
    hf = Frame(-0.65, 3.55, BASE_H, 0.1)
    chest(K, hf, (0.8, 0.5, 0.55), wood="wood", band="iron", lock="brass")

    def drape(u, v):
        lx = -0.55 + 1.1 * u
        ly = -0.38 + 0.76 * v
        inside = max(abs(lx) / 0.46, abs(ly) / 0.3)
        z = 0.62 if inside < 1 else max(0.03, 0.62 - (inside - 1) * 1.8)
        z += 0.025 * math.sin(u * 19 + v * 7)
        return hf.p(lx, ly, z)
    K.surface("cloth_cream", drape, 16, 12)
    clutter(K, "salt", 16, 3, size=(0.04, 0.10))
    K.notes += ["five quartz clusters (special material), the largest 3.1 m",
                "six-column marble colonnade with a curved architrave",
                "trade table with a brass balance, salt in one pan and weights in the other",
                "stacked salt blocks, a salt cone and sacks",
                "a padlocked chest hidden under a cloth behind the columns"]


def camp_pepel(K):
    """Ash: charcoal pagoda shelter, sharpened palisade, brazier, alarm bell, woodpile."""
    camp_base(K, "ground_ash", "stone")
    agent_circle(K, "stone", "iron")
    # shelter posts on stone footings
    px, py0, py1, ph = 1.85, 1.35, 3.25, 2.45
    tops = []
    for sx in (-1, 1):
        for y in (py0, py1):
            K.box("stone", (sx * px, y, BASE_H + 0.1), (0.36, 0.36, 0.2), 0.0, bevel=0.03)
            tops.append(post(K, "wood_dark", (sx * px, y, BASE_H + 0.2), ph - 0.2, 0.18))
            K.col_cyl((sx * px, y, 0), 0.18, ph + 0.2)
    for a, b in ((0, 1), (2, 3), (0, 2), (1, 3)):
        K.beam("wood_dark", tops[a] + Vector((0, 0, -0.08)), tops[b] + Vector((0, 0, -0.08)), 0.16, 0.2, bevel=0.012)
    # concave hip roof with upturned corners
    ex0, ex1, ey0, ey1 = -2.75, 2.75, 0.45, 4.15
    rx, ryc, rz = 0.75, (ey0 + ey1) / 2, 3.95

    def eave(s):
        # perimeter parameter s in [0,4): edges front, right, back, left
        e = int(s) % 4
        t = s - int(s)
        if e == 0:
            x, y = ex0 + (ex1 - ex0) * t, ey0
        elif e == 1:
            x, y = ex1, ey0 + (ey1 - ey0) * t
        elif e == 2:
            x, y = ex1 - (ex1 - ex0) * t, ey1
        else:
            x, y = ex0, ey1 - (ey1 - ey0) * t
        corner = 1.0 - min(1.0, min(t, 1 - t) * 2.2)
        return Vector((x, y, 2.55 + 0.42 * corner ** 2.2))

    def ridge(s):
        e = int(s) % 4
        t = s - int(s)
        if e == 0:
            x = -rx + 2 * rx * t
            return Vector((x, ryc, rz))
        if e == 1:
            return Vector((rx, ryc, rz))
        if e == 2:
            return Vector((rx - 2 * rx * t, ryc, rz))
        return Vector((-rx, ryc, rz))

    def roof(u, v):
        s = 4.0 * u
        a, b = eave(s), ridge(s)
        w = v ** 1.7
        p = a.lerp(b, v)
        p.z = a.z + (b.z - a.z) * w
        return p
    K.surface("shingle_dark", roof, 56, 7, closed_u=True)
    # eave fascia and ridge beam
    pts = [eave(4.0 * i / 56) for i in range(56)]
    K.tube("wood_dark", pts, 0.05, 5, closed=True)
    K.beam("wood_dark", (-rx - 0.2, ryc, rz + 0.04), (rx + 0.2, ryc, rz + 0.04), 0.14, 0.14, bevel=0.01)
    for sx in (-1, 1):
        K.tube("wood_dark", [(sx * (rx + 0.15), ryc, rz + 0.06), (sx * (rx + 0.38), ryc, rz + 0.16),
                             (sx * (rx + 0.5), ryc, rz + 0.36)], lambda t: 0.06 * (1 - 0.6 * t), 6)
    for i in range(4):
        c = eave(i + 0.0)
        K.tube("wood_dark", [c, c + Vector((0, 0, 0.12)) + (c - Vector((0, ryc, c.z))).normalized() * 0.12], 0.035, 5)
    # alarm bell under the front eave
    K.beam("wood_dark", (-0.5, py0 - 0.05, 2.45), (0.5, py0 - 0.05, 2.45), 0.08, 0.08)
    K.tube("rope", [(0, py0 - 0.05, 2.42), (0, py0 - 0.05, 2.2)], 0.012, 4)
    K.rev("iron", [(0.001, 2.20), (0.05, 2.19), (0.09, 2.10), (0.11, 1.96), (0.15, 1.88), (0.14, 1.86),
                   (0.001, 1.9)], 16, (0, py0 - 0.05, 0))
    # sleeping mat and a low chest inside
    K.box("cloth_red", (0.6, 2.6, BASE_H + 0.03), (1.0, 1.9, 0.06), 0.05, bevel=0.01)
    chest(K, Frame(-1.0, 2.9, BASE_H, 0.1), (0.75, 0.45, 0.45), wood="wood_dark", band="iron", lock="iron")
    # palisade: sharpened stakes on an arc that leaves the front open
    cx, cyp, Rp = 0.0, 0.25, 3.85
    a_start, a_end = math.radians(-35), math.radians(215)
    n = 64
    rail_pts = {0.55: [], 1.35: []}
    for i in range(n):
        a = a_start + (a_end - a_start) * i / (n - 1)
        r = Rp + K.rng.uniform(-0.05, 0.05)
        x, y = cx + r * math.cos(a), cyp + r * math.sin(a)
        h = K.rng.uniform(1.75, 2.35)
        lean = Vector((math.cos(a), math.sin(a), 0)) * K.rng.uniform(0.05, 0.18)
        base = Vector((x, y, BASE_H - 0.05))
        top = base + Vector((0, 0, h)) + lean
        rad = K.rng.uniform(0.055, 0.075)
        K.tube("wood_dark", [base, base + (top - base) * 0.88], rad, 6, cap=False)
        tip = top + (top - base).normalized() * 0.04
        bm = K.bm("wood_dark")
        ring = []
        d = (top - base).normalized()
        u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        if u.length < 0.5:
            u = Vector((1, 0, 0))
        v = d.cross(u)
        cpt = base + (top - base) * 0.88
        ring = [bm.verts.new(cpt + (u * math.cos(TAU * k / 6) + v * math.sin(TAU * k / 6)) * rad) for k in range(6)]
        tv = bm.verts.new(tip)
        for k in range(6):
            bm.faces.new((ring[k], ring[(k + 1) % 6], tv))
        for hz in rail_pts:
            rail_pts[hz].append(Vector((cx + (Rp - 0.1) * math.cos(a), cyp + (Rp - 0.1) * math.sin(a), BASE_H + hz)))
    for hz, pts in rail_pts.items():
        K.tube("wood_dark", pts, 0.045, 5)
        for j in range(0, len(pts), 4):
            K.tube("rope", [pts[j] + Vector((0, 0, -0.06)), pts[j] + Vector((0, 0, 0.06))], 0.055, 5)
    nb = 10
    for j in range(nb):
        aa = a_start + (a_end - a_start) * j / nb
        ab = a_start + (a_end - a_start) * (j + 1) / nb
        K.col_beam((cx + Rp * math.cos(aa), cyp + Rp * math.sin(aa), 1.1),
                   (cx + Rp * math.cos(ab), cyp + Rp * math.sin(ab), 1.1), 0.3, 2.3)
    # brazier: iron tripod and basket with glowing embers (special)
    bx, by_ = 2.45, -1.7
    for k in range(3):
        a = TAU * k / 3 + 0.4
        K.tube("iron", [(bx + 0.42 * math.cos(a), by_ + 0.42 * math.sin(a), BASE_H),
                        (bx + 0.16 * math.cos(a), by_ + 0.16 * math.sin(a), BASE_H + 0.75),
                        (bx + 0.28 * math.cos(a), by_ + 0.28 * math.sin(a), BASE_H + 0.98)], 0.02, 5)
    for zz, rr in ((0.72, 0.2), (0.86, 0.27), (1.0, 0.31)):
        K.tube("iron", [(bx + rr * math.cos(TAU * i / 16), by_ + rr * math.sin(TAU * i / 16), BASE_H + zz) for i in range(16)],
               0.014, 4, closed=True)
    for k in range(8):
        a = TAU * k / 8
        K.tube("iron", [(bx + 0.2 * math.cos(a), by_ + 0.2 * math.sin(a), BASE_H + 0.72),
                        (bx + 0.31 * math.cos(a), by_ + 0.31 * math.sin(a), BASE_H + 1.0)], 0.01, 4)
    K.ico("special", (bx, by_, BASE_H + 0.86), 0.24, scale=(1, 1, 0.45), sub=2, noise=0.3, seed=5)
    for k in range(7):
        a = K.rng.uniform(0, TAU)
        K.ico("wood_dark", (bx + 0.13 * math.cos(a), by_ + 0.13 * math.sin(a), BASE_H + 0.93), 0.07, sub=1, noise=0.3,
              seed=k)
    K.col_cyl((bx, by_, 0), 0.45, 1.1)
    # woodpile, chopping block and axe (left)
    wf = Frame(-2.55, -1.15, BASE_H, 0.45)
    for row, cnt in enumerate((4, 3, 2)):
        for i in range(cnt):
            lx = (i - (cnt - 1) / 2) * 0.2
            K.tube("wood_dark", [wf.p(lx, -0.45, 0.1 + row * 0.17), wf.p(lx, 0.45, 0.1 + row * 0.17)], 0.09, 7)
    K.col_box(wf.p(0, 0, 0.3), (0.9, 1.0, 0.6), wf.yaw)
    K.cyl("wood", (-2.0, -2.2, BASE_H), 0.26, 0.45, 12)
    K.col_cyl((-2.0, -2.2, 0), 0.28, 0.6)
    K.tube("wood", [(-2.0, -2.2, BASE_H + 0.42), (-1.75, -2.35, BASE_H + 0.95)], 0.02, 6)
    K.box("iron", (-2.05, -2.17, BASE_H + 0.47), (0.18, 0.02, 0.12), 0.55, bevel=0.004)
    # spears leaning on the palisade (left back)
    for i in range(4):
        x0 = -3.0 + 0.18 * i
        base = Vector((x0, 1.6 + 0.1 * i, BASE_H))
        top = Vector((x0 - 0.5, 2.0 + 0.1 * i, BASE_H + 2.3))
        K.tube("wood", [base, top], 0.018, 5)
        d = (top - base).normalized()
        ftf.tube(K.bm("iron"), [top, top + d * 0.08, top + d * 0.26], lambda t: 0.03 * (1 - t) + 0.002, 4)
    clutter(K, "wood_dark", 12, 4, size=(0.06, 0.14), squash=0.5)
    clutter(K, "ground_ash", 6, 5, size=(0.25, 0.4), squash=0.25, rmin=2.2, rmax=3.4)
    K.notes += ["charred pagoda shelter with a concave hip roof and upturned corners",
                "palisade of 64 sharpened stakes with lashed rails, open toward the plaza",
                "iron brazier with glowing embers (special material)", "alarm bell under the front eave",
                "woodpile, chopping block with an axe, spears leaning on the stakes"]


def camp_moh(K):
    """Moss: an overgrown open dome with flowers, a shared cauldron, log benches."""
    camp_base(K, "ground_moss", "stone")
    agent_circle(K, "moss", "wood")
    dc, R, H = Vector((0, 2.35, BASE_H)), 2.15, 2.75
    arches = 6
    feet = []

    def dome_r(z):
        return R * (1 - (2 / math.pi) * math.asin(min(1.0, max(0.0, z / H)) ** (1 / 0.9)))
    for i in range(arches):
        a = math.radians(-20) + math.radians(220) * i / (arches - 1)
        foot = dc + Vector((R * math.cos(a), R * math.sin(a), 0))
        pts = []
        for k in range(11):
            t = k / 10
            p = foot.lerp(Vector((dc.x, dc.y, 0)) + Vector((0, 0, BASE_H)), t)
            p.z = BASE_H + H * math.sin(math.pi / 2 * t) ** 0.9
            pts.append(p)
        K.tube("wood", pts, lambda t: 0.065 - 0.02 * t, 7)
        feet.append(foot)
        K.col_cyl((foot.x, foot.y, 0), 0.12, 1.6)
    for hz in (0.9, 1.9):
        ring = []
        for k in range(17):
            a = math.radians(-20) + math.radians(220) * k / 16
            rr = dome_r(hz)
            ring.append(dc + Vector((rr * math.cos(a), rr * math.sin(a), hz)))
        K.tube("wood", ring, 0.04, 6)
    # leaf and moss cover along the arches, flowers, hanging vines (the arches stay readable)
    rng = K.rng
    arch_angles = [math.radians(-20) + math.radians(220) * i / (arches - 1) for i in range(arches)]
    for ai, a in enumerate(arch_angles):
        for k in range(9):
            t = (k + rng.uniform(0.1, 0.9)) / 9
            zz = BASE_H + H * math.sin(math.pi / 2 * t) ** 0.9
            rr = R * (1 - t) + 0.05
            aa = a + rng.uniform(-0.12, 0.12)
            p = dc + Vector((rr * math.cos(aa), rr * math.sin(aa), zz - BASE_H))
            leafy(K, (p.x, p.y, p.z - 0.12), rng.uniform(0.2, 0.36), 100 + ai * 20 + k, squash=0.55)
            if rng.random() < 0.7:
                q = p + Vector((math.cos(aa), math.sin(aa), 0)) * 0.22 + Vector((0, 0, rng.uniform(-0.05, 0.12)))
                K.ico("petal_mix", q, rng.uniform(0.07, 0.11), scale=(1, 1, 0.55), sub=1, noise=0.1, seed=ai * 50 + k)
    for i in range(10):
        a = math.radians(rng.uniform(-10, 190))
        zz = rng.uniform(0.65, 0.95) * H
        rr = dome_r(zz) + 0.04
        p = dc + Vector((rr * math.cos(a), rr * math.sin(a), zz))
        K.ico("moss", (p.x, p.y, p.z), rng.uniform(0.28, 0.42), scale=(1, 1, 0.35), sub=2, noise=0.15, seed=700 + i)
    # interior: moss beds, a hammock
    for i, (x, y) in enumerate(((-0.8, 2.9), (0.75, 3.0))):
        K.ico("moss", (x, y, BASE_H + 0.08), 0.6, scale=(1.0, 0.7, 0.22), sub=2, noise=0.1, seed=40 + i)
    K.surface("cloth_canvas", lambda u, v: Vector((-1.1 + 2.2 * u, 2.1 + 0.6 * v,
                                                   1.05 - 0.35 * math.sin(math.pi * u))), 10, 2)
    K.tube("rope", [(-1.1, 2.4, 1.05), (-dome_r(1.6), 2.35, 1.6)], 0.012, 4)
    K.tube("rope", [(1.1, 2.4, 1.05), (dome_r(1.6), 2.35, 1.6)], 0.012, 4)
    # shared cauldron on a hearth (front left)
    cx, cy = -2.2, -1.35
    for k in range(9):
        a = TAU * k / 9
        K.ico("stone", (cx + 0.72 * math.cos(a), cy + 0.72 * math.sin(a), BASE_H + 0.06), 0.16,
              scale=(1.2, 1.0, 0.7), sub=2, noise=0.25, seed=k)
    for k in range(3):
        a = TAU * k / 3 + 0.3
        K.tube("wood", [(cx + 0.45 * math.cos(a), cy + 0.45 * math.sin(a), BASE_H + 0.05),
                        (cx - 0.25 * math.cos(a), cy - 0.25 * math.sin(a), BASE_H + 0.18)], 0.05, 6)
    K.ico("special", (cx, cy, BASE_H + 0.12), 0.18, scale=(1, 1, 0.5), sub=1, noise=0.3, seed=3)
    K.rev("iron", [(0.001, 0.30), (0.25, 0.31), (0.45, 0.42), (0.55, 0.60), (0.53, 0.80), (0.48, 0.88),
                   (0.52, 0.92), (0.50, 0.95), (0.45, 0.92)], 20, (cx, cy, BASE_H))
    for k in range(3):
        a = TAU * k / 3
        K.tube("iron", [(cx + 0.38 * math.cos(a), cy + 0.38 * math.sin(a), BASE_H + 0.42),
                        (cx + 0.45 * math.cos(a), cy + 0.45 * math.sin(a), BASE_H)], 0.03, 5)
    K.cyl("special", (cx, cy, BASE_H + 0.82), 0.47, 0.01, 20)
    for k in range(2):
        a = TAU * k / 2 + 0.6
        K.tube("iron", [(cx + 0.5 * math.cos(a), cy + 0.5 * math.sin(a), BASE_H + 0.9),
                        (cx + 0.62 * math.cos(a), cy + 0.62 * math.sin(a), BASE_H + 0.98),
                        (cx + 0.5 * math.cos(a), cy + 0.5 * math.sin(a), BASE_H + 1.06)], 0.015, 4)
    K.tube("wood", [(cx + 0.1, cy, BASE_H + 0.7), (cx + 0.55, cy - 0.35, BASE_H + 1.25)], 0.02, 6)
    K.col_cyl((cx, cy, 0), 0.85, 1.1)
    for i in range(4):
        K.rev("clay", [(0.001, 0.0), (0.05, 0.0), (0.09, 0.05), (0.095, 0.06)], 12,
              (cx + 1.05, cy - 0.35, BASE_H + 0.05 * i))
    # log benches with moss (open circle around the hologram)
    for i, (x, y, yaw) in enumerate(((2.75, 0.05, 1.45), (-2.75, 0.75, -1.35), (2.55, -2.0, 0.75))):
        f = Frame(x, y, BASE_H, yaw)
        a, b = f.p(-0.8, 0, 0.22), f.p(0.8, 0, 0.22)
        K.tube("wood", [a, b], 0.22, 10)
        for k in range(4):
            leafy(K, tuple(f.p(-0.6 + 0.4 * k, 0.0, 0.3)), 0.2, 200 + i * 10 + k, kind="moss", squash=0.5)
        K.col_beam(f.p(-0.85, 0, 0.0), f.p(0.85, 0, 0.0), 0.5, 0.48)
    # mushrooms, ferns and flower patches
    for i in range(14):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(2.8, 3.7)
        x, y = rr * math.cos(a), rr * math.sin(a)
        if y < -2.0 and abs(x) < 1.5:
            continue
        h = rng.uniform(0.06, 0.18)
        K.cyl("cloth_cream", (x, y, BASE_H), 0.015 + h * 0.08, h, 6)
        K.rev("mushroom", [(0.001, h + 0.035), (h * 0.5, h + 0.01), (h * 0.55, h - 0.005), (0.01, h)], 8, (x, y, BASE_H))
    for i in range(10):
        a = rng.uniform(0, TAU)
        rr = rng.uniform(3.0, 3.75)
        x, y = rr * math.cos(a), rr * math.sin(a)
        if y < -2.2 and abs(x) < 1.4:
            continue
        leafy(K, (x, y, BASE_H), rng.uniform(0.18, 0.32), 300 + i, squash=0.8)
        for k in range(4):
            K.ico("petal_mix", (x + rng.uniform(-0.25, 0.25), y + rng.uniform(-0.25, 0.25), BASE_H + 0.15), 0.05,
                  scale=(1, 1, 0.5), sub=1, noise=0.1, seed=500 + i * 5 + k)
    # mossy stump with a lantern-like glowing mushroom cluster
    K.rev("wood", [(0.32, 0.0), (0.27, 0.15), (0.25, 0.5), (0.001, 0.52)], 10, (3.05, 1.75, BASE_H))
    leafy(K, (3.05, 1.75, BASE_H + 0.45), 0.24, 77, kind="moss", squash=0.4)
    K.col_cyl((3.05, 1.75, 0), 0.32, 0.6)
    clutter(K, "stone", 10, 6, squash=0.5)
    clutter(K, "moss", 8, 7, size=(0.15, 0.3), squash=0.4, rmin=2.6, rmax=3.8)
    K.notes += ["open dome of six bent arches overgrown with leaves, moss and flowers",
                "shared iron cauldron on a stone hearth with glowing brew (special) and bowls",
                "three mossy log benches around the hologram circle", "moss beds and a hammock under the dome",
                "mushrooms, ferns and flower patches, a mossy stump"]


def camp_yantar(K):
    """Amber: warm octagonal pavilion, padlocked chests, a hanging beam balance, coins."""
    camp_base(K, "deck_warm", "wood_warm")
    agent_circle(K, "wood_warm", "brass")
    pc, R = Vector((0, 2.3, BASE_H)), 1.85
    tops = []
    for i in range(8):
        a = TAU * i / 8 + math.pi / 8
        p = pc + Vector((R * math.cos(a), R * math.sin(a), 0))
        K.cyl("stone", (p.x, p.y, BASE_H - 0.01), 0.12, 0.1, 8)
        tops.append(post(K, "wood_warm", (p.x, p.y, BASE_H + 0.09), 2.25, 0.14))
        K.col_cyl((p.x, p.y, 0), 0.12, 2.4)
    for i in range(8):
        a, b = tops[i], tops[(i + 1) % 8]
        K.beam("wood_warm", a - Vector((0, 0, 0.06)), b - Vector((0, 0, 0.06)), 0.12, 0.16, bevel=0.01)
    # balustrade on the five back sides
    for i in range(1, 6):
        a, b = tops[i], tops[(i + 1) % 8]
        a0 = Vector((a.x, a.y, BASE_H)); b0 = Vector((b.x, b.y, BASE_H))
        K.beam("wood_warm", a0 + Vector((0, 0, 0.92)), b0 + Vector((0, 0, 0.92)), 0.08, 0.06, bevel=0.008)
        K.beam("wood_warm", a0 + Vector((0, 0, 0.12)), b0 + Vector((0, 0, 0.12)), 0.07, 0.06, bevel=0.006)
        for k in range(1, 7):
            q = a0.lerp(b0, k / 7)
            K.box("wood_warm", q + Vector((0, 0, 0.52)), (0.035, 0.035, 0.78), math.atan2(b0.y - a0.y, b0.x - a0.x))
        K.col_beam(a0 + Vector((0, 0, 0.0)), b0 + Vector((0, 0, 0.0)), 0.15, 1.0)
    # conical shingle roof with finial
    K.rev("shingle_warm", [(2.55, BASE_H + 2.12), (1.9, BASE_H + 2.55), (1.0, BASE_H + 3.1), (0.25, BASE_H + 3.6),
                           (0.001, BASE_H + 3.75)], 8, (pc.x, pc.y, 0), phase=math.pi / 8)
    K.rev("wood_warm", [(2.6, BASE_H + 2.06), (2.6, BASE_H + 2.14), (2.5, BASE_H + 2.15)], 8, (pc.x, pc.y, 0),
          phase=math.pi / 8)
    K.rev("brass", [(0.08, BASE_H + 3.7), (0.10, BASE_H + 3.8), (0.05, BASE_H + 3.9), (0.08, BASE_H + 4.0),
                    (0.001, BASE_H + 4.25)], 10, (pc.x, pc.y, 0))
    # central hanging amber lantern and a ledger desk with coins
    lantern(K, (pc.x, pc.y, BASE_H + 2.95), hang=0.8, scale=1.6)
    df = Frame(0.0, 2.95, BASE_H, 0.0)
    K.box("wood_warm", df.p(0, 0, 0.82), (1.5, 0.6, 0.07), 0.0, bevel=0.012)
    K.box("wood_warm", df.p(0, 0.18, 0.42), (1.4, 0.06, 0.78), 0.0, bevel=0.01)
    for sx in (-1, 1):
        K.box("wood_warm", df.p(sx * 0.68, 0, 0.42), (0.07, 0.55, 0.78), 0.0, bevel=0.008)
    K.col_box(df.p(0, 0, 0.45), (1.5, 0.6, 0.9))
    K.box("cloth_red", df.p(-0.25, -0.02, 0.87), (0.42, 0.3, 0.035), 0.08, bevel=0.005)
    K.box("paper", df.p(-0.25, -0.02, 0.892), (0.40, 0.28, 0.01), 0.08)
    for i in range(6):
        h = 0.02 + 0.012 * (i % 4)
        K.cyl("brass", df.p(0.25 + 0.07 * (i % 3), -0.1 + 0.09 * (i // 3), 0.855), 0.024, h, 10)
    K.rev("brass", [(0.001, 0.0), (0.06, 0.0), (0.08, 0.04), (0.06, 0.07), (0.001, 0.07)], 10, df.p(0.55, 0.12, 0.855))
    # chests with iron bands and padlocks (left), stacked
    chest(K, Frame(-2.75, -0.55, BASE_H, 0.35), (0.9, 0.55, 0.55), wood="wood_warm", band="iron", lock="brass")
    chest(K, Frame(-2.95, 0.55, BASE_H, 0.1), (1.0, 0.6, 0.6), wood="wood", band="iron", lock="brass")
    chest(K, Frame(-2.95, 0.55, BASE_H + 0.62, 0.25), (0.7, 0.45, 0.42), wood="wood_warm", band="brass", lock="iron")
    chest(K, Frame(-2.1, -1.6, BASE_H, -0.4), (0.6, 0.4, 0.4), wood="wood_warm", band="brass", lock="brass")
    for i, (x, y) in enumerate(((-2.75, -0.85), (-2.6, 0.25), (-2.25, -1.85))):
        K.tube("rope", [(x, y, BASE_H + 0.5), (x - 0.02, y - 0.05, BASE_H + 0.38)], 0.003, 3)
        K.box("paper", (x - 0.03, y - 0.06, BASE_H + 0.33), (0.08, 0.005, 0.11), 0.3)
    # beam balance on a timber frame (right)
    bf = Frame(2.65, -0.45, BASE_H, 1.57)
    for sx in (-1, 1):
        post(K, "wood_warm", tuple(bf.p(sx * 0.85, 0, 0)), 2.25, 0.12)
        K.box("wood_warm", bf.p(sx * 0.85, 0, 0.06), (0.4, 0.4, 0.12), bf.yaw, bevel=0.02)
        K.col_cyl(tuple(bf.p(sx * 0.85, 0, -BASE_H)), 0.14, 2.5)
    K.beam("wood_warm", bf.p(-1.0, 0, 2.3), bf.p(1.0, 0, 2.3), 0.14, 0.16, bevel=0.012)
    hook = bf.p(0, 0, 2.22)
    K.tube("iron", [hook, hook - Vector((0, 0, 0.35))], 0.012, 4)
    bz = hook.z - 0.38
    K.beam("brass", bf.p(-0.6, 0, bz - BASE_H), bf.p(0.6, 0, bz - BASE_H), 0.03, 0.045, bevel=0.005)
    K.rev("brass", [(0.001, 0.0), (0.03, 0.03), (0.001, 0.2)], 4, (hook.x, hook.y, bz))
    for sx, load in ((-1, 0.10), (1, 0.03)):
        hx = bf.p(sx * 0.58, 0, 0)
        pz = BASE_H + 1.15 + (0.05 if sx > 0 else -0.05)
        for k in range(3):
            a = TAU * k / 3
            K.tube("iron", [(hx.x, hx.y, bz - 0.02), (hx.x + 0.2 * math.cos(a), hx.y + 0.2 * math.sin(a), pz + 0.03)],
                   0.004, 3)
        K.rev("brass", [(0.001, pz), (0.12, pz + 0.01), (0.24, pz + 0.05), (0.25, pz + 0.06)], 16, (hx.x, hx.y, 0))
        K.rev("brass" if sx > 0 else "salt", [(0.12, pz + 0.04), (0.001, pz + 0.04 + load)], 10, (hx.x, hx.y, 0))
    for i in range(5):
        K.cyl("iron", bf.p(-0.35 + 0.16 * i, 0.32, 0.0), 0.06 - 0.008 * i, 0.08 + 0.02 * (4 - i), 10)
    # strongbox chained shut + padlock rack on a post
    sb = Frame(2.6, 1.55, BASE_H, -0.3)
    K.box("iron", sb.p(0, 0, 0.3), (0.6, 0.5, 0.6), sb.yaw, bevel=0.02)
    for k in range(9):
        lz = 0.05 + 0.07 * k
        a = k * 0.6
        link = [sb.p(0.31 + 0.02 * math.cos(TAU * i / 6 + a), 0.03 * math.sin(TAU * i / 6), lz + 0.035 * math.sin(TAU * i / 6))
                for i in range(6)]
        K.tube("iron", link, 0.007, 4, closed=True)
    K.box("brass", sb.p(0.34, 0, 0.32), (0.04, 0.09, 0.1), sb.yaw, bevel=0.006)
    K.col_box(sb.p(0, 0, 0.3), (0.65, 0.55, 0.65), sb.yaw)
    # lantern posts at the front corners
    for sx in (-1, 1):
        lp = post(K, "wood_warm", (sx * 3.15, -2.95, BASE_H), 1.6, 0.11)
        K.beam("wood_warm", lp, lp + Vector((-sx * 0.3, 0, 0)), 0.06, 0.06)
        lantern(K, lp + Vector((-sx * 0.28, 0, -0.02)), hang=0.1, scale=1.0)
        K.col_cyl((sx * 3.15, -2.95, 0), 0.1, 1.8)
    for i, (x, y) in enumerate(((-2.2, 0.15), (-3.35, -1.35), (-1.75, 1.15))):
        sack(K, (x, y, BASE_H), 0.17, 0.32, "cloth_canvas", seed=20 + i)
        for k in range(5):
            K.cyl("brass", (x + 0.2 + 0.035 * k, y - 0.15, BASE_H), 0.022, 0.006, 10)
    K.notes += ["octagonal warm-wood pavilion with a shingle roof, balustrade and brass finial",
                "four padlocked chests with iron/brass bands and price tags",
                "beam balance on a timber frame with pans and iron weights",
                "iron strongbox chained shut", "ledger desk with coin stacks and a hanging amber lantern"]


def camp_iney(K):
    """Frost: a blue glass pavilion, tables of signs, armillary sphere and telescope."""
    camp_base(K, "paving_frost", "stone_light")
    agent_circle(K, "stone_light", "pale_metal")
    x0, x1, y0, y1, h, rz = -2.35, 2.35, 1.35, 3.75, 2.35, 3.35
    corners = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    tops = {}
    for (x, y) in corners:
        K.box("stone_light", (x, y, BASE_H + 0.08), (0.3, 0.3, 0.16), 0.0, bevel=0.02)
        tops[(x, y)] = post(K, "pale_metal", (x, y, BASE_H + 0.16), h - 0.16, 0.09, bevel=0.01)
        K.col_cyl((x, y, 0), 0.12, h + 0.2)
    for a, b in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        K.beam("pale_metal", tops[a], tops[b], 0.08, 0.1, bevel=0.008)
    rf, rb = Vector((0, y0 - 0.25, BASE_H + rz)), Vector((0, y1 + 0.25, BASE_H + rz))
    K.beam("pale_metal", rf, rb, 0.08, 0.1, bevel=0.008)
    nr = 5
    for i in range(nr):
        y = y0 - 0.25 + (y1 - y0 + 0.5) * i / (nr - 1)
        for sx in (-1, 1):
            K.beam("pale_metal", (0, y, BASE_H + rz), (sx * (x1 + 0.3), y, BASE_H + h - 0.12), 0.05, 0.06)
    # glass: roof slopes, back wall, upper side walls (special: blue glass)
    for sx in (-1, 1):
        K.poly("special", [Vector((0, y0 - 0.25, BASE_H + rz + 0.06)), Vector((sx * (x1 + 0.3), y0 - 0.25, BASE_H + h - 0.06)),
                           Vector((sx * (x1 + 0.3), y1 + 0.25, BASE_H + h - 0.06)), Vector((0, y1 + 0.25, BASE_H + rz + 0.06))])
        K.poly("special", [Vector((sx * x1, y0 + 0.05, BASE_H + 1.0)), Vector((sx * x1, y1 - 0.05, BASE_H + 1.0)),
                           Vector((sx * x1, y1 - 0.05, BASE_H + h - 0.05)), Vector((sx * x1, y0 + 0.05, BASE_H + h - 0.05))])
        K.beam("pale_metal", (sx * x1, y0, BASE_H + 1.0), (sx * x1, y1, BASE_H + 1.0), 0.06, 0.05)
        K.col_box((sx * x1, (y0 + y1) / 2, 1.3), (0.2, y1 - y0, 2.6))
    K.poly("special", [Vector((x0 + 0.05, y1, BASE_H + 0.15)), Vector((x1 - 0.05, y1, BASE_H + 0.15)),
                       Vector((x1 - 0.05, y1, BASE_H + h - 0.05)), Vector((0, y1, BASE_H + rz - 0.05)),
                       Vector((x0 + 0.05, y1, BASE_H + h - 0.05))])
    K.col_box((0, y1, 1.3), (x1 - x0, 0.2, 2.6))
    for x in (-1.2, 0.0, 1.2):
        K.beam("pale_metal", (x, y1, BASE_H + 0.15), (x, y1, BASE_H + (h if abs(x) > 0.1 else rz) - 0.05), 0.04, 0.04)
    # long table with three slate tablets of signs (inside)
    tf = Frame(0.0, 3.05, BASE_H, 0.0)
    K.box("stone_light", tf.p(0, 0, 0.82), (2.8, 0.7, 0.08), 0.0, bevel=0.015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            K.box("pale_metal", tf.p(sx * 1.25, sy * 0.25, 0.4), (0.05, 0.05, 0.78), 0.0)
    K.col_box(tf.p(0, 0, 0.45), (2.8, 0.7, 0.9))
    for i, x in enumerate((-0.9, 0.0, 0.9)):
        c = tf.p(x, 0.1, 0.86 + 0.32)
        K.box("slate", c, (0.62, 0.05, 0.64), 0.0, bevel=0.01)
        K.box("pale_metal", c + Vector((0, 0.04, -0.32)), (0.66, 0.08, 0.03), 0.0)
        ring_sign(K, "pale_metal", c + Vector((0, -0.026, 0.0)), (0, -1), 0.16, 60 + i, thick=0.008)
    # big table of signs on an easel (left, facing the hologram)
    ef = Frame(-2.75, 0.35, BASE_H, -1.15)
    board_c = ef.p(0, 0, 1.25)
    K.box("slate", board_c, (1.5, 0.06, 1.05), ef.yaw + 0.0, bevel=0.012)
    for sx in (-1, 1):
        K.tube("pale_metal", [ef.p(sx * 0.62, -0.25, 0.0), ef.p(sx * 0.62, 0.05, 1.85)], 0.025, 6)
    K.tube("pale_metal", [ef.p(0, 0.6, 0.0), ef.p(0, 0.06, 1.7)], 0.025, 6)
    K.beam("pale_metal", ef.p(-0.72, -0.08, 0.7), ef.p(0.72, -0.08, 0.7), 0.06, 0.04)
    n_dir = Vector(rot_xy(0, -1, ef.yaw))
    for i in range(3):
        for j in range(2):
            c = ef.p(-0.48 + 0.48 * i, -0.035, 1.03 + 0.42 * j)
            ring_sign(K, "pale_metal", c, (n_dir.x, n_dir.y), 0.11, 80 + i * 2 + j, thick=0.006)
    K.col_box(ef.p(0, 0.1, 0.9), (1.6, 0.8, 1.8), ef.yaw)
    # armillary sphere on a stone pedestal (right front)
    ax_, ay_ = 2.55, -0.95
    K.rev("stone_light", [(0.28, 0.0), (0.28, 0.08), (0.18, 0.14), (0.14, 0.75), (0.2, 0.82), (0.22, 0.88),
                          (0.001, 0.9)], 12, (ax_, ay_, BASE_H), cap_bottom=True)
    cz = BASE_H + 0.9 + 0.42
    K.tube("pale_metal", [(ax_, ay_, BASE_H + 0.88), (ax_, ay_, cz - 0.36)], 0.02, 6)
    for k, (rx_, rot) in enumerate(((0.36, Matrix.Rotation(0, 3, "X")), (0.36, Matrix.Rotation(math.pi / 2, 3, "X")),
                                    (0.34, Matrix.Rotation(math.pi / 2, 3, "Y")),
                                    (0.33, Matrix.Rotation(0.41, 3, "X") @ Matrix.Rotation(0.3, 3, "Z")))):
        pts = [Vector((ax_, ay_, cz)) + rot @ Vector((rx_ * math.cos(TAU * i / 28), rx_ * math.sin(TAU * i / 28), 0))
               for i in range(28)]
        K.tube("brass" if k == 3 else "pale_metal", pts, 0.012 if k < 3 else 0.02, 5, closed=True)
    K.tube("pale_metal", [(ax_, ay_ - 0.0, cz - 0.42), (ax_, ay_, cz + 0.42)], 0.008, 4)
    K.ico("brass", (ax_, ay_, cz), 0.06, sub=2, noise=0.0)
    K.col_cyl((ax_, ay_, 0), 0.35, 1.8)
    # telescope on a tripod (left front), aimed at the sky where the Shells hover
    tx, ty = -2.45, -1.7
    head = Vector((tx, ty, BASE_H + 1.25))
    for k in range(3):
        a = TAU * k / 3 + 0.5
        K.tube("wood", [(tx + 0.5 * math.cos(a), ty + 0.5 * math.sin(a), BASE_H), head - Vector((0, 0, 0.03))], 0.02, 6)
    K.ico("brass", head, 0.05, sub=1, noise=0.0)
    d = Vector((0.35, -0.55, 0.75)).normalized()
    a, b = head - d * 0.55, head + d * 0.75
    ftf.tube(K.bm("brass"), [a, a.lerp(b, 0.45), a.lerp(b, 0.46), b], lambda t: 0.04 + 0.035 * t, 12)
    ftf.tube(K.bm("pale_metal"), [a.lerp(b, 0.2), a.lerp(b, 0.25)], 0.05, 12)
    K.col_cyl((tx, ty, 0), 0.5, 1.5)
    # frost crystals (special glass) at the edges, and a small instrument chest
    for i, (x, y, hh) in enumerate(((3.15, 1.0, 1.25), (-3.2, 2.45, 1.0), (3.0, -2.9, 0.75), (-1.0, 3.9, 0.8))):
        crystal_cluster(K, "special", (x, y, BASE_H), hh, 5, 70 + i, rock_kind="stone_light", spread=0.35)
    chest(K, Frame(1.55, 2.5, BASE_H, 0.0), (0.7, 0.45, 0.4), wood="wood", band="pale_metal", lock="brass")
    clutter(K, "stone_light", 12, 8)
    K.notes += ["blue glass pavilion on a pale metal frame (glass = special material, alpha blended)",
                "long table with three slate tablets of ring signs",
                "big easel board with a 3 x 2 table of signs facing the hologram circle",
                "armillary sphere on a stone pedestal", "brass telescope on a tripod aimed at the sky",
                "frost crystal clusters and an instrument chest"]


CAMPS = {
    "iris": dict(label="Iris", fn=camp_iris, special=dict(name="Glow", color=(0.9, 0.55, 0.22), rough=0.3,
                                                          emit=(1.0, 0.56, 0.20), emit_strength=6.0)),
    "sol": dict(label="Salt", fn=camp_sol, special=dict(name="Quartz", color=(0.86, 0.89, 0.92), rough=0.07,
                                                         ior=1.55, transmission=0.0, flat=True)),
    "pepel": dict(label="Ash", fn=camp_pepel, special=dict(name="Ember", color=(0.25, 0.06, 0.02), rough=0.8,
                                                            emit=(1.0, 0.30, 0.05), emit_strength=8.0)),
    "moh": dict(label="Moss", fn=camp_moh, special=dict(name="Brew", color=(0.22, 0.42, 0.10), rough=0.15,
                                                         emit=(0.45, 0.85, 0.18), emit_strength=2.2)),
    "yantar": dict(label="Amber", fn=camp_yantar, special=dict(name="Glow", color=(0.9, 0.5, 0.15), rough=0.3,
                                                               emit=(1.0, 0.50, 0.12), emit_strength=6.0)),
    "iney": dict(label="Frost", fn=camp_iney, special=dict(name="Glass", color=(0.30, 0.58, 0.92), rough=0.04,
                                                            alpha=0.52, double_sided=True, flat=True,
                                                            emit=(0.25, 0.5, 0.85), emit_strength=0.15)),
}


# =================================================================== attributes

def set_part_attributes(obj):
    """Per loose part: grain = principal axis (PCA), prand = random 0..1."""
    import numpy as np
    me = obj.data
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ed = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    parent = np.arange(nv)

    def find(a):
        root = a
        while parent[root] != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root
    for a, b in ed:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    comp = np.array([find(i) for i in range(nv)])
    grain = np.zeros((nv, 3), np.float32)
    prand = np.zeros(nv, np.float32)
    rng = np.random.default_rng(5)
    for c in np.unique(comp):
        idx = np.where(comp == c)[0]
        pts = co[idx]
        if len(pts) >= 3:
            cov = np.cov((pts - pts.mean(0)).T)
            w, v = np.linalg.eigh(cov)
            ax = v[:, -1]
            if w[-1] < 1.4 * w[-2]:
                ax = np.array([0.0, 0.0, 1.0]) if abs(v[2, -1]) > 0.3 else ax
        else:
            ax = np.array([0.0, 0.0, 1.0])
        grain[idx] = ax
        prand[idx] = rng.random()
    a = me.attributes.new("grain", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", grain.ravel())
    b = me.attributes.new("prand", "FLOAT", "POINT")
    b.data.foreach_set("value", prand)


# =================================================================== build

def build_camp(stem):
    import numpy as np
    spec = CAMPS[stem]
    label = spec["label"]
    clock = ftf.StageClock(f"camp_{stem}")
    stats = {"asset": f"camp_{stem}.glb", "clan": label, "blender": bpy.app.version_string,
             "stages": clock.stages}
    qa = os.path.join(QA_ROOT, f"camp_{stem}")
    tex_dir = os.path.join(TEX_ROOT, stem)
    os.makedirs(qa, exist_ok=True)
    os.makedirs(tex_dir, exist_ok=True)
    glb = os.path.join(MODELS, f"camp_{stem}.glb")

    clock.start("model")
    sc = ftf.reset_scene()
    stats["cycles_device"] = ftf.use_gpu(sc, f"camp_{stem}")
    work = ftf.new_collection("Work")
    out = ftf.new_collection("Export")
    K = Kit(stem, sid(stem))
    spec["fn"](K)
    kits, kind_mats = [], {}
    parts = []
    for kind, bm in sorted(K.bms.items()):
        if not bm.faces:
            bm.free()
            continue
        m, kit = kind_material(kind)
        kind_mats[kind] = m
        kits.append(kit)
        o = ftf.bm_object(f"part_{kind}", bm, m, work)
        parts.append(o)
    body = ftf.join(parts, f"camp_{stem}_body")
    bmesh_clean = bmesh.new()
    bmesh_clean.from_mesh(body.data)
    bmesh.ops.remove_doubles(bmesh_clean, verts=bmesh_clean.verts[:], dist=0.0005)
    bmesh_clean.to_mesh(body.data)
    bmesh_clean.free()
    stats["ngons_triangulated"] = ftf.triangulate_ngons(body)
    set_part_attributes(body)
    ftf.finish_shading(body, angle=40)
    sp = K.special
    special = None
    sspec = spec["special"]
    m_special = ftf.simple_material(f"M_{label}_{sspec['name']}", sspec["color"], sspec.get("rough", 0.5),
                                    0.0, sspec.get("emit"), sspec.get("emit_strength", 0.0),
                                    alpha=sspec.get("alpha", 1.0), double_sided=sspec.get("double_sided", False),
                                    transmission=sspec.get("transmission", 0.0), ior=sspec.get("ior", 1.45))
    if sp.faces:
        special = ftf.bm_object(f"camp_{stem}_special", sp, m_special, work)
        ftf.triangulate_ngons(special)
        ftf.finish_shading(special, flat=sspec.get("flat", False), angle=30)
    stats["kinds"] = sorted(kind_mats)

    clock.start("uv_unwrap")
    ftf.select_only([body], body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0015, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015)
    bpy.ops.object.mode_set(mode="OBJECT")
    if special:
        ftf.select_only([special], special)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")

    clock.start("bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    imgs = {k: ftf.new_float_image(f"{stem}_{k}", ATLAS, data=(k != "color"))
            for k in ("color", "rough", "metal", "ao", "normal")}
    bake_times = {}
    ftf.select_only([body], body)
    for key, kind, spp, channel in (("normal", "NORMAL", 16, "bsdf"), ("color", "EMIT", 16, "color"),
                                    ("rough", "EMIT", 8, "rough"), ("metal", "EMIT", 8, "metal"),
                                    ("ao", "AO", 256, "bsdf")):
        set_bake_output(kits, channel)
        for m in kind_mats.values():
            node = m.node_tree.nodes["BakeTarget"]
            node.image = imgs[key]
            m.node_tree.nodes.active = node
        sc.cycles.samples = spp
        t = time.time()
        kw = {"normal_space": "TANGENT"} if kind == "NORMAL" else {}
        bpy.ops.object.bake(type=kind, margin=12, margin_type="EXTEND", target="IMAGE_TEXTURES", **kw)
        bake_times[key] = {"seconds": round(time.time() - t, 2), "samples": spp, "size": ATLAS}
        log(stem, "bake", key, bake_times[key])
    stats["bakes"] = bake_times

    clock.start("textures")
    P = {k: ftf.pixels(v)[..., :3] for k, v in imgs.items()}
    ao = P["ao"][..., 0]
    paths = {
        "base": ftf.save_rgb(ftf.to_srgb(P["color"]), os.path.join(tex_dir, f"camp_{stem}_basecolor.jpg"), 92),
        "orm": ftf.save_rgb(np.stack([0.25 + 0.75 * ao, P["rough"][..., 0], P["metal"][..., 0]], -1),
                            os.path.join(tex_dir, f"camp_{stem}_orm.jpg"), 92),
    }
    n = P["normal"] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    paths["normal"] = ftf.save_rgb(n * 0.5 + 0.5, os.path.join(tex_dir, f"camp_{stem}_normal.jpg"), 95)
    stats["texture_files"] = {k: {"file": os.path.relpath(v, REPO).replace("\\", "/"), "bytes": os.path.getsize(v),
                                  "size": ATLAS} for k, v in paths.items()}
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("materials_assemble")
    loaded = {k: bpy.data.images.load(v) for k, v in paths.items()}
    for k in ("orm", "normal"):
        loaded[k].colorspace_settings.name = "Non-Color"
    m_atlas = ftf.pbr_material(f"M_{label}_Atlas", loaded["base"], loaded["orm"], loaded["normal"])
    m_ds = ftf.pbr_material(f"M_{label}_AtlasDS", loaded["base"], loaded["orm"], loaded["normal"], double_sided=True)
    slot_kinds = [s.material.name[2:] for s in body.material_slots]
    remap = [1 if KINDS[k].get("ds") else 0 for k in slot_kinds]
    mi = np.empty(len(body.data.polygons), np.int32)
    body.data.polygons.foreach_get("material_index", mi)
    mi = np.array(remap, np.int32)[mi]
    body.data.materials.clear()
    body.data.materials.append(m_atlas)
    body.data.materials.append(m_ds)
    body.data.polygons.foreach_set("material_index", mi)
    body.data.update()
    objs = [body] + ([special] if special else [])
    camp = ftf.join(objs, f"camp_{stem}")
    for a in ("grain", "prand"):
        if a in camp.data.attributes:
            camp.data.attributes.remove(camp.data.attributes[a])
    work.objects.unlink(camp)
    out.objects.link(camp)
    bmesh.ops.recalc_face_normals(K.col, faces=K.col.faces[:])
    col = ftf.bm_object(f"camp_{stem}_col", K.col, None, out)
    ftf.triangulate_ngons(col)
    socks = [ftf.add_empty(n_, loc, out, rz, props, 0.3) for n_, loc, rz, props in K.sockets]
    stats["runtime_triangles_blender"] = ftf.mesh_tris(camp)
    stats["collision_triangles_blender"] = ftf.mesh_tris(col)
    lo, hi = ftf.world_bounds([camp])
    stats["bounds_blender_zup"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    stats["details"] = K.notes
    size = ftf.export_glb(glb, [camp, col] + socks)
    stats["glb_bytes"] = size
    stats["glb"] = ftf.inspect_glb(glb)
    stats["runtime_triangles"] = stats["glb"]["triangles_render"]
    stats["materials"] = [m["name"] for m in stats["glb"]["materials"]]
    stats["budget_ok"] = {"triangles": stats["runtime_triangles"] <= TRI_BUDGET,
                          "materials": len(stats["materials"]) <= 3,
                          "agent_circle_free": True}
    clock.stop()
    with open(os.path.join(qa, "build-stats.json"), "w") as fh:
        json.dump(stats, fh, indent=2)
    log(stem, "tris", stats["runtime_triangles"], "glb", size, "materials", stats["materials"])
    return stats


# =================================================================== render

def human(col, loc, rot=0.0):
    m = ftf.simple_material("Human", (0.32, 0.31, 0.30), 0.8)
    bm = bmesh.new()
    ftf.revolve(bm, [(0.18, 0.0), (0.2, 0.9), (0.22, 1.35), (0.12, 1.5)], 16, cap_top=True)
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.11,
                              matrix=Matrix.Translation((0, 0, 1.63)))
    o = ftf.bm_object("human_1_75m", bm, m, col)
    o.location = loc
    o.rotation_euler.z = rot
    ftf.finish_shading(o, 60)


def hologram_marker(col):
    """Translucent 2 m cylinder showing the free agent circle (render only)."""
    m = ftf.simple_material("HoloMarker", (0.4, 0.8, 1.0), 0.3, emit=(0.3, 0.7, 1.0), emit_strength=0.6,
                            alpha=0.18, double_sided=True)
    bm = bmesh.new()
    ftf.revolve(bm, [(AGENT_R, 0.0), (AGENT_R, 1.9)], 48)
    o = ftf.bm_object("holo_marker", bm, m, col)
    o.location.z = BASE_H


def plateau(col):
    """A disc of the island paving under the camp for context (render only)."""
    m = ftf.simple_material("PlateauStone", (0.20, 0.21, 0.20), 0.9)
    bm = bmesh.new()
    ftf.revolve(bm, [(0.001, 0.0), (6.0, 0.0), (6.0, -0.4)], 64)
    ftf.bm_object("plateau", bm, m, col)
    g = ftf.simple_material("PlateauGrass", (0.05, 0.09, 0.03), 0.95)
    bm = bmesh.new()
    ftf.revolve(bm, [(6.0, 0.0), (11.0, 0.0), (11.0, -2.0)], 64)
    ftf.bm_object("grass", bm, g, col)


def render_camp(stem, samples=256, res=1400):
    clock = ftf.StageClock(f"camp_{stem}")
    clock.start("qa_renders")
    sc = ftf.reset_scene()
    ftf.setup_cycles(sc, res, res, samples)
    dev = ftf.use_gpu(sc, f"camp_{stem}")
    env = ftf.new_collection("Env")
    sc.world = ftf.sky_world(strength=0.9)
    ftf.add_sun(env, energy=3.2, elev=38, azim=-150)
    plateau(env)
    glb = os.path.join(MODELS, f"camp_{stem}.glb")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.data.objects if o not in before]
    cols = [o for o in objs if o.name.endswith("_col")]
    for c in cols:
        c.hide_render = True
    human(env, (-1.9, -3.3, BASE_H), -0.4)
    out = os.path.join(QA_ROOT, f"camp_{stem}", "final")
    timings = {}

    def shot(name, loc, tgt, lens=35, ortho=None):
        cam = ftf.add_camera(f"cam_{name}", loc, tgt, lens=lens, ortho=ortho, col=env)
        if name == "top":
            cam.rotation_euler = (0, 0, 0)
        timings[name] = ftf.render_to(sc, cam, os.path.join(out, f"camp_{stem}_{name}.jpg"))
        log(stem, "render", name, timings[name])

    shot("front", (0, -16, 2.2), (0, 0, 1.2), lens=42)
    shot("three_quarter", (9.5, -11.0, 7.5), (0, 0.6, 0.9), lens=38)
    shot("top", (0, 0, 30), (0, 0, 0), ortho=10.5)
    shot("game_iso", (0, -14.1, 26.5), (0, 0, 1.1), lens=50)
    shot("close_a", (2.6, -4.6, 1.9), (0.4, 1.4, 1.0), lens=30)
    shot("close_b", (-4.2, -3.2, 1.6), (-2.2, 0.8, 0.8), lens=32)
    hologram_marker(env)
    shot("hologram_circle", (0, -7.5, 4.0), (0, 0, 0.8), lens=35)
    cm = ftf.collision_overlay_material()
    for c in cols:
        c.hide_render = False
        c.data.materials.clear()
        c.data.materials.append(cm)
    shot("collision", (9.5, -11.0, 7.5), (0, 0.6, 0.9), lens=38)
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": dev, "resolution": res, "samples": samples, "seconds_per_render": timings,
                   "render_only": ["plateau disc", "1.75 m figure", "hologram circle marker"],
                   "stages": clock.stages}, fh, indent=2)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    stems = argv[1:] or list(CAMPS)
    for s in stems:
        if stage in ("build", "all"):
            build_camp(s)
        if stage in ("render", "all"):
            render_camp(s)
