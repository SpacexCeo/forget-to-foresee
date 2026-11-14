"""Builds the lab's furniture for the prologue (owner, 14.11: "the chair and the rest yourself, take textures, modern
and worked through"). One GLB in the lab's own frame (three.js metres: x east, y up, z south; the 10 x 8 m room centred
on 0, the north wall at z = -4.05), so the client adds it without moving it.

Pieces: the desk on the north wall (oak top, drawer pedestals, two monitor housings round the story screens,
keyboard, desk lamp, floating shelves with books and boxes), two ergonomic chairs, the lab bench (microscope, test
tubes), the west wall's cabinets and wall units, tall units by the door, a specimen fridge, a side counter, the two
round pads, a rug, plants, a floor robot.

Textures: CC0 sets from Poly Haven (1k jpg: oak_veneer_01, leather_white, dirty_carpet), passed in a folder; the rest
are plain PBR factors. Every face gets a world-space box-projected UV, so the textures keep their real size.

    blender -b -P art/lab/build_lab_furniture.py -- <texture dir> <out.glb>
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
TEX, OUT = argv[0], argv[1]
random.seed(2048)
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
COL = SC.collection


def P(x, y, z):
    """three.js (x, y up, z south) -> Blender (x, y north, z up)."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------- materials
MATS = {}


def image(name, path, tint=None, noncolor=False):
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    if tint:
        # bake the tint into a copy, so glTF carries a plain base colour texture
        px = list(img.pixels)
        for i in range(0, len(px), 4):
            px[i], px[i + 1], px[i + 2] = px[i] * tint[0], px[i + 1] * tint[1], px[i + 2] * tint[2]
        new = bpy.data.images.new(name, img.size[0], img.size[1])
        new.pixels = px
        new.file_format = "JPEG"
        new.filepath_raw = os.path.join(os.path.dirname(OUT), name + ".jpg")
        new.save()
        return new
    return img


def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, tex=None, tint=None, emit=None, emit_strength=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if tex:
        d = nt.nodes.new("ShaderNodeTexImage")
        d.image = image(name + "_diff", os.path.join(TEX, tex + "_diff.jpg"), tint)
        nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = image(tex + "_nor", os.path.join(TEX, tex + "_nor.jpg"), noncolor=True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    MATS[name] = m
    return m


OAK = lambda: mat("oak", tex="oak_veneer_01", tint=(1.05, 1.0, 0.95), rough=0.45)
LEATHER = lambda: mat("leather_white", tex="leather_white", tint=(0.92, 0.9, 0.88), rough=0.55)
RUG = lambda: mat("rug", tex="dirty_carpet", tint=(0.55, 0.62, 0.78), rough=0.95)
WHITE = lambda: mat("white_lacquer", (0.86, 0.86, 0.84), 0.28)
GREY = lambda: mat("grey_lacquer", (0.42, 0.41, 0.40), 0.3, 0.25)
DARK = lambda: mat("dark_plastic", (0.05, 0.055, 0.06), 0.4)
CHROME = lambda: mat("chrome", (0.9, 0.9, 0.92), 0.12, 1.0)
STEEL = lambda: mat("brushed_steel", (0.62, 0.62, 0.64), 0.32, 1.0)
BRASS = lambda: mat("brass", (0.85, 0.62, 0.3), 0.25, 1.0)
STONE = lambda: mat("white_stone", (0.9, 0.89, 0.87), 0.22)
PAD = lambda: mat("pad_metal", (0.56, 0.56, 0.57), 0.3, 0.6)
INLAY = lambda: mat("pad_inlay", (0.12, 0.12, 0.13), 0.35, 0.5)
GLASS = lambda: mat("glass_tint", (0.2, 0.32, 0.36), 0.05, 0.2)
LEAF = lambda: mat("leaf", (0.12, 0.32, 0.1), 0.6)
SOIL = lambda: mat("soil", (0.1, 0.07, 0.05), 0.95)
LED = lambda: mat("led_warm", (1.0, 0.75, 0.45), 0.5, emit=(1.0, 0.7, 0.4), emit_strength=6.0)
SCREEN = lambda: mat("panel_cool", (0.05, 0.12, 0.14), 0.3, emit=(0.25, 0.75, 0.85), emit_strength=1.6)
BOOKS = [mat("book_%d" % i, c, 0.7) for i, c in enumerate([(0.55, 0.12, 0.1), (0.1, 0.2, 0.4), (0.82, 0.78, 0.68), (0.15, 0.3, 0.22), (0.3, 0.3, 0.32), (0.75, 0.55, 0.2)])]

# ---------------------------------------------------------------- geometry helpers
OBJS = []


def finish(o, m, bevel=0.0, segs=2):
    o.data.materials.append(m)
    if bevel > 0:
        b = o.modifiers.new("b", "BEVEL")
        b.width, b.segments, b.limit_method = bevel, segs, "ANGLE"
    OBJS.append(o)
    return o


def box(w, h, d, at, m, bevel=0.004, segs=2, rot=None):
    """A box w (x) by h (y) by d (z) centred at three.js point `at`; rot: (rx, ry, rz) radians in three.js axes."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*at))
    o = bpy.context.object
    o.scale = (w, d, h)
    if rot:
        o.rotation_euler = (rot[0], -rot[2], rot[1])
    return finish(o, m, bevel, segs)


def cyl(r, h, at, m, verts=32, r2=None, bevel=0.0, axis="y", rot=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=P(*at))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=P(*at))
    o = bpy.context.object
    if axis == "x":
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == "z":
        o.rotation_euler = (math.pi / 2, 0, 0)
    if rot:
        o.rotation_euler = (rot[0], -rot[2], rot[1])
    return finish(o, m, bevel)


def sphere(r, at, m, scale=(1, 1, 1), rot=None, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=P(*at))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    if rot:
        o.rotation_euler = (rot[0], -rot[2], rot[1])
    return finish(o, m)


def group(objs, origin, yaw):
    """Turns a set of objects about the vertical through three.js point `origin` (yaw in three.js: +y up)."""
    bpy.context.view_layer.update()   # the new objects' matrix_world is stale until the view layer updates
    o = P(*origin)
    T = Matrix.Translation(o) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Translation(-o)
    for ob in objs:
        ob.matrix_world = T @ ob.matrix_world


def since(n):
    return OBJS[n:]


# ---------------------------------------------------------------- pieces
def chair(x, z, yaw):
    """An ergonomic chair: five-star base on casters, gas lift, white leather seat and curved back, armrests. Front +z."""
    n = len(OBJS)
    for i in range(5):
        a = i * 2 * math.pi / 5
        dx, dz = math.sin(a), math.cos(a)
        box(0.05, 0.03, 0.3, (x + dx * 0.16, 0.085, z + dz * 0.16), GREY(), 0.008, rot=(0.12, a, 0))
        cyl(0.028, 0.03, (x + dx * 0.31, 0.035, z + dz * 0.31), DARK(), 16, axis="x", rot=(0, a + math.pi / 2, math.pi / 2))
        box(0.02, 0.04, 0.03, (x + dx * 0.31, 0.06, z + dz * 0.31), GREY(), 0.004)
    cyl(0.05, 0.06, (x, 0.1, z), GREY(), 24, bevel=0.01)
    cyl(0.024, 0.3, (x, 0.27, z), CHROME(), 20)
    cyl(0.03, 0.08, (x, 0.2, z), DARK(), 20)
    box(0.44, 0.03, 0.42, (x, 0.43, z), DARK(), 0.01)
    box(0.5, 0.075, 0.48, (x, 0.475, z + 0.01), LEATHER(), 0.03, 3)
    # the back: a curved shell, tilted back
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=10, size=1, location=(0, 0, 0))
    bk = bpy.context.object
    for v in bk.data.vertices:
        u, w = v.co.x, v.co.y          # -0.5..0.5
        v.co = Vector((u * 0.46, 0.08 * (2 * u) ** 2 - 0.03 * (2 * w) ** 2, (w + 0.5) * 0.56))
    bk.rotation_euler = (math.radians(-12), 0, 0)
    bk.location = P(x, 0.6, z - 0.25)
    s = bk.modifiers.new("s", "SOLIDIFY")
    s.thickness = 0.045
    finish(bk, LEATHER(), 0.01)
    box(0.06, 0.3, 0.04, (x, 0.6, z - 0.255), DARK(), 0.01, rot=(math.radians(-12), 0, 0))
    for side in (-1, 1):
        box(0.03, 0.2, 0.05, (x + side * 0.27, 0.57, z - 0.02), DARK(), 0.008)
        box(0.075, 0.03, 0.26, (x + side * 0.27, 0.68, z + 0.01), DARK(), 0.012, 3)
    group(since(n), (x, 0, z), yaw)


def desk():
    """The desk on the north wall round the story screens (x 1.84 and 2.56, centre y 1.12, face z -3.642)."""
    zc, x0, x1 = -3.45, 0.8, 3.6
    box(x1 - x0, 0.04, 0.8, ((x0 + x1) / 2, 0.76, zc), OAK(), 0.006)
    for xp in (x0 + 0.24, x1 - 0.24):
        box(0.44, 0.72, 0.72, (xp, 0.37, zc - 0.02), WHITE(), 0.008)
        for i, (h, y) in enumerate(((0.16, 0.62), (0.2, 0.42), (0.22, 0.18))):
            box(0.4, h, 0.02, (xp, y, zc + 0.345), WHITE(), 0.006)
            box(0.16, 0.012, 0.012, (xp, y + h / 2 - 0.03, zc + 0.36), STEEL(), 0.003)
        box(0.42, 0.04, 0.68, (xp, 0.02, zc - 0.03), DARK(), 0.004)
    box(x1 - x0 - 0.96, 0.4, 0.02, ((x0 + x1) / 2, 0.52, zc - 0.36), WHITE(), 0.005)
    # monitor housings and stands round the story screens
    for xm in (1.84, 2.56):
        box(0.68, 0.42, 0.024, (xm, 1.12, -3.657), DARK(), 0.008, 3)
        box(0.05, 0.22, 0.03, (xm, 0.9, -3.69), STEEL(), 0.008)
        box(0.24, 0.012, 0.18, (xm, 0.786, -3.66), STEEL(), 0.006, 3)
    box(0.44, 0.018, 0.14, (2.1, 0.789, -3.24), DARK(), 0.004)
    box(0.42, 0.004, 0.12, (2.1, 0.8, -3.24), GREY(), 0.001)
    sphere(0.03, (2.45, 0.792, -3.22), DARK(), (1, 0.45, 1.5))
    # the desk lamp (the warm light at 1.5, 1.4, -3.2 hangs from it)
    cyl(0.08, 0.02, (1.05, 0.79, -3.78), GREY(), 24, bevel=0.005)
    box(0.018, 0.45, 0.018, (1.1, 1.0, -3.7), STEEL(), 0.004, rot=(0.35, 0, -0.15))
    box(0.018, 0.4, 0.018, (1.3, 1.3, -3.45), STEEL(), 0.004, rot=(-0.9, 0, -0.5))
    cyl(0.07, 0.11, (1.48, 1.37, -3.24), GREY(), 24, r2=0.025, rot=(0.25, 0, 0.4))
    cyl(0.055, 0.01, (1.49, 1.31, -3.23), LED(), 24)
    # floating shelves with books, boxes, a brass sphere
    for y in (1.66, 2.12):
        box(2.7, 0.035, 0.26, (2.2, y, -3.92), OAK(), 0.004)
        x = 0.92
        while x < 3.45:
            if random.random() < 0.18:
                w = 0.3
                box(w - 0.02, 0.17, 0.22, (x + w / 2, y + 0.1, -3.93), WHITE() if random.random() < 0.6 else GREY(), 0.008)
                x += w
                continue
            for _ in range(random.randint(5, 11)):
                bw, bh = random.uniform(0.022, 0.05), random.uniform(0.17, 0.25)
                lean = random.uniform(-0.06, 0.06) if random.random() < 0.15 else 0
                box(bw, bh, random.uniform(0.15, 0.19), (x + bw / 2, y + 0.018 + bh / 2, -3.93), random.choice(BOOKS), 0.002, rot=(0, 0, lean))
                x += bw + 0.002
            x += random.uniform(0.06, 0.2)
    sphere(0.07, (3.3, 2.23, -3.9), BRASS(), seg=24)
    cyl(0.03, 0.03, (3.3, 2.155, -3.9), BRASS(), 16)
    plant(1.0, 2.14, -3.92, 0.5)


def plant(x, y, z, s=1.0):
    cyl(0.16 * s, 0.34 * s, (x, y + 0.17 * s, z), WHITE(), 32, r2=0.12 * s, bevel=0.01 * s)
    cyl(0.145 * s, 0.01, (x, y + 0.33 * s, z), SOIL(), 24)
    for i in range(16):
        a = i * 2.399
        tilt = 0.35 + (i % 4) * 0.18
        L = (0.2 + 0.12 * ((i * 7) % 5) / 4) * s
        cx = x + math.sin(a) * L * 0.45 * math.sin(tilt)
        cz = z + math.cos(a) * L * 0.45 * math.sin(tilt)
        sphere(1, (cx, y + 0.34 * s + L * 0.45 * math.cos(tilt), cz), LEAF(), (0.045 * s, 0.008, L * 0.5), rot=(tilt, a, 0), seg=10)


def bench():
    """The lab bench under the papers (x -3.4 .. -0.6, z -2.85 .. -1.95, top 0.86)."""
    box(2.8, 0.04, 0.9, (-2.0, 0.86, -2.4), STONE(), 0.006)
    for dx in (-1.33, 1.33):
        for dz in (-0.38, 0.38):
            box(0.04, 0.84, 0.04, (-2.0 + dx, 0.42, -2.4 + dz), GREY(), 0.004)
        box(0.04, 0.04, 0.76, (-2.0 + dx, 0.12, -2.4), GREY(), 0.004)
    box(2.7, 0.03, 0.04, (-2.0, 0.8, -2.78), GREY(), 0.004)
    box(2.66, 0.025, 0.8, (-2.0, 0.2, -2.4), OAK(), 0.004)
    for i in range(4):
        box(0.4, 0.2, 0.3, (-3.0 + i * 0.55, 0.32, -2.5), WHITE() if i % 2 else GREY(), 0.01)
    # the microscope at the back left
    mx, mz = -3.2, -2.7
    box(0.16, 0.03, 0.2, (mx, 0.895, mz), WHITE(), 0.01)
    box(0.04, 0.26, 0.05, (mx, 1.03, mz - 0.07), WHITE(), 0.012, rot=(-0.15, 0, 0))
    box(0.12, 0.012, 0.12, (mx, 0.98, mz + 0.01), DARK(), 0.003)
    cyl(0.022, 0.12, (mx, 1.12, mz + 0.02), DARK(), 16, rot=(0.5, 0, 0))
    for dx in (-0.025, 0.025):
        cyl(0.012, 0.08, (mx + dx, 1.2, mz - 0.03), DARK(), 12, rot=(-0.6, 0, 0))
    cyl(0.03, 0.05, (mx, 1.06, mz + 0.03), STEEL(), 16)
    # a test-tube rack and a beaker at the right end
    box(0.24, 0.05, 0.08, (-0.85, 0.905, -2.7), WHITE(), 0.006)
    for i in range(6):
        cyl(0.009, 0.15, (-0.95 + i * 0.04, 0.95, -2.7), GLASS(), 10)
        cyl(0.0085, 0.05, (-0.95 + i * 0.04, 0.905, -2.7), mat("liquid_%d" % (i % 3), [(0.2, 0.6, 0.8), (0.8, 0.4, 0.2), (0.4, 0.8, 0.4)][i % 3], 0.2, emit=[(0.1, 0.4, 0.6), (0.6, 0.2, 0.05), (0.2, 0.5, 0.2)][i % 3], emit_strength=0.6), 10)
    cyl(0.045, 0.11, (-0.72, 0.935, -2.55), GLASS(), 20)


def west_wall():
    """Base cabinets with a stone counter, wall units with a warm line under them, tall units toward the door."""
    for i in range(6):
        z = -3.75 + i * 0.6
        box(0.58, 0.76, 0.58, (-4.72, 0.48, z), GREY(), 0.004)
        box(0.02, 0.74, 0.56, (-4.42, 0.48, z), GREY(), 0.006)
        box(0.025, 0.32, 0.018, (-4.4, 0.66, z + 0.22), STEEL(), 0.004)
        box(0.54, 0.1, 0.58, (-4.75, 0.05, z), DARK(), 0.002)
        box(0.34, 0.68, 0.58, (-4.85, 2.2, z), WHITE(), 0.004)
        box(0.02, 0.66, 0.56, (-4.67, 2.2, z), WHITE(), 0.006)
    box(0.66, 0.04, 3.62, (-4.69, 0.885, -2.25), STONE(), 0.006)
    box(0.02, 0.012, 3.5, (-4.66, 1.85, -2.25), LED(), 0.0)
    box(0.012, 0.01, 3.5, (-4.43, 0.11, -2.25), LED(), 0.0)
    # on the counter: an analyser with a lit panel, a centrifuge, a small plant
    box(0.36, 0.3, 0.4, (-4.7, 1.06, -3.2), WHITE(), 0.02, 3)
    box(0.012, 0.14, 0.24, (-4.515, 1.1, -3.2), SCREEN(), 0.002)
    cyl(0.14, 0.14, (-4.7, 0.975, -1.4), WHITE(), 32, bevel=0.02)
    cyl(0.11, 0.02, (-4.7, 1.05, -1.4), GLASS(), 32)
    plant(-4.72, 0.905, -0.75, 0.55)
    for i in range(3):
        z = 0.35 + i * 0.6
        box(0.58, 2.2, 0.58, (-4.72, 1.1, z), WHITE(), 0.004)
        box(0.02, 2.16, 0.56, (-4.42, 1.1, z), WHITE(), 0.006)
        box(0.025, 0.5, 0.018, (-4.4, 1.15, z + 0.22), STEEL(), 0.004)


def fridge():
    """A specimen fridge in the north-east corner: a white body, a dark glass door with lit shelves behind it."""
    box(0.62, 2.0, 0.64, (4.67, 1.0, -3.7), WHITE(), 0.01)
    box(0.02, 1.7, 0.5, (4.355, 1.06, -3.7), GLASS(), 0.006)
    for y in (0.5, 0.85, 1.2, 1.55):
        box(0.01, 0.012, 0.46, (4.36, y, -3.7), LED(), 0.0)
    box(0.015, 0.12, 0.08, (4.355, 1.95, -3.86), SCREEN(), 0.002)
    box(0.03, 0.5, 0.02, (4.34, 1.1, -3.48), STEEL(), 0.006)


def side_counter():
    """The south counter with a monitor; the second chair in front of it."""
    box(2.4, 0.04, 0.62, (2.1, 0.74, 3.7), OAK(), 0.006)
    box(2.36, 0.68, 0.56, (2.1, 0.36, 3.72), WHITE(), 0.006)
    for i in range(4):
        box(0.56, 0.62, 0.02, (1.2 + i * 0.6, 0.38, 3.43), WHITE(), 0.006)
        box(0.18, 0.012, 0.012, (1.2 + i * 0.6, 0.62, 3.415), STEEL(), 0.003)
    box(0.6, 0.36, 0.024, (2.3, 1.08, 3.85), DARK(), 0.008)
    box(0.56, 0.32, 0.004, (2.3, 1.08, 3.836), SCREEN(), 0.0)
    box(0.05, 0.2, 0.03, (2.3, 0.86, 3.88), STEEL(), 0.008)
    box(0.2, 0.012, 0.16, (2.3, 0.766, 3.86), STEEL(), 0.006)
    chair(2.1, 3.05, math.pi + 0.25)


def pad(x, z, r, top):
    cyl(r, top, (x, top / 2, z), PAD(), 96, bevel=min(0.02, top * 0.4))
    cyl(r + 0.06, top * 0.5, (x, top * 0.25, z), INLAY(), 96)
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=r * 0.78 + 0.0175, fill_type="NOTHING", location=P(x, top + 0.001, z))
    ring = bpy.context.object
    s = ring.modifiers.new("s", "SKIN")
    finish(ring, INLAY())
    bpy.context.view_layer.objects.active = ring
    for v in ring.data.skin_vertices[0].data:
        v.radius = (0.035, 0.003)
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.4
        cyl(0.04, 0.008, (x + math.sin(a) * r * 0.9, top + 0.004, z + math.cos(a) * r * 0.9), STEEL(), 20)


def robot(x, z):
    cyl(0.17, 0.08, (x, 0.045, z), WHITE(), 48, bevel=0.02)
    cyl(0.172, 0.03, (x, 0.04, z), DARK(), 48)
    cyl(0.05, 0.015, (x, 0.09, z - 0.06), DARK(), 24)
    box(0.04, 0.004, 0.01, (x, 0.087, z + 0.1), SCREEN(), 0.0)


desk()
chair(0.32, -3.2, 0.95)   # rolled back beside the desk end, clear of Iris's path to the desk
bench()
west_wall()
fridge()
side_counter()
pad(3.22, 0.42, 1.75, 0.07)
pad(-0.6, 2.3, 1.0, 0.06)
box(3.0, 0.012, 2.0, (0.3, 0.006, -0.9), RUG(), 0.004)
plant(4.5, 0.0, 2.7, 1.25)
robot(1.0, 2.9)

# ---------------------------------------------------------------- bake the modifiers, UV, join, export
dg = bpy.context.evaluated_depsgraph_get()
for o in OBJS:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
for o in OBJS:
    o.select_set(True)
bpy.context.view_layer.objects.active = OBJS[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
TILE = {"oak": 1.2, "leather_white": 0.6, "rug": 1.5}
for o in OBJS:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uv = bm.loops.layers.uv.verify()
    name = o.data.materials[0].name if o.data.materials else ""
    k = 1.0 / TILE.get(name, 1.0)
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            lp[uv].uv = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
            lp[uv].uv = (lp[uv].uv[0] * k, lp[uv].uv[1] * k)
    bm.to_mesh(o.data)
    bm.free()
bpy.ops.object.join()
lab = bpy.context.object
lab.name = "lab_furniture"
tris = sum(len(p.vertices) - 2 for p in lab.data.polygons)
print("[lab] objects", len(OBJS), "tris", tris, "materials", len(lab.data.materials))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print("[lab] wrote", OUT)
