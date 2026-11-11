"""Face close-ups of the Iris glb under two hard lighting cases (Cycles), to judge the lip and skin tone
without a GPU browser: a warm low sun from the front quarter (the town in the evening) and a backlight with
sky fill (the archipelago against the sun).

    blender -b -P art/agents/iris_hero/qa_lips.py -- <raw agent_iris.glb> <out.jpg> [target sheet png]

With the target sheet given, its neutral panel is pasted beside the two renders.
"""
import math
import os
import sys

import bpy
from mathutils import Vector as V
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
SHEET = argv[2] if len(argv) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = int(os.environ.get("QA_SAMPLES", "24"))
sc.cycles.transparent_max_bounces = 32
sc.render.resolution_x = sc.render.resolution_y = 720
sc.view_settings.view_transform = "Standard"
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]
bpy.ops.import_scene.gltf(filepath=SRC)
for o in bpy.data.objects:
    if o.name.endswith("_col"):
        o.hide_render = True
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.animation_data_clear()
for m in bpy.data.meshes:
    if m.shape_keys:
        m.shape_keys.animation_data_clear()
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 85
tgt = V((0, 0, 1.615))
cam.location = tgt + V((0.22, -1.25, 0.02))
cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.angle = math.radians(2)


def case(name, sun_dir, sun_col, sun_w, sky_col, sky_w, exposure):
    sun.rotation_euler = V(sun_dir).to_track_quat("Z", "Y").to_euler()      # the light travels along -Z of the lamp
    sun.data.color = sun_col
    sun.data.energy = sun_w
    bg.inputs["Color"].default_value = (*sky_col, 1)
    bg.inputs["Strength"].default_value = sky_w
    sc.view_settings.exposure = exposure
    sc.render.filepath = OUT + "." + name + ".png"
    bpy.ops.render.render(write_still=True)
    return Image.open(sc.render.filepath).convert("RGB")


tiles = [case("sun", (0.55, -0.75, 0.30), (1.0, 0.78, 0.55), 3.2, (0.45, 0.55, 0.75), 0.5, 0.0),
         case("back", (-0.35, 0.85, 0.35), (1.0, 0.88, 0.70), 4.5, (0.60, 0.68, 0.80), 0.9, 0.3)]
if SHEET and os.path.exists(SHEET):
    im = Image.open(SHEET).convert("RGB")
    W, H = im.size
    tiles.append(im.crop((int(W * 0.795), int(H * 0.055), int(W * 0.975), int(H * 0.255))).resize((720, 720), Image.LANCZOS))
out = Image.new("RGB", (720 * len(tiles), 720))
for i, t in enumerate(tiles):
    out.paste(t, (720 * i, 0))
out.save(OUT, quality=88)
for n in ("sun", "back"):
    os.remove(OUT + "." + n + ".png")
print("wrote", OUT)
