"""Kind-atlas bake pipeline shared by small procedural assets (props, relics).

Generalises the camp pipeline (art/camps/build_camps.py) into a reusable module:

* geometry is generated into one bmesh per surface *kind* (weathered stone, ornate
  bronze, frayed cloth, ...); each kind is a procedural Cycles material used only
  for baking;
* "special" materials (emissive glow, glass, quartz, nacre) are not baked and ship
  as plain glTF PBR (transmission / thin film / emission);
* the baked body is smart-UV unwrapped into one atlas; the GPU bakes colour,
  roughness, metallic, tangent normal (from the shader bump) and AO;
* the export has <= 3 materials: M_<Label>_Atlas, M_<Label>_AtlasDS (same textures,
  double sided, only when a double-sided kind is used) and the specials;
* optional skinning: geometry added inside `with K.group(n)` is tagged, and a
  weight function turns tags + positions into bone weights (cloth sway rigs);
* collision (`<name>_col`, convex pieces) and `socket_*` empties with extras.

Style (owner addendum 07.11, adapted from big-studio dark-fantasy art direction,
never copied): weathered, eroded stone with lichen and moss in the crevices,
ornate but functional worn metalwork (engraved filigree, patina in the grooves,
polished edges), worn cloth with frayed hems, a restrained desaturated palette
with gold accents.

Blender is Z-up with the front facing -Y; glTF export gives Y-up, front +Z.
"""

import json
import math
import os
import random
import time
import zlib
from contextlib import contextmanager

import bpy
import bmesh
from mathutils import Matrix, Vector

import ftf
from ftf import TAU


def sid(s):
    return zlib.crc32(s.encode())


# =================================================================== kinds
# t selects the node recipe; colours are linear RGB; ds = double sided at export.

KINDS = {
    "wood": dict(t="grain", c=((0.07, 0.052, 0.036), (0.17, 0.13, 0.085), (0.27, 0.22, 0.15)),
                 weather=(0.24, 0.23, 0.21), rough=(0.72, 0.9)),
    "wood_warm": dict(t="grain", c=((0.12, 0.06, 0.022), (0.28, 0.15, 0.06), (0.44, 0.27, 0.11)),
                      weather=(0.32, 0.22, 0.12), rough=(0.45, 0.65)),
    "charred": dict(t="charred", c=((0.016, 0.014, 0.013), (0.04, 0.036, 0.033), (0.09, 0.083, 0.077)),
                    rough=(0.7, 0.92)),
    "stone_old": dict(t="stone_old", c=((0.07, 0.075, 0.072), (0.16, 0.168, 0.16), (0.27, 0.28, 0.265)),
                      rough=(0.78, 0.94)),
    "stone_pale": dict(t="stone_old", c=((0.20, 0.20, 0.19), (0.34, 0.335, 0.315), (0.48, 0.47, 0.44)),
                       rough=(0.7, 0.9)),
    "basalt": dict(t="stone_old", c=((0.018, 0.02, 0.024), (0.04, 0.045, 0.052), (0.075, 0.08, 0.088)),
                   rough=(0.45, 0.7), moss_amt=0.35),
    "marble": dict(t="marble", c=((0.46, 0.45, 0.42), (0.64, 0.63, 0.59), (0.33, 0.33, 0.32)), rough=(0.35, 0.55)),
    "bronze": dict(t="ornate", c=((0.30, 0.18, 0.07), (0.52, 0.36, 0.15)), patina=(0.10, 0.17, 0.13),
                   rough=(0.28, 0.55), filigree=0.0),
    "bronze_ornate": dict(t="ornate", c=((0.30, 0.18, 0.07), (0.52, 0.36, 0.15)), patina=(0.09, 0.16, 0.12),
                          rough=(0.28, 0.55), filigree=1.0),
    "gold_ornate": dict(t="ornate", c=((0.55, 0.38, 0.12), (0.80, 0.60, 0.26)), patina=(0.20, 0.14, 0.06),
                        rough=(0.22, 0.45), filigree=1.0),
    "iron": dict(t="ornate", c=((0.03, 0.03, 0.031), (0.08, 0.078, 0.076)), patina=(0.14, 0.06, 0.025),
                 rough=(0.45, 0.8), filigree=0.0),
    "iron_ornate": dict(t="ornate", c=((0.03, 0.03, 0.031), (0.085, 0.082, 0.08)), patina=(0.13, 0.055, 0.02),
                        rough=(0.4, 0.75), filigree=1.0),
    "silver_ornate": dict(t="ornate", c=((0.45, 0.47, 0.49), (0.70, 0.72, 0.74)), patina=(0.16, 0.17, 0.19),
                          rough=(0.18, 0.42), filigree=1.0),
    "leather": dict(t="leather", c=((0.05, 0.03, 0.018), (0.12, 0.075, 0.045), (0.20, 0.14, 0.09)),
                    rough=(0.55, 0.8)),
    "bone": dict(t="clay", c=((0.42, 0.38, 0.30), (0.62, 0.58, 0.48), (0.30, 0.26, 0.20)), rough=(0.5, 0.7)),
    "nacre_base": dict(t="marble", c=((0.55, 0.56, 0.58), (0.78, 0.78, 0.80), (0.62, 0.58, 0.66)),
                       rough=(0.18, 0.32)),
    "rope": dict(t="rope", c=((0.14, 0.10, 0.06), (0.30, 0.24, 0.14)), rough=(0.85, 0.95)),
    "moss": dict(t="moss", c=((0.025, 0.04, 0.012), (0.065, 0.10, 0.025), (0.15, 0.19, 0.05)), rough=(0.9, 1.0)),
    "leaf": dict(t="leaf", c=((0.016, 0.035, 0.01), (0.045, 0.085, 0.022), (0.11, 0.17, 0.045)),
                 rough=(0.5, 0.75), ds=True),
    "mushroom": dict(t="clay", c=((0.26, 0.10, 0.04), (0.45, 0.22, 0.09), (0.62, 0.56, 0.46)), rough=(0.4, 0.6)),
    "salt": dict(t="salt", c=((0.58, 0.58, 0.56), (0.80, 0.80, 0.78)), rough=(0.45, 0.75)),
    "wax": dict(t="clay", c=((0.30, 0.02, 0.02), (0.45, 0.05, 0.04), (0.20, 0.01, 0.01)), rough=(0.3, 0.5)),
    # cloth: worn, desaturated clan colours (frayed hems are geometry)
    "cloth_violet": dict(t="cloth", c=((0.045, 0.02, 0.085), (0.11, 0.05, 0.20), (0.19, 0.11, 0.30)),
                         rough=(0.82, 0.95), ds=True),
    "cloth_cream": dict(t="cloth", c=((0.34, 0.32, 0.27), (0.54, 0.52, 0.46), (0.66, 0.64, 0.58)),
                        rough=(0.85, 0.97), ds=True),
    "cloth_char": dict(t="cloth", c=((0.018, 0.016, 0.015), (0.045, 0.04, 0.037), (0.09, 0.08, 0.075)),
                       rough=(0.85, 0.97), ds=True),
    "cloth_green": dict(t="cloth", c=((0.03, 0.05, 0.02), (0.07, 0.11, 0.04), (0.13, 0.18, 0.08)),
                        rough=(0.85, 0.97), ds=True),
    "cloth_amber": dict(t="cloth", c=((0.13, 0.06, 0.02), (0.27, 0.14, 0.05), (0.40, 0.24, 0.10)),
                        rough=(0.82, 0.95), ds=True),
    "cloth_frost": dict(t="cloth", c=((0.13, 0.17, 0.20), (0.25, 0.31, 0.35), (0.40, 0.46, 0.50)),
                        rough=(0.82, 0.95), ds=True),
    "cloth_red": dict(t="cloth", c=((0.05, 0.008, 0.006), (0.13, 0.025, 0.016), (0.22, 0.06, 0.035)),
                      rough=(0.85, 0.97), ds=True),
    "thread_gold": dict(t="thread", c=((0.40, 0.27, 0.08), (0.66, 0.48, 0.18)), rough=(0.35, 0.6), ds=True),
    "thread_ember": dict(t="thread", c=((0.25, 0.04, 0.015), (0.50, 0.10, 0.03)), rough=(0.5, 0.7), ds=True,
                         metal=0.0),
    "thread_silver": dict(t="thread", c=((0.40, 0.42, 0.44), (0.66, 0.68, 0.70)), rough=(0.35, 0.6), ds=True),
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
    bump_d = 0.0015
    cavity = k.ao(0.025, 8)                       # small-radius AO = crevices
    if t == "grain":
        streak = k.noise(Qr, 9.0, 6.0, 0.6)
        fine = k.noise(Qr, 50.0, 3.0, 0.5)
        knots = k.maprange(k.voronoi(Pr, 3.0), 0.05, 0.0)
        tone = k.math("ADD", k.math("MULTIPLY", streak, 0.75), k.math("MULTIPLY", fine, 0.25))
        c = k.ramp(tone, [(0.3, c0), (0.5, c1), (0.72, c2)])
        c = k.mix(k.math("MULTIPLY", knots, 0.6), c, c0)
        wthr = k.maprange(k.noise(Pr, 2.0, 3.0, 0.5), 0.45, 0.7, 0.0, 0.45)
        c = k.mix(wthr, c, spec["weather"])
        rough = k.maprange(fine, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.math("MULTIPLY", streak, 0.6), k.math("MULTIPLY", fine, 0.4))
        h = k.math("SUBTRACT", h, k.math("MULTIPLY", knots, 0.3))
        bump_s = 0.4
    elif t == "charred":
        cr = k.voronoi(Qr, 14.0, "DISTANCE_TO_EDGE")
        crack = k.maprange(cr, 0.0, 0.06, 1.0, 0.0)
        streak = k.noise(Qr, 12.0, 5.0, 0.6)
        c = k.ramp(streak, [(0.35, c0), (0.55, c1), (0.75, c2)])
        c = k.mix(crack, c, (0.005, 0.004, 0.004))
        ember = k.math("MULTIPLY", k.maprange(k.noise(Pr, 4.0, 2.0, 0.5), 0.62, 0.7), 0.3)
        c = k.mix(ember, c, (0.22, 0.10, 0.05))
        rough = k.maprange(streak, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", k.math("MULTIPLY", streak, 0.4), k.math("MULTIPLY", crack, 0.7))
        bump_s = 0.7
    elif t == "stone_old":
        # weathered stone: eroded pits, fine cracks, lichen blotches and moss in crevices
        n1 = k.noise(Pr, 5.0, 8.0, 0.62)
        speck = k.noise(Pr, 60.0, 3.0, 0.5)
        crack = k.maprange(k.voronoi(k.vmath("ADD", Pr, k.vmath("SCALE", k.noise(Pr, 3.0, 2.0, 0.5, out="Color"),
                                                                 scale=0.15)), 7.0, "DISTANCE_TO_EDGE"),
                           0.0, 0.025, 1.0, 0.0)
        pits = k.maprange(k.voronoi(Pr, 38.0), 0.12, 0.0)
        c = k.ramp(n1, [(0.32, c0), (0.55, c1), (0.78, c2)])
        c = k.mix(0.35, c, k.maprange(speck, 0.3, 0.7, 0.8, 1.15), blend="MULTIPLY")
        lich = k.maprange(k.noise(Pr, 9.0, 5.0, 0.6), 0.56, 0.63, 0.0, 0.55)
        c = k.mix(lich, c, (0.28, 0.27, 0.17))
        moss_m = k.math("MULTIPLY", k.maprange(cavity, 0.85, 0.45),
                        k.maprange(k.noise(Pr, 6.0, 4.0, 0.6), 0.35, 0.6), clamp=True)
        moss_m = k.math("MULTIPLY", moss_m, spec.get("moss_amt", 0.9))
        c = k.mix(k.math("MULTIPLY", crack, 0.8), c, tuple(x * 0.25 for x in c0))
        c = k.mix(moss_m, c, (0.035, 0.06, 0.016))
        rough = k.math("ADD", k.maprange(speck, 0.3, 0.7, r0, r1), k.math("MULTIPLY", moss_m, 0.2), clamp=True)
        h = k.math("ADD", k.noise(Pr, 140.0, 4.0, 0.6), k.math("MULTIPLY", speck, 0.5))
        h = k.math("SUBTRACT", h, k.math("ADD", k.math("MULTIPLY", crack, 0.9), k.math("MULTIPLY", pits, 0.5)))
        h = k.math("ADD", h, k.math("MULTIPLY", moss_m, 0.6))
        bump_s = 0.45
    elif t == "marble":
        n = k.noise(Pr, 3.0, 6.0, 0.6, distortion=2.5)
        vein = k.math("SUBTRACT", 1.0, k.math("ABSOLUTE", k.math("SUBTRACT", k.math("MULTIPLY", n, 2.0), 1.0)))
        vein = k.maprange(vein, 0.88, 0.99)
        cloud = k.noise(Pr, 5.0, 4.0, 0.5)
        c = k.mix(k.maprange(cloud, 0.3, 0.7), c0, c1)
        c = k.mix(k.math("MULTIPLY", vein, 0.7), c, c2)
        rough = k.maprange(cloud, 0.3, 0.7, r0, r1)
        h = k.math("ADD", k.math("MULTIPLY", k.noise(Pr, 110.0, 3.0, 0.5), 0.6), k.math("MULTIPLY", vein, -0.3))
        bump_s = 0.12
    elif t == "ornate":
        # worn metal: engraved filigree scrolls, patina packed in grooves and cavities,
        # rubbed-bright high points
        n = k.noise(Pr, 16.0, 6.0, 0.55)
        fil = spec.get("filigree", 0.0)
        warp = k.vmath("ADD", Pr, k.vmath("SCALE", k.noise(Pr, 9.0, 2.0, 0.5, out="Color"), scale=0.05))
        r1v = k.voronoi(warp, 22.0, "DISTANCE_TO_EDGE")
        rings = k.wave(warp, 70.0, distortion=6.0, detail=1.0, direction="X", kind="RINGS")
        groove = k.math("MAXIMUM", k.maprange(r1v, 0.0, 0.035, 1.0, 0.0),
                        k.math("MULTIPLY", k.maprange(rings, 0.0, 0.12, 1.0, 0.0),
                               k.maprange(k.noise(Pr, 5.0, 2.0, 0.5), 0.45, 0.55)))
        groove = k.math("MULTIPLY", groove, fil)
        up = k.separate(geo.outputs["Normal"])[2]
        pat = k.math("ADD", k.maprange(cavity, 0.95, 0.5, 0.0, 1.0), k.maprange(up, 0.4, 0.95, 0.0, 0.35))
        pat = k.math("MULTIPLY", pat, k.maprange(k.noise(Pr, 8.0, 4.0, 0.6), 0.35, 0.62), clamp=True)
        pat = k.math("MAXIMUM", pat, k.math("MULTIPLY", groove, 0.85))
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        polish = k.maprange(cavity, 0.97, 1.0, 0.0, 0.35)
        c = k.mix(polish, c, tuple(min(1.0, x * 1.35) for x in c1))
        c = k.mix(pat, c, spec["patina"])
        metal = k.math("SUBTRACT", 1.0, k.math("MULTIPLY", pat, 0.9), clamp=True)
        rough = k.math("ADD", k.maprange(n, 0.3, 0.7, r0, r1), k.math("MULTIPLY", pat, 0.3), clamp=True)
        h = k.math("SUBTRACT", k.math("MULTIPLY", k.noise(Pr, 180.0, 3.0, 0.5), 0.3), groove)
        bump_s = 0.35
        bump_d = 0.0008
    elif t == "leather":
        n = k.noise(Pr, 9.0, 5.0, 0.6)
        grain_ = k.voronoi(Pr, 260.0, "DISTANCE_TO_EDGE")
        wrap = k.math("SINE", k.math("MULTIPLY", along, 140.0))
        seam = k.maprange(wrap, 0.85, 1.0)
        c = k.ramp(n, [(0.3, c0), (0.55, c1), (0.8, c2)])
        c = k.mix(k.math("MULTIPLY", seam, 0.7), c, tuple(x * 0.4 for x in c0))
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", k.math("MULTIPLY", grain_, 0.4), k.math("MULTIPLY", seam, 0.8))
        bump_s = 0.4
    elif t == "clay":
        n = k.noise(Pr, 14.0, 5.0, 0.55)
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        c = k.mix(k.math("MULTIPLY", k.maprange(cavity, 0.9, 0.5), 0.6), c, c2)
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.noise(Pr, 90.0, 3.0, 0.5)
        bump_s = 0.15
    elif t in ("cloth", "thread"):
        weave = k.noise(k.vmath("MULTIPLY", P, (520.0, 520.0, 40.0)), 1.0, 1.0, 0.5)
        weave2 = k.noise(k.vmath("MULTIPLY", P, (40.0, 40.0, 520.0)), 1.0, 1.0, 0.5)
        n = k.noise(Pr, 3.5, 5.0, 0.6)
        if t == "cloth":
            stain = k.maprange(k.noise(Pr, 1.8, 4.0, 0.6), 0.55, 0.72, 0.0, 0.55)
            c = k.ramp(n, [(0.3, c0), (0.55, c1), (0.8, c2)])
            c = k.mix(stain, c, c0)
            # sun-bleached, dusty lower parts
            dust = k.maprange(k.separate(P)[2], 0.0, 1.2, 0.35, 0.0)
            c = k.mix(dust, c, (0.20, 0.19, 0.17))
        else:
            c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
            metal = spec.get("metal", 0.75)
        c = k.mix(0.35, c, k.maprange(k.math("ADD", weave, weave2), 0.6, 1.4, 0.78, 1.15), blend="MULTIPLY")
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("ADD", weave, weave2)
        bump_s = 0.2
        bump_d = 0.0006
    elif t == "leaf":
        v = k.voronoi(Pr, 24.0, "DISTANCE_TO_EDGE")
        vein = k.maprange(v, 0.0, 0.04, 1.0, 0.0)
        n = k.noise(Pr, 8.0, 5.0, 0.6)
        c = k.ramp(n, [(0.3, c0), (0.55, c1), (0.8, c2)])
        c = k.mix(k.math("MULTIPLY", vein, 0.5), c, c0)
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("SUBTRACT", n, k.math("MULTIPLY", vein, 0.5))
        bump_s = 0.3
    elif t == "moss":
        n = k.noise(Pr, 26.0, 6.0, 0.65)
        dots = k.maprange(k.voronoi(Pr, 80.0), 0.3, 0.0)
        c = k.ramp(k.math("ADD", n, k.math("MULTIPLY", dots, 0.3)), [(0.3, c0), (0.6, c1), (0.9, c2)])
        rough = k.maprange(n, 0.3, 0.7, r0, r1)
        h = k.math("ADD", n, k.math("MULTIPLY", dots, 0.5))
        bump_s = 0.6
    elif t == "rope":
        tw = k.math("SINE", k.math("ADD", k.math("MULTIPLY", along, 90.0),
                                   k.math("MULTIPLY", k.math("ARCTAN2", k.separate(perp)[0], k.separate(perp)[1]), 3.0)))
        c = k.mix(k.maprange(tw, -1, 1), c0, c1)
        rough = k.maprange(tw, -1, 1, r0, r1)
        h = tw
        bump_s = 0.4
    elif t == "salt":
        sp = k.noise(Pr, 160.0, 2.0, 0.5)
        n = k.noise(Pr, 10.0, 4.0, 0.5)
        c = k.mix(k.maprange(n, 0.3, 0.7), c0, c1)
        c = k.mix(0.4, c, k.maprange(sp, 0.3, 0.7, 0.85, 1.12), blend="MULTIPLY")
        rough = k.maprange(sp, 0.3, 0.7, r0, r1)
        h = k.math("ADD", sp, k.math("MULTIPLY", n, 0.5))
        bump_s = 0.25
    else:
        raise ValueError(t)
    dirt = k.maprange(k.ao(0.08), 0.35, 0.95, 0.5, 0.0)
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
    """Accumulates one asset: a bmesh per kind (baked), per special material, and
    for collision; sockets; vertex tags for skinning."""

    def __init__(self, name, seed=None):
        self.name = name
        self.bms = {}
        self.specials = {}
        self.col = bmesh.new()
        self.rng = random.Random(sid(name) if seed is None else seed)
        self.sockets = []
        self.notes = []
        self._group = 0

    def bm(self, kind):
        if kind.startswith("@"):
            nm = kind[1:]
            if nm not in self.specials:
                self.specials[nm] = bmesh.new()
            return self.specials[nm]
        if kind not in self.bms:
            if kind not in KINDS:
                raise KeyError(kind)
            self.bms[kind] = bmesh.new()
        return self.bms[kind]

    # ---- skin groups: verts created inside `with K.group(n)` get tag n
    @contextmanager
    def group(self, n):
        before = {key: len(bm.verts) for key, bm in list(self.bms.items()) + [("@" + a, b) for a, b in self.specials.items()]}
        old = self._group
        self._group = n
        try:
            yield
        finally:
            self._group = old
            for key, bm in list(self.bms.items()) + [("@" + a, b) for a, b in self.specials.items()]:
                lay = bm.verts.layers.int.get("skin") or bm.verts.layers.int.new("skin")
                bm.verts.ensure_lookup_table()
                for i in range(before.get(key, 0), len(bm.verts)):
                    bm.verts[i][lay] = n

    def socket(self, name, loc, rot=(0.0, 0.0, 0.0), **props):
        self.sockets.append((name, tuple(loc), tuple(rot), props))

    # ---- primitives (kind may be "@Special")
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

    def ring(self, kind, c, R, r, n=24, sides=6, M=None):
        """Torus of major radius R and tube radius r, in the XY plane, transformed by M."""
        M = M or Matrix.Identity(3)
        pts = [Vector(c) + M @ Vector((R * math.cos(TAU * i / n), R * math.sin(TAU * i / n), 0)) for i in range(n)]
        return ftf.tube(self.bm(kind), pts, r, sides, closed=True)

    def ico(self, kind, c, r, scale=(1, 1, 1), sub=2, noise=0.15, seed=0, flat_bottom=None, M=None):
        bm = self.bm(kind)
        res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        rr = random.Random(seed)
        ph = [rr.uniform(0, TAU) for _ in range(6)]
        for v in res["verts"]:
            d = v.co.copy()
            kk = 1.0 + noise * (math.sin(3.1 * d.x + ph[0]) * math.sin(2.7 * d.y + ph[1]) +
                                0.6 * math.sin(5.3 * d.z + ph[2]) * math.sin(4.1 * d.x + ph[3]))
            p = Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2])) * r * kk
            if M is not None:
                p = M @ p
            if flat_bottom is not None:
                p.z = max(p.z, flat_bottom - c[2])
            v.co = Vector(c) + p
        return res["verts"]

    def loft(self, kind, sections, cap_start=True, cap_end=True, closed=True):
        """Skins equal-length closed sections; optional fan-free n-gon caps."""
        bm = self.bm(kind)
        rings = [[bm.verts.new(p) for p in s] for s in sections]
        n = len(sections[0])
        rng = range(n) if closed else range(n - 1)
        for a, b in zip(rings, rings[1:]):
            for i in rng:
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        if cap_start and closed:
            bm.faces.new(list(reversed(rings[0])))
        if cap_end and closed:
            bm.faces.new(rings[-1])
        return rings

    def sweep(self, kind, pts, section_fn, up=(0, 0, 1), cap=True):
        """Sweeps a 2D section along a polyline. section_fn(t) -> [(x, y)] in the
        (side, normal) plane, with side = up x tangent."""
        pts = [Vector(p) for p in pts]
        m = len(pts)
        secs = []
        for i, p in enumerate(pts):
            tg = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
            upv = Vector(up)
            side = tg.cross(upv)
            if side.length < 1e-4:
                side = tg.cross(Vector((0, 1, 0)))
            side.normalize()
            nrm = side.cross(tg).normalized()
            secs.append([p + side * x + nrm * y for x, y in section_fn(i / (m - 1))])
        return self.loft(kind, secs, cap, cap)

    def poly(self, kind, pts):
        bm = self.bm(kind)
        return bm.faces.new([bm.verts.new(p) for p in pts])

    def surface(self, kind, fn, nu, nv, closed_u=False, skip=None):
        """Grid surface fn(u, v) -> point; skip(i, j) drops a quad (holes, frays)."""
        bm = self.bm(kind)
        cu = nu if closed_u else nu + 1
        rows = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(cu)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                if skip and skip(i, j):
                    continue
                i2 = (i + 1) % cu
                bm.faces.new((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
        return rows

    # ---- collision (convex pieces)
    def col_box(self, c, size, rot=None):
        ftf.box(self.col, Vector(c), size, rot)

    def col_cyl(self, c, r, h, n=8, r_top=None):
        ftf.prism_ngon(self.col, n, r, r if r_top is None else r_top, c[2], c[2] + h, center=(c[0], c[1]))

    def col_beam(self, a, b, w, h):
        ftf.beam(self.col, a, b, w, h)

    def col_hull(self, pts):
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        res = bmesh.ops.convex_hull(bm, input=vs)
        tmp = bpy.data.meshes.new("hull_tmp")
        bm.to_mesh(tmp)
        bm.free()
        self.col.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        return res


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


def special_material(name, s):
    m = ftf.simple_material(name, s["color"], s.get("rough", 0.5), s.get("metal", 0.0), s.get("emit"),
                            s.get("emit_strength", 0.0), alpha=s.get("alpha", 1.0),
                            double_sided=s.get("double_sided", False),
                            transmission=s.get("transmission", 0.0), ior=s.get("ior", 1.45))
    b = m.node_tree.nodes["Principled BSDF"]
    if s.get("thin_film"):
        b.inputs["Thin Film Thickness"].default_value = s["thin_film"]
        b.inputs["Thin Film IOR"].default_value = 1.33
    if s.get("coat"):
        b.inputs["Coat Weight"].default_value = s["coat"]
    if s.get("transmission"):
        # glTF volume (KHR_materials_volume) is exported from the thickness hint
        m["gltf_thickness"] = s.get("thickness", 0.01)
    return m


# =================================================================== build

def _bones_from_spec(rig, mesh_obj, col):
    """rig = {"bones": [(name, head, tail, parent)], "weights": fn(co, tag) -> {bone: w},
    "action": {"name", "frames", "fps", "keys": fn(frame) -> {bone: quaternion}}}."""
    arm_data = bpy.data.armatures.new(rig.get("name", "rig"))
    arm = ftf.link(bpy.data.objects.new(rig.get("name", "rig"), arm_data), col)
    ftf.select_only([arm], arm)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for name, head, tail, parent in rig["bones"]:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.roll = 0.0
        if parent:
            eb.parent = ebs[parent]
        ebs[name] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    me = mesh_obj.data
    tags = [0] * len(me.vertices)
    if "skin" in me.attributes:
        me.attributes["skin"].data.foreach_get("value", tags)
    groups = {name: mesh_obj.vertex_groups.new(name=name) for name, *_ in rig["bones"]}
    for v in me.vertices:
        for bname, w in rig["weights"](v.co, tags[v.index]).items():
            if w > 1e-4:
                groups[bname].add([v.index], w, "REPLACE")
    if "skin" in me.attributes:
        me.attributes.remove(me.attributes["skin"])
    mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mesh_obj.parent = arm
    act = rig["action"]
    arm.animation_data_create()
    action = bpy.data.actions.new(act["name"])
    arm.animation_data.action = action
    sc = bpy.context.scene
    sc.render.fps = act["fps"]
    sc.frame_start, sc.frame_end = 0, act["frames"]
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for f in range(0, act["frames"] + 1, act.get("step", 4)):
        keys = act["keys"](f)
        for pb in arm.pose.bones:
            q = keys.get(pb.name)
            if q is None:
                continue
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
    # keep the action on an NLA track as well so the exporter names it "idle"
    trk = arm.animation_data.nla_tracks.new()
    trk.name = act["name"]
    trk.strips.new(act["name"], 0, action)
    return arm


def build_asset(K, out_glb, label, tex_dir, atlas=1024, specials=None, rig=None, tri_budget=4000,
                extras=None, smooth_angle=40, tag="props"):
    """Model is already in K. Unwraps, bakes, assembles materials and exports a glb.
    Returns a stats dict."""
    import numpy as np
    specials = specials or {}
    name = os.path.splitext(os.path.basename(out_glb))[0]
    clock = ftf.StageClock(name)
    stats = {"asset": os.path.basename(out_glb), "blender": bpy.app.version_string, "stages": clock.stages,
             "atlas": atlas}
    sc = bpy.context.scene
    stats["cycles_device"] = ftf.use_gpu(sc, name)
    work = ftf.new_collection("Work")
    out = ftf.new_collection("Export")
    os.makedirs(tex_dir, exist_ok=True)

    clock.start("model")
    kits, kind_mats, parts = [], {}, []
    for kind, bm in sorted(K.bms.items()):
        if not bm.faces:
            bm.free()
            continue
        m, kit = kind_material(kind)
        kind_mats[kind] = m
        kits.append(kit)
        parts.append(ftf.bm_object(f"part_{kind}", bm, m, work))
    body = ftf.join(parts, f"{name}_body")
    bmc = bmesh.new()
    bmc.from_mesh(body.data)
    bmesh.ops.remove_doubles(bmc, verts=bmc.verts[:], dist=0.0002)
    bmesh.ops.recalc_face_normals(bmc, faces=[f for f in bmc.faces])
    bmc.to_mesh(body.data)
    bmc.free()
    stats["ngons_triangulated"] = ftf.triangulate_ngons(body)
    set_part_attributes(body)
    ftf.finish_shading(body, angle=smooth_angle)
    special_objs = []
    for sname, sbm in K.specials.items():
        if not sbm.faces:
            continue
        s = specials[sname]
        mat = special_material(f"M_{label}_{sname}", s)
        o = ftf.bm_object(f"{name}_{sname}", sbm, mat, work)
        ftf.triangulate_ngons(o)
        ftf.finish_shading(o, flat=s.get("flat", False), angle=30)
        special_objs.append(o)
    stats["kinds"] = sorted(kind_mats)

    clock.start("uv_unwrap")
    margin = 4.0 / atlas
    ftf.select_only([body], body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in special_objs:
        ftf.select_only([o], o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")

    clock.start("bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    sup = 2                                     # supersampled bake, box-downsampled
    bs = atlas * sup
    imgs = {k: ftf.new_float_image(f"{name}_{k}_bake", bs, data=(k != "color"))
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
        t0 = time.time()
        kw = {"normal_space": "TANGENT"} if kind == "NORMAL" else {}
        bpy.ops.object.bake(type=kind, margin=8 * sup, margin_type="EXTEND", target="IMAGE_TEXTURES", **kw)
        bake_times[key] = {"seconds": round(time.time() - t0, 2), "samples": spp, "size": bs}
    stats["bakes"] = bake_times

    clock.start("textures")
    Pp = {k: ftf.downsample(ftf.pixels(v)[..., :3], sup) for k, v in imgs.items()}
    ao = Pp["ao"][..., 0]
    paths = {
        "base": ftf.save_rgb(ftf.to_srgb(Pp["color"]), os.path.join(tex_dir, f"{name}_basecolor.jpg"), 92),
        "orm": ftf.save_rgb(np.stack([0.2 + 0.8 * ao, Pp["rough"][..., 0], Pp["metal"][..., 0]], -1),
                            os.path.join(tex_dir, f"{name}_orm.jpg"), 92),
    }
    n = Pp["normal"] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    paths["normal"] = ftf.save_rgb(n * 0.5 + 0.5, os.path.join(tex_dir, f"{name}_normal.png"))
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("assemble_export")
    loaded = {k: bpy.data.images.load(v) for k, v in paths.items()}
    for k in ("orm", "normal"):
        loaded[k].colorspace_settings.name = "Non-Color"
    m_atlas = ftf.pbr_material(f"M_{label}_Atlas", loaded["base"], loaded["orm"], loaded["normal"])
    slot_kinds = [s.material.name[2:] for s in body.material_slots]
    use_ds = any(KINDS[k].get("ds") for k in slot_kinds)
    remap = [1 if (KINDS[k].get("ds") and use_ds) else 0 for k in slot_kinds]
    mi = np.empty(len(body.data.polygons), np.int32)
    body.data.polygons.foreach_get("material_index", mi)
    mi = np.array(remap, np.int32)[mi]
    body.data.materials.clear()
    body.data.materials.append(m_atlas)
    if use_ds:
        body.data.materials.append(ftf.pbr_material(f"M_{label}_AtlasDS", loaded["base"], loaded["orm"],
                                                    loaded["normal"], double_sided=True))
    body.data.polygons.foreach_set("material_index", mi)
    body.data.update()
    obj = ftf.join([body] + special_objs, name)
    for a in ("grain", "prand"):
        if a in obj.data.attributes:
            obj.data.attributes.remove(obj.data.attributes[a])
    work.objects.unlink(obj)
    out.objects.link(obj)
    if extras:
        for kk, vv in extras.items():
            obj[kk] = vv
    export = [obj]
    if K.col.faces:
        bmesh.ops.recalc_face_normals(K.col, faces=K.col.faces[:])
        col = ftf.bm_object(f"{name}_col", K.col, None, out)
        ftf.triangulate_ngons(col)
        export.append(col)
        stats["collision_triangles_blender"] = ftf.mesh_tris(col)
    arm = None
    if rig:
        arm = _bones_from_spec(rig, obj, out)
        export.append(arm)
    for sn, loc, rot, props in K.sockets:
        e = ftf.add_empty(sn, loc, out, 0.0, props, 0.1)
        e.rotation_euler = rot
        if arm is not None and props.get("follow_bone"):
            pass
        export.append(e)
    stats["runtime_triangles_blender"] = ftf.mesh_tris(obj)
    lo, hi = ftf.world_bounds([obj])
    stats["bounds_blender_zup"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]}
    stats["size_m"] = [round(hi[i] - lo[i], 3) for i in range(3)]
    stats["notes"] = K.notes
    size = export_glb(out_glb, export, animations=bool(rig))
    stats["glb_raw_bytes"] = size
    stats["glb"] = ftf.inspect_glb(out_glb)
    stats["runtime_triangles"] = stats["glb"]["triangles_render"]
    stats["materials"] = [m["name"] for m in stats["glb"]["materials"]]
    stats["budget_ok"] = {"triangles": stats["runtime_triangles"] <= tri_budget,
                          "materials": stats["glb"]["max_materials_per_node"] <= 3}
    clock.stop()
    ftf.log(tag, name, "tris", stats["runtime_triangles"], "mats", stats["materials"], "raw", size)
    return stats


def export_glb(path, objs, animations=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ftf.select_only(objs, objs[0])
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
              export_yup=True, export_tangents=True, export_extras=True,
              export_image_format="AUTO", export_cameras=False, export_lights=False,
              export_animations=animations, export_skins=animations)
    if animations:
        kw.update(export_animation_mode="ACTIONS", export_force_sampling=True, export_def_bones=False,
                  export_anim_single_armature=True)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=False, **kw)
    return os.path.getsize(path)
