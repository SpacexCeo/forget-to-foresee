"""Elise v2, stage C1: one UV layout and one base-colour texture for every layer (sheet 06).
Face, hair and the butterfly pin take the first version's paint (closest point on its model); the face patches of the
morph targets copy their old texels; skin, gown (with seam and fold lines), stockings (sheer, lace top), shoes, ribbons
and lacing are painted from texel positions.
    blender -b layers.blend -P c1_tex.py -- <work dir> [size]      writes elise_base.png, elise_v2.blend, r/c1_tex.jpg"""
import bpy, bmesh, sys, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import rend, ezones as Z
a = sys.argv[sys.argv.index("--") + 1:]; WD = a[0]; SZ = int(a[1]) if len(a) > 1 else 2048
S = np.load(WD + '/src.npz'); FC = np.load(WD + '/face.npz'); ao = bpy.data.objects['elise_rig']
OV, OF, OUV, OPART, TEX = S['V'], S['F'], S['UV'], S['part'], S['tex'].astype(np.float32) / 255.0; TH_, TW_ = TEX.shape[:2]
def tex_at(uv): return TEX[np.clip((uv[:, 1] * TH_).astype(int), 0, TH_ - 1), np.clip((uv[:, 0] * TW_).astype(int), 0, TW_ - 1)]
# ---------------- the face patches of the morph targets come over from the first version as they are
pm = OPART >= Z.PART0; pf = OF[pm]; used = np.unique(pf); idx = -np.ones(len(OV), int); idx[used] = np.arange(len(used))
fm = bpy.data.meshes.new('elise_face'); fm.from_pydata([tuple(map(float, v)) for v in OV[used]], [], [tuple(map(int, f)) for f in idx[pf]]); fm.update()
fo = bpy.data.objects.new('elise_face', fm); bpy.context.scene.collection.objects.link(fo); fo.parent = ao; fo.modifiers.new('rig', 'ARMATURE').object = ao
fo.vertex_groups.new(name='head').add(list(range(len(used))), 1.0, 'REPLACE')
at = fm.attributes.new('patch', 'INT', 'POINT'); vp = np.zeros(len(used), np.int32); vp[idx[pf].ravel()] = np.repeat(OPART[pm], 3); at.data.foreach_set('value', vp)
uo = fm.uv_layers.new(name='old'); un = fm.uv_layers.new(name='UVMap'); ouv = OUV[pm].reshape(-1, 2)
uo.data.foreach_set('uv', ouv.ravel().astype(np.float32)); un.data.foreach_set('uv', ouv.ravel().astype(np.float32)); fm.uv_layers.active = un
for p in fm.polygons: p.use_smooth = True
print('face patches: verts', len(used), 'tris', len(pf))
PARTS = {'elise_body': ('skin', 0.42), 'elise_gown': ('gown', 0.55), 'elise_stockings': ('stock', 0.7), 'elise_shoes': ('shoe', 0.5), 'elise_ribbons': ('ribbon', 0.55), 'elise_lacing': ('lace', 0.6),
         'elise_face': ('uvcopy', 2.6)}
HEAD_D = 1.25
objs = [bpy.data.objects[n] for n in PARTS]
# ---------------- UVs
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    me = o.data; bpy.context.view_layer.objects.active = o; o.select_set(True)
    if o.name == 'elise_body':
        me.uv_layers.active = me.uv_layers['UVMap']; uv = me.uv_layers['UVMap']; co = np.array([v.co[:] for v in me.vertices]); n = 0
        for p in me.polygons:                       # the neck seam: one flat strip
            if len(p.vertices) == 3 and all(abs(uv.data[l].uv[0]) + abs(uv.data[l].uv[1]) < 1e-9 for l in p.loop_indices):
                for l, v in zip(p.loop_indices, p.vertices): uv.data[l].uv = (3.0 + math.atan2(co[v, 1], co[v, 0]) * 0.05, co[v, 2])
                n += 1
        print('body: neck seam triangles', n)
    elif o.name == 'elise_gown':
        uv = me.uv_layers.new(name='UVMap'); g = np.empty(len(me.vertices) * 3); me.attributes['grid'].data.foreach_get('vector', g); g = g.reshape(-1, 3)
        for l in me.loops: uv.data[l.index].uv = (g[l.vertex_index, 0] * 0.016, -g[l.vertex_index, 1] * 0.024)
    elif o.name != 'elise_face':
        me.uv_layers.new(name='UVMap'); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False); bpy.ops.object.mode_set(mode='OBJECT')
    o.select_set(False)
# every island at the same texel density, then each layer's own factor (face and pin dense, plain cloth and skin sparse)
def island_scale(o):
    me = o.data; uv = me.uv_layers.active.data; n = len(me.loops); t = np.empty(n * 2); uv.foreach_get('uv', t); t = t.reshape(-1, 2); me.calc_loop_triangles()
    lt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('loops', lt); lt = lt.reshape(-1, 3); vt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', vt); vt = vt.reshape(-1, 3)
    co = np.array([v.co[:] for v in me.vertices]); a3 = np.linalg.norm(np.cross(co[vt[:, 1]] - co[vt[:, 0]], co[vt[:, 2]] - co[vt[:, 0]]), axis=1) / 2
    e1, e2 = t[lt[:, 1]] - t[lt[:, 0]], t[lt[:, 2]] - t[lt[:, 0]]; a2 = abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) / 2
    # islands by shared UV corners
    key = np.round(t * 1e5).astype(np.int64); key = key[:, 0] * 4000003 + key[:, 1] + np.array([l.vertex_index for l in me.loops], np.int64) * 7919000033
    _, inv = np.unique(key, return_inverse=True); par = np.arange(inv.max() + 1)
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for tri in inv[lt]:
        r0 = find(tri[0])
        for k in (1, 2):
            r1 = find(tri[k])
            if r1 != r0: par[r1] = r0
    root = np.array([find(i) for i in inv]); tri_root = root[lt[:, 0]]
    dens = PARTS[o.name][1]; fpl = None; khead = 1.0
    if o.name == 'elise_body': fpl = t[:, 0] > 4.5; mh_ = fpl[lt].all(1); khead = math.sqrt(a3[mh_].sum() / max(a2[mh_].sum(), 1e-12)) * HEAD_D      # the old head's islands keep their own relative sizes
    for r in np.unique(tri_root):
        m = tri_root == r; s2, s3 = a2[m].sum(), a3[m].sum()
        if s2 <= 0 or s3 <= 0: continue
        lm = root == r; k = khead if (fpl is not None and fpl[lm].all()) else math.sqrt(s3 / s2) * dens; c = t[lm].mean(0); t[lm] = c + (t[lm] - c) * k
    uv.foreach_set('uv', t.ravel())
for o in objs: island_scale(o)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=0.0022, scale=True); bpy.ops.object.mode_set(mode='OBJECT')
# ---------------- texels
bvh_old = BVHTree.FromPolygons([tuple(p) for p in OV], [tuple(map(int, f)) for f in OF[OPART == 1]]); old_uv = OUV[OPART == 1]; old_f = OF[OPART == 1]
RULE = {'skin': 0, 'gown': 1, 'stock': 2, 'shoe': 3, 'ribbon': 4, 'lace': 5, 'xfer': 6, 'uvcopy': 7, 'face': 8}
img = np.zeros((SZ, SZ, 3), np.float32); filled = np.zeros((SZ, SZ), bool); T = {k: [] for k in ('y', 'x', 'P', 'A', 'r')}
for o in objs:
    me = o.data; me.calc_loop_triangles(); nl = len(me.loops); uv = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    if uv.min() < -1e-4 or uv.max() > 1 + 1e-4: print('UV OUT OF RANGE', o.name, uv.min(0), uv.max(0))
    lt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('loops', lt); lt = lt.reshape(-1, 3); vt = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', vt); vt = vt.reshape(-1, 3)
    co = np.array([v.co[:] for v in me.vertices]); rule = RULE[PARTS[o.name][0]]; A = np.zeros((len(me.vertices), 3)); LA = None; rt = np.full(len(lt), rule)
    if o.name == 'elise_body':
        vh = np.zeros(len(me.vertices), np.int32); me.attributes['v1head'].data.foreach_get('value', vh); ol = np.empty(nl * 2); me.uv_layers['old'].data.foreach_get('uv', ol)
        LA = np.c_[ol.reshape(-1, 2), np.zeros(nl)]; rt[vh[vt].all(1)] = RULE['uvcopy']
    if o.name == 'elise_gown':
        g = np.empty(len(me.vertices) * 3); me.attributes['grid'].data.foreach_get('vector', g); A = g.reshape(-1, 3)
    if o.name == 'elise_face':
        ol = np.empty(nl * 2); me.uv_layers['old'].data.foreach_get('uv', ol); LA = np.c_[ol.reshape(-1, 2), np.zeros(nl)]
    for k in range(len(lt)):
        p = uv[lt[k]] * SZ; x0, x1 = int(math.floor(p[:, 0].min())), int(math.ceil(p[:, 0].max())); y0, y1 = int(math.floor(p[:, 1].min())), int(math.ceil(p[:, 1].max()))
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, SZ - 1), min(y1, SZ - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5); d = (p[1, 1] - p[2, 1]) * (p[0, 0] - p[2, 0]) + (p[2, 0] - p[1, 0]) * (p[0, 1] - p[2, 1])
        if abs(d) < 1e-12: continue
        b0 = ((p[1, 1] - p[2, 1]) * (xs - p[2, 0]) + (p[2, 0] - p[1, 0]) * (ys - p[2, 1])) / d; b1 = ((p[2, 1] - p[0, 1]) * (xs - p[2, 0]) + (p[0, 0] - p[2, 0]) * (ys - p[2, 1])) / d; b2 = 1 - b0 - b1
        m = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02)
        if not m.any(): continue
        B = np.stack([b0[m], b1[m], b2[m]], 1); T['y'].append(ys[m].astype(int)); T['x'].append(xs[m].astype(int)); T['P'].append(B @ co[vt[k]]); T['A'].append(B @ (LA[lt[k]] if LA is not None else A[vt[k]])); T['r'].append(np.full(len(B), rt[k]))
ty, tx, P, A, R = (np.concatenate(T[k]) for k in ('y', 'x', 'P', 'A', 'r')); print('texels', len(ty), 'of', SZ * SZ, '(%.0f%%)' % (100 * len(ty) / SZ / SZ), 'by rule', np.bincount(R, minlength=9).tolist())
C = np.zeros((len(ty), 3), np.float32)
hc = tex_at(old_uv.mean(1)); skinm = (hc[:, 0] > 0.75) & (hc[:, 1] > 0.6) & (hc[:, 2] > 0.5) & (hc[:, 0] - hc[:, 2] < 0.3); SKIN = np.median(hc[skinm], 0); print('skin colour of the first version', SKIN.round(3))
CHAR = np.array([0.105, 0.105, 0.145]); th = np.degrees(np.arctan2(P[:, 0], -P[:, 1])); z = P[:, 2]
# skin: flat; the scalp under the hair is hair-coloured
m = R == 0; C[m] = SKIN
# gown: black cloth; thin lighter lines on seams, edges and the folds of the skirt
m = R == 1; c_, r_, lipf = A[m, 0], A[m, 1], A[m, 2]; NB_ = len(set(np.round(r_).astype(int))) - 1 - Z.NV; base = np.array([0.060, 0.060, 0.074]); line = np.array([0.20, 0.20, 0.25])
def ln(x, x0, w): return np.clip(1 - abs(x - x0) / w, 0, 1)
k = np.zeros(m.sum()); bod = r_ < NB_
for cc in (48.0, 55.3): k = np.maximum(k, ln(c_, cc, 0.07) * (r_ < NB_ - 2) * (r_ > 6))            # princess seams
k = np.maximum(k, ln(c_, 21.7, 0.07) * (r_ > 17))                                                    # centre back seam
k = np.maximum(k, ln(r_, 2.0, 0.07)); k = np.maximum(k, ln(r_, NB_ - 13.0, 0.05) * 0.8)               # collar seam, waist seam
k = np.maximum(k, ln(r_, r_.max() - 0.55, 0.05) * 0.7)                                               # hem stitch
for cc in range(3, Z.NU, 5): k = np.maximum(k, ln(c_, cc + 0.5 * math.sin(cc), 0.085) * np.clip((r_ - NB_ - 9) / 14, 0, 1) * 0.55)      # folds toward the hem
k = np.maximum(k, (lipf < 0.999) * 0.35 * (lipf > 0.5))                                             # a lighter rim where the cloth turns in
C[m] = base + (line - base) * k[:, None]
# stockings: sheer brown over skin, a lace top with a scalloped lower edge
m = R == 2; sheer = SKIN * 0.30 + np.array([0.115, 0.075, 0.075]) * 0.70; zz, tt = z[m], np.radians(th[m]); lo = 0.630 + 0.004 * (0.5 + 0.5 * np.cos(tt * 26))
lace = (zz > lo); net = (np.sin(tt * 60) * np.sin(zz * 1500) > 0.25) | (np.cos(tt * 13 + zz * 300) * np.cos(tt * 13 - zz * 300) > 0.55); band = (zz > 0.664) | (abs(zz - lo) < 0.0016)
col = np.where((lace & (net | band))[:, None], np.array([0.045, 0.040, 0.050]), np.where(lace[:, None], sheer * 0.72, sheer)); C[m] = col
C[R == 3] = (0.040, 0.040, 0.050); C[R == 4] = (0.44, 0.085, 0.12); C[R == 5] = (0.030, 0.030, 0.038)
m = R == 7; C[m] = tex_at(A[m, :2])
img[ty, tx] = C; filled[ty, tx] = True
for _ in range(8):                              # bleed over the island edges
    pi = np.pad(img, ((1, 1), (1, 1), (0, 0))); pf = np.pad(filled, 1); acc = np.zeros_like(img); cnt = np.zeros((SZ, SZ))
    for dy, dx in ((0, 1), (2, 1), (1, 0), (1, 2)): acc += pi[dy:dy + SZ, dx:dx + SZ] * pf[dy:dy + SZ, dx:dx + SZ, None]; cnt += pf[dy:dy + SZ, dx:dx + SZ]
    new = ~filled & (cnt > 0); img[new] = acc[new] / cnt[new][:, None]; filled |= new
im = bpy.data.images.new('elise_base', SZ, SZ, alpha=False); px = np.ones((SZ, SZ, 4), np.float32); px[:, :, :3] = img; im.pixels.foreach_set(px.ravel()); im.filepath_raw = WD + '/elise_base.png'; im.file_format = 'PNG'; im.save()
im.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new('elise_toon'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Metallic'].default_value = 0.0; bs.inputs['Specular IOR Level'].default_value = 0.0
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = im; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color']); mat.use_backface_culling = False
for o in objs: o.data.materials.clear(); o.data.materials.append(mat)
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=WD + '/elise_v2.blend')
cam = rend.setup(tex=True); R_ = lambda n, v, w, h: (n, rend.shot(cam, f'{WD}/r/_c{n}.png', v, w, h))
rows = [[R_(n, v, 420, 800) for n, v in (('front', [0, 0, 0.88, 1.8, 0, 0]), ('left', [0, 0, 0.88, 1.8, 90, 0]), ('back', [0, 0, 0.88, 1.8, 180, 0]), ('right', [0, 0, 0.88, 1.8, 270, 0]), ('3q', [0, 0, 0.88, 1.8, 35, 5]), ('3q back', [0, 0, 0.88, 1.8, 215, 5]))],
        [R_(n, v, 504, 504) for n, v in (('face', [0, 0.02, 1.6, 0.30, 0, 0]), ('face 3q', [0, 0.02, 1.6, 0.30, 35, 0]), ('head 3q', [0, 0.02, 1.61, 0.36, 40, 5]), ('head back', [0, 0.05, 1.62, 0.38, 180, 10]), ('lacing', [0.12, -0.05, 0.80, 0.42, 45, 0]), ('feet', [0.02, -0.03, 0.12, 0.42, 60, 8]))]]
rend.montage(rows, WD + '/r/c1_tex.jpg')
Image = __import__('PIL.Image', fromlist=['Image']); Image.fromarray((np.clip(img[::-1], 0, 1) * 255).astype(np.uint8)).resize((768, 768)).save(WD + '/r/c1_atlas.jpg', quality=85)
