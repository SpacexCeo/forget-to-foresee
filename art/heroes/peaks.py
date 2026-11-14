# blender -b --python peaks.py -- <model_with_clips.glb> clip,clip,...  : effector speed peaks (s, m/s) per clip
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
fps = bpy.context.scene.render.fps
names = {b.name: b.name for b in arm.pose.bones}
pick = lambda k: next(n for n in names if n.endswith(k))
eff = {'hand_R': pick('RightHand'), 'hand_L': pick('LeftHand'), 'foot_R': pick('RightFoot'), 'foot_L': pick('LeftFoot')}
arm.animation_data_create()
out = {}
for clip in argv[1].split(','):
    a = next((x for x in bpy.data.actions if x.name.split('|')[-1] == clip or x.name.startswith(clip)), None)
    if not a: out[clip] = 'missing'; continue
    arm.animation_data.action = a
    f0, f1 = map(int, a.frame_range); prev = {}; sp = {k: [] for k in eff}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        for k, b in eff.items():
            p = (arm.matrix_world @ arm.pose.bones[b].head).copy()
            if k in prev: sp[k].append(((f - f0) / fps, (p - prev[k]).length * fps))
            prev[k] = p
    res = {'len_s': round((f1 - f0) / fps, 2)}
    for k, s in sp.items():
        top = sorted(s, key=lambda x: -x[1])
        picks = []
        for t, v in top:
            if all(abs(t - q[0]) > 0.3 for q in picks): picks.append((round(t, 2), round(v, 1)))
            if len(picks) == 3: break
        res[k] = picks
    out[clip] = res
print('REPORT', json.dumps(out))
