"""The skitter (stone spider mob) from the owner's Tripo model `spider_futuristic.glb` (14.11): a clean rig and the
mob clips, written in code; the file replaces `mob_skitter.glb` (play/mobs.js plays it by these clip names).
  blender -b --python art/mobs/tripo_spider.py -- --src <spider_futuristic.glb> --root <work dir> [--height 0.42] [--tex 1024]
The Tripo rig is irregular (legs of 1, 2 or 3 bones), so it is replaced: a body bone and six legs of three bones
(coxa, femur, tibia) plus a tip, on the joints of the Tripo legs (symmetrised). Weights by rule: the shell (inside an
ellipsoid around the body, the spikes on top included) is rigid on the body; every other vertex goes to the nearest leg
segment of its own side, softened along the edges. The model is scaled to the old skitter's height (art/mobs/mobs.json)
and faces -Y (glTF +Z) like the other mobs, feet on z = 0.
Clips (30 fps, in place): idle 2 s, walk 0.267 s at 0.83 m/s and run 0.167 s at 1.63 m/s (alternating tripods, feet held
by IK), attack 0.8 s (rears, front legs strike down at 0.55 s), hit 0.4 s, death 1.2 s (legs curl, it drops).
Output: work/spider.blend, out/mob_skitter_raw.glb (via export_glb.py), report/spider.json, renders/spider_*.jpg."""
import bpy, bmesh, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'shoal'))
from lib import *
from animkit import *

A = args(); ROOT = A['root']; H = float(A.get('height', 0.42)); TEX = int(A.get('tex', 1024)); FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['src'])
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name.startswith('Icosphere'): bpy.data.objects.remove(o, do_unlink=True)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]; mesh.name = 'mob_skitter'
active(mesh); mesh.parent = None
for md in list(mesh.modifiers): mesh.modifiers.remove(md)
mesh.vertex_groups.clear(); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if mesh.data.shape_keys: mesh.shape_key_clear()
co = coords(mesh)
S0 = H / float(np.ptp(co[:, 2]))                       # to the old skitter's height (spikes included)
co[:, :2] -= co[:, :2].mean(0) * [1, 0]; co *= S0; co[:, 2] -= co[:, 2].min(); set_coords(mesh, co)
for img in bpy.data.images:                             # 4k Tripo maps -> the mob's budget
    if img.size[0] > TEX: img.scale(TEX, TEX)

# ---- the rig on the Tripo joints (metres of the source, scaled), legs symmetrised
LEGS_SRC = {'f': [(0.175, -0.14, 0.32), (0.27, -0.20, 0.355), (0.33, -0.245, 0.18), (0.385, -0.29, 0.0)],
            'm': [(0.20, 0.025, 0.32), (0.345, 0.03, 0.40), (0.44, 0.045, 0.205), (0.535, 0.05, 0.0)],
            'b': [(0.15, 0.23, 0.30), (0.27, 0.30, 0.35), (0.33, 0.34, 0.18), (0.39, 0.39, 0.0)]}
s = S0 * float(A.get('src_scale', 1.0))
P = lambda p, sx=1: Vector((p[0] * sx * s, p[1] * s, p[2] * s))
BONES = [('root', Vector((0, 0, 0)), Vector((0, 0, 0.1 * s)), None, False), ('body', P((0, 0.25, 0.3)), P((0, -0.35, 0.3)), 'root', True)]
for k, pts in LEGS_SRC.items():
    for side, sx in (('L', 1), ('R', -1)):
        n = f'leg_{k}_{side}'
        BONES += [(n + '_coxa', P(pts[0], sx), P(pts[1], sx), 'body', True), (n + '_femur', P(pts[1], sx), P(pts[2], sx), n + '_coxa', True),
                  (n + '_tibia', P(pts[2], sx), P(pts[3], sx), n + '_femur', True), (n + '_tip', P(pts[3], sx), P(pts[3], sx) + Vector((0, 0, 0.05 * s)), n + '_tibia', False)]
ad = bpy.data.armatures.new('skitter_rig'); rig = bpy.data.objects.new('skitter_rig', ad); bpy.context.scene.collection.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, par, deform in BONES:
    b = ad.edit_bones.new(name); b.head = h; b.tail = t; b.roll = 0; b.use_deform = deform
    if par: b.parent = ad.edit_bones[par]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# ---- weights by rule
co = coords(mesh); names = [b[0] for b in BONES if b[4]]; col = {n: i for i, n in enumerate(names)}
x, y, z = co[:, 0], co[:, 1], co[:, 2]
ell = (x / (0.255 * s)) ** 2 + (y / (0.50 * s)) ** 2 + ((z - 0.30 * s) / (0.20 * s)) ** 2
shell = (ell < 1.0) | (z > 0.40 * s)                 # the shell and the spikes on top
def seg(a, b):
    a = np.array(a); b = np.array(b); ab = b - a; t = np.clip(((co - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(co - (a + t[:, None] * ab), axis=1)
bw = np.zeros((len(co), len(names)), np.float32)
for name, h, t, par, deform in BONES:
    if not deform or name == 'body': continue
    side = 1 if name.split('_')[2] == 'L' else -1
    bw[:, col[name]] = (np.sign(x) == side) / (seg(h, t) + 0.01) ** 6
bw[shell] = 0; bw[shell, col['body']] = 1
bw[~shell & (bw.sum(1) < 1e-9), col['body']] = 1
bw /= bw.sum(1, keepdims=True)
ed = np.empty(len(mesh.data.edges) * 2, np.int32); mesh.data.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
for _ in range(3):
    acc = bw.copy(); cnt = np.ones(len(co), np.float32)
    np.add.at(acc, ed[:, 0], bw[ed[:, 1]]); np.add.at(acc, ed[:, 1], bw[ed[:, 0]]); np.add.at(cnt, ed[:, 0], 1); np.add.at(cnt, ed[:, 1], 1)
    sm_ = acc / cnt[:, None]; bw[~shell] = sm_[~shell]
order = np.argsort(-bw, axis=1); keep = np.zeros_like(bw, bool); np.put_along_axis(keep, order[:, :4], True, axis=1); bw[~keep] = 0
bw[bw < 0.01] = 0; bw /= np.maximum(bw.sum(1, keepdims=True), 1e-9)
for n in names:
    g = mesh.vertex_groups.new(name=n); c = col[n]
    for vi in np.where(bw[:, c] > 0)[0]: g.add([int(vi)], float(bw[vi, c]), 'REPLACE')
mesh.parent = rig; md = mesh.modifiers.new('rig', 'ARMATURE'); md.object = rig

# ---- clips
K = Baker(rig, mesh, FPS, skip=()); sk = Skel(rig)
sin, cos, pi = math.sin, math.cos, math.pi
sm = lambda a, b, t: float(smooth(a, b, t))
LEGS = [f'leg_{k}_{sd}' for k in 'fmb' for sd in 'LR']
HOME = {n: sk.head[n + '_tip'].copy() for n in LEGS}
TRIPOD = {'leg_f_L': 0, 'leg_m_R': 0, 'leg_b_L': 0, 'leg_f_R': 0.5, 'leg_m_L': 0.5, 'leg_b_R': 0.5}


def stand(p, feet=None, k=1.0):
    """IK for every leg: the coxa yaws toward the foot, femur and tibia bend to reach it."""
    feet = feet or HOME
    for n in LEGS:
        tgt = feet.get(n, HOME[n]); F = sk.fk(p); hip = sk.at(F, n + '_coxa')
        rest_dir = sk.head[n + '_tip'] - sk.head[n + '_coxa']; want = np.asarray(tgt) - hip
        yaw = math.atan2(want[1], want[0]) - math.atan2(rest_dir[1], rest_dir[0])
        p[n + '_coxa'] = Quaternion((0, 0, 1), yaw) @ p.get(n + '_coxa', Quaternion())
        sk.plant(p, n + '_femur', n + '_tibia', n + '_tip', tgt, k=k, pole=(0, 0, 1))
    return p


CROUCH = 0.06   # the Tripo legs stand fully straight: the body sits this much lower so the knees bend and the feet can reach


def body(p, x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0):
    p['body'] = q(x=rx, y=ry, z=rz); p.loc = (x, y, z - CROUCH); return p


def gait(t, speed, T, duty, lift, bob):
    p = body(Pose(), z=-bob * (0.5 - 0.5 * cos(4 * pi * t)), ry=2.5 * sin(2 * pi * t), rz=1.5 * sin(2 * pi * t))
    stride = speed * T; feet = {}
    for n in LEGS:
        f = (t + TRIPOD[n]) % 1.0
        if f < duty: dy, dz = stride * (-0.5 + f / duty), 0.0                    # on the ground: runs back under the body (+Y)
        else: u = (f - duty) / (1 - duty); dy, dz = stride * (0.5 - u), lift * sin(pi * u)
        feet[n] = HOME[n] + np.array([0, dy, dz])
    return stand(p, feet)


def idle(t):
    ph = 2 * pi * t; p = body(Pose(), x=0.006 * sin(ph), z=-0.008 * (0.5 - 0.5 * cos(2 * ph)), rx=1.2 * sin(ph), rz=2.0 * sin(ph - 0.6)); return stand(p)


def attack(t):
    """It rears up on the back legs (0-0.4), the front legs rise, then it slams forward and the front legs strike
    (impact 0.55 of the clip), then settles."""
    up = sm(0.0, 0.42, t) * (1 - sm(0.5, 0.6, t)); slam = sm(0.5, 0.58, t) * (1 - sm(0.75, 1.0, t))
    p = body(Pose(), y=0.05 * up - 0.10 * slam, z=0.06 * up - 0.03 * slam, rx=-16 * up + 10 * slam)
    feet = dict(HOME)
    for n in ('leg_f_L', 'leg_f_R'):
        feet[n] = HOME[n] + np.array([0, -0.06 * up - 0.10 * slam, 0.16 * up])
    p = stand(p, feet); return p


def hit(t):
    j = sm(0.0, 0.15, t) * (1 - sm(0.2, 1.0, t)); p = body(Pose(), y=0.04 * j, z=-0.02 * j, rx=8 * j, rz=6 * j); return stand(p)


def death(t):
    fall = sm(0.1, 0.55, t); curl = sm(0.2, 0.8, t)
    p = body(Pose(), z=-0.12 * fall, rx=6 * fall, ry=14 * fall)
    for n in LEGS:
        sd = 1 if n.endswith('L') else -1
        p[n + '_femur'] = q(y=-sd * 70 * curl); p[n + '_tibia'] = q(y=-sd * 80 * curl)
    return p


SPD = (0.83, 1.63)
WALK_N, RUN_N = 8, 5                                  # a small spider scuttles: short quick steps keep the feet in reach
CLIPS = [('idle', idle, 2.0, True, None), ('walk', lambda t: gait(t, SPD[0], WALK_N / FPS, 0.55, 0.05, 0.010), WALK_N / FPS, True, None),
         ('run', lambda t: gait(t, SPD[1], RUN_N / FPS, 0.45, 0.06, 0.016), RUN_N / FPS, True, None),
         ('attack', attack, 0.8, False, idle(0)), ('hit', hit, 0.4, False, idle(0)), ('death', death, 1.2, False, None)]
for name, fn, sec, loop, ends in CLIPS: K.bake(name, fn, sec, loop, ends_like=ends)
# planted-foot drift in the walk (against the ground running back at the clip's speed)
drift = 0.0
for i in range(32):
    t = i / 32; F = sk.fk(CLIPS[1][1](t))
    for n in LEGS:
        f = (t + TRIPOD[n]) % 1.0
        if f < 0.55: want = HOME[n] + np.array([0, SPD[0] * WALK_N / FPS * (-0.5 + f / 0.55), 0]); drift = max(drift, float(np.linalg.norm(sk.at(F, n + '_tip') - want)))
rig.animation_data.use_nla = False; K.apply(idle(0)); d = K.deformed()
r = dict(step='tripo_spider', tris=tris(mesh), bones=len(ad.bones), scale=round(S0, 4), size_m=[round(float(v), 3) for v in np.ptp(d, axis=0)], lowest_z=round(float(d[:, 2].min()), 3),
         walk_planted_drift_m=round(drift, 4), clips=K.checks, status='PASS' if drift < 0.01 else 'CHECK')
ensure(f'{ROOT}/renders'); VIEW_DIRS['hero'] = (0.7, -1, 0.5)
beauty(f'{ROOT}/renders/spider', [mesh], views=('hero', 'side'), res=800, samples=32)
K.apply(Pose()); rig.animation_data.use_nla = True
bpy.ops.file.pack_all(); save(f'{ROOT}/work/spider.blend'); report(f'{ROOT}/report/spider.json', r)
