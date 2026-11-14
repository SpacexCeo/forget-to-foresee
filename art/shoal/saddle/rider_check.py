"""The saddle on the posed dragon, with Iris seated in it: clearance numbers and one render (3D review A.17, A.18, A.35).
  blender -b --python rider_check.py -- --root <saddle work root> --dragon <dragon work root> --iris <iris model with clips .glb>
For the dragon poses idle (wings folded), flap top, flap bottom and bank_l: the smallest distance between a saddle vertex
and a wing vertex (bar: >= 5 cm) and the saddle's gap to the back. Iris is posed seated (thighs forward and apart round
the back, knees bent, feet towards the stirrups, hands on the handles) on the seat. Output: report/rider.json,
renders/rider_{side,front}.jpg."""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *
from animkit import q
from mathutils import Matrix, Vector, Quaternion
from mathutils.kdtree import KDTree

A = args(); ROOT = A['root']; DR = A['dragon']
CFG = json.load(open(os.path.join(os.path.dirname(HERE), 'dragon', 'dragon.json'))); SOCKET = Vector(CFG['saddle']['pos'])
bpy.ops.wm.open_mainfile(filepath=f'{DR}/work/08_clips.blend')
rig = bpy.data.objects['dragon_rig']; dragon = bpy.data.objects['dragon']
with bpy.data.libraries.load(f'{ROOT}/work/saddle.blend') as (src, dst): dst.objects = ['dragon_saddle']
sad = dst.objects[0]; bpy.context.scene.collection.objects.link(sad); sad.parent = None
sad_rest = [v.co.copy() for v in sad.data.vertices]
UPPER = [i for i, v in enumerate(sad_rest) if v.z > -0.42]   # everything but the girths, the leathers and the stirrups (they pass under the wing)
wing_slot = [i for i, m in enumerate(dragon.data.materials) if 'wing' in m.name][0]
wing_v = sorted({v for p in dragon.data.polygons if p.material_index == wing_slot for v in p.vertices})
body_v = sorted({v for p in dragon.data.polygons if p.material_index != wing_slot for v in p.vertices})


def socket_matrix():
    pb = rig.pose.bones['saddle']; return rig.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ Matrix.Translation(SOCKET)


def at(clip, frame):
    rig.animation_data.use_nla = True
    for tr in rig.animation_data.nla_tracks: tr.is_solo = False; tr.mute = tr.name != clip
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
    sad.matrix_world = socket_matrix(); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = dragon.evaluated_get(dg).to_mesh()
    co = [dragon.matrix_world @ me.vertices[i].co for i in range(len(me.vertices))]; dragon.evaluated_get(dg).to_mesh_clear()
    return co


def clearance(co):
    kd = KDTree(len(sad_rest)); M = sad.matrix_world
    for i, v in enumerate(sad_rest): kd.insert(M @ v, i)
    kd.balance()
    wing = min(kd.find(co[i])[2] for i in wing_v)
    kd2 = KDTree(len(UPPER))                                  # the seat, blanket and flaps: what sits on the back
    for j, i in enumerate(UPPER): kd2.insert(M @ sad_rest[i], j)
    kd2.balance(); upper = min(kd2.find(co[i])[2] for i in wing_v)
    return round(wing, 3), round(upper, 3)


fl = rig.animation_data.nla_tracks['flap'].strips[0]; f0, f1 = int(fl.frame_start), int(fl.frame_end)
shots = dict(idle=('idle', 1), flap_top=('flap', f0 + int((f1 - f0) * 0.25)), flap_bottom=('flap', f0 + int((f1 - f0) * 0.75)), bank_l=('bank_l', 20))
rep = {}
for k, (clip, fr) in shots.items():
    co = at(clip, fr); w_all, w_up = clearance(co); rep[k] = dict(clip=clip, frame=fr, seat_blanket_flaps_to_wing_m=w_up, any_part_to_wing_m=w_all)

# ---- Iris, seated, on the idle dragon
at('idle', 1)
bpy.ops.import_scene.gltf(filepath=A['iris'])
iris_rig = max((o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not rig), key=lambda o: len(o.data.bones))
for o in bpy.data.objects:
    if o.type == 'MESH' and ('_col' in o.name or o.name.startswith('Icosphere')): o.hide_render = True   # collision helpers, never drawn
if iris_rig.animation_data: iris_rig.animation_data.action = None
REST = {pb.name: pb.bone.matrix_local.to_3x3().to_quaternion() for pb in iris_rig.pose.bones}
for pb in iris_rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
SPREAD, LIFT, KNEE = float(A.get('spread', 34)), float(A.get('lift', 68)), float(A.get('knee', 78))
POSE = {'thigh_L': q(x=-LIFT) @ q(y=-SPREAD), 'thigh_R': q(x=-LIFT) @ q(y=SPREAD), 'shin_L': q(x=KNEE), 'shin_R': q(x=KNEE),
        'foot_L': q(x=-10), 'foot_R': q(x=-10), 'spine': q(x=6), 'chest': q(x=4), 'head': q(x=-8),
        'upperarm_L': q(x=-38) @ q(y=-14), 'upperarm_R': q(x=-38) @ q(y=14), 'forearm_L': q(x=-48), 'forearm_R': q(x=-48)}
for n, Q in POSE.items():
    if n in iris_rig.pose.bones: iris_rig.pose.bones[n].rotation_quaternion = REST[n].inverted() @ Q @ REST[n]
bpy.context.view_layer.update()
# the hips onto the seat: the midpoint of the two thigh heads a little above the seat's surface over the socket
hips = (iris_rig.matrix_world @ iris_rig.pose.bones['thigh_L'].head + iris_rig.matrix_world @ iris_rig.pose.bones['thigh_R'].head) / 2
seat = sad.matrix_world @ Vector((0, 0.05, 0.0))
iris_rig.location += (seat + Vector((0, 0, float(A.get('sit', 0.2))))) - hips; bpy.context.view_layer.update()
feet = [iris_rig.matrix_world @ iris_rig.pose.bones[f'foot_{s}'].head for s in 'LR']
st_eye = [v for v in (sad.matrix_world @ c for c in sad_rest)]
rep['rider'] = dict(foot_z=[round(f.z, 3) for f in feet], seat_z=round(seat.z, 3), saddle_lowest_z=round(min(v.z for v in st_eye), 3))
ensure(f'{ROOT}/renders')
objs = [dragon, sad] + [o for o in bpy.data.objects if o.type == 'MESH' and (o.find_armature() is iris_rig or o.parent is iris_rig) and not o.hide_render]
VIEW_DIRS['rside'] = (1, 0.15, 0.22); VIEW_DIRS['rfront'] = (0.35, -1, 0.3)
beauty(f'{ROOT}/renders/rider', objs, views=('rside', 'rfront'), res=1000, samples=48, focus=(tuple(seat + Vector((0, 0, 0.3))), 2.4))
report(f'{ROOT}/report/rider.json', dict(step='rider_check', **rep, status='PASS' if min(r['seat_blanket_flaps_to_wing_m'] for k, r in rep.items() if k != 'rider') >= 0.05 else 'CHECK'))
