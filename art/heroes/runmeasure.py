# blender -b --python runmeasure.py -- <pack with root motion.glb> <in-place model with clips.glb> clip t0 t1 scale
# The window's ground speed (hips travel in the pack x scale) and each foot's landing as a fraction of the window
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
pack, model, clip, t0, t1, k = argv[0], argv[1], argv[2], float(argv[3]), float(argv[4]), float(argv[5])
def load(p):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=p)
    arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
    a = next(x for x in bpy.data.actions if x.name.split('|')[-1].split('.')[0] == clip or x.name.startswith(clip))
    arm.animation_data_create(); arm.animation_data.action = a
    return arm, bpy.context.scene.render.fps
arm, fps = load(pack)
hip = next(b for b in arm.pose.bones if b.name.lower().endswith(('hip', 'hips', 'pelvis')))  # Hip (Tripo) or mixamorig:Hips
def at(t): bpy.context.scene.frame_set(int(round(t * fps))); return (arm.matrix_world @ hip.head).copy()
p0, p1 = at(t0), at(t1)
travel = ((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2) ** 0.5 * k
arm, fps = load(model)
feet = {s: next(b for b in arm.pose.bones if any(b.name.endswith(x) for x in n)) for s, n in (('L', ('L_Foot', 'LeftFoot', 'foot_L')), ('R', ('R_Foot', 'RightFoot', 'foot_R')))}
f0, f1 = int(round(t0 * fps)), int(round(t1 * fps)); H = {s: [] for s in feet}
for f in range(f0, f1 + 1):
    bpy.context.scene.frame_set(f)
    for s, b in feet.items(): H[s].append((arm.matrix_world @ b.head).z)
land = {}
for s, h in H.items():
    lo = min(h); thr = lo + 0.25 * (max(h) - lo)
    n = len(h) - 1
    # landing: the first frame the foot comes down under the threshold after being above it (wrapping the loop)
    for i in range(n):
        if h[i - 1] > thr >= h[i]: land[s] = round(i / n, 3); break
    land.setdefault(s, round(h.index(lo) / n, 3))
print('REPORT', json.dumps({'clip': clip, 'window': [t0, t1], 'travel_m': round(travel, 3), 'speed': round(travel / (t1 - t0), 3), 'land': land}))
