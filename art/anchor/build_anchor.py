"""Procedural source for anchor.glb (Forget to Foresee hero asset).

Run with Blender 4.5 LTS as a Python module (pip package `bpy`) or inside
Blender (`blender -b -P build_anchor.py -- <stage>`):

    python build_anchor.py blockout   # primitive blockout + scale renders
    python build_anchor.py build      # runtime/_inspect/_col meshes, bake, export
    python build_anchor.py render     # QA renders of the exported asset

Everything is generated from the parameters in this file, so the asset can be
regenerated and tweaked deterministically. Blender convention is Z-up with the
front facing -Y; the glTF exporter converts to Y-up with the front facing +Z.
All dimensions are metres.
"""

import json
import math
import os
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "anchor")
TEX_DIR = os.path.join(HERE, "textures")
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", "anchor.glb")
BLEND_PATH = os.path.join(HERE, "anchor.blend")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")

TARGET_HEIGHT = 1.60
TEX_SIZE = 2048

# Palette (linear RGB). Cold grey-green stone, charcoal, aged bronze, amber.
COL_STONE = (0.105, 0.125, 0.118)
COL_STONE_LIGHT = (0.215, 0.245, 0.228)
COL_CHARCOAL = (0.032, 0.036, 0.038)
COL_BRONZE = (0.30, 0.205, 0.105)
COL_PATINA = (0.105, 0.175, 0.150)
COL_AMBER = (1.0, 0.42, 0.07)
COL_PAD = (0.62, 0.64, 0.60)


# ---------------------------------------------------------------- utilities

def log(*a):
    print("[anchor]", *a, flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def mat_simple(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def tri_count(obj):
    me = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return n


# ------------------------------------------------------- render environment

def setup_render(sc, res=1100, samples=48):
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("ReviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.34, 0.38, 0.37, 1.0)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = world


def add_lights(col):
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 3.2
    key.angle = math.radians(4)
    key.color = (1.0, 0.95, 0.88)
    o = link(bpy.data.objects.new("Key", key), col)
    o.rotation_euler = (math.radians(52), 0, math.radians(-38))
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = 1.4
    rim.color = (0.75, 0.88, 1.0)
    o = link(bpy.data.objects.new("Rim", rim), col)
    o.rotation_euler = (math.radians(68), 0, math.radians(150))


def add_ground_and_scale(col, with_human=True):
    """Ground disc with a 0.1 m grid, a 2 m ruler and a 1.75 m human proxy."""
    gmat = bpy.data.materials.new("Ground")
    gmat.use_nodes = True
    nt = gmat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def grid_line(axis, period, width):
        m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "PINGPONG"
        m1.inputs[1].default_value = period / 2
        nt.links.new(sep.outputs[axis], m1.inputs[0])
        m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "LESS_THAN"
        m2.inputs[1].default_value = width
        nt.links.new(m1.outputs[0], m2.inputs[0])
        return m2

    lines = []
    for axis in ("X", "Y"):
        lines.append((grid_line(axis, 0.1, 0.0025), 0.35))
        lines.append((grid_line(axis, 1.0, 0.006), 1.0))
    acc = None
    for node, weight in lines:
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = weight
        nt.links.new(node.outputs[0], mul.inputs[0])
        if acc is None:
            acc = mul
        else:
            mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
            nt.links.new(acc.outputs[0], mx.inputs[0])
            nt.links.new(mul.outputs[0], mx.inputs[1])
            acc = mx
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.20, 0.23, 0.22, 1)
    mix.inputs["B"].default_value = (0.05, 0.06, 0.06, 1)
    nt.links.new(acc.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=3.0, fill_type="NGON")
    g = bpy.context.object
    g.name = "Ground"
    g.data.materials.append(gmat)
    bpy.context.scene.collection.objects.unlink(g)
    col.objects.link(g)

    # Ruler: 2 m tall, alternating 0.1 m segments, placed left of the object.
    ra = mat_simple("RulerA", (0.85, 0.85, 0.82), 0.5)
    rb = mat_simple("RulerB", (0.02, 0.02, 0.02), 0.5)
    for i in range(20):
        bpy.ops.mesh.primitive_cube_add(size=1)
        seg = bpy.context.object
        seg.name = f"Ruler_{i:02d}"
        seg.scale = (0.02, 0.02, 0.05)
        seg.location = (-0.75, 0.0, 0.05 + i * 0.1)
        seg.data.materials.append(ra if i % 2 == 0 else rb)
        bpy.context.scene.collection.objects.unlink(seg)
        col.objects.link(seg)
    for h, label in ((1.0, "1.0 m"), (1.6, "1.6 m"), (2.0, "2.0 m")):
        bpy.ops.mesh.primitive_cube_add(size=1)
        tick = bpy.context.object
        tick.scale = (0.08, 0.004, 0.004)
        tick.location = (-0.75 + 0.06, 0, h)
        tick.data.materials.append(rb)
        bpy.context.scene.collection.objects.unlink(tick)
        col.objects.link(tick)
        cu = bpy.data.curves.new(f"Label{label}", "FONT")
        cu.body = label
        cu.size = 0.07
        t = link(bpy.data.objects.new(f"Label {label}", cu), col)
        t.location = (-0.75 - 0.24, -0.02, h - 0.025)
        t.rotation_euler = (math.radians(90), 0, 0)
        t.data.materials.append(rb)

    if with_human:
        # 1.75 m human proxy (simple capsule body + head), right of the object.
        hm = mat_simple("HumanProxy", (0.42, 0.40, 0.38), 0.8)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.17, depth=1.50,
                                            location=(0.95, 0.25, 0.75))
        body = bpy.context.object
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.115,
                                             location=(0.95, 0.25, 1.75 - 0.115))
        head = bpy.context.object
        for o in (body, head):
            o.data.materials.append(hm)
            bpy.context.scene.collection.objects.unlink(o)
            col.objects.link(o)
        bpy.ops.object.select_all(action="DESELECT")


def add_camera(name, loc, target, ortho=None, lens=70):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_start = 0.01
    obj = link(bpy.data.objects.new(name, cam))
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


STANDARD_VIEWS = {
    # name: (location, target, ortho_scale or None, lens)
    "front": ((0, -6, 0.85), (0, 0, 0.85), 2.4, None),
    "side": ((6, 0, 0.85), (0, 0, 0.85), 2.4, None),
    "three_quarter": ((3.1, -3.6, 2.35), (0, 0, 0.72), None, 62),
    "top": ((0, 0, 6), (0, 0, 0), 1.6, None),
}


def render_views(sc, out_dir, prefix, views=STANDARD_VIEWS, res=1100):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for name, (loc, tgt, ortho, lens) in views.items():
        cam = add_camera(f"Cam_{name}", loc, tgt, ortho, lens or 70)
        if name == "top":
            cam.rotation_euler = (0, 0, 0)
        sc.camera = cam
        sc.render.resolution_x = sc.render.resolution_y = res
        path = os.path.join(out_dir, f"{prefix}_{name}.png")
        sc.render.filepath = path
        t = time.time()
        bpy.ops.render.render(write_still=True)
        log(f"rendered {os.path.relpath(path, REPO)} in {time.time() - t:.1f}s")
        paths.append(path)
    return paths


# ------------------------------------------------------------------ blockout

def stage_blockout():
    """Primitive volumes at target dimensions, for scale and silhouette."""
    t0 = time.time()
    sc = reset_scene()
    setup_render(sc, samples=32)
    env = new_collection("ReviewEnv")
    add_lights(env)
    add_ground_and_scale(env)
    blk = new_collection("Blockout")
    m = mat_simple("Blockout", (0.30, 0.33, 0.31), 0.7)
    amber = mat_simple("BlockoutAmber", COL_AMBER, 0.3, emit=COL_AMBER, emit_strength=1.5)
    pad = mat_simple("BlockoutPad", COL_PAD, 0.6)

    def put(o, mat=m):
        o.data.materials.append(mat)
        bpy.context.scene.collection.objects.unlink(o)
        blk.objects.link(o)
        return o

    add = bpy.ops.mesh
    add.primitive_cylinder_add(vertices=32, radius=0.28, depth=0.11, location=(0, 0, 0.055)); put(bpy.context.object).name = "blk_plinth"
    for i in range(3):
        a = math.radians(90 + i * 120)
        add.primitive_cube_add(size=1, location=(math.cos(a) * 0.29, math.sin(a) * 0.29, 0.12))
        f = put(bpy.context.object); f.name = f"blk_fin_{i}"
        f.scale = (0.30, 0.06, 0.24); f.rotation_euler = (0, 0, a)
    add.primitive_cone_add(vertices=32, radius1=0.17, radius2=0.13, depth=0.42, location=(0, 0, 0.32)); put(bpy.context.object).name = "blk_shaft"
    add.primitive_cylinder_add(vertices=8, radius=0.162, depth=0.34, location=(0, 0, 0.70)); h = put(bpy.context.object); h.name = "blk_housing"; h.rotation_euler = (0, 0, math.radians(22.5))
    for side in (-1, 1):
        add.primitive_cube_add(size=1, location=(0, side * 0.152, 0.76)); p = put(bpy.context.object, pad); p.scale = (0.10, 0.01, 0.12); p.name = "blk_pad_shell"
        add.primitive_cube_add(size=1, location=(0, side * 0.152, 0.62)); p = put(bpy.context.object, pad); p.scale = (0.10, 0.01, 0.08); p.name = "blk_pad_tick"
    add.primitive_cone_add(vertices=32, radius1=0.13, radius2=0.10, depth=0.16, location=(0, 0, 0.95)); put(bpy.context.object).name = "blk_neck"
    add.primitive_cylinder_add(vertices=32, radius=0.20, depth=0.05, location=(0, 0, 1.055)); put(bpy.context.object).name = "blk_gallery"
    add.primitive_cylinder_add(vertices=16, radius=0.15, depth=0.32, location=(0, 0, 1.24)); c = put(bpy.context.object); c.name = "blk_lantern_volume"; c.display_type = "WIRE"
    add.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.085, location=(0, 0, 1.225)); put(bpy.context.object, amber).name = "blk_lens"
    add.primitive_cone_add(vertices=32, radius1=0.135, radius2=0.0, depth=0.20, location=(0, 0, 1.50)); put(bpy.context.object).name = "blk_cap"
    # Lantern volume is a proxy for the open cage: render it semi-transparent.
    cage = mat_simple("BlockoutCage", (0.30, 0.33, 0.31), 0.7)
    cage.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.35
    c.data.materials.clear(); c.data.materials.append(cage)

    lo, hi = world_bounds(list(blk.objects))
    dims = {"min": list(lo), "max": list(hi), "height": hi.z - lo.z,
            "footprint_x": hi.x - lo.x, "footprint_y": hi.y - lo.y}
    log("blockout bounds", json.dumps(dims))
    out = os.path.join(QA_DIR, "blockout")
    t_model = time.time() - t0
    render_views(sc, out, "anchor_blockout")
    with open(os.path.join(out, "blockout-dimensions.json"), "w") as fh:
        json.dump({"bounds_m_blender_zup": dims, "target_height_m": TARGET_HEIGHT,
                   "model_seconds": round(t_model, 2),
                   "total_seconds": round(time.time() - t0, 2)}, fh, indent=2)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "anchor_blockout.blend"))


# ------------------------------------------------------- not yet implemented

def stage_build():
    # Next executor: implement per docs/art/HANDOFF-anchor.md, section 5.
    raise NotImplementedError("build stage not implemented yet; see docs/art/HANDOFF-anchor.md")


def stage_render():
    raise NotImplementedError("render stage not implemented yet; see docs/art/HANDOFF-anchor.md")


# ---------------------------------------------------------------------- main

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"blockout": lambda: stage_blockout(),
     "build": lambda: stage_build(),
     "render": lambda: stage_render()}[stage]()
