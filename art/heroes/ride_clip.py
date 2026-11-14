"""The rider's `ride` clip: the pack's seated loop (`sit`, a chair) turned into astride on the dragon's saddle.
  blender -b --python art/heroes/ride_clip.py -- --model <model with the pack clips.glb> --out <ride side-car.glb>
      [--from sit] [--spread 30] [--drop 40] [--shin 10]
Every frame of the seated loop, each thigh is turned outward by --spread degrees (round the body's forward axis) and
down by --drop degrees (round its side axis), the shins a little back by --shin: the knees go round the dragon's
body, the feet hang at its flanks. Exported as a side-car (the skeleton and this one clip, every bone keyed on every
frame). Writes <out>.json with the extras the game reads: loop, speed 0, and `pelvis` (the hip joint in the model's
space, glTF axes: x, y up, z forward, mean over the loop) so the game can put the hips on the saddle socket."""
import bpy, sys, json, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]; A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv), 2)}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['model'])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
for o in list(bpy.data.objects):
    if o is not arm: bpy.data.objects.remove(o, do_unlink=True)
src = next(a for a in bpy.data.actions if a.name.split('|')[-1] == A.get('from', 'sit') or a.name.startswith(A.get('from', 'sit')))
src_name = src.name.split('|')[-1]
spread, drop, shin = (math.radians(float(A.get(k, d))) for k, d in (('spread', 30), ('drop', 40), ('shin', 10)))

def find(*keys):
    for k in keys:
        for b in arm.pose.bones:
            if b.name.lower().endswith(k.lower()): return b
    return None
hips = find('hips', 'hip', 'pelvis')
legs = {s: (find(*t), find(*c)) for s, t, c in (('L', ('LeftUpLeg', 'L_Thigh', 'thigh_L'), ('LeftLeg', 'L_Calf', 'shin_L')),
                                                 ('R', ('RightUpLeg', 'R_Thigh', 'thigh_R'), ('RightLeg', 'R_Calf', 'shin_R')))}
assert hips and all(t and c for t, c in legs.values()), 'hips or legs not found'
arm.animation_data_create(); arm.animation_data.action = src
f0, f1 = map(int, src.frame_range)
# the body's axes (armature space) from the rest pose: up +Z, forward from the hips' facing (the model faces -Y after import)
fwd, up = Vector((0, -1, 0)), Vector((0, 0, 1)); side = fwd.cross(up)
frames = {}
for f in range(f0, f1 + 1):
    bpy.context.scene.frame_set(f)
    frames[f] = {b.name: b.matrix.copy() for b in arm.pose.bones}
ride = bpy.data.actions.new('ride'); arm.animation_data.action = ride
pel = Vector()
for f in range(f0, f1 + 1):
    for b in arm.pose.bones: b.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    for b in sorted(arm.pose.bones, key=lambda x: len(x.parent_recursive)):  # parents first: the pose in armature space
        b.matrix = frames[f][b.name]; bpy.context.view_layer.update()
    for s, (th, sh) in legs.items():
        sign = 1 if s == 'L' else -1
        M = th.matrix.copy(); head = M.translation.copy()
        R = Matrix.Rotation(sign * spread, 4, fwd) @ Matrix.Rotation(-drop, 4, side)  # outward, then down (knees lower)
        th.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M; bpy.context.view_layer.update()
        S = sh.matrix.copy(); h2 = S.translation.copy()
        sh.matrix = Matrix.Translation(h2) @ Matrix.Rotation(-shin, 4, side) @ Matrix.Translation(-h2) @ S; bpy.context.view_layer.update()
    for b in arm.pose.bones:
        b.keyframe_insert('location', frame=f); b.keyframe_insert('rotation_quaternion', frame=f); b.keyframe_insert('scale', frame=f)
    p = arm.matrix_world @ hips.head; pel += Vector((p.x, p.z, -p.y))  # glTF axes
pel /= (f1 - f0 + 1)
for a in list(bpy.data.actions):
    if a is not ride: bpy.data.actions.remove(a)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
kw = dict(filepath=A['out'], export_format='GLB', use_selection=True, export_animations=True, export_skins=True, export_yup=True,
          export_force_sampling=True, export_optimize_animation_size=False, export_optimize_animation_keep_anim_armature=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
extras = {'loop': True, 'speed': 0, 'take': 'tripo_pack:' + src_name + ' astride', 'pelvis': [round(x, 3) for x in pel]}
json.dump(extras, open(A['out'] + '.json', 'w'))
print('REPORT', json.dumps({'step': 'ride_clip', 'frames': f1 - f0 + 1, **extras}))
