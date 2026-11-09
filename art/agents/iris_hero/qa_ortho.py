"""Neutral review renders: orthographic front, side and back in one pose and one scale, soft even
light, light grey background, clay materials (skin light, garments mid grey), clothed and unclothed.

    blender -b <iris_costume.blend | iris_hero.blend> -P art/agents/iris_hero/qa_ortho.py -- <out_prefix> [res] [samples]
"""
import sys

import bpy
from mathutils import Vector as V

argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
res = int(argv[1]) if len(argv) > 1 else 900
samples = int(argv[2]) if len(argv) > 2 else 48
only = argv[3] if len(argv) > 3 else None                 # "jacket": the jacket alone (front, side, three-quarter)
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
sc.cycles.transparent_max_bounces = 64
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x, sc.render.resolution_y = res, int(res * 1.25)
w = sc.world or bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.63, 0.65, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
for o in sc.objects:
    if o.type == "ARMATURE":
        if o.animation_data:
            o.animation_data.action = None
            for tr in o.animation_data.nla_tracks:
                tr.mute = True
        for pb in o.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
    if o.name.endswith("_col") or o.name.startswith(("_", "hair_master")):
        o.hide_render = True


def clay(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


SKIN, CLOTH, DARK = clay("skin", (0.70, 0.56, 0.48)), clay("cloth", (0.32, 0.32, 0.34)), clay("dark", (0.16, 0.16, 0.17))
HAIR = clay("hairclay", (0.22, 0.12, 0.07))
garments = []
for o in sc.objects:
    if o.type != "MESH" or o.hide_render and o.name != "body_review_full":
        continue
    n = o.name
    if n.startswith(("body", "eyeball")):
        mat = SKIN
    elif n.startswith(("hair", )):
        mat = HAIR
    elif n.startswith(("sports_top", "trainers", "hair_tie")):
        mat = DARK
    else:
        mat = CLOTH
        garments.append(o)
    if n.startswith(("sports_top", "trainers", "leggings", "jacket")):
        garments.append(o)
    if True:
        o.data.materials.clear()
        o.data.materials.append(mat)
floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor"))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.05
key = bpy.data.objects.new("key", bpy.data.lights.new("key", "AREA"))
key.data.energy, key.data.size = 90, 4.0
sc.collection.objects.link(key)


def shot(name, d):
    cam.location = V((0, 0, 0.93)) + d * 6.0
    cam.rotation_euler = (V((0, 0, 0.93)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    key.location = cam.location * 0.4 + V((0, 0, 2.2))
    key.rotation_euler = (V((0, 0, 1.0)) - key.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{name}.png"
    bpy.ops.render.render(write_still=True)


VIEWS = {"front": V((0, -1, 0)), "side": V((1, 0, 0)), "back": V((0, 1, 0))}
if only:
    for o in sc.objects:
        if o.type == "MESH":
            o.hide_render = not o.name.startswith(only)
    cam.data.ortho_scale = 0.75
    for v, d in {"front": V((0, -1, 0)), "side": V((1, 0, 0)), "q3": V((0.7, -0.7, 0.12)).normalized()}.items():
        cam.location = V((0, 0, 1.30)) + d * 6.0
        cam.rotation_euler = (V((0, 0, 1.30)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        key.location = cam.location * 0.4 + V((0, 0, 2.2))
        key.rotation_euler = (V((0, 0, 1.2)) - key.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x = sc.render.resolution_y = res
        sc.render.filepath = f"{out}_{only}_{v}.png"
        bpy.ops.render.render(write_still=True)
    raise SystemExit(0)
full = bpy.data.objects.get("body_review_full")
for label, nude in (("clothed", False), ("body", True)):
    for o in garments:
        o.hide_render = nude
    if full:
        full.hide_render = not nude
        body = bpy.data.objects.get("body")
        if body:
            body.hide_render = nude
    for v, d in VIEWS.items():
        shot(f"{label}_{v}", d)
