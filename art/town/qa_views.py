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
VIEWS = {   # game space: eye, target, lens
    "stair_c_follow": ((0.0, 7.6, -13.0), (0.0, 6.2, -27.0), 28),
    "stair_c_oblique": ((8.5, 7.2, -18.5), (1.0, 6.4, -26.5), 28),
    "wall_foot": ((13.0, 6.3, -21.5), (19.0, 5.0, -30.0), 30),
}
gb = lambda p: Vector((p[0], -p[2], p[1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for src in SRCS:
    bpy.ops.import_scene.gltf(filepath=src)
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
# the glTF importer already sets use_backface_culling on every single-sided material, as three.js renders them
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA" if hasattr(sky, "sky_type") else sky.sky_type
w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes["Background"].inputs[0])
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
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
