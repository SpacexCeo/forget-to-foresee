"""Elise v3, stages 6 and 7: paint and export (see docs/art/elise/v3-plan.md).

Paint: ONE drawn atlas. The face art (face_art.py) is its lower left block; hair takes a charcoal-to-cobalt gradient
strip (how blue a vertex is comes from its part, smoothed over the mesh: no bands); every other piece takes a flat
swatch. Nothing is projected from a picture, so there is nothing to speckle.
Export: body faces that can never show are removed (under the bodice, under the stockings), each piece is reduced to
its share of the budget (the arms and the face are counted afterwards: a collapsed part fails the build), the pieces
are joined, the inverted-hull outline is added, and the model is written.
    blender -b <work dir>/dressed.blend -P d1_export.py -- <work dir> <out name> <outline mm> <budget scale: 1 main, 0.5 phone>
"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import review, face_art
a = sys.argv[sys.argv.index('--') + 1:]; WD, NAME, MM, LOD = a[0], a[1], float(a[2]), float(a[3])
ao = bpy.data.objects['elise_rig']; O = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
sstep = lambda t: (lambda u: u * u * (3 - 2 * u))(np.clip(t, 0, 1))
def vcol(o): return np.array([v.co[:] for v in o.data.vertices])
def wsum(o, names):
    ids = {g.index for g in o.vertex_groups if g.name.startswith(tuple(names))}; w = np.zeros(len(o.data.vertices))
    for v in o.data.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    return w
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def del_faces(o, mask_v, label):
    b = bmesh.new(); b.from_mesh(o.data); b.verts.ensure_lookup_table(); fs = [f for f in b.faces if all(mask_v[v.index] for v in f.verts)]; n = len(fs)
    bmesh.ops.delete(b, geom=fs, context='FACES'); bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS'); b.to_mesh(o.data); b.free(); o.data.update(); print('hidden faces removed:', label, n)

# ---------------- what can never show
body, gown, stock, hair, pin = O['elise_body'], O['elise_gown'], O['elise_stockings'], O['elise_hair'], O['elise_pin']
gc = vcol(gown); g3 = np.empty(len(gc) * 3); gown.data.attributes['grid'].data.foreach_get('vector', g3); lip = g3.reshape(-1, 3)[:, 2] < 0.5
kdl = KDTree(int(lip.sum()))
for i, p in enumerate(gc[lip]): kdl.insert(p, i)
kdl.balance(); kdg = KDTree(len(gc))
for i, p in enumerate(gc): kdg.insert(p, i)
kdg.balance()
bc = vcol(body); tw = wsum(body, ('pelvis', 'spine', 'chest', 'neck', 'shoulder', 'thigh')); legw = wsum(body, ('thigh', 'shin', 'foot', 'toe')); hid = np.zeros(len(bc), bool)
for i in np.nonzero((tw > 0.5) & (bc[:, 2] > 0.86) & (bc[:, 2] < 1.475))[0]:
    p, gi_, d = kdg.find(tuple(bc[i]))
    if d < 0.03 and kdl.find(p)[2] > 0.035: hid[i] = True                 # under the cloth and well away from any of its edges
hid |= (legw > 0.5) & (bc[:, 2] < 0.652)                                  # under the stockings
hid |= (legw > 0.5) & (bc[:, 0] < -0.01) & (bc[:, 2] < 0.80) & (wsum(body, ('thigh_R', 'shin_R', 'foot_R', 'toe_R')) > 0.5) & (bc[:, 2] > 0.14)   # her right leg is always inside the gown
del_faces(body, hid, 'body under the bodice, the stockings and the gown')
sc = vcol(stock); del_faces(stock, ((wsum(stock, ('toe',)) > 0.6) & (sc[:, 2] < 0.05)) | ((sc[:, 0] < -0.01) & (sc[:, 2] > 0.14)), 'stocking toes inside the shoes; the right stocking inside the gown')

# ---------------- the atlas
T = 2048; face = Image.open(WD + '/face.png').convert('RGB'); AW, AH = face.size; atlas = Image.new('RGB', (T, T), (249, 229, 219)); atlas.paste(face, (0, T - AH))
SW = {'gown': (30, 30, 37), 'stockings': (84, 64, 64), 'shoes': (18, 18, 22), 'ribbons': (132, 36, 46), 'lacing': (14, 14, 18), 'butterfly': (40, 130, 250), 'metal': (26, 26, 34),
      'gold': (214, 176, 92), 'pearl': (240, 236, 228), 'skin': (249, 229, 219)}
px = atlas.load(); SWUV = {}
for k, (n, c) in enumerate(SW.items()):
    x0, y0 = 1700 + 110 * (k % 3), 40 + 110 * (k // 3)
    for y in range(y0, y0 + 100):
        for x in range(x0, x0 + 100): px[x, y] = c
    SWUV[n] = ((x0 + 50) / T, 1 - (y0 + 50) / T)
CH, CO = np.array([44, 44, 54.0]), np.array([30, 52, 190.0]); HX0, HX1, HY0, HY1 = 1480, 1640, 60, 1500       # the hair strip: charcoal at the bottom, cobalt at the top
for y in range(HY0 - 40, HY1 + 40):
    t = float(sstep((HY1 - y) / (HY1 - HY0))); c = tuple(int(v) for v in CH + (CO - CH) * t)
    for x in range(HX0, HX1): px[x, y] = c
EYE_BLOCK = {}                                         # closed eyes for the blink patches
for k, (sd, sg) in enumerate((('L', 1), ('R', -1))):
    ce = face_art.closed_eye(sg); atlas.paste(ce, (1660, 520 + 260 * k)); EYE_BLOCK[sd] = (1660, 520 + 260 * k, ce.size[0], ce.size[1])
atlas.save(WD + '/elise_atlas.png')
img = bpy.data.images.load(WD + '/elise_atlas.png'); img.pack()
mat = bpy.data.materials.new('elise_toon'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Metallic'].default_value = 0.0
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
def uv_layer(o):
    for l in [l for l in o.data.uv_layers if l.name != 'UVMap']: o.data.uv_layers.remove(l)
    return o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
# the body keeps the face art's own layout, moved into its block
ul = uv_layer(body).data; uv = np.empty(len(ul) * 2); ul.foreach_get('uv', uv); uv = uv.reshape(-1, 2); uv[:, 0] *= AW / T; uv[:, 1] *= AH / T; ul.foreach_set('uv', uv.ravel())
# hair: how blue a vertex is, from the tone of the faces around it, smoothed over the mesh
hm = hair.data; names = [m.name.replace('elise_', '') for m in hm.materials]; val = {'cobalt': 1.0, 'blend': 0.5}
acc = np.zeros(len(hm.vertices)); cnt = np.zeros(len(hm.vertices))
for p in hm.polygons:
    for v in p.vertices: acc[v] += val.get(names[p.material_index], 0.0); cnt[v] += 1
cob = acc / np.maximum(cnt, 1); ed = np.array([e.vertices[:] for e in hm.edges])
for _ in range(4):
    s_ = np.zeros(len(cob)); c_ = np.zeros(len(cob)); np.add.at(s_, ed[:, 0], cob[ed[:, 1]]); np.add.at(s_, ed[:, 1], cob[ed[:, 0]]); np.add.at(c_, ed[:, 0], 1); np.add.at(c_, ed[:, 1], 1)
    cob = 0.4 * cob + 0.6 * s_ / np.maximum(c_, 1)
ul = uv_layer(hair).data
for p in hm.polygons:
    for li, v in zip(p.loop_indices, p.vertices): ul[li].uv = ((HX0 + HX1) / 2 / T, 1 - (HY1 - cob[v] * (HY1 - HY0)) / T)
def flat(o, pick):
    ul = uv_layer(o).data; names = [m.name.replace('elise_', '').replace('_flat', '') for m in o.data.materials]
    for p in o.data.polygons:
        for li in p.loop_indices: ul[li].uv = SWUV[pick(names[p.material_index] if names else '')]
flat(pin, lambda n: n if n in SWUV else 'metal')
for n in ('gown', 'stockings', 'shoes', 'ribbons', 'lacing'): flat(O['elise_' + n], lambda _, n=n: n)
# ---------------- blink patches: a drawn closed eye on a small sheet over each eye, resting 6 mm behind the face skin;
# the morph targets bring it 1 mm in front of the skin
HW_, LO_, HI_, HIDE, SHOW = 0.031, 0.018, 0.022, 0.006, 0.0011
bvh_b = BVHTree.FromPolygons([Vector(v) for v in vcol(body)], [tuple(p.vertices) for p in body.data.polygons])
pv, pf, puv, pside = [], [], [], []
for sd, sg in (('L', 1), ('R', -1)):
    cx, cz = sg * (body['eye_dx'] + 0.0015), body['eye_z']; NXp, NZp = 8, 6; x0, y0, w_, h_ = EYE_BLOCK[sd]; base = len(pv)
    for j in range(NZp + 1):
        for i in range(NXp + 1):
            fx, fz = i / NXp, j / NZp; x = cx - HW_ + 2 * HW_ * fx; z = cz - LO_ + (LO_ + HI_) * fz
            hit = bvh_b.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)), 1.0)[0]; pv.append((x, (hit.y if hit else -0.09) + HIDE, z)); pside.append(1 if sd == 'L' else 2)
            puv.append(((x0 + 3 + (w_ - 6) * fx) / T, 1 - (y0 + 3 + (h_ - 6) * (1 - fz)) / T))
    pf += [(base + j * (NXp + 1) + i, base + j * (NXp + 1) + i + 1, base + (j + 1) * (NXp + 1) + i + 1, base + (j + 1) * (NXp + 1) + i) for j in range(NZp) for i in range(NXp)]
fm = bpy.data.meshes.new('elise_face'); fm.from_pydata(pv, [], pf); fm.update(); fo = bpy.data.objects.new('elise_face', fm); bpy.context.scene.collection.objects.link(fo)
ul = fm.uv_layers.new(name='UVMap').data
for p in fm.polygons:
    for li, v in zip(p.loop_indices, p.vertices): ul[li].uv = puv[v]
    if p.normal.y > 0: pass
b_ = bmesh.new(); b_.from_mesh(fm); bmesh.ops.recalc_face_normals(b_, faces=b_.faces[:]); b_.normal_update()
if sum(f.normal.y for f in b_.faces) > 0: bmesh.ops.reverse_faces(b_, faces=b_.faces[:])
b_.to_mesh(fm); b_.free()
fo.vertex_groups.new(name='head').add(list(range(len(pv))), 1.0, 'REPLACE'); fo.parent = ao; fo.modifiers.new('rig', 'ARMATURE').object = ao
O['elise_face'] = fo
for n, o in O.items():
    at = o.data.attributes.new('patch', 'INT', 'POINT')
    if o is fo: at.data.foreach_set('value', np.array(pside, np.int32))
for o in O.values(): o.data.materials.clear(); o.data.materials.append(mat)

# ---------------- budget (triangles of the base mesh; the hull doubles them)
BUD = {'elise_body': 10800, 'elise_hair': 4900, 'elise_pin': 400, 'elise_gown': 3900, 'elise_stockings': 900, 'elise_shoes': 560, 'elise_ribbons': 440, 'elise_lacing': 250}
def decim(o, target, vgroup=None, factor=3.0):
    n = tris(o)
    if n <= target: return
    bpy.context.view_layer.objects.active = o; md = o.modifiers.new('lod', 'DECIMATE'); md.ratio = target / n; md.use_collapse_triangulate = True
    if vgroup: md.vertex_group = vgroup; md.invert_vertex_group = True; md.vertex_group_factor = factor
    while o.modifiers[0].name != 'lod': bpy.ops.object.modifier_move_up(modifier='lod')
    bpy.ops.object.modifier_apply(modifier='lod')
before = {n: tris(o) for n, o in O.items()}
def region_decim(o, mask, ratio, label):
    """Reduce only the faces of one region (never a blind pass over the whole body: that is how the arms were lost)."""
    vg = o.vertex_groups.new(name='_reg')
    idx = [int(i) for i in np.nonzero(mask)[0]]
    if not idx: o.vertex_groups.remove(vg); return
    vg.add(idx, 1.0, 'REPLACE'); n = tris(o)
    bpy.context.view_layer.objects.active = o; md = o.modifiers.new('lod', 'DECIMATE'); reg_t = sum(len(p_.vertices) - 2 for p_ in o.data.polygons if all(mask[v] for v in p_.vertices)); md.ratio = (n - reg_t * (1 - ratio)) / n      # the modifier's ratio counts the whole mesh
    md.use_collapse_triangulate = True; md.vertex_group = '_reg'
    while o.modifiers[0].name != 'lod': bpy.ops.object.modifier_move_up(modifier='lod')
    bpy.ops.object.modifier_apply(modifier='lod'); o.vertex_groups.remove(o.vertex_groups['_reg']); print('  body region %-10s ratio %.2f: %d -> %d' % (label, ratio, n, tris(o)))
def masks():
    c = vcol(body); hw_ = wsum(body, ('head',)) > 0.5; hand = wsum(body, ('hand', 'thumb', 'index', 'fingers')) > 0.5; foot = wsum(body, ('foot', 'toe')) > 0.5
    facew = hw_ & (c[:, 1] < 0.0) & (np.abs(c[:, 0]) < 0.078) & (c[:, 2] < body['eye_z'] + 0.05)
    return {'hands': hand, 'feet': foot, 'skull': hw_ & ~facew, 'face': facew, 'rest': ~(hand | foot | hw_)}
K = 1.0 if LOD >= 1 else 0.62
for label, ratio in (('hands', 0.34 * K), ('feet', 0.30 * K), ('skull', 0.30 * K)): region_decim(body, masks()[label], ratio, label)
left = int(BUD['elise_body'] * LOD) - tris(body); m_ = masks()['rest']; rest_t = sum(len(p.vertices) - 2 for p in body.data.polygons if all(m_[v] for v in p.vertices))
region_decim(body, m_, float(np.clip((rest_t + left) / max(rest_t, 1), 0.3, 1.0)), 'rest')
for n, o in O.items():
    if o is not body and n in BUD: decim(o, int(BUD[n] * LOD))
print('triangles by piece (before, after):', {n.replace('elise_', ''): (before[n], tris(o)) for n, o in O.items()})
# no part may collapse: every limb keeps a tube of triangles
for part, least in (('upperarm_L', 60), ('upperarm_R', 60), ('forearm_L', 60), ('forearm_R', 60), ('hand_L', 300), ('hand_R', 300), ('neck', 30)):
    w = wsum(body, (part,) if not part.startswith('hand') else tuple(k_ + part[-1] for k_ in ('hand_', 'thumb_', 'index_', 'fingers_'))); n = sum(1 for p in body.data.polygons if min(w[v] for v in p.vertices) > 0.3)
    assert n >= least * LOD, 'PART COLLAPSED: %s has %d faces' % (part, n)
    print('part', part, n, 'faces')

# ---------------- review sheet of the painted pieces (before the hull)
if LOD >= 1:
    os.makedirs(WD + '/r', exist_ok=True); V4 = lambda az, el=0: [0, 0, 0.88, 1.86, az, el]; hz = 1.64
    VIEWS = [[(n, V4(az, el), 520, 960) for n, az, el in (('front', 0, 0), ('three quarter', 35, 5), ('her left', 90, 0), ('back', 180, 0))],
             [('face', [0, 0, hz, 0.40, 0, 0], 520, 520), ('face three quarter', [0, 0, hz, 0.40, 35, 3], 520, 520), ('head her right', [0, 0, hz, 0.46, 270, 0], 520, 520), ('head back', [0, 0.03, hz, 0.46, 180, 5], 520, 520)]]
    review.sheet(WD, VIEWS, 'd1.jpg')

# ---------------- join; each face remembers its piece
PID = {'elise_body': 0, 'elise_hair': 1, 'elise_gown': 2, 'elise_stockings': 3, 'elise_shoes': 4, 'elise_ribbons': 5, 'elise_lacing': 6, 'elise_face': 7, 'elise_pin': 8}
for n, o in O.items():
    at = o.data.attributes.new('layer', 'INT', 'FACE'); at.data.foreach_set('value', np.full(len(o.data.polygons), PID[n], np.int32))
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
for o in O.values(): o.select_set(True)
bpy.context.view_layer.objects.active = body; bpy.ops.object.join(); el = body; el.name = 'elise'; el.data.name = 'elise'; me = el.data
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
for nm in [a_.name for a_ in me.attributes if a_.name in ('grid', 'is_head', 'is_socket', 'torso_w', 'cobalt')]: me.attributes.remove(me.attributes[nm])
mo = bpy.data.materials.new('elise_outline'); mo.use_nodes = True; bs = mo.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1); bs.inputs['Roughness'].default_value = 1.0; mo.use_backface_culling = True
me.materials.clear(); me.materials.append(mat); me.materials.append(mo)

# ---------------- outline thickness by piece, thin on the face, the hands and thin parts
n0 = len(me.vertices); f0 = len(me.polygons); co = vcol(el); no = np.array([v.normal[:] for v in me.vertices])
lay = np.empty(f0, np.int32); me.attributes['layer'].data.foreach_get('value', lay); fv = np.empty(f0 * 3, np.int32); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
vl = np.zeros(n0, int); vl[fv.ravel()] = np.repeat(lay, 3); fing = wsum(el, ('index_', 'fingers_', 'thumb_')); handw = wsum(el, ('hand_',)) + fing; hw = wsum(el, ('head',))
k = np.ones(n0); k[vl == 1] = 0.62; k[vl == 8] = 0.4; k[(vl == 0) & (hw > 0.5)] = 0.55
k[(vl == 0) & (handw > 0.5)] = 0.6; k[(vl == 0) & (fing > 0.3)] = 0.42; k[vl == 3] = 0.9; k[vl == 4] = 0.8; k[vl == 5] = 0.7; k[vl == 6] = 0.35
bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(map(int, f)) for f in fv]); thin = np.ones(n0)
for i in np.nonzero((vl == 1) | (vl == 8) | (handw > 0.5) | (vl >= 5))[0]:      # thin features: no more than a fraction of the local thickness
    nrm = Vector(no[i]); hit = bvh.ray_cast(Vector(co[i]) - nrm * 3e-4, -nrm, 0.05)
    if hit[0] is not None: thin[i] = min(1.0, max(0.2, hit[3] / 0.014))
k = k * thin; e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]]); ks = k.copy()
for _ in range(2):
    s_ = np.zeros(n0); c_ = np.zeros(n0); np.add.at(s_, e[:, 0], ks[e[:, 1]]); np.add.at(c_, e[:, 0], 1); ks = 0.5 * ks + 0.5 * s_ / np.maximum(c_, 1)
k = np.minimum(k, ks); off = no * (MM * 0.001 * k)[:, None]
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
LL = bm.faces.layers.int['layer']; src_f = [f for f in bm.faces if f[LL] != 7]; src_v = list({v for f in src_f for v in f.verts}); src_e = list({e_ for f in src_f for e_ in f.edges})      # no hull on the blink patches
geom = bmesh.ops.duplicate(bm, geom=src_v + src_e + src_f); vmap = geom['vert_map']; nf = [g for g in geom['geom'] if isinstance(g, bmesh.types.BMFace)]
for v in src_v: vmap[v].co = (co[v.index] + off[v.index]).tolist()
for f in nf: f.material_index = 1
bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.validate(); me.update()
# ---------------- morph targets
nt = len(me.vertices); basis = vcol(el); pt = np.empty(nt, np.int32); me.attributes['patch'].data.foreach_get('value', pt)
el.shape_key_add(name='Basis', from_mix=False)
for mname, ids in (('blink', (1, 2)), ('blink_L', (1,)), ('blink_R', (2,))):
    kb = el.shape_key_add(name=mname, from_mix=False); arr = basis.copy(); arr[np.isin(pt, ids), 1] -= HIDE + SHOW; kb.data.foreach_set('co', arr.ravel()); kb.value = 0.0
me.attributes.remove(me.attributes['patch'])
ntri = len(me.polygons); print('ELISE', NAME, 'tris', ntri, 'base', f0, 'hull', ntri - f0, 'verts', len(me.vertices), 'bones', len(ao.data.bones), 'materials', len(me.materials))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not el]: bpy.data.objects.remove(o)
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=True, export_morph_normal=False, export_morph_tangent=False)
print('WROTE', f'{WD}/{NAME}_raw.glb', os.path.getsize(f'{WD}/{NAME}_raw.glb'))
