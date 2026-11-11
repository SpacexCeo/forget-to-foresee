"""Contact sheet of the chests: each tier closed, mid-burst and open (Cycles GPU), tiled 3 x 3.
    blender -b -P art/loot/qa_chests.py -- <out.jpg> chest_common.glb chest_rare.glb chest_legendary.glb
"""
import math
import os
import sys

import bpy
from mathutils import Vector
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]
tiles = []
for src in SRCS:
    for fr in (0, 16, 36):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        bpy.ops.import_scene.gltf(filepath=src)
        sc.frame_start, sc.frame_end = 0, 40
        for o in bpy.data.objects:      # play the imported clip on every animated node
            ad = o.animation_data
            if ad and not ad.action and ad.nla_tracks:
                ad.action = ad.nla_tracks[0].strips[0].action
        sc.frame_set(fr)
        sc.render.engine = "CYCLES"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
        sc.cycles.samples = 64
        sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y = 640, 480
        sc.view_settings.view_transform = "AgX"
        w = bpy.data.worlds.new("w")
        sc.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.36, 0.34, 1)
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 3.2
        sun.rotation_euler = (math.radians(45), 0, math.radians(-35))
        sc.collection.objects.link(sun)
        bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.location = (0.75, -1.15, 0.75)
        cam.rotation_euler = (Vector((0, 0, 0.18)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 45
        sc.camera = cam
        path = OUT + f".{len(tiles)}.png"
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(path)
sheet = Image.new("RGB", (640 * 3, 480 * (len(tiles) // 3)))
for i, p in enumerate(tiles):
    sheet.paste(Image.open(p).convert("RGB"), ((i % 3) * 640, (i // 3) * 480))
    os.remove(p)
sheet.save(OUT, quality=88)
print("wrote", OUT)
