"""Procedural source for the clan agent costumes (Forget to Foresee).

    agent_iris.glb    Iris   (player clan)
    agent_sol.glb     Salt
    agent_pepel.glb   Ash
    agent_moh.glb     Moss
    agent_yantar.glb  Amber
    agent_iney.glb    Frost

Run headless with Blender 4.5 LTS or 5.1 (from this folder or anywhere). Without native
toktx set FTF_COMPRESS to a missing path and compress the exported glbs afterwards with
art/tools/compress-glb-wasm.mjs. Blender's Python needs Pillow (pip --target a folder,
then PYTHONPATH=<folder> blender -b --python-use-system-env ...):

    blender -b -P build_agents.py -- preview [key ...]   # fast runtime-only renders
    blender -b -P build_agents.py -- build   [key ...]   # master, GPU bakes, glb export
    blender -b -P build_agents.py -- render  [key ...]   # QA renders of the exported glbs
    blender -b -P build_agents.py -- all     [key ...]   # build + render

Modules: agent_geometry.py (primitives, ray-cast conforming, the shared
parametric humanoid base, garment library) and agent_costumes.py (palettes and
the six costumes). This file holds the pipeline: dense displaced master ->
GPU Cycles bakes at 4k -> box-downsampled 2k textures -> glTF with `_col`,
sockets and tangents -> re-import QA renders.

Art direction (owner 07.11): hybrid. Bold faceted, flat-shaded large forms that
read from the high isometric camera; detailed PBR maps for close inspection.
In game the meshes go through a hologram shader and the constructor recipe, so
silhouettes and clean topology matter more than colour (code may override it).
Blender is Z-up with the front facing -Y; the glTF exporter converts to Y-up
with the front facing +Z. Metres throughout.
"""

import json
import math
import os
import sys
import time

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from agent_geometry import (  # noqa: E402
    KINDS, SLOTS, apply_modifiers, link, mat_simple, mesh_tris, revolve, select_only,
)
from agent_costumes import ALL, CLANS, build_agent  # noqa: E402
import agent_anim  # noqa: E402
import agent_rig  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MODEL_DIR = os.path.join(REPO, "game", "public", "assets", "models")
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "agents")
TEX_DIR = os.path.join(HERE, "textures")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")
RAW_DIR = os.environ.get("FTF_RAW_DIR", os.path.join(HERE, "_raw"))   # uncompressed glbs
COMPRESS = os.environ.get("FTF_COMPRESS", "/root/tools/compress-glb.sh")

AGENT_HEIGHT = 1.75
TEX_SIZE = 2048               # brief: agent textures up to 2048
BAKE_SIZE = int(os.environ.get("FTF_BAKE_SIZE", "4096"))   # baked at 4k, box-downsampled
# CPU-only rebuilds (no GPU host): FTF_BAKE_SIZE=2048 bakes at texture size (no
# supersampling) and FTF_BAKE_SPP scales every bake's sample count (e.g. 0.25).
BAKE_SPP_SCALE = float(os.environ.get("FTF_BAKE_SPP", "1.0"))
RUNTIME_TRI_BUDGET = 16000     # rigged characters (brief: characters <= 16k)
MAX_MATERIALS = 3
NORMAL_FORMAT = "jpg"         # "jpg" q95 (half the size of png, no visible loss) or "png"

MASTER_EDGE = 0.012           # densify master edges to this before x4 simple subdivision
CAGE = 0.004                  # bake cage extrusion (m); garment layers keep a wider gap
RAY = 0.009                   # bake max ray distance (m)
EXPLODE = 6.0                 # parts are moved this far apart (x) for the colour/normal bakes


def log(*a):
    print("[agents]", *a, flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


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


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


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


def smart_uv(obj, margin=0.003):
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


class StageClock:
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


# ============================================================= render setup

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
                return kind
        except Exception as exc:
            log("cycles device", kind, "unavailable:", exc)
    sc.cycles.device = "CPU"
    return "CPU"


def setup_render(sc, res=1200, samples=64):
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
    bg.inputs["Strength"].default_value = 0.6
    sc.world = world
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90


def add_lights(col):
    for name, energy, color, rot in (("Key", 3.4, (1.0, 0.95, 0.88), (50, 0, -35)),
                                     ("Rim", 1.6, (0.75, 0.88, 1.0), (65, 0, 150)),
                                     ("Fill", 0.6, (1.0, 1.0, 1.0), (75, 0, 60))):
        lt = bpy.data.lights.new(name, "SUN")
        lt.energy = energy
        lt.angle = math.radians(4)
        lt.color = color
        o = link(bpy.data.objects.new(name, lt), col)
        o.rotation_euler = tuple(math.radians(v) for v in rot)


def _cube(col, name, scale, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.location = loc
    o.data.materials.append(mat)
    bpy.context.scene.collection.objects.unlink(o)
    col.objects.link(o)
    return o


def add_ground_and_ruler(col, radius=4.0, ruler_xy=(-0.85, 0.45)):
    """Ground disc with a 0.1 m / 1 m grid, and a 2 m ruler with a 1.75 m mark."""
    gmat = bpy.data.materials.new("Ground")
    gmat.use_nodes = True
    nt = gmat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    acc = None
    for axis in ("X", "Y"):
        for period, width, weight in ((0.1, 0.0025, 0.35), (1.0, 0.006, 1.0)):
            m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "PINGPONG"
            m1.inputs[1].default_value = period / 2
            nt.links.new(sep.outputs[axis], m1.inputs[0])
            m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "LESS_THAN"
            m2.inputs[1].default_value = width
            nt.links.new(m1.outputs[0], m2.inputs[0])
            mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
            mul.inputs[1].default_value = weight
            nt.links.new(m2.outputs[0], mul.inputs[0])
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
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=radius)
    me = bpy.data.meshes.new("Ground")
    bm.to_mesh(me)
    bm.free()
    g = link(bpy.data.objects.new("Ground", me), col)
    g.data.materials.append(gmat)
    if ruler_xy is None:
        return []
    rx, ry = ruler_xy
    ra = mat_simple("RulerA", (0.85, 0.85, 0.82), 0.5)
    rb = mat_simple("RulerB", (0.02, 0.02, 0.02), 0.5)
    amber = mat_simple("RulerMark", (0.9, 0.35, 0.03), 0.4)
    objs = []
    for i in range(20):
        objs.append(_cube(col, f"Ruler_{i:02d}", (0.02, 0.02, 0.05), (rx, ry, 0.05 + i * 0.1),
                          ra if i % 2 == 0 else rb))
    for h, label, mat in ((1.0, "1.0 m", rb), (AGENT_HEIGHT, "1.75 m", amber), (2.0, "2.0 m", rb)):
        objs.append(_cube(col, f"RulerTick {label}", (0.12 if mat is amber else 0.08, 0.006, 0.006),
                          (rx + 0.06, ry, h), mat))
        cu = bpy.data.curves.new(f"Label{label}", "FONT")
        cu.body = label
        cu.size = 0.075
        t = link(bpy.data.objects.new(f"RulerLabel {label}", cu), col)
        t.location = (rx - 0.30, ry - 0.02, h - 0.025)
        t.rotation_euler = (math.radians(90), 0, 0)
        t.data.materials.append(mat)
        objs.append(t)
    objs.append(_cube(col, "RulerBar", (0.9, 0.002, 0.002), (rx + 0.5, ry, AGENT_HEIGHT), amber))
    return objs


def add_camera(name, loc, target, ortho=None, lens=70):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_start = 0.01
    cam.clip_end = 100
    obj = link(bpy.data.objects.new(name, cam))
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def iso_loc(target, dist, elev_deg, az_deg):
    e, a = math.radians(elev_deg), math.radians(az_deg)
    return Vector(target) + dist * Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a),
                                           math.sin(e)))


AGENT_VIEWS = {
    # name: (location, target, ortho_scale or None, lens)
    "front": ((0, -8, 0.98), (0, 0, 0.98), 2.35, None),
    "side": ((8, 0, 0.98), (0, 0, 0.98), 2.35, None),
    "back": ((0, 8, 0.98), (0, 0, 0.98), 2.35, None),
    "three_quarter": (tuple(iso_loc((0, 0, 0.92), 4.6, 14, 38)), (0, 0, 0.92), None, 50),
    "iso": (tuple(iso_loc((0, 0, 0.9), 12, 40, 45)), (0, 0, 0.9), 2.6, None),
}


def render_views(sc, out_dir, prefix, views, res=1200, timings=None):
    os.makedirs(out_dir, exist_ok=True)
    labels = [o for o in bpy.data.objects if o.name.startswith("RulerLabel")]
    for name, (loc, tgt, ortho, lens) in views.items():
        for o in labels:                 # keep the ruler text readable from behind
            x0 = o.get("x0", o.location.x)
            o["x0"] = x0
            back = name == "back"
            o.rotation_euler = (math.radians(90), 0, math.pi if back else 0)
            o.location.x = x0 + 0.66 if back else x0
        cam = add_camera(f"Cam_{prefix}_{name}", loc, tgt, ortho, lens or 70)
        sc.camera = cam
        sc.render.resolution_x = sc.render.resolution_y = res
        path = os.path.join(out_dir, f"{prefix}_{name}.jpg")
        sc.render.filepath = path
        t = time.time()
        bpy.ops.render.render(write_still=True)
        dt = round(time.time() - t, 2)
        if timings is not None:
            timings[f"{prefix}_{name}"] = dt
        log(f"rendered {os.path.relpath(path, REPO)} {dt}s")


def lineup_views(n):
    w = 1.25 * n + 0.5
    return {"front": ((0, -20, 1.0), (0, 0, 1.0), w, None),
            "iso": (tuple(iso_loc((0, 0, 0.9), 25, 40, 30)), (0, 0, 0.9), w * 0.92, None)}


def preview_material():
    """Viewport-style material that shows the per-part colour attribute."""
    m = bpy.data.materials.new("PreviewCol")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "Col"
    ap = nt.nodes.new("ShaderNodeAttribute")
    ap.attribute_name = "Prm"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(ap.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Red"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Green"], b.inputs["Metallic"])
    return m


def stage_preview(keys):
    """Runtime meshes only, coloured by part: fast silhouette iteration."""
    sc = reset_scene()
    setup_render(sc, res=900, samples=48)
    use_gpu(sc)
    env = new_collection("ReviewEnv")
    add_lights(env)
    add_ground_and_ruler(env, radius=6.0, ruler_xy=None)
    pm = preview_material()
    out = os.path.join(QA_DIR, "preview")
    report, agents = {}, {}
    for key in keys:
        col = new_collection(f"agent_{key}")
        t = time.time()
        ag = build_agent(key, col)
        for o in ag.parts:
            o.data.materials.clear()
            o.data.materials.append(pm)
        lo, hi = world_bounds(ag.parts)
        report[key] = {"tris": sum(mesh_tris(o) for o in ag.parts),
                       "seconds": round(time.time() - t, 2), "parts": ag.part_tris,
                       "bounds": [[round(v, 3) for v in lo], [round(v, 3) for v in hi]]}
        log(key, json.dumps(report[key]))
        agents[key] = col
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "preview-stats.json"), "w") as fh:
        json.dump(report, fh, indent=2)
    for key in agents:
        for k2, c2 in agents.items():
            c2.hide_render = k2 != key
        render_views(sc, out, key, AGENT_VIEWS, res=900)
    if len(agents) > 1:
        for idx, col in enumerate(agents.values()):
            col.hide_render = False
            for o in col.objects:
                o.location.x += (idx - (len(agents) - 1) / 2) * 1.25
        render_views(sc, out, "lineup", lineup_views(len(agents)), res=1800)

# ======================================================== master shading

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

    def noise(self, vec, scale, detail=4.0, rough=0.55):
        t = self.new("ShaderNodeTexNoise")
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        return t.outputs["Fac"]

    def voronoi(self, vec, scale, feature="DISTANCE_TO_EDGE"):
        t = self.new("ShaderNodeTexVoronoi", feature=feature)
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        return t.outputs["Distance"]

    def wave(self, vec, scale, direction="X", distortion=0.0):
        w = self.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction=direction)
        self.link(vec, w.inputs["Vector"])
        w.inputs["Scale"].default_value = scale
        w.inputs["Distortion"].default_value = distortion
        return w.outputs["Fac"]

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


# per kind: colour variation (noise scale, amount), bump recipe, bump strength
KIND_SHADING = {
    "skin": dict(var=(6.0, 0.10), bump="soft", bs=0.05),
    "cloth": dict(var=(9.0, 0.22), bump="weave", bs=0.30),
    "wool": dict(var=(7.0, 0.25), bump="wool", bs=0.22),
    "felt": dict(var=(14.0, 0.20), bump="felt", bs=0.30),
    "metal": dict(var=(20.0, 0.18), bump="hammer", bs=0.14),
    "wood": dict(var=(12.0, 0.35), bump="char", bs=0.55),
    "crystal": dict(var=(5.0, 0.14), bump="soft", bs=0.04),
    "glass": dict(var=(4.0, 0.10), bump="soft", bs=0.02),
    "leather": dict(var=(10.0, 0.25), bump="grain", bs=0.25),
    "moss": dict(var=(18.0, 0.45), bump="moss", bs=0.65),
    "resin": dict(var=(6.0, 0.25), bump="soft", bs=0.03),
    "stone": dict(var=(10.0, 0.30), bump="grain", bs=0.35),
    "armor": dict(var=(8.0, 0.10), bump="armor", bs=0.12),
}

# displacement on the master: (texture, noise scale, strength, props, vertical folds)
KIND_DISPLACE = {
    "cloth": ("CLOUDS", 0.05, 0.0035, {"noise_depth": 3}, True),
    "wool": ("CLOUDS", 0.04, 0.0040, {"noise_depth": 4}, True),
    "felt": ("CLOUDS", 0.012, 0.0020, {"noise_depth": 2}, False),
    "wood": ("VORONOI", 0.018, -0.0035, {}, False),
    "moss": ("CLOUDS", 0.010, 0.0040, {"noise_depth": 3}, False),
    "leather": ("CLOUDS", 0.02, 0.0010, {"noise_depth": 2}, False),
    "metal": ("CLOUDS", 0.012, 0.0006, {"noise_depth": 2}, False),
    "stone": ("CLOUDS", 0.02, 0.0018, {"noise_depth": 3}, False),
}


def master_material(kind):
    """Cycles authoring material for the dense master: colour / roughness /
    metallic from the per-part attributes plus kind-specific detail, and a
    micro-bump that ends up in the baked normal map."""
    spec = KIND_SHADING[kind]
    m = bpy.data.materials.new(f"H_{kind}")
    m.use_nodes = True
    k = NodeKit(m)
    k.n.remove(k.n["Principled BSDF"])
    out = k.n["Material Output"]
    co = k.new("ShaderNodeTexCoord").outputs["Object"]
    geo = k.new("ShaderNodeNewGeometry")
    a_col = k.new("ShaderNodeAttribute", attribute_name="Col").outputs["Color"]
    a_prm = k.new("ShaderNodeAttribute", attribute_name="Prm").outputs["Color"]
    prm = k.new("ShaderNodeSeparateColor")
    k.link(a_prm, prm.inputs["Color"])
    base_r, base_m = prm.outputs["Red"], prm.outputs["Green"]
    vs, va = spec["var"]
    n1 = k.noise(co, vs, 5.0, 0.6)
    c = k.mix(1.0, a_col, k.maprange(n1, 0.3, 0.7, 1.0 - va, 1.0 + va), blend="MULTIPLY")
    n2 = k.noise(co, vs * 3.1, 3.0, 0.5)
    bump = spec["bump"]
    if bump == "weave":
        wx = k.wave(co, 160.0, "X", 0.6)
        wz = k.wave(co, 160.0, "Z", 0.6)
        wy = k.wave(co, 160.0, "Y", 0.6)
        h = k.math("MAXIMUM", k.math("MULTIPLY", wx, wz), k.math("MULTIPLY", wy, wz))
        h = k.math("ADD", h, k.math("MULTIPLY", k.noise(co, 420.0, 2.0, 0.5), 0.35))
        c = k.mix(k.maprange(h, 0.0, 1.0, 0.0, 0.10), c, (0, 0, 0))
    elif bump == "wool":
        # heavy felted wool: coarse twill plus fuzzy noise and pilling
        wx = k.wave(co, 140.0, "X", 6.0)
        wz = k.wave(co, 140.0, "Z", 6.0)
        h = k.math("ADD", k.math("MULTIPLY", k.math("MULTIPLY", wx, wz), 0.3),
                   k.noise(co, 260.0, 8.0, 0.75))
        pil = k.maprange(k.noise(co, 55.0, 2.0, 0.5), 0.55, 0.75, 0.0, 0.12)
        c = k.mix(pil, c, k.mix(1.0, c, (1.35, 1.35, 1.35), blend="MULTIPLY"))
    elif bump == "felt":
        h = k.noise(co, 380.0, 6.0, 0.7)
    elif bump == "hammer":
        h = k.math("ADD", k.voronoi(co, 55.0, "F1"), k.math("MULTIPLY", k.noise(co, 200.0), 0.2))
    elif bump == "char":
        cr = k.voronoi(co, 34.0)
        h = k.math("ADD", k.maprange(cr, 0.0, 0.06, 0.0, 1.0),
                   k.math("MULTIPLY", k.noise(co, 140.0, 4.0, 0.6), 0.3))
        crack = k.maprange(cr, 0.0, 0.035, 1.0, 0.0)
        c = k.mix(crack, c, (0.004, 0.003, 0.003))
        # faint ember-brown in the deepest cracks (code adds real glow on top)
        c = k.mix(k.math("MULTIPLY", crack, k.maprange(n2, 0.55, 0.75)), c, (0.16, 0.05, 0.012))
    elif bump == "grain":
        h = k.math("ADD", k.voronoi(co, 90.0, "F1"), k.math("MULTIPLY", k.noise(co, 240.0), 0.5))
    elif bump == "moss":
        h = k.math("ADD", k.noise(co, 520.0, 8.0, 0.75), k.math("MULTIPLY", k.noise(co, 60.0), 0.6))
        c = k.mix(k.maprange(k.noise(co, 40.0, 4.0), 0.45, 0.62), c, (0.22, 0.30, 0.05))
    elif bump == "armor":
        # moulded composite: fine orange-peel plus sparse scuffs
        scuff = k.maprange(k.noise(co, 30.0, 6.0, 0.7), 0.62, 0.72, 0.0, 1.0)
        h = k.math("ADD", k.math("MULTIPLY", k.noise(co, 220.0, 3.0, 0.5), 0.4), scuff)
        c = k.mix(k.math("MULTIPLY", scuff, 0.35), c, (0.18, 0.18, 0.18))
    else:  # soft
        h = k.noise(co, 60.0, 3.0, 0.5)
    # cavity darkening and edge highlights
    dirt = k.maprange(k.ao(0.04), 0.4, 0.95, 0.65, 0.0)
    c = k.mix(dirt, c, k.mix(1.0, c, (0.25, 0.25, 0.25), blend="MULTIPLY"))
    edge = k.maprange(geo.outputs["Pointiness"], 0.52, 0.60, 0.0, 0.35)
    c = k.mix(edge, c, k.mix(1.0, c, (1.6, 1.6, 1.6), blend="MULTIPLY"))
    rough = k.math("ADD", base_r, k.math("MULTIPLY", k.math("SUBTRACT", n2, 0.5), 0.16), clamp=True)
    if kind == "metal":
        rough = k.math("SUBTRACT", rough, k.math("MULTIPLY", edge, 0.4), clamp=True)
    bsdf = k.new("ShaderNodeBsdfPrincipled")
    k.link(c, bsdf.inputs["Base Color"])
    k.link(rough, bsdf.inputs["Roughness"])
    k.link(base_m, bsdf.inputs["Metallic"])
    bn = k.new("ShaderNodeBump")
    bn.inputs["Strength"].default_value = spec["bs"]
    bn.inputs["Distance"].default_value = 0.0015
    k.link(h, bn.inputs["Height"])
    k.link(bn.outputs["Normal"], bsdf.inputs["Normal"])
    emit = k.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    return m, (k, out, bsdf, emit, {"color": c, "rough": rough, "metal": base_m})


def set_master_output(kits, channel):
    for k, out, bsdf, emit, ch in kits:
        for lk in list(out.inputs["Surface"].links):
            k.l.remove(lk)
        for lk in list(emit.inputs["Color"].links):
            k.l.remove(lk)
        if channel == "bsdf":
            k.link(bsdf.outputs["BSDF"], out.inputs["Surface"])
            continue
        k.link(ch[channel], emit.inputs["Color"])
        k.link(emit.outputs["Emission"], out.inputs["Surface"])


# =================================================================== bake

def bake_target_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "BakeTarget"
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
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=CAGE,
                        max_ray_distance=RAY, margin=12, margin_type="EXTEND",
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


def save_rgb(arr01, path, quality=90):
    import numpy as np
    from PIL import Image
    u8 = (np.clip(arr01, 0, 1)[::-1] * 255.0 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8, "RGB")
    if path.endswith(".jpg"):
        im.save(path, quality=quality, subsampling=0, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def final_material(name, base_img, orm_img, nrm_img):
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


def uv_metrics(obj, tex_size):
    import numpy as np
    me = obj.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    dens, aniso = [], []
    for tri in me.loop_triangles:
        p = [Vector(me.vertices[i].co) for i in tri.vertices]
        q = [Vector(uvl[li].uv) for li in tri.loops]
        e1, e2 = p[1] - p[0], p[2] - p[0]
        if e1.cross(e2).length / 2 < 1e-9:
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
    return {"texel_density_px_per_m": {"median": round(float(np.median(d)), 1),
                                       "p10": round(float(np.percentile(d, 10)), 1),
                                       "p90": round(float(np.percentile(d, 90)), 1)},
            "uv_anisotropy": {"median": round(float(np.median(an)), 3),
                              "p95": round(float(np.percentile(an, 95)), 3)}}


def capsule_collider(name, objs, col):
    """Capsule-like convex hull: 12-sided cylinder with domed ends; the radius is
    the 92nd percentile of the horizontal vertex distance in the torso band."""
    import numpy as np
    rs, zmax = [], 0.0
    for o in objs:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            zmax = max(zmax, p.z)
            if 0.3 < p.z < 1.6:
                rs.append(math.hypot(p.x, p.y))
    r = float(np.clip(np.percentile(np.array(rs), 92), 0.24, 0.42))
    h = max(min(zmax, 2.1), AGENT_HEIGHT)
    prof = [(0.001, 0.0)]
    for k in range(1, 4):
        a = math.pi / 2 * k / 3
        prof.append((r * math.sin(a), r * (1 - math.cos(a)) * 0.5))
    for k in range(4):
        a = math.pi / 2 * (1 - k / 3)
        prof.append((max(r * math.sin(a), 0.001), h - r * (1 - math.cos(a)) * 0.5))
    bm = bmesh.new()
    for rr, z in prof:
        for i in range(12):
            a = 2 * math.pi * i / 12
            bm.verts.new((rr * math.cos(a), rr * math.sin(a), z))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.002)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), col), round(r, 3), round(h, 3)

# ================================================================== build

def build_master(rt, work):
    """Dense displaced copy of the runtime mesh with per-kind authoring shaders."""
    import numpy as np
    master = duplicate(rt, f"{rt.name}_master", work)
    me = master.data
    bm = bmesh.new()
    bm.from_mesh(me)
    # Split long edges until cells are near-square so displacement does not streak.
    for _ in range(8):
        long_edges = [e for e in bm.edges if e.calc_length() > MASTER_EDGE]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()
    kinds = np.zeros(len(me.polygons), dtype=np.int32)
    me.attributes["kind"].data.foreach_get("value", kinds)
    me.materials.clear()
    kits = []
    for kd in KINDS:
        hm, kit = master_material(kd)
        me.materials.append(hm)
        kits.append(kit)
    me.polygons.foreach_set("material_index", kinds)
    me.update()
    groups = {}
    for poly, kd in zip(me.polygons, kinds):
        groups.setdefault(int(kd), set()).update(poly.vertices)
    for kd, vs in groups.items():
        master.vertex_groups.new(name=KINDS[kd]).add(sorted(vs), 1.0, "REPLACE")
    s2 = master.modifiers.new("dense", "SUBSURF")
    s2.subdivision_type = "SIMPLE"
    s2.levels = s2.render_levels = 2
    stretch = link(bpy.data.objects.new("fold_space", None), work)
    stretch.scale = (1.0, 1.0, 6.0)      # vertical streaks: cloth hangs
    for kd, (tt, scale, strength, props, vertical) in KIND_DISPLACE.items():
        if KINDS.index(kd) not in groups:
            continue
        tex = bpy.data.textures.new(f"disp_{kd}", tt)
        tex.noise_scale = scale
        for kk, vv in props.items():
            setattr(tex, kk, vv)
        d = master.modifiers.new(f"disp_{kd}", "DISPLACE")
        d.texture, d.strength, d.mid_level = tex, strength, 0.5
        if vertical:
            d.texture_coords = "OBJECT"
            d.texture_coords_object = stretch
        else:
            d.texture_coords = "LOCAL"
        d.vertex_group = kd
    apply_modifiers(master)              # real geometry, so it can be exploded
    # Smooth-shaded parts (the face): the edge splits above leave flat-normal verts
    # inside every low-poly face, which would bake facets back into the normal map.
    # Give the master the runtime mesh's interpolated normals there instead.
    smooth_v = sorted({v for p in master.data.polygons if p.use_smooth for v in p.vertices})
    if smooth_v:
        master.vertex_groups.new(name="smooth_nrm").add(smooth_v, 1.0, "REPLACE")
        dt = master.modifiers.new("smooth_nrm", "DATA_TRANSFER")
        dt.object = rt
        dt.use_loop_data = True
        dt.data_types_loops = {"CUSTOM_NORMAL"}
        dt.loop_mapping = "POLYINTERP_NEAREST"
        dt.vertex_group = "smooth_nrm"
        apply_modifiers(master)
    master.data.calc_loop_triangles()
    return master, kits, len(master.data.loop_triangles)


def explode(obj, sign):
    """Move every part EXPLODE*part metres along x (sign=+1) or back (sign=-1).
    Exploded, a bake ray can only hit the master copy of its own part."""
    import numpy as np
    me = obj.data
    n = len(me.vertices)
    part = np.zeros(n, dtype=np.int32)
    me.attributes["part"].data.foreach_get("value", part)
    co = np.zeros(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    co[:, 0] += sign * EXPLODE * part
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def build_one(key, clock):
    """Build, bake and export one agent. Returns its stats dict."""
    import numpy as np
    title = next(t for k, t, f in ALL if k == key)
    st = {"clan": title, "file": f"game/public/assets/models/agent_{key}.glb"}
    clock.start(f"{key}:model")
    sc = reset_scene()
    st["cycles_device"] = use_gpu(sc)
    sc.render.engine = "CYCLES"
    work = new_collection("Work")
    ag = build_agent(key, work)
    st["part_triangles"] = ag.part_tris
    cap = agent_rig.capture(ag)
    rt = join(list(ag.parts), f"agent_{key}")
    st["ngons_triangulated"] = triangulate_ngons(rt)
    # per-part shading from Agent.add: flat costume facets, smooth face
    st["runtime_triangles"] = mesh_tris(rt)
    log(key, "runtime tris", st["runtime_triangles"])

    clock.start(f"{key}:uv")
    smart_uv(rt)
    st["uv"] = uv_metrics(rt, TEX_SIZE)

    clock.start(f"{key}:master")
    master, kits, st["master_triangles"] = build_master(rt, work)
    log(key, "master tris", st["master_triangles"])

    clock.start(f"{key}:bake_gpu")
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    imgs = {k_: new_float_image(f"bake_{k_}", BAKE_SIZE, data=(k_ != "color"))
            for k_ in ("color", "rough", "metal", "ao", "normal")}
    bake_mats = [bake_target_material(f"bake_{s}") for s in SLOTS]
    for i, slot in enumerate(rt.material_slots):
        slot.material = bake_mats[i]
    st["bakes"] = {}
    for kk, kind, spp, channel in (("ao", "AO", 512, "bsdf"),
                                   ("normal", "NORMAL", 32, "bsdf"),
                                   ("color", "EMIT", 32, "color"),
                                   ("rough", "EMIT", 16, "rough"),
                                   ("metal", "EMIT", 8, "metal")):
        if kk == "normal":               # AO is baked assembled, the rest exploded
            explode(rt, 1)
            explode(master, 1)
        set_master_output(kits, channel)
        spp = max(8, round(spp * BAKE_SPP_SCALE))
        t = time.time()
        bake(sc, kind, rt, [master], imgs[kk], spp,
             **({"normal_space": "TANGENT"} if kind == "NORMAL" else {}))
        st["bakes"][kk] = {"seconds": round(time.time() - t, 2), "samples": spp,
                           "size": BAKE_SIZE, "exploded": kk != "ao"}
    explode(rt, -1)

    clock.start(f"{key}:textures")
    f = BAKE_SIZE // TEX_SIZE
    P = {k_: downsample(pixels(v), f)[..., :3] for k_, v in imgs.items()}
    os.makedirs(TEX_DIR, exist_ok=True)
    paths = {
        "base": save_rgb(to_srgb(P["color"]), os.path.join(TEX_DIR, f"agent_{key}_basecolor.jpg")),
        "orm": save_rgb(np.stack([P["ao"][..., 0], P["rough"][..., 0], P["metal"][..., 0]], -1),
                        os.path.join(TEX_DIR, f"agent_{key}_orm.jpg")),
    }
    n = P["normal"] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    paths["normal"] = save_rgb(n * 0.5 + 0.5, os.path.join(
        TEX_DIR, f"agent_{key}_normal.{NORMAL_FORMAT}"), 95)
    st["textures"] = {k_: {"file": os.path.basename(v), "size": [TEX_SIZE, TEX_SIZE],
                           "bytes": os.path.getsize(v)} for k_, v in paths.items()}

    clock.start(f"{key}:export")
    loaded = {k_: bpy.data.images.load(v) for k_, v in paths.items()}
    for k_ in ("orm", "normal"):
        loaded[k_].colorspace_settings.name = "Non-Color"
    em = ag.emissive or {}
    finals = []
    for s in SLOTS:
        m = final_material(f"M_{title}_{em['name'] if em.get('slot') == s else s.capitalize()}",
                           loaded["base"], loaded["orm"], loaded["normal"])
        if em.get("slot") == s:          # separate emissive primitive code can recolour
            bsdf = m.node_tree.nodes["Principled BSDF"]
            bsdf.inputs["Emission Color"].default_value = (*em["color"], 1.0)
            bsdf.inputs["Emission Strength"].default_value = em["strength"]
        finals.append(m)
    for i, slot in enumerate(rt.material_slots):
        slot.material = finals[i]
    bpy.data.objects.remove(master)
    out = new_collection("Export")
    clock.start(f"{key}:rig")
    rig = agent_rig.build_armature(out)
    st["skin"] = agent_rig.skin(rt, cap, rig, key, log=log)
    for an in ("kind", "part", "Col", "Prm"):
        if an in rt.data.attributes:
            rt.data.attributes.remove(rt.data.attributes[an])
    work.objects.unlink(rt)
    out.objects.link(rt)
    rt["clan"] = title
    rt["height_m"] = AGENT_HEIGHT
    rt["material_slots"] = list(SLOTS)
    colo, cr, chh = capsule_collider(f"agent_{key}_col", [rt], out)
    st["collision"] = {"name": colo.name, "radius_m": cr, "height_m": chh,
                       "triangles": mesh_tris(colo)}
    socks = []
    for sname, (loc, extras) in ag.sockets.items():
        e = link(bpy.data.objects.new(sname, None), out)
        e.empty_display_type = "ARROWS"
        e.empty_display_size = 0.06
        e.location = loc
        for kk, vv in extras.items():
            e[kk] = vv
        socks.append(e)
    bpy.context.view_layer.update()
    agent_rig.parent_sockets(socks, rig)
    clock.start(f"{key}:anim")
    st["clips"], _ = agent_anim.bake_clips(rig, key, log=log)
    st["walk_foot_check"] = agent_anim.foot_slip(agent_anim.Solver(rig), key)
    st["bones"] = len(rig.data.bones)
    rig["clips"] = list(agent_anim.CLIPS)
    clock.start(f"{key}:export")
    st["sockets_gltf"] = {s.name: [round(s.location.x, 4), round(s.location.z, 4),
                                   round(-s.location.y, 4)] for s in socks}
    st["materials"] = [s.material.name for s in rt.material_slots]
    lo, hi = world_bounds([rt])
    st["bounds_gltf_yup"] = {"min": [round(lo.x, 3), round(lo.z, 3), round(-hi.y, 3)],
                             "max": [round(hi.x, 3), round(hi.z, 3), round(-lo.y, 3)]}
    os.makedirs(MODEL_DIR, exist_ok=True)
    raw = export_rigged(rig, rt, [colo] + socks, key)
    glb = os.path.join(MODEL_DIR, f"agent_{key}.glb")
    st["raw_glb_bytes"] = os.path.getsize(raw)
    compress(raw, glb, f"agent_{key}")
    st["glb_bytes"] = os.path.getsize(glb)
    st["budget_ok"] = {"triangles": st["runtime_triangles"] <= RUNTIME_TRI_BUDGET,
                       "materials": len(set(st["materials"])) <= MAX_MATERIALS,
                       "textures": TEX_SIZE <= 2048}
    clock.stop()
    return st


def export_rigged(rig, rt, extra, key, path=None):
    os.makedirs(RAW_DIR, exist_ok=True)
    path = path or os.path.join(RAW_DIR, f"agent_{key}.glb")
    select_only([rig, rt] + list(extra), rig)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_tangents=True, export_extras=True, export_image_format="AUTO",
        export_cameras=False, export_lights=False, export_skins=True, export_all_influences=False,
        export_def_bones=False, export_animations=True, export_animation_mode="ACTIONS",
        export_force_sampling=True, export_frame_step=1, export_anim_single_armature=True,
        export_reset_pose_bones=True, export_optimize_animation_size=False,
        export_rest_position_armature=True)
    return path


def compress(raw, glb, name):
    import shutil
    import subprocess
    if os.path.exists(COMPRESS):
        r = subprocess.run(["bash", COMPRESS, raw, glb, name], capture_output=True, text=True)
        log("compress", name, r.returncode, r.stdout[-300:], r.stderr[-600:])
        if r.returncode == 0:
            return True
    log("compress unavailable/failed: shipping the uncompressed glb", name)
    shutil.copyfile(raw, glb)
    return False


def load_stats():
    if os.path.exists(STATS_PATH):
        with open(STATS_PATH) as fh:
            return json.load(fh)
    return {}


def save_stats(stats):
    os.makedirs(QA_DIR, exist_ok=True)
    with open(STATS_PATH, "w") as fh:
        json.dump(stats, fh, indent=2)


def stage_build(keys):
    stats = load_stats()
    stats.setdefault("agents", {})
    stats["blender"] = bpy.app.version_string
    stats["budgets"] = {"runtime_triangles": RUNTIME_TRI_BUDGET, "materials": MAX_MATERIALS,
                        "texture_px": TEX_SIZE, "bake_px": BAKE_SIZE}
    for key in keys:
        clock = StageClock()
        t0 = time.time()
        st = build_one(key, clock)
        st["stages"] = clock.stages
        st["total_seconds"] = round(time.time() - t0, 2)
        stats["agents"][key] = st
        save_stats(stats)
        log(key, "done", st["runtime_triangles"], "tris", st["glb_bytes"], "bytes")


def stage_render(keys, res=1400, samples=256):
    """QA renders of the exported glbs (re-imported, so the renders show what ships)."""
    t0 = time.time()
    sc = reset_scene()
    setup_render(sc, res=res, samples=samples)
    device = use_gpu(sc)
    env = new_collection("ReviewEnv")
    add_lights(env)
    ruler = add_ground_and_ruler(env, radius=8.0)
    agents = {}
    for key in keys:
        col = new_collection(f"agent_{key}")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(RAW_DIR, f"agent_{key}.glb"))
        for o in [o for o in bpy.data.objects if o not in before]:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            if o.name.endswith("_col"):
                o.hide_render = True
        agents[key] = col
    timings = {}
    for key in agents:
        for k2, c2 in agents.items():
            c2.hide_render = k2 != key
        render_views(sc, os.path.join(QA_DIR, key), f"agent_{key}", AGENT_VIEWS, res=res,
                     timings=timings)
    cm = mat_simple("ColOverlay", (0.9, 0.1, 0.1), 0.5)
    cm.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.3
    for key, col in agents.items():
        for k2, c2 in agents.items():
            c2.hide_render = k2 != key
        cols = [o for o in col.objects if o.name.endswith("_col")]
        for c in cols:
            c.data.materials.clear()
            c.data.materials.append(cm)
            c.hide_render = False
        render_views(sc, os.path.join(QA_DIR, key), f"agent_{key}_collision",
                     {"front": AGENT_VIEWS["front"]}, res=700, timings=timings)
        for c in cols:
            c.hide_render = True
    if len(agents) > 1:
        for o in ruler:
            o.hide_render = True
        for idx, col in enumerate(agents.values()):
            col.hide_render = False
            for o in col.objects:
                if o.parent is None:
                    o.location.x += (idx - (len(agents) - 1) / 2) * 1.25
        render_views(sc, QA_DIR, "lineup", lineup_views(len(agents)), res=2000, timings=timings)
    out = {"device": device, "resolution": res, "samples": samples,
           "seconds_per_render": timings, "total_seconds": round(time.time() - t0, 2)}
    stats = load_stats()
    stats.setdefault("qa_render", {})["+".join(keys)] = out
    save_stats(stats)


# ============================================================ animation QA

SHEET_CELL = (300, 420)
SHEET_FRAMES = {
    "walk": ("side", [0, 3, 6, 9, 12, 15, 18, 21]),
    "idle": ("three_quarter", [0, 20, 40, 60, 80, 100]),
    "clips": ("three_quarter", [("idle", 0), ("walk", 6), ("run", 5), ("talk", 22),
                                ("think", 60), ("gesture_offer", 30), ("celebrate", 15),
                                ("defeat", 75)]),
}
SHEET_VIEWS = {
    "side": ((7, 0, 0.95), (0, 0, 0.95), 2.5, None),
    "three_quarter": (tuple(iso_loc((0, 0, 0.95), 7, 12, 35)), (0, 0, 0.95), 2.5, None),
}


def find_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + "_") or a.name.startswith(name + "."):
            return a
    return None


def set_action(rig, name):
    ad = rig.animation_data or rig.animation_data_create()
    act = find_action(name)
    ad.action = act
    if hasattr(ad, "action_slot") and act is not None and len(act.slots):
        ad.action_slot = act.slots[0]
    return act


def render_sheets(sc, rig, key, out_dir, samples=24):
    """Contact sheets (walk side view, idle three-quarter, one frame of every clip)."""
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = SHEET_CELL
    tmp = os.path.join(out_dir, f"_cell_{key}.jpg")
    cams = {}
    for vn, (loc, tgt, ortho, lens) in SHEET_VIEWS.items():
        cams[vn] = add_camera(f"SheetCam_{vn}", loc, tgt, ortho, lens or 70)
        cams[vn].data.sensor_fit = "VERTICAL"
    paths = {}
    for sheet, (view, frames) in SHEET_FRAMES.items():
        sc.camera = cams[view]
        cells = []
        for item in frames:
            clip, f = item if isinstance(item, tuple) else (sheet, item)
            if set_action(rig, clip) is None:
                continue
            sc.frame_set(f)
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            cells.append((Image.open(tmp).convert("RGB").copy(), f"{clip} {f}"))
        if not cells:
            continue
        W, H = SHEET_CELL
        img = Image.new("RGB", (W * len(cells), H), (20, 22, 22))
        from PIL import ImageDraw
        dr = ImageDraw.Draw(img)
        for i, (c, label) in enumerate(cells):
            img.paste(c, (i * W, 0))
            dr.text((i * W + 6, 6), label, fill=(235, 235, 225))
        path = os.path.join(out_dir, f"agent_{key}_{sheet}.jpg")
        img.save(path, quality=84)
        paths[sheet] = os.path.relpath(path, REPO)
        log("sheet", paths[sheet])
    if os.path.exists(tmp):
        os.remove(tmp)
    set_action(rig, "idle")
    return paths


def review_scene(res=None):
    sc = reset_scene()
    setup_render(sc, res=600, samples=24)
    sc.render.film_transparent = False
    device = use_gpu(sc)
    env = new_collection("ReviewEnv")
    add_lights(env)
    add_ground_and_ruler(env, radius=6.0, ruler_xy=None)
    sc.render.fps = agent_anim.FPS
    return sc, device


def stage_anim(keys):
    """Fast iteration: runtime mesh with part colours, rig, clips, raw glb, sheets."""
    report = {}
    for key in keys:
        sc, device = review_scene()
        work = new_collection("Work")
        ag = build_agent(key, work)
        cap = agent_rig.capture(ag)
        rt = join(list(ag.parts), f"agent_{key}")
        triangulate_ngons(rt)
        # per-part shading from Agent.add: flat costume facets, smooth face
        pm = preview_material()
        rt.data.materials.clear()
        rt.data.materials.append(pm)
        rig = agent_rig.build_armature(work)
        st = {"tris": mesh_tris(rt), "skin": agent_rig.skin(rt, cap, rig, key, log=log)}
        t = time.time()
        st["clips"], _ = agent_anim.bake_clips(rig, key, log=log)
        st["bake_s"] = round(time.time() - t, 1)
        st["walk_foot_check"] = agent_anim.foot_slip(agent_anim.Solver(rig), key)
        export_rigged(rig, rt, [], key, os.path.join(RAW_DIR, f"anim_{key}.glb"))
        st["sheets"] = render_sheets(sc, rig, key, os.path.join(RAW_DIR, "sheets"))
        report[key] = st
        log(key, json.dumps({k: v for k, v in st.items() if k != "skin"}))
        with open(os.path.join(RAW_DIR, f"anim_{key}.json"), "w") as fh:
            json.dump(st, fh, indent=1)
    return report


def stage_sheets(keys):
    """Final QA: contact sheets from the shipped (raw, pre-KTX2) rigged glbs."""
    stats = load_stats()
    for key in keys:
        sc, device = review_scene()
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(RAW_DIR, f"agent_{key}.glb"))
        new = [o for o in bpy.data.objects if o not in before]
        rig = next(o for o in new if o.type == "ARMATURE")
        for o in new:
            if o.name.endswith("_col"):
                o.hide_render = True
        out = os.path.join(REPO, "docs", "art", "qa", f"agent_{key}")
        paths = render_sheets(sc, rig, key, out)
        stats.setdefault("agents", {}).setdefault(key, {})["qa_sheets"] = paths
        stats["agents"][key]["qa_device"] = device
        save_stats(stats)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "preview"
    keys = argv[1:] or [k for k, _, _ in CLANS]
    {"preview": stage_preview, "build": stage_build, "render": stage_render,
     "anim": stage_anim, "sheets": stage_sheets,
     "all": lambda ks: (stage_build(ks), stage_render(ks))}[stage](keys)