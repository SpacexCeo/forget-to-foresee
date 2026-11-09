"""Body shape review: clay renders of the bare body from the back, three-quarter back, side and front,
orthographic, same scale for every build, so two builds can be laid side by side.

    blender -b <iris_body.blend> -P art/agents/iris_hero/qa_body_views.py -- <out_prefix> [res] [samples] [pose]

pose: rest (default) | walk:<frame> | run:<frame> (an agent_anim clip on the rig, for the locomotion check;
needs a build with clips, e.g. iris_hero.blend).
"""
import math
import sys

import bpy
from mathutils import Vector as V

argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
res = int(argv[1]) if len(argv) > 1 else 800
samples = int(argv[2]) if len(argv) > 2 else 48
pose = argv[3] if len(argv) > 3 else "rest"
zoom = len(argv) > 4 and argv[4] == "seat"                 # "seat": a close-up of the hips and seat (0.36..0.70 H)

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
sc.render.film_transparent = True              # alpha = the silhouette (measured by tools; sheets add the grey)
sc.render.resolution_x, sc.render.resolution_y = res, int(res * 1.6)
w = sc.world or bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.63, 0.65, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45

clay = bpy.data.materials.new("clay")
clay.use_nodes = True
bsdf = clay.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.70, 0.56, 0.48, 1)
bsdf.inputs["Roughness"].default_value = 0.6

body = None
for o in sc.objects:
    if o.type == "MESH":
        if o.name == "body":
            body = o
            o.data.materials.clear()
            o.data.materials.append(clay)
            if o.data.shape_keys:
                for kb in o.data.shape_keys.key_blocks:
                    kb.value = 0.0
        else:
            o.hide_render = True

for o in sc.objects:
    if o.type == "ARMATURE":
        if pose == "rest":
            if o.animation_data:
                o.animation_data.action = None
                for tr in o.animation_data.nla_tracks:
                    tr.mute = True
            for pb in o.pose.bones:
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.location = (0, 0, 0)
        else:
            clip, frame = pose.split(":")
            act = bpy.data.actions.get(clip)
            if o.animation_data and o.animation_data.nla_tracks:
                for tr in o.animation_data.nla_tracks:
                    tr.mute = True
            o.animation_data_create().action = act
            sc.frame_set(int(frame))

bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
zmax = max(p.z for p in pts)
mid = V((0.0, 0.0, zmax / 2))


def light(name, energy, rot):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    ld.use_shadow = name == "key"                  # only the high key casts shadows (form), soft, so the arms do not draw dents
    ld.angle = math.radians(12)
    lo = bpy.data.objects.new(name, ld)
    lo.rotation_euler = [math.radians(a) for a in rot]
    sc.collection.objects.link(lo)
    return lo


cam_d = bpy.data.cameras.new("cam")
cam_d.type = "ORTHO"
cam_d.ortho_scale = zmax * (0.40 if zoom else 1.08)
if zoom:
    mid = V((0.0, 0.0, zmax * 0.53))
    sc.render.resolution_y = res
cam = bpy.data.objects.new("cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
key = light("key", 2.6, (50, 0, 0))
rim = light("rim", 1.4, (70, 0, 0))

# the body faces -Y; yaw 0 = camera behind the body (back view)
VIEWS = {"back": 0.0, "back34": 35.0, "side": 90.0, "front": 180.0}
for name, yaw in VIEWS.items():
    a = math.radians(yaw)
    d = V((math.sin(a), math.cos(a), 0.0))                     # from the body towards the camera
    cam.location = mid + d * 6.0
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    key.rotation_euler = (math.radians(38), 0, a + math.radians(55) + math.pi)   # high and to the side: reads convexity
    rim.rotation_euler = (math.radians(70), 0, a + math.radians(-120) + math.pi)
    sc.render.filepath = f"{out}_{name}.png"
    bpy.ops.render.render(write_still=True)
print("qa_body_views done", out)
