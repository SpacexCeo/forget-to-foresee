"""Quest givers from the owner's generated, pre-rigged models: one skinned mesh on a 78-bone humanoid skeleton each.
They become townsfolk of the shared agent rig (same bone names as every other body, so the shared clip set
game/public/assets/anim/townsfolk.glb retargets onto them at load): the 78 bones are merged into 31 of ours (twist and
share bones into their limb, the three long fingers into one, the face into the head), the mesh is stood on the
floor at the giver's height facing -Y, decimated, given UVs of its own, and its colour is baked from the source mesh.
    blender -b -P npc_build.py -- <source.glb> <out_raw.glb> <height m> <triangles> [bake size 2048]
The texture is resized and compressed afterwards (art/tools/compress-glb.sh).
"""
import bpy, bmesh, sys, re, math
import numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; SRC, OUT, HEIGHT, TRIS = a[0], a[1], float(a[2]), int(a[3]); BAKE = int(a[4]) if len(a) > 4 else 2048

def ours(name):
    """Source bone name -> shared rig bone name (None: dropped, its weight goes to the pelvis)."""
    m = re.match(r'^([LR])_(.*)$', name); s, n = (m.group(1), m.group(2)) if m else (None, name)
    if s is None:
        return {'Hip': 'pelvis', 'Pelvis': 'pelvis', 'Waist': 'pelvis', 'BoneRoot': 'pelvis', 'Spine01': 'spine', 'Spine02': 'chest',
                'NeckTwist01': 'neck', 'NeckTwist02': 'neck', 'Head': 'head', 'FacialBone': 'head'}.get(n)
    if n == 'Eye': return 'head'
    for key, to in (('Clavicle', 'shoulder'), ('Upperarm', 'upperarm'), ('Forearm', 'forearm'), ('Elbow', 'forearm'), ('Hand', 'hand'), ('Thumb', 'thumb'), ('Index', 'index'),
                    ('Mid', 'fingers'), ('Ring', 'fingers'), ('Pinky', 'fingers'), ('Thigh', 'thigh'), ('Calf', 'shin'), ('Knee', 'shin'), ('Foot', 'foot'), ('ToeBase', 'toe')):
        if n.startswith(key): return f'{to}_{s}'
    return None

bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=SRC)
arm0 = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); el = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices)); me = el.data
M = el.matrix_world; n = len(me.vertices); co = np.array([(M @ v.co)[:] for v in me.vertices]); A = arm0.matrix_world
J = {b.name: np.array((A @ b.head_local)[:]) for b in arm0.data.bones}
k = HEIGHT / (co[:, 2].max() - co[:, 2].min()); z0 = co[:, 2].min(); T = lambda p: (np.asarray(p) - [0, 0, z0]) * k
co = T(co); J = {b: T(p) for b, p in J.items()}
W = {}
gname = {g.index: g.name for g in el.vertex_groups}
for v in me.vertices:
    for g in v.groups:
        W.setdefault(ours(gname[g.group]) or 'pelvis', np.zeros(n))[v.index] += g.weight
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
# the source is a triangle soup (every UV seam splits the vertices): weld it, or neither the decimation nor new UVs hold
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); v0 = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-5); print('welded: %d -> %d vertices' % (v0, len(bm.verts))); bm.to_mesh(me); bm.free(); me.update()
now = len(me.polygons)
# The source UVs are thousands of tiny islands: decimating across them scatters wrong texels over the face. So the
# low mesh gets UVs of its own and its colour is baked from the untouched source mesh.
hi = el.copy(); hi.data = el.data.copy(); hi.name = 'source'; bpy.context.scene.collection.objects.link(hi); hi.parent = None
for md in list(hi.modifiers): hi.modifiers.remove(md)
if TRIS < now:
    d = el.modifiers.new('dec', 'DECIMATE'); d.ratio = TRIS / now; bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
me = el.data; el.name = 'base'; me.name = 'base'
for p in me.polygons: p.use_smooth = True
for l in list(me.uv_layers): me.uv_layers.remove(l)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003); bpy.ops.object.mode_set(mode='OBJECT')
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
    for d_ in pr.devices: d_.use = d_.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU bake not available:', e_)
for m_ in hi.data.materials:                            # the source's colour as emission: the bake carries the texture alone
    nt = m_.node_tree; out = next(x for x in nt.nodes if x.type == 'OUTPUT_MATERIAL'); bsdf = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if bsdf and bsdf.inputs['Base Color'].links:
        em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(bsdf.inputs['Base Color'].links[0].from_socket, em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
baked = bpy.data.images.new('npc_base', BAKE, BAKE, alpha=False)
mat = bpy.data.materials.new('M_townsfolk'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.85; bs.inputs['Metallic'].default_value = 0.0
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = baked; mat.node_tree.nodes.active = tn
me.materials.clear(); me.materials.append(mat)
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); el.select_set(True); bpy.context.view_layer.objects.active = el
bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.004 * HEIGHT, max_ray_distance=0.02 * HEIGHT, margin=6)
baked.pack(); mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color']); bpy.data.objects.remove(hi); img = baked
c2 = np.array([v.co[:] for v in me.vertices]); print('NPC', OUT.split('/')[-1], 'tris', len(me.polygons), 'verts', len(me.vertices), 'bones', len(arm.bones), 'height %.3f' % c2[:, 2].max(), 'width %.3f' % np.ptp(c2[:, 0]), 'texture', img.size[:] if img else None)
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True, export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False, export_morph=False)
