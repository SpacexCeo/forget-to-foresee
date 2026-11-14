"""Step 01 (shoal_dragon): clean the source body mesh before anything else.
  blender -b --python s01_clean.py -- --src <body.glb> --root <work root> [--head +y|-y|auto] [--scale 8.0]
The source is any quadruped dragon body without wings (today the owner's Tripo "mythical dragon", the pearl pet's
mesh); a replacement ultra generation goes through the same step. Output: work/01_clean.blend (object `body_src`,
textured, facing -Y, feet on 0, metres), report/s01.json (counts, loose parts, slice table), renders/s01_*.jpg."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']; SCALE = float(A.get('scale', 8.0)); HEAD = A.get('head', 'auto')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['src'])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
body = max(meshes, key=lambda o: len(o.data.vertices))
active(body); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for m in list(body.modifiers): body.modifiers.remove(m)
body.vertex_groups.clear()
for o in list(bpy.data.objects):
    if o is not body: bpy.data.objects.remove(o)
active(body); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
before = mesh_stats(body)
# merge by distance (seam duplicates; UV seams stay as loops), drop loose bits, consistent normals
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.delete_loose(); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
co = coords(body)
ext = co.max(0) - co.min(0)
if ext[0] > ext[1]: co = co[:, [1, 0, 2]] * np.array([-1, 1, 1])  # the long horizontal axis becomes Y
if HEAD in ('+y', '-y'): flip = HEAD == '+y'
else: flip = co[co[:, 1] > 0][:, 2].max() > co[co[:, 1] < 0][:, 2].max()  # the head end is the taller one
if flip: co = co * np.array([-1, -1, 1])
co *= SCALE
co[:, 0] -= (co[:, 0].min() + co[:, 0].max()) / 2; co[:, 2] -= co[:, 2].min()
set_coords(body, co); body.name = 'body_src'; body.data.name = 'body_src'
for p in body.data.polygons: p.use_smooth = True
after = mesh_stats(body)
r = dict(step='s01_clean', src=A['src'], scale=SCALE, flipped=bool(flip), tris=tris(body), before=before, after=after,
         bbox=[co.min(0).round(3), co.max(0).round(3)], slices_y=slices(co, 1, 0.25),
         status='PASS' if after['zero_faces'] == 0 else 'CHECK')
bpy.ops.file.pack_all()
save(f'{ROOT}/work/01_clean.blend'); ensure(f'{ROOT}/renders')
ortho_views(f'{ROOT}/renders/s01', [body])
report(f'{ROOT}/report/s01.json', r)
