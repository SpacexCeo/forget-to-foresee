"""Elise stage D: material, inverted-hull outline (thickness by region and by local feature size), face patches
and morph targets, export.
    blender -b elise_build.blend -P d_final.py -- <work dir> <out name> <outline mm> <decimate ratio>"""
import bpy, bmesh, sys, os, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import ezones as Z
a = sys.argv[sys.argv.index("--") + 1:]; WD, NAME, MM, RATIO = a[0], a[1], float(a[2]), float(a[3])
el = bpy.data.objects['elise']; ao = bpy.data.objects['elise_rig']; me = el.data
bpy.context.view_layer.objects.active = el
# the face patches leave the mesh for the decimation and the hull, and come back last
bm = bmesh.new(); bm.from_mesh(me); LP = bm.faces.layers.int['part']; LU = bm.loops.layers.uv.active; PT = []
for f in bm.faces:
    if f[LP] >= Z.PART0: PT.append((f[LP], [(l.vert.index, tuple(l.vert.co), tuple(l[LU].uv)) for l in f.loops]))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[LP] >= Z.PART0], context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
if RATIO < 0.999:
    md = el.modifiers.new('lod', 'DECIMATE'); md.ratio = RATIO; md.use_collapse_triangulate = True
    while el.modifiers[0].name != 'lod': bpy.ops.object.modifier_move_up(modifier='lod')
    bpy.ops.object.modifier_apply(modifier='lod')
def mat(name, img=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 1.0; b.inputs['Metallic'].default_value = 0.0; b.inputs['Specular IOR Level'].default_value = 0.0
    if img:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    else: b.inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1)
    m.use_backface_culling = img is None; return m
img = bpy.data.images.load(WD + '/elise_base.png'); img.name = 'elise_base'
me.materials.clear(); me.materials.append(mat('elise_toon', img)); me.materials.append(mat('elise_outline'))
# ---------------- outline thickness
n0 = len(me.vertices); f0 = len(me.polygons)
co = np.empty(n0 * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3); no = np.empty(n0 * 3); me.vertices.foreach_get('normal', no); no = no.reshape(-1, 3)
pa = np.empty(f0, np.int32); me.attributes['part'].data.foreach_get('value', pa)
fv = np.empty(f0 * 3, np.int32); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3); fn = np.empty(f0 * 3); me.polygons.foreach_get('normal', fn); fn = fn.reshape(-1, 3)
vp = np.zeros(n0, int); vp[fv.ravel()] = np.repeat(pa, 3)
gi = {g.name: g.index for g in el.vertex_groups}; fing = np.zeros(n0)
for v in me.vertices:
    for g in v.groups:
        if el.vertex_groups[g.group].name.startswith(('index_', 'fingers_', 'thumb_')): fing[v.index] += g.weight
x, y, z = co.T; head = vp == 1; hand = vp == 2; k = np.ones(n0)
k[head] = 0.62; k[head & (x < -0.05) & (z > 1.60) & (z < 1.76) & (y > -0.07) & (y < 0.08)] = 0.45      # hair and bun; the butterfly pin
k[head & (y < -0.02) & (z > 1.52) & (z < 1.68) & (abs(x) < 0.085)] = 0.6                                # face
k[hand] = 0.6; k[hand & (fing > 0.3)] = 0.42
leg = (vp == 4) | (vp == 5); k[leg] = 0.5                                                             # the generated legs: a thin line, no slivers
# thin features (hair tips, pin wings, fingers): no more than a fraction of the local thickness
bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(map(int, f)) for f in fv])
thin = np.ones(n0)
for i in np.nonzero(head | hand)[0]:
    nrm = Vector(no[i]); hit = bvh.ray_cast(Vector(co[i]) - nrm * 3e-4, -nrm, 0.05)
    if hit[0] is not None: thin[i] = min(1.0, max(0.2, hit[3] / 0.014))
# sharp creases and fins of the hair: the vertex normal disagrees with its faces, the hull would stick out as a shard
acc = np.zeros(n0); cnt = np.zeros(n0); dt = (no[fv] * fn[:, None, :]).sum(2); np.add.at(acc, fv.ravel(), dt.ravel()); np.add.at(cnt, fv.ravel(), 1)
crease = np.where(head, np.clip(acc / np.maximum(cnt, 1), 0.35, 1), 1.0); crease = np.where(leg, np.clip((acc / np.maximum(cnt, 1) - 0.8) / 0.15, 0, 1), crease)
k = k * thin * crease
e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]]); ks = k.copy()
for _ in range(2):
    s_ = np.zeros(n0); c_ = np.zeros(n0); np.add.at(s_, e[:, 0], ks[e[:, 1]]); np.add.at(c_, e[:, 0], 1); ks = 0.5 * ks + 0.5 * s_ / np.maximum(c_, 1)
k = np.minimum(k, ks)
print('outline k: head mean %.2f min %.2f, hands mean %.2f, body mean %.2f' % (k[head].mean(), k[head].min(), k[hand].mean(), k[~head & ~hand].mean()))
gv = vp == 6; rad_ = co * [1, 1, 0]; rad_ /= np.maximum(np.linalg.norm(rad_, axis=1, keepdims=True), 1e-9); no = np.where(gv[:, None], rad_, no)   # the gown's hull goes straight out
off = no * (MM * 0.001 * k)[:, None]
rad = co[fv].mean(1) * [1, 1, 0]; outer = (pa == 6) & ((fn * rad).sum(1) > 0.3 * np.linalg.norm(rad, axis=1))
t1, t2 = Z.slit(z); inslit = (Z.ang(x, y) > t1 - 12) & (Z.ang(x, y) < t2 + 12)          # the thigh is meant to show there
np.savez(f'{WD}/{NAME}_check.npz', leg=co[((vp == 4) | (vp == 5)) & (z > 0.12) & ~inslit], gown=co[fv[outer]])     # for skirt_check.py
# ---------------- inverted hull, then the patches
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])['geom']
nv = [g for g in geom if isinstance(g, bmesh.types.BMVert)]; nf = [g for g in geom if isinstance(g, bmesh.types.BMFace)]
for i, v in enumerate(nv): v.co = (co[i] + off[i]).tolist()          # duplicate() keeps the order of the input vertices
for f in nf: f.material_index = 1
LPh = bm.faces.layers.int['part']; lipf = [f for f in nf if f[LPh] == 6 and (f.normal.x * f.calc_center_median().x + f.normal.y * f.calc_center_median().y) < 0.3 * (f.calc_center_median().x ** 2 + f.calc_center_median().y ** 2) ** 0.5]
LN = bm.faces.layers.int.get('nohull'); lipf += [f for f in nf if LN is not None and f[LN] == 1]     # the legs' turned inner wall
bmesh.ops.delete(bm, geom=lipf, context='FACES'); nf = [f for f in nf if f.is_valid]            # no hull on the turned-in lip of the hem and slit, nor on the legs' inner wall (both showed as black slivers)
bmesh.ops.reverse_faces(bm, faces=nf)
LP = bm.faces.layers.int['part']; LU = bm.loops.layers.uv.active; LD = bm.verts.layers.deform.verify(); pv = {}; shown = {}
for part, loops in PT:
    vs = []
    for vi, c, uv in loops:
        if vi not in pv:
            v = bm.verts.new((c[0], c[1] + Z.HIDE, c[2])); v[LD][gi['head']] = 1.0; pv[vi] = v; shown[vi] = (c, part)
        vs.append(pv[vi])
    f = bm.faces.new(vs); f[LP] = part; f.material_index = 0; f.smooth = True
    for l, (vi, c, uv) in zip(f.loops, loops): l[LU].uv = uv
bm.verts.index_update(); pidx = {vi: v.index for vi, v in pv.items()}
bm.to_mesh(me); bm.free(); me.validate(); me.update()
# ---------------- morph targets
nt = len(me.vertices); basis = np.empty(nt * 3); me.vertices.foreach_get('co', basis); basis = basis.reshape(-1, 3)
el.shape_key_add(name='Basis', from_mix=False)
fit = json.load(open(WD + '/face_fit.json'))['eye'] if os.path.exists(WD + '/face_fit.json') else {}
def face_y(x_, z_):
    o = Vector((x_, -0.3, z_)); d = Vector((0, 1, 0)); best = None
    for _ in range(60):
        loc, nor, fi, dist = bvh.ray_cast(o, d)
        if loc is None or loc.y > 0.0: break
        if nor.y < -0.15: best = loc.y
        o = loc + d * 1e-4
    return best
wide = np.zeros((nt, 3))                 # 'surprise': the painted eyes stretch (the face skin only)
skinv = [i for i in range(n0) if 1.55 < basis[i, 2] < 1.63 and abs(basis[i, 0]) < 0.09 and basis[i, 1] < -0.03]
for i in skinv:
    fy = face_y(basis[i, 0], basis[i, 2])
    if fy is None or abs(basis[i, 1] - fy) > 0.0035: continue
    for sd in 'LR':
        cx, cz, a_, b_ = fit.get(sd, (*Z.EYE[sd], 0.0215, 0.014)); rho = np.hypot((basis[i, 0] - cx) / a_, (basis[i, 2] - cz) / b_)
        w = float(Z.sstep((2.3 - rho) / 1.3)); wide[i] += w * np.array([(basis[i, 0] - cx) * 0.07, 0, (basis[i, 2] - cz) * 0.22])
names = {Z.PART0 + i: nme for i, nme in enumerate(Z.PATCHES)}
for mname, patches in Z.MORPHS:
    kb = el.shape_key_add(name=mname, from_mix=False); arr = basis.copy()
    for vi, (c, part) in shown.items():
        if names[part] in patches: arr[pidx[vi]] = c
    if mname == 'surprise': arr += wide
    kb.data.foreach_set('co', arr.ravel()); kb.value = 0.0
print('ELISE', NAME, 'tris', len(me.polygons), 'base', f0, 'patch', len(PT), 'verts', len(me.vertices), 'bones', len(ao.data.bones), 'morphs', len(Z.MORPHS), 'surprise verts', int((abs(wide).sum(1) > 0).sum()))
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False,
                          export_morph=True, export_morph_normal=False, export_morph_tangent=False)
