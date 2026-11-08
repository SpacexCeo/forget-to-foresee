"""Fast close-up of the runtime face (no bakes): three views of one or more agents' heads with
their vertex colours, for iterating on facial proportions.

    blender -b -P face_preview.py -- <out.jpg> [key ...]

Rows = agents; columns = front, three-quarter, profile. Cycles at low samples (CPU is fine).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_agents as B  # noqa: E402
from agent_geometry import BODY  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
KEYS = argv[1:] or ["iris"]
sc = B.reset_scene()
B.setup_render(sc, res=520, samples=24)
env = B.new_collection("ReviewEnv")
B.add_lights(env)
mat = bpy.data.materials.new("vc"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.55
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 85
sc.render.resolution_x = sc.render.resolution_y = 520
sc.render.image_settings.file_format = "PNG"
sc.render.use_file_extension = False
TMP = os.path.join(os.path.dirname(os.path.abspath(OUT)), "_face_tmp"); os.makedirs(TMP, exist_ok=True)
hc = Vector(BODY["head_c"]) + Vector((0, 0, -0.01))
tiles = []
for key in KEYS:
    col = B.new_collection(f"agent_{key}")
    ag = B.build_agent(key, col)
    for o in ag.parts:
        o.data.materials.clear(); o.data.materials.append(mat)
    for other in bpy.data.collections:
        if other.name.startswith("agent_"):
            other.hide_render = other.name != f"agent_{key}"
    for vi, az in enumerate((0, 35, 90)):
        a = math.radians(az)
        cam.location = hc + Vector((math.sin(a) * 0.62, -math.cos(a) * 0.62, 0.02))
        cam.rotation_euler = (hc - cam.location).to_track_quat("-Z", "Y").to_euler()
        f = os.path.join(TMP, f"face_{key}_{vi}.png")
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        tiles.append(f)
# contact sheet
import numpy as np  # noqa: E402
rows = []
for r in range(len(KEYS)):
    imgs = []
    for c in range(3):
        im = bpy.data.images.load(tiles[r * 3 + c])
        a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)[::-1]
        imgs.append(a)
    rows.append(np.concatenate(imgs, 1))
sheet = np.concatenate(rows, 0)
h, w = sheet.shape[:2]
img = bpy.data.images.new("sheet", w, h)
img.pixels = sheet[::-1].ravel()
img.filepath_raw = OUT; img.file_format = "JPEG"; img.save()
print("FACE_PREVIEW", OUT)
