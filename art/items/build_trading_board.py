"""The trading board beside the Shard Exchange door (owner 14.11: rework it; scenes/town-props.js draws the live trade log
on a plane mounted at `socket_board`).

Two carved oak posts on plinths with brass finials and scrolled iron arms carrying amber lanterns; a framed slate panel
(oak moulding, a brass bead) whose centre is `socket_board` (1.6 m up, facing +z, the text plane 1.3 x 0.81 m sits
just in front of it); an arched header with a brass ring-and-shard emblem; in front, a panelled oak counter with a
brass edge, an open ledger, a pair of scales, coin stacks, a candle and a jar of shards. About 2.9 m tall, 2.3 m wide.
Sockets (all in the root's frame, scale 1): socket_board, socket_agent_spot (where an agent stands, 1.55 m in front),
socket_lamp_l / socket_lamp_r (the lantern glass). Base at the origin, front +z (three.js).

    blender -b -P art/items/build_trading_board.py -- <texture dir> <out.glb>
Textures: Poly Haven CC0 weathered_brown_planks, rusty_metal_02 (1k).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
TEX, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
P = lambda x, y, z: Vector((x, -z, y))
OBJS, MATS = [], {}


def mat(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, tex=None, tint=None, emit=None, strength=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if tex:
        im = bpy.data.images.load(os.path.join(TEX, tex + "_diff.jpg"), check_existing=True)
        if tint:
            import numpy as np
            a = np.array(im.pixels[:]).reshape(-1, 4); a[:, :3] *= np.array(tint)
            im = bpy.data.images.new(name + "_diff", im.size[0], im.size[1]); im.pixels = a.ravel().tolist()
            im.file_format = "JPEG"; im.filepath_raw = os.path.join(os.path.dirname(OUT), name + "_diff.jpg"); im.save()
        d = nt.nodes.new("ShaderNodeTexImage"); d.image = im; nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(os.path.join(TEX, tex + "_nor.jpg"), check_existing=True); n.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    MATS[name] = m
    return m


def fin(o, m, bevel=0.0):
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width, b.segments, b.limit_method = bevel, 2, "ANGLE"
    OBJS.append(o); return o


def box(w, h, d, at, m, bevel=0.008, rx=0.0, rz=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*at)); o = bpy.context.object
    o.scale = (w, d, h); o.rotation_euler = (rx, -rz, 0)
    return fin(o, m, bevel)


def cyl(r, h, at, m, verts=16, r2=None, lie=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=P(*at))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=P(*at))
    o = bpy.context.object
    if lie == "x":
        o.rotation_euler = (0, math.pi / 2, 0)
    elif lie == "z":
        o.rotation_euler = (math.pi / 2, 0, 0)
    return fin(o, m)


def sph(r, at, m, seg=14):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=P(*at)); return fin(bpy.context.object, m)


def torus(R, r, at, m, face="z"):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=40, minor_segments=8, location=P(*at))
    o = bpy.context.object
    if face == "z":
        o.rotation_euler = (math.pi / 2, 0, 0)
    return fin(o, m)


OAK = mat("oak", tex="weathered_brown_planks", tint=(0.8, 0.62, 0.48), rough=0.75)
OAK_DK = mat("oak_dark", tex="weathered_brown_planks", tint=(0.5, 0.38, 0.3), rough=0.8)
IRON = mat("iron", tex="rusty_metal_02", tint=(0.35, 0.32, 0.3), rough=0.5, metal=0.7)
BRASS = mat("brass", (0.86, 0.64, 0.3), 0.3, 1.0)
SLATE = mat("slate", (0.07, 0.09, 0.085), 0.92)
AMBER = mat("amber_glass", (0.95, 0.62, 0.25), 0.15, emit=(1.0, 0.62, 0.25), strength=3.0)
FLAME = mat("flame", (1.0, 0.8, 0.45), 0.5, emit=(1.0, 0.75, 0.4), strength=6.0)
WAX = mat("wax", (0.92, 0.88, 0.78), 0.6)
PAPER = mat("ledger_paper", (0.88, 0.82, 0.68), 0.95)
LEATHER = mat("ledger_cover", (0.35, 0.12, 0.08), 0.7)
SHARD = mat("shard", (0.95, 0.7, 0.3), 0.2, emit=(0.9, 0.5, 0.15), strength=1.2)

CY, SW, SH = 1.6, 1.5, 0.95          # the slate's centre height, width, height
PX = 1.0                              # post centres
# posts: plinth, shaft, capital, brass finial
for s in (-1, 1):
    box(0.26, 0.2, 0.26, (s * PX, 0.1, 0), OAK_DK, 0.02)
    box(0.15, 2.45, 0.15, (s * PX, 1.42, 0), OAK, 0.015)
    box(0.22, 0.08, 0.22, (s * PX, 2.68, 0), OAK_DK, 0.015)
    cyl(0.05, 0.08, (s * PX, 2.76, 0), BRASS, 12)
    sph(0.075, (s * PX, 2.86, 0), BRASS)
    # a scrolled iron arm and an amber lantern
    box(0.36, 0.03, 0.03, (s * (PX - 0.2), 2.42, 0.08), IRON, 0.004)
    torus(0.06, 0.012, (s * (PX - 0.08), 2.36, 0.08), IRON)
    cyl(0.012, 0.1, (s * (PX - 0.36), 2.36, 0.08), IRON, 6)
    cyl(0.065, 0.16, (s * (PX - 0.36), 2.2, 0.08), AMBER, 8)
    cyl(0.085, 0.05, (s * (PX - 0.36), 2.3, 0.08), IRON, 8, r2=0.03)
    cyl(0.07, 0.02, (s * (PX - 0.36), 2.11, 0.08), IRON, 8)
# the slate panel in an oak moulding with a brass bead
box(SW, SH, 0.04, (0, CY, -0.01), SLATE, 0.0)
for (w, h, x, y) in ((SW + 0.16, 0.08, 0, CY + SH / 2 + 0.04), (SW + 0.16, 0.08, 0, CY - SH / 2 - 0.04), (0.08, SH, -SW / 2 - 0.04, CY), (0.08, SH, SW / 2 + 0.04, CY)):
    box(w, h, 0.07, (x, y, 0.0), OAK, 0.012)
for (w, h, x, y) in ((SW, 0.012, 0, CY + SH / 2 - 0.006), (SW, 0.012, 0, CY - SH / 2 + 0.006), (0.012, SH, -SW / 2 + 0.006, CY), (0.012, SH, SW / 2 - 0.006, CY)):
    box(w, h, 0.012, (x, y, 0.016), BRASS, 0.0)
box(2 * PX, 0.07, 0.06, (0, CY + SH / 2 + 0.12, -0.02), OAK_DK, 0.01)       # the beam between the posts
box(2 * PX, 0.07, 0.06, (0, CY - SH / 2 - 0.12, -0.02), OAK_DK, 0.01)
# the arched header with the ring-and-shard emblem
bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=0.06, vertices=32, location=P(0, CY + SH / 2 + 0.2, -0.01))
arch = bpy.context.object; arch.rotation_euler = (math.pi / 2, 0, 0)
bm = bmesh.new(); bm.from_mesh(arch.data); bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_inner=True); bm.to_mesh(arch.data); bm.free()
fin(arch, OAK, 0.01)
torus(0.13, 0.018, (0, CY + SH / 2 + 0.38, 0.03), BRASS)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.06, radius2=0, depth=0.1, location=P(0, CY + SH / 2 + 0.42, 0.035)); fin(bpy.context.object, SHARD)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.06, radius2=0, depth=0.08, location=P(0, CY + SH / 2 + 0.33, 0.035)); o = bpy.context.object; o.rotation_euler = (math.pi, 0, 0); fin(o, SHARD)
# the counter: panelled oak front, brass edge, the goods
CZ, CW, CH, CD = 0.62, 1.7, 0.95, 0.55
box(CW, CH, CD, (0, CH / 2, CZ), OAK_DK, 0.015)
box(CW + 0.1, 0.06, CD + 0.1, (0, CH + 0.03, CZ), OAK, 0.012)
box(CW + 0.08, 0.02, 0.02, (0, CH + 0.01, CZ + CD / 2 + 0.06), BRASS, 0.0)
for i in range(3):
    x = -CW / 2 + CW * (i + 0.5) / 3
    box(CW / 3 - 0.12, CH - 0.3, 0.02, (x, CH / 2, CZ + CD / 2 + 0.01), OAK, 0.008)
top = CH + 0.06
box(0.42, 0.02, 0.3, (-0.25, top + 0.01, CZ + 0.02), LEATHER, 0.004)                  # the open ledger
for sx in (-1, 1):
    box(0.19, 0.018, 0.27, (-0.25 + sx * 0.1, top + 0.03, CZ + 0.02), PAPER, 0.003, rz=sx * 0.04)
cyl(0.006, 0.26, (0.45, top + 0.13, CZ - 0.05), BRASS, 8)                               # the scales
box(0.34, 0.012, 0.012, (0.45, top + 0.26, CZ - 0.05), BRASS, 0.0)
for sx in (-1, 1):
    cyl(0.07, 0.015, (0.45 + sx * 0.16, top + 0.16, CZ - 0.05), BRASS, 16)
cyl(0.06, 0.012, (0.45, top + 0.006, CZ - 0.05), BRASS, 16)
for i, (x, z, n) in enumerate(((0.12, CZ + 0.12, 5), (0.2, CZ + 0.16, 3), (0.06, CZ + 0.2, 4))):
    for k in range(n):
        cyl(0.025, 0.006, (x, top + 0.004 + k * 0.007, z), BRASS, 12)
cyl(0.03, 0.012, (-0.7, top + 0.006, CZ + 0.1), BRASS, 12)                             # the candle
cyl(0.018, 0.12, (-0.7, top + 0.07, CZ + 0.1), WAX, 10)
sph(0.012, (-0.7, top + 0.145, CZ + 0.1), FLAME, 8)
cyl(0.06, 0.15, (0.72, top + 0.075, CZ + 0.12), AMBER, 14)                             # the jar of shards

# apply, box UVs, join, sockets, export
for o in OBJS:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
for o in OBJS:
    o.select_set(True)
bpy.context.view_layer.objects.active = OBJS[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in OBJS:
    bm = bmesh.new(); bm.from_mesh(o.data); uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        ax = max(range(3), key=lambda i: abs(f.normal[i]))
        for lp in f.loops:
            c = lp.vert.co
            lp[uv].uv = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
    bm.to_mesh(o.data); bm.free()
bpy.ops.object.join()
root = bpy.context.object; root.name = "trading_board"
for name, at in (("socket_board", (0, CY, 0.012)), ("socket_agent_spot", (0, 0, 1.55)), ("socket_lamp_l", (-(PX - 0.36), 2.2, 0.08)), ("socket_lamp_r", ((PX - 0.36), 2.2, 0.08))):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); e.location = P(*at)
print("[board] tris", sum(len(p.vertices) - 2 for p in root.data.polygons), "materials", len(root.data.materials))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True)
print("[board] wrote", OUT)
