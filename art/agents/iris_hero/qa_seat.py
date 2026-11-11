"""Back view of the seat under a warm low light from behind (Cycles), for shading seams on the leggings:

    blender -b -P art/agents/iris_hero/qa_seat.py -- <out.jpg> <glb> [<glb> ...]

One tile per glb, side by side (raw or decoded files; Blender cannot read KTX2 / meshopt).
"""
import math
import os
import sys

import bpy
from mathutils import Vector as V
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SRCS = argv[0], argv[1:]
tiles = []
for src in SRCS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = int(os.environ.get("QA_SAMPLES", "48"))
    sc.render.resolution_x = sc.render.resolution_y = 800
    sc.view_settings.view_transform = "Standard"
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.30, 0.22, 0.20, 1)
    bg.inputs["Strength"].default_value = 0.35
    bpy.ops.import_scene.gltf(filepath=src)
    for o in bpy.data.objects:
        if o.name.endswith("_col"):
            o.hide_render = True
        if o.type == "ARMATURE":
            o.animation_data_clear()
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 90
    tgt = V((0, 0.08, 0.99))
    cam.location = tgt + V((0.10, 1.15, 0.22))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sc.collection.objects.link(sun)
    sun.data.angle = math.radians(1.5)
    sun.data.color = (1.0, 0.72, 0.48)
    sun.data.energy = float(os.environ.get("QA_SUN", "6.0"))
    sun.rotation_euler = V((0.25, 0.80, 0.55)).to_track_quat("Z", "Y").to_euler()    # low, from behind her
    sc.view_settings.exposure = float(os.environ.get("QA_EXPOSURE", "1.2"))
    sc.render.filepath = OUT + ".tile.png"
    bpy.ops.render.render(write_still=True)
    tiles.append(Image.open(sc.render.filepath).convert("RGB"))
out = Image.new("RGB", (800 * len(tiles) + 8 * (len(tiles) - 1), 800), (255, 255, 255))
for i, t in enumerate(tiles):
    out.paste(t, (808 * i, 0))
out.save(OUT, quality=88)
os.remove(OUT + ".tile.png")
print("wrote", OUT)
