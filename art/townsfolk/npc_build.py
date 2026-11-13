"""Quest givers from the owner's generated, pre-rigged models: one skinned mesh on a 78-bone humanoid skeleton each.
They become townsfolk of the shared agent rig (same bone names as every other body, so the shared clip set
game/public/assets/anim/townsfolk.glb retargets onto them at load): the 78 bones are merged into 31 of ours (twist bones
into their limb, the knee and elbow share bones split between the two segments, the three long fingers into one, the face into the head), the mesh is stood on the
floor at the giver's height facing -Y, welded (it comes as a triangle soup) and decimated; UVs and texture are its own.
    blender -b -P npc_build.py -- <source.glb> <out_raw.glb> <height m> <triangles> [outline mm, 0 = none] [coat: largest leg share of cloth hanging off the legs, 0 = off]
The texture is resized and compressed afterwards (art/tools/compress-glb.sh).
"""
import bpy, bmesh, sys, re, math
import numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; SRC, OUT, HEIGHT, TRIS = a[0], a[1], float(a[2]), int(a[3]); OUTLINE = float(a[4]) if len(a) > 4 else 0.0; COAT = float(a[5]) if len(a) > 5 else 0.0

def canon(name):
    """A second naming scheme of generated rigs (65 bones, prefixed) in the names of the first."""
    if ':' not in name: return name
    n = name.split(':')[-1]; m = re.match(r'^(Left|Right)(.*)$', n)
    if not m:
        return {'Hips': 'Hip', 'Spine': 'Spine01', 'Spine1': 'Spine02', 'Spine2': 'Spine02b', 'Neck': 'NeckTwist01', 'Head': 'Head', 'HeadTop_End': 'FacialBone'}.get(n, n)
    s, r = m.group(1)[0], m.group(2)
    r = {'Shoulder': 'Clavicle', 'Arm': 'Upperarm', 'ForeArm': 'Forearm', 'Hand': 'Hand', 'UpLeg': 'Thigh', 'Leg': 'Calf', 'Foot': 'Foot', 'ToeBase': 'ToeBase', 'Toe_End': 'ToeBaseEnd'}.get(r, r)
    r = re.sub(r'^Hand(Thumb|Index|Ring|Pinky)(\d)$', r'\1\2', r); r = re.sub(r'^HandMiddle(\d)$', r'Mid\1', r)
    return f'{s}_{r}'


def ours(name):
    """Source bone name -> shared rig bone name (None: dropped, its weight goes to the pelvis)."""
    m = re.match(r'^([LR])_(.*)$', name); s, n = (m.group(1), m.group(2)) if m else (None, name)
    if s is None:
        return {'Hip': 'pelvis', 'Pelvis': 'pelvis', 'Waist': 'pelvis', 'BoneRoot': 'pelvis', 'Spine01': 'spine', 'Spine02': 'chest',
                'Spine02b': 'chest', 'NeckTwist01': 'neck', 'NeckTwist02': 'neck', 'Head': 'head', 'FacialBone': 'head'}.get(n)
    if n == 'Eye': return 'head'
    for key, to in (('Clavicle', 'shoulder'), ('Upperarm', 'upperarm'), ('Forearm', 'forearm'), ('Elbow', 'forearm'), ('Hand', 'hand'), ('Thumb', 'thumb'), ('Index', 'index'),
                    ('Mid', 'fingers'), ('Ring', 'fingers'), ('Pinky', 'fingers'), ('Thigh', 'thigh'), ('Calf', 'shin'), ('Knee', 'shin'), ('Foot', 'foot'), ('ToeBase', 'toe')):
        if n.startswith(key): return f'{to}_{s}'
    return None

bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=SRC)
arm0 = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); el = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices)); me = el.data
M = el.matrix_world; n = len(me.vertices); co = np.array([(M @ v.co)[:] for v in me.vertices]); A = arm0.matrix_world
J = {canon(b.name): np.array((A @ b.head_local)[:]) for b in arm0.data.bones}
k = HEIGHT / (co[:, 2].max() - co[:, 2].min()); z0 = co[:, 2].min(); T = lambda p: (np.asarray(p) - [0, 0, z0]) * k
co = T(co); J = {b: T(p) for b, p in J.items()}
W = {}
gname = {g.index: canon(g.name) for g in el.vertex_groups}
# A share bone at the knee or the elbow turns by half of the joint's angle: its weight is split between the two
# segments (all of it on the lower one made the knee cap swing with the shin: a sharp break and stretched skin).
SHARE = {'Knee': ('thigh', 'shin'), 'Elbow': ('upperarm', 'forearm')}
def targets(src):
    m = re.match(r'^([LR])_(Knee|Elbow)', src)
    if m: return [(f'{b}_{m.group(1)}', 0.5) for b in SHARE[m.group(2)]]
    return [(ours(src) or 'pelvis', 1.0)]
for v in me.vertices:
    for g in v.groups:
        for to, share in targets(gname[g.group]): W.setdefault(to, np.zeros(n))[v.index] += g.weight * share
sm = lambda a_, b_, x_: (lambda t_: t_ * t_ * (3 - 2 * t_))(np.clip((x_ - a_) / (b_ - a_), 0, 1)); kk = HEIGHT / 1.8
if COAT > 0:      # a long coat welded to the body: cloth that hangs away from a leg follows it by `COAT` at most, the hips take the rest
    moved = 0.0
    for s_ in 'LR':
        cap = np.ones(n)
        for bone, a_, b_, r0, r1 in ((f'thigh_{s_}', J[f'{s_}_Thigh'], J[f'{s_}_Calf'], 0.105, 0.075), (f'shin_{s_}', J[f'{s_}_Calf'], J[f'{s_}_Foot'], 0.085, 0.085)):
            ab = b_ - a_; t_ = np.clip(((co - a_) @ ab) / (ab @ ab), 0, 1); d_ = np.linalg.norm(co - a_ - t_[:, None] * ab, axis=1); e_ = d_ - (r0 + (r1 - r0) * t_) * kk
            c_ = 1 - (1 - COAT) * sm(0.01 * kk, 0.07 * kk, e_); w_ = W.get(bone)
            if w_ is None: continue
            give = w_ * (1 - c_); W[bone] = w_ - give; W.setdefault('pelvis', np.zeros(n)); W['pelvis'] = W['pelvis'] + give; moved += float(give.sum())
    print('coat: leg weight moved to the hips, %.0f vertex-weights' % moved)
# The auto-rig hangs cloth and hip skin on the arms that rest beside them: an arm keeps only what lies around its own
# bones. And a leg keeps to its own side: weight that crossed the centre line goes to the same bone of the other leg.
bled = 0.0; waist = J['Spine01'][2]
for s_ in 'LR':
    segs = [(J[f'{s_}_Upperarm'], J[f'{s_}_Forearm']), (J[f'{s_}_Forearm'], J[f'{s_}_Hand']), (J[f'{s_}_Hand'], J[f'{s_}_Mid3'])]; d_ = np.full(n, 9.0)
    for a_, b_ in segs:
        ab = b_ - a_; t_ = np.clip(((co - a_) @ ab) / (ab @ ab), 0, 1); d_ = np.minimum(d_, np.linalg.norm(co - a_ - t_[:, None] * ab, axis=1))
    c_ = 1 - sm(0.08 * kk, 0.13 * kk, d_)
    for bone in (f'upperarm_{s_}', f'forearm_{s_}', f'hand_{s_}', f'thumb_{s_}', f'index_{s_}', f'fingers_{s_}'):
        w_ = W.get(bone)
        if w_ is None: continue
        give = w_ * (1 - c_); W[bone] = w_ - give; bled += float(give.sum())
        for to, m_ in (('pelvis', co[:, 2] < waist), ('chest', co[:, 2] >= waist)): W.setdefault(to, np.zeros(n)); W[to] = W[to] + give * m_
crossed = 0.0
for bone in ('thigh', 'shin', 'foot', 'toe'):
    for s_, sg in (('L', 1), ('R', -1)):
        o_ = 'R' if s_ == 'L' else 'L'; w_ = W.get(f'{bone}_{s_}')
        if w_ is None or f'{bone}_{o_}' not in W: continue
        side = np.sign(J[f'{s_}_Thigh'][0]) or sg; wrong = sm(0.01 * kk, 0.04 * kk, -co[:, 0] * side); give = w_ * wrong
        W[f'{bone}_{s_}'] = w_ - give; W[f'{bone}_{o_}'] = W[f'{bone}_{o_}'] + give; crossed += float(give.sum())
print('clean: arm weight taken off the cloth, %.0f vertex-weights; leg weight returned to its own side, %.0f' % (bled, crossed))
tot = sum(W.values()); print('source: %d vertices, %d triangles, %d bones; unweighted vertices %d; scale %.3f' % (n, sum(len(p.vertices) - 2 for p in me.polygons), len(arm0.data.bones), int((tot < 1e-4).sum()), k))
W.setdefault('pelvis', np.zeros(n))[tot < 1e-4] = 1.0; tot = sum(W.values())
img = next((i for i in bpy.data.images if i.size[0] > 0), None)
for o in [o for o in bpy.data.objects if o is not el]: bpy.data.objects.remove(o)
el.parent = None; el.matrix_world.identity()
for md in list(el.modifiers): el.modifiers.remove(md)
for vg in list(el.vertex_groups): el.vertex_groups.remove(vg)
me.vertices.foreach_set('co', co.ravel()); me.update()
for nm, w in W.items():
    g = el.vertex_groups.new(name=nm); w = w / tot
    for i in np.nonzero(w > 0.004)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
# the shared rig: bones from joint to joint, so each limb's own axis runs along it
up = lambda p, d: p + np.array(d)
B = [('root', [0, 0, 0], [0, 0.25, 0], None), ('pelvis', J['Hip'], J['Spine01'], 'root'), ('spine', J['Spine01'], J['Spine02'], 'pelvis'), ('chest', J['Spine02'], J['NeckTwist01'], 'spine'),
     ('neck', J['NeckTwist01'], J['Head'], 'chest'), ('head', J['Head'], up(J['Head'], [0, 0, 0.18 * HEIGHT / 1.7]), 'neck')]
for s in 'LR':
    g = lambda nm: J[f'{s}_{nm}']
    B += [(f'shoulder_{s}', g('Clavicle'), g('Upperarm'), 'chest'), (f'upperarm_{s}', g('Upperarm'), g('Forearm'), f'shoulder_{s}'), (f'forearm_{s}', g('Forearm'), g('Hand'), f'upperarm_{s}'),
          (f'hand_{s}', g('Hand'), g('Mid1'), f'forearm_{s}'), (f'thumb_{s}', g('Thumb1'), g('Thumb3'), f'hand_{s}'), (f'index_{s}', g('Index1'), g('Index3'), f'hand_{s}'), (f'fingers_{s}', g('Mid1'), g('Mid3'), f'hand_{s}'),
          (f'thigh_{s}', g('Thigh'), g('Calf'), 'pelvis'), (f'shin_{s}', g('Calf'), g('Foot'), f'thigh_{s}'), (f'foot_{s}', g('Foot'), g('ToeBase'), f'shin_{s}'), (f'toe_{s}', g('ToeBase'), up(g('ToeBase'), [0, -0.05, 0]), f'foot_{s}')]
arm = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(ao); bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
for nm, h, t, p in B:
    b = arm.edit_bones.new(nm); b.head = Vector([float(x) for x in h]); b.tail = Vector([float(x) for x in t]); b.roll = 0.0
    if p: b.parent = arm.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT'); el.parent = ao; md = el.modifiers.new('rig', 'ARMATURE'); md.object = ao
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
# The source is a triangle soup: every face has vertices of its own (split normals). Decimating that tears it apart, so
# vertices that share a position AND a texture coordinate are welded first (UV seams stay seams), then the mesh is
# decimated with its own UVs and texture, and the normals are smoothed across the seams by position.
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); uvl = bm.loops.layers.uv.active; v0 = len(bm.verts); first = {}; tm = {}
for v in bm.verts:
    uv = v.link_loops[0][uvl].uv if v.link_loops else (0, 0); key = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5), round(uv[0], 5), round(uv[1], 5))
    if key in first: tm[v] = first[key]
    else: first[key] = v
bmesh.ops.weld_verts(bm, targetmap=tm); print('welded: %d -> %d vertices' % (v0, len(bm.verts))); bm.to_mesh(me); bm.free(); me.update()
now = len(me.polygons)
if TRIS < now:
    d = el.modifiers.new('dec', 'DECIMATE'); d.ratio = TRIS / now; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
me = el.data; el.name = 'base'; me.name = 'base'
for p in me.polygons: p.use_smooth = True
me.update(); nv = len(me.vertices); pc = np.empty(nv * 3); me.vertices.foreach_get('co', pc); pc = pc.reshape(-1, 3); vn = np.array([v.normal[:] for v in me.vertices])
_, inv = np.unique(np.round(pc, 5), axis=0, return_inverse=True); inv = inv.ravel(); acc = np.zeros((inv.max() + 1, 3)); np.add.at(acc, inv, vn); sn = acc[inv]; sn /= np.maximum(np.linalg.norm(sn, axis=1, keepdims=True), 1e-9)
me.normals_split_custom_set_from_vertices([tuple(x) for x in sn])
mat = bpy.data.materials.new('M_townsfolk'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.85; bs.inputs['Metallic'].default_value = 0.0
if img:
    tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
me.materials.clear(); me.materials.append(mat)
if OUTLINE > 0:      # an ink outline for the cel-shaded heroes: an inverted hull, thinner on the head and the hands
    mo = bpy.data.materials.new('outline'); mo.use_nodes = True; mo.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.012, 0.012, 0.016, 1); mo.use_backface_culling = True; me.materials.append(mo)
    n0 = len(me.vertices); c0 = np.array([v.co[:] for v in me.vertices]); gi = {g.name: g.index for g in el.vertex_groups}; thin = np.ones(n0)
    for v in me.vertices:
        if sum(g.weight for g in v.groups if el.vertex_groups[g.group].name == 'head' or el.vertex_groups[g.group].name.startswith(('hand_', 'thumb_', 'index_', 'fingers_'))) > 0.5: thin[v.index] = 0.5
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update(); nrm = np.array([v.normal[:] for v in bm.verts])
    geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:]); vm = geom['vert_map']; nf = [g for g in geom['geom'] if isinstance(g, bmesh.types.BMFace)]
    for v in list(vm):
        if v.index < n0 and vm[v].index != v.index: vm[v].co = (c0[v.index] + nrm[v.index] * OUTLINE * 0.001 * thin[v.index]).tolist()
    for f in nf: f.material_index = 1
    bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.update()
c2 = np.array([v.co[:] for v in me.vertices]); print('NPC', OUT.split('/')[-1], 'tris', len(me.polygons), 'verts', len(me.vertices), 'bones', len(arm.bones), 'height %.3f' % c2[:, 2].max(), 'width %.3f' % np.ptp(c2[:, 0]), 'texture', img.size[:] if img else None)
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True, export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=False)
