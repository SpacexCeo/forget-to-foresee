"""Hair QA renders from a build .blend: front, three-quarter left and right, profile, back, hairline
close-up and strand close-up, for the master groom or the game cards.

    blender -b <iris_hero.blend> -P art/agents/iris_hero/qa_hair.py -- <out_prefix> master|game [res] [samples] [views]
"""
import sys

import bpy
from mathutils import Vector as V

argv = sys.argv[sys.argv.index("--") + 1:]
out, which = argv[0], argv[1]
res = int(argv[2]) if len(argv) > 2 else 1000
samples = int(argv[3]) if len(argv) > 3 else 128
views = argv[4].split(",") if len(argv) > 4 else None

sc = bpy.context.scene
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles_curves.shape = "THICK"
sc.view_settings.view_transform = "AgX"
sc.render.resolution_x = sc.render.resolution_y = res
sc.render.film_transparent = False
w = sc.world or bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.18, 0.19, 0.21, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
sc.frame_set(0)
for o in sc.objects:
    if o.type == "ARMATURE" and o.animation_data:
        o.animation_data.action = None
        for tr in o.animation_data.nla_tracks:
            tr.mute = True
    if o.name.endswith("_col") or o.name.startswith(("_", "hair_master_guides")):
        o.hide_render = True
for o in sc.objects:
    if o.name == "hair_master":
        o.hide_render = which != "master"
    if o.name == "hair":
        o.hide_render = which != "game"
for o in sc.objects:
    if o.name == "hair_cap" and not o.data.materials:
        m = bpy.data.materials.new("cap")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.023, 0.012, 1)
        o.data.materials.append(m)
    if o.type == "MESH" and not o.data.materials and not o.hide_render:
        m = bpy.data.materials.new("clay_" + o.name)
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.48, 0.47, 1)
        o.data.materials.append(m)


def light(name, loc, energy, size, color):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    L.data.energy, L.data.size, L.data.color = energy, size, color
    L.location = V(loc)
    L.rotation_euler = (V((0, 0, 1.6)) - L.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(L)


light("key", (-1.4, -1.8, 2.4), 260, 1.4, (1.0, 0.92, 0.82))        # warm key
light("fill", (1.8, -1.2, 1.7), 70, 2.0, (0.80, 0.87, 1.0))          # soft daylight fill
light("rim", (0.6, 1.8, 2.2), 260, 1.0, (1.0, 0.95, 0.9))
cam = bpy.data.objects.new("qa_cam", bpy.data.cameras.new("qa_cam"))
sc.collection.objects.link(cam)
sc.camera = cam
H = V((0, -0.01, 1.60))
SHOTS = {
    "front": ((0.0, -0.95, 1.63), H, 70),
    "q3_left": ((0.62, -0.72, 1.66), H, 70),
    "q3_right": ((-0.62, -0.72, 1.66), H, 70),
    "profile": ((0.95, -0.02, 1.63), H, 70),
    "back": ((0.05, 0.95, 1.68), H + V((0, 0.02, -0.04)), 70),
    "hairline": ((0.10, -0.42, 1.74), V((0.01, -0.06, 1.70)), 85),
    "strands": ((0.32, -0.30, 1.56), V((0.10, -0.02, 1.52)), 100),
}
for name, (loc, tgt, lens) in SHOTS.items():
    if views and name not in views:
        continue
    cam.location = V(loc)
    cam.data.lens = lens
    cam.rotation_euler = (V(tgt) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{which}_{name}.png"
    bpy.ops.render.render(write_still=True)
