# blender -b --python loopcut.py -- <model_with_clips.glb> clip : the end frame whose pose is closest to the start (a clean loop)
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
fps = bpy.context.scene.render.fps
a = next(x for x in bpy.data.actions if x.name.split('|')[-1] == argv[1] or x.name.startswith(argv[1]))
arm.animation_data_create(); arm.animation_data.action = a
f0, f1 = map(int, a.frame_range)
body = [b for b in arm.pose.bones if any(k in b.name for k in ('UpLeg', 'Leg', 'Foot', 'Arm', 'Spine', 'Hips'))]
def pose(f):
    bpy.context.scene.frame_set(f); return [b.matrix.to_quaternion() for b in body]
p0 = pose(f0); res = []
for f in range(f0 + int(0.3 * fps), f1 + 1):
    q = pose(f); d = max(min(p0[i].rotation_difference(q[i]).angle, 6.2832 - p0[i].rotation_difference(q[i]).angle) for i in range(len(body)))
    res.append((f, round(d * 57.3, 1)))
best = sorted(res, key=lambda x: x[1])[:4]
print('REPORT', json.dumps({'clip': argv[1], 'fps': fps, 'frames': [f0, f1], 'best_end': [(f, (f - f0) / fps, d) for f, d in best]}))
