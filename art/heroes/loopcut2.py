# blender -b --python loopcut2.py -- <model_with_clips.glb> clip min_s max_s : the start/end pair with the closest poses
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
fps = bpy.context.scene.render.fps
a = next(x for x in bpy.data.actions if x.name.split('|')[-1] == argv[1] or x.name.startswith(argv[1]))
arm.animation_data_create(); arm.animation_data.action = a
f0, f1 = map(int, a.frame_range)
body = [b for b in arm.pose.bones if any(k in b.name.lower() for k in ('upleg', 'leg', 'thigh', 'calf', 'foot', 'arm', 'spine', 'hip'))]
P = {}
for f in range(f0, f1 + 1):
    bpy.context.scene.frame_set(f); P[f] = [b.matrix.to_quaternion() for b in body]
def d(x, y): return max(min(P[x][i].rotation_difference(P[y][i]).angle, 6.2832 - P[x][i].rotation_difference(P[y][i]).angle) for i in range(len(body))) * 57.3
lo, hi = int(float(argv[2]) * fps), int(float(argv[3]) * fps)
best = sorted(((d(s, e), s, e) for s in range(f0, f1 + 1) for e in range(s + lo, min(f1, s + hi) + 1)))[:3]
print('REPORT', json.dumps([(round(x, 1), s / fps, e / fps) for x, s, e in best]))
