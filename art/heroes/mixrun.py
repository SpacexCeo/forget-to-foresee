# blender -b --python mixrun.py -- <model with the pack clips.glb> <out.glb>
# Five run variants for the owner to pick from (arms differ): one stride each, 24 fps keys, exported with the model.
#   runA  flee_01 as it is (the shipped run)            runB  the pack run (sprint, pumping arms)
#   runC  flee_01 legs + the pack run's arms            runD  flee_01 legs + the walk's arms (relaxed swing)
#   runE  flee_01 legs + half run arms, half walk arms
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
fps = bpy.context.scene.render.fps
act = lambda n: next(a for a in bpy.data.actions if a.name.split('|')[-1] == n)
# windows (s) and the left foot's landing phase in each (art/heroes/runmeasure.py)
W = {'flee_01': (1.25, 1.9583, 0.529), 'run': (0.4167, 1.0417, 0.667), 'walk': (0.0, 1.2083, 0.586)}
ARM = ('Clavicle', 'Upperarm', 'Forearm', 'Elbow', 'Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky')
arms = [b for b in arm.pose.bones if b.name[:2] in ('L_', 'R_') and any(k in b.name for k in ARM)]
arm.animation_data_create()
def sample(name, phase):
    s0, s1, _ = W[name]; t = s0 + (phase % 1) * (s1 - s0); f = t * fps
    arm.animation_data.action = act(name); bpy.context.scene.frame_set(int(f), subframe=f - int(f))
    return {b.name: (b.location.copy(), b.rotation_quaternion.copy()) for b in arm.pose.bones}
def build(out, legs, arms_from):
    s0, s1, lland = W[legs]; n = int(round((s1 - s0) * fps))
    keys = []
    for i in range(n + 1):
        p = i / n; base = sample(legs, p)
        mix = [(sample(src, p + W[src][2] - lland), w) for src, w in arms_from]
        keys.append((base, mix))
    a = bpy.data.actions.new(out); arm.animation_data.action = a
    for i, (base, mix) in enumerate(keys):
        for b in arm.pose.bones:
            loc, q = base[b.name]
            if b in arms and mix:
                q = mix[0][0][b.name][1].copy()
                if len(mix) > 1: q = q.slerp(mix[1][0][b.name][1], mix[1][1])
            b.location = loc; b.rotation_quaternion = q
            b.keyframe_insert('location', frame=i); b.keyframe_insert('rotation_quaternion', frame=i)
    return a
build('runA', 'flee_01', [])
build('runB', 'run', [])
build('runC', 'flee_01', [('run', 1)])
build('runD', 'flee_01', [('walk', 1)])
build('runE', 'flee_01', [('run', 1), ('walk', 0.5)])
keep = {'runA', 'runB', 'runC', 'runD', 'runE'}
for a in list(bpy.data.actions):
    if a.name not in keep: bpy.data.actions.remove(a)
for a in bpy.data.actions: a.use_fake_user = True
arm.animation_data.action = None
kw = dict(filepath=argv[1], export_format='GLB', export_animations=True, export_skins=True, export_yup=True, export_force_sampling=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
print('REPORT built', sorted(keep))
