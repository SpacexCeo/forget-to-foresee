"""Elise v2, stage D1: the game model from the layered scene.
Body faces that can never show (under the bodice, under the stockings, toes in the shoes) are removed, every layer is
reduced to its share of the budget, the layers are joined, the outline hull is added (thickness by layer, thin on the
face, hands and thin parts), the face patches get their morph targets, and the model is exported.
    blender -b elise_v2.blend -P d1_export.py -- <work dir> <out name> <outline mm> <scale of the budget: 1 main, 0.5 phone>"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import ezones as Z
a = sys.argv[sys.argv.index("--") + 1:]; WD, NAME, MM, LOD = a[0], a[1], float(a[2]), float(a[3])
ao = bpy.data.objects['elise_rig']; O = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
def vcol(o): return np.array([v.co[:] for v in o.data.vertices])
def wsum(o, names):
    ids = {g.index for g in o.vertex_groups if g.name.startswith(tuple(names))}; w = np.zeros(len(o.data.vertices))
    for v in o.data.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    return w
def del_faces(o, mask_v, label):
    """Delete the faces whose vertices are all marked."""
    b = bmesh.new(); b.from_mesh(o.data); b.verts.ensure_lookup_table(); fs = [f for f in b.faces if all(mask_v[v.index] for v in f.verts)]; n = len(fs)
    bmesh.ops.delete(b, geom=fs, context='FACES'); bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS'); b.to_mesh(o.data); b.free(); o.data.update(); print('hidden faces removed:', label, n)
# ---------------- what can never show
body, gown, stock = O['elise_body'], O['elise_gown'], O['elise_stockings']
gc = vcol(gown); g3 = np.empty(len(gc) * 3); gown.data.attributes['grid'].data.foreach_get('vector', g3); lip = g3.reshape(-1, 3)[:, 2] < 0.5
kdl = KDTree(int(lip.sum()))
for i, p in enumerate(gc[lip]): kdl.insert(p, i)
kdl.balance(); kdg = KDTree(len(gc))
for i, p in enumerate(gc): kdg.insert(p, i)
kdg.balance()
bc = vcol(body); tw = wsum(body, ('pelvis', 'spine', 'chest', 'neck', 'shoulder', 'thigh')); legw = wsum(body, ('thigh', 'shin', 'foot', 'toe')); hid = np.zeros(len(bc), bool)
for i in np.nonzero((tw > 0.5) & (bc[:, 2] > 0.86) & (bc[:, 2] < 1.475))[0]:
    p, gi_, d = kdg.find(tuple(bc[i]))
    if d < 0.02 and kdl.find(p)[2] > 0.035: hid[i] = True                 # under the cloth and well away from any of its edges
hid |= (legw > 0.5) & (bc[:, 2] < 0.652)                                  # under the stockings
del_faces(body, hid, 'body under the bodice and the stockings')
sc = vcol(stock); del_faces(stock, (wsum(stock, ('toe',)) > 0.6) & (sc[:, 2] < 0.05), 'stocking toes inside the shoes')
# ---------------- budget
BUD = {'elise_body': 5400, 'elise_gown': 3700, 'elise_stockings': 1700, 'elise_shoes': 560, 'elise_ribbons': 440, 'elise_lacing': 250, 'elise_face': 1280}
HEAD_T = 10800
def tris(o): o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
def decim(o, target, vgroup=None, factor=4.0):
    n = tris(o)
    if n <= target: return
    bpy.context.view_layer.objects.active = o; md = o.modifiers.new('lod', 'DECIMATE'); md.ratio = target / n; md.use_collapse_triangulate = True
    if vgroup: md.vertex_group = vgroup; md.invert_vertex_group = True; md.vertex_group_factor = factor
    while o.modifiers[0].name != 'lod': bpy.ops.object.modifier_move_up(modifier='lod')
    bpy.ops.object.modifier_apply(modifier='lod')
# the body: its own part and the old head are reduced separately (the head keeps its triangles on the main model)
me = body.data; vh = np.zeros(len(me.vertices), np.int32); me.attributes['v1head'].data.foreach_get('value', vh)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body; bpy.ops.object.mode_set(mode='EDIT'); b = bmesh.from_edit_mesh(me)
for f in b.faces: f.select_set(all(vh[v.index] for v in f.verts))
bmesh.update_edit_mesh(me); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
head = [o for o in bpy.context.selected_objects if o is not body][0]; head.name = 'elise_head'; O['elise_head'] = head
for o in (body, head):
    for l in [l for l in o.data.uv_layers if l.name != 'UVMap']: o.data.uv_layers.remove(l)
fo = O['elise_face']
for l in [l for l in fo.data.uv_layers if l.name != 'UVMap']: fo.data.uv_layers.remove(l)
keep_w = wsum(body, ('hand', 'thumb', 'index', 'fingers')); vg = body.vertex_groups.new(name='_keep');
for i in np.nonzero(keep_w > 0.3)[0]: vg.add([int(i)], 1.0, 'REPLACE')
before = {n: tris(o) for n, o in O.items()}
# the phone model (LOD < 1, 24k triangles with the hull): the hands are protected less (at full protection the body
# stops near 6.5k whatever the target) and the head is reduced a little further
decim(body, int(BUD['elise_body'] * LOD), '_keep', 4.0 if LOD >= 1 else 1.0); decim(head, int(HEAD_T * (LOD if LOD >= 1 else LOD * 0.9)))
if tris(body) > 1.15 * BUD['elise_body'] * LOD: decim(body, int(BUD['elise_body'] * LOD))
for n in ('elise_gown', 'elise_stockings', 'elise_shoes', 'elise_ribbons', 'elise_lacing'): decim(O[n], int(BUD[n] * LOD))
print('triangles by layer:', {n.replace('elise_', ''): (before[n], tris(o)) for n, o in O.items()})
# ---------------- join; each face remembers its layer
PID = {'elise_body': 0, 'elise_head': 1, 'elise_gown': 2, 'elise_stockings': 3, 'elise_shoes': 4, 'elise_ribbons': 5, 'elise_lacing': 6, 'elise_face': 7}
for n, o in O.items():
    at = o.data.attributes.new('layer', 'INT', 'FACE'); at.data.foreach_set('value', np.full(len(o.data.polygons), PID[n], np.int32))
    if 'patch' not in o.data.attributes: o.data.attributes.new('patch', 'INT', 'POINT')
    for g in list(o.vertex_groups):
        if g.name == '_keep': o.vertex_groups.remove(g)
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
for o in O.values(): o.select_set(True)
bpy.context.view_layer.objects.active = body; bpy.ops.object.join(); el = body; el.name = 'elise'; el.data.name = 'elise'; me = el.data
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
for nm in [a_.name for a_ in me.attributes if a_.name in ('grid', 'v1head', 'face_patch')]: me.attributes.remove(me.attributes[nm])
mat = bpy.data.materials['elise_toon']; mo = bpy.data.materials.new('elise_outline'); mo.use_nodes = True; bs = mo.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1); bs.inputs['Roughness'].default_value = 1.0; mo.use_backface_culling = True
me.materials.clear(); me.materials.append(mat); me.materials.append(mo)
# ---------------- outline thickness
n0 = len(me.vertices); f0 = len(me.polygons); co = vcol(el); no = np.array([v.normal[:] for v in me.vertices])
lay = np.empty(f0, np.int32); me.attributes['layer'].data.foreach_get('value', lay); fv = np.empty(f0 * 3, np.int32); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
fn = np.array([p.normal[:] for p in me.polygons]); vl = np.zeros(n0, int); vl[fv.ravel()] = np.repeat(lay, 3); fing = wsum(el, ('index_', 'fingers_', 'thumb_')); handw = wsum(el, ('hand_',)) + fing
x, y, z = co.T; head_ = vl == 1; k = np.ones(n0)
k[head_] = 0.62; k[head_ & (x < -0.05) & (z > 1.60) & (z < 1.76) & (y > -0.07) & (y < 0.08)] = 0.45      # hair and bun; the butterfly pin
k[head_ & (y < -0.02) & (z > 1.52) & (z < 1.68) & (abs(x) < 0.085)] = 0.6                                # the face: silhouette only, thin
k[(vl == 0) & (handw > 0.5)] = 0.6; k[(vl == 0) & (fing > 0.3)] = 0.42; k[vl == 3] = 0.9; k[vl == 4] = 0.8; k[vl == 5] = 0.7; k[vl == 6] = 0.35
bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(map(int, f)) for f in fv]); thin = np.ones(n0)
for i in np.nonzero(head_ | (handw > 0.5) | (vl >= 5))[0]:                # thin features: no more than a fraction of the local thickness
    nrm = Vector(no[i]); hit = bvh.ray_cast(Vector(co[i]) - nrm * 3e-4, -nrm, 0.05)
    if hit[0] is not None: thin[i] = min(1.0, max(0.2, hit[3] / 0.014))
acc = np.zeros(n0); cnt = np.zeros(n0); dt = (no[fv] * fn[:, None, :]).sum(2); np.add.at(acc, fv.ravel(), dt.ravel()); np.add.at(cnt, fv.ravel(), 1)
crease = np.where(head_, np.clip(acc / np.maximum(cnt, 1), 0.35, 1), 1.0); k = k * thin * crease
e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]]); ks = k.copy()
for _ in range(2):
    s_ = np.zeros(n0); c_ = np.zeros(n0); np.add.at(s_, e[:, 0], ks[e[:, 1]]); np.add.at(c_, e[:, 0], 1); ks = 0.5 * ks + 0.5 * s_ / np.maximum(c_, 1)
k = np.minimum(k, ks); off = no * (MM * 0.001 * k)[:, None]
print('outline k by layer:', {n.replace('elise_', ''): round(float(k[vl == i].mean()), 2) for n, i in PID.items() if (vl == i).any()})
# ---------------- inverted hull (not for the face patches)
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); LL = bm.faces.layers.int['layer']
src_f = [f for f in bm.faces if f[LL] != 7]; src_v = list({v for f in src_f for v in f.verts}); src_e = list({e_ for f in src_f for e_ in f.edges})
geom = bmesh.ops.duplicate(bm, geom=src_v + src_e + src_f); vmap = geom['vert_map']; nf = [g for g in geom['geom'] if isinstance(g, bmesh.types.BMFace)]
for v in src_v: vmap[v].co = (co[v.index] + off[v.index]).tolist()
for f in nf: f.material_index = 1
bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.validate(); me.update()
# ---------------- morph targets: each shows painted patches that rest 6 mm behind the face skin
nt = len(me.vertices); basis = vcol(el); pt = np.empty(nt, np.int32); me.attributes['patch'].data.foreach_get('value', pt)
el.shape_key_add(name='Basis', from_mix=False); names = {Z.PART0 + i: nme for i, nme in enumerate(Z.PATCHES)}
for mname, patches in Z.MORPHS:
    kb = el.shape_key_add(name=mname, from_mix=False); arr = basis.copy(); ids = [pid for pid, nme in names.items() if nme in patches]; m = np.isin(pt, ids); arr[m, 1] -= Z.HIDE
    kb.data.foreach_set('co', arr.ravel()); kb.value = 0.0
me.attributes.remove(me.attributes['patch'])
ntri = len(me.polygons); print('ELISE', NAME, 'tris', ntri, 'base', f0, 'hull', ntri - f0, 'verts', nt, 'bones', len(ao.data.bones), 'morphs', len(Z.MORPHS), 'materials', len(me.materials))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not el]: bpy.data.objects.remove(o)
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False,
                          export_morph=True, export_morph_normal=False, export_morph_tangent=False)
