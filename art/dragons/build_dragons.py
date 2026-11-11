"""Companion dragons (docs/companion-nft-plan.md, GPT sheets DRG-001_01..03): Nacre (pearl wind), Rill (teal tide),
Cinder (amber ember). Procedural, rigged and animated in one Blender pass.

    blender -b --factory-startup -P art/dragons/build_dragons.py -- <out_dir> [nacre rill cinder] [--lite]

Per dragon: dragon_<id>.glb (and dragon_<id>_m.glb with --lite): one skinned mesh `dragon_<id>` (materials
M_Dragon_Body with vertex colour, M_Dragon_Membrane double-sided, M_Dragon_Accent emissive, M_Dragon_Eye), an armature
`rig` (root, spine_0..2, neck, head, tail_0..4, wing_<L|R>_0..2, leg_<FL|FR|BL|BR>), clips idle (hover), follow,
fly, glide, flip (the happy flip), 30 fps loops. Pivot: the body's centre, the head looks -Y (glTF +Z).
Length snout to tail and wingspan from the sheets. Original designs (the sheets are ours); no third-party assets.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau
FPS = 30


def srgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


SPECIES = {
    # length (m), span (m), body / belly / membrane / accent colours, proportions, wing type, tail type, head extras
    "nacre": dict(length=0.58, span=0.96, body="#E6DDCA", belly="#B9C9C5", membrane="#E9CFE0", accent="#C98FBF",
                  thick=0.80, head=1.0, muzzle=1.15, wing="leaf", tail="split", extra="frills", legs=0.9),
    "rill": dict(length=0.64, span=0.84, body="#287D83", belly="#9ACAC0", membrane="#7FC0B8", accent="#E6DDCA",
                 thick=1.0, head=1.05, muzzle=0.85, wing="fin", tail="fan", extra="fins", legs=1.0),
    "cinder": dict(length=0.46, span=0.72, body="#704733", belly="#E6CE9E", membrane="#E6CE9E", accent="#D9953B",
                   thick=1.25, head=1.25, muzzle=0.8, wing="bat", tail="bud", extra="horns", legs=1.1),
}


def mat(name, color, rough=0.5, emit=None, strength=0.0, vcol=False, double=False, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
    if vcol:
        a = m.node_tree.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        m.node_tree.links.new(a.outputs["Color"], p.inputs["Base Color"])
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    m.use_backface_culling = not double
    return m


def skin_body(S):
    """Spine, neck, head, tail and four short legs as a skin-modifier graph (unit length: snout y=-0.5, tail y=+0.5)."""
    t, hd, mz = S["thick"], S["head"], S["muzzle"]
    spine = [(-0.50, 0.105, 0.022 * hd), (-0.46, 0.110, 0.040 * hd), (-0.41, 0.115, 0.058 * hd), (-0.35, 0.090, 0.040 * t),
             (-0.29, 0.055, 0.045 * t), (-0.21, 0.020, 0.068 * t), (-0.10, 0.010, 0.078 * t), (0.02, 0.012, 0.064 * t),
             (0.12, 0.012, 0.046 * t), (0.22, 0.010, 0.032 * t), (0.31, 0.008, 0.022 * t), (0.40, 0.006, 0.013), (0.48, 0.004, 0.006)]
    # snout length per species: move the first two points
    spine[0] = (-0.41 - 0.09 * mz, spine[0][1] - 0.01, spine[0][2])
    spine[1] = (-0.41 - 0.05 * mz, spine[1][1], spine[1][2])
    verts, edges, radii = [], [], []
    for k, (y, z, r) in enumerate(spine):
        verts.append((0.0, y, z))
        radii.append((r * 1.05, r))
        if k:
            edges.append((k - 1, k))
    lg = S["legs"]
    for sx in (-1, 1):
        for (attach, y0, y1) in ((5, -0.21, -0.23), (7, 0.02, 0.04)):
            a = len(verts)
            verts += [(sx * 0.045 * t, y0, -0.02), (sx * 0.065 * t, y0 + 0.01, -0.075 * lg), (sx * 0.07 * t, y1 - 0.01, -0.105 * lg)]
            radii += [(0.026 * t, 0.026 * t), (0.018 * t, 0.018 * t), (0.016, 0.012)]
            edges += [(attach, a), (a, a + 1), (a + 1, a + 2)]
    me = bpy.data.meshes.new("body")
    me.from_pydata(verts, edges, [])
    o = bpy.data.objects.new("body", me)
    bpy.context.scene.collection.objects.link(o)
    sk = o.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    for i, rr in enumerate(radii):
        me.skin_vertices[0].data[i].radius = rr
    me.skin_vertices[0].data[6].use_root = True
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    nm = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    body = bpy.data.objects.new("body", nm)
    bpy.context.scene.collection.objects.link(body)
    return body, spine


def membrane(S, side):
    """One wing membrane (unit coords) on three spars: shoulder, elbow, wrist, tip, and a trailing edge back to the
    flank. Leaf (Nacre) rounded, fin (Rill) one continuous broad fin, bat (Cinder) scalloped between fingers."""
    half = S["span"] / S["length"] / 2.0
    sh = Vector((side * 0.045, -0.19, 0.055))
    el = Vector((side * half * 0.38, -0.15, 0.12))
    wr = Vector((side * half * 0.66, -0.20, 0.13))
    tip = Vector((side * half, -0.09, 0.09))
    root = Vector((side * 0.04, 0.06, 0.035))
    kind = S["wing"]
    if kind == "bat":
        f2 = Vector((side * half * 0.82, 0.04, 0.08))
        f3 = Vector((side * half * 0.55, 0.10, 0.06))
        edge = [tip, (tip + f2) / 2 + Vector((-side * 0.03, -0.04, 0)), f2, (f2 + f3) / 2 + Vector((-side * 0.03, -0.04, 0)),
                f3, (f3 + root) / 2 + Vector((0, -0.05, 0)), root]
        spars = [(wr, f2), (wr, f3)]
    elif kind == "fin":
        edge = [tip, Vector((side * half * 0.85, 0.05, 0.08)), Vector((side * half * 0.62, 0.14, 0.06)),
                Vector((side * half * 0.36, 0.16, 0.05)), Vector((side * 0.10, 0.12, 0.04)), root]
        spars = []
    else:   # leaf-sail: rounded lobes
        edge = [tip, Vector((side * half * 0.92, 0.02, 0.10)), Vector((side * half * 0.70, 0.12, 0.09)),
                Vector((side * half * 0.42, 0.13, 0.07)), Vector((side * 0.12, 0.10, 0.045)), root]
        spars = []
    outline = [sh, el, wr] + edge
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in outline]
    # fan from the shoulder, each triangle subdivided once along its long side for a smoother bend
    for k in range(1, len(vs) - 1):
        f = bm.faces.new((vs[0], vs[k], vs[k + 1]) if side > 0 else (vs[0], vs[k + 1], vs[k]))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    # a slight billow: push the inner membrane down a little between the spars
    for v in bm.verts:
        if v not in vs:
            v.co.z -= 0.012
    me = bpy.data.meshes.new("wing")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("wing", me)
    bpy.context.scene.collection.objects.link(o)
    # spars: thin tubes along the arm and the fingers
    bones = [(sh, el), (el, wr), (wr, tip)] + spars
    tubes = []
    for a, b in bones:
        tb = bmesh.new()
        d = b - a
        bmesh.ops.create_cone(tb, cap_ends=True, segments=6, radius1=0.010, radius2=0.006, depth=d.length)
        bmesh.ops.translate(tb, vec=(0, 0, d.length / 2), verts=tb.verts)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(tb, verts=tb.verts, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(tb, vec=a, verts=tb.verts)
        tm = bpy.data.meshes.new("spar")
        tb.to_mesh(tm)
        tb.free()
        to = bpy.data.objects.new("spar", tm)
        bpy.context.scene.collection.objects.link(to)
        tubes.append(to)
    return o, tubes, (sh, el, wr, tip)


def tail_end(S, spine):
    y, z = spine[-1][0], spine[-1][1]
    bm = bmesh.new()
    kind = S["tail"]
    if kind == "bud":
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.04)
        bmesh.ops.scale(bm, vec=(0.8, 1.3, 0.8), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, y - 0.01, z), verts=bm.verts)
    else:
        lobes = ((-1, 1),) if kind == "fan" else ((-1, 0), (1, 0))
        if kind == "fan":
            pts = [(0, y - 0.06, z)] + [(math.sin(a) * 0.09, y + 0.02 + math.cos(a) * 0.07, z) for a in [(-0.9 + 1.8 * i / 6) for i in range(7)]]
            vs = [bm.verts.new(p) for p in pts]
            for k in range(1, len(vs) - 1):
                bm.faces.new((vs[0], vs[k], vs[k + 1]))
        else:
            for sx, _ in lobes:
                pts = [(0, y - 0.05, z), (sx * 0.05, y + 0.02, z + 0.02), (sx * 0.035, y + 0.09, z + 0.005), (sx * 0.008, y + 0.03, z)]
                vs = [bm.verts.new(p) for p in pts]
                bm.faces.new(vs if sx > 0 else list(reversed(vs)))
    me = bpy.data.meshes.new("tailend")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("tailend", me)
    bpy.context.scene.collection.objects.link(o)
    return o


def head_extras(S, spine):
    hy, hz, hr = spine[2]
    parts = []
    bm = bmesh.new()
    for sx in (-1, 1):   # eyes
        e = bmesh.new()
        bmesh.ops.create_uvsphere(e, u_segments=10, v_segments=6, radius=hr * 0.30)
        bmesh.ops.translate(e, vec=(sx * hr * 0.70, hy - hr * 0.35, hz + hr * 0.30), verts=e.verts)
        me = bpy.data.meshes.new("eye")
        e.to_mesh(me)
        e.free()
        o = bpy.data.objects.new("eye", me)
        bpy.context.scene.collection.objects.link(o)
        o["part"] = "eye"
        parts.append(o)
    kind = S["extra"]
    for sx in (-1, 1):
        if kind == "horns":
            pts = [(sx * hr * 0.45, hy + hr * 0.1, hz + hr * 0.7), (sx * hr * 0.75, hy + hr * 1.2, hz + hr * 1.25)]
            rad = hr * 0.20
        elif kind == "fins":
            pts = [(sx * hr * 0.6, hy + hr * 0.3, hz + hr * 0.4), (sx * hr * 1.3, hy + hr * 1.4, hz + hr * 0.9)]
            rad = hr * 0.28
        else:   # cheek frills
            pts = [(sx * hr * 0.8, hy + hr * 0.2, hz - hr * 0.05), (sx * hr * 1.6, hy + hr * 1.0, hz + hr * 0.25)]
            rad = hr * 0.30
        a, b = Vector(pts[0]), Vector(pts[1])
        d = b - a
        c = bmesh.new()
        bmesh.ops.create_cone(c, cap_ends=True, segments=6, radius1=rad, radius2=0.0, depth=d.length)
        if kind != "horns":
            bmesh.ops.scale(c, vec=(0.25, 1.0, 1.0), verts=c.verts)     # flat fins and frills
        bmesh.ops.translate(c, vec=(0, 0, d.length / 2), verts=c.verts)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(c, verts=c.verts, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(c, vec=a, verts=c.verts)
        me = bpy.data.meshes.new("extra")
        c.to_mesh(me)
        c.free()
        o = bpy.data.objects.new("extra", me)
        bpy.context.scene.collection.objects.link(o)
        o["part"] = "accent" if kind == "horns" else "membrane"
        parts.append(o)
    # a small round-sign mark on the chest (the client may pulse M_Dragon_Accent)
    cy, cz, cr = spine[5]
    ring = bmesh.new()
    n = 16
    for k in range(n):
        a0, a1 = TAU * k / n, TAU * (k + 0.75) / n
        if k == 3:
            continue          # the gap of the round sign
        p = [Vector((math.cos(a) * cr * 0.42, cy - cr * 0.15, cz - cr * 0.55 + math.sin(a) * cr * 0.42)) for a in (a0, a1)]
        o_ = Vector((0, -1, 0)) * 0.0
        v = [ring.verts.new(p[0] + Vector((0, -cr * 0.9, 0))), ring.verts.new(p[1] + Vector((0, -cr * 0.9, 0))),
             ring.verts.new(p[1] * 0.80 + Vector((0, cy * 0.2 - cr * 0.9, cz * 0.2))), ring.verts.new(p[0] * 0.80 + Vector((0, cy * 0.2 - cr * 0.9, cz * 0.2)))]
        ring.faces.new(v)
    me = bpy.data.meshes.new("mark")
    ring.to_mesh(me)
    ring.free()
    o = bpy.data.objects.new("mark", me)
    bpy.context.scene.collection.objects.link(o)
    o["part"] = "accent"
    parts.append(o)
    return parts


def build_rig(spine, wings):
    arm = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    P = lambda k: Vector((0, spine[k][0], spine[k][1]))

    def bone(name, h, t, parent=None, up=(0, 0, 1)):
        b = eb.new(name)
        b.head, b.tail = h, t
        b.align_roll(Vector(up))
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        return b

    bone("root", P(6), P(6) + Vector((0, 0.06, 0)))
    bone("spine_0", P(6), P(5), "root")
    bone("spine_1", P(5), P(4), "spine_0")
    bone("neck", P(4), P(3), "spine_1")
    bone("head", P(2), P(0), "neck")
    bone("spine_2", P(6), P(7), "root")
    prev = "spine_2"
    for k, (a, b) in enumerate(((7, 8), (8, 9), (9, 10), (10, 11), (11, 12))):
        bone(f"tail_{k}", P(a), P(b), prev)
        prev = f"tail_{k}"
    for side, (sh, el, wr, tip) in wings.items():
        bone(f"wing_{side}_0", sh, el, "spine_0")
        bone(f"wing_{side}_1", el, wr, f"wing_{side}_0")
        bone(f"wing_{side}_2", wr, tip, f"wing_{side}_1")
    for name, (x, y) in {"leg_FL": (-0.06, -0.21), "leg_FR": (0.06, -0.21), "leg_BL": (-0.06, 0.03), "leg_BR": (0.06, 0.03)}.items():
        bone(name, Vector((x, y, -0.02)), Vector((x * 1.15, y, -0.11)), "spine_0" if y < 0 else "spine_2", up=(0, -1, 0))
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.dot(ab), 1e-9)))
    return (p - (a + ab * t)).length


def weight(mesh_obj, rig):
    """Distance-based skinning: each vertex to its two nearest bones (inverse distance, sharp falloff); a vertex
    out on a wing only reads that wing's bones, a vertex down a leg only that leg."""
    me = mesh_obj.data
    bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones if b.name != "root"}
    wing_g = mesh_obj.vertex_groups["_wing"].index if "_wing" in mesh_obj.vertex_groups else None
    groups = {n: mesh_obj.vertex_groups.new(name=n) for n in bones}
    for v in me.vertices:
        p = v.co
        on_wing = wing_g is not None and any(g.group == wing_g for g in v.groups)
        if on_wing:
            side = "R" if p.x > 0 else "L"
            cand = [n for n in bones if n.startswith(f"wing_{side}")] + ["spine_0"]
        elif abs(p.x) > 0.032 and p.z < -0.04 and (abs(p.y + 0.21) < 0.06 or abs(p.y - 0.03) < 0.06):
            cand = [n for n in bones if n.startswith("leg")]
        else:
            cand = [n for n in bones if not n.startswith(("wing", "leg"))]
        ds = sorted((seg_dist(p, *bones[n]), n) for n in cand)[:2]
        ws = [1.0 / (d + 0.004) ** 3 for d, _ in ds]
        tot = sum(ws)
        for (d, n), w in zip(ds, ws):
            groups[n].add([v.index], w / tot, "REPLACE")
    if "_wing" in mesh_obj.vertex_groups:
        mesh_obj.vertex_groups.remove(mesh_obj.vertex_groups["_wing"])
    mod = mesh_obj.modifiers.new("rig", "ARMATURE")
    mod.object = rig
    mesh_obj.parent = rig


def animate(rig, S):
    """Five loops on the pose bones (Euler): idle (hover), follow, fly, glide, flip."""
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"
    rig.animation_data_create()
    clips = {"idle": 60, "follow": 36, "fly": 24, "glide": 60, "flip": 36}
    L = 1.0
    for name, n in clips.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        for f in range(n + 1):
            ph = TAU * f / n
            for b in pb:
                b.rotation_euler = (0, 0, 0)
                b.location = (0, 0, 0)
            flap = {"idle": 0.55, "follow": 0.75, "fly": 0.95, "glide": 0.0, "flip": 0.2}[name]
            beats = {"idle": 2, "follow": 2, "fly": 2, "glide": 0, "flip": 1}[name]
            spread = {"glide": 0.12, "flip": -0.5}.get(name, 0.0)
            for side, sgn in (("L", -1), ("R", 1)):
                a = flap * math.sin(ph * beats) + spread
                # roll aligned to world up: a wing bone's local X runs along the body axis, so X is the flap
                # both wings: local X runs along the body (L: +Y, R: -Y), so the same angle flaps them symmetrically
                m = 1.0
                pb[f"wing_{side}_0"].rotation_euler.x = m * a
                pb[f"wing_{side}_1"].rotation_euler.x = m * 0.35 * flap * math.sin(ph * beats - 0.6)
                pb[f"wing_{side}_2"].rotation_euler.x = m * 0.30 * flap * math.sin(ph * beats - 1.1)
                if name == "flip":
                    pb[f"wing_{side}_0"].rotation_euler.z = -sgn * 0.6          # tucked
            # body: bob with the down-stroke, tail undulation, head steady
            bob = {"idle": 0.02, "follow": 0.015, "fly": 0.012, "glide": 0.006, "flip": 0.0}[name] * L
            pb["root"].location = (0, 0, bob * math.sin(ph * max(beats, 1) + 1.2))
            pitch = {"fly": -0.18, "follow": -0.10, "glide": -0.06}.get(name, 0.0)
            pb["root"].rotation_euler.x = pitch
            if name == "flip":
                pb["root"].rotation_euler.y = ph                               # the happy roll: one full turn
                pb["root"].location = (0, 0, 0.08 * math.sin(ph / 2))
            amp = {"idle": 0.18, "follow": 0.22, "fly": 0.28, "glide": 0.12, "flip": 0.3}[name]
            for k in range(5):
                pb[f"tail_{k}"].rotation_euler.z = amp * math.sin(ph - k * 0.9) * (0.5 + 0.12 * k)
                pb[f"tail_{k}"].rotation_euler.x = 0.06 * math.sin(ph * 2 - k * 0.7)
            pb["neck"].rotation_euler.x = 0.08 * math.sin(ph + 2.0) - pitch * 0.6
            pb["head"].rotation_euler.x = -0.05 * math.sin(ph + 2.4)
            if name == "follow":
                pb["head"].rotation_euler.z = 0.25 * math.sin(ph * 0.5)           # glances back at the heroine
            for leg, sgn in (("leg_FL", 1), ("leg_FR", 1), ("leg_BL", -1), ("leg_BR", -1)):
                pb[leg].rotation_euler.x = 0.5 * sgn if name in ("fly", "follow", "glide") else 0.15 * sgn * math.sin(ph)
            for b in pb:
                b.keyframe_insert("rotation_euler", frame=f)
                b.keyframe_insert("location", frame=f)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    rig.animation_data.action = bpy.data.actions["idle"]
    for name in clips:                                   # one muted NLA track per clip keeps every action exported
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        st = track.strips.new(name, 0, bpy.data.actions[name])
        track.mute = True
    return clips


def build(did, lite=False):
    S = SPECIES[did]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    M_body = mat("M_Dragon_Body", (1, 1, 1), 0.42, vcol=True, sheen=0.3)
    M_mem = mat("M_Dragon_Membrane", srgb(S["membrane"]), 0.5, double=True, sheen=0.4)
    M_acc = mat("M_Dragon_Accent", srgb(S["accent"]), 0.3, emit=srgb(S["accent"]), strength=1.6)
    M_eye = mat("M_Dragon_Eye", (0.02, 0.02, 0.03), 0.08)
    body, spine = skin_body(S)
    wings, objs = {}, []
    for side, sgn in (("L", -1), ("R", 1)):
        w, spars, pts = membrane(S, sgn)
        wings[side] = pts
        w["part"] = "membrane"
        for t_ in spars:
            t_["part"] = "body"
        for o_ in [w] + spars:
            vg = o_.vertex_groups.new(name="_wing")
            vg.add(list(range(len(o_.data.vertices))), 1.0, "REPLACE")
        objs += [w] + spars
    te = tail_end(S, spine)
    te["part"] = "accent" if S["tail"] == "bud" else "membrane"
    objs += [te] + head_extras(S, spine)
    # one mesh: materials by part, vertex colour: body colour on top, belly colour underneath
    for o in [body] + objs:
        me = o.data
        for m in (M_body, M_mem, M_acc, M_eye):
            me.materials.append(m)
        idx = {"body": 0, "membrane": 1, "accent": 2, "eye": 3}[o.get("part", "body")]
        for p in me.polygons:
            p.material_index = idx
            p.use_smooth = True
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        top, bel = srgb(S["body"]), srgb(S["belly"])
        for v in me.vertices:
            k = max(0.0, min(1.0, 0.5 - v.normal.z * 0.9))
            c = [top[i] * (1 - k) + bel[i] * k for i in range(3)]
            ca.data[v.index].color = (*c, 1.0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [body] + objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = f"dragon_{did}"
    body.data.name = body.name
    # budget: decimate the skin body down (wings stay)
    budget = 2800 if lite else 5600
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    if tris > budget:
        d = body.modifiers.new("dec", "DECIMATE")
        d.ratio = budget / tris
        bpy.ops.object.modifier_apply(modifier="dec")
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    rig = build_rig(spine, wings)
    weight(body, rig)
    animate(rig, S)
    # scale to the sheet's length (unit model is 1 m snout to tail)
    rig.scale = (S["length"],) * 3
    bpy.context.view_layer.update()
    return body, rig, tris


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                              export_skins=True, export_yup=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = argv[0]
    lite_too = "--lite" in argv
    ids = [a for a in argv[1:] if a in SPECIES] or list(SPECIES)
    os.makedirs(out, exist_ok=True)
    for did in ids:
        for lite in ([False, True] if lite_too else [False]):
            body, rig, tris = build(did, lite)
            name = f"dragon_{did}" + ("_m" if lite else "")
            export(os.path.join(out, name + ".glb"))
            print("DRAGON", name, "tris", tris, flush=True)


if __name__ == "__main__":
    main()
