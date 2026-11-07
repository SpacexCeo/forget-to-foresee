"""Procedural source for anchor.glb (Forget to Foresee hero asset).

Run with Blender 4.5 LTS as a Python module (pip package `bpy`) or inside
Blender (`blender -b -P build_anchor.py -- <stage>`):

    python build_anchor.py blockout   # primitive blockout + scale renders
    python build_anchor.py build      # runtime/_inspect/_col meshes, GPU bake, export
    python build_anchor.py render     # QA renders of the exported asset (GPU)
    python build_anchor.py all        # build + render

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
TEX_SIZE = 4096          # owner 07.11: hero budget x2, min spec RTX 2060 Super

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


# ------------------------------------------------------------- GPU + timing

def use_gpu(sc):
    """Prefer OptiX, then CUDA; fall back to CPU. Returns the device type used."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        sc.cycles.device = "CPU"
        return "CPU"
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == kind]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == kind
                sc.cycles.device = "GPU"
                log("cycles device", kind, [d.name for d in devs])
                return kind
        except Exception as exc:  # device type unsupported in this build
            log("cycles device", kind, "unavailable:", exc)
    sc.cycles.device = "CPU"
    log("cycles device CPU")
    return "CPU"


class StageClock:
    """Wall-clock time per pipeline stage, written into build-stats.json."""

    def __init__(self):
        self.stages = []
        self._name = None
        self._t = None

    def start(self, name):
        self.stop()
        self._name, self._t = name, time.time()
        log(f"== stage {name}")

    def stop(self):
        if self._name:
            dt = time.time() - self._t
            self.stages.append({"stage": self._name, "seconds": round(dt, 2)})
            log(f"== stage {self._name} done in {dt:.1f}s")
            self._name = None


# ---------------------------------------------------------- mesh primitives

BAKE_SIZE = 8192          # baked at 8k, box-downsampled to TEX_SIZE (supersampling)
RUNTIME_TRI_BUDGET = 16000   # brief x2 (owner decision 07.11)
INSPECT_TRI_BUDGET = 60000   # brief x2

APOTHEM = 0.150           # pad housing: octagon apothem
PAD_SHELL = (0.094, 0.112, 0.765)   # width, height, centre z
PAD_TICK = (0.094, 0.072, 0.630)
PAD_PROUD = 0.003         # pad plate sits 3 mm proud of the housing face
FRAME_BAR = 0.009
FRAME_PROUD = 0.010
MASTER_EDGE = 0.010       # max master edge before the final x8 simple subdivision


def bm_object(name, bm, mat, col):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), col)


def revolve(bm, profile, n, rfunc=None, phase=0.0, cap_bottom=False, cap_top=False):
    """Surface of revolution. Profile (r, z) runs bottom to top along the outside."""
    rings = []
    for r, z in profile:
        ring = []
        for i in range(n):
            th = phase + 2 * math.pi * i / n
            rr = rfunc(th, z, r) if rfunc else r
            ring.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return rings


def tube(bm, pts, radius, sides, closed=False, cap=True):
    """Swept circle along a polyline with parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    rings, u, prev_t = [], None, None
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % m] - pts[(i - 1) % m]).normalized()
        else:
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
        else:
            u = prev_t.rotation_difference(t) @ u
            u = (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        r = radius(i / (m - 1)) if callable(radius) else radius
        rings.append([bm.verts.new(p + r * (math.cos(a) * u + math.sin(a) * v))
                      for a in (2 * math.pi * k / sides for k in range(sides))])
        prev_t = t
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            l = (k + 1) % sides
            bm.faces.new((a[k], a[l], b[l], b[k]))
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def prism(bm, outline_xz, half_thick, angle):
    """Extrude a convex-or-not (x=radial, z) outline by +-half_thick(z) and rotate."""
    rot = Matrix.Rotation(angle, 3, "Z")
    front, back = [], []
    for x, z in outline_xz:
        h = half_thick(z) if callable(half_thick) else half_thick
        front.append(bm.verts.new(rot @ Vector((x, -h, z))))
        back.append(bm.verts.new(rot @ Vector((x, h, z))))
    n = len(outline_xz)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def box(bm, center, size, rot_z=0.0):
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_bevel(obj, width, segments, angle=30):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    return mod


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True,
                                         depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def finish_shading(obj, angle=32, flat=False):
    if flat:
        obj.data.shade_flat()
    else:
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(angle))


def select_only(objs, active):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def join(objs, name):
    select_only(objs, objs[0])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def duplicate(obj, name, col):
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    o.data.name = name
    o.modifiers.clear()
    link(o, col)
    return o


def smart_uv(obj, margin=0.004):
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_ngons(obj):
    """MikkTSpace tangents (bake and glTF export) need tris/quads only."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(obj.data)
    bm.free()
    return len(ngons)


def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


# ----------------------------------------------------------- anchor geometry

def rounded_octagon(th, z, a):
    """Radius of an octagon with apothem a, flat faces centred on 0/45/90...deg
    (so one face looks straight at -Y), corners slightly rounded."""
    d = ((th + math.pi / 8) % (math.pi / 4)) - math.pi / 8
    return a / math.cos(d) * (1.0 - 0.035 * (abs(d) / (math.pi / 8)) ** 6)


def lin(z, z0, z1, r0, r1):
    return r0 + (r1 - r0) * (z - z0) / (z1 - z0)


def build_parts(col, m_stone, m_bronze, m_pad, m_lens):
    """All runtime parts, each an object with one material. Returns dict of lists."""
    stone, bronze = [], []

    def part(name, mat, fill, bevel=None, flat=False):
        bm = bmesh.new()
        fill(bm)
        o = bm_object(name, bm, mat, col)
        if bevel:
            add_bevel(o, *bevel)
            apply_modifiers(o)
        finish_shading(o, flat=flat)
        (stone if mat is m_stone else bronze if mat is m_bronze else []).append(o)
        return o

    # Plinth: stepped round base with chamfers (no bottom face: it sits on the ground).
    part("plinth", m_stone, lambda bm: revolve(bm, [
        (0.300, 0.000), (0.300, 0.058), (0.291, 0.072), (0.274, 0.078), (0.274, 0.094),
        (0.263, 0.110), (0.170, 0.110)], 64))

    # Three curved buttress fins (one to the back, two framing the front).
    fin_outline = [(0.12, 0.0), (0.445, 0.0)]
    for k in range(13):
        ph = math.radians(90 * k / 12)
        fin_outline.append((0.445 - 0.29 * math.sin(ph), 0.45 - 0.42 * math.cos(ph)))
    fin_outline.append((0.12, 0.45))
    for i, deg in enumerate((90, 210, 330)):
        a = math.radians(deg)
        part(f"fin_{i}", m_stone,
             lambda bm, a=a: prism(bm, fin_outline, lambda z: 0.025 - 0.0075 * z / 0.45, a),
             bevel=(0.006, 1))
        part(f"fin_shoe_{i}", m_bronze,
             lambda bm, a=a: box(bm, Matrix.Rotation(a, 3, "Z") @ Vector((0.4235, 0, 0.035)),
                                 (0.057, 0.062, 0.070), a), bevel=(0.004, 1))

    # Lower shaft with three asymmetric growth ribs (sharp lower edge, soft upper).
    def rs(z):
        return lin(z, 0.10, 0.53, 0.172, 0.130)
    prof = [(rs(0.10), 0.10)]
    for zc in (0.20, 0.31, 0.42):
        r0 = rs(zc - 0.016)
        prof += [(r0, zc - 0.016), (r0 + 0.013, zc - 0.003), (r0 + 0.012, zc + 0.002),
                 (rs(zc + 0.022) + 0.002, zc + 0.022)]
    prof.append((rs(0.53), 0.53))
    part("shaft", m_stone, lambda bm: revolve(bm, prof, 48))

    # Pad housing: rounded octagon, chamfered top and bottom.
    part("housing", m_stone, lambda bm: revolve(bm, [
        (0.128, 0.515), (0.140, 0.520), (APOTHEM, 0.534), (APOTHEM, 0.846), (0.140, 0.860),
        (0.112, 0.862)], 64, rfunc=rounded_octagon))

    # Bronze corner beads on the eight housing corners.
    def beads(bm):
        for k in range(8):
            th = math.radians(22.5 + 45 * k)
            r = rounded_octagon(th, 0, APOTHEM) - 0.002
            p = Vector((r * math.cos(th), r * math.sin(th), 0))
            tube(bm, [p + Vector((0, 0, 0.540)), p + Vector((0, 0, 0.840))], 0.0055, 6)
    part("housing_beads", m_bronze, beads)

    # Bronze frames around the four pads (front and back).
    def frame(bm, w, h, zc, side):
        y0 = side * APOTHEM
        y1 = side * (APOTHEM + FRAME_PROUD)
        ow, oh = w / 2 + FRAME_BAR, h / 2 + FRAME_BAR
        iw, ih = w / 2, h / 2
        def rect(hw, hh, y):
            return [bm.verts.new((x, y, zc + z)) for x, z in
                    ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
        of, inf = rect(ow, oh, y1), rect(iw, ih, y1)
        ob, ib = rect(ow, oh, y0 - side * 0.004), rect(iw, ih, y0 - side * 0.004)
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((of[i], of[j], inf[j], inf[i]))   # front ring
            bm.faces.new((ob[j], ob[i], of[i], of[j]))     # outer wall
            bm.faces.new((inf[i], inf[j], ib[j], ib[i]))   # inner wall
            bm.faces.new((ib[i], ib[j], ob[j], ob[i]))     # back ring
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    def frames(bm):
        for side in (-1, 1):
            for w, h, zc in (PAD_SHELL, PAD_TICK):
                frame(bm, w, h, zc, side)
    part("pad_frames", m_bronze, frames, bevel=(0.0025, 1, 40))

    # Neck with a bronze collar.
    part("neck", m_stone, lambda bm: revolve(bm, [(0.118, 0.855), (0.112, 0.94), (0.104, 1.004)], 48))
    part("collar", m_bronze, lambda bm: revolve(bm, [
        (0.110, 0.876), (0.124, 0.883), (0.128, 0.899), (0.124, 0.915), (0.110, 0.922)], 48))

    # Gallery: corbelled stone disc with drip edge, bronze rim, railing.
    part("gallery", m_stone, lambda bm: revolve(bm, [
        (0.100, 0.996), (0.150, 1.016), (0.186, 1.026), (0.194, 1.034), (0.197, 1.048),
        (0.192, 1.062), (0.150, 1.068), (0.060, 1.068)], 48, cap_top=True))
    part("gallery_rim", m_bronze, lambda bm: revolve(bm, [
        (0.195, 1.044), (0.203, 1.049), (0.205, 1.058), (0.201, 1.066), (0.193, 1.069)], 48))

    def railing(bm):
        for k in range(16):
            th = 2 * math.pi * (k + 0.5) / 16
            p = Vector((0.186 * math.cos(th), 0.186 * math.sin(th), 0))
            tube(bm, [p + Vector((0, 0, 1.066)), p + Vector((0, 0, 1.128))], 0.0045, 6)
        ring = [(0.186 * math.cos(2 * math.pi * i / 48), 0.186 * math.sin(2 * math.pi * i / 48), 1.128)
                for i in range(48)]
        tube(bm, ring, 0.0050, 6, closed=True)
    part("railing", m_bronze, railing)

    # Lens cup, five helical lantern ribs, top ring.
    part("lens_cup", m_bronze, lambda bm: revolve(bm, [
        (0.058, 1.067), (0.069, 1.074), (0.075, 1.092), (0.066, 1.103), (0.040, 1.106)], 32))

    def ribs(bm):
        for k in range(5):
            th0 = 2 * math.pi * k / 5 + math.radians(18)
            pts = []
            for i in range(24):
                t = i / 23
                z = 1.066 + t * (1.400 - 1.066)
                th = th0 + math.radians(40) * t
                r = lin(t, 0, 1, 0.150, 0.128) + 0.030 * math.sin(math.pi * t)
                pts.append((r * math.cos(th), r * math.sin(th), z))
            tube(bm, pts, lambda t: 0.0078 - 0.0018 * t, 6)
    part("lantern_ribs", m_bronze, ribs)

    part("top_ring", m_bronze, lambda bm: revolve(bm, [
        (0.096, 1.392), (0.124, 1.393), (0.138, 1.400), (0.140, 1.415), (0.134, 1.427),
        (0.112, 1.431)], 48))

    # Spiral whorl cap: a cone whose radius steps along a 2.5-turn helical suture,
    # echoing the Shells' growth spiral.
    zc0, zc1 = 1.430, 1.586
    def whorl(th, z, r):
        u = (z - zc0) / (zc1 - zc0)
        s = (th / (2 * math.pi) + 2.0 * u) % 1.0
        return r * (1.0 + 0.16 * (s - 0.5))
    cap_prof = []
    for i in range(20):
        u = i / 19
        cap_prof.append((max(0.135 * (1 - u) ** 0.85, 0.010), zc0 + u * (zc1 - zc0)))
    part("cap", m_stone, lambda bm: revolve(bm, cap_prof, 64, rfunc=whorl,
                                            cap_bottom=True, cap_top=True))
    part("finial", m_bronze, lambda bm: revolve(bm, [
        (0.016, 1.578), (0.018, 1.587), (0.010, 1.595), (0.002, 1.600)], 16, cap_top=True))

    # Amber lens: faceted ellipsoid (flat shaded for sparkle).
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    bmesh.ops.transform(bm, verts=bm.verts, matrix=Matrix.Translation((0, 0, 1.226)) @
                        Matrix.Diagonal((0.085, 0.085, 0.130, 1)))
    lens = bm_object("lens", bm, m_lens, col)
    finish_shading(lens, flat=True)

    # Flat pad plates: one quad each, 0..1 UVs, readable left-to-right from outside.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for side in (-1, 1):
        y = side * (APOTHEM + PAD_PROUD)
        for w, h, zc in (PAD_SHELL, PAD_TICK):
            xl, xr = (-w / 2, w / 2) if side < 0 else (w / 2, -w / 2)
            vs = [bm.verts.new(p) for p in ((xl, y, zc - h / 2), (xr, y, zc - h / 2),
                                            (xr, y, zc + h / 2), (xl, y, zc + h / 2))]
            f = bm.faces.new(vs)
            for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                loop[uv].uv = c
    pads = bm_object("pads", bm, m_pad, col)
    finish_shading(pads, flat=True)
    return stone, bronze, lens, pads


def build_sockets(col):
    """Empties the game code uses to place the Shell number, tick and beacon glow."""
    out = []
    for side, face in ((-1, "front"), (1, "back")):
        for kind, (w, h, zc) in (("shell", PAD_SHELL), ("tick", PAD_TICK)):
            e = link(bpy.data.objects.new(f"socket_{kind}_{face}", None), col)
            e.empty_display_type = "ARROWS"
            e.empty_display_size = 0.05
            e.location = (0, side * (APOTHEM + PAD_PROUD + 0.0005), zc)
            e.rotation_euler = (0, 0, 0 if side < 0 else math.pi)
            e["socket"] = "shell_number" if kind == "shell" else "tick"
            e["face"] = face
            e["pad_size_m"] = [w, h]
            e["outward_normal_gltf"] = [0, 0, 1] if side < 0 else [0, 0, -1]
            out.append(e)
    e = link(bpy.data.objects.new("socket_beacon", None), col)
    e.location = (0, 0, 1.226)
    e["socket"] = "beacon"
    out.append(e)
    return out


def build_collision(col):
    objs = []

    def ngon_prism(name, n, r0, r1, z0, z1):
        bm = bmesh.new()
        revolve(bm, [(r0, z0), (r1, z1)], n, phase=math.pi / n, cap_bottom=True, cap_top=True)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        objs.append(link(bpy.data.objects.new(name, me), col))

    ngon_prism("anchor_plinth_col", 12, 0.30, 0.30, 0.0, 0.11)
    ngon_prism("anchor_body_col", 8, 0.205, 0.205, 0.11, 1.43)
    ngon_prism("anchor_cap_col", 8, 0.14, 0.02, 1.43, 1.60)
    hull = [(0.12, 0.0), (0.452, 0.0), (0.452, 0.07), (0.155, 0.45), (0.12, 0.45)]
    for tag, deg in zip("abc", (90, 210, 330)):
        bm = bmesh.new()
        prism(bm, hull, 0.031, math.radians(deg))
        me = bpy.data.meshes.new(f"anchor_fin_{tag}_col")
        bm.to_mesh(me)
        bm.free()
        objs.append(link(bpy.data.objects.new(me.name, me), col))
    return objs


# --------------------------------------------------- procedural master shading

def _sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.identifier == ident:
            return s
    raise KeyError(ident)


class NodeKit:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.n = self.nt.nodes
        self.l = self.nt.links

    def new(self, kind, **props):
        node = self.n.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.l.new(a, b)

    def coord(self):
        return self.new("ShaderNodeTexCoord").outputs["Object"]

    def noise(self, vec, scale, detail=4.0, rough=0.55):
        t = self.new("ShaderNodeTexNoise")
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        return t.outputs["Fac"]

    def maprange(self, val, a, b, c=0.0, d=1.0):
        m = self.new("ShaderNodeMapRange", clamp=True)
        self.link(val, m.inputs[0])
        for i, v in enumerate((a, b, c, d), start=1):
            m.inputs[i].default_value = v
        return m.outputs[0]

    def math(self, op, a, b=None, clamp=False):
        m = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.link(v, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        for ident, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            s = _sock(m, ident)
            if isinstance(v, (int, float)):
                s.default_value = v
            elif isinstance(v, tuple):
                s.default_value = (*v[:3], 1.0)
            else:
                self.link(v, s)
        return _sock(m, "Result_Color", out=True)

    def ao(self, dist):
        a = self.new("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
        a.inputs["Distance"].default_value = dist
        return a.outputs["AO"]

    def geometry(self):
        return self.new("ShaderNodeNewGeometry")


def procedural_material(name, kind):
    """Cycles-only authoring material for the master mesh. Exposes colour,
    roughness and metallic for Emit bakes, and a micro-bump for the normal bake."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    k = NodeKit(m)
    k.n.remove(k.n["Principled BSDF"])
    out = k.n["Material Output"]
    co = k.coord()
    geo = k.geometry()
    if kind == "stone":
        n1 = k.noise(co, 7.0, 8.0, 0.62)
        speck = k.noise(co, 55.0, 3.0, 0.5)
        wave = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z")
        k.link(co, wave.inputs["Vector"])
        wave.inputs["Scale"].default_value = 6.0
        wave.inputs["Distortion"].default_value = 5.0
        wave.inputs["Detail"].default_value = 4.0
        ramp = k.new("ShaderNodeValToRGB")
        k.link(n1, ramp.inputs["Fac"])
        el = ramp.color_ramp.elements
        el[0].position, el[0].color = 0.32, (*COL_CHARCOAL, 1)
        el[1].position, el[1].color = 0.78, (*COL_STONE_LIGHT, 1)
        mid = el.new(0.55)
        mid.color = (*COL_STONE, 1)
        strata = k.maprange(wave.outputs["Fac"], 0.62, 0.92, 0.0, 0.35)
        c = k.mix(strata, ramp.outputs["Color"], (0.26, 0.29, 0.27))
        wear_mask = k.noise(co, 22.0, 2.0, 0.5)
        wear = k.math("MULTIPLY", k.maprange(geo.outputs["Pointiness"], 0.515, 0.56),
                      k.maprange(wear_mask, 0.42, 0.62))
        c = k.mix(wear, c, (0.33, 0.36, 0.33))
        dirt = k.maprange(k.ao(0.035), 0.45, 0.95, 0.75, 0.0)
        c = k.mix(dirt, c, tuple(x * 0.55 for x in COL_CHARCOAL))
        sep = k.new("ShaderNodeSeparateXYZ")
        k.link(co, sep.inputs[0])
        low = k.maprange(sep.outputs["Z"], 0.04, 0.30, 1.0, 0.0)
        lichen = k.math("MULTIPLY", low, k.maprange(k.noise(co, 12.0, 5.0, 0.6), 0.50, 0.60))
        c = k.mix(lichen, c, (0.072, 0.105, 0.048))
        c = k.mix(0.35, c, k.maprange(speck, 0.3, 0.7, 0.75, 1.15), blend="MULTIPLY")
        rough = k.math("SUBTRACT", k.maprange(speck, 0.3, 0.7, 0.74, 0.92),
                       k.math("MULTIPLY", wear, 0.28), clamp=True)
        rough = k.math("ADD", rough, k.math("MULTIPLY", lichen, 0.08), clamp=True)
        metal = 0.0
        bump_h = k.math("ADD", k.noise(co, 260.0, 4.0, 0.6), k.math("MULTIPLY", speck, 0.5))
        bump_strength = 0.22
    else:  # bronze
        n = k.noise(co, 18.0, 6.0, 0.55)
        up = k.new("ShaderNodeSeparateXYZ")
        k.link(geo.outputs["Normal"], up.inputs[0])
        patina = k.math("ADD", k.maprange(k.ao(0.03), 0.55, 0.95, 1.0, 0.0),
                        k.maprange(up.outputs["Z"], 0.3, 0.95, 0.0, 0.55))
        patina = k.math("MULTIPLY", patina, k.maprange(k.noise(co, 9.0, 4.0, 0.6), 0.36, 0.62),
                        clamp=True)
        polish = k.maprange(geo.outputs["Pointiness"], 0.51, 0.56)
        c = k.mix(polish, COL_BRONZE, (0.56, 0.39, 0.21))
        c = k.mix(k.maprange(n, 0.3, 0.7, 0.0, 0.25), c, (0.18, 0.12, 0.06))
        pat_col = k.mix(k.maprange(n, 0.3, 0.7), COL_PATINA, (0.16, 0.24, 0.20))
        c = k.mix(patina, c, pat_col)
        metal = k.math("SUBTRACT", 1.0, k.math("MULTIPLY", patina, 0.95), clamp=True)
        rough = k.math("ADD", 0.30, k.math("MULTIPLY", patina, 0.45))
        rough = k.math("SUBTRACT", rough, k.math("MULTIPLY", polish, 0.12), clamp=True)
        rough = k.math("ADD", rough, k.math("MULTIPLY", n, 0.06), clamp=True)
        bump_h = k.noise(co, 150.0, 3.0, 0.5)
        bump_strength = 0.12
    bsdf = k.new("ShaderNodeBsdfPrincipled")
    k.link(c, bsdf.inputs["Base Color"])
    k.link(rough, bsdf.inputs["Roughness"])
    if isinstance(metal, float):
        bsdf.inputs["Metallic"].default_value = metal
    else:
        k.link(metal, bsdf.inputs["Metallic"])
    bump = k.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.002
    k.link(bump_h, bump.inputs["Height"])
    k.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    emit = k.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    channels = {"color": c, "rough": rough, "metal": metal}
    return m, (k, out, bsdf, emit, channels)


def set_master_output(kits, channel):
    """Route each master material's output to the BSDF (normal bake) or an Emission
    of one channel (colour/roughness/metallic bakes)."""
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


# --------------------------------------------------------------------- bake

def bake_target_material(name, image):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "BakeTarget"
    node.image = image
    m.node_tree.nodes.active = node
    return m


def new_float_image(name, size, data=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color" if data else "Linear Rec.709"
    return img


def bake(sc, kind, target, sources, image, samples, **kw):
    for slot in target.material_slots:
        node = slot.material.node_tree.nodes["BakeTarget"]
        node.image = image
        slot.material.node_tree.nodes.active = node
    select_only(sources + [target], target)
    sc.cycles.samples = samples
    t = time.time()
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.010,
                        max_ray_distance=0.030, margin=16, margin_type="EXTEND",
                        target="IMAGE_TEXTURES", **kw)
    log(f"bake {kind:8s} -> {image.name} ({image.size[0]}px, {samples} spp) {time.time() - t:.1f}s")


def pixels(img):
    import numpy as np
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downsample(a, f):
    h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def to_srgb(c):
    import numpy as np
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_rgb(arr01, path, quality=None):
    """Save a bottom-up float RGB array (Blender pixel order) with Pillow."""
    import numpy as np
    from PIL import Image
    u8 = (np.clip(arr01, 0, 1)[::-1] * 255.0 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8, "RGB")
    if path.endswith(".jpg"):
        im.save(path, quality=quality or 92, subsampling=0, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


# ---------------------------------------------------------- final materials

def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def body_material(name, base_img, orm_img, nrm_img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base_img
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nrm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group()
    nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


# ------------------------------------------------------------------ metrics

def uv_metrics(obj, tex_size):
    """Texel density (px/m) and per-triangle UV anisotropy for one mesh."""
    import numpy as np
    me = obj.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    dens, aniso = [], []
    for tri in me.loop_triangles:
        p = [Vector(me.vertices[i].co) for i in tri.vertices]
        q = [Vector(uvl[li].uv) for li in tri.loops]
        e1, e2 = p[1] - p[0], p[2] - p[0]
        a3 = e1.cross(e2).length / 2
        if a3 < 1e-9:
            continue
        x = e1.normalized()
        y = e1.cross(e2).cross(e1).normalized()
        P = np.array([[e1.dot(x), e2.dot(x)], [e1.dot(y), e2.dot(y)]])
        U = np.array([[q[1].x - q[0].x, q[2].x - q[0].x], [q[1].y - q[0].y, q[2].y - q[0].y]])
        try:
            J = U @ np.linalg.inv(P)
        except np.linalg.LinAlgError:
            continue
        s = np.linalg.svd(J, compute_uv=False)
        if s[1] < 1e-9:
            aniso.append(99.0)
            continue
        dens.append(math.sqrt(s[0] * s[1]) * tex_size)
        aniso.append(s[0] / s[1])
    d, an = np.array(dens), np.array(aniso)
    return {
        "texel_density_px_per_m": {"median": round(float(np.median(d)), 1),
                                   "p10": round(float(np.percentile(d, 10)), 1),
                                   "p90": round(float(np.percentile(d, 90)), 1),
                                   "coefficient_of_variation": round(float(d.std() / d.mean()), 3)},
        "uv_anisotropy": {"median": round(float(np.median(an)), 3),
                          "p95": round(float(np.percentile(an, 95)), 3),
                          "share_over_1_5": round(float((an > 1.5).mean()), 4)},
        "triangles_measured": int(len(d)),
    }


# --------------------------------------------------------------------- build

def stage_build():
    clock = StageClock()
    stats = {"blender": bpy.app.version_string, "stages": clock.stages}
    os.makedirs(TEX_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)

    clock.start("model_runtime")
    sc = reset_scene()
    stats["cycles_device"] = use_gpu(sc)
    sc.render.engine = "CYCLES"
    work = new_collection("Work")
    m_stone_tmp = mat_simple("tmp_stone", COL_STONE)
    m_bronze_tmp = mat_simple("tmp_bronze", COL_BRONZE)
    m_pad = mat_simple("M_Anchor_Pad", COL_PAD, rough=0.6)
    m_lens = mat_simple("M_Anchor_Lens", (0.55, 0.16, 0.02), rough=0.05,
                        emit=(1.0, 0.38, 0.06), emit_strength=0.35)
    stone, bronze, lens, pads = build_parts(work, m_stone_tmp, m_bronze_tmp, m_pad, m_lens)
    body = join(stone + bronze, "anchor_body")
    stats["ngons_triangulated"] = triangulate_ngons(body)
    clock.start("uv_unwrap")
    smart_uv(body)
    smart_uv(lens, margin=0.02)
    stats["uv"] = uv_metrics(body, TEX_SIZE)
    log("uv", json.dumps(stats["uv"]))

    clock.start("master_highpoly")
    master = duplicate(body, "anchor_master", work)
    slot_of = {s.material.name: i for i, s in enumerate(master.material_slots)}

    def crease_edges(obj):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        layer = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
        for e in bm.edges:
            if not e.is_manifold:
                e[layer] = 1.0
                continue
            a = math.degrees(e.calc_face_angle(0.0))
            e[layer] = 1.0 if a > 60 else 0.55 if a > 33 else 0.0
        bm.to_mesh(obj.data)
        bm.free()
    crease_edges(master)
    s1 = master.modifiers.new("smooth", "SUBSURF"); s1.levels = s1.render_levels = 1
    apply_modifiers(master)
    # Long thin quads (e.g. the housing faces) would stretch the displacement into
    # streaks, so split every edge longer than MASTER_EDGE until cells are near-square.
    bm = bmesh.new()
    bm.from_mesh(master.data)
    for _ in range(8):
        long_edges = [e for e in bm.edges if e.calc_length() > MASTER_EDGE]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(master.data)
    bm.free()
    stats["master_base_faces"] = len(master.data.polygons)
    st_v, br_v = set(), set()
    for poly in master.data.polygons:
        (br_v if poly.material_index == slot_of["tmp_bronze"] else st_v).update(poly.vertices)
    master.vertex_groups.new(name="stone").add(sorted(st_v), 1.0, "REPLACE")
    master.vertex_groups.new(name="bronze").add(sorted(br_v), 1.0, "REPLACE")
    s2 = master.modifiers.new("dense", "SUBSURF"); s2.subdivision_type = "SIMPLE"
    s2.levels = s2.render_levels = 3

    def disp(name, ttype, scale, strength, group, **tex_props):
        tex = bpy.data.textures.new(name, ttype)
        tex.noise_scale = scale
        for k_, v in tex_props.items():
            setattr(tex, k_, v)
        d = master.modifiers.new(name, "DISPLACE")
        d.texture, d.texture_coords, d.strength, d.mid_level = tex, "LOCAL", strength, 0.5
        d.vertex_group = group
    disp("stone_weather", "CLOUDS", 0.030, 0.0030, "stone", noise_depth=4)
    disp("stone_chips", "VORONOI", 0.022, -0.0028, "stone")
    disp("stone_pits", "DISTORTED_NOISE", 0.006, 0.0009, "stone", distortion=2.0)
    disp("bronze_hammer", "CLOUDS", 0.010, 0.0006, "bronze", noise_depth=2)
    h_stone, kit_s = procedural_material("H_Stone", "stone")
    h_bronze, kit_b = procedural_material("H_Bronze", "bronze")
    master.material_slots[slot_of["tmp_stone"]].material = h_stone
    master.material_slots[slot_of["tmp_bronze"]].material = h_bronze
    kits = [kit_s, kit_b]
    dg = bpy.context.evaluated_depsgraph_get()
    em = master.evaluated_get(dg).to_mesh()
    em.calc_loop_triangles()
    stats["master_triangles"] = len(em.loop_triangles)
    master.evaluated_get(dg).to_mesh_clear()
    log("master triangles", stats["master_triangles"])

    clock.start("inspect_mesh")
    inspect_body = duplicate(body, "anchor_inspect_body", work)
    crease_edges(inspect_body)
    s = inspect_body.modifiers.new("smooth", "SUBSURF")
    s.levels = s.render_levels = 1
    s.uv_smooth = "PRESERVE_BOUNDARIES"
    sw = inspect_body.modifiers.new("fit", "SHRINKWRAP")
    sw.target, sw.wrap_method = master, "NEAREST_SURFACEPOINT"
    apply_modifiers(inspect_body)
    finish_shading(inspect_body, angle=40)

    clock.start("bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    imgs = {k_: new_float_image(f"bake_{k_}", BAKE_SIZE, data=(k_ != "color"))
            for k_ in ("color", "rough", "metal", "ao", "normal", "normal_inspect")}
    m_body_bake = bake_target_material("bake_body", imgs["normal"])
    m_insp_bake = bake_target_material("bake_inspect", imgs["normal_inspect"])
    body.data.materials.clear(); body.data.materials.append(m_body_bake)
    inspect_body.data.materials.clear(); inspect_body.data.materials.append(m_insp_bake)
    bake_times = {}
    for key, kind, target, spp, channel in (
            ("normal", "NORMAL", body, 64, "bsdf"),
            ("normal_inspect", "NORMAL", inspect_body, 64, "bsdf"),
            ("color", "EMIT", body, 64, "color"),
            ("rough", "EMIT", body, 32, "rough"),
            ("metal", "EMIT", body, 32, "metal"),
            ("ao", "AO", body, 1024, "bsdf")):
        set_master_output(kits, channel)
        t = time.time()
        bake(sc, kind, target, [master], imgs[key], spp,
             **({"normal_space": "TANGENT"} if kind == "NORMAL" else {}))
        bake_times[key] = {"seconds": round(time.time() - t, 2), "samples": spp,
                           "size": BAKE_SIZE}
    stats["bakes"] = bake_times

    clock.start("textures")
    import numpy as np
    f = BAKE_SIZE // TEX_SIZE
    P = {k_: downsample(pixels(v), f)[..., :3] for k_, v in imgs.items()}
    paths = {
        "base": save_rgb(to_srgb(P["color"]), os.path.join(TEX_DIR, "anchor_basecolor.jpg"), 92),
        "orm": save_rgb(np.stack([P["ao"][..., 0], P["rough"][..., 0], P["metal"][..., 0]], -1),
                        os.path.join(TEX_DIR, "anchor_orm.jpg"), 92),
    }
    for key, fname in (("normal", "anchor_normal.png"), ("normal_inspect", "anchor_inspect_normal.png")):
        n = P[key] * 2.0 - 1.0
        n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        paths[key] = save_rgb(n * 0.5 + 0.5, os.path.join(TEX_DIR, fname))
    stats["texture_files"] = {k_: {"file": os.path.relpath(v, REPO).replace("\\", "/"),
                                   "bytes": os.path.getsize(v)} for k_, v in paths.items()}

    clock.start("materials")
    loaded = {k_: bpy.data.images.load(v) for k_, v in paths.items()}
    for k_ in ("orm", "normal", "normal_inspect"):
        loaded[k_].colorspace_settings.name = "Non-Color"
    m_body = body_material("M_Anchor_Body", loaded["base"], loaded["orm"], loaded["normal"])
    m_body_i = body_material("M_Anchor_Body_Inspect", loaded["base"], loaded["orm"],
                             loaded["normal_inspect"])
    body.data.materials.clear(); body.data.materials.append(m_body)
    inspect_body.data.materials.clear(); inspect_body.data.materials.append(m_body_i)
    master.hide_render = True
    master.hide_set(True)

    clock.start("assemble_export")
    out = new_collection("Export")
    lens_i = duplicate(lens, "lens_i", work)
    pads_i = duplicate(pads, "pads_i", work)
    anchor = join([body, pads, lens], "anchor")
    inspect = join([inspect_body, pads_i, lens_i], "anchor_inspect")
    for o in (anchor, inspect):
        work.objects.unlink(o)
        out.objects.link(o)
    cols = build_collision(out)
    for c in cols:
        triangulate_ngons(c)
    sockets = build_sockets(out)
    stats["runtime_triangles"] = mesh_tris(anchor)
    stats["inspect_triangles"] = mesh_tris(inspect)
    stats["collision_triangles"] = {o.name: mesh_tris(o) for o in cols}
    log("runtime tris", stats["runtime_triangles"], "inspect tris", stats["inspect_triangles"])
    if stats["inspect_triangles"] > INSPECT_TRI_BUDGET:
        dec = inspect.modifiers.new("budget", "DECIMATE")
        dec.ratio = (INSPECT_TRI_BUDGET - 500) / stats["inspect_triangles"]
        apply_modifiers(inspect)
        stats["inspect_decimated_ratio"] = round((INSPECT_TRI_BUDGET - 500) / stats["inspect_triangles"], 4)
        stats["inspect_triangles"] = mesh_tris(inspect)
    stats["materials"] = sorted({s.material.name for o in (anchor, inspect) for s in o.material_slots})
    lo, hi = world_bounds([anchor])
    stats["bounds_blender_zup"] = {"min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]}
    select_only([anchor, inspect] + cols + sockets, anchor)
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_tangents=True,
                              export_extras=True, export_image_format="AUTO",
                              export_animations=False, export_cameras=False, export_lights=False)
    stats["glb_bytes"] = os.path.getsize(GLB_PATH)
    clock.stop()
    stats["budget_ok"] = {
        "runtime": stats["runtime_triangles"] <= RUNTIME_TRI_BUDGET,
        "inspect": stats["inspect_triangles"] <= INSPECT_TRI_BUDGET,
        "materials_per_object": max(len({s.material.name for s in o.material_slots})
                                    for o in (anchor, inspect)) <= 3,
    }
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)
    os.makedirs(QA_DIR, exist_ok=True)
    with open(STATS_PATH, "w") as fh:
        json.dump(stats, fh, indent=2)
    log("stats", json.dumps(stats))


# -------------------------------------------------------------------- render

FINAL_VIEWS = {
    "front": ((0, -6, 0.85), (0, 0, 0.85), 2.0, None),
    "side": ((6, 0, 0.85), (0, 0, 0.85), 2.0, None),
    "three_quarter": ((3.1, -3.6, 2.35), (0, 0, 0.72), None, 62),
    "top": ((0, 0, 6), (0, 0, 0), 1.1, None),
}
CLOSE_VIEWS = {
    "close_pads": ((0.55, -1.15, 0.86), (0, 0, 0.72), None, 85),
    "close_lantern": ((0.65, -0.95, 1.55), (0, 0, 1.25), None, 85),
    "close_base": ((0.85, -0.95, 0.45), (0, 0, 0.12), None, 70),
}


def stage_render(res=1600, samples=512):
    """Render the exported .glb (re-imported, so the renders show what ships)."""
    clock = StageClock()
    clock.start("qa_renders")
    sc = reset_scene()
    setup_render(sc, res=res, samples=samples)
    device = use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    env = new_collection("ReviewEnv")
    add_lights(env)
    add_ground_and_scale(env)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    objs = {o.name: o for o in bpy.context.scene.objects}
    inspect = objs["anchor_inspect"]
    cols = [o for n, o in objs.items() if n.endswith("_col")]

    def show(runtime=True, insp=False, col=False):
        objs["anchor"].hide_render = not runtime
        inspect.hide_render = not insp
        for c in cols:
            c.hide_render = not col

    out = os.path.join(QA_DIR, "final")
    os.makedirs(out, exist_ok=True)
    timings = {}

    def shoot(views, prefix):
        for name, (loc, tgt, ortho, lens) in views.items():
            cam = add_camera(f"Cam_{prefix}_{name}", loc, tgt, ortho, lens or 70)
            if name == "top":
                cam.rotation_euler = (0, 0, 0)
            sc.camera = cam
            path = os.path.join(out, f"{prefix}_{name}.jpg")
            sc.render.filepath = path
            t = time.time()
            bpy.ops.render.render(write_still=True)
            timings[f"{prefix}_{name}"] = round(time.time() - t, 2)
            log(f"rendered {os.path.relpath(path, REPO)} {timings[f'{prefix}_{name}']}s")

    show(runtime=True)
    shoot(FINAL_VIEWS, "anchor")
    shoot(CLOSE_VIEWS, "anchor")
    show(runtime=False, insp=True)
    shoot(CLOSE_VIEWS, "anchor_inspect")
    # Collision overlay: translucent red hulls over the runtime mesh.
    cm = mat_simple("ColOverlay", (0.9, 0.1, 0.1), 0.5)
    cm.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.35
    for c in cols:
        c.data.materials.clear()
        c.data.materials.append(cm)
    show(runtime=True, col=True)
    shoot({"three_quarter": FINAL_VIEWS["three_quarter"]}, "anchor_collision")
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": device, "resolution": res, "samples": samples,
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


# ---------------------------------------------------------------------- main

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"blockout": stage_blockout,
     "build": stage_build,
     "render": stage_render,
     "all": lambda: (stage_build(), stage_render())}[stage]()
