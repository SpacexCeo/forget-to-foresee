"""Export a rigged creature to GLB and read it back (TZ step 15). Shared by the dragon and the boss.
  blender -b --python export_glb.py -- --root <work root> --blend work/08_clips.blend --name shoal_dragon [--objects dragon,dragon_rig]
Output: out/<name>_raw.glb (PNG textures, every NLA track as a clip), report/export.json (bones, triangles, size,
clips with durations after re-import)."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

A = args(); ROOT = A['root']; NAME = A['name']
bpy.ops.wm.open_mainfile(filepath=f"{ROOT}/{A['blend']}")
objs = [bpy.data.objects[n] for n in A['objects'].split(',')] if 'objects' in A else [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE', 'EMPTY')]
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
for o in objs:
    if o.type == 'ARMATURE':
        for pb in o.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
ensure(f'{ROOT}/out'); out = f'{ROOT}/out/{NAME}_raw.glb'
has_anim = any(o.type == 'ARMATURE' and o.animation_data and o.animation_data.nla_tracks for o in objs)
kw = dict(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_tangents=False, export_normals=True,
          export_image_format='AUTO', export_skins=True, export_def_bones=False, export_animations=has_anim)
if has_anim: kw.update(export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_frame_range=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
size = os.path.getsize(out)
# read it back
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=out)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']; arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
pts = np.concatenate([np.array([(o.matrix_world @ Vector(c))[:] for c in o.bound_box]) for o in meshes])
fps = bpy.context.scene.render.fps
r = dict(step='export', file=out, bytes=size, meshes=len(meshes), tris=sum(tris(o) for o in meshes), verts=sum(len(o.data.vertices) for o in meshes),
         bones=sum(len(a.data.bones) for a in arms), size_m=(pts.max(0) - pts.min(0)).round(3), min=pts.min(0).round(3),
         materials=sorted({m.name for o in meshes for m in o.data.materials if m}),
         clips={a.name: round((a.frame_range[1] - a.frame_range[0]) / fps, 3) for a in bpy.data.actions}, status='PASS')
report(f'{ROOT}/report/export.json', r); print('REPORT2', json.dumps(r['clips']))
