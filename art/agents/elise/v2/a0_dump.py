"""Elise v2, stage A0: dump the pass-3 model (the shape, paint and skeleton reference) to src.npz.
    blender -b <pass-3 agent_elise.blend> -P a0_dump.py -- <out.npz>"""
import bpy, sys, numpy as np
out = sys.argv[sys.argv.index("--") + 1]
el = bpy.data.objects['elise']; ao = bpy.data.objects['elise_rig']; me = el.data
bpy.context.view_layer.objects.active = el
if me.shape_keys:
    for k in me.shape_keys.key_blocks: k.value = 0
me.calc_loop_triangles(); nv = len(me.vertices)
co = np.empty(nv * 3); (me.shape_keys.key_blocks[0].data if me.shape_keys else me.vertices).foreach_get('co', co); co = co.reshape(-1, 3)
nt = len(me.loop_triangles); tv = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('vertices', tv); tv = tv.reshape(-1, 3)
tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
tp = np.empty(nt, np.int32); me.loop_triangles.foreach_get('polygon_index', tp)
mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('material_index', mi)
pa = np.empty(len(me.polygons), np.int32); me.attributes['part'].data.foreach_get('value', pa)
uv = np.empty(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
img = [i for i in bpy.data.images if i.name.startswith('elise_base')][0]; W, H = img.size
px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[:, :, :3]
keep = mi[tp] == 0; tv, tl, tp = tv[keep], tl[keep], tp[keep]
bones = {b.name: (list(b.head_local), list(b.tail_local), b.parent.name if b.parent else '') for b in ao.data.bones}
np.savez_compressed(out, V=co, F=tv, UV=uv[tl], part=pa[tp], tex=(px * 255).astype(np.uint8),
                    bone_names=np.array(list(bones)), bone_head=np.array([bones[k][0] for k in bones]), bone_tail=np.array([bones[k][1] for k in bones]), bone_parent=np.array([bones[k][2] for k in bones]))
print('SRC verts', nv, 'tris', len(tv), 'by part', np.bincount(pa[tp]).tolist(), 'tex', W, H, 'bones', len(bones))
for k in ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'thumb_L', 'index_L', 'fingers_L', 'prop_L', 'thigh_L', 'shin_L', 'foot_L', 'toe_L', 'hair_L_0', 'hair_L_1', 'ribbon_L_0', 'upperarm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R']:
    print(k, np.round(bones[k][0], 3).tolist(), np.round(bones[k][1], 3).tolist(), bones[k][2])
