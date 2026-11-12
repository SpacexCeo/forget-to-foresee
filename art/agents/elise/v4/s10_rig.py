"""Elise v4, steps 09-11 and 15: parts, bones, weights and the game file.

The cleaned hero copy (s08_clean.py) is one fused shell. It is tagged by colour and place (arms, hands, ribbon tails,
head and hair, torso, skirt, the leg in the slit, the shoes). The leg and the shoes of the shell are only a front
skin welded to the skirt, so they are cut out and replaced by the full left leg, stocking and shoes of the v3 build
(same bones, coloured from this model's texture). Everything is bound to her existing skeleton (../v3/skeleton.json, 90 bones), so
every clip of hers plays on it unchanged. Weights are rules, not heat: ramps along the spine, the arm and the leg,
the skirt spread over its 13 chains by angle and height; nothing is smoothed across parts.
    blender -b hero.blend -P s10_rig.py -- <work dir> <name> <base triangles> [outline mm 2.2] [v3 dressed.blend]
Writes <name>.blend and <name>_raw.glb (toon material + inverted hull outline).
"""
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]; WD, NAME, TRIS = a[0], a[1], int(a[2]); MM = float(a[3]) if len(a) > 3 else 2.2
LEGS = a[4] if len(a) > 4 else '/root/w/elise6/dressed.blend'      # the v3 build (../v3/all.sh): her left leg, stocking and shoes come from it
SK = json.load(open(os.path.join(HERE, '..', 'v3', 'skeleton.json'))); BH = {k: np.array(v['head']) for k, v in SK.items()}; BT = {k: np.array(v['tail']) for k, v in SK.items()}
ss = lambda a_, b_, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a_) / (b_ - a_), 0, 1))
el = bpy.data.objects['elise_hero']; me = el.data
for o in [o for o in bpy.data.objects if o is not el]: bpy.data.objects.remove(o)
el.hide_render = False; el.hide_viewport = False; bpy.context.view_layer.objects.active = el; el.select_set(True)

def arrays():
    n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    fv = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get('vertices', fv); return n, co, fv.reshape(-1, 3)
def colours(n):
    img = bpy.data.images['hero_base.png']; W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4)[:, :, :3]
    uv = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2); lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    c = px[np.clip((uv[:, 1] * H).astype(int), 0, H - 1), np.clip((uv[:, 0] * W).astype(int), 0, W - 1)]; s = np.zeros((n, 3)); k = np.zeros(n); np.add.at(s, lv, c); np.add.at(k, lv, 1); return s / np.maximum(k, 1)[:, None]

# ---------------- 09: centre on the arms, then the parts
n, co, fv = arrays(); band = (co[:, 2] > 1.0) & (co[:, 2] < 1.2); dx = -0.5 * (co[band, 0].min() + co[band, 0].max()); co[:, 0] += dx
me.vertices.foreach_set('co', co.ravel()); me.update(); col = colours(n); x, y, z = co.T; warm = col[:, 0] - col[:, 2] > 0.015; red = (col[:, 0] > 0.3) & (col[:, 0] > 1.8 * col[:, 1])
dress = (col[:, 2] >= col[:, 0]) & (col.mean(1) < 0.3)
thr = 0.115 + (1.25 - np.clip(z, 0.72, 1.27)) * 0.2125; arm = (z < 1.22) & (z > 0.60) & (np.abs(x) > thr) & ~(dress & ((np.abs(x) < thr + 0.03) | (z > 0.97)))
e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
leg = warm & ~arm & (z < 0.78) & (x > -0.03) & (x < 0.21) & (y < 0.06)
for _ in range(3):                                     # the lacing drawn over the hip skin goes with the skin
    s_ = np.zeros(n); c_ = np.zeros(n); np.add.at(s_, e[:, 0], leg[e[:, 1]]); np.add.at(c_, e[:, 0], 1); leg |= (~arm) & (z < 0.78) & (z > 0.60) & (s_ / np.maximum(c_, 1) >= 0.5)
ref = co[leg & (z > 0.60) & (z < 0.655)][:, :2]         # the stocking's lace band: dark, but on the leg's column
if len(ref):
    cand = np.nonzero(~leg & ~arm & (z > 0.65) & (z < 0.77) & (x > -0.03) & (y < 0.06))[0]
    for i in cand:
        if np.min(np.hypot(ref[:, 0] - x[i], ref[:, 1] - y[i])) < 0.012: leg[i] = True
FL = BH['foot_L']; FR = BH['foot_R']
shoe_l = ~arm & (z < 0.095) & (np.abs(x - FL[0]) < 0.05) & (y > -0.23) & (y < 0.06) & (((y < -0.17) & (z < 0.06)) | (z < 0.028) | leg)
shoe_r = ~arm & (np.abs(x + 0.065) < 0.05) & (y > -0.23) & (y < 0.06) & (((y < -0.17) & (z < 0.06)) | (z < 0.028))
for _ in range(2):                                     # a clean edge: lone vertices follow their neighbours
    s_ = np.zeros(n); c_ = np.zeros(n); np.add.at(s_, e[:, 0], leg[e[:, 1]]); np.add.at(c_, e[:, 0], 1); fr_ = s_ / np.maximum(c_, 1); leg = (leg & (fr_ > 0.34)) | (~arm & (z < 0.78) & (fr_ > 0.66))
def swatch(mask):                                      # a texel of this model's texture with the mask's median colour
    ids = np.nonzero(mask)[0]; i = ids[np.argmin(np.linalg.norm(col[ids] - np.median(col[ids], 0), axis=1))]; lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    li = int(np.nonzero(lv == i)[0][0]); return tuple(me.uv_layers[0].data[li].uv)
SW = {'skin': swatch(warm & ~arm & (col.mean(1) > 0.6) & (z > 0.80) & (z < 0.95) & (x > 0)), 'stocking': swatch(leg & (z > 0.25) & (z < 0.6) & warm), 'dark': swatch(~warm & (col.mean(1) < 0.12) & (z < 0.2))}
part_v = np.zeros(n, int); part_v[leg | shoe_l] = 1; part_v[shoe_r] = 2
pf = np.array([np.bincount(part_v[f], minlength=3).argmax() if (part_v[f] > 0).sum() >= 2 else 0 for f in fv])
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); L = bm.faces.layers.int.new('part')
for f in bm.faces: f[L] = int(pf[f.index])
cut = [f for f in bm.faces if f[L] > 0]; bmesh.ops.delete(bm, geom=cut, context='FACES')
bm.to_mesh(me); bm.free(); me.update()
n, co, fv = arrays(); col = colours(n); x, y, z = co.T; pfa = np.empty(len(me.polygons), np.int32); me.attributes['part'].data.foreach_get('value', pfa)
part = np.zeros(n, int)
warm = col[:, 0] - col[:, 2] > 0.015; red = (col[:, 0] > 0.3) & (col[:, 0] > 1.8 * col[:, 1])
dress = (col[:, 2] >= col[:, 0]) & (col.mean(1) < 0.3)
thr = 0.115 + (1.25 - np.clip(z, 0.72, 1.27)) * 0.2125; arm = (z < 1.22) & (z > 0.60) & (np.abs(x) > thr) & ~(dress & ((np.abs(x) < thr + 0.03) | (z > 0.97)))
print('parts: vertices %d, arms %d, leg and shoe faces cut %d, red %d, centred by %.4f, swatches %s' % (n, arm.sum(), len(cut), red.sum(), dx, {k: tuple(round(c, 3) for c in v) for k, v in SW.items()}))

# ---------------- 11: weights by rule
W = {k: np.zeros(n) for k in SK}
def side(sd): return (x > 0) if sd == 'L' else (x < 0)
# arms, hands, ribbon tails
for sd in 'LR':
    m = arm & side(sd); tails = m & red & (z < 0.94)
    u_e = ss(BH['forearm_' + sd][2] + 0.035, BH['forearm_' + sd][2] - 0.035, z); u_w = ss(0.975, 0.935, z); u_f = ss(0.89, 0.86, z); u_i = ss(-0.020, -0.036, y)
    body_m = m & ~tails
    W['upperarm_' + sd][body_m] = (1 - u_e)[body_m]; W['forearm_' + sd][body_m] = (u_e * (1 - u_w))[body_m]; W['hand_' + sd][body_m] = (u_w * (1 - u_f))[body_m]
    W['fingers_' + sd][body_m] = (u_w * u_f * (1 - u_i))[body_m]; W['index_' + sd][body_m] = (u_w * u_f * u_i)[body_m]
    u_r = 0.6 * ss(0.90, 0.78, z); W['hand_' + sd][tails] = (1 - u_r)[tails]; W['ribbon_%s_0' % sd][tails] = u_r[tails]      # short tails: mostly with the hand, the tips sway
# the rest of the body: spine ramps, head by height and by distance from the neck's axis
rest = (part == 0) & ~arm; r_neck = np.hypot(x, y - 0.01)
w_head = np.where(z > 1.455, np.maximum(ss(1.47, 1.51, z), ss(0.06, 0.075, r_neck)), 0.0); w_head = np.where((z > 1.49) & (y < -0.03), 1.0, w_head)
w_neck = ss(1.42, 1.47, z) * (1 - w_head); w_chest = ss(1.16, 1.24, z) * (1 - w_neck - w_head); w_spine = ss(0.99, 1.07, z) * (1 - ss(1.16, 1.24, z)); w_pel = 1 - ss(0.99, 1.07, z)
w_arm = np.zeros(n)
for sd in 'LR':                                       # the shoulder: the fused part above the arm cluster
    S = BH['upperarm_' + sd]; E = BH['forearm_' + sd]; d = (E - S) / np.linalg.norm(E - S); t = (co - S) @ d; dist = np.linalg.norm(co - S - np.clip(t, 0, None)[:, None] * d, axis=1)
    thr2 = 0.115 + (1.25 - z) * 0.2125; wa = np.maximum(ss(-0.06, 0.03, t) * (1 - ss(0.035, 0.06, dist)) * ss(1.25, 1.33, z), ss(thr2 - 0.015, thr2 + 0.02, np.abs(x)) * ss(1.36, 1.30, z)) * (rest & ~dress & side(sd) & (z >= 1.2) & (z < 1.47)); w_arm += wa; W['upperarm_' + sd][rest] += wa[rest]
    wsh = (1 - wa) * ss(0.05, 0.11, np.abs(x)) * ss(1.30, 1.38, z) * 0.6 * (rest & side(sd) & (z < 1.47)); W['shoulder_' + sd][rest] += wsh[rest]; w_arm += wsh
keep = 1 - w_arm
# the skirt: 13 chains of 4 bones around the pelvis
NC = 13; P = np.array([[BH['skirt_%02d_%d' % (c, j)] for j in range(4)] + [BT['skirt_%02d_3' % c]] for c in range(NC)])       # [chain, joint, xyz]
zj = P[:, :, 2].mean(0); u = np.interp(-z, -zj, np.arange(5)); j0 = np.clip(np.floor(u).astype(int), 0, 3); t = np.clip(u - j0, 0, 1)
pt = P[:, j0, :] * (1 - t)[None, :, None] + P[:, np.minimum(j0 + 1, 4), :] * t[None, :, None]; ang_c = np.arctan2(pt[:, :, 1], pt[:, :, 0]); ang = np.arctan2(y, x)
d = (ang[None] - ang_c + np.pi) % (2 * np.pi) - np.pi; dp = np.where(d >= 0, d, np.inf); dn = np.where(d < 0, -d, np.inf); cp = dp.argmin(0); cn = dn.argmin(0); a_ = dp.min(0); b_ = dn.min(0)
wc = np.zeros((NC, n)); idx = np.arange(n); wc[cp, idx] += b_ / (a_ + b_ + 1e-9); wc[cn, idx] += a_ / (a_ + b_ + 1e-9)
wj = np.zeros((4, n)); wj[0] = 1
for j in range(1, 4): s_ = ss(j - 0.18, j + 0.18, u); wj[j] = s_; wj[j - 1] *= (1 - s_)
w_sk = ss(0.95, 0.80, z) * (rest & (z < 0.95)); skirt = rest & (z < 0.95)
for c in range(NC):
    for j in range(4): W['skirt_%02d_%d' % (c, j)][skirt] = (w_sk * wc[c] * wj[j])[skirt]
for nm, w in (('pelvis', w_pel * (1 - w_sk)), ('spine', w_spine), ('chest', w_chest * keep), ('neck', w_neck * keep), ('head', w_head)): W[nm][rest] += w[rest]
W['chest'][rest] += ((w_spine * 0 + (1 - w_pel - w_spine - w_chest - w_neck - w_head)) * 0)[rest]
tot = sum(W.values()); bad = tot < 1e-4; W['pelvis'][bad] = 1.0; tot = sum(W.values())
for k in W: W[k] = W[k] / tot
print('weights: unbound vertices fixed %d; bones used %d of %d' % (bad.sum(), sum(1 for k in W if W[k].max() > 0.01), len(W)))
for vg in list(el.vertex_groups): el.vertex_groups.remove(vg)
for k in SK:
    g = el.vertex_groups.new(name=k); w = W[k]
    for i in np.nonzero(w > 0.004)[0]: g.add([int(i)], float(w[i]), 'REPLACE')

# ---------------- 10: her skeleton
arm_d = bpy.data.armatures.new('elise_rig'); ao = bpy.data.objects.new('elise_rig', arm_d); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for k, v in SK.items():
    b = arm_d.edit_bones.new(k); b.head = Vector(v['head']); b.tail = Vector(v['tail'])
    if v['parent']: b.parent = arm_d.edit_bones[v['parent']]
for b in arm_d.edit_bones: b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT'); el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
print('skeleton: %d bones, order kept: %s' % (len(arm_d.bones), [b.name for b in arm_d.bones] == list(SK)))

# ---------------- 15: budget, outline hull, the game file
bpy.context.view_layer.objects.active = el; bpy.ops.object.select_all(action='DESELECT'); el.select_set(True)
me = el.data; el.name = 'elise'; me.name = 'elise'
# the left leg, the stocking and the shoes of the v3 build, on the same bones, coloured by swatches of this texture
with bpy.data.libraries.load(LEGS) as (src, dst): dst.objects = [o for o in src.objects if o in ('elise_body', 'elise_stockings', 'elise_shoes')]
uvn = me.uv_layers[0].name; added = 0
for o in dst.objects:
    bpy.context.scene.collection.objects.link(o); o.parent = None; d_ = o.data; bm = bmesh.new(); bm.from_mesh(d_)
    if o.name.startswith('elise_body'): drop = [f for f in bm.faces if not all(v.co.x > 0.005 and 0.60 < v.co.z < 0.86 for v in f.verts)]
    elif o.name.startswith('elise_stockings'): drop = [f for f in bm.faces if not all(v.co.x > 0.005 for v in f.verts)]
    else: drop = []
    bmesh.ops.delete(bm, geom=drop, context='FACES'); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(d_); bm.free()
    for l in list(d_.uv_layers): d_.uv_layers.remove(l)
    ul = d_.uv_layers.new(name=uvn); kind = 'skin' if o.name.startswith('elise_body') else 'stocking' if o.name.startswith('elise_stockings') else 'dark'
    for p in d_.polygons:
        k_ = 'dark' if kind == 'stocking' and min(d_.vertices[v].co.z for v in p.vertices) > 0.625 else kind
        for li in p.loop_indices: ul.data[li].uv = SW[k_]
        p.use_smooth = True
    for a_ in [a_.name for a_ in d_.attributes if a_.name in ('torso_w', 'is_head', 'is_socket', 'grid', 'sharp_face')]: d_.attributes.remove(d_.attributes[a_])
    for md in list(o.modifiers): o.modifiers.remove(md)
    d_.materials.clear(); d_.materials.append(me.materials[0]); added += len(d_.polygons)
bpy.ops.object.select_all(action='DESELECT')
for o in dst.objects: o.select_set(True)
el.select_set(True); bpy.context.view_layer.objects.active = el; bpy.ops.object.join(); me = el.data
for o in [o for o in bpy.data.objects if o not in (el, ao)]: bpy.data.objects.remove(o)
print('leg, stocking and shoes added: %d triangles' % added)
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
now = len(me.polygons)
if TRIS < now:
    md = el.modifiers.new('dec', 'DECIMATE'); md.ratio = TRIS / now; md.use_collapse_triangulate = True; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
me = el.data
for p in me.polygons: p.use_smooth = True
mat = me.materials[0]; mat.name = 'elise_toon'; bs = next(x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Metallic'].default_value = 0.0; mat.use_backface_culling = False
bpy.data.images['hero_base.png'].name = 'agent_elise_base'
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
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=False)
print('WROTE', f'{WD}/{NAME}_raw.glb', os.path.getsize(f'{WD}/{NAME}_raw.glb'), 'S10_DONE')
