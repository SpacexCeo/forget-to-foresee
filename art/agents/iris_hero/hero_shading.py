"""Iris hero materials: procedural look-dev shaders baked to 2K textures (Blender 4.5, Cycles).

Material sets (glTF materials, texture names match art/tools/compress-glb.sh: normals "agent_iris_normal*"):
    M_Iris_Skin     body (face, neck, hands): tone variation, blush, brows, lips          2048
    M_Iris_Garment  coat, collar, sleeves, capelet, hood, dress, boots, scarf, belt, props 2048 atlas
    M_Iris_Hair     hair cards + cap: strand alpha (MASK), root-to-tip gradient            2048
    M_Iris_Eye      eyeballs: iris, pupil, limbal ring, sclera                               512
    M_Iris_Lashes   lashes: flat dark, no texture
Each textured set bakes base colour (emission bake), roughness/metal and AO (packed to ORM) and a
tangent-space normal map from the shader's bump.
"""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

V = Vector

GARMENT_COLORS = {          # linear RGB base colours (reference: charcoal wool, near-black navy, dusty violet)
    # athletic sportswear (owner 09.11): graphite knit jacket, black top, graphite leggings, trainers
    "jacket": (0.010, 0.010, 0.011), "jacket_collar": (0.010, 0.010, 0.011), "sports_top": (0.007, 0.007, 0.008),
    "leggings": (0.009, 0.009, 0.010), "trainers": (0.72, 0.72, 0.73),
    "coat": (0.040, 0.040, 0.043), "collar": (0.040, 0.040, 0.043), "sleeve": (0.040, 0.040, 0.043),
    "capelet": (0.052, 0.051, 0.053), "hood": (0.052, 0.051, 0.053),
    "dress": (0.010, 0.012, 0.022), "boots": (0.022, 0.013, 0.009),
    "scarf": (0.150, 0.075, 0.220), "belt": (0.035, 0.018, 0.010), "pouch": (0.200, 0.085, 0.032),
    "pendant": (0.62, 0.62, 0.64), "hair_tie": (0.110, 0.055, 0.160),
}
TRIM = {"jacket": (0.014, 0.014, 0.015), "jacket_collar": (0.014, 0.014, 0.015), "sports_top": (0.013, 0.013, 0.014),
        "leggings": (0.006, 0.006, 0.007), "trainers": (0.012, 0.012, 0.013),
        "coat": (0.105, 0.102, 0.100), "collar": (0.105, 0.102, 0.100), "sleeve": (0.105, 0.102, 0.100),
        "capelet": (0.115, 0.112, 0.110), "dress": (0.030, 0.034, 0.055), "boots": (0.010, 0.008, 0.006),
        "scarf": (0.175, 0.090, 0.250)}
ACCENT = {"jacket": (0.80, 0.80, 0.80), "jacket_collar": (0.80, 0.80, 0.80), "leggings": (0.80, 0.80, 0.80)}  # white stripes
ROUGH = {"jacket": 0.76, "jacket_collar": 0.76, "sports_top": 0.72, "leggings": 0.80, "trainers": 0.60,
         "hair_tie": 0.45, "pendant": 0.30, "belt": 0.55, "pouch": 0.55, "boots": 0.50, "scarf": 0.85}
METAL = {"pendant": 1.0}


def _key(name):
    for k in sorted(GARMENT_COLORS, key=len, reverse=True):
        if name.startswith(k):
            return k
    return "coat"


def paint_garment_attrs(objs):
    """Per-vertex base colour, trim colour, roughness, metal as attributes read by the bake shader."""
    for o in objs:
        k = _key(o.name)
        me = o.data
        for nm, val in (("gcol", GARMENT_COLORS[k]), ("tcol", TRIM.get(k, GARMENT_COLORS[k]))):
            a = me.color_attributes.get(nm) or me.color_attributes.new(nm, "FLOAT_COLOR", "POINT")
            for d in a.data:
                d.color = (*val, 1.0)
        acol = ACCENT.get(k, (0.20, 0.13, 0.32))
        a = me.color_attributes.get("acol") or me.color_attributes.new("acol", "FLOAT_COLOR", "POINT")
        for d in a.data:
            d.color = (*acol, 1.0)
        for nm, val in (("rough", ROUGH.get(k, 0.92)), ("metal", METAL.get(k, 0.0))):
            a = me.attributes.get(nm) or me.attributes.new(nm, "FLOAT", "POINT")
            for d in a.data:
                d.value = val
        if "trim" not in me.attributes:
            a = me.attributes.new("trim", "FLOAT", "POINT")


# ----------------------------------------------------------------- node helpers

class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.out = self.n("ShaderNodeOutputMaterial")

    def n(self, kind, **kw):
        node = self.nt.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith("in_"):
                node.inputs[k[3:].replace("_", " ")].default_value = v
            else:
                setattr(node, k, v)
        return node

    def l(self, a, b):
        self.nt.links.new(a, b)

    def attr(self, name, kind="GEOMETRY"):
        a = self.n("ShaderNodeAttribute", attribute_name=name, attribute_type=kind)
        return a

    def math(self, op, a, b=None, clamp=False):
        m = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                m.inputs[i].default_value = x
            else:
                self.l(x, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b):
        m = self.n("ShaderNodeMix", data_type="RGBA")
        for sock, x in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(x, (tuple, list)):
                sock.default_value = (*x, 1.0) if len(x) == 3 else x
            elif isinstance(x, (int, float)):
                sock.default_value = x
            else:
                self.l(x, sock)
        return m.outputs[2]

    def noise(self, scale, detail=4.0, vec=None, rough=0.5):
        t = self.n("ShaderNodeTexNoise", in_Scale=scale, in_Detail=detail, in_Roughness=rough)
        if vec is not None:
            self.l(vec, t.inputs["Vector"])
        return t

    def blob(self, pos, center, radius, soft=1.0):
        """1 at center, 0 beyond radius (object space)."""
        d = self.n("ShaderNodeVectorMath", operation="DISTANCE")
        self.l(pos, d.inputs[0])
        d.inputs[1].default_value = center
        x = self.math("DIVIDE", d.outputs["Value"], radius)
        x = self.math("SUBTRACT", 1.0, x, clamp=True)
        return self.math("POWER", x, soft)


# ----------------------------------------------------------------- shaders: each returns (color, rough, metal, bump_height, alpha)

def skin_shader(b, land):
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    base = (0.62, 0.40, 0.31)
    var = b.noise(38.0, 6.0, pos)
    col = b.mix(b.math("MULTIPLY", var.outputs["Fac"], 0.35), base, (0.66, 0.38, 0.30))
    warm = b.noise(9.0, 3.0, pos)
    col = b.mix(b.math("MULTIPLY", warm.outputs["Fac"], 0.25), col, (0.58, 0.36, 0.30))
    for c in land["cheeks"]:
        col = b.mix(b.math("MULTIPLY", b.blob(pos, c, 0.032, 1.6), 0.38), col, (0.70, 0.30, 0.25))
    col = b.mix(b.math("MULTIPLY", b.blob(pos, land["nose"], 0.020, 1.4), 0.25), col, (0.68, 0.30, 0.25))
    for e in land["ears"]:
        col = b.mix(b.math("MULTIPLY", b.blob(pos, e, 0.030, 1.2), 0.30), col, (0.66, 0.30, 0.25))
    lips = b.attr("lipsw").outputs["Fac"]
    col = b.mix(b.math("MULTIPLY", b.math("POWER", lips, 0.7), 0.75), col, (0.46, 0.17, 0.15))
    col = makeup(b, pos, col, land, lips)
    pores = b.noise(1600.0, 2.0, pos)
    rough = b.math("ADD", 0.48, b.math("MULTIPLY", pores.outputs["Fac"], 0.12))
    rough = b.math("SUBTRACT", rough, b.math("MULTIPLY", b.math("POWER", lips, 0.6), 0.28))   # glossy lips
    mole = b.blob(pos, land["mole"], 0.0021, 0.7)
    height = b.math("ADD", b.math("MULTIPLY", pores.outputs["Fac"], 0.25), b.math("MULTIPLY", mole, 0.6))
    return col, rough, 0.0, height, None


def _local(b, pos, origin, sx):
    """(x outward from the nose, y, z) relative to an eye centre; sx = +1 for her left eye."""
    d = b.n("ShaderNodeVectorMath", operation="SUBTRACT")
    b.l(pos, d.inputs[0])
    d.inputs[1].default_value = origin
    xyz = b.n("ShaderNodeSeparateXYZ")
    b.l(d.outputs[0], xyz.inputs[0])
    return b.math("MULTIPLY", xyz.outputs["X"], sx), xyz.outputs["Y"], xyz.outputs["Z"], d.outputs[0]


def _smooth_band(b, x, half, soft):
    """1 inside |x| < half, fading to 0 over soft."""
    return b.math("SUBTRACT", 1.0, b.math("DIVIDE", b.math("MAXIMUM", b.math("SUBTRACT", b.math("ABSOLUTE", x), half), 0.0),
                                                     soft), clamp=True)


def makeup(b, pos, col, land, lips):
    """Groomed brows (full head, a soft arch peaking at two thirds, a tapered tail, fine hair strokes),
    an upper lash line with a short wing, a soft lid shadow, defined lips and a beauty mark."""
    for (E, r, sx) in land["eyes"]:
        x, y, z, d = _local(b, pos, E, sx)
        # brows: t = 0 at the head (above the inner corner) .. 1 at the tail
        t = b.math("DIVIDE", b.math("ADD", x, 0.017), 0.052)
        tc = b.math("MINIMUM", b.math("MAXIMUM", t, 0.0), 1.0)
        rise = b.math("MULTIPLY", b.math("SINE", b.math("MULTIPLY", b.math("MINIMUM", b.math("DIVIDE", tc, 0.66), 1.0), math.pi / 2)), 0.0110)
        fall = b.math("MULTIPLY", b.math("POWER", b.math("DIVIDE", b.math("MAXIMUM", b.math("SUBTRACT", tc, 0.66), 0.0), 0.34), 1.5), 0.0120)
        zc = b.math("SUBTRACT", b.math("ADD", 0.0165, rise), fall)
        half = b.math("ADD", 0.0010, b.math("MULTIPLY", b.math("POWER", b.math("SUBTRACT", 1.0, tc), 0.5), 0.0033))
        band = _smooth_band(b, b.math("SUBTRACT", z, zc), half, 0.0011)
        inside = b.math("MULTIPLY", b.math("GREATER_THAN", t, -0.02), b.math("LESS_THAN", t, 1.02))
        ombre = b.math("ADD", 0.30, b.math("MULTIPLY", b.math("MINIMUM", b.math("DIVIDE", tc, 0.28), 1.0), 0.70))
        sv = b.n("ShaderNodeCombineXYZ")             # strokes: up and out at the head, along the arch after it
        lean = b.math("ADD", 0.35, b.math("MULTIPLY", b.math("SUBTRACT", 1.0, b.math("MINIMUM", b.math("DIVIDE", tc, 0.3), 1.0)), 1.6))
        b.l(b.math("MULTIPLY", b.math("SUBTRACT", x, b.math("MULTIPLY", z, lean)), 700.0), sv.inputs["X"])
        b.l(b.math("MULTIPLY", b.math("ADD", z, b.math("MULTIPLY", x, 0.2)), 60.0), sv.inputs["Y"])
        hairs = b.n("ShaderNodeTexNoise", in_Scale=1.0, in_Detail=2.0, in_Roughness=0.5)
        b.l(sv.outputs[0], hairs.inputs["Vector"])
        strokes = b.math("ADD", 1.0, b.math("MULTIPLY", b.math("SUBTRACT", hairs.outputs["Fac"], 0.5), 1.2))
        m = b.math("MINIMUM", b.math("MULTIPLY", b.math("MULTIPLY", b.math("MULTIPLY", band, inside), ombre), strokes), 0.95)
        col = b.mix(m, col, (0.045, 0.024, 0.014))
        # lid shadow: a soft mauve-brown wash between the lash line and the crease
        sh = b.math("MULTIPLY", b.blob(pos, (E[0] + sx * 0.003, E[1] - 0.004, E[2] + 0.009), 0.017, 1.4),
                    b.math("GREATER_THAN", z, 0.002))
        col = b.mix(b.math("MULTIPLY", sh, 0.35), col, (0.30, 0.16, 0.15))
        # lash line: a thin dark line hugging the upper lid, thicker and winged at the outer corner
        dist = b.n("ShaderNodeVectorMath", operation="LENGTH")
        b.l(d, dist.inputs[0])
        ring = b.math("DIVIDE", dist.outputs["Value"], r)
        upper = b.math("GREATER_THAN", z, b.math("SUBTRACT", b.math("MULTIPLY", x, 0.35), 0.004))
        wide = b.math("ADD", 1.10, b.math("MULTIPLY", b.math("MAXIMUM", b.math("DIVIDE", x, r), 0.0), 0.12))
        line = b.math("MULTIPLY", b.math("MULTIPLY", b.math("GREATER_THAN", ring, 0.98), b.math("LESS_THAN", ring, wide)), upper)
        wing = b.math("MULTIPLY", b.math("GREATER_THAN", x, r * 0.90), b.math("LESS_THAN", x, r * 1.18))
        wing = b.math("MULTIPLY", wing, _smooth_band(b, b.math("SUBTRACT", z, b.math("MULTIPLY", b.math("SUBTRACT", x, r * 0.85), 0.55)), 0.0006, 0.0008))
        col = b.mix(b.math("MINIMUM", b.math("ADD", line, wing), 0.9), col, (0.020, 0.013, 0.011))
        lower = b.math("MULTIPLY", b.math("MULTIPLY", b.math("GREATER_THAN", ring, 0.98), b.math("LESS_THAN", ring, 1.05)),
                       b.math("LESS_THAN", z, -0.002))
        col = b.mix(b.math("MULTIPLY", lower, 0.30), col, (0.10, 0.06, 0.05))
    # lips: a rosy tint, a slightly deeper liner at the edge
    tint = b.math("MULTIPLY", b.math("POWER", lips, 0.45), 0.85)
    col = b.mix(tint, col, (0.46, 0.12, 0.12))
    edge = b.math("MULTIPLY", b.math("GREATER_THAN", lips, 0.12), b.math("LESS_THAN", lips, 0.45))
    col = b.mix(b.math("MULTIPLY", edge, 0.35), col, (0.30, 0.07, 0.08))
    # beauty mark: small, round, deep brown with a soft edge (her left cheek, above the mouth corner)
    mole = b.blob(pos, land["mole"], 0.0021, 0.7)
    col = b.mix(b.math("MINIMUM", b.math("MULTIPLY", mole, 1.6), 0.95), col, (0.035, 0.018, 0.012))
    return col


def garment_shader(b):
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    gcol = b.attr("gcol").outputs["Color"]
    tcol = b.attr("tcol").outputs["Color"]
    trim = b.attr("trim").outputs["Fac"]
    col = b.mix(b.math("GREATER_THAN", trim, 0.5), gcol, tcol)
    accent = b.attr("accent").outputs["Fac"]
    col = b.mix(b.math("GREATER_THAN", accent, 0.5), col, b.attr("acol").outputs["Color"])   # stripes / piping
    fib = b.noise(420.0, 8.0, pos, 0.7)
    weave = b.n("ShaderNodeTexWave", wave_type="BANDS", in_Scale=180.0, in_Distortion=2.0)
    b.l(pos, weave.inputs["Vector"])
    shade = b.math("ADD", 0.86, b.math("MULTIPLY", fib.outputs["Fac"], 0.28))
    col = b.mix(1.0, col, col)
    mul = b.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mul.inputs[0].default_value = 1.0
    b.l(col, mul.inputs[6])
    comb = b.n("ShaderNodeCombineColor")
    for s in ("Red", "Green", "Blue"):
        b.l(shade, comb.inputs[s])
    b.l(comb.outputs[0], mul.inputs[7])
    rough = b.math("SUBTRACT", b.attr("rough").outputs["Fac"], b.math("MULTIPLY", accent, 0.30))
    metal = b.attr("metal").outputs["Fac"]
    h = b.math("ADD", b.math("MULTIPLY", fib.outputs["Fac"], 0.5), b.math("MULTIPLY", weave.outputs["Fac"], 0.2))
    return mul.outputs[2], rough, metal, h, None


def hair_shader(b):
    """Card atlas of 8 columns (hero_costume.HAIR_COLS): dense clumps (0-3), airy clumps (4-6) and single
    flyaway strands (7). Hundreds of fine strands per column with gaps, ragged tips at different lengths,
    a dark root, chestnut mid-lengths, sun-lighter tips and per-strand highlights."""
    uv = b.n("ShaderNodeUVMap", uv_map="UVMap")
    xyz = b.n("ShaderNodeSeparateXYZ")
    b.l(uv.outputs["UV"], xyz.inputs[0])
    u, v = xyz.outputs["X"], xyz.outputs["Y"]
    col_i = b.math("FLOOR", b.math("MULTIPLY", u, 8.0))
    locks = b.math("LESS_THAN", u, 0.5)                                 # sculpted locks: opaque
    lu = b.math("FRACT", b.math("MULTIPLY", u, 8.0))                     # 0..1 across the card
    # strands: thin bands across u, slightly wavy along v
    sv = b.n("ShaderNodeCombineXYZ")
    b.l(b.math("ADD", u, b.math("MULTIPLY", b.math("SINE", b.math("MULTIPLY", v, 9.0)), 0.004)), sv.inputs["X"])
    b.l(b.math("MULTIPLY", v, 0.0015), sv.inputs["Y"])
    fine = b.n("ShaderNodeTexNoise", in_Scale=900.0, in_Detail=2.0, in_Roughness=0.4)
    b.l(sv.outputs[0], fine.inputs["Vector"])
    coarse = b.n("ShaderNodeTexNoise", in_Scale=140.0, in_Detail=2.0)
    b.l(sv.outputs[0], coarse.inputs["Vector"])
    strand = b.math("ADD", b.math("MULTIPLY", fine.outputs["Fac"], 0.75), b.math("MULTIPLY", coarse.outputs["Fac"], 0.35))
    # density per column: dense 0.47, airy 0.55, single strands 0.62 (higher = fewer strands)
    thr = b.math("ADD", 0.47, b.math("MULTIPLY", b.math("GREATER_THAN", col_i, 3.5), 0.08))
    thr = b.math("ADD", thr, b.math("MULTIPLY", b.math("GREATER_THAN", col_i, 6.5), 0.07))
    edge = b.math("SUBTRACT", 1.0, b.math("POWER", b.math("ABSOLUTE", b.math("SUBTRACT", b.math("MULTIPLY", lu, 2.0), 1.0)), 3.0))
    thr = b.math("ADD", thr, b.math("MULTIPLY", b.math("SUBTRACT", 1.0, edge), 0.45))  # thinner at the card edges
    hairs = b.math("GREATER_THAN", strand, thr)
    # ragged tips: each strand ends at its own length (v = 0 is the tip)
    tipn = b.n("ShaderNodeTexNoise", in_Scale=300.0, in_Detail=1.0)
    tv = b.n("ShaderNodeCombineXYZ"); b.l(u, tv.inputs["X"])
    b.l(tv.outputs[0], tipn.inputs["Vector"])
    tips = b.math("GREATER_THAN", v, b.math("MULTIPLY", b.math("SUBTRACT", tipn.outputs["Fac"], 0.3), 0.55))
    roots = b.math("LESS_THAN", v, b.math("SUBTRACT", 1.0, b.math("MULTIPLY", tipn.outputs["Fac"], 0.12)))
    alpha = b.math("MAXIMUM", b.math("MULTIPLY", b.math("MULTIPLY", hairs, tips), roots), locks)
    # colour: root -> mid -> tip, per-strand value variation and highlights
    c = b.mix(b.math("POWER", v, 0.6), (0.20, 0.10, 0.050), (0.120, 0.052, 0.024))     # tip (v=0) -> mid
    root = b.math("MULTIPLY", b.math("SUBTRACT", v, 0.82), 5.5, clamp=True)
    c = b.mix(b.math("POWER", root, 1.5), c, (0.045, 0.020, 0.011))                     # dark roots
    var = b.math("MULTIPLY", coarse.outputs["Fac"], 1.0)
    c = b.mix(b.math("MULTIPLY", b.math("GREATER_THAN", fine.outputs["Fac"], 0.66), 0.45), c, (0.30, 0.16, 0.08))
    c = b.mix(b.math("MULTIPLY", var, 0.3), c, (0.07, 0.032, 0.016))
    return c, 0.55, 0.0, b.math("MULTIPLY", strand, 0.4), alpha


def eye_shader(b):
    uv = b.n("ShaderNodeUVMap", uv_map="UVMap")
    d = b.n("ShaderNodeVectorMath", operation="DISTANCE")
    b.l(uv.outputs["UV"], d.inputs[0])
    d.inputs[1].default_value = (0.5, 0.5, 0.0)
    r = d.outputs["Value"]
    rad = b.n("ShaderNodeTexGradient", gradient_type="RADIAL")
    b.l(uv.outputs["UV"], rad.inputs["Vector"])
    streak = b.n("ShaderNodeTexNoise", in_Scale=60.0, in_Detail=4.0)
    b.l(uv.outputs["UV"], streak.inputs["Vector"])
    iris = b.mix(streak.outputs["Fac"], (0.10, 0.11, 0.07), (0.30, 0.25, 0.12))
    iris = b.mix(b.math("SMOOTH_MAX", b.math("SUBTRACT", b.math("MULTIPLY", r, 6.0), 0.9), 0.0, ), iris, (0.04, 0.035, 0.03))
    col = b.mix(b.math("GREATER_THAN", r, 0.205), iris, (0.80, 0.76, 0.72))
    col = b.mix(b.math("LESS_THAN", r, 0.075), col, (0.01, 0.01, 0.01))
    return col, 0.08, 0.0, None, None


# ----------------------------------------------------------------- bake

def _image(name, size, alpha=False):
    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    img.generated_color = (0.5, 0.5, 1.0, 1.0) if "normal" in name else (0, 0, 0, 1)
    return img


def bake_set(objs, mat_name, shader_fn, size, out_dir, tex_base, samples=16, ao=True, **kw):
    """Bake one material set (all objs share the material) -> final glTF material."""
    sc = bpy.context.scene
    mat = bpy.data.materials.new(mat_name + "_bake")
    b = NB(mat)
    col, rough, metal, height, alpha = shader_fn(b, **kw) if kw else shader_fn(b)
    em = b.n("ShaderNodeEmission")
    bsdf = b.n("ShaderNodeBsdfPrincipled")
    if height is not None:
        bump = b.n("ShaderNodeBump", in_Strength=0.35, in_Distance=0.002)
        b.l(height, bump.inputs["Height"])
        b.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
    tex = b.n("ShaderNodeTexImage")
    b.nt.nodes.active = tex
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)

    def run(kind, img, link_from=None):
        tex.image = img
        if link_from is not None:
            for lk in list(b.out.inputs["Surface"].links):
                b.nt.links.remove(lk)
            if isinstance(link_from, (int, float)):
                em.inputs["Color"].default_value = (link_from, link_from, link_from, 1)
                for lk in list(em.inputs["Color"].links):
                    b.nt.links.remove(lk)
            else:
                b.l(link_from, em.inputs["Color"])
            b.l(em.outputs[0], b.out.inputs["Surface"])
        else:
            b.l(bsdf.outputs[0], b.out.inputs["Surface"])
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        sc.cycles.samples = samples
        sc.render.bake.margin = 8
        sc.render.bake.use_clear = True
        bpy.ops.object.bake(type=kind, pass_filter={"COLOR"} if kind == "DIFFUSE" else set(), use_clear=True,
                            margin=8)
        return np.array(img.pixels[:]).reshape(size, size, 4)

    def gray(x):
        if isinstance(x, (int, float)):
            return x
        c = b.n("ShaderNodeCombineColor")
        for s in ("Red", "Green", "Blue"):
            b.l(x, c.inputs[s])
        return c.outputs[0]

    tmp = _image(f"_tmp_{mat_name}", size)
    base = run("EMIT", tmp, col).copy()
    r = run("EMIT", tmp, gray(rough))[..., 0].copy()
    m = run("EMIT", tmp, gray(metal))[..., 0].copy()
    a_ = run("EMIT", tmp, gray(alpha))[..., 0].copy() if alpha is not None else None
    occ = np.ones_like(r)
    if ao:
        sc.world.light_settings.distance = 0.25
        occ = run("AO", tmp)[..., 0].copy()
        occ = 0.35 + 0.65 * occ
    nimg = _image(f"agent_iris_normal_{tex_base}", size)
    nimg.colorspace_settings.name = "Non-Color"
    run("NORMAL", nimg)
    bimg = _image(f"agent_iris_{tex_base}_basecolor", size, alpha=a_ is not None)
    if a_ is not None:
        base[..., 3] = a_
    bimg.pixels[:] = base.ravel()
    oimg = _image(f"agent_iris_{tex_base}_orm", size)
    oimg.colorspace_settings.name = "Non-Color"
    orm = np.stack([occ, r, m, np.ones_like(r)], -1)
    oimg.pixels[:] = orm.ravel()
    for img in (bimg, oimg, nimg):
        img.filepath_raw = os.path.join(out_dir, img.name + ".png")
        img.file_format = "PNG"
        img.save()
    bpy.data.images.remove(tmp)
    final = final_material(mat_name, bimg, oimg, nimg, alpha=a_ is not None)
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(final)
    bpy.data.materials.remove(mat)
    return final


def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def final_material(name, base_img, orm_img, nrm_img, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base_img
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nrm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group()
    nt.links.new(tb.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bs.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bs.inputs["Metallic"])
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
    if alpha:
        rnd = nt.nodes.new("ShaderNodeMath"); rnd.operation = "ROUND"
        nt.links.new(tb.outputs["Alpha"], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], bs.inputs["Alpha"])
        m.blend_method = "CLIP" if hasattr(m, "blend_method") else m.blend_method
        m.use_backface_culling = False
    return m


def flat_material(name, color, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Roughness"].default_value = rough
    return m


def pack_atlas(objs, margin=0.004):
    """One UV space for several objects (multi-object edit): equal texel density, packed."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers.active = o.data.uv_layers[0]
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
