"""Step 05 (shoal_dragon): close the holes of the source, make the game mesh of the body and its new UVs.
  blender -b --python s05_low.py -- --root <work root>
body_hi keeps the source UVs and texture (the bake source). body_low = Collapse decimate to `budget.body_tris`, new
UVs (the Tripo UVs are one island per triangle: useless after decimation) packed into the lower-left
`budget.atlas_body` square of the atlas; the rest of the atlas belongs to the wings (s04 cells).
Output: work/05_low.blend (body_hi, body_low, wing), report/s05.json, renders/s05_*.jpg."""
import bpy, bmesh, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dragon.json')))
AB = CFG['budget']['atlas_body']; TARGET = CFG['budget']['body_tris']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/04_wings.blend')
hi = bpy.data.objects['body_hi']
before = mesh_stats(hi)
# 1. holes: fill every boundary loop; a new face takes the UV of its own corner vertices (the colour of the rim)
bm = bmesh.new(); bm.from_mesh(hi.data); uv = bm.loops.layers.uv.active
bm.verts.ensure_lookup_table()
vert_uv = {}
for f in bm.faces:
    for l in f.loops: vert_uv.setdefault(l.vert.index, l[uv].uv.copy())
res = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
new_faces = res['faces']
tri = bmesh.ops.triangulate(bm, faces=[f for f in new_faces if f.is_valid])['faces']
for f in tri:   # one UV point per fill triangle (a rim colour): a triangle across UV islands would sample the whole atlas
    f.smooth = True; k = next((vert_uv[l.vert.index] for l in f.loops if l.vert.index in vert_uv), None)
    if k is not None:
        for l in f.loops: l[uv].uv = k
new_faces = tri
# relax the rims of the filled holes (the fill leaves ridges): the fill's vertices and two rings around them
ring = {v for f in new_faces if f.is_valid for v in f.verts}
for _ in range(2): ring |= {e.other_vert(v) for v in list(ring) for e in v.link_edges}
for _ in range(12): bmesh.ops.smooth_vert(bm, verts=list(ring), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges[:])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(hi.data); bm.free(); hi.data.update()
after = mesh_stats(hi)

# 2. the game mesh
low = hi.copy(); low.data = hi.data.copy(); low.name = 'body_low'; low.data.name = 'body_low'; bpy.context.scene.collection.objects.link(low)
active(low)
m = low.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1.0, TARGET / tris(low)); m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.delete_loose(); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(float(A.get('uv_angle', 82))), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.pack_islands(margin=0.0035, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
n = len(low.data.loops); u = np.empty(n * 2, np.float32); low.data.uv_layers[0].data.foreach_get('uv', u); u = u.reshape(n, 2)
uv_range = [u.min(0).round(4), u.max(0).round(4)]
u = u * AB; low.data.uv_layers[0].data.foreach_set('uv', u.ravel())
for p in low.data.polygons: p.use_smooth = True
low.data.materials.clear(); low.data.materials.append(bpy.data.materials.new('pearl_body'))
# UV islands (number) for the report
bm = bmesh.new(); bm.from_mesh(low.data); uvl = bm.loops.layers.uv.active
seams = sum(1 for e in bm.edges if len(e.link_loops) == 2 and ((e.link_loops[0][uvl].uv - e.link_loops[1].link_loop_next[uvl].uv).length > 1e-5))
bm.free()
st = mesh_stats(low)
r = dict(step='s05_low', hi_before=before, hi_after=after, filled_faces=len(new_faces), low=st, low_tris=tris(low), wing_tris=tris(bpy.data.objects['wing']),
         total_tris=tris(low) + tris(bpy.data.objects['wing']), uv_range=uv_range, uv_seam_edges=seams,
         status='PASS' if tris(low) + tris(bpy.data.objects['wing']) <= 42000 and st['zero_faces'] == 0 else 'CHECK')
save(f'{ROOT}/work/05_low.blend')
hi.hide_render = True; bpy.data.objects['wing'].hide_render = True
grid_views(f'{ROOT}/renders/s05', [low], views=('side', 'front'), res=1280, texture=False)
report(f'{ROOT}/report/s05.json', r)
