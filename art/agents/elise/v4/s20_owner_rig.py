"""Elise v4, the owner's second file: a quad-remeshed, auto-rigged model (48.6k triangles, one 2K texture, a standard
65-bone humanoid armature with weights). It becomes the game character on her existing skeleton (../v3/skeleton.json,
90 bones), so every clip of hers plays on it unchanged.

The file is built of separate pieces (the body with both legs, the dress, the hair, the lacing, the ribbons, the
eyes), so nothing is welded and nothing has to be cut apart.
Kept from the file: the mesh, the UVs, the texture, and its weights for the spine, shoulders, arms, hands, fingers,
neck and head (bone names mapped onto hers). Replaced by rules: the dress below the hips (spread over her 13 skirt
chains by angle and height instead of following the thighs), the ribbon tails (the hand, the tips sway), the legs and
shoes (her joints: the file's knee sits 8 cm too high). The hidden right leg is removed above the shoe, as in the v3
build: it would cut the narrow skirt in a stride.
    blender -b -P s20_owner_rig.py -- <model.fbx> <texture.jpg> <work dir> <name> <base triangles> [outline mm 2.2]
Writes <name>.blend and <name>_raw.glb (toon material + inverted hull outline).
"""
import bpy, bmesh, sys, os, json
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]; SRC, TEX, WD, NAME, TRIS = a[0], a[1], a[2], a[3], int(a[4]); MM = float(a[5]) if len(a) > 5 else 2.2
HEIGHT = 1.741
SK = json.load(open(os.path.join(HERE, '..', 'v3', 'skeleton.json'))); BH = {k: np.array(v['head']) for k, v in SK.items()}; BT = {k: np.array(v['tail']) for k, v in SK.items()}
ss = lambda a_, b_, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a_) / (b_ - a_), 0, 1))
MAP = {'Hips': 'pelvis', 'Spine': 'spine', 'Spine1': 'chest', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head'}
for s_, S_ in (('L', 'Left'), ('R', 'Right')):
    MAP.update({S_ + 'Shoulder': 'shoulder_' + s_, S_ + 'Arm': 'upperarm_' + s_, S_ + 'ForeArm': 'forearm_' + s_, S_ + 'Hand': 'hand_' + s_,
                S_ + 'UpLeg': 'thigh_' + s_, S_ + 'Leg': 'shin_' + s_, S_ + 'Foot': 'foot_' + s_, S_ + 'ToeBase': 'toe_' + s_})
    for f_, t_ in (('Index', 'index_'), ('Middle', 'fingers_'), ('Ring', 'fingers_'), ('Pinky', 'fingers_'), ('Thumb', 'thumb_')):
        for k_ in (1, 2, 3, 4): MAP[f'{S_}Hand{f_}{k_}'] = t_ + s_
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=SRC)
el = next(o for o in bpy.data.objects if o.type == 'MESH'); me = el.data; n = len(me.vertices)
M = el.matrix_world; co = np.array([(M @ v.co)[:] for v in me.vertices]); co *= HEIGHT / (co[:, 2].max() - co[:, 2].min()); co[:, 2] -= co[:, 2].min()
W0 = {}                                                # the file's weights under her bone names
gname = {g.index: g.name.split(':')[-1] for g in el.vertex_groups}
for v in me.vertices:
    for g in v.groups:
        k = MAP.get(gname[g.group])
        if k: W0.setdefault(k, np.zeros(n))[v.index] += g.weight
for o in [o for o in bpy.data.objects if o is not el]: bpy.data.objects.remove(o)
el.parent = None; el.matrix_world.identity()
for md in list(el.modifiers): el.modifiers.remove(md)
for vg in list(el.vertex_groups): el.vertex_groups.remove(vg)
me.vertices.foreach_set('co', co.ravel()); me.update()
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free(); me.update()
img = bpy.data.images.load(TEX); img.name = 'agent_elise_base'
mat = bpy.data.materials.new('elise_toon'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Metallic'].default_value = 0.0
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color']); mat.use_backface_culling = False
me.materials.clear(); me.materials.append(mat)
def arrays():
    n_ = len(me.vertices); c = np.empty(n_ * 3); me.vertices.foreach_get('co', c); f = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get('vertices', f); return n_, c.reshape(-1, 3), f.reshape(-1, 3)
def colours(n_):
    W_, H_ = img.size; px = np.array(img.pixels[:]).reshape(H_, W_, -1)[:, :, :3]
    uv = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2); lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    c = px[np.clip((uv[:, 1] * H_).astype(int), 0, H_ - 1), np.clip((uv[:, 0] * W_).astype(int), 0, W_ - 1)]; s = np.zeros((n_, 3)); k = np.zeros(n_); np.add.at(s, lv, c); np.add.at(k, lv, 1); return s / np.maximum(k, 1)[:, None]
n, co, fv = arrays(); col = colours(n); x, y, z = co.T; lum = col.mean(1)
get = lambda k: W0.get(k, np.zeros(n))
# the file is built of separate pieces: the body with both legs, the dress, the hair, the lacing, the ribbons, the eyes
par = np.arange(n)
def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for a_, b_ in np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]]]):
    ra, rb = find(a_), find(b_)
    if ra != rb: par[ra] = rb
comp = np.array([find(i) for i in range(n)]); ids, cnt = np.unique(comp, return_counts=True); order = ids[np.argsort(-cnt)]
BODY = comp == order[0]; zr = {c: (z[comp == c].min(), z[comp == c].max()) for c in order[:12]}
dress_id = next(c for c in order[1:12] if zr[c][1] - zr[c][0] > 1.0); DRESS = comp == dress_id
red = (col[:, 0] > 0.25) & (col[:, 0] > 1.8 * col[:, 1])
LACE = ~BODY & ~DRESS & ~red & (z < 1.12) & (z > 0.5) & (np.abs(x) < 0.2)          # the lacing and its bow ride the dress
armw = sum(get(p + s_) for s_ in 'LR' for p in ('upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_')); arm = armw > 0.5
print('pieces: %d; body %d vertices, dress %d, lacing %d, red %d, arm %d' % (len(ids), BODY.sum(), DRESS.sum(), LACE.sum(), red.sum(), arm.sum()))
# the hidden right leg would cut the narrow skirt in a stride: it goes, the shoe stays (as in the v3 build)
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
gone = BODY & (x < -0.004) & (z > 0.15) & (z < 0.90) & ~arm
drop = [f for f in bm.faces if all(gone[v.index] for v in f.verts)]; keepv = np.ones(n, bool)
bmesh.ops.delete(bm, geom=drop, context='FACES'); alive = np.array([v.index for v in bm.verts]); bm.to_mesh(me); bm.free(); me.update()
W0 = {k_: v_[alive] for k_, v_ in W0.items()}; BODY, DRESS, LACE = BODY[alive], DRESS[alive], LACE[alive]
n, co, fv = arrays(); col = colours(n); x, y, z = co.T; lum = col.mean(1); get = lambda k: W0.get(k, np.zeros(n))
red = (col[:, 0] > 0.25) & (col[:, 0] > 1.8 * col[:, 1])
armw = sum(get(p + s_) for s_ in 'LR' for p in ('upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_')); arm = armw > 0.5
print('right leg removed: %d faces; vertices now %d' % (len(drop), n))

# ---------------- weights
W = {k: np.zeros(n) for k in SK}
upper = ('pelvis', 'spine', 'chest', 'neck', 'head') + tuple(p + s_ for s_ in 'LR' for p in ('shoulder_', 'upperarm_', 'forearm_', 'hand_', 'index_', 'fingers_', 'thumb_'))
for k in upper: W[k] = get(k).copy()
legw = sum(get(p + s_) for s_ in 'LR' for p in ('thigh_', 'shin_', 'foot_', 'toe_'))
W['pelvis'] += legw                                    # whatever the file hung on the legs: the pelvis first; the rules below take over
for sd in 'LR':                                        # ribbon tails: with the hand, the tips sway on her ribbon bones
    tails = red & (z < 0.955) & ((x > 0) if sd == 'L' else (x < 0)) & (np.abs(x) > 0.2)
    u_r = 0.6 * ss(0.92, 0.78, z); u_1 = ss(0.84, 0.76, z)
    for k in upper: W[k][tails] = 0
    W['hand_' + sd][tails] = (1 - u_r)[tails]; W['ribbon_%s_0' % sd][tails] = (u_r * (1 - u_1))[tails]; W['ribbon_%s_1' % sd][tails] = (u_r * u_1)[tails]
# the dress below the hips (and the lacing on it): her 13 skirt chains by angle and height
NC = 13; P = np.array([[BH['skirt_%02d_%d' % (c, j)] for j in range(4)] + [BT['skirt_%02d_3' % c]] for c in range(NC)])
zj = P[:, :, 2].mean(0); u = np.interp(-z, -zj, np.arange(5)); j0 = np.clip(np.floor(u).astype(int), 0, 3); t = np.clip(u - j0, 0, 1)
pt = P[:, j0, :] * (1 - t)[None, :, None] + P[:, np.minimum(j0 + 1, 4), :] * t[None, :, None]; ang_c = np.arctan2(pt[:, :, 1], pt[:, :, 0]); ang = np.arctan2(y, x)
d = (ang[None] - ang_c + np.pi) % (2 * np.pi) - np.pi; dp = np.where(d >= 0, d, np.inf); dn = np.where(d < 0, -d, np.inf); cp = dp.argmin(0); cn = dn.argmin(0); a_ = dp.min(0); b_ = dn.min(0)
wc = np.zeros((NC, n)); idx = np.arange(n); wc[cp, idx] += b_ / (a_ + b_ + 1e-9); wc[cn, idx] += a_ / (a_ + b_ + 1e-9)
wj = np.zeros((4, n)); wj[0] = 1
for j in range(1, 4): s_ = ss(j - 0.18, j + 0.18, u); wj[j] = s_; wj[j - 1] *= (1 - s_)
skirt = (DRESS | LACE) & (z < 0.95); w_sk = ss(0.95, 0.80, z) * skirt
for k in upper: W[k] = W[k] * (1 - w_sk)
for c in range(NC):
    for j in range(4): W['skirt_%02d_%d' % (c, j)][skirt] = (w_sk * wc[c] * wj[j])[skirt]
# the body's legs and shoes: her joints (the file's knee sits 8 cm too high)
for sd, sgn in (('L', 1), ('R', -1)):
    lg = BODY & ~arm & (z < 0.97) & (x * sgn > 0)
    kz = BH['shin_' + sd][2]; az = BH['foot_' + sd][2]; u_h = ss(0.97, 0.86, z) * ss(0.0, 0.035, x * sgn); u_k = ss(kz + 0.04, kz - 0.04, z); u_a = ss(az + 0.03, az - 0.02, z); u_t = ss(-0.10, -0.13, y) * (z < 0.08)
    for k in upper: W[k][lg] = W[k][lg] * (1 - u_h[lg])
    W['thigh_' + sd][lg] = (u_h * (1 - u_k))[lg]; W['shin_' + sd][lg] = (u_h * u_k * (1 - u_a))[lg]; W['foot_' + sd][lg] = (u_h * u_k * u_a * (1 - u_t))[lg]; W['toe_' + sd][lg] = (u_h * u_k * u_a * u_t)[lg]
tot = sum(W.values()); bad = tot < 1e-4; W['pelvis'][bad & (z < 1.45)] = 1.0; W['head'][bad & (z >= 1.45)] = 1.0; tot = sum(W.values())
for k in W: W[k] = W[k] / tot
print('weights: unbound vertices fixed %d; bones used %d of %d' % (bad.sum(), sum(1 for k in W if W[k].max() > 0.01), len(W)))
for k in SK:
    g = el.vertex_groups.new(name=k); w = W[k]
    for i in np.nonzero(w > 0.004)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
arm_d = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm_d); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for k, v in SK.items():
    b = arm_d.edit_bones.new(k); b.head = Vector(v['head']); b.tail = Vector(v['tail'])
    if v['parent']: b.parent = arm_d.edit_bones[v['parent']]
for b in arm_d.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
el.name = 'elise'; me.name = 'elise'
for p in me.polygons: p.use_smooth = True

bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
now = len(me.polygons)
if TRIS < now:
    md = el.modifiers.new('dec', 'DECIMATE'); md.ratio = TRIS / now; md.use_collapse_triangulate = True; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
me = el.data

# ---------------- outline hull, the game file
mo = bpy.data.materials.new('elise_outline'); mo.use_nodes = True; bs = mo.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1); bs.inputs['Roughness'].default_value = 1.0; mo.use_backface_culling = True
me.materials.append(mo); n0, co, fv = arrays(); f0 = len(fv); no = np.array([v.normal[:] for v in me.vertices]); zz = co[:, 2]
k = np.ones(n0); k[zz > 1.47] = 0.5; k[(np.abs(co[:, 0]) > 0.2) & (zz < 1.0)] = 0.45; k[zz > 1.69] = 0.3
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:]); vmap = geom['vert_map']
nf = [g for g in geom['geom'] if isinstance(g, bmesh.types.BMFace)]
for v in list(vmap):
    if v.index < n0 and vmap[v].index != v.index: vmap[v].co = (co[v.index] + no[v.index] * MM * 0.001 * k[v.index]).tolist()
for f in nf: f.material_index = 1
bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.validate(); me.update()
for a_ in [a_.name for a_ in me.attributes if a_.name in ('part', 'torso_w', 'is_head', 'is_socket', 'grid', 'sharp_face')]: me.attributes.remove(me.attributes[a_])
print('ELISE', NAME, 'tris', len(me.polygons), 'base', f0, 'verts', len(me.vertices), 'bones', len(arm_d.bones))
for i_ in [i_ for i_ in bpy.data.images if i_ is not img and i_.users == 0 or (i_ is not img and not os.path.exists(bpy.path.abspath(i_.filepath)))]: bpy.data.images.remove(i_)
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=False)
print('WROTE', f'{WD}/{NAME}_raw.glb', os.path.getsize(f'{WD}/{NAME}_raw.glb'), 'S20_DONE')
