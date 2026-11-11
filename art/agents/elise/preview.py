"""Clay or textured turnaround of a glb: blender -b -P preview.py -- <in.glb> <out.png> [res]"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
sc = bpy.context.scene
ms = [o for o in sc.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2; h = (hi - lo).z
for o in ms:
    for p in o.data.polygons:
        p.use_smooth = True
sc.render.engine = "CYCLES"; sc.cycles.samples = 48
try:
    pr = bpy.context.preferences.addons["cycles"].preferences; pr.compute_device_type = "OPTIX"; pr.get_devices()
    for d in pr.devices:
        d.use = True
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.8, 0.82, 1); sc.world = w
piv = bpy.data.objects.new("p", None); sc.collection.objects.link(piv); piv.location = c
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = h * 1.06; cam.location = (0, -6 * max(h, 1), 0); cam.rotation_euler = (math.pi / 2, 0, 0); cam.parent = piv
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun)
sun.data.energy = 2.5; sun.rotation_euler = (math.radians(55), 0, math.radians(-30)); sun.parent = piv
sc.camera = cam
res = int(a[2]) if len(a) > 2 else 900
sc.render.resolution_x, sc.render.resolution_y = res // 2, res
for i, az in enumerate((0, 90, 180, 315)):
    piv.rotation_euler = (0, 0, math.radians(az))
    sc.render.filepath = a[1].replace(".png", f"_{i}.png"); bpy.ops.render.render(write_still=True)
