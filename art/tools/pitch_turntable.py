"""Pitch turntable renders of shipped models from their UNCOMPRESSED glbs (Blender cannot decode
KTX2 / meshopt, so renders from the compressed game files lose their materials and come out white).

    blender -b -P pitch_turntable.py -- <raw glb> <out dir> <name> [frames=8] [size=1920]

Cycles on the GPU, golden-hour key light against a cool sky (style addendum 07.11), a soft ground
disc, the camera framed on the model's bounds. Characters play their idle clip at frame 1.
Outputs <out>/<name>_<k>.jpg (k = 0..frames-1, an even turn around the model).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT, NAME = argv[0], argv[1], argv[2]
FRAMES = int(argv[3]) if len(argv) > 3 else 8
SIZE = int(argv[4]) if len(argv) > 4 else 1920
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30
bpy.ops.import_scene.gltf(filepath=GLB)
for o in list(sc.objects):
    # collision proxies, sockets, the _inspect LOD and the importer's bone-shape Icosphere
    if o.name.endswith("_col") or o.name.startswith("socket_") or "_inspect" in o.name or o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = next((o for o in sc.objects if o.type == "ARMATURE"), None)
if arm:
    idle = next((a for a in bpy.data.actions if a.name.split("|")[-1] == "idle"), None)
    if idle:
        arm.animation_data_create(); arm.animation_data.action = idle
sc.frame_set(1)

# bounds of the visible meshes
dg = bpy.context.evaluated_depsgraph_get()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in sc.objects:
    if o.type != "MESH":
        continue
    oe = o.evaluated_get(dg)
    me = oe.to_mesh()          # deformed vertices (skinned characters pose at frame 1)
    for v in me.vertices:
        w = oe.matrix_world @ v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    oe.to_mesh_clear()
ctr = (lo + hi) / 2
ext = hi - lo
radius = max(ext.x, ext.y, ext.z * 0.75) * 0.5

# ground, sky, light
R = radius * 60
gme = bpy.data.meshes.new("ground")
gme.from_pydata([(ctr.x + R * math.cos(t * math.tau / 96), ctr.y + R * math.sin(t * math.tau / 96), lo.z) for t in range(96)], [], [list(range(96))])
gnd = bpy.data.objects.new("ground", gme); sc.collection.objects.link(gnd)
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gb = gm.node_tree.nodes["Principled BSDF"]; gb.inputs["Base Color"].default_value = (0.09, 0.085, 0.08, 1); gb.inputs["Roughness"].default_value = 0.85
gnd.data.materials.append(gm)
world = bpy.data.worlds.new("sky"); sc.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes["Background"]
sky = nt.nodes.new("ShaderNodeTexSky")
try:
    sky.sky_type = "NISHITA"; sky.sun_elevation = math.radians(14); sky.sun_rotation = math.radians(225)
    sky.air_density = 1.4; sky.dust_density = 2.0
except Exception:
    pass
nt.links.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.25
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.color = (1.0, 0.82, 0.6); sun.data.angle = math.radians(2.5)
sun.rotation_euler = (math.radians(68), 0, math.radians(225))
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN")); sc.collection.objects.link(fill)
fill.data.energy = 0.8; fill.data.color = (0.62, 0.74, 1.0); fill.rotation_euler = (math.radians(55), 0, math.radians(45))

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
vfov = 2 * math.atan(36 * 9 / 16 / 2 / 50); hfov = 2 * math.atan(36 / 2 / 50)
dist = max(ext.z / 2 / math.tan(vfov / 2), max(ext.x, ext.y) / 2 / math.tan(hfov / 2)) * 1.12
pitch = math.radians(12)

sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == kind
            sc.cycles.device = "GPU"; break
    except Exception:
        pass
sc.cycles.samples = 256; sc.cycles.use_denoising = True
sc.render.resolution_x = SIZE; sc.render.resolution_y = SIZE * 9 // 16
sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"
for k in range(FRAMES):
    a = math.radians(25) + 2 * math.pi * k / FRAMES     # frame 0: front three-quarter (front = -Y)
    cam.location = ctr + Vector((math.sin(a) * math.cos(pitch), -math.cos(a) * math.cos(pitch), math.sin(pitch))) * dist
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, f"{NAME}_{k:02d}.jpg")
    bpy.ops.render.render(write_still=True)
print("PITCH_DONE", NAME, FRAMES)
