"""Deformation test of the bare body (owner anatomy brief 09.11: idle, walk, run, hip flexion, knee lift,
crouch, turn). Opens the body-stage build (body + agent rig, no clothing hides anything), appends the game
clips from a full build and adds static test poses, then renders clay frames.

    blender -b <iris_body.blend> -P art/agents/iris_hero/qa_deform.py -- <out_dir> <iris_hero.blend> [res] [samples]

Writes <out_dir>/<pose>_<view>.png for the static poses and <out_dir>/<clip>_<view>_<frame>.png for walk/run.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector as V

argv = sys.argv[sys.argv.index("--") + 1:]
out, hero = argv[0], argv[1]
res = int(argv[2]) if len(argv) > 2 else 520
samples = int(argv[3]) if len(argv) > 3 else 16
os.makedirs(out, exist_ok=True)

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
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x, sc.render.resolution_y = res, int(res * 1.4)
w = sc.world or bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.63, 0.65, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
clay = bpy.data.materials.new("clay")
clay.use_nodes = True
clay.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.70, 0.56, 0.48, 1)
clay.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6

body = bpy.data.objects["body"]
rig = next(o for o in sc.objects if o.type == "ARMATURE")
for o in sc.objects:
    if o.type == "MESH":
        o.data.materials.clear()
        o.data.materials.append(clay)
        if o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks:
                kb.value = 0.0

with bpy.data.libraries.load(hero, link=False) as (src, dst):
    dst.actions = [a for a in src.actions if a in ("idle", "walk", "run")]

H = max(v.co.z for v in body.data.vertices)
cam_d = bpy.data.cameras.new("cam")
cam_d.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
ld = bpy.data.lights.new("key", "SUN")
ld.energy = 2.6
ld.angle = math.radians(12)
key = bpy.data.objects.new("key", ld)
sc.collection.objects.link(key)
fd = bpy.data.lights.new("fill", "SUN")
fd.energy = 1.2
fd.use_shadow = False
fill = bpy.data.objects.new("fill", fd)
sc.collection.objects.link(fill)
VIEWS = {"side": 90.0, "back34": 45.0, "back": 0.0}


def shoot(name, views=VIEWS, zc=0.50, scale=0.62):
    bpy.context.view_layer.update()
    for vname, yaw in views.items():
        a = math.radians(yaw)
        d = V((math.sin(a), math.cos(a), 0.0))
        cam_d.ortho_scale = H * scale
        cam.location = V((0, 0, H * zc)) + d * 6.0
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        key.rotation_euler = (math.radians(40), 0, a + math.radians(50) + math.pi)
        fill.rotation_euler = (math.radians(70), 0, a - math.radians(60) + math.pi)
        sc.render.filepath = os.path.join(out, f"{name}_{vname}.png")
        bpy.ops.render.render(write_still=True)


def reset_pose():
    if rig.animation_data:
        rig.animation_data.action = None
        for tr in rig.animation_data.nla_tracks:
            tr.mute = True
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def rot(n, deg, axis="X"):
    """Rotate pose bone n about the world axis through its head (negative X = the part below swings forward)."""
    pb = rig.pose.bones[n]
    bpy.context.view_layer.update()
    M = pb.matrix.copy()
    t = M.translation.copy()
    pb.matrix = Matrix.Translation(t) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-t) @ M
    bpy.context.view_layer.update()


POSES = {                                                                    # the body faces -Y: negative X = forward
    "hip_flex": [("thigh_L", -60.0, "X")],                                   # straight leg forward 60 deg
    "knee_lift": [("thigh_L", -95.0, "X"), ("shin_L", 110.0, "X")],          # knee up to the hip
    "crouch": [("thigh_L", -100.0, "X"), ("thigh_R", -100.0, "X"), ("shin_L", 125.0, "X"), ("shin_R", 125.0, "X"),
               ("spine", 25.0, "X")],
    "turn": [("spine", 25.0, "Z"), ("chest", 15.0, "Z")],
}
reset_pose()
shoot("rest")
for name, ops in POSES.items():
    reset_pose()
    for n, deg, ax in ops:
        if n in rig.pose.bones:
            rot(n, deg, ax)
    shoot(name)

# the game clips, a few frames each (side and three-quarter back)
for clip, frames in (("walk", (0, 6, 12, 18)), ("run", (0, 5, 10, 15))):
    act = bpy.data.actions.get(clip)
    if act is None:
        print("missing clip", clip)
        continue
    reset_pose()
    rig.animation_data_create().action = act
    for f in frames:
        sc.frame_set(f)
        shoot(f"{clip}_{f:02d}", {"side": 90.0, "back34": 45.0})
print("qa_deform done", out)
