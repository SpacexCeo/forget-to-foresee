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
    uv = b.attr("eyeuv")                              # eye_attr(): survives the atlas packing
    d = b.n("ShaderNodeVectorMath", operation="DISTANCE")
    b.l(uv.outputs["Vector"], d.inputs[0])
    d.inputs[1].default_value = (0.5, 0.5, 0.0)
    r = d.outputs["Value"]
    streak = b.n("ShaderNodeTexNoise", in_Scale=60.0, in_Detail=4.0)
    b.l(uv.outputs["Vector"], streak.inputs["Vector"])
    ic = b.mix(streak.outputs["Fac"], iris[0], iris[1])
    ic = b.mix(b.math("SMOOTH_MAX", b.math("SUBTRACT", b.math("MULTIPLY", r, 6.0), 0.9), 0.0), ic, (0.04, 0.035, 0.03))
    col = b.mix(b.math("GREATER_THAN", r, 0.205), ic, (0.80, 0.76, 0.72))
    col = b.mix(b.math("LESS_THAN", r, 0.075), col, (0.01, 0.01, 0.01))
    return col, 0.08, 0.0, None, None


MAT = {   # kind: (roughness, metal, fibre scale, fibre strength, bump)
    "cloth": (0.88, 0.0, 150.0, 0.30, 0.9), "leather": (0.52, 0.0, 70.0, 0.34, 0.6), "metal": (0.38, 1.0, 90.0, 0.12, 0.15),
    "wood": (0.65, 0.0, 60.0, 0.30, 0.4), "straw": (0.75, 0.0, 240.0, 0.40, 0.9), "hair": (0.46, 0.0, 120.0, 0.30, 0.9),
    "amber": (0.18, 0.0, 30.0, 0.15, 0.0), "shell": (0.30, 0.0, 40.0, 0.10, 0.1), "bread": (0.8, 0.0, 80.0, 0.35, 0.5),
}


def surface_shader(b, gcol=(0.5, 0.5, 0.5), tcol=(0.3, 0.3, 0.3), kind="cloth"):
    rough, metal, scale, strength, bump = MAT[kind]
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    trim = b.attr("trim").outputs["Fac"]
    if gcol is None:                                # per-object colours painted as attributes (the atlas bake)
        gcol, tcol = b.attr("gcol").outputs["Color"], b.attr("tcol").outputs["Color"]
    col = b.mix(b.math("GREATER_THAN", trim, 0.5), gcol, tcol)
    fib = b.noise(scale, 8.0, pos, 0.7)
    big = b.noise(7.0, 3.0, pos)
    height = fib.outputs["Fac"]
    if kind == "cloth":                               # a woven surface: warp and weft threads crossing
        wv = []
        for d in ("X", "Z"):
            w = b.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction=d, in_Scale=95.0, in_Distortion=1.2, in_Detail=1.0)
            b.l(pos, w.inputs["Vector"])
            wv.append(w.outputs["Fac"])
        weave = b.math("MULTIPLY", b.math("ADD", wv[0], wv[1]), 0.5)
        height = b.math("ADD", b.math("MULTIPLY", weave, 0.65), b.math("MULTIPLY", fib.outputs["Fac"], 0.35))
    shade = b.math("ADD", 1.0 - strength * 0.5, b.math("MULTIPLY", height, strength))
    shade = b.math("MULTIPLY", shade, b.math("ADD", 0.82, b.math("MULTIPLY", big.outputs["Fac"], 0.36)))
    # worn and dusty toward the lower edge of the piece; a darker seam where a trim meets the cloth
    hemz = b.attr("hemz").outputs["Fac"]
    grime = b.noise(11.0, 4.0, pos)
    low = b.math("MULTIPLY", b.math("POWER", hemz, 2.5), b.math("ADD", 0.45, grime.outputs["Fac"]))
    shade = b.math("MULTIPLY", shade, b.math("SUBTRACT", 1.0, b.math("MULTIPLY", low, 0.30 if kind in ("cloth", "leather") else 0.0)))
    seam = b.math("SUBTRACT", 1.0, b.math("MINIMUM", 1.0, b.math("MULTIPLY", b.math("ABSOLUTE", b.math("SUBTRACT", trim, 0.5)), 16.0)))
    shade = b.math("MULTIPLY", shade, b.math("SUBTRACT", 1.0, b.math("MULTIPLY", seam, 0.30 if kind in ("cloth", "leather") else 0.0)))
    if kind == "leather":                             # scuffed lighter along edges and in patches
        scuff = b.noise(23.0, 5.0, pos)
        shade = b.math("MULTIPLY", shade, b.math("ADD", 0.86, b.math("MULTIPLY", b.math("POWER", scuff.outputs["Fac"], 3.0), 1.3)))
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
    out = mul.outputs[2]
    # flour (the baker's apron): pale dusty patches, thicker toward the middle and the lower half
    dust = b.attr("dust").outputs["Fac"]
    patch_ = b.noise(6.5, 5.0, pos, 0.75)
    amount = b.math("MULTIPLY", dust, b.math("MINIMUM", 1.0, b.math("MAXIMUM", 0.0, b.math("MULTIPLY", b.math("SUBTRACT", patch_.outputs["Fac"], 0.42), 5.0))))
    fl = b.n("ShaderNodeMix", data_type="RGBA", blend_type="MIX")
    b.l(b.math("MULTIPLY", amount, 0.8), fl.inputs[0])
    b.l(out, fl.inputs[6])
    fl.inputs[7].default_value = (0.74, 0.72, 0.68, 1.0)
    rough_out = b.math("ADD", rough - 0.10, b.math("MULTIPLY", big.outputs["Fac"], 0.20))
    return fl.outputs[2], rough_out, metal, b.math("MULTIPLY", height, bump), None


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


def eye_attr(o):
    """Iris coordinates of an eyeball as a vertex attribute: (0.5, 0.5) at the pupil, looking along -Y."""
    me = o.data
    n = len(me.vertices)
    c = sum((v.co for v in me.vertices), __import__("mathutils").Vector()) / n
    r = max((v.co - c).length for v in me.vertices)
    a = me.attributes.get("eyeuv") or me.attributes.new("eyeuv", "FLOAT_VECTOR", "POINT")
    for v in me.vertices:
        p = v.co - c
        a.data[v.index].vector = (0.5 + p.x / (2.2 * r), 0.5 + p.z / (2.2 * r), 0.0) if p.y < 0 else (0.02, 0.02, 0.0)


def trim_field(o, width=0.25):
    """Turn the 0/1 trim flags into a smooth signed field (0.5 on the trim's edge) so the edge stays a clean
    line in the bake after the mesh is reduced."""
    from mathutils.kdtree import KDTree
    me = o.data
    a = me.attributes.get("trim")
    if a is None:
        return
    flag = [d.value > 0.5 for d in a.data]
    if not any(flag) or all(flag):
        return
    kin, kout = KDTree(sum(flag)), KDTree(len(flag) - sum(flag))
    for v in me.vertices:
        (kin if flag[v.index] else kout).insert(v.co, v.index)
    kin.balance()
    kout.balance()
    for v in me.vertices:
        if flag[v.index]:
            s_ = kout.find(v.co)[2] * 0.5
        else:
            s_ = -kin.find(v.co)[2] * 0.5
        a.data[v.index].value = max(0.0, min(1.0, 0.5 + s_ / width))


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
        eye_attr(o)
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


# ===================================================================== one texture set per person

def paint_colours(garments):
    """gcol / tcol colour attributes from each garment's palette keys (read by surface_shader in the bake)."""
    for o in garments:
        kind = o.get("mat", "cloth")
        look = HAIR if kind == "hair" else PALETTE
        for nm, key in (("gcol", o["gcol"]), ("tcol", o["tcol"])):
            val = look.get(key) or PALETTE.get(key) or HAIR[key]
            a = o.data.color_attributes.get(nm) or o.data.color_attributes.new(nm, "FLOAT_COLOR", "POINT")
            for d in a.data:
                d.color = (*val, 1.0)
        if "trim" not in o.data.attributes:
            o.data.attributes.new("trim", "FLOAT", "POINT")
        # hemz: 0 at the top of the piece .. 1 at its lower edge (wear and dust gather there); dust: flour
        zs = [v.co.z for v in o.data.vertices] or [0.0]
        z0, z1 = min(zs), max(zs)
        tall = (z1 - z0) > 0.22 and kind in ("cloth", "leather")
        for nm in ("hemz", "dust"):
            if nm not in o.data.attributes:
                o.data.attributes.new(nm, "FLOAT", "POINT")
        a, d = o.data.attributes["hemz"], o.data.attributes["dust"]   # fetched after both exist (a new one moves the others)
        for v in o.data.vertices:
            a.data[v.index].value = (z1 - v.co.z) / (z1 - z0) if tall else 0.0
            d.data[v.index].value = float(o.get("dust", 0.0))


def pack_one_atlas(skin_objs, other_objs, boost=(), margin=0.003):
    """One UV space for the whole person: garments are unwrapped (smart project), the skin keeps the
    MakeHuman islands; equal texel density, the objects in `boost` (the face, the eyes) get 1.5x."""
    if other_objs:
        S.pack_atlas(other_objs, margin)
    objs = list(skin_objs) + list(other_objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers[0]
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in boost:
        uv = o.data.uv_layers.active.data
        for d in uv:
            d.uv = d.uv * 1.5
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:                                   # one UV layer name everywhere (the meshes are joined later)
        o.data.uv_layers[0].name = "UVMap"
        for extra in list(o.data.uv_layers)[1:]:
            o.data.uv_layers.remove(extra)


def bake_atlas(groups, name, size, out_dir, samples=16):
    """groups: [(objects, shader_fn, kwargs)]. Every group bakes with its own shader into the same
    base colour / ORM / normal images -> one final glTF material on everything."""
    import numpy as np
    import os
    sc = bpy.context.scene
    tmp = S._image(f"_tmp_{name}", size)
    mats, bake_mats = [], []
    for gi, (objs, fn, kw) in enumerate(groups):
        mat = bpy.data.materials.new(f"_bake_{name}_{gi}")
        b = NB(mat)
        col, rough, metal, height, alpha = fn(b, **kw)
        em = b.n("ShaderNodeEmission")
        bsdf = b.n("ShaderNodeBsdfPrincipled")
        if height is not None:
            bump = b.n("ShaderNodeBump", in_Strength=0.6, in_Distance=0.004)
            b.l(height, bump.inputs["Height"])
            b.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
        tex = b.n("ShaderNodeTexImage")
        b.nt.nodes.active = tex
        for o in objs:
            o.data.materials.clear()
            o.data.materials.append(mat)
        mats.append((b, em, bsdf, tex, col, rough, metal))
        bake_mats.append(mat)
    allobjs = [o for objs, _, _ in groups for o in objs]

    def run(kind, img, which=None):
        for b, em, bsdf, tex, col, rough, metal in mats:
            tex.image = img
            for lk in list(b.out.inputs["Surface"].links):
                b.nt.links.remove(lk)
            if which is None:
                b.l(bsdf.outputs[0], b.out.inputs["Surface"])
                continue
            x = {"col": col, "rough": rough, "metal": metal}[which]
            for lk in list(em.inputs["Color"].links):
                b.nt.links.remove(lk)
            if isinstance(x, (int, float)):
                em.inputs["Color"].default_value = (x, x, x, 1)
            elif isinstance(x, tuple):
                em.inputs["Color"].default_value = (*x, 1)
            elif which == "col":
                b.l(x, em.inputs["Color"])
            else:
                c = b.n("ShaderNodeCombineColor")
                for s_ in ("Red", "Green", "Blue"):
                    b.l(x, c.inputs[s_])
                b.l(c.outputs[0], em.inputs["Color"])
            b.l(em.outputs[0], b.out.inputs["Surface"])
        bpy.ops.object.select_all(action="DESELECT")
        for o in allobjs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = allobjs[0]
        sc.cycles.samples = samples
        bpy.ops.object.bake(type=kind, pass_filter={"COLOR"} if kind == "DIFFUSE" else set(), use_clear=True, margin=6)
        return np.array(img.pixels[:]).reshape(size, size, 4)

    base = run("EMIT", tmp, "col").copy()
    r = run("EMIT", tmp, "rough")[..., 0].copy()
    m = run("EMIT", tmp, "metal")[..., 0].copy()
    sc.world.light_settings.distance = 0.25
    ao = run("AO", tmp)[..., 0].copy()
    for _ in range(3):                                # the few-sample AO is grainy: a small blur before it tints the colour
        ao = (ao + np.roll(ao, 1, 0) + np.roll(ao, -1, 0) + np.roll(ao, 1, 1) + np.roll(ao, -1, 1)) / 5.0
    occ = 0.40 + 0.60 * ao
    base[..., :3] *= (0.50 + 0.50 * ao)[..., None]      # contact shading in the colour too: folds, under belts and aprons
    nimg = S._image(f"{name}_normal", size)
    nimg.colorspace_settings.name = "Non-Color"
    run("NORMAL", nimg)
    bimg = S._image(f"{name}_basecolor", size)
    base[..., 3] = 1.0
    bimg.pixels[:] = base.ravel()
    oimg = S._image(f"{name}_orm", size)
    oimg.colorspace_settings.name = "Non-Color"
    oimg.pixels[:] = np.stack([occ, r, m, np.ones_like(r)], -1).ravel()
    for img in (bimg, oimg, nimg):
        img.filepath_raw = os.path.join(out_dir, img.name + ".png")
        img.file_format = "PNG"
        img.save()
    bpy.data.images.remove(tmp)
    final = S.final_material("M_" + name, bimg, oimg, nimg)
    for o in allobjs:
        o.data.materials.clear()
        o.data.materials.append(final)
    for mat in bake_mats:
        bpy.data.materials.remove(mat)
    return final
