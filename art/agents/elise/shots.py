"""Workbench shots: blender -b [file.blend] -P shots.py -- <out prefix> <res> <json views> [mesh files...]
   view = [cx,cy,cz, ortho_scale, azimuth_deg, elevation_deg]; azimuth 0 = from the front (-Y)."""
import bpy, sys, json, math
a = sys.argv[sys.argv.index("--") + 1:]
if len(a) > 3:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for f in a[3:]:
        if f.endswith('.ply'): bpy.ops.wm.ply_import(filepath=f)
        else: bpy.ops.import_scene.gltf(filepath=f)
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            for p in o.data.polygons: p.use_smooth = True
sc = bpy.context.scene
if 'tex' in a[1]:
    blk = bpy.data.images.new('blk', 2, 2); blk.pixels = [0.01, 0.01, 0.012, 1] * 4
    for m in bpy.data.materials:
        if 'outline' in m.name and m.use_nodes:
            t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = blk; m.node_tree.nodes.active = t
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; mode = a[1].split(':')
sh.light = 'STUDIO'; sh.color_type = 'VERTEX' if 'vcol' in mode else 'TEXTURE' if 'tex' in mode else 'MATERIAL' if 'mat' in mode else 'SINGLE'; sh.show_cavity = 'tex' not in mode and 'vcol' not in mode; sh.cavity_type = 'BOTH'
if 'flat' in mode: sh.light = 'FLAT'
sh.show_object_outline = False; sh.show_specular_highlight = False; sh.show_backface_culling = 'cull' in mode
sc.display.render_aa = '8'; sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.75, 0.75, 0.78)
cam = bpy.data.objects.new('shotcam', bpy.data.cameras.new('shotcam')); sc.collection.objects.link(cam); cam.data.type = 'ORTHO'; sc.camera = cam
cam.data.clip_start = 0.01; cam.data.clip_end = 100
res = int(mode[0]); sc.render.resolution_x = res; sc.render.resolution_y = res
for i, v in enumerate(json.loads(a[2])):
    cx, cy, cz, s, az, el = v[:6]
    if len(v) > 6: sc.render.resolution_x = int(res * v[6])
    az, el = math.radians(az), math.radians(el)
    d = 10
    cam.location = (cx + d * math.sin(az) * math.cos(el), cy - d * math.cos(az) * math.cos(el), cz + d * math.sin(el))
    cam.rotation_euler = (math.pi / 2 - el, 0, az); cam.data.ortho_scale = s
    sc.render.filepath = '%s_%02d.png' % (a[0], i); bpy.ops.render.render(write_still=True)
