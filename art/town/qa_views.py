"""QA frames of exported town pieces at game-camera positions (EEVEE: one-sided faces are culled as in the game,
so floating or back-facing faces show; afternoon sun from the south-west):

    blender -b -P art/town/qa_views.py -- <out_prefix> <glb> [<glb> ...]

Views are game-space (x, y, z) eye and target points; written as <out_prefix>_<view>.jpg.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]
import os
VIEW_SETS = {}
VIEWS = {   # game space: eye, target, lens
    "stair_c_follow": ((0.0, 7.6, -13.0), (0.0, 6.2, -27.0), 28),
    "stair_c_oblique": ((8.5, 7.2, -18.5), (1.0, 6.4, -26.5), 28),
    "wall_foot": ((13.0, 6.3, -21.5), (19.0, 5.0, -30.0), 30),
}
# the lower gate (town-v2 defect 5): from above inside the town, from the passage looking up, from outside
ZS = 34.0
VIEW_SETS["gate"] = {
    "gate_above": ((3.5, 12.0, ZS - 9.0), (0.0, 2.0, ZS + 1.5), 30),
    "gate_above_side": ((-7.0, 10.0, ZS - 4.0), (0.5, 3.0, ZS + 1.5), 28),
    "gate_passage_up": ((0.6, 1.6, ZS - 3.0), (0.0, 6.5, ZS + 2.0), 22),
    "gate_outside": ((2.5, 6.0, ZS + 16.0), (0.0, 4.0, ZS + 2.0), 30),
}
VIEW_SETS["gate_diag"] = {   # steep views over the passage (the owner's camera was high above the town side)
    "gate_steep_n": ((1.0, 16.0, ZS - 6.0), (0.0, 0.0, ZS + 2.0), 30),
    "gate_steep_s": ((1.0, 16.0, ZS + 10.0), (0.0, 0.0, ZS + 1.0), 30),
    "gate_low_s": ((1.5, 3.0, ZS + 9.0), (0.0, 2.0, ZS), 30),
}
# the town sweep: the game camera (about 3.5 m up, 6 m behind Iris) along the route and the lanes
_route = [((0, 0.0, 30.0), 180), ((0, 0.0, 20.0), 180), ((0, 2.5, 8.0), 180), ((-18, 2.5, 6.0), 90), ((18, 2.5, 6.0), -90),
          ((0, 4.5, -6.0), 180), ((-8, 4.5, -18.0), 135), ((8, 4.5, -18.0), -135), ((0, 4.5, -20.0), 180),
          ((0, 9.5, -33.0), 180), ((-30, 2.5, 9.0), 90), ((30, 2.5, 9.0), -90), ((-36, 0.0, 20.0), 45), ((24, 0.0, 22.0), -45),
          ((0, 4.5, -8.0), 0), ((-22, 4.5, -24.0), 120)]
VIEW_SETS["sweep"] = {}
for k, ((x, y, z), hd) in enumerate(_route):
    a = math.radians(hd)
    fx, fz = math.sin(a), math.cos(a)            # heading 0 looks +Z (south), 180 looks north
    VIEW_SETS["sweep"]["sweep_%02d" % k] = ((x - fx * 6.0, y + 3.6, z - fz * 6.0), (x + fx * 8.0, y + 1.2, z + fz * 8.0), 24)
VIEW_SETS["stairs"] = dict(VIEWS)
VIEWS = VIEW_SETS[os.environ.get("QA_VIEWS", "stairs")]
gb = lambda p: Vector((p[0], -p[2], p[1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
# every town piece is stored around its own pivot; the game places it at the position in town-data.js
_here = os.path.dirname(os.path.abspath(__file__))
_data = os.path.join(_here, "..", "..", "game", "src", "scenes", "town-data.js")
POS = {}
if os.path.exists(_data):
    import json as _json, re as _re
    _t = open(_data).read()
    _js = _t[_t.index("{"):_t.rindex("}") + 1]
    try:
        _d = _json.loads(_js)
        for _p in _d.get("pieces", []) + _d.get("interiors", []):
            POS[_p["name"]] = _p["position"]
    except Exception as _e:
        for _m in _re.finditer(r'"name": "(town_[a-z_]+)",\s*"kind": "[a-z_]+",\s*"position": \[\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+)', _t):
            POS[_m.group(1)] = [float(_m.group(2)), float(_m.group(3)), float(_m.group(4))]
for src in SRCS:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=src)
    name = os.path.basename(src)[:-4]
    pos = POS.get(name)
    if pos:
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location += Vector((pos[0], -pos[2], pos[1]))
    print("placed", name, pos)
for o in bpy.data.objects:            # collision meshes are never drawn in the game
    if o.name.endswith("_col") or "_col." in o.name:
        o.hide_render = True
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
# the glTF importer already sets use_backface_culling on every single-sided material, as three.js renders them
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA" if hasattr(sky, "sky_type") else sky.sky_type
if os.environ.get("QA_MAGENTA"):     # holes show as magenta, washed-out faces stay stone-coloured
    w.node_tree.nodes["Background"].inputs[0].default_value = (1.0, 0.0, 1.0, 1.0)
else:
    w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes["Background"].inputs[0])
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.2
sun.data.angle = math.radians(1.5)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))   # light from the south-west onto the south faces
sc.collection.objects.link(sun)
for name, (eye, tgt, lens) in VIEWS.items():
    cam = bpy.data.objects.new("cam_" + name, bpy.data.cameras.new(name))
    sc.collection.objects.link(cam)
    cam.location = gb(eye)
    cam.rotation_euler = (gb(tgt) - gb(eye)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_start = 0.1
    sc.camera = cam
    sc.render.filepath = f"{OUT}_{name}.jpg"
    sc.render.image_settings.file_format = "JPEG"
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath)
