"""Contact sheet of the four Shells v3 in a row, afternoon light and sky (Cycles, GPU).

    blender -b -P art/shells/qa_shells_v3.py -- <out.jpg> shell_1.glb shell_2.glb shell_3.glb shell_4.glb
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for k, src in enumerate(SRCS):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=src)
    for o in set(bpy.data.objects) - before:
        if o.name.endswith("_col") or "_col." in o.name:
            o.hide_render = True
        if o.parent is None:
            o.location.x += (k - 1.5) * 24.0
            o.location.z += 4.0 * (k % 2)
# a 1.7 m figure for scale in front of Shell I
bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=1.7, location=(-36 + 9, -8, 0.85))
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
sc.cycles.device = "GPU"
sc.cycles.samples = 96
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 2400, 900
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky")
w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes["Background"].inputs[0])
w.node_tree.nodes["Background"].inputs[1].default_value = 0.35
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(55), 0, math.radians(30))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.location = (0, -95, 14)
cam.rotation_euler = (Vector((0, 0, 11)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 38
sc.camera = cam
sc.render.filepath = OUT
sc.render.image_settings.file_format = "JPEG"
bpy.ops.render.render(write_still=True)
print("wrote", OUT)
