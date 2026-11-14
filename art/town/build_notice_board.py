"""The town's notice board (owner 14.11: replace the crude primitives; the spot after the stairs, E: read the notice board).

A covered board: two square oak posts on stone footings, a backboard of weathered vertical planks between top and
bottom rails with iron corner brackets and a thin gold trim (the material named `gold_trim` glows while the prompt is
offered, scenes/town-spot-props.js), a pitched roof of tiles on a ridge beam, six pinned parchment notices (gently
curled, each with its own lines of writing, one wanted poster), and a small counter shelf with an inkpot, a quill
and rolled scrolls. About 2.6 m tall and 1.9 m wide; base at the origin, the front faces +z (three.js).

Textures: Poly Haven CC0 (weathered_brown_planks, grey_roof_tiles_02 as roof_*, rusty_metal_02), 1k, passed in a
folder; the parchment is drawn here.

    blender -b -P art/town/build_notice_board.py -- <texture dir> <out.glb>
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
TEX, OUT = argv[0], argv[1]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
P = lambda x, y, z: Vector((x, -z, y))      # three.js -> Blender
OBJS = []
MATS = {}


def img(path, name, noncolor=False, tint=None):
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = "Non-Color"
    if tint:
        a = np.array(im.pixels[:]).reshape(-1, 4)
        a[:, :3] *= np.array(tint)
        new = bpy.data.images.new(name, im.size[0], im.size[1])
        new.pixels = a.ravel().tolist()
        new.file_format = "JPEG"
        new.filepath_raw = os.path.join(os.path.dirname(OUT), name + ".jpg")
        new.save()
        return new
    return im


def mat(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, tex=None, tint=None, image=None, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if tex:
        d = nt.nodes.new("ShaderNodeTexImage"); d.image = img(os.path.join(TEX, tex + "_diff.jpg"), name + "_diff", tint=tint)
        nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img(os.path.join(TEX, tex + "_nor.jpg"), tex + "_nor", noncolor=True)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if image is not None:
        d = nt.nodes.new("ShaderNodeTexImage"); d.image = image; nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = 0.0
    MATS[name] = m
    return m


def finish(o, m, bevel=0.0, tile=1.0):
    o.data.materials.append(m)
    o["tile"] = tile
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width, b.segments, b.limit_method = bevel, 2, "ANGLE"
    OBJS.append(o)
    return o


def box(w, h, d, at, m, bevel=0.006, rot=(0, 0, 0), tile=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*at))
    o = bpy.context.object; o.scale = (w, d, h); o.rotation_euler = (rot[0], -rot[2], rot[1])
    return finish(o, m, bevel, tile)


def cyl(r, h, at, m, verts=16, r2=None, rot=(0, 0, 0)):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=P(*at))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=P(*at))
    o = bpy.context.object; o.rotation_euler = (math.pi / 2 + rot[0], -rot[2], rot[1]) if rot != (0, 0, 0) else (0, 0, 0)
    return finish(o, m)


def sphere(r, at, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=12, ring_count=6, location=P(*at))
    return finish(bpy.context.object, m)


def parchment(name, seed, wanted=False):
    """A 256 x 320 parchment: warm paper, darker worn edges, lines of writing (and a sketched face on the wanted one)."""
    rr = np.random.default_rng(seed)
    W, H = 256, 320
    y, x = np.mgrid[0:H, 0:W]
    edge = np.minimum(np.minimum(x, W - 1 - x), np.minimum(y, H - 1 - y)) / 40.0
    base = np.array([0.86, 0.78, 0.6]) * (0.82 + 0.18 * np.clip(edge, 0, 1))[..., None]
    base *= (0.95 + 0.05 * rr.random((H, W)))[..., None]
    ink = np.array([0.18, 0.12, 0.08])
    lines = range(70 if wanted else 34, H - 26, 16)
    for ly in lines:
        x0, x1 = 24 + rr.integers(0, 12), W - 24 - rr.integers(0, 60)
        for xx in range(x0, x1, 4):
            if rr.random() < 0.18:
                continue
            h = rr.integers(2, 6)
            base[ly - h:ly, xx:xx + 2] = ink
    if wanted:
        base[18:50, 40:216] = ink * 1.2                        # the WANTED bar
        cy, cx = 150, 128
        face = ((x - cx) / 46.0) ** 2 + ((y - cy) / 58.0) ** 2
        base[(face < 1) & (face > 0.82)] = ink
        base[(abs(y - 135) < 3) & (abs(abs(x - cx) - 18) < 7)] = ink
        base[(abs(y - 180) < 2) & (abs(x - cx) < 16)] = ink
    rgba = np.concatenate([base, np.ones((H, W, 1))], axis=2)[::-1]
    im = bpy.data.images.new(name, W, H)
    im.pixels = rgba.ravel().tolist()
    im.file_format = "PNG"; im.filepath_raw = os.path.join(os.path.dirname(OUT), name + ".png"); im.save()
    return im


WOOD = mat("planks", tex="weathered_brown_planks", tint=(0.95, 0.85, 0.75), rough=0.85)
OAK = mat("oak_dark", tex="weathered_brown_planks", tint=(0.62, 0.5, 0.42), rough=0.8)
ROOF = mat("roof_tiles", tex="roof", tint=(1.0, 0.72, 0.55), rough=0.8)
IRON = mat("iron", tex="rusty_metal_02", tint=(0.5, 0.45, 0.42), rough=0.55, metal=0.6)
STONE = mat("stone", (0.62, 0.55, 0.46), 0.9)
GOLD = mat("gold_trim", (0.85, 0.62, 0.25), 0.35, 1.0, emit=(0.42, 0.29, 0.07))
RED = mat("pin_red", (0.6, 0.12, 0.1), 0.5)
BRASS = mat("brass", (0.8, 0.6, 0.3), 0.3, 1.0)
INK = mat("ink", (0.03, 0.03, 0.05), 0.15)
QUILL = mat("quill", (0.92, 0.9, 0.85), 0.7)

X0, BOT, TOP = 0.86, 0.95, 2.12
# posts on stone footings
for sx in (-1, 1):
    box(0.3, 0.22, 0.3, (sx * X0, 0.11, 0), STONE, 0.02)
    box(0.13, 2.4, 0.13, (sx * X0, 1.42, 0), OAK, 0.01)
# the backboard: vertical planks with small gaps and a little play
n = 8
pw = (2 * X0 - 0.13) / n
for i in range(n):
    x = -X0 + 0.065 + pw * (i + 0.5)
    box(pw - 0.008, TOP - BOT + random.uniform(-0.02, 0.02), 0.035, (x, (TOP + BOT) / 2, -0.01), WOOD, 0.004, rot=(0, random.uniform(-0.01, 0.01), random.uniform(-0.006, 0.006)))
box(2 * X0 - 0.1, TOP - BOT, 0.012, (0, (TOP + BOT) / 2, -0.034), mat("backing", (0.08, 0.06, 0.05), 0.9), 0.0)   # behind the gaps
for y in (BOT, TOP):
    box(2 * X0 + 0.1, 0.1, 0.08, (0, y, 0.02), OAK, 0.008)
box(2 * X0 - 0.1, 0.018, 0.01, (0, TOP - 0.035, 0.062), GOLD, 0.0)        # the gold trim that glows
for sx in (-1, 1):
    for y in (BOT + 0.07, TOP - 0.07):
        box(0.16, 0.035, 0.012, (sx * (X0 - 0.12), y, 0.065), IRON, 0.003)
        box(0.035, 0.16, 0.012, (sx * (X0 - 0.06), y - 0.05 * (1 if y > 1.5 else -1), 0.065), IRON, 0.003)
# the roof: two tiled slopes on a ridge beam, rafters showing under the eaves
RIDGE, PITCH, SL = 2.62, math.radians(32), 0.55
for sz in (1, -1):
    cz = sz * SL / 2 * math.cos(PITCH)
    cy = RIDGE - SL / 2 * math.sin(PITCH)
    box(2 * X0 + 0.42, 0.045, SL, (0, cy, cz), ROOF, 0.006, rot=(sz * PITCH, 0, 0), tile=0.6)
    box(2 * X0 + 0.36, 0.03, SL - 0.04, (0, cy - 0.04, cz), OAK, 0.004, rot=(sz * PITCH, 0, 0))
box(2 * X0 + 0.46, 0.08, 0.08, (0, RIDGE + 0.01, 0), OAK, 0.01)
for sx in (-1, 1):
    box(0.06, RIDGE - TOP, 0.06, (sx * X0, (RIDGE + TOP) / 2 - 0.03, 0), OAK, 0.006)
# the counter shelf with an inkpot, a quill and scrolls
box(1.1, 0.04, 0.24, (0, BOT - 0.08, 0.13), OAK, 0.006)
for sx in (-1, 1):
    box(0.03, 0.14, 0.18, (sx * 0.5, BOT - 0.16, 0.08), IRON, 0.003, rot=(math.radians(-20), 0, 0))
cyl(0.035, 0.06, (0.32, BOT - 0.03, 0.15), INK, 14)
cyl(0.004, 0.32, (0.34, BOT + 0.1, 0.13), QUILL, 6, r2=0.012, rot=(math.radians(-70), 0, math.radians(-15)))
for i, (x, l) in enumerate(((-0.3, 0.28), (-0.12, 0.24), (-0.38, 0.22))):
    cyl(0.025, l, (x + 0.03 * i, BOT - 0.03 + (0.04 if i == 2 else 0), 0.14 + 0.01 * i), mat(f"scroll{i}", (0.84, 0.76, 0.58), 0.9), 12, rot=(0, math.radians(80 + 20 * i), math.radians(90)))
# six pinned notices, gently curled, each with its own writing
SPOTS = [(-0.56, 1.66, 0.34, 0.42, 4), (-0.14, 1.72, 0.3, 0.38, -6), (0.3, 1.62, 0.36, 0.48, 3), (0.62, 1.78, 0.2, 0.26, -8), (-0.42, 1.2, 0.36, 0.28, -3), (0.14, 1.22, 0.28, 0.32, 5)]
for i, (x, y, w, h, deg) in enumerate(SPOTS):
    im = parchment(f"note_{i}", 31 + i, wanted=(i == 2))
    m = mat(f"note_{i}", image=im, rough=0.95)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=6, y_subdivisions=8, size=1, location=(0, 0, 0))
    g = bpy.context.object
    for v in g.data.vertices:
        u, t = v.co.x, v.co.y
        lift = 0.012 * (1 - math.cos(math.pi * (t + 0.5))) * (0.5 + random.random() * 0.2) + 0.006 * (2 * u) ** 2
        v.co = Vector((u * w, -lift, t * h))     # Blender x, -z (toward the viewer), y up
    g.rotation_euler = (0, math.radians(deg), 0)
    g.location = P(x, y, 0.03)
    finish(g, m)
    sphere(0.014, (x + math.sin(math.radians(-deg)) * h * 0.42, y + h * 0.42, 0.045), RED if i % 2 == 0 else BRASS)

# apply, UV (box projection; the notes keep their grid UVs), join, export
for o in OBJS:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
for o in OBJS:
    o.select_set(True)
bpy.context.view_layer.objects.active = OBJS[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in OBJS:
    if o.data.materials[0].name.startswith("note_"):
        continue
    bm = bmesh.new(); bm.from_mesh(o.data); uv = bm.loops.layers.uv.verify(); k = 1.0 / o.get("tile", 1.0)
    for f in bm.faces:
        ax = max(range(3), key=lambda i: abs(f.normal[i]))
        for lp in f.loops:
            c = lp.vert.co
            lp[uv].uv = ((c.y * k, c.z * k) if ax == 0 else (c.x * k, c.z * k) if ax == 1 else (c.x * k, c.y * k))
    bm.to_mesh(o.data); bm.free()
bpy.ops.object.join()
board = bpy.context.object; board.name = "notice_board"
print("[board] tris", sum(len(p.vertices) - 2 for p in board.data.polygons), "materials", len(board.data.materials))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True)
print("[board] wrote", OUT)
