"""Procedural source for the collectible items, the wheel-of-fortune prop and the Shard Exchange trading board.

Run headless with Blender 4.5 LTS (GPU server):

    blender -b -P art/items/build_items.py -- <out_dir> [id ...]

For every item it builds the mesh in an empty scene, exports <out_dir>/raw/<id>.glb (+ <id>_m.glb for the
two props) and renders a transparent 512 px icon <out_dir>/icons/<id>.png with one shared light rig
(Cycles, GPU). art/items/ship.sh downsizes the icons to 256/128, compresses the glbs and writes the manifest.

Blender is Z-up with the front facing -Y (glTF: Y-up, front +Z). Pivot: centre of the base. No textures:
every material is a flat PBR value (palette T-001_06: bronze #A87C3E, amber #FFB84D, ivory #D8C9A5,
dark timber #4B382B), so the files stay tiny; detail comes from bevels and the facet cuts.
Shards are alpha-blended crystal with an emissive inner glyph built from the round-sign strokes
(a broken ring, a tick and one or two arcs).
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau
D = math.radians


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------------ materials

_MATS = {}


def mat(name, color, metal=0.0, rough=0.5, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    col = srgb(color) if isinstance(color, str) else color
    p.inputs["Base Color"].default_value = (*col, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if coat:
        p.inputs["Coat Weight"].default_value = coat
    if emit:
        e = srgb(emit) if isinstance(emit, str) else emit
        p.inputs["Emission Color"].default_value = (*e, 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    _MATS[name] = m
    return m


def palette():
    return dict(
        bronze=mat("bronze", "#A87C3E", 1.0, 0.38),
        bronze_dk=mat("bronze_dark", "#6E4A22", 1.0, 0.42),
        brass=mat("brass", "#D2A85A", 1.0, 0.24),
        iron=mat("iron", "#4A4E52", 0.9, 0.45),
        steel=mat("steel", "#8C9296", 1.0, 0.3),
        amber=mat("amber_glow", "#FFB84D", 0.0, 0.25, emit="#FFA63A", emit_strength=3.0),
        amber_glass=mat("amber_glass", "#FFC870", 0.0, 0.05, emit="#FFB050", emit_strength=0.12, alpha=0.4),
        ivory=mat("ivory", "#D8C9A5", 0.0, 0.6),
        timber=mat("timber", "#4E3220", 0.0, 0.62),
        timber_lt=mat("timber_light", "#7E5230", 0.0, 0.58),
        teal=mat("teal_enamel", "#2F7F7A", 0.0, 0.35, coat=0.6),
        indigo=mat("indigo_enamel", "#414D68", 0.0, 0.4, coat=0.5),
        ochre=mat("ochre_enamel", "#BD9146", 0.0, 0.4, coat=0.5),
        slate=mat("board_slate", "#20262B", 0.0, 0.7),
        bulb=mat("bulb_glow", "#FFE6B0", 0.0, 0.3, emit="#FFD48A", emit_strength=5.0),
    )


RARITY = {
    "pearl": dict(rarity="common", body="#A39C9A", emit="#D8C8C0", es=0.06, glyph="#FFC870", a=0.86),
    "teal": dict(rarity="uncommon", body="#1E9E94", emit="#18C8B6", es=0.55, glyph="#C8FFF6", a=0.78),
    "violet": dict(rarity="rare", body="#6A3FD8", emit="#8048FF", es=0.7, glyph="#F0E4FF", a=0.78),
    "amber": dict(rarity="legendary", body="#D86A08", emit="#FF7A08", es=0.55, glyph="#FFF0C8", a=0.82),
}

# ------------------------------------------------------------------ helpers


def new_obj(name, bm, material=None, smooth=False, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if material:
        o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = smooth
    if parent:
        o.parent = parent
    return o


def hull(name, pts, material, smooth=False):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    return new_obj(name, bm, material, smooth)


def prim(kind, name, material, smooth=True, **kw):
    bm = bmesh.new()
    if kind == "cyl":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get("seg", 16), radius1=kw["r"], radius2=kw.get("r2", kw["r"]),
                              depth=kw["h"])
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get("u", 12), v_segments=kw.get("v", 8), radius=kw["r"])
    elif kind == "ico":
        bmesh.ops.create_icosphere(bm, subdivisions=kw.get("sub", 1), radius=kw["r"])
    elif kind == "box":
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=kw["s"], verts=bm.verts)
    elif kind == "torus":
        R, r, U, V = kw["R"], kw["r"], kw.get("U", 24), kw.get("V", 8)
        a0, a1 = kw.get("a0", 0.0), kw.get("a1", TAU)
        closed = abs(a1 - a0 - TAU) < 1e-6
        nU = U if closed else U + 1
        rows = []
        for i in range(nU):
            a = a0 + (a1 - a0) * i / U
            c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
            rad = Vector((math.cos(a), math.sin(a), 0))
            row = []
            for j in range(V):
                b = TAU * j / V
                row.append(bm.verts.new(c + rad * math.cos(b) * r * kw.get("sx", 1) + Vector((0, 0, math.sin(b) * r))))
            rows.append(row)
        for i in range(U):
            i2 = (i + 1) % nU
            for j in range(V):
                j2 = (j + 1) % V
                bm.faces.new((rows[i][j], rows[i2][j], rows[i2][j2], rows[i][j2]))
        if not closed:
            bm.faces.new(list(reversed(rows[0])))
            bm.faces.new(rows[-1])
    o = new_obj(name, bm, material, smooth)
    return o


def place(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    o.location = loc
    o.rotation_euler = [D(a) for a in rot]
    if scale:
        o.scale = scale
    return o


def bevel(o, w=0.004, seg=2, angle=40):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = w
    m.segments = seg
    m.limit_method = "ANGLE"
    m.angle_limit = D(angle)
    m.harden_normals = False
    return o


def auto_smooth(o, angle=35):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.shade_auto_smooth(angle=D(angle))


def gear_bm(bm, teeth, r_root, r_tip, thick, r_hole=0.0, tooth_frac=0.42, z=0.0):
    """Extruded spur-gear profile (flat faces, chamfer comes from the bevel modifier)."""
    prof = []
    for i in range(teeth):
        a = TAU * i / teeth
        w = TAU / teeth
        for t, r in ((0.0, r_root), (0.5 - tooth_frac / 2 - 0.06, r_root), (0.5 - tooth_frac / 2, r_tip),
                     (0.5 + tooth_frac / 2, r_tip), (0.5 + tooth_frac / 2 + 0.06, r_root)):
            aa = a + w * t
            prof.append((math.cos(aa) * r, math.sin(aa) * r))
    top = [bm.verts.new((x, y, z + thick / 2)) for x, y in prof]
    bot = [bm.verts.new((x, y, z - thick / 2)) for x, y in prof]
    n = len(prof)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    if r_hole > 0:
        # ring caps between the tooth profile and the bore
        ht = [bm.verts.new((math.cos(TAU * i / n) * r_hole, math.sin(TAU * i / n) * r_hole, z + thick / 2)) for i in range(n)]
        hb = [bm.verts.new((math.cos(TAU * i / n) * r_hole, math.sin(TAU * i / n) * r_hole, z - thick / 2)) for i in range(n)]
        # align: profile vertex i is at angle ~ its own angle, bore uses even spacing; fine for flat caps
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((top[i], top[j], ht[j], ht[i]))
            bm.faces.new((bot[j], bot[i], hb[i], hb[j]))
            bm.faces.new((hb[i], hb[j], ht[j], ht[i]))
    else:
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))


def gear(name, material, teeth, r_root, r_tip, thick, r_hole=0.0):
    bm = bmesh.new()
    gear_bm(bm, teeth, r_root, r_tip, thick, r_hole)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, material)


def curve_strokes(name, strokes, depth, material, res=6):
    """strokes: list of point lists (x, y) in the glyph plane (XZ, facing -Y). Tube radius `depth`."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = depth
    cu.bevel_resolution = 1
    cu.resolution_u = res
    cu.use_fill_caps = True
    for pts in strokes:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, (x, y) in enumerate(pts):
            sp.points[i].co = (x, 0, y, 1)
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return to_mesh(o)


def ribbon(name, strokes, width, material, lift=0.0):
    """Flat glyph inlay: each stroke becomes a quad strip in the XZ plane facing -Y (2 tris per segment)."""
    bm = bmesh.new()
    for pts in strokes:
        P = [Vector((x, y)) for x, y in pts]
        L, Rr = [], []
        for i, p in enumerate(P):
            t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            n = Vector((-t.y, t.x)) * width / 2
            L.append(bm.verts.new((p.x + n.x, -lift, p.y + n.y)))
            Rr.append(bm.verts.new((p.x - n.x, -lift, p.y - n.y)))
        for i in range(len(P) - 1):
            f = bm.faces.new((L[i], Rr[i], Rr[i + 1], L[i + 1]))
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    return new_obj(name, bm, material)


def to_mesh(o):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    name, mats, mw, par = o.name, list(o.data.materials), o.matrix_world.copy(), o.parent
    bpy.data.objects.remove(o)
    n = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(n)
    n.matrix_world = mw
    n.parent = par
    if not me.materials:
        for m in mats:
            me.materials.append(m)
    return n


def arc(cx, cy, r, a0, a1, n=None, step=12):
    n = n or max(3, int(abs(a1 - a0) / D(step)))
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * r, cy + math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + 1)]


def glyph_strokes(seed, R, step=12):
    """A round sign: a broken ring plus a tick and one or two inner arcs, deterministic per seed."""
    rnd = random.Random(seed)
    gap = D(rnd.uniform(28, 70))
    g0 = rnd.uniform(0, TAU)
    s = [arc(0, 0, R, g0 + gap / 2, g0 + TAU - gap / 2, step=step)]
    # tick through the gap side
    ta = g0 + TAU / 2 + rnd.uniform(-0.6, 0.6)
    s.append([(math.cos(ta) * R * 0.55, math.sin(ta) * R * 0.55), (math.cos(ta) * R * 1.28, math.sin(ta) * R * 1.28)])
    for k in range(rnd.choice((1, 2))):
        r2 = R * rnd.uniform(0.35, 0.62)
        a = rnd.uniform(0, TAU)
        s.append(arc(math.cos(a) * R * 0.18, math.sin(a) * R * 0.18, r2, a, a + D(rnd.uniform(110, 220)), step=step))
    if rnd.random() < 0.5:
        a = rnd.uniform(0, TAU)
        s.append([(math.cos(a) * R * 0.15, math.sin(a) * R * 0.15), (math.cos(a) * R * 0.75, math.sin(a) * R * 0.75)])
    return s


def join(objs, name, sharp=50):
    """Bake modifiers, join into the first object, mark edges sharper than `sharp` degrees (flat faces stay flat)."""
    objs = [to_mesh(o) if o.modifiers else o for o in objs if o]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs,
                                       selected_editable_objects=objs):
            bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name
    o.data.set_sharp_from_angle(angle=D(sharp))
    return o


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


# ------------------------------------------------------------------ shards

SHARD_CUTS = {
    # id: (rarity, cut, glyph seed)
    "shard_pearl_drop": ("pearl", "bipyramid6", 11),
    "shard_pearl_tablet": ("pearl", "tablet", 12),
    "shard_teal_twin": ("teal", "twin", 21),
    "shard_teal_octa": ("teal", "octa", 22),
    "shard_violet_cluster": ("violet", "cluster", 31),
    "shard_violet_spire": ("violet", "spire", 32),
    "shard_amber_crown": ("amber", "crown", 41),
    "shard_amber_blade": ("amber", "blade", 42),
}


def ring_pts(n, r, z, rot=0.0, sx=1.0, sy=1.0):
    return [(math.cos(rot + TAU * i / n) * r * sx, math.sin(rot + TAU * i / n) * r * sy, z) for i in range(n)]


def crystal_points(cut, rnd):
    if cut == "bipyramid6":
        return [(0, 0, 0.0)] + ring_pts(6, 0.075, 0.07) + ring_pts(6, 0.07, 0.17, D(8)) + [(0, 0, 0.30)]
    if cut == "tablet":
        return ring_pts(4, 0.11, 0.02, D(45), 1.0, 0.38) + ring_pts(8, 0.12, 0.12, D(22.5), 1.0, 0.42) + \
            ring_pts(4, 0.10, 0.22, D(45), 1.0, 0.36) + [(0, 0, 0.27), (0.0, 0, -0.0)]
    if cut == "octa":
        return [(0, 0, 0.0), (0, 0, 0.30)] + ring_pts(4, 0.12, 0.15, D(45)) + ring_pts(4, 0.06, 0.08) + ring_pts(4, 0.06, 0.22)
    if cut == "crown":
        return [(0, 0, 0.0)] + ring_pts(8, 0.06, 0.07, D(22.5)) + ring_pts(16, 0.12, 0.17, D(11.25)) + \
            ring_pts(8, 0.105, 0.215) + ring_pts(8, 0.065, 0.25, D(22.5))
    if cut == "blade":
        return [(0, 0, 0.0), (0.02, 0, 0.36)] + [(0.045, 0.02, 0.05), (-0.04, 0.02, 0.06), (0.045, -0.02, 0.05), (-0.04, -0.02, 0.06),
                                                  (0.06, 0.025, 0.18), (-0.05, 0.022, 0.2), (0.06, -0.025, 0.18), (-0.05, -0.022, 0.2),
                                                  (0.035, 0.012, 0.3), (-0.02, 0.012, 0.31), (0.035, -0.012, 0.3), (-0.02, -0.012, 0.31)]
    raise KeyError(cut)


def build_shard(item_id):
    tone, cut, seed = SHARD_CUTS[item_id]
    R = RARITY[tone]
    rnd = random.Random(seed)
    body = mat("crystal_" + tone, R["body"], 0.0, 0.06, emit=R["emit"], emit_strength=R["es"], alpha=R["a"])
    core = mat("core_" + tone, R["body"], 0.0, 0.2, emit=R["emit"], emit_strength=R["es"] * 2.5, alpha=0.35)
    glow = mat("glyph_" + tone, R["glyph"], 0.0, 0.3, emit=R["glyph"], emit_strength=7.0)
    parts = []
    if cut in ("twin", "cluster", "spire"):
        specs = {
            "twin": [((0, 0, 0), (0, 0, 0), 1.0), ((0.03, 0, 0), (0, 24, 0), 0.72)],
            "cluster": [((0, 0, 0), (0, 0, 0), 1.0), ((0.07, 0.02, 0), (0, 32, 20), 0.6), ((-0.065, -0.01, 0), (0, -28, -15), 0.55),
                        ((0.01, 0.06, 0), (-30, 0, 0), 0.45)],
            "spire": [((0, 0, 0), (0, 0, 0), 1.0)],
        }[cut]
        for k, (loc, rot, s) in enumerate(specs):
            if cut == "spire":
                pts = [(0, 0, 0)]
                for i, z in enumerate((0.05, 0.13, 0.21, 0.29)):
                    pts += ring_pts(5, 0.06 - 0.008 * i, z, D(18 * i))
                pts.append((0, 0, 0.42))
            else:
                pts = [(0, 0, 0)] + ring_pts(6, 0.05, 0.04) + ring_pts(6, 0.05, 0.22) + [(0, 0, 0.30)]
            pts = [(Vector(p) * s) for p in pts]
            o = hull("crystal_%d" % k, pts, body)
            place(o, loc, rot)
            parts.append(o)
    else:
        parts.append(hull("crystal_0", crystal_points(cut, rnd), body))
    # inner core: a smaller copy of the main crystal so the shard reads lit from inside
    c = parts[0].copy()
    c.data = parts[0].data.copy()
    c.data.materials[0] = core
    bpy.context.scene.collection.objects.link(c)
    c.scale = (0.55, 0.55, 0.62)
    c.location = (parts[0].location.x, parts[0].location.y, parts[0].location.z + 0.04)
    parts.append(c)
    # glyph sized from the main crystal width, centred at ~45 % height, slightly in front of the core
    xs = [abs(v.co.x) for v in parts[0].data.vertices]
    zs = [v.co.z for v in parts[0].data.vertices]
    Rg = max(0.022, min(max(xs) * 0.42, 0.05))
    if cut == "tablet":
        Rg = 0.05
    g = curve_strokes("glyph", glyph_strokes(seed, Rg), 0.0042, glow, res=4)
    g.location = (0, -0.012, (max(zs) + min(zs)) * 0.47)
    parts.append(g)
    root = join(parts, item_id)
    return [root]


# ------------------------------------------------------------------ mechanical parts


def build_part(item_id, P):
    o = []
    if item_id == "part_gear":
        g = gear("gear", P["bronze"], 14, 0.085, 0.105, 0.03, r_hole=0.0)
        bevel(g, 0.003, 1, 50)
        hub = prim("cyl", "hub", P["brass"], seg=20, r=0.034, h=0.045)
        bore = prim("cyl", "bore", P["iron"], seg=16, r=0.016, h=0.05)
        bevel(hub, 0.003, 1)
        # four lightening holes faked as dark iron discs
        holes = [place(prim("cyl", "h%d" % i, P["bronze_dk"], seg=12, r=0.017, h=0.032), (math.cos(TAU * i / 4 + 0.78) * 0.058, math.sin(TAU * i / 4 + 0.78) * 0.058, 0)) for i in range(4)]
        o = [g, hub, bore] + holes
        root = join(o, item_id)
        place(root, (0, 0, 0.105), (90, 0, 0))
    elif item_id == "part_spring_coil":
        bm = bmesh.new()
        turns, n, rr, wire, h = 6.5, 7 * 16, 0.045, 0.008, 0.16
        V = 6
        rows = []
        for i in range(n + 1):
            t = i / n
            a = TAU * turns * t
            c = Vector((math.cos(a) * rr, math.sin(a) * rr, 0.012 + t * h))
            tang = Vector((-math.sin(a) * rr * TAU * turns, math.cos(a) * rr * TAU * turns, h)).normalized()
            nrm = Vector((math.cos(a), math.sin(a), 0))
            b = tang.cross(nrm)
            rows.append([bm.verts.new(c + (nrm * math.cos(TAU * j / V) + b * math.sin(TAU * j / V)) * wire) for j in range(V)])
        for i in range(n):
            for j in range(V):
                bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % V], rows[i][(j + 1) % V]))
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
        coil = new_obj("coil", bm, P["steel"], smooth=True)
        caps = [place(prim("cyl", "cap0", P["brass"], seg=20, r=0.056, h=0.012), (0, 0, 0.006)),
                place(prim("cyl", "cap1", P["brass"], seg=20, r=0.056, h=0.012), (0, 0, 0.012 + h + 0.006))]
        for c in caps:
            bevel(c, 0.002, 1)
        root = join([coil] + caps, item_id)
    elif item_id == "part_brass_lens":
        rim = prim("torus", "rim", P["brass"], R=0.075, r=0.014, U=32, V=8)
        bevel(rim, 0.0, 1)
        glass = prim("sphere", "glass", P["amber_glass"], u=24, v=12, r=0.075)
        glass.scale = (1, 1, 0.28)
        lugs = [place(prim("box", "lug%d" % i, P["bronze"], s=(0.02, 0.016, 0.03)), (math.cos(TAU * i / 3 + D(90)) * 0.092, math.sin(TAU * i / 3 + D(90)) * 0.092, 0), (0, 0, 90 + 120 * i)) for i in range(3)]
        for l in lugs:
            bevel(l, 0.003, 1)
        handle = place(prim("cyl", "handle", P["timber_lt"], seg=10, r=0.011, h=0.07), (0, -0.13, 0), (90, 0, 0))
        ferrule = place(prim("cyl", "ferrule", P["brass"], seg=12, r=0.014, h=0.018), (0, -0.098, 0), (90, 0, 0))
        root = join([rim, glass, handle, ferrule] + lugs, item_id)
        place(root, (0, 0, 0.12), (90, 0, 0))
    elif item_id == "part_valve":
        body = prim("sphere", "body", P["bronze"], u=16, v=10, r=0.05)
        pipes = [place(prim("cyl", "p%d" % s, P["bronze"], seg=14, r=0.024, h=0.07), (s * 0.06, 0, 0), (0, 90, 0)) for s in (-1, 1)]
        flanges = [place(prim("cyl", "f%d" % s, P["brass"], seg=16, r=0.036, h=0.012), (s * 0.095, 0, 0), (0, 90, 0)) for s in (-1, 1)]
        stem = place(prim("cyl", "stem", P["steel"], seg=10, r=0.008, h=0.07), (0, 0, 0.075))
        wheel = place(prim("torus", "wheel", P["iron"], R=0.045, r=0.006, U=24, V=6), (0, 0, 0.11))
        spokes = [place(prim("box", "s%d" % i, P["iron"], s=(0.09, 0.008, 0.006)), (0, 0, 0.11), (0, 0, 60 * i)) for i in range(3)]
        knob = place(prim("cyl", "knob", P["amber"], seg=12, r=0.012, h=0.012), (0, 0, 0.116))
        for f in flanges:
            bevel(f, 0.002, 1)
        root = join([body, stem, wheel, knob] + pipes + flanges + spokes, item_id)
        root.location = (0, 0, 0.05)
    elif item_id == "part_glyph_cogring":
        bm = bmesh.new()
        gear_bm(bm, 20, 0.11, 0.125, 0.026, r_hole=0.078, tooth_frac=0.5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ring = new_obj("ring", bm, P["bronze"])
        bevel(ring, 0.002, 1, 50)
        inner = prim("torus", "inner", P["brass"], R=0.078, r=0.008, U=32, V=6)
        glyphs = []
        for i in range(6):
            a = TAU * i / 6
            st = [[(p[0], p[1]) for p in s] for s in glyph_strokes(100 + i, 0.012)]
            g = ribbon("g%d" % i, st, 0.0032, P["amber"])
            g.location = (math.cos(a) * 0.094, -0.0135, math.sin(a) * 0.094)
            glyphs.append(g)
        for g in glyphs:
            g.rotation_euler = (0, 0, 0)
        ring.rotation_euler = (D(90), 0, 0)
        inner.rotation_euler = (D(90), 0, 0)
        root = join([ring, inner] + glyphs, item_id)
        root.location = (0, 0, 0.125)
    elif item_id == "part_chain_link":
        links = []
        for k in range(3):
            l = prim("torus", "l%d" % k, P["iron"] if k != 1 else P["bronze"], R=0.032, r=0.009, U=20, V=8, sx=1.0)
            l.scale = (1.0, 1.7, 1.0)
            place(l, (0, (k - 1) * 0.085, 0.0), (0, 90 * (k % 2), 0), (1.0, 1.7, 1.0))
            links.append(l)
        root = join(links, item_id)
        place(root, (0, 0, 0.13), (90, 0, 0))
    elif item_id == "part_gauge":
        case = prim("cyl", "case", P["brass"], seg=32, r=0.07, h=0.03)
        bevel(case, 0.004, 2)
        face = place(prim("cyl", "face", mat("dial", "#B5A47E", 0.0, 0.7), seg=32, r=0.06, h=0.004), (0, 0, 0.0145))
        glass = place(prim("sphere", "glass", P["amber_glass"], u=24, v=8, r=0.06), (0, 0, 0.016), scale=(1, 1, 0.15))
        ticks = []
        for i in range(11):
            a = D(225 - 27 * i)
            ticks.append(place(prim("box", "t%d" % i, P["iron"] if i < 8 else P["amber"], s=(0.012, 0.0025, 0.002)),
                               (math.cos(a) * 0.048, math.sin(a) * 0.048, 0.0175), (0, 0, math.degrees(a))))
        needle = place(prim("box", "needle", P["amber"], s=(0.05, 0.004, 0.002)), (0.015, 0.016, 0.019), (0, 0, 45))
        pin = place(prim("cyl", "pin", P["bronze_dk"], seg=10, r=0.006, h=0.008), (0, 0, 0.019))
        stem = place(prim("cyl", "stem", P["bronze"], seg=12, r=0.012, h=0.04), (0, -0.088, 0), (90, 0, 0))
        nut = place(prim("cyl", "nut", P["iron"], seg=6, r=0.018, h=0.016), (0, -0.112, 0), (90, 0, 0), )
        root = join([case, face, glass, needle, pin, stem, nut] + ticks, item_id)
        place(root, (0, 0, 0.13), (80, 0, 0))
    elif item_id == "part_crank":
        shaft = place(prim("cyl", "shaft", P["steel"], seg=12, r=0.01, h=0.12), (0, 0, 0.06))
        arm = place(prim("box", "arm", P["bronze"], s=(0.14, 0.03, 0.014)), (0.06, 0, 0.12))
        bevel(arm, 0.004, 2)
        boss = [place(prim("cyl", "b%d" % i, P["bronze"], seg=16, r=0.022, h=0.02), (x, 0, 0.12)) for i, x in enumerate((0, 0.12))]
        grip = place(prim("cyl", "grip", P["timber_lt"], seg=12, r=0.014, h=0.07, r2=0.012), (0.12, 0, 0.16))
        tip = place(prim("sphere", "tip", P["amber"], u=10, v=6, r=0.012), (0.12, 0, 0.198))
        collar = place(prim("cyl", "collar", P["brass"], seg=14, r=0.018, h=0.014), (0, 0, 0.02))
        for b in boss + [collar]:
            bevel(b, 0.002, 1)
        root = join([shaft, arm, grip, tip, collar] + boss, item_id)
        root.location = (-0.06, 0, 0)
    elif item_id == "part_rivet_plate":
        plate = prim("box", "plate", P["iron"], s=(0.16, 0.12, 0.012))
        bevel(plate, 0.005, 2)
        band = place(prim("box", "band", P["bronze"], s=(0.17, 0.03, 0.016)), (0, 0, 0.0))
        bevel(band, 0.003, 1)
        rivets = []
        for x in (-0.065, -0.022, 0.022, 0.065):
            for y in (-0.045, 0.045):
                rivets.append(place(prim("sphere", "r", P["brass"], u=8, v=5, r=0.008), (x, y, 0.006), scale=(1, 1, 0.6)))
        for x in (-0.07, 0.07):
            rivets.append(place(prim("sphere", "rb", P["brass"], u=8, v=5, r=0.007), (x, 0, 0.008), scale=(1, 1, 0.6)))
        st = glyph_strokes(77, 0.012)
        gl = ribbon("glyph", st, 0.003, P["amber"])
        gl.rotation_euler = (D(90), 0, 0)
        gl.location = (0, 0.028, 0.0085)
        root = join([plate, band, gl] + rivets, item_id)
        place(root, (0, 0, 0.09), (70, 0, 0))
    elif item_id == "part_spindle":
        shaft = place(prim("cyl", "shaft", P["steel"], seg=12, r=0.009, h=0.26), (0, 0, 0.13))
        bobbin = place(prim("cyl", "bobbin", P["timber_lt"], seg=16, r=0.024, h=0.1), (0, 0, 0.12))
        thread = place(prim("cyl", "thread", P["ochre"], seg=16, r=0.03, h=0.08), (0, 0, 0.12))
        fl = [place(prim("cyl", "fl%d" % i, P["brass"], seg=18, r=0.042, h=0.01), (0, 0, z)) for i, z in enumerate((0.065, 0.175))]
        whorl = place(prim("cyl", "whorl", P["bronze"], seg=18, r=0.05, h=0.02, r2=0.03), (0, 0, 0.03))
        tip = place(prim("cyl", "tip", P["amber"], seg=10, r=0.009, h=0.02, r2=0.0), (0, 0, 0.27))
        for f in fl + [whorl]:
            bevel(f, 0.002, 1)
        root = join([shaft, bobbin, thread, whorl, tip] + fl, item_id)
    return [root]


# ------------------------------------------------------------------ props


def build_wheel(P, lite=False):
    """Wheel of fortune: base + post (wheel_prop), wheel_spin (rotates about local Y in glTF = Blender -Y axis
    through the hub), wheel_pointer (amber flap at the top, rotates about its hinge)."""
    hub_z = 1.25
    U = 24 if lite else 32
    seg = 12
    stand = []
    base = place(prim("box", "base", P["timber"], s=(1.1, 0.5, 0.12)), (0, 0, 0.06))
    bevel(base, 0.02, 1)
    stand.append(base)
    for s in (-1, 1):
        leg = place(prim("box", "leg%d" % s, P["timber"], s=(0.09, 0.09, 1.3)), (s * 0.3, 0.1, 0.7), (0, 0, 0))
        leg.rotation_euler = (0, D(-s * 13), 0)
        bevel(leg, 0.015, 1)
        stand.append(leg)
        cap = place(prim("cyl", "cap%d" % s, P["bronze"], seg=8 if lite else 12, r=0.06, h=0.05), (s * 0.3, 0.1, 0.14))
        stand.append(cap)
    axle = place(prim("cyl", "axle", P["bronze"], seg=8 if lite else 14, r=0.04, h=0.24), (0, 0.06, hub_z), (90, 0, 0))
    stand.append(axle)
    pointer_mount = place(prim("box", "pm", P["bronze"], s=(0.12, 0.08, 0.1)), (0, 0.04, hub_z + 0.78))
    post = place(prim("box", "post", P["timber"], s=(0.07, 0.07, 0.8)), (0, 0.1, hub_z + 0.42))
    bevel(post, 0.012, 1)
    stand += [pointer_mount, post]
    root = join(stand, "wheel_prop")

    # spinning wheel, built around the origin then moved to the hub
    w = []
    rim = prim("torus", "rim", P["brass"], R=0.7, r=0.035, U=U, V=6)
    rim2 = prim("torus", "rim2", P["bronze_dk"], R=0.62, r=0.015, U=U, V=4)
    w += [rim, rim2]
    cols = [P["ivory"], P["teal"], P["ochre"], P["indigo"]]
    for i in range(seg):
        a0, a1 = TAU * i / seg, TAU * (i + 1) / seg
        bm = bmesh.new()
        n = 1 if lite else 2
        inner = [bm.verts.new((math.cos(a0 + (a1 - a0) * k / n) * 0.12, math.sin(a0 + (a1 - a0) * k / n) * 0.12, 0)) for k in range(n + 1)]
        outer = [bm.verts.new((math.cos(a0 + (a1 - a0) * k / n) * 0.61, math.sin(a0 + (a1 - a0) * k / n) * 0.61, 0)) for k in range(n + 1)]
        f = bm.faces.new(inner + list(reversed(outer)))
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=(0, 0, 0.03), verts=[v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        segm = new_obj("seg%d" % i, bm, cols[i % 4])
        segm.location.z = -0.015
        w.append(segm)
        spoke = place(prim("box", "sp%d" % i, P["bronze"], s=(0.5, 0.025, 0.05)), (math.cos(a0) * 0.37, math.sin(a0) * 0.37, 0.0), (0, 0, math.degrees(a0)))
        w.append(spoke)
        am = (a0 + a1) / 2
        st = glyph_strokes(200 + i, 0.075, step=24 if lite else 15)
        g = ribbon("gl%d" % i, st, 0.012, P["amber"] if i % 4 != 2 else P["brass"])
        g.rotation_euler = (D(90), 0, 0)
        g.location = (math.cos(am) * 0.42, math.sin(am) * 0.42, 0.0165)
        w.append(g)
        bulb = place(prim("ico", "b%d" % i, P["bulb"], sub=0 if lite else 1, r=0.03), (math.cos(a0) * 0.7, math.sin(a0) * 0.7, 0.04))
        w.append(bulb)
    hub = prim("cyl", "hub", P["brass"], seg=12 if lite else 20, r=0.13, h=0.08)
    core = place(prim("sphere", "core", P["amber"], u=10 if lite else 12, v=5 if lite else 6, r=0.075), (0, 0, 0.04), scale=(1, 1, 0.6))
    w += [hub, core]
    spin = join(w, "wheel_spin")
    # Blender: wheel face toward -Y, so the disc plane is XZ
    spin.rotation_euler = (D(90), 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    spin.select_set(True)
    bpy.context.view_layer.objects.active = spin
    bpy.ops.object.transform_apply(rotation=True)
    spin.location = (0, -0.07, hub_z)

    bm = bmesh.new()
    for p in [(-0.05, 0, 0.0), (0.05, 0, 0.0), (0, 0, -0.17), (-0.05, -0.03, 0.0), (0.05, -0.03, 0.0), (0, -0.03, -0.17)]:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    pointer = new_obj("wheel_pointer", bm, P["amber"])
    pointer.location = (0, -0.02, hub_z + 0.78)
    pin = place(prim("cyl", "pin", P["brass"], seg=10, r=0.02, h=0.06), (0, -0.015, 0), (90, 0, 0))
    pin.parent = pointer
    spin.parent = root
    pointer.parent = root
    # spin and pointer are positioned relative to the root (root origin at 0)
    return [root, spin, pointer, pin]


def build_board(P, lite=False):
    """Trading board: a framed slate wall stand with a header glyph, two lanterns and a counter in front.
    socket_board (code draws the scrolling log and prices; extras pad_size_m), socket_agent_spot (where an
    agent stands at the counter), socket_lamp_l / socket_lamp_r (warm point lights)."""
    parts = []
    W, H = 2.2, 1.4
    z0 = 0.9
    slate = place(prim("box", "slate", P["slate"], s=(W, 0.04, H)), (0, 0, z0 + H / 2))
    parts.append(slate)
    for s in (-1, 1):
        post = place(prim("box", "post%d" % s, P["timber"], s=(0.14, 0.14, z0 + H + 0.45)), (s * (W / 2 + 0.07), 0.02, (z0 + H + 0.45) / 2))
        bevel(post, 0.02, 1)
        parts.append(post)
        foot = place(prim("box", "foot%d" % s, P["timber"], s=(0.24, 0.5, 0.08)), (s * (W / 2 + 0.07), 0.02, 0.04))
        bevel(foot, 0.015, 1)
        parts.append(foot)
        finial = place(prim("sphere", "fin%d" % s, P["bronze"], u=10, v=6, r=0.07), (s * (W / 2 + 0.07), 0.02, z0 + H + 0.5))
        parts.append(finial)
    for z in (z0 - 0.04, z0 + H + 0.04):
        rail = place(prim("box", "rail", P["bronze"], s=(W + 0.1, 0.08, 0.07)), (0, -0.01, z))
        bevel(rail, 0.012, 1)
        parts.append(rail)
    # header: arched timber sign with a bronze ring glyph
    header = place(prim("box", "header", P["timber_lt"], s=(1.1, 0.07, 0.32)), (0, 0, z0 + H + 0.25))
    bevel(header, 0.02, 2)
    ring = place(prim("torus", "ring", P["bronze"], R=0.13, r=0.016, U=20 if lite else 32, V=6), (0, -0.045, z0 + H + 0.25), (90, 0, 0))
    g = curve_strokes("hg", glyph_strokes(301, 0.07), 0.01, P["amber"], res=2 if lite else 4)
    g.location = (0, -0.06, z0 + H + 0.25)
    parts += [header, ring, g]
    # price rows: thin brass dividers on the slate (code draws the text between them)
    for i in range(1, 5):
        d = place(prim("box", "div", P["brass"], s=(W - 0.12, 0.012, 0.012)), (0, -0.024, z0 + H * i / 5))
        parts.append(d)
    # counter in front
    counter = place(prim("box", "counter", P["timber"], s=(1.6, 0.5, 0.95)), (0, -0.85, 0.475))
    bevel(counter, 0.02, 1)
    top = place(prim("box", "ctop", P["timber_lt"], s=(1.72, 0.6, 0.06)), (0, -0.85, 0.98))
    bevel(top, 0.015, 1)
    trim = place(prim("box", "ctrim", P["bronze"], s=(1.62, 0.02, 0.05)), (0, -1.105, 0.85))
    scale = place(prim("cyl", "scale", P["brass"], seg=12 if lite else 20, r=0.13, h=0.02), (0.45, -0.85, 1.02))
    jar = place(prim("cyl", "jar", P["amber_glass"], seg=10 if lite else 16, r=0.07, h=0.16), (-0.5, -0.85, 1.09))
    jar_core = place(prim("ico", "jarshards", P["amber"], sub=1, r=0.045), (-0.5, -0.85, 1.06))
    parts += [counter, top, trim, scale, jar, jar_core]
    lamps = []
    for s in (-1, 1):
        arm = place(prim("box", "arm", P["bronze"], s=(0.3, 0.03, 0.03)), (s * (W / 2 - 0.08), -0.1, z0 + H + 0.32))
        lamp = place(prim("cyl", "lamp", P["amber_glass"], seg=6, r=0.06, h=0.14), (s * (W / 2 - 0.2), -0.12, z0 + H + 0.2))
        flame = place(prim("ico", "flame", P["bulb"], sub=1, r=0.03), (s * (W / 2 - 0.2), -0.12, z0 + H + 0.2))
        hood = place(prim("cyl", "hood", P["bronze"], seg=6, r=0.08, h=0.04, r2=0.02), (s * (W / 2 - 0.2), -0.12, z0 + H + 0.29))
        parts += [arm, lamp, flame, hood]
    root = join(parts, "trading_board")
    out = [root]
    for name, loc, extras in (
            ("socket_board", (0, -0.03, z0 + H / 2), {"pad_size_m": [W - 0.12, H - 0.1]}),
            ("socket_agent_spot", (0, -1.55, 0.0), {"facing": "+Y"}),
            ("socket_lamp_l", (-(W / 2 - 0.2), -0.12, z0 + H + 0.2), {}),
            ("socket_lamp_r", ((W / 2 - 0.2), -0.12, z0 + H + 0.2), {})):
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.location = loc
        for k, v in extras.items():
            e[k] = v
        e.parent = root
        out.append(e)
    return out


# ------------------------------------------------------------------ catalogue

# ------------------------------------------------------------------ monster resources (owner 12.11 evening)


def rock_points(rnd, n, r, squash=(1.0, 1.0, 0.75), z0=0.0):
    """Random points on a lumpy ellipsoid: the hull reads as a broken chunk of stone."""
    pts = []
    for _ in range(n):
        u, v = rnd.uniform(-1, 1), rnd.uniform(0, TAU)
        k = math.sqrt(1 - u * u) * r * rnd.uniform(0.78, 1.0)
        pts.append(Vector((math.cos(v) * k * squash[0], math.sin(v) * k * squash[1], z0 + (u + 1) * r * squash[2] * rnd.uniform(0.85, 1.0))))
    return pts


def build_resource(item_id, P):
    rnd = random.Random(sum(map(ord, item_id)))
    silk = mat("silk", "#EEE6D2", 0.0, 0.32, coat=0.5)
    if item_id == "res_silk_thread":
        # a skein of spider silk wound on a small bone spindle, one loose strand
        ball = prim("sphere", "skein", silk, u=24, v=14, r=0.07)
        ball.scale = (1.0, 1.0, 0.9)
        bands = []
        for i in range(7):
            b = prim("torus", "wind%d" % i, silk, R=0.068, r=0.0055, U=40, V=6)
            place(b, (0, 0, 0), (rnd.uniform(0, 180), rnd.uniform(0, 180), rnd.uniform(0, 180)))
            bands.append(b)
        bone = place(prim("cyl", "spindle", P["ivory"], seg=12, r=0.011, h=0.21, r2=0.007), (0, 0, 0), (0, 70, 20))
        strand = [(0.06 + 0.02 * t, 0.0, -0.03 - 0.07 * t + 0.02 * math.sin(t * 6)) for t in [i / 8 for i in range(9)]]
        loose = curve_strokes("strand", [[(x, z) for x, _, z in strand]], 0.0035, silk, res=4)
        root = join([ball, bone, loose] + bands, item_id)
        place(root, (0, 0, 0.08))
    elif item_id == "res_chitin_plate":
        # three overlapping curved plates of stone-grey chitin with the spider's teal seam glow
        shell = mat("chitin", "#3A4247", 0.2, 0.22, coat=0.9)
        seam = mat("chitin_seam", "#2FB8A8", 0.0, 0.3, emit="#24D0BC", emit_strength=4.0)
        parts = []
        for i, (dx, dz, s) in enumerate(((0, 0, 1.0), (0.02, 0.07, 0.86), (0.035, 0.13, 0.7))):
            pl = prim("sphere", "plate%d" % i, shell, u=24, v=12, r=0.1 * s)
            pl.scale = (1.0, 0.62, 0.24)
            place(pl, (dx, 0.01 * i, dz), (-12, 0, 0))
            rim = prim("torus", "seam%d" % i, seam, R=0.096 * s, r=0.0035, U=32, V=5, sx=1.0)
            rim.scale = (1.0, 0.62, 1.0)
            place(rim, (dx, 0.01 * i, dz), (-12, 0, 0))
            parts += [pl, rim]
        root = join(parts, item_id)
        place(root, (0, 0, 0.03), (-60, 0, 0))
    elif item_id == "res_veil_dust":
        # a stoppered glass vial of shimmering veil dust (teal to lilac), a brass cap
        glass = mat("vial_glass", "#DCEFF0", 0.0, 0.04, alpha=0.32)
        dust = mat("veil_dust", "#4FA8D0", 0.0, 0.5, emit="#6A7CFF", emit_strength=0.9)
        body = place(prim("cyl", "vial", glass, seg=24, r=0.042, h=0.15), (0, 0, 0.075))
        neck = place(prim("cyl", "neck", glass, seg=20, r=0.022, h=0.03), (0, 0, 0.165))
        fill = place(prim("cyl", "dust", dust, seg=20, r=0.036, h=0.095), (0, 0, 0.0525))
        heap = place(prim("sphere", "heap", dust, u=16, v=8, r=0.036), (0, 0, 0.1))
        heap.scale = (1, 1, 0.3)
        cap = place(prim("cyl", "cap", P["brass"], seg=20, r=0.027, h=0.028), (0, 0, 0.192))
        bead = place(prim("sphere", "bead", P["brass"], u=12, v=6, r=0.012), (0, 0, 0.212))
        bevel(cap, 0.003, 1)
        root = join([body, neck, fill, heap, cap, bead], item_id)
    elif item_id == "res_bell_glass":
        # a curved shard broken from a veilbell's glass dome, pale teal with a glowing rim
        g = mat("bell_glass", "#9FDCD6", 0.0, 0.05, emit="#5FE0D0", emit_strength=0.4, alpha=0.6)
        lip = mat("bell_lip", "#5FD8C8", 0.0, 0.3, emit="#3FE0C8", emit_strength=1.5)
        bm = bmesh.new()
        U, V, R, th = 10, 6, 0.12, 0.008
        outer, inner = [], []
        for i in range(U + 1):
            a = D(-40) + D(80) * i / U
            ro, ri = [], []
            for j in range(V + 1):
                b = D(12) + D(62) * j / V
                jag = 1.0 - 0.18 * ((i * 7 + j * 3) % 4 == 0) * (j == V)
                rr = R * (0.55 + 0.45 * math.sin(b)) * jag
                z = R * 1.2 * (1 - math.cos(b)) * 0.8
                d = Vector((math.cos(a), math.sin(a), 0))
                ro.append(bm.verts.new(d * rr + Vector((0, 0, z))))
                ri.append(bm.verts.new(d * (rr - th) + Vector((0, 0, z))))
            outer.append(ro)
            inner.append(ri)
        for i in range(U):
            for j in range(V):
                bm.faces.new((outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]))
                bm.faces.new((inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]))
        shard = new_obj("shard", bm, g, smooth=True)
        edge = prim("torus", "lip", lip, R=R * 0.55, r=0.0035, U=20, V=5, a0=D(-40), a1=D(40))
        place(edge, (0, 0, R * 1.2 * (1 - math.cos(D(12))) * 0.8))
        root = join([shard, edge], item_id)
        place(root, (0.04, 0, 0.0), (0, -70, 90))
    elif item_id == "res_ash_ore":
        # a chunk of dark ash rock with glowing amber veins breaking through
        rock = mat("ash_rock", "#3B3633", 0.05, 0.85)
        vein = mat("ash_vein", "#E8641A", 0.0, 0.4, emit="#FF5A10", emit_strength=1.6)
        body = hull("ore", rock_points(rnd, 40, 0.1), rock)
        bevel(body, 0.004, 1, 30)
        veins = []
        for i in range(5):
            a, z = rnd.uniform(0, TAU), rnd.uniform(0.03, 0.12)
            c = Vector((math.cos(a) * 0.085, math.sin(a) * 0.085, z))
            veins.append(hull("vein%d" % i, [c + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.016 for _ in range(7)], vein))
        root = join([body] + veins, item_id)
    elif item_id == "res_ember_core":
        # the hulker's ember heart: a faceted glowing core held by two iron bands
        core = mat("ember", "#E8501A", 0.0, 0.3, emit="#FF4A08", emit_strength=1.8)
        shell = mat("ember_crust", "#5A2A14", 0.1, 0.7)
        ball = place(prim("ico", "core", core, smooth=False, r=0.07, sub=1), (0, 0, 0.09))
        crust = [place(hull("crust%d" % i, rock_points(rnd, 10, 0.03), shell), (math.cos(TAU * i / 5) * 0.06, math.sin(TAU * i / 5) * 0.06, 0.06 + 0.04 * (i % 2))) for i in range(5)]
        bands = [place(prim("torus", "band%d" % i, P["iron"], R=0.078, r=0.008, U=32, V=6), (0, 0, 0.09), rot) for i, rot in enumerate(((90, 0, 0), (90, 0, 90)))]
        for b in bands:
            bevel(b, 0.0, 1)
        root = join([ball] + crust + bands, item_id)
    elif item_id == "res_crown_shard":
        # a tooth of the crownrift's crown: a golden-amber crystal on a broken brass socket
        body = mat("crown_crystal", "#E09A28", 0.0, 0.08, emit="#FF9A18", emit_strength=0.35, alpha=0.82)
        pts = [Vector((0, 0, 0))] + [Vector(p) for p in ring_pts(5, 0.045, 0.05)] + [Vector(p) for p in ring_pts(5, 0.035, 0.2, D(30))] + [Vector((0.01, 0, 0.3))]
        crystal = hull("crown", pts, body)
        socket = place(prim("cyl", "socket", P["brass"], seg=10, r=0.06, h=0.04, r2=0.05), (0, 0, 0.02))
        bevel(socket, 0.004, 1)
        teeth = [place(prim("cyl", "t%d" % i, P["brass"], seg=4, r=0.012, h=0.035, r2=0.0), (math.cos(TAU * i / 6) * 0.055, math.sin(TAU * i / 6) * 0.055, 0.055)) for i in range(6)]
        root = join([crystal, socket] + teeth, item_id)
    elif item_id == "res_rift_heart":
        # a dark violet heart-gem with a light trapped inside it, rarest of all
        body = mat("rift_body", "#2A1450", 0.0, 0.05, emit="#5A20C0", emit_strength=0.6, alpha=0.78)
        glow = mat("rift_glow", "#E8D0FF", 0.0, 0.3, emit="#B070FF", emit_strength=9.0)
        pts = [Vector((0, 0, 0))]
        for i, (z, r) in enumerate(((0.06, 0.06), (0.13, 0.085), (0.18, 0.07))):
            pts += [Vector(p) for p in ring_pts(8, r, z, D(22.5 * i), 1.0, 0.7)]
        pts += [Vector((0.035, 0, 0.21)), Vector((-0.035, 0, 0.21))]
        gem = hull("heart", pts, body)
        inner = place(prim("ico", "spark", glow, smooth=False, r=0.028, sub=1), (0, 0, 0.12))
        root = join([gem, inner], item_id)
    return [root]


RESOURCE_RARITY = {
    "res_silk_thread": "common", "res_chitin_plate": "uncommon", "res_veil_dust": "common", "res_bell_glass": "uncommon",
    "res_ash_ore": "common", "res_ember_core": "rare", "res_crown_shard": "rare", "res_rift_heart": "legendary",
}


PART_RARITY = {
    "part_gear": "common", "part_spring_coil": "common", "part_chain_link": "common", "part_rivet_plate": "common",
    "part_spindle": "uncommon", "part_crank": "uncommon", "part_valve": "uncommon",
    "part_gauge": "rare", "part_brass_lens": "rare", "part_glyph_cogring": "legendary",
}
PROPS = {"prop_wheel_of_fortune": build_wheel, "trading_board": build_board}


def catalogue():
    out = []
    for k, (tone, cut, seed) in SHARD_CUTS.items():
        out.append(dict(id=k, kind="shard", rarity=RARITY[tone]["rarity"]))
    for k, r in PART_RARITY.items():
        out.append(dict(id=k, kind="part", rarity=r))
    for k, r in RESOURCE_RARITY.items():
        out.append(dict(id=k, kind="resource", rarity=r))
    out.append(dict(id="prop_wheel_of_fortune", kind="prop", rarity=None))
    out.append(dict(id="trading_board", kind="prop", rarity=None))
    return out


# ------------------------------------------------------------------ export + icon render


def export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_extras=True, export_materials="EXPORT", export_lights=False)


ICON_VIEW = {"elev": 22, "az": -32}


def light_rig(target_h):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dev in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = dev
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == dev
            break
        except Exception:
            continue
    sc.cycles.device = "GPU"
    sc.cycles.samples = 192
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.35
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.52, 0.48, 1)
    bg.inputs[1].default_value = 0.6

    def area(name, loc, energy, color, size):
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energy
        l.color = color
        l.size = size
        o = bpy.data.objects.new(name, l)
        sc.collection.objects.link(o)
        o.location = loc
        d = Vector((0, 0, target_h * 0.5)) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return o

    s = max(target_h, 0.25) / 0.3
    area("key", (-0.6 * s, -0.7 * s, 0.8 * s), 45 * s * s, (1.0, 0.9, 0.78), 0.5 * s)
    area("fill", (0.8 * s, -0.5 * s, 0.25 * s), 18 * s * s, (0.85, 0.9, 1.0), 0.8 * s)
    area("rim", (0.3 * s, 0.9 * s, 0.6 * s), 45 * s * s, (0.75, 0.95, 1.0), 0.4 * s)


def frame_camera(objs):
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.evaluated_get(dg).data.vertices:
            pts.append(o.matrix_world @ v.co)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    el, az = D(ICON_VIEW["elev"]), D(ICON_VIEW["az"])
    dirv = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    co.location = c + dirv * 10
    co.rotation_euler = (-dirv).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = co.matrix_world.inverted()
    loc = [inv @ p for p in pts]
    wx = max(p.x for p in loc) - min(p.x for p in loc)
    wy = max(p.y for p in loc) - min(p.y for p in loc)
    cx = (max(p.x for p in loc) + min(p.x for p in loc)) / 2
    cy = (max(p.y for p in loc) + min(p.y for p in loc)) / 2
    cam.ortho_scale = max(wx, wy) * 1.16
    cam.shift_x = cx / cam.ortho_scale
    cam.shift_y = cy / cam.ortho_scale
    cam.clip_end = 100
    return hi.z - lo.z


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = argv[0]
    want = set(argv[1:])
    os.makedirs(os.path.join(out, "raw"), exist_ok=True)
    os.makedirs(os.path.join(out, "icons"), exist_ok=True)
    stats = {}
    for it in catalogue():
        iid = it["id"]
        if want and iid not in want:
            continue
        variants = [False, True] if it["kind"] == "prop" else [False]
        for lite in variants:
            clear()
            P = palette()
            if it["kind"] == "shard":
                objs = build_shard(iid)
            elif it["kind"] == "part":
                objs = build_part(iid, P)
            elif it["kind"] == "resource":
                objs = build_resource(iid, P)
            else:
                objs = PROPS[iid](P, lite)
            n = tris(objs)
            name = iid + ("_m" if lite else "")
            export(os.path.join(out, "raw", name + ".glb"), objs)
            stats[name] = n
            print("ITEM", name, "tris", n, flush=True)
            if not lite:
                h = frame_camera(objs)
                light_rig(h)
                bpy.context.scene.render.filepath = os.path.join(out, "icons", iid + ".png")
                bpy.ops.render.render(write_still=True)
    with open(os.path.join(out, "stats_%d.json" % os.getpid()), "w") as f:
        json.dump(stats, f, indent=1)


if __name__ == "__main__":
    main()
