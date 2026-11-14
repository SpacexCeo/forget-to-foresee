"""Step 07 (shoal_dragon): the armature and the skin weights.
  blender -b --python s07_rig.py -- --root <work root>
Bones on dragon.json `joints` (body, read from the grid renders) and on the wing curves (wingdef). Body weights by rule (automatic
weights fail on the generated shell and on its voxel copy): inverse distance to the bone segments inside each bone's
own region, a rigid head and rigid paws, at most 4 bones per vertex, normalised. Wing vertices keep the analytic weights from s04.
Output: work/07_rig.blend (dragon + rig), report/s07.json, renders/s07_*.jpg (rig over the mesh, weight check poses)."""
import bpy, bmesh, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from wingdef import wing_curves

A = args(); ROOT = A['root']
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dragon.json')))
J = CFG['joints']; S, E, W, B, TH, TIPS, bez, finger, arm_curve = wing_curves(CFG['wing'])
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/06_bake.blend')
mesh = bpy.data.objects['dragon']

# ---- bones: name -> (head, tail, parent, deform)
BONES = []
def add(name, head, tail, parent, deform=True): BONES.append((name, tuple(map(float, head)), tuple(map(float, tail)), parent, deform))
add('root', (0, 0, 0), (0, 0, 0.6), None, False)
add('hips', J['hips'], J['hips_end'], 'root')
prev = 'hips'
for i, name in enumerate(('spine1', 'spine2', 'chest', 'chest_top')):
    add(name, J['spine'][i], J['spine'][i + 1], prev); prev = name
for i in range(4): add(f'neck{i + 1}', J['neck'][i], J['neck'][i + 1], prev); prev = f'neck{i + 1}'
add('head', J['neck'][4], J['head_end'], prev)
prev = 'hips'
for i in range(7): add(f'tail{i + 1}', J['tail'][i], J['tail'][i + 1], prev); prev = f'tail{i + 1}'
mir = lambda p: (-p[0], p[1], p[2])
for side, f in (('.L', lambda p: tuple(p)), ('.R', mir)):
    prev = 'chest'
    for i, name in enumerate(('leg_f_upper', 'leg_f_lower', 'leg_f_paw')): add(name + side, f(J['leg_f'][i]), f(J['leg_f'][i + 1]), prev); prev = name + side
    prev = 'hips'
    for i, name in enumerate(('leg_h_upper', 'leg_h_lower', 'leg_h_foot', 'leg_h_paw')): add(name + side, f(J['leg_h'][i]), f(J['leg_h'][i + 1]), prev); prev = name + side
    add('wing_arm' + side, f(S), f(E), 'chest'); add('wing_fore' + side, f(E), f(W), 'wing_arm' + side)
    for i in range(4):
        mid = finger(i, 0.5)
        add(f'wing_f{i + 1}a' + side, f(W), f(mid), 'wing_fore' + side); add(f'wing_f{i + 1}b' + side, f(mid), f(TIPS[i]), f'wing_f{i + 1}a' + side)
sp = CFG['saddle']['pos']; add('saddle', sp, (sp[0], sp[1], sp[2] + 0.3), 'spine2', False)

arm_data = bpy.data.armatures.new('dragon_rig'); rig = bpy.data.objects.new('dragon_rig', arm_data); bpy.context.scene.collection.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, head, tail, parent, deform in BONES:
    b = arm_data.edit_bones.new(name); b.head = head; b.tail = tail; b.use_deform = deform; b.roll = 0
    if parent: b.parent = arm_data.edit_bones[parent]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# ---- body weights through a voxel proxy
co = coords(mesh)
has_w = np.zeros(len(co), bool)
for v in mesh.data.vertices:
    if len(v.groups): has_w[v.index] = True          # the wing: analytic weights from s04
body_idx = np.where(~has_w)[0]
# Automatic (bone heat) weights fail on this shell and on its voxel copy, so the body is weighted by rule: inverse
# distance to the bone segments (power 4: a narrow blend at the joints), each bone limited to its own region of the
# body (region numbers from the s03 tables), then three smoothing passes along the mesh edges.
names = [n for n, h, t, p, d in BONES if d and not n.startswith('wing_')]; col = {n: i for i, n in enumerate(names)}
P = co[body_idx]; x, y, z = P[:, 0], P[:, 1], P[:, 2]
def seg_dist(a, b):
    a = np.array(a); b = np.array(b); ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
def chain_dist(prefix, side):
    return np.min([seg_dist(h, t) for n, h, t, p, d in BONES if n.startswith(prefix) and n.endswith(side)], axis=0)
NEAR = {(pre, sd): 1 - smooth(0.30, 0.50, chain_dist(pre, sd)) for pre in ('leg_f', 'leg_h') for sd in ('.L', '.R')}   # a leg bone only holds its own leg, never the belly between the legs
def region(n):
    inner = lambda sx: np.where(z > 1.45, smooth(0.30, 0.50, sx), smooth(0.05, 0.3, sx))   # above the elbow / knee the leg starts further out
    if n.startswith('leg_f'): sx = x if n.endswith('.L') else -x; return inner(sx) * (1 - smooth(2.0, 2.6, z)) * smooth(-4.1, -3.9, y) * (1 - smooth(-2.4, -2.0, y)) * NEAR[('leg_f', n[-2:])]
    if n.startswith('leg_h'): sx = x if n.endswith('.L') else -x; return inner(sx) * (1 - smooth(2.0, 2.7, z)) * smooth(-1.6, -1.2, y) * (1 - smooth(0.5, 0.8, y)) * NEAR[('leg_h', n[-2:])]
    if n.startswith('tail'): return smooth(-0.3, 0.3, y)
    if n.startswith('neck') or n == 'head': return smooth(2.6, 3.0, z) * (1 - smooth(-2.5, -2.1, y))
    return np.ones(len(P))
bw = np.zeros((len(P), len(names)), np.float32)
for n, h, t, p, d in BONES:
    if n in col: bw[:, col[n]] = region(n) / (seg_dist(h, t) + 0.02) ** 4
below_joint = 1 - smooth(1.42, 1.6, z)        # elbow at z 1.40, knee at 1.35: the lower leg bones stop a little above them
for n in names:
    if n.startswith(('leg_f_lower', 'leg_h_lower', 'leg_h_foot')): bw[:, col[n]] *= below_joint
bw /= np.maximum(bw.sum(1, keepdims=True), 1e-12)
unweighted_proxy = 0
# The neck is shared out by POSITION ALONG the neck, not by distance: the throat plates stand 0.5-0.7 m in front of
# the neck line, where every neck bone is about as far, and a distance blend gave them four near-equal bones that
# changed from vertex to vertex (review A.48: 1 cm edges torn 5-7x). Along the neck each vertex has two neighbours.
NK = ['neck1', 'neck2', 'neck3', 'neck4', 'head']; npts = [np.array(v, float) for v in J['neck']] + [np.array(J['head_end'], float)]
# one straight axis from the neck's base to the skull (the neck is nearly straight): the parameter has no jumps
ax_ = npts[4] - npts[0]; u_neck = np.clip(4 * ((P - npts[0]) @ ax_) / (ax_ @ ax_), 0, 5)
ker = np.maximum(0.0, 1 - np.abs(u_neck[:, None] - (np.arange(5) + 0.5)) / 0.9); ker /= np.maximum(ker.sum(1, keepdims=True), 1e-9)
nc = [col[n] for n in NK]; tot = bw[:, nc].sum(1); bw[:, nc] = tot[:, None] * ker

# ---- rules (regions from the s03 tables)
def move(mask, src, dst, amount=1.0):
    """Give `amount` of the weights of bones `src` to bone `dst` on the masked vertices."""
    for s_ in src:
        if s_ in col: t = bw[mask, col[s_]] * amount; bw[mask, col[s_]] -= t; bw[mask, col[dst]] += t
legs = [n for n in names if n.startswith('leg_')]
tails = [n for n in names if n.startswith('tail')]
necks = ['neck1', 'neck2', 'neck3', 'neck4', 'head']
# the head with its crest and ears is rigid: everything above the jaw line in front of / over the skull
head_mask = (P[:, 2] > 4.0) & (P[:, 1] < -2.2) | (P[:, 2] > 4.5)
bw[head_mask] = 0; bw[head_mask, col['head']] = 1
# no leg bone above the back line, no tail bone in front of the hips, no neck bone behind the shoulders
move(P[:, 2] > 2.75, legs, 'spine2'); move(P[:, 1] < -0.6, tails, 'hips'); move(P[:, 1] > -1.9, necks, 'chest')
# legs never pull the other side
move(P[:, 0] > 0.05, [n for n in legs if n.endswith('.R')], 'spine1'); move(P[:, 0] < -0.05, [n for n in legs if n.endswith('.L')], 'spine1')
# paws rigid on the paw bones (claws do not stretch)
for side, sgn in (('.L', 1), ('.R', -1)):
    mk = (P[:, 2] < 0.3) & (P[:, 1] < -2.6) & (P[:, 0] * sgn > 0); bw[mk] = 0; bw[mk, col['leg_f_paw' + side]] = 1
    mk = (P[:, 2] < 0.14) & (P[:, 1] > -1.0) & (P[:, 1] < 0.4) & (P[:, 0] * sgn > 0); bw[mk] = 0; bw[mk, col['leg_h_paw' + side]] = 1
# soften every border (rules included) along the mesh edges
ed_all = np.empty(len(mesh.data.edges) * 2, np.int32); mesh.data.edges.foreach_get('vertices', ed_all); ed_all = ed_all.reshape(-1, 2)
loc = -np.ones(len(co), np.int64); loc[body_idx] = np.arange(len(body_idx)); e = loc[ed_all]; e = e[(e >= 0).all(1)]
for _ in range(6):
    acc = bw.copy(); cnt = np.ones(len(P), np.float32)
    np.add.at(acc, e[:, 0], bw[e[:, 1]]); np.add.at(acc, e[:, 1], bw[e[:, 0]]); np.add.at(cnt, e[:, 0], 1); np.add.at(cnt, e[:, 1], 1)
    bw = acc / cnt[:, None]
# the leg roots and the neck base fold the furthest (legs tucked in flight): there the blend is spread wider, over
# several edge rings, so the skin stretches evenly instead of tearing at one ring (review A.8, A.9)
core = ((P[:, 2] > 4.3) & (P[:, 1] < -2.5)) | (P[:, 2] > 4.7)                       # the skull stays rigid
soles = ((P[:, 2] < 0.3) & (P[:, 1] < -2.6)) | ((P[:, 2] < 0.14) & (P[:, 1] > -1.0) & (P[:, 1] < 0.4))   # the paws too
wide = ((z < 3.05) & (((y > -4.2) & (y < -2.1)) | ((y > -1.6) & (y < 0.8)))) | ((z > 2.5) & (y < -2.0))
wide &= ~core & ~soles
for _ in range(int(A.get('wide', 12))):
    acc = bw.copy(); cnt = np.ones(len(P), np.float32)
    np.add.at(acc, e[:, 0], bw[e[:, 1]]); np.add.at(acc, e[:, 1], bw[e[:, 0]]); np.add.at(cnt, e[:, 0], 1); np.add.at(cnt, e[:, 1], 1)
    bw[wide] = (acc / cnt[:, None])[wide]
# small separate shells (plates, spikes, frill petals: the source mesh is many parts) ride rigidly on the blend of
# their own middle: a plate must not be torn between two bones (review A.48)
par = np.arange(len(P))
def root_of(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for a_, b_ in e:
    ra, rb = root_of(a_), root_of(b_)
    if ra != rb: par[ra] = rb
roots = np.array([root_of(i) for i in range(len(P))]); islands = []
for r_ in np.unique(roots):
    idx = np.where(roots == r_)[0]; ext = float(np.ptp(P[idx], axis=0).max())
    if len(idx) < int(A.get('island', 900)) and ext < float(A.get('island_m', 0.9)) and not soles[idx].any():
        bw[idx] = bw[idx].mean(0); islands.append((len(idx), round(ext, 2)))
    elif len(idx) < 0.4 * len(P) and ext < 2.0 and not soles[idx].any():          # larger shells (throat and chest plates, the frill): stiffened, not rigid
        k_ = float(A.get('stiff', 0.6)); bw[idx] = (1 - k_) * bw[idx] + k_ * bw[idx].mean(0); islands.append((len(idx), round(ext, 2)))
print('ISLANDS', len(np.unique(roots)), 'rigid', len(islands), sorted(islands)[-12:])
# a very short edge must not span two different blends: its ends take their mean (review A.48: the few 9-11x edges
# were 1-3 cm long); the rigid skull and paws keep their bone
elen = np.linalg.norm(P[e[:, 0]] - P[e[:, 1]], axis=1); short = e[elen < float(A.get('short', 0.035))]
keep_rigid = core | soles
for _ in range(3):
    m = (bw[short[:, 0]] + bw[short[:, 1]]) / 2
    for k_ in (0, 1):
        ok = ~keep_rigid[short[:, k_]]; bw[short[ok, k_]] = m[ok]
# at most 4 bones, normalised. Where many bones are equally far (the throat plates in front of the neck) neighbours
# would keep different sets of four and tear on a 1 cm edge: cut, smooth once, cut again until the sets agree
def top4(w):
    order = np.argsort(-w, axis=1); keep = np.zeros_like(w, bool); np.put_along_axis(keep, order[:, :4], True, axis=1)
    w = np.where(keep, w, 0); w[w < 0.01] = 0; return w / np.maximum(w.sum(1, keepdims=True), 1e-9)
zero = int((bw.sum(1) < 1e-6).sum()); frozen = core | soles
for _ in range(int(A.get('agree', 8))):
    bw = top4(bw); acc = bw.copy(); cnt = np.ones(len(P), np.float32)
    np.add.at(acc, e[:, 0], bw[e[:, 1]]); np.add.at(acc, e[:, 1], bw[e[:, 0]]); np.add.at(cnt, e[:, 0], 1); np.add.at(cnt, e[:, 1], 1)
    sm_ = acc / cnt[:, None]; bw[~frozen] = sm_[~frozen]
bw = top4(bw)

for n in names:
    if n not in mesh.vertex_groups: mesh.vertex_groups.new(name=n)
for n in names:
    g = mesh.vertex_groups[n]; c = col[n]; nz = np.where(bw[:, c] > 0)[0]
    for k in nz: g.add([int(body_idx[k])], float(bw[k, c]), 'REPLACE')
# wing vertices: limit to 4 and normalise too
active(mesh); bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4); bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
mesh.parent = rig; md = mesh.modifiers.new('rig', 'ARMATURE'); md.object = rig
infl = [len(v.groups) for v in mesh.data.vertices]; sums = [sum(g.weight for g in v.groups) for v in mesh.data.vertices]
bone_names = {b.name for b in arm_data.bones}
r = dict(step='s07_rig', bones=len(arm_data.bones), deform_bones=sum(1 for b in arm_data.bones if b.use_deform), 
         body_unweighted=zero, max_influences=max(infl), min_sum=round(min(sums), 4), max_sum=round(max(sums), 4),
         groups_without_bone=[g.name for g in mesh.vertex_groups if g.name not in bone_names],
         status='PASS' if zero == 0 and max(infl) <= 4 and min(sums) > 0.999 else 'CHECK')

# ---- the joints over the mesh (side and top), then a pose test with the worst stretched edges
joints = {n: list(h) for n, h, t, p, d in BONES}
json.dump(joints, open(f'{ROOT}/report/s07_joints.json', 'w'))
grid_views(f'{ROOT}/renders/s07', [mesh], views=('side', 'top'), res=1536, texture=False)
ed = np.empty(len(mesh.data.edges) * 2, np.int32); mesh.data.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
rest_len = np.linalg.norm(co[ed[:, 0]] - co[ed[:, 1]], axis=1)
from mathutils import Quaternion
def worldq(pb, axis, deg):
    R = pb.bone.matrix_local.to_3x3().to_quaternion(); return R.inverted() @ Quaternion(axis, math.radians(deg)) @ R
TEST = {'neck_forward': [('neck1', 'X', 17), ('neck2', 'X', 12), ('neck3', 'X', 7), ('head', 'X', -32)],   # the flight pose of s08_clips.fly_body
        'wings_up': [('wing_arm.L', 'Y', -40), ('wing_arm.R', 'Y', 40), ('wing_fore.L', 'Y', -15), ('wing_fore.R', 'Y', 15)],
        # the flight pose of s08_clips.legs_tucked: hind legs trailing back, forelegs folded under the chest
        'legs_tucked': [(b + sd, 'X', a) for sd in ('.L', '.R') for b, a in (('leg_h_upper', -28), ('leg_h_lower', 18), ('leg_h_foot', 38), ('leg_h_paw', 15),
                                                                                ('leg_f_upper', 34), ('leg_f_lower', -72), ('leg_f_paw', 40))],
        'wings_down': [('wing_arm.L', 'Y', 30), ('wing_arm.R', 'Y', -30)],
        'head_turn_60': [(n, 'Z', 12) for n in ('neck1', 'neck2', 'neck3', 'neck4', 'head')],
        'tail_side_45': [(f'tail{i}', 'Z', 9) for i in range(1, 6)],
        'step': [('leg_f_upper.L', 'X', -30), ('leg_h_upper.R', 'X', 30), ('leg_h_lower.R', 'X', -20)],
        'tail_up': [('tail1', 'X', 30), ('tail2', 'X', 10), ('tail3', 'Z', 20), ('tail5', 'Z', 20)]}
AX = dict(X=(1, 0, 0), Y=(0, 1, 0), Z=(0, 0, 1)); tests = {}
for tname, rots in TEST.items():
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0)
    for bn, ax, deg in rots: rig.pose.bones[bn].rotation_quaternion = worldq(rig.pose.bones[bn], AX[ax], deg)
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); me = ev.to_mesh()
    a = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', a); a = a.reshape(-1, 3); ev.to_mesh_clear()
    ratio = np.linalg.norm(a[ed[:, 0]] - a[ed[:, 1]], axis=1) / np.maximum(rest_len, 1e-6); ratio[rest_len < 0.01] = 1
    # the worst edges with the two strongest bones of each end (TZ step 12): where a pose still tears
    def top2(vi):
        g = sorted(((gr.weight, mesh.vertex_groups[gr.group].name) for gr in mesh.data.vertices[int(vi)].groups), reverse=True)[:2]
        return ' '.join(f'{n}:{w:.2f}' for w, n in g)
    worst = np.argsort(-ratio)[:int(A.get('worst', 14))]
    print('WORST', tname, json.dumps([dict(at=[round(float(v), 2) for v in (co[ed[i, 0]] + co[ed[i, 1]]) / 2], x=round(float(ratio[i]), 1), mm=round(float(rest_len[i]) * 1000), a=top2(ed[i, 0]), b=top2(ed[i, 1])) for i in worst]))
    tests[tname] = dict(max_stretch=round(float(ratio.max()), 2), p999=round(float(np.quantile(ratio, 0.999)), 2), over_2=int((ratio > 2).sum()))
    workbench(900, True); ortho_views(f'{ROOT}/renders/s07_{tname}', [mesh], views=('side', 'q34'), res=900)
for pb in rig.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0)
r['pose_tests'] = tests
save(f'{ROOT}/work/07_rig.blend')
report(f'{ROOT}/report/s07.json', r); print('REPORT2', json.dumps(tests))
