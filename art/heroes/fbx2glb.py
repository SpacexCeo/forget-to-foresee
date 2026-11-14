# blender -b --python fbx2glb.py -- <in.fbx> <out.glb> : an FBX character with its clips into one glb (every action kept)
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=argv[0], use_anim=True, automatic_bone_orientation=False)
arm = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
acts = [a for a in bpy.data.actions]
# every action as an NLA strip so the glTF exporter writes each one as its own animation
arm.animation_data_create()
for a in acts:
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, int(a.frame_range[0]), a)
arm.animation_data.action = None
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
print('REPORT', json.dumps({'objects': [(o.name, o.type) for o in bpy.data.objects][:12], 'bones': len(arm.data.bones), 'actions': len(acts), 'first': [a.name for a in acts[:6]],
  'height': max(p.z for p in pts) - min(p.z for p in pts), 'fps': bpy.context.scene.render.fps, 'bone_names': [b.name for b in arm.data.bones][:80]}))
kw = dict(filepath=argv[1], export_format='GLB', export_animations=True, export_nla_strips=True, export_skins=True, export_yup=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
