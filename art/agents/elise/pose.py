"""Pose tests on the built blend: blender -b elise_build.blend -P pose.py -- <out prefix> <mode>"""
import bpy, sys, math, json
from mathutils import Quaternion, Vector
a = sys.argv[sys.argv.index("--") + 1:]
ao = bpy.data.objects['elise_rig']
def rot(name, axis, deg):
    pb = ao.pose.bones[name]; pb.rotation_mode = 'QUATERNION'
    loc = pb.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    pb.rotation_quaternion = Quaternion(loc, math.radians(deg)) @ pb.rotation_quaternion
def reset():
    for pb in ao.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
POSES = {
 'rest': [],
 'arms_up': [('upperarm_L', (0, 1, 0), -110), ('upperarm_R', (0, 1, 0), 110), ('forearm_L', (1, 0, 0), -40), ('forearm_R', (1, 0, 0), -40)],
 'head_turn': [('neck', (0, 0, 1), 20), ('head', (0, 0, 1), 40), ('head', (1, 0, 0), 10)],
 'stride': [('thigh_L', (1, 0, 0), 32), ('shin_L', (1, 0, 0), -18), ('thigh_R', (1, 0, 0), -22), ('shin_R', (1, 0, 0), -35), ('upperarm_L', (1, 0, 0), -25), ('upperarm_R', (1, 0, 0), 25), ('forearm_L', (1, 0, 0), 25), ('forearm_R', (1, 0, 0), 45)],
 'sit_bend': [('thigh_L', (1, 0, 0), 70), ('shin_L', (1, 0, 0), -80), ('forearm_L', (1, 0, 0), 95), ('forearm_R', (1, 0, 0), 95), ('hand_L', (0, 0, 1), 30)],
}
views = {'rest': [[0, 0, 0.9, 1.9, 0, 0, 0.5]], 'arms_up': [[0, 0, 1.25, 1.5, 0, 0, 0.8], [0, 0, 1.25, 1.5, 180, 0, 0.8]], 'head_turn': [[0, 0, 1.5, 0.7, 0, 0, 0.8], [0, 0, 1.5, 0.7, 180, 0, 0.8]],
         'stride': [[0, 0, 0.9, 1.9, 90, 0, 0.6], [0, 0, 0.9, 1.9, 30, 0, 0.6], [0, 0, 0.9, 1.9, 200, 0, 0.6]], 'sit_bend': [[0, 0, 0.9, 1.9, 60, 0, 0.6], [0, 0, 0.9, 1.9, 90, 0, 0.6]]}
import subprocess, os
i = 0
for name, rs in POSES.items():
    reset()
    for r in rs: rot(*r)
    bpy.context.view_layer.update()
    tmp = a[0] + '_tmp.blend'; bpy.ops.wm.save_as_mainfile(filepath=tmp, copy=True)
    subprocess.run(['blender', '-b', tmp, '-P', os.path.dirname(os.path.abspath(__file__)) + '/shots.py', '--', '%s_%d' % (a[0], i), a[1], json.dumps(views[name])], stdout=subprocess.DEVNULL)
    i += 1
