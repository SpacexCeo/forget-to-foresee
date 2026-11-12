"""Elise v4, step 08: the owner's generated model cleaned before any bones.

The source is one generated shell (about 1.95 M triangles, a 4K colour texture, facing +X). This step turns it to
the game's axes (front -Y, Z up), stands it on the floor at her height, merges doubled vertices, reports loose
parts and bad normals, makes the hero copy (decimated, new UVs, base colour and a normal map baked from the
original) and the crowd copy, and renders the check sheet.
    blender -b -P s08_clean.py -- <model.glb> <work dir> [hero triangles 60000] [height 1.741]
Writes hero.blend, hero_base.png (4096), hero_normal.png (2048), r/s08.jpg and prints the numbers of the report.
"""
import bpy, bmesh, sys, os, math, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'v3')); import review
a = sys.argv[sys.argv.index('--') + 1:]; SRC, WD = a[0], a[1]; HERO = int(a[2]) if len(a) > 2 else 60000; HEIGHT = float(a[3]) if len(a) > 3 else 1.741
os.makedirs(WD + '/r', exist_ok=True); t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active; hi.name = 'elise_src'
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = hi.data; n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
print('source: vertices %d, triangles %d, materials %d, size %s' % (n, sum(len(p.vertices) - 2 for p in me.polygons), len(me.materials), (co.max(0) - co.min(0)).round(3)))
# 1. axes: the importer gives Z up; the model faces +X, the game's characters face -Y
hi.rotation_euler = (0, 0, -math.pi / 2); bpy.ops.object.transform_apply(rotation=True)
me.vertices.foreach_get('co', co.ravel()); co = co.reshape(-1, 3)
s = HEIGHT / (co[:, 2].max() - co[:, 2].min()); co *= s; co[:, 2] -= co[:, 2].min(); co[:, 0] -= 0.5 * (co[:, 0].max() + co[:, 0].min())
core = co[(co[:, 2] > 0.9) & (co[:, 2] < 1.3)]; co[:, 1] -= float(np.median(core[:, 1])); co[:, 0] -= float(np.median(core[:, 0]))
me.vertices.foreach_set('co', co.ravel()); me.update()
print('placed: height %.3f, width %.3f, depth %.3f, scale %.4f' % (co[:, 2].max(), np.ptp(co[:, 0]), np.ptp(co[:, 1]), s))
# 2. doubled vertices, loose parts, normals
bm = bmesh.new(); bm.from_mesh(me); n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); merged = n0 - len(bm.verts)
degenerate = [f for f in bm.faces if f.calc_area() < 1e-12]; nd = len(degenerate)
if degenerate: bmesh.ops.delete(bm, geom=degenerate, context='FACES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
seen = set(); parts = []
for v in bm.verts:
    if v in seen: continue
    st = [v]; comp = 0; seen.add(v)
    while st:
        x = st.pop(); comp += 1
        for e in x.link_edges:
            o = e.other_vert(x)
            if o not in seen: seen.add(o); st.append(o)
    parts.append(comp)
parts.sort(reverse=True)
small = [v for v in bm.verts if False]
open_e = sum(1 for e in bm.edges if e.is_boundary); nonman = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
print('merged by distance: %d vertices; zero-area faces removed: %d; loose parts: %d (largest %s); open edges %d, non-manifold edges %d' % (merged, nd, len(parts), parts[:6], open_e, nonman))
bm.to_mesh(me); bm.free(); me.update()
for p in me.polygons: p.use_smooth = True

# 3. the hero copy: decimate, new UVs, bake colour and normals from the original
def copy_dec(name, tris):
    o = hi.copy(); o.data = hi.data.copy(); o.name = name; bpy.context.scene.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = tris / sum(len(p.vertices) - 2 for p in o.data.polygons); md.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    for l in list(o.data.uv_layers): o.data.uv_layers.remove(l)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002); bpy.ops.object.mode_set(mode='OBJECT')
    return o
hero = copy_dec('elise_hero', HERO); crowd = copy_dec('elise_crowd', 3000)
print('hero: %d triangles; crowd: %d triangles (%.0f s)' % (len(hero.data.polygons), len(crowd.data.polygons), time.time() - t0))
# the original's colour as emission, so the bake carries the texture alone
for m in me.materials:
    nt = m.node_tree; bs = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None); out = next(x for x in nt.nodes if x.type == 'OUTPUT_MATERIAL')
    if bs and bs.inputs['Base Color'].links: m['base_src'] = bs.inputs['Base Color'].links[0].from_node.name
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
    for d in pr.devices: d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception as e: print('GPU bake not available:', e)
def bake(low, kind, size, path):
    img = bpy.data.images.new(os.path.basename(path), size, size, alpha=False, float_buffer=False)
    if kind == 'NORMAL': img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(low.name + '_mat'); mat.use_nodes = True; nt = mat.node_tree; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
    low.data.materials.clear(); low.data.materials.append(mat)
    for m in me.materials:      # colour pass: base colour texture -> emission
        nt2 = m.node_tree; out = next(x for x in nt2.nodes if x.type == 'OUTPUT_MATERIAL'); bs = next((x for x in nt2.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if kind == 'EMIT' and m.get('base_src'):
            em = nt2.nodes.get('bake_em') or nt2.nodes.new('ShaderNodeEmission'); em.name = 'bake_em'; nt2.links.new(nt2.nodes[m['base_src']].outputs[0], em.inputs['Color']); nt2.links.new(em.outputs[0], out.inputs['Surface'])
        elif bs: nt2.links.new(bs.outputs[0], out.inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.006; sc.render.bake.max_ray_distance = 0.03; sc.render.bake.margin = 8
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.006, max_ray_distance=0.03, margin=8)
    img.filepath_raw = path; img.file_format = 'PNG'; img.save(); print('baked', kind, size, path, '(%.0f s)' % (time.time() - t0)); return img, mat
base, hmat = bake(hero, 'EMIT', 4096, WD + '/hero_base.png')
nrm, _ = bake(hero, 'NORMAL', 2048, WD + '/hero_normal.png')
hero.data.materials.clear(); hero.data.materials.append(hmat); nt = hmat.node_tree; tn = next(x for x in nt.nodes if x.type == 'TEX_IMAGE'); tn.image = base
nt.links.new(tn.outputs['Color'], next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED').inputs['Base Color'])
cb, cmat = bake(crowd, 'EMIT', 1024, WD + '/crowd_base.png'); nt = cmat.node_tree; nt.links.new(next(x for x in nt.nodes if x.type == 'TEX_IMAGE').outputs['Color'], next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED').inputs['Base Color'])
hi.hide_render = True; hi.hide_viewport = True; crowd.hide_render = True; crowd.hide_viewport = True
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=WD + '/hero.blend')
# 4. the check sheet: the hero copy with its baked colour, four full views and the head
hz = HEIGHT - 0.125
VIEWS = [[(n_, [0, 0, HEIGHT / 2 + 0.01, HEIGHT * 1.08, az, el], 520, 960) for n_, az, el in (('front', 0, 0), ('three quarter', 35, 5), ('her left', 90, 0), ('back', 180, 0))],
         [('face', [0, 0, hz, 0.40, 0, 0], 520, 520), ('face three quarter', [0, 0, hz, 0.40, 35, 3], 520, 520), ('head her right', [0, 0, hz, 0.46, 270, 0], 520, 520), ('head back', [0, 0.03, hz, 0.46, 180, 5], 520, 520)]]
review.sheet(WD, VIEWS, 's08.jpg')
print('S08_DONE %.0f s' % (time.time() - t0))
