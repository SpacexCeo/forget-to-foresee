"""Elise v2: the character-card render from the final model (transparent PNG, standing in her idle):
    blender -b agent_elise.blend -P card.py -- <out.png> <clips_dump.npz> [clip] [phase 0..1]
The compositor: art/agents/elise/v2/card_compose.py lays it on the holographic card."""
import bpy, sys, math
import numpy as np
a = sys.argv[sys.argv.index("--") + 1:]; OUT, NPZ = a[0], a[1]; CLIP = a[2] if len(a) > 2 else 'idle'; U = float(a[3]) if len(a) > 3 else 0.35
sc = bpy.context.scene
blk = bpy.data.images.new('blk', 2, 2); blk.pixels = [0.01, 0.01, 0.012, 1] * 4
for m in bpy.data.materials:
    if 'outline' in m.name and m.use_nodes:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = blk; m.node_tree.nodes.active = t
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
sh.show_object_outline = False; sh.show_specular_highlight = False; sh.show_backface_culling = True; sc.display.render_aa = '32'
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
D = np.load(NPZ); ao = bpy.data.objects['elise_rig']; names = [str(x) for x in D['names']]; rr = D['rest_r']
def qmul(p, q): return np.array([p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1], p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0], p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3], p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2]])
def qrot(q, v): return qmul(qmul(q, np.array([v[0], v[1], v[2], 0.0])), q * [-1, -1, -1, 1])[:3]
L = D[CLIP + '/local']; f = int(round(U * (len(L) - 1))) % (len(L) - 1)
for i, n in enumerate(names):
    pb = ao.pose.bones.get(n)
    if pb is None: continue
    q = qmul(rr[i] * [-1, -1, -1, 1], L[f, i]); pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (q[3], q[0], q[1], q[2])
ao.pose.bones['pelvis'].location = tuple(qrot(D['pelvis_rest_wr'] * [-1, -1, -1, 1], D[CLIP + '/pelvis'][f] - D['pelvis_rest']))
bpy.context.view_layer.update()
cam = bpy.data.objects.new('cardcam', bpy.data.cameras.new('cardcam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.92; cam.data.clip_start = 0.01; cam.data.clip_end = 100
az, elv = math.radians(28), math.radians(4); cx, cy, cz = 0.0, 0.0, 0.86
cam.location = (cx + 10 * math.sin(az) * math.cos(elv), cy - 10 * math.cos(az) * math.cos(elv), cz + 10 * math.sin(elv)); cam.rotation_euler = (math.pi / 2 - elv, 0, az)
sc.render.resolution_x, sc.render.resolution_y = 1200, 1800; sc.render.filepath = OUT; bpy.ops.render.render(write_still=True); print('card', OUT)
