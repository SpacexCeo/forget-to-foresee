"""A Tripo character with a Mixamo rig into a townsfolk model: helpers out, clips out, scaled to its height (14.11).
  blender -b --python art/townsfolk/tripo_person.py -- --src <tripo .glb> --out <model.glb> --height 1.9 [--rename art/townsfolk/tripo_to_agent.json]
The clips go into a separate side-car made by art/heroes/retarget_pack.py (the game loads it as the character's baked
clips: play/anim-library.js BAKED_CLIPS), so the model file carries the mesh and the skeleton only. The importer's
helper objects (a cube and a sphere Tripo leaves in the file) are dropped; the whole character is scaled about its feet
to `--height` metres and the scale is applied to the skeleton. Prints REPORT with the height and the bone count."""
import bpy, json, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]; A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv), 2)}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['src'])
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
body = [o for o in bpy.data.objects if o.type == 'MESH' and (o.parent is arm or o.find_armature() is arm)]
for o in list(bpy.data.objects):
    if o is not arm and o not in body: bpy.data.objects.remove(o, do_unlink=True)
if arm.animation_data:
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
# --rename <json>: bone names to the town's shared agent rig (pelvis, thigh_L ...), so the shared clips retarget onto
# the body at load like on every townsperson (play/anim-library.js townsfolkClips); Blender renames the vertex groups too
if 'rename' in A:
    for old, new in json.load(open(A['rename'])).items():
        if not old.startswith('_') and old in arm.data.bones: arm.data.bones[old].name = new
bpy.context.view_layer.update()
# Facing (owner 14.11: the boy and the Sweeper ran sideways): some Tripo GLBs come facing +X. The town's bodies face
# forward (Blender -Y, glTF +Z): the foot-to-toe direction of both feet tells, and the whole character (skeleton and
# its skinned meshes) is turned about the vertical so it points forward, before the scale and the turn are applied.
def bone(*names):
    for n in names:
        if n in arm.data.bones: return arm.data.bones[n]
    return next((b for b in arm.data.bones if b.name.endswith(names[-1])), None)
pairs = [(bone('foot_L', 'L_Foot', 'mixamorig:LeftFoot', 'LeftFoot'), bone('toe_L', 'L_ToeBase', 'mixamorig:LeftToeBase', 'LeftToeBase')),
         (bone('foot_R', 'R_Foot', 'mixamorig:RightFoot', 'RightFoot'), bone('toe_R', 'R_ToeBase', 'mixamorig:RightToeBase', 'RightToeBase'))]
yaw = 0.0
ds = [(arm.matrix_world @ t.head_local) - (arm.matrix_world @ f.head_local) for f, t in pairs if f and t]
if ds:
    d = sum(ds, Vector())  # both feet: their toe-out cancels
    yaw = math.atan2(d.x, -d.y)  # 0 when the toes point to -Y
    if abs(yaw) > math.radians(20):
        arm.rotation_mode = 'XYZ'; arm.rotation_euler.z -= yaw
        bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in body for v in o.data.vertices]
h = max(p.z for p in pts) - min(p.z for p in pts); k = float(A.get('height', 1.9)) / h
arm.scale = [s * k for s in arm.scale]; arm.location = arm.location * k
bpy.ops.object.select_all(action='DESELECT')
for o in [arm] + body: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in body for v in o.data.vertices]
kw = dict(filepath=A['out'], export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_skins=True, export_apply=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{x: v for x, v in kw.items() if x in props})
print('REPORT', json.dumps(dict(step='tripo_person', height_m=round(max(p.z for p in pts) - min(p.z for p in pts), 3), lowest_z=round(min(p.z for p in pts), 3),
                                scale=round(k, 4), turned_deg=round(math.degrees(yaw), 1), bones=len(arm.data.bones), tris=sum(len(o.data.loop_triangles) or sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in body))))
