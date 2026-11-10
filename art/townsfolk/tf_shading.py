"""Townsfolk look-dev: procedural shaders for skin, eyes, cloth, leather, metal, wood, straw and hair.

The same shader functions serve two uses: `live(...)` wires them into a Principled BSDF for the QA
renders, and the bake (hero_shading.bake_set) turns them into the texture sets of the game model.
Each function returns (colour, roughness, metal, bump height, alpha) like the hero shaders.
"""

import math

import bpy

import hero_shading as S
from cast import HAIR, PALETTE, SKIN

NB = S.NB


def _mul(c, k):
    return tuple(min(1.0, x * k) for x in c)


def _lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def skin_shader(b, land=None, tone=(0.5, 0.3, 0.2), blush=0.4, brow=(0.05, 0.03, 0.02), brow_w=1.0, age=0.5,
                freckles=0.0, stubble=None):
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    red = _lerp(tone, (0.55, 0.16, 0.12), 0.45)
    var = b.noise(38.0, 6.0, pos)
    col = b.mix(b.math("MULTIPLY", var.outputs["Fac"], 0.30), tone, _lerp(tone, red, 0.25))
    warm = b.noise(9.0, 3.0, pos)
    col = b.mix(b.math("MULTIPLY", warm.outputs["Fac"], 0.25), col, _mul(tone, 0.90))
    for c in land["cheeks"]:
        col = b.mix(b.math("MULTIPLY", b.blob(pos, c, 0.034, 1.6), 0.75 * blush), col, red)
    col = b.mix(b.math("MULTIPLY", b.blob(pos, land["nose"], 0.020, 1.4), 0.5 * blush), col, red)
    for e in land["ears"]:
        col = b.mix(b.math("MULTIPLY", b.blob(pos, e, 0.030, 1.2), 0.6 * blush), col, red)
    if freckles:
        fr = b.noise(900.0, 2.0, pos)
        mask = b.math("MULTIPLY", b.math("GREATER_THAN", fr.outputs["Fac"], 0.66),
                      b.math("MAXIMUM", b.blob(pos, land["nose"], 0.05, 0.8), 0.0))
        col = b.mix(b.math("MULTIPLY", mask, 0.6 * freckles), col, _mul(tone, 0.55))
    lips = b.attr("lipsw").outputs["Fac"]
    lipc = _lerp(tone, (0.42, 0.11, 0.10), 0.55)
    col = b.mix(b.math("MULTIPLY", b.math("POWER", lips, 0.6), 0.85), col, lipc)
    for (E, r, sx) in land["eyes"]:
        x, y, z, d = S._local(b, pos, E, sx)
        t = b.math("DIVIDE", b.math("ADD", x, 0.017), 0.054)
        tc = b.math("MINIMUM", b.math("MAXIMUM", t, 0.0), 1.0)
        rise = b.math("MULTIPLY", b.math("SINE", b.math("MULTIPLY", b.math("MINIMUM", b.math("DIVIDE", tc, 0.66), 1.0), math.pi / 2)), 0.0085)
        fall = b.math("MULTIPLY", b.math("POWER", b.math("DIVIDE", b.math("MAXIMUM", b.math("SUBTRACT", tc, 0.66), 0.0), 0.34), 1.5), 0.0100)
        zc = b.math("SUBTRACT", b.math("ADD", land.get("brow_dz", 0.0175), rise), fall)
        half = b.math("MULTIPLY", b.math("ADD", 0.0012, b.math("MULTIPLY", b.math("POWER", b.math("SUBTRACT", 1.0, tc), 0.5), 0.0034)), brow_w)
        band = S._smooth_band(b, b.math("SUBTRACT", z, zc), half, 0.0014)
        inside = b.math("MULTIPLY", b.math("GREATER_THAN", t, -0.02), b.math("LESS_THAN", t, 1.02))
        front = b.math("LESS_THAN", y, 0.02)
        m = b.math("MINIMUM", b.math("MULTIPLY", b.math("MULTIPLY", band, inside), front), 0.92)
        col = b.mix(m, col, brow)
        dist = b.n("ShaderNodeVectorMath", operation="LENGTH")
        b.l(d, dist.inputs[0])
        ring = b.math("DIVIDE", dist.outputs["Value"], r)
        upper = b.math("GREATER_THAN", z, b.math("SUBTRACT", b.math("MULTIPLY", x, 0.35), 0.004))
        line = b.math("MULTIPLY", b.math("MULTIPLY", b.math("GREATER_THAN", ring, 0.98), b.math("LESS_THAN", ring, 1.10)), upper)
        col = b.mix(b.math("MULTIPLY", line, 0.7), col, _mul(tone, 0.12))
    if stubble:                                     # a short beard: a shadow over the jaw and upper lip
        xyz = b.n("ShaderNodeSeparateXYZ")
        b.l(pos, xyz.inputs[0])
        nz, ny = land["nose"][2], land["nose"][1]
        zm = b.math("DIVIDE", b.math("SUBTRACT", nz - 0.012, xyz.outputs["Z"]), 0.014, clamp=True)
        ym = b.math("DIVIDE", b.math("SUBTRACT", ny + 0.105, xyz.outputs["Y"]), 0.03, clamp=True)
        zl = b.math("DIVIDE", b.math("SUBTRACT", xyz.outputs["Z"], nz - 0.115), 0.02, clamp=True)
        grain = b.noise(2600.0, 2.0, pos)
        mask = b.math("MULTIPLY", b.math("MULTIPLY", zm, ym), b.math("MULTIPLY", zl, b.math("SUBTRACT", 1.0, b.math("POWER", lips, 0.5), clamp=True)))
        mask = b.math("MULTIPLY", mask, b.math("ADD", 0.45, b.math("MULTIPLY", grain.outputs["Fac"], 0.5)))
        col = b.mix(b.math("MULTIPLY", mask, 0.8), col, stubble)
    pores = b.noise(1600.0, 2.0, pos)
    rough = b.math("ADD", 0.50, b.math("MULTIPLY", pores.outputs["Fac"], 0.12))
    rough = b.math("SUBTRACT", rough, b.math("MULTIPLY", b.math("POWER", lips, 0.6), 0.18))
    height = b.math("MULTIPLY", pores.outputs["Fac"], 0.25)
    if age > 0.7:                                   # fine lines of an old face
        w = b.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z", in_Scale=55.0, in_Distortion=6.0, in_Detail=3.0)
        b.l(pos, w.inputs["Vector"])
        height = b.math("ADD", height, b.math("MULTIPLY", w.outputs["Fac"], 0.45 * (age - 0.7) / 0.3))
        spots = b.noise(140.0, 2.0, pos)
        col = b.mix(b.math("MULTIPLY", b.math("GREATER_THAN", spots.outputs["Fac"], 0.70), 0.25), col, _mul(tone, 0.7))
    return col, rough, 0.0, height, None


def eye_shader(b, iris=((0.10, 0.11, 0.07), (0.30, 0.25, 0.12))):
    uv = b.n("ShaderNodeUVMap", uv_map="UVMap")
    d = b.n("ShaderNodeVectorMath", operation="DISTANCE")
    b.l(uv.outputs["UV"], d.inputs[0])
    d.inputs[1].default_value = (0.5, 0.5, 0.0)
    r = d.outputs["Value"]
    streak = b.n("ShaderNodeTexNoise", in_Scale=60.0, in_Detail=4.0)
    b.l(uv.outputs["UV"], streak.inputs["Vector"])
    ic = b.mix(streak.outputs["Fac"], iris[0], iris[1])
    ic = b.mix(b.math("SMOOTH_MAX", b.math("SUBTRACT", b.math("MULTIPLY", r, 6.0), 0.9), 0.0), ic, (0.04, 0.035, 0.03))
    col = b.mix(b.math("GREATER_THAN", r, 0.205), ic, (0.80, 0.76, 0.72))
    col = b.mix(b.math("LESS_THAN", r, 0.075), col, (0.01, 0.01, 0.01))
    return col, 0.08, 0.0, None, None


MAT = {   # kind: (roughness, metal, fibre scale, fibre strength, bump)
    "cloth": (0.85, 0.0, 420.0, 0.28, 0.5), "leather": (0.55, 0.0, 160.0, 0.22, 0.35), "metal": (0.38, 1.0, 90.0, 0.12, 0.15),
    "wood": (0.65, 0.0, 60.0, 0.30, 0.4), "straw": (0.75, 0.0, 240.0, 0.40, 0.9), "hair": (0.50, 0.0, 300.0, 0.35, 0.6),
    "amber": (0.18, 0.0, 30.0, 0.15, 0.0), "shell": (0.30, 0.0, 40.0, 0.10, 0.1), "bread": (0.8, 0.0, 80.0, 0.35, 0.5),
}


def surface_shader(b, gcol=(0.5, 0.5, 0.5), tcol=(0.3, 0.3, 0.3), kind="cloth"):
    rough, metal, scale, strength, bump = MAT[kind]
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    trim = b.attr("trim").outputs["Fac"]
    col = b.mix(b.math("GREATER_THAN", trim, 0.5), gcol, tcol)
    fib = b.noise(scale, 8.0, pos, 0.7)
    big = b.noise(7.0, 3.0, pos)
    shade = b.math("ADD", 1.0 - strength * 0.5, b.math("MULTIPLY", fib.outputs["Fac"], strength))
    shade = b.math("MULTIPLY", shade, b.math("ADD", 0.88, b.math("MULTIPLY", big.outputs["Fac"], 0.24)))
    if kind in ("straw", "hair", "wood"):
        w = b.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z" if kind != "straw" else "DIAGONAL",
                in_Scale=120.0 if kind != "wood" else 40.0, in_Distortion=3.0, in_Detail=2.0)
        b.l(pos, w.inputs["Vector"])
        shade = b.math("MULTIPLY", shade, b.math("ADD", 0.75, b.math("MULTIPLY", w.outputs["Fac"], 0.5)))
    mul = b.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mul.inputs[0].default_value = 1.0
    b.l(col, mul.inputs[6])
    comb = b.n("ShaderNodeCombineColor")
    for s in ("Red", "Green", "Blue"):
        b.l(shade, comb.inputs[s])
    b.l(comb.outputs[0], mul.inputs[7])
    return mul.outputs[2], rough, metal, b.math("MULTIPLY", fib.outputs["Fac"], bump), None


def live(name, fn, **kw):
    """A render material straight from a shader function (no bake)."""
    m = bpy.data.materials.new(name)
    b = NB(m)
    col, rough, metal, h, alpha = fn(b, **kw)
    bs = b.n("ShaderNodeBsdfPrincipled")
    for sock, x in (("Base Color", col), ("Roughness", rough), ("Metallic", metal)):
        if isinstance(x, (int, float)):
            bs.inputs[sock].default_value = x
        elif isinstance(x, tuple):
            bs.inputs[sock].default_value = (*x, 1.0)
        else:
            b.l(x, bs.inputs[sock])
    if h is not None:
        bump = b.n("ShaderNodeBump", in_Strength=0.25, in_Distance=0.0015)
        b.l(h, bump.inputs["Height"])
        b.l(bump.outputs[0], bs.inputs["Normal"])
    if fn is skin_shader:
        bs.inputs["Subsurface Weight"].default_value = 0.12
        bs.inputs["Subsurface Radius"].default_value = (0.012, 0.005, 0.003)
    if kw.get("kind") == "amber":
        bs.inputs["Emission Color"].default_value = (*kw["gcol"], 1)
        bs.inputs["Emission Strength"].default_value = 0.25
    b.l(bs.outputs[0], b.out.inputs[0])
    return m


def landmarks(rig, body):
    land = {"cheeks": [], "ears": [], "eyes": []}
    for s, sx in (("L", 1), ("R", -1)):
        e = rig.data.bones[f"eye_{s}"].head_local
        r = max(bpy.data.objects[f"eyeball_{s}"].dimensions) / 2
        land["cheeks"].append((e.x + sx * 0.012, e.y - 0.006, e.z - 0.042))
        land["ears"].append((sx * 0.075, e.y + 0.09, e.z - 0.02))
        land["eyes"].append((tuple(e), r, sx))
    e = rig.data.bones["eye_L"].head_local
    land["nose"] = (0.0, e.y - 0.03, e.z - 0.035)
    return land


IRIS = {"fair": ((0.06, 0.10, 0.14), (0.20, 0.30, 0.36)), "warm": ((0.10, 0.11, 0.07), (0.30, 0.25, 0.12)),
        "olive": ((0.06, 0.04, 0.02), (0.20, 0.12, 0.05)), "tan": ((0.07, 0.045, 0.02), (0.24, 0.14, 0.05)),
        "brown": ((0.04, 0.025, 0.012), (0.15, 0.08, 0.03)), "deep": ((0.03, 0.02, 0.01), (0.12, 0.06, 0.025))}


def assign_live(entry, rig, body, eye_objs, garments):
    """QA-render materials on the whole character."""
    IH = __import__("build_iris_hero")
    IH.lips_attr(body)
    tone, blush = SKIN[entry["skin"]]
    hair = HAIR[entry["hair"][0]]
    brow = _lerp(hair, _mul(tone, 0.25), 0.35) if entry["hair"][0] not in ("white", "grey") else (0.45, 0.44, 0.42)
    skin = live("M_skin", skin_shader, land=landmarks(rig, body), tone=tone, blush=blush, brow=brow,
                brow_w=entry.get("brows", 1.0), age=entry["macros"]["age"], freckles=entry.get("freckles", 0.0),
                stubble=_lerp(HAIR[entry["beard"][0]], tone, 0.35) if entry.get("beard", ("", ""))[1] == "short" else None)
    body.data.materials.clear()
    body.data.materials.append(skin)
    eye = live("M_eye", eye_shader, iris=IRIS[entry["skin"]])
    for o in eye_objs:
        o.data.materials.clear()
        o.data.materials.append(eye)
    cache = {}
    for o in garments.values():
        kind = o.get("mat", "cloth")
        g, t = o["gcol"], o["tcol"]
        key = (g, t, kind)
        if key not in cache:
            look = HAIR if kind == "hair" else PALETTE
            gc = look.get(g) or PALETTE.get(g) or HAIR[g]
            tc = look.get(t) or PALETTE.get(t) or HAIR[t]
            cache[key] = live(f"M_{g}_{t}_{kind}", surface_shader, gcol=gc, tcol=tc, kind=kind)
        o.data.materials.clear()
        o.data.materials.append(cache[key])
