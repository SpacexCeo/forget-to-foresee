"""QA renders of an agent glb: face close-up, full body, isometric game view (Cycles).

    blender -b -P art/agents/iris_hero/qa_render.py -- <in.glb> <out_prefix> [clip] [frame]
"""
import math
import os
import sys

import bpy
from mathutils import Vector as V

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
clip = argv[2] if len(argv) > 2 else "idle"
frame = int(argv[3]) if len(argv) > 3 else 0

bpy.ops.wm.read_factory_settings(use_empty=True)
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
sc.cycles.samples = int(os.environ.get("QA_SAMPLES", "96"))      # 24-32 for a CPU check
sc.cycles.transparent_max_bounces = 128
sc.cycles.max_bounces = 16
sc.cycles.use_denoising = True
sc.view_settings.view_transform = "AgX"
sc.render.resolution_x = sc.render.resolution_y = int(os.environ.get("QA_RES", "1200"))
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.45, 0.5, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.data.objects:
    if o.name.endswith("_col"):
        o.hide_render = True
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
# the importer leaves the first clip as the active action over all NLA tracks: make the chosen clip the
# active action of every animated datablock (rig and shape keys) and mute the tracks, or every render shows idle
act = bpy.data.actions.get(clip)
if act is not None:
    for o in list(bpy.data.objects) + [m.shape_keys for m in bpy.data.meshes if m.shape_keys]:
        ad = o.animation_data
        if not ad:
            continue
        for tr in ad.nla_tracks:
            tr.mute = True
        if ad.action is not None or any(tr.name == clip for tr in ad.nla_tracks):
            ad.action = act
            slots = [sl for sl in getattr(act, "slots", []) if sl.target_id_type == ("OBJECT" if o == arm else "KEY")]
            if slots and hasattr(ad, "action_slot"):
                ad.action_slot = slots[0]
sc.frame_set(frame)
floor = bpy.data.meshes.new("floor")
import bmesh
b = bmesh.new()
bmesh.ops.create_circle(b, cap_ends=True, segments=64, radius=3.0)
b.to_mesh(floor)
fo = bpy.data.objects.new("floor", floor)
sc.collection.objects.link(fo)
fm = bpy.data.materials.new("floor"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.31, 0.30, 1)
floor.materials.append(fm)


def light(name, loc, energy, size, color=(1, 1, 1)):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    L.data.energy, L.data.size, L.data.color = energy, size, color
    L.location = V(loc)
    L.rotation_euler = (V((0, 0, 1.3)) - L.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(L)


light("key", (-1.8, -2.4, 2.8), 520, 1.6, (1.0, 0.93, 0.85))
light("fill", (2.2, -1.6, 1.6), 140, 2.5, (0.8, 0.86, 1.0))
light("rim", (0.8, 2.6, 2.4), 420, 1.2, (0.95, 0.95, 1.0))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam


def shot(path, loc, tgt, lens=50, ortho=None):
    cam.location = V(loc)
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
    cam.rotation_euler = (V(tgt) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if os.environ.get("QA_ONLY") == "deform":                 # a deformation check: one close full-body shot
    shot(out + "_deform.png", (1.1, -2.9, 1.05), (0, 0, 0.88), 45)
    sys.exit(0)
shot(out + "_face.png", (0.30, -0.95, 1.66), (0.0, -0.03, 1.60), 85)
shot(out + "_body.png", (1.5, -4.6, 1.25), (0, 0, 0.88), 42)
d = 12.0
shot(out + "_iso.png", (d * 0.5, -d * 0.7, d * 0.62), (0, 0, 0.9), ortho=2.6)
