"""Contact sheet of the companion dragons: one render per dragon and pose (front and side, three clips), tiled.
    blender -b -P art/dragons/qa_dragons.py -- <out.jpg> dragon_nacre.glb dragon_rill.glb dragon_cinder.glb
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]
POSES = [("glide", 10, "front"), ("fly", 3, "front"), ("idle", 22, "side"), ("flip", 9, "side")]
tiles = []
for src in SRCS:
    for clip, frame, view in POSES:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        bpy.ops.import_scene.gltf(filepath=src)
        arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
        act = next(a for a in bpy.data.actions if a.name.startswith(clip))
        arm.animation_data_create()
        arm.animation_data.action = act
        sc.frame_set(frame)
        sc.render.engine = "CYCLES"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
        sc.cycles.samples = 64
        sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y = 600, 450
        sc.view_settings.view_transform = "AgX"
        w = bpy.data.worlds.new("w")
        sc.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.70, 0.74, 0.78, 1)
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 3.0
        sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
        sc.collection.objects.link(sun)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.location = (0, -2.2, 0.35) if view == "front" else (2.0, -0.9, 0.5)
        cam.rotation_euler = (Vector((0, 0, 0.03)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        sc.camera = cam
        path = OUT + f".{len(tiles)}.png"
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(path)
from PIL import Image
cols = len(POSES)
sheet = Image.new("RGB", (600 * cols, 450 * (len(tiles) // cols)))
for i, p in enumerate(tiles):
    sheet.paste(Image.open(p).convert("RGB"), ((i % cols) * 600, (i // cols) * 450))
    os.remove(p)
sheet.save(OUT, quality=88)
print("wrote", OUT)
