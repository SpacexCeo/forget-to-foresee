"""Elise stage D: material, inverted-hull outline, export.
    blender -b elise_build.blend -P d_final.py -- <work dir> <out name> <outline mm> <decimate ratio>"""
import bpy, bmesh, sys
import numpy as np
a = sys.argv[sys.argv.index("--") + 1:]; WD, NAME, MM, RATIO = a[0], a[1], float(a[2]), float(a[3])
el = bpy.data.objects['elise']; ao = bpy.data.objects['elise_rig']; me = el.data
bpy.context.view_layer.objects.active = el
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
# inverted hull: a copy pushed along the normals, faces flipped, second material
n0 = len(me.vertices); f0 = len(me.polygons)
co = np.empty(n0 * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3); no = np.empty(n0 * 3); me.vertices.foreach_get('normal', no); no = no.reshape(-1, 3)
pa = np.empty(f0, np.int32); me.attributes['part'].data.foreach_get('value', pa)
k = np.ones(n0)
face = (co[:, 1] < -0.02) & (co[:, 2] > 1.52) & (co[:, 2] < 1.68) & (abs(co[:, 0]) < 0.085); k[face] = 0.6
for p in me.polygons:
    if pa[p.index] == 2:
        for v in p.vertices: k[v] = 0.6
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])['geom']
nv = [g for g in geom if isinstance(g, bmesh.types.BMVert)]; nf = [g for g in geom if isinstance(g, bmesh.types.BMFace)]
src = {v.index: v for v in bm.verts if v.index < n0}
for i, v in enumerate(nv):          # duplicate() keeps the order of the input vertices
    v.co = (co[i] + no[i] * MM * 0.001 * k[i]).tolist()
for f in nf: f.material_index = 1
bmesh.ops.reverse_faces(bm, faces=nf); bm.to_mesh(me); bm.free(); me.validate(); me.update()
print('ELISE', NAME, 'tris', len(me.polygons), 'base', f0, 'verts', len(me.vertices), 'bones', len(ao.data.bones))
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=f'{WD}/{NAME}.blend')
bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); ao.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{WD}/{NAME}_raw.glb', export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                          export_tangents=False, export_attributes=False, export_all_influences=False, export_def_bones=False)
